-- Gambar jurnal memakai id dari klien (dirujuk trade.imgs[]), bukan hanya uuid. Aman dijalankan ulang.
alter table public.journal_images alter column id drop default;
alter table public.journal_images alter column id type text using id::text;
