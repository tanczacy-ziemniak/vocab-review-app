-- Reword V3.3 upgrade for an existing database.
-- Run once in Supabase > SQL Editor before deploying V3.3.

alter table public.words
  add column if not exists example_ko text not null default '',
  add column if not exists accepted_answers text[] not null default '{}',
  add column if not exists accepted_meanings text[] not null default '{}';
