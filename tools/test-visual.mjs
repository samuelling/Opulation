// Messages by sight: card loops, read through a simulated camera in any order, with cards missed and blurred.
import * as F from '../js/flycode.js';
import * as V from '../js/visual.js';
export async function run(ok, S) {
  for (const [kind, len] of [['wing', 37 + 103 + 1], ['eyes', 21 + 103 + 1], ['eyes', 41], ['eyes', 4], ['wing', 0]]) {
    const msg = S.randombytes_buf(len), cs = V.cards(msg, V.MAGIC.DANCE, kind), A = new V.Assembler(V.MAGIC.DANCE);
    let out = null, shown = 0;
    // the loop plays round and round; the camera catches about half the cards, through a turned, blurred view
    const Hm = F.homography([[0, 0], [1000, 0], [1000, 1000], [0, 1000]], [[500, 420], [130, 440], [120, 60], [520, 40]]);
    for (let k = 0; !out && k < cs.length * 6; k++) {
      if (Math.random() < 0.5) continue; shown++;
      let img = F.drawRaster(F.facetBits(cs[k % cs.length], kind), 640, 480, Hm, kind);
      const o = new Uint8ClampedArray(img.length), w = 640; for (let i = w + 1; i < img.length - w - 1; i++) o[i] = (img[i - 1] + img[i + 1] + img[i - w] + img[i + w] + 2 * img[i]) / 6 + 10 * (Math.random() - 0.5); img = o;
      const r = F.read(img, 640, 480, kind); if (r && r.payload) out = A.push(r.payload);
    }
    ok(out && out.magic === V.MAGIC.DANCE && S.memcmp(out.bytes, msg), `${len} bytes as ${cs.length} ${kind} card${cs.length > 1 ? 's' : ''}, read after ${shown} glimpses`);
  }
  { const A = new V.Assembler([V.MAGIC.ANSWER]), a = V.cards(Uint8Array.of(1, 2, 3), V.MAGIC.LOOK, 'eyes'); ok(A.push(a[0]) === null, 'cards of another kind of message are ignored'); }
  { // a new message replaces a half-read old one
    const A = new V.Assembler(V.MAGIC.ANSWER), m1 = S.randombytes_buf(60), m2 = S.randombytes_buf(60), c1 = V.cards(m1, V.MAGIC.ANSWER, 'eyes'), c2 = V.cards(m2, V.MAGIC.ANSWER, 'eyes');
    A.push(c1[0]); let out = null; for (const c of c2) out = A.push(c) || out; ok(out && S.memcmp(out.bytes, m2), 'a new message replaces a half-read one'); }
  { // one card never seen: rebuilt from the XOR card
    const m = S.randombytes_buf(100), cs = V.cards(m, V.MAGIC.DANCE, 'wing'), A = new V.Assembler(V.MAGIC.DANCE); let out = null;
    cs.forEach((c, i) => { if (i !== 3) out = A.push(c) || out; }); ok(out && S.memcmp(out.bytes, m), `one of ${cs.length - 1} cards never seen: rebuilt from the XOR card`); }
  { const [a, b] = V.unpair(V.pair(Uint8Array.of(9, 9), Uint8Array.of(1, 2, 3))); ok(a.length === 2 && b.length === 3 && b[2] === 3, 'two parts in one message'); }
}
