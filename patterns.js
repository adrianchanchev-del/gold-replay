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

  function svg(v, w, h) {
    w = w || 132; h = h || 88;
    const n = v.candles.length, pad = 8, sx = (w - pad * 2) / n, bw = Math.min(14, sx * 0.55);
    const y = (p) => h - 6 - (p / 100) * (h - 12);
    let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" xmlns="http://www.w3.org/2000/svg">`;
    if (v.zone) {
      const y1 = y(v.zone[1]), y2 = y(v.zone[0]);
      s += `<rect x="2" y="${y1}" width="${w - 4}" height="${y2 - y1}" fill="#4f8cff" opacity="0.22"/>`;
    }
    if (v.line != null) s += `<line x1="2" x2="${w - 2}" y1="${y(v.line)}" y2="${y(v.line)}" stroke="#e6c14b" stroke-width="1.2" stroke-dasharray="4 3"/>`;
    v.candles.forEach((c, i) => {
      const x = pad + sx * i + sx / 2, up = c[3] >= c[0], col = up ? '#26a69a' : '#ef5350';
      const top = y(Math.max(c[0], c[3])), bot = y(Math.min(c[0], c[3]));
      s += `<line x1="${x}" x2="${x}" y1="${y(c[1])}" y2="${y(c[2])}" stroke="${col}" stroke-width="1.5"/>`;
      s += `<rect x="${x - bw / 2}" y="${top}" width="${bw}" height="${Math.max(1.5, bot - top)}" fill="${col}"/>`;
    });
    return s + '</svg>';
  }

  root.Patterns = { list: L, svg, get: (id) => L.find((c) => c.id === id) };
})(window);
