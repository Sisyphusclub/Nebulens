import { ArrowUp } from 'lucide-react';
import { useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useOutOfView } from '@/hooks/useOutOfView';

/**
 * A one-line composer that floats at the bottom of the home page once the hero composer
 * (`anchor`) has scrolled away, so an idea found in the feed can be sent without going back
 * up. It writes into the same prompt, and sends it with whatever the hero composer is set
 * to: its mode, model, size and reference images.
 */
export function LandingQuickComposer({
  anchor,
  value,
  onValueChange,
  onSubmit,
  placeholder,
  disabled,
}: {
  anchor: RefObject<HTMLElement | null>;
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  disabled: boolean;
}) {
  const heroAway = useOutOfView(anchor);
  const [writing, setWriting] = useState(false);
  const ready = !disabled && value.trim() !== '';
  const send = (event: FormEvent): void => {
    event.preventDefault();
    if (ready) onSubmit();
  };
  const sendOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    // Enter picks a candidate while an input method is composing, and Shift+Enter is a
    // new line: neither ends the prompt.
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    send(event);
  };

  return (
    <div className="home-quick-composer">
      {/* It is only in the page while it shows, so the prompt is not there twice. While it
          is being written in it stays, even if the hero composer scrolls back into view. */}
      {heroAway || writing ? (
        <form
          className="home-quick-composer__bar"
          onSubmit={send}
          onFocus={() => setWriting(true)}
          onBlur={() => setWriting(false)}
        >
          {/* A textarea rather than an input: an input would drop the line breaks of a
              prompt written in the hero composer. */}
          <Textarea
            className="home-quick-composer__input"
            rows={1}
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            onKeyDown={sendOnEnter}
            placeholder={placeholder}
            aria-label="快速创作提示词"
            disabled={disabled}
          />
          <Button
            type="submit"
            size="icon"
            className="home-quick-composer__send"
            aria-label="发送提示词"
            disabled={!ready}
          >
            <ArrowUp aria-hidden="true" />
          </Button>
        </form>
      ) : null}
    </div>
  );
}
