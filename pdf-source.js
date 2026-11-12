let library;
export async function openCoursePDF(file) {
  library ||= await import('./vendor/pdfjs/pdf.min.mjs');
  const base = new URL('./vendor/pdfjs/', import.meta.url).href;
  library.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs';
  const task = library.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
    useWasm: false,
    wasmUrl: base + 'wasm/',
    cMapUrl: base + 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: base + 'standard_fonts/',
  });
  try {
    return { pdf: await task.promise, library, dispose: () => task.destroy() };
  } catch (error) {
    await task.destroy();
    throw error;
  }
}
