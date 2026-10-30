import { ImagePlus, LoaderCircle, Plus, Sparkles, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type DragEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { LandingSkill } from '@/data/landingSkills';
import { fetchSkillForms } from '@/services/api/skillsApi';
import type { SkillField, SkillForm, SkillValues } from '@/types/skill';

export interface SkillSubmission {
  form: SkillForm;
  values: SkillValues;
  referenceFile: File | null;
}

interface SkillPanelProps {
  /** The last skill picked. Answers are kept while it stays the same, even when closed. */
  skill: LandingSkill | null;
  open: boolean;
  /** Credits one image costs with the current settings. */
  creditCost: number;
  onClose: () => void;
  /** Rejects with a user-facing message when the run cannot start. */
  onSubmit: (submission: SkillSubmission) => Promise<void>;
  /** Drops the skill's example prompt into the composer for people who prefer to write. */
  onUseExamplePrompt: (skill: LandingSkill) => void;
}

function initialValues(form: SkillForm): SkillValues {
  return Object.fromEntries(
    form.fields.map((field) => [
      field.id,
      field.kind === 'list' ? [''] : field.kind === 'choice' ? field.defaultValue : '',
    ]),
  );
}

function isAnswered(field: SkillField, value: string | string[] | undefined): boolean {
  if (field.kind === 'list') {
    return Array.isArray(value) && value.some((item) => item.trim().length > 0);
  }
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * A skill's own form: the facts it needs, the image it works from, and the set of
 * images it will make. The AI writes the prompts from these answers.
 */
export function SkillPanel({
  skill,
  open,
  creditCost,
  onClose,
  onSubmit,
  onUseExamplePrompt,
}: SkillPanelProps) {
  const descriptionId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [forms, setForms] = useState<SkillForm[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [values, setValues] = useState<SkillValues>({});
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = forms?.find((candidate) => candidate.id === skill?.id);

  useEffect(() => {
    if (!open || forms !== null) return;
    let cancelled = false;
    fetchSkillForms()
      .then((next) => {
        if (!cancelled) setForms(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : '技能加载失败。');
      });
    return () => {
      cancelled = true;
    };
  }, [forms, open]);

  useEffect(() => {
    setValues(form === undefined ? {} : initialValues(form));
    setReferenceFile(null);
    setError(null);
  }, [form]);

  useEffect(() => {
    if (referenceFile === null) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(referenceFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [referenceFile]);

  const setValue = (fieldId: string, value: string | string[]): void => {
    setValues((current) => ({ ...current, [fieldId]: value }));
  };
  const pickReference = (files: FileList | null): void => {
    const image = Array.from(files ?? []).find((file) => file.type.startsWith('image/'));
    if (image !== undefined) setReferenceFile(image);
  };
  const dropReference = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    pickReference(event.dataTransfer.files);
  };

  const ready =
    form !== undefined &&
    form.fields.every((field) => !field.required || isAnswered(field, values[field.id])) &&
    (form.reference !== 'required' || referenceFile !== null);

  const submit = async (): Promise<void> => {
    if (form === undefined || !ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ form, values, referenceFile });
    } catch (err) {
      setError(err instanceof Error ? err.message : '技能启动失败，请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

  const Icon = skill?.icon;
  return (
    <Sheet
      open={open && skill !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <SheetContent side="right" className="skill-panel" aria-describedby={descriptionId}>
        <SheetHeader className="skill-panel__header">
          <SheetTitle className="skill-panel__title">
            {Icon ? <Icon aria-hidden="true" /> : null}
            {skill?.label}
          </SheetTitle>
          <SheetDescription id={descriptionId} className="skill-panel__description">
            {form?.description ?? skill?.description}
          </SheetDescription>
          {form ? (
            <div className="skill-panel__outputs" aria-label="将生成">
              <span>将生成</span>
              {form.outputs.map((output) => (
                <span key={output.id} className="skill-panel__output">
                  {output.label}
                </span>
              ))}
            </div>
          ) : null}
        </SheetHeader>

        {form === undefined ? (
          <p className="skill-panel__status" role="status">
            {loadError ?? (forms === null ? '正在加载技能…' : '这个技能暂时不可用。')}
          </p>
        ) : (
          <form
            className="skill-panel__form"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {form.reference === 'none' ? null : (
              <div className="skill-panel__field">
                <span className="skill-panel__label">
                  {form.referenceLabel ?? '参考图'}
                  {form.reference === 'required' ? (
                    <span className="skill-panel__required" aria-hidden="true">
                      必填
                    </span>
                  ) : (
                    <span className="skill-panel__optional" aria-hidden="true">
                      可选
                    </span>
                  )}
                </span>
                <div
                  className="skill-panel__reference"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={dropReference}
                >
                  {previewUrl ? (
                    <>
                      <img src={previewUrl} alt="已选的参考图" />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="skill-panel__reference-remove"
                        aria-label="移除参考图"
                        onClick={() => setReferenceFile(null)}
                      >
                        <X aria-hidden="true" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      className="skill-panel__reference-pick"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImagePlus aria-hidden="true" />
                      上传图片
                    </Button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    aria-label={`上传${form.referenceLabel ?? '参考图'}`}
                    onChange={(event) => {
                      pickReference(event.target.files);
                      event.target.value = '';
                    }}
                  />
                </div>
              </div>
            )}

            {form.fields.map((field) => (
              <SkillFieldInput
                key={field.id}
                field={field}
                value={values[field.id]}
                onChange={(value) => setValue(field.id, value)}
              />
            ))}

            <div className="skill-panel__footer">
              {error ? (
                <p className="skill-panel__error" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="skill-panel__actions">
                <span className="skill-panel__cost">
                  共 {form.outputs.length} 张 · 消耗 {form.outputs.length * creditCost} 额度
                </span>
                <Button type="submit" disabled={!ready || busy}>
                  {busy ? (
                    <LoaderCircle aria-hidden="true" className="spin" />
                  ) : (
                    <Sparkles aria-hidden="true" />
                  )}
                  {busy ? 'AI 正在构思…' : '开始生成'}
                </Button>
              </div>
              {skill ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="compact"
                  className="skill-panel__example"
                  disabled={busy}
                  onClick={() => onUseExamplePrompt(skill)}
                >
                  改为自己写提示词
                </Button>
              ) : null}
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SkillFieldInput({
  field,
  value,
  onChange,
}: {
  field: SkillField;
  value: string | string[] | undefined;
  onChange: (value: string | string[]) => void;
}) {
  const inputId = useId();
  const badge = field.required ? (
    <span className="skill-panel__required" aria-hidden="true">
      必填
    </span>
  ) : null;
  const label = (
    <span className="skill-panel__label">
      {field.label}
      {badge}
    </span>
  );

  if (field.kind === 'choice') {
    const selected = typeof value === 'string' ? value : field.defaultValue;
    return (
      <div className="skill-panel__field">
        {label}
        <div className="skill-panel__choices" role="radiogroup" aria-label={field.label}>
          {field.options.map((option) => (
            <Button
              key={option}
              type="button"
              variant="ghost"
              role="radio"
              aria-checked={option === selected}
              className="skill-panel__choice"
              onClick={() => onChange(option)}
            >
              {option}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  if (field.kind === 'list') {
    const items = Array.isArray(value) && value.length > 0 ? value : [''];
    return (
      <div className="skill-panel__field">
        {label}
        {items.map((item, index) => (
          <div key={index} className="skill-panel__list-item">
            <Input
              value={item}
              maxLength={field.maxLength}
              placeholder={index === 0 ? field.placeholder : undefined}
              aria-label={`${field.label} ${index + 1}`}
              onChange={(event) =>
                onChange(items.map((current, at) => (at === index ? event.target.value : current)))
              }
            />
            {items.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`删除${field.label} ${index + 1}`}
                onClick={() => onChange(items.filter((_, at) => at !== index))}
              >
                <X aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        ))}
        {items.length < field.maxItems ? (
          <Button
            type="button"
            variant="ghost"
            size="compact"
            className="skill-panel__add"
            onClick={() => onChange([...items, ''])}
          >
            <Plus aria-hidden="true" />
            再加一条{field.label}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="skill-panel__field">
      <span className="skill-panel__label">
        <label htmlFor={inputId}>{field.label}</label>
        {badge}
      </span>
      <Input
        id={inputId}
        required={field.required}
        value={typeof value === 'string' ? value : ''}
        maxLength={field.maxLength}
        placeholder={field.placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
