// Her face as a visual code: Reed-Solomon, drawing and reading under perspective, blur and noise.
import * as F from '../js/flycode.js';
export async function run(ok, S) {
  { const m = S.randombytes_buf(41), cw = F.rsEncode(m, 24);
    for (let e = 0; e <= 12; e++) { const c = cw.slice(); const idx = new Set(); while (idx.size < e) idx.add(Math.floor(Math.random() * c.length)); for (const i of idx) c[i] ^= 1 + Math.floor(Math.random() * 255);
      const d = F.rsDecode(c, 24); if (!(d && S.memcmp(d, m))) { ok(false, `RS corrects ${e} byte errors`); break; } if (e === 12) ok(true, 'Reed-Solomon corrects up to 12 byte errors'); }
    const c = cw.slice(); for (let i = 0; i < 14; i++) c[i * 3] ^= 0x5a; const d = F.rsDecode(c, 24); ok(!d || !S.memcmp(d, m) ? true : false, '14 byte errors are not silently "corrected" into the right message (detected or wrong)'); }
  const L = F.layout(); console.log(`     ${L.cells.length} facets, ${F.BITS} carry data`);
  const cases = [['flat, centred', [[120, 110], [520, 110], [520, 470], [120, 470]], 0, 0], ['tilted 15°, perspective', [[150, 60], [560, 120], [530, 470], [110, 430]], 0, 6],
                 ['far and small', [[190, 120], [450, 130], [445, 390], [185, 385]], 1, 4], ['blurred, noisy', [[110, 90], [530, 100], [540, 460], [100, 450]], 2, 14]];
  for (const [name, quad, blur, noise] of cases) {
    const m = S.randombytes_buf(41), bits = F.facetBits(m), w = 640, h = 480;
    const Hm = F.homography([[0, 0], [1000, 0], [1000, 1000], [0, 1000]], quad);
    let img = F.drawRaster(bits, w, h, Hm);
    for (let k = 0; k < blur; k++) { const o = new Uint8ClampedArray(img.length); for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += img[(y + dy) * w + x + dx]; o[y * w + x] = s / 9; } img = o; }
    for (let i = 0; i < img.length; i++) img[i] = img[i] + noise * (Math.random() * 2 - 1) + 20 * (i % w) / w;   // noise and a light gradient
    const t0 = Date.now(), r = F.read(img, w, h);
    ok(r && r.payload && S.memcmp(r.payload, m), `read her face: ${name} (${Date.now() - t0} ms)`);
  }
  // screen to screen, front cameras: the view may be turned any way and mirrored, and the card may be his wing
  const D = F.layout('wing'); console.log(`     his wing: ${D.cells.length} hair cells, ${D.bits} carry data; her coarse eyes: ${F.layout('eyes').cells.length} facets, ${F.layout('eyes').bits} carry data`);
  const base = [[130, 70], [530, 90], [520, 450], [120, 430]];
  const turn = (q, k) => q.map((_, i) => q[(i + k) % 4]), mirror = q => [q[1], q[0], q[3], q[2]];
  const views = [['upright', base], ['turned 90°', turn(base, 1)], ['upside down', turn(base, 2)], ['turned 270°', turn(base, 3)],
                 ['mirrored (selfie view)', mirror(base)], ['mirrored and upside down', turn(mirror(base), 2)]];
  for (const kind of ['face', 'eyes', 'wing']) for (const [name, quad] of views) {
    const m = S.randombytes_buf(41), bits = F.facetBits(m.subarray(0, F.layout(kind).payload), kind), w = 640, h = 480;
    const Hm = F.homography([[0, 0], [1000, 0], [1000, 1000], [0, 1000]], quad);
    const img = F.drawRaster(bits, w, h, Hm, kind);
    for (let i = 0; i < img.length; i++) img[i] = img[i] + 8 * (Math.random() * 2 - 1);
    const r = F.read(img, w, h, kind);
    ok(r && r.payload && S.memcmp(r.payload, m.subarray(0, F.layout(kind).payload)), `read ${({ face: 'her face', eyes: 'her eyes (coarse)', wing: 'his wing' })[kind]}: ${name}`);
  }
  { // a face is not read as a wing, nor the other way round
    const m = S.randombytes_buf(41), Hm = F.homography([[0, 0], [1000, 0], [1000, 1000], [0, 1000]], base);
    const r = F.read(F.drawRaster(F.facetBits(m, 'face'), 640, 480, Hm, 'face'), 640, 480, 'wing');
    ok(!(r && r.payload), 'her face does not read as his wing'); }
}
