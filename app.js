/* Retest UI */
(function () {
  'use strict';
  const E = window.Engine, PT = window.Patterns;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const APP_VERSION = '0.21.1', BUILD = 'gr-v33';
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
  function saveP() { try { if (frozen) return; if (P && !noStamp) P._m = Date.now(); localStorage.setItem(KEY, JSON.stringify(P)); if (window.Sync) window.Sync.changed(false); } catch (e) {} }
  let noStamp = false, frozen = false;
  const IKEY = 'goldreplay.imgs';
  function loadImgs() { try { return JSON.parse(localStorage.getItem(IKEY)) || []; } catch (e) { return []; } }
  function saveImgs(a) { try { if (frozen) return false; localStorage.setItem(IKEY, JSON.stringify(a)); if (P) { P._m = Date.now(); localStorage.setItem(KEY, JSON.stringify(P)); } if (window.Sync) window.Sync.changed(true); return true; } catch (e) { toast('Storage full, remove a picture first'); return false; } }
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
    if (window.Sync) window.Sync.attach({
      getP: () => P, getImgs: loadImgs,
      refresh: () => { if (tab === 'settings' && !document.activeElement.matches('input')) renderSettings(); },
      applyRemote: (p, imgs, m) => { frozen = true; p._m = m; localStorage.setItem(KEY, JSON.stringify(p)); localStorage.setItem(IKEY, JSON.stringify(imgs || [])); localStorage.setItem('retest.sync.m', String(m)); location.reload(); },
      ask: (html, onDev, onCloud) => { modal(html); $('#sy_dev').onclick = () => { closeModal(); onDev(); }; $('#sy_cl').onclick = () => { closeModal(); onCloud(); }; }
    });
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
      body = (!W._editing && !P.plan && window.Sync ? window.Sync.cardHtml(true) : '') + '' + '<h2>What are you trading?</h2><p class="muted">Gold only for now, built from 1-minute data (Sep 2023 to now).</p>' +
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
    if (window.Sync && document.querySelector('#sy_in, #sy_out')) window.Sync.bind($);
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
      [['replay', 'Replay'], ['stats', 'Journal & Data'], ['plan', 'Plan'], ['settings', 'Settings']].map((x) => '<button data-tab="' + x[0] + '" class="' + (t === x[0] ? 'on' : '') + '">' + ICON[x[0]] + '<span>' + x[1] + '</span></button>').join('') + '</nav></div>';
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
    if (!curAcct() && (P.accts || []).length) { const L = P.accts, pick = L.slice().reverse().find((x) => x.status === 'active') || L[0]; P.curAcct = pick.id; saveP(); }
    const a0 = curAcct();
    const d0 = fmtDay(days[0]), d1 = fmtDay(days[days.length - 1]);
    $('#view').innerHTML = '<div class="page"><h2>New session</h2>' +
      '<div class="card" id="ac_box"></div><div class="card"><label>Day</label><select id="s_day">' + days.slice().reverse().map((d) => '<option value="' + d + '"' + (d === selDay ? ' selected' : '') + '>' + fmtDay(d) + '</option>').join('') + '</select>' +
      '<label>Session (UTC start time)</label><div class="chips" id="s_sess"></div>' +
      '<button class="btn big" id="s_go">Begin session</button><button class="btn ghost big" id="s_rand">Random day and session</button>' +
      '</div>' +
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
      const a2 = curAcct(), ok2 = a2 && a2.lastT != null ? opts.filter((o) => startIdx(o[0], SESSIONS[o[1]][1]) >= 0 && E.t(startIdx(o[0], SESSIONS[o[1]][1])) >= a2.lastT) : opts;
      if (!ok2.length) { toast('No later session left for this account'); return; }
      const pick = ok2[Math.floor(Math.random() * ok2.length)]; selDay = pick[0]; selSess = pick[1]; begin();
    };
    $('#s_go').onclick = begin;
    bindAcctBox(a0);
    function begin() {
      const a1 = curAcct(), idx = startIdx(selDay, SESSIONS[selSess][1]);
      if (!a1) { toast('Create a trading account first'); AD = fundDraft('two'); acctForm(); return; }
      const bal = a1.bal;
      if (idx < 0) { toast('No data for that session'); return; }
      const t = E.t(idx);
      if (a1 && a1.status !== 'active') { toast('This account is ' + a1.status + '. Start a new attempt first.'); return; }
      if (a1 && a1.lastT != null && t < a1.lastT) { toast('This account is already at ' + fdate(a1.lastT).replace(' UTC', '') + '. Pick a later session.'); return; }
      S = P.session = { dv: DV, cur: idx, tf: (P.set && P.set.tf) || 15, vid: Date.now(), startBal: bal, balance: bal, trades: 0, open: null, dayKey: Math.floor(t / 1440), dayStartBal: bal, dayTrades: 0, startT: t, acct: a1 ? a1.id : null, alerts: [] };
      if (a1) {
        if (a1.stage === 'phase' && a1.phaseDay == null) a1.phaseDay = S.dayKey;
        if (a1.stage === 'funded' && a1.cycleDay == null) a1.cycleDay = S.dayKey;
        if (a1.dayKey !== S.dayKey) acctDay(); else { S.dayStartBal = a1.dayStart; S.dayTrades = a1.dTr || 0; }
        S.dayStartBal = a1.dayStart; a1.mcall = 0; a1.timeUp = false;
      }
      saveP(); showTab('replay'); setTimeout(flushAlerts, 300);
    }
  }

  // ---------- news calendar (official BLS + Federal Reserve dates, Jan to Apr 2026) ----------
  // Covers CPI, jobs report, PPI, FOMC decisions and minutes. Not covered: GDP, PCE, ISM, weekly jobless claims.
  const NEWS = (() => {
    const out = [], U = (m, d, h, mi) => Math.floor(Date.UTC(2026, m - 1, d, h, mi) / 60000);
    const add = (name, imp, m, d, h, mi) => out.push({ t: U(m, d, h, mi), name, imp });
    // 08:30 ET = 13:30 UTC until 8 Mar 2026, 12:30 UTC after. 14:00 ET = 19:00 / 18:00 UTC.
    [[1, 9, 13, 30], [2, 11, 13, 30], [3, 6, 13, 30], [4, 3, 12, 30]].forEach((x) => add('US jobs report (NFP)', 'high', x[0], x[1], x[2], x[3]));
    [[1, 13, 13, 30], [2, 13, 13, 30], [3, 11, 12, 30]].forEach((x) => add('US CPI', 'high', x[0], x[1], x[2], x[3]));
    [[1, 28, 19, 0], [3, 18, 18, 0]].forEach((x) => add('FOMC rate decision', 'high', x[0], x[1], x[2], x[3]));
    [[1, 14, 13, 30], [1, 30, 13, 30], [2, 27, 13, 30], [3, 18, 12, 30]].forEach((x) => add('US PPI', 'med', x[0], x[1], x[2], x[3]));
    [[2, 18, 19, 0], [4, 8, 18, 0]].forEach((x) => add('FOMC minutes', 'med', x[0], x[1], x[2], x[3]));
    return out.sort((a, b) => a.t - b.t);
  })();
  const NEWS_LAST = NEWS[NEWS.length - 1].t;
  function newsAt(t, win, level) {
    for (let i = 0; i < NEWS.length; i++) {
      const e = NEWS[i]; if (e.t > t + win) break;
      if (Math.abs(e.t - t) <= win && (level === 'all' || e.imp === 'high')) return e;
    }
    return null;
  }
  const hhmm = (t) => { const m = ((t % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') + ' UTC'; };

  // ---------- accounts: funded prep + live ----------
  const curAcct = () => (P.accts || []).find((x) => x.id === P.curAcct) || null;
  const AC = () => (P && P.accts && S && S.acct ? P.accts.find((x) => x.id === S.acct) || null : null);
  const dowOf = (t) => (Math.floor(t / 1440) + 4) % 7; // 0 = Sunday
  function spreadFor(t, a) {
    if (!a || !a.cond) return 0.30;
    const c = a.cond, base = { tight: 0.2, normal: 0.3, wide: 0.5 }[c.spreadLvl || 'normal'];
    if (!c.varSpread) return base;
    const m = ((t % 1440) + 1440) % 1440; let k = 1;
    if (m >= 1260 && m < 1380) k = 3.5; else if (m < 420) k = 1.4;
    if (newsAt(t, 3, 'all')) k = Math.max(k, 8); else if (newsAt(t, 15, 'high')) k = Math.max(k, 2);
    return +(base * k).toFixed(2);
  }
  function slipAmt(t, c) {
    const lvl = { low: 0.5, normal: 1, high: 2 }[c.slipLvl || 'normal'], mx = (newsAt(t, 5, 'all') ? 1.2 : 0.25) * lvl;
    let v = Math.random() * mx; if (Math.random() < 0.2) v = -v * 0.5; return +v.toFixed(2);
  }
  function applyEnv() {
    const a = AC(); let lev = 20, sp = 0.30, real = false;
    if (a) { lev = a.lev || 20; if (a.cond) { real = !!a.cond.varSpread; sp = spreadFor(S ? E.t(S.cur) : 0, a); } }
    E.LEV = lev; E.SPREAD = sp; E.REAL = real; E.nowT = S ? E.t(S.cur) : 0;
  }
  function tradeCond(a) { if (!a) return null; const c = a.type === 'live' ? a.cond : { comm: (a.cfg && a.cfg.comm) || 0 }; return (c.comm || c.swap) ? { comm: c.comm || 0, swap: !!c.swap, swapL: 0.20, swapS: 0.05 } : null; }

  const ACT_STAGE = (a) => (a.type === 'live' ? 'Live' : a.status === 'failed' ? 'Failed' : a.stage === 'funded' ? 'Funded' : 'Phase ' + (a.phase + 1) + '/' + a.cfg.ph.length);
  function acctInit(a) {
    const size = a.type === 'live' ? a.size0 : a.cfg.size;
    Object.assign(a, { status: 'active', bal: size, base: size, hw: size, days: {}, void: 0, dayKey: null, dayStart: size, phaseDay: null, lastT: null, lastDay: null, hint: 0, timeUp: false, warned: false, fail: null });
    a.lev = a.type === 'live' ? a.lev : a.cfg.lev;
    if (a.type === 'funded') { a.phase = 0; a.stage = a.cfg.ph.length ? 'phase' : 'funded'; if (a.stage === 'funded') { a.cycleDay = null; } }
    return a;
  }
  function acctM(a, eq) {
    const c = a.cfg || {}, size = a.base, days = a.days || {}, vals = Object.keys(days).map((k) => days[k]);
    const cp = vals.reduce((x, y) => x + y, 0), best = vals.length ? Math.max.apply(null, vals) : 0, share = cp > 0 && best > 0 ? best / cp * 100 : 0;
    const ph = a.type === 'funded' && a.stage === 'phase' ? c.ph[a.phase] : null, target = ph ? size * ph.t / 100 : 0;
    const dLevel = c.dailyDD ? a.dayStart - size * c.dailyDD / 100 : null;
    let mLevel = null;
    if (c.maxDD) {
      const trail = (a.hw || size) - size * c.maxDD / 100;
      mLevel = c.maxMode === 'trailing' ? trail : c.maxMode === 'lock' ? Math.min(size, trail) : size * (1 - c.maxDD / 100);
    }
    const dUsed = dLevel != null ? Math.max(0, (a.dayStart - eq) / (a.dayStart - dLevel)) : 0, mUsed = mLevel != null ? Math.max(0, (a.hw - eq) / ((a.hw || size) - mLevel)) : 0;
    return { cp, best, share, ph, target, dLevel, mLevel, dUsed, mUsed, tdays: vals.length, consOK: !c.cons || share <= c.cons };
  }
  function breachReason(a, eq) {
    const m = acctM(a, eq);
    if (m.dLevel != null && eq <= m.dLevel + 1e-9) return 'Daily drawdown limit hit';
    if (m.mLevel != null && eq <= m.mLevel + 1e-9) return 'Max drawdown limit hit';
    if (a.type === 'live' && eq <= 0.5) return 'Account blown';
    return null;
  }
  function pushAlert(o) { S.alerts = S.alerts || []; S.alerts.push(o); }
  function flushAlerts() {
    const mo = $('#modal'); if (!S || !S.alerts || !S.alerts.length || (mo && mo.classList.contains('on'))) return;
    const al = S.alerts.shift(); saveP();
    modal('<h3>' + al.title + '</h3>' + al.html + '<button class="btn big" id="al_ok">' + (al.kind === 'fail' ? 'End session' : 'OK') + '</button>', 'tall nodismiss');
    $('#al_ok').onclick = () => { if (al.kind === 'fail') { closeModal(); runEnd(); } else { closeModal(); setTimeout(flushAlerts, 40); } };
  }
  function acctFail(a, reason) {
    a.status = 'failed'; a.fail = { reason, t: E.t(S.cur) };
    pushAlert({ kind: 'fail', title: a.type === 'live' ? 'Account closed' : 'Challenge failed', html: '<p class="dn"><b>' + esc(reason) + '</b></p><p class="muted sm">' + (a.type === 'live' ? 'Your live account balance reached zero.' : 'The rules of this account were broken. You can start a new attempt from the account card.') + '</p>' });
    saveP();
  }
  function acctClose(t) {
    const a = AC(); if (!a) return;
    a.bal = S.balance; a.lastT = t.t1; a.lastDay = Math.floor(t.t1 / 1440);
    const dk = Math.floor(t.t1 / 1440), c = a.cfg || {}; let counted = t.pnl;
    if (a.type === 'funded' && c.minHold && t.t1 - t.t0 < c.minHold && t.pnl > 0) { counted = 0; t.voided = true; pushAlert({ kind: 'info', title: 'Profit not counted', html: '<p>This trade was held under ' + c.minHold + ' min, so its profit does not count toward your target or consistency.</p>' }); }
    a.days[dk] = (a.days[dk] || 0) + counted; a.hw = Math.max(a.hw || 0, a.bal);
    const br = breachReason(a, a.bal);
    if (br) { acctFail(a, br); return; }
    if (a.type === 'funded' && a.stage === 'phase') acctPass(a);
    if (a.timeUp && a.status === 'active' && a.stage === 'phase') acctFail(a, 'Time limit for this phase ran out');
  }
  function acctPass(a) {
    const c = a.cfg, m = acctM(a, a.bal), ph = m.ph; if (!ph || m.cp < m.target) return;
    const needD = ph.d || 0, consReq = c.cons && c.consScope === 'all';
    if (m.tdays < needD || (consReq && !m.consOK)) {
      if (!a.hint) { a.hint = 1; pushAlert({ kind: 'info', title: 'Profit target reached', html: '<p>Not passed yet:</p><ul>' + (m.tdays < needD ? '<li>Trade on ' + (needD - m.tdays) + ' more day(s) (min ' + needD + ')</li>' : '') + (consReq && !m.consOK ? '<li>Consistency: your best day is ' + m.share.toFixed(0) + '% of profit, the limit is ' + c.cons + '%. Keep trading to dilute it.</li>' : '') + '</ul>' }); }
      return;
    }
    const last = a.phase >= c.ph.length - 1;
    a.hint = 0; a.timeUp = false; a.days = {}; a.void = 0; a.bal = a.base = c.size; a.hw = c.size; a.dayStart = c.size; S.balance = c.size; S.startBal = c.size; S.dayStartBal = c.size;
    if (last) {
      a.stage = 'funded'; a.cycleDay = a.lastDay; a.phaseDay = a.lastDay;
      pushAlert({ kind: 'info', title: 'You are funded', html: '<p>All phases passed. The balance is reset to <b>' + fmt(c.size) + '</b> and payout rules now apply (' + c.split + '% split).</p><p class="muted sm">Open the account card to see when you can request a payout.</p>' });
    } else {
      a.phase++; a.phaseDay = a.lastDay;
      pushAlert({ kind: 'info', title: 'Phase ' + a.phase + ' passed', html: '<p>Moving to phase ' + (a.phase + 1) + ' of ' + c.ph.length + '. Balance reset to <b>' + fmt(c.size) + '</b>. Next target: ' + c.ph[a.phase].t + '%.</p>' });
    }
    saveP();
  }
  function acctDay() {
    const a = AC(); if (!a) return;
    a.dayKey = S.dayKey; a.dayStart = S.balance; a.warned = false;
    const ph = a.type === 'funded' && a.stage === 'phase' ? a.cfg.ph[a.phase] : null;
    if (ph && ph.md && a.phaseDay != null && S.dayKey - a.phaseDay > ph.md) { if (S.open) a.timeUp = true; else if (a.status === 'active') acctFail(a, 'Time limit for this phase ran out'); }
  }
  // returns a forced-close reason, or null
  function acctForce() {
    const a = AC(); if (!a || a.status !== 'active') return null;
    const t = E.t(S.cur), c = a.cfg || {}, eq = equity();
    a.hw = Math.max(a.hw || 0, eq); a.lastT = t; a.lastDay = Math.floor(t / 1440);
    if (!S.open) return null;
    if (breachReason(a, eq) || a.timeUp) return 'BREACH';
    if (c.noWeekend) { const d = dowOf(t), m = t % 1440; if ((d === 5 && m >= 1290) || d === 6) return 'WEEKEND'; }
    if (a.type === 'live' && a.cond.margin) {
      const used = S.open.units * S.open.entry / E.LEV, lvl = used > 0 ? eq / used * 100 : 999;
      if (lvl < (a.cond.stopOut || 50)) return 'STOPOUT';
      if (lvl < 100 && !a.mcall) { a.mcall = 1; toast('Margin call: margin level ' + Math.round(lvl) + '%'); } else if (lvl >= 130) a.mcall = 0;
    }
    const m = acctM(a, eq);
    if (m.dLevel != null && m.dUsed >= 0.8 && !a.warned) { a.warned = true; toast('80% of your daily drawdown is used'); }
    return null;
  }
  function openGate(a, dir) {
    if (S.lockUntil && Date.now() < S.lockUntil) return 'No connection. Reconnecting...';
    if (!a) return null;
    if (a.status !== 'active') return 'This account is ' + a.status + '.';
    const c = a.cfg || {}, t = E.t(S.cur);
    if (a.type === 'funded') {
      if (c.news !== 'off') { const ev = newsAt(t, c.newsWin, c.news === 'all' ? 'all' : 'high'); if (ev) return 'No-news rule: ' + ev.name + ' at ' + hhmm(ev.t) + '. Wait ' + c.newsWin + ' min after it.'; }
      if (c.maxTrades && S.dayTrades >= c.maxTrades) return 'Max trades per day reached (' + c.maxTrades + ').';
      if (c.noWeekend) { const d = dowOf(t), m = t % 1440; if ((d === 5 && m >= 1230) || d === 6) return 'Weekend rule: no new trades near the Friday close.'; }
    }
    return null;
  }
  function closeGate(a) {
    if (S.lockUntil && Date.now() < S.lockUntil) return 'No connection. Reconnecting...';
    if (a && a.type === 'funded' && a.cfg.news !== 'off' && a.cfg.newsApply === 'both') { const ev = newsAt(E.t(S.cur), a.cfg.newsWin, a.cfg.news === 'all' ? 'all' : 'high'); if (ev) return 'No-news rule: cannot close during ' + ev.name + ' (' + hhmm(ev.t) + ').'; }
    return null;
  }

  // ---------- payouts ----------
  function payoutCheck(a) {
    const c = a.cfg, m = acctM(a, a.bal), dNow = a.lastDay != null ? a.lastDay : 0, since = dNow - (a.cycleDay == null ? dNow : a.cycleDay);
    const cap = c.pMax ? c.size * c.pMax / 100 : Infinity, gross = Math.max(0, Math.min(m.cp, cap));
    const rows = [['Days since ' + (a.payouts && a.payouts.length ? 'last payout' : 'funded') + ': ' + since + ' / ' + c.pMinDays, since >= c.pMinDays], ['Trading days this cycle: ' + m.tdays + ' / ' + c.pMinTD, m.tdays >= c.pMinTD],
      ['Profit this cycle: ' + fmt(m.cp) + (c.pMinProfit ? ' (min ' + fmt(c.size * c.pMinProfit / 100) + ')' : ''), m.cp > 0 && m.cp >= c.size * c.pMinProfit / 100]];
    if (c.pCons && c.cons) rows.push(['Best day ' + m.share.toFixed(0) + '% of profit (max ' + c.cons + '%)', m.consOK]);
    return { rows, ok: rows.every((r) => r[1]) && gross > 0 && a.stage === 'funded', gross, net: gross * c.split / 100 };
  }
  function doPayout(a) {
    const p = payoutCheck(a); if (!p.ok) return;
    a.bal -= p.gross; a.hw = a.bal; a.dayStart = a.bal; a.earned = (a.earned || 0) + p.net; a.payouts = a.payouts || [];
    a.payouts.push({ t: a.lastT, gross: p.gross, net: p.net }); a.days = {}; a.cycleDay = a.lastDay; saveP();
  }

  // ---------- account UI ----------
  const pbar = (frac, bad) => '<div class="pbar"><i class="' + (bad ? 'bad' : '') + '" style="width:' + Math.max(0, Math.min(100, frac * 100)).toFixed(1) + '%"></i></div>';
  function acctPanelHtml(a, eq) {
    const c = a.cfg || {}, m = acctM(a, eq);
    let h = '<div class="srow"><span>Status</span><b class="' + (a.status === 'active' ? 'up' : 'dn') + '">' + ACT_STAGE(a) + (a.status !== 'active' ? ' (' + a.status + ')' : '') + '</b></div>' +
      '<div class="srow"><span>Balance / Equity</span><b>' + fmt(a.bal) + ' / ' + fmt(eq) + '</b></div><div class="srow"><span>Leverage</span><b>1:' + a.lev + '</b></div>';
    if (a.fail) h += '<p class="dn sm">' + esc(a.fail.reason) + '</p>';
    if (a.type === 'live') {
      const o = S && S.open && S.acct === a.id ? S.open : null, used = o ? o.units * o.entry / E.LEV : 0;
      h += '<div class="srow"><span>Total P&amp;L</span><b class="' + (eq - a.size0 >= 0 ? 'up' : 'dn') + '">' + fmt(eq - a.size0) + '</b></div>' + (o ? '<div class="srow"><span>Margin level</span><b>' + Math.round(eq / used * 100) + '%</b></div>' : '');
      const cd = a.cond, on = [cd.varSpread && 'variable spread', cd.slip && 'slippage', cd.comm && '$' + cd.comm + '/lot commission', cd.swap && 'overnight swap', cd.margin && 'margin call + stop-out ' + cd.stopOut + '%', cd.requote && 'requotes', cd.disc && 'random disconnects'].filter(Boolean);
      h += '<h4>Market conditions</h4><p class="sm">' + (on.length ? on.join(', ') : 'None (clean fills)') + '</p>';
      return h;
    }
    if (m.ph) {
      h += '<h4>Profit target ' + m.ph.t + '% (' + fmt(m.target) + ')</h4>' + pbar(m.cp / m.target) + '<div class="muted sm">' + fmt(m.cp) + ' of ' + fmt(m.target) + ' &middot; trading days ' + m.tdays + (m.ph.d ? ' / ' + m.ph.d : '') + (m.ph.md ? ' &middot; time limit ' + m.ph.md + ' days' : '') + '</div>';
    }
    if (m.dLevel != null) h += '<h4>Daily drawdown ' + c.dailyDD + '%</h4>' + pbar(m.dUsed, m.dUsed > 0.7) + '<div class="muted sm">Floor today ' + fmt(m.dLevel) + ' &middot; ' + fmt(Math.max(0, eq - m.dLevel)) + ' left</div>';
    if (m.mLevel != null) h += '<h4>Max drawdown ' + c.maxDD + '% (' + ({ static: 'static', trailing: 'trailing', lock: 'trailing, locks at start' }[c.maxMode]) + ')</h4>' + pbar(m.mUsed, m.mUsed > 0.7) + '<div class="muted sm">Floor ' + fmt(m.mLevel) + ' &middot; ' + fmt(Math.max(0, eq - m.mLevel)) + ' left</div>';
    if (c.cons) h += '<h4>Consistency (best day max ' + c.cons + '% of profit)</h4>' + pbar(m.share / c.cons, !m.consOK) + '<div class="muted sm">Best day ' + fmt(m.best) + ' = ' + m.share.toFixed(0) + '% of ' + fmt(m.cp) + (c.consScope === 'funded' && a.stage === 'phase' ? ' (applies once funded)' : '') + '</div>';
    if (a.stage === 'funded') {
      const p = payoutCheck(a);
      h += '<h4>Payout (' + c.split + '% split)</h4>' + p.rows.map((r) => '<div class="srow"><span>' + r[0] + '</span><b class="' + (r[1] ? 'up' : 'dn') + '">' + (r[1] ? 'OK' : 'no') + '</b></div>').join('') +
        '<div class="muted sm" style="margin-top:6px">Available now: ' + fmt(p.gross) + ' gross, ' + fmt(p.net) + ' to you. Total paid to you so far: ' + fmt(a.earned || 0) + ' (' + (a.payouts || []).length + ' payouts).</div>';
    }
    const rules = ['Leverage 1:' + c.lev, c.news !== 'off' && ('No trading ' + c.newsWin + ' min around ' + (c.news === 'all' ? 'high + medium' : 'high-impact') + ' news' + (c.newsApply === 'both' ? ' (open and close)' : ' (open)')), c.noWeekend && 'No weekend holding', c.minHold && 'Min hold ' + c.minHold + ' min or the profit does not count', c.maxRisk && 'Max risk per trade ' + c.maxRisk + '%', c.maxTrades && 'Max ' + c.maxTrades + ' trades/day', c.comm && '$' + c.comm + '/lot commission'].filter(Boolean);
    return h + '<h4>Other rules</h4><p class="sm">' + rules.join(' &middot; ') + '</p>';
  }
  function openAcctPanel(a, canPay) {
    const eq = a === AC() ? equity() : a.bal;
    let h = '<h3>' + esc(a.name) + '</h3>' + acctPanelHtml(a, eq);
    if (canPay && a.type === 'funded' && a.stage === 'funded') h += '<button class="btn big" id="ap_pay"' + (payoutCheck(a).ok ? '' : ' disabled') + '>Request payout</button>';
    modal(h + '<button class="btn ghost big" id="ap_x">Close</button>', 'tall');
    $('#ap_x').onclick = closeModal;
    const pb = $('#ap_pay'); if (pb) pb.onclick = () => { const p = payoutCheck(a); doPayout(a); closeModal(); toast('Payout: ' + fmt(p.net) + ' to you'); renderStart(); };
  }
  function acctChip() {
    const a = AC(), el = $('#h_acct'); if (!el) return;
    if (!a) { el.style.display = 'none'; return; }
    const eq = equity(), m = acctM(a, eq); el.style.display = '';
    const used = Math.max(m.dUsed || 0, m.mUsed || 0);
    el.textContent = a.name.slice(0, 12) + ' \u00b7 ' + ACT_STAGE(a) + (m.dLevel != null || m.mLevel != null ? ' \u00b7 ' + Math.round(used * 100) + '% DD' : '');
    el.className = 'stag acc' + (a.status !== 'active' || used > 0.8 ? ' bad' : used > 0.5 ? ' warn' : '');
    el.onclick = () => { pause(); openAcctPanel(a, false); };
  }

  // ---------- account creation form ----------
  let AD = null;
  const getp = (o, k) => k.split('.').reduce((x, p) => (x == null ? x : x[p]), o);
  function setp(o, k, v) { const ks = k.split('.'); const last = ks.pop(); const t = ks.reduce((x, p) => x[p], o); t[last] = v; }
  const FUND_PRESETS = {
    two: { name: 'Two-phase challenge', size: 10000, phases: 2, ph: [{ t: 8, d: 4, md: 0 }, { t: 5, d: 4, md: 0 }, { t: 5, d: 4, md: 0 }], dailyDD: 5, maxDD: 10, maxMode: 'static', cons: 0, consScope: 'funded', split: 80, pMinDays: 14, pMinTD: 5, pMinProfit: 0, pMax: 0, pCons: true },
    one: { name: 'One-phase challenge', size: 10000, phases: 1, ph: [{ t: 10, d: 4, md: 0 }, { t: 5, d: 4, md: 0 }, { t: 5, d: 4, md: 0 }], dailyDD: 4, maxDD: 6, maxMode: 'trailing', cons: 0, consScope: 'funded', split: 80, pMinDays: 14, pMinTD: 5, pMinProfit: 0, pMax: 0, pCons: true },
    inst: { name: 'Instant funded', size: 10000, phases: 0, ph: [{ t: 8, d: 4, md: 0 }, { t: 5, d: 4, md: 0 }, { t: 5, d: 4, md: 0 }], dailyDD: 3, maxDD: 6, maxMode: 'lock', cons: 30, consScope: 'funded', split: 70, pMinDays: 7, pMinTD: 5, pMinProfit: 2, pMax: 0, pCons: true },
  };
  const fundDraft = (k) => Object.assign({ type: 'funded', news: 'off', newsWin: 2, newsApply: 'both', noWeekend: false, minHold: 0, maxRisk: 0, lev: 100, maxTrades: 0, comm: 0 }, JSON.parse(JSON.stringify(FUND_PRESETS[k || 'two'])));
  const LIVE_PRESETS = { real: { varSpread: true, slip: true, comm: 7, swap: true, margin: true, requote: true, disc: false, slipLvl: 'normal', spreadLvl: 'normal' }, light: { varSpread: true, slip: false, comm: 0, swap: false, margin: true, requote: false, disc: false, slipLvl: 'low', spreadLvl: 'normal' }, clean: { varSpread: false, slip: false, comm: 0, swap: false, margin: false, requote: false, disc: false, slipLvl: 'low', spreadLvl: 'normal' } };
  const liveDraft = (k) => Object.assign({ type: 'live', name: 'Live account', bal: 1000, lev: 20, stopOut: 50 }, LIVE_PRESETS[k || 'real']);
  function acctForm() {
    const D = AD, sc = (document.querySelector('#modal .sheet') || {}).scrollTop || 0;
    const num = (k, l, hint) => '<label class="lbl">' + l + '</label><input type="number" inputmode="decimal" step="any" data-f="' + k + '" value="' + getp(D, k) + '">' + (hint ? '<div class="muted sm">' + hint + '</div>' : '');
    const sel = (k, l, opts, hint) => '<label class="lbl">' + l + '</label><select data-f="' + k + '">' + opts.map((o) => '<option value="' + o[0] + '"' + (String(getp(D, k)) === String(o[0]) ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>' + (hint ? '<div class="muted sm">' + hint + '</div>' : '');
    const chk = (k, l) => '<label class="inl"><input type="checkbox" data-f="' + k + '"' + (getp(D, k) ? ' checked' : '') + '> ' + l + '</label>';
    const LEVS = [5, 10, 20, 30, 50, 100, 200, 500].map((v) => [v, '1:' + v]);
    let h = '<h3>New account</h3><label class="lbl">Type</label><div class="seg"><button data-type="funded" class="' + (D.type === 'funded' ? 'sel' : '') + '">Funded prep</button><button data-type="live" class="' + (D.type === 'live' ? 'sel' : '') + '">Live account</button></div>' +
      '<label class="lbl">Name</label><input type="text" data-f="name" value="' + esc(D.name) + '">';
    if (D.type === 'funded') {
      h += '<label class="lbl">Start from a template (you can edit everything)</label><div class="chips"><span class="chip add" data-pre="two">2-phase</span><span class="chip add" data-pre="one">1-phase</span><span class="chip add" data-pre="inst">Instant funded</span></div>' +
        num('size', 'Account size ($)') + sel('phases', 'Phases to pass before funded', [[0, 'None (instant funded)'], [1, '1 phase'], [2, '2 phases'], [3, '3 phases']]);
      for (let i = 0; i < D.phases; i++) h += '<h4>Phase ' + (i + 1) + '</h4><div class="grid3">' + num('ph.' + i + '.t', 'Target %') + num('ph.' + i + '.d', 'Min days') + num('ph.' + i + '.md', 'Max days', '0 = none') + '</div>';
      h += '<h4>Drawdown</h4><div class="grid2">' + num('dailyDD', 'Daily drawdown %', '0 = off. From the day\'s starting balance.') + num('maxDD', 'Max drawdown %', '0 = off') + '</div>' +
        sel('maxMode', 'Max drawdown type', [['static', 'Static (from start balance)'], ['trailing', 'Trailing (follows highest equity)'], ['lock', 'Trailing, stops trailing at start balance']]) +
        '<h4>Rules</h4>' + num('cons', 'Consistency rule: best day max % of total profit', '0 = off') + sel('consScope', 'Consistency applies', [['funded', 'Funded stage + payouts only'], ['all', 'Every phase too']]) +
        sel('news', 'No-news rule', [['off', 'Off'], ['high', 'High-impact news (CPI, jobs, FOMC)'], ['all', 'High + medium (adds PPI, FOMC minutes)']], 'Calendar covers Jan to Apr 2026: CPI, jobs report, PPI, FOMC decisions and minutes. Not GDP, PCE, ISM or jobless claims.') +
        sel('newsWin', 'News window', [[2, '2 min either side'], [5, '5 min either side'], [10, '10 min either side'], [30, '30 min either side']]) + sel('newsApply', 'Blocks', [['both', 'Opening and manual closing'], ['open', 'Opening only']]) +
        chk('noWeekend', 'No weekend holding (auto-close Friday 21:30 UTC)') +
        '<div class="grid2">' + sel('minHold', 'Min hold time', [[0, 'None'], [1, '1 min'], [2, '2 min'], [5, '5 min'], [15, '15 min']], 'Profit from faster trades does not count') + num('maxRisk', 'Max risk per trade %', '0 = off') + '</div>' +
        '<div class="grid2">' + sel('lev', 'Leverage', LEVS) + num('maxTrades', 'Max trades per day', '0 = off') + '</div>' + num('comm', 'Commission $ per lot (100 oz)', '0 = none') +
        '<h4>Payout rules</h4><div class="grid2">' + num('split', 'Profit split %') + num('pMinDays', 'Days before payout') + num('pMinTD', 'Min trading days') + num('pMinProfit', 'Min profit % of size') + '</div>' + num('pMax', 'Max payout % of size per request', '0 = no cap') + chk('pCons', 'Consistency rule must pass for payouts');
    } else {
      h += '<label class="lbl">Condition preset</label><div class="chips"><span class="chip add" data-lpre="real">Realistic</span><span class="chip add" data-lpre="light">Light</span><span class="chip add" data-lpre="clean">Clean fills</span></div>' +
        num('bal', 'Starting balance ($)') + sel('lev', 'Leverage', LEVS, 'Position size is capped by leverage. Lower leverage means smaller positions.') +
        '<h4>Market conditions</h4>' + chk('varSpread', 'Variable spread (wider at rollover, Asia, and around news)') + sel('spreadLvl', 'Base spread', [['tight', 'Tight $0.20'], ['normal', 'Normal $0.30'], ['wide', 'Wide $0.50']]) +
        chk('slip', 'Slippage on market orders and stops (worse during news)') + sel('slipLvl', 'Slippage size', [['low', 'Low'], ['normal', 'Normal'], ['high', 'High']]) +
        num('comm', 'Commission $ per lot (100 oz)', '0 = none') + chk('swap', 'Overnight swap (charged at 22:00 UTC, triple on Wednesday)') +
        chk('margin', 'Margin call and stop-out') + num('stopOut', 'Stop-out margin level %') + chk('requote', 'Requotes (orders sometimes rejected, mostly around news)') + chk('disc', 'Random disconnects while playing (6 s without trading)');
    }
    h += '<div class="tbtns"><button class="ghost2" id="ac_cancel">Cancel</button><button class="buy" id="ac_create">Create account</button></div>';
    modal(h, 'tall'); const sh = document.querySelector('#modal .sheet'); if (sh) sh.scrollTop = sc;
    document.querySelectorAll('[data-type]').forEach((b) => (b.onclick = () => { AD = b.dataset.type === 'funded' ? fundDraft('two') : liveDraft('real'); acctForm(); }));
    document.querySelectorAll('[data-pre]').forEach((b) => (b.onclick = () => { AD = fundDraft(b.dataset.pre); acctForm(); }));
    document.querySelectorAll('[data-lpre]').forEach((b) => (b.onclick = () => { Object.assign(AD, LIVE_PRESETS[b.dataset.lpre]); acctForm(); }));
    document.querySelectorAll('[data-f]').forEach((el) => (el.onchange = () => {
      const k = el.dataset.f; let v = el.type === 'checkbox' ? el.checked : el.value;
      if (el.type !== 'checkbox' && k !== 'name' && /^-?\d+(\.\d+)?$/.test(String(v).trim())) v = +v;
      setp(AD, k, v); if (k === 'phases') acctForm();
    }));
    $('#ac_cancel').onclick = closeModal;
    $('#ac_create').onclick = () => {
      const D2 = AD, nm = String(D2.name || '').trim() || (D2.type === 'live' ? 'Live account' : 'Funded account');
      let a;
      if (D2.type === 'funded') {
        if (!(D2.size >= 100)) { toast('Account size is too small'); return; }
        if (D2.phases > 0 && D2.ph.slice(0, D2.phases).some((p) => !(p.t > 0))) { toast('Every phase needs a profit target'); return; }
        const cfg = JSON.parse(JSON.stringify(D2)); cfg.ph = cfg.ph.slice(0, cfg.phases); delete cfg.type; delete cfg.name; delete cfg.phases;
        a = { id: 'a' + Date.now(), type: 'funded', name: nm, cfg, attempt: 1, payouts: [], earned: 0 };
      } else {
        if (!(D2.bal >= 100)) { toast('Starting balance is too small'); return; }
        const cond = { varSpread: !!D2.varSpread, spreadLvl: D2.spreadLvl, slip: !!D2.slip, slipLvl: D2.slipLvl, comm: +D2.comm || 0, swap: !!D2.swap, margin: !!D2.margin, stopOut: +D2.stopOut || 50, requote: !!D2.requote, disc: !!D2.disc };
        a = { id: 'a' + Date.now(), type: 'live', name: nm, cfg: {}, cond, lev: +D2.lev, size0: +D2.bal, attempt: 1, payouts: [], earned: 0 };
      }
      acctInit(a); P.accts = P.accts || []; P.accts.push(a); P.curAcct = a.id; saveP(); closeModal(); renderStart();
    };
  }
  const hasDD = () => { const a = AC(); return !!(a && a.type === 'funded' && a.cfg && (a.cfg.dailyDD || a.cfg.maxDD)); };
  function acctStatsHtml(a) {
    const H = a.tr || [], wr = H.length ? Math.round(H.filter((h) => h.pnl > 0).length / H.length * 100) + '%' : '--', r = avgROf(H), pl = a.bal - a.base, rm = ddRoom(a, a.bal);
    const cl = (v) => (v == null || Math.abs(v) < 0.005 ? '' : v > 0 ? 'up' : 'dn');
    const box = (l, v, c, s) => '<span class="kv"><i>' + l + '</i><b class="' + (c || '') + '">' + v + '</b>' + (s ? '<em class="sub">' + s + '</em>' : '') + '</span>';
    const rt = (v) => (v == null ? '--' : (v >= 0 ? '+' : '') + v.toFixed(2) + 'R');
    const dd = a.type === 'funded' && (rm.d != null || rm.m != null) ? box('DD room', rm.d != null ? fmt(rm.d) : '--', '', 'Max <u>' + (rm.m != null ? fmt(rm.m) : '--') + '</u>') : '';
    return '<div class="stats4 acs' + (dd ? ' s5' : '') + '">' + box('Balance', fmt(a.bal)) + box('P&amp;L', (pl >= 0 ? '+' : '') + fmt(pl), cl(pl)) + dd + box('Win rate', wr, '', H.length + ' trades') + box('Avg R', rt(r), cl(r), 'wins only') + '</div>';
  }
  function bindAcctBox(a0) {
    const box = $('#ac_box'); if (!box) return; const list = P.accts || [];
    let h = '<label class="lbl" style="margin-top:0">Account</label><div class="chips">' + list.map((x) => '<span class="chip ' + (a0 && a0.id === x.id ? 'on' : '') + '" data-ac="' + x.id + '">' + esc(x.name) + '</span>').join('') + '<span class="chip add" id="ac_new">+ New account</span></div>';
    if (!a0) h += '<p class="muted">You need a trading account before you can start a session. Tap + New account to make a live or funded-prep account.</p>';
    if (a0) {
      const m = acctM(a0, a0.bal);
      h += acctStatsHtml(a0) + '<div class="srow"><span>' + (a0.type === 'live' ? 'Account' : 'Funded prep') + ' &middot; ' + ACT_STAGE(a0) + '</span><b>' + fmt(a0.bal) + '</b></div>' +
        (m.ph ? pbar(m.cp / m.target) + '<div class="muted sm">Profit ' + fmt(m.cp) + ' of ' + fmt(m.target) + ' target</div>' : '') +
        '<div class="tbtns"><button class="ghost2" id="ac_rules">Rules and progress</button>' + (a0.status !== 'active' ? '<button class="buy" id="ac_again">New attempt</button>' : '') + '<button class="ghost2" id="ac_del">Delete</button></div>' ;
    }
    box.innerHTML = h;
    box.querySelectorAll('[data-ac]').forEach((el) => (el.onclick = () => { P.curAcct = el.dataset.ac || null; saveP(); renderStart(); }));
    $('#ac_new').onclick = () => { AD = fundDraft('two'); acctForm(); };
    if (a0) {
      $('#ac_rules').onclick = () => openAcctPanel(a0, true);
      const ag = $('#ac_again'); if (ag) ag.onclick = () => { const keep = { id: a0.id, type: a0.type, name: a0.name, cfg: a0.cfg, cond: a0.cond, lev: a0.lev, size0: a0.size0, attempt: (a0.attempt || 1) + 1, payouts: a0.payouts || [], earned: a0.earned || 0 }; const i = P.accts.indexOf(a0); P.accts[i] = acctInit(keep); saveP(); renderStart(); toast('New attempt started'); };
      $('#ac_del').onclick = () => { if (confirm('Delete this account and its progress?')) { P.accts = P.accts.filter((x) => x !== a0); P.curAcct = null; saveP(); renderStart(); } };
    }
  }

  function discTick() {
    const a = AC(); if (!a || !a.cond || !a.cond.disc || !timer) return;
    if (S.lockUntil && Date.now() < S.lockUntil) return;
    if (Math.random() < 0.012) { S.lockUntil = Date.now() + 6000; toast('Connection lost. Reconnecting...'); setTimeout(() => { if (S) toast('Reconnected'); }, 6100); }
  }
  const dayHist = () => { const pid = S.pending && !S.pending.check ? S.pending.id : null, H = (S.hist || []).filter((h) => h.id !== pid); return { s: H, d: H.filter((h) => Math.floor(h.t1 / 1440) === S.dayKey) }; };
  const wrOf = (H) => (H.length ? Math.round(H.filter((h) => h.pnl > 0).length / H.length * 100) + '%' : '--');
  const avgROf = (H) => { const W = H.filter((h) => h.pnl > 0); return W.length ? W.reduce((x, h) => x + h.r, 0) / W.length : null; };
  const accHist = () => { const a = AC(), pid = S.pending && !S.pending.check ? S.pending.id : null, H = (a ? (a.tr || []) : (S.hist || [])).filter((h) => h.id !== pid); return { s: H, d: H.filter((h) => Math.floor(h.t1 / 1440) === S.dayKey) }; };
  const ddRoom = (a, eq) => { const m = acctM(a, eq); return { d: m.dLevel != null ? Math.max(0, eq - m.dLevel) : null, m: m.mLevel != null ? Math.max(0, eq - m.mLevel) : null }; };

  // ---------- replay ----------
  let HIST = [], IS = [];
  let mx = null, my = null, dTool = 'cur', dSel = null, dDraft = null, dDrag = null, dGrab = false, ovSig = '', ovRaf = 0, dVer = 0, dtbOpen = false, mkApi = null, man = false, touchy = false, gs = null, docBound = false;
  const PZ = { k: 1, off: 0 };
  const IND = { ema: ['EMA', 20, '#e6c14b'], sma: ['SMA', 50, '#4f8cff'], bb: ['Bollinger Bands', 20, '#9b8cff'], vwap: ['VWAP', 0, '#ff9f43'], rsi: ['RSI', 14, '#c792ea'], vol: ['Volume', 0, '#5c6b7f'] };
  const PALETTE = ['#e6c14b', '#4f8cff', '#ff9f43', '#c792ea', '#5ad1c4', '#ff6f91'];
  function destroyChart() { cancelAnimationFrame(ovRaf); ovRaf = 0; mkApi = null; if (chart && S) { const v = captureView(); if (v) savedView = v; } if (chart) { try { chart.remove(); } catch (e) {} chart = null; series = null; lines = []; IS = []; } }

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
  function setTF(v) { if (!S || v === S.tf) return; const view = captureView(); S.tf = v; loadTF(view); drawTfBits(); saveP(); }

  function renderReplay() {
    applyEnv(); setTimeout(flushAlerts, 250);
    dTool = 'cur'; dSel = null; dDraft = null; dDrag = null; dGrab = false; ovSig = '';
    $('#view').innerHTML = '<div class="rp">' +
      '<div class="top">' +
      '<div class="info2"><div class="i2a"><span id="h_sess" class="stag"></span><span id="h_time"></span><span id="h_acct" class="stag acc" style="display:none"></span><span class="trc">Trades <b id="h_cnt"></b></span></div>' +
      '<div class="stats4' + (hasDD() ? ' s5' : '') + '"><span class="kv"><i>Balance</i><b id="h_bal"></b><em class="sub">Equity <u id="h_eq"></u></em></span><span class="kv"><i>P&amp;L</i><b id="h_pnl"></b><em class="sub">Day <u id="h_dpnl"></u></em></span>' + (hasDD() ? '<span class="kv"><i>DD room</i><b id="h_dd"></b><em class="sub">Max <u id="h_mdd"></u></em></span>' : '') + '<span class="kv"><i>Win rate</i><b id="h_wr"></b><em class="sub">Day <u id="h_dwr"></u></em></span><span class="kv"><i>Avg R</i><b id="h_rr"></b><em class="sub">Day <u id="h_drr"></u></em></span></div></div>' +
      '<div class="tfrow"><div class="tfmw"><button class="tfm" id="tf_menu"></button><div id="tf_panel" class="tfpanel"></div></div><div class="tfpins" id="tf_pins"></div>' +
      '<button class="tf ind" id="c_hist" title="Trade history">' + UI.list + '</button><button class="tf ind" id="c_note" title="Quick note">' + UI.note + '</button><button class="tf ind" id="c_ind">fx</button></div></div>' +
      '<div id="chartwrap"><div id="chart"></div><canvas id="ov"></canvas><div id="hnd"></div><div id="dtb"></div><div id="favis" class="favis"></div><div id="toolpanel" class="toolpanel"></div><div id="ctxm" class="ctxm"></div>' +
      '<div class="island"><div class="grip" data-grip="isl" title="Drag to move (double-click to reset)">' + UI.grip + '</div><div class="fxbar"><button id="c_play" class="pl">' + UI.play + '</button><button id="c_next">+candle</button><button id="c_sess">Next sesh</button><div class="spw"><button id="c_speed">1x &#9662;</button><div id="c_menu" class="spmenu"></div></div><button id="c_cross" title="Crosshair">&#8982;</button><button id="c_end" class="endb">End</button></div></div></div></div>';
    if (!S.vid) S.vid = Date.now();
    mountChart(); loadTF(savedView && savedView.key === S.vid ? savedView : null); drawTfBits(); drawTb(); drawFav(); bindDraw(); placeMovable('isl'); bindGrip($('.island .grip'), $('.island'), 'isl');
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
    wireCross();
    const crossBtn = $('#c_cross');
    if (crossBtn) { crossBtn.classList.toggle('on', !!P.set.cross); crossBtn.onclick = () => { setCross(!P.set.cross); crossBtn.classList.toggle('on', !!P.set.cross); }; }
    $('#c_hist').onclick = () => { pause(); openHistory(); };
    $('#c_note').onclick = toggleNote;
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
      rightPriceScale: { borderColor: '#2a2e39', scaleMargins: { top: 0.08, bottom: 0.14 } }, crosshair: { mode: (P.set && P.set.cross) ? 0 : 2 },
    });
    PZ.k = 1; PZ.off = 0; man = false;
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
  function loadTF(v) {
    HIST = E.candles(S.tf, S.cur, 700);
    series.setData(HIST); S.run = HIST[HIST.length - 1] || null;
    buildInd(); refreshMarkers(); dVer++;
    if (v) { applyView(v); return; }
    PZ.k = 1; PZ.off = 0; man = false; try { series.priceScale().applyOptions({ autoScale: true }); } catch (e) {}
    chart.timeScale().applyOptions({ barSpacing: 9 });
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, HIST.length - 60), to: HIST.length + 6 });
  }

  // ---------- drawing tools (overlay canvas on top of the chart) ----------
  const DCOL = '#e6c14b';
  const DSW = ['#e6c14b', '#4f8cff', '#ef5350', '#26a69a', '#c792ea', '#ffffff'];
  const svg = (inner) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + inner + '</svg>';
  const Pa = (d, x) => '<path d="' + d + '"' + (x ? ' ' + x : '') + '/>';
  const Dt = (x, y) => '<circle cx="' + x + '" cy="' + y + '" r="1.8" fill="currentColor" stroke="none"/>';
  const DASH = 'stroke-dasharray="2 2"';
  const TOOLS = [
    // [id, name, category, points (0 = any number, -1 = freehand), icon]
    ['trend', 'Trend line', 'Lines', 2, Pa('M5 19L19 5') + Dt(5, 19) + Dt(19, 5)],
    ['ray', 'Ray', 'Lines', 2, Pa('M5 19L21 3') + Dt(5, 19)],
    ['info', 'Info line', 'Lines', 2, Pa('M4 19L14 9') + Dt(4, 19) + '<rect x="13" y="3" width="9" height="6" rx="1.5"/>'],
    ['extended', 'Extended line', 'Lines', 2, Pa('M2 22L22 2') + Dt(8, 16) + Dt(15, 9)],
    ['angle', 'Trend angle', 'Lines', 2, Pa('M4 19L19 7M4 19H21') + Pa('M12 19a8 8 0 0 0-3-6')],
    ['hline', 'Horizontal line', 'Lines', 1, Pa('M3 12H21') + Dt(12, 12)],
    ['hray', 'Horizontal ray', 'Lines', 1, Pa('M6 12H21') + Dt(6, 12)],
    ['vline', 'Vertical line', 'Lines', 1, Pa('M12 3V21') + Dt(12, 12)],
    ['cross', 'Cross line', 'Lines', 1, Pa('M3 12H21M12 3V21')],
    ['channel', 'Parallel channel', 'Channels', 3, Pa('M4 14L16 5M8 20L20 11')],
    ['regression', 'Regression trend', 'Channels', 2, Pa('M4 16L20 8') + Pa('M4 11L20 3M4 21L20 13', DASH)],
    ['flat', 'Flat top / bottom', 'Channels', 3, Pa('M4 19L20 9M4 5H20')],
    ['disjoint', 'Disjoint channel', 'Channels', 4, Pa('M3 10L11 4M13 20L21 14') + Pa('M3 10L13 20M11 4L21 14', 'opacity=".4"')],
    ['pitchfork', 'Pitchfork', 'Pitchforks', 3, Pa('M4 20L20 4') + Pa('M4 8L16 20M10 4L20 14', 'opacity=".6"')],
    ['schiff', 'Schiff pitchfork', 'Pitchforks', 3, Pa('M5 18L20 6') + Pa('M4 7L14 19M10 4L20 13', 'opacity=".6"') + Dt(5, 18)],
    ['mschiff', 'Modified Schiff pitchfork', 'Pitchforks', 3, Pa('M7 16L20 6') + Pa('M4 7L14 19M10 4L20 13', 'opacity=".6"') + Dt(7, 16)],
    ['inside', 'Inside pitchfork', 'Pitchforks', 3, Pa('M4 20L20 4') + Pa('M4 8L16 20M10 4L20 14M7 14L14 8', 'opacity=".5"')],
    ['pitchfan', 'Pitchfan', 'Pitchforks', 3, Pa('M4 12L20 4M4 12L20 12M4 12L20 20')],
    ['fib', 'Fib retracement', 'Fibonacci', 2, Pa('M4 5H20M4 10H20M4 15H20M4 20H20') + Pa('M6 19L18 6', DASH)],
    ['fibext', 'Trend-based fib extension', 'Fibonacci', 3, Pa('M4 6H20M4 12H20M4 18H20') + Pa('M4 20L9 10L14 15')],
    ['fibchan', 'Fib channel', 'Fibonacci', 3, Pa('M3 20L20 12M3 15L20 7M3 10L20 2')],
    ['fibtz', 'Fib time zone', 'Fibonacci', 2, Pa('M5 4V20M9 4V20M13 4V20M19 4V20')],
    ['fibfan', 'Fib speed resistance fan', 'Fibonacci', 2, Pa('M4 20L20 5M4 20L20 11M4 20L20 16M4 20L20 20')],
    ['fibtime', 'Trend-based fib time', 'Fibonacci', 3, Pa('M4 20H20') + Pa('M8 5V20M12 9V20M18 5V20')],
    ['fibcirc', 'Fib circles', 'Fibonacci', 2, '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/>'],
    ['fibspiral', 'Fib spiral', 'Fibonacci', 2, Pa('M12 12a2 2 0 0 1 2 2a4 4 0 0 1-4 4a7 7 0 0 1-7-7a11 11 0 0 1 11-9')],
    ['fibarc', 'Fib speed resistance arcs', 'Fibonacci', 2, Pa('M4 20A16 16 0 0 1 20 4') + Pa('M4 20A10 10 0 0 1 14 10')],
    ['fibwedge', 'Fib wedge', 'Fibonacci', 3, Pa('M4 20L20 6M4 20L20 16') + Pa('M14 8Q18 12 17 17')],
    ['gannbox', 'Gann box', 'Gann', 2, '<rect x="4" y="4" width="16" height="16"/>' + Pa('M4 4L20 20M4 20L20 4M12 4V20M4 12H20')],
    ['gannsq', 'Gann square', 'Gann', 2, '<rect x="4" y="4" width="16" height="16"/>' + Pa('M4 4L20 20M4 12H20M12 4V20M8 4V20M16 4V20')],
    ['gannsqf', 'Gann square fixed', 'Gann', 2, '<rect x="4" y="4" width="16" height="16"/>' + Pa('M4 20L20 4M4 12H20M12 4V20')],
    ['gannfan', 'Gann fan', 'Gann', 2, Pa('M4 20L20 4M4 20L20 10M4 20L20 15M4 20L12 4M4 20L8 4')],
    ['xabcd', 'XABCD pattern', 'Patterns', 5, Pa('M3 16L7 5L13 14L16 8L21 16')],
    ['cypher', 'Cypher pattern', 'Patterns', 5, Pa('M3 17L8 6L12 15L17 4L21 12')],
    ['abcd', 'ABCD pattern', 'Patterns', 4, Pa('M4 17L9 6L15 16L20 5')],
    ['hs', 'Head and shoulders', 'Patterns', 7, Pa('M2 18L6 12L9 15L12 5L15 15L18 12L22 18') + Pa('M2 15H22', 'opacity=".5"')],
    ['trianglep', 'Triangle pattern', 'Patterns', 4, Pa('M3 5L21 11M3 19L21 13')],
    ['threedrives', 'Three drives pattern', 'Patterns', 7, Pa('M2 18L5 10L7 14L11 6L13 11L18 3L21 8')],
    ['impulse', 'Elliott impulse wave (12345)', 'Elliott waves', 6, Pa('M2 19L6 9L9 14L14 4L16 9L21 2')],
    ['correction', 'Elliott correction wave (ABC)', 'Elliott waves', 4, Pa('M3 5L10 15L14 10L21 20')],
    ['trianglewave', 'Elliott triangle wave (ABCDE)', 'Elliott waves', 6, Pa('M2 6L7 18L11 8L14 16L17 10L21 14')],
    ['doublecombo', 'Elliott double combo (WXY)', 'Elliott waves', 4, Pa('M3 18L8 7L12 14L16 8L21 14')],
    ['triplecombo', 'Elliott triple combo (WXYXZ)', 'Elliott waves', 6, Pa('M2 18L5 8L8 14L11 6L14 14L17 7L21 15')],
    ['cyclic', 'Cyclic lines', 'Cycles', 2, Pa('M5 4V20M10 4V20M15 4V20M20 4V20')],
    ['timecycles', 'Time cycles', 'Cycles', 2, Pa('M3 18A4 6 0 0 1 11 18M11 18A4 6 0 0 1 19 18')],
    ['sine', 'Sine line', 'Cycles', 2, Pa('M2 12Q7 0 12 12T22 12')],
    ['longpos', 'Long position', 'Projection', 1, '<rect x="5" y="4" width="14" height="8" rx="1" fill="currentColor" fill-opacity=".25"/><rect x="5" y="12" width="14" height="8" rx="1"/>'],
    ['shortpos', 'Short position', 'Projection', 1, '<rect x="5" y="4" width="14" height="8" rx="1"/><rect x="5" y="12" width="14" height="8" rx="1" fill="currentColor" fill-opacity=".25"/>'],
    ['forecast', 'Forecast', 'Projection', 2, Pa('M3 18L11 12') + Pa('M11 12L21 5', DASH) + '<rect x="16" y="3" width="6" height="6" rx="1"/>'],
    ['barspattern', 'Bars pattern', 'Projection', 3, Pa('M5 8V16M5 10H7M5 14H3M10 5V14M10 7H12M10 12H8M15 11V19M15 13H17M15 17H13')],
    ['projection', 'Projection', 'Projection', 3, Pa('M3 18L10 8') + Pa('M12 20L20 10', DASH)],
    ['avwap', 'Anchored VWAP', 'Projection', 1, Pa('M4 18Q9 8 12 14T21 6') + Dt(4, 18)],
    ['volprofile', 'Fixed range volume profile', 'Projection', 2, Pa('M4 4V20') + Pa('M4 6H12M4 9H17M4 12H10M4 15H14M4 18H8')],
    ['avolprofile', 'Anchored volume profile', 'Projection', 1, Pa('M4 4V20') + Pa('M4 6H12M4 9H17M4 12H10M4 15H14M4 18H8') + Dt(4, 4)],
    ['pricerange', 'Price range', 'Measure', 2, Pa('M12 4V20M8 8L12 4L16 8M8 16L12 20L16 16')],
    ['daterange', 'Date range', 'Measure', 2, Pa('M4 12H20M8 8L4 12L8 16M16 8L20 12L16 16')],
    ['datepricerange', 'Date and price range', 'Measure', 2, '<rect x="4" y="6" width="16" height="12" rx="1"/>' + Pa('M12 8V16M8 12H16')],
    ['brush', 'Brush', 'Brushes and arrows', -1, Pa('M4 20L8 20L19 9L15 5L4 16Z') + Pa('M13 7L17 11')],
    ['highlighter', 'Highlighter', 'Brushes and arrows', -1, Pa('M5 19H12L20 11L15 6L7 14Z') + Pa('M4 21H20', 'opacity=".5"')],
    ['arrow', 'Arrow', 'Brushes and arrows', 2, Pa('M4 20L19 5M11 5H19V13')],
    ['arrowmark', 'Arrow marker', 'Brushes and arrows', 2, Pa('M5 19L17 7', 'stroke-width="3"') + Pa('M10 5H19V14')],
    ['arrowup', 'Arrow mark up', 'Brushes and arrows', 1, Pa('M12 20V6M6 12L12 5L18 12')],
    ['arrowdown', 'Arrow mark down', 'Brushes and arrows', 1, Pa('M12 4V18M6 12L12 19L18 12')],
    ['rect', 'Rectangle', 'Shapes', 2, '<rect x="4" y="6" width="16" height="12" rx="1"/>'],
    ['rotrect', 'Rotated rectangle', 'Shapes', 3, Pa('M3 14L13 4L21 12L11 22Z')],
    ['circle', 'Circle', 'Shapes', 2, '<circle cx="12" cy="12" r="8"/>'],
    ['ellipse', 'Ellipse', 'Shapes', 2, '<ellipse cx="12" cy="12" rx="9" ry="6"/>'],
    ['polyline', 'Polyline', 'Shapes', 0, Pa('M3 18L9 8L14 14L21 5')],
    ['path', 'Path', 'Shapes', 0, Pa('M3 18L9 8L14 14L20 6M15 6H20V11')],
    ['triangle', 'Triangle', 'Shapes', 3, Pa('M12 4L21 19H3Z')],
    ['arc', 'Arc', 'Shapes', 3, Pa('M4 18Q12 0 20 18')],
    ['curve', 'Curve', 'Shapes', 2, Pa('M4 18Q12 2 20 8')],
    ['doublecurve', 'Double curve', 'Shapes', 2, Pa('M3 18C10 18 14 6 21 6')],
    ['text', 'Text', 'Text and notes', 1, Pa('M5 6H19M12 6V19M9 19H15')],
    ['note', 'Note', 'Text and notes', 1, Pa('M5 4H19V16H11L7 20V16H5Z')],
    ['callout', 'Callout', 'Text and notes', 2, Pa('M5 4H19V14H13L9 20V14H5Z')],
    ['comment', 'Comment', 'Text and notes', 1, Pa('M5 5H19V15H12L8 19V15H5Z') + Dt(9, 10) + Dt(12, 10) + Dt(15, 10)],
    ['pricelabel', 'Price label', 'Text and notes', 1, Pa('M3 12L8 6H21V18H8Z')],
    ['pricenote', 'Price note', 'Text and notes', 2, Pa('M3 18L11 10') + '<rect x="11" y="4" width="10" height="6" rx="1"/>'],
    ['pin', 'Pin', 'Text and notes', 1, Pa('M12 21V12') + '<circle cx="12" cy="8" r="4.5"/>'],
    ['signpost', 'Signpost', 'Text and notes', 1, Pa('M6 21V4') + Pa('M6 5H19L16 9L19 13H6')],
    ['flagnote', 'Flag note', 'Text and notes', 1, Pa('M6 21V4') + Pa('M6 4H19V12H6')],
  ];
  const TOOL = {}; TOOLS.forEach((t) => (TOOL[t[0]] = { id: t[0], name: t[1], cat: t[2], n: t[3], icon: svg(t[4]) }));
  const UI = {
    pencil: svg(Pa('M4 20L5 15L16 4L20 8L9 19Z') + Pa('M14 6L18 10')),
    cursor: svg(Pa('M6 3L18 12L12 13L9 19Z')),
    magnet: svg(Pa('M6 4V12a6 6 0 0 0 12 0V4M6 8H10M14 8H18')),
    trash: svg(Pa('M5 7H19M10 7V4H14V7M7 7L8 20H16L17 7')),
    star: svg(Pa('M12 3.5L14.6 9L20.5 9.7L16 13.8L17.3 19.8L12 16.8L6.7 19.8L8 13.8L3.5 9.7L9.4 9Z')),
    starOn: svg(Pa('M12 3.5L14.6 9L20.5 9.7L16 13.8L17.3 19.8L12 16.8L6.7 19.8L8 13.8L3.5 9.7L9.4 9Z', 'fill="currentColor"')),
    note: svg(Pa('M5 3H15L19 7V21H5Z') + Pa('M9 12H15M9 16H13')),
    list: svg(Pa('M8 6H20M8 12H20M8 18H20') + Dt(4, 6) + Dt(4, 12) + Dt(4, 18)),
    grip: svg(Dt(9, 6) + Dt(15, 6) + Dt(9, 12) + Dt(15, 12) + Dt(9, 18) + Dt(15, 18)),
    play: svg(Pa('M7 4L19 12L7 20Z', 'fill="currentColor"')),
    pause: svg(Pa('M8 5V19M16 5V19', 'stroke-width="3"')),
    reset: svg(Pa('M4 12a8 8 0 1 0 3-6.2M4 4V8H8')),
  };
  const FIBS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618];
  const FCOL = ['#787b86', '#f23645', '#ff9800', '#4caf50', '#089981', '#00bcd4', '#787b86', '#2962ff', '#9c27b0'];
  const TEXTY = { text: 1, note: 1, callout: 1, comment: 1, pricenote: 1, pin: 1, signpost: 1, flagnote: 1 };

  // ---- coordinate helpers ----
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
  const xl = (l) => chart.timeScale().logicalToCoordinate(l);
  const yp = (p) => series.priceToCoordinate(p);
  const proj = (pt) => { const x = xl(t2l(pt.t)), y = yp(pt.p); return (x == null || y == null) ? null : { x, y }; };
  function unproj(x, y, snap) {
    const l = chart.timeScale().coordinateToLogical(x), p = series.coordinateToPrice(y);
    if (l == null || p == null) return null;
    let o = { t: l2t(l), p: Math.round(p * 100) / 100, l };
    const mg = (P.set && P.set.magnet) || 0;
    if (snap && mg && HIST.length) {
      const i = Math.max(0, Math.min(HIST.length - 1, Math.round(l))), b = HIST[i];
      let best = null;
      [b.open, b.high, b.low, b.close].forEach((pr) => { const py = yp(pr); if (py == null) return; const dd = Math.abs(py - y); if (!best || dd < best.d) best = { d: dd, p: pr }; });
      if (best && (mg === 2 || best.d <= 22)) o = { t: b.time, p: best.p, l: i };
    }
    return o;
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
  const sgn = (v) => (v >= 0 ? '+' : '');
  const f2 = (v) => v.toFixed(2);
  const pctOf = (a, b) => (a ? (b - a) / a * 100 : 0);
  function fdur(sec) {
    sec = Math.abs(sec); const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
    return ((d ? d + 'd ' : '') + (h ? h + 'h ' : '') + (m || !(d || h) ? m + 'm' : '')).trim();
  }

  // ---- paint helpers ----
  function rrect(c, x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); }
  function tag(c, txt, x, y, bg, fg, al) {
    c.font = '600 11px sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
    const w = c.measureText(txt).width + 10, h = 18, x0 = al === 'r' ? x - w : al === 'c' ? x - w / 2 : x;
    c.fillStyle = bg; rrect(c, x0, y - h / 2, w, h, 4); c.fill();
    c.fillStyle = fg || '#fff'; c.fillText(txt, x0 + 5, y);
  }
  function arrowHead(c, a, b, s) {
    const an = Math.atan2(b.y - a.y, b.x - a.x); s = s || 10;
    c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x - s * Math.cos(an - 0.45), b.y - s * Math.sin(an - 0.45)); c.lineTo(b.x - s * Math.cos(an + 0.45), b.y - s * Math.sin(an + 0.45)); c.closePath(); c.fill();
  }
  function mkEnv(c, pw, ph, d) {
    const col = d.color || DCOL, e = { c, pw, ph, col, post: [], xl, yp };
    e.L = (a, b) => { c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); };
    e.far = (a, b) => { const dx = b.x - a.x, dy = b.y - a.y, k = 1e5 / (Math.hypot(dx, dy) || 1); return { x: a.x + dx * k, y: a.y + dy * k }; };
    e.ray = (a, b) => e.L(a, e.far(a, b));
    e.path = (Q, close) => { c.beginPath(); Q.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y))); if (close) c.closePath(); };
    e.fillPoly = (Q, a) => { e.path(Q, true); c.globalAlpha = a || 0.12; c.fill(); c.globalAlpha = 1; };
    e.poly = (Q, close) => { e.path(Q, close); c.stroke(); };
    e.tag = (txt, x, y, bg, fg, al) => tag(c, txt, x, y, bg || col, fg, al);
    e.dash = (a) => c.setLineDash(a || []);
    e.mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    return e;
  }

  // ---- long / short position stats (TradingView style) ----
  function posStats(d) {
    const key = [d.pts[0].t, d.pts[0].p, d.pts[1].p, d.pts[2].p, S.cur, S.balance].join('|');
    if (d._c && d._c.key === key) return d._c.v;
    const long = d.type === 'longpos', en = d.pts[0].p, tp = d.pts[1].p, sl = d.pts[2].p;
    const dist = Math.abs(en - sl), units = dist > 0.005 ? E.size(S.balance, P.plan.risk.pct, en, sl).units || 0 : 0;
    const risk = units * dist, reward = units * Math.abs(tp - en), rr = dist > 0 ? Math.abs(tp - en) / dist : 0;
    let status = 'pending', res = null;
    const i0 = E.find(Math.floor(d.pts[0].t / 60));
    if (i0 >= 0 && d.pts[0].t <= E.t(S.cur) * 60) {
      status = 'open';
      for (let i = i0 + 1; i <= S.cur; i++) {
        const b = E.bar(i);
        if (long ? b.l <= sl : b.h >= sl) { status = 'stop'; break; }
        if (long ? b.h >= tp : b.l <= tp) { status = 'target'; break; }
      }
      if (status === 'open') res = units * (E.close(S.cur) - en) * (long ? 1 : -1);
    }
    const v = { long, en, tp, sl, units, risk, reward, rr, status, open: res };
    d._c = { key, v }; return v;
  }

  // ---- shape renderers: (ctx, projected points, drawing, env) ----
  const RD = {};
  RD.trend = (c, Q, d, e) => e.L(Q[0], Q[1]);
  RD.ray = (c, Q, d, e) => e.ray(Q[0], Q[1]);
  RD.extended = (c, Q, d, e) => { e.ray(Q[0], Q[1]); e.ray(Q[1], Q[0]); };
  RD.info = (c, Q, d, e) => {
    e.L(Q[0], Q[1]); const a = d.pts[0], b = d.pts[1], dp = b.p - a.p, bars = Math.round(t2l(b.t) - t2l(a.t)), ang = Math.round(Math.atan2(-(Q[1].y - Q[0].y), Q[1].x - Q[0].x) * 180 / Math.PI);
    e.tag(sgn(dp) + f2(dp) + ' (' + sgn(dp) + f2(pctOf(a.p, b.p)) + '%)  ' + bars + ' bars  ' + fdur(b.t - a.t) + '  ' + ang + '\u00b0', Q[1].x + 8, Q[1].y - 14, '#363c4e');
  };
  RD.angle = (c, Q, d, e) => {
    e.L(Q[0], Q[1]); e.dash([4, 4]); e.L(Q[0], { x: Q[1].x, y: Q[0].y }); e.dash();
    const an = Math.atan2(Q[1].y - Q[0].y, Q[1].x - Q[0].x), deg = Math.round(-an * 180 / Math.PI);
    c.beginPath(); c.arc(Q[0].x, Q[0].y, 26, 0, an, an < 0); c.stroke();
    e.tag(deg + '\u00b0', Q[0].x + 34, Q[0].y + (an < 0 ? -10 : 10), '#363c4e');
  };
  RD.hline = (c, Q, d, e) => {
    e.L({ x: 0, y: Q[0].y }, { x: e.pw, y: Q[0].y });
    e.post.push(() => tag(c, d.pts[0].p.toFixed(2), e.pw + 1, Q[0].y, d.color || DCOL, '#10141a', 'l'));
  };
  RD.hray = (c, Q, d, e) => { e.L({ x: Q[0].x, y: Q[0].y }, { x: e.pw, y: Q[0].y }); };
  RD.vline = (c, Q, d, e) => e.L({ x: Q[0].x, y: 0 }, { x: Q[0].x, y: e.ph });
  RD.cross = (c, Q, d, e) => { e.L({ x: 0, y: Q[0].y }, { x: e.pw, y: Q[0].y }); e.L({ x: Q[0].x, y: 0 }, { x: Q[0].x, y: e.ph }); };
  RD.channel = (c, Q, d, e) => {
    const k = (Q[1].y - Q[0].y) / ((Q[1].x - Q[0].x) || 1), off = Q[2].y - (Q[0].y + (Q[2].x - Q[0].x) * k);
    const A = { x: Q[0].x, y: Q[0].y + off }, B = { x: Q[1].x, y: Q[1].y + off };
    e.fillPoly([Q[0], Q[1], B, A], 0.08); e.L(Q[0], Q[1]); e.L(A, B); e.dash([4, 4]); e.L(e.mid(Q[0], A), e.mid(Q[1], B)); e.dash();
  };
  RD.regression = (c, Q, d, e) => {
    let i0 = Math.round(Math.min(t2l(d.pts[0].t), t2l(d.pts[1].t))), i1 = Math.round(Math.max(t2l(d.pts[0].t), t2l(d.pts[1].t)));
    i0 = Math.max(0, i0); i1 = Math.min(HIST.length - 1, i1); if (i1 - i0 < 2) { e.L(Q[0], Q[1]); return; }
    const n = i1 - i0 + 1; let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (let i = i0; i <= i1; i++) { const x = i - i0, y = HIST[i].close; sx += x; sy += y; sxy += x * y; sxx += x * x; }
    const m = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1), b0 = (sy - m * sx) / n; let ss = 0;
    for (let i = i0; i <= i1; i++) { const r = HIST[i].close - (b0 + m * (i - i0)); ss += r * r; }
    const sd = Math.sqrt(ss / n), X0 = xl(i0), X1 = xl(i1), pr = (i, k) => yp(b0 + m * (i - i0) + k * sd);
    const lines = [[0, d.color || DCOL, []], [2, '#4f8cff', []], [-2, '#4f8cff', []], [1, '#4f8cff', [3, 4]], [-1, '#4f8cff', [3, 4]]];
    e.fillPoly([{ x: X0, y: pr(i0, 2) }, { x: X1, y: pr(i1, 2) }, { x: X1, y: pr(i1, -2) }, { x: X0, y: pr(i0, -2) }], 0.07);
    lines.forEach((ln) => { c.strokeStyle = ln[1]; e.dash(ln[2]); e.L({ x: X0, y: pr(i0, ln[0]) }, { x: X1, y: pr(i1, ln[0]) }); }); e.dash();
  };
  RD.flat = (c, Q, d, e) => { e.L(Q[0], Q[1]); e.L({ x: Q[0].x, y: Q[2].y }, { x: Q[1].x, y: Q[2].y }); e.fillPoly([Q[0], Q[1], { x: Q[1].x, y: Q[2].y }, { x: Q[0].x, y: Q[2].y }], 0.08); };
  RD.disjoint = (c, Q, d, e) => { e.L(Q[0], Q[1]); e.L(Q[2], Q[3]); e.fillPoly([Q[0], Q[1], Q[3], Q[2]], 0.08); };
  function pf(kind) {
    return (c, Q, d, e) => {
      let O = Q[0];
      if (kind === 'schiff') O = { x: Q[0].x, y: (Q[0].y + Q[1].y) / 2 };
      if (kind === 'mschiff') O = e.mid(Q[0], Q[1]);
      const M = e.mid(Q[1], Q[2]), v = { x: M.x - O.x, y: M.y - O.y }, k = 1e5 / (Math.hypot(v.x, v.y) || 1);
      const fr = (p) => ({ x: p.x + v.x * k, y: p.y + v.y * k });
      e.fillPoly([Q[1], fr(Q[1]), fr(Q[2]), Q[2]], 0.06);
      e.L(O, fr(O)); e.L(Q[1], fr(Q[1])); e.L(Q[2], fr(Q[2]));
      if (kind === 'inside') { const a = e.mid(Q[1], M), b = e.mid(Q[2], M); c.globalAlpha = 0.6; e.L(a, fr(a)); e.L(b, fr(b)); c.globalAlpha = 1; }
      e.dash([4, 4]); e.L(Q[1], Q[2]); if (kind !== 'pitchfork' && kind !== 'inside') e.L(Q[0], O); e.dash();
    };
  }
  RD.pitchfork = pf('pitchfork'); RD.schiff = pf('schiff'); RD.mschiff = pf('mschiff'); RD.inside = pf('inside');
  RD.pitchfan = (c, Q, d, e) => { [0, 0.382, 0.5, 0.618, 1].forEach((f) => e.ray(Q[0], { x: Q[1].x + (Q[2].x - Q[1].x) * f, y: Q[1].y + (Q[2].y - Q[1].y) * f })); e.dash([4, 4]); e.L(Q[1], Q[2]); e.dash(); };
  function fibLines(e, levels, priceOf, x0, x1, label) {
    const c = e.c; let py = null, pc = null;
    levels.forEach((L, i) => {
      const y = yp(priceOf(L)); if (y == null) return; const col = FCOL[i % FCOL.length];
      if (py != null) { c.globalAlpha = 0.07; c.fillStyle = pc; c.fillRect(x0, Math.min(y, py), x1 - x0, Math.abs(y - py)); c.globalAlpha = 1; }
      c.strokeStyle = col; e.L({ x: x0, y }, { x: x1, y });
      c.fillStyle = col; c.font = '11px sans-serif'; c.textBaseline = 'bottom'; c.textAlign = 'left'; c.fillText(label(L, priceOf(L)), x0 + 4, y - 2);
      py = y; pc = col;
    });
  }
  RD.fib = (c, Q, d, e) => {
    const x0 = Math.min(Q[0].x, Q[1].x), x1 = Math.max(Q[0].x, Q[1].x) + (Math.abs(Q[1].x - Q[0].x) < 40 ? 60 : 0), a = d.pts[0].p, b = d.pts[1].p;
    fibLines(e, FIBS, (L) => b + (a - b) * L, x0, x1, (L, p) => L + ' (' + p.toFixed(2) + ')');
    c.strokeStyle = '#787b86'; e.dash([4, 4]); c.globalAlpha = 0.6; e.L(Q[0], Q[1]); c.globalAlpha = 1; e.dash();
  };
  RD.fibext = (c, Q, d, e) => {
    const lv = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618, 2, 2.618], mv = d.pts[1].p - d.pts[0].p, base = d.pts[2].p;
    fibLines(e, lv, (L) => base + mv * L, Math.min(Q[1].x, Q[2].x), Math.max(Q[2].x + 120, Q[1].x + 120), (L, p) => L + ' (' + p.toFixed(2) + ')');
    c.strokeStyle = '#787b86'; e.dash([4, 4]); e.poly(Q.slice(0, 3)); e.dash();
  };
  RD.fibchan = (c, Q, d, e) => {
    const k = (Q[1].y - Q[0].y) / ((Q[1].x - Q[0].x) || 1), off = Q[2].y - (Q[0].y + (Q[2].x - Q[0].x) * k);
    [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618].forEach((L, i) => { c.strokeStyle = FCOL[i % FCOL.length]; e.L({ x: Q[0].x, y: Q[0].y + off * L }, { x: Q[1].x, y: Q[1].y + off * L }); });
  };
  const FSEQ = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
  RD.fibtz = (c, Q, d, e) => {
    const l0 = t2l(d.pts[0].t), dl = t2l(d.pts[1].t) - l0 || 1;
    FSEQ.forEach((f, i) => { const x = xl(l0 + dl * f); if (x == null) return; c.strokeStyle = FCOL[i % FCOL.length]; e.L({ x, y: 0 }, { x, y: e.ph }); c.fillStyle = c.strokeStyle; c.font = '11px sans-serif'; c.textBaseline = 'top'; c.fillText(String(f), x + 3, 4); });
  };
  RD.fibtime = (c, Q, d, e) => {
    const l2 = t2l(d.pts[2].t), u = (t2l(d.pts[1].t) - t2l(d.pts[0].t)) || 1;
    [0, 0.382, 0.5, 0.618, 1, 1.382, 1.618, 2, 2.618].forEach((f, i) => { const x = xl(l2 + u * f); if (x == null) return; c.strokeStyle = FCOL[i % FCOL.length]; e.L({ x, y: 0 }, { x, y: e.ph }); c.fillStyle = c.strokeStyle; c.font = '11px sans-serif'; c.textBaseline = 'top'; c.fillText(String(f), x + 3, 4); });
    c.strokeStyle = '#787b86'; e.dash([4, 4]); e.poly(Q.slice(0, 3)); e.dash();
  };
  RD.fibfan = (c, Q, d, e) => {
    [0.25, 0.382, 0.5, 0.618, 0.75, 1].forEach((L, i) => {
      c.strokeStyle = FCOL[(i + 1) % FCOL.length];
      e.ray(Q[0], { x: Q[1].x, y: Q[0].y + (Q[1].y - Q[0].y) * L }); e.ray(Q[0], { x: Q[0].x + (Q[1].x - Q[0].x) * L, y: Q[1].y });
    });
  };
  RD.fibcirc = (c, Q, d, e) => {
    const m = e.mid(Q[0], Q[1]), R = Math.hypot(Q[1].x - Q[0].x, Q[1].y - Q[0].y) / 2;
    [0.236, 0.382, 0.5, 0.618, 0.786, 1].forEach((L, i) => { c.strokeStyle = FCOL[(i + 1) % FCOL.length]; c.beginPath(); c.arc(m.x, m.y, R * L, 0, 6.2832); c.stroke(); });
  };
  RD.fibspiral = (c, Q, d, e) => {
    const R = Math.hypot(Q[1].x - Q[0].x, Q[1].y - Q[0].y), phi = 1.618034, TH = 3 * Math.PI, a = R / Math.pow(phi, TH / (Math.PI / 2)), base = Math.atan2(Q[1].y - Q[0].y, Q[1].x - Q[0].x), pts = [];
    for (let th = 0; th <= TH; th += 0.1) { const r = a * Math.pow(phi, th / (Math.PI / 2)), an = base + th - TH; pts.push({ x: Q[0].x + r * Math.cos(an), y: Q[0].y + r * Math.sin(an) }); }
    e.poly(pts); e.dash([3, 4]); e.L(Q[0], Q[1]); e.dash();
  };
  RD.fibarc = (c, Q, d, e) => {
    const R = Math.hypot(Q[1].x - Q[0].x, Q[1].y - Q[0].y), an = Math.atan2(Q[0].y - Q[1].y, Q[0].x - Q[1].x);
    [0.382, 0.5, 0.618, 1, 1.618].forEach((L, i) => { c.strokeStyle = FCOL[(i + 1) % FCOL.length]; c.beginPath(); c.arc(Q[1].x, Q[1].y, R * L, an - Math.PI / 2, an + Math.PI / 2); c.stroke(); });
    c.strokeStyle = '#787b86'; e.dash([4, 4]); e.L(Q[0], Q[1]); e.dash();
  };
  RD.fibwedge = (c, Q, d, e) => {
    const R = Math.hypot(Q[1].x - Q[0].x, Q[1].y - Q[0].y), a1 = Math.atan2(Q[1].y - Q[0].y, Q[1].x - Q[0].x), a2 = Math.atan2(Q[2].y - Q[0].y, Q[2].x - Q[0].x);
    e.ray(Q[0], Q[1]); e.ray(Q[0], Q[2]);
    let dl = a2 - a1; while (dl > Math.PI) dl -= 2 * Math.PI; while (dl < -Math.PI) dl += 2 * Math.PI;
    [0.236, 0.382, 0.5, 0.618, 0.786, 1].forEach((L, i) => { c.strokeStyle = FCOL[(i + 1) % FCOL.length]; c.beginPath(); c.arc(Q[0].x, Q[0].y, R * L, a1, a1 + dl, dl < 0); c.stroke(); });
  };
  RD.gannbox = (c, Q, d, e, n) => {
    const x0 = Math.min(Q[0].x, Q[1].x), x1 = Math.max(Q[0].x, Q[1].x), y0 = Math.min(Q[0].y, Q[1].y), y1 = Math.max(Q[0].y, Q[1].y);
    c.globalAlpha = 0.06; c.fillRect(x0, y0, x1 - x0, y1 - y0); c.globalAlpha = 1; c.strokeRect(x0, y0, x1 - x0, y1 - y0);
    const fr = n ? Array.from({ length: n - 1 }, (_, i) => (i + 1) / n) : [0.25, 0.382, 0.5, 0.618, 0.75];
    c.globalAlpha = 0.55; fr.forEach((f) => { e.L({ x: x0 + (x1 - x0) * f, y: y0 }, { x: x0 + (x1 - x0) * f, y: y1 }); e.L({ x: x0, y: y0 + (y1 - y0) * f }, { x: x1, y: y0 + (y1 - y0) * f }); });
    c.globalAlpha = 1; e.L({ x: x0, y: y0 }, { x: x1, y: y1 }); e.L({ x: x0, y: y1 }, { x: x1, y: y0 });
  };
  RD.gannsq = (c, Q, d, e) => RD.gannbox(c, Q, d, e, 8);
  RD.gannsqf = (c, Q, d, e) => {
    const s = Math.max(Math.abs(Q[1].x - Q[0].x), Math.abs(Q[1].y - Q[0].y)), sx = Q[1].x >= Q[0].x ? 1 : -1, sy = Q[1].y >= Q[0].y ? 1 : -1;
    RD.gannbox(c, [Q[0], { x: Q[0].x + sx * s, y: Q[0].y + sy * s }], d, e, 8);
  };
  RD.gannfan = (c, Q, d, e) => {
    const dx = Q[1].x - Q[0].x || 1, s = (Q[1].y - Q[0].y) / dx, dir = dx >= 0 ? 1 : -1;
    [[1 / 8, '1x8'], [1 / 4, '1x4'], [1 / 3, '1x3'], [1 / 2, '1x2'], [1, '1x1'], [2, '2x1'], [3, '3x1'], [4, '4x1'], [8, '8x1']].forEach((m, i) => {
      c.strokeStyle = m[0] === 1 ? (d.color || DCOL) : FCOL[(i % 8)]; const X = 4000 * dir;
      e.L(Q[0], { x: Q[0].x + X, y: Q[0].y + s * m[0] * X });
      const lx = Q[0].x + dir * 90; c.fillStyle = c.strokeStyle; c.font = '10px sans-serif'; c.textBaseline = 'bottom'; c.fillText(m[1], lx, Q[0].y + s * m[0] * dir * 90 - 2);
    });
  };
  function labelPts(c, Q, labels, col) {
    c.font = '700 11px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    Q.forEach((q, i) => {
      if (!labels[i]) return; const up = (!Q[i - 1] || Q[i - 1].y > q.y) && (!Q[i + 1] || Q[i + 1].y > q.y);
      const y = q.y + (up ? -12 : 12); c.fillStyle = col; c.fillText(labels[i], q.x, y);
    });
    c.textAlign = 'left';
  }
  const ratio = (a, b, c2, d2) => { const den = Math.abs(a - b); return den ? (Math.abs(c2 - d2) / den).toFixed(3) : '-'; };
  function harmonic(cypher) {
    return (c, Q, d, e) => {
      const p = d.pts.map((q) => q.p); e.fillPoly([Q[0], Q[1], Q[2]], 0.1); e.fillPoly([Q[2], Q[3], Q[4]], 0.1);
      e.poly(Q); e.dash([4, 4]); e.L(Q[0], Q[2]); e.L(Q[1], Q[3]); e.L(Q[2], Q[4]); e.L(Q[0], Q[4]); e.dash();
      labelPts(c, Q, ['X', 'A', 'B', 'C', 'D'], d.color || DCOL);
      e.tag(ratio(p[0], p[1], p[2], p[1]), (Q[1].x + Q[2].x) / 2, (Q[1].y + Q[2].y) / 2, '#363c4e', '#fff', 'c');
      e.tag(ratio(p[1], p[2], p[3], p[2]), (Q[2].x + Q[3].x) / 2, (Q[2].y + Q[3].y) / 2, '#363c4e', '#fff', 'c');
      e.tag(ratio(p[2], p[3], p[4], p[3]), (Q[3].x + Q[4].x) / 2, (Q[3].y + Q[4].y) / 2, '#363c4e', '#fff', 'c');
      e.tag(ratio(p[0], p[1], p[4], p[1]), Q[4].x + 6, Q[4].y, '#363c4e');
    };
  }
  RD.xabcd = harmonic(false); RD.cypher = harmonic(true);
  RD.abcd = (c, Q, d, e) => {
    const p = d.pts.map((q) => q.p); e.poly(Q); e.dash([4, 4]); e.L(Q[0], Q[2]); e.L(Q[1], Q[3]); e.dash(); labelPts(c, Q, ['A', 'B', 'C', 'D'], d.color || DCOL);
    e.tag(ratio(p[0], p[1], p[2], p[1]), (Q[1].x + Q[2].x) / 2, (Q[1].y + Q[2].y) / 2, '#363c4e', '#fff', 'c');
    e.tag(ratio(p[1], p[2], p[3], p[2]), (Q[2].x + Q[3].x) / 2, (Q[2].y + Q[3].y) / 2, '#363c4e', '#fff', 'c');
  };
  RD.hs = (c, Q, d, e) => {
    e.fillPoly([Q[2], Q[3], Q[4]], 0.1); e.poly(Q);
    const k = (Q[4].y - Q[2].y) / ((Q[4].x - Q[2].x) || 1), yat = (x) => Q[2].y + k * (x - Q[2].x);
    c.setLineDash([5, 4]); e.L({ x: Q[0].x, y: yat(Q[0].x) }, { x: Q[6].x, y: yat(Q[6].x) }); e.dash();
    labelPts(c, Q, ['', 'Left shoulder', '', 'Head', '', 'Right shoulder', ''], d.color || DCOL);
  };
  RD.trianglep = (c, Q, d, e) => { e.fillPoly([Q[0], Q[2], Q[3], Q[1]], 0.08); e.L(Q[0], Q[2]); e.L(Q[1], Q[3]); e.dash([4, 4]); e.L(Q[0], Q[1]); e.L(Q[2], Q[3]); e.dash(); };
  RD.threedrives = (c, Q, d, e) => { e.poly(Q); labelPts(c, Q, ['', '1', 'A', '2', 'B', '3', 'C'], d.color || DCOL); };
  const wave = (labels) => (c, Q, d, e) => { e.poly(Q); labelPts(c, Q, labels, d.color || DCOL); };
  RD.impulse = wave(['', '1', '2', '3', '4', '5']); RD.correction = wave(['', 'A', 'B', 'C']); RD.trianglewave = wave(['', 'A', 'B', 'C', 'D', 'E']);
  RD.doublecombo = wave(['', 'W', 'X', 'Y']); RD.triplecombo = wave(['', 'W', 'X', 'Y', 'X', 'Z']);
  RD.cyclic = (c, Q, d, e) => {
    const per = Q[1].x - Q[0].x; if (Math.abs(per) < 4) return;
    for (let k = -80; k <= 80; k++) { const x = Q[0].x + per * k; if (x < -2 || x > e.pw + 2) continue; e.L({ x, y: 0 }, { x, y: e.ph }); }
  };
  RD.timecycles = (c, Q, d, e) => {
    const per = Math.abs(Q[1].x - Q[0].x); if (per < 6) return; const ry = Math.max(20, Math.abs(Q[1].y - Q[0].y));
    for (let k = -40; k <= 40; k++) { const x0 = Q[0].x + per * k; if (x0 > e.pw + per || x0 + per < 0) continue; c.beginPath(); c.ellipse(x0 + per / 2, Q[0].y, per / 2, ry, 0, Math.PI, 2 * Math.PI); c.stroke(); }
  };
  RD.sine = (c, Q, d, e) => {
    const dx = Q[1].x - Q[0].x; if (Math.abs(dx) < 4) return; c.beginPath();
    for (let x = 0; x <= e.pw; x += 3) { const y = Q[0].y + (Q[1].y - Q[0].y) * Math.sin((x - Q[0].x) / dx * Math.PI / 2); if (x) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke();
  };
  function posDraw(c, Q, d, e) {
    const st = posStats(d), x0 = Math.min(Q[0].x, Q[1].x), w = Math.abs(Q[1].x - Q[0].x), a = Q[0], b = Q[1], s = Q[2];
    c.globalAlpha = 0.22; c.fillStyle = '#26a69a'; c.fillRect(x0, Math.min(a.y, b.y), w, Math.abs(b.y - a.y)); c.fillStyle = '#ef5350'; c.fillRect(x0, Math.min(a.y, s.y), w, Math.abs(s.y - a.y)); c.globalAlpha = 1;
    c.lineWidth = 1; c.strokeStyle = '#26a69a'; e.L({ x: x0, y: b.y }, { x: x0 + w, y: b.y }); c.strokeStyle = '#ef5350'; e.L({ x: x0, y: s.y }, { x: x0 + w, y: s.y }); c.strokeStyle = '#9aa4b2'; e.L({ x: x0, y: a.y }, { x: x0 + w, y: a.y });
    const cx = x0 + w / 2, dir = st.long ? 1 : -1;
    e.tag('Target: ' + sgn(st.tp - st.en) + f2(st.tp - st.en) + ' (' + sgn(st.tp - st.en) + f2(pctOf(st.en, st.tp)) + '%)  ' + fmt(st.reward), cx, b.y + (b.y < a.y ? -13 : 13), '#1b8a7f', '#fff', 'c');
    e.tag('Stop: ' + sgn(st.sl - st.en) + f2(st.sl - st.en) + ' (' + sgn(st.sl - st.en) + f2(pctOf(st.en, st.sl)) + '%)  -' + fmt(st.risk).replace('-', ''), cx, s.y + (s.y < a.y ? -13 : 13), '#c8433f', '#fff', 'c');
    const stat = st.status === 'target' ? 'Target hit +' + fmt(st.reward).replace('$', '$') : st.status === 'stop' ? 'Stopped -' + fmt(st.risk) : st.status === 'open' ? 'Open P&L ' + fmt(st.open) : 'Not entered yet';
    e.tag(stat + '  |  Qty ' + st.units + ' oz  |  R:R ' + st.rr.toFixed(2), cx, a.y, '#363c4e', '#fff', 'c');
    void dir;
  }
  RD.longpos = posDraw; RD.shortpos = posDraw;
  RD.forecast = (c, Q, d, e) => {
    e.dash([5, 4]); e.L(Q[0], Q[1]); e.dash(); c.fillStyle = d.color || DCOL; arrowHead(c, Q[0], Q[1], 9);
    const dp = d.pts[1].p - d.pts[0].p; e.tag(sgn(dp) + f2(dp) + ' (' + sgn(dp) + f2(pctOf(d.pts[0].p, d.pts[1].p)) + '%)  ' + Math.round(t2l(d.pts[1].t) - t2l(d.pts[0].t)) + ' bars', Q[1].x + 8, Q[1].y, '#363c4e');
  };
  RD.barspattern = (c, Q, d, e) => {
    let i0 = Math.round(Math.min(t2l(d.pts[0].t), t2l(d.pts[1].t))), i1 = Math.round(Math.max(t2l(d.pts[0].t), t2l(d.pts[1].t)));
    i0 = Math.max(0, i0); i1 = Math.min(HIST.length - 1, i1); if (i1 < i0) return;
    const x0 = xl(i0), x1 = xl(i1); c.globalAlpha = 0.12; c.fillRect(x0 - 3, 0, x1 - x0 + 6, e.ph); c.globalAlpha = 1;
    const l2 = t2l(d.pts[2].t), off = d.pts[2].p - HIST[i0].close, bw = Math.max(2, ((xl(1) - xl(0)) || 8) * 0.6);
    for (let i = i0; i <= i1; i++) {
      const b = HIST[i], x = xl(l2 + (i - i0)), yo = yp(b.open + off), yc = yp(b.close + off), yh = yp(b.high + off), yl = yp(b.low + off); if (x == null || yo == null) continue;
      const col = b.close >= b.open ? '#26a69a' : '#ef5350'; c.strokeStyle = col; c.fillStyle = col; c.globalAlpha = 0.75;
      e.L({ x, y: yh }, { x, y: yl }); c.fillRect(x - bw / 2, Math.min(yo, yc), bw, Math.max(1, Math.abs(yc - yo))); c.globalAlpha = 1;
    }
  };
  RD.projection = (c, Q, d, e) => { const v = { x: Q[1].x - Q[0].x, y: Q[1].y - Q[0].y }, E2 = { x: Q[2].x + v.x, y: Q[2].y + v.y }; e.L(Q[0], Q[1]); e.dash([5, 4]); e.L(Q[2], E2); e.dash(); e.fillPoly([Q[0], Q[1], E2, Q[2]], 0.06); };
  RD.avwap = (c, Q, d, e) => {
    const i0 = Math.max(0, Math.ceil(t2l(d.pts[0].t))); let pv = 0, vv = 0; const pts = [];
    for (let i = i0; i < HIST.length; i++) { const b = HIST[i], v = b.volume || 1; pv += (b.high + b.low + b.close) / 3 * v; vv += v; const x = xl(i), y = yp(pv / vv); if (x != null && y != null) pts.push({ x, y }); }
    if (pts.length > 1) e.poly(pts); c.fillStyle = d.color || DCOL; c.beginPath(); c.arc(Q[0].x, Q[0].y, 4, 0, 6.3); c.fill();
  };
  function volProf(e, i0, i1, x0, maxW, d) {
    const c = e.c; i0 = Math.max(0, i0); i1 = Math.min(HIST.length - 1, i1); if (i1 < i0) return;
    let lo = 1e9, hi = -1e9; for (let i = i0; i <= i1; i++) { lo = Math.min(lo, HIST[i].low); hi = Math.max(hi, HIST[i].high); }
    const rows = 30, step = (hi - lo) / rows || 1, up = new Array(rows).fill(0), dn = new Array(rows).fill(0);
    for (let i = i0; i <= i1; i++) { const b = HIST[i], r = Math.max(0, Math.min(rows - 1, Math.floor(((b.high + b.low + b.close) / 3 - lo) / step))); (b.close >= b.open ? up : dn)[r] += b.volume || 1; }
    let mx = 0, poc = 0; for (let r = 0; r < rows; r++) if (up[r] + dn[r] > mx) { mx = up[r] + dn[r]; poc = r; }
    for (let r = 0; r < rows; r++) {
      const ya = yp(lo + (r + 1) * step), yb = yp(lo + r * step); if (ya == null || yb == null) continue; const h = Math.max(1, yb - ya - 1), wu = up[r] / mx * maxW, wd = dn[r] / mx * maxW;
      c.globalAlpha = r === poc ? 0.75 : 0.4; c.fillStyle = '#4f8cff'; c.fillRect(x0, ya, wu, h); c.fillStyle = '#ff9f43'; c.fillRect(x0 + wu, ya, wd, h); c.globalAlpha = 1;
    }
    const py = yp(lo + (poc + 0.5) * step); if (py != null) { c.strokeStyle = '#f23645'; e.dash([4, 3]); e.L({ x: x0, y: py }, { x: e.pw, y: py }); e.dash(); }
  }
  RD.volprofile = (c, Q, d, e) => { const x0 = Math.min(Q[0].x, Q[1].x), x1 = Math.max(Q[0].x, Q[1].x); c.globalAlpha = 0.07; c.fillRect(x0, 0, x1 - x0, e.ph); c.globalAlpha = 1; volProf(e, Math.round(Math.min(t2l(d.pts[0].t), t2l(d.pts[1].t))), Math.round(Math.max(t2l(d.pts[0].t), t2l(d.pts[1].t))), x0, Math.max(40, (x1 - x0) * 0.8), d); };
  RD.avolprofile = (c, Q, d, e) => { volProf(e, Math.round(t2l(d.pts[0].t)), HIST.length - 1, Q[0].x, 140, d); e.L({ x: Q[0].x, y: 0 }, { x: Q[0].x, y: e.ph }); };
  function measure(box, vert, horiz) {
    return (c, Q, d, e) => {
      const a = d.pts[0], b = d.pts[1], up = b.p >= a.p, col = up ? '#2962ff' : '#ef5350', x0 = Math.min(Q[0].x, Q[1].x), x1 = Math.max(Q[0].x, Q[1].x), y0 = Math.min(Q[0].y, Q[1].y), y1 = Math.max(Q[0].y, Q[1].y);
      c.strokeStyle = col; c.fillStyle = col;
      if (box) { c.globalAlpha = 0.14; c.fillRect(x0, y0, x1 - x0, y1 - y0); c.globalAlpha = 1; }
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      if (vert) { e.L({ x: mx, y: Q[0].y }, { x: mx, y: Q[1].y }); arrowHead(c, { x: mx, y: Q[0].y }, { x: mx, y: Q[1].y }, 8); if (!box) { c.globalAlpha = 0.14; c.fillRect(x0, y0, x1 - x0, y1 - y0); c.globalAlpha = 1; } }
      if (horiz) { e.L({ x: Q[0].x, y: my }, { x: Q[1].x, y: my }); arrowHead(c, { x: Q[0].x, y: my }, { x: Q[1].x, y: my }, 8); if (!vert) { e.L({ x: x0, y: y0 }, { x: x0, y: y1 }); e.L({ x: x1, y: y0 }, { x: x1, y: y1 }); } }
      const dp = b.p - a.p, bars = Math.round(t2l(b.t) - t2l(a.t)), parts = [];
      if (vert) parts.push(sgn(dp) + f2(dp) + ' (' + sgn(dp) + f2(pctOf(a.p, b.p)) + '%)');
      if (horiz) parts.push(bars + ' bars, ' + fdur(b.t - a.t));
      e.tag(parts.join('   '), mx, (vert ? (up ? y0 - 14 : y1 + 14) : y0 - 14), col, '#fff', 'c');
    };
  }
  RD.pricerange = measure(false, true, false); RD.daterange = measure(false, false, true); RD.datepricerange = measure(true, true, true);
  RD.brush = (c, Q, d, e) => { c.lineJoin = 'round'; c.lineCap = 'round'; e.poly(Q); };
  RD.highlighter = (c, Q, d, e) => { c.lineJoin = 'round'; c.lineCap = 'round'; c.lineWidth = 14; c.globalAlpha = 0.32; e.poly(Q); c.globalAlpha = 1; };
  RD.arrow = (c, Q, d, e) => { e.L(Q[0], Q[1]); c.fillStyle = d.color || DCOL; arrowHead(c, Q[0], Q[1], 11); };
  RD.arrowmark = (c, Q, d, e) => { c.lineWidth = 5; c.lineCap = 'round'; e.L(Q[0], Q[1]); c.fillStyle = d.color || DCOL; arrowHead(c, Q[0], Q[1], 18); };
  RD.arrowup = (c, Q, d, e) => { c.fillStyle = '#26a69a'; e.path([{ x: Q[0].x, y: Q[0].y }, { x: Q[0].x + 10, y: Q[0].y + 12 }, { x: Q[0].x + 4, y: Q[0].y + 12 }, { x: Q[0].x + 4, y: Q[0].y + 28 }, { x: Q[0].x - 4, y: Q[0].y + 28 }, { x: Q[0].x - 4, y: Q[0].y + 12 }, { x: Q[0].x - 10, y: Q[0].y + 12 }], true); c.fill(); };
  RD.arrowdown = (c, Q, d, e) => { c.fillStyle = '#ef5350'; e.path([{ x: Q[0].x, y: Q[0].y }, { x: Q[0].x + 10, y: Q[0].y - 12 }, { x: Q[0].x + 4, y: Q[0].y - 12 }, { x: Q[0].x + 4, y: Q[0].y - 28 }, { x: Q[0].x - 4, y: Q[0].y - 28 }, { x: Q[0].x - 4, y: Q[0].y - 12 }, { x: Q[0].x - 10, y: Q[0].y - 12 }], true); c.fill(); };
  RD.rect = (c, Q, d, e) => { const x = Math.min(Q[0].x, Q[1].x), y = Math.min(Q[0].y, Q[1].y), w = Math.abs(Q[1].x - Q[0].x), h = Math.abs(Q[1].y - Q[0].y); c.globalAlpha = 0.14; c.fillRect(x, y, w, h); c.globalAlpha = 1; c.strokeRect(x, y, w, h); };
  RD.rotrect = (c, Q, d, e) => {
    const vx = Q[1].x - Q[0].x, vy = Q[1].y - Q[0].y, L = Math.hypot(vx, vy) || 1, nx = -vy / L, ny = vx / L, w = (Q[2].x - Q[0].x) * nx + (Q[2].y - Q[0].y) * ny;
    const P4 = [Q[0], Q[1], { x: Q[1].x + nx * w, y: Q[1].y + ny * w }, { x: Q[0].x + nx * w, y: Q[0].y + ny * w }]; e.fillPoly(P4, 0.14); e.poly(P4, true);
  };
  RD.circle = (c, Q, d, e) => { const R = Math.hypot(Q[1].x - Q[0].x, Q[1].y - Q[0].y); c.beginPath(); c.arc(Q[0].x, Q[0].y, R, 0, 6.2832); c.globalAlpha = 0.12; c.fill(); c.globalAlpha = 1; c.stroke(); };
  RD.ellipse = (c, Q, d, e) => { const m = e.mid(Q[0], Q[1]); c.beginPath(); c.ellipse(m.x, m.y, Math.abs(Q[1].x - Q[0].x) / 2 + 0.1, Math.abs(Q[1].y - Q[0].y) / 2 + 0.1, 0, 0, 6.2832); c.globalAlpha = 0.12; c.fill(); c.globalAlpha = 1; c.stroke(); };
  RD.polyline = (c, Q, d, e) => { if (Q.length > 2) e.fillPoly(Q, 0.08); e.poly(Q); };
  RD.path = (c, Q, d, e) => { e.poly(Q); if (Q.length > 1) { c.fillStyle = d.color || DCOL; arrowHead(c, Q[Q.length - 2], Q[Q.length - 1], 10); } };
  RD.triangle = (c, Q, d, e) => { e.fillPoly(Q, 0.14); e.poly(Q, true); };
  RD.arc = (c, Q, d, e) => { const C = { x: 2 * Q[2].x - (Q[0].x + Q[1].x) / 2, y: 2 * Q[2].y - (Q[0].y + Q[1].y) / 2 }; c.beginPath(); c.moveTo(Q[0].x, Q[0].y); c.quadraticCurveTo(C.x, C.y, Q[1].x, Q[1].y); c.globalAlpha = 0.1; c.fill(); c.globalAlpha = 1; c.stroke(); };
  RD.curve = (c, Q, d, e) => { const m = e.mid(Q[0], Q[1]), vx = Q[1].x - Q[0].x, vy = Q[1].y - Q[0].y; c.beginPath(); c.moveTo(Q[0].x, Q[0].y); c.quadraticCurveTo(m.x - vy * 0.3, m.y + vx * 0.3, Q[1].x, Q[1].y); c.stroke(); };
  RD.doublecurve = (c, Q, d, e) => { const mx = (Q[0].x + Q[1].x) / 2; c.beginPath(); c.moveTo(Q[0].x, Q[0].y); c.bezierCurveTo(mx, Q[0].y, mx, Q[1].y, Q[1].x, Q[1].y); c.stroke(); };
  RD.text = (c, Q, d, e) => { c.font = '600 14px sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = d.color || DCOL; c.fillText(d.text || '', Q[0].x, Q[0].y); };
  RD.note = (c, Q, d, e) => { e.tag(d.text || '', Q[0].x, Q[0].y, d.color || DCOL, '#10141a', 'c'); };
  RD.comment = (c, Q, d, e) => { e.tag(d.text || '', Q[0].x + 4, Q[0].y - 14, '#363c4e'); c.beginPath(); c.arc(Q[0].x, Q[0].y, 3, 0, 6.3); c.fillStyle = d.color || DCOL; c.fill(); };
  RD.callout = (c, Q, d, e) => { e.L(Q[0], Q[1]); c.beginPath(); c.arc(Q[0].x, Q[0].y, 3.5, 0, 6.3); c.fillStyle = d.color || DCOL; c.fill(); e.tag(d.text || '', Q[1].x, Q[1].y, d.color || DCOL, '#10141a', 'c'); };
  RD.pricelabel = (c, Q, d, e) => { c.fillStyle = d.color || DCOL; arrowHead(c, { x: Q[0].x + 12, y: Q[0].y }, { x: Q[0].x, y: Q[0].y }, 8); e.tag(d.pts[0].p.toFixed(2), Q[0].x + 6, Q[0].y, d.color || DCOL, '#10141a'); };
  RD.pricenote = (c, Q, d, e) => { e.dash([3, 4]); e.L(Q[0], Q[1]); e.dash(); c.beginPath(); c.arc(Q[0].x, Q[0].y, 3, 0, 6.3); c.fillStyle = d.color || DCOL; c.fill(); e.tag((d.text || '') + '  ' + d.pts[0].p.toFixed(2), Q[1].x + 6, Q[1].y, d.color || DCOL, '#10141a'); };
  RD.pin = (c, Q, d, e) => { e.L(Q[0], { x: Q[0].x, y: Q[0].y - 14 }); c.beginPath(); c.arc(Q[0].x, Q[0].y - 20, 7, 0, 6.3); c.fillStyle = d.color || DCOL; c.fill(); if (d.text) e.tag(d.text, Q[0].x + 12, Q[0].y - 22, '#363c4e'); };
  RD.signpost = (c, Q, d, e) => { e.L({ x: Q[0].x, y: Q[0].y }, { x: Q[0].x, y: e.ph }); e.tag(d.text || '', Q[0].x + 2, Q[0].y, d.color || DCOL, '#10141a'); };
  RD.flagnote = (c, Q, d, e) => { e.L(Q[0], { x: Q[0].x, y: Q[0].y - 36 }); e.tag(d.text || '', Q[0].x + 1, Q[0].y - 30, d.color || DCOL, '#10141a'); };

  // ---------- drawing state / UI ----------
  function setDirty() { dVer++; }
  const magLabel = () => ['Magnet off', 'Weak magnet', 'Strong magnet'][(P.set && P.set.magnet) || 0];
  const dfavs = () => { const f = P.set && P.set.dfavs; return Array.isArray(f) ? f : ['trend', 'hline', 'rect', 'fib', 'longpos', 'shortpos']; };
  function setOvMode() {
    const ov = $('#ov'); if (!ov) return;
    ov.classList.toggle('act', dTool !== 'cur' || dGrab);
    document.querySelectorAll('[data-dt]').forEach((b) => b.classList.toggle('on', b.dataset.dt === dTool));
    const tb = $('#dt_tools'); if (tb) tb.classList.toggle('on', dTool !== 'cur');
    const dl = $('#dt_del'); if (dl) dl.classList.toggle('dis', dSel == null);
  }
  function pickTool(id) {
    dTool = id; dDraft = null; if (id !== 'cur') { dSel = null; dGrab = false; }
    const pn = $('#toolpanel'); if (pn) pn.classList.remove('on');
    setDirty(); drawTb(); drawFav();
  }
  function cycleMagnet() { P.set.magnet = ((P.set.magnet || 0) + 1) % 3; saveP(); drawTb(); toast(magLabel()); }
  function toggleFav(id) { let f = dfavs().slice(); f = f.includes(id) ? f.filter((x) => x !== id) : f.concat(id); P.set.dfavs = f; saveP(); drawFav(); drawToolPanel(); }
  function drawTb() {
    const el = $('#dtb'); if (!el) return;
    const mg = (P.set && P.set.magnet) || 0, d = dSel != null && S.draws ? S.draws[dSel] : null;
    el.innerHTML = '<button id="dt_tools" class="ib' + (dTool !== 'cur' ? ' on' : '') + '" title="Drawing tools">' + (dTool !== 'cur' && TOOL[dTool] ? TOOL[dTool].icon : UI.pencil) + '</button>' +
      '<button id="dt_cur" class="ib' + (dTool === 'cur' ? ' on' : '') + '" title="Cursor (Esc)">' + UI.cursor + '</button>' +
      '<button id="dt_mag" class="ib' + (mg ? ' on' : '') + '" title="' + magLabel() + '">' + UI.magnet + (mg ? '<span class="mgb">' + (mg === 1 ? 'W' : 'S') + '</span>' : '') + '</button>' +
      '<button id="dt_del" class="ib dis" title="Delete selected drawing">' + UI.trash + '</button>' +
      (d ? '<span class="dsw">' + DSW.map((cl) => '<i data-dc="' + cl + '" style="background:' + cl + '"' + (d.color === cl ? ' class="on"' : '') + '></i>').join('') + '<button class="ib wd" id="dt_w" title="Line width">' + (d.w || 1.5) + '</button></span>' : '');
    $('#dt_tools').onclick = (e) => { e.stopPropagation(); const p = $('#toolpanel'); drawToolPanel(); p.classList.toggle('on'); };
    $('#dt_cur').onclick = () => { pickTool('cur'); };
    $('#dt_mag').onclick = cycleMagnet;
    $('#dt_del').onclick = delSel;
    document.querySelectorAll('[data-dc]').forEach((b) => (b.onclick = () => { if (d) { d.color = b.dataset.dc; saveP(); setDirty(); drawTb(); } }));
    const w = $('#dt_w'); if (w) w.onclick = () => { d.w = d.w === 1.5 || !d.w ? 3 : d.w === 3 ? 1 : 1.5; saveP(); setDirty(); drawTb(); };
    setOvMode();
  }
  function drawToolPanel() {
    const pn = $('#toolpanel'); if (!pn) return; const fav = dfavs(); let cat = '', h = '';
    TOOLS.forEach((t) => {
      if (t[2] !== cat) { cat = t[2]; h += '<div class="tpcat">' + cat + '</div>'; }
      h += '<div class="tprow"><button class="tpn" data-pt="' + t[0] + '"><span class="tpi">' + TOOL[t[0]].icon + '</span>' + t[1] + '</button><button class="tps' + (fav.includes(t[0]) ? ' on' : '') + '" data-pf="' + t[0] + '" title="Favorite">' + (fav.includes(t[0]) ? UI.starOn : UI.star) + '</button></div>';
    });
    pn.innerHTML = h;
    pn.querySelectorAll('[data-pt]').forEach((b) => (b.onclick = () => pickTool(b.dataset.pt)));
    pn.querySelectorAll('[data-pf]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); const sc = pn.scrollTop; toggleFav(b.dataset.pf); pn.scrollTop = sc; }));
  }
  function drawFav() {
    const el = $('#favis'); if (!el) return; const fav = dfavs().filter((id) => TOOL[id]);
    el.style.display = fav.length ? '' : 'none';
    el.innerHTML = '<div class="grip" data-grip="fav" title="Drag to move">' + UI.grip + '</div>' + fav.map((id) => '<button class="ib' + (dTool === id ? ' on' : '') + '" data-dt="' + id + '" title="' + TOOL[id].name + '">' + TOOL[id].icon + '</button>').join('');
    el.querySelectorAll('[data-dt]').forEach((b) => (b.onclick = () => pickTool(dTool === b.dataset.dt ? 'cur' : b.dataset.dt)));
    placeMovable('fav'); bindGrip(el.querySelector('.grip'), el, 'fav');
  }
  function delSel() {
    if (dSel == null || !S.draws || !S.draws[dSel]) return;
    S.draws.splice(dSel, 1); dSel = null; dGrab = false; saveP(); setDirty(); drawTb();
  }

  // ---- movable islands ----
  function placeMovable(key) {
    const el = key === 'fav' ? $('#favis') : key === 'note' ? $('#qnote') : $('.island'), wrap = $('#chartwrap'); if (!el || !wrap) return;
    const p = P.set && P.set.pos && P.set.pos[key]; if (!p) return;
    const W = wrap.clientWidth, H = wrap.clientHeight, w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = Math.max(0, Math.min(W - w, p.fx * W)) + 'px'; el.style.top = Math.max(0, Math.min(H - h, p.fy * H)) + 'px';
    el.style.right = 'auto'; el.style.bottom = 'auto'; el.style.transform = 'none';
  }
  function bindGrip(g, el, key) {
    if (!g) return; let st = null;
    g.onpointerdown = (e) => { e.preventDefault(); e.stopPropagation(); const r = el.getBoundingClientRect(); st = { dx: e.clientX - r.left, dy: e.clientY - r.top }; try { g.setPointerCapture(e.pointerId); } catch (x) {} };
    g.onpointermove = (e) => {
      if (!st) return; const wr = $('#chartwrap').getBoundingClientRect();
      const x = Math.max(0, Math.min(wr.width - el.offsetWidth, e.clientX - wr.left - st.dx)), y = Math.max(0, Math.min(wr.height - el.offsetHeight, e.clientY - wr.top - st.dy));
      el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto'; el.style.transform = 'none';
    };
    g.onpointerup = g.onpointercancel = () => {
      if (!st) return; st = null; const wr = $('#chartwrap'); P.set.pos = P.set.pos || {};
      P.set.pos[key] = { fx: parseFloat(el.style.left) / wr.clientWidth, fy: parseFloat(el.style.top) / wr.clientHeight }; saveP();
    };
    g.ondblclick = () => { if (P.set.pos) delete P.set.pos[key]; saveP(); el.style.left = el.style.top = el.style.right = el.style.bottom = el.style.transform = ''; };
  }

  // ---------- painting ----------
  function paintOne(ctx, d, sel, pw, ph, hit) {
    const r = RD[d.type]; if (!r) return;
    const Q = d.pts.map(proj); if (!Q.length || Q.some((q) => !q)) return;
    const col = d.color || DCOL, e = mkEnv(ctx, pw, ph, d);
    ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = hit ? 12 : (d.w || 1.5) + (sel ? 0.5 : 0); ctx.setLineDash([]); ctx.lineJoin = 'round'; ctx.globalAlpha = 1;
    try { r(ctx, Q, d, e); } catch (x) { /* a bad drawing must never break the chart */ }
    ctx.restore();
    if (!hit && e.post.length) { ctx.save(); e.post.forEach((f) => { try { f(); } catch (x) {} }); ctx.restore(); }
    if (sel && !hit && d.type !== 'brush' && d.type !== 'highlighter') {
      ctx.save(); ctx.fillStyle = '#fff'; ctx.strokeStyle = col; ctx.lineWidth = 2;
      Q.slice(0, 14).forEach((q) => { ctx.beginPath(); ctx.arc(q.x, q.y, 5, 0, 6.3); ctx.fill(); ctx.stroke(); }); ctx.restore();
    }
  }
  function draftPts() {
    const d = dDraft; if (!d) return null; const pts = d.pts.slice(), cur = d.cur || pts[pts.length - 1];
    if (d.n > 0) { while (pts.length < d.n) pts.push(cur); } else if (!(d.n === -1)) pts.push(cur);
    return pts;
  }
  function ovDraw() {
    const cv = $('#ov'), wrap = $('#chartwrap'); if (!cv || !wrap || !chart || !series || !S) return;
    const ps = plotSize(), dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(ps.w * dpr) || cv.height !== Math.round(ps.h * dpr)) { cv.width = Math.round(ps.w * dpr); cv.height = Math.round(ps.h * dpr); cv.style.width = ps.w + 'px'; cv.style.height = ps.h + 'px'; }
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, ps.w, ps.h);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, ps.pw, ps.ph); ctx.clip();
    if (!S.hideMk) (S.hist || []).forEach((h) => {
      const a = proj({ t: h.t0 * 60, p: h.entry }), b = proj({ t: h.t1 * 60, p: h.exit }); if (!a || !b) return;
      ctx.strokeStyle = h.pnl >= 0 ? '#26a69a' : '#ef5350'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    });
    (S.draws || []).forEach((d, i) => paintOne(ctx, d, i === dSel, ps.pw, ps.ph));
    const dp = draftPts(); if (dp) paintOne(ctx, { type: dDraft.type, pts: dp, color: DCOL, w: 1.5, text: '' }, true, ps.pw, ps.ph);
    ctx.restore();
    ovExtras(ctx, ps);
  }
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function tlabel(tsec, withDate) {
    const d = new Date(tsec * 1000), hm = String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
    return withDate ? d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + hm : hm;
  }
  const ovOwns = () => dTool !== 'cur' || dGrab;
  const showXh = () => mx != null && (ovOwns() || (HIST.length && mx > xl(HIST.length - 1) + 2));
  function ovExtras(ctx, ps) {
    const n = HIST.length; if (!n) return;
    ctx.font = '11px -apple-system,Segoe UI,Roboto,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // time labels to the right of the last real candle (the chart draws none there)
    const x0 = xl(n - 1), x1 = xl(n), bp = x0 != null && x1 != null ? x1 - x0 : 0;
    if (bp > 0.5) {
      let k = 1; const ks = [1, 2, 3, 5, 10, 15, 30, 60, 120, 240]; for (const c of ks) { k = c; if (c * bp >= 78) break; }
      const unit = k * S.tf, lastM = HIST[n - 1].time / 60; let t = (Math.floor(lastM / unit) + 1) * unit, prevDay = Math.floor(lastM / 1440), guard = 0;
      ctx.fillStyle = '#9aa4b2';
      while (guard++ < 60) {
        const x = xl(t2l(t * 60)); if (x == null || x > ps.pw - 14) break;
        if (x > x0 + 28) { const dk = Math.floor(t / 1440); ctx.fillText(tlabel(t * 60, dk !== prevDay), x, ps.ph + 14); prevDay = dk; }
        t += unit;
      }
    }
    // own crosshair readout while a drawing is selected / a tool is active, and over the empty future area
    if (showXh() && mx >= 0 && mx <= ps.pw && my >= 0 && my <= ps.ph) {
      const l = chart.timeScale().coordinateToLogical(mx), p = series.coordinateToPrice(my);
      const own = ovOwns();
      if (own) { ctx.save(); ctx.strokeStyle = 'rgba(154,164,178,.55)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(Math.round(mx) + .5, 0); ctx.lineTo(Math.round(mx) + .5, ps.ph); ctx.moveTo(0, Math.round(my) + .5); ctx.lineTo(ps.pw, Math.round(my) + .5); ctx.stroke(); ctx.restore(); }
      const pill = (txt, cx, cy) => { const w = ctx.measureText(txt).width + 12; ctx.fillStyle = '#363c4e'; ctx.fillRect(cx - w / 2, cy - 9, w, 18); ctx.fillStyle = '#e6edf3'; ctx.fillText(txt, cx, cy); };
      if (l != null) { const lab = tlabel(l2t(l), true); const w = ctx.measureText(lab).width + 12; pill(lab, Math.max(w / 2, Math.min(ps.pw - w / 2, mx)), ps.ph + 14); }
      if (p != null && own) pill(p.toFixed(2), ps.pw + (ps.w - ps.pw) / 2, my);
    }
  }
  function ovLoop() {
    ovRaf = 0;
    if (!chart || !series || !S || !$('#ov')) return;
    try {
      const lr = chart.timeScale().getVisibleLogicalRange(), n = HIST.length, c = n ? HIST[n - 1].close : 0, w = $('#chartwrap'), man = isManual();
      if (!man && !series.priceScale().options().autoScale) { man = true; viewTouched = true; }
      const ab = $('#c_auto'); if (ab) ab.classList.toggle('on', !man);
      const sig = [lr ? lr.from.toFixed(3) + lr.to.toFixed(3) : '', series.priceToCoordinate(c), series.priceToCoordinate(c + 10), S.cur, n, w.clientWidth, w.clientHeight, dVer, dSel, S.tf, S.hideMk ? 1 : 0, showXh() ? Math.round(mx) + ',' + Math.round(my) : ''].join('|');
      if (sig !== ovSig) { ovSig = sig; ovDraw(); }
    } catch (e) {}
    ovRaf = requestAnimationFrame(ovLoop);
  }

  // ---------- chart view: remember it, reset it only on request ----------
  let savedView = null, viewTouched = false;
  function setPR(top, bot) { const sp = (top - bot) / 0.78; try { series.priceScale().setVisibleRange({ from: bot - 0.14 * sp, to: top + 0.08 * sp }); } catch (e) {} }
  function getPR() {
    try { const vr = series.priceScale().getVisibleRange(); if (vr && isFinite(vr.from) && isFinite(vr.to) && vr.to > vr.from) return { top: vr.to, bot: vr.from }; } catch (e) {}
    const ph = plotSize().ph; return { top: series.coordinateToPrice(ph * 0.08), bot: series.coordinateToPrice(ph * 0.86) };
  }

  const isManual = () => man;
  function captureView() {
    if (!chart || !series || !S || !HIST.length) return null;
    try {
      const lr = chart.timeScale().getVisibleLogicalRange(); if (!lr) return null;
      return { key: S.vid, tfSec: S.tf * 60, edgeT: l2t(lr.to), span: lr.to - lr.from, manual: isManual(), top: getPR().top, bot: getPR().bot, k: PZ.k, off: PZ.off, touched: viewTouched };
    } catch (e) { return null; }
  }
  function applyView(v) {
    const l1 = t2l(v.edgeT), span = Math.max(10, Math.min(900, v.span * (v.tfSec || S.tf * 60) / (S.tf * 60))); man = !!v.manual;
    chart.timeScale().setVisibleLogicalRange({ from: l1 - span, to: l1 });
    if (v.manual && v.top != null && v.bot != null && isFinite(v.top) && isFinite(v.bot) && v.top > v.bot) { try { series.priceScale().setVisibleRange({ from: v.bot, to: v.top }); } catch (e) {} }
    else { PZ.k = v.k || 1; PZ.off = v.off || 0; try { series.priceScale().applyOptions({ autoScale: true }); } catch (e) {} }
    viewTouched = !!v.touched;
  }
  function setManual(on) {
    man = on;
    try { series.priceScale().applyOptions({ autoScale: !on }); } catch (e) {}
    if (!on) { PZ.k = 1; PZ.off = 0; setDirty(); }
  }
  function resetView() {
    viewTouched = false; setManual(false); PZ.k = 1; PZ.off = 0;
    chart.timeScale().applyOptions({ barSpacing: 9 });
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, HIST.length - 60), to: HIST.length + 6 });
    setDirty(); toast('Chart reset');
  }

  // ---------- hit testing: render each drawing thick on an offscreen canvas ----------
  let hcv = null;
  function hitTest(x, y) {
    const ds = S.draws || []; if (!ds.length) return null;
    if (dSel != null && ds[dSel] && !/^(brush|highlighter)$/.test(ds[dSel].type)) {
      const Q = ds[dSel].pts.map(proj);
      for (let k = 0; k < Q.length; k++) if (Q[k] && Math.hypot(x - Q[k].x, y - Q[k].y) < 14) return { i: dSel, h: k };
    }
    const ps = plotSize(); hcv = hcv || document.createElement('canvas');
    if (hcv.width !== Math.round(ps.w) || hcv.height !== Math.round(ps.h)) { hcv.width = Math.round(ps.w); hcv.height = Math.round(ps.h); }
    const hc = hcv.getContext('2d', { willReadFrequently: true });
    for (let i = ds.length - 1; i >= 0; i--) {
      hc.setTransform(1, 0, 0, 1, 0, 0); hc.clearRect(0, 0, hcv.width, hcv.height);
      paintOne(hc, ds[i], false, ps.pw, ps.ph, true);
      if (x >= 0 && y >= 0 && x < hcv.width && y < hcv.height && hc.getImageData(Math.round(x), Math.round(y), 1, 1).data[3] > 0) return { i, h: -1 };
    }
    return null;
  }
  function localXY(e) { const r = $('#chartwrap').getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function inPlot(x, y) { const ps = plotSize(); return x >= 0 && y >= 0 && x <= ps.pw && y <= ps.ph; }
  const isPos = (d) => d.type === 'longpos' || d.type === 'shortpos';

  // ---------- creating drawings ----------
  function addDraw(o) {
    S.draws = S.draws || []; o.color = o.color || DCOL; o.w = o.w || 1.5; S.draws.push(o); dSel = S.draws.length - 1; saveP();
    dTool = 'cur'; dGrab = touchy; setDirty(); drawTb(); drawFav(); setOvMode();
  }
  function askText(def) { const t = window.prompt('Text', def || ''); return t == null ? null : t.trim(); }
  function finishDraft() {
    const d = dDraft; dDraft = null; if (!d) return;
    let pts = d.pts.map((q) => ({ t: q.t, p: q.p }));
    const need = d.n > 0 ? d.n : 2;
    if (pts.length < need) { dTool = 'cur'; setDirty(); drawTb(); drawFav(); setOvMode(); return; }
    const o = { type: d.type, pts };
    if (d.type === 'callout' || d.type === 'pricenote') { const t = askText(''); if (t == null) { dTool = 'cur'; setDirty(); drawTb(); setOvMode(); return; } o.text = t; }
    addDraw(o);
  }
  function startDraft(u, e, ov) {
    const tl = TOOL[dTool], n = tl.n;
    if (n === 1) {
      if (dTool === 'longpos' || dTool === 'shortpos') {
        const dir = dTool === 'longpos' ? 1 : -1, dist = defaultDist(), t1 = l2t(u.l + 30);
        addDraw({ type: dTool, pts: [{ t: u.t, p: u.p }, { t: t1, p: +(u.p + dir * dist * Math.max(1, P.plan.risk.minRR)).toFixed(2) }, { t: t1, p: +(u.p - dir * dist).toFixed(2) }] }); return;
      }
      const o = { type: dTool, pts: [{ t: u.t, p: u.p }] };
      if (TEXTY[dTool]) { const t = askText(''); if (!t) { dTool = 'cur'; drawTb(); setOvMode(); return; } o.text = t; }
      addDraw(o); return;
    }
    dDraft = { type: dTool, n, pts: [u], cur: u, sx: e.clientX, sy: e.clientY, fresh: true }; setDirty();
    try { ov.setPointerCapture(e.pointerId); } catch (x) {}
  }
  function bindDraw() {
    const ov = $('#ov'), wrap = $('#chartwrap');
    ov.addEventListener('pointerdown', (e) => {
      const { x, y } = localXY(e); e.preventDefault(); e.stopPropagation();
      if (dTool !== 'cur') {
        const u = unproj(x, y, true); if (!u || !inPlot(x, y)) return;
        if (!dDraft) { startDraft(u, e, ov); return; }
        if (dDraft.n === 0) {
          const q = proj(dDraft.pts[dDraft.pts.length - 1]); if (q && Math.hypot(q.x - x, q.y - y) < 9) { finishDraft(); return; }
          dDraft.pts.push(u);
        } else { dDraft.pts.push(u); if (dDraft.pts.length >= dDraft.n) { finishDraft(); return; } }
        dDraft.fresh = false; dDraft.cur = u; setDirty(); return;
      }
      // pick up / reshape the selected drawing
      const h = hitTest(x, y);
      if (!h) { dSel = null; dGrab = false; setDirty(); drawTb(); setOvMode(); return; }
      dSel = h.i; const d = S.draws[h.i], u = unproj(x, y);
      dDrag = { i: h.i, h: h.h, l0: u ? u.l : 0, p0: u ? u.p : 0, orig: d.pts.map((q) => ({ t: q.t, p: q.p })), moved: false };
      try { ov.setPointerCapture(e.pointerId); } catch (x2) {} setDirty(); drawTb();
    });
    ov.addEventListener('pointermove', (e) => {
      const { x, y } = localXY(e);
      if (dDraft) {
        const u = unproj(x, y, true); if (!u) return; dDraft.cur = u;
        if (dDraft.n === -1 && e.buttons) { const q = proj(dDraft.pts[dDraft.pts.length - 1]); if (!q || Math.hypot(q.x - x, q.y - y) > 3) dDraft.pts.push(u); }
        setDirty(); return;
      }
      if (dDrag) {
        const u = unproj(x, y, dDrag.h >= 0); if (!u) return; const d = S.draws[dDrag.i]; if (!d) return; dDrag.moved = true;
        if (dDrag.h >= 0) {
          if (isPos(d)) {
            if (dDrag.h === 0) d.pts[0] = { t: u.t, p: u.p };
            else if (dDrag.h === 1) { d.pts[1] = { t: u.t, p: u.p }; d.pts[2] = { t: u.t, p: d.pts[2].p }; }
            else d.pts[2] = { t: d.pts[1].t, p: u.p };
          } else d.pts[dDrag.h] = { t: u.t, p: u.p };
        } else { const dl = u.l - dDrag.l0, dp = u.p - dDrag.p0; d.pts = dDrag.orig.map((q) => ({ t: l2t(t2l(q.t) + dl), p: Math.round((q.p + dp) * 100) / 100 })); }
        setDirty();
      }
    });
    const up = (e) => {
      if (dDraft && dDraft.fresh) {
        dDraft.fresh = false;
        if (dDraft.n === -1) { finishDraft(); return; }
        if (dDraft.pts.length === 1 && Math.hypot(e.clientX - dDraft.sx, e.clientY - dDraft.sy) > 8) {
          dDraft.pts.push(dDraft.cur); if (dDraft.n > 0 && dDraft.pts.length >= dDraft.n) finishDraft();
        }
        return;
      }
      if (dDrag) { const m = dDrag.moved; dDrag = null; if (m) saveP(); setDirty(); }
    };
    ov.addEventListener('pointerup', up); ov.addEventListener('pointercancel', () => { dDrag = null; });
    ov.addEventListener('dblclick', () => { if (dDraft && dDraft.n === 0) finishDraft(); });
    // cursor mode with a mouse: click a drawing to pick it up
    wrap.addEventListener('pointerdown', (e) => {
      if (e.button === 2 || e.target.closest('#dtb,#favis,#toolpanel,#qnote,.island,.hd,.spw,#c_auto,#ctxm')) return;
      if (dTool !== 'cur' || dGrab || e.target === ov) return;
      const { x, y } = localXY(e), h = (S.draws || []).length ? hitTest(x, y) : null;
      if (!h) { if (dSel != null) { dSel = null; setDirty(); drawTb(); } return; }
      dSel = h.i; dGrab = e.pointerType !== 'mouse'; setOvMode(); setDirty(); drawTb();
      if (e.pointerType === 'mouse') {
        e.preventDefault(); e.stopImmediatePropagation();
        const u = unproj(x, y), d = S.draws[h.i];
        dDrag = { i: h.i, h: h.h, l0: u ? u.l : 0, p0: u ? u.p : 0, orig: d.pts.map((q) => ({ t: q.t, p: q.p })), moved: false };
        try { ov.setPointerCapture(e.pointerId); } catch (x2) {}
      }
    }, true);
    // dragging the plot or the price axis vertically unlocks the price scale (stays until you reset it)
    wrap.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('#dtb,#favis,#toolpanel,#qnote,.island,.hd,.spw,#c_auto,#ctxm') || e.target === ov) return;
      viewTouched = true;
      const rr = wrap.getBoundingClientRect(); let pw2 = 56; try { pw2 = chart.priceScale('right').width(); } catch (x2) {}
      const onAxis = e.clientX - rr.left >= rr.width - pw2 && e.clientY - rr.top < rr.height - 26;
      gs = onAxis ? { y: e.clientY, x: e.clientX } : null;
    }, true);
    if (!docBound) {
      docBound = true;
      document.addEventListener('pointermove', (e) => { if (gs && (e.buttons & 1) && Math.abs(e.clientY - gs.y) > 3) { gs = null; viewTouched = true; if (chart && !isManual()) { man = true; } } });
      document.addEventListener('pointerup', () => { gs = null; });
    }
    // double-click the price axis: back to auto-fit (TradingView)
    wrap.addEventListener('dblclick', (e) => {
      const rr = wrap.getBoundingClientRect(); let pw2 = 56; try { pw2 = chart.priceScale('right').width(); } catch (x2) {}
      if (e.clientX - rr.left >= rr.width - pw2 && e.clientY - rr.top < rr.height - 26 && chart) { setManual(false); series.priceScale().applyOptions({ autoScale: true }); setDirty(); }
    }, true);
    wrap.addEventListener('pointermove', (e) => { const q = localXY(e); mx = q.x; my = q.y; }, true);
    wrap.addEventListener('pointerleave', () => { mx = null; my = null; }, true);
    // wheel over the price axis: zoom the price scale (shift = pan up/down)
    wrap.addEventListener('wheel', (e) => {
      if (!chart || !series) return;
      const r = wrap.getBoundingClientRect(); let pw = 56; try { pw = chart.priceScale('right').width(); } catch (x2) {}
      if (e.clientX - r.left < r.width - pw) { viewTouched = true; return; }
      e.preventDefault(); e.stopPropagation(); viewTouched = true;
      // mouse wheel = big rare clicks; trackpad = many tiny events plus momentum. Accumulate and apply once per frame.
      const raw = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const pad = e.deltaMode === 0 && Math.abs(e.deltaY) < 50 && !Number.isInteger(e.deltaY / 100);
      wAcc.dy += Math.max(-40, Math.min(40, raw)) * (pad ? 0.35 : 1); wAcc.shift = e.shiftKey;
      if (!wAcc.raf) wAcc.raf = requestAnimationFrame(() => {
        wAcc.raf = 0; const dy = Math.max(-40, Math.min(40, wAcc.dy)); wAcc.dy = 0; if (!chart || !series || Math.abs(dy) < 0.05) return;
        if (isManual()) {
          const pr = getPR(), top = pr.top, bot = pr.bot;
          if (top != null && bot != null) {
            let c = (top + bot) / 2, hh = (top - bot) / 2;
            if (wAcc.shift) c -= dy * 0.0008 * (top - bot); else hh *= Math.exp(dy * 0.0016);
            try { series.priceScale().setVisibleRange({ from: c - hh, to: c + hh }); } catch (x3) {}
          }
        } else {
          if (wAcc.shift) PZ.off = Math.max(-3, Math.min(3, PZ.off - dy * 0.0008));
          else PZ.k = Math.max(0.15, Math.min(12, PZ.k * Math.exp(dy * 0.0016)));
          series.priceScale().applyOptions({ autoScale: true });
        }
        setDirty();
      });
    }, { capture: true, passive: false });
    wrap.addEventListener('pointerdown', (e) => { touchy = e.pointerType !== 'mouse'; }, true);
    // right-click menu
    wrap.addEventListener('contextmenu', (e) => { e.preventDefault(); const { x, y } = localXY(e); openCtx(x, y); });
    wrap.addEventListener('pointerdown', (e) => { if (!e.target.closest('#ctxm')) closeCtx(); }, true);
    wrap.addEventListener('pointerdown', (e) => { if (!e.target.closest('#toolpanel,#dt_tools')) { const p = $('#toolpanel'); if (p) p.classList.remove('on'); } }, true);
  }

  // ---------- right-click menu ----------
  function closeCtx() { const m = $('#ctxm'); if (m) m.classList.remove('on'); }
  function openCtx(x, y) {
    const m = $('#ctxm'); if (!m || !S) return;
    const nd = (S.draws || []).length, nh = (S.hist || []).length + (S.open ? 1 : 0);
    const items = [['reset', 'Reset chart view', 1], ['clrd', 'Remove all drawings' + (nd ? ' (' + nd + ')' : ''), nd],
      ['clrp', 'Remove position drawings', (S.draws || []).some(isPos)], ['mk', S.hideMk ? 'Show buy / sell markers' : 'Hide buy / sell markers', nh]];
    m.innerHTML = items.map((it) => '<button data-cx="' + it[0] + '"' + (it[2] ? '' : ' class="dis"') + '>' + it[1] + '</button>').join('');
    m.classList.add('on'); const w = $('#chartwrap'); m.style.left = Math.min(x, w.clientWidth - 220) + 'px'; m.style.top = Math.min(y, w.clientHeight - 170) + 'px';
    m.querySelectorAll('[data-cx]').forEach((b) => (b.onclick = () => {
      const k = b.dataset.cx; if (b.classList.contains('dis')) return; closeCtx();
      if (k === 'reset') resetView();
      else if (k === 'clrd') { if (confirm('Remove all drawings?')) { S.draws = []; dSel = null; dGrab = false; saveP(); setDirty(); drawTb(); setOvMode(); } }
      else if (k === 'clrp') { S.draws = (S.draws || []).filter((d) => !isPos(d)); dSel = null; dGrab = false; saveP(); setDirty(); drawTb(); setOvMode(); }
      else if (k === 'mk') { S.hideMk = !S.hideMk; saveP(); refreshMarkers(); }
    }));
  }

  // ---------- quick notes during a session ----------
  function noteModal() {
    pause();
    const list = (S.notes || []).slice(-3).reverse().map((n) => '<div class="muted sm">' + fdate(n.t).slice(5, 16) + ' &middot; ' + esc(n.text) + '</div>').join('');
    modal('<h3>Quick note</h3><p class="muted sm">Jot down anything that came to mind. It is saved with this session and does not replace your trade journal.</p><textarea id="qn_t" rows="4" placeholder="What did you notice?"></textarea>' +
      (list ? '<h4>Recent</h4>' + list : '') + '<div class="tbtns"><button class="ghost2" id="qn_c">Cancel</button><button class="buy" id="qn_s">Save</button></div>');
    setTimeout(() => { const t = $('#qn_t'); if (t) t.focus(); }, 50);
    $('#qn_c').onclick = closeModal;
    $('#qn_s').onclick = () => {
      const t = $('#qn_t').value.trim(); if (!t) { closeModal(); return; }
      S.notes = S.notes || []; S.notes.push({ t: E.t(S.cur), px: E.close(S.cur), text: t }); saveP(); closeModal(); refreshMarkers(); toast('Note saved');
    };
  }

  function saveQNote(text) {
    const t = String(text || '').trim(); if (!t || !S) return false;
    const n = { t: E.t(S.cur), px: E.close(S.cur), text: t, at: Date.now(), vid: S.vid, g: 1 };
    S.notes = S.notes || []; S.notes.push(n); P.qnotes = P.qnotes || []; P.qnotes.push(n); if (P.qnotes.length > 1000) P.qnotes.shift(); saveP(); return true;
  }
  function closeNote() {
    const el = $('#qnote'); if (!el) return; const ta = $('#qn_ta');
    if (ta && saveQNote(ta.value)) toast('Note saved');
    el.remove(); const b = $('#c_note'); if (b) b.classList.remove('on');
  }
  function toggleNote() {
    if (!S) return; if ($('#qnote')) { closeNote(); return; }
    const wrap = $('#chartwrap'); if (!wrap) return;
    const el = document.createElement('div'); el.id = 'qnote'; el.className = 'qnote';
    el.innerHTML = '<div class="grip" title="Drag to move">' + UI.grip + '</div><textarea id="qn_ta" rows="4" placeholder="Note. Enter saves, Shift+Enter new line, Esc closes"></textarea>';
    wrap.appendChild(el); const b = $('#c_note'); if (b) b.classList.add('on');
    bindGrip(el.querySelector('.grip'), el, 'note'); placeMovable('note');
    const ta = $('#qn_ta');
    ta.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (saveQNote(ta.value)) { ta.value = ''; ta.placeholder = 'Saved. Next note...'; } }
      else if (e.key === 'Escape') { e.preventDefault(); closeNote(); }
    });
    ['pointerdown', 'wheel'].forEach((ev) => ta.addEventListener(ev, (e) => e.stopPropagation()));
    setTimeout(() => ta.focus(), 30);
  }

  // ---------- keyboard shortcuts ----------
  let kbCapture = null;
  const clickEl = (s) => { const el = $(s); if (el) el.click(); };
  const ACTIONS = [
    ['next', 'Next candle', () => clickEl('#c_next')], ['play', 'Play / pause', () => clickEl('#c_play')], ['sesh', 'Next session', () => clickEl('#c_sess')],
    ['speed', 'Cycle playback speed', () => { speedI = (speedI + 1) % SPEEDS.length; const b = $('#c_speed'); if (b) b.innerHTML = SPEEDS[speedI] + 'x &#9662;'; if (timer) { pause(); play(); } toast('Speed ' + SPEEDS[speedI] + 'x'); }],
    ['buy', 'Buy', () => clickEl('#b_buy')], ['sell', 'Sell', () => clickEl('#b_sell')], ['close', 'Close trade', () => clickEl('#b_close')], ['stops', 'Edit SL / TP', () => clickEl('#b_edit')],
    ['end', 'End session', () => clickEl('#c_end')], ['hist', 'Session trades', () => clickEl('#c_hist')], ['ind', 'Indicators', () => clickEl('#c_ind')], ['note', 'Quick note', () => clickEl('#c_note')],
    ['reset', 'Reset chart view', () => { if (chart) resetView(); }], ['tools', 'Drawing tools list', () => clickEl('#dt_tools')], ['cursor', 'Cursor', () => { if (chart) pickTool('cur'); }],
    ['magnet', 'Cycle magnet', () => { if (chart) cycleMagnet(); }], ['del', 'Delete selected drawing', () => { if (chart) delSel(); }], ['clrd', 'Remove all drawings', () => { if (chart && (S.draws || []).length && confirm('Remove all drawings?')) { S.draws = []; dSel = null; dGrab = false; saveP(); setDirty(); drawTb(); setOvMode(); } }],
    ['tfup', 'Next timeframe up', () => { const i = TFS.findIndex((t) => t[0] === S.tf); if (i < TFS.length - 1) setTF(TFS[i + 1][0]); }], ['tfdn', 'Next timeframe down', () => { const i = TFS.findIndex((t) => t[0] === S.tf); if (i > 0) setTF(TFS[i - 1][0]); }],
  ].concat(TFS.map((t) => ['tf' + t[0], 'Timeframe ' + t[1], () => setTF(t[0])]))
    .concat([['tabReplay', 'Go to Replay', () => showTab('replay')], ['tabStats', 'Go to Stats', () => showTab('stats')], ['tabPlan', 'Go to Plan', () => showTab('plan')], ['tabSettings', 'Go to Settings', () => showTab('settings')]]);
  const KDEF = { next: 'ArrowRight', play: 'Space', sesh: 'Shift+ArrowRight', note: 'KeyN', reset: 'KeyR', del: 'Delete' };
  const keysMap = () => Object.assign({}, KDEF, (P && P.set && P.set.keys) || {});
  function comboOf(e) {
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
    return (e.ctrlKey || e.metaKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '') + e.code;
  }
  const comboLabel = (c) => (c ? c.split('+').map((p) => ({ ArrowRight: '\u2192', ArrowLeft: '\u2190', ArrowUp: '\u2191', ArrowDown: '\u2193', Space: 'Space' }[p] || p.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num '))).join(' + ') : 'Not set');
  function onKey(e) {
    if (kbCapture) {
      e.preventDefault(); e.stopPropagation(); const c = comboOf(e); if (!c) return;
      const id = kbCapture; kbCapture = null; P.set.keys = P.set.keys || {};
      if (c === 'Escape') { /* cancel */ } else if (c === 'Backspace' || c === 'Delete') P.set.keys[id] = '';
      else { const km = keysMap(); Object.keys(km).forEach((k) => { if (km[k] === c && k !== id) P.set.keys[k] = ''; }); P.set.keys[id] = c; }
      saveP(); renderSettings(); return;
    }
    if (!P || !P.plan) return;
    const tg = e.target && e.target.tagName; if (/INPUT|TEXTAREA|SELECT/.test(tg || '')) return;
    const mo = $('#modal'); if (mo && mo.classList.contains('on')) return;
    if (e.key === 'Escape') { if (chart) { dDraft = null; dTool = 'cur'; dSel = null; dGrab = false; closeCtx(); const p = $('#toolpanel'); if (p) p.classList.remove('on'); setDirty(); drawTb(); drawFav(); setOvMode(); } return; }
    if (e.key === 'Enter' && dDraft && dDraft.n === 0) { e.preventDefault(); finishDraft(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && chart && dSel != null) { e.preventDefault(); delSel(); return; }
    const c = comboOf(e); if (!c) return;
    const km = keysMap(), a = ACTIONS.find((x) => km[x[0]] === c); if (!a) return;
    const isTab = /^tab/.test(a[0]); if (!isTab && !(S && tab === 'replay' && chart)) return;
    e.preventDefault(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); a[2]();
  }
  function kbCardHtml() {
    const km = keysMap();
    return '<div class="card"><b>Keyboard shortcuts</b><p class="muted sm">For laptops. Click a button, then press the key (or a combination) you want. Backspace clears one. Esc cancels. Shortcuts work on the Replay screen when no pop-up is open.</p>' +
      ACTIONS.map((a) => '<div class="kbrow"><span>' + a[1] + '</span><button class="kbb' + (kbCapture === a[0] ? ' cap' : '') + '" data-kb="' + a[0] + '">' + (kbCapture === a[0] ? 'Press a key\u2026' : comboLabel(km[a[0]])) + '</button></div>').join('') +
      '<button class="btn ghost" id="kb_reset" style="margin-top:12px">Reset shortcuts to default</button></div>';
  }
  function bindKbUI() {
    document.querySelectorAll('[data-kb]').forEach((b) => (b.onclick = () => { kbCapture = b.dataset.kb; renderSettings(); }));
    const r = $('#kb_reset'); if (r) r.onclick = () => { P.set.keys = {}; kbCapture = null; saveP(); renderSettings(); };
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
    if (S.hideMk) ms.length = 0;
    try { mkApi.setMarkers(ms); } catch (e) {}
    setDirty();
  }
  function recordHist(t, sc) {
    S.hist = S.hist || [];
    const rec = { id: t.id, t0: t.t0, t1: t.t1, dir: t.dir, entry: t.entry, exit: t.exit, units: t.units, pnl: t.pnl, r: t.r, reason: t.reason, score: sc ? sc.total : null, max: sc ? sc.max : null, onplan: sc ? !sc.mistake : null };
    S.hist.push(rec);
    P.tlog = P.tlog || []; if (!P.tlog.some((x) => x.id === rec.id)) { P.tlog.push(Object.assign({}, rec, { acct: S.acct || null, mode: S.jmode || 'trade' })); if (P.tlog.length > 5000) P.tlog.shift(); }
    const ac = AC(); if (ac) { ac.tr = ac.tr || []; if (!ac.tr.some((x) => x.id === rec.id)) ac.tr.push({ id: rec.id, t1: rec.t1, pnl: rec.pnl, r: rec.r }); }
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
    return { t: Date.now(), n, net, ret: S.startBal ? net / S.startBal * 100 : 0, wr: n ? wins.length / n * 100 : null, totR: n ? totR : null, avgR: avgROf(H),
      pf: gl > 0 ? gw / gl : (gw > 0 ? 99 : null), score: sc.length ? sc.reduce((a, h) => a + h.score / h.max * 100, 0) / sc.length : null,
      best: n ? Math.max.apply(null, H.map((h) => h.pnl)) : null, worst: n ? Math.min.apply(null, H.map((h) => h.pnl)) : null, mode: S.jmode || 'trade' };
  }
  const SMET = [
    ['net', 'Net P&L', (v) => fmt(v), 1], ['ret', 'Return', (v) => (v >= 0 ? '+' : '') + v.toFixed(2) + '%', 1], ['n', 'Trades', (v) => String(v), 0],
    ['wr', 'Win rate', (v) => Math.round(v) + '%', 1], ['totR', 'Total R', (v) => (v >= 0 ? '+' : '') + v.toFixed(2) + 'R', 1], ['avgR', 'Avg R (wins only)', (v) => (v >= 0 ? '+' : '') + v.toFixed(2) + 'R', 1],
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
    if (dk !== S.dayKey) { S.dayKey = dk; S.dayStartBal = S.balance; S.dayTrades = 0; acctDay(); }
  }
  const wAcc = { dy: 0, shift: false, raf: 0 };
  let trimView = null;
  function setDataKeep() { const v = trimView || captureView(); trimView = null; series.setData(HIST); if (v) applyView(v); }
  function sync(crossed, stepped, trimmed) {
    if (!stepped || !series) return;
    if (trimmed) setDataKeep();
    updateInd();
  }
  function advance(n) {
    let crossed = false, stepped = 0, trimmed = false;
    for (let k = 0; k < n; k++) {
      if (S.cur >= E.n() - 1) { pause(); toast('End of loaded data'); break; }
      S.cur++; stepped++; applyEnv();
      S.run = E.mergeBar(S.run, S.tf, S.cur);
      const last = HIST[HIST.length - 1];
      if (!last || last.time !== S.run.time) { HIST.push(S.run); crossed = true; if (HIST.length > 3000) { if (!trimView) trimView = captureView(); HIST.splice(0, 500); trimmed = true; } } else HIST[HIST.length - 1] = S.run;
      if (series && !trimmed) series.update(S.run);
      dayRoll();
      if (S.open) {
        const r = E.stepTrade(S.open, S.cur);
        if (r) { sync(crossed, stepped, trimmed); finishTrade(r.price, E.t(S.cur), r.reason); return; }
      }
      { const f = acctForce(); if (f) { sync(crossed, stepped, trimmed); finishTrade(E.close(S.cur), E.t(S.cur), f); return; } }
    }
    sync(crossed, stepped, trimmed); refreshHud(); flushAlerts();
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
    const b = $('#c_play'); b.innerHTML = UI.pause; b.classList.add('on');
    timer = setInterval(() => { advance(SPEEDS[speedI]); discTick(); }, 300);
  }
  function pause() {
    if (timer) { clearInterval(timer); timer = null; }
    const b = $('#c_play'); if (b) { b.innerHTML = UI.play; b.classList.remove('on'); }
    if (S) saveP();
  }
  function equity() { return S.balance + (S.open ? E.floating(S.open, E.close(S.cur)) : 0); }
  function refreshHud() {
    if (!$('#h_time')) return;
    $('#h_time').textContent = fdate(E.t(S.cur)).slice(5).replace(' UTC', ''); $('#h_sess').textContent = sessName(E.t(S.cur));
    const cn = $('#h_cnt'); if (cn) cn.textContent = S.dayTrades + '/' + P.plan.risk.maxTrades;
    const masked = S.pending && !S.pending.check, DOT = '\u2022\u2022\u2022\u2022';
    const put = (id, txt, v) => { const el = $('#' + id); if (!el) return; el.textContent = txt; el.className = v == null || Math.abs(v) < 0.005 ? '' : (v > 0 ? 'up' : 'dn'); };
    const eq = equity(), sg = (v) => (v >= 0 ? '+' : '') + fmt(v), hh = accHist(), rs = avgROf(hh.s), rd = avgROf(hh.d), ac = AC(), plBase = ac ? ac.base : S.startBal;
    const rt = (v) => (v == null ? '--' : (v >= 0 ? '+' : '') + v.toFixed(2) + 'R');
    $('#h_bal').textContent = masked ? DOT : fmt(S.balance);
    put('h_eq', masked ? DOT : fmt(eq), masked ? null : eq - S.balance);
    put('h_pnl', masked ? DOT : sg(eq - plBase), masked ? null : eq - plBase);
    if (ac && $('#h_dd')) { const rm = ddRoom(ac, eq); put('h_dd', masked ? DOT : (rm.d != null ? fmt(rm.d) : '--'), null); put('h_mdd', masked ? DOT : (rm.m != null ? fmt(rm.m) : '--'), null); }
    put('h_dpnl', masked ? DOT : sg(eq - S.dayStartBal), masked ? null : eq - S.dayStartBal);
    put('h_wr', wrOf(hh.s)); put('h_dwr', wrOf(hh.d));
    put('h_rr', rt(rs), rs); put('h_drr', rt(rd), rd);
    acctChip();
    if (S.open) updateOpenPanel();
  }

  // ---------- trade bar / lines ----------
  let lineObjs = {}, trackId = 0, drag = null;
  const isSetup = (t) => S.cur <= (t.i0 == null ? -1 : t.i0);
  function refit() { try { if (!man && series && !series.priceScale().options().autoScale) { man = true; viewTouched = true; } } catch (e) {} if (man) return; try { series.priceScale().applyOptions({ autoScale: true }); } catch (e) {} }

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
      $('#b_close').onclick = () => { pause(); const cg = closeGate(AC()); if (cg) { toast(cg); return; } finishTrade(E.close(S.cur), E.t(S.cur), 'MANUAL'); };
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
    const ac = AC(), gate = openGate(ac, dir); if (gate) { toast(gate); return; }
    if (ac && ac.cond && ac.cond.requote && Math.random() < (newsAt(E.t(S.cur), 5, 'all') ? 0.35 : 0.04)) { toast('Requote: price moved. Try again.'); return; }
    let rp = P.plan.risk.pct; if (ac && ac.cfg && ac.cfg.maxRisk && rp > ac.cfg.maxRisk) { rp = ac.cfg.maxRisk; toast('Risk capped at ' + rp + '% by the account rules'); }
    const slipIn = ac && ac.cond && ac.cond.slip ? slipAmt(E.t(S.cur), ac.cond) : 0;
    const plan = P.plan, px = E.close(S.cur), dist = defaultDist();
    const sl = +(px - dir * dist).toFixed(2), tp = +(px + dir * (E.SPREAD / 2 + (dist + E.SPREAD / 2) * Math.max(plan.risk.minRR, 1))).toFixed(2);
    const over = S.dayTrades >= plan.risk.maxTrades, breach = (S.dayStartBal - S.balance) >= S.dayStartBal * plan.risk.dailyLoss / 100;
    const tr = E.openTrade({ dir, price: px, sl, tp, balance: S.balance, riskPct: rp, slip: slipIn, cond: tradeCond(ac), t: E.t(S.cur), check: null, note: '', ctx: { overTrades: over, dailyBreach: breach } });
    if (!tr.units) { toast('Position size is zero'); return; }
    tr.startBal = S.balance; tr.i0 = S.cur;
    S.open = tr; S.dayTrades++; S.trades++; if (ac) ac.dTr = S.dayTrades;
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
    const t = S.open, ac = AC(); let sl = 0;
    if (ac && ac.cond && ac.cond.slip) { sl = slipAmt(tmin, ac.cond); if (reason === 'SL') sl = Math.abs(sl); else if (reason === 'TP') sl = 0; }
    E.closeTrade(t, price, tmin, reason, sl);
    S.balance += t.pnl; S.open = null; recordHist(t, null); acctClose(t);
    if (S.jmode === 'end') {
      saveP(); drawTradebar(); drawLines(); refreshHud();
      toast(({ SL: 'Stopped out', TP: 'Target hit', MANUAL: 'Closed', BREACH: 'Closed by account rules', WEEKEND: 'Closed for the weekend', STOPOUT: 'Margin stop-out' }[reason]) + ': ' + (t.pnl >= 0 ? '+' : '') + fmt(t.pnl) + ' (' + t.r.toFixed(2) + 'R)');
      flushAlerts();
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
    const rsn = ({ SL: 'Stopped out', TP: 'Target hit', MANUAL: 'Closed by you', BREACH: 'Closed by account rules', WEEKEND: 'Closed for the weekend', STOPOUT: 'Margin stop-out' }[t.reason]);
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
    { const tl = (P.tlog || []).find((x) => x.id === t.id); if (tl) { const jj = P.journal[P.journal.length - 1]; Object.assign(tl, { score: jj.score, max: jj.max, level: jj.level, flags: jj.flags, verdict: jj.verdict, honesty: jj.honesty, mode: 'trade' }); } }
    P.sessionsDone = P.sessionsDone || 0; saveP();
    const lvAfter = E.levelFor(P.xp);
    const vtxt = { clean: 'No mistake, and you said so. That is the most honest result there is.', accountable: 'You made a mistake and owned it. That is how it gets fixed.', overclaimed: 'You said you followed the plan, but the log says otherwise. That gap is where accounts get blown.', harsh: 'You did nothing wrong but marked yourself down. Be accurate, not harsh.' }[sc.verdict];
    const hl = ['No honesty', 'Accountable', 'Fully honest'][sc.honesty];
    modal('<h3>Score: ' + sc.total + '/' + sc.max + (sc.bonus ? ' <span class=\"up\">+' + sc.bonus + ' bonus</span>' : '') + '</h3>' +
      sc.rows.map((r) => '<div class=\"srow\"><span>' + esc(r.label) + '</span><b class=\"' + (r.got >= r.max ? 'up' : 'dn') + '\">' + (r.bonus ? '+' : '') + r.got + (r.bonus ? '' : '/' + r.max) + '</b></div>').join('') +
      '<div class=\"srow hon\"><span><b>Honesty</b> &middot; ' + hl + '</span><b class=\"' + (sc.honesty === 2 ? 'up' : sc.honesty === 0 ? 'dn' : '') + '\">' + sc.honesty + '/2</b></div>' +
      '<p class=\"vt\">' + vtxt + '</p><div class=\"xpline\">+' + gain + ' XP &middot; Level ' + lvAfter + (lvAfter > lvBefore ? ' &#127881; LEVEL UP' : '') + ' &middot; Clean streak ' + P.streak + '</div>' +
      '<button class=\"btn big\" id=\"rs_ok\">Continue</button>', 'tall nodismiss');
    $('#rs_ok').onclick = () => { closeModal(); setTimeout(flushAlerts, 60); drawTradebar(); const risk = (S.dayStartBal - S.balance) >= S.dayStartBal * P.plan.risk.dailyLoss / 100; if (risk) toast('Daily loss limit hit. Plan says stop for today.'); };
  }

  function endSession() {
    pause();
    if (S.open) { toast('Close your open trade first'); return; }
    const pnl = S.balance - S.startBal;
    modal('<h3>End session?</h3><p>Result: <b class="' + (pnl >= 0 ? 'up' : 'dn') + '">' + fmt(pnl) + '</b> over ' + S.trades + ' trades.</p><div class="tbtns"><button class="ghost2" id="en_no">Keep going</button><button class="sell" id="en_yes">End</button></div>');
    $('#en_no').onclick = closeModal;
    $('#en_yes').onclick = runEnd;
  }
  function runEnd() {
    {
      closeModal();
      const st = sessStats(), prev = (P.sessLog || []).length ? P.sessLog[P.sessLog.length - 1].st : null;
      const fin = (notes) => statsModal(st, prev, () => {
        P.sessLog = P.sessLog || []; P.sessLog.push({ st, notes, t0: S.startT, t1: E.t(S.cur) }); if (P.sessLog.length > 100) P.sessLog.shift();
        P.sessionsDone++; P.session = null; S = null; saveP(); closeModal(); showTab('replay');
      });
      if (S.jmode === 'end') reflectModal(fin); else fin(null);
    }
  }

  // ---------- stats ----------
  const STT = [['journal', 'Journal'], ['quick', 'Quick notes'], ['reviews', 'Reviews'], ['data', 'Data']];
  function ensureTlog() {
    P.tlog = P.tlog || [];
    if (!P.tlogInit) { P.tlogInit = 1; (P.journal || []).forEach((j) => { if (!P.tlog.some((x) => x.t0 === j.t0 && x.t1 === j.t1)) P.tlog.push(Object.assign({}, j, { id: 'j' + j.t0 + '_' + j.t1, acct: null, mode: 'trade' })); }); P.tlog.sort((a, b) => a.t1 - b.t1); }
    if (S && S.hist) S.hist.forEach((h) => { if (!P.tlog.some((x) => x.id === h.id)) P.tlog.push(Object.assign({}, h, { acct: S.acct || null, mode: S.jmode || 'trade' })); });
  }
  function dataFilter() { const f = (P.set && P.set.dfil) || {}; return { mode: f.mode || 'all', acct: f.acct || 'all', sess: f.sess || 'all' }; }
  function filterBar(all) {
    const f = dataFilter(), accts = [['all', 'All accounts'], ['none', 'Practice']].concat((P.accts || []).map((a) => [a.id, a.name]));
    const sel = (k, opts) => '<select data-df="' + k + '">' + opts.map((o) => '<option value="' + o[0] + '"' + (f[k] === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
    return '<div class="fbar">' + sel('mode', [['all', 'All journal modes'], ['trade', 'After every trade'], ['end', 'After the session']]) + sel('acct', accts) + sel('sess', [['all', 'All sessions'], ['Asia', 'Asia'], ['London', 'London'], ['New York', 'New York']]) + '</div>';
  }
  function filteredTrades() {
    ensureTlog(); const f = dataFilter();
    return P.tlog.filter((j) => (f.mode === 'all' || (j.mode || 'trade') === f.mode) && (f.acct === 'all' || (f.acct === 'none' ? !j.acct : j.acct === f.acct)) && (f.sess === 'all' || sessName(j.t0) === f.sess));
  }
  function renderStats() {
    if (S && S.notes) { P.qnotes = P.qnotes || []; S.notes.forEach((n) => { if (!n.g) { n.g = 1; n.at = n.at || Date.now(); n.vid = S.vid; P.qnotes.push(n); } }); }
    const st = (P.set && P.set.stTab2) || 'data', J = P.journal || [];
    let h = '<div class="page"><div class="itabs">' + STT.map((x) => '<button data-stt="' + x[0] + '" class="' + (st === x[0] ? 'on' : '') + '">' + x[1] + '</button>').join('') + '</div>';
    if (st === 'journal') h += statsJournal(J); else if (st === 'quick') h += statsQuick(); else if (st === 'reviews') h += statsReviews(J); else h += filterBar() + statsData(filteredTrades());
    $('#view').innerHTML = h + '</div>';
    document.querySelectorAll('[data-stt]').forEach((b) => (b.onclick = () => { P.set.stTab2 = b.dataset.stt; saveP(); renderStats(); }));
    document.querySelectorAll('[data-df]').forEach((el) => (el.onchange = () => { P.set.dfil = Object.assign(dataFilter(), { [el.dataset.df]: el.value }); saveP(); renderStats(); }));
    document.querySelectorAll('[data-ji]').forEach((el) => (el.onclick = () => editJournal(+el.dataset.ji)));
    document.querySelectorAll('[data-qd]').forEach((el) => (el.onclick = () => { const k = +el.dataset.qd, n = P.qnotes[k]; if (!n) return; if (confirm('Delete this note?')) { P.qnotes.splice(k, 1); if (S && S.notes) S.notes = S.notes.filter((x) => x !== n && x.at !== n.at); saveP(); renderStats(); } }));
  }
  function statsJournal(J) {
    if (!J.length) return '<div class="card muted">No journal entries yet. They appear after each reviewed trade.</div>';
    return J.map((j, ji) => [j, ji]).reverse().slice(0, 100).map((x) => { const j = x[0], ji = x[1];
      return '<div class="card jr" data-ji="' + ji + '"><div class="jt"><b>' + (j.dir > 0 ? 'LONG' : 'SHORT') + '</b> <span class="muted sm">' + fdate(j.t0) + '</span><span class="sc">' + j.score + '</span></div><div class="' + (j.pnl >= 0 ? 'up' : 'dn') + '">' + fmt(j.pnl) + ' (' + j.r.toFixed(2) + 'R) &middot; ' + esc(j.reason) + '</div>' +
        '<div class="muted sm">You said: ' + esc(j.said) + ' &middot; verdict: ' + esc(j.verdict || '') + '</div>' + (j.why ? '<div class="sm" style="margin-top:4px"><b>Why:</b> ' + esc(j.why) + '</div>' : '') + (j.note ? '<div class="sm" style="margin-top:4px"><b>Review:</b> ' + esc(j.note) + '</div>' : '') + '</div>'; }).join('');
  }
  function statsQuick() {
    const Q = P.qnotes || []; if (!Q.length) return '<div class="card muted">No quick notes yet. Tap the note button on the chart to open a movable note box.</div>';
    return Q.map((n, k) => [n, k]).reverse().slice(0, 200).map((x) => '<div class="card"><div class="jt"><span class="muted sm">' + fdate(x[0].t) + ' &middot; ' + fmt(x[0].px) + '</span><button class="qdel" data-qd="' + x[1] + '" title="Delete">&times;</button></div><div class="sm" style="white-space:pre-wrap;margin-top:4px">' + esc(x[0].text) + '</div></div>').join('');
  }
  function statsReviews(J) {
    const SN = (P.sessLog || []).filter((x) => x.notes && (x.notes.learned || x.notes.changes || x.notes.other));
    let h = '<h3>After-session notes</h3>';
    h += SN.length ? SN.slice().reverse().slice(0, 40).map((x) => '<div class="card"><div class="muted sm">' + fdate(x.t0) + ' &middot; ' + x.st.n + ' trades &middot; ' + fmt(x.st.net) + '</div>' + [['Learned', x.notes.learned], ['Changes / ideas', x.notes.changes], ['Next time', x.notes.other]].filter((r) => r[1]).map((r) => '<div class="sm" style="margin-top:6px"><b>' + r[0] + ':</b> ' + esc(r[1]) + '</div>').join('') + '</div>').join('') : '<div class="card muted">None yet. Choose "once, after the session" journaling to get these.</div>';
    const RV = J.map((j, ji) => [j, ji]).filter((x) => x[0].note);
    h += '<h3>Trade reviews</h3>' + (RV.length ? RV.reverse().slice(0, 60).map((x) => '<div class="card jr" data-ji="' + x[1] + '"><div class="jt"><b>' + (x[0].dir > 0 ? 'LONG' : 'SHORT') + '</b> <span class="muted sm">' + fdate(x[0].t0) + '</span><span class="' + (x[0].pnl >= 0 ? 'up' : 'dn') + '">' + x[0].r.toFixed(2) + 'R</span></div><div class="sm">' + esc(x[0].note) + '</div></div>').join('') : '<div class="card muted">No trade reviews yet.</div>');
    return h;
  }
  function statsData(J) {
    const n = J.length, lv = E.levelFor(P.xp), lo = E.xpForLevel(lv), hi = E.xpForLevel(lv + 1);
    let h = '<div class="card lvl"><div class="lvn">Level ' + lv + '</div><div class="bar"><i style="width:' + Math.min(100, (P.xp - lo) / (hi - lo) * 100) + '%"></i></div><div class="muted sm">' + P.xp + ' XP &middot; clean streak ' + P.streak + ' (best ' + P.bestStreak + ')</div></div>';
    if (!n) return h + '<div class="card muted">No trades match these filters.</div>';
    const sum = (a, f) => a.reduce((x, y) => x + f(y), 0), W = J.filter((j) => j.pnl > 0), Lo = J.filter((j) => j.pnl < 0);
    const gw = sum(W, (j) => j.pnl), gl = Math.abs(sum(Lo, (j) => j.pnl)), net = sum(J, (j) => j.pnl), tr = sum(J, (j) => j.r);
    const aw = W.length ? gw / W.length : 0, al = Lo.length ? gl / Lo.length : 0, awR = W.length ? sum(W, (j) => j.r) / W.length : 0, alR = Lo.length ? sum(Lo, (j) => j.r) / Lo.length : 0;
    const wr = W.length / n * 100, payoff = al ? aw / al : null, be = payoff ? 100 / (1 + payoff) : null, exp = tr / n;
    let cum = 0, peak = 0, mdd = 0, cw = 0, cl = 0, bw = 0, bl = 0;
    J.forEach((j) => { cum += j.r; peak = Math.max(peak, cum); mdd = Math.max(mdd, peak - cum); if (j.pnl > 0) { cw++; cl = 0; } else if (j.pnl < 0) { cl++; cw = 0; } else { cw = cl = 0; } bw = Math.max(bw, cw); bl = Math.max(bl, cl); });
    const hold = (a) => (a.length ? Math.round(sum(a, (j) => j.t1 - j.t0) / a.length) : null), hm = (m) => (m == null ? '--' : m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + 'm');
    const rr = (l, v, cls) => '<div class="srow"><span>' + l + '</span><b class="' + (cls || '') + '">' + v + '</b></div>';
    const sgn = (v) => (v > 0 ? 'up' : v < 0 ? 'dn' : '');
    h += '<div class="kpis"><div><b>' + n + '</b><span>trades</span></div><div><b>' + wr.toFixed(0) + '%</b><span>win rate</span></div><div><b class="' + sgn(exp) + '">' + exp.toFixed(2) + 'R</b><span>expectancy</span></div><div><b>' + (gl ? (gw / gl).toFixed(2) : (gw ? '99+' : '--')) + '</b><span>profit factor</span></div></div>';
    if (n < 30) h += '<div class="muted sm" style="margin:4px 2px">Only ' + n + ' trades. Under about 30, these numbers are mostly noise.</div>';
    h += '<div class="card"><b>Edge</b>' + rr('Net P&amp;L', fmt(net), sgn(net)) + rr('Total R', tr.toFixed(2) + 'R', sgn(tr)) + rr('Average win / loss', fmt(aw) + ' / ' + fmt(-al)) + rr('Average win / loss in R', awR.toFixed(2) + 'R / ' + alR.toFixed(2) + 'R') +
      rr('Payoff ratio (avg win / avg loss)', payoff ? payoff.toFixed(2) : '--') + rr('Win rate you need to break even', be ? be.toFixed(0) + '%' : '--', be ? (wr >= be ? 'up' : 'dn') : '') + rr('Best / worst trade', fmt(Math.max.apply(null, J.map((j) => j.pnl))) + ' / ' + fmt(Math.min.apply(null, J.map((j) => j.pnl)))) + '</div>';
    h += '<div class="card"><b>Risk and streaks</b>' + rr('Max drawdown (in R)', mdd.toFixed(2) + 'R', mdd > 6 ? 'dn' : '') + rr('Longest win streak / loss streak', bw + ' / ' + bl) + rr('Average hold: all / wins / losses', hm(hold(J)) + ' / ' + hm(hold(W)) + ' / ' + hm(hold(Lo))) + '</div>';
    const grp = (title, keyf, order) => {
      const m = {}; J.forEach((j) => { const k = keyf(j); (m[k] = m[k] || []).push(j); });
      const keys = (order || Object.keys(m)).filter((k) => m[k]);
      return '<div class="card"><b>' + title + '</b><table class="dt"><tr><th></th><th>n</th><th>WR</th><th>Avg R</th><th>Net</th></tr>' + keys.map((k) => { const a = m[k], r = sum(a, (j) => j.r) / a.length, p = sum(a, (j) => j.pnl); return '<tr><td>' + esc(k) + '</td><td>' + a.length + '</td><td>' + Math.round(a.filter((j) => j.pnl > 0).length / a.length * 100) + '%</td><td class="' + sgn(r) + '">' + r.toFixed(2) + '</td><td class="' + sgn(p) + '">' + fmt(p, 0) + '</td></tr>'; }).join('') + '</table></div>';
    };
    const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], NM = { SL: 'Stopped out', TP: 'Target hit', MANUAL: 'Closed by hand', BREACH: 'Account rules', WEEKEND: 'Weekend close', STOPOUT: 'Margin stop-out' };
    h += grp('By direction', (j) => (j.dir > 0 ? 'Long' : 'Short'), ['Long', 'Short']) + grp('By session (entry time)', (j) => sessName(j.t0), ['Asia', 'London', 'New York', 'Late']) +
      grp('By weekday', (j) => DOW[new Date(j.t0 * 60000).getUTCDay()], ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sun', 'Sat']) + grp('By how it ended', (j) => NM[j.reason] || j.reason) +
      grp('By plan adherence', (j) => (!j.max ? 'Not scored' : j.level === 2 ? 'On plan' : 'Off plan'), ['On plan', 'Off plan', 'Not scored']) + grp('By result size', (j) => (j.r <= -1.05 ? 'Worse than -1R' : j.r < 0 ? '0 to -1R' : j.r < 1 ? '0 to 1R' : j.r < 2 ? '1R to 2R' : '2R or more'), ['Worse than -1R', '0 to -1R', '0 to 1R', '1R to 2R', '2R or more']);
    const sc = J.filter((j) => j.max); const scd = J.filter((j) => j.max), ad = scd.filter((j) => j.level === 2).length;
    const leaks = [['Skipped checklist items', J.filter((j) => j.flags && j.flags.incomplete).length], ['Risked more than plan', J.filter((j) => j.flags && j.flags.risk).length], ['Took below-minimum RR', J.filter((j) => j.flags && j.flags.rr).length], ['Broke daily limits', J.filter((j) => j.flags && j.flags.limits).length], ['Widened a stop', J.filter((j) => j.flags && j.flags.widened).length], ['Closed manually', J.filter((j) => j.flags && j.flags.manual).length], ['Overclaimed in review', J.filter((j) => j.verdict === 'overclaimed').length]].sort((a, b) => b[1] - a[1]);
    h += '<div class="card"><b>Discipline</b>' + rr('Fully on plan (scored trades: ' + scd.length + ')', scd.length ? Math.round(ad / scd.length * 100) + '%' : '--') + rr('Average process score', sc.length ? Math.round(sum(sc, (j) => j.score / j.max * 100) / sc.length) + '%' : '--') + '<h4>Where you leak</h4>' + leaks.map((l) => rr(l[0], l[1], l[1] ? 'dn' : 'up')).join('') + '</div>';
    const ses = P.sessLog || []; if (ses.length) { const sw = ses.filter((x) => x.st.net > 0).length; h += '<div class="card"><b>Sessions</b>' + rr('Sessions played', ses.length) + rr('Profitable sessions', Math.round(sw / ses.length * 100) + '%') + rr('Best / worst session', fmt(Math.max.apply(null, ses.map((x) => x.st.net))) + ' / ' + fmt(Math.min.apply(null, ses.map((x) => x.st.net)))) + '</div>'; }
    return h;
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
  let crossWired = null;
  function wireCross() {
    const el = $('#chart'); if (!el || crossWired === el) return; crossWired = el;
    const put = (e) => {
      if (!P.set.cross || !e.touches || !e.touches[0]) return;
      const r = el.getBoundingClientRect(), x = e.touches[0].clientX - r.left, y = e.touches[0].clientY - r.top;
      try {
        const pr = series.coordinateToPrice(y), tm = chart.timeScale().coordinateToTime(x);
        if (pr != null && tm != null) chart.setCrosshairPosition(pr, tm, series);
      } catch (x2) {}
    };
    const clear = () => { try { chart.clearCrosshairPosition(); } catch (x2) {} };
    el.addEventListener('touchstart', put, { passive: true, capture: true });
    el.addEventListener('touchmove', put, { passive: true, capture: true });
    el.addEventListener('touchend', clear, { passive: true, capture: true });
    el.addEventListener('touchcancel', clear, { passive: true, capture: true });
  }
  function applyBx() { document.documentElement.style.setProperty('--bx', ((P && P.set && P.set.bx) || 0) + 'px'); }
  function setCross(on) { P.set.cross = !!on; saveP(); try { chart.applyOptions({ crosshair: { mode: on ? 0 : 2 } }); } catch (e) {} }
  async function forceRefresh() {
    try { const rs = await navigator.serviceWorker.getRegistrations(); for (const r of rs) await r.unregister(); } catch (e) {}
    try { for (const k of await caches.keys()) await caches.delete(k); } catch (e) {}
    const files = ['./', 'index.html', 'app.js', 'engine.js', 'sync.js', 'patterns.js', 'style.css', 'lightweight-charts.js', 'manifest.json', 'sw.js', 'data-index.json'];
    await Promise.all(files.map((f) => fetch(f, { cache: 'reload' }).catch(() => {})));
    location.replace(location.pathname + '?r=' + Date.now());
  }
  function renderSettings() {
    const imgs = loadImgs(), ft = E.t(0), lt = E.t(E.n() - 1), nd = dayList().length;
    const tfOpts = TFS.map((t) => '<option value="' + t[0] + '"' + ((P.set.tf || 15) === t[0] ? ' selected' : '') + '>' + t[1] + '</option>').join('');
    const spOpts = SPEEDS.map((v, i) => '<option value="' + i + '"' + (P.set.speed === i ? ' selected' : '') + '>' + v + 'x</option>').join('');
    $('#view').innerHTML = '<div class="page"><h2>Settings</h2>' +
      '<div class="card"><b>App version</b><div class="verbig">v' + APP_VERSION + '</div><div class="muted sm">Build ' + BUILD + '</div><div id="v_latest" class="muted sm" style="margin-top:6px">Latest on server: checking&hellip;</div>' +
      '<div class="tbtns"><button class="ghost2" id="v_check">Check for update</button><button class="close" id="v_force">Force refresh</button></div></div>' +
      '<div class="card"><b>Data</b><div class="muted sm" style="margin-top:4px">Spot gold XAUUSD (Dukascopy bid), 1-minute, prices to 2 decimals, UTC.<br>' + fdate(ft) + ' to ' + fdate(lt) + '<br>' + nd + ' trading days. More days are added automatically.</div></div>' +
      '<div class="card"><b>Replay defaults</b><label>Starting chart timeframe</label><select id="st_tf">' + tfOpts + '</select><label>Chart crosshair (follows your finger)</label><select id="st_cr"><option value="0"' + (P.set.cross ? '' : ' selected') + '>Off</option><option value="1"' + (P.set.cross ? ' selected' : '') + '>On</option></select><label>Bottom edge (Home Screen app: raise until the gap is filled)</label><select id="st_bx">' + [0, 10, 20, 30, 40].map((v) => '<option value="' + v + '"' + ((P.set.bx || 0) === v ? ' selected' : '') + '>' + (v ? '+' + v + ' px' : 'Default') + '</option>').join('') + '</select><label>Starting playback speed</label><select id="st_sp">' + spOpts + '</select>' +
      '<button class="btn ghost" id="st_ind" style="margin-top:12px">Indicators&hellip;</button></div>' +
      '<div class="card"><b>Plan pictures</b><p class="muted sm">Screenshots or photos of your written plan or setups. Kept on this device.</p><div class="thumbs">' + imgs.map((d, i) => '<div class="th"><img src="' + d + '" data-view="' + i + '"><button class="x" data-rmimg="' + i + '">&times;</button></div>').join('') + '</div>' +
      '<button class="btn ghost" id="p_addimg">+ Add pictures</button><input type="file" id="p_imgfile" accept="image/*" multiple hidden></div>' +
      (window.Sync ? window.Sync.cardHtml() : '') + kbCardHtml() + '<div class="card"><b>Danger zone</b><p><button class="btn ghost" id="p_reset">Reset everything</button></p></div></div>';
    latestBuild().then((lb) => { const el = $('#v_latest'); if (!el) return; el.innerHTML = !lb ? 'Latest on server: could not check (offline?)' : lb === BUILD ? '<span class="up">Up to date</span> (' + lb + ')' : '<span class="dn">Update available: ' + lb + '. Tap Force refresh.</span>'; });
    $('#v_check').onclick = () => { $('#v_latest').textContent = 'Latest on server: checking\u2026'; latestBuild().then((lb) => { $('#v_latest').innerHTML = !lb ? 'Could not check' : lb === BUILD ? '<span class="up">Up to date</span> (' + lb + ')' : '<span class="dn">Update available: ' + lb + '. Tap Force refresh.</span>'; }); };
    $('#v_force').onclick = forceRefresh;
    $('#st_tf').onchange = () => { P.set.tf = +$('#st_tf').value; saveP(); toast('Saved'); };
    $('#st_cr').onchange = () => { P.set.cross = $('#st_cr').value === '1'; saveP(); toast('Saved'); };
    $('#st_bx').onchange = () => { P.set.bx = +$('#st_bx').value; saveP(); applyBx(); toast('Saved'); };
    $('#st_sp').onchange = () => { P.set.speed = +$('#st_sp').value; speedI = P.set.speed; saveP(); toast('Saved'); };
    $('#st_ind').onclick = openInd; bindKbUI();
    $('#p_addimg').onclick = () => $('#p_imgfile').click();
    $('#p_imgfile').onchange = async (e) => {
      const a = loadImgs();
      for (const f of [...e.target.files].slice(0, 8)) { try { a.push(await shrink(f)); } catch (x) {} }
      if (a.length > 12) a.splice(0, a.length - 12);
      if (saveImgs(a)) renderSettings();
    };
    document.querySelectorAll('[data-rmimg]').forEach((b) => (b.onclick = () => { const a = loadImgs(); a.splice(+b.dataset.rmimg, 1); saveImgs(a); renderSettings(); }));
    document.querySelectorAll('[data-view]').forEach((im) => (im.onclick = () => showImg(+im.dataset.view)));
    if (window.Sync) window.Sync.bind($);
    $('#p_reset').onclick = () => { modal('<h3>Reset everything?</h3><p>Deletes your plan, XP and journal on this device.</p><div class="tbtns"><button class="ghost2" id="rs_n">Cancel</button><button class="sell" id="rs_y">Delete</button></div>'); $('#rs_n').onclick = closeModal; $('#rs_y').onclick = () => { localStorage.removeItem(KEY); localStorage.removeItem(IKEY); location.reload(); }; };
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
  applyBx();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', () => { if ($('#chartwrap')) { placeMovable('isl'); placeMovable('fav'); placeMovable('note'); } });
  boot();
})();
