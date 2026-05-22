import { ensurePdfJs } from './runtime';
import { $, calcAge, formatCurrencyField, state } from './core';
import { refreshCustomDropdowns } from './customDropdown';
import { formatPhone, render, renderAgeList, renderAgentList, setTab } from './render';

/* ===================== PDF AUTO-FILL ===================== */
// Full state name → 2-letter code
const STATE_MAP = {
  'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
  'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
  'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA',
  'kansas':'KS','kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD',
  'massachusetts':'MA','michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO',
  'montana':'MT','nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ',
  'new mexico':'NM','new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH',
  'oklahoma':'OK','oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
  'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT',
  'virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY',
  'district of columbia':'DC'
};

export function normalizeState(raw) {
  if (!raw) return '';
  const s = raw.trim().toLowerCase();
  if (STATE_MAP[s]) return STATE_MAP[s];
  // Try 2-letter code already
  if (/^[a-z]{2}$/.test(s)) return s.toUpperCase();
  // Try first matching prefix
  for (const k in STATE_MAP) {
    if (s.startsWith(k.slice(0, 4))) return STATE_MAP[k];
  }
  return raw.toUpperCase().slice(0, 2);
}

// Parse filename for quick fields, e.g.:
//   "An D. Nguyen - $500,000 - $300 - 20Y - Preferred Elite.pdf"
//   "Christine Nguyen - $219,000 - $150 - 20Y.pdf"
//   "An_D_Nguyen_-_FA_500K_-_300mo_-_20Y_-_Preferred_Elite.pdf"
export function parseFilename(filename) {
  const out: any = {};
  // Strip extension, normalize underscores → spaces, collapse multi-space
  let base = filename.replace(/\.pdf$/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

  // Split on " - " (also handles " -- ", " — ", multiple dashes)
  const tokens = base.split(/\s*[-–—]+\s*/).map(t => t.trim()).filter(Boolean);

  // First token = name (must not look like a number/year/risk class)
  const nameTok = tokens.find(t =>
    !/^\$|^FA\b|^\d/.test(t) &&
    !/preferred|standard|elite|plus/i.test(t) &&
    !/^\d+\s*[YyMm]/.test(t)
  );
  if (nameTok) out.fullName = nameTok.replace(/\s+/g, ' ').trim();

  // Face amount — many formats:
  //   "$500,000"  "$500000"  "500K"  "FA 500K"  "260,000"  "260 000"  "1.5M"
  for (const t of tokens) {
    // (a) $-prefixed: $500,000 or $500000
    let m = t.match(/\$\s*([\d,]+)/);
    if (m) {
      const n = parseInt(m[1].replace(/,/g, ''), 10);
      if (n >= 25000) { out.face = n; break; }
    }
    // (b) "K" suffix: 500K, FA 500K
    m = t.match(/\b(?:FA\s*)?(\d+(?:\.\d+)?)\s*[kK]\b/);
    if (m) { out.face = Math.round(parseFloat(m[1]) * 1000); break; }
    // (c) "M" suffix: 1.5M
    m = t.match(/\b(?:FA\s*)?(\d+(?:\.\d+)?)\s*[mM](?![oO])\b/);
    if (m) { out.face = Math.round(parseFloat(m[1]) * 1000000); break; }
    // (d) Number with comma or space thousands: "260,000" "260 000"
    //     Must look like 3-7 digit number, not a year/age/premium
    const cleaned = t.replace(/[\s,]/g, '');
    if (/^\d{5,7}$/.test(cleaned)) {
      const n = parseInt(cleaned, 10);
      if (n >= 25000 && n <= 5000000) { out.face = n; break; }
    }
  }

  // Monthly premium — "$300", "300mo", "300/mo", or short bare number
  for (const t of tokens) {
    if (out.face && t.replace(/[\s,]/g, '') === String(out.face)) continue;
    let m = t.match(/\b(\d+(?:\.\d+)?)\s*(?:mo|\/mo|monthly)\b/i);
    if (m) { out.monthlyPrem = parseFloat(m[1]); break; }
    m = t.match(/\$\s*(\d+(?:\.\d+)?)(?![\d,])/); // $300 (no more digits)
    if (m) {
      const n = parseFloat(m[1]);
      if (n >= 25 && n < 10000) { out.monthlyPrem = n; break; }
    }
    // Bare integer 25-9999 (like "97" or "300")
    if (/^\d{2,4}$/.test(t)) {
      const n = parseInt(t, 10);
      if (n >= 25 && n < 10000 && n !== out.payYears) {
        out.monthlyPrem = n;
        break;
      }
    }
  }

  // Pay years: "20Y" / "15Y" / "20 Years"
  for (const t of tokens) {
    const m = t.match(/^(\d+)\s*[Yy](?:ears?)?$/);
    if (m) { out.payYears = parseInt(m[1], 10); break; }
  }

  // Risk class
  for (const t of tokens) {
    if (/preferred\s*elite/i.test(t))  { out.riskClass = 'Preferred Elite'; break; }
    if (/preferred\s*plus/i.test(t))   { out.riskClass = 'Preferred Plus'; break; }
    if (/standard\s*plus/i.test(t))    { out.riskClass = 'Standard Plus'; break; }
    if (/preferred/i.test(t))          { out.riskClass = 'Preferred'; break; }
    if (/standard/i.test(t))           { out.riskClass = 'Standard'; break; }
  }

  return out;
}

// Pull text from first N pages of a PDF
// Pull text + per-page text + tabular rows from PDF
export async function extractPdfData(file, maxPages = 40) {
  const buf = await file.arrayBuffer();
  const pdfjsLib = await ensurePdfJs();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const n = Math.min(pdf.numPages, maxPages);
  const pages = [];
  const tabularRows = [];

  for (let i = 1; i <= n; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const pageText = (tc.items as any[]).map(it => it.str).join(' ');
    pages.push(pageText);

    // Extract tabular detail rows by grouping items by y-coordinate
    if (/TABULAR DETAIL/i.test(pageText)) {
      const rowsByY = new Map();
      for (const it of tc.items as any[]) {
        const s = (it.str || '').trim();
        if (!s) continue;
        const y = Math.round(it.transform[5]);
        if (!rowsByY.has(y)) rowsByY.set(y, []);
        rowsByY.get(y).push({ str: s, x: it.transform[4] });
      }
      // Process each y-row
      for (const [y, items] of rowsByY) {
        items.sort((a, b) => a.x - b.x);
        // Drop bold-render duplicates: same string at almost-same x position.
        // Bold milestone cells render the same glyph 4× at offsets <2 units,
        // but adjacent columns with equal values are >10 units apart.
        const dedupItems = [];
        for (const it of items) {
          const last = dedupItems[dedupItems.length - 1];
          if (last && last.str === it.str && Math.abs(it.x - last.x) < 5) continue;
          dedupItems.push(it);
        }
        const tokens = dedupItems.map(i => i.str);
        if (tokens.length < 5) continue;

        // Pull only numeric tokens (skip "Lapse" and other text)
        const numIdx = [];
        const nums = [];
        for (let k = 0; k < tokens.length; k++) {
          if (/^[\d,]+$/.test(tokens[k])) {
            numIdx.push(k);
            nums.push(parseInt(tokens[k].replace(/,/g, ''), 10));
          }
        }
        if (nums.length < 5) continue;

        const year = nums[0];
        const age  = nums[1];
        if (isNaN(year) || isNaN(age) || year < 1 || year > 110 || age < 0 || age > 130) continue;

        // Last 3 numeric values = PV / CSV / DB at 7.25% Current rate
        const pv  = nums[nums.length - 3];
        const csv = nums[nums.length - 2];
        const db  = nums[nums.length - 1];
        // Sanity: death benefit must look like a face-amount-sized number
        if (db < 1000 || db > 50_000_000) continue;

        tabularRows.push({
          year, age,
          policyValue: pv,
          cashSurrenderValue: csv,
          deathBenefit: db
        });
      }
    }
  }

  // Dedupe by year (PDF sometimes renders milestone rows in bold = multiple times)
  const yearMap = new Map();
  for (const r of tabularRows) {
    if (!yearMap.has(r.year)) yearMap.set(r.year, r);
  }
  const dedupedRows = [...yearMap.values()].sort((a, b) => a.year - b.year);

  return {
    text: pages.join('\n'),
    rows: dedupedRows
  };
}

// Parse PDF text content for fields
export function parsePdfText(text) {
  const out: any = {};
  const t = text.replace(/\s+/g, ' ');

  // ---- Identity / Demographics ----

  // Designed For: <Name>
  let m = t.match(/Designed For:?\s*([A-Za-z][A-Za-z'.\- ]+?)(?:\s+Prepared|\s+Initial|\s+Male|\s+Female|\s{2,})/);
  if (m) out.fullName = m[1].trim();

  // Input Summary section: First Name / Last Name (more reliable)
  const fn = t.match(/First Name\s+([A-Z][A-Za-z'.\- ]+?)\s+(?:Last Name|Gender|Issue Age)/);
  const ln = t.match(/Last Name\s+([A-Z][A-Za-z'.\- ]+?)\s+(?:Risk|Illustration|Issue Age)/);
  if (fn && ln) {
    out.firstName = fn[1].trim();
    out.lastName  = ln[1].trim();
    out.fullName  = `${out.firstName} ${out.lastName}`;
  }

  // Date of birth: "Issue Age or D.O.B. (mm/dd/yyyy) 10/3/2007"
  m = t.match(/D\.O\.B\.\s*\(mm\/dd\/yyyy\)\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const [_, mo, da, yr] = m;
    out.dob = `${yr}-${mo.padStart(2,'0')}-${da.padStart(2,'0')}`;
  }

  // Male/Female, Age N
  m = t.match(/(Male|Female)\s*,?\s*Age\s*(\d+)/i);
  if (m) {
    out.gender = m[1].toLowerCase().startsWith('m') ? 'M' : 'F';
    out.age = parseInt(m[2], 10);
  }
  // Or from Input Summary: "Gender Female"
  m = t.match(/Gender\s+(Male|Female)/i);
  if (m && !out.gender) out.gender = m[1].toLowerCase().startsWith('m') ? 'M' : 'F';

  // Issue State
  m = t.match(/Issue State:?\s*([A-Za-z][A-Za-z ]{1,20}?)(?:\s+Risk|\s+Additional|\s{2,}|\s+First Name)/);
  if (m) out.state = normalizeState(m[1]);

  // Risk Class
  m = t.match(/Risk Class:?\s*((?:Preferred|Standard)(?:\s+(?:Plus|Elite))?)/i);
  if (m) {
    const w = m[1].trim().split(/\s+/);
    out.riskClass = w.map(x => x[0].toUpperCase() + x.slice(1).toLowerCase()).join(' ');
  }

  // ---- Policy Design ----

  // Face amount
  m = t.match(/Initial Face Amount:?\s*\$?\s*([\d,]+)/);
  if (!m) m = t.match(/\$\s*([\d,]+)\s+Initial Face Amount/);
  if (!m) m = t.match(/Face Amount\s+([\d,]+)/);  // Input Summary plain format
  if (m) out.face = parseInt(m[1].replace(/,/g, ''), 10);

  // Monthly premium — nhiều format:
  // IUL:   "$97.00 Initial Monthly Premium..."
  // Term:  "$79.12 Initial Monthly Premium including all Riders"
  // Term summary page: "Premium $79.12 Initial Monthly Premium..."
  m = t.match(/\$\s*([\d,.]+)\s+Initial Monthly Premium/);
  if (!m) m = t.match(/Initial Monthly Premium[^$\d]*?\$\s*([\d,.]+)/);
  // Term Life Premium Detail: "Base Policy $920.00 $469.20 $236.90 $79.12" — Monthly is last
  if (!m) m = t.match(/Base Policy\s+\$[\d,.]+\s+\$[\d,.]+\s+\$[\d,.]+\s+\$\s*([\d,.]+)/);
  // Term Life fallback: "25 Year Premium $920.00 $469.20 $236.90 $79.12"
  if (!m) m = t.match(/\d+\s*Year\s+Premium\s+\$[\d,.]+\s+\$[\d,.]+\s+\$[\d,.]+\s+\$\s*([\d,.]+)/);
  if (m) out.monthlyPrem = parseFloat(m[1].replace(/,/g, ''));

  // Pay years: "Planned Periodic Premiums 97.00 From 1 To 15"
  m = t.match(/Planned Periodic Premiums\s+([\d.]+)\s+From\s+\d+\s+To\s+(\d+)/);
  if (m) {
    if (!out.monthlyPrem) out.monthlyPrem = parseFloat(m[1]);
    out.payYears = parseInt(m[2], 10);
  }

  // Death Benefit Option
  m = t.match(/(?:Initial )?Death Benefit Option:?\s*(Level|Increasing|Graded)/i);
  if (m) out.dbo = m[1];

  // ---- Product type detection (IUL vs Term Life) ----
  // Term Life Trendsetter® LB has very different markers from IUL
  if (/Trendsetter|Level Term Period|Guaranteed Level Term/i.test(t)) {
    out.productType = 'term';
  } else if (/FFIUL|Indexed Universal Life|TABULAR DETAIL|Index Account/i.test(t)) {
    out.productType = 'iul';
  }

  // Term Length: "Level Term Period 30 Years" / "Trendsetter® LB 30" / "30 Year Premium"
  m = t.match(/Level Term Period\s+(\d{2})\s*Years?/i);
  if (!m) m = t.match(/Trendsetter[^\d]{0,40}?\bLB\s+(\d{2})\b/i);
  if (!m) m = t.match(/Term Duration\s*-?\s*(\d{2})\s*years?/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if ([10, 15, 20, 25, 30].includes(n)) out.termLength = n;
  }

  // ---- Agent ----

  m = t.match(/Agent\/Representative:?\s*((?:Mr\.|Ms\.|Mrs\.)?\s*[A-Z][A-Za-z'.\- ]+?)(?:\s+\d|\s+[A-Z]{2}\s+\d{5}|\s{2,})/);
  if (m) out.agentName = m[1].trim().replace(/\s+/g, ' ');

  // Phone (xxx) xxx-xxxx
  m = t.match(/\(\s*\d{3}\s*\)\s*\d{3}\s*[-\s]?\s*\d{4}/);
  if (m) out.agentPhone = m[0].replace(/\s+/g, '').replace(/(\(\d{3}\))(\d{3})-?(\d{4})/, '$1 $2-$3');

  return out;
}

// Merge filename + content data, prefer non-empty
export function mergeExtracted(fromFile: any, fromContent: any) {
  const out = { ...fromFile };
  for (const k in fromContent) {
    if (fromContent[k] !== undefined && fromContent[k] !== '' && fromContent[k] !== null) {
      out[k] = fromContent[k];
    }
  }
  return out;
}

// Apply extracted data to form fields
// targetTab: 'iul' | 'term' — controls which premium/face fields to write
export function applyExtracted(data: any, targetTab) {
  const filled = [];
  const isTermUpload = (targetTab === 'term') || (data.productType === 'term');

  if (data.fullName) {
    const parts = data.fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      $('lastName').value = parts[parts.length - 1];
      $('firstName').value = parts.slice(0, -1).join(' ');
    } else {
      $('firstName').value = data.fullName;
    }
    filled.push('Name');
  }

  // Per user request: don't auto-fill DOB. Just fill age.
  // (DOB stays blank for the user to enter manually if they want.)
  if (data.age && !isNaN(data.age)) {
    $('age').value = data.age;
    filled.push(`Age ${data.age}`);
  } else if (data.dob) {
    // Fall back: compute age from DOB but don't persist DOB
    const computed = calcAge(data.dob);
    if (computed !== null) {
      $('age').value = computed;
      filled.push(`Age ${computed}`);
    }
  }

  if (data.gender) {
    $('gender').value = data.gender;
    // Don't list separately if age was already mentioned
    if (!data.age) filled.push('Gender');
  }

  if (data.state) {
    $('state').value = data.state;
    filled.push('State');
  }

  if (data.riskClass) {
    // Try to match the dropdown option
    const sel = $('riskClass');
    for (const opt of sel.options) {
      if (opt.value.toLowerCase() === data.riskClass.toLowerCase()) {
        sel.value = opt.value;
        filled.push('Risk Class');
        break;
      }
    }
  }

  if (data.face) {
    if (isTermUpload) {
      $('termFaceAmount').value = data.face;
      formatCurrencyField('termFaceAmount');
    } else {
      $('faceAmount').value = data.face;
      formatCurrencyField('faceAmount');
    }
    filled.push('Face Amount');
  }

  if (data.monthlyPrem) {
    if (isTermUpload) {
      $('termMonthlyPrem').value = data.monthlyPrem;
      formatCurrencyField('termMonthlyPrem');
    } else {
      $('monthlyPrem').value = data.monthlyPrem;
      formatCurrencyField('monthlyPrem');
    }
    filled.push('Premium');
  }

  if (data.payYears) {
    $('premYears').value = data.payYears;
    filled.push('Pay Years');
  }

  if (data.termLength) {
    if ($('termLength')) {
      $('termLength').value = data.termLength;
      filled.push(`Term ${data.termLength}Y`);
    }
  }

  // If the PDF is a Term Life illustration, auto-switch to the Term Life
  // tab so the user lands on the right card after upload.
  if (data.productType === 'term') {
    setTab('term');
    filled.push('→ Term Life tab');
  } else if (data.productType === 'iul') {
    setTab('iul');
  }

  if (data.agentName || data.agentPhone) {
    if (state.agents.length === 0) state.agents.push({ name: '', phone: '' });
    if (data.agentName)  { state.agents[0].name  = data.agentName;  filled.push('Agent'); }
    if (data.agentPhone) { state.agents[0].phone = formatPhone(data.agentPhone); filled.push('Phone'); }
    renderAgentList();
  }

  refreshCustomDropdowns();
  return filled;
}

// Main upload handler
// forTab: 'iul' | 'term' — which tab's zone triggered this upload
export async function handlePdfUpload(file, forTab) {
  const isTermZone = forTab === 'term';
  const zone       = isTermZone ? $('uploadZoneTerm') : $('uploadZone');
  const successBox = isTermZone ? $('uploadSuccessTerm') : $('uploadSuccess');
  const errorBox   = isTermZone ? $('uploadErrorTerm')   : $('uploadError');
  const parsedDiv  = isTermZone ? $('uploadParsedTerm')  : $('uploadParsed');
  const defaultDiv = isTermZone ? $('uploadDefaultTerm') : $('uploadDefault');
  const fileNameEl = isTermZone ? $('uploadFileNameTerm'): $('uploadFileName');

  successBox.classList.remove('show');
  errorBox.classList.remove('show');

  // Show parsing state
  zone.classList.add('parsing');
  defaultDiv.style.display = 'none';
  parsedDiv.style.display = 'block';
  fileNameEl.innerHTML = `<span class="upload-spinner"></span>Đang đọc file...`;

  try {
    const fromFile = parseFilename(file.name);

    let fromContent = {};
    let extractedRows = [];
    try {
      const result = await extractPdfData(file);
      fromContent = parsePdfText(result.text);
      extractedRows = result.rows;
    } catch (err) {
      console.warn('PDF text extraction failed, falling back to filename only:', err);
    }

    const merged = mergeExtracted(fromFile, fromContent);

    if (Object.keys(merged).length === 0 && extractedRows.length === 0) {
      throw new Error('Không nhận diện được dữ liệu từ file. Hãy điền thủ công.');
    }

    // Populate exact CSV/PV/DB lookups from PDF tabular detail
    if (extractedRows.length > 0) {
      state.actualCSV   = new Map(extractedRows.map(r => [r.age, r.cashSurrenderValue]));
      state.actualPVMap = new Map(extractedRows.map(r => [r.age, r.policyValue]));
      state.actualDBMap = new Map(extractedRows.map(r => [r.age, r.deathBenefit]));
      // Tabular detail "Non-Guaranteed Current Projections" column is at 7.25%
      $('rate').value = '7.25';
    } else {
      state.actualCSV = state.actualPVMap = state.actualDBMap = null;
    }

    const filled = applyExtracted(merged, forTab);
    if (extractedRows.length > 0) filled.push(`${extractedRows.length} CSV rows`);

    // Update UI
    zone.classList.remove('parsing');
    zone.classList.add('parsed');
    fileNameEl.textContent = file.name;

    // Refresh sidebar age list and re-render card
    renderAgeList();
    render();

    // Show success
    if (filled.length > 0) {
      successBox.innerHTML = `<strong>Auto-filled:</strong> <span class="field-list">${filled.join(', ')}</span>`;
      successBox.classList.add('show');
    } else {
      errorBox.textContent = 'Đọc được file nhưng không tìm thấy dữ liệu phù hợp. Hãy điền thủ công.';
      errorBox.classList.add('show');
    }
  } catch (err) {
    console.error(err);
    zone.classList.remove('parsing', 'parsed');
    defaultDiv.style.display = 'block';
    parsedDiv.style.display = 'none';
    errorBox.textContent = err.message || 'Lỗi khi đọc file PDF.';
    errorBox.classList.add('show');
  }
}

export function bindUploadZone() {
  function bindFilePicker(zone, input) {
    zone.setAttribute('role', 'button');
    zone.setAttribute('tabindex', '0');
    zone.addEventListener('click', (e) => {
      if (e.target === input) return;
      input.click();
    });
    zone.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      input.click();
    });
  }

  // ---- IUL upload zone ----
  const zoneIUL  = $('uploadZone');
  const inputIUL = $('pdfInput');
  bindFilePicker(zoneIUL, inputIUL);

  inputIUL.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handlePdfUpload(file, 'iul');
  });
  ['dragenter', 'dragover'].forEach(ev => {
    zoneIUL.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); zoneIUL.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(ev => {
    zoneIUL.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); zoneIUL.classList.remove('dragover'); });
  });
  zoneIUL.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      handlePdfUpload(file, 'iul');
    } else {
      $('uploadError').textContent = 'Chỉ nhận file PDF.';
      $('uploadError').classList.add('show');
    }
  });

  // ---- Term Life upload zone ----
  const zoneTerm  = $('uploadZoneTerm');
  const inputTerm = $('pdfInputTerm');
  bindFilePicker(zoneTerm, inputTerm);

  inputTerm.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handlePdfUpload(file, 'term');
  });
  ['dragenter', 'dragover'].forEach(ev => {
    zoneTerm.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); zoneTerm.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(ev => {
    zoneTerm.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); zoneTerm.classList.remove('dragover'); });
  });
  zoneTerm.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      handlePdfUpload(file, 'term');
    } else {
      $('uploadErrorTerm').textContent = 'Chỉ nhận file PDF.';
      $('uploadErrorTerm').classList.add('show');
    }
  });
}
