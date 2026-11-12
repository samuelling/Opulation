// The ritual as a protocol. Pure logic: no audio, no DOM, so it runs in Node tests too.
//
//   1  COURT   he → her   (modem)   sid(16) | Ya(32)                    she sees him: orient, tap
//   2  ANSWER  her → him  (modem)   sid4 | Yb(32) | tagF(16)            her pheromones: is she his kind?
//   3  SONG    he → her   (song)    tagM as 64 inter-pulse intervals     her brain decides
//   4  ACCEPT  her → him  (modem)   sid4 | MAC(kc,'accept')(16)         she slows, opens
//      KICK    her → him  (modem)   sid4                                 she kicks; he is conditioned
//   5  GIFT    he → her   (modem)   sid4 | nonce(24) | sealed gift       copulation: the transfer
//
// Frames use the Screech modem (frame version 5). Byte 0 of every payload is the turn number.
// The gift is sealed with XChaCha20-Poly1305 under kx, with the turn header as associated data.
import * as C from './cpace.js';

export const VERSION = 5;
export const T = { COURT: 1, ANSWER: 2, ACCEPT: 4, KICK: 6, GIFT: 5 };
const te = new TextEncoder(), td = new TextDecoder();
const head = (t, sid) => Uint8Array.of(t, sid[0], sid[1], sid[2], sid[3]);
const sid4eq = (a, b) => a[1] === b[0] && a[2] === b[1] && a[3] === b[2] && a[4] === b[3];

export function court(male) { return C.cat(Uint8Array.of(T.COURT), male.sid, male.Ya); }
export function parseCourt(b) { if (b.length !== 49 || b[0] !== T.COURT) return null; return { sid: b.slice(1, 17), Ya: b.slice(17, 49) }; }

export function answer(sid, Yb, keys) { return C.cat(head(T.ANSWER, sid).subarray(0, 5), Yb, keys.tagF); }
export function parseAnswer(b, sid) { if (b.length !== 53 || b[0] !== T.ANSWER || !sid4eq(b, sid)) return null; return { Yb: b.slice(5, 37), tagF: b.slice(37, 53) }; }

const acceptMac = (keys) => C.sodium().crypto_auth_hmacsha512(te.encode('OPUL accept'), keys.kx).subarray(0, 16);
export function accept(sid, keys) { return C.cat(head(T.ACCEPT, sid), acceptMac(keys)); }
export function kick(sid) { return head(T.KICK, sid); }
export function parseVerdict(b, sid, keys) {
  if (b.length >= 5 && b[0] === T.KICK && sid4eq(b, sid)) return 'kick';
  if (b.length === 21 && b[0] === T.ACCEPT && sid4eq(b, sid) && C.tagsEqual(b.subarray(5), acceptMac(keys))) return 'accept';
  return null;
}

/** gift: {kind: 'text', text} -> payload. */
export function gift(sid, keys, g) {
  const S = C.sodium(), h = head(T.GIFT, sid), nonce = S.randombytes_buf(24);
  const body = g.kind === 'text' ? C.cat(Uint8Array.of(1), te.encode(g.text)) : C.cat(Uint8Array.of(2), g.bytes);
  const ct = S.crypto_aead_xchacha20poly1305_ietf_encrypt(body, h, null, nonce, keys.kx);
  return C.cat(h, nonce, ct);
}
export function parseGift(b, sid, keys) {
  if (b.length < 5 + 24 + 16 + 1 || b[0] !== T.GIFT || !sid4eq(b, sid)) return null;
  try {
    const body = C.sodium().crypto_aead_xchacha20poly1305_ietf_decrypt(null, b.subarray(29), b.subarray(0, 5), b.subarray(5, 29), keys.kx);
    return body[0] === 1 ? { kind: 'text', text: td.decode(body.subarray(1)) } : { kind: 'bytes', bytes: body.subarray(1) };
  } catch (e) { return null; }
}

/**
 * Courtship conditioning: after a rejection the female won't listen for a while, doubling each time
 * (10 s, 20 s, 40 s ... up to 10 min), so a stranger can't try passphrases quickly. Mated: a session id she has
 * already accepted is never accepted again (no replays). `store` is any {get, set} (localStorage on the web).
 */
export class Memory {
  constructor(store) { this.store = store; let s = null; try { s = JSON.parse(store.get('opulation') || 'null'); } catch (e) {} this.s = s || { rejects: 0, until: 0, mated: [] }; }
  save() { try { this.store.set('opulation', JSON.stringify(this.s)); } catch (e) {} }
  refractory(now = Date.now()) { return Math.max(0, this.s.until - now); }
  rejected(now = Date.now()) { this.s.rejects++; this.s.until = now + Math.min(600, 10 * 2 ** (this.s.rejects - 1)) * 1000; this.save(); }
  mated(sid) { this.s.rejects = 0; this.s.until = 0; this.s.mated.push(C.sodium().to_hex(sid)); this.s.mated = this.s.mated.slice(-200); this.save(); }
  seen(sid) { return this.s.mated.includes(C.sodium().to_hex(sid)); }
}
