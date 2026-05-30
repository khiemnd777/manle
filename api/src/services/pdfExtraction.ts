import { fail } from '../http/errors';
import type { PdfExtractionResult, PdfLine, PdfTextItem } from '../types/illustration';

type PdfJs = typeof import('pdfjs-dist/build/pdf.js');

type PdfExtractionInput = ArrayBuffer | Uint8Array | Blob;

type PdfTextContentItem = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
};

export type ExtractPdfTextLayoutOptions = {
  fileName?: string;
  mimeType?: string;
  maxPages?: number;
};

let pdfJsPromise: Promise<PdfJs> | null = null;

async function loadPdfJs() {
  if (!pdfJsPromise) {
    const runtimeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<PdfJs>;
    pdfJsPromise = runtimeImport('pdfjs-dist/build/pdf.js');
  }
  return await pdfJsPromise;
}

async function inputToBytes(input: PdfExtractionInput) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    return new Uint8Array(await input.arrayBuffer());
  }
  fail(400, 'invalid_pdf_input', 'PDF input must be a File, Blob, ArrayBuffer, or Uint8Array.');
}

function normalizeMimeType(input: PdfExtractionInput, explicitMimeType?: string) {
  const mimeType = explicitMimeType || (typeof Blob !== 'undefined' && input instanceof Blob ? input.type : '') || 'application/pdf';
  if (mimeType !== 'application/pdf') {
    fail(400, 'invalid_mime_type', 'Illustration uploads must be PDF files.');
  }
  return 'application/pdf' as const;
}

function cleanMaxPages(value?: number) {
  if (value == null) return 40;
  if (!Number.isInteger(value) || value < 1 || value > 250) {
    fail(400, 'invalid_page_limit', 'PDF page limit must be between 1 and 250.');
  }
  return value;
}

async function sha256Hex(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function numeric(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function mapTextItem(item: PdfTextContentItem, page: number): PdfTextItem | null {
  const text = (item.str || '').trim();
  if (!text) return null;
  const transform = Array.isArray(item.transform) ? item.transform : [];
  return {
    text,
    page,
    x: numeric(transform[4]),
    y: numeric(transform[5]),
    width: numeric(item.width),
    height: numeric(item.height),
  };
}

function groupLines(page: number, items: PdfTextItem[]) {
  const lines: Array<{ y: number; items: PdfTextItem[] }> = [];
  const sorted = [...items].sort((a, b) => {
    const ay = a.y ?? 0;
    const by = b.y ?? 0;
    if (Math.abs(by - ay) > 2) return by - ay;
    return (a.x ?? 0) - (b.x ?? 0);
  });

  for (const item of sorted) {
    const y = item.y ?? 0;
    let line = lines.find(candidate => Math.abs(candidate.y - y) <= 2);
    if (!line) {
      line = { y, items: [] };
      lines.push(line);
    }
    line.items.push(item);
  }

  return lines
    .map((line): PdfLine => {
      const lineItems = [...line.items].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
      return {
        page,
        y: line.y,
        items: lineItems,
        text: lineItems.map(item => item.text).join(' ').replace(/\s+/g, ' ').trim(),
      };
    })
    .filter(line => line.text);
}

export async function extractPdfTextLayout(
  input: PdfExtractionInput,
  options: ExtractPdfTextLayoutOptions = {},
): Promise<PdfExtractionResult> {
  const mimeType = normalizeMimeType(input, options.mimeType);
  const bytes = await inputToBytes(input);
  if (bytes.byteLength < 1) fail(400, 'invalid_pdf', 'PDF file is empty.');

  const fileSha256 = await sha256Hex(bytes);
  const maxPages = cleanMaxPages(options.maxPages);
  const pdfjs = await loadPdfJs();

  try {
    const loadingTask = pdfjs.getDocument({
      data: bytes,
      disableWorker: true,
      useSystemFonts: true,
    });
    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages;
    const extractedPageCount = Math.min(pageCount, maxPages);
    const pages: PdfExtractionResult['pages'] = [];

    for (let pageNumber = 1; pageNumber <= extractedPageCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent({
        includeMarkedContent: false,
        disableCombineTextItems: false,
      });
      const items = (textContent.items as PdfTextContentItem[])
        .map(item => mapTextItem(item, pageNumber))
        .filter((item): item is PdfTextItem => Boolean(item));
      const lines = groupLines(pageNumber, items);
      pages.push({
        page: pageNumber,
        text: lines.map(line => line.text).join('\n'),
        lines,
        items,
      });
      page.cleanup();
    }

    await pdf.destroy();

    return {
      fileSha256,
      fileName: options.fileName,
      mimeType,
      fileSizeBytes: bytes.byteLength,
      pageCount,
      text: pages.map(page => page.text).join('\n'),
      pages,
      metadata: {
        schemaVersion: 1,
        extractedPageCount,
        maxPages,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message) {
      fail(400, 'pdf_parse_failed', `Could not parse PDF: ${error.message}`);
    }
    fail(400, 'pdf_parse_failed', 'Could not parse PDF.');
  }
}
