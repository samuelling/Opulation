// Her face: a fruit fly's head, front view, whose compound eyes carry data.
//
// Each ommatidium (a hexagonal facet) is one bit: dark = 1, light = 0, after whitening, so the eyes look evenly
// speckled whatever the data. The payload is Reed-Solomon coded (corrects 12 wrong bytes). Four ink dots that
// belong to the drawing locate it: a bristle socket on each cheek, the median ocellus on top of
// the head and the tip of the labellum below. From those four the reader finds the perspective of the screen,
// then reads every facet.
//
// The geometry (layout()) is shared by the drawing and the reader. drawRaster() renders it into a plain
// greyscale buffer (Node tests); the page draws the same shapes with a canvas (drawCanvas()).

// ------------------------------------------------------------------ Reed-Solomon over GF(256), poly 0x11d
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
{ let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; }
const gmul = (a, b) => (a && b) ? EXP[LOG[a] + LOG[b]] : 0;
const gdiv = (a, b) => a ? EXP[(LOG[a] + 255 - LOG[b]) % 255] : 0;
function polyMul(p, q) { const r = new Uint8Array(p.length + q.length - 1); for (let i = 0; i < p.length; i++) for (let j = 0; j < q.length; j++) r[i + j] ^= gmul(p[i], q[j]); return r; }
function genPoly(n) { let g = Uint8Array.of(1); for (let i = 0; i < n; i++) g = polyMul(g, Uint8Array.of(1, EXP[i])); return g; }
export function rsEncode(msg, nsym) {
  const g = genPoly(nsym), out = new Uint8Array(msg.length + nsym); out.set(msg);
  for (let i = 0; i < msg.length; i++) { const c = out[i]; if (c) for (let j = 1; j < g.length; j++) out[i + j] ^= gmul(g[j], c); }
  out.set(msg); return out;
}
const polyEval = (p, x) => { let y = p[0]; for (let i = 1; i < p.length; i++) y = gmul(y, x) ^ p[i]; return y; };
/** returns the corrected message, or null if too damaged */
export function rsDecode(cw, nsym) {
  const n = cw.length, synd = new Uint8Array(nsym); let any = false;
  for (let i = 0; i < nsym; i++) { synd[i] = polyEval(cw, EXP[i]); if (synd[i]) any = true; }
  if (!any) return cw.slice(0, n - nsym);
  // Berlekamp-Massey (error locator, lowest degree first)
  let C = [1], B = [1], L = 0, m = 1, b = 1;
  for (let k = 0; k < nsym; k++) {
    let d = synd[k]; for (let i = 1; i <= L; i++) d ^= gmul(C[i] || 0, synd[k - i]);
    if (d === 0) { m++; continue; }
    const T = C.slice(), coef = gdiv(d, b);
    while (C.length < B.length + m) C.push(0);
    for (let i = 0; i < B.length; i++) C[i + m] ^= gmul(coef, B[i]);
    if (2 * L <= k) { L = k + 1 - L; B = T; b = d; m = 1; } else m++;
  }
  if (L * 2 > nsym) return null;
  // Chien search: positions where C(x^-1) = 0; position p counts from the end of the codeword
  const pos = [];
  for (let p = 0; p < n; p++) { const xinv = EXP[(255 - p) % 255]; let s = 0; for (let i = C.length - 1; i >= 0; i--) s = gmul(s, xinv) ^ (C[i] || 0); if (s === 0) pos.push(p); }
  if (pos.length !== L) return null;
  // Forney: error evaluator Omega = S(x) C(x) mod x^nsym
  const Om = new Uint8Array(nsym); for (let i = 0; i < nsym; i++) for (let j = 0; j <= i && j < C.length; j++) Om[i] ^= gmul(C[j] || 0, synd[i - j]);
  const out = cw.slice();
  for (const p of pos) {
    const X = EXP[p], xinv = EXP[(255 - p) % 255];
    let om = 0; for (let i = nsym - 1; i >= 0; i--) om = gmul(om, xinv) ^ Om[i];
    let dC = 0; for (let i = 1; i < C.length; i += 2) dC ^= gmul(C[i] || 0, EXP[(LOG[xinv] * (i - 1)) % 255]);
    if (!dC) return null;
    out[n - 1 - p] ^= gmul(X, gdiv(om, dC));
  }
  for (let i = 0; i < nsym; i++) if (polyEval(out, EXP[i])) return null;
  return out.slice(0, n - nsym);
}

// ------------------------------------------------------------------ layout
// Three cards share one frame of reference (the same four landmark dots), so one reader serves them all:
//   face  her face, fine facets: her whole LOOK (41 bytes) in one still image, for a phone held up to it (rear camera)
//   eyes  her face, coarse facets: one frame of a message she shows screen to screen (front cameras, a hand apart)
//   wing  his extended wing, magnified, the data in its hair field: one frame of his courtship dance
export const PAYLOAD = 41, NSYM = 24, BITS = (PAYLOAD + NSYM) * 8;     // the face card: 520 bits
const W = 1000, H = 1000;
export const FINDERS = [[70, 860], [930, 860], [500, 112], [500, 942]];  // L, R: bristle sockets on the cheeks; top: the median ocellus; bottom: the labellum
export const FINDER_R = 27;
const EYES = [{ cx: 268, cy: 498, rx: 214, ry: 268 }, { cx: 732, cy: 498, rx: 214, ry: 268 }];
const WING = [{ cx: 500, cy: 470, rx: 425, ry: 292 }];
export const SPECS = {
  face: { regions: EYES, D: 27, payload: PAYLOAD, nsym: NSYM, art: 'face' },
  eyes: { regions: EYES, D: 40, payload: 18, nsym: 10, art: 'face' },     // 230 facets, 224 used
  wing: { regions: WING, D: 40, payload: 20, nsym: 10, art: 'wing' },     // 247 hairs, 240 used
};
export const REGIONS = Object.fromEntries(Object.entries(SPECS).map(([k, v]) => [k, v.regions]));
const LAYOUTS = {};
export function layout(kind = 'face') {
  if (LAYOUTS[kind]) return LAYOUTS[kind];
  const sp = SPECS[kind], D = sp.D, FR = 0.40 * D, bits = (sp.payload + sp.nsym) * 8, cells = [];
  for (const [e, E] of sp.regions.entries()) {
    const rows = Math.ceil(E.ry / (D * 0.866)), cols = Math.ceil(E.rx / D) + 1;
    for (let r = -rows; r <= rows; r++) for (let c = -cols; c <= cols; c++) {
      const x = E.cx + (c + (r & 1 ? 0.5 : 0)) * D, y = E.cy + r * D * 0.866;
      const u = (x - E.cx) / (E.rx - FR), v = (y - E.cy) / (E.ry - FR); if (u * u + v * v <= 1) cells.push({ x, y, eye: e });
    }
  }
  // reading order: row by row, interleaving the eyes, so a glare on one region spreads its damage thin
  cells.sort((a, b) => (a.y - b.y) || (a.eye - b.eye) || (a.x - b.x));
  if (cells.length < bits) throw new Error(`only ${cells.length} facets for ${bits} bits`);
  return LAYOUTS[kind] = { W, H, D, FR, kind, art: sp.art, payload: sp.payload, nsym: sp.nsym, bits, cells, data: cells.slice(0, bits), spare: cells.slice(bits) };
}
function whiten(n) { let r = 0x1d5; const o = new Uint8Array(n); for (let i = 0; i < n; i++) { const b = ((r >> 8) ^ (r >> 4)) & 1; r = ((r << 1) | b) & 511; o[i] = b; } return o; }
/** a card's payload bytes -> one bit per facet (1 = dark) */
export function facetBits(payload, kind = 'face') {
  const L = layout(kind); if (payload.length !== L.payload) throw new Error(`a ${kind} card holds ${L.payload} bytes`);
  const cw = rsEncode(payload, L.nsym), wh = whiten(L.cells.length), bits = new Uint8Array(L.cells.length);
  for (let i = 0; i < L.bits; i++) bits[i] = ((cw[i >> 3] >> (7 - (i & 7))) & 1) ^ wh[i];
  for (let i = L.bits; i < L.cells.length; i++) bits[i] = wh[i];
  return bits;
}

// ------------------------------------------------------------------ drawing
/** the ink lines of her face (head capsule, antennae, bristles, mouthparts), as polylines in layout units */
export function inkLines(kind = 'face') {
  const art = SPECS[kind].art;
  const L = []; const arc = (cx, cy, rx, ry, a0, a1, n = 40) => { const p = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); } return p; };
  if (art === 'wing') {
    const E = WING[0]; L.push(arc(E.cx, E.cy, E.rx + 8, E.ry + 8, 0, 2 * Math.PI, 120));
    L.push([[E.cx - E.rx - 8, E.cy + 40], [E.cx - E.rx - 60, E.cy + 120], [90, 760]]);       // the wing's hinge, toward his body
    for (const [x0, y0, x1, y1] of [[160, 820, 260, 880], [840, 820, 740, 880], [380, 870, 420, 905], [620, 870, 580, 905]]) L.push([[x0, y0], [x1, y1]]);  // costal bristles
    return L;
  }
  for (const E of EYES) L.push(arc(E.cx, E.cy, E.rx + 6, E.ry + 6, 0, 2 * Math.PI, 90));
  L.push(arc(500, 520, 470, 480, Math.PI * 1.1, Math.PI * 1.9, 60));        // head capsule, top
  L.push([[455, 300], [430, 240], [395, 175]]); L.push([[545, 300], [570, 240], [605, 175]]);   // antennae
  L.push([[395, 175], [350, 150]]); L.push([[605, 175], [650, 150]]);                           // aristae
  for (const [x0, y0, x1, y1] of [[420, 135, 400, 100], [580, 135, 600, 100], [300, 205, 270, 175], [700, 205, 730, 175]]) L.push([[x0, y0], [x1, y1]]);  // bristles
  L.push(arc(500, 760, 70, 60, 0.15 * Math.PI, 0.85 * Math.PI, 24));          // face, lower edge
  L.push([[470, 800], [480, 860], [500, 885]]); L.push([[530, 800], [520, 860], [500, 885]]);  // proboscis
  return L;
}
/** draw into a greyscale buffer (0 black .. 255 white), size w x h, with a 3x3 homography from layout to pixels */
export function drawRaster(bits, w, h, Hm, kind = 'face') {
  const img = new Uint8ClampedArray(w * h).fill(236);
  const L = layout(kind), inv = invert3(Hm);
  const toL = (px, py) => { const z = inv[6] * px + inv[7] * py + inv[8]; return [(inv[0] * px + inv[1] * py + inv[2]) / z, (inv[3] * px + inv[4] * py + inv[5]) / z]; };
  const lines = inkLines(kind);
  const segs = []; for (const pl of lines) for (let i = 1; i < pl.length; i++) segs.push([pl[i - 1], pl[i]]);
  // a coarse grid of facets for lookup
  const G = 40, grid = new Map(); L.cells.forEach((c, i) => { const k = `${Math.floor(c.x / G)},${Math.floor(c.y / G)}`; (grid.get(k) || grid.set(k, []).get(k)).push(i); });
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const [x, y] = toL(px + 0.5, py + 0.5); if (x < 0 || y < 0 || x > W || y > H) { img[py * w + px] = 40; continue; }
    let v = 236;
    for (const E of REGIONS[kind]) { const u = (x - E.cx) / E.rx, q = (y - E.cy) / E.ry; if (u * u + q * q <= 1) v = 200; }
    const gx = Math.floor(x / G), gy = Math.floor(y / G);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const a = grid.get(`${gx + dx},${gy + dy}`); if (a) for (const i of a) { const c = L.cells[i]; if (hexInside(x - c.x, y - c.y, L.FR)) v = bits[i] ? 38 : 250; } }
    for (const [fx, fy] of FINDERS) if ((x - fx) ** 2 + (y - fy) ** 2 <= FINDER_R ** 2) v = 20;
    for (const [[x0, y0], [x1, y1]] of segs) if (segDist(x, y, x0, y0, x1, y1) < 2.6) { v = 60; break; }
    img[py * w + px] = v;
  }
  return img;
}
const hexInside = (dx, dy, r) => { dx = Math.abs(dx); dy = Math.abs(dy); return dy <= r * 0.866 && dx * 0.866 + dy * 0.5 <= r * 0.866; };
function segDist(x, y, x0, y0, x1, y1) { const vx = x1 - x0, vy = y1 - y0, t = Math.max(0, Math.min(1, ((x - x0) * vx + (y - y0) * vy) / (vx * vx + vy * vy))); return Math.hypot(x - x0 - t * vx, y - y0 - t * vy); }
/** draw her face on a 2D canvas context, filling size x size pixels */
export function drawCanvas(g, bits, size, { lit = null, kind = 'face' } = {}) {
  const L = layout(kind), s = size / W; g.save(); g.scale(s, s);
  g.fillStyle = '#ece4d6'; g.fillRect(0, 0, W, H);
  for (const E of REGIONS[kind]) { g.fillStyle = L.art === 'wing' ? '#d9cdbd' : '#c8b9a8'; g.beginPath(); g.ellipse(E.cx, E.cy, E.rx, E.ry, 0, 0, 7); g.fill(); }
  L.cells.forEach((c, i) => {
    g.fillStyle = bits[i] ? (L.art === 'wing' ? '#3a0f24' : '#5a1a1c') : '#fbf3e8';
    if (lit && lit[i]) g.fillStyle = bits[i] ? '#b8282c' : '#fff6e0';
    g.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3, x = c.x + L.FR * Math.cos(a), y = c.y + L.FR * Math.sin(a); k ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); g.fill();
  });
  g.strokeStyle = '#2a1a1e'; g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const pl of inkLines(kind)) { g.beginPath(); pl.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); }
  g.fillStyle = '#140c10'; for (const [x, y] of FINDERS) { g.beginPath(); g.arc(x, y, FINDER_R, 0, 7); g.fill(); }
  g.restore();
}

// ------------------------------------------------------------------ reading
/** solve the homography mapping 4 src points to 4 dst points; returns [h0..h8] */
export function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) { const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v); }
  const h = solve(A, b); return [...h, 1];
}
function solve(A, b) { const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; } }
  return M.map((r, i) => r[n] / r[i]); }
export function invert3(m) {
  const [a, b, c, d, e, f, g, h, i] = m, A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}
const apply = (m, x, y) => { const z = m[6] * x + m[7] * y + m[8]; return [(m[0] * x + m[1] * y + m[2]) / z, (m[3] * x + m[4] * y + m[5]) / z]; };

/** find round dark blobs (candidate finders) in a greyscale image */
export function findBlobs(img, w, h) {
  // adaptive threshold against a box mean (integral image), window ~ 1/12 of the width
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) { let s = 0; for (let x = 0; x < w; x++) { s += img[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + s; } }
  const R = Math.max(8, Math.round(w / 12)), dark = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.max(0, x - R), x1 = Math.min(w, x + R + 1), y0 = Math.max(0, y - R), y1 = Math.min(h, y + R + 1);
    const m = (I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0));
    dark[y * w + x] = img[y * w + x] < m * 0.6 ? 1 : 0;
  }
  const lab = new Int32Array(w * h), blobs = [], stack = []; let id = 0;
  for (let p = 0; p < w * h; p++) {
    if (!dark[p] || lab[p]) continue; id++; let n = 0, sx = 0, sy = 0, x0 = w, x1 = 0, y0 = h, y1 = 0; stack.push(p); lab[p] = id;
    while (stack.length) { const q = stack.pop(), x = q % w, y = (q - x) / w; n++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const r of [q - 1, q + 1, q - w, q + w]) if (r >= 0 && r < w * h && dark[r] && !lab[r] && Math.abs((r % w) - x) <= 1) { lab[r] = id; stack.push(r); } }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, fill = n / (bw * bh);
    if (n >= 12 && fill > 0.62 && fill < 0.9 && bw / bh > 0.6 && bw / bh < 1.66) blobs.push({ x: sx / n + 0.5, y: sy / n + 0.5, n, r: Math.sqrt(n / Math.PI) });
  }
  return blobs;
}
/** choose the four finders: the largest round blobs of similar size, ordered L, R, top, bottom */
/** choose four finders among the largest round blobs of similar size; returns candidate orderings [L, R, top, bottom].
 *  The bottom one (labellum / costal tip) is the one nearest both side dots; the top is farthest from it; the two
 *  sides are told apart by handedness, and the reader also tries them swapped, for a mirrored view. Any rotation works. */
export function pickFinders(blobs) {
  if (blobs.length < 4) return [];
  const big = blobs.slice().sort((a, b) => b.n - a.n).slice(0, 8), out = [];
  for (let s = 0; s + 4 <= big.length; s++) {
    const f = big.slice(s, s + 4); if (f[3].n < f[0].n * 0.45) continue;
    const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const score = f.map((a, i) => { const ds = f.filter((_, j) => j !== i).map(b => d(a, b)).sort((x, y) => x - y); return ds[0] + ds[1]; });
    const bi = score.indexOf(Math.min(...score)), B = f[bi];
    const rest = f.filter((_, i) => i !== bi), T = rest.reduce((m, a) => d(a, B) > d(m, B) ? a : m, rest[0]);
    const [p, q] = rest.filter(a => a !== T);
    // handedness: looking from B up to T, L is on the left (image coordinates, y down)
    const cross = (T.x - B.x) * (p.y - B.y) - (T.y - B.y) * (p.x - B.x);
    const [Lf, Rf] = cross < 0 ? [p, q] : [q, p];
    out.push([Lf, Rf, T, B], [Rf, Lf, T, B]);
    break;
  }
  return out;
}
/** read a card (her face, her eyes, or his wing) from a greyscale image. Returns {payload, finders, Hm, bits} or null. */
export function read(img, w, h, kind = 'face') {
  const cands = pickFinders(findBlobs(img, w, h)); if (!cands.length) return null;
  let first = null;
  for (const f of cands) {
    const r = readWith(img, w, h, kind, f); if (!r) continue;
    if (r.payload) return r; if (!first) first = r;
  }
  return first;
}
function readWith(img, w, h, kind, f) {
  const Hm = homography(FINDERS, f.map(b => [b.x, b.y])), L = layout(kind);
  const span = Math.hypot(f[1].x - f[0].x, f[1].y - f[0].y) / 860 * L.FR;
  const samp = L.cells.map(c => { const [px, py] = apply(Hm, c.x, c.y); let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = Math.round(px + dx * 0.35 * span), y = Math.round(py + dy * 0.35 * span); if (x >= 0 && y >= 0 && x < w && y < h) { s += img[y * w + x]; n++; } }
    return n ? s / n : 128; });
  // threshold: two-means on the facet samples
  let t = samp.reduce((a, b) => a + b, 0) / samp.length;
  for (let it = 0; it < 8; it++) { let a = 0, na = 0, b = 0, nb = 0; for (const v of samp) if (v < t) { a += v; na++; } else { b += v; nb++; } if (!na || !nb) return null; t = (a / na + b / nb) / 2; }
  const wh = whiten(L.cells.length), cw = new Uint8Array(L.payload + L.nsym), bits = new Uint8Array(L.cells.length);
  for (let i = 0; i < L.cells.length; i++) bits[i] = samp[i] < t ? 1 : 0;
  for (let i = 0; i < L.bits; i++) cw[i >> 3] |= (bits[i] ^ wh[i]) << (7 - (i & 7));
  const payload = rsDecode(cw, L.nsym);
  return { payload, finders: f, Hm, bits };
}
export function toGrey(rgba, w, h) { const g = new Uint8ClampedArray(w * h); for (let i = 0; i < w * h; i++) g[i] = (rgba[4 * i] * 77 + rgba[4 * i + 1] * 150 + rgba[4 * i + 2] * 29) >> 8; return g; }
