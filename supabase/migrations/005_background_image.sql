-- Pengaturan Umum/Background lintas perangkat: gambar background sendiri disimpan di bucket privat 'backgrounds'
-- dan metadatanya di user_settings.bg_image. Jika Anda menjalankan 001_init.sql versi terbaru, ini sudah ada dan aman dijalankan ulang.
alter table public.user_settings add column if not exists bg_image jsonb;
insert into storage.buckets (id, name, public) values ('backgrounds', 'backgrounds', false) on conflict (id) do nothing;
