import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';

// ---------- toasts ----------
interface Toast {
  id: number;
  kind: 'ok' | 'error';
  text: string;
}
const ToastCtx = createContext<(kind: Toast['kind'], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div
        className="fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={`rounded-md border-l-4 border border-line bg-surface px-3 py-2 text-sm shadow-md ${t.kind === 'ok' ? 'border-ok' : 'border-danger'}`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- modal and confirm ----------
export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('keydown', esc);
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/60 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`mt-8 w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} rounded-lg border border-line bg-surface shadow-lg`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-heading text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-ink-mute hover:bg-raised"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Confirm({
  title,
  text,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
  busy,
}: {
  title: string;
  text: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="text-sm text-ink-soft">{text}</div>
      <div className="mt-5 flex justify-end gap-2">
        <button className={btn.ghost} onClick={onCancel}>
          Cancel
        </button>
        <button className={danger ? btn.danger : btn.primary} onClick={onConfirm} disabled={busy}>
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export const btn = {
  primary:
    'rounded-md bg-accent px-3.5 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50',
  ghost: 'neo-sm px-3.5 py-2 text-sm font-medium text-ink-soft hover:text-ink disabled:opacity-50',
  danger:
    'rounded-md bg-red-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50',
  link: 'text-sm font-medium text-accent-text hover:underline',
};
export const inputCls =
  'neo-in w-full border border-transparent px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:border-accent focus:outline-2 focus:outline-accent/40';

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="mb-3">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">
        {label}
      </label>
      {children(id)}
      {hint && !error && <p className="mt-1 text-xs text-ink-mute">{hint}</p>}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export function PageHeader({
  title,
  crumbs,
  actions,
}: {
  title: string;
  crumbs: string[];
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <nav aria-label="Breadcrumb" className="text-xs text-ink-mute">
          {['Admin', ...crumbs].join(' / ')}
        </nav>
        <h1 className="font-heading text-2xl font-semibold text-ink">{title}</h1>
      </div>
      <div className="flex gap-2">{actions}</div>
    </div>
  );
}

export const Loading = ({ label = 'Loading…' }: { label?: string }) => (
  <p className="py-10 text-center text-sm text-ink-mute" role="status">
    {label}
  </p>
);
export const ErrorBox = ({ error, retry }: { error: Error; retry?: () => void }) => (
  <div
    className="rounded-md border border-danger/40 bg-danger-bg p-4 text-sm text-danger"
    role="alert"
  >
    <p className="font-medium">Could not load this page.</p>
    <p className="mt-1">{error.message}</p>
    {retry && (
      <button className="mt-2 font-medium underline" onClick={retry}>
        Try again
      </button>
    )}
  </div>
);
export const Empty = ({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action?: ReactNode;
}) => (
  <div className="rounded-md border border-dashed border-line-strong bg-surface py-10 text-center">
    <p className="font-medium text-ink">{title}</p>
    {text && <p className="mt-1 text-sm text-ink-mute">{text}</p>}
    {action && <div className="mt-3">{action}</div>}
  </div>
);

// Status vocabulary: colour is always paired with words.
export const STATUS: Record<string, { label: string; cls: string }> = {
  free: { label: 'Available', cls: 'st st-free' },
  occupied: { label: 'Currently scheduled', cls: 'st st-occupied' },
  maintenance: { label: 'Under maintenance', cls: 'st st-maintenance' },
  inactive: { label: 'Inactive', cls: 'st st-inactive' },
};
export const StatusPill = ({ status }: { status: string }) => {
  const s = STATUS[status] ?? { label: status, cls: 'st st-inactive' };
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${s.cls}`}>
      {s.label}
    </span>
  );
};
