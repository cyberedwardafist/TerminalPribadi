// Pengiriman email OTP / notifikasi. Provider: smtp (utama) | gmail | resend | brevo | memory (test) | log (dev, kode hanya muncul di log server).
import { HttpError } from './http.js';
import { sendSmtp } from './smtp.js';
export const outbox = [];

// Urutan otomatis bila MAIL_PROVIDER kosong: SMTP (SMTP_HOST) > Gmail > Resend > Brevo. MAIL_PROVIDER mengunci pilihan.
const PLACEHOLDER_FROM = /domainanda\.com|example\.(com|org)/i;
export function mailConfig(env = process.env) {
  const t = k => String(env[k] ?? '').trim();
  const gmailPass = t('GMAIL_APP_PASSWORD').replace(/\s+/g, ''); // App Password Google ditampilkan dengan spasi (4x4 huruf)
  const smtpOk = !!t('SMTP_HOST');
  const provider = (t('MAIL_PROVIDER') || (smtpOk ? 'smtp' : t('GMAIL_USER') && gmailPass ? 'gmail' : t('RESEND_API_KEY') ? 'resend' : t('BREVO_API_KEY') ? 'brevo' : '')).toLowerCase();
  const login = provider === 'gmail' ? t('GMAIL_USER') : t('SMTP_USER');
  // pengirim: MAIL_FROM / SMTP_FROM (placeholder dari .env.example diabaikan), lalu akun login SMTP (server SMTP biasanya menolak pengirim yang bukan miliknya)
  const given = [t('SMTP_FROM'), t('MAIL_FROM')].find(x => x && !PLACEHOLDER_FROM.test(x));
  const from = given || (login.includes('@') ? `Terminal Chart <${login}>` : 'Terminal Chart <onboarding@resend.dev>');
  let smtp = null;
  if (provider === 'gmail') smtp = { host: t('SMTP_HOST') || 'smtp.gmail.com', port: t('SMTP_PORT') || 465, user: t('GMAIL_USER'), pass: gmailPass };
  if (provider === 'smtp') smtp = { host: t('SMTP_HOST'), port: t('SMTP_PORT') || 465, user: t('SMTP_USER'), pass: /(^|\.)gmail\.com$/i.test(t('SMTP_HOST')) ? String(env.SMTP_PASS ?? '').replace(/\s+/g, '') : String(env.SMTP_PASS ?? '').trim() };   // App Password Gmail ditampilkan dengan spasi
  if (smtp && t('SMTP_SECURE')) smtp.secure = /^(1|true|ya|yes|ssl|tls)$/i.test(t('SMTP_SECURE'));
  return { provider, from, smtp };
}

export async function sendMail({ to, subject, text, html }) {
  const env = process.env;
  const { provider, from, smtp: cfg } = mailConfig(env);
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
      if (!cfg.host || (provider === 'gmail' && (!cfg.user || !cfg.pass))) throw new HttpError(500, provider === 'gmail' ? 'Gmail belum dikonfigurasi (GMAIL_USER dan GMAIL_APP_PASSWORD)' : 'SMTP belum dikonfigurasi (SMTP_HOST)');
      await sendSmtp({ ...cfg, from, to, subject, text, html });
      return;
    }
  } catch (e) { if (e instanceof HttpError) throw e; console.error('[mail] gagal kirim', provider, e.message); e.mailProvider = provider; throw Object.assign(new HttpError(502, 'Email tidak bisa dikirim saat ini. Coba lagi sebentar'), { cause: e }); }
  throw new HttpError(500, 'Pengiriman email belum dikonfigurasi (isi SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS di Environment Variables)');
}

export function otpMail(code, purpose) {
  const what = purpose === 'reset' ? 'mengatur ulang password' : 'memverifikasi akun';
  const text = `Kode ${what} Terminal Chart: ${code}\nBerlaku 10 menit. Jangan bagikan kode ini ke siapa pun. Abaikan email ini jika Anda tidak memintanya.`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:420px"><p>Kode untuk ${what} di Terminal Chart:</p><p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:16px 0">${code}</p><p style="color:#666;font-size:13px">Berlaku 10 menit. Jangan bagikan kode ini ke siapa pun. Abaikan email ini jika Anda tidak memintanya.</p></div>`;
  return { subject: `${code} adalah kode Terminal Chart Anda`, text, html };
}
