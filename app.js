/* Gold Replay UI */
(function () {
  'use strict';
  const E = window.Engine, PT = window.Patterns;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KEY = 'goldreplay.v1';
  const TFS = [[1, '1m'], [5, '5m'], [15, '15m'], [60, '1h'], [240, '4h'], [1440, '1D']];
  const SPEEDS = [1, 2, 5, 15, 60];
  const fmt = (n, d = 2) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fdate = (tmin) => new Date(tmin * 60000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

  let P = null;           // profile
  let S = null;           // live session (alias of P.session)
  let chart, series, lines = [], timer = null, speedI = 0, tab = 'replay';
  let W = null, wStep = 0; // wizard

  function loadP() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function saveP() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} }
  const IKEY = 'goldreplay.imgs';
  function loadImgs() { try { return JSON.parse(localStorage.getItem(IKEY)) || []; } catch (e) { return []; } }
  function saveImgs(a) { try { localStorage.setItem(IKEY, JSON.stringify(a)); return true; } catch (e) { toast('Storage full, remove a picture first'); return false; } }
  function shrink(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onerror = rej;
      fr.onload = () => {
        const im = new Image(); im.onerror = rej;
        im.onload = () => { const k = Math.min(1, 900 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.72)); };
        im.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  function backupJSON() { return JSON.stringify({ v: 1, profile: P, imgs: loadImgs() }); }
  function doExport() {
    const blob = new Blob([backupJSON()], { type: 'application/json' });
    const f = new File([blob], 'gold-replay-backup.json', { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { navigator.share({ files: [f], title: 'Gold Replay backup' }).catch(() => {}); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'gold-replay-backup.json'; a.click();
  }
  function doImport(file) {
    const fr = new FileReader();
    fr.onload = () => { try { const d = JSON.parse(fr.result); if (!d.profile || !d.profile.plan) throw new Error('not a backup'); P = d.profile; localStorage.setItem(KEY, JSON.stringify(P)); saveImgs(d.imgs || []); toast('Backup restored'); setTimeout(() => location.reload(), 600); } catch (e) { toast('That file is not a valid backup'); } };
    fr.readAsText(file);
  }
  function newProfile() { return { plan: null, xp: 0, streak: 0, bestStreak: 0, honest: 0, journal: [], session: null, sessionsDone: 0 }; }
  function defaultPlan() {
    return { name: '', market: 'XAUUSD (gold)', tfs: ['1D', '1m'], balance: 1000, steps: [''], conf: [], avoid: [''],
      risk: { pct: 2, minRR: 2, maxTrades: 2, dailyLoss: 5 } };
  }

  // ---------- modal / toast ----------
  function modal(html, cls) {
    const m = $('#modal');
    m.innerHTML = '<div class="sheet ' + (cls || '') + '">' + html + '</div>';
    m.classList.add('on');
  }
  function closeModal() { const m = $('#modal'); m.classList.remove('on'); m.innerHTML = ''; }
  function toast(t) {
    const el = $('#toast'); el.textContent = t; el.classList.add('on');
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('on'), 2200);
  }

  // ---------- data ----------
  async function loadData() {
    const box = $('#app');
    box.innerHTML = '<div class="center"><div class="logo">&#9672;</div><h2>Gold Replay</h2><div id="prog" class="muted">Loading gold data&hellip;</div><div class="bar"><i id="pbar"></i></div></div>';
    const idx = await (await fetch('data-index.json')).json();
    let done = 0;
    const bufs = await Promise.all(idx.chunks.map(async (c) => {
      const r = await fetch(c.f); const b = await r.arrayBuffer();
      done++; $('#pbar').style.width = (done / idx.chunks.length * 100) + '%';
      return b;
    }));
    E.setBuffers(bufs);
  }

  // ---------- boot ----------
  async function boot() {
    P = loadP() || newProfile();
    if (!P.ind) P.ind = [{ type: 'ema', p: 20, on: true, color: PALETTE[0] }, { type: 'vol', p: 0, on: true, color: IND.vol[2] }];
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    try { await loadData(); } catch (e) {
      $('#app').innerHTML = '<div class="center"><h2>Could not load data</h2><p class="muted">' + esc(e.message) + '</p><button class="btn" onclick="location.reload()">Retry</button></div>';
      return;
    }
    if (!P.plan) { startWizard(false); return; }
    if (P.session && P.session.dv !== DV) { P.session = null; saveP(); }
    S = P.session;
    showTab('replay');
  }

  // ---------- wizard ----------
  function startWizard(editing) {
    W = JSON.parse(JSON.stringify(P.plan || defaultPlan()));
    W._editing = !!editing; wStep = 0; renderWizard();
  }
  const STEPS = ['Basics', 'Entry steps', 'Confluences', 'Rules', 'Review'];

  function renderWizard() {
    const prog = '<div class="wprog">' + STEPS.map((s, i) => '<span class="' + (i === wStep ? 'on' : i < wStep ? 'done' : '') + '">' + (i + 1) + '</span>').join('') + '</div>';
    let body = '';
    if (wStep === 0) {
      body = (!W._editing && !P.plan ? '<div class="card"><b>Already set up before?</b><div class="muted sm">The Home Screen app does not share storage with Safari. Restore a backup file here.</div><button class="btn ghost" id="w_restore" style="margin-top:8px">Restore backup</button><input type="file" id="w_rfile" accept=".json,application/json" hidden></div>' : '') + '<h2>What are you trading?</h2><p class="muted">Gold only for now, built from 1-minute data (Sep 2023 to now).</p>' +
        '<label>Your name or trader tag</label><input id="w_name" value="' + esc(W.name) + '" placeholder="e.g. Andi">' +
        '<label>Market</label><input value="XAUUSD (gold)" disabled>' +
        '<label>Timeframes you use (tap to toggle)</label><div class="chips">' +
        TFS.map((t) => '<span class="chip ' + (W.tfs.includes(t[1]) ? 'on' : '') + '" data-tf="' + t[1] + '">' + t[1] + '</span>').join('') + '</div>' +
        '<label>Starting balance (simulated, 20x leverage)</label><input id="w_bal" type="number" inputmode="decimal" value="' + W.balance + '">';
    } else if (wStep === 1) {
      body = '<h2>How will you trade it?</h2><p class="muted">List the steps you wait for, in order, before you enter. Write them as plainly as you would to a friend.</p><div id="stepsList">' +
        W.steps.map((s, i) => '<div class="row"><b>' + (i + 1) + '</b><input data-step="' + i + '" value="' + esc(s) + '" placeholder="e.g. Daily candle gives direction"><button class="x" data-delstep="' + i + '">&times;</button></div>').join('') +
        '</div><button class="btn ghost" id="addStep">+ Add step</button>';
    } else if (wStep === 2) {
      body = '<h2>Your confluences</h2><p class="muted">Add what you need to see. For each one, pick the picture that matches YOUR version of it. If none match, say so and explain it properly.</p>' +
        '<div class="chips">' + PT.list.map((c) => '<span class="chip add" data-addconf="' + c.id + '">+ ' + esc(c.name) + '</span>').join('') + '<span class="chip add" data-addconf="custom">+ Custom</span></div><div id="confList">' + W.conf.map(confCard).join('') + '</div>';
    } else if (wStep === 3) {
      body = '<h2>Your rules</h2><p class="muted">When you should NOT trade, and how much you risk.</p>' +
        '<label>Do NOT enter if&hellip;</label><div id="avoidList">' +
        W.avoid.map((s, i) => '<div class="row"><input data-avoid="' + i + '" value="' + esc(s) + '" placeholder="e.g. I am chasing a candle that already ran"><button class="x" data-delavoid="' + i + '">&times;</button></div>').join('') +
        '</div><button class="btn ghost" id="addAvoid">+ Add rule</button>' +
        '<div class="grid2"><div><label>Risk per trade %</label><input id="r_pct" type="number" step="0.5" inputmode="decimal" value="' + W.risk.pct + '"></div>' +
        '<div><label>Minimum reward : risk</label><input id="r_rr" type="number" step="0.5" inputmode="decimal" value="' + W.risk.minRR + '"></div>' +
        '<div><label>Max trades per day</label><input id="r_max" type="number" inputmode="numeric" value="' + W.risk.maxTrades + '"></div>' +
        '<div><label>Daily loss limit %</label><input id="r_dl" type="number" step="0.5" inputmode="decimal" value="' + W.risk.dailyLoss + '"></div></div>';
    } else {
      body = '<h2>Your trading plan</h2><div class="card">' + planSummary(W) + '</div><p class="muted">The game scores you against this plan. You can edit it later, but trades already logged keep the plan they were taken under.</p>';
    }
    $('#app').innerHTML = '<div class="wiz">' + prog + '<div class="wbody">' + body + '</div><div class="wnav">' +
      (wStep > 0 ? '<button class="btn ghost" id="wBack">Back</button>' : (W._editing ? '<button class="btn ghost" id="wCancel">Cancel</button>' : '<span></span>')) +
      '<button class="btn" id="wNext">' + (wStep === 4 ? (W._editing ? 'Save plan' : 'Start training') : 'Next') + '</button></div></div>';
    bindWizard();
  }

  function confLabel(c) {
    const lib = PT.get(c.id);
    const name = c.id === 'custom' ? (c.name || 'Custom') : lib.name;
    let v = '';
    if (c.neither || c.id === 'custom') v = c.text || '';
    else if (c.variant) { const vv = lib.variants.find((x) => x.id === c.variant); v = vv ? vv.label : ''; }
    return { name, v };
  }
  function confCard(c, i) {
    const lib = c.id === 'custom' ? null : PT.get(c.id);
    let h = '<div class="card conf"><div class="ctop"><b>' + esc(lib ? lib.name : 'Custom confluence') + '</b><button class="x" data-delconf="' + i + '">&times;</button></div>';
    if (!lib) {
      h += '<label>Name</label><input data-cname="' + i + '" value="' + esc(c.name || '') + '" placeholder="e.g. Session open"><label>Describe exactly what you need to see (required)</label><textarea data-ctext="' + i + '" rows="3">' + esc(c.text || '') + '</textarea>';
    } else {
      h += '<div class="muted sm">' + esc(lib.blurb) + ' Which looks like yours?</div><div class="pics">' +
        lib.variants.map((v) => '<div class="pic ' + (c.variant === v.id && !c.neither ? 'sel' : '') + '" data-pick="' + i + '|' + v.id + '">' + PT.svg(v) + '<div class="cap">' + esc(v.label) + '</div></div>').join('') +
        '<div class="pic none ' + (c.neither ? 'sel' : '') + '" data-pick="' + i + '|__none"><div class="nonebox">None of these</div><div class="cap">Mine looks different</div></div></div>';
      if (c.neither) h += '<label>Explain it definitively (required, at least a sentence)</label><textarea data-ctext="' + i + '" rows="3" placeholder="What exactly do you look for, and what makes it valid?">' + esc(c.text || '') + '</textarea>';
    }
    h += '<label>Why this one? (optional)</label><textarea data-cwhy="' + i + '" rows="2">' + esc(c.why || '') + '</textarea>' +
      '<label class="inl"><input type="checkbox" data-creq="' + i + '" ' + (c.required ? 'checked' : '') + '> Must-have (counts double)</label></div>';
    return h;
  }

  function planSummary(p) {
    let h = '<div><b>' + esc(p.name || 'Trader') + '</b> &middot; ' + esc(p.market) + ' &middot; ' + p.tfs.join(', ') + ' &middot; ' + fmt(p.balance, 0) + '</div>';
    h += '<h4>Steps</h4><ol>' + p.steps.filter(Boolean).map((s) => '<li>' + esc(s) + '</li>').join('') + '</ol>';
    h += '<h4>Confluences</h4><ul>' + p.conf.map((c) => { const l = confLabel(c); return '<li><b>' + esc(l.name) + '</b>' + (c.required ? ' (must-have)' : '') + (l.v ? ': ' + esc(l.v) : '') + (c.why ? '<div class="muted sm">Why: ' + esc(c.why) + '</div>' : '') + '</li>'; }).join('') + '</ul>';
    h += '<h4>Do not enter if</h4><ul>' + p.avoid.filter(Boolean).map((s) => '<li>' + esc(s) + '</li>').join('') + '</ul>';
    h += '<h4>Risk</h4><div>' + p.risk.pct + '% per trade &middot; min RR ' + p.risk.minRR + ' &middot; max ' + p.risk.maxTrades + ' trades/day &middot; ' + p.risk.dailyLoss + '% daily loss limit</div>';
    return h;
  }

  function bindWizard() {
    const q = (s) => document.querySelectorAll(s);
    q('[data-tf]').forEach((el) => el.onclick = () => { const t = el.dataset.tf; W.tfs = W.tfs.includes(t) ? W.tfs.filter((x) => x !== t) : W.tfs.concat(t); el.classList.toggle('on'); });
    q('[data-step]').forEach((el) => el.oninput = () => { W.steps[+el.dataset.step] = el.value; });
    q('[data-delstep]').forEach((el) => el.onclick = () => { W.steps.splice(+el.dataset.delstep, 1); if (!W.steps.length) W.steps.push(''); renderWizard(); });
    const as = $('#addStep'); if (as) as.onclick = () => { W.steps.push(''); renderWizard(); };
    q('[data-avoid]').forEach((el) => el.oninput = () => { W.avoid[+el.dataset.avoid] = el.value; });
    q('[data-delavoid]').forEach((el) => el.onclick = () => { W.avoid.splice(+el.dataset.delavoid, 1); if (!W.avoid.length) W.avoid.push(''); renderWizard(); });
    const aa = $('#addAvoid'); if (aa) aa.onclick = () => { W.avoid.push(''); renderWizard(); };
    q('[data-addconf]').forEach((el) => el.onclick = () => { W.conf.push({ id: el.dataset.addconf, variant: null, neither: false, text: '', why: '', required: false, name: '' }); renderWizard(); setTimeout(() => { const L = $('#confList'); if (L && L.lastElementChild) L.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 50); });
    q('[data-delconf]').forEach((el) => el.onclick = () => { W.conf.splice(+el.dataset.delconf, 1); renderWizard(); });
    q('[data-pick]').forEach((el) => el.onclick = () => { const [i, v] = el.dataset.pick.split('|'); const c = W.conf[+i]; if (v === '__none') { c.neither = true; c.variant = null; } else { c.neither = false; c.variant = v; } renderWizard(); });
    q('[data-cname]').forEach((el) => el.oninput = () => { W.conf[+el.dataset.cname].name = el.value; });
    q('[data-ctext]').forEach((el) => el.oninput = () => { W.conf[+el.dataset.ctext].text = el.value; });
    q('[data-cwhy]').forEach((el) => el.oninput = () => { W.conf[+el.dataset.cwhy].why = el.value; });
    q('[data-creq]').forEach((el) => el.onchange = () => { W.conf[+el.dataset.creq].required = el.checked; });
    const rs = $('#w_restore'); if (rs) { rs.onclick = () => $('#w_rfile').click(); $('#w_rfile').onchange = (e) => e.target.files[0] && doImport(e.target.files[0]); }
    const bk = $('#wBack'); if (bk) bk.onclick = () => { collect(); wStep--; renderWizard(); };
    const cn = $('#wCancel'); if (cn) cn.onclick = () => { W = null; showTab('plan'); };
    $('#wNext').onclick = () => {
      collect();
      const err = validateStep();
      if (err) { toast(err); return; }
      if (wStep < 4) { wStep++; renderWizard(); window.scrollTo(0, 0); return; }
      finishWizard();
    };
  }
  function collect() {
    const g = (id) => document.getElementById(id);
    if (g('w_name')) W.name = g('w_name').value.trim();
    if (g('w_bal')) W.balance = Math.max(100, +g('w_bal').value || 1000);
    if (g('r_pct')) { W.risk.pct = +g('r_pct').value; W.risk.minRR = +g('r_rr').value; W.risk.maxTrades = Math.max(1, Math.floor(+g('r_max').value || 1)); W.risk.dailyLoss = +g('r_dl').value; }
  }
  function validateStep() {
    if (wStep === 0 && !W.tfs.length) return 'Pick at least one timeframe';
    if (wStep === 1 && !W.steps.filter((s) => s.trim()).length) return 'Add at least one entry step';
    if (wStep === 2) {
      if (!W.conf.length) return 'Add at least one confluence';
      for (const c of W.conf) {
        if (c.id === 'custom') { if (!(c.name || '').trim() || (c.text || '').trim().length < 15) return 'Custom confluence needs a name and a proper description'; }
        else if (c.neither) { if ((c.text || '').trim().length < 15) return 'Explain your "none of these" confluence in a full sentence'; }
        else if (!c.variant) return 'Pick a picture (or "None of these") for every confluence';
      }
    }
    if (wStep === 3) {
      const r = W.risk;
      if (!(r.pct > 0 && r.pct <= 10)) return 'Risk per trade must be between 0 and 10%';
      if (!(r.minRR > 0)) return 'Minimum RR must be above 0';
      if (!(r.dailyLoss > 0)) return 'Set a daily loss limit';
    }
    return null;
  }
  function finishWizard() {
    W.steps = W.steps.map((s) => s.trim()).filter(Boolean);
    W.avoid = W.avoid.map((s) => s.trim()).filter(Boolean);
    const editing = W._editing; delete W._editing;
    P.plan = W; W = null;
    if (!editing) P.session = null;
    saveP(); S = P.session; toast(editing ? 'Plan saved' : 'Plan locked in');
    showTab('replay');
  }

  // ---------- shell ----------
  function showTab(t) {
    tab = t; pause();
    if (t !== 'replay') destroyChart();
    $('#app').innerHTML = '<div id="view"></div><nav class="nav">' +
      [['replay', 'Replay'], ['stats', 'Stats'], ['plan', 'Plan']].map((x) => '<button data-tab="' + x[0] + '" class="' + (t === x[0] ? 'on' : '') + '">' + x[1] + '</button>').join('') + '</nav>';
    document.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { if (b.dataset.tab !== tab) showTab(b.dataset.tab); });
    if (t === 'replay') (S ? renderReplay() : renderStart());
    else if (t === 'stats') renderStats();
    else renderPlan();
  }

  // ---------- session start ----------
  const DV = 'duka-1';
  const SESSIONS = [['Asia', 0], ['London', 7], ['New York', 13]]; // UTC start hours
  const sessName = (tmin) => { const h = Math.floor((tmin % 1440) / 60); return h < 7 ? 'Asia' : h < 13 ? 'London' : h < 21 ? 'New York' : 'Late'; };
  const fmtDay = (d) => new Date(d * 86400000).toUTCString().slice(0, 16);
  function dayList() {
    const out = [], d0 = Math.floor(E.t(0) / 1440), d1 = Math.floor(E.t(E.n() - 1) / 1440);
    for (let d = d0; d <= d1; d++) {
      const a = E.find(d * 1440 - 1), b = E.find(d * 1440 + 1439);
      if (b - a >= 300) out.push(d);
    }
    return out;
  }
  function startIdx(day, hour) {
    const tm = day * 1440 + hour * 60, i = E.find(tm - 1) + 1;
    if (i >= E.n() || E.t(i) - tm > 180) return -1;
    return i >= 120 && i < E.n() - 120 ? i : -1;
  }
  let selDay = null, selSess = 1;
  function renderStart() {
    const days = dayList().filter((d) => SESSIONS.some((s) => startIdx(d, s[1]) >= 0));
    if (!days.length) { $('#view').innerHTML = '<div class="page"><h2>No data</h2></div>'; return; }
    if (selDay == null || !days.includes(selDay)) selDay = days[days.length - 1];
    const d0 = fmtDay(days[0]), d1 = fmtDay(days[days.length - 1]);
    $('#view').innerHTML = '<div class="page"><h2>New session</h2><p class="muted">Real spot gold (XAUUSD) 1-minute data. The future is hidden and revealed as you step forward.</p>' +
      '<div class="card"><label>Day</label><select id="s_day">' + days.slice().reverse().map((d) => '<option value="' + d + '"' + (d === selDay ? ' selected' : '') + '>' + fmtDay(d) + '</option>').join('') + '</select>' +
      '<label>Session (UTC start time)</label><div class="chips" id="s_sess"></div>' +
      '<label>Starting balance</label><input id="s_bal" type="number" inputmode="decimal" value="' + P.plan.balance + '">' +
      '<button class="btn big" id="s_go">Begin session</button><button class="btn ghost big" id="s_rand">Random day and session</button>' +
      '<p class="muted sm">Data: ' + d0.slice(5) + ' to ' + d1.slice(5) + ' &middot; ' + days.length + ' trading days &middot; more days are added automatically.</p></div>' +
      '<div class="card"><b>Your risk rules</b><div class="muted">' + P.plan.risk.pct + '% per trade &middot; min RR ' + P.plan.risk.minRR + ' &middot; ' + P.plan.risk.maxTrades + ' trades/day &middot; ' + P.plan.risk.dailyLoss + '% daily loss limit</div></div></div>';
    const drawSess = () => {
      if (startIdx(selDay, SESSIONS[selSess][1]) < 0) selSess = SESSIONS.findIndex((s) => startIdx(selDay, s[1]) >= 0);
      $('#s_sess').innerHTML = SESSIONS.map((s, i) => { const ok = startIdx(selDay, s[1]) >= 0; return '<span class="chip ' + (i === selSess ? 'on' : '') + (ok ? '' : ' dis') + '" data-sess="' + i + '">' + s[0] + ' ' + String(s[1]).padStart(2, '0') + ':00</span>'; }).join('');
      document.querySelectorAll('[data-sess]').forEach((el) => (el.onclick = () => { if (el.classList.contains('dis')) { toast('No data for that session'); return; } selSess = +el.dataset.sess; drawSess(); }));
    };
    drawSess();
    $('#s_day').onchange = () => { selDay = +$('#s_day').value; drawSess(); };
    $('#s_rand').onclick = () => {
      const opts = []; days.forEach((d) => SESSIONS.forEach((s, i) => { if (startIdx(d, s[1]) >= 0) opts.push([d, i]); }));
      const pick = opts[Math.floor(Math.random() * opts.length)]; selDay = pick[0]; selSess = pick[1]; begin();
    };
    $('#s_go').onclick = begin;
    function begin() {
      const bal = Math.max(100, +$('#s_bal').value || 1000), idx = startIdx(selDay, SESSIONS[selSess][1]);
      if (idx < 0) { toast('No data for that session'); return; }
      const t = E.t(idx);
      S = P.session = { dv: DV, cur: idx, tf: 15, startBal: bal, balance: bal, trades: 0, open: null, dayKey: Math.floor(t / 1440), dayStartBal: bal, dayTrades: 0, startT: t };
      saveP(); showTab('replay');
    }
  }

  // ---------- replay ----------
  let HIST = [], IS = [];
  const IND = { ema: ['EMA', 20, '#e6c14b'], sma: ['SMA', 50, '#4f8cff'], bb: ['Bollinger Bands', 20, '#9b8cff'], vwap: ['VWAP', 0, '#ff9f43'], rsi: ['RSI', 14, '#c792ea'], vol: ['Volume', 0, '#5c6b7f'] };
  const PALETTE = ['#e6c14b', '#4f8cff', '#ff9f43', '#c792ea', '#5ad1c4', '#ff6f91'];
  function destroyChart() { if (chart) { try { chart.remove(); } catch (e) {} chart = null; series = null; lines = []; IS = []; } }

  function renderReplay() {
    const tfBtns = TFS.map((t) => '<button class="tf ' + (S.tf === t[0] ? 'on' : '') + '" data-tfs="' + t[0] + '">' + t[1] + '</button>').join('');
    $('#view').innerHTML = '<div class="rp"><div class="hud"><div><div class="muted sm"><span id="h_time"></span> <span id="h_sess" class="stag"></span></div><div id="h_price" class="price"></div></div>' +
      '<div class="hr"><div class="muted sm">Balance</div><div id="h_bal"></div></div><div class="hr"><div class="muted sm">Equity</div><div id="h_eq"></div></div></div>' +
      '<div id="chart"></div><div class="tfrow">' + tfBtns + '<button class="tf ind" id="c_ind">&fnof;x</button></div>' +
      '<div class="fxbar"><button id="c_play" class="pl">&#9654;</button><button id="c_next">Next<br>candle</button><button id="c_step">+1m</button><button id="c_sess">Next<br>session</button><button id="c_speed">1x</button><button id="c_end">End</button></div>' +
      '<div id="tradebar"></div></div>';
    mountChart(); loadTF();
    document.querySelectorAll('[data-tfs]').forEach((b) => (b.onclick = () => { S.tf = +b.dataset.tfs; document.querySelectorAll('.tf[data-tfs]').forEach((x) => x.classList.toggle('on', x === b)); loadTF(); saveP(); }));
    $('#c_step').onclick = () => { pause(); advance(1); };
    $('#c_next').onclick = () => { pause(); nextCandle(); };
    $('#c_sess').onclick = () => { pause(); nextSession(); };
    $('#c_play').onclick = () => (timer ? pause() : play());
    $('#c_speed').textContent = SPEEDS[speedI] + 'x';
    $('#c_speed').onclick = () => { speedI = (speedI + 1) % SPEEDS.length; $('#c_speed').textContent = SPEEDS[speedI] + 'x'; };
    $('#c_ind').onclick = () => { pause(); openInd(); };
    $('#c_end').onclick = endSession;
    drawTradebar(); refreshHud(); drawLines();
  }
  function mountChart() {
    destroyChart();
    const LW = window.LightweightCharts;
    chart = LW.createChart($('#chart'), {
      autoSize: true, layout: { background: { color: '#131722' }, textColor: '#9aa4b2', fontSize: 11, panes: { separatorColor: '#2a2e39' } },
      grid: { vertLines: { color: '#1b2030' }, horzLines: { color: '#1b2030' } },
      localization: { priceFormatter: (p) => p.toFixed(2) },
      timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 6, borderColor: '#2a2e39', barSpacing: 9, minBarSpacing: 3 },
      rightPriceScale: { borderColor: '#2a2e39', scaleMargins: { top: 0.08, bottom: 0.08 } }, crosshair: { mode: 0 },
    });
    series = chart.addSeries(LW.CandlestickSeries, { upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350', priceLineVisible: true, priceFormat: { type: 'price', precision: 2, minMove: 0.01 } });
  }
  function loadTF() {
    HIST = E.candles(S.tf, S.cur, 700);
    series.setData(HIST); S.run = HIST[HIST.length - 1] || null;
    buildInd();
    chart.timeScale().applyOptions({ barSpacing: 9 });
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, HIST.length - 60), to: HIST.length + 6 });
  }

  // ---- indicators ----
  function clearInd() { IS.forEach((x) => x.s.forEach((s) => { try { chart.removeSeries(s); } catch (e) {} })); IS = []; }
  function buildInd() {
    clearInd(); if (!chart) return;
    const LW = window.LightweightCharts, base = { priceLineVisible: false, lastValueVisible: false, lineWidth: 1, crosshairMarkerVisible: false };
    (P.ind || []).forEach((d) => {
      if (!d.on) return;
      let s;
      if (d.type === 'ema' || d.type === 'sma' || d.type === 'vwap') s = [chart.addSeries(LW.LineSeries, Object.assign({ color: d.color }, base))];
      else if (d.type === 'bb') s = [chart.addSeries(LW.LineSeries, Object.assign({ color: d.color }, base)), chart.addSeries(LW.LineSeries, Object.assign({ color: d.color, lineStyle: 2 }, base)), chart.addSeries(LW.LineSeries, Object.assign({ color: d.color }, base))];
      else if (d.type === 'rsi') {
        const r = chart.addSeries(LW.LineSeries, Object.assign({ color: d.color }, base, { lastValueVisible: true }), 1);
        [30, 70].forEach((v) => r.createPriceLine({ price: v, color: '#3a4152', lineWidth: 1, lineStyle: 2, axisLabelVisible: false }));
        s = [r];
      } else if (d.type === 'vol') {
        const v = chart.addSeries(LW.HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', priceLineVisible: false, lastValueVisible: false });
        v.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } }); s = [v];
      }
      if (s) IS.push({ d, s });
    });
    try { const ps = chart.panes(); if (ps[1]) ps[1].setStretchFactor(0.4); } catch (e) {}
    updateInd();
  }
  function updateInd() {
    if (!IS.length || !HIST.length) return;
    IS.forEach(({ d, s }) => {
      if (d.type === 'ema') s[0].setData(E.ema(HIST, d.p));
      else if (d.type === 'sma') s[0].setData(E.sma(HIST, d.p));
      else if (d.type === 'vwap') s[0].setData(E.vwap(HIST));
      else if (d.type === 'rsi') s[0].setData(E.rsi(HIST, d.p));
      else if (d.type === 'bb') { const b = E.bb(HIST, d.p, 2); s[0].setData(b.up); s[1].setData(b.mid); s[2].setData(b.lo); }
      else if (d.type === 'vol') s[0].setData(HIST.map((c) => ({ time: c.time, value: c.volume || 0, color: c.close >= c.open ? 'rgba(38,166,154,.45)' : 'rgba(239,83,80,.45)' })));
    });
  }
  function openInd() {
    P.ind = P.ind || [];
    const draw = () => {
      modal('<h3>Indicators</h3>' + (P.ind.length ? P.ind.map((d, i) => '<div class="indrow"><label class="inl"><input type="checkbox" data-ion="' + i + '" ' + (d.on ? 'checked' : '') + '> <span style="color:' + d.color + '">&#9679;</span> ' + IND[d.type][0] + '</label>' +
        (IND[d.type][1] ? '<input class="pin" type="number" inputmode="numeric" min="2" max="500" data-ip="' + i + '" value="' + d.p + '">' : '<span></span>') + '<button class="x" data-idel="' + i + '">&times;</button></div>').join('') : '<p class="muted">None added.</p>') +
        '<h4>Add</h4><div class="chips">' + Object.keys(IND).map((k) => '<span class="chip add" data-iadd="' + k + '">+ ' + IND[k][0] + '</span>').join('') + '</div>' +
        '<button class="btn big" id="i_done">Done</button>', 'tall');
      document.querySelectorAll('[data-ion]').forEach((el) => (el.onchange = () => { P.ind[+el.dataset.ion].on = el.checked; apply(); }));
      document.querySelectorAll('[data-ip]').forEach((el) => (el.onchange = () => { P.ind[+el.dataset.ip].p = Math.max(2, Math.min(500, Math.floor(+el.value) || 2)); apply(); }));
      document.querySelectorAll('[data-idel]').forEach((el) => (el.onclick = () => { P.ind.splice(+el.dataset.idel, 1); apply(); draw(); }));
      document.querySelectorAll('[data-iadd]').forEach((el) => (el.onclick = () => { const k = el.dataset.iadd; P.ind.push({ type: k, p: IND[k][1], on: true, color: k === 'vol' || k === 'rsi' || k === 'vwap' || k === 'bb' ? IND[k][2] : PALETTE[P.ind.length % PALETTE.length] }); apply(); draw(); }));
      $('#i_done').onclick = closeModal;
    };
    const apply = () => { saveP(); buildInd(); };
    draw();
  }

  function dayRoll() {
    const dk = Math.floor(E.t(S.cur) / 1440);
    if (dk !== S.dayKey) { S.dayKey = dk; S.dayStartBal = S.balance; S.dayTrades = 0; }
  }
  function sync(crossed, stepped) {
    if (!stepped || !series) return;
    if (crossed || stepped > 1) series.setData(HIST); else series.update(S.run);
    updateInd();
  }
  function advance(n) {
    let crossed = false, stepped = 0;
    for (let k = 0; k < n; k++) {
      if (S.cur >= E.n() - 1) { pause(); toast('End of loaded data'); break; }
      S.cur++; stepped++;
      S.run = E.mergeBar(S.run, S.tf, S.cur);
      const last = HIST[HIST.length - 1];
      if (!last || last.time !== S.run.time) { HIST.push(S.run); crossed = true; if (HIST.length > 800) HIST.shift(); } else HIST[HIST.length - 1] = S.run;
      dayRoll();
      if (S.open) {
        const r = E.stepTrade(S.open, S.cur);
        if (r) { sync(crossed, stepped); finishTrade(r.price, E.t(S.cur), r.reason); return; }
      }
    }
    sync(crossed, stepped); refreshHud();
  }
  function nextCandle() {
    const tf = S.tf, b = Math.floor(E.t(S.cur) / tf);
    let tgt = S.cur;
    for (let k = 0; k < 8 && tgt <= S.cur; k++) tgt = E.find((b + 1 + k) * tf - 1);
    if (tgt <= S.cur) tgt = Math.min(S.cur + 1, E.n() - 1);
    advance(tgt - S.cur);
  }
  function nextSession() {
    const t = E.t(S.cur), d = Math.floor(t / 1440);
    let target = null;
    for (let k = 0; k < 3 && target == null; k++) for (const s of SESSIONS) { const c = (d + k) * 1440 + s[1] * 60; if (c > t) { target = c; break; } }
    const idx = E.find(target - 1) + 1;
    if (idx <= S.cur) { toast('No more data'); return; }
    advance(Math.min(idx, E.n() - 1) - S.cur);
  }
  function play() {
    if (timer) return;
    const b = $('#c_play'); b.innerHTML = '&#10074;&#10074;'; b.classList.add('on');
    timer = setInterval(() => advance(SPEEDS[speedI]), 300);
  }
  function pause() {
    if (timer) { clearInterval(timer); timer = null; }
    const b = $('#c_play'); if (b) { b.innerHTML = '&#9654;'; b.classList.remove('on'); }
    if (S) saveP();
  }
  function equity() { return S.balance + (S.open ? E.floating(S.open, E.close(S.cur)) : 0); }
  function refreshHud() {
    if (!$('#h_price')) return;
    $('#h_time').textContent = fdate(E.t(S.cur)); $('#h_sess').textContent = sessName(E.t(S.cur));
    $('#h_price').textContent = E.close(S.cur).toFixed(2);
    $('#h_bal').textContent = fmt(S.balance);
    const eq = equity(); const el = $('#h_eq'); el.textContent = fmt(eq); el.className = eq >= S.balance ? 'up' : 'dn';
    if (S.open) updateOpenPanel();
  }

  // ---------- trade bar / lines ----------
  function drawLines() {
    if (!series) return;
    lines.forEach((l) => { try { series.removePriceLine(l); } catch (e) {} }); lines = [];
    const t = S && S.open; if (!t) return;
    const mk = (price, color, title) => lines.push(series.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title }));
    mk(t.entry, '#e6c14b', 'ENTRY'); mk(t.sl, '#ef5350', 'SL'); if (t.tp) mk(t.tp, '#26a69a', 'TP');
  }
  function drawTradebar() {
    const tb = $('#tradebar'); if (!tb) return;
    if (!S.open) {
      tb.innerHTML = '<div class="tbtns"><button class="sell" id="b_sell">SELL</button><button class="buy" id="b_buy">BUY</button></div>' +
        '<div class="muted sm center2">Today: ' + S.dayTrades + '/' + P.plan.risk.maxTrades + ' trades &middot; session ' + S.trades + ' trades</div>';
      $('#b_sell').onclick = () => openTicket(-1); $('#b_buy').onclick = () => openTicket(1);
    } else {
      tb.innerHTML = '<div class="open"><div><b id="o_dir"></b> <span id="o_info" class="muted sm"></span></div><div id="o_pnl" class="big"></div></div>' +
        '<div class="tbtns"><button class="ghost2" id="b_edit">Edit SL / TP</button><button class="close" id="b_close">Close now</button></div>';
      $('#b_close').onclick = () => { pause(); finishTrade(E.close(S.cur), E.t(S.cur), 'MANUAL'); };
      $('#b_edit').onclick = editStops; updateOpenPanel();
    }
  }
  function updateOpenPanel() {
    const t = S.open, el = $('#o_pnl'); if (!t || !el) return;
    const f = E.floating(t, E.close(S.cur)), r = t.riskUsd ? f / t.riskUsd : 0;
    $('#o_dir').textContent = (t.dir > 0 ? 'LONG ' : 'SHORT ') + t.units + ' oz';
    $('#o_info').textContent = '@ ' + t.entry.toFixed(2) + ' | risk ' + fmt(t.riskUsd);
    el.textContent = fmt(f) + '  (' + r.toFixed(2) + 'R)'; el.className = 'big ' + (f >= 0 ? 'up' : 'dn');
  }

  function defaultDist() {
    const cs = E.candles(S.tf, S.cur, 20); let s = 0; cs.forEach((c) => (s += c.high - c.low));
    const avg = cs.length ? s / cs.length : 5; return Math.max(1, Math.round(avg * 1.5 * 10) / 10);
  }
  function openTicket(dir) {
    pause();
    const plan = P.plan, px = E.close(S.cur), dist = defaultDist();
    const sl0 = +(px - dir * dist).toFixed(2), tp0 = +(px + dir * (E.SPREAD / 2 + (dist + E.SPREAD / 2) * Math.max(plan.risk.minRR, 1))).toFixed(2);
    const over = S.dayTrades >= plan.risk.maxTrades, breach = (S.dayStartBal - S.balance) >= S.dayStartBal * plan.risk.dailyLoss / 100;
    let h = '<h3>' + (dir > 0 ? 'BUY' : 'SELL') + ' gold <span class="muted sm">@ ' + px.toFixed(2) + '</span></h3>';
    if (over) h += '<div class="warn">You already took ' + S.dayTrades + ' trades today. Your limit is ' + plan.risk.maxTrades + '.</div>';
    if (breach) h += '<div class="warn">Daily loss limit reached. Your plan says stop for the day.</div>';
    h += '<div class="grid2"><div><label>Stop loss</label><input id="t_sl" type="number" inputmode="decimal" step="0.1" value="' + sl0 + '"></div>' +
      '<div><label>Take profit</label><input id="t_tp" type="number" inputmode="decimal" step="0.1" value="' + tp0 + '"></div>' +
      '<div><label>Risk %</label><input id="t_risk" type="number" inputmode="decimal" step="0.25" value="' + plan.risk.pct + '"></div><div><label>&nbsp;</label><div id="t_size" class="sizebox"></div></div></div>';
    h += '<div class="chk"><h4>Your steps</h4>' + plan.steps.map((s, i) => '<label class="inl"><input type="checkbox" data-cs="' + i + '"> ' + esc(s) + '</label>').join('') +
      '<h4>Confluences</h4>' + plan.conf.map((c, i) => { const l = confLabel(c); return '<label class="inl"><input type="checkbox" data-cc="' + i + '"> <span><b>' + esc(l.name) + '</b>' + (c.required ? ' *' : '') + '<br><span class="muted sm">' + esc(l.v) + '</span></span></label>'; }).join('') +
      (plan.avoid.length ? '<h4>Confirm none of these are true</h4>' + plan.avoid.map((s, i) => '<label class="inl"><input type="checkbox" data-ca="' + i + '"> ' + esc(s) + ' (not true)</label>').join('') : '') + '</div>';
    h += '<label>Why this trade? (optional)</label><textarea id="t_note" rows="2"></textarea>' +
      '<div class="tbtns"><button class="ghost2" id="t_cancel">Cancel</button><button class="' + (dir > 0 ? 'buy' : 'sell') + '" id="t_go">Place ' + (dir > 0 ? 'buy' : 'sell') + '</button></div>';
    modal(h, 'tall');
    const upd = () => {
      const sl = +$('#t_sl').value, rp = +$('#t_risk').value;
      const sz = E.size(S.balance, rp, px, sl);
      $('#t_size').innerHTML = sz.units ? sz.units + ' oz<br><span class="muted sm">risk ' + fmt(sz.riskUsd) + (sz.capped ? ' (capped by 20x)' : '') + '</span>' : '<span class="dn">set a valid stop</span>';
    };
    ['t_sl', 't_tp', 't_risk'].forEach((id) => ($('#' + id).oninput = upd)); upd();
    $('#t_cancel').onclick = closeModal;
    $('#t_go').onclick = () => {
      const sl = +$('#t_sl').value, tp = +$('#t_tp').value || null, rp = +$('#t_risk').value;
      if (!(dir > 0 ? sl < px : sl > px)) { toast('Stop is on the wrong side'); return; }
      if (tp && !(dir > 0 ? tp > px : tp < px)) { toast('Target is on the wrong side'); return; }
      if (!(rp > 0 && rp <= 25)) { toast('Risk % looks wrong'); return; }
      const chk = { steps: [...document.querySelectorAll('[data-cs]')].map((x) => x.checked), conf: [...document.querySelectorAll('[data-cc]')].map((x) => x.checked), avoid: [...document.querySelectorAll('[data-ca]')].map((x) => x.checked) };
      const tr = E.openTrade({ dir, price: px, sl, tp, balance: S.balance, riskPct: rp, t: E.t(S.cur), check: chk, note: $('#t_note').value, ctx: { overTrades: over, dailyBreach: breach } });
      if (!tr.units) { toast('Position size is zero'); return; }
      tr.startBal = S.balance; S.open = tr; S.dayTrades++; S.trades++;
      closeModal(); drawTradebar(); drawLines(); refreshHud(); saveP();
    };
  }
  function editStops() {
    pause(); const t = S.open;
    modal('<h3>Edit stops</h3><div class="grid2"><div><label>Stop loss</label><input id="e_sl" type="number" inputmode="decimal" step="0.1" value="' + t.sl + '"></div><div><label>Take profit</label><input id="e_tp" type="number" inputmode="decimal" step="0.1" value="' + (t.tp || '') + '"></div></div>' +
      '<p class="muted sm">Moving the stop closer is fine. Widening it is scored against you.</p><div class="tbtns"><button class="ghost2" id="e_c">Cancel</button><button class="buy" id="e_s">Save</button></div>');
    $('#e_c').onclick = closeModal;
    $('#e_s').onclick = () => {
      const sl = +$('#e_sl').value, tp = +$('#e_tp').value || null, px = E.close(S.cur);
      if (!(t.dir > 0 ? sl < px : sl > px)) { toast('Stop would trigger immediately'); return; }
      E.setStop(t, sl); t.tp = tp; closeModal(); drawLines(); saveP();
    };
  }

  // ---------- trade end + self review ----------
  function finishTrade(price, tmin, reason) {
    pause();
    const t = S.open; E.closeTrade(t, price, tmin, reason);
    S.balance += t.pnl; S.open = null; saveP();
    drawTradebar(); drawLines(); refreshHud();
    const rsn = { SL: 'Stopped out', TP: 'Target hit', MANUAL: 'Closed by you' }[reason];
    modal('<h3>' + rsn + '</h3><div class="resbig ' + (t.pnl >= 0 ? 'up' : 'dn') + '">' + fmt(t.pnl) + ' <span class="muted">(' + t.r.toFixed(2) + 'R)</span></div>' +
      '<h4>Be honest. Did you follow your plan on this trade?</h4><div class="seg" id="rv_seg"><button data-f="yes">Yes, fully</button><button data-f="partly">Partly</button><button data-f="no">No</button></div>' +
      '<label>What did you do well? What would you change? (required)</label><textarea id="rv_note" rows="3" placeholder="Be specific. Was it the setup, the entry, the stop, your emotions?"></textarea>' +
      '<button class="btn big" id="rv_go" disabled>Submit review</button>', 'tall nodismiss');
    let said = null; const go = $('#rv_go');
    const check = () => (go.disabled = !(said && $('#rv_note').value.trim().length >= 8));
    document.querySelectorAll('#rv_seg button').forEach((b) => b.onclick = () => { said = b.dataset.f; document.querySelectorAll('#rv_seg button').forEach((x) => x.classList.toggle('sel', x === b)); check(); });
    $('#rv_note').oninput = check;
    go.onclick = () => submitReview(t, said, $('#rv_note').value.trim());
  }
  function submitReview(t, said, note) {
    const sc = E.scoreTrade(t, P.plan, { followed: said });
    const lvBefore = E.levelFor(P.xp);
    const gain = Math.round(sc.total / 2) + (sc.adherence.level === 2 ? 10 : 0);
    P.xp += gain;
    if (sc.adherence.level === 2) { P.streak++; P.bestStreak = Math.max(P.bestStreak, P.streak); } else P.streak = 0;
    if (sc.verdict === 'honest') P.honest++;
    P.journal.push({ t0: t.t0, t1: t.t1, dir: t.dir, entry: t.entry, exit: t.exit, units: t.units, pnl: t.pnl, r: t.r, reason: t.reason, score: sc.total, parts: sc.parts, verdict: sc.verdict, said, level: sc.adherence.level,
      flags: { incomplete: sc.adherence.comp < 1, risk: !sc.adherence.riskOk, rr: !sc.adherence.rrOk, limits: !sc.adherence.limitsOk, widened: !sc.adherence.stopOk, manual: t.reason === 'MANUAL' }, note, why: t.note, comp: sc.adherence.comp });
    if (P.journal.length > 600) P.journal.shift();
    P.sessionsDone = P.sessionsDone || 0; saveP();
    const lvAfter = E.levelFor(P.xp);
    const rows = [['Followed your checklist', sc.parts.plan, 40], ['Risk size within plan', sc.parts.risk, 15], ['Reward : risk met', sc.parts.rr, 10], ['Daily limits respected', sc.parts.limits, 5], ['Clean exit, no stop widening', sc.parts.exit, 15], ['Honest self-review', sc.parts.reflect, 15]];
    const vtxt = { honest: 'Your self-assessment matches what the data shows. That is the skill.', overclaimed: 'You said you followed the plan, but the log says otherwise. That gap is where accounts get blown.', harsh: 'You were harder on yourself than the log. Good habit, just be accurate.' }[sc.verdict];
    modal('<h3>Trade score: ' + sc.total + '/100</h3>' + rows.map((r) => '<div class="srow"><span>' + r[0] + '</span><b class="' + (r[1] >= r[2] ? 'up' : r[1] === 0 ? 'dn' : '') + '">' + r[1] + '/' + r[2] + '</b></div>').join('') +
      '<p class="vt">' + vtxt + '</p><div class="xpline">+' + gain + ' XP &middot; Level ' + lvAfter + (lvAfter > lvBefore ? ' &#127881; LEVEL UP' : '') + ' &middot; Clean streak ' + P.streak + '</div>' +
      '<button class="btn big" id="rs_ok">Continue</button>', 'tall nodismiss');
    $('#rs_ok').onclick = () => { closeModal(); drawTradebar(); const risk = (S.dayStartBal - S.balance) >= S.dayStartBal * P.plan.risk.dailyLoss / 100; if (risk) toast('Daily loss limit hit. Plan says stop for today.'); };
  }

  function endSession() {
    pause();
    if (S.open) { toast('Close your open trade first'); return; }
    const pnl = S.balance - S.startBal;
    modal('<h3>End session?</h3><p>Result: <b class="' + (pnl >= 0 ? 'up' : 'dn') + '">' + fmt(pnl) + '</b> over ' + S.trades + ' trades.</p><div class="tbtns"><button class="ghost2" id="en_no">Keep going</button><button class="sell" id="en_yes">End</button></div>');
    $('#en_no').onclick = closeModal;
    $('#en_yes').onclick = () => { P.sessionsDone++; P.session = null; S = null; saveP(); closeModal(); showTab('replay'); };
  }

  // ---------- stats ----------
  function renderStats() {
    const J = P.journal, n = J.length, lv = E.levelFor(P.xp), lo = E.xpForLevel(lv), hi = E.xpForLevel(lv + 1);
    const wins = J.filter((j) => j.pnl > 0).length, avgS = n ? J.reduce((a, j) => a + j.score, 0) / n : 0;
    const clean = J.filter((j) => j.level === 2).length, honest = J.filter((j) => j.verdict === 'honest').length;
    const leaks = [['Skipped checklist items', J.filter((j) => j.flags.incomplete).length], ['Risked more than plan', J.filter((j) => j.flags.risk).length], ['Took below-minimum RR', J.filter((j) => j.flags.rr).length], ['Broke daily limits', J.filter((j) => j.flags.limits).length], ['Widened a stop', J.filter((j) => j.flags.widened).length], ['Closed manually', J.filter((j) => j.flags.manual).length], ['Overclaimed in review', J.filter((j) => j.verdict === 'overclaimed').length]].sort((a, b) => b[1] - a[1]);
    let h = '<div class="page"><div class="card lvl"><div class="lvn">Level ' + lv + '</div><div class="bar"><i style="width:' + Math.min(100, (P.xp - lo) / (hi - lo) * 100) + '%"></i></div><div class="muted sm">' + P.xp + ' XP &middot; ' + (hi - P.xp) + ' to level ' + (lv + 1) + '</div></div>' +
      '<div class="kpis"><div><b>' + P.streak + '</b><span>clean streak</span></div><div><b>' + P.bestStreak + '</b><span>best</span></div><div><b>' + n + '</b><span>trades</span></div><div><b>' + (n ? Math.round(avgS) : 0) + '</b><span>avg score</span></div></div>' +
      '<div class="kpis"><div><b>' + (n ? Math.round(clean / n * 100) : 0) + '%</b><span>fully on-plan</span></div><div><b>' + (n ? Math.round(honest / n * 100) : 0) + '%</b><span>honest reviews</span></div><div><b>' + (n ? Math.round(wins / n * 100) : 0) + '%</b><span>win rate</span></div><div><b>' + P.sessionsDone + '</b><span>sessions</span></div></div>';
    if (n) h += '<div class="card"><b>Where you leak discipline</b>' + leaks.map((l) => '<div class="srow"><span>' + l[0] + '</span><b class="' + (l[1] ? 'dn' : 'up') + '">' + l[1] + '</b></div>').join('') + '</div>';
    h += '<h3>Journal</h3>' + (n ? J.slice().reverse().slice(0, 60).map((j) => '<div class="card jr"><div class="jt"><b>' + (j.dir > 0 ? 'LONG' : 'SHORT') + '</b> <span class="muted sm">' + fdate(j.t0) + '</span><span class="sc">' + j.score + '</span></div><div class="' + (j.pnl >= 0 ? 'up' : 'dn') + '">' + fmt(j.pnl) + ' (' + j.r.toFixed(2) + 'R) &middot; ' + j.reason + '</div><div class="muted sm">You said: ' + j.said + ' &middot; verdict: ' + j.verdict + '</div><div class="sm">' + esc(j.note) + '</div></div>').join('') : '<p class="muted">No trades yet. Go place one.</p>') + '</div>';
    $('#view').innerHTML = h;
  }

  // ---------- plan ----------
  function renderPlan() {
    const imgs = loadImgs();
    $('#view').innerHTML = '<div class="page"><h2>Your plan</h2><div class="card">' + planSummary(P.plan) + '</div>' +
      '<button class="btn" id="p_edit">Edit plan</button>' +
      '<h3 style="margin-top:22px">Plan pictures</h3><p class="muted sm">Upload screenshots or photos of your written plan or setups. They stay on this device and open from the trade ticket.</p>' +
      '<div class="thumbs">' + imgs.map((d, i) => '<div class="th"><img src="' + d + '" data-view="' + i + '"><button class="x" data-rmimg="' + i + '">&times;</button></div>').join('') + '</div>' +
      '<button class="btn ghost" id="p_addimg">+ Add pictures</button><input type="file" id="p_imgfile" accept="image/*" multiple hidden>' +
      '<h3 style="margin-top:22px">Backup</h3><p class="muted sm">Your plan, XP and journal live on this device. Save a backup file so updates, a phone change or clearing Safari data cannot wipe them.</p>' +
      '<button class="btn" id="p_export">Save backup</button> <button class="btn ghost" id="p_import">Restore backup</button><input type="file" id="p_ifile" accept=".json,application/json" hidden>' +
      '<p style="margin-top:22px"><button class="btn ghost" id="p_reset">Reset everything</button></p>' +
      '<p class="muted sm">Data: PAXG/USDT 1-minute bars (gold-backed token, close to spot gold but not identical to broker XAUUSD). Times in UTC. Updates to the app never touch your saved data.</p></div>';
    $('#p_edit').onclick = () => startWizard(true);
    $('#p_addimg').onclick = () => $('#p_imgfile').click();
    $('#p_imgfile').onchange = async (e) => {
      const a = loadImgs();
      for (const f of [...e.target.files].slice(0, 8)) { try { a.push(await shrink(f)); } catch (x) {} }
      if (a.length > 12) a.splice(0, a.length - 12);
      if (saveImgs(a)) renderPlan();
    };
    document.querySelectorAll('[data-rmimg]').forEach((b) => (b.onclick = () => { const a = loadImgs(); a.splice(+b.dataset.rmimg, 1); saveImgs(a); renderPlan(); }));
    document.querySelectorAll('[data-view]').forEach((im) => (im.onclick = () => showImg(+im.dataset.view)));
    $('#p_export').onclick = doExport;
    $('#p_import').onclick = () => $('#p_ifile').click();
    $('#p_ifile').onchange = (e) => e.target.files[0] && doImport(e.target.files[0]);
    $('#p_reset').onclick = () => { modal('<h3>Reset everything?</h3><p>Deletes your plan, XP and journal on this device. Save a backup first if unsure.</p><div class="tbtns"><button class="ghost2" id="rs_n">Cancel</button><button class="sell" id="rs_y">Delete</button></div>'); $('#rs_n').onclick = closeModal; $('#rs_y').onclick = () => { localStorage.removeItem(KEY); localStorage.removeItem(IKEY); location.reload(); }; };
  }
  function showImg(i) {
    const a = loadImgs(); if (!a[i]) return;
    const m = $('#modal'); m.innerHTML = '<div class="sheet tall"><img class="bigimg" src="' + a[i] + '"><div class="tbtns"><button class="ghost2" id="im_c">Close</button></div></div>'; m.classList.add('on');
    $('#im_c').onclick = closeModal;
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('pagehide', () => { if (P) saveP(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  boot();
})();
