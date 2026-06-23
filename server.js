/* ============================================================
   GUNBALD — server.js
   Zero-dependency host for VPS deployment:
     • serves the static game files
     • a tiny RFC6455 WebSocket server (text frames only)
     • 1v1 matchmaking + message relay between the two peers
   Run:  node server.js          (PORT env var optional, default 8123)
   ============================================================ */
'use strict';
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8123;
const ROOT = __dirname;
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

// ---------------- static file server ----------------
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  const filePath = path.join(ROOT, path.normalize(urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------------- minimal WebSocket ----------------
function wsAccept(key) {
  return crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
}
function sendFrame(sock, str) {
  if (!sock || sock.destroyed) return;
  const payload = Buffer.from(str, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) { header = Buffer.from([0x81, len]); }
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  try { sock.write(Buffer.concat([header, payload])); } catch (e) {}
}

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + wsAccept(key) + '\r\n\r\n'
  );
  onConnect(socket);
});

function parseFrames(socket, onText, onClose) {
  let buf = Buffer.alloc(0);
  socket.on('data', d => {
    buf = Buffer.concat([buf, d]);
    while (true) {
      if (buf.length < 2) break;
      const b1 = buf[1];
      const opcode = buf[0] & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      let mask;
      if (masked) { if (buf.length < off + 4) break; mask = buf.slice(off, off + 4); off += 4; }
      if (buf.length < off + len) break;
      let payload = buf.slice(off, off + len);
      if (masked) { const out = Buffer.alloc(len); for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i & 3]; payload = out; }
      buf = buf.slice(off + len);
      if (opcode === 0x8) { onClose(); try { socket.end(); } catch (e) {} return; }       // close
      else if (opcode === 0x9) { try { socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); } catch (e) {} } // ping->pong
      else if (opcode === 0x1 || opcode === 0x0) { onText(payload.toString('utf8')); }      // text
    }
  });
  socket.on('error', () => onClose());
  socket.on('close', () => onClose());
}

// ---------------- matchmaking + relay ----------------
let waiting = null;               // a socket waiting for an opponent
const partner = new Map();        // socket -> opponent socket
let closed = new WeakSet();

function onConnect(socket) {
  socket.gbName = 'Pilot';
  parseFrames(socket, str => onMessage(socket, str), () => onClose(socket));
}

function onMessage(socket, str) {
  let msg; try { msg = JSON.parse(str); } catch (e) { return; }
  if (msg.t === 'queue') {
    socket.gbName = String(msg.name || 'Pilot').slice(0, 16);
    if (waiting && waiting !== socket && !waiting.destroyed) {
      const host = waiting, guest = socket; waiting = null;
      partner.set(host, guest); partner.set(guest, host);
      sendFrame(host, JSON.stringify({ t: 'matched', side: 'host', opp: guest.gbName }));
      sendFrame(guest, JSON.stringify({ t: 'matched', side: 'guest', opp: host.gbName }));
    } else {
      waiting = socket;
      sendFrame(socket, JSON.stringify({ t: 'waiting' }));
    }
    return;
  }
  if (msg.t === 'cancel') { if (waiting === socket) waiting = null; return; }
  // relay anything else verbatim to the matched peer
  const p = partner.get(socket);
  if (p && !p.destroyed) sendFrame(p, str);
}

function onClose(socket) {
  if (closed.has(socket)) return;
  closed.add(socket);
  if (waiting === socket) waiting = null;
  const p = partner.get(socket);
  if (p) {
    partner.delete(socket); partner.delete(p);
    sendFrame(p, JSON.stringify({ t: 'oppleft' }));
  }
}

server.listen(PORT, () => {
  console.log('GUNBALD server listening on http://0.0.0.0:' + PORT);
  console.log('Open the game in two browsers and click PLAY ONLINE to match.');
});
