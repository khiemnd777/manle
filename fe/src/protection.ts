const WATERMARK_TEXT = 'MANLE.INFO';
const WATERMARK_TILE_COUNT = 24;

function showProtectionToast(message: string) {
  let toast = document.querySelector('.protection-toast') as HTMLElement | null;
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'protection-toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(Number(toast.dataset.timer || 0));
  const timer = window.setTimeout(() => toast?.classList.remove('show'), 1800);
  toast.dataset.timer = String(timer);
}

function ensureWatermark(card: HTMLElement) {
  let watermark = card.querySelector('.card-watermark') as HTMLElement | null;
  if (!watermark) {
    watermark = document.createElement('div');
    watermark.className = 'card-watermark';
    watermark.setAttribute('aria-hidden', 'true');
    card.appendChild(watermark);
  }

  watermark.innerHTML = Array.from({ length: WATERMARK_TILE_COUNT }, () => (
    `<span>${WATERMARK_TEXT}</span>`
  )).join('');
}

function installWatermarks() {
  ['cardOut', 'cardOutTerm'].forEach(id => {
    const card = document.getElementById(id);
    if (card) ensureWatermark(card);
  });
}

export function enforceWatermarkForCapture(required: boolean) {
  installWatermarks();
  const previousDisplays = new Map<HTMLElement, string>();
  document.body.classList.toggle('entitlement-no-watermark', !required);
  document.querySelectorAll<HTMLElement>('.card-watermark').forEach(watermark => {
    previousDisplays.set(watermark, watermark.style.display);
    watermark.style.setProperty('display', required ? 'grid' : 'none', 'important');
  });

  return () => {
    previousDisplays.forEach((display, watermark) => {
      if (display) {
        watermark.style.display = display;
      } else {
        watermark.style.removeProperty('display');
      }
    });
  };
}

function blockPrint(message = 'Print đã bị chặn. Hãy dùng Export PDF/PNG/JPG có watermark.') {
  document.body.classList.add('print-blocked');
  showProtectionToast(message);
}

function bindPrintGuards() {
  document.addEventListener('keydown', event => {
    const isPrint = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p';
    if (!isPrint) return;
    event.preventDefault();
    event.stopPropagation();
    blockPrint();
  }, true);

  window.addEventListener('beforeprint', () => blockPrint('Print từ browser đã bị chặn.'));
  window.addEventListener('afterprint', () => document.body.classList.remove('print-blocked'));
  window.print = () => blockPrint();
}

function bindContextMenuGuard() {
  document.addEventListener('contextmenu', event => {
    event.preventDefault();
  }, true);
}

export function installContentProtection() {
  installWatermarks();
  bindContextMenuGuard();
  bindPrintGuards();
}
