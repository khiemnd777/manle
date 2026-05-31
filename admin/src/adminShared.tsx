import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ApiError } from './api/client';
import type { PriceTier } from './api/client';
import type { SelectOption } from './adminTypes';
import { Icon } from './icons';
import type { IconName } from './icons';

export type SortDirection = 'asc' | 'desc';
export type SortValue = string | number | boolean | null | undefined;
export type SortState<Key extends string> = {
  key: Key;
  direction: SortDirection;
};

export type ToastKind = 'success' | 'error' | 'info';
export type Toast = {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
};
export type Notify = (kind: ToastKind, title: string, message?: string) => void;

export const ToastContext = createContext<Notify>(() => undefined);

export type AppDialogVariant = 'info' | 'warning' | 'danger';
export type AppDialogOptions = {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: AppDialogVariant;
};
export type AppDialogActions = {
  alert: (options: AppDialogOptions) => Promise<void>;
  confirm: (options: AppDialogOptions) => Promise<boolean>;
};

type AppDialogMode = 'alert' | 'confirm';
type AppDialogRequest = AppDialogOptions & {
  id: number;
  mode: AppDialogMode;
  resolve: (value: boolean) => void;
};

export const AppDialogContext = createContext<AppDialogActions>({
  alert: async () => undefined,
  confirm: async () => false,
});

const toastIcons: Record<ToastKind, IconName> = {
  success: 'check',
  error: 'alert',
  info: 'info',
};

export function messageFromError(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unexpected error';
}

export function field(form: HTMLFormElement, name: string) {
  const value = new FormData(form).get(name);
  return typeof value === 'string' ? value.trim() : '';
}

export function numberField(form: HTMLFormElement, name: string) {
  const value = Number(field(form, name));
  return Number.isFinite(value) ? value : 0;
}

export function boolField(form: HTMLFormElement, name: string) {
  return new FormData(form).get(name) === 'on';
}

export function cents(value: number) {
  return `$${(value / 100).toFixed(2)}`;
}

export function dateOnly(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

export function timestamp(value?: string | null) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function compareSortValues(a: SortValue, b: SortValue, direction: SortDirection) {
  const aEmpty = a == null || a === '';
  const bEmpty = b == null || b === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  const multiplier = direction === 'asc' ? 1 : -1;
  const normalizedA = typeof a === 'boolean' ? Number(a) : a;
  const normalizedB = typeof b === 'boolean' ? Number(b) : b;
  if (typeof normalizedA === 'number' && typeof normalizedB === 'number') {
    return (normalizedA - normalizedB) * multiplier;
  }

  return String(normalizedA).localeCompare(String(normalizedB), undefined, {
    numeric: true,
    sensitivity: 'base',
  }) * multiplier;
}

export function sortedRows<T, Key extends string>(
  rows: T[],
  sort: SortState<Key> | null,
  accessors: Record<Key, (row: T) => SortValue>,
) {
  if (!sort) return rows;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const result = compareSortValues(accessors[sort.key](a.row), accessors[sort.key](b.row), sort.direction);
      return result || a.index - b.index;
    })
    .map(item => item.row);
}

export function nextSortState<Key extends string>(current: SortState<Key> | null, key: Key): SortState<Key> {
  if (!current || current.key !== key) return { key, direction: 'asc' };
  return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
}

function SortIcon({ direction }: { direction: SortDirection | null }) {
  const name: IconName = direction === 'asc' ? 'sortAsc' : direction === 'desc' ? 'sortDesc' : 'sort';
  return <Icon name={name} className="sort-icon" />;
}

export function SortableTh<Key extends string>({
  label,
  column,
  sort,
  onSort,
}: {
  label: string;
  column: Key;
  sort: SortState<Key> | null;
  onSort: (column: Key) => void;
}) {
  const active = sort?.key === column;
  return (
    <th aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className={`sort-button${active ? ' active' : ''}`}
        onClick={() => onSort(column)}
      >
        <span>{label}</span>
        <span className="sort-indicator">
          <SortIcon direction={active ? sort.direction : null} />
        </span>
      </button>
    </th>
  );
}

export function StatusBadge({ value }: { value?: string | boolean | null }) {
  const text = value == null ? 'none' : String(value);
  const kind = text === 'active' || text === 'true' || text === 'trialing' ? 'good' : text === 'disabled' || text === 'false' ? 'bad' : 'neutral';
  return <span className={`status status-${kind}`}>{text}</span>;
}

export function tierOptions(tiers: PriceTier[], first?: SelectOption) {
  const options = tiers.map(tier => ({ value: tier.code, label: tier.name }));
  return first ? [first, ...options] : options;
}

export function useNotify() {
  return useContext(ToastContext);
}

export function useAppDialog() {
  return useContext(AppDialogContext);
}

export function useConfirmDialog() {
  return useContext(AppDialogContext).confirm;
}

export function useFeedbackState(kind: ToastKind, title = 'Action failed') {
  const notify = useNotify();
  const [value, setValueState] = useState('');
  const setValue = useCallback((nextValue: string) => {
    setValueState(nextValue);
    if (!nextValue) return;
    if (kind === 'error') {
      notify(kind, title, nextValue);
      return;
    }
    notify(kind, nextValue);
  }, [kind, notify, title]);

  return [value, setValue] as const;
}

export function ActionButton({
  icon,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: IconName }) {
  const classes = ['button-with-icon', className].filter(Boolean).join(' ');
  return (
    <button {...props} className={classes}>
      {icon && <Icon name={icon} />}
      <span>{children}</span>
    </button>
  );
}

export function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.kind === 'error' ? 7000 : 4600);
    return () => window.clearTimeout(timer);
  }, [onDismiss, toast.id, toast.kind]);

  return (
    <div className={`toast toast-${toast.kind}`}>
      <span className="toast-icon"><Icon name={toastIcons[toast.kind]} /></span>
      <span className="toast-copy">
        <strong>{toast.title}</strong>
        {toast.message && <span>{toast.message}</span>}
      </span>
      <button type="button" className="toast-close" onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification">
        <Icon name="x" />
      </button>
    </div>
  );
}

export function Dialog({
  title,
  children,
  onClose,
  panelClassName = '',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  panelClassName?: string;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="dialog-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={['dialog-panel', panelClassName].filter(Boolean).join(' ')} role="dialog" aria-modal="true" aria-label={title}>
        <header className="dialog-head">
          <h2>{title}</h2>
          <ActionButton className="ghost-button" type="button" icon="x" onClick={onClose}>Close</ActionButton>
        </header>
        {children}
      </section>
    </div>
  );
}

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [activeRequest, setActiveRequest] = useState<AppDialogRequest | null>(null);
  const activeRequestRef = useRef<AppDialogRequest | null>(null);
  const queuedRequests = useRef<AppDialogRequest[]>([]);

  useEffect(() => {
    activeRequestRef.current = activeRequest;
  }, [activeRequest]);

  const openDialog = useCallback((mode: AppDialogMode, options: AppDialogOptions) => {
    return new Promise<boolean>(resolve => {
      const request: AppDialogRequest = {
        ...options,
        id: Date.now() + Math.floor(Math.random() * 1000),
        mode,
        resolve,
      };

      setActiveRequest(current => {
        if (current) {
          queuedRequests.current.push(request);
          return current;
        }
        return request;
      });
    });
  }, []);

  const resolveDialog = useCallback((value: boolean) => {
    const request = activeRequestRef.current;
    if (!request) return;
    request.resolve(value);
    const nextRequest = queuedRequests.current.shift() || null;
    activeRequestRef.current = nextRequest;
    setActiveRequest(nextRequest);
  }, []);

  const actions = useMemo<AppDialogActions>(() => ({
    alert: async (options) => {
      await openDialog('alert', options);
    },
    confirm: (options) => openDialog('confirm', options),
  }), [openDialog]);

  return (
    <AppDialogContext.Provider value={actions}>
      {children}
      <AppDialogFrame request={activeRequest} onResolve={resolveDialog} />
    </AppDialogContext.Provider>
  );
}

function AppDialogFrame({
  request,
  onResolve,
}: {
  request: AppDialogRequest | null;
  onResolve: (value: boolean) => void;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!request) return undefined;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const timer = window.setTimeout(() => {
      const panel = panelRef.current;
      const target = panel?.querySelector<HTMLElement>('[data-dialog-autofocus]')
        || panel?.querySelector<HTMLElement>('button');
      target?.focus();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [request?.id]);

  useEffect(() => {
    if (!request) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onResolve(false);
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') || [])
        .filter(element => !element.hasAttribute('disabled'));
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onResolve, request]);

  if (!request) return null;

  const variant = request.variant || 'info';
  const titleId = `app-dialog-title-${request.id}`;
  const messageId = request.message ? `app-dialog-message-${request.id}` : undefined;
  const iconName: IconName = variant === 'info' ? 'info' : 'alert';
  const confirmLabel = request.confirmLabel || (request.mode === 'confirm' ? 'Confirm' : 'OK');

  return (
    <div className="dialog-overlay app-dialog-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onResolve(false); }}>
      <section
        ref={panelRef}
        className={`dialog-panel app-dialog-panel app-dialog-${variant}`}
        role={variant === 'info' && request.mode === 'confirm' ? 'dialog' : 'alertdialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        tabIndex={-1}
      >
        <div className="app-dialog-body">
          <span className="app-dialog-icon" aria-hidden="true">
            <Icon name={iconName} />
          </span>
          <div className="app-dialog-copy">
            <h2 id={titleId}>{request.title}</h2>
            {request.message && <div id={messageId} className="app-dialog-message">{request.message}</div>}
          </div>
        </div>
        <div className="dialog-actions app-dialog-actions">
          {request.mode === 'confirm' && (
            <ActionButton type="button" className="ghost-button" onClick={() => onResolve(false)} data-dialog-autofocus>
              {request.cancelLabel || 'Cancel'}
            </ActionButton>
          )}
          <ActionButton
            type="button"
            className={variant === 'danger' ? 'danger-button' : ''}
            onClick={() => onResolve(true)}
            data-dialog-autofocus={request.mode === 'alert' ? true : undefined}
          >
            {confirmLabel}
          </ActionButton>
        </div>
      </section>
    </div>
  );
}

export function CustomSelect({
  name,
  options,
  defaultValue = '',
  placeholder = 'Select',
}: {
  name: string;
  options: SelectOption[];
  defaultValue?: string;
  placeholder?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  const selected = options.find(option => option.value === value);

  return (
    <div
      className={`custom-select${open ? ' open' : ''}`}
      onBlur={(event) => {
        const nextFocus = event.relatedTarget as Node | null;
        if (nextFocus && event.currentTarget.contains(nextFocus)) return;
        setOpen(false);
      }}
    >
      <input type="hidden" name={name} value={value} readOnly />
      <button
        type="button"
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
      >
        <span>{selected?.label || placeholder}</span>
        <span className="select-caret" aria-hidden="true" />
      </button>
      {open && (
        <div className="select-menu" role="listbox">
          {options.map(option => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? 'selected' : ''}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setValue(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Switcher({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean, input: HTMLInputElement) => void;
}) {
  return (
    <label className="switcher" aria-label={label}>
      <input
        type="checkbox"
        defaultChecked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked, event.currentTarget)}
      />
      <span className="switch-track" aria-hidden="true"><span /></span>
    </label>
  );
}
