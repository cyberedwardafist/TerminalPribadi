-- Tambahan (idempoten): penyimpanan state per app (watchlist, berita tersimpan, peta, tab chart) agar sinkron antar perangkat.
-- Jika Anda menjalankan 001_init.sql versi terbaru, tabel ini sudah ada dan file ini aman dijalankan ulang.
create table if not exists public.user_state (
  user_id    uuid not null references public.users(id) on delete cascade,
  key        text not null check (key ~ '^[a-z0-9._-]{1,40}$'),
  data       jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
drop trigger if exists trg_touch on public.user_state;
create trigger trg_touch before update on public.user_state for each row execute function public.touch_updated_at();
alter table public.user_state enable row level security;
revoke all on table public.user_state from anon, authenticated;
