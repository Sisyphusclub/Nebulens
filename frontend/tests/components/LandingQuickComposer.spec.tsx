import { act, createEvent, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { LandingQuickComposer } from '@/components/landing/LandingQuickComposer';

type Watch = (entries: Array<{ isIntersecting: boolean }>) => void;

const originalObserver = globalThis.IntersectionObserver;
let watch: Watch | null = null;
let watched: Element[] = [];
let disconnected = 0;

beforeEach(() => {
  watch = null;
  watched = [];
  disconnected = 0;
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    value: class {
      constructor(callback: Watch) {
        watch = callback;
      }
      disconnect(): void {
        disconnected += 1;
      }
      observe(element: Element): void {
        watched.push(element);
      }
      unobserve(): void {}
    },
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    value: originalObserver,
  });
});

interface QuickProps {
  value: string;
  disabled: boolean;
}

function renderQuick(props: Partial<QuickProps> = {}) {
  const anchor = createRef<HTMLDivElement>();
  const onValueChange = vi.fn();
  const onSubmit = vi.fn();
  const ui = (current: Partial<QuickProps>) => (
    <>
      <div ref={anchor} data-testid="hero-composer" />
      <LandingQuickComposer
        anchor={anchor}
        value={current.value ?? ''}
        onValueChange={onValueChange}
        onSubmit={onSubmit}
        placeholder="描述你想生成的画面..."
        disabled={current.disabled ?? false}
      />
    </>
  );
  const view = render(ui(props));
  return {
    ...view,
    onValueChange,
    onSubmit,
    update: (next: Partial<QuickProps>) => view.rerender(ui({ ...props, ...next })),
  };
}

function scrollHeroComposer(inView: boolean): void {
  act(() => watch?.([{ isIntersecting: inView }]));
}

it('is not in the page while the hero composer is on screen, and comes up once it has scrolled off', () => {
  const { container } = renderQuick({ value: '雨夜' });
  expect(watched).toEqual([screen.getByTestId('hero-composer')]);
  // Not merely hidden: the prompt is in the page once, in the hero composer.
  expect(container.querySelector('.home-quick-composer__bar')).toBeNull();
  expect(screen.queryByDisplayValue('雨夜')).toBeNull();

  scrollHeroComposer(false);
  expect(screen.getByRole('textbox', { name: '快速创作提示词' })).toHaveValue('雨夜');

  scrollHeroComposer(true);
  expect(container.querySelector('.home-quick-composer__bar')).toBeNull();
});

it('stays while it is being written in, even when the hero composer comes back into view', () => {
  const { container } = renderQuick();
  scrollHeroComposer(false);
  const box = screen.getByRole('textbox', { name: '快速创作提示词' });

  act(() => box.focus());
  scrollHeroComposer(true);
  expect(box).toBeInTheDocument();
  expect(box).toHaveFocus();

  act(() => box.blur());
  expect(container.querySelector('.home-quick-composer__bar')).toBeNull();
});

it('writes into the same prompt as the hero composer', async () => {
  const user = userEvent.setup();
  const { onValueChange } = renderQuick({ value: '雨夜' });
  scrollHeroComposer(false);

  const box = screen.getByRole('textbox', { name: '快速创作提示词' });
  expect(box).toHaveValue('雨夜');
  expect(box).toHaveAttribute('placeholder', '描述你想生成的画面...');
  await user.type(box, '街');
  expect(onValueChange).toHaveBeenLastCalledWith('雨夜街');
});

it('sends on Enter and on its button, but not an empty prompt', async () => {
  const user = userEvent.setup();
  const { onSubmit, update } = renderQuick({ value: '   ' });
  scrollHeroComposer(false);
  const box = screen.getByRole('textbox', { name: '快速创作提示词' });
  const send = screen.getByRole('button', { name: '发送提示词' });

  expect(send).toBeDisabled();
  box.focus();
  await user.keyboard('{Enter}');
  expect(onSubmit).not.toHaveBeenCalled();

  update({ value: '雨夜的未来城市' });
  expect(send).toBeEnabled();
  await user.keyboard('{Enter}');
  expect(onSubmit).toHaveBeenCalledTimes(1);
  await user.click(send);
  expect(onSubmit).toHaveBeenCalledTimes(2);
});

it('leaves Enter alone while a Chinese input method is composing, and with Shift', () => {
  const { onSubmit } = renderQuick({ value: '雨夜' });
  scrollHeroComposer(false);
  const box = screen.getByRole('textbox', { name: '快速创作提示词' });

  // Enter picks a candidate in the input method: it is not the end of the prompt.
  const composing = createEvent.keyDown(box, { key: 'Enter' });
  Object.defineProperty(composing, 'isComposing', { value: true });
  fireEvent(box, composing);
  fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
  expect(onSubmit).not.toHaveBeenCalled();

  fireEvent.keyDown(box, { key: 'Enter' });
  expect(onSubmit).toHaveBeenCalledTimes(1);
});

it('cannot be used while a skill is being planned', () => {
  const { onSubmit } = renderQuick({ value: '雨夜', disabled: true });
  scrollHeroComposer(false);

  const box = screen.getByRole('textbox', { name: '快速创作提示词' });
  expect(box).toBeDisabled();
  expect(screen.getByRole('button', { name: '发送提示词' })).toBeDisabled();
  fireEvent.keyDown(box, { key: 'Enter' });
  expect(onSubmit).not.toHaveBeenCalled();
});

it('never shows where the browser cannot tell what is on screen, and stops watching when it goes', () => {
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    value: undefined,
  });
  const blind = renderQuick();
  expect(blind.container.querySelector('.home-quick-composer__bar')).toBeNull();
  blind.unmount();

  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    value: class {
      disconnect(): void {
        disconnected += 1;
      }
      observe(): void {}
      unobserve(): void {}
    },
  });
  const seen = renderQuick();
  expect(disconnected).toBe(0);
  seen.unmount();
  expect(disconnected).toBe(1);
});
