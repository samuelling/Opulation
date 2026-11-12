// Female determinism, calibration and agreement with the crypto. Imported by tools/test.mjs.
import fs from 'fs';
import { FemaleBrain, personality } from '../js/female.js';
import * as Song from '../js/song.js';
const ROOT = new URL('..', import.meta.url).pathname;
export function loadBrainParts() {
  const meta = JSON.parse(fs.readFileSync(ROOT + 'data/ear.json')), M = JSON.parse(fs.readFileSync(ROOT + 'data/female-model.json'));
  const b = fs.readFileSync(ROOT + 'data/ear.bin'); return { meta, M, bin: b.buffer.slice(b.byteOffset, b.byteOffset + b.length) };
}
export function runSession(S, parts, seed, heard, expected) {
  const brain = new FemaleBrain(parts.meta, parts.bin, parts.M, personality(S, seed, parts.meta.n));
  let last = null; const trace = []; for (const st of Song.listen(brain, heard, expected, parts.M)) { last = st; trace.push(st.R); }
  return { last, trace, digest: brain.digest(), verdict: Song.decide(last) };
}
export async function run(ok, S) {
  const parts = loadBrainParts(), M = parts.M;
  const rnd = (n) => S.randombytes_buf(n);
  // determinism: same seed and song -> identical state
  const seed = rnd(32), tag = rnd(16), sy = Song.symbolsOf(tag);
  ok(Song.tagOf(sy).every((v, i) => v === tag[i]), 'tag <-> symbols');
  const t0 = Date.now(), a = runSession(S, parts, seed, sy, sy), b = runSession(S, parts, seed, sy, sy);
  ok(a.digest === b.digest && a.last.R === b.last.R, `deterministic (digest ${a.digest.toString(16)}, R ${a.last.R}, ${Date.now() - t0} ms for two runs)`);
  { // heard train by train, as on the phone, gives exactly the same female
    const brain = new FemaleBrain(parts.meta, parts.bin, M, personality(S, seed, parts.meta.n)), L = new Song.Listener(brain, sy, M);
    for (let t = 1; t <= Song.TRAINS; t++) L.advance(sy.slice(0, t * Song.PER_TRAIN), false);
    L.advance(sy, true);
    ok(brain.digest() === a.digest && L.last.R === a.last.R && L.verdict === a.verdict, 'train-by-train listening == all at once'); }
  { // cross-platform vector: a fixed seed and tag (the Swift port must reproduce these numbers)
    const vs = new Uint8Array(32).map((_, i) => i), vt = new Uint8Array(16).map((_, i) => 0xa5 ^ (i * 17));
    const v = runSession(S, parts, vs, Song.symbolsOf(vt), Song.symbolsOf(vt));
    const vec = { seed: S.to_hex(vs), tag: S.to_hex(vt), personality16: S.to_hex(personality(S, vs, parts.meta.n).subarray(0, 16)), frames: v.trace.length, R: v.last.R, digest: v.digest, verdict: v.verdict, Rat: [50, 200, 400, 600].map(k => v.trace[k]) };
    const path = ROOT + 'data/vectors.json';
    if (process.env.WRITE_VECTORS || !fs.existsSync(path)) fs.writeFileSync(path, JSON.stringify(vec, null, 1));
    const want = JSON.parse(fs.readFileSync(path));
    ok(JSON.stringify(want) === JSON.stringify(vec), `matches data/vectors.json (R ${vec.R}, digest ${vec.digest.toString(16)})`); }
  const c = runSession(S, parts, rnd(32), sy, sy);
  ok(c.digest !== a.digest, 'a different seed gives a different female');
  // calibration over sessions
  const n = +(process.env.SESSIONS || 12), Rs = [], wrongAt = [];
  for (let i = 0; i < n; i++) {
    const sd = rnd(32), tg = rnd(16), s1 = Song.symbolsOf(tg);
    Rs.push(runSession(S, parts, sd, s1, s1).last.R);
    const other = Song.symbolsOf(rnd(16)), r = runSession(S, parts, sd, s1, other);
    wrongAt.push(r.verdict === 'reject' ? r.last.t : -1);
  }
  Rs.sort((x, y) => x - y);
  console.log('     R at the end of a true song: min', Rs[0], 'median', Rs[Rs.length >> 1], 'max', Rs[Rs.length - 1]);
  console.log('     wrong key: rejected after', wrongAt.map(t => t.toFixed(2)).join(' '), 's');
  ok(Rs[0] >= Song.LISTEN.THETA, `every true song reaches THETA=${Song.LISTEN.THETA}`);
  ok(wrongAt.every(t => t > 0), 'every wrong key is rejected');
  // a few wrong notes are forgiven, more are not
  { const sd = rnd(32), tg = rnd(16), s1 = Song.symbolsOf(tg), h = s1.slice(); for (const k of [3, 20, 41, 60]) h[k] = (h[k] + 1) & 3;
    ok(runSession(S, parts, sd, h, s1).verdict === 'accept', '4 wrong notes are forgiven');
    h[50] = (h[50] + 2) & 3; ok(runSession(S, parts, sd, h, s1).verdict === 'reject', '5 wrong notes are not'); }
  // on the air: render, add echo and noise, detect
  for (const [echo, noise] of [[0, 0], [0.5, 0.02], [0.7, 0.05]]) {
    const fs = 48000, sch = Song.schedule(sy, M), x = Song.renderAir(sch, M, fs), y = new Float32Array(x.length + fs);
    const d1 = Math.round(0.004 * fs), d2 = Math.round(0.011 * fs);
    for (let i = 0; i < x.length; i++) { y[i + 2000] += x[i]; y[i + 2000 + d1] += echo * x[i]; y[i + 2000 + d2] += 0.6 * echo * x[i]; }
    for (let i = 0; i < y.length; i++) y[i] += noise * (Math.random() * 2 - 1);
    let got = null; const det = new Song.SongDetector(M, fs, (e) => { got = e.symbols; });
    for (let i = 0; i < y.length; i += 1024) det.push(y.subarray(i, i + 1024)); det.flush();
    const errs = got ? got.reduce((s, v, i) => s + (v !== sy[i]), 0) : 99;
    ok(errs <= 1, `air: echo ${echo}, noise ${noise} -> ${errs} symbol errors`);
  }
}
