import { Eye, EyeOff, LoaderCircle, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { useToast } from '@/components/common/ToastProvider';
import { MorphicCardModal } from '@/components/premium/morphic-card-modal';
import { Tabs, TabsList, TabsTrigger } from '@/components/premium/tabs/tabs';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { useAuthModal } from '@/hooks/useAuthModal';

const USERNAME_PATTERN = /^[a-z0-9_]{3,32}$/;

type AuthMode = 'signin' | 'signup';

const COPY: Record<
  AuthMode,
  { title: string; subtitle: string; submit: string; username: string; password: string }
> = {
  signin: {
    title: '欢迎回来',
    subtitle: '登录后继续你的创作。',
    submit: '登录',
    username: '输入用户名',
    password: '输入密码',
  },
  signup: {
    title: '创建账户，开始创作',
    subtitle: '注册后即可生成图片，每天签到还能领额度。',
    submit: '创建账户',
    username: '如：studio_lin',
    password: '至少 8 个字符',
  },
};

/** Signing in only needs both fields; the format rules are for picking new credentials. */
function usernameError(mode: AuthMode, value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) return '请输入用户名。';
  if (mode === 'signup' && !USERNAME_PATTERN.test(normalized)) {
    return '仅支持 3-32 位小写字母、数字或下划线。';
  }
  return null;
}

function passwordError(mode: AuthMode, value: string): string | null {
  if (value.length === 0) return '请输入密码。';
  if (mode === 'signup' && value.length < 8) return '密码至少为 8 个字符。';
  return null;
}

export function LoginModal() {
  const { isOpen, close, complete } = useAuthModal();
  const { notify } = useToast();
  const {
    isAuthenticated,
    isGoogleEnabled = false,
    isGoogleLoading = false,
    signInWithGoogle,
    signInWithUsername,
    signUpWithUsername,
  } = useAuth();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  /** Fields left while signing up; a filled one that breaks the rules is flagged right away. */
  const [touched, setTouched] = useState({ username: false, password: false });
  const usernameRef = useRef<HTMLInputElement>(null);
  const copy = COPY[mode];

  const validation = useMemo(() => {
    const shows = (field: 'username' | 'password', value: string): boolean =>
      hasSubmitted || (mode === 'signup' && touched[field] && value.length > 0);
    return {
      username: shows('username', username) ? usernameError(mode, username) : null,
      password: shows('password', password) ? passwordError(mode, password) : null,
    };
  }, [hasSubmitted, mode, password, touched, username]);

  // The modal stays mounted while closed, so every way out must leave a clean form behind.
  const resetForm = useCallback((): void => {
    setMode('signin');
    setUsername('');
    setPassword('');
    setShowPassword(false);
    setError(null);
    setPending(false);
    setHasSubmitted(false);
    setTouched({ username: false, password: false });
  }, []);

  const resetAndClose = useCallback((): void => {
    resetForm();
    close();
  }, [close, resetForm]);

  useEffect(() => {
    if (!isOpen) return;
    window.requestAnimationFrame(() => usernameRef.current?.focus());
  }, [isOpen]);

  useEffect(() => {
    if (isAuthenticated && isOpen) void complete();
  }, [complete, isAuthenticated, isOpen]);

  if (!isOpen) return null;

  const closeModal = (): void => {
    if (!pending) resetAndClose();
  };
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setHasSubmitted(true);
    if (usernameError(mode, username) !== null || passwordError(mode, password) !== null) return;
    const normalizedUsername = username.trim().toLowerCase();
    setPending(true);
    setError(null);
    try {
      if (mode === 'signin') {
        await signInWithUsername({ username: normalizedUsername, password });
        notify(`欢迎回来，${normalizedUsername}。`);
      } else {
        await signUpWithUsername({ username: normalizedUsername, password });
        notify('注册成功，已为你登录。每天签到还能领取生成额度。');
      }
      resetForm();
      await complete();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '操作失败，请稍后重试。');
      setPending(false);
    }
  };
  const google = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      await signInWithGoogle();
      resetForm();
      await complete();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Google 登录暂不可用。');
      setPending(false);
    }
  };

  return (
    <MorphicCardModal
      id="auth-login"
      open={isOpen}
      onClose={closeModal}
      sharedLayout={false}
      className="floating-surface auth-modal-surface"
      backdropClassName="auth-backdrop"
    >
      <section
        className="dialog login-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
      >
        <Button
          className="icon-button dialog__close"
          type="button"
          variant="ghost"
          size="icon"
          aria-label="关闭账户对话框"
          disabled={pending}
          onClick={resetAndClose}
        >
          <X aria-hidden="true" />
        </Button>
        <div className="auth-brand" aria-hidden="true">
          <img src="/brand/logo.png" alt="" />
          <span>Nebulens</span>
        </div>
        <div className="auth-heading">
          <h2 id="login-title">{copy.title}</h2>
          <p>{copy.subtitle}</p>
        </div>
        <Tabs
          value={mode}
          onValueChange={(next) => {
            if (next !== 'signin' && next !== 'signup') return;
            setMode(next);
            setError(null);
            setHasSubmitted(false);
            setTouched({ username: false, password: false });
          }}
          className="auth-mode-tabs"
        >
          <TabsList aria-label="账户操作">
            <TabsTrigger value="signin" disabled={pending}>
              登录
            </TabsTrigger>
            <TabsTrigger value="signup" disabled={pending}>
              注册
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <form className="form-stack auth-form" noValidate onSubmit={(event) => void submit(event)}>
          <div className="auth-field">
            <label>
              <span>用户名</span>
              <Input
                ref={usernameRef}
                value={username}
                disabled={pending}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
                placeholder={copy.username}
                aria-invalid={validation.username !== null}
                aria-describedby={
                  validation.username
                    ? 'username-error'
                    : mode === 'signup'
                      ? 'username-hint'
                      : undefined
                }
                onChange={(event) => setUsername(event.target.value)}
                onBlur={() => setTouched((current) => ({ ...current, username: true }))}
              />
            </label>
            {validation.username ? (
              <small id="username-error" className="field-error">
                {validation.username}
              </small>
            ) : mode === 'signup' ? (
              <small id="username-hint" className="field-hint">
                3-32 位小写字母、数字或下划线
              </small>
            ) : null}
          </div>
          <div className="auth-field">
            <label>
              <span>密码</span>
              <span className="password-field">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  disabled={pending}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  placeholder={copy.password}
                  aria-invalid={validation.password !== null}
                  aria-describedby={validation.password ? 'password-error' : undefined}
                  onChange={(event) => setPassword(event.target.value)}
                  onBlur={() => setTouched((current) => ({ ...current, password: true }))}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  disabled={pending}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </Button>
              </span>
            </label>
            {validation.password ? (
              <small id="password-error" className="field-error">
                {validation.password}
              </small>
            ) : null}
          </div>
          {error ? (
            <Alert variant="destructive" className="form-error">
              {error}
            </Alert>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? <LoaderCircle className="spin" aria-hidden="true" /> : null}
            {pending ? '处理中' : copy.submit}
          </Button>
        </form>
        {/* Google only appears once the backend confirms it is set up. */}
        {isGoogleEnabled && !isGoogleLoading ? (
          <>
            <div className="dialog-separator">
              <span>或</span>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => void google()}
            >
              使用 Google 继续
            </Button>
          </>
        ) : null}
      </section>
    </MorphicCardModal>
  );
}
