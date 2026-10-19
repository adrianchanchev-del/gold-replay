/* Confluence library: each confluence has pictured variants the user picks from. Bullish drawings; mirror for shorts. */
(function (root) {
  'use strict';
  // candle = [open, high, low, close] on a 0-100 scale (higher = higher price)
  // extras: line = horizontal level, zone = [y1,y2] shaded
  const L = [
    {
      id: 'bos', name: 'Break of structure', blurb: 'Price breaks a prior swing and shows direction.',
      variants: [
        { id: 'close', label: 'Candle CLOSES beyond the swing', candles: [[40,48,38,46],[46,60,44,58],[58,59,50,52],[52,54,46,48],[48,58,47,56],[56,72,55,70]], line: 60 },
        { id: 'wick', label: 'Only a WICK pokes past the swing', candles: [[40,48,38,46],[46,60,44,58],[58,59,50,52],[52,54,46,48],[48,58,47,56],[56,64,55,57]], line: 60 },
        { id: 'retest', label: 'Break, then retest of the level, then continuation', candles: [[40,48,38,46],[46,60,44,58],[58,59,50,52],[52,70,51,68],[68,69,61,62],[62,75,60,73]], line: 60 },
      ],
    },
    {
      id: 'sweep', name: 'Liquidity sweep', blurb: 'Price takes out obvious highs/lows, then reverses.',
      variants: [
        { id: 'wickback', label: 'Wick takes the high, closes back inside', candles: [[40,50,39,48],[48,60,46,58],[58,59,52,54],[54,58,50,56],[56,66,52,54],[54,55,44,46]], line: 60 },
        { id: 'equal', label: 'Equal highs get taken, then rejection', candles: [[40,58,38,56],[56,57,48,50],[50,58,47,55],[55,56,46,48],[48,62,47,50],[50,51,40,42]], line: 58 },
        { id: 'displace', label: 'Low swept, then a strong displacement candle', candles: [[50,52,40,42],[42,46,41,45],[45,47,38,44],[44,62,43,60],[60,66,57,64]], line: 40 },
      ],
    },
    {
      id: 'fvg', name: 'Fair value gap', blurb: 'An imbalance left by a fast move.',
      variants: [
        { id: 'three', label: 'Three-candle gap, outer wicks do not overlap', candles: [[40,50,38,48],[48,70,47,68],[68,74,60,72]], zone: [50,60] },
        { id: 'half', label: 'Gap gets filled about halfway, then reacts', candles: [[40,50,38,48],[48,70,47,68],[68,74,60,72],[72,73,54,56],[56,66,55,64]], zone: [50,60] },
        { id: 'leg', label: 'Gap inside a long impulse leg', candles: [[40,44,38,43],[43,46,41,45],[45,70,44,68],[68,72,60,71],[71,80,68,78]], zone: [46,60] },
      ],
    },
    {
      id: 'ob', name: 'Order block / last opposing candle', blurb: 'The last candle before an impulse move.',
      variants: [
        { id: 'lastdown', label: 'Last DOWN candle before an up impulse', candles: [[48,52,46,50],[50,51,43,45],[45,62,44,60],[60,70,58,68]], zone: [45,50] },
        { id: 'retestob', label: 'Price returns into the zone and reacts', candles: [[48,52,46,50],[50,51,43,45],[45,62,44,60],[60,70,58,68],[68,69,52,54],[54,55,46,52],[52,66,51,64]], zone: [45,50] },
        { id: 'lastup', label: 'Last UP candle before a down impulse', candles: [[50,54,48,52],[52,58,51,57],[57,58,40,42],[42,44,30,32]], zone: [52,57] },
      ],
    },
    {
      id: 'bias', name: 'Higher-timeframe bias', blurb: 'The bigger picture you trade with.',
      variants: [
        { id: 'hhhl', label: 'Higher highs and higher lows', candles: [[30,40,28,38],[38,39,32,34],[34,48,33,46],[46,47,40,42],[42,58,41,56],[56,57,50,52],[52,68,51,66]] },
        { id: 'dailydir', label: 'Daily candle direction (close above open)', candles: [[40,70,38,66],[66,68,62,64],[64,67,63,66]] },
        { id: 'level', label: 'Price holding above a key level', candles: [[44,48,42,46],[46,56,45,54],[54,58,50,52],[52,53,49,51],[51,60,50,58]], line: 50 },
      ],
    },
    {
      id: 'rej', name: 'Rejection candle', blurb: 'A candle that shows the other side giving up.',
      variants: [
        { id: 'pin', label: 'Pin bar: long wick, close near the high', candles: [[66,67,58,60],[60,61,52,54],[54,56,36,53]] },
        { id: 'engulf', label: 'Engulfing: body swallows the previous candle', candles: [[58,59,52,54],[54,55,48,50],[49,64,47,62]] },
        { id: 'doji', label: 'Doji / indecision at a level', candles: [[60,61,52,54],[54,55,47,49],[49,52,44,49.5]], line: 46 },
      ],
    },
  ];

  function rng(seed) { let x = 0; for (const ch of seed) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }
  // lead-in candles so the pattern sits inside a believable chart, not on its own
  function lead(v, n) {
    const r = rng(v.id + v.label), out = [];
    let px = v.candles[0][0];
    const dirn = v.candles[0][3] >= v.candles[0][0] ? -1 : 1;
    for (let i = 0; i < n; i++) {
      const move = (r() - 0.5 + dirn * 0.06) * 7, c = px, o = px - move;
      const hi = Math.max(o, c) + r() * 3, lo = Math.min(o, c) - r() * 3;
      out.unshift([o, hi, lo, c]); px = o;
    }
    return out;
  }
  function svg(v, w, h) {
    w = w || 200; h = h || 130;
    const all = lead(v, 10).concat(v.candles), n = all.length, pad = 6;
    let mn = 1e9, mx = -1e9;
    all.forEach((c) => { mn = Math.min(mn, c[2]); mx = Math.max(mx, c[1]); });
    if (v.zone) { mn = Math.min(mn, v.zone[0]); mx = Math.max(mx, v.zone[1]); }
    if (v.line != null) { mn = Math.min(mn, v.line); mx = Math.max(mx, v.line); }
    const y = (p) => pad + (1 - (p - mn) / (mx - mn)) * (h - pad * 2);
    const sx = (w - pad * 2) / (n + 1), bw = Math.max(3, sx * 0.55);
    const x0 = pad + sx * (all.length - v.candles.length);
    let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" fill="#0d1117"/>`;
    for (let g = 1; g < 4; g++) s += `<line x1="0" x2="${w}" y1="${g * h / 4}" y2="${g * h / 4}" stroke="#151b24" stroke-width="1"/>`;
    if (v.zone) {
      const y1 = y(v.zone[1]), y2 = y(v.zone[0]);
      s += `<rect x="${x0 - sx / 2}" y="${y1}" width="${w - x0 + sx / 2}" height="${Math.max(2, y2 - y1)}" fill="#4f8cff" opacity="0.22"/>`;
    }
    if (v.line != null) s += `<line x1="${x0 - sx * 3}" x2="${w - 2}" y1="${y(v.line)}" y2="${y(v.line)}" stroke="#e6c14b" stroke-width="1" stroke-dasharray="4 3"/>`;
    all.forEach((c, i) => {
      const x = pad + sx * (i + 1), up = c[3] >= c[0], col = up ? '#26a69a' : '#ef5350';
      const top = y(Math.max(c[0], c[3])), bot = y(Math.min(c[0], c[3]));
      s += `<line x1="${x}" x2="${x}" y1="${y(c[1])}" y2="${y(c[2])}" stroke="${col}" stroke-width="1"/>`;
      s += `<rect x="${x - bw / 2}" y="${top}" width="${bw}" height="${Math.max(1, bot - top)}" fill="${col}"/>`;
    });
    return s + '</svg>';
  }

  root.Patterns = { list: L, svg, get: (id) => L.find((c) => c.id === id) };
})(window);
