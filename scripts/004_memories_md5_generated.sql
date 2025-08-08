-- Ensure md5() is available (usually available; pgcrypto also provides digest())
create extension if not exists "pgcrypto";

-- Add a generated column for content MD5 so we can use it in ON CONFLICT.
alter table if exists public.memories
  add column if not exists content_md5 text
  generated always as (md5(content)) stored;

-- Replace the old expression-based unique index with a column-based unique index.
drop index if exists memories_device_content_uniq;

create unique index if not exists memories_device_content_md5_uniq
  on public.memories (device_id, content_md5);

-- Optional supporting index for quick lookups by device
create index if not exists memories_device_content_md5_idx
  on public.memories (device_id, content_md5);
