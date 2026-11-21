// Mở PDF bằng pdf.js — chỉ lấy kích thước trang; vẽ từng trang khi nó vào màn hình (nhẹ cho iPad / VPS).
import { useEffect, useState } from 'react';

// Polyfill Promise.withResolvers (pdfjs-dist v4+ cần — trình duyệt cũ không có)
if (typeof (Promise as any).withResolvers !== 'function') {
  (Promise as any).withResolvers = function () {
    let resolve: any;
    let reject: any;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

export type PdfDoc = {
  pages: { pageNo: number; w: number; h: number; proxy: any }[];
};

export async function loadPdfDoc(url: string): Promise<PdfDoc> {
  const pdfjsLib: any = await import('pdfjs-dist');
  const worker: any = await import('pdfjs-dist/build/pdf.worker.min.mjs');
  try {
    pdfjsLib.GlobalWorkerOptions.workerPort = new worker.WorkerMessageHandler();
  } catch {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.worker.min.mjs';
  }
  const pdf = await pdfjsLib.getDocument({ url }).promise;
  const pages: PdfDoc['pages'] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const proxy = await pdf.getPage(i);
    const vp = proxy.getViewport({ scale: 1 });
    pages.push({ pageNo: i, w: vp.width, h: vp.height, proxy });
  }
  return { pages };
}

/** Vẽ một trang vào canvas với bề rộng điểm ảnh = targetWidth. Trả về hàm huỷ. */
export function renderPdfPage(
  proxy: any,
  canvas: HTMLCanvasElement,
  targetWidth: number,
): { done: Promise<void>; cancel: () => void } {
  const vp1 = proxy.getViewport({ scale: 1 });
  const vp = proxy.getViewport({ scale: targetWidth / vp1.width });
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  const task = proxy.render({ canvas, viewport: vp });
  const done = task.promise.then(
    () => undefined,
    (e: any) => {
      if (e && e.name === 'RenderingCancelledException') return;
      throw e;
    },
  );
  return { done, cancel: () => { try { task.cancel(); } catch { /* bỏ qua */ } } };
}

export function usePdfDoc(url: string | null | undefined) {
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!url) {
      setDoc(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadPdfDoc(url)
      .then((d) => {
        if (!cancelled) setDoc(d);
      })
      .catch((e) => {
        if (!cancelled) setError((e && e.message) || 'Lỗi mở PDF');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return { doc, error, loading };
}
