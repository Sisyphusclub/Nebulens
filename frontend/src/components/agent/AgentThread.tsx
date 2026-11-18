import {
  Check,
  CircleAlert,
  CircleCheck,
  Download,
  LoaderCircle,
  Lock,
  Minus,
  RefreshCw,
  X,
} from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import type { AgentTurn } from '@/hooks/useAgentConversation';
import { IMAGE_MODEL_LABELS, type AspectRatio, type ImageModel } from '@/types/image';
import {
  PIECE_CHECK_LABELS,
  type AgentSet,
  type PieceCheck,
  type SetPiece,
} from '@/utils/agentSets';
import type { SkillRunStep } from '@/utils/skillRun';
import { quotedTexts } from '@/utils/textCheck';
import { thumbnailUrl } from '@/utils/thumbnail';

type StepState = 'active' | 'done' | 'error' | 'note';

interface Step {
  key: string;
  text: string;
  state: StepState;
  /** What the step found, one short line each, such as what was read from the request. */
  detail?: readonly string[];
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function modelLabel(turn: AgentTurn): string {
  const model = turn.plan?.steps[0]?.settings.model;
  if (model === undefined) return '图片模型';
  return IMAGE_MODEL_LABELS[model as ImageModel] ?? model;
}

/**
 * What the text checks found across a set, said once every picture with text has a verdict;
 * nothing when no picture had text to check.
 */
function checkStep(set: AgentSet): Step | null {
  if (set.pieces.some((piece) => piece.check === 'checking')) {
    return { key: 'check', text: '正在核对图上的文字…', state: 'active' };
  }
  const originals = set.pieces.filter((piece) => piece.redrawOf === undefined);
  const count = (check: PieceCheck): number =>
    originals.filter((piece) => piece.check === check).length;
  const redrawn = count('redrawn');
  const wrong = count('issues');
  const unchecked = count('unchecked');
  // A redraw is checked again; one that is still wrong needs a person to look at it.
  const stillWrong = set.pieces.filter(
    (piece) => piece.redrawOf !== undefined && piece.check === 'issues',
  ).length;
  const checked = count('passed') + redrawn + wrong;
  if (checked === 0 && unchecked === 0) return null;
  const parts: string[] = [];
  if (checked > 0) parts.push(`核对了 ${checked} 张图上的文字`);
  if (checked > 0 && redrawn === 0 && wrong === 0) parts.push('都没问题');
  if (redrawn > 0) parts.push(`${redrawn} 张写错已重画`);
  if (stillWrong > 0) parts.push(`其中 ${stillWrong} 张重画后仍有误`);
  if (wrong > 0) parts.push(`${wrong} 张有误`);
  if (unchecked > 0) parts.push(`${unchecked} 张没能核对，请留意`);
  return {
    key: 'check',
    text: parts.join('，'),
    state: wrong > 0 || stillWrong > 0 ? 'error' : unchecked > 0 ? 'note' : 'done',
  };
}

/** What the Agent has done for a request, step by step, as the reference's chat lists it. */
function turnSteps(turn: AgentTurn, set: AgentSet | undefined): Step[] {
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
          ? '按需求自己规划画面'
          : `选用技能「${turn.chosenSkill}」`,
      state: 'done',
    });
  }
  // What was read from the request goes under reading it, or under the skill it was read for.
  const understood =
    steps.find((step) => step.key === 'think') ?? steps.find((step) => step.key === 'skill');
  if (understood !== undefined && turn.points !== undefined && turn.points.length > 0) {
    understood.detail = turn.points;
  }
  const total = turn.plan?.steps.length ?? 0;
  if (turn.plan !== undefined) {
    // What the Agent planned stays as it was; pictures dropped from the plan are told after.
    const planned = Math.max(turn.plannedCount ?? total, total);
    steps.push({
      key: 'plan',
      text: `规划了 ${planned} 张图${turn.planningMs === undefined ? '' : ` ${seconds(turn.planningMs)}`}`,
      state: 'done',
    });
    if (planned > total) {
      steps.push({ key: 'trim', text: `已去掉 ${planned - total} 张`, state: 'note' });
    }
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
  // After the notes, such as a redraw being started, as where the checks stand now.
  const checked = set === undefined ? null : checkStep(set);
  if (checked !== null) steps.push(checked);
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

/** The words a planned picture will carry, which the text check reads back once it is made. */
function PlannedTexts({ step }: { step: SkillRunStep }) {
  const texts = quotedTexts(step.settings.prompt);
  if (texts.length === 0) return null;
  return (
    <p className="agent-texts" title={texts.join('\n')}>
      <span className="agent-texts__label">图上文字</span>
      <span className="agent-texts__value">{texts.join(' · ')}</span>
    </p>
  );
}

/** Shapes wider than tall, where a banner can go. */
const WIDE_SHAPES: readonly AspectRatio[] = ['4:3', '16:9', '3:2', '3:1', '5:4'];

interface NextStep {
  label: string;
  /** What goes into the composer, the set going along as its reference. */
  prompt: string;
}

/**
 * What a finished set could use next: the shapes it lacks for the usual placements, then a
 * fresh colourway of the same layout. Two at most of the first kind.
 */
function nextSteps(steps: readonly SkillRunStep[]): NextStep[] {
  const shapes = steps.map((step) => step.settings.aspectRatio);
  const missing: NextStep[] = [];
  if (!shapes.some((shape) => WIDE_SHAPES.includes(shape))) {
    missing.push({
      label: '补一张横版 Banner',
      prompt: '按这一套的风格和文字，补一张横版 Banner（16:9）',
    });
  }
  if (!shapes.includes('1:1')) {
    missing.push({
      label: '补一张方图',
      prompt: '按这一套的风格和文字，补一张方图（1:1），发社媒用',
    });
  }
  if (!shapes.includes('9:16')) {
    missing.push({
      label: '补一张竖版长图',
      prompt: '按这一套的风格和文字，补一张竖版长图（9:16），做朋友圈和短视频封面',
    });
  }
  return [
    ...missing.slice(0, 2),
    { label: '换个配色再出一套', prompt: '保持这一套的版式和文字，换一种配色再出一套' },
  ];
}

type RowState = 'done' | 'making' | 'waiting' | 'failed';

/** One planned piece in the delivery list, with its picture once it is made. */
interface DeliveryRow {
  key: string;
  step?: SkillRunStep;
  label: string;
  aspect: string;
  piece?: SetPiece;
  state: RowState;
}

/**
 * The plan's pieces in order, each with its finished picture, the redraw where the text was
 * fixed. A piece still missing is being made, waiting its turn, or failed.
 */
function deliveryRows(turn: AgentTurn, set: AgentSet): DeliveryRow[] {
  const finals = [...set.finals];
  let missing = 0;
  const rows = (turn.plan?.steps ?? []).map((step, index): DeliveryRow => {
    const at = finals.findIndex((piece) => piece.label === step.label);
    const piece = at === -1 ? undefined : finals.splice(at, 1)[0];
    if (piece !== undefined) {
      return {
        key: piece.key,
        step,
        label: step.label,
        aspect: piece.aspect,
        piece,
        state: 'done',
      };
    }
    const state: RowState = !set.running ? 'failed' : missing === 0 ? 'making' : 'waiting';
    missing += 1;
    return {
      key: `${turn.id}#${index}`,
      step,
      label: step.label,
      aspect: step.settings.aspectRatio,
      state,
    };
  });
  // Pictures the plan cannot name, such as those of requests kept from before batches were.
  return [
    ...rows,
    ...finals.map(
      (piece): DeliveryRow => ({
        key: piece.key,
        label: piece.label,
        aspect: piece.aspect,
        piece,
        state: 'done',
      }),
    ),
  ];
}

const ROW_STATE_LABELS: Readonly<Record<Exclude<RowState, 'done'>, string>> = {
  making: '生成中',
  waiting: '排队中',
  failed: '没有生成成功',
};

/** Where a delivered picture's text stands; a redraw says so, whatever its own check says. */
function rowCheck(piece: SetPiece): { check: PieceCheck; text: string } | null {
  if (piece.redrawOf !== undefined) {
    if (piece.check === 'passed') return { check: 'passed', text: '重画后无误' };
    if (piece.check === 'checking') return { check: 'checking', text: '重画后核对中' };
    if (piece.check === 'issues') return { check: 'issues', text: '重画后仍有误' };
    return { check: 'redrawn', text: '已重画' };
  }
  return piece.check === 'none'
    ? null
    : { check: piece.check, text: PIECE_CHECK_LABELS[piece.check] };
}

function RowStatus({ row }: { row: DeliveryRow }) {
  if (row.piece === undefined) {
    if (row.state === 'done') return null;
    return (
      <span className="agent-delivery__status" data-check={row.state}>
        {row.state === 'making' ? <LoaderCircle aria-hidden="true" className="spin" /> : null}
        {row.state === 'failed' ? <CircleAlert aria-hidden="true" /> : null}
        {ROW_STATE_LABELS[row.state]}
      </span>
    );
  }
  const check = rowCheck(row.piece);
  if (check === null) return null;
  return (
    <span
      className="agent-delivery__status"
      data-check={check.check}
      title={row.piece.issues.length > 0 ? row.piece.issues.join('\n') : undefined}
    >
      {check.check === 'checking' ? <LoaderCircle aria-hidden="true" className="spin" /> : null}
      {check.check === 'passed' ? <CircleCheck aria-hidden="true" /> : null}
      {check.check === 'redrawn' ? <RefreshCw aria-hidden="true" /> : null}
      {check.check === 'issues' || check.check === 'unchecked' ? (
        <CircleAlert aria-hidden="true" />
      ) : null}
      {check.text}
    </span>
  );
}

/**
 * What a request delivered: every planned piece with its picture, shape, words and text
 * check, and the set's own actions. A piece opens where it lies on the board.
 */
function DeliveryCard({
  turn,
  set,
  onRevealPiece,
  onReveal,
  onDownload,
}: {
  turn: AgentTurn;
  set: AgentSet;
  onRevealPiece: (key: string) => void;
  onReveal: () => void;
  onDownload: () => void;
}) {
  return (
    <section className="agent-delivery" aria-label="交付清单">
      <header className="agent-delivery__header">
        <strong>{set.title}</strong>
        <span>
          {set.running ? `${set.finals.length}/${set.planned} 件` : `${set.finals.length} 件`}
        </span>
      </header>
      <ol className="agent-delivery__list">
        {deliveryRows(turn, set).map((row) => {
          const content = (
            <>
              <span className="agent-delivery__thumb" data-state={row.state}>
                {row.piece === undefined ? (
                  row.state === 'failed' ? (
                    <CircleAlert aria-hidden="true" />
                  ) : null
                ) : (
                  <img
                    src={thumbnailUrl(row.piece.entry.imageUrl, 320)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                )}
              </span>
              <span className="agent-delivery__body">
                <span className="agent-delivery__title">
                  <span className="agent-delivery__name">{row.label}</span>
                  <span className="agent-delivery__aspect">{row.aspect}</span>
                </span>
                {row.step === undefined ? null : <PlannedTexts step={row.step} />}
              </span>
              <RowStatus row={row} />
            </>
          );
          return (
            <li key={row.key}>
              {row.piece === undefined ? (
                <div className="agent-delivery__item">{content}</div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  className="agent-delivery__item"
                  title="在画布上定位这张图"
                  onClick={() => onRevealPiece(row.key)}
                >
                  {content}
                </Button>
              )}
            </li>
          );
        })}
      </ol>
      <footer className="agent-delivery__actions">
        <Button type="button" variant="ghost" size="compact" onClick={onReveal}>
          在画布上查看
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="compact"
          disabled={set.finals.length === 0}
          onClick={onDownload}
        >
          <Download aria-hidden="true" />
          下载整套
        </Button>
      </footer>
    </section>
  );
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
            <PlannedTexts step={step} />
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
          className="agent-plan__start"
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
  sets,
  busy,
  planBudget,
  examples,
  onConfirm,
  onCancel,
  onRemoveStep,
  onRetry,
  onReveal,
  onRevealPiece,
  onDownloadSet,
  onSuggest,
  onExample,
}: {
  turns: readonly AgentTurn[];
  /** The pictures each request made, by request id. */
  sets: ReadonlyMap<string, AgentSet>;
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
  /** Brings one picture into view on the board. */
  onRevealPiece: (key: string) => void;
  onDownloadSet: (turn: AgentTurn) => void;
  /** Puts a next step in the composer, with the request's set as its reference. */
  onSuggest: (turn: AgentTurn, prompt: string) => void;
  onExample: (example: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const last = turns.at(-1);
  const lastSet = last === undefined ? undefined : sets.get(last.id);
  const progressKey = last
    ? `${turns.length}:${last.status}:${last.started}:${last.batchIds.length}:${last.notes.length}:${
        lastSet?.pieces.map((piece) => piece.check).join() ?? ''
      }`
    : '';

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element !== null) element.scrollTop = element.scrollHeight;
  }, [progressKey]);

  if (turns.length === 0) {
    return (
      <div ref={scrollRef} className="agent-thread agent-thread--empty">
        <div className="agent-thread__intro">
          <h2>要出什么物料？</h2>
          <p>
            说说要做什么，Agent
            会挑合适的技能、规划每张图，把一整套摆在画布上，图上的文字会自动校对。选中画布上的图，下一次就以它为参考。
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
        {turns.map((turn) => {
          const set = sets.get(turn.id);
          return (
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
                {turnSteps(turn, set).map((step) => (
                  <li key={step.key} className="agent-step" data-state={step.state}>
                    <StepIcon state={step.state} />
                    <span className="agent-step__body">
                      <span>{step.text}</span>
                      {step.detail === undefined ? null : (
                        <ul className="agent-step__points" aria-label="理解到的要点">
                          {step.detail.map((point) => (
                            <li key={point}>{point}</li>
                          ))}
                        </ul>
                      )}
                    </span>
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
              {set !== undefined && turn.status !== 'awaiting' ? (
                <DeliveryCard
                  turn={turn}
                  set={set}
                  onRevealPiece={onRevealPiece}
                  onReveal={() => onReveal(turn)}
                  onDownload={() => onDownloadSet(turn)}
                />
              ) : null}
              {turn === last &&
              turn.status === 'done' &&
              set !== undefined &&
              set.finals.length > 0 ? (
                <div className="agent-next" role="group" aria-label="接着可以">
                  <span className="agent-next__label">接着可以</span>
                  {nextSteps(turn.plan?.steps ?? []).map((next) => (
                    <Button
                      key={next.label}
                      type="button"
                      variant="ghost"
                      size="compact"
                      className="agent-next__chip"
                      disabled={busy}
                      onClick={() => onSuggest(turn, next.prompt)}
                    >
                      {next.label}
                    </Button>
                  ))}
                </div>
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
          );
        })}
      </ol>
    </div>
  );
}
