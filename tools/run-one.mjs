// node tools/run-one.mjs ./test-flycode.mjs — run one test module on its own
await import('./load-sodium.mjs');
const C = await import('../js/cpace.js'); const S = await C.ready();
let bad = 0; const m = await import(process.argv[2]);
await m.run((c, n) => { console.log(c ? 'ok  ' : 'FAIL', n); if (!c) bad++; }, S);
process.exit(bad ? 1 : 0);
