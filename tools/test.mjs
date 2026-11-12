// node tools/test.mjs  — CPace test vectors, handshake round trip, female determinism and agreement with the crypto.
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
await import('./load-sodium.mjs');
const C = await import('../js/cpace.js');
const S = await C.ready();
const hex = (h) => S.from_hex(h), toHex = (b) => S.to_hex(b);
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

// ---- CPace, draft-irtf-cfrg-cpace-21 Appendix B.3 (ristretto255 / SHA-512)
{
  const PRS = hex('50617373776f7264'), CI = hex('0b415f696e69746961746f720b425f726573706f6e646572'), sid = hex('7e4b4791d6a8ef019b936c79fb7f2c57');
  const ADa = hex('414461'), ADb = hex('414462');
  ok(toHex(S.crypto_hash_sha512(C.generatorString(PRS, CI, sid))) === 'da6d3ddc8802fca9058755ffd3ebde08a9c2c74945901a258482a288b6663af06bf645c93cd1c51512307199c80e84908916d983b34af77205f90851a657ee27', 'generator_string hash');
  const g = C.calculateGenerator(PRS, CI, sid);
  ok(toHex(g) === '222b6b195fe84b1652badb6f6a3ae3d24341e7306967f0b8115b40d5698c7e56', 'generator g');
  const ya = hex('da3d23700a9e5699258aef94dc060dfda5ebb61f02a5ea77fad53f4ff0976d08'), yb = hex('d2316b454718c35362d83d69df6320f38578ed5984651435e2949762d900b80d');
  const Ya = S.crypto_scalarmult_ristretto255(ya, g), Yb = S.crypto_scalarmult_ristretto255(yb, g);
  ok(toHex(Ya) === 'd6bac480f2c386c394efc7c47adb9925dcd2630b64f240c50f8d0eec482b9157', 'Ya');
  ok(toHex(Yb) === '3ea7e0b19560d7c0b0f5734f63b955286dfa8232b5ebe63324e2d9e7433f7258', 'Yb');
  const K = S.crypto_scalarmult_ristretto255(yb, Ya);
  ok(toHex(K) === '80b69a8a76457ab6a4d7f887a4bf6b55a2f80ac19c333f917a05fc9887c8b40f', 'K');
  ok(toHex(C.isk(sid, K, Ya, ADa, Yb, ADb)) === 'b69effbf61b51d56401c0f65601abe428de8206feaaf0e32198896dcae7b35cd2b38950a39dfd5d4a79164614c2984f7daa460b588c1e80c3fa2068af7900447', 'ISK_IR');
}
// ---- handshake round trip
{
  const m = new C.Male('apple pie');
  const f = C.female('apple pie', m.sid, m.Ya);
  const mk = m.finish(f.Yb);
  ok(C.tagsEqual(mk.tagF, f.keys.tagF) && C.tagsEqual(mk.tagM, f.keys.tagM) && C.tagsEqual(mk.seed, f.keys.seed), 'same passphrase -> same tags and seed');
  const m2 = new C.Male('apple pie');
  const f2 = C.female('apple pi', m2.sid, m2.Ya);
  const mk2 = m2.finish(f2.Yb);
  ok(!C.tagsEqual(mk2.tagF, f2.keys.tagF) && !C.tagsEqual(mk2.seed, f2.keys.seed), 'different passphrase -> different tags and seed');
}

// ---- the whole ritual as bytes, and the turns through the modem
{
  const P = await import('../js/protocol.js'), Mo = await import('../js/modem.js');
  const m = new C.Male('pickled herring'), b1 = P.court(m), c1 = P.parseCourt(b1);
  const f = C.female('pickled herring', c1.sid, c1.Ya), b2 = P.answer(c1.sid, f.Yb, f.keys), a2 = P.parseAnswer(b2, m.sid);
  const mk = m.finish(a2.Yb);
  ok(C.tagsEqual(a2.tagF, mk.tagF), 'he recognises her (tagF)');
  const v = P.parseVerdict(P.accept(c1.sid, f.keys), m.sid, mk); ok(v === 'accept', 'he hears her accept');
  const g = P.parseGift(P.gift(m.sid, mk, { kind: 'text', text: 'meet me by the bromeliad' }), c1.sid, f.keys);
  ok(g && g.text === 'meet me by the bromeliad', 'the gift arrives sealed and opens');
  const bad = P.gift(m.sid, mk, { kind: 'text', text: 'x' }); bad[40] ^= 1; ok(P.parseGift(bad, c1.sid, f.keys) === null, 'a tampered gift is refused');
  for (const [name, bytes] of [['court', b1], ['answer', b2]]) {
    const x = Mo.synthesize(bytes, 0, 'quick', { fs: 48000, version: P.VERSION }), ev = Mo.decodeBuffer(x, 48000);
    ok(ev.length === 1 && ev[0].ok && ev[0].version === P.VERSION && C.tagsEqual(ev[0].bytes, bytes), `${name} through the modem (${Mo.frameSeconds(bytes.length, 'quick').toFixed(1)} s)`);
  }
  const mem = new P.Memory({ d: {}, get(k) { return this.d[k]; }, set(k, v) { this.d[k] = v; } });
  mem.rejected(0); mem.rejected(0); ok(mem.refractory(0) === 20000, 'conditioning doubles: 10 s, then 20 s');
  mem.mated(c1.sid); ok(mem.seen(c1.sid) && mem.refractory(0) === 0, 'a mated session is remembered and refused again');
}

export { ok, S, C };
if (process.argv[2] !== '--lib') {
  try { const extra = await import('./test-female.mjs'); await extra.run(ok, S); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }
  console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
}
