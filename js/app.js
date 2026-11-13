// OPUlation (web): the courtship handshake, with both flies' nervous systems on screen.
import * as C from './cpace.js';
import * as P from './protocol.js';
import * as Song from './song.js';
import { FemaleBrain, personality } from './female.js';
import { MaleCircuit, NODES, EDGES } from './male.js';
import * as Sung from './flysong.js';
import * as F from './flycode.js';
import * as V from './visual.js';
import * as Link from './link.js';
import { FlyEye } from './eye.js';
import { maleStage } from './flyart.js';
let eye = null;

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const FS = 48000;
let S, meta, bin, M;
let role = 'male';

// ---------------------------------------------------------------- loading
const boot = (async () => {
  S = await C.ready();
  const [m, b, mm] = await Promise.all([fetch('data/ear.json').then(r => r.json()), fetch('data/ear.bin').then(r => r.arrayBuffer()), fetch('data/female-model.json').then(r => r.json())]);
  meta = m; bin = b; M = mm; prepNet();
})();

// ---------------------------------------------------------------- setup screen
function setRole(r) {
  role = r; $('roleMale').setAttribute('aria-checked', String(r === 'male')); $('roleFemale').setAttribute('aria-checked', String(r === 'female'));
  $('giftField').hidden = r !== 'male'; $('go').textContent = r === 'male' ? 'Begin courtship' : 'Wait to be courted';
}
$('roleMale').onclick = () => setRole('male'); $('roleFemale').onclick = () => setRole('female');
// how they court: screen to screen by sight (the cards) with the key song by sound, or everything by sound
let mode = 'sight';
function setMode(m) { mode = m; $('modeSight').setAttribute('aria-checked', String(m === 'sight')); $('modeSong').setAttribute('aria-checked', String(m === 'song')); try { localStorage.setItem('opulation.mode', m); } catch (e) {} }
$('modeSight').onclick = () => setMode('sight'); $('modeSong').onclick = () => setMode('song');
try { const m = localStorage.getItem('opulation.mode'); if (m === 'song' || m === 'sight') setMode(m); } catch (e) {}
try { const p = localStorage.getItem('opulation.pass'); if (p) $('pass').value = p; } catch (e) {}
const memory = new P.Memory({ get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } });
$('go').onclick = async () => {
  const pass = $('pass').value;
  if (!pass) return showSetupMsg('Choose a passphrase first: it is your species.');
  try { localStorage.setItem('opulation.pass', pass); } catch (e) {}
  $('go').disabled = true;
  try { await boot; await startAudio(); } catch (e) { $('go').disabled = false; return showSetupMsg(e.message); }
  document.body.classList.remove('male', 'female'); document.body.classList.add(role);
  $('setup').hidden = true; $('ritual').hidden = false; resetNest(); window.scrollTo({ top: $('ritual').offsetTop - 8, behavior: 'smooth' });
  run = { id: Math.random() };
  if (role === 'male' && !eye) { eye = new FlyEye(); eye.ready.catch((e) => console.warn('fly eye', e)); }   // his optic lobe takes ~2 s to wake
  if (mode === 'sight') { if (role === 'male') maleSight(pass, $('gift').value.trim(), run); else femaleSight(pass, run); }
  else if (role === 'male') maleFlow(pass, $('gift').value.trim(), run); else femaleFlow(pass, run);
};
$('again').onclick = () => { document.body.classList.remove('male', 'female'); run = null; stopListening(); sight.stop(); $('look').hidden = true; closeNest(); $('ritual').hidden = true; $('setup').hidden = false; $('go').disabled = false; resetScene(); };
const openHow = () => { const d = $('how'); if (d.showModal) d.showModal(); else d.setAttribute('open', ''); };
$('howBtn').onclick = openHow; $('howBtn2').onclick = openHow;
const showSetupMsg = (t) => { $('setupMsg').textContent = t; $('setupMsg').hidden = false; };
let run = null;
const alive = (r) => run === r;

// ---------------------------------------------------------------- audio
let ctx = null, micNode = null, micStream = null, ignoreUntil = 0;
const listeners = new Set();
async function startAudio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  if (ctx.state !== 'running') await ctx.resume();
  if (micNode) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('This browser can\'t use the microphone here (it needs https).');
  micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
  await ctx.audioWorklet.addModule(new URL('./capture.js', import.meta.url));
  const src = ctx.createMediaStreamSource(micStream); micNode = new AudioWorkletNode(ctx, 'opul-capture');
  micNode.port.onmessage = (e) => { if (performance.now() < ignoreUntil) return; for (const l of listeners) l(e.data); };
  src.connect(micNode); const sink = ctx.createGain(); sink.gain.value = 0; micNode.connect(sink).connect(ctx.destination);
}
function stopListening() { listeners.clear(); }
/** play samples at 48 kHz; resolves when done. The phone ignores its own microphone meanwhile. */
function play(x, onTime) {
  const buf = ctx.createBuffer(1, x.length, FS); buf.copyToChannel(x, 0);
  const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination);
  const dur = x.length / FS, t0 = ctx.currentTime + 0.05; ignoreUntil = performance.now() + (dur + 0.35) * 1000;
  if (window.__opul) window.__opul.played.push(x);
  src.start(t0);
  return new Promise(res => {
    const tick = () => { const t = ctx.currentTime - t0; if (onTime) onTime(Math.max(0, t)); if (t >= dur) { ignoreUntil = performance.now() + 300; res(); } else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
}
/** sing a turn: the bytes as fly song (js/flysong.js). The trace and the logo follow it. */
function playFrame(bytes, onTime) {
  const song = Sung.compose(bytes); oscSet(Sung.render(song, 4000, 1), 4000); let pi = 0;
  let last = 0;
  return play(Sung.render(song, FS), (t) => { scene.songT = t; let pulse = false; while (pi < song.pulses.length && song.pulses[pi].t <= t) { pi++; pulse = true; ring(); }
    if (role === 'male') { const hum = song.hums.some(h => t >= h.t0 && t < h.t1); circuit.step(Math.max(0.001, t - last), { sees: scene.sees, tastes: scene.tastes, singing: true, pulse, hum }); scene.wing = circuit.a.wing; drawMale(); }
    else scene.wing = pulse ? 1 : scene.wing * 0.85;
    last = t; if (onTime) onTime(t, song.end); }).then(() => { scene.songT = -1; scene.wing = 0; });
}
const songSeconds = (n) => Sung.seconds(n);

/** listen for a sung turn that `accept(bytes)` recognises (returns non-null). Hearing a song begin extends the wait. */
function waitFrame(accept, ms, onEvent) {
  return new Promise((res) => {
    let t = setTimeout(() => done(null), ms);
    const dec = new Sung.FlySongDecoder({ sampleRate: ctx.sampleRate, onEvent: (e) => {
      if (e.kind === 'pulse') { scene.pulseFlash = performance.now(); ring(); }
      if (liveEar) liveEar.feed(e);
      if (e.kind === 'header') { clearTimeout(t); t = setTimeout(() => done(null), (e.seconds + 4) * 1000); }
      if (onEvent) onEvent(e);
      if (e.kind === 'frame' && e.ok) { const v = accept(e.bytes); if (v) done(v); }
    } });
    const l = (x) => dec.push(x); listeners.add(l);
    function done(v) { clearTimeout(t); listeners.delete(l); res(v); }
  });
}

// ---------------------------------------------------------------- the stage
const STAGES = ['orient', 'tap', 'sing', 'decide', 'mate'];
function stage(s, bad = false) {
  if (s === 'orient') { scene.kick = 0; scene.finished = 0; scene.mating = 0; }
  const i = STAGES.indexOf(s);
  for (const li of $('stages').children) { const j = STAGES.indexOf(li.dataset.s); li.className = j < i ? 'done' : j === i ? (bad ? 'bad' : 'now') : ''; }
  scene.stage = s; scene.bad = bad; scene.t0 = performance.now();
}
const caption = (t) => { $('caption').textContent = t; $('fCaption').textContent = t; };
/** the plain instruction: what to do with your phone right now */
const todo = (t, done = false) => { $('todoT').textContent = t; $('todo').classList.toggle('done', done); };
const air = (t) => { $('air').textContent = t; };

// ---------------------------------------------------------------- the male
async function maleFlow(pass, giftText, r) {
  $('brainMale').classList.remove('dim'); $('fTitle').textContent = 'Her, as his phone predicts her';
  stage('orient'); caption('He looks for her.'); air(''); todo('Point your camera at her screen and fill the frame with her face. Hold still until it locks.');
  const seen = await lookForHer(r);
  if (!alive(r) || !seen) return;
  scene.sees = 1; caption('He sees her, and turns toward her.'); todo('Got her. Now set your phone down a foot from hers, speaker facing hers, and stay quiet.'); await sleep(2500);
  let him; try { him = C.respond(pass, seen.sid, seen.Ya); } catch (e) { caption('That was not a fly.'); return; }
  const keys = him.keys, sy = Song.symbolsOf(keys.tagM), sch = Song.schedule(sy, M);
  const offerP = window.RTCPeerConnection ? Link.offer().catch(() => null) : Promise.resolve(null);
  // he can build her exactly (the seed comes from the key) and compose the song she was made to want
  const brain = new FemaleBrain(meta, bin, M, personality(S, keys.seed, meta.n));
  const snaps = []; const L = new Song.Listener(brain, sy, M); L.onFrame = (st, b) => snaps.push({ st, r: snapR(b) }); L.advance(sy, true);
  let verdict = null;
  for (let tries = 0; tries < 3 && !verdict && alive(r); tries++) {
    stage('tap'); caption('He taps her with a foreleg.'); todo('Your phone is singing his tap. Phones a foot apart, speakers facing; stay quiet.'); scene.tastes = 1; air(tries ? `tapping again (${tries + 1})…` : `tapping (song, ${songSeconds(37).toFixed(0)} s)…`);
    await playFrame(P.tap(seen.sid, him.Yb)); scene.tastes = 0.3; await sleep(1200);   // she needs a moment to build her brain
    stage('sing'); caption('He extends one wing and sings: sine song, then pulse song. The song is his key, proven.'); todo('Your phone is singing. Keep quiet and keep it still.');
    air('singing (3.7 s)…'); resetNotes(); oscSet(Song.renderTrue(sch, M, 4000), 4000);
    let shown = -1;
    await play(Song.renderAir(sch, M, FS), (t) => { scene.songT = t; driveMale(sch, t); const k = Math.min(snaps.length - 1, Math.floor(t / 0.005));
      while (shown < k) { shown++; showFemale(snaps[shown].st, snaps[shown].r, true, shown < k); } });
    scene.songT = -1; stage('decide'); caption('She decides.'); air('waiting for her…'); todo('Wait: her phone answers in a moment.');
    verdict = await waitFrame((b) => P.parseVerdict(b, seen.sid, keys), 12000);
  }
  if (!alive(r)) return;
  if (verdict === 'wrongkind') { stage('decide', true); caption('She accepts, but her pheromone tastes wrong: another species (another passphrase). He leaves.'); air(''); todo('The passphrases don\'t match. Check you both typed exactly the same, then tap Start over on both phones.', true); return; }
  if (verdict !== 'accept') { stage('decide', true); scene.kick = performance.now(); caption(verdict === 'kick' ? 'She kicks him away.' : 'No answer from her.'); air('');
    todo(verdict === 'kick' ? 'She rejected the song: usually a different passphrase, or too much noise. Check the passphrase, then Start over on both phones (she may need a few seconds to calm down).' : 'Nothing heard from her. Move the phones closer, volume up, quieter room, then Start over on both.', true); return; }
  stage('mate'); caption('She slows and opens, and she tastes right. They mate.'); todo('She accepted. Keep the phones close and quiet: they sing to each other for about 40 s more while the private chat opens.');
  // copulation: open a direct link for files and photos; its keys travel sealed, by sound
  let link = null;
  if (window.RTCPeerConnection) {
    try {
      air('opening the nest…'); const o = await offerP; if (!o) throw new Error('no WebRTC');
      for (let tries = 0; tries < 3 && !link && alive(r); tries++) {
        const msg = P.sealFixed(P.T.OFFER, seen.sid, keys, o.blob);
        air(tries ? `opening the nest (${tries + 1})…` : `he sings the way to their nest (${songSeconds(msg.length).toFixed(0)} s)…`); scene.mating = 0.2 + 0.2 * tries;
        await playFrame(msg, (t, end) => air(`he sings the way to their nest ${Math.round(100 * t / end)}%`));
        air('listening for her answer…');
        const ansB = await waitFrame((b) => P.unsealFixed(P.T.ANSWER, b, seen.sid, keys), 30000, (e) => { if (e.kind === 'progress') air(`she answers ${Math.round(100 * e.frac)}%`); });
        if (ansB) { await Link.complete(o.pc, ansB); air('connecting…'); if (await Link.open(o.dc)) link = o; }
      }
    } catch (e) { console.warn(e); }
  }
  if (!alive(r)) return;
  scene.mating = 1; memory.mated(seen.sid);
  if (link) { openNest(link.dc, giftText); caption('Mated. The nest is open: send her photos and files.'); air('mated'); todo('You\'re in. Chat and drop photos or files below; you can pick the phones up now. Leaving the page ends it.', true); return; }
  // no direct link: the note goes by sound
  if (giftText) {
    const g = P.gift(seen.sid, keys, { kind: 'text', text: giftText });
    await playFrame(g, (t, end) => air(`singing the note ${Math.round(100 * Math.min(1, t / end))}%`));
  }
  resetNest(); $('nest').hidden = false; sys('No direct link opened between the phones (are they on networks that can reach each other?).' + (giftText ? ' Your note went by sound.' : '')); if (giftText) addItem({ dir: 'out', kind: 'note', text: giftText }); nestStatus('by sound only', false);
  caption('Mated, but the nest would not open.'); air('mated'); todo('The phones couldn\'t link directly (often different or strict networks). Try both on the same Wi-Fi and Start over.', true);
}
/** his camera, until he has read her face */
async function lookForHer(r) {
  $('look').hidden = false; $('face').hidden = true; $('cam').hidden = false; $('lookCap').textContent = 'Point your camera at her face. Her eyes hold her half of the key.';
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); }
  catch (e) { $('lookCap').textContent = 'He needs the camera to see her (' + e.message + ').'; todo('Allow camera access for this page (browser settings), then Start over.', true); return null; }
  const v = $('video'); v.srcObject = stream; await v.play().catch(() => {});
  const view = $('camView'), g = view.getContext('2d'), work = document.createElement('canvas'), wg = work.getContext('2d', { willReadFrequently: true });
  let found = null, best = 0, lcMax = 1e-3, until = Infinity, eyeFirst = 0;
  // once he has read her, keep looking a moment longer so his own eye has time to see her too
  while (alive(r) && (performance.now() < until || (found && !eyeFirst && performance.now() < until + 5000) || (eyeFirst && performance.now() < eyeFirst + 1500))) {
    await sleep(90);
    const vw = v.videoWidth, vh = v.videoHeight; if (!vw) continue;
    const w = 640, h = Math.round(640 * vh / vw); work.width = w; work.height = h; view.width = w; view.height = h;
    wg.drawImage(v, 0, 0, w, h); const rgba = wg.getImageData(0, 0, w, h).data;
    g.drawImage(work, 0, 0); g.fillStyle = 'rgba(18,11,23,.35)'; g.fillRect(0, 0, w, h);
    // his optic lobe looks too (FlyHarp's model), at a fly's resolution
    if (!eye) { eye = new FlyEye(); eye.ready.catch((e) => console.warn('fly eye', e)); }
    if (eye.meta && !eye._wait) { eye.sample(rgba, w, h); eye.step(2).then((Lz) => { if (!Lz) return; eye.draw($('flyEye'), Lz); if (found && !eyeFirst) eyeFirst = performance.now(); lcMax = Math.max(lcMax * 0.995, Lz.lc10, 1e-3); scene.sees = Math.min(1, Lz.lc10 / lcMax); }); }
    const res = F.read(F.toGrey(rgba, w, h), w, h);
    if (res && res.finders) {
      // show what he sees: each facet he reads lights up
      const Lc = F.layout().cells;
      for (let i = 0; i < Lc.length; i++) { const z = res.Hm[6] * Lc[i].x + res.Hm[7] * Lc[i].y + res.Hm[8], x = (res.Hm[0] * Lc[i].x + res.Hm[1] * Lc[i].y + res.Hm[2]) / z, y = (res.Hm[3] * Lc[i].x + res.Hm[4] * Lc[i].y + res.Hm[5]) / z;
        g.fillStyle = res.bits[i] ? 'rgba(255,104,186,.95)' : 'rgba(255,210,63,.55)'; g.fillRect(x - 1.5, y - 1.5, 3, 3); }
      g.strokeStyle = '#ffb547'; g.lineWidth = 2; for (const b of res.finders) { g.beginPath(); g.arc(b.x, b.y, b.r + 4, 0, 7); g.stroke(); }
      const look = P.parseLook(res.payload);
      if (look && !found) { found = look; until = performance.now() + 2200; $('lookCap').textContent = 'He sees her. Her eyes gave him her half of the key; his own eye (below) sees her as a fly would.'; }
      else if (!look && !found) { best++; $('lookCap').textContent = 'He glimpses her… hold steady, fill the frame with her face.'; }
    }
  }
  stream.getTracks().forEach(t => t.stop());
  if (found) { $('look').hidden = true; }
  return found;
}

// ---------------------------------------------------------------- the female
async function femaleFlow(pass, r) {
  $('brainMale').classList.add('dim'); $('fTitle').textContent = 'Her ears and song pathway';
  while (alive(r)) {
    stage('orient'); resetNotes(); air('');
    const wait = memory.refractory();
    if (wait > 0) { $('look').hidden = true; caption(`After that wrong song she is wary: she won't show herself for another ${Math.ceil(wait / 1000)} s.`); todo(`Wait ${Math.ceil(wait / 1000)} s. Meanwhile, double-check the passphrase with him.`); await sleep(1000); continue; }
    // a fresh face each time: her half of the key exchange, in her eyes
    const her = new C.Initiator(pass), bits = F.facetBits(P.look(her));
    liveEar = new LiveEar(null);   // before she knows him: a typical female
    $('look').hidden = false; $('cam').hidden = true; $('face').hidden = false; F.drawCanvas($('face').getContext('2d'), bits, 1000);
    $('lookCap').textContent = 'Show him your face: hold your screen up to his camera, bright and still.';
    caption('She waits to be seen.'); air('listening…'); todo('Turn your brightness up and hold this screen toward his camera. When his phone locks on, set yours down a foot from his, speakers facing.');
    const t = await waitFrame((b) => P.parseTap(b, her.sid), 3600000, (e) => { if (e.kind === 'header') air('he taps her…'); });
    if (!alive(r) || !t) return;
    let keys; try { keys = her.finish(t.Yb); } catch (e) { caption('That was not a fly.'); continue; }
    $('look').hidden = true; scene.sees = 1;
    stage('tap'); caption('He saw her, approached and tapped her.'); todo('He found you. Phones down, a foot apart, speakers facing; stay quiet while he sings.'); scene.tastes = 1; await sleep(400); scene.tastes = 0.3;
    // her brain, from the shared seed; the song she expects: the one a male of her kind (her passphrase) would sing
    const expected = Song.symbolsOf(keys.tagM);
    let result = 'nothing';
    while (result === 'nothing' && alive(r)) {
      const brain = new FemaleBrain(meta, bin, M, personality(S, keys.seed, meta.n));
      const L = new Song.Listener(brain, expected, M), queue = []; L.onFrame = (st, b) => queue.push({ st, r: snapR(b) });
      stage('sing'); caption('She listens for his song.'); air('listening for song…'); resetNotes();
      liveEar = null; result = await hearSong(L, queue, expected, r); liveEar = new LiveEar(keys.seed);
    }
    if (!alive(r)) return;
    const accepted = result === 'accept';
    stage('decide', !accepted); caption(accepted ? 'His song is the one she was made to want. She slows down and opens.' : 'Wrong notes. She kicks and runs.');
    if (!accepted) { scene.kick = performance.now(); memory.rejected(); todo('His song was wrong: usually a different passphrase. Check you both typed the same, then try again; she waits a little longer after each rejection.', true); air('she kicks…'); await playFrame(P.kick(her.sid)); air(''); await sleep(2500); continue; }
    // copulation: he opens a direct link (or, failing that, passes a note by sound)
    let got = null;
    for (let tries = 0; tries < 4 && !got && alive(r); tries++) {
      air(`she accepts (song, ${songSeconds(21).toFixed(0)} s)…`); await playFrame(P.accept(her.sid, keys));
      stage('mate'); caption('They mate.'); air('waiting for him…'); todo('You accepted him. Keep the phones close and quiet: they sing to each other for about 40 s more while the private chat opens.');
      got = await waitFrame((b) => { const o = P.unsealFixed(P.T.OFFER, b, her.sid, keys); if (o) return { offer: o }; const g = P.parseGift(b, her.sid, keys); return g ? { gift: g } : null; }, 16000,
        (e) => { if (e.kind === 'progress') { scene.mating = e.frac * 0.5; air(`he sings the way to your nest ${Math.round(100 * e.frac)}%`); } });
    }
    if (!alive(r)) return;
    if (!got) { caption('He went quiet.'); todo('His phone went quiet. Keep the phones close; if nothing happens, Start over on both.', true); continue; }
    memory.mated(her.sid);
    if (got.gift) { resetNest(); $('nest').hidden = false; sys('No direct link opened, so his note came by sound.'); addItem({ dir: 'in', kind: 'note', text: got.gift.text }); nestStatus('by sound only', false); caption('Mated. His note is hers.'); scene.mating = 1; air('mated'); return; }
    let link = null;
    try { link = await Link.answer(got.offer); } catch (e) { console.warn(e); }
    if (link) {
      await playFrame(P.sealFixed(P.T.ANSWER, her.sid, keys, link.blob), (t, end) => { scene.mating = 0.5 + 0.5 * t / end; air(`she answers ${Math.round(100 * t / end)}%`); }); air('connecting…');
      const dc = await Promise.race([link.dc, sleep(20000).then(() => null)]);
      if (dc && await Link.open(dc)) { scene.mating = 1; openNest(dc, ''); caption('Mated. The nest is open.'); air('mated'); todo('You\'re in. Chat and drop photos or files below; you can pick the phones up now. Leaving the page ends it.', true); return; }
    }
    // the link failed: he may still send a note by sound
    resetNest(); $('nest').hidden = false; sys('No direct link opened between the phones. Listening for a note by sound…'); nestStatus('by sound only', false);
    const g = await waitFrame((b) => P.parseGift(b, her.sid, keys), 30000);
    if (g) addItem({ dir: 'in', kind: 'note', text: g.text });
    caption('Mated.'); air('mated'); return;
  }
}

// ---------------------------------------------------------------- by sight: screen to screen, front cameras
// Each phone shows a loop of cards at the bottom of its screen and reads the other's with its front camera. Held
// head to tail, a hand apart, each camera sits over the other phone's cards. Only the key song goes by sound.
const sight = {
  stream: null, cards: null, kind: 'eyes', i: 0, timer: 0, pose: null,
  async start() {
    $('sight').hidden = false; document.body.classList.add('sighted');
    // the top of the screen shows the courtship (his fly, or her brain) for anyone peeking; the cards fill the bottom
    setTimeout(() => (role === 'male' ? document.querySelector('.theatre') : $('brainFemale')).scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    if (this.stream || window.__opul) return true;
    try { this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); }
    catch (e) { return false; }
    const v = $('fcam'); v.srcObject = this.stream; await v.play().catch(() => {}); return true;
  },
  /** play a loop of cards, about four a second (his: each card a pose of his dance) */
  show(bytes, magic, kind, onCard) {
    clearInterval(this.timer); this.kind = kind; this.i = 0;
    this.cards = V.cards(bytes, magic, kind).map(c => F.facetBits(c, kind));
    const g = $('card').getContext('2d');
    const tick = () => { const k = this.i++ % this.cards.length; F.drawCanvas(g, this.cards[k], 1000, { kind }); if (onCard) onCard(k, this.cards.length); };
    tick(); this.timer = setInterval(tick, 250);
  },
  /** one camera frame, as grey, at up to 960 px wide */
  frame(work) {
    if (window.__opul) return window.__opul.camFeed();
    const v = $('fcam'), vw = v.videoWidth, vh = v.videoHeight; if (!vw) return null;
    const w = Math.min(960, vw), h = Math.round(w * vh / vw); work.width = w; work.height = h;
    const wg = work.getContext('2d', { willReadFrequently: true }); wg.drawImage(v, 0, 0, w, h); return { rgba: wg.getImageData(0, 0, w, h).data, w, h };
  },
  /** read the other phone's cards until `accept(message)` returns something (or `ms` passes) */
  async watch(kind, magics, accept, ms, r, { onProgress, view } = {}) {
    const A = new V.Assembler(magics), work = document.createElement('canvas'), until = performance.now() + ms;
    while (alive(r) && performance.now() < until) {
      await sleep(70); const fr = this.frame(work); if (!fr) continue;
      const res = F.read(F.toGrey(fr.rgba, fr.w, fr.h), fr.w, fr.h, kind);
      if (view) view(fr, res, kind);
      if (!res || !res.payload) continue;
      const m = A.push(res.payload); if (onProgress) onProgress(A.progress, A.magic);
      if (m) { const v = accept(m); if (v) return v; A.reset(); }
    }
    return null;
  },
  stop() { clearInterval(this.timer); this.timer = 0; scene.pose = null; if (this.stream) this.stream.getTracks().forEach(t => t.stop()); this.stream = null; $('sight').hidden = true; document.body.classList.remove('sighted'); },
};
const trace = (t) => { if (window.__opul) console.warn(`t=${(performance.now() / 1000).toFixed(1)} ${t}`); };
const sightCap = (t) => { $('sightCap').textContent = t; };
$('sightX').onclick = () => $('again').click();
/** what his camera sees (and his fly eye makes of it), with the facets he reads lit up */
function viewFor() {
  const view = $('camView'), g = view.getContext('2d'); let lcMax = 1e-3;
  return (fr, res, kind) => {
    view.width = fr.w; view.height = fr.h; g.putImageData(new ImageData(new Uint8ClampedArray(fr.rgba), fr.w, fr.h), 0, 0);
    g.fillStyle = 'rgba(18,11,23,.35)'; g.fillRect(0, 0, fr.w, fr.h);
    if (eye && eye.meta && !eye._wait) { eye.sample(fr.rgba, fr.w, fr.h); eye.step(2).then((Lz) => { if (!Lz) return; eye.draw($('flyEye'), Lz); lcMax = Math.max(lcMax * 0.995, Lz.lc10, 1e-3); scene.sees = Math.max(scene.sees, Math.min(1, Lz.lc10 / lcMax)); }); }
    if (!res || !res.finders) return;
    const Lc = F.layout(kind).cells, H = res.Hm;
    for (let i = 0; i < Lc.length; i++) { const z = H[6] * Lc[i].x + H[7] * Lc[i].y + H[8], x = (H[0] * Lc[i].x + H[1] * Lc[i].y + H[2]) / z, y = (H[3] * Lc[i].x + H[4] * Lc[i].y + H[5]) / z;
      g.fillStyle = res.bits[i] ? 'rgba(255,104,186,.95)' : 'rgba(255,210,63,.55)'; g.fillRect(x - 2, y - 2, 4, 4); }
    g.strokeStyle = res.payload ? '#ffb547' : 'rgba(255,181,71,.4)'; g.lineWidth = 2; for (const b of res.finders) { g.beginPath(); g.arc(b.x, b.y, b.r + 4, 0, 7); g.stroke(); }
  };
}
const HOLD = 'Hold the phones screen to screen, head to tail (one upside down), about a hand apart. Brightness up; keep them still.';

/** his key song, with her brain as his phone predicts it */
async function singKey(sch, snaps) {
  air('singing (3.7 s)…'); resetNotes(); oscSet(Song.renderTrue(sch, M, 4000), 4000);
  let shown = -1;
  await play(Song.renderAir(sch, M, FS), (t) => { scene.songT = t; driveMale(sch, t); const k = Math.min(snaps.length - 1, Math.floor(t / 0.005));
    while (shown < k) { shown++; showFemale(snaps[shown].st, snaps[shown].r, true, shown < k); } });
  scene.songT = -1;
}

async function maleSight(pass, giftText, r) {
  $('brainMale').classList.remove('dim'); $('fTitle').textContent = 'Her, as his phone predicts her';
  if (!eye) { eye = new FlyEye(); eye.ready.catch((e) => console.warn('fly eye', e)); }
  const offerP = window.RTCPeerConnection ? Link.offer().catch(() => null) : Promise.resolve(null);   // the way to the nest, ready before he needs it
  stage('orient'); caption('He looks for her.'); air('');
  $('look').hidden = false; $('face').hidden = true; $('cam').hidden = false; $('lookCap').textContent = 'What his front camera sees of her screen, and what his own eye makes of it.';
  if (!await sight.start()) { todo('He needs the camera to see her: allow camera access for this page, then Start over. (Or choose Song only.)', true); sight.stop(); return; }
  // until he has seen her, his own card is plain: his wing, still
  sight.show(new Uint8Array(0), 0, 'wing'); sightCap('He looks for her…');
  todo(HOLD + ' His phone is looking for her face.');
  const view = viewFor();
  const lk = await sight.watch('eyes', V.MAGIC.LOOK, (m) => P.parseLook(m.bytes), 90000, r, { view, onProgress: (f) => sightCap(`He glimpses her… ${Math.round(100 * f)}%`) });
  if (!alive(r)) return; if (!lk) { sight.stop(); caption('He never saw her.'); todo('His camera couldn\'t read her screen. Brightness up on hers, a hand apart, head to tail, and Start over on both. (Or choose Song only.)', true); return; }
  scene.sees = 1; caption('He sees her, turns toward her, and dances.');
  let him; try { him = C.respond(pass, lk.sid, lk.Ya); } catch (e) { caption('That was not a fly.'); sight.stop(); return; }
  const keys = him.keys, sy = Song.symbolsOf(keys.tagM), sch = Song.schedule(sy, M);
  const brain = new FemaleBrain(meta, bin, M, personality(S, keys.seed, meta.n));
  const snaps = []; const L = new Song.Listener(brain, sy, M); L.onFrame = (st, b) => snaps.push({ st, r: snapR(b) }); L.advance(sy, true);
  // he dances and sings at once, as real males do: the dance carries his tap and the way to their nest (sealed),
  // the song proves his key. He repeats his song in bouts until her eyes answer.
  stage('sing'); caption('He dances and sings at once.'); todo('He dances and sings: keep still and quiet. ' + HOLD);
  const dance = (o) => sight.show(V.pair(P.tap(lk.sid, him.Yb), o ? P.sealFixed(P.T.OFFER, lk.sid, keys, o.blob) : undefined), V.MAGIC.DANCE, 'wing', (k, n) => {
    const p = V.POSES[k % V.POSES.length]; scene.pose = p; sightCap(`He ${p.name} · ${k + 1}/${n}`); });
  let o = null; const offered = offerP.then((x) => { o = x; if (alive(r)) dance(x); });   // usually ready already: gathering began before he saw her
  await Promise.race([offered, sleep(400)]); if (!o) dance(null);   // don't hold the song for it; the dance switches when it's ready
  let seen = false, verdict = null, ab = null;
  const replyP = sight.watch('eyes', [V.MAGIC.SEEN, V.MAGIC.ANSWER], (m) => {
    if (m.magic === V.MAGIC.SEEN) { if (!seen && P.parseSeen(m.bytes, lk.sid)) { seen = true; caption('She has his dance, and she listens.'); } return null; }
    return m; }, 60000, r, { view });
  let reply = null;
  for (let bout = 0; bout < 8 && !reply && alive(r); bout++) {
    air(`singing${bout ? ' again' : ''} (3.7 s)…`); await singKey(sch, snaps);
    if (!alive(r)) return;
    stage('decide'); air('waiting for her…');
    reply = await Promise.race([replyP, sleep(seen ? 6000 : 1600).then(() => undefined)]);   // between bouts, a pause (and her eyes, if she has answered)
    if (reply === null) break; if (reply === undefined) { reply = null; stage('sing'); }
  }
  if (reply) { const [vb, a] = V.unpair(reply.bytes) || []; verdict = vb && P.parseVerdict(vb, lk.sid, keys); ab = a; }
  if (!alive(r)) return;
  if (verdict !== 'accept') {
    sight.stop(); stage('decide', true); if (verdict === 'kick') scene.kick = performance.now(); air('');
    if (verdict === 'wrongkind') { caption('She accepts, but her pheromone tastes wrong: another species (another passphrase). He leaves.'); todo('The passphrases don\'t match. Check you both typed exactly the same, then tap Start over on both phones.', true); return; }
    caption(verdict === 'kick' ? 'She kicks him away.' : 'No answer from her.');
    todo(verdict === 'kick' ? 'She rejected the song: usually a different passphrase, or too much noise. Check the passphrase, then Start over on both phones.' : 'Nothing from her. Brightness up, a hand apart, quieter room, then Start over on both. (Or choose Song only.)', true); return;
  }
  stage('mate'); caption('She slows and opens, and she tastes right. They mate.'); air('connecting…'); todo('She accepted. Keep holding a moment while the private chat opens.');
  sightCap('She accepted. Connecting…'); scene.mating = 0.5;
  let link = null;
  const ans = ab && ab.length ? P.unsealFixed(P.T.ANSWER, ab, lk.sid, keys) : null;
  if (o && ans) { try { await Link.complete(o.pc, ans); if (await Link.open(o.dc)) link = o; } catch (e) { console.warn(e); } }
  sight.stop(); if (!alive(r)) return;
  scene.mating = 1; memory.mated(lk.sid);
  if (link) { openNest(link.dc, giftText); caption('Mated. The nest is open: send her photos and files.'); air('mated'); todo('You\'re in. Chat and drop photos or files below; you can pick the phones up now. Leaving the page ends it.', true); return; }
  if (giftText) { todo('No direct link opened, so he sings his note instead: phones close, quiet.'); await playFrame(P.gift(lk.sid, keys, { kind: 'text', text: giftText }), (t, end) => air(`singing the note ${Math.round(100 * Math.min(1, t / end))}%`)); }
  resetNest(); $('nest').hidden = false; sys('No direct link opened between the phones (are they on networks that can reach each other?).' + (giftText ? ' Your note went by sound.' : '')); if (giftText) addItem({ dir: 'out', kind: 'note', text: giftText }); nestStatus('by sound only', false);
  caption('Mated, but the nest would not open.'); air('mated'); todo('The phones couldn\'t link directly (often different or strict networks). Try both on the same Wi-Fi and Start over.', true);
}

async function femaleSight(pass, r) {
  $('brainMale').classList.add('dim'); $('fTitle').textContent = 'Her ears and song pathway';
  if (!await sight.start()) { todo('She needs the front camera to watch him dance: allow camera access for this page, then Start over. (Or choose Song only.)', true); sight.stop(); return; }
  while (alive(r)) {
    stage('orient'); resetNotes(); air(''); $('look').hidden = true;
    const wait = memory.refractory();
    if (wait > 0) { sight.show(new Uint8Array(0), 0, 'eyes'); sightCap(`Wary: ${Math.ceil(wait / 1000)} s`); caption(`After that wrong song she is wary: she won't show herself for another ${Math.ceil(wait / 1000)} s.`); todo(`Wait ${Math.ceil(wait / 1000)} s. Meanwhile, double-check the passphrase with him.`); await sleep(1000); continue; }
    const her = new C.Initiator(pass);
    liveEar = new LiveEar(null); const tape = new SongTape();
    sight.show(P.look(her), V.MAGIC.LOOK, 'eyes', (k, n) => sightCap(`Her eyes · ${k + 1}/${n}`));
    caption('She waits to be seen.'); air('watching for him…'); todo(HOLD + ' Her eyes are showing him her half of the key.');
    const dn = await sight.watch('wing', V.MAGIC.DANCE, (m) => { const pr = V.unpair(m.bytes), t = pr && P.parseTap(pr[0], her.sid); return t ? { t, off: pr[1] } : null; }, 3600000, r,
      { onProgress: (f) => { if (f > 0) { stage('sing'); caption('He dances and sings for her.'); air(`watching him dance ${Math.round(100 * f)}%`); } } });
    if (!alive(r) || !dn) { tape.stop(); return; }
    let keys; try { keys = her.finish(dn.t.Yb); } catch (e) { tape.stop(); caption('That was not a fly.'); continue; }
    scene.sees = 1; scene.tastes = 1;
    // his offer only opens if he is her kind; she starts answering it while she judges (it is only sent if she accepts)
    const offer = dn.off.length ? P.unsealFixed(P.T.OFFER, dn.off, her.sid, keys) : null;
    const answerP = offer && window.RTCPeerConnection ? Link.answer(offer).catch(() => null) : Promise.resolve(null);
    sight.show(P.seen(her.sid), V.MAGIC.SEEN, 'eyes'); sightCap('She lets him near…');
    caption('She has his dance; now she knows the song she wants. She judges his.');
    const expected = Song.symbolsOf(keys.tagM);
    const brain = new FemaleBrain(meta, bin, M, personality(S, keys.seed, meta.n));
    const L = new Song.Listener(brain, expected, M), queue = []; L.onFrame = (st, b) => queue.push({ st, r: snapR(b) });
    resetNotes(); liveEar = null; trace('judge, bouts on tape ' + tape.bouts.length);
    const result = await judgeTape(tape, L, queue, r, 15000); tape.stop(); liveEar = new LiveEar(keys.seed); trace('heard ' + result);
    if (!alive(r)) return;
    const accepted = result === 'accept';
    stage('decide', !accepted); caption(accepted ? 'His song is the one she was made to want. She slows down and opens.' : result === 'nothing' ? 'She heard no song.' : 'Wrong notes. She kicks and runs.');
    if (!accepted) {
      scene.kick = performance.now(); if (result !== 'nothing') memory.rejected(); answerP.then(l => { try { l && l.pc.close(); } catch (e) {} });
      sight.show(V.pair(P.kick(her.sid)), V.MAGIC.ANSWER, 'eyes'); sightCap('She kicks.');
      todo(result === 'nothing' ? 'No song reached her: volume up, quieter room, and try again.' : 'His song was wrong: usually a different passphrase. Check you both typed the same; she waits a little longer after each rejection.', true);
      air('she kicks…'); await sleep(6000); continue;
    }
    const link = await answerP; trace('answer ready ' + !!link);
    sight.show(V.pair(P.accept(her.sid, keys), link ? P.sealFixed(P.T.ANSWER, her.sid, keys, link.blob) : undefined), V.MAGIC.ANSWER, 'eyes', (k, n) => sightCap(`She opens · ${k + 1}/${n}`));
    stage('mate'); caption('They mate.'); air('connecting…'); todo('You accepted him. Keep holding a moment while the private chat opens.'); scene.mating = 0.5;
    memory.mated(her.sid);
    const dc = link ? await Promise.race([link.dc, sleep(30000).then(() => null)]) : null;
    if (!alive(r)) return;
    if (dc && await Link.open(dc)) { sight.stop(); scene.mating = 1; openNest(dc, ''); caption('Mated. The nest is open.'); air('mated'); todo('You\'re in. Chat and drop photos or files below; you can pick the phones up now. Leaving the page ends it.', true); return; }
    // no direct link: keep her answer up a little longer, then listen for a note by sound
    await sleep(4000); sight.stop();
    resetNest(); $('nest').hidden = false; sys('No direct link opened between the phones. Listening for a note by sound…'); nestStatus('by sound only', false);
    todo('No direct link opened. Put the phones down close together; he may sing a note.', true);
    const g = await waitFrame((b) => P.parseGift(b, her.sid, keys), 30000);
    if (g) addItem({ dir: 'in', kind: 'note', text: g.text });
    caption('Mated.'); air('mated'); return;
  }
}

// ---------------------------------------------------------------- the nest: a temporary chat, with photo and file drops
// Nothing is stored: the thread lives only in this page. When either phone leaves, the session is over.
let nest = null; const rows = new Map();
const hhmm = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
function nestStatus(t, ok = true) { $('nestStatus').textContent = t; $('nestDot').classList.toggle('off', !ok); }
function resetNest() { $('nest').hidden = true; $('nestSend').hidden = true; $('nestSend').classList.remove('off'); $('items').innerHTML = ''; rows.clear(); nestStatus(''); $('nestTitle').textContent = 'Just the two of you'; }
function closeNest() { try { nest && nest.dc.close(); } catch (e) {} nest = null; resetNest(); }
function sys(t) { const li = document.createElement('li'); li.className = 'sys'; li.textContent = t; $('items').append(li); scrollThread(); }
function scrollThread() { const th = $('items'); th.scrollTop = th.scrollHeight; }
function openNest(dc, firstNote) {
  resetNest(); $('nest').hidden = false; $('nestSend').hidden = false;
  nestStatus('session open · direct, encrypted, kept nowhere');
  sys('She accepted. This lasts as long as you both do.');
  nest = new Link.Nest(dc, { onItem: (it) => addItem(it), onProgress: (p) => progress(p) });
  dc.addEventListener('close', () => { scene.finished = performance.now(); nest = null; $('nestSend').classList.add('off'); $('nestTitle').textContent = 'All finished'; nestStatus('spent · nothing kept', false);
    sys('…and that\'s that. You\'re both finished; nothing was kept. Save anything you want before you slip away.'); });
  if (firstNote) sendItem(firstNote, 'note');
  $('nest').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function sendItem(x, kind) { if (!nest) return; const it = await nest.send(x, kind); addItem(it); }
$('pickPhoto').onchange = (e) => { for (const f of e.target.files) sendItem(f, 'photo'); e.target.value = ''; };
$('pickFile').onchange = (e) => { for (const f of e.target.files) sendItem(f, 'file'); e.target.value = ''; };
$('noteSend').onclick = () => { const t = $('noteIn').value.trim(); if (t) { sendItem(t, 'note'); $('noteIn').value = ''; $('noteIn').focus(); } };
$('noteIn').onkeydown = (e) => { if (e.key === 'Enter') $('noteSend').click(); };
const human = (n) => n < 1024 ? n + ' B' : n < 1 << 20 ? (n / 1024).toFixed(0) + ' kB' : (n / (1 << 20)).toFixed(1) + ' MB';
const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ext = (n) => ((n || '').split('.').pop() || 'file').slice(0, 4);
function row(dir, id) { const key = dir + id; let li = rows.get(key); if (!li) { li = document.createElement('li'); li.className = dir; $('items').append(li); rows.set(key, li); scrollThread(); } return li; }
function progress(p) {
  if (p.kind === 'note') return;                         // notes are small; they just appear
  const li = row(p.dir, p.id);
  if (!li.querySelector('progress')) li.innerHTML = `<div class="drop"><div class="file"><span class="ico">${esc(ext(p.name))}</span><div><div class="fn">${esc(p.name)}</div><div class="fs">${human(p.size || 0)} · ${p.dir === 'in' ? 'arriving' : 'sending'}</div></div></div><progress max="1"></progress></div>`;
  li.querySelector('progress').value = p.frac;
}
async function addItem(it) {
  const li = it.id != null ? row(it.dir, it.id) : row(it.dir, 'x' + Math.random()), when = `<div class="when">${hhmm()}</div>`;
  if (it.kind === 'note') { const text = it.text ?? await it.blob.text(); li.innerHTML = `<div class="bub">${esc(text)}</div>${when}`; scrollThread(); return; }
  const url = URL.createObjectURL(it.blob), isImg = (it.type || '').startsWith('image/');
  li.innerHTML = `<div class="drop">` + (isImg ? `<img src="${url}" alt="${esc(it.name)}">` :
    `<div class="file"><span class="ico">${esc(ext(it.name))}</span><div><div class="fn">${esc(it.name)}</div><div class="fs">${human(it.size)}</div></div></div>`) +
    `<a href="${url}" download="${esc(it.name)}">${it.dir === 'in' ? 'save' : 'sent'} ${isImg ? 'photo' : 'file'}</a></div>${when}`;
  scrollThread();
}

/** listen to the song as it arrives; her brain runs train by train and replays in real time just behind it */
function hearSong(L, queue, expected, r) {
  return new Promise((res) => {
    const heard = []; let finished = false, start = 0, k = 0;
    const finish = () => { if (finished) return; finished = true; L.advance(heard.slice(), true); };
    const det = new Song.SongDetector(M, ctx.sampleRate, () => {}, () => { scene.pulseFlash = performance.now(); ring(); if (!start) start = performance.now() + 800; });
    det.onTrain = (syms, n) => { heard.push(...syms); if (n >= Song.TRAINS) finish(); else L.advance(heard.slice(), false); };
    const l = (x) => det.push(x); listeners.add(l);
    const giveUp = setTimeout(() => { det.flush(); finish(); }, 16000);
    const tick = () => {
      if (!alive(r)) { listeners.delete(l); clearTimeout(giveUp); return; }
      if (finished && !start) start = performance.now();
      if (start) { const want = Math.min(queue.length - 1, Math.floor((performance.now() - start) / 5)); while (k <= want) { const q = queue[k]; showFemale(q.st, q.r, false, k < want); k++; } }   // draw only the latest; tick the notes for the rest
      if (finished && k >= queue.length) { listeners.delete(l); clearTimeout(giveUp); return res(heard.length ? (L.verdict || 'reject') : 'nothing'); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

// By sight and song he sings while he dances, before she has his tap (and so before she knows what song to expect).
// Her phone keeps every whole bout she hears; once his dance gives her the key, her brain hears the latest bout
// again, replayed from her memory of it, and judges it, or waits for his next bout.
class SongTape {
  constructor() {
    this.bouts = []; this.trains = 0; this.ring = performance.now();
    this.det = new Song.SongDetector(M, ctx.sampleRate, ({ symbols }) => { this.bouts.push({ symbols, at: performance.now() }); this.trains = 0; },
      () => { scene.pulseFlash = performance.now(); ring(); });
    this.det.onTrain = (syms, n) => { this.trains = n; }; this.det.onBout = () => { this.trains = 0; };
    this.l = (x) => this.det.push(x); listeners.add(this.l);
  }
  stop() { listeners.delete(this.l); }
}
function judgeTape(tape, L, queue, r, ms = 14000) {
  return new Promise((res) => {
    const t0 = performance.now(), had = tape.bouts.length; let start = 0, k = 0, fast = false;
    const tick = () => {
      if (!alive(r)) return res('nothing');
      if (!start) {
        const b = tape.bouts[tape.bouts.length - 1];
        if (b) { L.advance(b.symbols, true); fast = had > 0; start = performance.now(); }   // a bout heard before she had his key: replayed at double speed
        else if (performance.now() - t0 > ms) return res('nothing');
        else air(tape.trains ? `hearing his song… ${tape.trains}/${Song.TRAINS}` : 'listening for his song…');
      }
      if (start) {
        air(fast ? 'she hears it again, in her head…' : 'she hears it…');
        const want = Math.min(queue.length - 1, Math.floor((performance.now() - start) / (fast ? 2.5 : 5)));
        while (k <= want) { const q = queue[k]; showFemale(q.st, q.r, false, k < want); k++; }
        if (k >= queue.length) return res(L.verdict || 'reject');
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

// ---------------------------------------------------------------- her ears, live: every turn he sings goes through her FlyWire network
// (the key song has its own listener, which also judges it; this one just hears)
let liveEar = null;
class LiveEar {
  constructor(seed) {
    this.brain = new FemaleBrain(meta, bin, M, personality(S, seed || new Uint8Array(32), meta.n));
    this.framer = new Song.Framer(M); this.sch = { pulses: [], hums: [], end: 1e12 }; this.dirty = false;
  }
  feed(e) {
    const T = (t) => Math.round(t / M.song.tick);
    if (e.kind === 'pulse') this.sch.pulses.push({ t: T(e.t), k: -1 });
    else if (e.kind === 'hum') { const h = this.sch.hums[this.sch.hums.length - 1], t = T(e.t); if (h && t - h.t1 < 200) h.t1 = t; else this.sch.hums.push({ t0: t - 80, t1: t }); }
    else if (e.kind === 'time') {
      const upto = T(e.t) - M.envOff - 40;
      while ((this.framer.n + 1) * M.dtTicks <= upto) { const fr = this.framer.next(this.sch); this.brain.input(fr.f); this.brain.step(); this.dirty = true; }
    }
  }
  draw() { if (!this.dirty) return; this.dirty = false; const r = snapR(this.brain); drawNet(r); showAreas(r); }
}

// ---------------------------------------------------------------- her brain on screen
let pos = null, areaIdx = null, readSet = null, vpo = [];
// FlyHarp's area palette: ears teal, AMMC/saddle violet, wedge yellow, AVLP red, GNG orange; the song readout hot pink
const NPCOL = { JO: '79,179,164', AMMC: '143,127,214', SAD: '143,127,214', WED: '224,195,90', AVLP: '226,87,107', PVLP: '226,87,107', GNG: '232,138,79', IPS: '232,138,79', SPS: '232,138,79' };
const AREAS = [['JO', ['JO']], ['AMMC', ['AMMC']], ['SAD', ['SAD']], ['WED', ['WED']], ['AVLP', ['AVLP', 'PVLP']], ['GNG', ['GNG']], ['IPS', ['IPS', 'SPS']]];
function prepNet() {
  const c = $('fNet'), W = c.width, H = c.height; let x0 = 1e18, x1 = -1e18, y0 = 1e18, y1 = -1e18;
  for (let i = 0; i < meta.n; i++) { x0 = Math.min(x0, meta.x[i]); x1 = Math.max(x1, meta.x[i]); y0 = Math.min(y0, meta.y[i]); y1 = Math.max(y1, meta.y[i]); }
  const s = Math.min((W - 40) / (x1 - x0), (H - 40) / (y1 - y0)), ox = (W - s * (x1 - x0)) / 2, oy = (H - s * (y1 - y0)) / 2;
  pos = new Float32Array(2 * meta.n); for (let i = 0; i < meta.n; i++) { pos[2 * i] = ox + s * (meta.x[i] - x0); pos[2 * i + 1] = oy + s * (meta.y[i] - y0); }
  areaIdx = AREAS.map(([, nps]) => meta.np.map((n, i) => nps.includes(n) ? i : -1).filter(i => i >= 0));
  readSet = new Set(M.readout); vpo = M.named.vpoEN || [];
  $('fAreas').innerHTML = AREAS.map(([n]) => `<div class="area"><i><b style="height:0"></b></i>${n}</div>`).join('');
  const bar = $('notes'); bar.innerHTML = '<span></span>'.repeat(64);
  $('rTheta').style.left = '40%';
  drawNet(new Uint8Array(meta.n)); drawMale();
}
function snapR(b) { const a = new Uint8Array(b.N); for (let i = 0; i < b.N; i++) a[i] = Math.min(255, b.r[i] >> 8); return a; }
function resetNotes() { for (const s of $('notes').children) s.className = ''; $('rBar').style.width = '0'; $('rVal').textContent = ''; }
function showAreas(r) {
  const bars = $('fAreas').querySelectorAll('b');
  areaIdx.forEach((ids, k) => { let s = 0; for (const i of ids) s += r[i]; const m = ids.length ? s / ids.length / 255 : 0; bars[k].style.height = Math.min(100, 100 * Math.sqrt(m * 4)) + '%'; });
}
function showFemale(st, r, predicted, skipDraw = false) {
  for (const p of st.pulses) if (p.k >= 0) $('notes').children[p.k].className = st.cur === 'match' ? 'm' : 'w';
  if (skipDraw) return;
  drawNet(r); showAreas(r);
  const full = Song.LISTEN.THETA * 2.5;   // the threshold mark sits at 40%
  $('rBar').style.width = Math.min(100, 100 * st.R / full) + '%';
  $('rVal').textContent = st.verdict ? (st.verdict === 'accept' ? 'accepts' : 'rejects') : `${st.matched} right · ${st.wrong} wrong${predicted ? ' (predicted)' : ''}`;
}
function drawNet(r) {
  const c = $('fNet'), g = c.getContext('2d'); g.globalCompositeOperation = 'source-over'; g.fillStyle = '#12040c'; g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < meta.n; i++) {
    const a = r[i] / 255, x = pos[2 * i], y = pos[2 * i + 1];
    if (a < 0.01) { g.fillStyle = 'rgba(200,120,160,0.10)'; g.fillRect(x, y, 1.6, 1.6); continue; }
    const col = readSet.has(i) ? '255,104,186' : NPCOL[meta.np[i]] || '231,165,143';
    g.fillStyle = `rgba(${col},${Math.min(1, 0.25 + a * 1.5)})`; const s = 1.6 + a * 4; g.fillRect(x - s / 2, y - s / 2, s, s);
  }
  g.globalCompositeOperation = 'source-over';
  for (const i of vpo) { g.strokeStyle = 'rgba(255,210,63,0.85)'; g.beginPath(); g.arc(pos[2 * i], pos[2 * i + 1], 6 + r[i] / 40, 0, 7); g.stroke(); }
  if (vpo.length) { g.fillStyle = '#FFD23F'; g.font = 'italic 22px "Playfair Display", serif'; g.fillText('vpoEN', pos[2 * vpo[0]] + 9, pos[2 * vpo[0]] - 6); }
  g.font = '18px "Courier Prime", monospace'; g.fillStyle = 'rgba(79,179,164,.95)'; g.fillText('■ ears (Johnston\'s organ)', 12, c.height - 12); g.fillStyle = 'rgba(255,104,186,.95)'; g.textAlign = 'right'; g.fillText('■ song pathway → vpoEN', c.width - 12, c.height - 12); g.textAlign = 'left';
}

// ---------------------------------------------------------------- his circuit on screen
const circuit = new MaleCircuit(); let lastT = 0, pulseIdx = 0;
const NPOS = { LC10a: [0.13, 0.2], vAB3: [0.13, 0.66], P1: [0.33, 0.43], pIP10: [0.53, 0.43], dPR1: [0.73, 0.12], vPR6: [0.73, 0.43], TN1A: [0.73, 0.74], wing: [0.9, 0.43] };
function driveMale(sch, t) {
  if (t < lastT) { lastT = 0; pulseIdx = 0; }
  const dt = Math.max(0.001, t - lastT); lastT = t;
  const tick = t / M.song.tick; let pulse = false;
  while (pulseIdx < sch.pulses.length && sch.pulses[pulseIdx].t <= tick) { pulse = true; pulseIdx++; }
  if (pulse) ring();
  const hum = sch.hums.some(h => tick >= h.t0 && tick < h.t1);
  circuit.step(dt, { sees: scene.sees, tastes: scene.tastes, singing: true, pulse, hum }); scene.wing = circuit.a.wing; drawMale();
}
function idleMale() { if (scene.songT >= 0) return; circuit.step(1 / 60, { sees: scene.sees, tastes: scene.tastes }); scene.wing = circuit.a.wing; drawMale(); }
function drawMale() {
  const c = $('mNet'), g = c.getContext('2d'), W = c.width, H = c.height; g.fillStyle = '#12040c'; g.fillRect(0, 0, W, H);
  const P = (id) => [NPOS[id][0] * W, NPOS[id][1] * H];
  for (const [a, b] of EDGES) { const [x0, y0] = P(a), [x1, y1] = P(b), act = circuit.a[a]; g.strokeStyle = `rgba(255,210,63,${0.15 + 0.7 * act})`; g.lineWidth = 1 + 3 * act; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
  for (const n of NODES) {
    const [x, y] = P(n.id), a = circuit.a[n.id], rad = 16 + 8 * a;
    const grd = g.createRadialGradient(x, y, 2, x, y, rad * 2); grd.addColorStop(0, `rgba(255,104,186,${0.2 + 0.8 * a})`); grd.addColorStop(1, 'rgba(255,104,186,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, rad * 2, 0, 7); g.fill();
    g.fillStyle = '#2a0b1d'; g.strokeStyle = `rgba(243,227,211,${0.4 + 0.6 * a})`; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 14, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#f3e3d3'; g.font = '600 20px "Spline Sans", sans-serif'; g.textAlign = 'center'; g.fillText(n.label, x, y + 40);
    g.fillStyle = 'rgba(185,150,166,.95)'; g.font = '15px "Courier Prime", monospace'; g.fillText(n.role, x, y + 60);
  }
  g.textAlign = 'left';
}
let osc = null, oscFs = 4000;
function oscSet(x, fs) { osc = x; oscFs = fs; }
function drawOsc() {
  const c = $('osc'), g = c.getContext('2d'), W = c.width, H = c.height; g.fillStyle = '#12040c'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,104,186,.2)'; g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
  if (!osc || scene.songT < 0) { g.fillStyle = 'rgba(185,150,166,.85)'; g.font = 'italic 20px "Playfair Display", serif'; g.fillText('his song, at true pitch, appears here as he sings', 12, H - 14); return; }
  const span = 0.5, n0 = Math.floor((scene.songT - span) * oscFs), n1 = Math.floor(scene.songT * oscFs);
  g.strokeStyle = '#FF68BA'; g.shadowColor = 'rgba(255,104,186,.8)'; g.shadowBlur = 8; g.lineWidth = 1.4; g.beginPath();
  for (let x = 0; x < W; x++) { const n = n0 + Math.floor((n1 - n0) * x / W), v = n >= 0 && n < osc.length ? osc[n] : 0; const y = H / 2 - v * H * 1.3; x ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke(); g.shadowBlur = 0;
}

// ---------------------------------------------------------------- the mast slips like a copier sheet (as FlyHarp's), and the logo's wing rings with each pulse
const logoEl = document.querySelector('.logo'), strings = document.querySelector('#logo .strings'), reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let lastJit = 0;
function jitter() { if (reduced || !logoEl) return; logoEl.classList.remove('jit'); void logoEl.offsetWidth; logoEl.classList.add('jit'); lastJit = performance.now(); }
function ring() { if (!strings) return; strings.classList.remove('ring'); void strings.getBBox(); strings.classList.add('ring'); if (performance.now() - lastJit > 420 && Math.random() < 0.3) jitter(); }
(function idle() { setTimeout(() => { if (!document.hidden && performance.now() - lastJit > 3000) jitter(); idle(); }, 3500 + Math.random() * 5500); })();

// ---------------------------------------------------------------- the two flies
const scene = { stage: 'orient', bad: false, t0: 0, sees: 0, tastes: 0, wing: 0, songT: -1, kick: 0, mating: 0, pulseFlash: 0, finished: 0 };
function resetScene() { Object.assign(scene, { pose: null, stage: 'orient', bad: false, sees: 0, tastes: 0, wing: 0, songT: -1, kick: 0, mating: 0, finished: 0 }); resetNotes(); }
function drawFlies() {
  const c = $('flies'), now = performance.now(), st = scene.stage;
  const st2 = st === 'mate' && scene.mating >= 1 && scene.finished ? 'mate' : st;
  maleStage(c.getContext('2d'), c.width, c.height, { stage: st2, bad: scene.bad, t: (now - scene.t0) / 1000, now, wing: scene.wing,
    singing: scene.songT >= 0 && role === 'male', kickT: scene.kick ? (now - scene.kick) / 1000 : -1, mating: scene.mating,
    finished: !!scene.finished, finishedT: scene.finished ? (now - scene.finished) / 1000 : 0, pose: scene.pose });
}
function loop() { if (!$('ritual').hidden) { if (role === 'male') { drawFlies(); drawOsc(); idleMale(); } else if (liveEar) liveEar.draw(); } requestAnimationFrame(loop); }
requestAnimationFrame(loop);

// for tools/nest-shot (headless checks of the chat window): ?test exposes the nest
if (new URLSearchParams(location.search).has('test')) {
  // headless checks: tools/sight-test.py joins two pages: each page's cards feed the other's camera, its song the other's ears
  const cam = document.createElement('canvas'); cam.width = 640; cam.height = 480; let seen = null;
  const b64f = (x) => { const u = new Uint8Array(x.buffer, x.byteOffset, x.byteLength); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(s); };
  window.__opul = { openNest, Link, sendItem, played: [],
    // this page's cards as the other phone's camera would see them: head to tail (turned 180°), off-centre, smaller
    card: () => { if ($('sight').hidden) return null; const c = document.createElement('canvas'); c.width = c.height = 300; const g = c.getContext('2d');
      g.translate(150, 150); g.rotate(Math.PI + 0.06); g.drawImage($('card'), -150, -150, 300, 300); return c.toDataURL('image/png'); },
    see: (url) => { const im = new Image(); im.onload = () => { seen = im; }; im.src = url; },
    camFeed: () => { if (!seen) return null; const g = cam.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#3a3036'; g.fillRect(0, 0, 640, 480);
      g.filter = 'blur(1px)'; g.drawImage(seen, 190, 70, 330, 330); g.filter = 'none'; return { rgba: g.getImageData(0, 0, 640, 480).data, w: 640, h: 480 }; },
    takePlayed: () => { const out = window.__opul.played.map(b64f); window.__opul.played = []; return out; },
    hear: (b64) => { const u = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), x48 = new Float32Array(u.buffer), r = ctx.sampleRate / FS;
      const x = r === 1 ? x48 : Float32Array.from({ length: Math.floor(x48.length * r) }, (_, i) => { const t = i / r, k = Math.floor(t), f = t - k; return (x48[k] || 0) * (1 - f) + (x48[k + 1] || 0) * f; });
      for (let i = 0; i < x.length; i += 2048) { const b = x.subarray(i, i + 2048); for (const l of listeners) l(b); } },
    state: () => ({ stage: scene.stage, todo: $('todoT').textContent, caption: $('caption').textContent, air: $('air').textContent, cap: $('sightCap').textContent, nest: !$('nest').hidden && $('nestStatus').textContent }) };
}
