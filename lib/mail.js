// Pengiriman email OTP / notifikasi. Provider: resend | brevo | gmail | smtp | memory (test) | log (dev, kode hanya muncul di log server).
import { HttpError } from './http.js';
import { sendSmtp } from './smtp.js';
export const outbox = [];

export async function sendMail({ to, subject, text, html }) {
  const env = process.env;
  const gmailPass = (env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, ''); // App Password Google ditampilkan dengan spasi (4x4 huruf)
  const provider = (env.MAIL_PROVIDER || (env.RESEND_API_KEY ? 'resend' : env.BREVO_API_KEY ? 'brevo' : env.GMAIL_USER && gmailPass ? 'gmail' : env.SMTP_HOST ? 'smtp' : '')).toLowerCase();
  const from = env.MAIL_FROM || (provider === 'gmail' && env.GMAIL_USER ? `Terminal Chart <${env.GMAIL_USER}>` : 'Terminal Chart <onboarding@resend.dev>');
  if (provider === 'memory') { outbox.push({ to, subject, text, html }); return; }
  if (provider === 'log') { console.log(`[mail] to=${to} subject=${subject}\n${text}`); return; }
  try {
    if (provider === 'resend') {
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ from, to: [to], subject, text, html }) });
      if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return;
    }
    if (provider === 'brevo') {
      const m = /^(.*)<(.+)>$/.exec(from); const sender = m ? { name: m[1].trim().replace(/"/g, ''), email: m[2] } : { email: from };
      const r = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ sender, to: [{ email: to }], subject, textContent: text, htmlContent: html }) });
      if (!r.ok) throw new Error(`Brevo ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return;
    }
    if (provider === 'gmail' || provider === 'smtp') {
      const g = provider === 'gmail';
      const cfg = g ? { host: env.SMTP_HOST || 'smtp.gmail.com', port: env.SMTP_PORT || 465, user: env.GMAIL_USER, pass: gmailPass } : { host: env.SMTP_HOST, port: env.SMTP_PORT || 465, user: env.SMTP_USER, pass: env.SMTP_PASS };
      if (!cfg.host || (g && (!cfg.user || !cfg.pass))) throw new HttpError(500, g ? 'Gmail belum dikonfigurasi (GMAIL_USER dan GMAIL_APP_PASSWORD)' : 'SMTP belum dikonfigurasi (SMTP_HOST)');
      await sendSmtp({ ...cfg, from, to, subject, text, html });
      return;
    }
  } catch (e) { if (e instanceof HttpError) throw e; console.error('[mail] gagal kirim', e.message); throw new HttpError(502, 'Email tidak bisa dikirim saat ini. Coba lagi sebentar'); }
  throw new HttpError(500, 'Pengiriman email belum dikonfigurasi (RESEND_API_KEY, BREVO_API_KEY, atau GMAIL_USER + GMAIL_APP_PASSWORD)');
}

export function otpMail(code, purpose) {
  const what = purpose === 'reset' ? 'mengatur ulang password' : 'memverifikasi akun';
  const text = `Kode ${what} Terminal Chart: ${code}\nBerlaku 10 menit. Jangan bagikan kode ini ke siapa pun. Abaikan email ini jika Anda tidak memintanya.`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:420px"><p>Kode untuk ${what} di Terminal Chart:</p><p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:16px 0">${code}</p><p style="color:#666;font-size:13px">Berlaku 10 menit. Jangan bagikan kode ini ke siapa pun. Abaikan email ini jika Anda tidak memintanya.</p></div>`;
  return { subject: `${code} adalah kode Terminal Chart Anda`, text, html };
}
