import { esc as h } from './ui.js';
import { openCoursePDF } from './pdf-source.js';
import { setupReaderPanel } from './reader-panel.js';

export async function mountReader(host, file, record) {
  const { pdf, library, dispose: closePDF } = await openCoursePDF(file);
  if (!host.isConnected) {
    await closePDF();
    return;
  }
  const progressKey = 'mxy-reading-' + record.id,
    stateKey = 'mxy-reader-view-' + record.id;
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(stateKey)) || {};
  } catch {}
  let page = Math.min(pdf.numPages, Math.max(1, Number(localStorage.getItem(progressKey)) || 1)),
    scale = Math.max(0.6, Math.min(2, Number(saved.scale) || 1));
  let epoch = 0,
    closed = false,
    activeRender,
    activeRange,
    chosen,
    resizeTimer,
    watchSize,
    saveTimer,
    findVersion = 0,
    match,
    onNextNavigation = false;
  const maxPages = pdf.numPages,
    cache = new Map(),
    transcripts = new Map(),
    postponedScans = new Set(),
    scanJobs = new Set();
  const controller = new AbortController(),
    { signal } = controller;
  host.innerHTML =
    '<div class="pdf-heading"><b>' +
    h(record.title) +
    '</b><span class="tag">PDF 原文</span></div>' +
    '<div class="pdf-tools"><button data-reader="toc" aria-label="显示或收起目录">目录</button><input type="search" aria-label="在文档中搜索" placeholder="在文档中搜索"><button data-reader="find">查找</button><button data-reader="prev" aria-label="上一页">‹</button><label><input class="page-number" type="number" min="1" max="' +
    maxPages +
    '" aria-label="跳转页码"> / ' +
    maxPages +
    ' 页</label><button data-reader="next" aria-label="下一页">›</button><button data-reader="minus" aria-label="缩小">−</button><output data-zoom></output><button data-reader="plus" aria-label="放大">＋</button><button data-reader="fit">适合宽度</button><button data-reader="full" aria-label="全屏阅读">⛶</button></div>' +
    '<div class="scan-alert" hidden><div><b>当前页面为扫描图片</b><p>可识别本页后划词提问、记笔记，也可继续阅读原图。</p></div><button data-reader="scan" class="primary">识别本页文字</button><button data-reader="read-image">继续阅读原图</button></div>' +
    '<div class="pdf-grid"><aside class="pdf-toc"><h3>目录</h3><div></div></aside><section class="pdf-paper-scroll" aria-label="PDF 原页"><div class="paper-image"><canvas></canvas><div class="reader-marks" aria-hidden="true"></div><div class="pdf-text-layer"></div></div><aside class="ocr-transcript" hidden><b>识别文字</b><p></p></aside></section><aside class="pdf-panel" hidden></aside></div>' +
    '<div class="selection-menu" role="toolbar" aria-label="所选原文操作" hidden><button data-reader="ask">问马小原</button><button data-reader="note">记笔记</button><button data-reader="copy">复制</button></div><p class="reader-status" role="status"></p>';
  const $ = (s) => host.querySelector(s),
    status = (text) => ($('.reader-status').textContent = text);
  const scroll = $('.pdf-paper-scroll'),
    paper = $('.paper-image'),
    menu = $('.selection-menu'),
    layer = $('.pdf-text-layer');
  let drawnPage = null,
    searchQuery = '',
    searchHits = [],
    resultIndex = -1;
  const panel = setupReaderPanel(host, record, {
    signal,
    status,
    afterOpen: () => {
      menu.hidden = true;
      // The quotation is persisted as normalized rectangles. Clear the native
      // range so focusing the side panel cannot reopen the floating menu.
      getSelection()?.removeAllRanges();
      paint();
    },
    afterClose: () => {
      chosen = null;
      menu.hidden = true;
      paint();
    },
    locate: async (c) => {
      if (page !== c.page) await draw(c.page);
      chosen = c;
      paint();
      const ref = $('.reader-mark') || $('.ocr-transcript:not([hidden])') || paper;
      ref.scrollIntoView({ block: 'center', behavior: 'instant' });
      status('已定位至第 ' + c.page + ' 页的引用原文。');
    },
  });
  function writePosition() {
    if (drawnPage !== page || closed) return;
    try {
      localStorage.setItem(progressKey, String(page));
      localStorage.setItem(
        stateKey,
        JSON.stringify({
          page,
          scale,
          scroll: scroll.scrollTop / Math.max(1, scroll.scrollHeight - scroll.clientHeight),
        }),
      );
    } catch {}
  }
  scroll.addEventListener(
    'scroll',
    () => {
      updateMenu();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(writePosition, 120);
    },
    { signal, passive: true },
  );
  const lifecycle = new MutationObserver(() => {
    if (!host.isConnected) dispose();
  });
  lifecycle.observe(document.body, { childList: true, subtree: true });
  function dispose() {
    if (closed) return;
    writePosition();
    closed = true;
    epoch++;
    findVersion++;
    activeRender?.cancel();
    controller.abort();
    lifecycle.disconnect();
    clearTimeout(saveTimer);
    clearTimeout(resizeTimer);
    watchSize?.disconnect();
    closePDF().catch(() => {});
  }

  async function indexText(n) {
    if (transcripts.has(n)) return transcripts.get(n);
    if (!record.getPageText) return '';
    const value = await record.getPageText(n);
    const text = typeof value === 'string' ? value : value?.text || '';
    if (text) transcripts.set(n, text);
    return text;
  }
  function scanBar(n, text) {
    const bar = $('.scan-alert');
    bar.hidden = !text;
    if (!text) return;
    bar.querySelector('p').textContent = text;
    bar.querySelector('[data-reader=scan]').disabled = scanJobs.has(n);
  }
  async function scanHere() {
    const n = page;
    if (scanJobs.has(n)) return;
    scanJobs.add(n);
    const report = (text) => {
      if (page === n && !closed) scanBar(n, text);
    };
    try {
      report('正在准备本机中文识别…');
      const { indexCoursePDF } = await import('./course-index.js');
      await indexCoursePDF(file, {
        startPage: n,
        endPage: n,
        signal,
        onProgress: (v) => {
          if (v.stage === 'ocr') report('正在识别本页文字　' + Math.round(v.progress * 100) + '%');
        },
        onPage: (v) => {
          if (!v.text.trim()) throw Error('未能识别到清晰文字。可重试，或继续阅读原图。');
          transcripts.set(n, v.text);
          cache.set(n, v.text);
          searchQuery = '';
        },
      });
      if (page === n && !closed) {
        await draw(n, { reset: false });
        $('.ocr-transcript').scrollIntoView({ block: 'nearest', behavior: 'instant' });
      }
    } catch (error) {
      scanJobs.delete(n);
      if (!signal.aborted) report(error.message || '识别未完成，可重试。');
    } finally {
      scanJobs.delete(n);
    }
  }
  function paint() {
    const marks = $('.reader-marks');
    marks.replaceChildren();
    const c = panel.current?.page === page ? panel.current : chosen?.page === page ? chosen : null;
    if (c?.rects)
      for (const box of c.rects) {
        const s = document.createElement('span');
        s.className = 'reader-mark';
        s.style.left = box.x * 100 + '%';
        s.style.top = box.y * 100 + '%';
        s.style.width = box.w * 100 + '%';
        s.style.height = box.h * 100 + '%';
        marks.append(s);
      }
    if (match?.page === page) {
      const query = match.q.replace(/\s/g, '');
      let offset = 0;
      const spans = layer.querySelectorAll('span[role=presentation]'),
        raw = Array.from(spans, (s) => s.textContent.replace(/\s/g, '')).join('');
      const index = raw.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
      for (const s of spans) {
        const end = offset + s.textContent.replace(/\s/g, '').length;
        s.classList.toggle(
          'reader-hit',
          index >= 0 && offset < index + query.length && end > index,
        );
        offset = end;
      }
    } else layer.querySelectorAll('.reader-hit').forEach((x) => x.classList.remove('reader-hit'));
  }
  function currentRects(range, frame) {
    return Array.from(range.getClientRects())
      .filter((r) => r.width > 0 && r.height > 0)
      .slice(0, 160)
      .map((r) => ({
        x: (r.left - frame.left) / frame.width,
        y: (r.top - frame.top) / frame.height,
        w: r.width / frame.width,
        h: r.height / frame.height,
      }));
  }
  function selected() {
    const s = getSelection();
    if (!s?.rangeCount || !s.toString().trim()) return;
    const root =
      layer.contains(s.anchorNode) && layer.contains(s.focusNode) ? layer : $('.ocr-transcript p');
    if (!root.contains(s.anchorNode) || !root.contains(s.focusNode)) return;
    activeRange = s.getRangeAt(0).cloneRange();
    chosen = {
      text: s.toString().trim().slice(0, 2500),
      page,
      rects: root === layer ? currentRects(activeRange, paper.getBoundingClientRect()) : [],
    };
    menu.hidden = false;
    updateMenu();
    paint();
  }
  function updateMenu() {
    if (menu.hidden || !activeRange) return;
    let r = activeRange.getBoundingClientRect();
    const frame = scroll.getBoundingClientRect();
    if (
      (!r.width || !activeRange.commonAncestorContainer.isConnected) &&
      chosen?.rects?.length &&
      chosen.page === page
    ) {
      const p = paper.getBoundingClientRect(),
        m = chosen.rects[0];
      r = {
        left: p.left + m.x * p.width,
        top: p.top + m.y * p.height,
        right: p.left + (m.x + m.w) * p.width,
        bottom: p.top + (m.y + m.h) * p.height,
        width: m.w * p.width,
      };
    }
    if (!r.width || r.bottom < frame.top || r.top > frame.bottom) {
      menu.hidden = true;
      return;
    }
    const viewport = window.visualViewport,
      left = viewport?.offsetLeft || 0,
      top = viewport?.offsetTop || 0;
    const width = viewport?.width || innerWidth,
      height = viewport?.height || innerHeight;
    const mb = menu.getBoundingClientRect();
    menu.style.left =
      Math.max(left + 6, Math.min(left + width - mb.width - 6, (r.left + r.right - mb.width) / 2)) +
      'px';
    menu.style.top =
      Math.max(
        top + 6,
        Math.min(
          top + height - mb.height - 6,
          r.top - mb.height - 7 < Math.max(frame.top, top) ? r.bottom + 6 : r.top - mb.height - 7,
        ),
      ) + 'px';
  }
  menu.addEventListener('pointerdown', (e) => e.preventDefault(), { signal });
  document.addEventListener('selectionchange', selected, { signal });
  scroll.addEventListener(
    'pointerup',
    () =>
      setTimeout(() => {
        if (!closed) selected();
      }, 50),
    { signal },
  );
  window.addEventListener('scroll', updateMenu, { signal, passive: true });
  host.addEventListener(
    'pointerdown',
    (e) => {
      if (
        !e.target.closest('.selection-menu,.pdf-panel') &&
        !layer.contains(e.target) &&
        !$('.ocr-transcript').contains(e.target)
      )
        menu.hidden = true;
    },
    { signal },
  );
  const contentOf = async (n) => {
    if (cache.has(n)) return cache.get(n);
    const p = await pdf.getPage(n);
    const content = await p.getTextContent();
    const text = content.items.map((x) => x.str || '').join('');
    const result = text.trim() || (await indexText(n));
    cache.set(n, result);
    return result;
  };
  async function draw(n, { reset = true } = {}) {
    if (closed) return;
    const drawId = ++epoch,
      old = page;
    if (reset && old !== n) {
      writePosition();
      scroll.scrollTop = 0;
    }
    page = Math.max(1, Math.min(maxPages, Number(n) || 1));
    if (old !== page) {
      chosen = null;
      activeRange = null;
      menu.hidden = true;
    } else if (reset) {
      menu.hidden = true;
    }
    $('.page-number').value = page;
    $('[data-zoom]').textContent = Math.round(scale * 100) + '%';
    $('[data-reader=prev]').disabled = page <= 1;
    $('[data-reader=next]').disabled = page >= maxPages;
    for (const b of $('.pdf-toc').querySelectorAll('[data-page]'))
      b.classList.toggle('active', +b.dataset.page === page);
    const p = await pdf.getPage(page);
    if (drawId !== epoch || closed) return;
    const natural = p.getViewport({ scale: 1 }),
      avail = Math.max(195, scroll.clientWidth - 32);
    const vp = p.getViewport({ scale: (scale * Math.min(avail, 850)) / natural.width });
    const ratio = Math.min(2, devicePixelRatio || 1),
      canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width * ratio);
    canvas.height = Math.ceil(vp.height * ratio);
    activeRender?.cancel();
    const building = (activeRender = p.render({
      canvasContext: canvas.getContext('2d'),
      viewport: vp,
      transform: [ratio, 0, 0, ratio, 0, 0],
      background: '#ffffff',
    }));
    try {
      await building.promise;
    } catch (err) {
      if (closed || drawId !== epoch || err.name === 'RenderingCancelledException') return;
      throw err;
    } finally {
      if (activeRender === building) activeRender = null;
    }
    const content = await p.getTextContent();
    if (drawId !== epoch || closed) return;
    const nextLayer = document.createElement('div');
    nextLayer.className = 'pdf-text-layer';
    nextLayer.style.setProperty('--total-scale-factor', vp.scale);
    paper.style.width = vp.width + 'px';
    paper.style.height = vp.height + 'px';
    paper.querySelector('canvas').replaceWith(canvas);
    layer.replaceChildren();
    layer.style.setProperty('--total-scale-factor', vp.scale);
    const tl = new library.TextLayer({
      textContentSource: content,
      container: nextLayer,
      viewport: vp,
    });
    await tl.render();
    if (drawId !== epoch || closed) return;
    // The text-layer renderer writes rotation/scale state onto the container as well as its child nodes.
    layer.style.cssText = nextLayer.style.cssText;
    for (const key of Object.keys(nextLayer.dataset)) layer.dataset[key] = nextLayer.dataset[key];
    layer.replaceChildren(...Array.from(nextLayer.childNodes));
    const native = content.items
      .map((x) => x.str || '')
      .join('')
      .trim();
    if (native) cache.set(page, native);
    const transcript = $('.ocr-transcript');
    transcript.hidden = true;
    scanBar(page, '');
    if (!native) {
      let text = '';
      try {
        text = await indexText(page);
      } catch {
        status('识别文字暂时无法读取，可继续查看原页。');
      }
      if (drawId !== epoch || closed) return;
      if (text) {
        if (transcript.querySelector('p').textContent !== text)
          transcript.querySelector('p').textContent = text;
        transcript.hidden = false;
        cache.set(page, text);
        status('本页为扫描图，可在识别文字中划词并核对原图。');
      } else {
        status('本页是扫描图像，尚无可检索文字。');
        if (!postponedScans.has(page))
          scanBar(
            page,
            scanJobs.has(page)
              ? '正在识别本页文字…'
              : '可识别本页后划词提问、记笔记，也可继续阅读原图。',
          );
        else {
          const retry = document.createElement('button');
          retry.type = 'button';
          retry.dataset.reader = 'scan';
          retry.textContent = '识别本页文字';
          $('.reader-status').append(' ', retry);
        }
      }
    } else status('');
    drawnPage = page;
    paint();
    updateMenu();
    localStorage.setItem(progressKey, String(page));
    if (saved?.page === page && saved.scroll) {
      scroll.scrollTop = saved.scroll * Math.max(0, scroll.scrollHeight - scroll.clientHeight);
      saved = null;
    }
    writePosition();
  }
  const toc = $('.pdf-toc div');
  async function outlineGroup(items, container, level) {
    for (const item of items.slice(0, 160)) {
      if (closed) return;
      let n;
      try {
        const dest =
          typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest;
        if (dest)
          n = Number.isInteger(dest[0]) ? dest[0] + 1 : (await pdf.getPageIndex(dest[0])) + 1;
      } catch {}
      let branch = container;
      if (item.items?.length && level < 5) {
        const d = document.createElement('details'),
          summary = document.createElement('summary');
        summary.textContent = item.title || '章节';
        d.open = level === 0;
        d.append(summary);
        container.append(d);
        branch = d;
      }
      if (n) {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.page = n;
        b.textContent = item.title + ' · ' + n;
        branch.append(b);
      }
      if (branch !== container) await outlineGroup(item.items, branch, level + 1);
    }
  }
  try {
    await outlineGroup((await pdf.getOutline()) || [], toc, 0);
  } catch {}
  if (!toc.childElementCount) {
    const step = Math.max(1, Math.ceil(maxPages / 70));
    for (let n = 1; n <= maxPages; n += step) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.page = n;
      b.textContent = '第 ' + n + ' 页';
      toc.append(b);
    }
  }
  async function search() {
    const input = $('[type=search]'),
      q = input.value.trim();
    if (!q) return;
    const task = ++findVersion,
      key = q.replace(/\s/g, '').toLocaleLowerCase();
    if (searchQuery !== key) {
      const hits = [];
      status('正在检索原文…');
      for (let n = 1; n <= maxPages; n++) {
        if (closed || task !== findVersion) return;
        const text = await contentOf(n);
        if (text.replace(/\s/g, '').toLocaleLowerCase().includes(key)) hits.push(n);
      }
      if (task !== findVersion || closed) return;
      searchQuery = key;
      searchHits = hits;
      resultIndex = hits.findIndex((n) => n >= page) - 1;
    }
    if (!searchHits.length) {
      match = null;
      paint();
      status('没有匹配的原文。');
      return;
    }
    resultIndex = (resultIndex + 1 + searchHits.length) % searchHits.length;
    const n = searchHits[resultIndex];
    match = { q, page: n };
    await draw(n);
    if (task === findVersion)
      status('第 ' + n + ' 页 · 匹配 ' + (resultIndex + 1) + ' / ' + searchHits.length + ' 页');
  }
  async function navigate(n) {
    if (!(await panel.allowLeave()) || closed) return;
    if (panel.current) panel.hide();
    await draw(n);
  }
  host.addEventListener(
    'change',
    (e) => {
      if (e.target.matches('.page-number'))
        navigate(+e.target.value).catch((err) => status(err.message));
    },
    { signal },
  );
  host.addEventListener(
    'keydown',
    (e) => {
      if (e.target.matches('[type=search]') && e.key === 'Enter') {
        e.preventDefault();
        search().catch((err) => status(err.message));
      }
      if (e.key === 'Escape' && !e.target.closest('.pdf-panel,dialog')) menu.hidden = true;
    },
    { signal },
  );
  host.addEventListener(
    'click',
    async (e) => {
      const b = e.target.closest('button');
      if (!b || b.closest('.pdf-panel')) return;
      try {
        const cmd = b.dataset.reader;
        if (cmd === 'scan') await scanHere();
        if (cmd === 'read-image') {
          postponedScans.add(page);
          await draw(page, { reset: false });
        }
        if (b.dataset.page) {
          await navigate(+b.dataset.page);
          return;
        }
        if (cmd === 'prev' || cmd === 'next') await navigate(page + (cmd === 'next' ? 1 : -1));
        if (['minus', 'plus', 'fit'].includes(cmd)) {
          scale =
            cmd === 'fit' ? 1 : Math.max(0.6, Math.min(2, scale + (cmd === 'plus' ? 0.2 : -0.2)));
          await draw(page, { reset: false });
        }
        if (cmd === 'toc') host.classList.toggle('toggle-toc');
        if (cmd === 'full') {
          if (document.fullscreenElement) await document.exitFullscreen();
          else if (host.requestFullscreen) await host.requestFullscreen();
          else host.classList.toggle('reader-focus');
        }
        if (cmd === 'find') await search();
        if ((cmd === 'ask' || cmd === 'note') && chosen) await panel.open(cmd, chosen);
        if (cmd === 'copy' && chosen) {
          await navigator.clipboard.writeText(chosen.text);
          menu.hidden = true;
          status('引文已复制');
        }
      } catch (err) {
        if (!closed) status(err.message);
      }
    },
    { signal },
  );
  document.addEventListener(
    'click',
    (e) => {
      const link = e.target.closest('a[href],[data-material=back],[data-cmd=tab]');
      if (!panel.current || onNextNavigation || !link || host.contains(link)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      panel.allowLeave().then((ok) => {
        if (ok) {
          writePosition();
          onNextNavigation = true;
          try {
            link.click();
          } finally {
            onNextNavigation = false;
          }
        }
      });
    },
    { signal, capture: true },
  );
  await draw(page);
  let width = scroll.clientWidth;
  watchSize = new ResizeObserver(() => {
    const n = scroll.clientWidth;
    if (!closed && n && Math.abs(n - width) > 2) {
      width = n;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(
        () =>
          draw(page, { reset: false }).catch((err) => {
            if (!closed) status(err.message);
          }),
        90,
      );
    }
  });
  watchSize.observe(scroll);
}
