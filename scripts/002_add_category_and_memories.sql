-- Add category column to notes (idempotent)
alter table if exists public.notes
  add column if not exists category text not null default '';

create index if not exists notes_device_category_idx on public.notes (device_id, category);

-- Memories table for "things to remember"
create extension if not exists "pgcrypto";

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  content text not null,
  topic text not null default '',
  importance int not null default 3, -- 1-5
  source_note_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memories_importance_chk check (importance between 1 and 5)
);

-- Deduplicate same memory per device
create unique index if not exists memories_device_content_uniq
  on public.memories (device_id, md5(content));

create index if not exists memories_device_idx on public.memories (device_id);

-- Trigger to keep updated_at current
create or replace function public.memories_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_memories_updated_at on public.memories;
create trigger trg_memories_updated_at
before update on public.memories
for each row
execute function public.memories_set_updated_at();
