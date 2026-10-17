/* Gold Replay engine: data, candle aggregation, trade simulation, process scoring. No DOM. */
(function (root) {
  'use strict';
  const SPREAD = 0.30;   // USD per oz, applied half each side on market entry/exit
  const LEV = 20;
  const E = { SPREAD, LEV };
  let A = null, N = 0;   // interleaved Int32: t(min), o, h, l, c (cents), vol

  E.setBuffers = function (bufs) {
    let total = 0;
    for (const b of bufs) total += b.byteLength / 4;
    A = new Int32Array(total);
    let o = 0;
    for (const b of bufs) { A.set(new Int32Array(b), o); o += b.byteLength / 4; }
    N = total / 6;
  };
  E.n = () => N;
  E.t = (i) => A[i * 6];
  E.bar = (i) => ({ t: A[i * 6], o: A[i * 6 + 1] / 100, h: A[i * 6 + 2] / 100, l: A[i * 6 + 3] / 100, c: A[i * 6 + 4] / 100 });
  E.close = (i) => A[i * 6 + 4] / 100;

  // largest index with t <= tmin, or -1
  E.find = function (tmin) {
    let lo = 0, hi = N - 1, ans = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (A[m * 6] <= tmin) { ans = m; lo = m + 1; } else hi = m - 1;
    }
    return ans;
  };

  // last `count` candles of timeframe tf (minutes) ending at 1m index `end` (inclusive)
  E.candles = function (tf, end, count) {
    const out = [];
    let i = end, curB = null, c = null;
    while (i >= 0) {
      const b = Math.floor(A[i * 6] / tf);
      if (b !== curB) {
        if (c) { out.push(c); if (out.length >= count) { c = null; break; } }
        curB = b;
        c = { time: b * tf * 60, open: A[i * 6 + 1] / 100, high: A[i * 6 + 2] / 100, low: A[i * 6 + 3] / 100, close: A[i * 6 + 4] / 100 };
      } else {
        c.open = A[i * 6 + 1] / 100;
        const h = A[i * 6 + 2] / 100, l = A[i * 6 + 3] / 100;
        if (h > c.high) c.high = h;
        if (l < c.low) c.low = l;
      }
      i--;
    }
    if (c) out.push(c);
    out.reverse();
    return out;
  };

  // fold 1m bar i into running candle c (or start a new one)
  E.mergeBar = function (c, tf, i) {
    const b = E.bar(i);
    const time = Math.floor(b.t / tf) * tf * 60;
    if (c && c.time === time) {
      if (b.h > c.high) c.high = b.h;
      if (b.l < c.low) c.low = b.l;
      c.close = b.c;
      return c;
    }
    return { time, open: b.o, high: b.h, low: b.l, close: b.c };
  };

  // ---- sizing & trades ----
  E.size = function (balance, riskPct, entry, sl) {
    const dist = Math.abs(entry - sl);
    if (!(dist > 0) || !(balance > 0)) return { units: 0, riskUsd: 0, notional: 0, margin: 0, capped: false, dist };
    const riskWanted = balance * riskPct / 100;
    let units = riskWanted / dist;
    const maxUnits = balance * LEV / entry;
    let capped = false;
    if (units > maxUnits) { units = maxUnits; capped = true; }
    units = Math.floor(units * 100) / 100;
    return { units, riskUsd: units * dist, notional: units * entry, margin: units * entry / LEV, capped, dist };
  };

  E.openTrade = function (o) {
    const entry = o.price + (o.dir > 0 ? SPREAD / 2 : -SPREAD / 2);
    const sz = E.size(o.balance, o.riskPct, entry, o.sl);
    return {
      id: Date.now() + '-' + Math.floor(Math.random() * 1e6),
      dir: o.dir, t0: o.t, entry, sl: o.sl, sl0: o.sl, tp: o.tp, units: sz.units,
      riskUsd: sz.riskUsd, riskPct: o.riskPct, capped: sz.capped,
      rr0: o.tp ? Math.abs(o.tp - entry) / Math.abs(entry - o.sl) : 0,
      check: o.check, note: o.note || '', ctx: o.ctx || {}, widened: false, moved: false,
    };
  };

  E.setStop = function (tr, newSl) {
    const oldDist = Math.abs(tr.entry - tr.sl), newDist = Math.abs(tr.entry - newSl);
    const worse = tr.dir > 0 ? newSl < tr.sl : newSl > tr.sl;
    if (worse && newDist > oldDist) tr.widened = true;
    if (newSl !== tr.sl) tr.moved = true;
    tr.sl = newSl;
  };

  // check bar i against open trade; returns {price, reason} or null
  E.stepTrade = function (tr, i) {
    const b = E.bar(i);
    if (tr.dir > 0) {
      if (b.l <= tr.sl) return { price: Math.min(b.o, tr.sl), reason: 'SL' };
      if (tr.tp && b.h >= tr.tp) return { price: Math.max(b.o, tr.tp), reason: 'TP' };
    } else {
      if (b.h >= tr.sl) return { price: Math.max(b.o, tr.sl), reason: 'SL' };
      if (tr.tp && b.l <= tr.tp) return { price: Math.min(b.o, tr.tp), reason: 'TP' };
    }
    return null;
  };

  E.floating = function (tr, price) {
    const exit = price - tr.dir * SPREAD / 2;
    return tr.units * (exit - tr.entry) * tr.dir;
  };

  E.closeTrade = function (tr, price, t, reason) {
    const exit = reason === 'MANUAL' ? price - tr.dir * SPREAD / 2 : price;
    tr.exit = exit; tr.t1 = t; tr.reason = reason;
    tr.pnl = tr.units * (exit - tr.entry) * tr.dir;
    tr.r = tr.riskUsd > 0 ? tr.pnl / tr.riskUsd : 0;
    return tr;
  };

  // ---- process scoring ----
  E.completeness = function (plan, check) {
    let got = 0, tot = 0;
    plan.steps.forEach((_, i) => { tot += 1; if (check.steps[i]) got += 1; });
    plan.conf.forEach((c, i) => { const w = c.required ? 2 : 1; tot += w; if (check.conf[i]) got += w; });
    plan.avoid.forEach((_, i) => { tot += 1; if (check.avoid[i]) got += 1; });
    return tot ? got / tot : 1;
  };

  E.adherence = function (tr, plan) {
    const comp = E.completeness(plan, tr.check);
    const riskOk = tr.riskPct <= plan.risk.pct + 1e-9;
    const rrOk = tr.rr0 >= plan.risk.minRR - 1e-9;
    const limitsOk = !tr.ctx.overTrades && !tr.ctx.dailyBreach;
    const stopOk = !tr.widened;
    const exitClean = tr.reason === 'SL' || tr.reason === 'TP';
    let level;
    if (comp >= 1 && riskOk && rrOk && limitsOk && stopOk) level = 2;
    else if (comp < 0.5 || !stopOk) level = 0;
    else level = 1;
    return { comp, riskOk, rrOk, limitsOk, stopOk, exitClean, level };
  };

  E.scoreTrade = function (tr, plan, review) {
    const a = E.adherence(tr, plan);
    const parts = {
      plan: Math.round(40 * a.comp),
      risk: a.riskOk ? 15 : 0,
      rr: a.rrOk ? 10 : 0,
      limits: a.limitsOk ? 5 : 0,
      exit: !a.stopOk ? 0 : (a.exitClean ? 15 : 8),
      reflect: 0,
    };
    const said = { yes: 2, partly: 1, no: 0 }[review.followed];
    const diff = said - a.level;
    let verdict;
    if (diff === 0) { parts.reflect = 15; verdict = 'honest'; }
    else if (diff > 0) { parts.reflect = 0; verdict = 'overclaimed'; }
    else { parts.reflect = diff === -1 ? 8 : 3; verdict = 'harsh'; }
    const total = parts.plan + parts.risk + parts.rr + parts.limits + parts.exit + parts.reflect;
    return { total, parts, adherence: a, verdict };
  };

  E.levelFor = (xp) => Math.floor(Math.sqrt(xp / 100)) + 1;
  E.xpForLevel = (lv) => (lv - 1) * (lv - 1) * 100;

  if (typeof module !== 'undefined' && module.exports) module.exports = E; else root.Engine = E;
})(typeof window !== 'undefined' ? window : globalThis);
