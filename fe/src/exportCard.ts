import { $, state } from './core';
import { authorizeCardExport, type ExportAuthorization } from './account';
import { showAppDialog, showErrorDialog } from './dialog';
import { resetHeaderCustomizations, syncHeaderEntitlementState } from './headerEditor';
import { sanitizeLivingBenefitEditorForExport } from './livingBenefitColumns';
import { repairAllLivingBenefitFormats } from './livingBenefitFormat';
import { muiIconSvg } from './muiIcons';
import { enforceWatermarkForCapture } from './protection';
import { applyStyles } from './styleEditor';

type ExportFormat = 'pdf' | 'png' | 'jpg';

type ExportRuntime = {
  html2canvas: typeof import('html2canvas').default;
  jsPDF: typeof import('jspdf').jsPDF;
};

const CAPTURE_SCALE_BY_FORMAT: Record<ExportFormat, number> = {
  pdf: 5,
  png: 3,
  jpg: 3,
};

const JPG_EXPORT_QUALITY = 0.9;
const PDF_IMAGE_QUALITY = 0.95;

let exportRuntimePromise: Promise<ExportRuntime> | null = null;

function ensureExportRuntime() {
  if (exportRuntimePromise) return exportRuntimePromise;

  exportRuntimePromise = Promise.all([
    import('html2canvas'),
    import('jspdf')
  ]).then(([html2canvasModule, jspdfModule]) => {
    const html2canvas = html2canvasModule.default;
    const { jsPDF } = jspdfModule;
    window.html2canvas = html2canvas;
    window.jspdf = { jsPDF };
    return { html2canvas, jsPDF };
  });

  return exportRuntimePromise;
}

function enforceExportEntitlements(authorization: ExportAuthorization) {
  const cleanupWatermark = enforceWatermarkForCapture(authorization.watermark);

  if (!authorization.branding) {
    resetHeaderCustomizations({ save: false });
  }
  syncHeaderEntitlementState();

  applyStyles();
  sanitizeLivingBenefitEditorForExport(authorization.benefitEditor);

  return cleanupWatermark;
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('Unable to create export image.'));
    }, mime, quality);
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ===================== IMAGE / PDF EXPORT =====================
   - PDF mode: render card to canvas via html2canvas, embed into a
     letter-sized jsPDF document, fit to page with margins.
   - PNG/JPG mode: render canvas → blob → trigger download.
   PDF is used by agents emailing cards to clients — looks more
   professional and prints cleanly across email clients.
   =============================================================== */
export async function exportCardImage(format: ExportFormat) {
  // Pick whichever card is currently visible — the inactive one is hidden via CSS
  repairAllLivingBenefitFormats();
  const cardId = state.currentTab === 'term' ? 'cardOutTerm' : 'cardOut';
  const card = $(cardId);
  // Drop focus from any contenteditable element so the cursor doesn't show in the export
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();

  // Add exporting class to suppress hover/focus cues during capture
  card.classList.add('exporting');

  // Show busy state on the trigger button
  const btnIdMap: Record<ExportFormat, string> = { pdf: 'printBtn', jpg: 'jpgBtn', png: 'pngBtn' };
  const btnId = btnIdMap[format];
  const btn = $(btnId);
  const origLabel = btn.innerHTML;
  btn.innerHTML = `${muiIconSvg('HourglassEmpty')} Đang tạo...`;
  btn.disabled = true;
  let cleanupEntitlementCapture = () => {};

  try {
    const authorization = await authorizeCardExport(format);
    cleanupEntitlementCapture = enforceExportEntitlements(authorization);
  } catch (err) {
    card.classList.remove('exporting');
    btn.innerHTML = origLabel;
    btn.disabled = false;
    void showErrorDialog(err, 'Không thể export file');
    return;
  }

  // --- Inline all computed styles so html2canvas sees real colors (not CSS vars) ---
  const allCardEls = [card, ...card.querySelectorAll('*')];
  const savedStyles = [];
  const PROPS = [
    'backgroundColor','backgroundImage','color',
    'borderColor','borderTopColor','borderRightColor','borderBottomColor','borderLeftColor',
    'boxShadow','textShadow','fill','stroke','opacity'
  ];

  allCardEls.forEach((el, i) => {
    const computed = window.getComputedStyle(el);
    const prev = {};
    PROPS.forEach(p => {
      const val = computed[p];
      if (val && val !== '' && val !== 'none' && val !== 'rgba(0, 0, 0, 0)' && val !== 'transparent') {
        prev[p] = el.style[p]; // save original inline
        el.style.setProperty(p.replace(/([A-Z])/g, '-$1').toLowerCase(), val, 'important');
      }
    });
    // Also force background shorthand for elements with CSS var backgrounds
    const bgc = computed.backgroundColor;
    if (bgc && bgc !== 'rgba(0, 0, 0, 0)' && bgc !== 'transparent') {
      prev['backgroundColor'] = el.style.backgroundColor;
      el.style.setProperty('background-color', bgc, 'important');
    }
    savedStyles.push(prev);
  });

  try {
    const { html2canvas, jsPDF } = await ensureExportRuntime();

    // Small delay to let styles apply
    await new Promise(r => setTimeout(r, 80));

    // Use offsetHeight to get the true rendered height including all children
    const cardW = card.offsetWidth  || card.scrollWidth;
    const cardH = card.offsetHeight || card.scrollHeight;

    const canvas = await html2canvas(card, {
      backgroundColor: '#f5f6f8',
      scale: CAPTURE_SCALE_BY_FORMAT[format],
      useCORS: true,
      allowTaint: true,
      logging: false,
      windowWidth: Math.max(cardW, 960),
      windowHeight: cardH + 100,
      width: cardW,
      height: cardH,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: -window.scrollY,
      foreignObjectRendering: false,
      removeContainer: true,
      imageTimeout: 15000,
      onclone: function(clonedDoc) {
        // Remove overflow:hidden from card in clone so footer isn't clipped
        const cl = clonedDoc.getElementById(cardId);
        if (cl) {
          cl.style.overflow = 'visible';
          cl.style.borderRadius = '0';
        }
      }
    });

    // Build a clean filename from client name
    const first = ($('firstName').value || '').trim();
    const last  = ($('lastName').value  || '').trim();
    const name  = (first + '_' + last).trim().replace(/^_|_$/g, '');
    const safe  = name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').toLowerCase() || 'client';

    if (format === 'pdf') {
      // PDF export — embed the rendered canvas into a letter-sized PDF.
      // Using JPEG inside the PDF keeps file size reasonable for email attachment.
      const filename = `manle_iul_${safe}.pdf`;
      const imgData = canvas.toDataURL('image/jpeg', PDF_IMAGE_QUALITY);

      // Letter size in inches (8.5 x 11). Choose orientation by canvas aspect ratio.
      const aspect = canvas.height / canvas.width; // tall → portrait
      const pdf = new jsPDF({
        orientation: aspect > 1 ? 'portrait' : 'landscape',
        unit: 'in',
        format: 'letter'
      });

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 0.3;

      // Fit the image inside the printable area, preserving aspect ratio
      let imgW = pageW - margin * 2;
      let imgH = imgW * aspect;
      if (imgH > pageH - margin * 2) {
        imgH = pageH - margin * 2;
        imgW = imgH / aspect;
      }
      const x = (pageW - imgW) / 2;
      const y = (pageH - imgH) / 2;

      pdf.addImage(imgData, 'JPEG', x, y, imgW, imgH);
      pdf.save(filename);
    } else {
      const mime    = format === 'jpg' ? 'image/jpeg' : 'image/png';
      const ext     = format === 'jpg' ? 'jpg' : 'png';
      const quality = format === 'jpg' ? JPG_EXPORT_QUALITY : undefined;
      const filename = `manle_iul_${safe}.${ext}`;

      const blob = await canvasToBlob(canvas, mime, quality);
      downloadBlob(blob, filename);
    }
  } catch (err) {
    console.error('Export failed:', err);
    if (err instanceof Error && err.message === 'Unable to create export image.') {
      void showAppDialog({
        title: 'Tạo file thất bại',
        message: 'Vui lòng thử lại.',
        variant: 'danger',
      });
    } else {
      void showErrorDialog(err, 'Lỗi khi tạo file');
    }
  } finally {
    // Restore original inline styles
    allCardEls.forEach((el, i) => {
      const prev = savedStyles[i];
      if (prev) {
        PROPS.forEach(p => {
          if (p in prev) {
            el.style[p] = prev[p];
          }
        });
        if ('backgroundColor' in prev) {
          el.style.backgroundColor = prev['backgroundColor'];
        }
      }
    });
    card.classList.remove('exporting');
    cleanupEntitlementCapture();
    btn.innerHTML = origLabel;
    btn.disabled = false;
  }
}
