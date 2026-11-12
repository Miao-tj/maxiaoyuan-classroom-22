import { openCoursePDF } from './pdf-source.js';
export { mountReader } from './pdf-reader-view.js';
export async function preparePDF(file, thumbnails, status) {
  const { pdf, dispose: disposePDF } = await openCoursePDF(file);
  try {
    if (pdf.numPages > 1200) throw Error('最多支持 1200 页 PDF。');
    const previews = [];
    let text = '';
    for (let i = 1; i <= (thumbnails === true ? Math.min(16, pdf.numPages) : 1); i++) {
      status('正在读取 PDF 第 ' + i + ' 页');
      const page = await pdf.getPage(i);
      if (i === 1)
        text = (await page.getTextContent()).items
          .map((x) => x.str)
          .join(' ')
          .slice(0, 500);
      if (thumbnails) {
        const v = page.getViewport({ scale: 1 }),
          vp = page.getViewport({ scale: Math.min(840 / v.width, 960 / v.height) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(vp.width);
        canvas.height = Math.ceil(vp.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        previews.push(canvas.toDataURL('image/jpeg', 0.69));
        canvas.width = canvas.height = 1;
      }
      page.cleanup();
    }
    return { pages: pdf.numPages, previews, text };
  } finally {
    await disposePDF();
  }
}
