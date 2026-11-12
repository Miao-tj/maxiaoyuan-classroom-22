import { esc as h, avatar } from './ui.js';
import { bindRichToolbar, richToolbarMarkup, plainNote } from './reader-rich.js';

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
async function streamAnswer(q, source, history, signal, update) {
  const r = await fetch('./api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: q, source, history }),
    signal,
  });
  if (!r.ok) throw Error((await r.json()).error || '未能取得回答。');
  const stream = r.body.getReader(),
    decoder = new TextDecoder();
  let chunk = '',
    done = false,
    answer = '';
  function emit(line) {
    if (!line.trim()) return;
    const v = JSON.parse(line);
    if (v.type === 'error') throw Error(v.message);
    if (v.type === 'answer') {
      answer = v.text;
      update(answer);
    }
    if (v.type === 'done') done = true;
  }
  try {
    for (;;) {
      const packet = await stream.read();
      chunk += decoder.decode(packet.value, { stream: !packet.done });
      let n;
      while ((n = chunk.indexOf('\n')) >= 0) {
        emit(chunk.slice(0, n));
        chunk = chunk.slice(n + 1);
      }
      if (packet.done) break;
    }
    emit(chunk);
    if (!done) throw Error('连接中断，问题已保留，可重试。');
    return answer;
  } finally {
    await stream.cancel().catch(() => {});
    stream.releaseLock();
  }
}

export function setupReaderPanel(host, record, { signal, status, locate, afterOpen, afterClose }) {
  const box = host.querySelector('.pdf-panel'),
    key = 'mxy-reading-note-' + record.id;
  let current,
    mode = '',
    turns = [],
    dirty = false,
    request,
    closing,
    unbind;
  const $ = (q) => box.querySelector(q);
  function cancel() {
    request?.abort();
    request = null;
  }
  signal.addEventListener(
    'abort',
    () => {
      cancel();
      unbind?.abort();
      closing?.close();
    },
    { once: true },
  );
  function reset() {
    cancel();
    unbind?.abort();
    unbind = new AbortController();
    turns = [];
    dirty = false;
  }
  function hide() {
    reset();
    box.hidden = true;
    box.classList.remove('sheet-folded');
    host.classList.remove('with-panel');
    mode = '';
    afterClose?.();
  }
  function saveDraft() {
    if (mode !== 'note' || !current || !$('[data-note]')) return;
    const entry = {
      page: current.page,
      quote: current.text,
      title: $('[data-title]').value,
      text: $('[data-note]').value,
      tags: $('[data-tags]').value,
      updated: Date.now(),
    };
    const stored = load(key, {});
    const list = Array.isArray(stored.entries) ? stored.entries : stored.page ? [stored] : [];
    const entries = [
      entry,
      ...list.filter((d) => !(d.page === entry.page && (d.quote === entry.quote || !d.quote))),
    ].slice(0, 15);
    try {
      localStorage.setItem(key, JSON.stringify({ entries }));
      $('[data-draft]').textContent = '草稿已保存在本设备';
    } catch {
      $('[data-draft]').textContent = '空间不足，草稿尚未保存';
    }
  }
  function findDraft() {
    const d = load(key, {}),
      entries = Array.isArray(d.entries) ? d.entries : [d];
    return entries.find((x) => x.page === current.page && (!x.quote || x.quote === current.text));
  }
  function removeDraft() {
    const d = load(key, {});
    const entries = (d.entries || [d]).filter(
      (x) => x.page !== current.page || (x.quote && x.quote !== current.text),
    );
    if (entries.length) localStorage.setItem(key, JSON.stringify({ entries }));
    else localStorage.removeItem(key);
  }
  async function allowLeave() {
    if (!dirty) return true;
    if (closing?.open) return false;
    const dialog = (closing = document.createElement('dialog'));
    dialog.className = 'reader-leave';
    dialog.innerHTML =
      '<h2>笔记尚未保存</h2><p>离开前是否保存这次修改？</p><form method="dialog"><button value="stay">继续编辑</button><button value="discard">放弃修改</button><button value="save" class="primary">保存并离开</button></form>';
    host.append(dialog);
    dialog.showModal();
    return new Promise((resolve) =>
      dialog.addEventListener(
        'close',
        () => {
          const action = dialog.returnValue;
          dialog.remove();
          closing = null;
          let leave = false;
          if (action === 'discard') {
            removeDraft();
            dirty = false;
            leave = true;
          } else if (action === 'save') leave = store();
          resolve(leave);
        },
        { once: true },
      ),
    );
  }
  async function open(next, citation) {
    if (!citation?.text) return;
    if (
      !box.hidden &&
      mode === next &&
      current?.page === citation.page &&
      current?.text === citation.text
    ) {
      box.querySelector('textarea')?.focus();
      return;
    }
    if (!(await allowLeave()) || signal.aborted) return;
    reset();
    current = { ...citation };
    mode = next;
    box.hidden = false;
    host.classList.add('with-panel');
    const isNote = mode === 'note';
    box.classList.remove('sheet-folded');
    box.innerHTML =
      '<button type="button" class="sheet-grip" data-reader="sheet" aria-expanded="true" aria-label="收起阅读面板"><span></span></button><header><h3>' +
      (isNote ? '添加笔记' : '问马小原') +
      '</h3>' +
      (isNote ? '<small class="draft-flag">仅自己可见</small>' : '') +
      '<button data-reader="closepanel" aria-label="关闭面板">×</button></header>' +
      '<div class="cite"><b>已引用原文 · 第 ' +
      current.page +
      ' 页</b><blockquote>' +
      h(current.text) +
      '</blockquote><button data-reader="locate" class="locate-source">定位到原文</button></div>' +
      (isNote
        ? '<label>笔记标题<input data-title maxlength="100"></label><label for="reader-note-input">笔记内容</label>' +
          richToolbarMarkup() +
          '<textarea id="reader-note-input" data-note aria-label="笔记内容" rows="7" maxlength="12000"></textarea><label>标签<input data-tags maxlength="120" placeholder="多个标签用逗号分隔"></label><div class="note-panel-foot"><small data-draft></small><button data-reader="closepanel">取消</button><button class="primary" data-reader="save">保存笔记</button></div>'
        : '<div class="reader-turns" aria-live="off"></div><div class="reader-composer"><label>围绕这段原文继续提问<textarea data-question maxlength="1200" rows="2" placeholder="这句话怎么理解？"></textarea></label><div class="reader-sendbar"><select aria-label="问答模型" data-engine><option value="course">课程模型</option><option value="device">设备通义千问</option></select><button class="primary" data-reader="send">发送</button></div><small data-modelhint></small></div>');
    if (isNote) {
      const draft = findDraft();
      $('[data-title]').value = draft?.title || record.title + ' · 第 ' + current.page + ' 页';
      $('[data-note]').value = draft?.text || '';
      $('[data-tags]').value = draft?.tags || '';
      if (draft) $('[data-draft]').textContent = '已恢复这段引文的草稿';
      bindRichToolbar(box, $('[data-note]'), { signal: unbind.signal });
    }
    afterOpen?.(current);
    if (matchMedia('(max-width:760px)').matches)
      box.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }
  function foldSheet(folded) {
    box.classList.toggle('sheet-folded', folded);
    const handle = $('[data-reader=sheet]');
    handle.setAttribute('aria-expanded', String(!folded));
    handle.setAttribute('aria-label', folded ? '展开阅读面板' : '收起阅读面板');
    if (folded) handle.focus({ preventScroll: true });
  }
  let dragY,
    ignoreTap = false;
  box.addEventListener(
    'pointerdown',
    (e) => {
      const grip = e.target.closest('[data-reader=sheet]');
      if (!grip) return;
      dragY = e.clientY;
      ignoreTap = false;
      grip.setPointerCapture?.(e.pointerId);
    },
    { signal },
  );
  box.addEventListener(
    'pointerup',
    (e) => {
      if (dragY === undefined) return;
      const delta = e.clientY - dragY;
      dragY = undefined;
      if (Math.abs(delta) > 18) {
        ignoreTap = true;
        foldSheet(delta > 0);
      }
    },
    { signal },
  );
  box.addEventListener(
    'pointercancel',
    () => {
      dragY = undefined;
    },
    { signal },
  );
  function store() {
    const title = $('[data-title]').value.trim(),
      markdown = $('[data-note]').value.trim(),
      body = plainNote(markdown).trim();
    if (!title || !body) {
      status('请填写标题和笔记内容。');
      return false;
    }
    const k = 'maxiaoyuan-live-22',
      d = load(k, {
        threads: [{ id: crypto.randomUUID(), draft: '', turns: [] }],
        notes: [],
        answers: {},
        read: {},
        favorites: [],
        reduce: false,
      });
    d.notes ||= [];
    d.notes.unshift({
      id: crypto.randomUUID(),
      title,
      text:
        body + '\n\n' + current.text + '\n来源：' + record.title + ' · 第 ' + current.page + ' 页',
      markdown,
      tags: $('[data-tags]').value,
      source: { id: record.id, page: current.page, quote: current.text },
      updated: Date.now(),
    });
    try {
      localStorage.setItem(k, JSON.stringify(d));
      removeDraft();
      dirty = false;
      hide();
      status('笔记已保存 · 可在本站个人笔记查看');
      return true;
    } catch {
      status('设备存储空间不足，请先导出备份或缩短笔记。');
      return false;
    }
  }
  async function send(question) {
    const field = $('[data-question]');
    if (!field || request) return;
    const q = (question || field.value).trim();
    if (!q) return;
    const active = (request = new AbortController()),
      source = record.title + ' · 第 ' + current.page + ' 页\n' + current.text;
    const stream = $('.reader-turns'),
      item = document.createElement('article');
    item.className = 'reader-exchange';
    item.innerHTML =
      '<div class="reader-user">' +
      h(q) +
      '</div><div class="reader-answer"><b>' +
      avatar +
      ' 马小原</b><p data-answer>马小原正在阅读引文…</p></div>';
    stream.querySelectorAll('[data-reader=example]').forEach((b) => b.remove());
    stream.append(item);
    const answer = item.querySelector('[data-answer]');
    const update = (t) => {
      if (request === active) {
        answer.textContent = t;
        if (stream.scrollHeight - stream.scrollTop - stream.clientHeight < 200)
          stream.scrollTop = stream.scrollHeight;
      }
    };
    $('[data-reader=send]').textContent = '停止';
    $('[data-reader=send]').dataset.reader = 'stop';
    field.value = '';
    try {
      let text;
      if ($('[data-engine]').value === 'device') {
        const { deviceChat } = await import('./device-model.js');
        text = await deviceChat(q, source, turns.slice(-4), {
          signal: active.signal,
          status: update,
          update,
        });
      } else text = await streamAnswer(q, source, turns.slice(-4), active.signal, update);
      if (request !== active) return;
      turns.push({ q, a: text });
      answer.textContent = text;
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.reader = 'example';
      b.textContent = '再举一个例子';
      item.append(b);
    } catch (e) {
      if (request === active) {
        answer.textContent = active.signal.aborted ? '已停止回答。' : e.message;
        field.value = q;
      }
    } finally {
      if (request === active) {
        request = null;
        const b = $('[data-reader=stop]');
        if (b) {
          b.dataset.reader = 'send';
          b.textContent = '发送';
        }
      }
    }
  }
  box.addEventListener(
    'input',
    (e) => {
      if (mode === 'note' && e.target.matches('[data-title],[data-note],[data-tags]')) {
        dirty = true;
        saveDraft();
      }
    },
    { signal },
  );
  box.addEventListener(
    'change',
    (e) => {
      if (e.target.matches('[data-engine]'))
        $('[data-modelhint]').textContent =
          e.target.value === 'device' ? '首次约需下载 429 MB，引用文字在本设备处理。' : '';
    },
    { signal },
  );
  box.addEventListener(
    'keydown',
    (e) => {
      if (e.target.matches('[data-question]') && (e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        send().catch((x) => status(x.message));
      }
    },
    { signal },
  );
  box.addEventListener(
    'click',
    async (e) => {
      const cmd = e.target.closest('[data-reader]')?.dataset.reader;
      try {
        if (cmd === 'sheet') {
          if (!ignoreTap) foldSheet(!box.classList.contains('sheet-folded'));
          ignoreTap = false;
        }
        if (cmd === 'closepanel' && (await allowLeave())) hide();
        if (cmd === 'locate') await locate(current);
        if (cmd === 'save') store();
        if (cmd === 'send') await send();
        if (cmd === 'stop') request?.abort();
        if (cmd === 'example') await send('请针对同一段原文再举一个不同的例子。');
      } catch (err) {
        if (!signal.aborted) status(err.message);
      }
    },
    { signal },
  );
  return {
    open,
    allowLeave,
    hide,
    get current() {
      return box.hidden ? null : current;
    },
  };
}
