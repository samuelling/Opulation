// His phone's stage: a male Drosophila, large and close, performing each step of courtship to the female in
// front of him (seen from above). Ink on velvet, like the rest of OPUlation.
//
// The behaviour follows the real sequence (Sokolowski 2001; Hall 1994):
//   orient  he walks up (tripod gait) and turns to face her
//   tap     he reaches out with a foreleg and taps her abdomen (tasting her pheromones)
//   sing    he extends one wing to ~90 degrees and vibrates it: pulse song and sine song
//   decide  he waits, antennae flicking; if she rejects him she kicks with a hind leg and runs
//   lick    he extends his proboscis to her genitalia
//   mate    he curls his abdomen and mounts her; they stay in copula
//   done    they separate

const INK = '#f3e3d3', PLUSH = '#3a0f24', PLUSH2 = '#4a1530', EYE = '#ff3d5a', PINK = '#FF68BA', GOLD = '#FFD23F';
const ease = (x) => { x = Math.min(1, Math.max(0, x)); return 1 - Math.pow(1 - x, 3); };
const lerp = (a, b, t) => a + (b - a) * t;

/** one leg: from hip (x,y) at angle a, three segments, knee and ankle bending outward */
function leg(g, x, y, a, side, len, bend) {
  const s1 = len * 0.38, s2 = len * 0.36, s3 = len * 0.3;
  const k1 = [x + Math.cos(a) * s1, y + Math.sin(a) * s1];
  const a2 = a + side * bend, k2 = [k1[0] + Math.cos(a2) * s2, k1[1] + Math.sin(a2) * s2];
  const a3 = a2 + side * bend * 0.6, k3 = [k2[0] + Math.cos(a3) * s3, k2[1] + Math.sin(a3) * s3];
  g.beginPath(); g.moveTo(x, y); g.lineTo(...k1); g.lineTo(...k2); g.lineTo(...k3); g.stroke();
  // tarsal claws
  g.beginPath(); g.moveTo(...k3); g.lineTo(k3[0] + Math.cos(a3 + 0.5) * 3, k3[1] + Math.sin(a3 + 0.5) * 3); g.moveTo(...k3); g.lineTo(k3[0] + Math.cos(a3 - 0.5) * 3, k3[1] + Math.sin(a3 - 0.5) * 3); g.stroke();
  return k3;
}
function wing(g, open, side, vib, scale) {
  // folded: lying back over the abdomen; open: out to the side
  const ang = Math.PI + side * (0.1 + open * 1.4 + vib);
  g.save(); g.rotate(ang);
  const L = 54, Wd = 15;
  g.fillStyle = 'rgba(255,104,186,0.07)'; g.strokeStyle = INK; g.lineWidth = 1.6 / scale;
  g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(L * 0.3, -Wd * 0.9 * side, L * 0.95, -Wd * 0.75 * side, L, -Wd * 0.2 * side);
  g.bezierCurveTo(L * 1.02, Wd * 0.3 * side, L * 0.6, Wd * 0.55 * side, 0, Wd * 0.1 * side); g.closePath(); g.fill(); g.stroke();
  // veins L2-L5 and the two cross-veins
  g.globalAlpha = 0.55; g.lineWidth = 0.9 / scale;
  for (const [y0, y1] of [[-0.25, -0.62], [-0.05, -0.32], [0.05, 0.02], [0.12, 0.36]]) { g.beginPath(); g.moveTo(4, y0 * Wd * side); g.quadraticCurveTo(L * 0.5, (y0 + y1) / 2 * Wd * side, L * 0.97, y1 * Wd * side); g.stroke(); }
  g.beginPath(); g.moveTo(L * 0.42, -0.2 * Wd * side); g.lineTo(L * 0.45, 0.03 * Wd * side); g.moveTo(L * 0.66, 0 * Wd * side); g.lineTo(L * 0.62, 0.3 * Wd * side); g.stroke();
  g.globalAlpha = 1; g.restore();
}
/**
 * Draw a fly at (x, y), facing angle ang, scale s.
 * o: {female, wingL, wingR (0..1 open), vib, walk (gait phase, or null), tapReach (0..1), proboscis (0..1),
 *     curl (0..1, abdomen), kick (0..1, her hind leg), ovi (0..1), antenna}
 */
export function fly(g, x, y, ang, s, o = {}) {
  const female = !!o.female;
  g.save(); g.translate(x, y); g.rotate(ang); g.scale(s, s);
  g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = INK; g.lineWidth = 1.8 / s;
  // legs (behind the body): hips along the thorax
  const ph = o.walk ?? null;
  for (const side of [-1, 1]) {
    for (const [i, hx, base] of [[0, 9, 0.9], [1, 2, 1.6], [2, -5, 2.4]]) {
      const tripod = (i === 1) === (side === 1) ? 0 : Math.PI;     // L1, R2, L3 swing together, and R1, L2, R3
      let a = side * base;                                          // from straight ahead: forward-out, out, back-out
      if (ph != null) a += side * 0.28 * Math.sin(ph + tripod);
      if (i === 0 && side === 1 && o.tapReach) a = lerp(a, 0.12, o.tapReach);
      if (i === 2 && female && side === -1 && o.kick) a = lerp(a, -2.95, o.kick);
      const len = (i === 2 ? 34 : i === 1 ? 30 : 27) * (i === 0 && side === 1 ? 1 + 0.35 * (o.tapReach || 0) : 1);
      leg(g, hx, side * 5, a, side, len, 0.55 + (i === 0 && side === 1 ? -0.4 * (o.tapReach || 0) : 0));
    }
  }
  // abdomen: his is shorter with a black tip; hers longer and banded to the end
  const ab = female ? { cx: -27, rx: 22, ry: 13.5 } : { cx: -22, rx: 17, ry: 11 };
  g.save(); if (o.curl) { g.translate(-10, 0); g.scale(1 - 0.35 * o.curl, 1); g.translate(10, 0); }
  g.fillStyle = PLUSH; g.beginPath(); g.ellipse(ab.cx, 0, ab.rx, ab.ry, 0, 0, 7); g.fill(); g.stroke();
  const bands = female ? 5 : 3;
  for (let k = 0; k < bands; k++) { const bx = ab.cx + ab.rx * 0.65 - k * (ab.rx * 1.3 / bands);
    g.fillStyle = 'rgba(20,4,12,.55)'; g.beginPath(); g.ellipse(bx, 0, 2.6, ab.ry * Math.sqrt(1 - ((bx - ab.cx) / ab.rx) ** 2) * 0.96, 0, 0, 7); g.fill(); }
  if (!female) { g.fillStyle = '#140409'; g.beginPath(); g.ellipse(ab.cx - ab.rx * 0.55, 0, ab.rx * 0.45, ab.ry * 0.8, 0, 0, 7); g.fill(); g.stroke(); }
  if (female && o.ovi) { g.beginPath(); g.moveTo(ab.cx - ab.rx, 0); g.lineTo(ab.cx - ab.rx - 12 * o.ovi, 0); g.lineWidth = 3 / s; g.stroke(); g.lineWidth = 1.8 / s; }
  g.restore();
  // wings, folded or extended
  g.save(); g.translate(2, 0); wing(g, o.wingR || 0, 1, (o.vib || 0) * (o.wingR ? 1 : 0), s); wing(g, o.wingL || 0, -1, (o.vib || 0) * (o.wingL ? 1 : 0), s); g.restore();
  // thorax with bristles and scutellum
  g.fillStyle = PLUSH2; g.beginPath(); g.ellipse(3, 0, 12.5, 10, 0, 0, 7); g.fill(); g.stroke();
  g.beginPath(); g.ellipse(-8, 0, 4, 5, 0, 0, 7); g.fill(); g.stroke();
  g.globalAlpha = .7; for (const [bx, by, l] of [[8, -5, 5], [8, 5, 5], [2, -7, 6], [2, 7, 6], [-3, -4, 6], [-3, 4, 6]]) { g.beginPath(); g.moveTo(bx, by); g.lineTo(bx - l, by * 1.25); g.stroke(); } g.globalAlpha = 1;
  // head: wide, two great red eyes, ocelli, aristae
  g.fillStyle = PLUSH2; g.beginPath(); g.ellipse(19, 0, 6.5, 10.5, 0, 0, 7); g.fill(); g.stroke();
  for (const sd of [-1, 1]) {
    g.fillStyle = EYE; g.beginPath(); g.ellipse(19.5, sd * 7.2, 5.6, 5, 0, 0, 7); g.fill();
    g.globalAlpha = .35; g.strokeStyle = '#2a0610'; g.lineWidth = 0.6 / s; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(15 + k * 2, sd * 3); g.lineTo(16 + k * 2, sd * 11.5); g.stroke(); }
    g.globalAlpha = 1; g.strokeStyle = INK; g.lineWidth = 1.8 / s; g.beginPath(); g.ellipse(19.5, sd * 7.2, 5.6, 5, 0, 0, 7); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.arc(21, sd * 6, 1.3, 0, 7); g.fill();
    // antenna and feathery arista
    const tw = (o.antenna || 0) * sd;
    g.beginPath(); g.moveTo(24, sd * 2); g.lineTo(28, sd * (3 + tw)); g.stroke();
    g.beginPath(); g.moveTo(28, sd * (3 + tw)); g.quadraticCurveTo(34, sd * (5 + tw), 38, sd * (9 + 2 * tw)); g.stroke();
    g.globalAlpha = .6; for (let k = 1; k <= 3; k++) { const px = 28 + k * 2.5, py = sd * (3 + tw + k * 1.4); g.beginPath(); g.moveTo(px, py); g.lineTo(px + 1.5, py - sd * 2.5); g.stroke(); } g.globalAlpha = 1;
  }
  g.fillStyle = INK; for (const [ox, oy] of [[16, 0], [14, -1.6], [14, 1.6]]) { g.beginPath(); g.arc(ox, oy, 0.8, 0, 7); g.fill(); }
  // proboscis
  if (o.proboscis) { const L = 4 + 14 * o.proboscis; g.lineWidth = 2.4 / s; g.beginPath(); g.moveTo(24, 0); g.lineTo(24 + L, 0); g.stroke(); g.fillStyle = INK; g.beginPath(); g.ellipse(24 + L + 2, 0, 2.6, 3.2, 0, 0, 7); g.fill(); }
  g.restore();
}

/** velvet bed */
function bed(g, W, H, now) {
  const grd = g.createRadialGradient(W / 2, H * 0.55, 10, W / 2, H * 0.55, W * 0.65); grd.addColorStop(0, 'rgba(255,104,186,0.20)'); grd.addColorStop(0.5, 'rgba(120,20,60,0.12)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  for (let k = 0; k < 11; k++) { const y0 = H * (k + 0.5) / 11, sw = Math.sin(now / 4000 + k) * 12;
    const pl = g.createLinearGradient(0, y0 - 22, 0, y0 + 22); pl.addColorStop(0, 'rgba(0,0,0,0)'); pl.addColorStop(0.5, 'rgba(255,150,200,0.06)'); pl.addColorStop(1, 'rgba(0,0,0,0.18)');
    g.fillStyle = pl; g.beginPath(); g.moveTo(0, y0 - 22); g.bezierCurveTo(W * 0.3, y0 - 22 + sw, W * 0.7, y0 - 22 - sw, W, y0 - 22); g.lineTo(W, y0 + 22); g.bezierCurveTo(W * 0.7, y0 + 22 - sw, W * 0.3, y0 + 22 + sw, 0, y0 + 22); g.fill(); }
}

/**
 * The male's stage. st: {stage, bad, t (s since the stage began), now (ms), wing (0..1 song drive), singing,
 * kickT (s since she kicked, or -1), mating (0..1), finished}
 */
const D = { wing: 0, side: 1, tap: 0, lick: 0, curl: 0, circ: 0 };
export function maleStage(g, W, H, st) {
  g.clearRect(0, 0, W, H); bed(g, W, H, st.now);
  const S = Math.min(W, H) / 120;                     // fly scale: a fly ~ 1/2 the stage width
  const fx = W * 0.86, fy = H * 0.5;                  // her: facing away from him, her abdomen toward him
  const herTip = fx - 50 * S * 1.05, reach = (d) => herTip - d * S;   // where he stands, d fly-units behind her tip
  let mx = W * 0.4, my = H * 0.52, ma = 0, walk = null, tapReach = 0, wingR = 0, vib = 0, proboscis = 0, curl = 0, ovi = 0, kick = 0, fxo = 0, antenna = Math.sin(st.now / 300) * 0.5;
  const t = st.t;
  // by sight: his dance, a pose per card (js/visual.js POSES), eased from one pose to the next
  const stage = st.pose && !st.bad && (st.stage === 'tap' || st.stage === 'sing' || st.stage === 'decide') ? 'dance' : st.stage;
  if (stage === 'dance') {
    const p = st.pose, k = 0.12; D.wing += (p.wing - D.wing) * k; D.side += (p.side - D.side) * k; D.tap += (p.tap - D.tap) * k; D.lick += (p.lick - D.lick) * k; D.curl += (p.curl - D.curl) * k;
    D.circ += ((p.name.startsWith('circles') ? 1 : 0) - D.circ) * 0.06;
    const swing = Math.sin(D.circ * Math.PI) * 0.16;             // circling: out to her side and back
    mx = reach(38 - 10 * D.lick); my = H * (0.52 + swing * Math.sign(D.side || 1)); ma = -swing * 2.2 * Math.sign(D.side || 1);
    walk = D.circ > 0.05 && D.circ < 0.95 ? st.now / 70 : null;
    const both = 1 - Math.min(1, Math.abs(D.side));                // scissoring: both wings
    wingR = D.wing * Math.max(both, Math.max(0, D.side)); const wingL = D.wing * Math.max(both, Math.max(0, -D.side));
    if (st.singing) { wingR = Math.max(wingR, 0.9 * (D.side >= 0)); }   // singing: one wing out and buzzing, whatever the pose
    vib = st.singing ? Math.sin(st.now / 4) * 0.08 + 0.12 * st.wing : st.pose.name.includes('pulse') ? Math.sin(st.now / 4) * 0.12 : 0; tapReach = D.tap * (0.5 + 0.5 * Math.sin(t * 10)); proboscis = D.lick; curl = D.curl;
    fly(g, fx, fy, 0, S * 1.05, { female: true });
    fly(g, mx, my, ma, S, { wingR, wingL: st.singing && D.side < 0 ? Math.max(wingL, 0.9) : wingL, vib, walk, tapReach, proboscis, curl, antenna });
    if (st.singing) { g.strokeStyle = `rgba(255,104,186,${0.25 + 0.6 * st.wing})`; g.lineWidth = 2;
      for (let k = 1; k <= 4; k++) { g.beginPath(); g.arc(mx - 2 * S, my - 30 * S, k * 9 * S * (1 + st.wing * 0.2), -1.0, 0.5); g.stroke(); } }
    return;
  }
  switch (stage) {
    case 'orient': { const k = ease(t / 2.4); mx = lerp(-30 * S, reach(40), k); my = lerp(H * 0.72, H * 0.52, k); ma = lerp(-0.5, 0, ease(t / 2.0)); walk = k < 1 ? st.now / 70 : null; break; }
    case 'tap': { mx = lerp(reach(40), reach(36), ease(t / 0.6)); tapReach = 0.5 + 0.5 * Math.sin(t * 10); break; }
    case 'sing': { mx = reach(38); wingR = st.singing ? 1 : 0.85; vib = st.singing ? (Math.sin(st.now / 4) * 0.08 + 0.12 * st.wing) : 0; break; }
    case 'decide': { mx = reach(38); wingR = 0.15; antenna = Math.sin(st.now / 120) * 1.2;
      if (st.bad && st.kickT >= 0) { const k = st.kickT; kick = Math.min(1, k * 4) * (k < 0.6 ? 1 : Math.max(0, 1 - (k - 0.6) * 3)); ovi = Math.min(1, k * 3);
        fxo = W * 0.4 * ease((k - 0.5) / 1.2); mx = reach(38) - W * 0.18 * ease(k / 0.9); ma = -0.35 * ease(k / 0.9); } break; }
    case 'mate': {
      const lick = ease(t / 0.9) * (t < 2.2 ? 1 : Math.max(0, 1 - (t - 2.2) * 2));   // lick first
      proboscis = lick; const m = ease((t - 2.0) / 1.6);
      mx = lerp(reach(27), fx - 36 * S, m); my = lerp(H * 0.52, fy - 1 * S, m); curl = m;
      if (st.finished) { const f = ease(st.finishedT / 1.6); mx = lerp(fx - 36 * S, reach(60), f); my = lerp(fy, H * 0.62, f); curl = 1 - f; ma = 0.3 * f; }
      break; }
  }
  // her first (he climbs onto her)
  fly(g, fx + fxo, fy, 0, S * 1.05, { female: true, kick, ovi, walk: fxo > 1 ? st.now / 60 : null });
  fly(g, mx, my, ma, S, { wingR, vib, walk, tapReach, proboscis, curl, antenna });
  // the song in the air
  if (st.stage === 'sing' && st.singing) { g.strokeStyle = `rgba(255,104,186,${0.25 + 0.6 * st.wing})`; g.lineWidth = 2;
    for (let k = 1; k <= 4; k++) { g.beginPath(); g.arc(mx - 2 * S, my - 30 * S, k * 9 * S * (1 + st.wing * 0.2), -1.0, 0.5); g.stroke(); } }
  if (st.stage === 'mate' && st.mating > 0 && !st.finished) { g.fillStyle = GOLD; g.fillRect(W * 0.2, H - 14, W * 0.6 * st.mating, 4); g.strokeStyle = 'rgba(255,210,63,.4)'; g.strokeRect(W * 0.2, H - 14, W * 0.6, 4); }
}
