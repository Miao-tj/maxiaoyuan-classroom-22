import { icon } from './ui.js';
const name = 'maxiaoyuan-learning',
  validId = (v) =>
    typeof v === 'string' &&
    /^[a-zA-Z0-9_-]{1,90}$/.test(v) &&
    !['constructor', '__proto__', 'prototype'].includes(v);
const bounded = (v, max) => typeof v === 'string' && v.length <= max;
export function learningBackup(data) {
  return {
    format: name,
    version: 1,
    threads: data.threads.map((t) => ({ ...t, draft: data.keepDraft === false ? '' : t.draft })),
    notes: data.notes,
    read: data.read,
    favorites: data.favorites,
    answers: data.answers,
  };
}
export function inspectBackup(text, questions, chapterIds) {
  if (text.length > 4 * 1024 * 1024) throw Error('备份最多 4 MB。');
  let v;
  try {
    v = JSON.parse(text);
  } catch {
    throw Error('请选择有效的 JSON 备份。');
  }
  if (
    v?.format !== name ||
    v.version !== 1 ||
    !Array.isArray(v.threads) ||
    !Array.isArray(v.notes) ||
    !Array.isArray(v.favorites) ||
    !v.read ||
    typeof v.read !== 'object' ||
    !v.answers ||
    typeof v.answers !== 'object'
  )
    throw Error('文件不符合马小原学习备份格式。');
  if (v.threads.length > 600 || v.notes.length > 2000) throw Error('备份中的记录数量过大。');
  const notes = v.notes.map((n) => {
    if (!validId(n?.id) || !bounded(n.title, 140) || !bounded(n.text, 16000))
      throw Error('有笔记格式不完整。');
    const note = { id: n.id, title: n.title, text: n.text };
    if (bounded(n.tags, 120)) note.tags = n.tags;
    if (validId(n.source?.id) && Number.isInteger(n.source.page) && n.source.page > 0)
      note.source = { id: n.source.id, page: n.source.page };
    return note;
  });
  const threads = v.threads.map((t) => {
    if (
      !validId(t?.id) ||
      !bounded(t.draft ?? '', 9000) ||
      !Array.isArray(t.turns) ||
      t.turns.length > 1000
    )
      throw Error('有对话格式不完整。');
    return {
      id: t.id,
      draft: t.draft || '',
      turns: t.turns.map((x) => {
        if (!bounded(x?.q, 9000) || !bounded(x.a, 100000)) throw Error('有问答内容超出限制。');
        return {
          q: x.q,
          a: x.a,
          ...(bounded(x.error, 300) ? { error: x.error } : {}),
          ...(x.source && validId(x.source.id) && bounded(x.source.title, 200)
            ? { source: { id: x.source.id, title: x.source.title } }
            : {}),
        };
      }),
    };
  });
  const ids = new Map(questions.map((x) => [x.id, x])),
    answers = {};
  for (const [id, a] of Object.entries(v.answers)) {
    const q = ids.get(id);
    if (q && q.options.some((o) => o.id === a?.choice))
      answers[id] = { choice: a.choice, correct: q.answerKeys.includes(a.choice) };
  }
  return {
    notes,
    threads,
    answers,
    read: Object.fromEntries(chapterIds.filter((id) => v.read[id]).map((id) => [id, true])),
    favorites: [...new Set(v.favorites.filter((id) => ids.has(id)))],
  };
}
export function mergeBackup(current, incoming) {
  const unique = (base, extras) => {
    const ids = new Set(base.map((x) => x.id));
    return [
      ...base,
      ...extras.filter((x) => {
        if (ids.has(x.id)) return false;
        ids.add(x.id);
        return true;
      }),
    ];
  };
  return {
    ...current,
    notes: unique(current.notes, incoming.notes),
    threads: unique(current.threads, incoming.threads),
    answers: { ...incoming.answers, ...current.answers },
    read: { ...incoming.read, ...current.read },
    favorites: [...new Set([...current.favorites, ...incoming.favorites])],
  };
}
export function settingsPage(data, action) {
  const row = (n, value, note) =>
    '<div class="privacy-row"><b>' +
    n +
    '</b><span class="tag">' +
    value +
    '</span><small>' +
    note +
    '</small></div>';
  return (
    '<div class="page privacy-page"><h1>设置与帮助</h1><div class="privacy-layout"><aside><strong>' +
    icon('lock') +
    '　隐私与数据</strong><a href="#chat">返回咨询室</a></aside><section><h2>隐私与数据</h2><p>管理个人内容、学习记录和使用偏好。</p><article class="card"><h3>私人学习内容</h3>' +
    row('对话内容', '仅自己可见', '保存在当前浏览器，提交问题时才发送给所选模型。') +
    row('个人笔记', '仅自己可见', '笔记保存至本站的当前浏览器。') +
    '</article><article class="card"><h3>教师可见范围</h3>' +
    row('私人聊天与笔记', '未共享', '教师不能通过班级课堂读取。') +
    row('班级作答和作品', '按课程身份', '教师可查看本班提交记录和作者授权范围。') +
    '</article><article class="card"><h3>学习记录来源</h3><div class="privacy-sources"><p><b>在线课程记录</b><br>本班讲义、首答与作品保存在云端。<br><a class="btn" href="./classroom.html">查看班级课堂</a></p><p><b>本机学习记录</b><br>' +
    data.notes.length +
    ' 条笔记 · ' +
    Object.keys(data.answers).length +
    ' 道已答练习<br>' +
    action('backup', '导出我的数据') +
    ' ' +
    action('import-backup', '预览并导入') +
    '</p></div></article><article class="card"><h3>使用偏好</h3>' +
    action('motion', data.reduce ? '减少动态效果　开' : '减少动态效果　关') +
    ' ' +
    action('keep-draft', data.keepDraft === false ? '保留未发送草稿　关' : '保留未发送草稿　开') +
    ' ' +
    action('intro', '重播开场动画') +
    '</article><article class="card"><h3>数据管理</h3>' +
    action('clear-learning', '清理本机学习记录') +
    '</article></section></div></div>'
  );
}
