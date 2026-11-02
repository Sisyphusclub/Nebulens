import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  isGoogleEnabled: true,
  isGoogleLoading: false,
  signInWithGoogle: vi.fn(),
  signInWithUsername: vi.fn(),
  signUpWithUsername: vi.fn(),
  complete: vi.fn(),
  close: vi.fn(),
  isOpen: true,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    isGoogleEnabled: auth.isGoogleEnabled,
    isGoogleLoading: auth.isGoogleLoading,
    signInWithGoogle: auth.signInWithGoogle,
    signInWithUsername: auth.signInWithUsername,
    signUpWithUsername: auth.signUpWithUsername,
  }),
}));

vi.mock('@/hooks/useAuthModal', () => ({
  useAuthModal: () => ({
    isOpen: auth.isOpen,
    close: auth.close,
    complete: auth.complete,
  }),
}));

import { LoginModal } from '@/components/auth/LoginModal';
import { ToastProvider } from '@/components/common/ToastProvider';

beforeEach(() => {
  vi.clearAllMocks();
  auth.isGoogleEnabled = true;
  auth.isGoogleLoading = false;
  auth.isOpen = true;
});

describe('LoginModal', () => {
  it('hides Google sign-in unless the backend has it set up', () => {
    auth.isGoogleEnabled = false;
    const { unmount } = render(<LoginModal />);
    expect(screen.queryByRole('button', { name: /Google/ })).not.toBeInTheDocument();
    expect(screen.queryByText('或')).not.toBeInTheDocument();
    unmount();

    // Nothing shows while the provider check is still pending either.
    auth.isGoogleEnabled = true;
    auth.isGoogleLoading = true;
    render(<LoginModal />);
    expect(screen.queryByRole('button', { name: /Google/ })).not.toBeInTheDocument();
  });

  it('greets returning users and new ones differently', async () => {
    const user = userEvent.setup();
    render(<LoginModal />);

    expect(screen.getByRole('heading', { name: '欢迎回来' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: '注册' }));
    expect(screen.getByRole('heading', { name: '创建账户，开始创作' })).toBeInTheDocument();
  });

  it('only asks for both fields when signing in, without the naming rules', async () => {
    const user = userEvent.setup();
    render(<LoginModal />);

    const username = screen.getByLabelText('用户名');
    const password = screen.getByLabelText('密码');
    await waitFor(() => expect(username).toHaveFocus());
    expect(username).toHaveAttribute('placeholder', '输入用户名');
    expect(password).toHaveAttribute('placeholder', '输入密码');
    expect(screen.queryByText('3-32 位小写字母、数字或下划线')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '登录' }));
    expect(screen.getByText('请输入用户名。')).toBeInTheDocument();
    expect(screen.getByText('请输入密码。')).toBeInTheDocument();
    expect(auth.signInWithUsername).not.toHaveBeenCalled();

    await user.type(username, ' Studio_User ');
    await user.type(password, 'short');
    await user.click(screen.getByRole('button', { name: '登录' }));

    expect(screen.queryByText('仅支持 3-32 位小写字母、数字或下划线。')).not.toBeInTheDocument();
    expect(screen.queryByText('密码至少为 8 个字符。')).not.toBeInTheDocument();
    expect(auth.signInWithUsername).toHaveBeenCalledWith({
      username: 'studio_user',
      password: 'short',
    });

    expect(password).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: '显示密码' }));
    expect(password).toHaveAttribute('type', 'text');
  });

  it('checks the naming rules while signing up, as soon as a filled field is left', async () => {
    const user = userEvent.setup();
    render(<LoginModal />);

    await user.click(screen.getByRole('tab', { name: '注册' }));
    const username = screen.getByLabelText('用户名');
    const password = screen.getByLabelText('密码');
    expect(screen.getByText('3-32 位小写字母、数字或下划线')).toBeInTheDocument();

    // Leaving an empty field is not an error yet.
    await user.click(username);
    await user.tab();
    expect(screen.queryByText('请输入用户名。')).not.toBeInTheDocument();

    await user.type(username, 'creator@example.com');
    await user.tab();
    expect(screen.getByText('仅支持 3-32 位小写字母、数字或下划线。')).toBeInTheDocument();

    await user.type(password, '123');
    await user.tab();
    expect(screen.getByText('密码至少为 8 个字符。')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '创建账户' }));
    expect(auth.signUpWithUsername).not.toHaveBeenCalled();
  });

  it('submits sign-up credentials and completes the pending command', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <LoginModal />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('tab', { name: '注册' }));
    await user.type(screen.getByLabelText('用户名'), 'studio_user');
    await user.type(screen.getByLabelText('密码'), 'password123');
    await user.click(screen.getByRole('button', { name: '创建账户' }));

    await waitFor(() => {
      expect(auth.signUpWithUsername).toHaveBeenCalledWith({
        username: 'studio_user',
        password: 'password123',
      });
      expect(auth.complete).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.getByText('注册成功，已为你登录。每天签到还能领取生成额度。'),
    ).toBeInTheDocument();
  });

  it('opens fresh after a successful sign-up closed it', async () => {
    const user = userEvent.setup();
    auth.signUpWithUsername.mockResolvedValue(undefined);
    // Completing closes the modal without unmounting it, as useAuthModal does.
    auth.complete.mockImplementation(() => {
      auth.isOpen = false;
      return Promise.resolve();
    });
    const view = render(<LoginModal />);

    await user.click(screen.getByRole('tab', { name: '注册' }));
    await user.type(screen.getByLabelText('用户名'), 'studio_user');
    await user.type(screen.getByLabelText('密码'), 'password123');
    await user.click(screen.getByRole('button', { name: '创建账户' }));
    await waitFor(() => expect(auth.complete).toHaveBeenCalledTimes(1));
    view.rerender(<LoginModal />);
    expect(screen.queryByLabelText('用户名')).not.toBeInTheDocument();

    auth.isOpen = true;
    view.rerender(<LoginModal />);

    expect(screen.getByRole('tab', { name: '登录' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('用户名')).toHaveValue('');
    expect(screen.getByLabelText('密码')).toHaveValue('');
    expect(screen.getByRole('button', { name: '登录' })).toBeEnabled();
  });

  it('keeps authentication failures inside the dialog as an accessible alert', async () => {
    auth.signInWithUsername.mockRejectedValueOnce(new Error('用户名或密码不正确。'));
    const user = userEvent.setup();
    render(<LoginModal />);

    await user.type(screen.getByLabelText('用户名'), 'studio_user');
    await user.type(screen.getByLabelText('密码'), 'password123');
    await user.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('用户名或密码不正确。');
    expect(screen.getByRole('dialog')).toContainElement(screen.getByRole('alert'));
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(<LoginModal />);
    await user.keyboard('{Escape}');
    expect(auth.close).toHaveBeenCalledTimes(1);
  });
});
