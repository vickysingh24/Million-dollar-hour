/* Million $ Hour: UI, storage, game layer, notifications, optional Supabase login/sync and Pro checkout. */
(() => {
  'use strict';

  const T = window.TB;
  const CFG = window.APP_CONFIG || {};
  // ?fast=1 makes every "minute" 1 second long, so you can test a full cycle in about a minute.
  const FAST = new URLSearchParams(location.search).get('fast') === '1';
  const MIN = FAST ? 1000 : 60000;
  const KEY = 'milliondollarhour.v2';
  const FREE_DAILY_LIMIT = Number(CFG.FREE_DAILY_LIMIT) || 0; // 0 = unlimited (use until payments are live)
  const MAX_TASKS = 10;
  const MAX_LEN = 120;
  const MAX_PARK = 20;
  const RING = 552.92; // 2 * PI * 88

  const $ = (id) => document.getElementById(id);
  const mk = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text; // textContent only: never innerHTML with user text (XSS)
    return e;
  };
  const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const money = (n) => (Math.round(n * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });

  // ---------- storage ----------
  function blank() {
    return { session: null, history: [], lastResult: null, carry: [], settings: { hourValue: 50, sound: true, vibrate: true }, totals: { xp: 0, value: 0, sessions: 0 } };
  }
  function sumHistory(history) {
    return history.reduce((a, h) => ({ xp: a.xp + (h.points || 0), value: a.value + (h.value || 0), sessions: a.sessions + 1 }), { xp: 0, value: 0, sessions: 0 });
  }
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d && typeof d === 'object') {
        const s = Object.assign(blank(), d);
        s.settings = Object.assign(blank().settings, d.settings || {});
        if (!Array.isArray(s.history)) s.history = [];
        if (!Array.isArray(s.carry)) s.carry = [];
        if (!s.totals || typeof s.totals.xp !== 'number') s.totals = sumHistory(s.history);
        if (s.session && (!Array.isArray(s.session.tasks) || typeof s.session.startedAt !== 'number')) s.session = null;
        return s;
      }
    } catch (e) { /* corrupted or blocked storage: start fresh */ }
    return blank();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage full/blocked */ } }

  let S = load();
  let curPhase = null;
  let sb = null, user = null, isPro = false;
  let wakeLockSentinel = null, audioCtx = null, installEvt = null, toastTimer = null;

  // ---------- helpers ----------
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 3500);
  }
  const fmtDate = (ts) => new Date(ts).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const limited = () => FREE_DAILY_LIMIT > 0 && !isPro && !FAST && T.todayCount(S.history, Date.now()) >= FREE_DAILY_LIMIT;
  const hourValue = () => (S.session && S.session.hourValue) || S.settings.hourValue;

  // ---------- phase signals (sound, vibration, notification) ----------
  function beep(freqs) {
    try {
      if (!audioCtx || !S.settings.sound) return;
      freqs.forEach((f, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        const t0 = audioCtx.currentTime + i * 0.18;
        o.type = 'triangle';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t0); o.stop(t0 + 0.18);
      });
    } catch (e) { /* audio blocked */ }
  }
  function signal(name) {
    const msg = {
      work: 'Planning done. Deep work starts now: only your tasks.',
      review: 'Review time. Tick what you finished.',
      done: 'Hour complete.'
    }[name];
    if (!msg) return;
    beep(name === 'work' ? [523, 659, 784] : name === 'review' ? [784, 659, 523] : [523, 659, 784, 1047]);
    try { if (S.settings.vibrate && navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) { /* ignore */ }
    toast(msg);
    try {
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden && navigator.serviceWorker) {
        navigator.serviceWorker.ready.then((r) => r.showNotification('Million $ Hour', { body: msg, icon: 'icon-192.png' }));
      }
    } catch (e) { /* ignore */ }
  }
  async function acquireWake() {
    try {
      if ('wakeLock' in navigator && S.session) wakeLockSentinel = await navigator.wakeLock.request('screen');
    } catch (e) { /* not supported or denied */ }
  }
  function releaseWake() {
    try { if (wakeLockSentinel) wakeLockSentinel.release(); } catch (e) { /* ignore */ }
    wakeLockSentinel = null;
  }

  // ---------- confetti ----------
  function confetti() {
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const cv = $('confetti');
      const ctx = cv.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
      ctx.scale(dpr, dpr);
      const colors = ['#fbbf24', '#8b5cf6', '#22d3ee', '#34d399', '#fb7185'];
      const parts = Array.from({ length: 140 }, () => ({
        x: innerWidth / 2, y: innerHeight * 0.35,
        vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
        s: 4 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
        c: colors[(Math.random() * colors.length) | 0]
      }));
      const t0 = performance.now();
      (function frame(now) {
        const t = now - t0;
        ctx.clearRect(0, 0, innerWidth, innerHeight);
        parts.forEach((p) => {
          p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.r += p.vr;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
          ctx.fillStyle = p.c; ctx.globalAlpha = Math.max(0, 1 - t / 2600);
          ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
          ctx.restore();
        });
        if (t < 2600) requestAnimationFrame(frame); else ctx.clearRect(0, 0, innerWidth, innerHeight);
      })(t0);
    } catch (e) { /* purely cosmetic */ }
  }

  // ---------- session flow ----------
  function startSession() {
    if (limited()) { render(); return; }
    // These need a user gesture, so they are set up on the Start click.
    try { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) { /* ignore */ }
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e) { /* ignore */ }
    S.session = { id: uid(), startedAt: Date.now(), pausedAt: null, tasks: [], parking: [], reward: '', hourValue: S.settings.hourValue };
    S.lastResult = null;
    save();
    curPhase = null;
    acquireWake();
    tick();
  }

  function resumeIfPaused() {
    const s = S.session;
    if (s && s.pausedAt != null) { s.startedAt += Date.now() - s.pausedAt; s.pausedAt = null; }
  }

  function togglePause() {
    const s = S.session;
    if (!s) return;
    if (s.pausedAt == null) s.pausedAt = Date.now(); else resumeIfPaused();
    save();
    tick();
  }

  function skipTo(target) {
    const s = S.session;
    if (!s) return;
    if (target === 'work' && s.tasks.length === 0) { toast('Add at least 1 task first.'); return; }
    resumeIfPaused();
    const now = Date.now();
    // The 1-hour box is fixed, so skipping ahead moves the start earlier (it never extends the block).
    s.startedAt = target === 'work' ? now - T.PLAN_MIN * MIN : now - (T.TOTAL_MIN - T.REVIEW_MIN) * MIN;
    save();
    tick();
  }

  function cancelSession() {
    if (!S.session) return;
    if (!confirm('Cancel this hour? It will not be saved and earns nothing.')) return;
    S.session = null; curPhase = null;
    save(); releaseWake(); render();
  }

  function finalize() {
    const s = S.session;
    if (!s) return;
    const sc = T.score(s.tasks);
    const value = T.valueEarned(s.hourValue, sc.pct);
    const lvlBefore = T.levelInfo(S.totals.xp).level;
    const badgesBefore = new Set(T.badgesOf(S.history).filter((b) => b.earned).map((b) => b.id));

    const entry = {
      id: s.id, startedAt: s.startedAt, done: sc.done, total: sc.total, pct: sc.pct,
      points: sc.points, value, hourValue: s.hourValue, earned: sc.earned, reward: s.reward,
      tasks: s.tasks.map((t) => ({ text: t.text, done: !!t.done })), parking: s.parking
    };
    S.history.unshift(entry);
    S.history = S.history.slice(0, 500);
    S.totals = { xp: S.totals.xp + sc.points, value: Math.round((S.totals.value + value) * 100) / 100, sessions: S.totals.sessions + 1 };
    S.carry = s.tasks.filter((t) => !t.done).map((t) => t.text).slice(0, MAX_TASKS);
    S.lastResult = entry;
    S.session = null;
    curPhase = null;

    const lvlAfter = T.levelInfo(S.totals.xp);
    const newBadges = T.badgesOf(S.history).filter((b) => b.earned && !badgesBefore.has(b.id));
    save(); releaseWake(); signal('done'); render();
    showResult(entry, { levelUp: lvlAfter.level > lvlBefore ? lvlAfter : null, newBadges });
    syncSession(entry);
  }

  function tick() {
    const s = S.session;
    if (!s) return;
    const p = T.phaseOf(s, Date.now(), MIN);
    if (p.name === 'end') { finalize(); return; }
    if (p.name !== curPhase) {
      const first = curPhase === null;
      curPhase = p.name;
      if (!first) signal(p.name);
      render();
    }
    paint(p);
  }

  // ---------- tasks ----------
  function addTask(text) {
    const s = S.session;
    if (!s || curPhase !== 'plan') return;
    text = text.trim().slice(0, MAX_LEN);
    if (!text) return;
    if (s.tasks.length >= MAX_TASKS) { toast('Max 10 tasks.'); return; }
    s.tasks.push({ id: uid(), text, done: false });
    save(); renderPlan();
  }
  function removeTask(id) {
    const s = S.session;
    if (!s || curPhase !== 'plan') return;
    s.tasks = s.tasks.filter((t) => t.id !== id);
    save(); renderPlan();
  }
  function addPark(text) {
    const s = S.session;
    if (!s) return;
    text = text.trim().slice(0, MAX_LEN);
    if (!text || s.parking.length >= MAX_PARK) return;
    s.parking.push(text);
    save(); renderParkList();
  }

  // ---------- rendering ----------
  const LABELS = { plan: 'Planning', work: 'Deep work', review: 'Review' };
  const HINTS = { plan: 'write your tasks', work: 'protect the hour', review: 'tick honestly' };
  const PHASE_LEN = { plan: T.PLAN_MIN, work: T.TOTAL_MIN - T.PLAN_MIN - T.REVIEW_MIN, review: T.REVIEW_MIN };

  function paint(p) {
    const s = S.session;
    const paused = s && s.pausedAt != null;
    $('clock').textContent = T.mmss(p.left);
    $('phaseLabel').textContent = LABELS[p.name] + (paused ? ' · paused' : '');
    $('phaseHint').textContent = paused ? 'tap resume to continue' : HINTS[p.name];
    $('pauseBtn').textContent = paused ? 'Resume' : 'Pause';
    const frac = Math.max(0, Math.min(1, p.left / (PHASE_LEN[p.name] * MIN)));
    $('ringFg').style.strokeDashoffset = String(RING * (1 - frac));
    const pct = Math.min(100, (p.el / (T.TOTAL_MIN * MIN)) * 100);
    $('progCover').style.width = (100 - pct) + '%';
    document.title = T.mmss(p.left) + ' · ' + LABELS[p.name];
  }

  function renderHud() {
    const lv = T.levelInfo(S.totals.xp);
    $('lvlNum').textContent = String(lv.level);
    $('lvlTitle').textContent = lv.title;
    $('xpText').textContent = lv.into + ' / ' + lv.span + ' XP';
    $('xpBar').style.width = lv.pct + '%';
    $('statStreak').textContent = String(T.streakOf(S.history, Date.now()));
    $('statVault').textContent = money(S.totals.value);
  }

  function render() {
    const s = S.session;
    const name = s ? (curPhase || T.phaseOf(s, Date.now(), MIN).name) : 'idle';
    document.body.dataset.phase = name;
    ['idle', 'plan', 'work', 'review'].forEach((n) => $('p-' + n).classList.toggle('hidden', n !== name));
    $('timerCard').classList.toggle('hidden', !s);
    if (!s) document.title = 'Million $ Hour';
    renderHud();
    if (name === 'idle') renderIdle();
    if (name === 'plan') {
      renderPlan();
      if ($('rewardInput').dataset.sid !== s.id) { $('rewardInput').value = s.reward; $('rewardInput').dataset.sid = s.id; }
      $('planValue').textContent = 'Finish everything to earn up to $' + money(hourValue()) + '. Partial progress earns a share.';
    }
    if (name === 'work') renderWork();
    if (name === 'review') renderReview();
  }

  function renderIdle() {
    const now = Date.now();
    $('heroValue').textContent = money(S.settings.hourValue);
    $('statToday').textContent = String(T.todayCount(S.history, now));
    $('statBest').textContent = String(T.bestStreak(S.history));
    $('statHours').textContent = String(S.totals.sessions);
    const lock = limited();
    $('startBtn').disabled = lock;
    $('limitNote').classList.toggle('hidden', !lock);
    $('limitN').textContent = String(FREE_DAILY_LIMIT);
    renderLast();
    renderBadges();
    renderHistory();
  }

  function renderBadges() {
    const grid = $('badgeGrid');
    clear(grid);
    const bs = T.badgesOf(S.history);
    $('badgeCount').textContent = bs.filter((b) => b.earned).length + '/' + bs.length;
    bs.forEach((b) => {
      const d = mk('div', 'badge' + (b.earned ? ' on' : ''));
      d.title = b.name + ': ' + b.desc;
      d.appendChild(mk('span', 'ic', b.icon));
      d.appendChild(mk('span', 'nm', b.name));
      grid.appendChild(d);
    });
  }

  function renderLast() {
    const box = $('lastResult');
    const r = S.lastResult;
    clear(box);
    box.classList.toggle('hidden', !r);
    if (!r) return;
    box.appendChild(mk('div', 'eyebrow', 'Last hour'));
    box.appendChild(mk('div', 'res-big', r.done + '/' + r.total + ' tasks · ' + r.pct + '%'));
    box.appendChild(mk('div', 'center gold', '+$' + money(r.value || 0) + ' value · +' + (r.points || 0) + ' XP'));
    const line = r.earned ? 'Reward unlocked: ' + (r.reward || 'you earned it!') : 'Reward locked. ' + T.REWARD_PCT + '%+ was needed' + (r.reward ? ' (' + r.reward + ')' : '') + '.';
    box.appendChild(mk('div', 'unlock ' + (r.earned ? 'on' : 'off'), line));
    const b = mk('button', 'btn btn-outline', 'Share result card');
    b.style.marginTop = '0.8rem'; b.style.minHeight = '44px'; b.style.fontSize = '0.9rem';
    b.addEventListener('click', () => shareCard(r));
    box.appendChild(b);
  }

  function renderHistory() {
    const ul = $('historyList');
    clear(ul);
    const items = S.history.slice(0, 7);
    $('historyEmpty').classList.toggle('hidden', items.length > 0);
    items.forEach((h) => {
      const li = mk('li', 'res-row');
      li.appendChild(mk('span', null, fmtDate(h.startedAt)));
      li.appendChild(mk('b', 'muted', h.done + '/' + h.total + ' · $' + money(h.value || 0) + ' · +' + (h.points || 0)));
      ul.appendChild(li);
    });
  }

  function renderPlan() {
    const s = S.session;
    const ul = $('planList');
    clear(ul);
    s.tasks.forEach((t) => {
      const li = mk('li', 'task');
      li.appendChild(mk('span', null, t.text));
      const b = mk('button', 'x-btn', '×');
      b.type = 'button';
      b.setAttribute('aria-label', 'Remove task');
      b.addEventListener('click', () => removeTask(t.id));
      li.appendChild(b);
      ul.appendChild(li);
    });
    // carry-over chips: unfinished tasks from the last hour that are not already planned
    const have = new Set(s.tasks.map((t) => t.text));
    const left = S.carry.filter((c) => !have.has(c));
    $('carryBox').classList.toggle('hidden', left.length === 0);
    const cl = $('carryList');
    clear(cl);
    left.forEach((c) => {
      const b = mk('button', 'chip-btn', '+ ' + c);
      b.type = 'button';
      b.addEventListener('click', () => { addTask(c); S.carry = S.carry.filter((x) => x !== c); save(); renderPlan(); });
      cl.appendChild(b);
    });
  }

  function renderParkList() {
    const s = S.session;
    const ul = $('parkList');
    clear(ul);
    s.parking.forEach((p) => ul.appendChild(mk('li', null, '• ' + p)));
  }

  function renderWork() {
    const s = S.session;
    const ul = $('workList');
    clear(ul);
    if (s.tasks.length === 0) ul.appendChild(mk('li', 'small muted', 'No tasks were planned. Do one thing that matters.'));
    s.tasks.forEach((t) => ul.appendChild(mk('li', 'task big', t.text)));
    $('workReward').textContent = s.reward ? 'Reward waiting: ' + s.reward : 'No reward set.';
    renderParkList();
  }

  function renderReview() {
    const s = S.session;
    const ul = $('reviewList');
    clear(ul);
    if (s.tasks.length === 0) ul.appendChild(mk('li', 'small muted', 'There were no tasks this hour.'));
    s.tasks.forEach((t) => {
      const li = mk('li', 'task big');
      const label = mk('label', 'check');
      const cb = mk('input');
      cb.type = 'checkbox';
      cb.checked = !!t.done;
      cb.addEventListener('change', () => { t.done = cb.checked; save(); paintReviewScore(); });
      label.appendChild(cb);
      label.appendChild(mk('span', null, t.text));
      li.appendChild(label);
      ul.appendChild(li);
    });
    $('reviewParkBox').classList.toggle('hidden', s.parking.length === 0);
    const pl = $('reviewParkList');
    clear(pl);
    s.parking.forEach((p) => pl.appendChild(mk('li', null, '• ' + p)));
    paintReviewScore();
  }

  function paintReviewScore() {
    const s = S.session;
    const sc = T.score(s.tasks);
    $('reviewScore').textContent = sc.done + '/' + sc.total + ' · ' + sc.pct + '%';
    $('reviewValue').textContent = money(T.valueEarned(s.hourValue, sc.pct));
    $('reviewHint').textContent = '+' + sc.points + ' XP' + (sc.total > 0 && sc.done === sc.total ? ' (perfect bonus!)' : '');
    const r = $('reviewReward');
    r.className = 'unlock ' + (sc.earned ? 'on' : 'off');
    r.textContent = sc.earned ? '🎁 Reward unlocked' + (s.reward ? ': ' + s.reward : '') : '🔒 Reward locked. Need ' + T.REWARD_PCT + '%+' + (s.reward ? ' for: ' + s.reward : '');
  }

  // ---------- result dialog + share card ----------
  function showResult(r, info) {
    const body = $('resultBody');
    clear(body);
    body.appendChild(mk('div', 'res-title', r.pct >= T.REWARD_PCT ? 'HOUR COMPLETE' : 'HOUR LOGGED'));
    body.appendChild(mk('div', 'res-big', r.done + '/' + r.total));
    body.appendChild(mk('div', 'center muted small', r.pct + '% of your plan'));
    const rows = [['Value earned', '$' + money(r.value || 0)], ['XP', '+' + (r.points || 0)], ['Streak', (() => { const n = T.streakOf(S.history, Date.now()); return n + (n === 1 ? ' day' : ' days'); })()]];
    const box = mk('div', null);
    box.style.margin = '0.8rem 0';
    rows.forEach((x) => { const d = mk('div', 'res-row'); d.appendChild(mk('span', 'muted', x[0])); d.appendChild(mk('b', null, x[1])); box.appendChild(d); });
    body.appendChild(box);
    if (info.levelUp) body.appendChild(mk('div', 'levelup', 'LEVEL UP! You are now Lv ' + info.levelUp.level + ' · ' + info.levelUp.title));
    if (info.newBadges.length) {
      body.appendChild(mk('div', 'center small muted', 'New badges'));
      const nb = mk('div', 'new-badges');
      info.newBadges.forEach((b) => nb.appendChild(mk('div', 'new-badge', b.icon + ' ' + b.name)));
      body.appendChild(nb);
    }
    body.appendChild(mk('div', 'unlock ' + (r.earned ? 'on' : 'off'), r.earned ? 'Reward unlocked: ' + (r.reward || 'you earned it!') : 'Reward locked this time. Next hour.'));
    const share = mk('button', 'btn btn-outline', 'Share result card');
    share.style.marginTop = '0.9rem'; share.style.minHeight = '44px'; share.style.fontSize = '0.9rem';
    share.addEventListener('click', () => shareCard(r));
    const close = mk('button', 'btn btn-primary', 'Back to base');
    close.style.marginTop = '0.6rem'; close.style.minHeight = '46px';
    close.addEventListener('click', () => $('resultDlg').close());
    body.appendChild(share);
    body.appendChild(close);
    const dlg = $('resultDlg');
    if (!dlg.open) dlg.showModal();
    if (r.pct >= T.REWARD_PCT || info.levelUp || info.newBadges.length) confetti();
  }

  function shareCard(r) {
    const W = 1080, H = 1350;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#0b1229'); g.addColorStop(1, '#1a1040');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const glow = c.createRadialGradient(W / 2, 360, 20, W / 2, 360, 700);
    glow.addColorStop(0, 'rgba(251,191,36,0.28)'); glow.addColorStop(1, 'rgba(251,191,36,0)');
    c.fillStyle = glow; c.fillRect(0, 0, W, H);
    c.textAlign = 'center';
    const F = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    c.fillStyle = '#e9edff'; c.font = '900 64px ' + F; c.fillText('Million $ Hour', W / 2, 150);
    c.fillStyle = '#8d98c8'; c.font = '700 34px ' + F; c.fillText('PLAN 5 · FOCUS 50 · REVIEW 5', W / 2, 215);
    c.fillStyle = '#fbbf24'; c.font = '900 260px ' + F; c.fillText(r.done + '/' + r.total, W / 2, 560);
    c.fillStyle = '#e9edff'; c.font = '800 54px ' + F; c.fillText(r.pct + '% of the plan finished', W / 2, 660);
    c.fillStyle = '#34d399'; c.font = '900 110px ' + F; c.fillText('$' + money(r.value || 0) + ' earned', W / 2, 840);
    const lv = T.levelInfo(S.totals.xp);
    c.fillStyle = '#e9edff'; c.font = '800 48px ' + F;
    c.fillText('Lv ' + lv.level + ' ' + lv.title + '   ·   🔥 ' + T.streakOf(S.history, Date.now()) + ' day streak', W / 2, 990);
    c.fillStyle = '#8d98c8'; c.font = '600 34px ' + F; c.fillText('Virtual value, real focus.', W / 2, 1230);
    c.fillText(location.host, W / 2, 1285);
    cv.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], 'million-dollar-hour.png', { type: 'image/png' });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Million $ Hour' }); return; }
      } catch (e) { if (e && e.name === 'AbortError') return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'million-dollar-hour.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('Card saved. Post it!');
    }, 'image/png');
  }

  // ---------- settings ----------
  function openSettings() {
    $('valueInput').value = S.settings.hourValue;
    $('soundInput').checked = !!S.settings.sound;
    $('vibeInput').checked = !!S.settings.vibrate;
    $('settingsDlg').showModal();
  }
  function saveSettings() {
    const v = Number($('valueInput').value);
    if (isFinite(v) && v >= 1 && v <= 100000) S.settings.hourValue = Math.round(v * 100) / 100;
    S.settings.sound = $('soundInput').checked;
    S.settings.vibrate = $('vibeInput').checked;
    save(); render();
  }
  function exportCSV() {
    const blob = new Blob(['﻿' + T.toCSV(S.history)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'million-dollar-hour-history.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function resetAll() {
    if (!confirm('Delete ALL your local data (history, XP, badges, settings)? This cannot be undone.')) return;
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    S = blank(); curPhase = null; releaseWake();
    $('settingsDlg').close();
    render();
    toast('All data deleted.');
  }

  // ---------- auth, Pro and cloud sync (all optional) ----------
  function initSupabase() {
    if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY || !window.supabase) return;
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    $('authBtn').classList.remove('hidden');
    // Do not await Supabase calls inside this callback (known deadlock): defer with setTimeout.
    sb.auth.onAuthStateChange((_evt, session) => setTimeout(() => setUser(session ? session.user : null), 0));
  }

  async function setUser(u) {
    user = u; isPro = false;
    if (u) {
      const { data } = await sb.from('profiles').select('is_pro').eq('id', u.id).maybeSingle();
      isPro = !!(data && data.is_pro); // UI hint only. The real lock is the RLS policy on the server.
      if (isPro) pullHistory();
    }
    $('authBtn').textContent = user ? 'Logout' : 'Login';
    $('proBadge').classList.toggle('hidden', !isPro);
    if (!S.session) renderIdle();
  }

  async function sendLink(email) {
    const msg = $('authMsg');
    msg.textContent = 'Sending…';
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    msg.textContent = error ? 'Error: ' + error.message : 'Check your email and click the link.';
  }

  function upgrade() {
    if (!CFG.CHECKOUT_URL || !/^https:\/\//.test(CFG.CHECKOUT_URL)) { toast('Payments are not set up yet.'); return; }
    if (!user) { if (sb) $('authDlg').showModal(); else toast('Set up login first.'); return; }
    const u = new URL(CFG.CHECKOUT_URL);
    // The webhook reads this custom user_id to know whom to unlock. Pro is granted only after the verified webhook.
    u.searchParams.set('checkout[custom][user_id]', user.id);
    u.searchParams.set('checkout[email]', user.email);
    location.href = u.toString();
  }

  async function syncSession(e) {
    if (!sb || !user || !isPro) return;
    const { error } = await sb.from('sessions').insert({
      started_at: new Date(e.startedAt).toISOString(), tasks: e.tasks,
      done_count: e.done, total_count: e.total, points: e.points, reward: e.reward || null
    });
    if (error && error.code !== '23505') toast('Cloud sync failed. Saved on this device.'); // 23505 = already synced
  }

  async function pullHistory() {
    const { data, error } = await sb.from('sessions').select('*').order('started_at', { ascending: false }).limit(100);
    if (error || !data) return;
    const have = new Set(S.history.map((h) => h.startedAt));
    data.forEach((r) => {
      const ts = Date.parse(r.started_at);
      if (have.has(ts)) return;
      const pct = r.total_count ? Math.round((r.done_count / r.total_count) * 100) : 0;
      S.history.push({ id: r.id, startedAt: ts, done: r.done_count, total: r.total_count, pct, points: r.points, value: T.valueEarned(S.settings.hourValue, pct), earned: pct >= T.REWARD_PCT, reward: r.reward || '', tasks: r.tasks || [], parking: [] });
    });
    S.history.sort((a, b) => b.startedAt - a.startedAt);
    S.history = S.history.slice(0, 500);
    const sums = sumHistory(S.history);
    S.totals = { xp: Math.max(S.totals.xp, sums.xp), value: Math.max(S.totals.value, sums.value), sessions: Math.max(S.totals.sessions, sums.sessions) };
    save();
    renderHud();
    if (!S.session) renderIdle();
  }

  // ---------- wiring ----------
  function init() {
    $('startBtn').addEventListener('click', startSession);
    $('pauseBtn').addEventListener('click', togglePause);
    $('cancelBtn').addEventListener('click', cancelSession);
    $('skipPlanBtn').addEventListener('click', () => skipTo('work'));
    $('reviewNowBtn').addEventListener('click', () => skipTo('review'));
    $('finishBtn').addEventListener('click', finalize);
    $('upgradeBtn').addEventListener('click', upgrade);
    $('editValueBtn').addEventListener('click', openSettings);
    $('settingsBtn').addEventListener('click', openSettings);
    $('settingsForm').addEventListener('submit', saveSettings);
    $('exportBtn').addEventListener('click', exportCSV);
    $('resetBtn').addEventListener('click', resetAll);
    $('taskForm').addEventListener('submit', (e) => { e.preventDefault(); addTask($('taskInput').value); $('taskInput').value = ''; $('taskInput').focus(); });
    $('parkForm').addEventListener('submit', (e) => { e.preventDefault(); addPark($('parkInput').value); $('parkInput').value = ''; });
    $('rewardInput').addEventListener('input', (e) => { if (S.session) { S.session.reward = e.target.value.slice(0, 100); save(); } });
    $('authBtn').addEventListener('click', () => { if (user) sb.auth.signOut(); else $('authDlg').showModal(); });
    $('authClose').addEventListener('click', () => $('authDlg').close());
    $('authForm').addEventListener('submit', (e) => { e.preventDefault(); sendLink($('emailInput').value.trim()); });
    $('installBtn').addEventListener('click', () => { if (installEvt) { installEvt.prompt(); installEvt = null; $('installBtn').classList.add('hidden'); } });
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('installBtn').classList.remove('hidden'); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (S.session) acquireWake(); tick(); } });

    if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

    initSupabase();
    render();
    if (S.session) acquireWake();
    tick();
    setInterval(tick, 250);
  }

  init();
})();
