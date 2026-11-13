// Messages by sight: a message too big for one card is shown as a loop of cards, a few a second, and read back in
// any order. His loop is his courtship dance (each card a pose of it, the data in his wing's hair field); hers is
// her face, her eyes changing as she answers. Every card is Reed-Solomon checked on its own (js/flycode.js).
//
//   card = magic(1) | message id(1) | index << 4 | (count - 1) (1) | data
//   the first card's data starts with the message length (2 bytes); a message is up to 15 cards, plus one more
//   (index 15) that is the XOR of the others, so any one card missed by the camera is rebuilt instead of waited for
import * as F from './flycode.js';

export const MAGIC = { LOOK: 0x4c, DANCE: 0x44, SEEN: 0x53, ANSWER: 0x52 };   // 'L' her look, 'D' his dance, 'S' she has him, 'R' her reply
/** split a message into cards for one card kind ('eyes' or 'wing') */
export function cards(bytes, magic, kind, id = (Math.random() * 256) | 0) {
  const P = F.layout(kind).payload, room = P - 3, total = bytes.length + 2, n = Math.max(1, Math.ceil(total / room));
  if (n > 15) throw new Error(`message too long for ${kind} cards: ${bytes.length} bytes`);
  const all = new Uint8Array(n * room); all[0] = bytes.length >> 8; all[1] = bytes.length & 255; all.set(bytes, 2);
  const out = [], par = new Uint8Array(P); par[0] = magic; par[1] = id; par[2] = (15 << 4) | (n - 1);
  for (let i = 0; i < n; i++) { const c = new Uint8Array(P); c[0] = magic; c[1] = id; c[2] = (i << 4) | (n - 1); c.set(all.subarray(i * room, (i + 1) * room), 3); out.push(c);
    for (let j = 3; j < P; j++) par[j] ^= c[j]; }
  if (n > 1) out.push(par);
  return out;
}
/** collects the cards of a message as they are seen; `push(card)` returns the whole message once every card is in */
export class Assembler {
  constructor(magics) { this.magics = new Set([].concat(magics)); this.reset(); }
  reset() { this.id = -1; this.magic = -1; this.parts = []; this.par = null; this.n = 0; this.have = 0; }
  push(c) {
    if (!c || !this.magics.has(c[0])) return null;
    const n = (c[2] & 15) + 1, i = c[2] >> 4;
    if (c[0] !== this.magic || c[1] !== this.id || n !== this.n) { this.reset(); this.magic = c[0]; this.id = c[1]; this.n = n; this.parts = new Array(n).fill(null); }
    if (i === 15) { if (!this.par) this.par = c.slice(3); }
    else if (i >= n) return null;
    else if (!this.parts[i]) { this.parts[i] = c.slice(3); this.have++; }
    if (this.have === n - 1 && this.par) {   // rebuild the one missing card from the others and the XOR card
      const k = this.parts.indexOf(null), x = this.par.slice(); for (const p of this.parts) if (p) for (let j = 0; j < x.length; j++) x[j] ^= p[j];
      this.parts[k] = x; this.have++;
    }
    if (this.have < n) return null;
    const room = c.length - 3, all = new Uint8Array(n * room); this.parts.forEach((p, k) => all.set(p, k * room));
    const len = (all[0] << 8) | all[1]; if (len + 2 > all.length) { this.reset(); return null; }
    return { magic: this.magic, bytes: all.slice(2, 2 + len) };
  }
  get progress() { return this.n ? this.have / this.n : 0; }
}
/** two parts in one message (his tap and his sealed link offer; her verdict and her sealed answer) */
export const pair = (a, b = new Uint8Array(0)) => { const o = new Uint8Array(1 + a.length + b.length); o[0] = a.length; o.set(a, 1); o.set(b, 1 + a.length); return o; };
export const unpair = (m) => (!m || m.length < 1 || m[0] + 1 > m.length) ? null : [m.subarray(1, 1 + m[0]), m.subarray(1 + m[0])];

// The poses of his dance, from real Drosophila courtship (Hall 1994; Greenspan & Ferveur 2000), one per card in
// turn. They are what his fly does on his screen while the cards play; the data rides in the wing either way.
export const POSES = [
  { name: 'orients', wing: 0, side: 1, curl: 0, tap: 0, lick: 0 },
  { name: 'taps her with a foreleg', wing: 0, side: 1, curl: 0, tap: 1, lick: 0 },
  { name: 'extends his left wing', wing: 1, side: -1, curl: 0, tap: 0, lick: 0 },
  { name: 'vibrates it: pulse song', wing: 0.8, side: -1, curl: 0, tap: 0, lick: 0 },
  { name: 'circles to her other side', wing: 0.2, side: 1, curl: 0, tap: 0, lick: 0 },
  { name: 'extends his right wing', wing: 1, side: 1, curl: 0, tap: 0, lick: 0 },
  { name: 'scissors both wings', wing: 0.6, side: 0, curl: 0, tap: 0, lick: 0 },
  { name: 'licks her genitalia', wing: 0.3, side: 1, curl: 0, tap: 0, lick: 1 },
  { name: 'curls his abdomen', wing: 0.4, side: 1, curl: 1, tap: 0, lick: 0 },
];
