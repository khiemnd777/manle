import { $ } from './core';
import { authorizeFeatureUse, canUseEntitlement } from './account';
import { refreshCustomDropdowns } from './customDropdown';

let scheduleSaveCallback = () => {};
export function setStyleSaveScheduler(fn: () => void) {
  scheduleSaveCallback = fn;
}

/* ===================== STYLE EDITOR =====================
   Apply màu sắc, font, zoom trực tiếp vào CSS custom properties
   của từng card thông qua một <style> tag động.
   =============================================================== */
export const SE_DEFAULTS = {
  se_font:        "'Inter', system-ui, sans-serif",
  se_zoom:        '100',
  se_headerBg:    '#1d1548',
  se_titleColor:  '#f5b840',
  se_bannerBg:    '#1d1548',
  se_bannerLabel: '#4dc4d9',
  se_gold:        '#f5b840',
  se_badgeL:      '#5b3fcc',
  se_badgeR:      '#8161e8',
  se_teal:        '#2d6052',
  se_lcBg:        '#f4f4f6',
  se_lcBorder:    '#e0e0e8',
  se_iconBg:      '#ede9ff',
  se_iconColor:   '#5b3fcc',
  se_lcTitle:     '#0f0c30',
  se_lcSubtitle:  '#5b3fcc',
  se_footerBg:    '#1d1548',
  se_agentColor:  '#f5b840',
};

function clearStyleOverrides() {
  document.getElementById('_se_style')?.remove();
}

function canApplyCustomStyles() {
  return canUseEntitlement('style_editor');
}

function commitStyleChange() {
  if (!canApplyCustomStyles()) {
    clearStyleOverrides();
    return;
  }
  applyStyles();
  scheduleSaveCallback();
}

export function applyStyles() {
  if (!canApplyCustomStyles()) {
    clearStyleOverrides();
    return;
  }

  const v = id => $(id) ? $(id).value : SE_DEFAULTS[id];
  const zoom = parseFloat(v('se_zoom')) / 100;
  const font = v('se_font');

  // Inject into a dedicated <style> tag
  let styleTag = document.getElementById('_se_style');
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = '_se_style';
    document.head.appendChild(styleTag);
  }

  styleTag.textContent = `
    .card {
      font-family: ${font} !important;
      transform: scale(${zoom});
      transform-origin: top center;
    }
    .card-header { background: ${v('se_headerBg')} !important; }
    .card-title  { color: ${v('se_titleColor')} !important; }
    .client-banner { background: ${v('se_bannerBg')} !important; }
    .cb-cell .lbl { color: ${v('se_bannerLabel')} !important; }
    .cb-cell .val.gold { color: ${v('se_gold')} !important; }
    .benefit-badge { background: linear-gradient(90deg, ${v('se_badgeL')} 0%, ${v('se_badgeR')} 100%) !important; }
    .benefit3-box, .benefit1-box { background: ${v('se_teal')} !important; }
    .living-card { background: ${v('se_lcBg')} !important; border-color: ${v('se_lcBorder')} !important; }
    .living-icon { background: ${v('se_iconBg')} !important; color: ${v('se_iconColor')} !important; }
    .living-title { color: ${v('se_lcTitle')} !important; }
    .living-title .vi { color: ${v('se_lcSubtitle')} !important; }
    .card-footer { background: ${v('se_footerBg')} !important; }
    .footer-col-agent .agent-line { color: ${v('se_agentColor')} !important; }
    .footer-col-office .office-name { color: ${v('se_agentColor')} !important; }
  `;
}

export function bindStyleEditor() {
  // Toggle open/close
  $('styleEditorToggle').addEventListener('click', () => {
    const editor = $('styleEditor');
    const shouldOpen = !editor.classList.contains('open');
    if (!shouldOpen) {
      editor.classList.remove('open');
      return;
    }

    authorizeFeatureUse('style_editor', 'Style Editor')
      .then(() => {
        editor.classList.add('open');
        applyStyles();
      })
      .catch(error => {
        editor.classList.remove('open');
        alert((error as Error).message || error);
      });
  });

  // Helper: sync color picker ↔ hex input
  const bindColorPair = (colorId, hexId) => {
    const colorEl = $(colorId);
    const hexEl   = $(hexId);
    if (!colorEl || !hexEl) return;

    colorEl.addEventListener('input', () => {
      hexEl.value = colorEl.value.toUpperCase();
      commitStyleChange();
    });
    hexEl.addEventListener('input', () => {
      const v = hexEl.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        colorEl.value = v;
        commitStyleChange();
      }
    });
    hexEl.addEventListener('blur', () => {
      // normalize on blur
      const v = hexEl.value.trim().replace(/^#?/, '#').toUpperCase();
      hexEl.value = v;
    });
  };

  // Bind all color pairs
  [
    ['se_headerBg',    'se_headerBg_hex'],
    ['se_titleColor',  'se_titleColor_hex'],
    ['se_bannerBg',    'se_bannerBg_hex'],
    ['se_bannerLabel', 'se_bannerLabel_hex'],
    ['se_gold',        'se_gold_hex'],
    ['se_badgeL',      'se_badgeL_hex'],
    ['se_badgeR',      'se_badgeR_hex'],
    ['se_teal',        'se_teal_hex'],
    ['se_lcBg',        'se_lcBg_hex'],
    ['se_lcBorder',    'se_lcBorder_hex'],
    ['se_iconBg',      'se_iconBg_hex'],
    ['se_iconColor',   'se_iconColor_hex'],
    ['se_lcTitle',     'se_lcTitle_hex'],
    ['se_lcSubtitle',  'se_lcSubtitle_hex'],
    ['se_footerBg',    'se_footerBg_hex'],
    ['se_agentColor',  'se_agentColor_hex'],
  ].forEach(([c, h]) => bindColorPair(c, h));

  // Font select
  $('se_font').addEventListener('change', commitStyleChange);

  // Zoom slider
  $('se_zoom').addEventListener('input', () => {
    $('se_zoom_val').textContent = $('se_zoom').value + '%';
    commitStyleChange();
  });

  // Reset button
  $('se_resetBtn').addEventListener('click', () => {
    Object.entries(SE_DEFAULTS).forEach(([id, val]) => {
      const el = $(id);
      if (!el) return;
      el.value = val;
      // Sync hex inputs
      const hexEl = $(id + '_hex');
      if (hexEl) hexEl.value = val.toUpperCase();
    });
    $('se_zoom_val').textContent = '100%';
    refreshCustomDropdowns();
    commitStyleChange();
  });

  window.addEventListener('manle:account-rendered', () => {
    if (canApplyCustomStyles()) {
      applyStyles();
    } else {
      clearStyleOverrides();
    }
  });

  // Apply on load
  applyStyles();
}

export function saveStyleState() {
  const out: any = {};
  Object.keys(SE_DEFAULTS).forEach(id => {
    const el = $(id);
    if (el) out[id] = el.value;
  });
  return out;
}

export function loadStyleState(saved: any) {
  if (!saved) return;
  Object.entries(saved).forEach(([id, val]) => {
    const el = $(id);
    if (!el) return;
    el.value = val;
    const hexEl = $(id + '_hex');
    if (hexEl) hexEl.value = String(val).toUpperCase();
  });
  const zoomEl = $('se_zoom');
  if (zoomEl && $('se_zoom_val')) $('se_zoom_val').textContent = zoomEl.value + '%';
  applyStyles();
}
