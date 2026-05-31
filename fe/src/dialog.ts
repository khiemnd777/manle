type DialogVariant = 'info' | 'warning' | 'danger';
type DialogMode = 'alert' | 'confirm';

type DialogOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: DialogVariant;
};

type DialogRequest = Required<Pick<DialogOptions, 'title'>> & Omit<DialogOptions, 'title'> & {
  id: number;
  mode: DialogMode;
  resolve: (value: boolean) => void;
};

type DialogElements = {
  overlay: HTMLElement;
  panel: HTMLElement;
  title: HTMLElement;
  message: HTMLElement;
  icon: HTMLElement;
  cancelButton: HTMLButtonElement;
  confirmButton: HTMLButtonElement;
};

const queue: DialogRequest[] = [];
let activeRequest: DialogRequest | null = null;
let elements: DialogElements | null = null;
let bound = false;
let previousFocus: HTMLElement | null = null;

function byId<T extends HTMLElement>(id: string) {
  return document.getElementById(id) as T | null;
}

function iconForVariant(variant: DialogVariant) {
  if (variant === 'info') return 'i';
  return '!';
}

export function dialogMessageFromError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error == null) return 'Unexpected error';
  return String(error);
}

function resolveElements() {
  if (elements) return elements;

  const nextElements = {
    overlay: byId<HTMLElement>('appDialog'),
    panel: byId<HTMLElement>('appDialogPanel'),
    title: byId<HTMLElement>('appDialogTitle'),
    message: byId<HTMLElement>('appDialogMessage'),
    icon: byId<HTMLElement>('appDialogIcon'),
    cancelButton: byId<HTMLButtonElement>('appDialogCancelBtn'),
    confirmButton: byId<HTMLButtonElement>('appDialogConfirmBtn'),
  };

  if (
    !nextElements.overlay ||
    !nextElements.panel ||
    !nextElements.title ||
    !nextElements.message ||
    !nextElements.icon ||
    !nextElements.cancelButton ||
    !nextElements.confirmButton
  ) {
    throw new Error('App dialog markup is missing from template.html.');
  }

  elements = nextElements as DialogElements;
  return elements;
}

function focusableElements(panel: HTMLElement) {
  return Array.from(panel.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter(element => !element.hasAttribute('disabled') && !element.hidden && element.offsetParent !== null);
}

function bindDialogEvents() {
  if (bound) return;
  const els = resolveElements();
  bound = true;

  els.overlay.addEventListener('mousedown', event => {
    if (event.target === event.currentTarget) closeActiveDialog(false);
  });
  els.cancelButton.addEventListener('click', () => closeActiveDialog(false));
  els.confirmButton.addEventListener('click', () => closeActiveDialog(true));

  window.addEventListener('keydown', event => {
    if (!activeRequest) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeActiveDialog(false);
      return;
    }

    if (event.key !== 'Tab') return;
    const focusable = focusableElements(els.panel);
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
  });
}

function renderDialog(request: DialogRequest) {
  const els = resolveElements();
  const variant = request.variant || 'info';
  const isConfirm = request.mode === 'confirm';

  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  els.overlay.className = `app-dialog app-dialog-${variant}`;
  els.overlay.hidden = false;
  els.panel.setAttribute('role', isConfirm && variant === 'info' ? 'dialog' : 'alertdialog');
  els.panel.setAttribute('aria-labelledby', 'appDialogTitle');
  els.panel.setAttribute('aria-describedby', 'appDialogMessage');
  els.title.textContent = request.title;
  els.message.textContent = request.message || '';
  els.message.hidden = !request.message;
  els.icon.textContent = iconForVariant(variant);
  els.cancelButton.hidden = !isConfirm;
  els.cancelButton.textContent = request.cancelLabel || 'Cancel';
  els.confirmButton.textContent = request.confirmLabel || (isConfirm ? 'Confirm' : 'OK');
  document.body.classList.add('app-dialog-open');

  window.setTimeout(() => {
    const target = isConfirm ? els.cancelButton : els.confirmButton;
    target.focus();
  }, 0);
}

function openNextDialog() {
  if (activeRequest || !queue.length) return;
  activeRequest = queue.shift() || null;
  if (activeRequest) renderDialog(activeRequest);
}

function closeActiveDialog(value: boolean) {
  const request = activeRequest;
  if (!request) return;
  const els = resolveElements();
  activeRequest = null;
  els.overlay.hidden = true;
  document.body.classList.remove('app-dialog-open');
  request.resolve(value);
  previousFocus?.focus();
  previousFocus = null;
  window.setTimeout(openNextDialog, 0);
}

function openDialog(mode: DialogMode, options: DialogOptions) {
  bindDialogEvents();
  return new Promise<boolean>(resolve => {
    queue.push({
      ...options,
      id: Date.now() + Math.floor(Math.random() * 1000),
      mode,
      resolve,
    });
    openNextDialog();
  });
}

export function bindAppDialog() {
  bindDialogEvents();
}

export function showAppDialog(options: DialogOptions) {
  return openDialog('alert', options).then(() => undefined);
}

export function confirmAppDialog(options: DialogOptions) {
  return openDialog('confirm', options);
}

export function showErrorDialog(error: unknown, title = 'Không thể hoàn tất') {
  return showAppDialog({
    title,
    message: dialogMessageFromError(error),
    variant: 'danger',
  });
}
