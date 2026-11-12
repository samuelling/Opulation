// His eye: FlyHarp's optic lobe. While his camera looks at her face, the same image is sampled onto the 721
// ommatidia of the flyvis connectome-constrained model (Lappalainen et al. 2024; FIB-SEM optic-lobe wiring,
// 45,669 neurons, 65 cell types), run in a worker (js/fly/, copied from FlyHarp), and drawn as FlyHarp's lenses:
// photoreceptors, the ON and OFF channels of the medulla, and T4/T5 motion.
//
// Two honest notes. A fly's eye resolves about 5 degrees per facet, so his optic lobe sees her as a fly would: a
// pale head and two dark eyes, never the individual facets. The phone camera reads the code; his optic lobe
// shows what a fly would make of the same view. And LC10a, the visual projection neuron that drives a courting
// male to follow a female, lies beyond the lobula, outside this model; here it is driven by a stand-in: the
// OFF and motion activity in the front of his eye.
export class FlyEye {
  constructor() {
    this.ready = new Promise((res, rej) => {
      this.w = new Worker(new URL('./fly/worker.js', import.meta.url));
      this.w.onerror = (e) => rej(e);
      this.w.onmessage = (ev) => {
        const m = ev.data;
        if (m.cmd === 'ready') { this.meta = m; this._prep(); res(this); }
        else if (m.cmd === 'frames' && this._wait) { const f = this._wait; this._wait = null; f(m); }
      };
      this.w.postMessage({ cmd: 'init', url: new URL('../data/fly.json', import.meta.url).href });
    });
  }
  _prep() {
    const m = this.meta, T = (n) => m.types.indexOf(n);
    this.X = Float32Array.from(m.x); this.Y = Float32Array.from(m.y); this.nC = this.X.length;
    let R = 0; for (let i = 0; i < this.nC; i++) R = Math.max(R, Math.hypot(this.X[i], this.Y[i])); this.R = R;
    const node = (names) => names.map(T).filter(t => t >= 0).map(t => m.nodeOf[t]);
    this.groups = { on: node(['Mi1', 'Tm3']), off: node(['Tm1', 'Tm2', 'Tm4', 'Tm9']), lam: node(['L1', 'L2']),
      t4: node(['T4a', 'T4b', 'T4c', 'T4d']), t5: node(['T5a', 'T5b', 'T5c', 'T5d']) };
    this.front = []; for (let i = 0; i < this.nC; i++) if (Math.hypot(this.X[i], this.Y[i]) < R / 2.5) this.front.push(i);
    this.lum = new Float32Array(this.nC); this.max = { on: 0.05, off: 0.05, mo: 0.05 };
  }
  /** sample an RGBA frame (w x h) onto the eye: a centred square, +Y up, re-centred on grey as in FlyHarp */
  sample(rgba, w, h, contrast = 0.8) {
    const s = (Math.min(w, h) * 0.45) / this.R, L = this.lum; let mean = 0;
    for (let i = 0; i < this.nC; i++) {
      const cx = Math.round(w / 2 + this.X[i] * s), cy = Math.round(h / 2 - this.Y[i] * s); let acc = 0, n = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const x = Math.min(w - 1, Math.max(0, cx + dx)), y = Math.min(h - 1, Math.max(0, cy + dy)), o = 4 * (y * w + x);
        acc += 0.2126 * rgba[o] + 0.7152 * rgba[o + 1] + 0.0722 * rgba[o + 2]; n++;
      }
      L[i] = acc / n / 255; mean += L[i];
    }
    mean /= this.nC; for (let i = 0; i < this.nC; i++) L[i] = Math.min(1, Math.max(0, 0.5 + (L[i] - mean) * 2 * contrast));
    return L;
  }
  /** run `steps` 20 ms steps on the current image; resolves with per-column lens values */
  async step(steps = 2) {
    if (this._wait) return null;
    const p = new Promise(r => { this._wait = r; });
    this.w.postMessage({ cmd: 'run', frames: Array.from({ length: steps }, () => Float32Array.from(this.lum)) });
    const m = await p, dV = m.dV, nC = this.nC;
    const col = (groups, sign = 1, abs = false) => { const o = new Float32Array(nC);
      for (const nodes of groups) for (let c = 0; c < nC; c++) { const i = nodes[c]; if (i >= 0) { const v = sign * dV[i]; o[c] += abs ? Math.max(0, v) : v; } } return o; };
    const on = col(this.groups.on), off = col(this.groups.off), mo = new Float32Array(nC), dir = new Float32Array(nC);
    // motion: the strongest-responding T4/T5 subtype gives the direction (a: front-to-back, b: back-to-front, c: up, d: down)
    const ANG = [0, Math.PI, Math.PI / 2, -Math.PI / 2];
    for (let c = 0; c < nC; c++) { let best = 0, k = 0; for (let s = 0; s < 4; s++) { const i4 = this.groups.t4[s]?.[c], i5 = this.groups.t5[s]?.[c];
      const v = Math.max(0, i4 >= 0 ? dV[i4] : 0) + Math.max(0, i5 >= 0 ? dV[i5] : 0); mo[c] += v; if (v > best) { best = v; k = s; } } dir[c] = ANG[k]; }
    let lc = 0; for (const c of this.front) lc += Math.max(0, off[c]) + mo[c]; lc /= this.front.length;
    for (const [k, a] of [['on', on], ['off', off], ['mo', mo]]) { let mx = 0; for (const v of a) mx = Math.max(mx, Math.abs(v)); this.max[k] = Math.max(0.02, this.max[k] * 0.97, mx); }
    return { photo: this.lum, on, off, mo, dir, lc10: lc };
  }
  /** draw the four lenses into a canvas */
  draw(canvas, L) {
    const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height, panels = [['photoreceptors', 'photo'], ['ON: Mi1, Tm3', 'on'], ['OFF: Tm1, 2, 4, 9', 'off'], ['motion: T4, T5', 'mo']];
    g.fillStyle = '#12040c'; g.fillRect(0, 0, W, H);
    const pw = W / 4, s = (pw * 0.44) / this.R, r = Math.max(1.5, s * 0.55);
    panels.forEach(([label, key], p) => {
      const ox = pw * p + pw / 2, oy = H / 2 - 8;
      for (let c = 0; c < this.nC; c++) {
        const x = ox + this.X[c] * s, y = oy - this.Y[c] * s; let col;
        if (key === 'photo') { const v = Math.round(255 * L.photo[c]); col = `rgb(${v},${Math.round(v * 0.93)},${Math.round(v * 0.85)})`; }
        else if (key === 'mo') { const a = Math.min(1, L.mo[c] / this.max.mo); const hue = (L.dir[c] * 180 / Math.PI + 360) % 360; col = `hsla(${hue},80%,60%,${a})`; }
        else { const v = L[key][c] / this.max[key]; col = v > 0 ? `rgba(240,160,75,${Math.min(1, v)})` : `rgba(90,166,232,${Math.min(1, -v)})`; }
        g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
      g.fillStyle = 'rgba(243,227,211,.9)'; g.font = '22px "Courier Prime", monospace'; g.textAlign = 'center'; g.fillText(label, ox, H - 8);
    });
    g.textAlign = 'left';
  }
}
