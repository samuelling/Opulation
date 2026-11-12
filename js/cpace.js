// CPace (draft-irtf-cfrg-cpace-21), suite CPACE-RISTR255-SHA512, initiator/responder setting, on libsodium.
// The female phone is the initiator (A): her message is shown as her face (js/flycode.js). The male is the responder (B).
// Checked against the draft's Appendix B.3 test vectors (tools/test.mjs).
//
// On top of CPace: explicit key confirmation and the keys Opulation needs, all derived from ISK:
//   tagF  = HMAC-SHA512(kc, "OPUL tag female" || transcript)[0..16]   sent by her when she accepts
//   tagM  = HMAC-SHA512(kc, "OPUL tag male"   || transcript)[0..16]   sung by him
//   seed  = HMAC-SHA512(ISK, "OPUL female seed")[0..32]              seeds the female connectome
//   kx    = HMAC-SHA512(ISK, "OPUL transfer")[0..32]                  encrypts the transfer
// where kc = HMAC-SHA512(ISK, "OPUL confirm")[0..32].

const te = new TextEncoder();
let S = null;
export async function ready() {
  if (S) return S;
  const g = globalThis.sodium;   // js/vendor/libsodium-wrappers.js in the browser; set by the caller in Node
  if (!g) throw new Error('libsodium not loaded');
  await g.ready; S = g; return S;
}

export const DSI = te.encode('CPaceRistretto255');
const S_IN_BYTES = 128;

function leb128(n) { const o = []; do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; o.push(b); } while (n); return o; }
export function prependLen(x) { const l = leb128(x.length), o = new Uint8Array(l.length + x.length); o.set(l); o.set(x, l.length); return o; }
export function cat(...xs) { const n = xs.reduce((a, x) => a + x.length, 0), o = new Uint8Array(n); let k = 0; for (const x of xs) { o.set(x, k); k += x.length; } return o; }
export const lvCat = (...xs) => cat(...xs.map(prependLen));

export function generatorString(PRS, CI, sid) {
  const zpad = Math.max(0, S_IN_BYTES - 1 - prependLen(PRS).length - prependLen(DSI).length);
  return lvCat(DSI, PRS, new Uint8Array(zpad), CI, sid);
}
export function calculateGenerator(PRS, CI, sid) {
  return S.crypto_core_ristretto255_from_hash(S.crypto_hash_sha512(generatorString(PRS, CI, sid)));
}
export const transcriptIR = (Ya, ADa, Yb, ADb) => cat(lvCat(Ya, ADa), lvCat(Yb, ADb));
export function isk(sid, K, Ya, ADa, Yb, ADb) {
  return S.crypto_hash_sha512(cat(lvCat(cat(DSI, te.encode('_ISK')), sid, K), transcriptIR(Ya, ADa, Yb, ADb)));
}
const IDENTITY = new Uint8Array(32);
function mulVfy(y, X) {
  // libsodium refuses invalid encodings and an identity result by throwing; CPace aborts in both cases
  if (!S.crypto_core_ristretto255_is_valid_point(X)) throw new Error('invalid point');
  const K = S.crypto_scalarmult_ristretto255(y, X);
  if (S.memcmp(K, IDENTITY)) throw new Error('identity');
  return K;
}
const hmac = (k, ...parts) => S.crypto_auth_hmacsha512(cat(...parts), k.length === 32 ? k : k.subarray(0, 32));

/** Normalise a passphrase the same way on every platform (NFC, UTF-8). */
export const prsOf = (pass) => te.encode(pass.normalize('NFC'));
// Channel identifier: protocol name and version. Both roles are fixed (male = A, female = B).
export const CI = lvCat(te.encode('Opulation/1'), te.encode('female'), te.encode('male'));

/** Derive everything Opulation needs from ISK and the transcript. */
export function derive(ISK, transcript) {
  const kc = hmac(ISK.subarray(0, 32), te.encode('OPUL confirm'), ISK).subarray(0, 32);
  return {
    isk: ISK,
    tagF: hmac(kc, te.encode('OPUL tag female'), transcript).subarray(0, 16),
    tagM: hmac(kc, te.encode('OPUL tag male'), transcript).subarray(0, 16),
    seed: hmac(ISK.subarray(0, 32), te.encode('OPUL female seed'), ISK).subarray(0, 32),
    kx: hmac(ISK.subarray(0, 32), te.encode('OPUL transfer'), ISK).subarray(0, 32),
  };
}

/** Initiator (her): new Initiator(pass) -> {sid, Ya}; then finish(Yb) -> keys. */
export class Initiator {
  constructor(pass, { sid, ya, AD = new Uint8Array(0) } = {}) {
    this.PRS = prsOf(pass); this.sid = sid || S.randombytes_buf(8); this.AD = AD;
    this.g = calculateGenerator(this.PRS, CI, this.sid);
    this.ya = ya || S.crypto_core_ristretto255_scalar_random();
    this.Ya = S.crypto_scalarmult_ristretto255(this.ya, this.g);
  }
  finish(Yb, ADb = new Uint8Array(0)) {
    const K = mulVfy(this.ya, Yb), tr = transcriptIR(this.Ya, this.AD, Yb, ADb);
    return derive(isk(this.sid, K, this.Ya, this.AD, Yb, ADb), tr);
  }
}
/** Responder (him): from her (sid, Ya) -> {Yb, keys}. */
export function respond(pass, sid, Ya, { yb, AD = new Uint8Array(0), ADa = new Uint8Array(0) } = {}) {
  const PRS = prsOf(pass), g = calculateGenerator(PRS, CI, sid);
  const y = yb || S.crypto_core_ristretto255_scalar_random();
  const Yb = S.crypto_scalarmult_ristretto255(y, g);
  const K = mulVfy(y, Ya), tr = transcriptIR(Ya, ADa, Yb, AD);
  return { Yb, keys: derive(isk(sid, K, Ya, ADa, Yb, AD), tr) };
}
/** constant-time comparison of tags */
export const tagsEqual = (a, b) => a.length === b.length && S.memcmp(a, b);
export const sodium = () => S;
