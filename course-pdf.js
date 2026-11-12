import { esc as h } from './ui.js';
let pdfLibrary;
async function sourcePDF(file) {
  pdfLibrary ||= await import('./vendor/pdfjs/pdf.min.mjs');
  const base = new URL('./vendor/pdfjs/', import.meta.url).href;
  pdfLibrary.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs';
  const task = pdfLibrary.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
    useWasm: false,
    wasmUrl: base + 'wasm/',
    cMapUrl: base + 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: base + 'standard_fonts/',
  });
  try {
    return { pdf: await task.promise, dispose: () => task.destroy() };
  } catch (error) {
    await task.destroy();
    throw error;
  }
}
export async function preparePDF(file, thumbnails, status) {
  const { pdf, dispose: disposePDF } = await sourcePDF(file);
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
export async function mountReader(target, file, record) {
  const { pdf, dispose: disposePDF } = await sourcePDF(file);
  if (!target.isConnected) {
    await disposePDF();
    return;
  }
  const progress = 'mxy-reading-' + record.id;
  let page = Math.max(1, Math.min(pdf.numPages, Number(localStorage.getItem(progress)) || 1)),
    scale = 1,
    epoch = 0,
    selection = '',
    citationPage = page,
    outline = [],
    selectionOwner,
    closed = false;
  let resizeTimer, resizeObserver;
  const controller = new AbortController(),
    signal = controller.signal;
  const noteKey = 'mxy-reading-note-' + record.id;
  target.innerHTML =
    '<div class="pdf-heading"><b>' +
    h(record.title) +
    '</b><span class="tag">PDF 原文</span></div><div class="pdf-tools"><button data-reader="toc">目录</button><input type="search" aria-label="在文档中搜索" placeholder="在文档中搜索"><button data-reader="find">查找</button><button data-reader="prev" aria-label="上一页">‹</button><label><input class="page-number" type="number" min="1" max="' +
    pdf.numPages +
    '" aria-label="跳转页码"> / ' +
    pdf.numPages +
    ' 页</label><button data-reader="next" aria-label="下一页">›</button><button data-reader="minus" aria-label="缩小">−</button><output data-zoom></output><button data-reader="plus" aria-label="放大">＋</button><button data-reader="fit">适合宽度</button></div><div class="pdf-grid"><aside class="pdf-toc"><h3>目录</h3><div></div></aside><section class="pdf-paper-scroll"><div class="paper-image"><canvas></canvas><div class="pdf-text-layer"></div></div><div class="selection-menu" hidden><button data-reader="ask">问马小原</button><button data-reader="note">记笔记</button><button data-reader="copy">复制</button></div></section><aside class="pdf-panel" hidden></aside></div><p class="reader-status" role="status"></p>';
  const $ = (sel) => target.querySelector(sel),
    message = (s) => ($('.reader-status').textContent = s);
  function dispose() {
    if (closed) return;
    closed = true;
    observer.disconnect();
    resizeObserver?.disconnect();
    clearTimeout(resizeTimer);
    controller.abort();
    disposePDF().catch(() => {});
  }
  const observer = new MutationObserver(() => {
    if (!target.isConnected) dispose();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  try {
    outline = (await pdf.getOutline()) || [];
  } catch {}
  const toc = $('.pdf-toc div');
  if (outline.length) {
    for (const item of outline.slice(0, 100)) {
      try {
        const d = typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest;
        if (!d) continue;
        const n = Number.isInteger(d[0]) ? d[0] + 1 : (await pdf.getPageIndex(d[0])) + 1;
        const btn = document.createElement('button');
        btn.textContent = item.title;
        btn.dataset.page = n;
        toc.append(btn);
      } catch {}
    }
  }
  if (!toc.childElementCount) {
    toc.innerHTML = Array.from(
      { length: Math.ceil(pdf.numPages / Math.max(1, Math.ceil(pdf.numPages / 60))) },
      (_, i) => {
        const n = 1 + i * Math.max(1, Math.ceil(pdf.numPages / 60));
        return '<button data-page="' + n + '">第 ' + n + ' 页</button>';
      },
    ).join('');
  }
  async function draw(n) {
    const tag = ++epoch;
    page = Math.min(pdf.numPages, Math.max(1, n));
    const current = page;
    $('.page-number').value = page;
    $('[data-zoom]').textContent = Math.round(scale * 100) + '%';
    $('[data-reader=prev]').disabled = page === 1;
    $('[data-reader=next]').disabled = page === pdf.numPages;
    $('.selection-menu').hidden = true;
    for (const button of toc.children)
      button.classList.toggle('active', Number(button.dataset.page) === page);
    const p = await pdf.getPage(page);
    if (tag !== epoch || closed) return;
    const natural = p.getViewport({ scale: 1 }),
      avail = Math.max(220, $('.pdf-paper-scroll').clientWidth - 34);
    const vp = p.getViewport({ scale: (scale * Math.min(avail, 790)) / natural.width });
    const pix = Math.min(2, window.devicePixelRatio || 1),
      canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width * pix);
    canvas.height = Math.ceil(vp.height * pix);
    await p.render({
      canvasContext: canvas.getContext('2d'),
      viewport: vp,
      transform: [pix, 0, 0, pix, 0, 0],
    }).promise;
    const content = await p.getTextContent();
    if (tag !== epoch || closed) return;
    const paper = $('.paper-image');
    paper.style.width = vp.width + 'px';
    paper.style.height = vp.height + 'px';
    paper.querySelector('canvas').replaceWith(canvas);
    const layer = $('.pdf-text-layer');
    layer.replaceChildren();
    layer.style.setProperty('--total-scale-factor', vp.scale);
    const tl = new pdfLibrary.TextLayer({
      textContentSource: content,
      container: layer,
      viewport: vp,
    });
    await tl.render();
    if (tag === epoch && !closed) {
      localStorage.setItem(progress, String(current));
      message(content.items.some((x) => x.str?.trim()) ? '' : '这一页是扫描图像，可阅读原图。');
    }
  }
  function selected() {
    const s = getSelection();
    if (!s?.rangeCount || !s.toString().trim() || !$('.pdf-text-layer').contains(s.anchorNode))
      return;
    selection = s.toString().trim().slice(0, 2500);
    citationPage = page;
    $('.selection-menu').hidden = false;
  }
  target.addEventListener('pointerup', () => setTimeout(selected, 80), { signal });
  document.addEventListener('selectionchange', selected, { signal });
  function panel(kind) {
    if (!selection) return;
    selectionOwner = { text: selection, page: citationPage };
    const box = $('.pdf-panel');
    box.hidden = false;
    target.classList.add('with-panel');
    const title = kind === 'note' ? '添加笔记' : '问马小原';
    box.innerHTML =
      '<header><h3>' +
      title +
      '</h3><button data-reader="closepanel" aria-label="关闭面板">×</button></header><div class="cite"><b>已引用原文 · 第 ' +
      citationPage +
      ' 页</b><blockquote>' +
      h(selection) +
      '</blockquote></div>' +
      (kind === 'note'
        ? '<label>笔记标题<input data-title maxlength="90"></label><label>笔记内容<textarea data-note rows="6"></textarea></label><label>标签<input data-tags maxlength="120" placeholder="多个标签用逗号分隔"></label><small data-draft></small><button class="primary" data-reader="save">保存笔记</button>'
        : '<label>关于这段原文的问题<textarea data-question maxlength="1200" placeholder="这句话怎么理解？"></textarea></label><button class="primary" data-reader="send">发送</button><p class="answer-text" data-answer></p>');
    if (kind === 'note') {
      const d = JSON.parse(localStorage.getItem(noteKey) || 'null');
      $('[data-title]').value =
        d?.page === citationPage ? d.title : record.title + ' · 第 ' + citationPage + ' 页';
      $('[data-note]').value = d?.page === citationPage ? d.text : '';
      $('[data-tags]').value = d?.page === citationPage ? d.tags : '';
    }
    if (innerWidth < 760) box.scrollIntoView({ block: 'nearest' });
  }
  target.addEventListener(
    'input',
    () => {
      if (!$('[data-note]')) return;
      localStorage.setItem(
        noteKey,
        JSON.stringify({
          page: selectionOwner.page,
          title: $('[data-title]').value,
          text: $('[data-note]').value,
          tags: $('[data-tags]').value,
        }),
      );
      $('[data-draft]').textContent = '草稿已保存至本设备';
    },
    { signal },
  );
  target.addEventListener(
    'change',
    async (e) => {
      if (e.target.matches('.page-number')) await draw(Number(e.target.value) || 1);
    },
    { signal },
  );
  target.addEventListener(
    'click',
    async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      try {
        if (btn.dataset.page) {
          await draw(+btn.dataset.page);
          return;
        }
        const action = btn.dataset.reader;
        if (action === 'prev' || action === 'next') await draw(page + (action === 'next' ? 1 : -1));
        if (['minus', 'plus', 'fit'].includes(action)) {
          scale =
            action === 'fit'
              ? 1
              : Math.max(0.6, Math.min(2, scale + (action === 'plus' ? 0.2 : -0.2)));
          await draw(page);
        }
        if (action === 'toc') target.classList.toggle('toggle-toc');
        if (action === 'find') {
          const q = $('[type=search]').value.trim();
          if (!q) return;
          message('正在检索原文…');
          let found = false;
          for (let i = 1; i <= pdf.numPages && !closed; i++) {
            const n = 1 + ((page + i - 1) % pdf.numPages);
            const p = await pdf.getPage(n);
            const text = (await p.getTextContent()).items.map((x) => x.str).join('');
            if (text.includes(q)) {
              await draw(n);
              message('在第 ' + n + ' 页找到「' + q + '」');
              found = true;
              break;
            }
          }
          if (!found) message('没有找到匹配的可检索文字。');
        }
        if (action === 'note' || action === 'ask') panel(action);
        if (action === 'copy') {
          await navigator.clipboard.writeText(selection);
          message('引文已复制');
        }
        if (action === 'closepanel') {
          $('.pdf-panel').hidden = true;
          target.classList.remove('with-panel');
        }
        if (action === 'save') {
          const title = $('[data-title]').value.trim(),
            text = $('[data-note]').value.trim();
          if (!title || !text) {
            message('请填写标题和笔记内容。');
            return;
          }
          const key = 'maxiaoyuan-live-22',
            d = JSON.parse(localStorage.getItem(key) || 'null') || {
              threads: [{ id: crypto.randomUUID(), draft: '', turns: [] }],
              notes: [],
              answers: {},
              read: {},
              favorites: [],
              reduce: false,
            };
          d.notes.unshift({
            id: crypto.randomUUID(),
            title,
            text:
              text +
              '\n\n' +
              selectionOwner.text +
              '\n来源：' +
              record.title +
              ' · 第 ' +
              selectionOwner.page +
              ' 页',
            tags: $('[data-tags]').value,
            source: { id: record.id, page: selectionOwner.page },
          });
          localStorage.setItem(key, JSON.stringify(d));
          localStorage.removeItem(noteKey);
          $('.pdf-panel').hidden = true;
          target.classList.remove('with-panel');
          message('笔记已保存 · 可在本站个人笔记查看');
        }
        if (action === 'send') {
          const q = $('[data-question]').value.trim();
          if (!q) return;
          btn.disabled = true;
          const answer = $('[data-answer]');
          answer.textContent = '马小原正在阅读引文…';
          try {
            const r = await fetch('./api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: q,
                history: [],
                source: record.title + ' 第 ' + selectionOwner.page + ' 页\n' + selectionOwner.text,
              }),
              signal,
            });
            if (!r.ok) throw Error((await r.json()).error || '提问失败');
            const lines = (await r.text())
              .split('\n')
              .filter(Boolean)
              .map((x) => JSON.parse(x));
            const error = lines.find((x) => x.type === 'error');
            if (error) throw Error(error.message);
            answer.textContent =
              lines.filter((x) => x.type === 'answer').at(-1)?.text || '没有收到回答，可重试。';
          } catch (err) {
            if (!closed) answer.textContent = err.message;
          } finally {
            btn.disabled = false;
          }
        }
      } catch (err) {
        if (!closed) message(err.message);
      }
    },
    { signal },
  );
  await draw(page);
  let previousWidth = $('.pdf-paper-scroll').clientWidth;
  resizeObserver = new ResizeObserver(() => {
    const width = $('.pdf-paper-scroll')?.clientWidth;
    if (closed || !width || Math.abs(width - previousWidth) < 3) return;
    previousWidth = width;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(
      () =>
        draw(page).catch((err) => {
          if (!closed) message(err.message);
        }),
      90,
    );
  });
  resizeObserver.observe($('.pdf-paper-scroll'));
}
