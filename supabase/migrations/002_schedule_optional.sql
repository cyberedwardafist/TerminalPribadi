-- OPSIONAL: jadwal sering lewat Supabase (gratis) memanggil endpoint cron di Vercel.
-- Vercel Hobby hanya mengizinkan cron 1x sehari, jadi alert harga dan berita dijadwalkan dari sini.
-- 1) Aktifkan extension: Database > Extensions > pg_cron dan pg_net
-- PERINGATAN: setelah CRON_SECRET diisi di bawah, JANGAN simpan/commit/kirim file ini lagi (secret tersimpan di tabel cron Supabase).
--   Jalankan langsung di SQL Editor lalu tutup tanpa menyimpan, atau pakai salinan lokal yang tidak ikut repo.
-- 2) Ganti YOUR-APP dan CRON_SECRET (nilainya sama dengan env CRON_SECRET di Vercel), lalu jalankan.

-- alert harga: tiap menit
select cron.schedule('tc-alerts', '* * * * *', $$
  select net.http_get(url := 'https://YOUR-APP.vercel.app/api/cron/alerts',
                      headers := '{"Authorization":"Bearer CRON_SECRET"}'::jsonb, timeout_milliseconds := 50000)
$$);
-- berita: tiap 15 menit
select cron.schedule('tc-news', '*/15 * * * *', $$
  select net.http_get(url := 'https://YOUR-APP.vercel.app/api/cron/news',
                      headers := '{"Authorization":"Bearer CRON_SECRET"}'::jsonb, timeout_milliseconds := 50000)
$$);
-- kalender ekonomi dan dividen: tiap 6 jam
select cron.schedule('tc-calendar', '0 */6 * * *', $$
  select net.http_get(url := 'https://YOUR-APP.vercel.app/api/cron/calendar',
                      headers := '{"Authorization":"Bearer CRON_SECRET"}'::jsonb, timeout_milliseconds := 50000)
$$);
-- pemanasan cache pasar (heatmap, pemindai): tiap 10 menit
select cron.schedule('tc-warm', '*/10 * * * *', $$
  select net.http_get(url := 'https://YOUR-APP.vercel.app/api/cron/warm',
                      headers := '{"Authorization":"Bearer CRON_SECRET"}'::jsonb, timeout_milliseconds := 55000)
$$);
-- bersih-bersih tabel sementara: tiap hari
select cron.schedule('tc-cleanup', '15 3 * * *', $$
  select net.http_get(url := 'https://YOUR-APP.vercel.app/api/cron/cleanup',
                      headers := '{"Authorization":"Bearer CRON_SECRET"}'::jsonb)
$$);
-- hapus jadwal: select cron.unschedule('tc-alerts');
