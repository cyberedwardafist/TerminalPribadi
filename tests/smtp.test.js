// Uji klien SMTP (Gmail/SMTP) terhadap server SMTP palsu lokal. Sertifikat di tests/fixtures hanya untuk uji.
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import tls from 'node:tls';
import fs from 'node:fs';
import { sendSmtp, buildMessage, parseAddress } from '../lib/smtp.js';

const key = fs.readFileSync(new URL('./fixtures/test-key.pem', import.meta.url));
const cert = fs.readFileSync(new URL('./fixtures/test-cert.pem', import.meta.url));

// Server SMTP palsu. mode 'tls' = port 465 style, 'starttls' = port 587 style.
function fakeServer({ mode, user = 'me@gmail.com', pass = 'abcdabcdabcdabcd', authLine = '250-AUTH LOGIN PLAIN' }) {
  const got = { cmds: [], data: '', authed: false };
  const handler = (s0) => {
    let s = s0, buf = '', inData = false, dataBuf = '', loginStep = 0;
    const send = x => s.write(x + '\r\n');
    const onData = d => {
      buf += d.toString();
      let i;
      while (!inData && (i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2); got.cmds.push(loginStep ? '<auth>' : line.split(' ').slice(0, 2).join(' '));
        if (loginStep === 1) { loginStep = 2; send('334 UGFzc3dvcmQ6'); continue; }
        if (loginStep === 2) { loginStep = 0; got.authed = Buffer.from(line, 'base64').toString() === pass; send(got.authed ? '235 2.7.0 Accepted' : '535-5.7.8 Username and Password not accepted'); continue; }
        if (/^EHLO/.test(line)) { s.write(`250-localhost\r\n${mode === 'starttls' && s === s0 ? '250-STARTTLS\r\n' : ''}${authLine.replace('250-', '250-')}\r\n250 8BITMIME\r\n`); }
        else if (line === 'STARTTLS') {
          send('220 Ready'); s0.removeAllListeners('data');
          s = new tls.TLSSocket(s0, { isServer: true, key, cert }); s.on('data', onData); s.on('error', () => {});
        }
        else if (/^AUTH PLAIN /.test(line)) {
          const [, u, p] = Buffer.from(line.slice(11), 'base64').toString().split('\0'); got.authed = u === user && p === pass;
          send(got.authed ? '235 2.7.0 Accepted' : '535-5.7.8 Username and Password not accepted\r\n535 5.7.8 https://support.google.com/mail/?p=BadCredentials');
        }
        else if (line === 'AUTH LOGIN') { loginStep = 1; send('334 VXNlcm5hbWU6'); }
        else if (/^MAIL FROM/.test(line) || /^RCPT TO/.test(line)) send('250 OK');
        else if (line === 'DATA') { send('354 go'); inData = true; }
        else if (line === 'QUIT') { send('221 bye'); s.end(); }
        else send('500 ?');
      }
      if (inData) {
        dataBuf += buf; buf = '';
        const end = dataBuf.indexOf('\r\n.\r\n');
        if (end >= 0) { got.data = dataBuf.slice(0, end); inData = false; send('250 2.0.0 OK queued'); }
      }
    };
    s0.on('error', () => {}); s0.on('data', onData);
    s0.write('220 smtp.test ESMTP\r\n');
  };
  const server = mode === 'tls' ? tls.createServer({ key, cert }, handler) : net.createServer(handler);
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, got, port: server.address().port })));
}
const base = { host: '127.0.0.1', user: 'me@gmail.com', pass: 'abcdabcdabcdabcd', from: 'Terminal Chart <me@gmail.com>', to: 'budi@mail.id', subject: '123456 adalah kode Terminal Chart Anda', text: 'Kode: 123456\n.titik di awal baris', html: '<p>Kode 123456</p>', tls: { ca: cert } };
const decode = (data, type) => { const m = new RegExp(`Content-Type: ${type}[^\\r]*\\r\\nContent-Transfer-Encoding: base64\\r\\n\\r\\n([A-Za-z0-9+/=\\r\\n]+?)(\\r\\n--|$)`).exec(data); return Buffer.from(m[1].replace(/\s/g, ''), 'base64').toString(); };

test('smtp: TLS langsung (port 465 / Gmail) + AUTH PLAIN + isi pesan', async () => {
  const { server, got, port } = await fakeServer({ mode: 'tls' });
  try {
    await sendSmtp({ ...base, port, secure: true });
  } catch (e) { server.close(); throw e; }
  server.close();
  assert.ok(got.authed);
  assert.deepEqual(got.cmds.filter(c => /^(MAIL|RCPT|DATA|QUIT)/.test(c)), ['MAIL FROM:<me@gmail.com>', 'RCPT TO:<budi@mail.id>', 'DATA', 'QUIT']);
  assert.match(got.data, /^From: "Terminal Chart" <me@gmail\.com>/m);
  assert.match(got.data, /^Subject: 123456 adalah kode Terminal Chart Anda/m);
  assert.equal(decode(got.data, 'text/plain'), 'Kode: 123456\n.titik di awal baris');
  assert.equal(decode(got.data, 'text/html'), '<p>Kode 123456</p>');
});

test('smtp: STARTTLS (port 587) lalu AUTH', async () => {
  const { server, got, port } = await fakeServer({ mode: 'starttls' });
  try { await sendSmtp({ ...base, port, secure: false }); } finally { server.close(); }
  assert.ok(got.authed);
  assert.ok(got.cmds.includes('STARTTLS'));
  assert.equal(got.cmds.filter(c => c.startsWith('EHLO')).length, 2);
});

test('smtp: fallback AUTH LOGIN bila PLAIN tidak ditawarkan', async () => {
  const { server, got, port } = await fakeServer({ mode: 'tls', authLine: '250-AUTH LOGIN' });
  try { await sendSmtp({ ...base, port, secure: true }); } finally { server.close(); }
  assert.ok(got.authed);
});

test('smtp: password salah -> error jelas tanpa membocorkan password', async () => {
  const { server, port } = await fakeServer({ mode: 'tls' });
  try {
    await assert.rejects(sendSmtp({ ...base, pass: 'salahsalahsalah1', port, secure: true }), e => /AUTH/.test(e.message) && e.code === 535 && !e.message.includes('salahsalahsalah1'));
  } finally { server.close(); }
});

test('smtp: subjek/nama non-ASCII di-encode, injeksi header ditolak', () => {
  const m = buildMessage({ from: 'Terminal Çhart <me@gmail.com>', to: 'a@b.id', subject: 'Kode verifikasi — 123456', text: 'x' });
  assert.match(m, /^Subject: =\?UTF-8\?B\?/m);
  assert.match(m, /^From: =\?UTF-8\?B\?[A-Za-z0-9+\/=]+\?= <me@gmail\.com>/m);
  assert.throws(() => buildMessage({ from: 'me@gmail.com', to: 'a@b.id\r\nBcc: x@y.id', subject: 's', text: 'x' }));
  assert.throws(() => buildMessage({ from: 'me@gmail.com', to: 'a@b.id', subject: 's\r\nBcc: x@y.id', text: 'x' }));
  assert.deepEqual(parseAddress('Nama <x@y.id>'), { name: 'Nama', address: 'x@y.id' });
});

test('mail: jalur gmail terpilih otomatis; sertifikat tak tepercaya -> 502, bukan crash', async () => {
  const { server, got, port } = await fakeServer({ mode: 'tls' });
  Object.assign(process.env, { MAIL_PROVIDER: '', GMAIL_USER: 'me@gmail.com', GMAIL_APP_PASSWORD: 'abcd abcd abcd abcd', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(port) });
  const { sendMail } = await import('../lib/mail.js');
  // sertifikat uji tidak dipercaya sistem -> harus gagal TLS (502), bukan crash; membuktikan jalur gmail terpilih
  try { await assert.rejects(sendMail({ to: 'a@b.id', subject: 's', text: 't' }), e => e.status === 502); }
  finally { server.close(); for (const k of ['GMAIL_USER', 'GMAIL_APP_PASSWORD', 'SMTP_HOST', 'SMTP_PORT']) delete process.env[k]; process.env.MAIL_PROVIDER = 'memory'; }
  assert.equal(got.authed, false);
});

test('mail: gmail tanpa kredensial lengkap -> 500 terkonfigurasi salah', async () => {
  Object.assign(process.env, { MAIL_PROVIDER: 'gmail', GMAIL_USER: 'me@gmail.com' }); delete process.env.GMAIL_APP_PASSWORD;
  const { sendMail } = await import('../lib/mail.js');
  try { await assert.rejects(sendMail({ to: 'a@b.id', subject: 's', text: 't' }), e => e.status === 500 && /GMAIL_APP_PASSWORD/.test(e.message)); }
  finally { delete process.env.GMAIL_USER; process.env.MAIL_PROVIDER = 'memory'; }
});
