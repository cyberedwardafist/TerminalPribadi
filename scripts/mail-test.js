// npm run mail:test                    -> periksa .env: sambung ke SMTP dan login (tanpa kirim email)
// npm run mail:test -- tujuan@gmail.com -> sekaligus kirim 1 email OTP contoh ke alamat itu
// Menampilkan galat asli server SMTP + petunjuk perbaikannya, jadi tidak perlu menebak kenapa OTP tidak sampai.
import './load-env.js';
import { mailConfig, verifySmtp, sendMail, otpMail, smtpHint } from '../lib/mail.js';

const to = process.argv[2];
const c = mailConfig();
const mask = s => (s ? '*'.repeat(Math.min(String(s).length, 8)) + ` (${String(s).length} karakter)` : '(KOSONG)');
console.log('Provider email :', c.provider || '(belum diatur)');
if (c.smtp) console.log(`SMTP           : ${c.smtp.host || '(KOSONG)'}:${c.smtp.port}  ${c.smtp.secure ?? Number(c.smtp.port) === 465 ? 'TLS langsung' : 'STARTTLS'}\nUser           : ${c.smtp.user || '(KOSONG)'}\nPassword       : ${mask(c.smtp.pass)}`);
console.log('Pengirim (From):', c.from);
if (c.provider === 'log' || c.provider === 'memory') { console.error('\nGAGAL: MAIL_PROVIDER=' + c.provider + ' tidak mengirim email sungguhan. Hapus baris MAIL_PROVIDER dari .env.'); process.exit(1); }
if (!c.provider) { console.error('\nGAGAL: belum ada konfigurasi email. Isi SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS di .env (lihat .env.example).'); process.exit(1); }

if (c.provider === 'smtp' || c.provider === 'gmail') {
  const r = await verifySmtp();
  if (!r.ok) { console.error('\nGAGAL tersambung/login SMTP:', r.error, r.hint ? '\n=> ' + r.hint : ''); process.exit(1); }
  console.log('\nOK: tersambung dan login SMTP berhasil.');
}
if (to) {
  try { const m = otpMail('123456', 'register'); await sendMail({ to, ...m, subject: 'Uji email Terminal Chart: ' + m.subject }); console.log('OK: email uji terkirim ke ' + to + ' (cek juga folder Spam).'); }
  catch (e) { const err = e.cause || e; console.error('\nGAGAL kirim:', err.message, smtpHint(err) ? '\n=> ' + smtpHint(err) : ''); process.exit(1); }
} else console.log('Untuk mengirim email uji:  npm run mail:test -- alamat@email.com');
