import { escapeHTML } from './render';

type BenefitPair = {
  en: string;
  vi: string;
};

const titleBaselines = new WeakMap<Element, BenefitPair>();
const listBaselines = new WeakMap<Element, BenefitPair[]>();

function cleanText(value: string | null | undefined) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cleanVi(value: string | null | undefined) {
  return cleanText(value).replace(/^\(+\s*/, '').replace(/\s*\)+$/, '').trim();
}

function splitByKnownVi(text: string, fallback?: BenefitPair): BenefitPair | null {
  if (!fallback?.vi) return null;
  const lower = text.toLowerCase();
  const lowerVi = fallback.vi.toLowerCase();
  const idx = lower.lastIndexOf(lowerVi);
  if (idx < 0) return null;
  return {
    en: cleanText(text.slice(0, idx).replace(/\(+\s*$/, '').trim()),
    vi: fallback.vi,
  };
}

function extractPair(el: Element, fallback?: BenefitPair): BenefitPair {
  const viEl = el.querySelector('.vi');
  if (viEl) {
    const clone = el.cloneNode(true) as Element;
    clone.querySelectorAll('.vi').forEach(node => node.remove());
    return {
      en: cleanText(clone.textContent),
      vi: cleanVi(viEl.textContent),
    };
  }

  const full = cleanText(el.textContent);
  const parenthesized = full.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (parenthesized) {
    return {
      en: cleanText(parenthesized[1]),
      vi: cleanVi(parenthesized[2]),
    };
  }

  return splitByKnownVi(full, fallback) || { en: full, vi: '' };
}

function formatPair(current: BenefitPair) {
  const en = current.en || '';
  const vi = current.vi || '';
  const spacer = en ? ' ' : '';
  return {
    en,
    vi,
    html: `${escapeHTML(en)}${spacer}<span class="vi">(${escapeHTML(vi)})</span>`,
  };
}

function isEmptyPair(pair: BenefitPair) {
  return !cleanText(pair.en) && !cleanVi(pair.vi);
}

function hasValidPairMarkup(el: Element) {
  const viEl = el.querySelector('.vi');
  if (!viEl) return false;
  const rawVi = cleanText(viEl.textContent);
  return /^\(.*\)$/.test(rawVi);
}

function livingTitles() {
  return Array.from(document.querySelectorAll('#cardOut .living-title, #cardOutTerm .living-title'));
}

function livingLists() {
  return Array.from(document.querySelectorAll('#cardOut .living-list, #cardOutTerm .living-list'));
}

export function captureLivingBenefitBaselines() {
  livingTitles().forEach(title => {
    if (!titleBaselines.has(title)) {
      const pair = extractPair(title);
      titleBaselines.set(title, {
        en: pair.en,
        vi: pair.vi,
      });
    }
  });

  livingLists().forEach(list => {
    if (!listBaselines.has(list)) {
      const items = Array.from(list.querySelectorAll('li')).map(li => {
        const pair = extractPair(li as any);
        return {
          en: pair.en,
          vi: pair.vi,
        };
      });
      listBaselines.set(list, items);
    }
  });
}

function repairTitle(title: Element) {
  if (hasValidPairMarkup(title)) return;
  const fallback = titleBaselines.get(title);
  const fixed = formatPair(extractPair(title, fallback));
  title.innerHTML = fixed.html;
}

function repairList(list: Element) {
  const baseline = listBaselines.get(list) || [];
  const currentItems = Array.from(list.querySelectorAll('li'));
  const hasEmptyItems = currentItems.some(item => isEmptyPair(extractPair(item as any)));
  const hasEmptyExtraItems =
    currentItems.length > baseline.length &&
    currentItems.slice(baseline.length).some(item => isEmptyPair(extractPair(item as any)));
  const needsRepair =
    currentItems.length < baseline.length ||
    hasEmptyItems ||
    hasEmptyExtraItems ||
    currentItems.some(item => !hasValidPairMarkup(item as any));
  if (!needsRepair) return;

  const count = Math.max(currentItems.length, baseline.length);
  const repaired: string[] = [];

  for (let i = 0; i < count; i++) {
    const fallback = baseline[i];
    const current = currentItems[i] ? extractPair(currentItems[i] as any, fallback) : { en: '', vi: '' };
    if (isEmptyPair(current)) continue;
    const fixed = formatPair(current);
    repaired.push(`<li>${fixed.html}</li>`);
  }

  list.innerHTML = repaired.join('');
}

function selectTextNode(node: Text, start: number, end: number) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  selection.removeAllRanges();
  selection.addRange(range);
}

function formatEmptyDraftItem(li: HTMLLIElement) {
  const pair = extractPair(li as any);
  if (!isEmptyPair(pair)) return false;

  const enNode = document.createTextNode('Tiếng Anh ');
  const viNode = document.createElement('span');
  viNode.className = 'vi';
  viNode.textContent = '(Tiếng Việt)';
  li.replaceChildren(enNode, viNode);
  selectTextNode(enNode, 0, 'Tiếng Anh'.length);
  return true;
}

function formatNewListItemAfterEnter(list: Element, scheduleSave: () => void) {
  window.setTimeout(() => {
    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    const anchorEl = anchor instanceof Element ? anchor : anchor?.parentElement;
    const li = anchorEl?.closest('li') as HTMLLIElement | null;
    if (!li || !list.contains(li as any)) return;
    if (formatEmptyDraftItem(li)) scheduleSave();
  }, 0);
}

export function repairAllLivingBenefitFormats() {
  captureLivingBenefitBaselines();
  livingTitles().forEach(repairTitle);
  livingLists().forEach(repairList);
}

let guardsBound = false;

export function bindLivingBenefitFormatGuards(scheduleSave: () => void) {
  if (guardsBound) return;
  guardsBound = true;

  const repairAndSave = (target: Element) => {
    if (target.classList.contains('living-title')) repairTitle(target);
    if (target.classList.contains('living-list')) repairList(target);
    scheduleSave();
  };

  document.addEventListener('keydown', event => {
    const target = event.target as Element | null;
    const list = target?.closest('.living-list');
    if (!list) return;
    if ((event as KeyboardEvent).key === 'Enter' && !(event as KeyboardEvent).shiftKey) {
      formatNewListItemAfterEnter(list, scheduleSave);
    }
  });

  document.addEventListener('blur', event => {
    const target = event.target as Element | null;
    if (!target?.classList.contains('living-title') && !target?.classList.contains('living-list')) return;
    repairAndSave(target);
  }, true);
}
