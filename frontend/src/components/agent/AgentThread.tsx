import { Check, CircleAlert, LoaderCircle, Lock, Minus, X } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import type { AgentTurn } from '@/hooks/useAgentConversation';
import { IMAGE_MODEL_LABELS, type ImageModel } from '@/types/image';
import { thumbnailUrl } from '@/utils/thumbnail';

type StepState = 'active' | 'done' | 'error' | 'note';

interface Step {
  key: string;
  text: string;
  state: StepState;
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function modelLabel(turn: AgentTurn): string {
  const model = turn.plan?.steps[0]?.settings.model;
  if (model === undefined) return '图片模型';
  return IMAGE_MODEL_LABELS[model as ImageModel] ?? model;
}

/** What the Agent has done for a request, step by step, as the reference's chat lists it. */
function turnSteps(turn: AgentTurn): Step[] {
  const steps: Step[] = [];
  const planning = turn.status === 'planning';
  if (turn.requestedSkill !== undefined) {
    steps.push({ key: 'skill', text: `使用技能「${turn.requestedSkill}」`, state: 'done' });
  } else if (turn.thinkingMs === undefined) {
    if (planning) steps.push({ key: 'think', text: '正在理解需求…', state: 'active' });
  } else if (turn.selectionFailed === true) {
    // Nothing read the request, so there is no understanding to time and no fit to report.
    steps.push({
      key: 'skill',
      text: '文本模型暂不可用，没能挑选技能，改为自己规划画面',
      state: 'error',
    });
  } else {
    steps.push({ key: 'think', text: `理解需求 ${seconds(turn.thinkingMs)}`, state: 'done' });
    steps.push({
      key: 'skill',
      text:
        turn.chosenSkill === null || turn.chosenSkill === undefined
          ? '没有合适的技能，自己规划画面'
          : `选用技能「${turn.chosenSkill}」`,
      state: 'done',
    });
  }
  const total = turn.plan?.steps.length ?? 0;
  if (turn.plan !== undefined) {
    steps.push({
      key: 'plan',
      text: `规划了 ${total} 张图${turn.planningMs === undefined ? '' : ` ${seconds(turn.planningMs)}`}`,
      state: 'done',
    });
  } else if (planning && (turn.requestedSkill !== undefined || turn.thinkingMs !== undefined)) {
    steps.push({ key: 'plan', text: '正在规划每张图…', state: 'active' });
  }
  if (turn.plan !== undefined && (turn.status === 'running' || turn.started > 0)) {
    const made = turn.batchIds.length;
    if (turn.status === 'running') {
      steps.push({
        key: 'make',
        text: `使用 ${modelLabel(turn)} 生成图片 ${Math.max(1, Math.min(turn.started, total))}/${total}`,
        state: 'active',
      });
    } else if (made > 0) {
      steps.push({
        key: 'make',
        text: `生成了 ${made} 张图${turn.failed > 0 ? `，${turn.failed} 张失败` : ''}`,
        state: 'done',
      });
    } else if (turn.failed > 0) {
      steps.push({ key: 'make', text: `${turn.failed} 张图没有生成成功`, state: 'error' });
    }
  }
  turn.notes.forEach((note, index) =>
    steps.push({ key: `note-${index}`, text: note, state: 'note' }),
  );
  if (turn.status === 'cancelled') steps.push({ key: 'end', text: '已取消', state: 'note' });
  if (turn.status === 'interrupted') {
    steps.push({ key: 'end', text: '页面刷新，这次请求中断了', state: 'error' });
  }
  if (turn.status === 'failed' && turn.error !== undefined) {
    steps.push({ key: 'end', text: turn.error, state: 'error' });
  }
  return steps;
}

function StepIcon({ state }: { state: StepState }) {
  if (state === 'active') return <LoaderCircle aria-hidden="true" className="spin" />;
  if (state === 'error') return <CircleAlert aria-hidden="true" />;
  if (state === 'note') return <Minus aria-hidden="true" />;
  return <Check aria-hidden="true" />;
}

/** What a plan will cost with the settings in the composer, and what stops it starting. */
export interface PlanBudget {
  label: string;
  /** Set when the credits left cannot pay for every picture. */
  shortfall?: string;
  /** New pictures will be kept to their maker. */
  isPrivate: boolean;
}

function PlanCard({
  turn,
  budget,
  onConfirm,
  onCancel,
  onRemove,
}: {
  turn: AgentTurn;
  budget: PlanBudget;
  onConfirm: () => void;
  onCancel: () => void;
  onRemove: (index: number) => void;
}) {
  const steps = turn.plan?.steps ?? [];
  return (
    <section className="agent-plan" aria-label="待确认的方案">
      <header className="agent-plan__header">
        <strong>{turn.planTitle ?? turn.plan?.skillLabel ?? '方案'}</strong>
        <span>
          {steps.length} 张 · {budget.label}
        </span>
      </header>
      {budget.isPrivate ? (
        <span className="agent-plan__visibility">
          <Lock aria-hidden="true" />
          仅自己可见
        </span>
      ) : null}
      <ol className="agent-plan__list">
        {steps.map((step, index) => (
          <li key={`${step.label}-${index}`} className="agent-plan__item">
            <span className="agent-plan__meta">
              <span className="agent-plan__label">{step.label}</span>
              <span className="agent-plan__aspect">{step.settings.aspectRatio}</span>
              {steps.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="agent-plan__remove"
                  aria-label={`去掉「${step.label}」`}
                  onClick={() => onRemove(index)}
                >
                  <X aria-hidden="true" />
                </Button>
              ) : null}
            </span>
            <p className="agent-plan__prompt" title={step.settings.prompt}>
              {step.settings.prompt}
            </p>
          </li>
        ))}
      </ol>
      {budget.shortfall === undefined ? null : (
        <p className="agent-plan__shortfall" role="status">
          {budget.shortfall}
        </p>
      )}
      <footer className="agent-plan__actions">
        <Button type="button" variant="ghost" size="compact" onClick={onCancel}>
          取消
        </Button>
        <Button
          type="button"
          size="compact"
          disabled={budget.shortfall !== undefined}
          onClick={onConfirm}
        >
          开始生成
        </Button>
      </footer>
    </section>
  );
}

const TIME_FORMAT = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * The conversation with the Agent: each request, the steps taken for it, and, when it asks
 * first, the plan waiting for a yes. Kept scrolled to the newest.
 */
export function AgentThread({
  turns,
  busy,
  planBudget,
  examples,
  onConfirm,
  onCancel,
  onRemoveStep,
  onRetry,
  onReveal,
  onExample,
}: {
  turns: readonly AgentTurn[];
  /** The Agent is at work, so an ended request cannot be sent again yet. */
  busy: boolean;
  planBudget: (turn: AgentTurn) => PlanBudget;
  examples: readonly string[];
  onConfirm: (turn: AgentTurn) => void;
  onCancel: (turn: AgentTurn) => void;
  /** Drops one picture from a plan waiting for a yes. */
  onRemoveStep: (turn: AgentTurn, index: number) => void;
  onRetry: (turn: AgentTurn) => void;
  onReveal: (turn: AgentTurn) => void;
  onExample: (example: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const last = turns.at(-1);
  const progressKey = last
    ? `${turns.length}:${last.status}:${last.started}:${last.batchIds.length}:${last.notes.length}`
    : '';

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element !== null) element.scrollTop = element.scrollHeight;
  }, [progressKey]);

  if (turns.length === 0) {
    return (
      <div ref={scrollRef} className="agent-thread agent-thread--empty">
        <div className="agent-thread__intro">
          <h2>想做点什么？</h2>
          <p>
            说说你的需求，Agent
            会挑合适的技能、规划每张图，生成的图会摆在画布上。选中画布上的图，下一次就以它为参考。
          </p>
        </div>
        <div className="agent-thread__examples" role="group" aria-label="试试这样说">
          {examples.map((example) => (
            <Button
              key={example}
              type="button"
              variant="ghost"
              className="agent-thread__example"
              onClick={() => onExample(example)}
            >
              {example}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="agent-thread">
      <ol className="agent-thread__turns" aria-label="对话">
        {turns.map((turn) => (
          <li key={turn.id} className="agent-turn" data-status={turn.status}>
            <div className="agent-turn__request">
              {turn.references.length > 0 ? (
                <span
                  className="agent-turn__references"
                  aria-label={`参考 ${turn.references.length} 张图`}
                >
                  {turn.references.slice(0, 4).map((reference) => (
                    <img
                      key={reference.id}
                      src={thumbnailUrl(reference.imageUrl, 320)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  ))}
                </span>
              ) : null}
              <p>{turn.brief}</p>
            </div>
            <time className="agent-turn__time" dateTime={turn.createdAt}>
              {TIME_FORMAT.format(new Date(turn.createdAt))}
            </time>
            <ol className="agent-steps" aria-label="Agent 的步骤">
              {turnSteps(turn).map((step) => (
                <li key={step.key} className="agent-step" data-state={step.state}>
                  <StepIcon state={step.state} />
                  <span>{step.text}</span>
                </li>
              ))}
            </ol>
            {turn.status === 'awaiting' && turn.plan !== undefined ? (
              <PlanCard
                turn={turn}
                budget={planBudget(turn)}
                onConfirm={() => onConfirm(turn)}
                onCancel={() => onCancel(turn)}
                onRemove={(index) => onRemoveStep(turn, index)}
              />
            ) : null}
            {turn.status === 'done' && turn.batchIds.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="compact"
                className="agent-turn__action"
                onClick={() => onReveal(turn)}
              >
                在画布上查看
              </Button>
            ) : null}
            {turn === last && (turn.status === 'failed' || turn.status === 'interrupted') ? (
              <Button
                type="button"
                variant="ghost"
                size="compact"
                className="agent-turn__action"
                disabled={busy}
                onClick={() => onRetry(turn)}
              >
                重新发送
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
