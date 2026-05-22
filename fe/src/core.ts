/* ===================== STATE ===================== */
export const state = {
  currentTab: 'iul',      // 'iul' or 'term' — which product tab is active
  ages: [42, 52, 62, 72],
  actualCSV: null,        // Map<age, csv> — populated when PDF parsed
  actualPVMap: null,      // Map<age, policyValue>
  actualDBMap: null,      // Map<age, deathBenefit>
  agents: [               // List of agents shown in footer (shared by both cards)
    { name: 'Kevin Le', phone: '' }
  ],
  livingBenefitColumns: {
    iul: [['iul_lc_chronic', 'iul_lc_terminal'], ['iul_lc_critical']],
    term: [['t_lc_chronic', 't_lc_terminal'], ['t_lc_critical']]
  }
};

/* ===================== HELPERS ===================== */
export const $ = (id: string): any => document.getElementById(id) as any;
export const fmtMoney = (n, withCents=false) => {
  if (!isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: withCents ? 2 : 0,
    maximumFractionDigits: withCents ? 2 : 0
  });
};

export const CURRENCY_FIELD_IDS = [
  'faceAmount',
  'monthlyPrem',
  'termFaceAmount',
  'termMonthlyPrem'
] as const;

export function parseMoney(raw) {
  const cleaned = String(raw == null ? '' : raw).replace(/[^0-9.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') return NaN;
  return parseFloat(cleaned);
}

export function formatMoneyInputValue(raw) {
  const n = parseMoney(raw);
  if (!isFinite(n)) return '';
  const hasCents = Math.abs(n % 1) > 0.000001;
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0
  });
}

export function formatCurrencyField(id) {
  const el = $(id);
  if (!el) return;
  el.value = formatMoneyInputValue(el.value);
}

export function formatCurrencyFields() {
  CURRENCY_FIELD_IDS.forEach(formatCurrencyField);
}

// Parse DOB string to a LOCAL Date object. Accepts:
//   "mm/dd/yyyy" — primary user-facing format
//   "yyyy-mm-dd" — ISO format (legacy / PDF extracted)
// Always returns a date in local time (no UTC parsing → no off-by-one shift).
export function parseLocalDate(dobStr) {
  if (!dobStr) return null;
  let m = dobStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mo = parseInt(m[1], 10), da = parseInt(m[2], 10), yr = parseInt(m[3], 10);
    if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
    return new Date(yr, mo - 1, da);
  }
  m = dobStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  const fallback = new Date(dobStr);
  return isNaN(fallback.getTime()) ? null : fallback;
}

export function calcAge(dobStr) {
  const dob = parseLocalDate(dobStr);
  if (!dob) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const mo = today.getMonth() - dob.getMonth();
  if (mo < 0 || (mo === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

export function fmtDob(dobStr) {
  const d = parseLocalDate(dobStr);
  if (!d) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Returns the age the user has entered. (DOB field was removed in v7;
// we keep calcAge() around because PDF parsing may still derive age
// from a D.O.B. field inside the illustration as a fallback.)
export function getCurrentAge() {
  const fromInput = parseInt($('age').value, 10);
  return isNaN(fromInput) ? 32 : fromInput;
}

/* ===================== CASH VALUE PROJECTION =====================
   Charge-based model: each year apply gross interest, then deduct
   charges that scale with face amount + a fixed policy fee. Charge
   per $1000 face rises with age (mortality curve). Female ≈ 90% male.
   Calibrated against Transamerica FFIUL II illustrations:
     • Vinh case (M, 32, $500K, $300/mo, 7.25%) — within ±3%
     • Diem case (F, 18, $260K, $97/mo,  7.25%) — within ±5%
   When a PDF is uploaded, exact CSV values from the illustration
   override this projection (state.actualCSV).
   =============================================================== */
export function chargeRatePer1000(age, gender) {
  let r;
  if      (age < 35) r = 2.00;
  else if (age < 45) r = 2.50;
  else if (age < 55) r = 3.50;
  else if (age < 65) r = 5.00;
  else if (age < 75) r = 7.50;
  else if (age < 85) r = 11.0;
  else                r = 16.0;
  return r * (gender === 'F' ? 0.90 : 1.00);
}

export function projectCSV(annualPrem, premYears, currentAge, gender, targetAge, ratePct, face, dragTune) {
  if (targetAge <= currentAge) return 0;
  const grossRate = ratePct / 100;
  const netPrem = annualPrem * 0.96; // 4% premium expense charge
  const fixedAnnualFee = 120; // $10/mo policy fee

  let pv = 0;
  const years = targetAge - currentAge;

  for (let y = 1; y <= years; y++) {
    const age = currentAge + y;
    if (y <= premYears) pv += netPrem;
    pv *= (1 + grossRate);
    const annualCharge = (fixedAnnualFee + (face / 1000) * chargeRatePer1000(age, gender)) * dragTune;
    pv -= annualCharge;
    if (pv < 0) pv = 0;
  }

  // Surrender charge — fades by year 15
  let sc = 0;
  if (years < 15) {
    const ageFactor = years <= 5 ? 1.0 : (15 - years) / 10;
    sc = 16.74 * (face / 1000) * Math.max(0, ageFactor);
  }
  return Math.max(0, pv - sc);
}

// Lookup: returns exact CSV from PDF if uploaded, else falls back to model
export function getCSV(targetAge, modelArgs: [any, any, any, any, any, any, any, any]) {
  if (state.actualCSV && state.actualCSV.has(targetAge)) {
    return state.actualCSV.get(targetAge);
  }
  return projectCSV(...modelArgs);
}
