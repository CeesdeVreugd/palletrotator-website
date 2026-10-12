// Minimale SMTP-client zonder dependencies (Node 20): implicit TLS (465) of STARTTLS (587), AUTH PLAIN/LOGIN.
import net from 'node:net';
import tls from 'node:tls';
import { randomUUID } from 'node:crypto';

function reader(socket) {
  let buf = '';
  const waiters = [];
  const flush = () => {
    while (waiters.length) {
      const lines = buf.split('\r\n');
      let end = -1;
      for (let i = 0; i < lines.length - 1; i++) if (/^\d{3} /.test(lines[i])) { end = i; break; }
      if (end < 0) return;
      const text = lines.slice(0, end + 1).join('\r\n');
      buf = lines.slice(end + 1).join('\r\n');
      waiters.shift().resolve({ code: Number(text.slice(0, 3)), text });
    }
  };
  socket.on('data', (d) => { buf += d.toString('utf8'); flush(); });
  const fail = (e) => { while (waiters.length) waiters.shift().reject(e); };
  socket.on('error', fail);
  socket.on('close', () => fail(new Error('smtp_closed')));
  return () => new Promise((resolve, reject) => { waiters.push({ resolve, reject }); flush(); });
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const encHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const addr = (a) => String(a).replace(/[\r\n<>]/g, '');

export function buildMessage({ from, to, replyTo, subject, text, html }) {
  const boundary = '=_pr_' + randomUUID().replace(/-/g, '');
  const wrap = (str) => b64(str).replace(/(.{76})/g, '$1\r\n');
  const head = [
    `From: PalletRotator website <${addr(from)}>`,
    `To: ${addr(to)}`,
    replyTo ? `Reply-To: ${addr(replyTo)}` : null,
    `Subject: ${encHeader(subject)}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${randomUUID()}@palletrotator.nl>`,
    'MIME-Version: 1.0',
    html ? `Content-Type: multipart/alternative; boundary="${boundary}"` : 'Content-Type: text/plain; charset=utf-8',
    html ? null : 'Content-Transfer-Encoding: base64',
  ].filter(Boolean).join('\r\n');
  if (!html) return `${head}\r\n\r\n${wrap(text)}\r\n`;
  const part = (type, body) => `--${boundary}\r\nContent-Type: ${type}; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(body)}\r\n`;
  return `${head}\r\n\r\n${part('text/plain', text)}${part('text/html', html)}--${boundary}--\r\n`;
}

export async function sendMail({ host, port = 587, secure = false, user, pass, from, to, replyTo, subject, text, html, rejectUnauthorized = true }) {
  const msg = buildMessage({ from, to, replyTo, subject, text, html });
  let socket = secure
    ? tls.connect({ host, port, servername: host, rejectUnauthorized })
    : net.connect({ host, port });
  socket.setTimeout(15000, () => socket.destroy(new Error('smtp_timeout')));
  let read = reader(socket);
  const expect = async (ok, label) => {
    const r = await read();
    if (!ok.includes(r.code)) throw new Error(`smtp ${label}: ${r.text.split('\r\n')[0]}`);
    return r;
  };
  const cmd = async (line, ok, label) => { socket.write(line + '\r\n'); return expect(ok, label); };
  try {
    await expect([220], 'greeting');
    let ehlo = await cmd('EHLO palletrotator.nl', [250], 'ehlo');
    if (!secure && /STARTTLS/i.test(ehlo.text)) {
      await cmd('STARTTLS', [220], 'starttls');
      socket.removeAllListeners('data');
      socket = tls.connect({ socket, host, servername: host, rejectUnauthorized });
      socket.setTimeout(15000, () => socket.destroy(new Error('smtp_timeout')));
      read = reader(socket);
      ehlo = await cmd('EHLO palletrotator.nl', [250], 'ehlo2');
    }
    if (user) {
      if (/AUTH[^\r\n]*PLAIN/i.test(ehlo.text)) {
        await cmd('AUTH PLAIN ' + b64(`\0${user}\0${pass}`), [235], 'auth');
      } else {
        await cmd('AUTH LOGIN', [334], 'auth');
        await cmd(b64(user), [334], 'auth-user');
        await cmd(b64(pass), [235], 'auth-pass');
      }
    }
    await cmd(`MAIL FROM:<${addr(from)}>`, [250], 'mail from');
    await cmd(`RCPT TO:<${addr(to)}>`, [250, 251], 'rcpt to');
    await cmd('DATA', [354], 'data');
    socket.write(msg.replace(/^\./gm, '..') + '.\r\n');
    await expect([250], 'send');
    socket.write('QUIT\r\n');
  } finally {
    socket.destroy();
  }
}
