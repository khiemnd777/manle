import { $, state } from './core';
import { authorizeFeatureUse, canUseEntitlement } from './account';
import { escapeHTML } from './render';

export type ProductTab = 'iul' | 'term';

type BenefitMeta = {
  id: string;
  en: string;
  vi: string;
};

type BenefitPair = {
  en: string;
  vi: string;
};

const ICON_OPTIONS = [
  {
    key: 'clipboard',
    name: 'Clipboard',
    bg: '#eee7ff',
    color: '#5b3fcc',
    path: 'M9 2h6a1 1 0 0 1 1 1v1h2a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V3a1 1 0 0 1 1-1zm0 2v2h6V4H9zm-2 8h10v2H7v-2zm0 4h7v2H7v-2z',
  },
  {
    key: 'check',
    name: 'Check',
    bg: '#eee7ff',
    color: '#5b3fcc',
    path: 'M12 2a3 3 0 0 1 3 3v2h2a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2V5a3 3 0 0 1 3-3zm0 2a1 1 0 0 0-1 1v2h2V5a1 1 0 0 0-1-1zm-3 9 1.5 3 4.5-5-1-1-3.5 4-1-1.5-1.5.5z',
  },
  {
    key: 'heart',
    name: 'Heart',
    bg: '#ffe5ed',
    color: '#d63f5f',
    path: 'M12 21s-7-4.35-7-10a4.5 4.5 0 0 1 8-2.84A4.5 4.5 0 0 1 19 11c0 5.65-7 10-7 10z',
  },
  {
    key: 'shield',
    name: 'Shield',
    bg: '#e4f7ef',
    color: '#2d7a63',
    path: 'M12 2 5 5v6c0 5 3.4 9.7 7 11 3.6-1.3 7-6 7-11V5l-7-3zm-1 13.6-3.3-3.3 1.4-1.4 1.9 1.9 4.2-4.2 1.4 1.4-5.6 5.6z',
  },
  {
    key: 'medical',
    name: 'Medical',
    bg: '#e7f0ff',
    color: '#3468c9',
    path: 'M10 3h4v5h5v4h-5v9h-4v-9H5V8h5V3z',
  },
  {
    key: 'star',
    name: 'Star',
    bg: '#fff4d6',
    color: '#c48618',
    path: 'M12 2l2.9 6 6.6.9-4.8 4.7 1.1 6.6L12 17l-5.8 3.2 1.1-6.6-4.8-4.7 6.6-.9L12 2z',
  },
] as const;

type IconKey = typeof ICON_OPTIONS[number]['key'];
const ICON_BY_KEY = new Map<IconKey, typeof ICON_OPTIONS[number]>(ICON_OPTIONS.map(icon => [icon.key, icon]));

const DEFAULT_BENEFITS: Record<ProductTab, BenefitMeta[]> = {
  iul: [
    { id: 'iul_lc_chronic', en: 'Chronic Illness', vi: 'Bệnh mãn tính' },
    { id: 'iul_lc_terminal', en: 'Terminal Illness', vi: 'Bệnh nan y' },
    { id: 'iul_lc_critical', en: 'Critical Illness', vi: 'Bệnh nghiêm trọng' },
  ],
  term: [
    { id: 't_lc_chronic', en: 'Chronic Illness', vi: 'Bệnh mãn tính' },
    { id: 't_lc_terminal', en: 'Terminal Illness', vi: 'Bệnh nan y' },
    { id: 't_lc_critical', en: 'Critical Illness', vi: 'Bệnh nghiêm trọng' },
  ],
};

export const DEFAULT_LIVING_BENEFIT_COLUMNS: Record<ProductTab, string[][]> = {
  iul: [['iul_lc_chronic', 'iul_lc_terminal'], ['iul_lc_critical']],
  term: [['t_lc_chronic', 't_lc_terminal'], ['t_lc_critical']],
};

const DEFAULT_BENEFIT_IDS: Record<ProductTab, string[]> = {
  iul: DEFAULT_BENEFITS.iul.map(item => item.id),
  term: DEFAULT_BENEFITS.term.map(item => item.id),
};

const DEFAULT_CARD_TEMPLATES = new Map<string, string>();
DEFAULT_BENEFIT_IDS.iul.concat(DEFAULT_BENEFIT_IDS.term).forEach(id => {
  const card = typeof document === 'undefined' ? null : document.getElementById(id);
  if (card) DEFAULT_CARD_TEMPLATES.set(id, card.outerHTML);
});

let scheduleSaveCallback = () => {};
let customSeq = 0;

const PRO_ONLY_ACTIONS = new Set([
  'add-column',
  'delete-column',
  'reset-columns',
  'add-item',
  'delete-item',
  'move',
  'sort',
  'toggle',
  'icon-picker',
  'icon-select',
]);

export function setLivingBenefitColumnSaveScheduler(fn: () => void) {
  scheduleSaveCallback = fn;
}

function cloneColumns(cols: string[][]) {
  return cols.map(col => [...col]);
}

function productRootId(product: ProductTab) {
  return product === 'iul' ? 'cardOut' : 'cardOutTerm';
}

function productPrefix(product: ProductTab) {
  return product === 'iul' ? 'iul_lc_' : 't_lc_';
}

function gridFor(product: ProductTab) {
  const cardId = productRootId(product);
  return document.querySelector(`#${cardId} .living-grid`) as HTMLElement | null;
}

function defaultBenefitById(product: ProductTab, id: string) {
  return DEFAULT_BENEFITS[product].find(item => item.id === id);
}

function isDefaultBenefitId(product: ProductTab, id: string) {
  return DEFAULT_BENEFIT_IDS[product].includes(id);
}

function isValidBenefitId(product: ProductTab, id: unknown) {
  return typeof id === 'string' && id.startsWith(productPrefix(product));
}

function defaultIconKeyFor(product: ProductTab, id: string): IconKey {
  const meta = defaultBenefitById(product, id);
  if (meta?.en === 'Terminal Illness') return 'check';
  if (meta?.en === 'Critical Illness') return 'heart';
  return 'clipboard';
}

function iconFor(key: string | undefined): typeof ICON_OPTIONS[number] {
  return ICON_BY_KEY.get(key as IconKey) || ICON_BY_KEY.get('clipboard')!;
}

function iconSvg(key: string | undefined) {
  const icon = iconFor(key);
  return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="${icon.path}"/></svg>`;
}

function iconKeyFor(product: ProductTab, id: string): IconKey {
  const card = $(id) as HTMLElement | null;
  const saved = card?.dataset.lbIcon;
  if (saved && ICON_BY_KEY.has(saved as IconKey)) return saved as IconKey;
  return defaultIconKeyFor(product, id);
}

function livingIconHTML(key: string | undefined) {
  const icon = iconFor(key);
  return `
    <div class="living-icon" style="background:${icon.bg}; color:${icon.color};">
      ${iconSvg(icon.key)}
    </div>
  `;
}

function iconOptionHTML(product: ProductTab, targetId: string, selectedKey: IconKey, locked: boolean) {
  return ICON_OPTIONS.map(icon => `
    <button type="button" class="lb-icon-option ${icon.key === selectedKey ? 'is-active' : ''}" data-lb-action="icon-select" data-product="${product}" data-target="${targetId}" data-icon="${icon.key}" title="${escapeHTML(icon.name)}" aria-label="${escapeHTML(icon.name)}" ${lockedAttr(locked)}>
      ${iconSvg(icon.key)}
    </button>
  `).join('');
}

function iconPickerHTML(product: ProductTab, targetId: string, locked: boolean) {
  const selectedKey = iconKeyFor(product, targetId);
  const selected = iconFor(selectedKey);
  return `
    <span class="lb-icon-picker">
      <button type="button" class="lb-icon-trigger" data-lb-action="icon-picker" data-product="${product}" data-target="${targetId}" title="${locked ? 'Gói Pro mới được chọn icon' : 'Chọn icon'}" aria-label="Chọn icon" style="background:${selected.bg}; color:${selected.color};" ${lockedAttr(locked)}>
        ${iconSvg(selected.key)}
      </button>
      <span class="lb-icon-menu" aria-label="Icon options">
        ${iconOptionHTML(product, targetId, selectedKey, locked)}
      </span>
    </span>
  `;
}

function closeIconMenus(except?: Element | null) {
  document.querySelectorAll('.lb-icon-picker.is-open').forEach(picker => {
    if (except && picker === except) return;
    picker.classList.remove('is-open');
  });
}

function toggleIconMenu(btn: HTMLElement) {
  const picker = btn.closest('.lb-icon-picker');
  if (!picker) return;
  const shouldOpen = !picker.classList.contains('is-open');
  closeIconMenus(picker);
  picker.classList.toggle('is-open', shouldOpen);
}

function canManageLivingBenefits() {
  return canUseEntitlement('benefit_editor');
}

function lockedAttr(locked: boolean) {
  return locked ? 'disabled aria-disabled="true"' : '';
}

function syncLivingBenefitActionLocks() {
  const locked = !canManageLivingBenefits();
  document.querySelectorAll<HTMLButtonElement>('.lb-column-action[data-lb-action]').forEach(button => {
    const action = button.dataset.lbAction || '';
    if (!PRO_ONLY_ACTIONS.has(action)) return;
    button.disabled = locked;
    button.setAttribute('aria-disabled', String(locked));
    button.title = locked ? 'Gói Pro mới được quản lý Quyền Lợi 2' : '';
  });
}

export function setLivingBenefitIcon(product: ProductTab, targetId: string, iconKey: string, options: { save?: boolean } = {}) {
  const icon = iconFor(iconKey);
  const card = ensureLivingBenefitCard(product, targetId);
  card.dataset.lbIcon = icon.key;

  const target = card.querySelector('.living-icon') as HTMLElement | null;
  if (target) {
    target.innerHTML = iconSvg(icon.key);
    target.style.background = icon.bg;
    target.style.color = icon.color;
  }

  if (options.save ?? true) scheduleSaveCallback();
}

function cleanText(value: string | null | undefined) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cleanVi(value: string | null | undefined) {
  return cleanText(value).replace(/^\(+\s*/, '').replace(/\s*\)+$/, '').trim();
}

function extractTitlePair(el: Element, fallback?: BenefitPair): BenefitPair {
  const viEl = el.querySelector('.vi, .vi-label');
  if (viEl) {
    const clone = el.cloneNode(true) as Element;
    clone.querySelectorAll('.vi, .vi-label').forEach(node => node.remove());
    return {
      en: cleanText(clone.textContent),
      vi: cleanVi(viEl.textContent),
    };
  }

  const full = cleanText(el.textContent);
  const parenthesized = full.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (parenthesized) {
    return {
      en: cleanText(parenthesized[1]) || fallback?.en || '',
      vi: cleanVi(parenthesized[2]) || fallback?.vi || '',
    };
  }

  return {
    en: full || fallback?.en || '',
    vi: fallback?.vi || '',
  };
}

function titlePairFor(product: ProductTab, id: string): BenefitPair {
  const fallback = defaultBenefitById(product, id) || { id, en: 'New Benefit', vi: 'Quyền lợi mới' };
  const title = $(id)?.querySelector('.living-title');
  if (!title) return { en: fallback.en, vi: fallback.vi };
  return extractTitlePair(title, fallback);
}

function titleHtml(pair: BenefitPair, viClass: 'vi' | 'vi-label') {
  const en = pair.en || '';
  const vi = pair.vi || '';
  const spacer = en ? ' ' : '';
  return `${escapeHTML(en)}${spacer}<span class="${viClass}">(${escapeHTML(vi)})</span>`;
}

function createCardFromHTML(html: string) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild as HTMLElement | null;
}

function genericLivingBenefitCard(product: ProductTab, id: string) {
  const meta = defaultBenefitById(product, id) || { id, en: 'New Benefit', vi: 'Quyền lợi mới' };
  const card = document.createElement('div');
  card.className = 'living-card';
  card.id = id;
  card.dataset.lbIcon = defaultIconKeyFor(product, id);
  if (!isDefaultBenefitId(product, id)) card.dataset.customLivingBenefit = 'true';
  card.innerHTML = `
    <div class="living-head">
      ${livingIconHTML(defaultIconKeyFor(product, id))}
      <div class="living-title" contenteditable="true" spellcheck="false">
        ${titleHtml({ en: meta.en, vi: meta.vi }, 'vi')}
      </div>
    </div>
    <ul class="living-list" contenteditable="true" spellcheck="false">
      <li>Tiếng Anh <span class="vi">(Tiếng Việt)</span></li>
    </ul>
  `;
  return card;
}

export function ensureLivingBenefitCard(product: ProductTab, id: string) {
  let card = $(id) as HTMLElement | null;
  if (card) return card;

  card = DEFAULT_CARD_TEMPLATES.has(id)
    ? createCardFromHTML(DEFAULT_CARD_TEMPLATES.get(id) || '')
    : genericLivingBenefitCard(product, id);

  if (!card) card = genericLivingBenefitCard(product, id);
  card.classList.remove('lb-hidden');

  const grid = gridFor(product);
  if (grid) grid.appendChild(card);
  return card;
}

export function ensureLivingBenefitCardsFromColumns(product: ProductTab) {
  normalizeLivingBenefitColumns(product)
    .flat()
    .forEach(id => ensureLivingBenefitCard(product, id));
}

export function getLivingBenefitCardIds(product: ProductTab) {
  const root = $(productRootId(product));
  if (!root) return [];
  return Array.from(root.querySelectorAll('.living-card[id]'))
    .map((card: any) => card.id)
    .filter((id): id is string => isValidBenefitId(product, id));
}

export function normalizeLivingBenefitColumns(product: ProductTab) {
  if (!state.livingBenefitColumns) {
    state.livingBenefitColumns = {
      iul: cloneColumns(DEFAULT_LIVING_BENEFIT_COLUMNS.iul),
      term: cloneColumns(DEFAULT_LIVING_BENEFIT_COLUMNS.term),
    };
  }

  const raw = Array.isArray(state.livingBenefitColumns[product])
    ? state.livingBenefitColumns[product]
    : cloneColumns(DEFAULT_LIVING_BENEFIT_COLUMNS[product]);

  const seen = new Set<string>();
  const normalized = raw.map(col => {
    if (!Array.isArray(col)) return [];
    return col.filter(id => {
      if (!isValidBenefitId(product, id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  });

  if (normalized.length === 0) normalized.push([]);
  state.livingBenefitColumns[product] = normalized;
  return normalized;
}

export function applyLivingBenefitColumnLayout(product: ProductTab) {
  const grid = gridFor(product);
  if (!grid) return;

  const cols = normalizeLivingBenefitColumns(product);
  cols.flat().forEach(id => ensureLivingBenefitCard(product, id));

  const cards = new Map<string, HTMLElement>();
  grid.querySelectorAll('.living-card[id]').forEach((card: any) => {
    cards.set(card.id, card);
  });

  grid.textContent = '';
  grid.style.setProperty('--living-cols', String(Math.max(1, cols.length)));

  cols.forEach((ids, idx) => {
    const col = document.createElement('div');
    col.className = 'living-column';
    col.dataset.lbColumn = String(idx);
    ids.forEach(id => {
      const card = cards.get(id) || ensureLivingBenefitCard(product, id);
      if (card) col.appendChild(card);
    });
    grid.appendChild(col);
  });
}

export function applyLivingBenefitColumnLayouts() {
  applyLivingBenefitColumnLayout('iul');
  applyLivingBenefitColumnLayout('term');
}

function syncToggleButton(btn: HTMLElement, targetId: string) {
  const card = $(targetId);
  if (!card) return;
  const hidden = card.classList.contains('lb-hidden');
  btn.textContent = hidden ? 'Ẩn ✓' : 'Hiện';
  btn.classList.toggle('is-hidden', hidden);
  btn.title = hidden ? 'Click để hiện lại' : 'Click để ẩn khi xuất file';
}

function syncEditorTitleLabel(product: ProductTab, targetId: string) {
  const html = titleHtml(titlePairFor(product, targetId), 'vi-label');
  document.querySelectorAll('.lb-toggle-label[data-target]').forEach(label => {
    const item = label as HTMLElement;
    if (item.dataset.product === product && item.dataset.target === targetId) {
      if (document.activeElement === item) return;
      item.innerHTML = html;
    }
  });
}

function syncPreviewTitleFromEditor(label: HTMLElement) {
  const product = label.dataset.product as ProductTab | undefined;
  const targetId = label.dataset.target;
  if ((product !== 'iul' && product !== 'term') || !targetId) return;

  const title = $(targetId)?.querySelector('.living-title') as HTMLElement | null;
  if (!title) return;
  title.innerHTML = titleHtml(extractTitlePair(label, titlePairFor(product, targetId)), 'vi');
}

function renderColumnEditor(product: ProductTab) {
  const host = $(`${product}LbColumnEditor`);
  if (!host) return;

  const cols = normalizeLivingBenefitColumns(product);
  const locked = !canManageLivingBenefits();
  host.innerHTML = '';
  host.style.setProperty('--lb-editor-cols', String(Math.min(Math.max(cols.length, 1), 2)));
  host.classList.toggle('is-locked', locked);

  cols.forEach((ids, idx) => {
    const col = document.createElement('div');
    col.className = 'lb-column-panel';
    col.dataset.columnIndex = String(idx);

    const canDelete = cols.length > 1;
    col.innerHTML = `
      <div class="lb-column-head">
        <span>Cột ${idx + 1}</span>
        <span class="lb-column-head-actions">
          <button type="button" class="lb-column-add" data-lb-action="add-item" data-product="${product}" data-column="${idx}" ${lockedAttr(locked)} title="${locked ? 'Gói Pro mới được thêm item' : 'Thêm item'}">+</button>
          <button type="button" class="lb-column-delete" data-lb-action="delete-column" data-product="${product}" data-column="${idx}" ${canDelete && !locked ? '' : 'disabled'} aria-disabled="${String(locked || !canDelete)}" title="${locked ? 'Gói Pro mới được xoá cột' : 'Xoá cột'}">×</button>
        </span>
      </div>
      <div class="lb-column-body"></div>
    `;

    const body = col.querySelector('.lb-column-body') as HTMLElement;
    if (ids.length === 0) {
      body.innerHTML = '<div class="lb-column-empty">Trống</div>';
    }

    ids.forEach((id, itemIdx) => {
      ensureLivingBenefitCard(product, id);

      const row = document.createElement('div');
      row.className = 'lb-toggle-row';
      row.innerHTML = `
        <span class="lb-row-title">
          ${iconPickerHTML(product, id, locked)}
          <span class="lb-toggle-label" contenteditable="${locked ? 'false' : 'true'}" spellcheck="false" data-lb-title-editor="true" data-product="${product}" data-target="${id}">${titleHtml(titlePairFor(product, id), 'vi-label')}</span>
        </span>
        <span class="lb-row-actions">
          <button type="button" class="lb-move-btn" data-lb-action="sort" data-product="${product}" data-target="${id}" data-dir="-1" ${locked || itemIdx === 0 ? 'disabled' : ''} aria-disabled="${String(locked || itemIdx === 0)}" title="${locked ? 'Gói Pro mới được sort item' : 'Đưa lên trong cùng cột'}">↑</button>
          <button type="button" class="lb-move-btn" data-lb-action="sort" data-product="${product}" data-target="${id}" data-dir="1" ${locked || itemIdx === ids.length - 1 ? 'disabled' : ''} aria-disabled="${String(locked || itemIdx === ids.length - 1)}" title="${locked ? 'Gói Pro mới được sort item' : 'Đưa xuống trong cùng cột'}">↓</button>
          <button type="button" class="lb-move-btn" data-lb-action="move" data-product="${product}" data-target="${id}" data-dir="-1" ${locked || idx === 0 ? 'disabled' : ''} aria-disabled="${String(locked || idx === 0)}" title="${locked ? 'Gói Pro mới được chuyển item giữa các cột' : 'Chuyển sang cột trái'}">‹</button>
          <button type="button" class="lb-move-btn" data-lb-action="move" data-product="${product}" data-target="${id}" data-dir="1" ${locked || idx === cols.length - 1 ? 'disabled' : ''} aria-disabled="${String(locked || idx === cols.length - 1)}" title="${locked ? 'Gói Pro mới được chuyển item giữa các cột' : 'Chuyển sang cột phải'}">›</button>
          <button type="button" class="lb-toggle-btn" data-lb-action="toggle" data-target="${id}" ${lockedAttr(locked)} title="${locked ? 'Gói Pro mới được ẩn/hiện item' : 'Ẩn/hiện item'}">Hiện</button>
          <button type="button" class="lb-item-delete" data-lb-action="delete-item" data-product="${product}" data-target="${id}" ${lockedAttr(locked)} title="${locked ? 'Gói Pro mới được xoá item' : 'Xoá item'}">×</button>
        </span>
      `;
      body.appendChild(row);
      syncToggleButton(row.querySelector('.lb-toggle-btn') as HTMLElement, id);
    });

    host.appendChild(col);
  });
}

export function renderLivingBenefitColumnEditors() {
  renderColumnEditor('iul');
  renderColumnEditor('term');
}

export function syncLivingBenefitColumnUI(product?: ProductTab) {
  syncLivingBenefitActionLocks();
  if (product) {
    applyLivingBenefitColumnLayout(product);
    renderColumnEditor(product);
    return;
  }

  applyLivingBenefitColumnLayouts();
  renderLivingBenefitColumnEditors();
}

function refresh(product?: ProductTab) {
  syncLivingBenefitColumnUI(product);
  scheduleSaveCallback();
}

function addColumn(product: ProductTab) {
  normalizeLivingBenefitColumns(product).push([]);
  refresh(product);
}

function deleteColumn(product: ProductTab, columnIndex: number) {
  const cols = normalizeLivingBenefitColumns(product);
  if (cols.length <= 1 || columnIndex < 0 || columnIndex >= cols.length) return;
  const removed = cols.splice(columnIndex, 1)[0] || [];
  if (removed.length > 0) {
    const targetIndex = Math.max(0, columnIndex - 1);
    cols[targetIndex].push(...removed);
  }
  refresh(product);
}

function resetBenefitCards(product: ProductTab) {
  const defaultIds = new Set(DEFAULT_BENEFIT_IDS[product]);
  getLivingBenefitCardIds(product).forEach(id => {
    if (!defaultIds.has(id)) $(id)?.remove();
  });
  DEFAULT_BENEFIT_IDS[product].forEach(id => ensureLivingBenefitCard(product, id));
}

function resetColumns(product: ProductTab) {
  resetBenefitCards(product);
  state.livingBenefitColumns[product] = cloneColumns(DEFAULT_LIVING_BENEFIT_COLUMNS[product]);
  refresh(product);
}

export function resetLivingBenefitEditorDefaults(options: { save?: boolean } = {}) {
  resetBenefitCards('iul');
  resetBenefitCards('term');
  state.livingBenefitColumns = {
    iul: cloneColumns(DEFAULT_LIVING_BENEFIT_COLUMNS.iul),
    term: cloneColumns(DEFAULT_LIVING_BENEFIT_COLUMNS.term),
  };
  document.querySelectorAll('#cardOut .living-card[id].lb-hidden, #cardOutTerm .living-card[id].lb-hidden').forEach(card => {
    card.classList.remove('lb-hidden');
  });
  syncLivingBenefitColumnUI();
  if (options.save ?? false) scheduleSaveCallback();
}

export function sanitizeLivingBenefitEditorForExport(allowed: boolean) {
  if (allowed) {
    syncLivingBenefitColumnUI();
    return;
  }
  resetLivingBenefitEditorDefaults({ save: false });
}

function createCustomBenefit(product: ProductTab) {
  let id = '';
  do {
    id = `${productPrefix(product)}custom_${Date.now().toString(36)}_${customSeq++}`;
  } while ($(id));
  return ensureLivingBenefitCard(product, id);
}

function addBenefit(product: ProductTab, columnIndex: number) {
  const cols = normalizeLivingBenefitColumns(product);
  if (columnIndex < 0 || columnIndex >= cols.length) return;
  const card = createCustomBenefit(product);
  cols[columnIndex].push(card.id);
  refresh(product);
}

function deleteBenefit(product: ProductTab, targetId: string) {
  const cols = normalizeLivingBenefitColumns(product);
  cols.forEach((col, idx) => {
    cols[idx] = col.filter(id => id !== targetId);
  });
  $(targetId)?.remove();
  refresh(product);
}

function moveBenefit(product: ProductTab, targetId: string, dir: number) {
  const cols = normalizeLivingBenefitColumns(product);
  const fromIndex = cols.findIndex(col => col.includes(targetId));
  if (fromIndex < 0) return;

  const toIndex = fromIndex + dir;
  if (toIndex < 0 || toIndex >= cols.length) return;

  cols[fromIndex] = cols[fromIndex].filter(id => id !== targetId);
  cols[toIndex].push(targetId);
  refresh(product);
}

function sortBenefit(product: ProductTab, targetId: string, dir: number) {
  const cols = normalizeLivingBenefitColumns(product);
  const col = cols.find(items => items.includes(targetId));
  if (!col) return;

  const fromIndex = col.indexOf(targetId);
  const toIndex = fromIndex + dir;
  if (fromIndex < 0 || toIndex < 0 || toIndex >= col.length) return;

  const [item] = col.splice(fromIndex, 1);
  col.splice(toIndex, 0, item);
  refresh(product);
}

function toggleBenefit(targetId: string) {
  const card = $(targetId);
  if (!card) return;
  card.classList.toggle('lb-hidden');
  syncLivingBenefitColumnUI();
  scheduleSaveCallback();
}

function productForLivingCard(card: HTMLElement): ProductTab | null {
  if (card.id.startsWith(productPrefix('iul'))) return 'iul';
  if (card.id.startsWith(productPrefix('term'))) return 'term';
  return null;
}

let isBound = false;
export function bindLivingBenefitColumnEditors() {
  syncLivingBenefitColumnUI();

  if (isBound) return;
  isBound = true;

  document.addEventListener('click', async (event) => {
    const btn = (event.target as Element).closest('[data-lb-action]') as HTMLElement | null;
    if (!btn) {
      closeIconMenus();
      return;
    }

    const product = btn.dataset.product as ProductTab | undefined;
    const action = btn.dataset.lbAction;

    if (PRO_ONLY_ACTIONS.has(String(action))) {
      try {
        await authorizeFeatureUse('benefit_editor', 'Benefit Editor');
      } catch (error) {
        closeIconMenus();
        return;
      }
      if (!canManageLivingBenefits()) {
        closeIconMenus();
        return;
      }
    }

    if (action === 'toggle' && btn.dataset.target) {
      closeIconMenus();
      toggleBenefit(btn.dataset.target);
      return;
    }

    if (product !== 'iul' && product !== 'term') return;

    if (action === 'icon-picker') {
      toggleIconMenu(btn);
      return;
    }
    if (action === 'icon-select' && btn.dataset.target && btn.dataset.icon) {
      setLivingBenefitIcon(product, btn.dataset.target, btn.dataset.icon);
      renderColumnEditor(product);
      return;
    }

    closeIconMenus();
    if (action === 'add-column') addColumn(product);
    if (action === 'delete-column') deleteColumn(product, parseInt(btn.dataset.column || '-1', 10));
    if (action === 'reset-columns') resetColumns(product);
    if (action === 'add-item') addBenefit(product, parseInt(btn.dataset.column || '-1', 10));
    if (action === 'delete-item' && btn.dataset.target) deleteBenefit(product, btn.dataset.target);
    if (action === 'move' && btn.dataset.target) {
      moveBenefit(product, btn.dataset.target, parseInt(btn.dataset.dir || '0', 10));
    }
    if (action === 'sort' && btn.dataset.target) {
      sortBenefit(product, btn.dataset.target, parseInt(btn.dataset.dir || '0', 10));
    }
  });

  document.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Escape') closeIconMenus();

    const target = event.target as Element | null;
    const editorTitle = target?.closest('[data-lb-title-editor]') as HTMLElement | null;
    if (!editorTitle) return;
    if (!canManageLivingBenefits()) {
      event.preventDefault();
      editorTitle.blur();
      return;
    }
    if ((event as KeyboardEvent).key !== 'Enter') return;
    event.preventDefault();
    editorTitle.blur();
  });

  document.addEventListener('input', (event) => {
    const target = event.target as Element | null;
    const editorTitle = target?.closest('[data-lb-title-editor]') as HTMLElement | null;
    if (editorTitle) {
      if (!canManageLivingBenefits()) {
        const product = editorTitle.dataset.product as ProductTab | undefined;
        const targetId = editorTitle.dataset.target;
        if ((product === 'iul' || product === 'term') && targetId) syncEditorTitleLabel(product, targetId);
        return;
      }
      syncPreviewTitleFromEditor(editorTitle);
      scheduleSaveCallback();
      return;
    }

    const title = target?.closest('.living-title') as HTMLElement | null;
    const card = title?.closest('.living-card[id]') as HTMLElement | null;
    if (!card) return;
    const product = productForLivingCard(card);
    if (!product) return;
    syncEditorTitleLabel(product, card.id);
  });

  document.addEventListener('blur', (event) => {
    const target = event.target as Element | null;
    const editorTitle = target?.closest('[data-lb-title-editor]') as HTMLElement | null;
    if (editorTitle) {
      const product = editorTitle.dataset.product as ProductTab | undefined;
      const targetId = editorTitle.dataset.target;
      if (!canManageLivingBenefits()) {
        if ((product === 'iul' || product === 'term') && targetId) syncEditorTitleLabel(product, targetId);
        return;
      }
      syncPreviewTitleFromEditor(editorTitle);
      if ((product === 'iul' || product === 'term') && targetId) {
        editorTitle.innerHTML = titleHtml(titlePairFor(product, targetId), 'vi-label');
      }
      scheduleSaveCallback();
      return;
    }

    const title = target?.closest('.living-title') as HTMLElement | null;
    const card = title?.closest('.living-card[id]') as HTMLElement | null;
    if (!card) return;
    const product = productForLivingCard(card);
    if (!product) return;
    window.setTimeout(() => syncEditorTitleLabel(product, card.id), 0);
  }, true);

  window.addEventListener('manle:account-rendered', () => syncLivingBenefitColumnUI());
}
