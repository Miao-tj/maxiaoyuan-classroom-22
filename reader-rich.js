import { esc as h } from './ui.js';

function safeLink(address) {
  try {
    const url = new URL(address);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : '';
  } catch {
    return '';
  }
}
function inline(source, html, depth = 0) {
  const quote = (v) => (html ? h(v) : v);
  if (depth > 3) return quote(source);
  const token = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|\[([^\]\n]+)\]\((https?:\/\/[^\s()]+)\)/gi;
  let result = '',
    start = 0;
  for (const m of source.matchAll(token)) {
    result += quote(source.slice(start, m.index));
    start = m.index + m[0].length;
    const address = m[3] ? safeLink(m[4]) : '';
    if (m[3] && !address) {
      result += quote(m[0]);
      continue;
    }
    const t = inline(m[1] || m[2] || m[3], html, depth + 1);
    if (!html) {
      result += t;
      continue;
    }
    if (m[1]) result += '<strong>' + t + '</strong>';
    else if (m[2]) result += '<em>' + t + '</em>';
    else
      result +=
        '<a href="' + h(address) + '" target="_blank" rel="noopener noreferrer">' + t + '</a>';
  }
  return result + quote(source.slice(start));
}
export function formatNote(markdown) {
  let list = false,
    out = '';
  for (const raw of String(markdown ?? '').split(/\r?\n/)) {
    const bullet = /^\s*[-*] (.*)/.exec(raw);
    if (bullet) {
      if (!list) {
        out += '<ul>';
        list = true;
      }
      out += '<li>' + inline(bullet[1], true) + '</li>';
    } else {
      if (list) {
        out += '</ul>';
        list = false;
      }
      out += '<p>' + (inline(raw, true) || '<br>') + '</p>';
    }
  }
  return out + (list ? '</ul>' : '');
}
export function plainNote(markdown) {
  return String(markdown ?? '')
    .split(/\r?\n/)
    .map((line) => inline(line.replace(/^\s*[-*] /, '• '), false))
    .join('\n');
}
export function richToolbarMarkup() {
  return (
    '<div class="note-formatbar" role="toolbar" aria-label="笔记格式">' +
    '<button type="button" data-format="bold" aria-label="加粗" title="加粗（Ctrl+B）"><strong>B</strong></button>' +
    '<button type="button" data-format="italic" aria-label="斜体" title="斜体（Ctrl+I）"><em>I</em></button>' +
    '<button type="button" data-format="list" aria-label="项目列表" title="项目列表">☷</button>' +
    '<button type="button" data-format="link" aria-label="插入链接" title="插入链接">↗</button>' +
    '<button type="button" data-format="preview" aria-pressed="false">预览</button></div>'
  );
}
export function bindRichToolbar(container, textarea, { signal } = {}) {
  const bar = container.querySelector('.note-formatbar');
  if (!bar || !textarea) return;
  const seen = bar.dataset.bound;
  if (seen) return;
  bar.dataset.bound = 'true';
  const options = signal ? { signal } : {};
  let linkBox, preview;
  function replace(value, start, end, innerStart, innerEnd) {
    if (
      textarea.maxLength > 0 &&
      textarea.value.length - end + start + value.length > textarea.maxLength
    )
      return;
    textarea.setRangeText(value, start, end, 'end');
    textarea.focus();
    textarea.setSelectionRange(innerStart, innerEnd);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function apply(format) {
    if (format === 'preview') {
      const enabled =
        bar.querySelector('[data-format=preview]').getAttribute('aria-pressed') !== 'true';
      if (!preview) {
        preview = document.createElement('article');
        preview.className = 'formatted-note-preview';
        textarea.after(preview);
      }
      preview.innerHTML = formatNote(textarea.value);
      preview.hidden = !enabled;
      textarea.hidden = enabled;
      for (const b of bar.querySelectorAll('button'))
        if (b.dataset.format !== 'preview') b.disabled = enabled;
      const b = bar.querySelector('[data-format=preview]');
      b.setAttribute('aria-pressed', String(enabled));
      b.textContent = enabled ? '继续编辑' : '预览';
      if (linkBox) {
        linkBox.remove();
        linkBox = null;
      }
      if (!enabled) textarea.focus();
      return;
    }
    const s = textarea.selectionStart,
      e = textarea.selectionEnd,
      text = textarea.value.slice(s, e);
    if (format === 'link') {
      if (linkBox) {
        linkBox.querySelector('input').focus();
        return;
      }
      const row = (linkBox = document.createElement('div'));
      row.className = 'note-link-box';
      row.innerHTML =
        '<label>链接地址<input type="url" placeholder="https://"></label><button type="button">插入</button><button type="button">取消</button><small role="status"></small>';
      bar.after(row);
      const field = row.querySelector('input');
      field.focus();
      const insert = () => {
        const link = safeLink(field.value.trim());
        if (!link) {
          row.querySelector('small').textContent = '请填写 http 或 https 网址。';
          return;
        }
        const title = text || '参考链接',
          value = '[' + title + '](' + link + ')';
        row.remove();
        linkBox = null;
        replace(value, s, e, s + 1, s + 1 + title.length);
      };
      const cancel = () => {
        row.remove();
        linkBox = null;
        textarea.focus();
        textarea.setSelectionRange(s, e);
      };
      row.querySelectorAll('button')[0].addEventListener('click', insert, options);
      row.querySelectorAll('button')[1].addEventListener('click', cancel, options);
      field.addEventListener(
        'keydown',
        (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            insert();
          }
          if (ev.key === 'Escape') {
            ev.preventDefault();
            ev.stopPropagation();
            cancel();
          }
        },
        options,
      );
      return;
    }
    if (format === 'list') {
      const a = textarea.value.lastIndexOf('\n', Math.max(0, s - 1)) + 1;
      const after = textarea.value.indexOf('\n', e),
        b = after < 0 ? textarea.value.length : after;
      const lines = textarea.value.slice(a, b).split('\n'),
        remove = lines.every((l) => l.startsWith('- '));
      const value = lines.map((l) => (remove ? l.slice(2) : '- ' + l)).join('\n');
      replace(value, a, b, a + (!remove ? 2 : 0), a + value.length);
      return;
    }
    const marker = format === 'bold' ? '**' : '*';
    if (
      s >= marker.length &&
      textarea.value.slice(s - marker.length, s) === marker &&
      textarea.value.slice(e, e + marker.length) === marker
    ) {
      replace(text, s - marker.length, e + marker.length, s - marker.length, e - marker.length);
      return;
    }
    const inside = text || (format === 'bold' ? '重点内容' : '补充说明');
    replace(marker + inside + marker, s, e, s + marker.length, s + marker.length + inside.length);
  }
  bar.addEventListener(
    'pointerdown',
    (e) => {
      if (e.target.closest('button')) e.preventDefault();
    },
    options,
  );
  bar.addEventListener(
    'click',
    (e) => {
      const b = e.target.closest('[data-format]');
      if (b) apply(b.dataset.format);
    },
    options,
  );
  textarea.addEventListener(
    'keydown',
    (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && ['b', 'i'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        apply(e.key.toLowerCase() === 'b' ? 'bold' : 'italic');
      }
    },
    options,
  );
}
