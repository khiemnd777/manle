import { $, CURRENCY_FIELD_IDS, formatCurrencyField, formatCurrencyFields, getCurrentAge, state } from './core';
import { refreshCustomDropdowns } from './customDropdown';
import { confirmAppDialog } from './dialog';
import { exportCardImage } from './exportCard';
import { bindLivingBenefitColumnEditors } from './livingBenefitColumns';
import { repairAllLivingBenefitFormats } from './livingBenefitFormat';
import { disableStatePersistence, saveState, STORAGE_KEY } from './persistence';
import { formatPhone, render, renderAgeList, renderAgentList, setTab } from './render';

/* ===================== EVENTS ===================== */
export function bindAll() {
  const ids = ['firstName','lastName','age','gender','state','riskClass',
               'faceAmount','monthlyPrem','premYears','rate','dragTune',
               'agentFirm','officeName','officePhone','officeWebsite',
               'termLength','termFaceAmount','termMonthlyPrem'];
  // Fields that, when manually changed, invalidate cached PDF values
  const policyFields = new Set(['faceAmount','monthlyPrem','premYears','rate','age','gender']);
  ids.forEach(id => {
    const el = $(id);
    if (!el) return;
    const isCurrencyField = CURRENCY_FIELD_IDS.includes(id as any);
    const isPhoneField = id === 'officePhone';
    const formatPhoneField = () => {
      if (!isPhoneField) return;
      el.value = formatPhone(el.value);
    };
    const handler = () => {
      // If user manually edits a policy parameter, drop the PDF cache —
      // the cached values were calibrated to the original PDF inputs
      if (policyFields.has(id) && state.actualCSV) {
        state.actualCSV = state.actualPVMap = state.actualDBMap = state.actualYearMap = null;
      }
      render();
    };
    el.addEventListener('input', () => {
      if (isCurrencyField) formatCurrencyField(id);
      formatPhoneField();
      handler();
    });
    el.addEventListener('change', () => {
      if (isCurrencyField) formatCurrencyField(id);
      formatPhoneField();
      handler();
    });
    if (isCurrencyField) {
      el.addEventListener('blur', () => {
        formatCurrencyField(id);
        render();
      });
    }
  });
  formatCurrencyFields();
  const officePhone = $('officePhone');
  if (officePhone) officePhone.value = formatPhone(officePhone.value);

  // Tab switcher buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  });

  $('addAge').addEventListener('click', () => {
    const last = state.ages[state.ages.length - 1] || (getCurrentAge() + 10);
    state.ages.push(Math.min(121, last + 10));
    renderAgeList();
    render();
  });

  $('cvAddBtn').addEventListener('click', () => {
    const last = state.ages[state.ages.length - 1] || (getCurrentAge() + 10);
    state.ages.push(Math.min(121, last + 10));
    renderAgeList();
    render();
  });

  $('addAgentBtn').addEventListener('click', () => {
    state.agents.push({ name: '', phone: '' });
    renderAgentList();
    render();
  });

  $('printBtn').addEventListener('click', () => exportCardImage('pdf'));
  $('pngBtn').addEventListener('click', () => exportCardImage('png'));
  $('jpgBtn').addEventListener('click', () => exportCardImage('jpg'));

  // Quick "New Client" — clears client/policy fields, keeps agent + rate.
  // Useful for processing multiple clients in a row without page reload.
  $('newClientBtn').addEventListener('click', async () => {
    if (!(await confirmAppDialog({
      title: 'Tạo client mới?',
      message: 'Sẽ xoá thông tin khách hàng và policy hiện tại, nhưng giữ lại agent, rate và nội dung quyền lợi.',
      confirmLabel: 'Tạo client mới',
      cancelLabel: 'Hủy',
      variant: 'warning',
    }))) return;
    // Reset client fields to defaults / empty
    $('firstName').value = '';
    $('lastName').value  = '';
    $('age').value       = 32;
    $('gender').value    = 'M';
    $('state').value     = '';
    $('riskClass').value = 'Preferred Elite';
    $('faceAmount').value  = 500000;
    $('monthlyPrem').value = 300;
    $('premYears').value   = 20;
    if ($('termLength'))      $('termLength').value = 30;
    if ($('termFaceAmount'))  $('termFaceAmount').value = 500000;
    if ($('termMonthlyPrem')) $('termMonthlyPrem').value = 300;
    formatCurrencyFields();
    refreshCustomDropdowns();
    // Drop any cached PDF projection values — we're starting fresh
    state.actualCSV = state.actualPVMap = state.actualDBMap = state.actualYearMap = null;
    state.ages = [42, 52, 62, 72];
    // Reset IUL upload zone visual state
    $('uploadZone').classList.remove('parsed');
    $('uploadDefault').style.display = 'block';
    $('uploadParsed').style.display  = 'none';
    $('uploadSuccess').classList.remove('show');
    $('uploadError').classList.remove('show');
    $('pdfInput').value = '';
    // Reset Term Life upload zone visual state
    if ($('uploadZoneTerm')) {
      $('uploadZoneTerm').classList.remove('parsed');
      $('uploadDefaultTerm').style.display = 'block';
      $('uploadParsedTerm').style.display  = 'none';
      $('uploadSuccessTerm').classList.remove('show');
      $('uploadErrorTerm').classList.remove('show');
      $('pdfInputTerm').value = '';
    }
    // Re-render everything and persist
    renderAgeList();
    render();
    repairAllLivingBenefitFormats();
    if (typeof saveState === 'function') saveState();
    // Focus first name so agent can start typing immediately
    $('firstName').focus();
  });

  $('resetBtn').addEventListener('click', async () => {
    if (!(await confirmAppDialog({
      title: 'Reset toàn bộ?',
      message: 'Toàn bộ dữ liệu form và bản ghi đã lưu sẽ được xoá, sau đó app tải lại về mặc định.',
      confirmLabel: 'Reset về mặc định',
      cancelLabel: 'Hủy',
      variant: 'danger',
    }))) return;
    disableStatePersistence();
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    location.reload();
  });

  bindLivingBenefitColumnEditors();
}
