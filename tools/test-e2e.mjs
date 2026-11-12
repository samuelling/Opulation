// The whole ritual between two simulated phones: her face through a (simulated) camera, every sound turn through
// a (simulated) room with echo and noise, her brain listening train by train. Same code paths as the app.
import * as C from '../js/cpace.js';
import * as P from '../js/protocol.js';
import * as Song from '../js/song.js';
import * as F from '../js/flycode.js';
import { FemaleBrain, personality } from '../js/female.js';
import * as Sung from '../js/flysong.js';
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
export async function run(ok, S) {
  const parts = loadBrainParts();
  const a = await ritual(S, parts, 'fig wasp', 'fig wasp'); ok(a === 'mated: a fig, ripe', `same passphrase, through camera and room: ${a}`);
  const b = await ritual(S, parts, 'fig wasp', 'fig wasps'); ok(b === 'reject/kick', `different passphrase: ${b}`);
}
