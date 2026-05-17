import { $, fmtMoney, getCSV, getCurrentAge, parseMoney, state } from './core';

let scheduleSaveCallback = () => {};
export function setRenderSaveScheduler(fn: () => void) {
  scheduleSaveCallback = fn;
}

/* ===================== AGE LIST (sidebar) ===================== */
export function renderAgeList() {
  const wrap = $('ageList');
  wrap.innerHTML = '';
  state.ages.forEach((age, idx) => {
    const row = document.createElement('div');
    row.className = 'age-input-row';
    row.innerHTML = `
      <input type="number" min="${getCurrentAge()+1}" max="121" value="${age}" data-idx="${idx}" class="age-edit">
      <button type="button" class="remove" data-idx="${idx}" title="Xoá">×</button>
    `;
    wrap.appendChild(row);
  });
  wrap.querySelectorAll('.age-edit').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const idx = +e.target.dataset.idx;
      const v = parseInt(e.target.value, 10);
      if (!isNaN(v)) state.ages[idx] = v;
      render();
    });
  });
  wrap.querySelectorAll('.remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = +e.currentTarget.dataset.idx;
      if (state.ages.length <= 1) return;
      state.ages.splice(idx, 1);
      renderAgeList();
      render();
    });
  });
}

/* ===================== AGENT LIST (sidebar) ===================== */
export function escapeHTML(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Auto-format US phone numbers as the user types: "7279465464" → "(727) 946-5464"
// Strips non-digits, caps at 10 digits, formats progressively as digits arrive.
export function formatPhone(raw) {
  const digits = String(raw == null ? '' : raw).replace(/\D/g, '').slice(0, 10);
  if (digits.length === 0) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0,3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
}

export function renderAgentList() {
  const wrap = $('agentList');
  wrap.innerHTML = '';
  state.agents.forEach((ag, idx) => {
    // Normalize stored phone to formatted version on every render so it stays clean
    if (ag.phone) ag.phone = formatPhone(ag.phone);
    const row = document.createElement('div');
    row.className = 'agent-row';
    const canRemove = state.agents.length > 1;
    row.innerHTML = `
      <div class="fields">
        <input type="text"  data-idx="${idx}" data-key="name"  class="ag-edit" value="${escapeHTML(ag.name || '')}"  placeholder="Họ tên agent">
        <input type="tel"   data-idx="${idx}" data-key="phone" class="ag-edit" value="${escapeHTML(ag.phone || '')}" placeholder="(xxx) xxx-xxxx" inputmode="numeric" maxlength="14">
      </div>
      <button type="button" class="remove" data-idx="${idx}" title="Xoá agent" ${canRemove ? '' : 'disabled style="opacity:.3;cursor:not-allowed"'}>×</button>
    `;
    wrap.appendChild(row);
  });
  wrap.querySelectorAll('.ag-edit').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const idx = +e.target.dataset.idx;
      const key = e.target.dataset.key;
      if (state.agents[idx]) {
        let v = e.target.value;
        if (key === 'phone') {
          // Format as user types — keeps cursor at end which is fine for forward typing.
          // For backspace, the user just keeps deleting; format updates progressively.
          v = formatPhone(v);
          e.target.value = v;
        }
        state.agents[idx][key] = v;
        render();
      }
    });
  });
  wrap.querySelectorAll('.remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = +e.currentTarget.dataset.idx;
      if (state.agents.length <= 1) return;
      state.agents.splice(idx, 1);
      renderAgentList();
      render();
    });
  });
}

/* ===================== MAIN RENDER ===================== */
export function render() {
  const first = $('firstName').value.trim();
  const last  = $('lastName').value.trim();
  const age   = getCurrentAge();
  const gender = $('gender').value; // M or F
  const stateAbbr = $('state').value.trim();
  const risk = $('riskClass').value;
  const face = parseMoney($('faceAmount').value) || 0;
  const mPrem = parseMoney($('monthlyPrem').value) || 0;
  const yPrem = parseInt($('premYears').value, 10) || 0;
  const rate = parseFloat($('rate').value) || 7.80;
  const dragTune = parseFloat($('dragTune').value) || 1.0;
  const annualPrem = mPrem * 12;

  // Client banner
  const fullName = (first + ' ' + last).trim() || 'Client Name';
  $('cbName').textContent = fullName;
  $('cbAgeGender').textContent = `${age} / ${gender}`;
  $('cbPrem').textContent = fmtMoney(mPrem, true);
  $('cbState').textContent = stateAbbr || '—';
  $('cbFace').textContent = fmtMoney(face);
  $('cbPayYears').textContent = yPrem ? `${yPrem} yrs` : '—';

  // Risk class — set text + color-coded class so it pops at a glance
  const riskEl = $('cbRisk');
  riskEl.textContent = risk || '—';
  // Reset all risk variants, then apply the matching one
  riskEl.classList.remove('risk-best','risk-elite','risk-good','risk-warn','risk-caution');
  const rLower = (risk || '').toLowerCase();
  if (rLower === 'preferred plus')        riskEl.classList.add('risk-best');
  else if (rLower === 'preferred elite')  riskEl.classList.add('risk-elite');
  else if (rLower === 'preferred')        riskEl.classList.add('risk-good');
  else if (rLower === 'standard plus')    riskEl.classList.add('risk-warn');
  else if (rLower === 'standard')         riskEl.classList.add('risk-caution');

  // Benefit 3
  $('b3Amt').textContent = fmtMoney(face);
  $('b3State').textContent = stateAbbr || '—';

  // Cash value table
  $('cvRate').textContent = `${rate.toFixed(2)}%`;
  const ages = state.ages.filter(a => a > age && a <= 121).sort((a,b) => a-b);
  const cvRows = $('cvRows');
  cvRows.innerHTML = '';
  ages.forEach((projAge, idx) => {
    const yrFromNow = projAge - age;
    const csv = getCSV(projAge, [annualPrem, yPrem, age, gender, projAge, rate, face, dragTune]);
    // Death Benefit: PDF-extracted value if available, otherwise face amount (Level DBO)
    const db = (state.actualDBMap && state.actualDBMap.has(projAge))
      ? state.actualDBMap.get(projAge)
      : face;
    const row = document.createElement('div');
    row.className = 'cv-row';
    row.innerHTML = `
      <div class="yr">Year ${yrFromNow}</div>
      <div class="age"><input type="number" data-idx="${state.ages.indexOf(projAge)}" min="${age+1}" max="121" value="${projAge}" class="cv-age-edit"></div>
      <div class="amt">${fmtMoney(csv)}</div>
      <div class="db">${fmtMoney(db)}</div>
      <button type="button" class="rm" data-idx="${state.ages.indexOf(projAge)}" title="Remove">×</button>
    `;
    cvRows.appendChild(row);
  });
  // Bind inline edits in cash value table
  cvRows.querySelectorAll('.cv-age-edit').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const idx = +e.target.dataset.idx;
      const v = parseInt(e.target.value, 10);
      if (!isNaN(v) && idx >= 0) {
        state.ages[idx] = v;
        renderAgeList();
        render();
      }
    });
  });
  cvRows.querySelectorAll('.rm').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = +e.currentTarget.dataset.idx;
      if (state.ages.length <= 1 || idx < 0) return;
      state.ages.splice(idx, 1);
      renderAgeList();
      render();
    });
  });

  // Footer — stack each agent as a name/phone block
  const agentFirm = $('agentFirm').value.trim() || '';
  const ftList = $('ftAgentList');
  ftList.innerHTML = '';
  state.agents.forEach((ag, idx) => {
    const name  = (ag.name  || '').trim();
    const phone = (ag.phone || '').trim();
    if (!name && !phone) return;
    const block = document.createElement('div');
    block.style.marginBottom = (idx < state.agents.length - 1) ? '6px' : '4px';
    const firmHtml = (idx === 0 && agentFirm)
      ? `<div class="agent-title">${escapeHTML(agentFirm)}</div>`
      : '';
    block.innerHTML = `
      ${name ? `<div class="agent-line">${escapeHTML(name)}</div>` : ''}
      ${firmHtml}
      ${phone ? `<div class="agent-phone">📱 ${escapeHTML(phone)}</div>` : ''}
    `;
    ftList.appendChild(block);
  });
  $('ftClient').textContent = fullName;

  const today = new Date();
  $('ftDate').textContent = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Mirror the same data into the Term Life card so it stays in sync
  // even when the user is on the IUL tab. Switching tabs is then instant
  // — no flash of stale content.
  renderTerm();

  // Auto-save every render so the latest state always persists
  scheduleSaveCallback();
}

/* ===================== TERM LIFE RENDER =====================
   Populates the Term Life card from the same form fields used by IUL,
   plus the Term Life-specific Term Length dropdown. No cash value math
   — Term Life is pure protection, no investment component.
   =============================================================== */
export function renderTerm() {
  const card = $('cardOutTerm');
  if (!card) return;

  const first = $('firstName').value.trim();
  const last  = $('lastName').value.trim();
  const age   = getCurrentAge();
  const gender = $('gender').value;
  const stateAbbr = $('state').value.trim();
  const risk = $('riskClass').value;
  // Term Life uses its OWN face amount and monthly premium fields
  const face  = parseMoney($('termFaceAmount').value) || parseMoney($('faceAmount').value) || 0;
  const mPrem = parseMoney($('termMonthlyPrem').value) || 0;
  const termLen = parseInt($('termLength').value, 10) || 30;

  // Banner cells
  const fullName = (first + ' ' + last).trim() || 'Term Client';
  $('t_cbName').textContent = fullName;
  $('t_cbAgeGender').textContent = `${age} / ${gender}`;
  $('t_cbState').textContent = stateAbbr || '—';
  $('t_cbFace').textContent = fmtMoney(face);
  $('t_cbPrem').textContent = fmtMoney(mPrem, true);
  $('t_cbTerm').textContent = `${termLen} yrs`;

  // Risk class with color coding (same logic as IUL)
  const riskEl = $('t_cbRisk');
  riskEl.textContent = risk || '—';
  riskEl.classList.remove('risk-best','risk-elite','risk-good','risk-warn','risk-caution');
  const rLower = (risk || '').toLowerCase();
  if (rLower === 'preferred plus')        riskEl.classList.add('risk-best');
  else if (rLower === 'preferred elite')  riskEl.classList.add('risk-elite');
  else if (rLower === 'preferred')        riskEl.classList.add('risk-good');
  else if (rLower === 'standard plus')    riskEl.classList.add('risk-warn');
  else if (rLower === 'standard')         riskEl.classList.add('risk-caution');

  // Death Benefit body
  $('t_dbAmt').textContent = fmtMoney(face);
  // Term length appears in two places in the description (EN + VI)
  const termYearsEls = card.querySelectorAll('#t_termYears, #t_termYearsVi');
  termYearsEls.forEach(el => el.textContent = String(termLen));
  const dbStateEl = $('t_dbState');
  if (dbStateEl) dbStateEl.textContent = stateAbbr || '—';

  // Footer agents — same builder pattern as IUL
  const agentFirm = $('agentFirm').value.trim() || '';
  const ftList = $('t_ftAgentList');
  ftList.innerHTML = '';
  state.agents.forEach((ag, idx) => {
    const name  = (ag.name  || '').trim();
    const phone = (ag.phone || '').trim();
    if (!name && !phone) return;
    const block = document.createElement('div');
    block.style.marginBottom = (idx < state.agents.length - 1) ? '6px' : '4px';
    const firmHtml = (idx === 0 && agentFirm)
      ? `<div class="agent-title">${escapeHTML(agentFirm)}</div>`
      : '';
    block.innerHTML = `
      ${name ? `<div class="agent-line">${escapeHTML(name)}</div>` : ''}
      ${firmHtml}
      ${phone ? `<div class="agent-phone">📱 ${escapeHTML(phone)}</div>` : ''}
    `;
    ftList.appendChild(block);
  });
  $('t_ftClient').textContent = fullName;

  const today = new Date();
  $('t_ftDate').textContent = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/* ===================== TAB SWITCHING =====================
   Switches between IUL and Term Life cards. Updates body class for CSS
   visibility, swaps active tab button, updates brand accent, persists
   the choice so the user lands on the same tab next session.
   =============================================================== */
export function setTab(tabName) {
  if (tabName !== 'iul' && tabName !== 'term') return;
  state.currentTab = tabName;

  // CSS visibility — body class drives .iul-only / .term-only show/hide
  document.body.classList.remove('tab-iul', 'tab-term');
  document.body.classList.add('tab-' + tabName);

  // Visual active state on tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Brand accent ("IUL" or "TERM") follows the tab
  const accent = $('brandAccent');
  if (accent) accent.textContent = (tabName === 'iul') ? 'IUL' : 'TERM';

  // Both cards are kept in sync by render(), so nothing to re-render
  // beyond persisting the tab choice
  scheduleSaveCallback();
}

/* Copy the embedded base64 logos from the IUL card into the Term Life
   card on init — avoids duplicating ~100KB of base64 in the HTML source. */
export function cloneLogos() {
  const taSrc = document.querySelector('#cardOut .ta-pill img');
  const fwSrc = document.querySelector('#cardOut .footer-logo img');
  if (taSrc && taSrc.src) {
    document.querySelectorAll('.ta-logo-clone').forEach(img => {
      if (!img.getAttribute('src')) img.src = taSrc.src;
    });
  }
  if (fwSrc && fwSrc.src) {
    document.querySelectorAll('.fiveways-logo-clone').forEach(img => img.src = fwSrc.src);
  }
}
