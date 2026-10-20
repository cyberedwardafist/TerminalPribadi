// Klien SMTP minimal tanpa dependensi (node:net + node:tls). Cukup untuk kirim email OTP lewat Gmail / SMTP biasa.
// Port 465 = TLS langsung (default, direkomendasikan Gmail). Port lain (mis. 587) = STARTTLS wajib.
import net from 'node:net';
import tls from 'node:tls';
import { randomBytes } from 'node:crypto';

const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const wrap76 = s => s.replace(/.{1,76}/g, '$&\r\n').trimEnd();
const noCrlf = (s, what) => { if (/[\r\n]/.test(String(s))) throw new Error(`${what} tidak valid`); return String(s); };
const encWord = s => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`;

export function parseAddress(v) {
  const s = noCrlf(v, 'Alamat email').trim();
  const m = /^(.*)<([^<>]+)>$/.exec(s);
  const name = m ? m[1].trim().replace(/^"|"$/g, '').replace(/"/g, '') : '';
  const address = (m ? m[2] : s).trim();
  if (!/^[^\s@<>]+@[^\s@<>]+$/.test(address)) throw new Error('Alamat email tidak valid');
  return { name, address };
}

export function buildMessage({ from, to, subject, text, html, domain }) {
  const f = parseAddress(from), t = parseAddress(to), boundary = `tc_${randomBytes(12).toString('hex')}`;
  const fromHdr = f.name ? `${/^[\x20-\x7e]*$/.test(f.name) ? `"${f.name}"` : encWord(f.name)} <${f.address}>` : f.address;
  const head = [
    `From: ${fromHdr}`, `To: ${t.address}`, `Subject: ${encWord(noCrlf(subject, 'Subjek'))}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`, `Message-ID: <${randomBytes(12).toString('hex')}@${domain || f.address.split('@')[1]}>`,
    'MIME-Version: 1.0',
  ];
  const part = (type, body) => `Content-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(b64(body))}`;
  if (html) {
    head.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    return `${head.join('\r\n')}\r\n\r\n--${boundary}\r\n${part('text/plain', text || '')}\r\n--${boundary}\r\n${part('text/html', html)}\r\n--${boundary}--\r\n`;
  }
  return `${head.join('\r\n')}\r\n${part('text/plain', text || '')}\r\n`;
}

function channel(sock) {
  let buf = '', cur = [], error = null, waiter = null; const replies = [];
  const settle = () => {
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1); cur.push(line);
      if (/^\d{3}( |$)/.test(line)) { replies.push({ code: +line.slice(0, 3), lines: cur }); cur = []; }
    }
    if (waiter && (replies.length || error)) { const w = waiter; waiter = null; replies.length ? w.resolve(replies.shift()) : w.reject(error); }
  };
  sock.on('data', d => { buf += d.toString('utf8'); settle(); });
  sock.on('error', e => { error = error || e; settle(); });
  sock.on('close', () => { error = error || new Error('Koneksi SMTP terputus'); settle(); });
  return {
    read: () => new Promise((resolve, reject) => { waiter = { resolve, reject }; settle(); }),
    write: s => new Promise((resolve, reject) => sock.write(s, e => e ? reject(e) : resolve())),
  };
}

const fail = (step, r) => { const e = new Error(`SMTP ${step}: ${r.lines.join(' ').slice(0, 220)}`); e.code = r.code; return e; };

export async function sendSmtp({ host, port = 465, user, pass, from, to, subject, text, html, timeout = 15000, tls: tlsOpts = {}, ehlo = 'terminal-chart', secure = Number(port) === 465, verifyOnly = false }) {
  // verifyOnly: hanya sambung + STARTTLS + login (tanpa kirim email), untuk memeriksa SMTP_URL/SMTP_USER/SMTP_PASS
  const f = parseAddress(from), t = parseAddress(to || from);
  const message = verifyOnly ? '' : buildMessage({ from, to, subject, text, html });
  let sock = secure
    ? tls.connect({ host, port: Number(port), servername: host, ...tlsOpts })
    : net.connect({ host, port: Number(port) });
  sock.setTimeout(timeout, () => sock.destroy(new Error('Koneksi SMTP timeout')));
  let ch = channel(sock);
  const cmd = async (line, ok, step) => { await ch.write(line + '\r\n'); const r = await ch.read(); if (!ok.includes(r.code)) throw fail(step || line.split(' ')[0], r); return r; };
  try {
    let r = await ch.read(); if (r.code !== 220) throw fail('connect', r);
    r = await cmd(`EHLO ${ehlo}`, [250], 'EHLO');
    if (!secure) {
      if (!r.lines.some(l => /STARTTLS/i.test(l))) throw new Error('Server SMTP tidak mendukung STARTTLS');
      await cmd('STARTTLS', [220], 'STARTTLS');
      sock.removeAllListeners('data'); sock.removeAllListeners('error'); sock.removeAllListeners('close');
      sock = tls.connect({ socket: sock, servername: host, ...tlsOpts });
      sock.setTimeout(timeout, () => sock.destroy(new Error('Koneksi SMTP timeout')));
      ch = channel(sock);
      r = await cmd(`EHLO ${ehlo}`, [250], 'EHLO');
    }
    if (user) {
      const mech = r.lines.join(' ').toUpperCase();
      if (/\bAUTH\b[^\n]*\bPLAIN\b/.test(mech)) await cmd(`AUTH PLAIN ${b64(`\0${user}\0${pass}`)}`, [235], 'AUTH');
      else {
        await cmd('AUTH LOGIN', [334], 'AUTH'); await cmd(b64(user), [334], 'AUTH'); await cmd(b64(pass), [235], 'AUTH');
      }
    }
    if (verifyOnly) { await ch.write('QUIT\r\n').then(() => ch.read()).catch(() => {}); return; }
    await cmd(`MAIL FROM:<${f.address}>`, [250], 'MAIL FROM');
    await cmd(`RCPT TO:<${t.address}>`, [250, 251], 'RCPT TO');
    await cmd('DATA', [354], 'DATA');
    await ch.write(message.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..') + '.\r\n');
    r = await ch.read(); if (r.code !== 250) throw fail('DATA', r);
    await ch.write('QUIT\r\n').then(() => ch.read()).catch(() => {}); // QUIT best-effort; pesan sudah diterima (250)
  } finally { sock.destroy(); }
}
