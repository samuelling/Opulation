// node tools/make-model.mjs  -> data/female-model.json
//
// Freezes every constant the female's ear network needs as an integer, so the network itself runs in pure
// integer arithmetic and gives bit-identical results in Swift and JavaScript. Floating point is used only here,
// once, at build time. Everything follows FlyHarp's Tonnectome (js/ear-net.js, js/ear-worklet.js):
// same FlyWire network (data/ear.json, ear.bin), same JON groups, time constants and antenna filterbank.
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = new URL('..', import.meta.url).pathname;
const meta = JSON.parse(fs.readFileSync(ROOT + 'data/ear.json'));
const Q = 65536, q = (x) => Math.round(x * Q);

// ---- antenna filterbank (as js/ear-worklet.js), run once on the ideal song carriers
const NB = 32, FLO = 40, FHI = 1600, QF = 5, F0 = 250, QA = 0.8;
function bandProfile(freq, fsr = 48000) {
  const fc = Array.from({ length: NB }, (_, k) => FLO * Math.pow(FHI / FLO, k / (NB - 1)));
  const P = fc.map(f => { const w = 2 * Math.PI * f / fsr, al = Math.sin(w) / (2 * QF), a0 = 1 + al, r = f / F0 - F0 / f;
    return { b0: al / a0, a1: -2 * Math.cos(w) / a0, a2: (1 - al) / a0, g: 1 / Math.sqrt(1 + (QA * r) ** 2), x1: 0, x2: 0, y1: 0, y2: 0 }; });
  const push = new Float64Array(NB), pull = new Float64Array(NB), N = fsr, skip = fsr / 2;  // 1 s tone, measure the 2nd half
  for (let n = 0; n < N; n++) {
    const x = Math.sin(2 * Math.PI * freq * n / fsr);
    P.forEach((p, k) => { const y = p.b0 * x - p.b0 * p.x2 - p.a1 * p.y1 - p.a2 * p.y2; p.x2 = p.x1; p.x1 = x; p.y2 = p.y1; p.y1 = y;
      if (n >= skip) { const u = y * p.g; if (u > 0) push[k] += u; else pull[k] -= u; } });
  }
  return { push: Array.from(push, v => q(v / (N - skip))), pull: Array.from(pull, v => q(v / (N - skip))) };
}

// ---- the song (true fly frequencies; the phones transpose it up for their speakers)
export const SONG = {
  tick: 0.00025,                       // s; every song time is a whole number of ticks
  frameTicks: 20,                      // 5 ms network step, as in FlyHarp
  pulseHz: 270, sineHz: 155,           // D. melanogaster pulse carrier ~200-300 Hz, sine song ~150 Hz
  pulseAmp: 0.3, sineAmp: 0.12, pulseSigma: 0.0025,
  ipiTicks: [120, 144, 168, 192],      // 30, 36, 42, 48 ms: two bits per inter-pulse interval
};
const pulseProf = bandProfile(SONG.pulseHz), sineProf = bandProfile(SONG.sineHz);
// mean Gaussian envelope over one 5 ms frame, for a pulse centred `off` ticks after the frame starts
const OFF = 80, envTable = [];
for (let off = -OFF; off <= OFF; off++) {
  let s = 0; const M = 200;
  for (let i = 0; i < M; i++) { const t = (i + 0.5) / M * SONG.frameTicks * SONG.tick, tc = off * SONG.tick; s += Math.exp(-0.5 * ((t - tc) / SONG.pulseSigma) ** 2); }
  envTable.push(q(s / M));
}

// ---- JON assignment, exactly as EarNet does it (band spread uses log/pow, so it is frozen here)
const GROUP = {
  A: { lo: 250, hi: 1000, tauA: 0.04, kA: 0.85, gain: 1.0 }, B: { lo: 60, hi: 300, tauA: 0.25, kA: 0.35, gain: 1.0 },
  D: { lo: 80, hi: 700, tauA: 0.12, kA: 0.5, gain: 0.8 }, X: { lo: 80, hi: 700, tauA: 0.12, kA: 0.5, gain: 0.6 },
  C: { slow: 1, tauA: 1.0, kA: 0.2, gain: 0.3 }, E: { slow: 1, tauA: 1.0, kA: 0.2, gain: 0.3 }, F: { slow: 1, tauA: 0.5, kA: 0.3, gain: 0.15 },
};
const bandOf = f => Math.max(0, Math.min(NB - 1, Math.round((NB - 1) * Math.log(f / FLO) / Math.log(FHI / FLO))));
const nJ = meta.tiers[0], jon = { ear: [], band: [], pol: [], slow: [], gain: [], kA: [], dtTauA: [] };
const byGroup = {}; for (let j = 0; j < nJ; j++) (byGroup[meta.jo[j]] = byGroup[meta.jo[j]] || []).push(j);
for (let j = 0; j < nJ; j++) { jon.ear.push(0); jon.band.push(0); jon.pol.push(0); jon.slow.push(0); jon.gain.push(0); jon.kA.push(0); jon.dtTauA.push(0); }
for (const [g, js] of Object.entries(byGroup)) {
  const P = GROUP[g] || GROUP.X;
  js.forEach((j, k) => {
    jon.ear[j] = meta.side[j] === 'R' ? 1 : 0; jon.pol[j] = k & 1; jon.slow[j] = P.slow ? 1 : 0;
    if (!P.slow) jon.band[j] = bandOf(P.lo * Math.pow(P.hi / P.lo, (k + 0.5) / js.length));
    jon.gain[j] = q(P.gain); jon.kA[j] = q(P.kA); jon.dtTauA[j] = q(0.005 / P.tauA);
  });
}
const TAU = [0.005, 0.01, 0.025, 0.06];
const tanhLUT = Array.from({ length: 4097 }, (_, i) => q(Math.tanh(i / 1024)));   // index = V >> 6, V in Q16, up to 4.0

// ---- which neurons to read: the song pathway's strongest responders downstream of the AMMC, from a float run
const EarNet = require(ROOT + '../flyharp/js/ear-net.js');   // FlyHarp's float network, as a reference only
const bin = fs.readFileSync(ROOT + 'data/ear.bin'), ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.length);
const net = new EarNet(meta, ab);
const frameOf = (env, prof, slowAbs) => { const f = new Float32Array(4 * NB + 2); for (let e = 0; e < 2; e++) for (let b = 0; b < NB; b++) { f[e * 2 * NB + b] = env * prof.push[b] / Q; f[e * 2 * NB + NB + b] = env * prof.pull[b] / Q; } f[4 * NB] = f[4 * NB + 1] = slowAbs; return f; };
const resp = new Float64Array(meta.n); let slow = 0;
for (let k = 0; k < 1200; k++) {               // 6 s of 36 ms pulse song
  const tk = k * 20, off = (tk % 144) - 0, ph = tk % 144; const c = ph < OFF ? envTable[OFF - ph] : 0;
  const env = SONG.pulseAmp * c / Q; slow += 0.0488 * (env * 2 / Math.PI - slow);
  net.input(frameOf(env, pulseProf, slow)); net.step();
  if (k > 200) for (let i = 0; i < meta.n; i++) resp[i] += net.r[i];
}
// the song-processing areas that lead toward vpoEN (AVLP, PVLP, WED), central neurons only
const SONG_NP = new Set(['AVLP', 'PVLP', 'WED']);
const cand = []; for (let i = meta.tiers[0] + meta.tiers[1]; i < meta.n; i++) if (SONG_NP.has(meta.np[i]) && meta.cls[i] === 'central') cand.push(i);
cand.sort((a, b) => resp[b] - resp[a]);
const readout = cand.slice(0, 32).sort((a, b) => a - b);
const named = {}; meta.type.forEach((t, i) => { if (t === 'vpoEN') (named.vpoEN = named.vpoEN || []).push(i); });

const model = {
  about: 'Integer constants for the Opulation female (Q16 fixed point). Built by tools/make-model.mjs from FlyHarp\'s Tonnectome; network = FlyWire v783 auditory network (data/ear.json, ear.bin).',
  Q: 16, NB, dtTicks: SONG.frameTicks, song: SONG,
  G: 8, alpha: TAU.map(t => q(Math.min(1, 0.005 / t))), c50: q(0.01), cSlow: q(0.2), kNorm: 3, aSlow: q(1 - Math.exp(-0.005 / 0.1)),
  signQ8: { '1': 256, '-1': -256, '0.3': 77 }, personality: 8192,
  jon, tanhLUT, envOff: OFF, envTable, pulseProf, sineProf,
  pulseAbs: q(SONG.pulseAmp * 2 / Math.PI), sineAbs: q(SONG.sineAmp * 2 / Math.PI), pulseAmp: q(SONG.pulseAmp), sineAmp: q(SONG.sineAmp),
  readout, named,
};
fs.writeFileSync(ROOT + 'data/female-model.json', JSON.stringify(model));
console.log('readout', readout.length, 'top responses', cand.slice(0, 5).map(i => (resp[i] / 1000).toFixed(4) + ':' + meta.type[i] + '/' + meta.np[i]).join(' '));
console.log('readout neuropils', Object.entries(readout.reduce((a, i) => (a[meta.np[i]] = (a[meta.np[i]] || 0) + 1, a), {})));
console.log('vpoEN response', named.vpoEN.map(i => (resp[i] / 1000).toFixed(5)));
