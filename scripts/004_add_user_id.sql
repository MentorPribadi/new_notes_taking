-- Add user_id to notes so we can associate notes with authenticated users
alter table public.notes
add column if not exists user_id uuid;

create index if not exists notes_user_id_idx on public.notes (user_id);
create index if not exists notes_user_id_updated_at_idx on public.notes (user_id, updated_at desc);
