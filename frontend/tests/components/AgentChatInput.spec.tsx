import { fireEvent, render } from '@testing-library/react';
import type { ClipboardEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AgentChatInput } from '@/components/premium/agent-chat-input/agent-chat-input';
import type { AgentChatAttachment } from '@/components/premium/agent-chat-input/types';

function renderInput(onAttachmentsChange: (attachments: AgentChatAttachment[]) => void) {
  return render(
    <AgentChatInput
      ariaLabel="图像提示词"
      models={[]}
      reasoningLevels={[]}
      speedModes={[]}
      agents={[]}
      skills={[]}
      acceptedFileTypes="image/png,image/jpeg,image/webp"
      onAttachmentsChange={onAttachmentsChange}
    />,
  );
}

describe('AgentChatInput reference image drop', () => {
  it('marks the composer while dragging and forwards dropped images', () => {
    const onAttachmentsChange = vi.fn();
    const { container } = renderInput(onAttachmentsChange);
    const root = container.querySelector('[data-slot="agent-chat-input"]');
    const surface = container.querySelector('.agent-chat-input__surface');
    const file = new File(['image'], 'reference.png', { type: 'image/png' });
    const dataTransfer = { files: [file], types: ['Files'], dropEffect: 'none' };

    expect(root).not.toHaveClass('agent-chat-input--dragging');
    fireEvent.dragEnter(surface!, { dataTransfer });
    expect(root).toHaveClass('agent-chat-input--dragging');
    expect(surface).toHaveAttribute('data-dragging', 'true');

    fireEvent.dragOver(surface!, { dataTransfer });
    expect(dataTransfer.dropEffect).toBe('copy');

    fireEvent.drop(surface!, { dataTransfer });

    expect(root).not.toHaveClass('agent-chat-input--dragging');
    expect(onAttachmentsChange).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'reference.png',
        type: 'image/png',
        file,
      }),
    ]);
  });

  it('ignores dropped files outside the accepted image types', () => {
    const onAttachmentsChange = vi.fn();
    const { container } = renderInput(onAttachmentsChange);
    const surface = container.querySelector('.agent-chat-input__surface');
    const file = new File(['text'], 'notes.txt', { type: 'text/plain' });
    const dataTransfer = { files: [file], types: ['Files'], dropEffect: 'none' };

    fireEvent.drop(surface!, { dataTransfer });

    expect(onAttachmentsChange).not.toHaveBeenCalled();
  });
});

describe('AgentChatInput text paste', () => {
  it('inserts only plain text from a rich clipboard and preserves line breaks', () => {
    const onValueChange = vi.fn();
    const { getByRole } = render(
      <AgentChatInput
        ariaLabel="图像提示词"
        models={[]}
        reasoningLevels={[]}
        speedModes={[]}
        agents={[]}
        skills={[]}
        onValueChange={onValueChange}
      />,
    );
    const editor = getByRole('textbox');
    editor.focus();

    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);

    const getData = vi.fn((type: string) =>
      type === 'text/plain'
        ? '第一行\n第二行'
        : '<strong style="color: red">第一行</strong><p>第二行</p>',
    );
    fireEvent.paste(editor, {
      clipboardData: {
        files: [],
        items: [],
        types: ['text/plain', 'text/html'],
        getData,
      },
    });

    expect(getData).toHaveBeenCalledWith('text/plain');
    expect(editor).toHaveTextContent('第一行第二行');
    expect(editor.innerHTML).toBe('第一行<br>第二行');
    expect(editor.querySelector('strong, p, [style]')).toBeNull();
    expect(onValueChange).toHaveBeenLastCalledWith('第一行\n第二行');
  });

  it('turns a pasted image into an attachment instead of inline editor content', () => {
    const onAttachmentsChange = vi.fn();
    const parentPaste = vi.fn((event: ClipboardEvent<HTMLDivElement>) => event.defaultPrevented);
    const file = new File(['image'], 'pasted.png', { type: 'image/png' });
    const { getByRole } = render(
      <div onPaste={parentPaste}>
        <AgentChatInput
          ariaLabel="图像提示词"
          models={[]}
          reasoningLevels={[]}
          speedModes={[]}
          agents={[]}
          skills={[]}
          acceptedFileTypes="image/png,image/jpeg,image/webp"
          onAttachmentsChange={onAttachmentsChange}
        />
      </div>,
    );
    const editor = getByRole('textbox');

    fireEvent.paste(editor, {
      clipboardData: {
        files: [file],
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
        types: ['Files', 'text/html'],
        getData: vi.fn(() => '<img src="https://example.com/pasted.png">'),
      },
    });

    // The browser must not insert the image into the editor itself.
    expect(parentPaste).toHaveReturnedWith(true);
    expect(editor.innerHTML).toBe('');
    expect(onAttachmentsChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ name: 'pasted.png', type: 'image/png', file }),
    ]);
  });

  it('ignores pasted files of unsupported types without inserting them', () => {
    const onAttachmentsChange = vi.fn();
    const parentPaste = vi.fn((event: ClipboardEvent<HTMLDivElement>) => event.defaultPrevented);
    const file = new File(['%PDF'], 'notes.pdf', { type: 'application/pdf' });
    const { getByRole } = render(
      <div onPaste={parentPaste}>
        <AgentChatInput
          ariaLabel="图像提示词"
          models={[]}
          reasoningLevels={[]}
          speedModes={[]}
          agents={[]}
          skills={[]}
          acceptedFileTypes="image/png,image/jpeg,image/webp"
          onAttachmentsChange={onAttachmentsChange}
        />
      </div>,
    );

    fireEvent.paste(getByRole('textbox'), {
      clipboardData: {
        files: [file],
        items: [{ kind: 'file', type: 'application/pdf', getAsFile: () => file }],
        types: ['Files'],
        getData: vi.fn(() => ''),
      },
    });

    expect(parentPaste).toHaveReturnedWith(true);
    expect(onAttachmentsChange).not.toHaveBeenCalled();
  });
});

describe('AgentChatInput streaming placeholder', () => {
  it('renders example prompts as passive placeholder text, not a control', () => {
    const { container, queryByRole } = render(
      <AgentChatInput
        ariaLabel="图像提示词"
        models={[]}
        reasoningLevels={[]}
        speedModes={[]}
        agents={[]}
        skills={[]}
        streamingPlaceholders={['银色礼服舞者悬浮在深海中']}
      />,
    );
    const placeholder = container.querySelector('.agent-chat-input__streaming-placeholder');

    expect(placeholder).toBeInTheDocument();
    expect(placeholder?.tagName).not.toBe('BUTTON');
    expect(placeholder).toHaveAttribute('aria-hidden', 'true');
    expect(queryByRole('button', { name: '复制当前提示词示例' })).not.toBeInTheDocument();
  });
});
