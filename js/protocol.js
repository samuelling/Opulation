// The ritual as a protocol. Pure logic: no audio, no DOM, so it runs in Node tests too.
//
//   LOOK    her face      (her screen → his camera)  v(1) | sid(8) | Ya(32)        he sees her: orient
//   TAP     he → her      (song)     1 | sid4 | Yb(32)                            he taps her
//   SONG    he → her      (song)    tagM as 64 inter-pulse intervals             her brain decides
//   ACCEPT  her → him     (song)     4 | sid4 | tagF(16)                          she slows and opens; tagF is her
//                                                                                 pheromone: proof she is his kind
//   KICK    her → him     (song)     6 | sid4                                     she kicks; she won't listen for a while
//   OFFER   he → her      (song)    7 | sid4 | sealed WebRTC offer               copulation: a direct link opens
//   ANSWER  her → him     (song)    8 | sid4 | sealed WebRTC answer              (js/link.js), for files and photos
//   GIFT    he → her      (song)     5 | sid4 | nonce(24) | sealed note            a note by sound, if no link opens
//
// Sight and song (screen to screen, front cameras; js/visual.js): the same turns, but everything except the key
// song goes by sight, as loops of cards, which is many times faster than sound:
//   her eyes:  LOOK                          his wing (the dance):  TAP + sealed OFFER
//   her eyes:  SEEN (she has his dance; he may sing)          then he sings the key song, by sound, as before
//   her eyes:  ACCEPT + sealed ANSWER, or KICK
//
// Every sound turn is sung as fly song (js/flysong.js). The gift and the link messages are sealed with
// XChaCha20-Poly1305 under kx, with their 5-byte header as associated data.
import * as C from './cpace.js';

export const VERSION = 5, LOOK_VERSION = 1;
export const T = { TAP: 1, ACCEPT: 4, KICK: 6, GIFT: 5, OFFER: 7, ANSWER: 8, SEEN: 9 };
const te = new TextEncoder(), td = new TextDecoder();
const head = (t, sid) => Uint8Array.of(t, sid[0], sid[1], sid[2], sid[3]);
const sid4eq = (a, b) => a[1] === b[0] && a[2] === b[1] && a[3] === b[2] && a[4] === b[3];

/** her face's 41 bytes */
export function look(her) { return C.cat(Uint8Array.of(LOOK_VERSION), her.sid, her.Ya); }
export function parseLook(b) { if (!b || b.length !== 41 || b[0] !== LOOK_VERSION) return null; return { sid: b.slice(1, 9), Ya: b.slice(9, 41) }; }
export function tap(sid, Yb) { return C.cat(head(T.TAP, sid), Yb); }
export function parseTap(b, sid) { if (b.length !== 37 || b[0] !== T.TAP || !sid4eq(b, sid)) return null; return { Yb: b.slice(5, 37) }; }
export function accept(sid, keys) { return C.cat(head(T.ACCEPT, sid), keys.tagF); }
export function kick(sid) { return head(T.KICK, sid); }
/** by sight only: she has read his dance (no secret in it: it only tells him to sing now) */
export function seen(sid) { return head(T.SEEN, sid); }
export function parseSeen(b, sid) { return !!b && b.length === 5 && b[0] === T.SEEN && sid4eq(b, sid); }
/** his reading of her verdict: 'accept' only with the right tagF; 'wrongkind' if she accepted with a different one */
export function parseVerdict(b, sid, keys) {
  if (b.length >= 5 && b[0] === T.KICK && sid4eq(b, sid)) return 'kick';
  if (b.length === 21 && b[0] === T.ACCEPT && sid4eq(b, sid)) return C.tagsEqual(b.subarray(5), keys.tagF) ? 'accept' : 'wrongkind';
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

/** a sealed turn of any type (used for the WebRTC offer and answer): only her mate can open or forge it */
export function seal(t, sid, keys, bytes) {
  const S = C.sodium(), h = head(t, sid), nonce = S.randombytes_buf(24);
  return C.cat(h, nonce, S.crypto_aead_xchacha20poly1305_ietf_encrypt(bytes, h, null, nonce, keys.kx));
}
export function unseal(t, b, sid, keys) {
  if (b.length < 5 + 24 + 16 || b[0] !== t || !sid4eq(b, sid)) return null;
  try { return C.sodium().crypto_aead_xchacha20poly1305_ietf_decrypt(null, b.subarray(29), b.subarray(0, 5), b.subarray(5, 29), keys.kx); } catch (e) { return null; }
}

/** sealed with a fixed nonce, to keep the sung message short: used for the one WebRTC offer and the one answer
 *  of a session (each key kx is used for exactly one message of each type; a resend repeats the same bytes) */
const fixedNonce = (t) => { const n = new Uint8Array(24); n[0] = t; n.set([0x4f, 0x50, 0x55, 0x4c], 1); return n; };
export function sealFixed(t, sid, keys, bytes) {
  const h = head(t, sid); return C.cat(h, C.sodium().crypto_aead_xchacha20poly1305_ietf_encrypt(bytes, h, null, fixedNonce(t), keys.kx));
}
export function unsealFixed(t, b, sid, keys) {
  if (b.length < 5 + 16 || b[0] !== t || !sid4eq(b, sid)) return null;
  try { return C.sodium().crypto_aead_xchacha20poly1305_ietf_decrypt(null, b.subarray(5), b.subarray(0, 5), fixedNonce(t), keys.kx); } catch (e) { return null; }
}
