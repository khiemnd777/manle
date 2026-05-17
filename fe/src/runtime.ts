type PdfJsLib = typeof import("pdfjs-dist");
type Html2Canvas = typeof import("html2canvas").default;
type JsPDFConstructor = typeof import("jspdf").jsPDF;

import pdfJsSrc from "pdfjs-dist/build/pdf.min.js?url";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.js?url";

declare global {
  interface Window {
    pdfjsLib?: PdfJsLib;
    html2canvas?: Html2Canvas;
    jspdf?: { jsPDF: JsPDFConstructor };
  }

  interface EventTarget {
    dataset: DOMStringMap;
    files: FileList | null;
    value: string;
  }

  interface Element {
    blur: () => void;
    dataset: DOMStringMap;
    disabled: boolean;
    files: FileList | null;
    options: HTMLOptionsCollection;
    src: string;
    style: CSSStyleDeclaration;
    title: string;
    value: string;
  }
}

let pdfJsLoadPromise: Promise<PdfJsLib> | null = null;

function getLoadedPdfJs() {
  const loaded = window.pdfjsLib || (window as any)["pdfjs-dist/build/pdf"];
  if (!loaded) return null;
  window.pdfjsLib = loaded;
  loaded.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
  return loaded as PdfJsLib;
}

export function ensurePdfJs() {
  const loaded = getLoadedPdfJs();
  if (loaded) return Promise.resolve(loaded);
  if (pdfJsLoadPromise) return pdfJsLoadPromise;

  pdfJsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = pdfJsSrc;
    script.async = true;
    script.onload = () => {
      const loaded = getLoadedPdfJs();
      if (loaded) {
        resolve(loaded);
        return;
      }
      reject(new Error("PDF.js loaded, but global pdfjsLib was not initialized."));
    };
    script.onerror = () => reject(new Error("Cannot load PDF.js runtime."));
    document.head.appendChild(script);
  });

  return pdfJsLoadPromise;
}
