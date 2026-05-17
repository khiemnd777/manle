import { $, formatCurrencyFields, state } from './core';
import { captureHeaderState, restoreHeaderState } from './headerEditor';
import { ensureLivingBenefitCardsFromColumns, setLivingBenefitIcon } from './livingBenefitColumns';
import { repairAllLivingBenefitFormats } from './livingBenefitFormat';
import { loadStyleState, saveStyleState } from './styleEditor';

/* ===================== AUTO-SAVE / LOAD STATE =====================
   On every render, persist the current form state to localStorage.
   On page load, restore the most-recent record so the user picks up
   right where they left off.
   =============================================================== */
export const STORAGE_KEY = '5ways_iul_v9_state';

function isEditingLivingBenefit() {
  const active = document.activeElement;
  return active instanceof Element && Boolean(active.closest('.living-title, .living-list'));
}

function cloneLivingBenefitColumns() {
  return {
    iul: (state.livingBenefitColumns?.iul || []).map((col: string[]) => [...col]),
    term: (state.livingBenefitColumns?.term || []).map((col: string[]) => [...col]),
  };
}

function captureHiddenLivingCards() {
  return Array.from(document.querySelectorAll('#cardOut .living-card[id].lb-hidden, #cardOutTerm .living-card[id].lb-hidden'))
    .map((card: any) => card.id);
}

export function saveState(options: { repair?: boolean } = {}) {
  try {
    const shouldRepair = options.repair ?? !isEditingLivingBenefit();
    if (shouldRepair) repairAllLivingBenefitFormats();
    const captureEditableHTML = (cardId, sel) => {
      const el = $(cardId)?.querySelector(sel);
      return el ? el.innerHTML : null;
    };
    const captureAll = (cardId, sel) => {
      const card = $(cardId);
      if (!card) return [];
      return Array.from(card.querySelectorAll(sel)).map((el: any) => el.innerHTML);
    };
    const captureLivingById = (cardId) => {
      const card = $(cardId);
      const out: any = {};
      if (!card) return out;
      card.querySelectorAll('.living-card[id]').forEach((livingCard: any) => {
        out[livingCard.id] = {
          title: livingCard.querySelector('.living-title')?.innerHTML || '',
          list: livingCard.querySelector('.living-list')?.innerHTML || '',
          icon: livingCard.dataset.lbIcon || '',
        };
      });
      return out;
    };
    const data = {
      ts: Date.now(),
      currentTab: state.currentTab,
      form: {
        firstName:        $('firstName').value,
        lastName:         $('lastName').value,
        age:              $('age').value,
        gender:           $('gender').value,
        state:            $('state').value,
        riskClass:        $('riskClass').value,
        faceAmount:       $('faceAmount').value,
        monthlyPrem:      $('monthlyPrem').value,
        premYears:        $('premYears').value,
        rate:             $('rate').value,
        dragTune:         $('dragTune').value,
        agentFirm:        $('agentFirm').value,
        termLength:       $('termLength')?.value,
        termFaceAmount:   $('termFaceAmount')?.value,
        termMonthlyPrem:  $('termMonthlyPrem')?.value
      },
      agents: state.agents,
      ages:   state.ages,
      header: captureHeaderState(),
      livingBenefitColumns: cloneLivingBenefitColumns(),
      // Editable text content from each card (so user-tweaked benefit
      // descriptions persist between sessions). Stored separately per
      // card because Term Life card has different editable sections.
      editable: {
        benefit1: captureEditableHTML('cardOut', '.benefit1-box'),
        benefit3: captureEditableHTML('cardOut', '.benefit3-desc'),
        livingById: captureLivingById('cardOut'),
        livingTitles: captureAll('cardOut', '.living-title'),
        livingLists:  captureAll('cardOut', '.living-list')
      },
      editableTerm: {
        // Term card's editable sections — Death Benefit description,
        // conversion note, and Living Benefits cards (different list)
        dbDesc:        captureEditableHTML('cardOutTerm', '.benefit3-desc'),
        conversion:    captureEditableHTML('cardOutTerm', '.conversion-note'),
        livingById:    captureLivingById('cardOutTerm'),
        livingTitles:  captureAll('cardOutTerm', '.living-title'),
        livingLists:   captureAll('cardOutTerm', '.living-list')
      },
      // Persist which living benefit cards are hidden
      hiddenCards: captureHiddenLivingCards(),
      styleSettings: (typeof saveStyleState === 'function') ? saveStyleState() : {}
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    // Quota or disabled — fail silently, app keeps working
    console.warn('saveState failed:', e);
  }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || !data.form) return false;

    // Restore tab choice
    if (data.currentTab === 'iul' || data.currentTab === 'term') {
      state.currentTab = data.currentTab;
    }

    // Restore form fields
    for (const [k, v] of Object.entries(data.form)) {
      const el = $(k);
      if (el && v != null) el.value = v;
    }
    formatCurrencyFields();
    // Restore agent + age arrays
    if (Array.isArray(data.agents) && data.agents.length > 0) state.agents = data.agents;
    if (Array.isArray(data.ages)   && data.ages.length   > 0) state.ages   = data.ages;
    restoreHeaderState(data.header);
    if (data.livingBenefitColumns && typeof data.livingBenefitColumns === 'object') {
      state.livingBenefitColumns = data.livingBenefitColumns;
      ensureLivingBenefitCardsFromColumns('iul');
      ensureLivingBenefitCardsFromColumns('term');
    }

    // Restore IUL card editable content
    if (data.editable) {
      const b1 = $('cardOut').querySelector('.benefit1-box');
      if (b1 && data.editable.benefit1) b1.innerHTML = data.editable.benefit1;
      const b3 = $('cardOut').querySelector('.benefit3-desc');
      if (b3 && data.editable.benefit3) b3.innerHTML = data.editable.benefit3;
      if (data.editable.livingById && typeof data.editable.livingById === 'object') {
        Object.entries(data.editable.livingById).forEach(([id, item]: any) => {
          const livingCard = $(id);
          if (!livingCard || !item) return;
          const title = livingCard.querySelector('.living-title');
          const list = livingCard.querySelector('.living-list');
          if (title && item.title) title.innerHTML = item.title;
          if (list && item.list) list.innerHTML = item.list;
          if (item.icon) setLivingBenefitIcon('iul', id, item.icon, { save: false });
        });
      } else {
        const titles = $('cardOut').querySelectorAll('.living-title');
        const lists  = $('cardOut').querySelectorAll('.living-list');
        (data.editable.livingTitles || []).forEach((html, i) => { if (titles[i] && html) titles[i].innerHTML = html; });
        (data.editable.livingLists  || []).forEach((html, i) => { if (lists[i]  && html) lists[i].innerHTML  = html; });
      }
    }

    // Restore Term Life card editable content
    if (data.editableTerm) {
      const tCard = $('cardOutTerm');
      if (tCard) {
        const desc = tCard.querySelector('.benefit3-desc');
        if (desc && data.editableTerm.dbDesc) desc.innerHTML = data.editableTerm.dbDesc;
        const conv = tCard.querySelector('.conversion-note');
        if (conv && data.editableTerm.conversion) conv.innerHTML = data.editableTerm.conversion;
        if (data.editableTerm.livingById && typeof data.editableTerm.livingById === 'object') {
          Object.entries(data.editableTerm.livingById).forEach(([id, item]: any) => {
            const livingCard = $(id);
            if (!livingCard || !item) return;
            const title = livingCard.querySelector('.living-title');
            const list = livingCard.querySelector('.living-list');
            if (title && item.title) title.innerHTML = item.title;
            if (list && item.list) list.innerHTML = item.list;
            if (item.icon) setLivingBenefitIcon('term', id, item.icon, { save: false });
          });
        } else {
          const titles = tCard.querySelectorAll('.living-title');
          const lists  = tCard.querySelectorAll('.living-list');
          (data.editableTerm.livingTitles || []).forEach((html, i) => { if (titles[i] && html) titles[i].innerHTML = html; });
          (data.editableTerm.livingLists  || []).forEach((html, i) => { if (lists[i]  && html) lists[i].innerHTML  = html; });
        }
      }
    }
    // Restore hidden living benefit cards
    if (Array.isArray(data.hiddenCards)) {
      data.hiddenCards.forEach(id => {
        const el = $(id);
        if (el) el.classList.add('lb-hidden');
      });
    }
    // Restore style settings (applied after bindStyleEditor() in init)
    if (data.styleSettings && typeof loadStyleState === 'function') {
      loadStyleState(data.styleSettings);
    }
    repairAllLivingBenefitFormats();
    return true;
  } catch (e) {
    console.warn('loadState failed:', e);
    return false;
  }
}

// Debounce so we don't slam localStorage on every keystroke
let _saveTimer: ReturnType<typeof setTimeout> | null = null;
export function scheduleSave() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveState, 300);
}
