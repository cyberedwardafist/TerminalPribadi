// Enkripsi rahasia pengguna (mis. token Finnhub/Tiingo) sebelum masuk database: AES-256-GCM.
// Kunci diturunkan dari SECRETS_KEY (disarankan, bila diisi) atau dari JWT_SECRET. Tanpa kunci ini isi database tidak bisa dibaca,
// termasuk oleh orang yang membuka dashboard Supabase atau yang memegang cadangan database.
import crypto from 'node:crypto';
import { HttpError } from './http.js';

const key = () => {
  const base = process.env.SECRETS_KEY || process.env.JWT_SECRET || '';
  if (base.length < 32) throw new HttpError(500, 'SECRETS_KEY/JWT_SECRET belum diatur');
  return crypto.createHash('sha256').update('terminal-chart:user-secrets:v1:' + base).digest();
};
export function seal(plain) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}
/** null bila rusak / kunci berbeda (mis. SECRETS_KEY diganti): pemanggil menganggapnya kosong, pengguna cukup mengisi ulang */
export function open(sealed) {
  try {
    const [v, iv, tag, ct] = String(sealed || '').split('.');
    if (v !== 'v1') return null;
    const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
  } catch { return null; }
}
