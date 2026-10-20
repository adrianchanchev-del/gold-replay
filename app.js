/* Retest UI */
(function () {
  'use strict';
  const E = window.Engine, PT = window.Patterns;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const APP_VERSION = '0.13.1', BUILD = 'gr-v14';
  const KEY = 'goldreplay.v1';
  const TFS = [[1, '1m'], [3, '3m'], [5, '5m'], [10, '10m'], [15, '15m'], [30, '30m'], [60, '1h'], [120, '2h'], [240, '4h'], [1440, '1D']];
  const ICON = {
    replay: '<svg viewBox="0 0 24 24"><path d="M7 3v3M7 14v4M7 6h0M5 6h4v8H5zM17 6v3M17 17v3M15 9h4v8h-4z"/></svg>',
    stats: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    plan: '<svg viewBox="0 0 24 24"><path d="M9 4h6v3H9zM7 5H5v16h14V5h-2M9 12h6M9 16h4"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  };
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
    if (navigator.canShare && navigator.canShare({ files: [f] })) { navigator.share({ files: [f], title: 'Retest backup' }).catch(() => {}); return; }
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
    box.innerHTML = '<div class="center"><div class="logo">&#9672;</div><h2>Retest</h2><div class="muted sm">v'+APP_VERSION+'</div><div id="prog" class="muted">Loading gold data&hellip;</div><div class="bar"><i id="pbar"></i></div></div>';
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
    if (!P.set) P.set = { tf: 15, speed: 0 };
    speedI = Math.min(SPEEDS.length - 1, P.set.speed || 0);
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
    $('#app').innerHTML = '<div id="view"></div><div class="dock">' + (t === 'replay' && S ? '<div id="tradebar"></div>' : '') + '<nav class="nav">' +
      [['replay', 'Replay'], ['stats', 'Stats'], ['plan', 'Plan'], ['settings', 'Settings']].map((x) => '<button data-tab="' + x[0] + '" class="' + (t === x[0] ? 'on' : '') + '">' + ICON[x[0]] + '<span>' + x[1] + '</span></button>').join('') + '</nav></div>';
    document.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { if (b.dataset.tab !== tab) showTab(b.dataset.tab); });
    if (t === 'replay') (S ? renderReplay() : renderStart());
    else if (t === 'stats') renderStats();
    else if (t === 'settings') renderSettings();
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
      S = P.session = { dv: DV, cur: idx, tf: (P.set && P.set.tf) || 15, startBal: bal, balance: bal, trades: 0, open: null, dayKey: Math.floor(t / 1440), dayStartBal: bal, dayTrades: 0, startT: t };
      saveP(); showTab('replay');
    }
  }

  // ---------- replay ----------
  let HIST = [], IS = [];
  let dTool = 'cur', dSel = null, dDraft = null, dDrag = null, dGrab = false, ovSig = '', ovRaf = 0, dVer = 0, dtbOpen = false, mkApi = null;
  const PZ = { k: 1, off: 0 };
  const IND = { ema: ['EMA', 20, '#e6c14b'], sma: ['SMA', 50, '#4f8cff'], bb: ['Bollinger Bands', 20, '#9b8cff'], vwap: ['VWAP', 0, '#ff9f43'], rsi: ['RSI', 14, '#c792ea'], vol: ['Volume', 0, '#5c6b7f'] };
  const PALETTE = ['#e6c14b', '#4f8cff', '#ff9f43', '#c792ea', '#5ad1c4', '#ff6f91'];
  function destroyChart() { cancelAnimationFrame(ovRaf); ovRaf = 0; mkApi = null; if (chart) { try { chart.remove(); } catch (e) {} chart = null; series = null; lines = []; IS = []; } }

  // ---- timeframe menu (collapsible, with pinned favourites) ----
  function tfLabel(v) { const t = TFS.find((x) => x[0] === v); return t ? t[1] : v + 'm'; }
  function tfFavs() { const f = P.set && P.set.favs; return Array.isArray(f) ? f : [1, 5, 15, 60, 240, 1440]; }
  function drawTfBits() {
    if (!S) return;
    const favs = tfFavs();
    const m = $('#tf_menu'); if (m) m.innerHTML = tfLabel(S.tf) + ' &#9662;';
    const pins = $('#tf_pins');
    if (pins) pins.innerHTML = TFS.filter((t) => favs.includes(t[0])).map((t) => '<button class="tf ' + (S.tf === t[0] ? 'on' : '') + '" data-tfs="' + t[0] + '">' + t[1] + '</button>').join('');
    const pn = $('#tf_panel');
    if (pn) pn.innerHTML = TFS.map((t) => '<div class="tfr"><button class="tfo ' + (S.tf === t[0] ? 'on' : '') + '" data-tfs="' + t[0] + '">' + t[1] + '</button><button class="star ' + (favs.includes(t[0]) ? 'on' : '') + '" data-star="' + t[0] + '" title="Pin to the bar">' + (favs.includes(t[0]) ? '&#9733;' : '&#9734;') + '</button></div>').join('');
    document.querySelectorAll('#tf_pins [data-tfs], #tf_panel [data-tfs]').forEach((b) => (b.onclick = () => { setTF(+b.dataset.tfs); const p = $('#tf_panel'); if (p) p.classList.remove('on'); }));
    document.querySelectorAll('[data-star]').forEach((b) => (b.onclick = (e) => {
      e.stopPropagation(); const v = +b.dataset.star; let f = tfFavs().slice();
      f = f.includes(v) ? f.filter((x) => x !== v) : f.concat(v); P.set.favs = f; saveP(); drawTfBits();
    }));
  }
  function setTF(v) { if (!S || v === S.tf) return; S.tf = v; loadTF(); drawTfBits(); saveP(); }

  function renderReplay() {
    dTool = 'cur'; dSel = null; dDraft = null; dDrag = null; dGrab = false; ovSig = '';
    $('#view').innerHTML = '<div class="rp">' +
      '<div class="top">' +
      '<div class="info2"><div class="i2a"><span id="h_sess" class="stag"></span><span id="h_time"></span></div>' +
      '<div class="stats4"><span class="kv"><i>Balance</i><b id="h_bal"></b></span><span class="kv"><i>Equity</i><b id="h_eq"></b></span><span class="kv"><i>Session P&amp;L</i><b id="h_pnl"></b></span><span class="kv"><i>Trades today</i><b id="h_cnt"></b></span></div></div>' +
      '<div class="tfrow"><div class="tfmw"><button class="tfm" id="tf_menu"></button><div id="tf_panel" class="tfpanel"></div></div><div class="tfpins" id="tf_pins"></div>' +
      '<button class="tf ind" id="c_hist" title="Trade history">&#9776;</button><button class="tf ind" id="c_ind">fx</button></div></div>' +
      '<div id="chartwrap"><div id="chart"></div><canvas id="ov"></canvas><div id="hnd"></div><div id="dtb"></div><button id="c_auto" class="autob on" title="Auto-fit price">A</button>' +
      '<div class="island"><div class="fxbar"><button id="c_play" class="pl">&#9654;</button><button id="c_next">+candle</button><button id="c_sess">Next sesh</button><div class="spw"><button id="c_speed">1x &#9662;</button><div id="c_menu" class="spmenu"></div></div><button id="c_end" class="endb">End</button></div></div></div></div>';
    mountChart(); loadTF(); drawTfBits(); drawTb(); bindDraw();
    $('#tf_menu').onclick = (e) => { e.stopPropagation(); $('#tf_panel').classList.toggle('on'); };
    $('#c_next').onclick = () => { pause(); nextCandle(); };
    $('#c_sess').onclick = () => { pause(); nextSession(); };
    $('#c_play').onclick = () => (timer ? pause() : play());
    const setSp = () => { $('#c_speed').innerHTML = SPEEDS[speedI] + 'x &#9662;'; };
    setSp();
    $('#c_menu').innerHTML = SPEEDS.map((v, i) => '<button data-sp="' + i + '">' + v + 'x</button>').join('');
    $('#c_speed').onclick = (e) => { e.stopPropagation(); $('#c_menu').classList.toggle('on'); };
    document.querySelectorAll('[data-sp]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); speedI = +b.dataset.sp; setSp(); $('#c_menu').classList.remove('on'); if (timer) { pause(); play(); } }));
    $('#chartwrap').addEventListener('pointerdown', (e) => { if (!e.target.closest('.spw')) $('#c_menu').classList.remove('on'); });
    $('#view').addEventListener('pointerdown', (e) => { if (!e.target.closest('.tfmw')) { const p = $('#tf_panel'); if (p) p.classList.remove('on'); } });
    $('#c_ind').onclick = () => { pause(); openInd(); };
    $('#c_hist').onclick = () => { pause(); openHistory(); };
    $('#c_end').onclick = endSession;
    drawTradebar(); refreshHud(); drawLines();
    cancelAnimationFrame(ovRaf); ovRaf = requestAnimationFrame(ovLoop);
    if (S.pending) (S.pending.check ? resultStep(S.pending) : checklistStep(S.pending));
    else if (!S.jmode) jmodeModal();
  }
  function mountChart() {
    destroyChart();
    const LW = window.LightweightCharts;
    chart = LW.createChart($('#chart'), {
      autoSize: true, layout: { background: { color: '#131722' }, textColor: '#9aa4b2', fontSize: 11, panes: { separatorColor: '#2a2e39' } },
      grid: { vertLines: { color: '#1b2030' }, horzLines: { color: '#1b2030' } },
      localization: { priceFormatter: (p) => p.toFixed(2) },
      timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 6, borderColor: '#2a2e39', barSpacing: 9, minBarSpacing: 3 },
      rightPriceScale: { borderColor: '#2a2e39', scaleMargins: { top: 0.08, bottom: 0.14 } }, crosshair: { mode: 0 },
    });
    PZ.k = 1; PZ.off = 0; manual = false;
    series = chart.addSeries(LW.CandlestickSeries, {
      upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350', priceLineVisible: true,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      // price-axis wheel zoom / pan is applied on top of the automatic range
      autoscaleInfoProvider: (base) => {
        const r = base(); if (!r || !r.priceRange || (PZ.k === 1 && !PZ.off)) return r;
        const a = r.priceRange.minValue, b = r.priceRange.maxValue, c = (a + b) / 2, hh = (b - a) / 2 * PZ.k, o = (b - a) * PZ.off;
        return { priceRange: { minValue: c - hh + o, maxValue: c + hh + o }, margins: r.margins };
      },
    });
    mkApi = LW.createSeriesMarkers ? LW.createSeriesMarkers(series, []) : null;
  }
  function loadTF() {
    HIST = E.candles(S.tf, S.cur, 700);
    series.setData(HIST); S.run = HIST[HIST.length - 1] || null;
    PZ.k = 1; PZ.off = 0;
    buildInd(); refreshMarkers(); dVer++;
    chart.timeScale().applyOptions({ barSpacing: 9 });
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, HIST.length - 60), to: HIST.length + 6 });
  }

  // ---------- drawing tools (overlay canvas on top of the chart) ----------
  const DTOOLS = [['cur', '&#8598;', 'Cursor'], ['trend', '&#9585;', 'Trend line'], ['ray', '&#8599;', 'Ray'], ['hline', '&#8212;', 'Horizontal line'], ['vline', '&#124;', 'Vertical line'], ['rect', '&#9645;', 'Rectangle'], ['fib', 'Fib', 'Fib retracement'], ['text', 'T', 'Text']];
  const FIBS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  const DCOL = '#e6c14b';
  function t2l(t) {
    const n = HIST.length; if (!n) return 0; const step = S.tf * 60;
    if (t >= HIST[n - 1].time) return n - 1 + (t - HIST[n - 1].time) / step;
    if (t <= HIST[0].time) return (t - HIST[0].time) / step;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (HIST[m].time <= t) lo = m; else hi = m; }
    return lo + (t - HIST[lo].time) / (HIST[hi].time - HIST[lo].time);
  }
  function l2t(l) {
    const n = HIST.length; if (!n) return 0; const step = S.tf * 60;
    if (l >= n - 1) return HIST[n - 1].time + (l - (n - 1)) * step;
    if (l <= 0) return HIST[0].time + l * step;
    const lo = Math.floor(l); return HIST[lo].time + (l - lo) * (HIST[lo + 1].time - HIST[lo].time);
  }
  const proj = (pt) => { const x = chart.timeScale().logicalToCoordinate(t2l(pt.t)), y = series.priceToCoordinate(pt.p); return (x == null || y == null) ? null : { x, y }; };
  function unproj(x, y) {
    const l = chart.timeScale().coordinateToLogical(x), p = series.coordinateToPrice(y);
    if (l == null || p == null) return null;
    return { t: l2t(l), p: Math.round(p * 100) / 100, l };
  }
  function distSeg(px, py, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
    let u = L ? ((px - a.x) * dx + (py - a.y) * dy) / L : 0; u = Math.max(0, Math.min(1, u));
    return Math.hypot(px - (a.x + u * dx), py - (a.y + u * dy));
  }
  function plotSize() {
    const w = $('#chartwrap').clientWidth, h = $('#chartwrap').clientHeight; let pw = w - 56, ph = h - 26;
    try { pw = w - chart.priceScale('right').width(); } catch (e) {}
    try { ph = h - chart.timeScale().height(); } catch (e) {}
    return { w, h, pw, ph };
  }
  function setDirty() { dVer++; }
  function setOvMode() {
    const ov = $('#ov'); if (!ov) return;
    ov.classList.toggle('act', dTool !== 'cur' || dGrab);
    document.querySelectorAll('[data-dt]').forEach((b) => b.classList.toggle('on', b.dataset.dt === dTool));
    const dl = $('#dt_del'); if (dl) dl.classList.toggle('dis', dSel == null);
  }
  function drawTb() {
    const el = $('#dtb'); if (!el) return;
    el.innerHTML = '<button id="dt_open" class="dtb0' + (dtbOpen ? ' on' : '') + '" title="Drawing tools">&#9998;</button>' +
      (dtbOpen ? '<div class="dtl">' + DTOOLS.map((t) => '<button data-dt="' + t[0] + '" title="' + t[2] + '">' + t[1] + '</button>').join('') +
        '<button id="dt_del" class="dis" title="Delete selected">&times;</button><button id="dt_clr" title="Clear all drawings">Clr</button></div>' : '');
    $('#dt_open').onclick = () => { dtbOpen = !dtbOpen; if (!dtbOpen) { dTool = 'cur'; dDraft = null; dSel = null; dGrab = false; setDirty(); } drawTb(); setOvMode(); };
    document.querySelectorAll('[data-dt]').forEach((b) => (b.onclick = () => { dTool = b.dataset.dt; dDraft = null; if (dTool !== 'cur') { dSel = null; dGrab = false; } setDirty(); setOvMode(); }));
    if (dtbOpen) {
      $('#dt_del').onclick = () => { delSel(); };
      $('#dt_clr').onclick = () => { if (!(S.draws || []).length) return; if (confirm('Clear all drawings?')) { S.draws = []; dSel = null; dGrab = false; saveP(); setDirty(); setOvMode(); } };
    }
    setOvMode();
  }
  function delSel() {
    if (dSel == null || !S.draws || !S.draws[dSel]) return;
    S.draws.splice(dSel, 1); dSel = null; dGrab = false; saveP(); setDirty(); setOvMode();
  }

  function paintOne(ctx, d, sel, pw, ph) {
    const P0 = d.pts.map(proj); if (P0.some((q) => !q)) return;
    ctx.strokeStyle = d.color || DCOL; ctx.fillStyle = d.color || DCOL; ctx.lineWidth = sel ? 2 : 1.5; ctx.setLineDash([]);
    const a = P0[0], b = P0[1];
    if (d.type === 'trend') { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    else if (d.type === 'ray') {
      const dx = b.x - a.x, dy = b.y - a.y; let k = 1;
      if (dx || dy) { k = 1e5 / Math.hypot(dx, dy); }
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + dx * k, a.y + dy * k); ctx.stroke();
    } else if (d.type === 'hline') {
      ctx.beginPath(); ctx.moveTo(0, a.y); ctx.lineTo(pw, a.y); ctx.stroke();
      const lbl = d.pts[0].p.toFixed(2); ctx.font = '11px sans-serif'; const tw = ctx.measureText(lbl).width + 10;
      ctx.fillRect(pw, a.y - 8, tw, 16); ctx.fillStyle = '#10141a'; ctx.textBaseline = 'middle'; ctx.fillText(lbl, pw + 5, a.y); ctx.fillStyle = d.color || DCOL;
    } else if (d.type === 'vline') { ctx.beginPath(); ctx.moveTo(a.x, 0); ctx.lineTo(a.x, ph); ctx.stroke(); }
    else if (d.type === 'rect') {
      ctx.globalAlpha = 0.14; ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); ctx.globalAlpha = 1;
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    } else if (d.type === 'fib') {
      const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x) + (Math.abs(b.x - a.x) < 40 ? 60 : 0);
      ctx.font = '11px sans-serif'; ctx.textBaseline = 'bottom';
      FIBS.forEach((L) => {
        const pr = d.pts[1].p + (d.pts[0].p - d.pts[1].p) * L, y = series.priceToCoordinate(pr); if (y == null) return;
        ctx.globalAlpha = L === 0 || L === 1 ? 1 : 0.7; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.globalAlpha = 1;
        ctx.fillText(L + '  (' + pr.toFixed(2) + ')', x0 + 4, y - 2);
      });
      ctx.setLineDash([4, 4]); ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.globalAlpha = 1; ctx.setLineDash([]);
    } else if (d.type === 'text') { ctx.font = '600 13px sans-serif'; ctx.textBaseline = 'middle'; ctx.fillText(d.text || '', a.x, a.y); }
    if (sel && d.type !== 'hline' && d.type !== 'vline' && d.type !== 'text') {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = d.color || DCOL; ctx.lineWidth = 2;
      P0.forEach((q) => { ctx.beginPath(); ctx.arc(q.x, q.y, 5, 0, 6.3); ctx.fill(); ctx.stroke(); });
    }
  }
  function ovDraw() {
    const cv = $('#ov'), wrap = $('#chartwrap'); if (!cv || !wrap || !chart || !series || !S) return;
    const ps = plotSize(), dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(ps.w * dpr) || cv.height !== Math.round(ps.h * dpr)) { cv.width = Math.round(ps.w * dpr); cv.height = Math.round(ps.h * dpr); cv.style.width = ps.w + 'px'; cv.style.height = ps.h + 'px'; }
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, ps.w, ps.h);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, ps.pw, ps.ph); ctx.clip();
    // trade history: dotted line entry -> exit
    (S.hist || []).forEach((h) => {
      const a = proj({ t: h.t0 * 60, p: h.entry }), b = proj({ t: h.t1 * 60, p: h.exit }); if (!a || !b) return;
      ctx.strokeStyle = h.pnl >= 0 ? '#26a69a' : '#ef5350'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    });
    (S.draws || []).forEach((d, i) => paintOne(ctx, d, i === dSel, ps.pw, ps.ph));
    if (dDraft && dDraft.pts[1]) paintOne(ctx, Object.assign({ color: DCOL }, dDraft), true, ps.pw, ps.ph);
    ctx.restore();
  }
  function ovLoop() {
    ovRaf = 0;
    if (!chart || !series || !S || !$('#ov')) return;
    try {
      const lr = chart.timeScale().getVisibleLogicalRange(), n = HIST.length, c = n ? HIST[n - 1].close : 0, w = $('#chartwrap');
      const sig = [lr ? lr.from.toFixed(3) + lr.to.toFixed(3) : '', series.priceToCoordinate(c), series.priceToCoordinate(c + 10), S.cur, n, w.clientWidth, w.clientHeight, dVer, dSel, S.tf].join('|');
      if (sig !== ovSig) { ovSig = sig; ovDraw(); }
    } catch (e) {}
    ovRaf = requestAnimationFrame(ovLoop);
  }

  // hit test in px; returns {i, h} (h = handle index or -1)
  function hitTest(x, y) {
    const ds = S.draws || [], ps = plotSize();
    for (let i = ds.length - 1; i >= 0; i--) {
      const d = ds[i], Q = d.pts.map(proj); if (Q.some((q) => !q)) continue;
      const a = Q[0], b = Q[1];
      if (i === dSel && d.type !== 'hline' && d.type !== 'vline' && d.type !== 'text') for (let k = 0; k < Q.length; k++) if (Math.hypot(x - Q[k].x, y - Q[k].y) < 14) return { i, h: k };
      let hit = false;
      if (d.type === 'trend') hit = distSeg(x, y, a, b) < 9;
      else if (d.type === 'ray') { const dx = b.x - a.x, dy = b.y - a.y, k = (dx || dy) ? 1e5 / Math.hypot(dx, dy) : 1; hit = distSeg(x, y, a, { x: a.x + dx * k, y: a.y + dy * k }) < 9; }
      else if (d.type === 'hline') hit = Math.abs(y - a.y) < 9;
      else if (d.type === 'vline') hit = Math.abs(x - a.x) < 9;
      else if (d.type === 'rect') { const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y); hit = x >= x0 - 8 && x <= x1 + 8 && y >= y0 - 8 && y <= y1 + 8; }
      else if (d.type === 'fib') {
        const x0 = Math.min(a.x, b.x) - 8, x1 = Math.max(a.x, b.x) + 60;
        hit = x >= x0 && x <= x1 && FIBS.some((L) => { const yy = series.priceToCoordinate(d.pts[1].p + (d.pts[0].p - d.pts[1].p) * L); return yy != null && Math.abs(y - yy) < 9; });
      } else if (d.type === 'text') { hit = Math.abs(y - a.y) < 14 && x >= a.x - 6 && x <= a.x + 14 + (d.text || '').length * 8; }
      if (hit) return { i, h: -1 };
    }
    return null;
  }
  function localXY(e) { const r = $('#chartwrap').getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function inPlot(x, y) { const ps = plotSize(); return x >= 0 && y >= 0 && x <= ps.pw && y <= ps.ph; }
  function finishDraft() {
    const d = dDraft; dDraft = null;
    if (d && d.pts[1] && (Math.abs(d.pts[1].l - d.pts[0].l) > 0.05 || Math.abs(d.pts[1].p - d.pts[0].p) > 0.01)) {
      S.draws = S.draws || []; S.draws.push({ type: d.type, pts: d.pts.map((q) => ({ t: q.t, p: q.p })), color: DCOL }); dSel = S.draws.length - 1; saveP();
    }
    dTool = 'cur'; dGrab = dSel != null; setDirty(); setOvMode();
  }
  function bindDraw() {
    const ov = $('#ov'), wrap = $('#chartwrap');
    ov.addEventListener('pointerdown', (e) => {
      const { x, y } = localXY(e); e.preventDefault(); e.stopPropagation();
      if (dTool !== 'cur') {
        const u = unproj(x, y); if (!u || !inPlot(x, y)) return;
        if (dTool === 'hline' || dTool === 'vline' || dTool === 'text') {
          let txt = '';
          if (dTool === 'text') { txt = (window.prompt('Text') || '').trim(); if (!txt) { dTool = 'cur'; setOvMode(); return; } }
          S.draws = S.draws || []; S.draws.push({ type: dTool, pts: [{ t: u.t, p: u.p }], color: DCOL, text: txt }); dSel = S.draws.length - 1; dTool = 'cur'; dGrab = true; saveP(); setDirty(); setOvMode(); return;
        }
        if (dDraft && dDraft.armed) { dDraft.pts[1] = u; finishDraft(); return; }
        dDraft = { type: dTool, pts: [u, u], sx: e.clientX, sy: e.clientY, armed: false }; setDirty();
        try { ov.setPointerCapture(e.pointerId); } catch (x2) {}
        return;
      }
      // grab mode: move / reshape the selected drawing
      const h = hitTest(x, y);
      if (!h) { dSel = null; dGrab = false; setDirty(); setOvMode(); return; }
      dSel = h.i; const d = S.draws[h.i], u = unproj(x, y);
      dDrag = { i: h.i, h: h.h, l0: u ? u.l : 0, p0: u ? u.p : 0, orig: d.pts.map((q) => ({ t: q.t, p: q.p })), moved: false };
      try { ov.setPointerCapture(e.pointerId); } catch (x2) {} setDirty();
    });
    ov.addEventListener('pointermove', (e) => {
      const { x, y } = localXY(e);
      if (dDraft) { const u = unproj(x, y); if (u) { dDraft.pts[1] = u; setDirty(); } return; }
      if (dDrag) {
        const u = unproj(x, y); if (!u) return; const d = S.draws[dDrag.i]; if (!d) return; dDrag.moved = true;
        if (dDrag.h >= 0) d.pts[dDrag.h] = { t: u.t, p: u.p };
        else { const dl = u.l - dDrag.l0, dp = u.p - dDrag.p0; d.pts = dDrag.orig.map((q) => ({ t: l2t(t2l(q.t) + dl), p: Math.round((q.p + dp) * 100) / 100 })); }
        setDirty();
      }
    });
    const up = (e) => {
      if (dDraft) {
        const moved = Math.hypot(e.clientX - dDraft.sx, e.clientY - dDraft.sy);
        if (moved > 8) finishDraft(); else dDraft.armed = true; // tap: place the second point with the next tap
        return;
      }
      if (dDrag) { const m = dDrag.moved; dDrag = null; if (m) saveP(); setDirty(); }
    };
    ov.addEventListener('pointerup', up); ov.addEventListener('pointercancel', () => { dDrag = null; });
    // cursor mode: pick up a drawing when you press on it (mouse) or tap it (touch)
    wrap.addEventListener('pointerdown', (e) => {
      if (dTool !== 'cur' || dGrab || e.target === ov || e.target.closest('#dtb,.island,.hd,.spw')) return;
      if (!(S.draws || []).length) return;
      const { x, y } = localXY(e); const h = hitTest(x, y); if (!h) return;
      dSel = h.i; dGrab = true; setOvMode(); setDirty();
      if (e.pointerType === 'mouse') {
        e.preventDefault(); e.stopPropagation();
        const u = unproj(x, y), d = S.draws[h.i];
        dDrag = { i: h.i, h: -1, l0: u ? u.l : 0, p0: u ? u.p : 0, orig: d.pts.map((q) => ({ t: q.t, p: q.p })), moved: false };
        try { ov.setPointerCapture(e.pointerId); } catch (x2) {}
      }
    }, true);
    // wheel over the price axis: zoom the price scale (shift = pan up/down)
    wrap.addEventListener('wheel', (e) => {
      if (!chart || !series) return;
      const r = wrap.getBoundingClientRect(); let pw = 56; try { pw = chart.priceScale('right').width(); } catch (x2) {}
      if (e.clientX - r.left < r.width - pw) return;
      e.preventDefault(); e.stopPropagation();
      const dy = Math.max(-200, Math.min(200, e.deltaY));
      if (e.shiftKey) PZ.off = Math.max(-3, Math.min(3, PZ.off - dy * 0.0008));
      else PZ.k = Math.max(0.15, Math.min(12, PZ.k * Math.exp(dy * 0.0025)));
      manual = false; const ab = $('#c_auto'); if (ab) ab.classList.add('on'); series.priceScale().applyOptions({ autoScale: true }); setDirty();
    }, { capture: true, passive: false });
    wrap.addEventListener('pointerdown', (e) => {
      if (e.target.closest('#dtb,.island,.hd,.spw,#c_auto') || e.target === ov) return;
      if (!manual && PZ.k === 1 && !PZ.off) setManual(true);
      else if (!manual) { PZ.k = 1; PZ.off = 0; setManual(true); }
    }, true);
    $('#c_auto').onclick = () => setManual(false);
    document.addEventListener('keydown', kdel);
  }
  function kdel(e) {
    if (!$('#ov')) { document.removeEventListener('keydown', kdel); return; }
    if (/INPUT|TEXTAREA|SELECT/.test((e.target.tagName || ''))) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && dSel != null) { e.preventDefault(); delSel(); }
    else if (e.key === 'Escape') { dDraft = null; dTool = 'cur'; dSel = null; dGrab = false; setDirty(); setOvMode(); }
  }

  // ---------- trade markers + session history ----------
  function refreshMarkers() {
    if (!mkApi || !S) return;
    const tf = S.tf * 60, first = HIST.length ? HIST[0].time : 0, ms = [];
    const bt = (m) => Math.floor(m * 60 / tf) * tf;
    (S.hist || []).forEach((h) => {
      const te = bt(h.t0), tx = bt(h.t1), buy = h.dir > 0;
      if (te >= first) ms.push({ time: te, position: buy ? 'belowBar' : 'aboveBar', color: buy ? '#26a69a' : '#ef5350', shape: buy ? 'arrowUp' : 'arrowDown', text: buy ? 'Buy' : 'Sell' });
      if (tx >= first) ms.push({ time: tx, position: buy ? 'aboveBar' : 'belowBar', color: h.pnl >= 0 ? '#26a69a' : '#ef5350', shape: 'circle', text: (h.pnl >= 0 ? '+' : '-') + '$' + Math.abs(h.pnl).toFixed(2) });
    });
    const o = S.open;
    if (o && bt(o.t0) >= first) ms.push({ time: bt(o.t0), position: o.dir > 0 ? 'belowBar' : 'aboveBar', color: '#e6c14b', shape: o.dir > 0 ? 'arrowUp' : 'arrowDown', text: o.dir > 0 ? 'Buy' : 'Sell' });
    ms.sort((a, b) => a.time - b.time);
    try { mkApi.setMarkers(ms); } catch (e) {}
    setDirty();
  }
  function recordHist(t, sc) {
    S.hist = S.hist || [];
    S.hist.push({ id: t.id, t0: t.t0, t1: t.t1, dir: t.dir, entry: t.entry, exit: t.exit, units: t.units, pnl: t.pnl, r: t.r, reason: t.reason, score: sc ? sc.total : null, max: sc ? sc.max : null, onplan: sc ? !sc.mistake : null });
    refreshMarkers();
  }
  function openHistory() {
    const H = S.hist || [], o = S.open, net = S.balance - S.startBal;
    const row = (h, tag) => '<div class="card hrow"><div class="jt"><b>' + (h.dir > 0 ? 'LONG' : 'SHORT') + '</b> <span class="muted sm">' + fdate(h.t0).slice(5, 16) + '</span>' + (tag ? '<span class="sc">' + tag + '</span>' : '<span class="muted sm" style="margin-left:auto">' + h.reason + '</span>') + '</div>' +
      '<div class="muted sm">' + h.entry.toFixed(2) + (h.exit != null ? ' &rarr; ' + h.exit.toFixed(2) : '') + ' &middot; ' + h.units + ' oz</div>' +
      (h.pnl != null ? '<div class="' + (h.pnl >= 0 ? 'up' : 'dn') + '">' + fmt(h.pnl) + ' (' + h.r.toFixed(2) + 'R)</div>' : '') + '</div>';
    let h = '<h3>Session trades</h3><div class="srow"><span>Closed trades</span><b>' + H.length + '</b></div><div class="srow"><span>Session P&amp;L</span><b class="' + (net >= 0 ? 'up' : 'dn') + '">' + fmt(net) + '</b></div>';
    if (o) { const f = E.floating(o, E.close(S.cur)); h += row({ dir: o.dir, t0: o.t0, entry: o.entry, units: o.units, pnl: f, r: o.riskUsd ? f / o.riskUsd : 0 }, 'OPEN'); }
    h += H.length ? H.slice().reverse().map((x) => row(x)).join('') : (o ? '' : '<p class="muted">No closed trades yet.</p>');
    h += '<button class="btn big" id="hs_ok">Close</button>';
    modal(h, 'tall'); $('#hs_ok').onclick = closeModal;
  }

  // ---------- journal mode, session stats ----------
  function jmodeModal() {
    modal('<h3>How will you journal this session?</h3><p class="muted sm">Pick before your first trade. You can\'t change it mid-session.</p>' +
      '<div class="jopt" data-jm="trade"><b>After every trade</b><span>Full review each time: checklist, honesty check, score and XP. Slower and strict.</span></div>' +
      '<div class="jopt" data-jm="end"><b>Once, after the session</b><span>Trade without pop-ups between trades. When you end, you answer a few reflection questions instead. Trades are not scored.</span></div>', 'nodismiss');
    document.querySelectorAll('[data-jm]').forEach((b) => (b.onclick = () => { S.jmode = b.dataset.jm; saveP(); closeModal(); toast(S.jmode === 'trade' ? 'Journaling after every trade' : 'Journaling after the session'); }));
  }
  function sessStats() {
    const H = S.hist || [], n = H.length, wins = H.filter((h) => h.pnl > 0), losses = H.filter((h) => h.pnl < 0);
    const gw = wins.reduce((a, h) => a + h.pnl, 0), gl = Math.abs(losses.reduce((a, h) => a + h.pnl, 0)), sc = H.filter((h) => h.score != null && h.max);
    const net = S.balance - S.startBal, totR = H.reduce((a, h) => a + h.r, 0);
    return { t: Date.now(), n, net, ret: S.startBal ? net / S.startBal * 100 : 0, wr: n ? wins.length / n * 100 : null, totR: n ? totR : null, avgR: n ? totR / n : null,
      pf: gl > 0 ? gw / gl : (gw > 0 ? 99 : null), score: sc.length ? sc.reduce((a, h) => a + h.score / h.max * 100, 0) / sc.length : null,
      best: n ? Math.max.apply(null, H.map((h) => h.pnl)) : null, worst: n ? Math.min.apply(null, H.map((h) => h.pnl)) : null, mode: S.jmode || 'trade' };
  }
  const SMET = [
    ['net', 'Net P&L', (v) => fmt(v), 1], ['ret', 'Return', (v) => (v >= 0 ? '+' : '') + v.toFixed(2) + '%', 1], ['n', 'Trades', (v) => String(v), 0],
    ['wr', 'Win rate', (v) => Math.round(v) + '%', 1], ['totR', 'Total R', (v) => (v >= 0 ? '+' : '') + v.toFixed(2) + 'R', 1], ['avgR', 'Avg R per trade', (v) => (v >= 0 ? '+' : '') + v.toFixed(2) + 'R', 1],
    ['pf', 'Profit factor', (v) => (v >= 99 ? '&infin;' : v.toFixed(2)), 1], ['score', 'Avg plan score', (v) => Math.round(v) + '%', 1], ['best', 'Best trade', (v) => fmt(v), 1], ['worst', 'Worst trade', (v) => fmt(v), 1],
  ];
  function statsModal(st, prev, done) {
    const has = (v) => v != null && isFinite(v);
    let h = '<h3>These are your stats for this session</h3>' + SMET.filter((m) => has(st[m[0]])).map((m) => '<div class="srow"><span>' + m[1] + '</span><b class="' + (m[3] && st[m[0]] !== 0 ? (st[m[0]] > 0 || m[0] === 'wr' || m[0] === 'pf' || m[0] === 'score' ? 'up' : 'dn') : '') + '">' + m[2](st[m[0]]) + '</b></div>').join('');
    if (!st.n) h += '<p class="muted sm">No trades this session.</p>';
    h += '<h4>This is how they compare to last session</h4>';
    if (!prev) h += '<p class="muted sm">This is your first finished session, so there is nothing to compare yet.</p>';
    else {
      h += '<div class="cmp head"><span></span><span>Last</span><span>Now</span><span></span></div>';
      h += SMET.filter((m) => has(st[m[0]]) || has(prev[m[0]])).map((m) => {
        const a = prev[m[0]], b = st[m[0]]; let arrow = '&ndash;', cls = '';
        if (has(a) && has(b) && Math.abs(a - b) > 0.005) { const up = b > a; arrow = up ? '&#9650;' : '&#9660;'; cls = m[3] ? (up ? 'up' : 'dn') : ''; }
        return '<div class="cmp"><span>' + m[1] + '</span><span class="muted">' + (has(a) ? m[2](a) : '&ndash;') + '</span><b>' + (has(b) ? m[2](b) : '&ndash;') + '</b><span class="' + cls + '">' + arrow + '</span></div>';
      }).join('');
    }
    h += '<button class="btn big" id="st_done">Done</button>';
    modal(h, 'tall nodismiss'); $('#st_done').onclick = done;
  }
  function reflectModal(next) {
    modal('<h3>Session journal</h3><p class="muted sm">Jot down anything that popped up in your mind during trading that you might want to implement next time you start a sesh.</p>' +
      '<label class="lbl">Did you learn something? What was it?</label><textarea id="rf_a" rows="3"></textarea>' +
      '<label class="lbl">Any change to a step in your plan, another confluence, or anything new worth noting?</label><textarea id="rf_b" rows="3"></textarea>' +
      '<label class="lbl">Anything else to try next session?</label><textarea id="rf_c" rows="3"></textarea>' +
      '<button class="btn big" id="rf_go">Save and see stats</button>', 'tall nodismiss');
    $('#rf_go').onclick = () => next({ learned: $('#rf_a').value.trim(), changes: $('#rf_b').value.trim(), other: $('#rf_c').value.trim() });
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
    if (!$('#h_time')) return;
    $('#h_time').textContent = fdate(E.t(S.cur)).slice(5).replace(' UTC', ''); $('#h_sess').textContent = sessName(E.t(S.cur));
    const cn = $('#h_cnt'); if (cn) cn.textContent = S.dayTrades + '/' + P.plan.risk.maxTrades;
    const sp = $('#h_pnl'); if (sp) { const v = equity() - S.startBal; sp.textContent = (S.pending && !S.pending.check) ? '\u2022\u2022\u2022\u2022' : (v >= 0 ? '+' : '') + fmt(v); sp.className = (S.pending && !S.pending.check) ? '' : (v >= 0 ? 'up' : 'dn'); }
    const masked = S.pending && !S.pending.check;
    $('#h_bal').textContent = masked ? '\u2022\u2022\u2022\u2022' : fmt(S.balance);
    const eq = equity(); const el = $('#h_eq'); el.textContent = masked ? '\u2022\u2022\u2022\u2022' : fmt(eq); el.className = masked ? '' : (eq >= S.balance ? 'up' : 'dn');
    if (S.open) updateOpenPanel();
  }

  // ---------- trade bar / lines ----------
  let lineObjs = {}, trackId = 0, drag = null;
  const isSetup = (t) => S.cur <= (t.i0 == null ? -1 : t.i0);
  let manual = false;
  function refit() { if (manual) return; try { series.priceScale().applyOptions({ autoScale: true }); } catch (e) {} }
  function setManual(on) {
    manual = on; const a = $('#c_auto'); if (a) a.classList.toggle('on', !on);
    try { series.priceScale().applyOptions({ autoScale: !on }); } catch (e) {}
    if (!on) { PZ.k = 1; PZ.off = 0; setDirty(); }
  }

  function drawLines() {
    if (!series) return;
    Object.keys(lineObjs).forEach((k) => { try { series.removePriceLine(lineObjs[k]); } catch (e) {} });
    lineObjs = {};
    const hn = $('#hnd'), t = S && S.open;
    if (!t) { if (hn) hn.innerHTML = ''; refit(); return; }
    const mk = (price, color, title) => series.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title });
    lineObjs.entry = mk(t.entry, '#e6c14b', 'ENTRY');
    lineObjs.sl = mk(t.sl, '#ef5350', 'SL');
    if (t.tp) lineObjs.tp = mk(t.tp, '#26a69a', 'TP');
    if (hn && !hn.firstChild) buildHandles(hn);
    refit();
    if (!trackId) trackId = requestAnimationFrame(track);
  }

  // ---- draggable SL / TP pills ----
  function buildHandles(hn) {
    hn.innerHTML = '<div class="hd sl" data-hd="sl"><span></span></div><div class="hd tp" data-hd="tp"><span></span></div>';
    hn.querySelectorAll('.hd').forEach((el) => {
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
    });
  }
  function lvText(t, which, price) {
    const setup = isSetup(t);
    let units = t.units, risk = t.riskUsd;
    if (setup && which === 'sl') { const sz = E.size(t.startBal, t.riskPct, t.entry, price); units = sz.units; risk = sz.riskUsd; }
    const pnl = units * (price - t.entry) * t.dir, r = risk ? pnl / risk : 0;
    if (which === 'sl') return 'SL ' + fmt(pnl) + (setup ? ' \u00b7 ' + units + ' oz' : '');
    return 'TP +' + fmt(Math.abs(pnl)).replace('$', '$') + ' \u00b7 ' + Math.abs(r).toFixed(1) + 'R';
  }
  function track() {
    trackId = 0;
    const t = S && S.open, hn = $('#hnd'), ch = $('#chart');
    if (!t || !series || !hn || !ch) return;
    const h = ch.clientHeight;
    hn.querySelectorAll('.hd').forEach((el) => {
      const which = el.dataset.hd, price = drag && drag.which === which && drag.price != null ? drag.price : t[which];
      if (price == null) { el.style.display = 'none'; return; }
      const y = series.priceToCoordinate(price);
      el.style.display = '';
      const yy = y == null ? (price > E.close(S.cur) ? 18 : h - 18) : Math.max(18, Math.min(h - 18, y));
      el.style.top = yy + 'px';
      const txt = lvText(t, which, price);
      if (el._t !== txt) { el._t = txt; el.firstChild.textContent = txt; }
    });
    trackId = requestAnimationFrame(track);
  }
  function onDown(e) {
    const t = S && S.open; if (!t) return;
    e.preventDefault(); e.stopPropagation();
    pause();
    drag = { which: e.currentTarget.dataset.hd, pid: e.pointerId, price: null };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) {}
    e.currentTarget.classList.add('drag');
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.pid || !S || !S.open || !series) return;
    const rect = $('#chart').getBoundingClientRect();
    let p = series.coordinateToPrice(e.clientY - rect.top);
    if (p == null) return;
    p = Math.round(p * 100) / 100;
    const t = S.open, cur = E.close(S.cur), md = 0.5;
    if (drag.which === 'sl') p = t.dir > 0 ? Math.min(p, cur - md) : Math.max(p, cur + md);
    else p = t.dir > 0 ? Math.max(p, cur + md) : Math.min(p, cur - md);
    drag.price = p;
    if (lineObjs[drag.which]) lineObjs[drag.which].applyOptions({ price: p });
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    const d = drag; drag = null;
    e.currentTarget.classList.remove('drag');
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (x) {}
    const t = S && S.open;
    if (t && d.price != null) { if (d.which === 'sl') setSL(t, d.price); else setTP(t, d.price); saveP(); }
    drawLines(); updateOpenPanel();
  }

  // ---- level changes ----
  function applyLive(t, sl, tp) {
    const sz = E.size(t.startBal, t.riskPct, t.entry, sl);
    if (!sz.units) return false;
    t.units = sz.units; t.riskUsd = sz.riskUsd; t.capped = sz.capped; t.sl = sl; t.sl0 = sl; t.tp = tp;
    t.rr0 = tp ? Math.abs(tp - t.entry) / Math.abs(t.entry - sl) : 0;
    return true;
  }
  function setSL(t, p) { if (isSetup(t)) applyLive(t, p, t.tp); else E.setStop(t, p); }
  function setTP(t, p) { if (isSetup(t)) applyLive(t, t.sl, p); else t.tp = p; }

  function drawTradebar() {
    const tb = $('#tradebar'); if (!tb) return;
    if (!S.open) {
      tb.innerHTML = '<div class="dk"><button class="sell" id="b_sell">SELL</button><button class="buy" id="b_buy">BUY</button></div>';
      $('#b_sell').onclick = () => quickTrade(-1); $('#b_buy').onclick = () => quickTrade(1);
    } else {
      tb.innerHTML = '<div class="dk open"><div class="oi"><div id="o_dir"></div><div id="o_info" class="muted"></div></div><div id="o_pnl" class="big"></div><button class="ghost2" id="b_edit">SL/TP</button><button class="close" id="b_close">Close</button></div>';
      $('#b_close').onclick = () => { pause(); finishTrade(E.close(S.cur), E.t(S.cur), 'MANUAL'); };
      $('#b_edit').onclick = editStops; updateOpenPanel();
    }
  }
  function updateOpenPanel() {
    const t = S.open, el = $('#o_pnl'); if (!t || !el) return;
    const f = E.floating(t, E.close(S.cur)), r = t.riskUsd ? f / t.riskUsd : 0;
    $('#o_dir').textContent = (t.dir > 0 ? 'LONG ' : 'SHORT ') + t.units + ' oz';
    $('#o_info').textContent = '@ ' + t.entry.toFixed(2);
    el.textContent = fmt(f) + '  (' + r.toFixed(2) + 'R)'; el.className = 'big ' + (f >= 0 ? 'up' : 'dn');
  }

  function defaultDist() {
    const cs = E.candles(S.tf, S.cur, 20); let s = 0; cs.forEach((c) => (s += c.high - c.low));
    const avg = cs.length ? s / cs.length : 5; return Math.max(1, Math.round(avg * 1.5 * 10) / 10);
  }
  // BUY / SELL: market order at once, default SL and TP, you drag them where you want
  function quickTrade(dir) {
    pause();
    if (S.open || S.pending) return;
    const plan = P.plan, px = E.close(S.cur), dist = defaultDist();
    const sl = +(px - dir * dist).toFixed(2), tp = +(px + dir * (E.SPREAD / 2 + (dist + E.SPREAD / 2) * Math.max(plan.risk.minRR, 1))).toFixed(2);
    const over = S.dayTrades >= plan.risk.maxTrades, breach = (S.dayStartBal - S.balance) >= S.dayStartBal * plan.risk.dailyLoss / 100;
    const tr = E.openTrade({ dir, price: px, sl, tp, balance: S.balance, riskPct: plan.risk.pct, t: E.t(S.cur), check: null, note: '', ctx: { overTrades: over, dailyBreach: breach } });
    if (!tr.units) { toast('Position size is zero'); return; }
    tr.startBal = S.balance; tr.i0 = S.cur;
    S.open = tr; S.dayTrades++; S.trades++;
    drawTradebar(); drawLines(); refreshHud(); saveP(); refreshMarkers();
    if (breach) toast('Daily loss limit reached. Your plan says stop for the day.');
    else if (over) toast('Trade ' + S.dayTrades + ' today. Your limit is ' + plan.risk.maxTrades + '.');
  }
  function editStops() {
    pause(); const t = S.open;
    modal('<h3>Type SL / TP</h3><div class="grid2"><div><label>Stop loss</label><input id="e_sl" type="number" inputmode="decimal" step="0.01" value="' + t.sl + '"></div><div><label>Take profit</label><input id="e_tp" type="number" inputmode="decimal" step="0.01" value="' + (t.tp || '') + '"></div></div>' +
      '<p class="muted sm">Moving the stop closer is fine. Widening it after the first candle is scored against you.</p><div class="tbtns"><button class="ghost2" id="e_c">Cancel</button><button class="buy" id="e_s">Save</button></div>');
    $('#e_c').onclick = closeModal;
    $('#e_s').onclick = () => {
      const sl = +$('#e_sl').value, tp = +$('#e_tp').value || null, px = E.close(S.cur);
      if (!(t.dir > 0 ? sl < px : sl > px)) { toast('Stop would trigger immediately'); return; }
      if (tp && !(t.dir > 0 ? tp > px : tp < px)) { toast('Target is on the wrong side'); return; }
      if (sl !== t.sl) setSL(t, sl);
      if (tp && tp !== t.tp) setTP(t, tp);
      closeModal(); drawLines(); updateOpenPanel(); saveP();
    };
  }

  // ---------- trade end: checklist first, then result + self review ----------
  function finishTrade(price, tmin, reason) {
    pause();
    const t = S.open; E.closeTrade(t, price, tmin, reason);
    S.balance += t.pnl; S.open = null; recordHist(t, null);
    if (S.jmode === 'end') {
      saveP(); drawTradebar(); drawLines(); refreshHud();
      toast({ SL: 'Stopped out', TP: 'Target hit', MANUAL: 'Closed' }[reason] + ': ' + (t.pnl >= 0 ? '+' : '') + fmt(t.pnl) + ' (' + t.r.toFixed(2) + 'R)');
      return;
    }
    S.pending = t; saveP();
    drawTradebar(); drawLines(); refreshHud();
    checklistStep(t);
  }
  function checklistStep(t) {
    const plan = P.plan;
    modal('<h3>Trade closed</h3><p class="muted sm">Tick what was true when you entered. The result comes next, so you cannot tune the answers to the outcome.</p>' +
      '<div class="chk"><h4>Your steps</h4>' + plan.steps.map((s, i) => '<label class="inl"><input type="checkbox" data-cs="' + i + '"> ' + esc(s) + '</label>').join('') +
      '<h4>Confluences</h4>' + plan.conf.map((c, i) => { const l = confLabel(c); return '<label class="inl"><input type="checkbox" data-cc="' + i + '"> <span><b>' + esc(l.name) + '</b>' + (c.required ? ' *' : '') + '<br><span class="muted sm">' + esc(l.v) + '</span></span></label>'; }).join('') +
      (plan.avoid.length ? '<h4>Confirm none of these were true</h4>' + plan.avoid.map((s, i) => '<label class="inl"><input type="checkbox" data-ca="' + i + '"> ' + esc(s) + ' (not true)</label>').join('') : '') + '</div>' +
      '<label>Why did you take it? (optional)</label><textarea id="t_note" rows="2"></textarea>' +
      '<button class="btn big" id="ck_go">Reveal result</button>', 'tall nodismiss');
    $('#ck_go').onclick = () => {
      t.check = { steps: [...document.querySelectorAll('[data-cs]')].map((x) => x.checked), conf: [...document.querySelectorAll('[data-cc]')].map((x) => x.checked), avoid: [...document.querySelectorAll('[data-ca]')].map((x) => x.checked) };
      t.note = $('#t_note').value.trim(); saveP(); refreshHud(); resultStep(t);
    };
  }
  function resultStep(t) {
    const rsn = { SL: 'Stopped out', TP: 'Target hit', MANUAL: 'Closed by you' }[t.reason];
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
  E.confName = (c) => { try { return confLabel(c).name; } catch (x) { return c.id; } };
  function submitReview(t, said, note) {
    S.pending = null;
    const sc = E.scoreTrade(t, P.plan, { followed: said });
    const hh = (S.hist || []).find((x) => x.id === t.id); if (hh) { hh.score = sc.total; hh.max = sc.max; hh.onplan = !sc.mistake; }
    const lvBefore = E.levelFor(P.xp);
    const gain = sc.total * 5 + sc.bonus * 2 + sc.honesty * 5 + (sc.mistake ? 0 : 10);
    P.xp += gain;
    if (!sc.mistake) { P.streak++; P.bestStreak = Math.max(P.bestStreak, P.streak); } else P.streak = 0;
    if (sc.honesty >= 1) P.honest++;
    P.journal.push({ t0: t.t0, t1: t.t1, dir: t.dir, entry: t.entry, exit: t.exit, units: t.units, pnl: t.pnl, r: t.r, reason: t.reason, score: sc.total, max: sc.max, bonus: sc.bonus, honesty: sc.honesty, verdict: sc.verdict, said, level: sc.mistake ? 1 : 2,
      flags: { incomplete: sc.adherence.comp < 1, risk: !sc.adherence.riskOk, rr: !sc.adherence.rrOk, limits: !sc.adherence.limitsOk, widened: !sc.adherence.stopOk, manual: t.reason === 'MANUAL' }, note, why: t.note, comp: sc.adherence.comp });
    if (P.journal.length > 600) P.journal.shift();
    P.sessionsDone = P.sessionsDone || 0; saveP();
    const lvAfter = E.levelFor(P.xp);
    const vtxt = { clean: 'No mistake, and you said so. That is the most honest result there is.', accountable: 'You made a mistake and owned it. That is how it gets fixed.', overclaimed: 'You said you followed the plan, but the log says otherwise. That gap is where accounts get blown.', harsh: 'You did nothing wrong but marked yourself down. Be accurate, not harsh.' }[sc.verdict];
    const hl = ['No honesty', 'Accountable', 'Fully honest'][sc.honesty];
    modal('<h3>Score: ' + sc.total + '/' + sc.max + (sc.bonus ? ' <span class=\"up\">+' + sc.bonus + ' bonus</span>' : '') + '</h3>' +
      sc.rows.map((r) => '<div class=\"srow\"><span>' + esc(r.label) + '</span><b class=\"' + (r.got >= r.max ? 'up' : 'dn') + '\">' + (r.bonus ? '+' : '') + r.got + (r.bonus ? '' : '/' + r.max) + '</b></div>').join('') +
      '<div class=\"srow hon\"><span><b>Honesty</b> &middot; ' + hl + '</span><b class=\"' + (sc.honesty === 2 ? 'up' : sc.honesty === 0 ? 'dn' : '') + '\">' + sc.honesty + '/2</b></div>' +
      '<p class=\"vt\">' + vtxt + '</p><div class=\"xpline\">+' + gain + ' XP &middot; Level ' + lvAfter + (lvAfter > lvBefore ? ' &#127881; LEVEL UP' : '') + ' &middot; Clean streak ' + P.streak + '</div>' +
      '<button class=\"btn big\" id=\"rs_ok\">Continue</button>', 'tall nodismiss');
    $('#rs_ok').onclick = () => { closeModal(); drawTradebar(); const risk = (S.dayStartBal - S.balance) >= S.dayStartBal * P.plan.risk.dailyLoss / 100; if (risk) toast('Daily loss limit hit. Plan says stop for today.'); };
  }

  function endSession() {
    pause();
    if (S.open) { toast('Close your open trade first'); return; }
    const pnl = S.balance - S.startBal;
    modal('<h3>End session?</h3><p>Result: <b class="' + (pnl >= 0 ? 'up' : 'dn') + '">' + fmt(pnl) + '</b> over ' + S.trades + ' trades.</p><div class="tbtns"><button class="ghost2" id="en_no">Keep going</button><button class="sell" id="en_yes">End</button></div>');
    $('#en_no').onclick = closeModal;
    $('#en_yes').onclick = () => {
      closeModal();
      const st = sessStats(), prev = (P.sessLog || []).length ? P.sessLog[P.sessLog.length - 1].st : null;
      const fin = (notes) => statsModal(st, prev, () => {
        P.sessLog = P.sessLog || []; P.sessLog.push({ st, notes, t0: S.startT, t1: E.t(S.cur) }); if (P.sessLog.length > 100) P.sessLog.shift();
        P.sessionsDone++; P.session = null; S = null; saveP(); closeModal(); showTab('replay');
      });
      if (S.jmode === 'end') reflectModal(fin); else fin(null);
    };
  }

  // ---------- stats ----------
  function renderStats() {
    const J = P.journal, n = J.length, lv = E.levelFor(P.xp), lo = E.xpForLevel(lv), hi = E.xpForLevel(lv + 1);
    const wins = J.filter((j) => j.pnl > 0).length, avgS = n ? J.reduce((a, j) => a + (j.max ? j.score / j.max * 100 : j.score), 0) / n : 0, avgH = J.filter((j) => j.honesty != null).length ? J.filter((j) => j.honesty != null).reduce((a, j) => a + j.honesty, 0) / J.filter((j) => j.honesty != null).length : 0;
    const clean = J.filter((j) => j.level === 2).length, honest = J.filter((j) => j.honesty >= 1 || j.verdict === 'honest').length;
    const leaks = [['Skipped checklist items', J.filter((j) => j.flags.incomplete).length], ['Risked more than plan', J.filter((j) => j.flags.risk).length], ['Took below-minimum RR', J.filter((j) => j.flags.rr).length], ['Broke daily limits', J.filter((j) => j.flags.limits).length], ['Widened a stop', J.filter((j) => j.flags.widened).length], ['Closed manually', J.filter((j) => j.flags.manual).length], ['Overclaimed in review', J.filter((j) => j.verdict === 'overclaimed').length]].sort((a, b) => b[1] - a[1]);
    let h = '<div class="page"><div class="card lvl"><div class="lvn">Level ' + lv + '</div><div class="bar"><i style="width:' + Math.min(100, (P.xp - lo) / (hi - lo) * 100) + '%"></i></div><div class="muted sm">' + P.xp + ' XP &middot; ' + (hi - P.xp) + ' to level ' + (lv + 1) + '</div></div>' +
      '<div class="kpis"><div><b>' + P.streak + '</b><span>clean streak</span></div><div><b>' + P.bestStreak + '</b><span>best</span></div><div><b>' + n + '</b><span>trades</span></div><div><b>' + (n ? Math.round(avgS) : 0) + '</b><span>avg score %</span></div></div>' +
      '<div class="kpis"><div><b>' + (n ? Math.round(clean / n * 100) : 0) + '%</b><span>fully on-plan</span></div><div><b>' + (n ? Math.round(honest / n * 100) : 0) + '%</b><span>honest reviews</span></div><div><b>' + (n ? Math.round(wins / n * 100) : 0) + '%</b><span>win rate</span></div><div><b>' + avgH.toFixed(1) + '/2</b><span>avg honesty</span></div></div>';
    if (n) h += '<div class="card"><b>Where you leak discipline</b>' + leaks.map((l) => '<div class="srow"><span>' + l[0] + '</span><b class="' + (l[1] ? 'dn' : 'up') + '">' + l[1] + '</b></div>').join('') + '</div>';
    const SN = (P.sessLog || []).filter((x) => x.notes && (x.notes.learned || x.notes.changes || x.notes.other));
    if (SN.length) h += '<h3>Session notes</h3>' + SN.slice().reverse().slice(0, 30).map((x) => '<div class="card"><div class="muted sm">' + fdate(x.t0) + ' &middot; ' + x.st.n + ' trades &middot; ' + fmt(x.st.net) + '</div>' + [['Learned', x.notes.learned], ['Changes / ideas', x.notes.changes], ['Next time', x.notes.other]].filter((r) => r[1]).map((r) => '<div class="sm" style="margin-top:6px"><b>' + r[0] + ':</b> ' + esc(r[1]) + '</div>').join('') + '</div>').join('');
    h += '<h3>Journal</h3>' + (n ? J.map((j, ji) => [j, ji]).reverse().slice(0, 60).map((x) => { const j = x[0], ji = x[1]; return '<div class="card jr" data-ji="' + ji + '"><div class="jt"><b>' + (j.dir > 0 ? 'LONG' : 'SHORT') + '</b> <span class="muted sm">' + fdate(j.t0) + '</span><span class="sc">' + j.score + '</span></div><div class="' + (j.pnl >= 0 ? 'up' : 'dn') + '">' + fmt(j.pnl) + ' (' + j.r.toFixed(2) + 'R) &middot; ' + j.reason + '</div><div class="muted sm">You said: ' + j.said + ' &middot; verdict: ' + j.verdict + '</div><div class="sm">' + esc(j.note) + '</div>' + (j.why ? '<div class="sm muted">Why: ' + esc(j.why) + '</div>' : '') + '<div class="muted sm">' + (j.edited ? 'edited &middot; ' : '') + 'tap to edit</div></div>'; }).join('') : '<p class="muted">No trades yet. Go place one.</p>') + '</div>';
    $('#view').innerHTML = h;
    document.querySelectorAll('[data-ji]').forEach((el) => (el.onclick = () => editJournal(+el.dataset.ji)));
  }
  function editJournal(i) {
    const j = P.journal[i]; if (!j) return;
    modal('<h3>Edit journal entry</h3><div class="muted sm">' + (j.dir > 0 ? 'LONG' : 'SHORT') + ' &middot; ' + fdate(j.t0) + ' &middot; ' + fmt(j.pnl) + ' (' + j.r.toFixed(2) + 'R)</div>' +
      '<label class="lbl">Why you took it</label><textarea id="je_why" rows="3">' + esc(j.why || '') + '</textarea>' +
      '<label class="lbl">Review note</label><textarea id="je_note" rows="4">' + esc(j.note || '') + '</textarea>' +
      '<p class="muted sm">Scores stay as they were. Only your words change.</p>' +
      '<button class="btn big" id="je_save">Save</button><button class="btn ghost big" id="je_del">Delete entry</button><button class="btn ghost big" id="je_x">Cancel</button>', 'tall');
    $('#je_x').onclick = closeModal;
    $('#je_save').onclick = () => { j.why = $('#je_why').value.trim(); j.note = $('#je_note').value.trim(); j.edited = true; saveP(); closeModal(); renderStats(); toast('Saved'); };
    $('#je_del').onclick = () => { if (confirm('Delete this entry? XP stays.')) { P.journal.splice(i, 1); saveP(); closeModal(); renderStats(); } };
  }

  // ---------- plan ----------
  function renderPlan() {
    $('#view').innerHTML = '<div class="page"><h2>Your plan</h2><div class="card">' + planSummary(P.plan) + '</div><button class="btn" id="p_edit">Edit plan</button></div>';
    $('#p_edit').onclick = () => startWizard(true);
  }
  async function latestBuild() {
    try { const t = await (await fetch('sw.js?x=' + Date.now(), { cache: 'no-store' })).text(); const m = t.match(/const V='([^']+)'/); return m ? m[1] : null; } catch (e) { return null; }
  }
  async function forceRefresh() {
    try { const rs = await navigator.serviceWorker.getRegistrations(); for (const r of rs) await r.unregister(); } catch (e) {}
    try { for (const k of await caches.keys()) await caches.delete(k); } catch (e) {}
    location.href = location.pathname + '?r=' + Date.now();
  }
  function renderSettings() {
    const imgs = loadImgs(), ft = E.t(0), lt = E.t(E.n() - 1), nd = dayList().length;
    const tfOpts = TFS.map((t) => '<option value="' + t[0] + '"' + ((P.set.tf || 15) === t[0] ? ' selected' : '') + '>' + t[1] + '</option>').join('');
    const spOpts = SPEEDS.map((v, i) => '<option value="' + i + '"' + (P.set.speed === i ? ' selected' : '') + '>' + v + 'x</option>').join('');
    $('#view').innerHTML = '<div class="page"><h2>Settings</h2>' +
      '<div class="card"><b>App version</b><div class="verbig">v' + APP_VERSION + '</div><div class="muted sm">Build ' + BUILD + '</div><div id="v_latest" class="muted sm" style="margin-top:6px">Latest on server: checking&hellip;</div>' +
      '<div class="tbtns"><button class="ghost2" id="v_check">Check for update</button><button class="close" id="v_force">Force refresh</button></div></div>' +
      '<div class="card"><b>Data</b><div class="muted sm" style="margin-top:4px">Spot gold XAUUSD (Dukascopy bid), 1-minute, prices to 2 decimals, UTC.<br>' + fdate(ft) + ' to ' + fdate(lt) + '<br>' + nd + ' trading days. More days are added automatically.</div></div>' +
      '<div class="card"><b>Replay defaults</b><label>Starting chart timeframe</label><select id="st_tf">' + tfOpts + '</select><label>Starting playback speed</label><select id="st_sp">' + spOpts + '</select>' +
      '<button class="btn ghost" id="st_ind" style="margin-top:12px">Indicators&hellip;</button></div>' +
      '<div class="card"><b>Plan pictures</b><p class="muted sm">Screenshots or photos of your written plan or setups. Kept on this device.</p><div class="thumbs">' + imgs.map((d, i) => '<div class="th"><img src="' + d + '" data-view="' + i + '"><button class="x" data-rmimg="' + i + '">&times;</button></div>').join('') + '</div>' +
      '<button class="btn ghost" id="p_addimg">+ Add pictures</button><input type="file" id="p_imgfile" accept="image/*" multiple hidden></div>' +
      '<div class="card"><b>Backup</b><p class="muted sm">Plan, XP, journal and pictures live on this device. Save a file so a phone change or cleared Safari data cannot wipe them. Updating the app never touches them.</p>' +
      '<button class="btn" id="p_export">Save backup</button> <button class="btn ghost" id="p_import">Restore backup</button><input type="file" id="p_ifile" accept=".json,application/json" hidden></div>' +
      '<div class="card"><b>Danger zone</b><p><button class="btn ghost" id="p_reset">Reset everything</button></p></div></div>';
    latestBuild().then((lb) => { const el = $('#v_latest'); if (!el) return; el.innerHTML = !lb ? 'Latest on server: could not check (offline?)' : lb === BUILD ? '<span class="up">Up to date</span> (' + lb + ')' : '<span class="dn">Update available: ' + lb + '. Tap Force refresh.</span>'; });
    $('#v_check').onclick = () => { $('#v_latest').textContent = 'Latest on server: checking\u2026'; latestBuild().then((lb) => { $('#v_latest').innerHTML = !lb ? 'Could not check' : lb === BUILD ? '<span class="up">Up to date</span> (' + lb + ')' : '<span class="dn">Update available: ' + lb + '. Tap Force refresh.</span>'; }); };
    $('#v_force').onclick = forceRefresh;
    $('#st_tf').onchange = () => { P.set.tf = +$('#st_tf').value; saveP(); toast('Saved'); };
    $('#st_sp').onchange = () => { P.set.speed = +$('#st_sp').value; speedI = P.set.speed; saveP(); toast('Saved'); };
    $('#st_ind').onclick = openInd;
    $('#p_addimg').onclick = () => $('#p_imgfile').click();
    $('#p_imgfile').onchange = async (e) => {
      const a = loadImgs();
      for (const f of [...e.target.files].slice(0, 8)) { try { a.push(await shrink(f)); } catch (x) {} }
      if (a.length > 12) a.splice(0, a.length - 12);
      if (saveImgs(a)) renderSettings();
    };
    document.querySelectorAll('[data-rmimg]').forEach((b) => (b.onclick = () => { const a = loadImgs(); a.splice(+b.dataset.rmimg, 1); saveImgs(a); renderSettings(); }));
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

  ['gesturestart', 'gesturechange', 'gestureend'].forEach((n) => document.addEventListener(n, (e) => e.preventDefault()));
  document.addEventListener('focusout', () => setTimeout(() => window.scrollTo(0, 0), 60));
  window.addEventListener('scroll', () => { if (window.scrollY || window.scrollX) window.scrollTo(0, 0); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('pagehide', () => { if (P) saveP(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  boot();
})();
