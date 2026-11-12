// The female's ears and song pathway: FlyHarp's FlyWire auditory network (4,222 neurons, 1.35 M synapses),
// run in pure integer arithmetic (Q16 fixed point) so that both phones, and Swift and JavaScript, compute
// exactly the same brain. Every constant that needed floating point to make is frozen in data/female-model.json
// (tools/make-model.mjs). Operations used here: +, -, * of integers below 2^53, floor shifts and floor division.
// Swift port: Opulation/Core/FemaleBrain.swift (same operations on Int64).
//
// Dynamics, as in FlyHarp's js/ear-net.js:
//   JONs:       d = gain * env / (env + c),  c = c50 + kNorm * pooled energy (divisive normalisation),
//               a += (d - a) * dt/tauA,  r = clamp(d - kA * a, 0, 1)
//   downstream: tau dV/dt = -V + G * p_i * sum_j w_ij r_j,  r = max(0, tanh V)
// with w_ij = sign(j) * synapses(j -> i) / all input synapses onto i, and one change for Opulation:
//   p_i, a per-neuron gain between 0.875 and 1.125 drawn from the session's shared seed: her individuality.
// Both phones hold the same seed only if they ran the key exchange with the same passphrase.

export const shr = (x, k) => Math.floor(x / 2 ** k);
export function floorDiv(a, b) { let q = Math.floor(a / b); if (q * b > a) q -= 1; else if ((q + 1) * b <= a) q += 1; return q; }
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

export class FemaleBrain {
  /** meta: data/ear.json; bin: ArrayBuffer of data/ear.bin; M: data/female-model.json; pers: Uint8Array(2*N) from the seed */
  constructor(meta, bin, M, pers) {
    const N = meta.n; this.N = N; this.M = M; this.meta = meta; const Q = 1 << 16; this.Q = Q;
    const rowptr = new Int32Array(bin, 0, N + 1), E = rowptr[N];
    const pre = new Uint16Array(bin, 4 * (N + 1), E), syn = new Uint16Array(bin, 4 * (N + 1) + 2 * E, E);
    this.rowptr = rowptr; this.pre = pre; this.nJ = meta.tiers[0];
    const sq = meta.sign.map(s => M.signQ8[String(s)] ?? (s > 0 ? 256 : s < 0 ? -256 : 0));
    this.w = new Float64Array(E);                 // holds exact integers
    for (let i = 0; i < N; i++) { const tot = Math.max(meta.intot[i], 1); for (let p = rowptr[i]; p < rowptr[i + 1]; p++) this.w[p] = floorDiv(sq[pre[p]] * syn[p] * 256, tot); }
    this.tierAlpha = new Int32Array(N); let k = 0;
    meta.tiers.forEach((n, t) => { for (let j = 0; j < n; j++) this.tierAlpha[k++] = M.alpha[t]; });
    this.p = new Int32Array(N).fill(Q);
    for (let i = this.nJ; i < N; i++) this.p[i] = Q - M.personality + ((pers[2 * i] | (pers[2 * i + 1] << 8)) % (2 * M.personality + 1));
    this.V = new Float64Array(N); this.r = new Float64Array(N); this.acc = new Float64Array(N); this.jA = new Float64Array(this.nJ);
    this.readout = M.readout;
  }
  reset() { this.V.fill(0); this.r.fill(0); this.jA.fill(0); }
  /** one 5 ms frame from the antennae: [ear0 push NB, ear0 pull NB, ear1 push NB, ear1 pull NB, slow0, slow1], Q16 ints */
  input(f) {
    const M = this.M, NB = M.NB, J = M.jon, r = this.r, pool = [0, 0];
    for (let e = 0; e < 2; e++) { let s = 0; for (let b = 0; b < 2 * NB; b++) s += f[e * 2 * NB + b]; pool[e] = floorDiv(s, 2 * NB); }
    for (let j = 0; j < this.nJ; j++) {
      const e = J.ear[j], slow = J.slow[j];
      const env = slow ? f[4 * NB + e] : f[e * 2 * NB + J.pol[j] * NB + J.band[j]];
      const c = slow ? M.cSlow : M.c50 + M.kNorm * pool[e];
      const d = floorDiv(J.gain[j] * env, env + c);
      this.jA[j] += shr((d - this.jA[j]) * J.dtTauA[j], 16);
      r[j] = clamp(d - shr(J.kA[j] * this.jA[j], 16), 0, this.Q);
    }
  }
  step() {
    const N = this.N, rp = this.rowptr, pre = this.pre, w = this.w, r = this.r, V = this.V, acc = this.acc, G = this.M.G, L = this.M.tanhLUT;
    for (let i = this.nJ; i < N; i++) { let s = 0; for (let q = rp[i]; q < rp[i + 1]; q++) s += w[q] * r[pre[q]]; acc[i] = shr(shr(s, 16) * G * this.p[i], 16); }
    for (let i = this.nJ; i < N; i++) { V[i] += shr(this.tierAlpha[i] * (acc[i] - V[i]), 16); const v = V[i]; r[i] = v > 0 ? L[Math.min(shr(v, 6), 4096)] : 0; }
  }
  /** mean activity (Q16) of the song-pathway readout: AVLP / PVLP / WED cells that respond most to pulse song */
  drive() { let s = 0; for (const i of this.readout) s += this.r[i]; return floorDiv(s, this.readout.length); }
  /** a digest of the whole network state, for cross-platform test vectors */
  digest() { let h = 2166136261; const mix = (x) => { h = Math.imul(h ^ (x & 0xffff), 16777619) >>> 0; h = Math.imul(h ^ ((x / 65536) & 0xffff), 16777619) >>> 0; }; for (let i = 0; i < this.N; i++) mix(this.V[i] - Math.floor(this.V[i] / 2 ** 32) * 2 ** 32); return h >>> 0; }
}

/** Personality bytes (2 per neuron) from the 32-byte shared seed: BLAKE2b-512 in counter mode, keyed by the seed. */
export function personality(sodium, seed, N) {
  const out = new Uint8Array(2 * N); let k = 0;
  for (let c = 0; k < out.length; c++) {
    const blk = sodium.crypto_generichash(64, Uint8Array.of(c & 255, (c >> 8) & 255, 0x4f, 0x50), seed);
    out.set(blk.subarray(0, Math.min(64, out.length - k)), k); k += 64;
  }
  return out;
}
