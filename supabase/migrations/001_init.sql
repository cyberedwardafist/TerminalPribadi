-- Terminal Chart: skema Supabase (Postgres). Jalankan sekali di Supabase > SQL Editor.
-- Akses data HANYA lewat backend Vercel (service role). Anon/authenticated sengaja tidak punya akses ke tabel apa pun.

create extension if not exists pgcrypto;
create extension if not exists citext;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ===================== AKUN =====================
create table if not exists public.users (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 2 and 40),
  username       citext not null unique check (username ~ '^[a-z0-9_.]{3,20}$'),
  email          citext not null unique,
  password_hash  text not null,
  verified       boolean not null default false,
  avatar         text check (avatar is null or char_length(avatar) <= 400000),
  role           text not null default 'user' check (role in ('user','admin')),
  token_version  int  not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  last_login_at  timestamptz
);
create table if not exists public.otps (
  email      citext not null,
  purpose    text   not null check (purpose in ('register','reset')),
  code_hash  text   not null,
  expires_at timestamptz not null,
  tries      int    not null default 0,
  sent_at    timestamptz not null default now(),
  primary key (email, purpose)
);
create table if not exists public.auth_tickets (
  email       citext primary key,
  ticket_hash text not null,
  expires_at  timestamptz not null
);
create table if not exists public.rate_limits (
  key      text primary key,
  count    int not null,
  reset_at timestamptz not null
);
create table if not exists public.kv_cache (
  key        text primary key,
  value      jsonb not null,
  expires_at timestamptz not null
);

-- ===================== PENGATURAN =====================
create table if not exists public.user_settings (
  user_id     uuid primary key references public.users(id) on delete cascade,
  preferences jsonb not null default '{}',
  layout      jsonb not null default '{}',
  bg_image    jsonb,                              -- metadata gambar background sendiri {ts,size,mime}; filenya di bucket 'backgrounds'
  updated_at  timestamptz not null default now()
);

-- ===================== WATCHLIST, ALERT, NOTIFIKASI =====================
create table if not exists public.watchlists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  symbols    text[] not null default '{}',
  position   int  not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists watchlists_user_idx on public.watchlists(user_id, position);

create table if not exists public.alerts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  symbol          text not null,
  price           numeric not null check (price > 0),
  direction       text not null check (direction in ('above','below')),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  triggered_at    timestamptz,
  triggered_price numeric
);
create index if not exists alerts_user_idx   on public.alerts(user_id, created_at desc);
create index if not exists alerts_active_idx on public.alerts(symbol) where active;

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text not null default '',
  data       jsonb not null default '{}',
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

create table if not exists public.activity_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.users(id) on delete cascade,
  type       text not null,
  summary    text not null,
  data       jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists activity_user_idx on public.activity_log(user_id, created_at desc);

-- ===================== NOTE & JURNAL =====================
create table if not exists public.notes (
  user_id    uuid not null references public.users(id) on delete cascade,
  id         text not null,
  cat        text not null default 'ilmu' check (cat in ('ilmu','umum')),
  html       text not null default '' check (char_length(html) <= 500000),
  tags       text[] not null default '{}',
  pin        boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists notes_user_idx on public.notes(user_id, updated_at desc);

create table if not exists public.journal_trades (
  user_id    uuid not null references public.users(id) on delete cascade,
  id         text not null,
  date       date not null,
  time       text not null default '',
  time_end   text not null default '',
  sym        text not null default '',
  side       text not null default '' check (side in ('','buy','sell')),
  res        text not null default '' check (res in ('','profit','loss','impas')),
  amount     numeric not null default 0 check (amount >= 0),
  method     text not null default '',
  fields     jsonb not null default '[]',
  note       text not null default '',
  eval       text not null default '',
  imgs       text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists journal_date_idx on public.journal_trades(user_id, date);

create table if not exists public.journal_images (
  user_id    uuid not null references public.users(id) on delete cascade,
  id         text not null,                       -- id dari klien (trade.imgs[]); 004 mengubah instalasi lama
  path       text not null,
  mime       text not null,
  size       int  not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ===================== BERITA & KALENDER =====================
create table if not exists public.news (
  id           uuid primary key default gen_random_uuid(),
  url          text not null unique,
  title        text not null,
  summary      text not null default '',
  content      jsonb not null default '[]',
  source       text not null,
  category     text not null check (category in ('idx','us','cry','com','fx')),
  symbols      text[] not null default '{}',
  sentiment    text not null default 'neu' check (sentiment in ('pos','neg','neu')),
  published_at timestamptz not null,
  fetched_at   timestamptz not null default now()
);
create index if not exists news_cat_idx  on public.news(category, published_at desc);
create index if not exists news_time_idx on public.news(published_at desc);
create index if not exists news_sym_idx  on public.news using gin(symbols);

create table if not exists public.news_saved (
  user_id    uuid not null references public.users(id) on delete cascade,
  news_id    uuid not null references public.news(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, news_id)
);

create table if not exists public.calendar_events (
  id         text primary key,
  date       date not null,
  time       text not null default '',
  cat        text not null check (cat in ('idx','kom','fx')),
  type       text not null,
  title      text not null,
  sym        text not null default '',
  imp        smallint not null default 1 check (imp between 1 and 3),
  detail     text not null default '',
  prev       text not null default '',
  fc         text not null default '',
  act        text not null default '',
  aff        text[] not null default '{}',
  source     text not null default 'manual',
  updated_at timestamptz not null default now()
);
create index if not exists calendar_date_idx on public.calendar_events(date);

-- ===================== CHART (siap untuk gaya TradingView) =====================
-- layout bernama (tab, jendela, indikator terpasang, gambar); satu layout bernama 'default' dipakai PUT /api/chart/layout
create table if not exists public.chart_layouts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  name       text not null default 'default' check (char_length(name) between 1 and 60),
  data       jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);
-- gambar/drawing per simbol (muncul di semua timeframe, seperti TradingView)
create table if not exists public.chart_drawings (
  user_id    uuid not null references public.users(id) on delete cascade,
  symbol     text not null,
  data       jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  primary key (user_id, symbol)
);
-- template (kumpulan indikator, gaya gambar, gaya chart)
create table if not exists public.chart_templates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  kind       text not null check (kind in ('indicators','drawing','chart')),
  name       text not null check (char_length(name) between 1 and 60),
  data       jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind, name)
);
-- indikator custom (kode disimpan sebagai teks; DIJALANKAN HANYA di sandbox klien, tidak pernah di server)
create table if not exists public.custom_indicators (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 2000),
  language    text not null default 'js' check (language in ('js','pine')),
  source      text not null default '' check (char_length(source) <= 200000),
  inputs      jsonb not null default '[]',
  overlay     boolean not null default true,
  is_public   boolean not null default false,
  tags        text[] not null default '{}',
  version     int not null default 1,
  forked_from uuid references public.custom_indicators(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists custom_ind_user_idx   on public.custom_indicators(user_id, updated_at desc);
create index if not exists custom_ind_public_idx on public.custom_indicators(updated_at desc) where is_public;

-- ===================== state per app (sinkron antar perangkat) =====================
create table if not exists public.user_state (
  user_id    uuid not null references public.users(id) on delete cascade,
  key        text not null check (key ~ '^[a-z0-9._-]{1,40}$'),
  data       jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- ===================== updated_at otomatis =====================
do $$ declare t text; begin
  foreach t in array array['users','user_settings','watchlists','notes','journal_trades','calendar_events','chart_layouts','chart_drawings','chart_templates','custom_indicators','user_state'] loop
    execute format('drop trigger if exists trg_touch on public.%I', t);
    execute format('create trigger trg_touch before update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ===================== pembatas laju atomik =====================
create or replace function public.rate_hit(p_key text, p_limit int, p_window int)
returns table(allowed boolean, retry_after int) language plpgsql security definer set search_path = public as $$
declare r public.rate_limits%rowtype;
begin
  insert into public.rate_limits(key, count, reset_at) values (p_key, 1, now() + make_interval(secs => p_window))
  on conflict (key) do update set
    count    = case when public.rate_limits.reset_at <= now() then 1 else public.rate_limits.count + 1 end,
    reset_at = case when public.rate_limits.reset_at <= now() then now() + make_interval(secs => p_window) else public.rate_limits.reset_at end
  returning * into r;
  return query select r.count <= p_limit, greatest(0, ceil(extract(epoch from (r.reset_at - now())))::int);
end $$;
revoke all on function public.rate_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_hit(text, int, int) to service_role;

-- ===================== keamanan: tutup Data API untuk anon/authenticated =====================
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('revoke all on table public.%I from anon, authenticated', t.tablename);
  end loop;
end $$;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- ===================== penyimpanan gambar jurnal (privat) =====================
insert into storage.buckets (id, name, public) values ('journal', 'journal', false) on conflict (id) do nothing;
-- gambar background sendiri (satu per akun), juga privat
insert into storage.buckets (id, name, public) values ('backgrounds', 'backgrounds', false) on conflict (id) do nothing;
