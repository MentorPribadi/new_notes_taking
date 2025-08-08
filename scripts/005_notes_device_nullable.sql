-- Allow device_id to be NULL so user_id-based sync upserts don't fail
alter table if exists public.notes
  alter column device_id drop not null;
