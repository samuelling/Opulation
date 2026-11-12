// After she accepts: a direct WebRTC data channel between the two phones, for files and photos.
//
// There is no server. Each phone's WebRTC offer/answer is squeezed to its essentials (ICE username and password,
// the DTLS certificate fingerprint, a few candidate addresses: about 90 bytes), sealed with the session key and
// sent by sound, through the modem. Because the fingerprints travel inside the courtship's authenticated channel,
// nobody can sit in the middle: the DTLS connection is bound to the passphrase.
// STUN (a public Google server) only tells each phone its public address; nothing is relayed. Same Wi-Fi always
// works; across networks it usually does. There is no TURN relay, so a few strict networks won't connect.

export const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
const te = new TextEncoder(), td = new TextDecoder();

// ------------------------------------------------------------------ compact SDP
const hex2b = (h) => Uint8Array.from(h.match(/../g).map(x => parseInt(x, 16)));
const b2hex = (b) => Array.from(b, x => x.toString(16).padStart(2, '0').toUpperCase()).join(':');
function parseSdp(sdp) {
  const get = (k) => (sdp.match(new RegExp('^a=' + k + ':(.*)$', 'm')) || [])[1]?.trim();
  const fp = get('fingerprint'); if (!fp || !/^sha-256 /i.test(fp)) throw new Error('no sha-256 fingerprint');
  const cands = [];
  for (const m of sdp.matchAll(/^a=candidate:\S+ (\d) (udp|UDP) \d+ (\S+) (\d+) typ (host|srflx)/gm)) {
    if (m[1] !== '1') continue; const addr = m[3], port = +m[4], typ = m[5];
    if (/^\d+\.\d+\.\d+\.\d+$/.test(addr)) cands.push({ t: typ === 'host' ? 0 : 2, addr, port });
    else if (/^[0-9a-f-]{36}\.local$/i.test(addr)) cands.push({ t: 1, addr, port });
  }
  return { ufrag: get('ice-ufrag'), pwd: get('ice-pwd'), fp: hex2b(fp.split(' ')[1].replace(/:/g, '')), cands: cands.slice(0, 6) };
}
/** offer/answer SDP -> ~90 bytes */
export function pack(sdp) {
  const s = parseSdp(sdp), u = te.encode(s.ufrag), p = te.encode(s.pwd), out = [u.length, ...u, p.length, ...p, ...s.fp, s.cands.length];
  for (const c of s.cands) {
    out.push(c.t, c.port >> 8, c.port & 255);
    if (c.t === 1) out.push(...hex2b(c.addr.slice(0, 36).replace(/-/g, '')));
    else out.push(...c.addr.split('.').map(Number));
  }
  return Uint8Array.from(out);
}
/** ~90 bytes -> a minimal SDP for a data channel. role: 'offer' | 'answer' */
export function unpack(b, role) {
  let k = 0; const u = td.decode(b.subarray(k + 1, k + 1 + b[k])); k += 1 + b[k];
  const p = td.decode(b.subarray(k + 1, k + 1 + b[k])); k += 1 + b[k];
  const fp = b2hex(b.subarray(k, k + 32)); k += 32;
  const n = b[k++], lines = [];
  for (let i = 0; i < n; i++) {
    const t = b[k], port = (b[k + 1] << 8) | b[k + 2]; k += 3; let addr;
    if (t === 1) { const h = Array.from(b.subarray(k, k + 16), x => x.toString(16).padStart(2, '0')).join(''); addr = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}.local`; k += 16; }
    else { addr = Array.from(b.subarray(k, k + 4)).join('.'); k += 4; }
    lines.push(t === 2 ? `a=candidate:${i + 1} 1 udp ${1686052607 - i} ${addr} ${port} typ srflx raddr 0.0.0.0 rport 0` : `a=candidate:${i + 1} 1 udp ${2122260223 - i} ${addr} ${port} typ host`);
  }
  return ['v=0', 'o=- 4611731400430051336 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0', 'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0', `a=ice-ufrag:${u}`, `a=ice-pwd:${p}`, 'a=ice-options:trickle',
    `a=fingerprint:sha-256 ${fp}`, `a=setup:${role === 'offer' ? 'actpass' : 'active'}`, 'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144',
    ...lines, 'a=end-of-candidates', ''].join('\r\n');
}

// ------------------------------------------------------------------ the connection
function gathered(pc, ms = 3000) {
  return new Promise((res) => { if (pc.iceGatheringState === 'complete') return res();
    const t = setTimeout(res, ms); pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } }); });
}
/** his side: start; returns {pc, dc, blob} */
export async function offer() {
  const pc = new RTCPeerConnection({ iceServers: ICE }), dc = pc.createDataChannel('nest', { ordered: true });
  await pc.setLocalDescription(await pc.createOffer()); await gathered(pc);
  return { pc, dc, blob: pack(pc.localDescription.sdp) };
}
/** her side: from his blob; returns {pc, dc: Promise<RTCDataChannel>, blob} */
export async function answer(blob) {
  const pc = new RTCPeerConnection({ iceServers: ICE });
  const dc = new Promise(res => { pc.ondatachannel = (e) => res(e.channel); });
  await pc.setRemoteDescription({ type: 'offer', sdp: unpack(blob, 'offer') });
  await pc.setLocalDescription(await pc.createAnswer()); await gathered(pc);
  return { pc, dc, blob: pack(pc.localDescription.sdp) };
}
export async function complete(pc, blob) { await pc.setRemoteDescription({ type: 'answer', sdp: unpack(blob, 'answer') }); }
export function open(dc, ms = 15000) {
  return new Promise((res) => { if (dc.readyState === 'open') return res(true); const t = setTimeout(() => res(false), ms);
    dc.addEventListener('open', () => { clearTimeout(t); res(true); }); dc.addEventListener('error', () => { clearTimeout(t); res(false); }); });
}

// ------------------------------------------------------------------ the nest: files, photos and notes over the channel
// Each item: a JSON header {id, kind: 'file' | 'photo' | 'note', name, type, size}, then the bytes in 16 kB chunks,
// then {id, end: true}. Flow control on bufferedAmount keeps big files from swamping the channel.
const CHUNK = 16384;
export class Nest {
  constructor(dc, { onItem = () => {}, onProgress = () => {} } = {}) {
    this.dc = dc; dc.binaryType = 'arraybuffer'; this.onItem = onItem; this.onProgress = onProgress; this.rx = null; this.q = Promise.resolve(); this.n = 0;
    dc.onmessage = (e) => this._msg(e.data);
  }
  _msg(d) {
    if (typeof d === 'string') {
      const h = JSON.parse(d);
      if (h.end && this.rx && this.rx.id === h.id) { const r = this.rx; this.rx = null; const blob = new Blob(r.parts, { type: r.type || 'application/octet-stream' });
        this.onItem({ dir: 'in', kind: r.kind, name: r.name, type: r.type, size: r.size, blob }); }
      else if (!h.end) { this.rx = { ...h, parts: [], got: 0 }; this.onProgress({ dir: 'in', id: h.id, name: h.name, frac: 0 }); }
      return;
    }
    if (!this.rx) return; this.rx.parts.push(d); this.rx.got += d.byteLength; this.onProgress({ dir: 'in', id: this.rx.id, name: this.rx.name, frac: this.rx.got / Math.max(1, this.rx.size) });
  }
  /** send a File/Blob (kind 'file' or 'photo') or a note (string) */
  send(item, kind = 'file') { this.q = this.q.then(() => this._send(item, kind)); return this.q; }
  async _send(item, kind) {
    const id = ++this.n, isNote = typeof item === 'string', blob = isNote ? new Blob([item], { type: 'text/plain' }) : item;
    const name = isNote ? 'note' : (item.name || (kind === 'photo' ? 'photo.jpg' : 'file')), type = blob.type || 'application/octet-stream';
    this.dc.send(JSON.stringify({ id, kind: isNote ? 'note' : kind, name, type, size: blob.size }));
    const buf = new Uint8Array(await blob.arrayBuffer());
    this.dc.bufferedAmountLowThreshold = 1 << 20;
    for (let o = 0; o < buf.length; o += CHUNK) {
      if (this.dc.bufferedAmount > 4 << 20) await new Promise(r => this.dc.addEventListener('bufferedamountlow', r, { once: true }));
      this.dc.send(buf.subarray(o, Math.min(buf.length, o + CHUNK))); this.onProgress({ dir: 'out', id, name, frac: Math.min(1, (o + CHUNK) / buf.length) });
    }
    this.dc.send(JSON.stringify({ id, end: true }));
    this.onProgress({ dir: 'out', id, name, frac: 1 });
    return { dir: 'out', kind: isNote ? 'note' : kind, name, type, size: blob.size, blob };
  }
}
