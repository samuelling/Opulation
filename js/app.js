// Opulation (web): the courtship handshake, with both flies' nervous systems on screen.
import * as C from './cpace.js';
import * as P from './protocol.js';
import * as Song from './song.js';
import { FemaleBrain, personality } from './female.js';
import { MaleCircuit, NODES, EDGES } from './male.js';
import { NoteDecoder, synthesize, frameSeconds } from './modem.js';
import * as F from './flycode.js';
import * as Link from './link.js';
import { FlyEye } from './eye.js';
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
try { const p = localStorage.getItem('opulation.pass'); if (p) $('pass').value = p; } catch (e) {}
const memory = new P.Memory({ get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } });
$('go').onclick = async () => {
  const pass = $('pass').value;
  if (!pass) return showSetupMsg('Choose a passphrase first: it is your species.');
  try { localStorage.setItem('opulation.pass', pass); } catch (e) {}
  $('go').disabled = true;
  try { await boot; await startAudio(); } catch (e) { $('go').disabled = false; return showSetupMsg(e.message); }
  $('setup').hidden = true; $('ritual').hidden = false; resetNest();
  run = { id: Math.random() };
  if (role === 'male' && !eye) { eye = new FlyEye(); eye.ready.catch((e) => console.warn('fly eye', e)); }   // his optic lobe takes ~2 s to wake
  if (role === 'male') maleFlow(pass, $('gift').value.trim(), run); else femaleFlow(pass, run);
};
$('again').onclick = () => { run = null; stopListening(); $('look').hidden = true; closeNest(); $('ritual').hidden = true; $('setup').hidden = false; $('go').disabled = false; resetScene(); };
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
  src.start(t0);
  return new Promise(res => {
    const tick = () => { const t = ctx.currentTime - t0; if (onTime) onTime(Math.max(0, t)); if (t >= dur) { ignoreUntil = performance.now() + 300; res(); } else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
}
const playFrame = (bytes, onTime) => play(synthesize(bytes, 0, 'quick', { fs: FS, version: P.VERSION, amp: 0.6 }), onTime);

/** wait for a modem frame that `accept(bytes)` recognises (returns non-null) */
function waitFrame(accept, ms, onEvent) {
  return new Promise((res) => {
    const dec = new NoteDecoder({ sampleRate: ctx.sampleRate, onEvent: (e) => {
      if (onEvent) onEvent(e);
      if (e.kind === 'frame' && e.ok && e.version === P.VERSION) { const v = accept(e.bytes); if (v) done(v); }
    } });
    const l = (x) => dec.push(x); listeners.add(l);
    const t = setTimeout(() => done(null), ms);
    function done(v) { clearTimeout(t); listeners.delete(l); res(v); }
  });
}

// ---------------------------------------------------------------- the stage
const STAGES = ['orient', 'tap', 'sing', 'decide', 'mate'];
function stage(s, bad = false) {
  const i = STAGES.indexOf(s);
  for (const li of $('stages').children) { const j = STAGES.indexOf(li.dataset.s); li.className = j < i ? 'done' : j === i ? (bad ? 'bad' : 'now') : ''; }
  scene.stage = s; scene.bad = bad; scene.t0 = performance.now();
}
const caption = (t) => { $('caption').textContent = t; };
const air = (t) => { $('air').textContent = t; };

// ---------------------------------------------------------------- the male
async function maleFlow(pass, giftText, r) {
  $('brainMale').classList.remove('dim'); $('fTitle').textContent = 'Her, as his phone predicts her';
  stage('orient'); caption('He looks for her.'); air('');
  const seen = await lookForHer(r);
  if (!alive(r) || !seen) return;
  scene.sees = 1; caption('He sees her, and turns toward her.'); await sleep(900);
  let him; try { him = C.respond(pass, seen.sid, seen.Ya); } catch (e) { caption('That was not a fly.'); return; }
  const keys = him.keys, sy = Song.symbolsOf(keys.tagM), sch = Song.schedule(sy, M);
  // he can build her exactly (the seed comes from the key) and compose the song she was made to want
  const brain = new FemaleBrain(meta, bin, M, personality(S, keys.seed, meta.n));
  const snaps = []; const L = new Song.Listener(brain, sy, M); L.onFrame = (st, b) => snaps.push({ st, r: snapR(b) }); L.advance(sy, true);
  let verdict = null;
  for (let tries = 0; tries < 3 && !verdict && alive(r); tries++) {
    stage('tap'); caption('He taps her with a foreleg.'); scene.tastes = 1; air(tries ? `tapping again (${tries + 1})…` : 'tapping (modem, 2.3 s)…');
    await playFrame(P.tap(seen.sid, him.Yb)); scene.tastes = 0.3; await sleep(500);
    stage('sing'); caption('He extends one wing and sings: sine song, then pulse song. The song is his key, proven.');
    air('singing (3.7 s)…'); resetNotes(); oscSet(Song.renderTrue(sch, M, 4000), 4000);
    let shown = -1;
    await play(Song.renderAir(sch, M, FS), (t) => { scene.songT = t; driveMale(sch, t); const k = Math.min(snaps.length - 1, Math.floor(t / 0.005));
      while (shown < k) { shown++; showFemale(snaps[shown].st, snaps[shown].r, true, shown < k); } });
    scene.songT = -1; stage('decide'); caption('She decides.'); air('waiting for her…');
    verdict = await waitFrame((b) => P.parseVerdict(b, seen.sid, keys), 9000);
  }
  if (!alive(r)) return;
  if (verdict === 'wrongkind') { stage('decide', true); caption('She accepts, but her pheromone tastes wrong: another species (another passphrase). He leaves.'); air(''); return; }
  if (verdict !== 'accept') { stage('decide', true); scene.kick = performance.now(); caption(verdict === 'kick' ? 'She kicks him away.' : 'No answer from her.'); air(''); return; }
  stage('mate'); caption('She slows and opens, and she tastes right. They mate.');
  // copulation: open a direct link for files and photos; its keys travel sealed, by sound
  let link = null;
  if (window.RTCPeerConnection) {
    try {
      air('opening the nest…'); const o = await Link.offer();
      for (let tries = 0; tries < 3 && !link && alive(r); tries++) {
        air(tries ? `opening the nest (${tries + 1})…` : 'opening the nest (modem)…'); scene.mating = 0.2 + 0.2 * tries;
        await playFrame(P.seal(P.T.OFFER, seen.sid, keys, o.blob));
        const ansB = await waitFrame((b) => P.unseal(P.T.ANSWER, b, seen.sid, keys), 10000);
        if (ansB) { await Link.complete(o.pc, ansB); air('connecting…'); if (await Link.open(o.dc)) link = o; }
      }
    } catch (e) { console.warn(e); }
  }
  if (!alive(r)) return;
  scene.mating = 1; memory.mated(seen.sid);
  if (link) { openNest(link.dc, giftText); caption('Mated. The nest is open: send her photos and files.'); air('mated'); return; }
  // no direct link: the note goes by sound
  if (giftText) {
    const g = P.gift(seen.sid, keys, { kind: 'text', text: giftText }), dur = frameSeconds(g.length, 'quick');
    await playFrame(g, (t) => air(`passing the note by sound ${Math.round(100 * Math.min(1, t / dur))}%`));
  }
  nestStatus('No direct link opened between the phones (are they on networks that can reach each other?). ' + (giftText ? 'Your note went by sound.' : ''), false);
  caption('Mated, but the nest would not open.'); air('mated');
}
/** his camera, until he has read her face */
async function lookForHer(r) {
  $('look').hidden = false; $('face').hidden = true; $('cam').hidden = false; $('lookCap').textContent = 'Point your camera at her face. Her eyes hold her half of the key.';
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); }
  catch (e) { $('lookCap').textContent = 'He needs the camera to see her (' + e.message + ').'; return null; }
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
    if (wait > 0) { $('look').hidden = true; caption(`After that wrong song she is wary: she won't show herself for another ${Math.ceil(wait / 1000)} s.`); await sleep(1000); continue; }
    // a fresh face each time: her half of the key exchange, in her eyes
    const her = new C.Initiator(pass), bits = F.facetBits(P.look(her));
    $('look').hidden = false; $('cam').hidden = true; $('face').hidden = false; F.drawCanvas($('face').getContext('2d'), bits, 1000);
    $('lookCap').textContent = 'Show him your face: hold your screen up to his camera, bright and still.';
    caption('She waits to be seen.'); air('listening…');
    const t = await waitFrame((b) => P.parseTap(b, her.sid), 3600000, (e) => { if (e.kind === 'header') air('he taps her…'); });
    if (!alive(r) || !t) return;
    let keys; try { keys = her.finish(t.Yb); } catch (e) { caption('That was not a fly.'); continue; }
    $('look').hidden = true; scene.sees = 1;
    stage('tap'); caption('He saw her, approached and tapped her.'); scene.tastes = 1; await sleep(400); scene.tastes = 0.3;
    // her brain, from the shared seed; the song she expects: the one a male of her kind (her passphrase) would sing
    const expected = Song.symbolsOf(keys.tagM);
    let result = 'nothing';
    while (result === 'nothing' && alive(r)) {
      const brain = new FemaleBrain(meta, bin, M, personality(S, keys.seed, meta.n));
      const L = new Song.Listener(brain, expected, M), queue = []; L.onFrame = (st, b) => queue.push({ st, r: snapR(b) });
      stage('sing'); caption('She listens for his song.'); air('listening for song…'); resetNotes();
      result = await hearSong(L, queue, expected, r);
    }
    if (!alive(r)) return;
    const accepted = result === 'accept';
    stage('decide', !accepted); caption(accepted ? 'His song is the one she was made to want. She slows down and opens.' : 'Wrong notes. She kicks and runs.');
    if (!accepted) { scene.kick = performance.now(); memory.rejected(); air('she kicks (modem)…'); await playFrame(P.kick(her.sid)); air(''); await sleep(2500); continue; }
    // copulation: he opens a direct link (or, failing that, passes a note by sound)
    let got = null;
    for (let tries = 0; tries < 4 && !got && alive(r); tries++) {
      air('she accepts (modem)…'); await playFrame(P.accept(her.sid, keys));
      stage('mate'); caption('They mate.'); air('waiting for him…');
      got = await waitFrame((b) => { const o = P.unseal(P.T.OFFER, b, her.sid, keys); if (o) return { offer: o }; const g = P.parseGift(b, her.sid, keys); return g ? { gift: g } : null; }, 14000,
        (e) => { if (e.kind === 'progress') scene.mating = e.frac; });
    }
    if (!alive(r)) return;
    if (!got) { caption('He went quiet.'); continue; }
    memory.mated(her.sid);
    if (got.gift) { resetNest(); $('nest').hidden = false; addItem({ dir: 'in', kind: 'note', text: got.gift.text }); nestStatus('His note came by sound; no direct link.', false); caption('Mated. His note is hers.'); scene.mating = 1; air('mated'); return; }
    let link = null;
    try { link = await Link.answer(got.offer); } catch (e) { console.warn(e); }
    if (link) {
      air('opening the nest (modem)…'); await playFrame(P.seal(P.T.ANSWER, her.sid, keys, link.blob)); air('connecting…');
      const dc = await Promise.race([link.dc, sleep(20000).then(() => null)]);
      if (dc && await Link.open(dc)) { scene.mating = 1; openNest(dc, ''); caption('Mated. The nest is open.'); air('mated'); return; }
    }
    // the link failed: he may still send a note by sound
    nestStatus('No direct link opened between the phones. Listening for a note by sound…', false); $('nest').hidden = false;
    const g = await waitFrame((b) => P.parseGift(b, her.sid, keys), 30000);
    if (g) addItem({ dir: 'in', kind: 'note', text: g.text });
    caption('Mated.'); air('mated'); return;
  }
}

// ---------------------------------------------------------------- the nest: files and photos, once mated
let nest = null; const rows = new Map();
function nestStatus(t, ok = true) { $('nestStatus').textContent = t; $('nestStatus').style.color = ok ? '' : 'var(--rose)'; }
function resetNest() { $('nest').hidden = true; $('nestSend').hidden = true; $('items').innerHTML = ''; rows.clear(); nestStatus(''); }
function closeNest() { try { nest && nest.dc.close(); } catch (e) {} nest = null; resetNest(); }
function openNest(dc, firstNote) {
  resetNest(); $('nest').hidden = false; $('nestSend').hidden = false;
  nestStatus('Direct and encrypted (DTLS keys exchanged inside the courtship). Stay close; leave the page open until it arrives.');
  nest = new Link.Nest(dc, { onItem: (it) => addItem(it), onProgress: (p) => progress(p) });
  dc.addEventListener('close', () => nestStatus('The nest closed.', false));
  if (firstNote) sendItem(firstNote, 'note');
}
async function sendItem(x, kind) { if (!nest) return; const it = await nest.send(x, kind); addItem(it, true); }
$('pickPhoto').onchange = (e) => { for (const f of e.target.files) sendItem(f, 'photo'); e.target.value = ''; };
$('pickFile').onchange = (e) => { for (const f of e.target.files) sendItem(f, 'file'); e.target.value = ''; };
$('noteSend').onclick = () => { const t = $('noteIn').value.trim(); if (t) { sendItem(t, 'note'); $('noteIn').value = ''; } };
$('noteIn').onkeydown = (e) => { if (e.key === 'Enter') $('noteSend').click(); };
const human = (n) => n < 1024 ? n + ' B' : n < 1 << 20 ? (n / 1024).toFixed(0) + ' kB' : (n / (1 << 20)).toFixed(1) + ' MB';
function progress(p) {
  const key = p.dir + p.id; let li = rows.get(key);
  if (!li) { li = document.createElement('li'); li.className = p.dir; li.innerHTML = `<div class="meta"><span>${p.dir === 'in' ? 'arriving' : 'sending'}: ${esc(p.name)}</span><span></span></div><progress max="1"></progress>`; $('items').prepend(li); rows.set(key, li); }
  li.querySelector('progress').value = p.frac; li.querySelector('.meta span:last-child').textContent = Math.round(100 * p.frac) + '%';
}
const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
async function addItem(it, mine = false) {
  // replace the progress row for this item if there is one
  let li = null; for (const [k, v] of rows) if (k.startsWith(it.dir) && v.querySelector('.meta span').textContent.endsWith(it.name)) { li = v; rows.delete(k); break; }
  if (!li) { li = document.createElement('li'); $('items').prepend(li); }
  li.className = it.dir; const who = it.dir === 'in' ? 'from your mate' : 'sent';
  if (it.kind === 'note') { const text = it.text ?? await it.blob.text(); li.innerHTML = `<div class="meta"><span>note · ${who}</span></div><div class="note">${esc(text)}</div>`; return; }
  const url = URL.createObjectURL(it.blob), isImg = (it.type || '').startsWith('image/');
  li.innerHTML = `<div class="meta"><span>${isImg ? 'photo' : 'file'} · ${who}</span><span>${human(it.size)}</span></div>` +
    (isImg ? `<img src="${url}" alt="${esc(it.name)}">` : '') + `<a href="${url}" download="${esc(it.name)}">${esc(it.name)}</a>`;
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
      if (start) { const want = Math.floor((performance.now() - start) / 5); while (k < queue.length && k <= want) { const q = queue[k++]; showFemale(q.st, q.r, false); } }
      if (finished && k >= queue.length) { listeners.delete(l); clearTimeout(giveUp); return res(heard.length ? (L.verdict || 'reject') : 'nothing'); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
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
function showFemale(st, r, predicted, skipDraw = false) {
  for (const p of st.pulses) if (p.k >= 0) $('notes').children[p.k].className = st.cur === 'match' ? 'm' : 'w';
  if (skipDraw) return;
  drawNet(r);
  const bars = $('fAreas').querySelectorAll('b');
  areaIdx.forEach((ids, k) => { let s = 0; for (const i of ids) s += r[i]; const m = ids.length ? s / ids.length / 255 : 0; bars[k].style.height = Math.min(100, 100 * Math.sqrt(m * 4)) + '%'; });
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
const scene = { stage: 'orient', bad: false, t0: 0, sees: 0, tastes: 0, wing: 0, songT: -1, kick: 0, mating: 0, pulseFlash: 0 };
function resetScene() { Object.assign(scene, { stage: 'orient', bad: false, sees: 0, tastes: 0, wing: 0, songT: -1, kick: 0, mating: 0 }); resetNotes(); }
function fly(g, x, y, ang, s, { wing = 0, female = false, legReach = 0, ovi = 0 }) {
  g.save(); g.translate(x, y); g.rotate(ang); g.scale(s, s);
  g.lineWidth = 2.2 / s; g.strokeStyle = '#f3e3d3'; g.lineJoin = 'round'; g.lineCap = 'round';
  // legs
  for (const side of [-1, 1]) for (const [lx, a, l] of [[10, -0.7, 22], [0, -1.5, 20], [-10, -2.3, 24]]) {
    let aa = a; if (lx === 10 && side === 1 && legReach) aa = -0.2 - 0.3 * legReach;
    const ex = lx + Math.cos(aa) * l * (lx === 10 && legReach ? 1 + 0.6 * legReach : 1), ey = side * Math.sin(-aa) * l;
    g.beginPath(); g.moveTo(lx, side * 6); g.quadraticCurveTo((lx + ex) / 2, side * (10 + Math.abs(ey) * 0.4), ex, ey); g.stroke();
  }
  // wings (one extended and vibrating when singing)
  const vib = wing ? Math.sin(performance.now() / 6) * 0.18 * wing : 0;
  for (const side of [-1, 1]) {
    const open = side === -1 ? wing * 1.25 + vib : 0;
    g.save(); g.rotate(side * (0.18 + open)); g.fillStyle = 'rgba(255,104,186,0.12)'; g.beginPath(); g.ellipse(-26, side * 6, 30, 9, 0, 0, 7); g.fill(); g.stroke(); g.restore();
  }
  // abdomen (bands; hers rounder), thorax, head, red eyes
  g.fillStyle = '#3a0f24'; g.beginPath(); g.ellipse(-20 - 6 * (female ? 1 : 0), 0, female ? 20 : 16, female ? 12 : 10, 0, 0, 7); g.fill(); g.stroke();
  for (let k = 0; k < (female ? 4 : 3); k++) { g.beginPath(); g.moveTo(-14 - k * 7 - (female ? 6 : 0), -8); g.quadraticCurveTo(-17 - k * 7 - (female ? 6 : 0), 0, -14 - k * 7 - (female ? 6 : 0), 8); g.stroke(); }
  if (!female) { g.fillStyle = '#f3e3d3'; g.beginPath(); g.ellipse(-31, 0, 4, 6, 0, 0, 7); g.fill(); }
  if (female && ovi) { g.beginPath(); g.moveTo(-46, 0); g.lineTo(-46 - 10 * ovi, 0); g.stroke(); }
  g.fillStyle = '#4a1530'; g.beginPath(); g.ellipse(2, 0, 11, 9, 0, 0, 7); g.fill(); g.stroke();
  g.beginPath(); g.ellipse(17, 0, 6, 8, 0, 0, 7); g.fill(); g.stroke();
  g.fillStyle = '#ff3d5a'; for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(19, sd * 6, 3.6, 4.2, 0, 0, 7); g.fill(); }
  g.restore();
}
function drawFlies() {
  const c = $('flies'), g = c.getContext('2d'), W = c.width, H = c.height, now = performance.now(), dt = (now - scene.t0) / 1000;
  g.clearRect(0, 0, W, H);
  // a velvet bed: pleats in crushed crimson, a pool of low pink light
  const grd = g.createRadialGradient(W / 2, H * 0.55, 10, W / 2, H * 0.55, W * 0.6); grd.addColorStop(0, 'rgba(255,104,186,0.20)'); grd.addColorStop(0.5, 'rgba(120,20,60,0.12)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(0, 0, W, H);
  for (let k = 0; k < 9; k++) { const y0 = H * (k + 0.5) / 9, sw = Math.sin(now / 4000 + k) * 10;
    const pl = g.createLinearGradient(0, y0 - 18, 0, y0 + 18); pl.addColorStop(0, 'rgba(0,0,0,0)'); pl.addColorStop(0.5, 'rgba(255,150,200,0.06)'); pl.addColorStop(1, 'rgba(0,0,0,0.18)');
    g.fillStyle = pl; g.beginPath(); g.moveTo(0, y0 - 18); g.bezierCurveTo(W * 0.3, y0 - 18 + sw, W * 0.7, y0 - 18 - sw, W, y0 - 18); g.lineTo(W, y0 + 18); g.bezierCurveTo(W * 0.7, y0 + 18 - sw, W * 0.3, y0 + 18 + sw, 0, y0 + 18); g.fill(); }
  const fx = W * 0.62, fy = H * 0.5; let mx = W * 0.18, my = H * 0.5, ma = 0, legReach = 0, ovi = 0, fxo = 0;
  const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  const st = scene.stage;
  if (st === 'orient') { mx = W * 0.12 + W * 0.18 * ease(dt / 2.5); ma = -0.4 + 0.4 * ease(dt / 1.5); }
  else { mx = W * 0.30; }
  if (st === 'tap') { mx = W * 0.30 + W * 0.08 * ease(dt / 0.8); legReach = 0.5 + 0.5 * Math.sin(dt * 9); }
  if (st === 'sing') mx = W * 0.38;
  if (st === 'decide') { mx = W * 0.38; if (scene.bad) { const k = (now - scene.kick) / 1000; ovi = Math.min(1, k * 3); fxo = W * 0.25 * ease(k / 1.2); mx = W * 0.38 - W * 0.12 * ease(k / 1.5); } }
  if (st === 'mate') { mx = W * 0.38 + (fx - W * 0.38 - 18) * ease(dt / 1.5); my = fy - 6 * ease(dt / 1.5); }
  fly(g, fx + fxo, fy, Math.PI, 2.0, { female: true, ovi, wing: 0 });
  const singing = st === 'sing' ? Math.max(0.6, scene.wing) : 0;
  fly(g, mx, my, ma, 1.8, { wing: singing, legReach });
  // pulse flashes on her side while she hears song
  if (now - scene.pulseFlash < 80) { g.strokeStyle = 'rgba(255,104,186,.7)'; g.beginPath(); g.arc(fx + 30, fy, 60, 0, 7); g.stroke(); }
  if (st === 'sing' && scene.songT >= 0) { g.strokeStyle = `rgba(255,104,186,${0.2 + 0.6 * scene.wing})`; for (let k = 1; k <= 3; k++) { g.beginPath(); g.arc(mx - 10, my - 40, k * 18 * (1 + scene.wing * 0.3), -1.2, 0.2); g.stroke(); } }
  if (st === 'mate') { g.fillStyle = 'rgba(255,210,63,.9)'; g.fillRect(W * 0.2, H - 18, W * 0.6 * scene.mating, 4); g.strokeStyle = 'rgba(255,210,63,.4)'; g.strokeRect(W * 0.2, H - 18, W * 0.6, 4); }
}
function loop() { if (!$('ritual').hidden) { drawFlies(); drawOsc(); idleMale(); } requestAnimationFrame(loop); }
requestAnimationFrame(loop);
