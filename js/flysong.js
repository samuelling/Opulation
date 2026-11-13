// Fly song as a data channel: every turn of the ritual is sung, not screeched.
//
// A turn is a courtship song: a sine-song hum to start, then pulse trains broken by short hums, as a real male
// alternates them. Each pulse carries four bits:
//   the interval since the previous pulse (two bits): 25, 30, 35 or 40 ms, inside the range of real pulse song;
//   the pulse's carrier (two bits): 250, 300, 350 or 400 Hz, the spread of real pulse carriers (Pslow to Pfast).
// On the air everything is three octaves up (x8), as the key song is, because phone speakers can't play 150-370 Hz.
//
// Frame: hum (300 ms) | 3 sync pulses | header: length, CRC-8 | payload + CRC-32. Header and payload are each
// rate-1/2 convolutionally coded (K=7, as in Screech) and interleaved, so a missed or doubled pulse costs a few soft
// bits, not the frame. A hum every 24 pulses re-anchors the timing.
// About 60 bits/s of payload: a 37-byte tap is ~6 s of song, a 100-byte link offer ~14 s.
import { convEncode, viterbi, crc32, crc8 } from './modem.js';

export const FS = {
  up: 8, ipiMs: [25, 30, 35, 40], carHz: [250, 300, 350, 400], humHz: 155,
  pulseSigma: 0.0011, pulseAmp: 0.6, humAmp: 0.16, humLead: 0.3, humBreak: 0.12, perTrain: 24,
  sync: [[1, 2], [3, 0], [0, 3]],   // (ipi, carrier) of the three sync pulses after the first
};
const IL = 16;
const bytesToBits = (b) => { const o = new Uint8Array(b.length * 8); for (let i = 0; i < b.length; i++) for (let k = 0; k < 8; k++) o[i * 8 + k] = (b[i] >> (7 - k)) & 1; return o; };
const bitsToBytes = (bits) => { const o = new Uint8Array(bits.length >> 3); for (let i = 0; i < o.length; i++) { let v = 0; for (let k = 0; k < 8; k++) v = (v << 1) | bits[i * 8 + k]; o[i] = v; } return o; };
function interleave(a) { const N = a.length, R = Math.ceil(N / IL), o = new (a.constructor)(N); let k = 0; for (let c = 0; c < IL; c++) for (let r = 0; r < R; r++) { const i = r * IL + c; if (i < N) o[k++] = a[i]; } return o; }
function deinterleave(a) { const N = a.length, R = Math.ceil(N / IL), o = new (a.constructor)(N); let k = 0; for (let c = 0; c < IL; c++) for (let r = 0; r < R; r++) { const i = r * IL + c; if (i < N) o[i] = a[k++]; } return o; }
const HDR_SYMS = Math.ceil(((2 * 8 + 6) * 2) / 4);          // 2 header bytes, coded: 11 pulses
const paySyms = (n) => Math.ceil((((n + 4) * 8 + 6) * 2) / 4);
const toSyms = (bits) => { const s = []; for (let i = 0; i < bits.length; i += 4) s.push([((bits[i] | 0) << 1) | (bits[i + 1] | 0), ((bits[i + 2] | 0) << 1) | (bits[i + 3] | 0)]); return s; };

/** bytes -> the song: a list of pulses {t (s), car} and hums {t0, t1}, at true fly pitch */
export function compose(bytes) {
  const hdr = Uint8Array.of(bytes.length, 0); hdr[1] = crc8(hdr.subarray(0, 1));
  const body = new Uint8Array(bytes.length + 4); body.set(bytes); const c = crc32(bytes);
  body[bytes.length] = c >>> 24; body[bytes.length + 1] = (c >>> 16) & 255; body[bytes.length + 2] = (c >>> 8) & 255; body[bytes.length + 3] = c & 255;
  const syms = [...FS.sync, ...toSyms(interleave(convEncode(bytesToBits(hdr)))), ...toSyms(interleave(convEncode(bytesToBits(body))))];
  const pulses = [], hums = []; let t = 0.03;
  hums.push({ t0: t, t1: t + FS.humLead }); t += FS.humLead + 0.05;
  pulses.push({ t, car: 0, first: true });
  syms.forEach(([ipi, car], i) => {
    if (i > 0 && i % FS.perTrain === 0) { const h0 = t + 0.035; hums.push({ t0: h0, t1: h0 + FS.humBreak }); t = h0 + FS.humBreak + 0.04; pulses.push({ t, car: 0, first: true }); }
    t += FS.ipiMs[ipi] / 1000; pulses.push({ t, car });
  });
  return { pulses, hums, end: t + 0.08, nSyms: syms.length };
}
export const seconds = (nBytes) => { const s = compose(new Uint8Array(nBytes)); return s.end; };

/** render on the air (x8) or at true pitch (up = 1) */
export function render(song, fs = 48000, up = FS.up) {
  const N = Math.ceil((song.end + 0.05) * fs), x = new Float32Array(N), sg = FS.pulseSigma * (up === 1 ? 2.2 : 1);
  for (const p of song.pulses) { const f = FS.carHz[p.car] * up, a = Math.max(0, Math.floor((p.t - 4 * sg) * fs)), b = Math.min(N, Math.ceil((p.t + 4 * sg) * fs));
    for (let n = a; n < b; n++) { const tt = n / fs - p.t; x[n] += FS.pulseAmp * Math.exp(-0.5 * (tt / sg) ** 2) * Math.cos(2 * Math.PI * f * tt); } }
  for (const h of song.hums) { const a = Math.floor(h.t0 * fs), b = Math.floor(h.t1 * fs), r = Math.round(0.01 * fs);
    for (let n = a; n < b; n++) { const e = Math.min(1, (n - a) / r, (b - n) / r); x[n] += FS.humAmp * e * Math.sin(2 * Math.PI * FS.humHz * up * n / fs); } }
  return x;
}

/**
 * Streaming decoder. push() microphone audio; events:
 *   {kind:'pulse', car}  every pulse heard (for the screen)
 *   {kind:'header', len, seconds}  {kind:'progress', frac}
 *   {kind:'frame', ok, bytes}
 */
export class FlySongDecoder {
  constructor({ sampleRate, onEvent = () => {}, up = FS.up }) {
    this.fs = sampleRate; this.onEvent = onEvent; this.n = 0;
    const freqs = [...FS.carHz.map(f => f * up), FS.humHz * up]; this.K = freqs.length;
    this.w = freqs.map(f => 2 * Math.PI * f / sampleRate); this.ph = new Float64Array(this.K);
    this.L = Math.max(4, Math.round(0.0025 * sampleRate));   // 2.5 ms: neighbouring carriers (400 Hz apart on the air) fall on its nulls
    this.bi = Array.from({ length: this.K }, () => new Float64Array(this.L)); this.bq = Array.from({ length: this.K }, () => new Float64Array(this.L));
    this.si = new Float64Array(this.K); this.sq = new Float64Array(this.K); this.k = 0; this.e = new Float64Array(this.K);
    this.floor = 1e-6; this.prev = [0, 0]; this.prevE = [null, null]; this.lastPeak = -1e9; this.humOn = -1e9; this.humRun = 0;
    this.reset();
  }
  reset() { this.state = 'search'; this.pulses = []; this.syms = []; this.lastT = 0; this.need = 0; this.len = 0; }
  push(x) {
    const K = this.K;
    for (let i = 0; i < x.length; i++) {
      const v = x[i]; let tot = 0;
      for (let j = 0; j < K; j++) {
        const ci = v * Math.cos(this.ph[j]), cq = -v * Math.sin(this.ph[j]); this.ph[j] += this.w[j]; if (this.ph[j] > 6.283185307179586) this.ph[j] -= 6.283185307179586;
        this.si[j] += ci - this.bi[j][this.k]; this.sq[j] += cq - this.bq[j][this.k]; this.bi[j][this.k] = ci; this.bq[j][this.k] = cq;
        this.e[j] = (this.si[j] ** 2 + this.sq[j] ** 2) / (this.L * this.L); if (j < 4) tot += this.e[j];
      }
      this.k = (this.k + 1) % this.L;
      const hum = this.e[4], n = this.n++;
      this.floor = tot < this.floor ? this.floor * 0.999 + tot * 0.001 : this.floor * 0.99999 + tot * 0.00001;
      // a hum is sustained sine song: its band dominating for 20 ms on end (a pulse's leakage is too brief)
      if (hum > 4 * tot && hum > 50 * this.floor) { if (++this.humRun > 0.02 * this.fs) { this.humOn = n; if (n - (this.humEv || 0) > 0.01 * this.fs) { this.humEv = n; this.onEvent({ kind: 'hum', t: n / this.fs }); } } } else this.humRun = 0;
      const [p2, p1] = this.prev;
      if (p1 > p2 && p1 >= tot && p1 > 40 * this.floor && p1 > 1e-7 && p1 > 2 * hum && (n - 1 - this.lastPeak) > 0.018 * this.fs) {
        const den = p2 - 2 * p1 + tot, off = den !== 0 ? 0.5 * (p2 - tot) / den : 0;
        this._pulse((n - 1 + off) / this.fs, this.prevE[1], n); this.lastPeak = n - 1;
      }
      this.prev = [p1, tot]; this.prevE = [this.prevE[1], this.e.slice(0, 4)];
      // a long silence ends whatever was being heard
      if (this.state !== 'search' && n / this.fs - this.lastT > 0.6) { this._finish(); }
    }
    this.onEvent({ kind: 'time', t: this.n / this.fs });
  }
  _pulse(t, E, n) {
    const best = E.indexOf(Math.max(...E));
    this.onEvent({ kind: 'pulse', car: best, t });
    // the first pulse after a hum starts a train (it carries no symbol); only the first
    const afterHum = (n - this.humOn) / this.fs < 0.068 && this.anchoredFor !== this.humOn;
    if (afterHum) this.anchoredFor = this.humOn;
    if (this.state === 'search') { if (afterHum) { this.state = 'sync'; this.lastT = t; this.syncN = 0; } return; }
    if (afterHum) { this.lastT = t; return; }                          // re-anchor after a break; it carries no symbol
    let d = (t - this.lastT) * 1000; this.lastT = t;
    if (d < 18) return;                                                 // an echo
    const ipi = FS.ipiMs;
    // a missed pulse: an interval too long for one symbol is two, the first unknown
    let lost = false;
    while (d > ipi[3] + 12 && this.state !== 'sync') { this._sym(null, null); d -= 32.5; lost = true; }
    if (this.state === 'sync') {
      const want = FS.sync[this.syncN], near = ipi.reduce((b, v, i) => Math.abs(d - v) < Math.abs(d - ipi[b]) ? i : b, 0);
      if (near === want[0] && best === want[1]) { if (++this.syncN === FS.sync.length) { this.state = 'header'; this.need = HDR_SYMS; } }
      else { this.state = 'search'; }
      return;
    }
    this._sym(lost ? null : d, E);   // after a lost pulse this interval is unknown too; the carrier still counts
  }
  _sym(d, E) {
    const ipi = FS.ipiMs, soft = [];
    if (d == null) soft.push(0, 0);
    else {
      // IPI: a score per level from its distance, then the two bits' soft values
      const sc = ipi.map(v => -Math.abs(d - v) / 2.5);
      const bit = (b) => { let m1 = -1e9, m0 = -1e9; for (let s = 0; s < 4; s++) { const on = (s >> (1 - b)) & 1; if (on) m1 = Math.max(m1, sc[s]); else m0 = Math.max(m0, sc[s]); } return Math.tanh((m1 - m0) / 2); };
      soft.push(bit(0), bit(1));
    }
    if (!E) soft.push(0, 0);
    else {
      const a = E.map(Math.sqrt), sum = a.reduce((x, y) => x + y, 1e-20);
      const cb = (b) => { let m1 = 0, m0 = 0; for (let s = 0; s < 4; s++) { const on = (s >> (1 - b)) & 1; if (on) m1 = Math.max(m1, a[s]); else m0 = Math.max(m0, a[s]); } return (m1 - m0) / sum * 2; };
      soft.push(cb(0), cb(1));
    }
    this.syms.push(...soft);
    if (this.state === 'header' && this.syms.length >= HDR_SYMS * 4) {
      const nb = 2 * 8, coded = (nb + 6) * 2, s = deinterleave(Float64Array.from(this.syms.slice(0, coded)));
      const h = bitsToBytes(viterbi(s, nb));
      if (crc8(h.subarray(0, 1)) !== h[1] || h[0] === 0) { this.reset(); return; }
      this.len = h[0]; this.state = 'payload'; this.syms = this.syms.slice(HDR_SYMS * 4); this.need = paySyms(this.len);
      this.onEvent({ kind: 'header', len: this.len, seconds: seconds(this.len) });
    } else if (this.state === 'payload') {
      this.onEvent({ kind: 'progress', frac: Math.min(1, this.syms.length / 4 / this.need) });
      if (this.syms.length >= this.need * 4) this._finish();
    }
  }
  _finish() {
    if (this.state === 'payload') {
      const nb = (this.len + 4) * 8, coded = (nb + 6) * 2, s = new Float64Array(coded); s.set(this.syms.slice(0, coded));
      const body = bitsToBytes(viterbi(deinterleave(s), nb)), pay = body.subarray(0, this.len);
      const c = ((body[this.len] << 24) | (body[this.len + 1] << 16) | (body[this.len + 2] << 8) | body[this.len + 3]) >>> 0;
      const ok = crc32(pay) === c; this.onEvent({ kind: 'frame', ok, bytes: ok ? pay.slice() : null });
    }
    this.reset();
  }
  flush() { this.push(new Float32Array(Math.round(0.7 * this.fs))); }
}
/** decode a whole buffer (tests) */
export function decodeAll(x, fs) { const out = []; const d = new FlySongDecoder({ sampleRate: fs, onEvent: (e) => { if (e.kind === 'frame') out.push(e); } }); for (let i = 0; i < x.length; i += 2048) d.push(x.subarray(i, i + 2048)); d.flush(); return out; }
