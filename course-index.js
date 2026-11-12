import { openCoursePDF } from './pdf-source.js';

function extractText(items) {
  return items
    .map((item) => (item.str || '') + (item.hasEOL ? '\n' : ' '))
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/(?<=[\u3400-\u9fff]) +(?=[\u3400-\u9fff])/g, '')
    .trim();
}

async function createChineseWorker(onProgress) {
  const base = new URL('./vendor/ocr/', import.meta.url);
  const { default: Tesseract } = await import('./vendor/ocr/tesseract.esm.min.js');
  return Tesseract.createWorker('chi_sim', Tesseract.OEM.LSTM_ONLY, {
    workerPath: new URL('worker.min.js', base).href,
    corePath: new URL('tesseract-core-lstm.wasm.js', base).href,
    langPath: base.href,
    workerBlobURL: false,
    logger: (event) => {
      if (event.status === 'recognizing text') onProgress(event.progress);
    },
  });
}

function boundedPage(n, last, fallback) {
  if (n === undefined) return fallback;
  if (!Number.isInteger(n) || n < 1 || n > last) throw new RangeError('页码超出 PDF 范围');
  return n;
}

export async function indexCoursePDF(
  file,
  { ocr = true, signal, onProgress = () => {}, onPage = () => {}, startPage, endPage } = {},
) {
  signal?.throwIfAborted();
  const { pdf, library, dispose } = await openCoursePDF(file);
  let worker,
    renderTask,
    active = 0,
    nextJob,
    scannedPages = 0,
    indexedPages = 0;
  const progress = (stage, value) =>
    onProgress({ page: active, pages: pdf.numPages, stage, progress: value });
  const abort = () => {
    renderTask?.cancel();
    worker?.terminate().catch(() => {});
    nextJob?.(signal.reason || new DOMException('已取消识别', 'AbortError'));
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    signal?.throwIfAborted();
    if (pdf.numPages > 1200) throw Error('最多支持 1200 页 PDF。');
    const from = boundedPage(startPage, pdf.numPages, 1),
      to = boundedPage(endPage, pdf.numPages, pdf.numPages);
    if (from > to) throw new RangeError('开始页不能晚于结束页。');
    for (active = from; active <= to; active++) {
      signal?.throwIfAborted();
      progress('extract', 0);
      const page = await pdf.getPage(active);
      let canvas;
      try {
        const content = await page.getTextContent();
        let text = extractText(content.items),
          method = text ? 'text' : 'empty',
          confidence = null;
        let scanned = !text;
        if (text && text.replace(/\s/g, '').length < 18) {
          const ops = await page.getOperatorList();
          scanned = ops.fnArray.some((op) =>
            [
              library.OPS.paintImageXObject,
              library.OPS.paintInlineImageXObject,
              library.OPS.paintImageXObjectRepeat,
              library.OPS.paintImageMaskXObject,
            ].includes(op),
          );
        }
        if (scanned) scannedPages++;
        if (scanned && ocr) {
          progress('prepare-ocr', 0);
          worker ||= await createChineseWorker((n) => progress('ocr', n));
          signal?.throwIfAborted();
          const v = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: Math.min(3, 2100 / Math.max(v.width, v.height)) });
          canvas = document.createElement('canvas');
          canvas.width = Math.ceil(vp.width);
          canvas.height = Math.ceil(vp.height);
          renderTask = page.render({
            canvasContext: canvas.getContext('2d'),
            viewport: vp,
            background: 'rgb(255,255,255)',
          });
          await renderTask.promise;
          renderTask = null;
          signal?.throwIfAborted();
          progress('ocr', 0);
          const result = await Promise.race([
            worker.recognize(canvas),
            new Promise((_, reject) => {
              nextJob = reject;
            }),
          ]);
          nextJob = null;
          signal?.throwIfAborted();
          const detected = result.data.text
            .trim()
            .replace(/(?<=[\u3400-\u9fff]) +(?=[\u3400-\u9fff])/g, '');
          if (detected) {
            text = detected;
            method = 'ocr';
            confidence = result.data.confidence;
          }
        }
        if (text) indexedPages++;
        signal?.throwIfAborted();
        await onPage({ page: active, text, method, confidence });
        progress('indexed', 1);
      } finally {
        if (canvas) canvas.width = canvas.height = 1;
        page.cleanup();
      }
    }
    return { pages: pdf.numPages, scannedPages, indexedPages };
  } finally {
    signal?.removeEventListener('abort', abort);
    if (worker) await worker.terminate();
    await dispose();
  }
}
