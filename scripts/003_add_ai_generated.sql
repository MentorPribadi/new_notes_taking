alter table if exists public.notes
  add column if not exists ai_generated boolean not null default false;

create index if not exists notes_device_ai_idx on public.notes (device_id, ai_generated);
