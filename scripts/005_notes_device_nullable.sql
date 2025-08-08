-- Make device_id nullable because we now prefer user_id for sync
alter table if exists public.notes
  alter column device_id drop not null;
