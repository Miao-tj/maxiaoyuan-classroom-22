/** Optional, local-only welcome scene. Nothing mounts or animates until open(). */
export const INTRO_DURATION = 2400;
export const PARTICLE_COUNT = 400;
export function introPhase(elapsed) {
  return elapsed < 400 ? 'depart' : elapsed < 1800 ? 'travel' : elapsed < INTRO_DURATION ? 'reveal' : 'complete';
}
export function createWorkspaceIntro({ document: doc = globalThis.document, window: win = globalThis.window, reducedMotion = () => false, onComplete = () => {} } = {}) {
  let dialog = null, canvas, context, enter, skip, previousFocus, frame = 0, last = null;
  let entering = false, elapsed = 0, disposed = false, width = 1, height = 1, stars = [];
  const media = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const isReduced = () => Boolean(reducedMotion() || media?.matches);
  function stop() { if (frame) win.cancelAnimationFrame(frame); frame = 0; last = null; }
  function finish(reason = 'enter', notify = true) {
    if (!dialog) return;
    stop();
    doc.removeEventListener('visibilitychange', visibility);
    win.removeEventListener('resize', resize);
    media?.removeEventListener?.('change', motionChange);
    const old = dialog; dialog = null;
    old.close?.(); old.remove();
    entering = false;
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    if (notify) onComplete({ reason });
  }
  function resize() {
    if (!dialog) return;
    width = Math.max(1, win.innerWidth); height = Math.max(1, win.innerHeight);
    const dpr = Math.min(win.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    context?.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint(0);
  }
  function resetStar(star, edge = false) {
    star.angle = Math.random() * Math.PI * 2;
    star.radius = edge ? 0.015 + Math.random() * 0.08 : Math.sqrt(Math.random()) * 1.3;
    star.size = 0.35 + Math.random() * 1.2;
    star.alpha = 0.18 + Math.random() * 0.56;
    return star;
  }
  function paint(delta) {
    if (!context) return;
    context.clearRect(0, 0, width, height);
    const travel = entering ? Math.min(1, Math.max(0, (elapsed - 400) / 650)) : 0;
    const extent = Math.hypot(width, height) * 0.55;
    for (const star of stars) {
      const before = star.radius;
      star.radius += delta * (0.000003 + travel * (0.0001 + star.radius * 0.0013));
      if (star.radius > 1.4) resetStar(star, true);
      const x = Math.cos(star.angle), y = Math.sin(star.angle);
      const radius = star.radius * extent;
      context.strokeStyle = `rgba(211,199,255,${star.alpha})`;
      context.fillStyle = context.strokeStyle;
      if (travel > 0 && star.radius >= before) {
        const tail = Math.max(0, radius - (3 + radius * travel * 0.14));
        context.lineWidth = star.size * 0.8;
        context.beginPath(); context.moveTo(width / 2 + x * tail, height / 2 + y * tail);
        context.lineTo(width / 2 + x * radius, height / 2 + y * radius); context.stroke();
      } else {
        context.beginPath(); context.arc(width / 2 + x * radius, height / 2 + y * radius, star.size, 0, Math.PI * 2); context.fill();
      }
    }
  }
  function tick(now) {
    frame = 0;
    if (!dialog || doc.hidden) return;
    const delta = last === null ? 0 : Math.min(now - last, 64); last = now;
    if (isReduced()) { if (entering) finish(); else { dialog.classList.add('wi-reduced'); paint(0); } return; }
    if (entering) {
      elapsed += delta;
      const phase = introPhase(elapsed);
      if (phase === 'complete') { finish(); return; }
      dialog.dataset.phase = phase;
    }
    paint(delta); frame = win.requestAnimationFrame(tick);
  }
  function start() { if (dialog && !doc.hidden && !frame && !isReduced()) frame = win.requestAnimationFrame(tick); }
  function visibility() {
    if (doc.hidden) { stop(); dialog?.classList.add('wi-paused'); if (entering) finish(); }
    else { dialog?.classList.remove('wi-paused'); start(); }
  }
  function motionChange() {
    if (!dialog) return;
    dialog.classList.toggle('wi-reduced', isReduced());
    if (isReduced()) { stop(); if (entering) finish(); } else start();
  }
  function begin() {
    if (!dialog || entering) return;
    if (isReduced() || doc.hidden) { finish(); return; }
    entering = true; elapsed = 0;
    dialog.dataset.phase = 'depart';
    // The visible skip control remains focused and usable during the flight.
    skip.focus({ preventScroll: true });
    start();
  }
  function open() {
    if (disposed || dialog) return false;
    previousFocus = doc.activeElement;
    dialog = doc.createElement('dialog');
    dialog.className = 'workspace-intro';
    dialog.setAttribute('aria-labelledby', 'wi-title');
    dialog.setAttribute('aria-describedby', 'wi-description');
    dialog.innerHTML = `<canvas class="wi-stars" aria-hidden="true"></canvas>
      <div class="wi-wash" aria-hidden="true"></div>
      <div class="wi-brand" aria-hidden="true"><span>原</span> 马小原</div>
      <button class="wi-skip" type="button">跳过动画 <span aria-hidden="true">↗</span></button>
      <div class="wi-orbit" aria-hidden="true">
        <div class="wi-card wi-card-course"><div class="wi-paper"><span class="wi-card-eyebrow">LEARN / 01</span><h3>课程学习</h3><div class="wi-sphere"></div><p>理解原理<br>连接现实</p><div class="wi-card-rule"></div><small>马克思主义基本原理</small></div></div>
        <div class="wi-card wi-card-library"><div class="wi-paper"><span class="wi-card-eyebrow">READ / 02</span><h3>课程知识库</h3><div class="wi-lines"><i></i><i></i><i></i><i></i></div><div class="wi-quote">从问题出发<br>回到原文</div><div class="wi-lines"><i></i><i></i><i></i></div></div></div>
        <div class="wi-card wi-card-practice"><div class="wi-paper"><span class="wi-card-eyebrow">PRACTICE / 03</span><h3>刷题练习</h3><div class="wi-choice"><b>A</b><i></i></div><div class="wi-choice"><b>B</b><i></i></div><div class="wi-choice"><b>C</b><i></i></div><div class="wi-card-rule"></div><small>练习 · 回顾 · 再理解</small></div></div>
        <div class="wi-card wi-card-radar"><div class="wi-paper"><span class="wi-card-eyebrow">REFLECT / 04</span><h3>学情分析</h3><div class="wi-radar"><div></div><i></i><b></b></div><small>让每一步学习都有迹可循</small></div></div>
      </div>
      <section class="wi-center"><p class="wi-eyebrow">你的马原学习空间</p><h1 id="wi-title">把问题带进来。</h1><p id="wi-description">与马小原一起，读懂原理，展开思考。</p><button class="wi-enter" type="button">进入工作台 <span aria-hidden="true">→</span></button><p class="wi-footnote">课程 · 资料 · 练习 · 学情</p></section>`;
    canvas = dialog.querySelector('canvas'); context = canvas.getContext('2d');
    enter = dialog.querySelector('.wi-enter'); skip = dialog.querySelector('.wi-skip');
    enter.addEventListener('click', begin); skip.addEventListener('click', () => finish('skip'));
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish('escape'); });
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); finish('escape'); }
      if (event.key === 'Tab') {
        // Two controls only; prevent focus moving onto the inert workspace.
        event.preventDefault();
        (entering || doc.activeElement === enter ? skip : enter).focus();
      }
    });
    stars = Array.from({ length: PARTICLE_COUNT }, () => resetStar({}));
    doc.body.append(dialog);
    if (typeof dialog.showModal !== 'function') { finish('unsupported'); return false; }
    dialog.showModal();
    dialog.classList.toggle('wi-reduced', isReduced());
    doc.addEventListener('visibilitychange', visibility);
    win.addEventListener('resize', resize);
    media?.addEventListener?.('change', motionChange);
    resize(); enter.focus({ preventScroll: true }); start();
    return true;
  }
  return { open, close: () => finish('skip'), destroy() { disposed = true; finish('destroy', false); }, get isOpen() { return Boolean(dialog); } };
}
