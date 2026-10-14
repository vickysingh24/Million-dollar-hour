/* Pure logic for Million $ Hour. No DOM here, so it can be tested in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TB = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PLAN_MIN = 5;
  const REVIEW_MIN = 5;
  const TOTAL_MIN = 60;
  const REWARD_PCT = 70; // reward "earned" at or above this completion %

  // session = { startedAt, pausedAt|null }
  // minMs = milliseconds per "minute" (60000 normally, 1000 in fast test mode)
  // Phase is derived from timestamps, never from counting ticks,
  // so it stays correct when the tab is throttled, the phone sleeps, or the page reloads.
  function phaseOf(session, now, minMs) {
    const el = (session.pausedAt != null ? session.pausedAt : now) - session.startedAt;
    const planEnd = PLAN_MIN * minMs;
    const total = TOTAL_MIN * minMs;
    const workEnd = total - REVIEW_MIN * minMs;
    if (el < planEnd) return { name: 'plan', left: planEnd - el, el: Math.max(0, el) };
    if (el < workEnd) return { name: 'work', left: workEnd - el, el };
    if (el < total) return { name: 'review', left: total - el, el };
    return { name: 'end', left: 0, el: total };
  }

  function score(tasks) {
    const total = tasks.length;
    const done = tasks.filter((t) => t.done).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const bonus = total > 0 && done === total ? 20 : 0;
    return { done, total, pct, points: done * 10 + bonus, earned: total > 0 && pct >= REWARD_PCT };
  }

  // "Value earned" = what your hour was worth to you x how much of the plan you finished.
  // It is a motivational number, not money.
  function valueEarned(hourValue, pct) {
    const v = Number(hourValue);
    if (!isFinite(v) || v <= 0) return 0;
    return Math.round(v * Math.max(0, Math.min(100, pct))) / 100;
  }

  // ---- levels / XP ----
  const TITLES = ['Rookie', 'Apprentice', 'Focused', 'Builder', 'Strategist', 'Operator', 'Architect', 'Titan', 'Legend'];
  const xpForLevel = (l) => 50 * (l - 1) * (l - 1); // L1=0, L2=50, L3=200, L4=450, L5=800 ...

  function levelInfo(xp) {
    xp = Math.max(0, xp | 0);
    const level = Math.floor(Math.sqrt(xp / 50)) + 1;
    const base = xpForLevel(level);
    const next = xpForLevel(level + 1);
    return {
      level, title: TITLES[Math.min(level - 1, TITLES.length - 1)],
      into: xp - base, span: next - base, pct: Math.round(((xp - base) / (next - base)) * 100), toNext: next - xp
    };
  }

  // ---- calendar helpers ----
  function dayKey(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function todayCount(history, now) {
    const k = dayKey(now);
    return history.filter((h) => dayKey(h.startedAt) === k).length;
  }

  // Consecutive days with at least one session, ending today (or yesterday, so the streak
  // is not shown as broken before the person has had a chance to do today's session).
  function streakOf(history, now) {
    const days = new Set(history.map((h) => dayKey(h.startedAt)));
    const d = new Date(now);
    if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
    let n = 0;
    while (days.has(dayKey(d))) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  function bestStreak(history) {
    const days = Array.from(new Set(history.map((h) => dayKey(h.startedAt)))).sort();
    let best = 0, run = 0, prev = null;
    days.forEach((k) => {
      const [y, m, d] = k.split('-').map(Number);
      const cur = new Date(y, m - 1, d).getTime();
      run = prev !== null && Math.round((cur - prev) / 86400000) === 1 ? run + 1 : 1;
      prev = cur;
      if (run > best) best = run;
    });
    return best;
  }

  // ---- badges ----
  const BADGES = [
    { id: 'first', icon: '🚀', name: 'First Hour', desc: 'Finish your first session', test: (h) => h.length >= 1 },
    { id: 'perfect', icon: '💎', name: 'Perfect Hour', desc: '100% of tasks done (3+ tasks)', test: (h) => h.some((s) => s.total >= 3 && s.done === s.total) },
    { id: 'bigplan', icon: '🧱', name: 'Big Plan', desc: 'Finish 5+ tasks in one hour', test: (h) => h.some((s) => s.done >= 5) },
    { id: 'streak3', icon: '🔥', name: 'On Fire', desc: '3-day streak', test: (h) => bestStreak(h) >= 3 },
    { id: 'streak7', icon: '⚡', name: 'Unstoppable', desc: '7-day streak', test: (h) => bestStreak(h) >= 7 },
    { id: 'ten', icon: '🏆', name: '10 Hours', desc: 'Finish 10 sessions', test: (h) => h.length >= 10 },
    { id: 'fifty', icon: '👑', name: '50 Hours', desc: 'Finish 50 sessions', test: (h) => h.length >= 50 }
  ];

  function badgesOf(history) {
    return BADGES.map((b) => ({ id: b.id, icon: b.icon, name: b.name, desc: b.desc, earned: !!b.test(history) }));
  }

  // ---- export ----
  function csvCell(v) {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function toCSV(history) {
    const head = ['date', 'tasks_done', 'tasks_total', 'percent', 'xp', 'value_earned', 'reward', 'tasks'];
    const rows = history.map((h) => [
      new Date(h.startedAt).toISOString(), h.done, h.total, h.pct, h.points || 0, h.value || 0, h.reward || '',
      (h.tasks || []).map((t) => (t.done ? '[x] ' : '[ ] ') + t.text).join(' | ')
    ]);
    return [head].concat(rows).map((r) => r.map(csvCell).join(',')).join('\n');
  }

  function mmss(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  return {
    PLAN_MIN, REVIEW_MIN, TOTAL_MIN, REWARD_PCT,
    phaseOf, score, valueEarned, levelInfo, xpForLevel, dayKey, todayCount, streakOf, bestStreak, badgesOf, toCSV, mmss
  };
});
