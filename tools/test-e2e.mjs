// The whole ritual between two simulated phones: her face through a (simulated) camera, every sound turn through
// a (simulated) room with echo and noise, her brain listening train by train. Same code paths as the app.
import * as C from '../js/cpace.js';
import * as P from '../js/protocol.js';
import * as Song from '../js/song.js';
import * as F from '../js/flycode.js';
import { FemaleBrain, personality } from '../js/female.js';
import * as Sung from '../js/flysong.js';
import * as V from '../js/visual.js';
import { loadBrainParts } from './test-female.mjs';
const FS = 48000;
function room(x) { const y = new Float32Array(x.length + FS / 2), d = Math.round(0.006 * FS); for (let i = 0; i < x.length; i++) { y[i + 1000] += 0.7 * x[i]; y[i + 1000 + d] += 0.3 * x[i]; } for (let i = 0; i < y.length; i++) y[i] += 0.01 * (Math.random() * 2 - 1); return y; }
const over = (bytes) => { const ev = Sung.decodeAll(room(Sung.render(Sung.compose(bytes), FS)), FS).filter(e => e.ok); return ev.length ? ev[0].bytes : null; };   // sung, through the room
export async function ritual(S, parts, herPass, hisPass) {
  const M = parts.M;
  // she shows her face; his camera reads it
  const her = new C.Initiator(herPass), bits = F.facetBits(P.look(her));
  const img = F.drawRaster(bits, 640, 480, F.homography([[0, 0], [1000, 0], [1000, 1000], [0, 1000]], [[140, 70], [520, 95], [510, 455], [125, 430]]));
  const seen = P.parseLook(F.read(img, 640, 480)?.payload); if (!seen) return 'blind';
  // he taps
  const him = C.respond(hisPass, seen.sid, seen.Ya);
  const tapB = over(P.tap(seen.sid, him.Yb)); const t = tapB && P.parseTap(tapB, her.sid); if (!t) return 'tap lost';
  const keys = her.finish(t.Yb);
  // he sings; she hears it through the room, train by train
  const sch = Song.schedule(Song.symbolsOf(him.keys.tagM), M), air = room(Song.renderAir(sch, M, FS));
  const L = new Song.Listener(new FemaleBrain(parts.meta, parts.bin, M, personality(S, keys.seed, parts.meta.n)), Song.symbolsOf(keys.tagM), M);
  const heard = []; let done = false;
  const det = new Song.SongDetector(M, FS, () => {}); det.onTrain = (s, n) => { heard.push(...s); if (n >= Song.TRAINS) { L.advance(heard.slice(), true); done = true; } else L.advance(heard.slice(), false); };
  for (let i = 0; i < air.length; i += 2048) det.push(air.subarray(i, i + 2048)); det.flush(); if (!done) L.advance(heard.slice(), true);
  const verdict = L.verdict;
  const vb = over(verdict === 'accept' ? P.accept(her.sid, keys) : P.kick(her.sid)); const hv = vb && P.parseVerdict(vb, seen.sid, him.keys);
  if (hv !== 'accept') return `${verdict}/${hv}`;
  const gb = over(P.gift(seen.sid, him.keys, { kind: 'text', text: 'a fig, ripe' })); const g = gb && P.parseGift(gb, her.sid, keys);
  // the link details, sung both ways (a stand-in blob of the real size)
  const ob = over(P.sealFixed(P.T.OFFER, seen.sid, him.keys, new Uint8Array(82).fill(7))); const offer = ob && P.unsealFixed(P.T.OFFER, ob, her.sid, keys);
  if (!offer || offer.length !== 82) return 'offer lost';
  return g ? 'mated: ' + g.text : 'gift lost';
}
// by sight and song: each loop of cards is read through a simulated front camera (turned head to tail, blurred,
// with cards missed); only the key song goes through the room
function watch(bytes, magic, kind, magics = magic) {
  const cs = V.cards(bytes, magic, kind), A = new V.Assembler(magics), w = 640, h = 480;
  const Hm = F.homography([[0, 0], [1000, 0], [1000, 1000], [0, 1000]], [[480, 430], [150, 445], [140, 60], [500, 40]]);
  for (let k = 0; k < cs.length * 8; k++) {
    if (Math.random() < 0.4) continue;
    const img = F.drawRaster(F.facetBits(cs[k % cs.length], kind), w, h, Hm, kind); for (let i = 0; i < img.length; i++) img[i] += 10 * (Math.random() - 0.5);
    const r = F.read(img, w, h, kind), m = r && r.payload && A.push(r.payload); if (m) return { ...m, cards: k + 1 };
  }
  return null;
}
export async function sightRitual(S, parts, herPass, hisPass) {
  const M = parts.M, log = [];
  const her = new C.Initiator(herPass);
  const lk = watch(P.look(her), V.MAGIC.LOOK, 'eyes'); const seen = lk && P.parseLook(lk.bytes); if (!seen) return 'blind'; log.push(lk.cards);
  const him = C.respond(hisPass, seen.sid, seen.Ya), blob = new Uint8Array(82).fill(7);
  const dn = watch(V.pair(P.tap(seen.sid, him.Yb), P.sealFixed(P.T.OFFER, seen.sid, him.keys, blob)), V.MAGIC.DANCE, 'wing'); if (!dn) return 'dance unseen'; log.push(dn.cards);
  const [tapB, offB] = V.unpair(dn.bytes), t = P.parseTap(tapB, her.sid); if (!t) return 'tap lost';
  // (with the wrong passphrase she can't open his offer; she still lets her brain judge his song, as with sound)
  const keys = her.finish(t.Yb), offer = P.unsealFixed(P.T.OFFER, offB, her.sid, keys);
  const sn = watch(P.seen(her.sid), V.MAGIC.SEEN, 'eyes', [V.MAGIC.SEEN, V.MAGIC.ANSWER]); if (!sn || !P.parseSeen(sn.bytes, seen.sid)) return 'not seen';
  const sch = Song.schedule(Song.symbolsOf(him.keys.tagM), M), air = room(Song.renderAir(sch, M, FS));
  const L = new Song.Listener(new FemaleBrain(parts.meta, parts.bin, M, personality(S, keys.seed, parts.meta.n)), Song.symbolsOf(keys.tagM), M);
  const heard = []; let done = false;
  const det = new Song.SongDetector(M, FS, () => {}); det.onTrain = (s, n) => { heard.push(...s); if (n >= Song.TRAINS) { L.advance(heard.slice(), true); done = true; } else L.advance(heard.slice(), false); };
  for (let i = 0; i < air.length; i += 2048) det.push(air.subarray(i, i + 2048)); det.flush(); if (!done) L.advance(heard.slice(), true);
  if (L.verdict === 'accept' && (!offer || offer.length !== 82)) return 'offer lost';
  const reply = L.verdict === 'accept' ? V.pair(P.accept(her.sid, keys), P.sealFixed(P.T.ANSWER, her.sid, keys, blob)) : V.pair(P.kick(her.sid));
  const an = watch(reply, V.MAGIC.ANSWER, 'eyes'); if (!an) return 'reply unseen'; log.push(an.cards);
  const [vb, ab] = V.unpair(an.bytes), hv = P.parseVerdict(vb, seen.sid, him.keys);
  if (hv !== 'accept') return `${L.verdict}/${hv}`;
  const ans = P.unsealFixed(P.T.ANSWER, ab, seen.sid, him.keys);
  return ans && ans.length === 82 ? `mated (cards seen: ${log.join(', ')})` : 'answer lost';
}
export async function run(ok, S) {
  const parts = loadBrainParts();
  const a = await ritual(S, parts, 'fig wasp', 'fig wasp'); ok(a === 'mated: a fig, ripe', `same passphrase, through camera and room: ${a}`);
  const b = await ritual(S, parts, 'fig wasp', 'fig wasps'); ok(b === 'reject/kick', `different passphrase: ${b}`);
  const c = await sightRitual(S, parts, 'fig wasp', 'fig wasp'); ok(c.startsWith('mated'), `by sight and song, same passphrase: ${c}`);
  const d = await sightRitual(S, parts, 'fig wasp', 'fig wasps'); ok(d === 'reject/kick', `by sight and song, different passphrase: ${d}`);
}
