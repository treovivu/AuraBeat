import { createServer } from "node:http";
import { createHash } from "node:crypto";
const port = Number(process.argv[2]); let connections = 0;
const frame = (t) => { const p = Buffer.from(t); return Buffer.concat([Buffer.from([0x81, p.length]), p]); };
const server = createServer();
server.on("upgrade", (req, socket) => {
  const id = ++connections;
  const accept = createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  console.log(`  server: connection #${id}`);
  socket.on("error", () => {});
  socket.on("data", (buf) => {
    if ((buf[0] & 0x0f) !== 1) return;
    let len = buf[1] & 0x7f, off = 2; if (len === 126) { len = buf.readUInt16BE(2); off = 4; }
    const mask = buf.subarray(off, off + 4), data = buf.subarray(off + 4, off + 4 + len);
    console.log("  server: wave event from watch →", Buffer.from(data.map((b, i) => b ^ mask[i % 4])).toString());
  });
  if (id > 1) return; // later connections (reconnects) just stay open
  const msgs = ['{"pattern":"bass"}', '{"type":"haptic","pattern":"drop","strength":0.8}', '{"type":"cue","cue":"chorus","strength":0.7}', '{"type":"stop"}'];
  msgs.forEach((m, i) => setTimeout(() => socket.write(frame(m)), 150 + i * 150));
  setTimeout(() => { console.log("  server: dropping connection #1"); socket.destroy(); }, 1800);
});
server.listen(port, "127.0.0.1");
