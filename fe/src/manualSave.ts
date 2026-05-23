import { $ } from './core';
import { muiIconSvg } from './muiIcons';
import { saveState } from './persistence';

/* ===================== MANUAL SAVE BUTTON =====================
   Auto-save still runs in the background (debounced 300ms), but the
   user gets a clear visual control:
     - Idle:   neutral button "Save Changes"
     - Dirty:  pulsing gold button (there are unsaved edits)
     - Saved:  green "Saved" for 1.6s after click
   Also bound to Ctrl+S / Cmd+S inside the card area.
=============================================================== */
export function bindManualSaveButton() {
  const btn = $('saveBtn');
  if (!btn) return;
  const cards = [$('cardOut'), $('cardOutTerm')].filter(Boolean);
  let savedTimer: ReturnType<typeof setTimeout> | null = null;

  function markDirty() {
    btn.classList.remove('is-saved');
    btn.classList.add('is-dirty');
    btn.innerHTML = `${muiIconSvg('Save')} Unsaved Changes - Click to Save`;
  }

  function markSaved() {
    btn.classList.remove('is-dirty');
    btn.classList.add('is-saved');
    btn.innerHTML = `${muiIconSvg('CheckCircle')} Saved`;
    if (savedTimer) clearTimeout(savedTimer);
    savedTimer = setTimeout(() => {
      btn.classList.remove('is-saved');
      btn.innerHTML = `${muiIconSvg('Save')} Save Changes`;
    }, 1600);
  }

  function doSave() {
    saveState();
    markSaved();
  }

  // Any edit inside any card → mark dirty
  cards.forEach(c => c.addEventListener('input', markDirty));
  // Form-side inputs also count as edits worth highlighting
  document.querySelectorAll('.form-pane input, .form-pane select')
    .forEach(el => el.addEventListener('input', markDirty));

  btn.addEventListener('click', doSave);

  // Ctrl/Cmd + S → save (and prevent browser "Save Page As")
  document.addEventListener('keydown', (e) => {
    const isSave = (e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S');
    if (isSave) {
      e.preventDefault();
      doSave();
    }
  });
}
