import { fireEvent, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  it('fills the editor with the whole example when it is clicked', () => {
    const onValueChange = vi.fn();
    const { getByRole } = render(
      <AgentChatInput
        ariaLabel="图像提示词"
        models={[]}
        reasoningLevels={[]}
        speedModes={[]}
        agents={[]}
        skills={[]}
        streamingPlaceholders={['银色礼服舞者悬浮在深海中']}
        onValueChange={onValueChange}
      />,
    );

    fireEvent.click(getByRole('button', { name: '填入示例提示词' }));

    expect(getByRole('textbox', { name: '图像提示词' })).toHaveTextContent(
      '银色礼服舞者悬浮在深海中',
    );
    expect(onValueChange).toHaveBeenLastCalledWith('银色礼服舞者悬浮在深海中');
  });

  it('keeps the example out of the tab order so Tab still lands in the editor', () => {
    const { getByRole } = render(
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

    expect(getByRole('button', { name: '填入示例提示词' })).toHaveAttribute('tabindex', '-1');
  });
});

describe('AgentChatInput skills', () => {
  const icon = <svg data-testid="skill-icon" />;
  const skill = { id: 'architecture', label: '架构图', description: '分层架构图', icon };
  const baseProps = {
    ariaLabel: '图像提示词',
    models: [],
    reasoningLevels: [],
    speedModes: [],
    agents: [],
  };

  it('opens the file picker straight from + without a menu in between', () => {
    const { container, getByRole, queryByRole } = render(
      <AgentChatInput {...baseProps} skills={[skill]} />,
    );
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    const pick = vi.spyOn(fileInput!, 'click');

    fireEvent.click(getByRole('button', { name: '添加参考图' }));

    expect(pick).toHaveBeenCalledOnce();
    expect(queryByRole('menu')).not.toBeInTheDocument();
  });

  it('leaves + out when uploads are off', () => {
    const { queryByRole } = render(
      <AgentChatInput {...baseProps} skills={[skill]} allowFileUpload={false} />,
    );

    expect(queryByRole('button', { name: '添加参考图' })).not.toBeInTheDocument();
  });

  it('tells which keys send and which start a new line', () => {
    const { container } = render(<AgentChatInput {...baseProps} value="海报" />);
    const submit = container.querySelector<HTMLButtonElement>('.agent-chat-input__submit');

    expect(submit).toHaveAttribute('aria-keyshortcuts', 'Enter');
    expect(submit).toHaveAttribute('title', '发送（Enter）· 换行用 Shift+Enter');
  });

  it('shows a picked skill as icon and text while its value stays "/label"', () => {
    const { container } = render(
      <AgentChatInput {...baseProps} skills={[skill]} value="/架构图 产业平台" />,
    );

    const pill = container.querySelector<HTMLElement>('[data-skill-id="architecture"]');
    expect(pill).toHaveTextContent(/^架构图$/);
    expect(pill?.querySelector('svg')).toBeInTheDocument();
  });
});

describe('AgentChatInput composer box', () => {
  const baseProps = {
    ariaLabel: '图像提示词',
    models: [],
    reasoningLevels: [],
    speedModes: [],
    agents: [],
    skills: [],
  };

  it('stops streaming examples while the text has focus, so the caret is plain to see', () => {
    const { container, getByRole } = render(
      <AgentChatInput
        {...baseProps}
        placeholder="描述你想生成的画面"
        streamingPlaceholders={['雨夜的未来城市']}
      />,
    );
    const editor = getByRole('textbox', { name: '图像提示词' });
    const examples = container.querySelector('.agent-chat-input__streaming-placeholder');
    expect(examples).toHaveAttribute('data-active', 'true');
    expect(editor).toHaveAttribute('data-placeholder', '');

    fireEvent.focus(editor);
    expect(examples).not.toHaveAttribute('data-active');
    expect(editor).toHaveAttribute('data-placeholder', '描述你想生成的画面');

    fireEvent.blur(editor);
    expect(examples).toHaveAttribute('data-active', 'true');
  });

  it('focuses the text when an empty part of the box is pressed', () => {
    const { container, getByRole } = render(<AgentChatInput {...baseProps} />);

    fireEvent.mouseDown(container.querySelector('.agent-chat-input__surface')!);

    expect(getByRole('textbox', { name: '图像提示词' })).toHaveFocus();
  });

  it('marks the current mode and hands a picked one to the page', () => {
    const onModeChange = vi.fn();
    const { getByRole } = render(
      <AgentChatInput
        {...baseProps}
        modes={[
          { id: 'agent', label: 'Agent 模式' },
          { id: 'image', label: '图片生成' },
          { id: 'video', label: '视频生成', badge: '即将上线' },
        ]}
        mode="image"
        onModeChange={onModeChange}
      />,
    );

    expect(getByRole('button', { name: '图片生成' })).toHaveAttribute('aria-pressed', 'true');
    expect(getByRole('button', { name: 'Agent 模式' })).toHaveAttribute('aria-pressed', 'false');
    const video = getByRole('button', { name: /视频生成/ });
    expect(video).toHaveTextContent('即将上线');
    fireEvent.click(video);
    expect(onModeChange).toHaveBeenCalledWith('video');
  });

  it('counts reference images against the limit and stops adding at it', () => {
    const file = new File(['a'], 'a.png', { type: 'image/png' });
    const first: AgentChatAttachment = { id: 'a', name: 'a.png', type: 'image/png', file };
    const second: AgentChatAttachment = { ...first, id: 'b', name: 'b.png' };
    const { getByRole, getByText, rerender } = render(
      <AgentChatInput {...baseProps} attachments={[first]} attachmentLimit={2} />,
    );
    expect(getByText('参考图 1/2')).toBeInTheDocument();
    expect(getByRole('button', { name: '添加参考图' })).toBeEnabled();
    expect(getByRole('button', { name: '移除参考图 a.png' })).toBeInTheDocument();

    rerender(<AgentChatInput {...baseProps} attachments={[first, second]} attachmentLimit={2} />);
    expect(getByText('参考图 2/2')).toBeInTheDocument();
    expect(getByRole('button', { name: '添加参考图' })).toBeDisabled();
  });

  it('lists every skill in the library and hands the picked one to the page', async () => {
    const user = userEvent.setup();
    const onLibrarySkillSelect = vi.fn();
    const { getByRole, findByRole } = render(
      <AgentChatInput
        {...baseProps}
        librarySkills={[
          { id: 'poster', label: '活动海报', description: '一次出竖版海报、方图和横幅' },
          { id: 'logo', label: '品牌 Logo', description: '一次出四个方向的 Logo' },
        ]}
        onLibrarySkillSelect={onLibrarySkillSelect}
      />,
    );

    await user.click(getByRole('button', { name: '技能库' }));
    const library = await findByRole('menu', { name: '技能库' });
    expect(within(library).getAllByRole('menuitem')).toHaveLength(2);
    await user.click(within(library).getByRole('menuitem', { name: /品牌 Logo/ }));

    expect(onLibrarySkillSelect).toHaveBeenCalledWith('logo');
  });
});
