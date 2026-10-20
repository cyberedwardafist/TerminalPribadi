-- Jalankan sekali di SQL Editor bila API membalas 'permission denied' / 42501, atau 503 "Database belum siap" padahal 001 sudah dijalankan. Aman diulang.
-- ===================== hak akses service_role (backend) =====================
-- Project Supabase baru tidak lagi memberi hak otomatis pada tabel buatan SQL Editor; tanpa ini PostgREST membalas 42501 "permission denied" untuk service_role.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
notify pgrst, 'reload schema';
