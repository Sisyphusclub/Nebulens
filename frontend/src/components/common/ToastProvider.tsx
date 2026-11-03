import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';

import { Button } from '@/components/ui/button';

interface ToastAction {
  label: string;
  onAction: () => void;
}

interface ToastOptions {
  /** One follow-up, such as undoing what was just done; the toast stays up as long as it applies. */
  action?: ToastAction;
}

interface ToastContextValue {
  notify: (message: string, tone?: 'success' | 'error', options?: ToastOptions) => void;
}

interface Toast {
  id: number;
  message: string;
  tone: string;
  action?: ToastAction;
}

const TOAST_MS = 3200;
/** Matches the undo window of a delete, so the button is there for as long as it works. */
const ACTION_TOAST_MS = 5000;

const ToastContext = createContext<ToastContextValue>({ notify: () => undefined });

export function ToastProvider({ children }: PropsWithChildren) {
  const [toast, setToast] = useState<Toast | null>(null);
  const notify = useCallback(
    (message: string, tone: 'success' | 'error' = 'success', options: ToastOptions = {}) => {
      const id = Date.now();
      setToast({ id, message, tone, ...(options.action ? { action: options.action } : {}) });
      window.setTimeout(
        () => setToast((current) => (current?.id === id ? null : current)),
        options.action ? ACTION_TOAST_MS : TOAST_MS,
      );
    },
    [],
  );
  const value = useMemo(() => ({ notify }), [notify]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" aria-live="polite" aria-atomic="true">
        {toast ? (
          <div className={`floating-surface toast toast--${toast.tone}`}>
            <p>{toast.message}</p>
            {toast.action ? (
              <Button
                type="button"
                variant="ghost"
                size="compact"
                className="toast__action"
                onClick={() => {
                  toast.action?.onAction();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}
