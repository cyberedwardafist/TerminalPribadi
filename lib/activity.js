// Riwayat aksi user (untuk GET /api/activity dan Home). Best-effort: kegagalan tidak boleh menggagalkan aksi utama.
import * as db from './db.js';
export const logActivity = (userId, type, summary, data = {}) =>
  db.insert('activity_log', { user_id: userId, type, summary: String(summary).slice(0, 200), data }).catch(() => {});
export const notify = (userId, type, title, body, data = {}) =>
  db.insert('notifications', { user_id: userId, type, title, body, data }).catch(() => {});
