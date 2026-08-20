-- Reword V3.4
-- Run once in Supabase > SQL Editor before deploying V3.4.
-- Existing V3.3 review history is intentionally NOT copied into recent_results,
-- because those records were produced by the old same-session 4-question flow.

alter table public.words
  add column if not exists difficulty_grade text not null default 'learning',
  add column if not exists recent_results boolean[] not null default '{}',
  add column if not exists recent_quiz_modes text[] not null default '{}';

alter table public.reviews
  add column if not exists is_correct boolean,
  add column if not exists quiz_mode text;

-- V3.4 uses 'learning' while a word has fewer than four independent review results.
alter table public.reviews drop constraint if exists reviews_grade_check;
alter table public.reviews
  add constraint reviews_grade_check
  check (grade in ('learning', 'again', 'hard', 'good', 'easy'));

-- Existing V3.3 rows receive the new column defaults automatically.
-- We deliberately preserve next_review_at, interval_days and vocabulary data.
-- When each word next becomes due, V3.4 starts collecting its new independent
-- single-question history; after that first V3.4 review it will appear again the next day.
