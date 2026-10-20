// Pengiriman email OTP / notifikasi. Provider: smtp (utama) | gmail | resend | brevo | memory (test) | log (dev, kode hanya muncul di log server).
import { HttpError } from './http.js';
import { sendSmtp } from './smtp.js';
export const outbox = [];

// Urutan otomatis bila MAIL_PROVIDER kosong: SMTP (SMTP_URL, atau SMTP_HOST+SMTP_USER+SMTP_PASS) > Gmail > Resend > Brevo. MAIL_PROVIDER mengunci pilihan.
const PLACEHOLDER_FROM = /domainanda\.|domainmu\.|domainmu\b|alamat@|nama@|@example\.(com|org)|xxxx/i;
export function mailConfig(env = process.env) {
  // nilai dari panel Vercel sering ikut terbawa kutip/spasi ("...", '...'); dibuang agar SMTP_URL/SMTP_PASS tetap terbaca benar
  const t = k => String(env[k] ?? '').trim().replace(/^(['"])(.*)\1$/s, '$2').trim();
  const gmailPass = t('GMAIL_APP_PASSWORD').replace(/\s+/g, ''); // App Password Google ditampilkan dengan spasi (4x4 huruf)
  // SMTP_URL satu baris: smtps://USER:PASSWORD@HOST:465 (TLS langsung) atau smtp://USER:PASSWORD@HOST:587 (STARTTLS). USER/PASSWORD di-URL-encode (@ -> %40)
  let fromUrl = null, urlError = '';
  if (t('SMTP_URL')) {
    try {
      const u = new URL(t('SMTP_URL'));
      if (!/^smtps?:$/.test(u.protocol) || !u.hostname) throw new Error('x');
      const tlsDirect = u.protocol === 'smtps:';
      const q = u.searchParams.get('secure');
      fromUrl = { host: u.hostname, port: u.port || (tlsDirect ? 465 : 587), user: decodeURIComponent(u.username), pass: decodeURIComponent(u.password), secure: q ? /^(1|true)$/i.test(q) : tlsDirect || u.port === '465' };
    } catch { urlError = 'SMTP_URL tidak valid. Format: smtps://USER:PASSWORD@HOST:465 (karakter khusus di USER/PASSWORD di-URL-encode, @ jadi %40)'; }
  }
  const smtpOk = !!t('SMTP_HOST') || !!t('SMTP_URL');
  const provider = (t('MAIL_PROVIDER') || (smtpOk ? 'smtp' : t('GMAIL_USER') && gmailPass ? 'gmail' : t('RESEND_API_KEY') ? 'resend' : t('BREVO_API_KEY') ? 'brevo' : '')).toLowerCase();
  const login = provider === 'gmail' ? t('GMAIL_USER') : fromUrl?.user || t('SMTP_USER');
  // pengirim: MAIL_FROM / SMTP_FROM (placeholder dari .env.example diabaikan), lalu akun login SMTP (server SMTP biasanya menolak pengirim yang bukan miliknya)
  const given = [t('SMTP_FROM'), t('MAIL_FROM')].find(x => x && !PLACEHOLDER_FROM.test(x));
  let from = given || (login.includes('@') ? `Terminal Chart <${login}>` : 'Terminal Chart <onboarding@resend.dev>');
  // Gmail hanya mengizinkan pengirim = akun login (atau alias terverifikasi); alamat lain diganti/ditolak. Nama tampilan dari MAIL_FROM tetap dipakai.
  const gmailHost = provider === 'gmail' || /(^|\.)gmail\.com$/i.test(fromUrl?.host || t('SMTP_HOST'));
  if (gmailHost && login.includes('@')) from = `${/^\s*"?([^"<]+?)"?\s*</.exec(given || '')?.[1] || 'Terminal Chart'} <${login}>`;
  let smtp = null;
  if (provider === 'gmail') smtp = { host: t('SMTP_HOST') || 'smtp.gmail.com', port: t('SMTP_PORT') || 465, user: t('GMAIL_USER'), pass: gmailPass };
  if (provider === 'smtp' && t('SMTP_URL')) smtp = fromUrl && { ...fromUrl, pass: /(^|\.)gmail\.com$/i.test(fromUrl.host) ? fromUrl.pass.replace(/\s+/g, '') : fromUrl.pass };
  else if (provider === 'smtp') smtp = { host: t('SMTP_HOST'), port: t('SMTP_PORT') || 465, user: t('SMTP_USER'), pass: /(^|\.)gmail\.com$/i.test(t('SMTP_HOST')) ? t('SMTP_PASS').replace(/\s+/g, '') : t('SMTP_PASS') };   // App Password Gmail ditampilkan dengan spasi
  if (smtp && t('SMTP_SECURE')) smtp.secure = /^(1|true|ya|yes|ssl|tls)$/i.test(t('SMTP_SECURE'));
  return { provider, from, smtp, urlError };
}

// Petunjuk perbaikan dalam bahasa Indonesia untuk galat SMTP yang umum (dicetak di log server, /api/admin/mail-test, dan "npm run mail:test").
export function smtpHint(e) {
  const m = String(e?.message || e || ''), c = e?.code;
  if (/EAUTH|^SMTP AUTH/i.test(m) || c === 535 || c === 534 || c === 454) return 'Login SMTP ditolak. Periksa SMTP_USER dan SMTP_PASS. Gmail WAJIB memakai App Password 16 huruf (myaccount.google.com/apppasswords, Verifikasi 2 Langkah harus aktif), BUKAN password akun Gmail biasa.';
  if (c === 530 || c === 538 || /STARTTLS first|Authentication Required/i.test(m)) return 'Server meminta enkripsi/login dulu. Pakai port 465 (TLS langsung, SMTP_SECURE=true) atau 587 (STARTTLS, SMTP_SECURE=false).';
  if (/wrong version number|ssl3_get_record|packet length too long|unknown protocol/i.test(m)) return 'Mode enkripsi tidak cocok dengan port. Port 465 -> SMTP_SECURE=true. Port 587 -> SMTP_SECURE=false (STARTTLS).';
  if (/ENOTFOUND|EAI_AGAIN/i.test(m)) return 'SMTP_HOST tidak ditemukan. Periksa penulisan host (Gmail: smtp.gmail.com).';
  if (/ECONNREFUSED|ETIMEDOUT|timeout|ECONNRESET|terputus/i.test(m)) return 'Tidak bisa tersambung ke server SMTP. Periksa SMTP_HOST dan SMTP_PORT (465 atau 587). Port 25 diblokir di Vercel dan sebagian hosting.';
  if (/certificate|self.signed|CERT_/i.test(m)) return 'Sertifikat TLS server SMTP tidak tepercaya. Pastikan SMTP_HOST sama persis dengan nama pada sertifikat (mis. smtp.gmail.com, bukan alamat IP).';
  if (c === 550 || c === 553 || c === 554 || /MAIL FROM|RCPT TO/.test(m)) return 'Pengirim atau penerima ditolak. Kosongkan MAIL_FROM atau isi dengan alamat milik akun SMTP (Gmail selalu memakai akun login sebagai pengirim). Cek juga penerima tidak salah ketik.';
  if (c === 421 || c === 451 || c === 452 || c === 454) return 'Server SMTP menolak sementara (batas kirim harian/terlalu cepat). Coba lagi beberapa menit lagi.';
  return '';
}

// Uji koneksi + login SMTP tanpa mengirim email. Mengembalikan {ok, provider, hint?, error?}
export async function verifySmtp(env = process.env) {
  const { provider, from, smtp: cfg, urlError } = mailConfig(env);
  if (provider !== 'smtp' && provider !== 'gmail') return { ok: false, provider, error: 'Provider email aktif bukan SMTP/Gmail' };
  if (urlError) return { ok: false, provider, error: urlError };
  if (!cfg?.host) return { ok: false, provider, error: 'SMTP_HOST belum diisi' };
  if (!cfg.user || !cfg.pass) return { ok: false, provider, error: 'SMTP_USER dan SMTP_PASS belum lengkap' };
  try { await sendSmtp({ ...cfg, from, verifyOnly: true }); return { ok: true, provider }; }
  catch (e) { return { ok: false, provider, error: String(e.message).slice(0, 300), hint: smtpHint(e) }; }
}

export async function sendMail({ to, subject, text, html }) {
  const env = process.env;
  const { provider, from, smtp: cfg, urlError } = mailConfig(env);
  if (provider === 'memory') { outbox.push({ to, subject, text, html }); return; }
  if (provider === 'log') { console.log(`[mail] to=${to} subject=${subject}\n${text}`); return; }
  try {
    if (provider === 'resend') {
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ from, to: [to], subject, text, html }) });
      if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return;
    }
    if (provider === 'brevo') {
      const m = /^(.*)<(.+)>$/.exec(from); const sender = m ? { name: m[1].trim().replace(/"/g, ''), email: m[2] } : { email: from };
      const r = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ sender, to: [{ email: to }], subject, textContent: text, htmlContent: html }) });
      if (!r.ok) throw new Error(`Brevo ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return;
    }
    if (provider === 'gmail' || provider === 'smtp') {
      if (urlError) throw new HttpError(500, urlError);
      if (!cfg || !cfg.host || (provider === 'gmail' && (!cfg.user || !cfg.pass))) throw new HttpError(500, provider === 'gmail' ? 'Gmail belum dikonfigurasi (GMAIL_USER dan GMAIL_APP_PASSWORD)' : 'SMTP belum dikonfigurasi (SMTP_HOST)');
      await sendSmtp({ ...cfg, from, to, subject, text, html });
      return;
    }
  } catch (e) { if (e instanceof HttpError) throw e; console.error('[mail] gagal kirim', provider, e.message, smtpHint(e) ? '\n[mail] PETUNJUK: ' + smtpHint(e) : ''); e.mailProvider = provider; throw Object.assign(new HttpError(502, 'Email tidak bisa dikirim saat ini. Coba lagi sebentar'), { cause: e }); }
  throw new HttpError(500, 'Pengiriman email belum dikonfigurasi (isi SMTP_URL di Environment Variables)');
}

export function otpMail(code, purpose) {
  const what = purpose === 'reset' ? 'mengatur ulang password' : 'memverifikasi akun';
  const text = `Kode ${what} Terminal Chart: ${code}\nBerlaku 10 menit. Jangan bagikan kode ini ke siapa pun. Abaikan email ini jika Anda tidak memintanya.`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:420px"><p>Kode untuk ${what} di Terminal Chart:</p><p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:16px 0">${code}</p><p style="color:#666;font-size:13px">Berlaku 10 menit. Jangan bagikan kode ini ke siapa pun. Abaikan email ini jika Anda tidak memintanya.</p></div>`;
  return { subject: `${code} adalah kode Terminal Chart Anda`, text, html };
}
