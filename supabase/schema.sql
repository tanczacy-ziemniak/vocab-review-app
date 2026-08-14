-- Fresh install schema for Reword V3.4. Run once in Supabase > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  word text not null,
  meaning text not null,
  example text not null default '',
  example_ko text not null default '',
  accepted_answers text[] not null default '{}',
  accepted_meanings text[] not null default '{}',
  note text not null default '',
  tags text[] not null default '{}',
  next_review_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  interval_days integer not null default 0,
  repetitions integer not null default 0,
  review_count integer not null default 0,
  difficulty_grade text not null default 'learning',
  recent_results boolean[] not null default '{}',
  recent_quiz_modes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  word_id uuid not null references public.words(id) on delete cascade,
  grade text not null check (grade in ('learning', 'again', 'hard', 'good', 'easy')),
  is_correct boolean,
  quiz_mode text,
  previous_interval integer not null default 0,
  next_interval integer not null default 0,
  reviewed_at timestamptz not null default now()
);

create index if not exists words_user_next_review_idx on public.words(user_id, next_review_at);
create index if not exists reviews_user_reviewed_idx on public.reviews(user_id, reviewed_at desc);
create index if not exists reviews_word_reviewed_idx on public.reviews(word_id, reviewed_at desc);

alter table public.words enable row level security;
alter table public.reviews enable row level security;

drop policy if exists "Users can read own words" on public.words;
create policy "Users can read own words" on public.words for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own words" on public.words;
create policy "Users can insert own words" on public.words for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own words" on public.words;
create policy "Users can update own words" on public.words for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own words" on public.words;
create policy "Users can delete own words" on public.words for delete using (auth.uid() = user_id);

drop policy if exists "Users can read own reviews" on public.reviews;
create policy "Users can read own reviews" on public.reviews for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own reviews" on public.reviews;
create policy "Users can insert own reviews" on public.reviews for insert with check (auth.uid() = user_id);
