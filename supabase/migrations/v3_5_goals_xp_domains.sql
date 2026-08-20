-- Reword V3.5
-- Run once in Supabase > SQL Editor before deploying V3.5.
-- Adds synced daily-goal / XP settings and removes the old Core 3000 daily-release lock.

alter table public.reviews
  add column if not exists goal_target integer,
  add column if not exists xp_earned integer not null default 0;

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_goal integer not null default 5 check (daily_goal in (1, 5, 10, 20)),
  xp bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

drop policy if exists "Users can read own preferences" on public.user_preferences;
create policy "Users can read own preferences"
  on public.user_preferences for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own preferences" on public.user_preferences;
create policy "Users can insert own preferences"
  on public.user_preferences for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own preferences" on public.user_preferences;
create policy "Users can update own preferences"
  on public.user_preferences for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- V3.4 used future next_review_at dates to release only a few new Core words per day.
-- V3.5 removes that limit. Only words never reviewed are unlocked; already learned words keep SRS schedules.
update public.words
set next_review_at = now(), updated_at = now()
where 'core3000' = any(tags)
  and coalesce(review_count, 0) = 0
  and next_review_at > now();
