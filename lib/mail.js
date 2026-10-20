// Pengiriman email OTP / notifikasi. Provider: smtp (utama) | gmail | resend | brevo | memory (test) | log (dev, kode hanya muncul di log server).
import { HttpError } from './http.js';
import { sendSmtp } from './smtp.js';
export const outbox = [];

// Urutan otomatis bila MAIL_PROVIDER kosong: SMTP (SMTP_URL, atau SMTP_HOST+SMTP_USER+SMTP_PASS) > Gmail > Resend > Brevo. MAIL_PROVIDER mengunci pilihan.
const PLACEHOLDER_FROM = /domainanda\.com|example\.(com|org)/i;
export function mailConfig(env = process.env) {
  const t = k => String(env[k] ?? '').trim();
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
  const from = given || (login.includes('@') ? `Terminal Chart <${login}>` : 'Terminal Chart <onboarding@resend.dev>');
  let smtp = null;
  if (provider === 'gmail') smtp = { host: t('SMTP_HOST') || 'smtp.gmail.com', port: t('SMTP_PORT') || 465, user: t('GMAIL_USER'), pass: gmailPass };
  if (provider === 'smtp' && t('SMTP_URL')) smtp = fromUrl && { ...fromUrl, pass: /(^|\.)gmail\.com$/i.test(fromUrl.host) ? fromUrl.pass.replace(/\s+/g, '') : fromUrl.pass };
  else if (provider === 'smtp') smtp = { host: t('SMTP_HOST'), port: t('SMTP_PORT') || 465, user: t('SMTP_USER'), pass: /(^|\.)gmail\.com$/i.test(t('SMTP_HOST')) ? String(env.SMTP_PASS ?? '').replace(/\s+/g, '') : String(env.SMTP_PASS ?? '').trim() };   // App Password Gmail ditampilkan dengan spasi
  if (smtp && t('SMTP_SECURE')) smtp.secure = /^(1|true|ya|yes|ssl|tls)$/i.test(t('SMTP_SECURE'));
  return { provider, from, smtp, urlError };
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
  } catch (e) { if (e instanceof HttpError) throw e; console.error('[mail] gagal kirim', provider, e.message); e.mailProvider = provider; throw Object.assign(new HttpError(502, 'Email tidak bisa dikirim saat ini. Coba lagi sebentar'), { cause: e }); }
  throw new HttpError(500, 'Pengiriman email belum dikonfigurasi (isi SMTP_URL di Environment Variables)');
}

export function otpMail(code, purpose) {
  const what = purpose === 'reset' ? 'mengatur ulang password' : 'memverifikasi akun';
  const text = `Kode ${what} Terminal Chart: ${code}\nBerlaku 10 menit. Jangan bagikan kode ini ke siapa pun. Abaikan email ini jika Anda tidak memintanya.`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:420px"><p>Kode untuk ${what} di Terminal Chart:</p><p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:16px 0">${code}</p><p style="color:#666;font-size:13px">Berlaku 10 menit. Jangan bagikan kode ini ke siapa pun. Abaikan email ini jika Anda tidak memintanya.</p></div>`;
  return { subject: `${code} adalah kode Terminal Chart Anda`, text, html };
}
