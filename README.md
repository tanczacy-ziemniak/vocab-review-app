# Reword V3.3 — Four-Way Quiz + Flag Corrections

개인용 폴란드어 단어 복습 앱입니다. React + Vite + Supabase + Netlify 구성입니다.

## V3.3 핵심 변경

한 단어마다 아래 4개 문제를 랜덤 순서로 모두 풉니다.

1. **듣기** — `pl-PL` TTS를 듣고 비슷한 폴란드어 3개와 함께 4지선다
2. **폴 → 한** — 폴란드어를 보고 한국어 뜻 4지선다
3. **한 → 폴** — 한국어 뜻을 보고 폴란드어 직접 입력
4. **빈칸** — **한국어 예문을 먼저 보고**, 폴란드어 예문의 빈칸을 직접 입력

점수에 따른 복습 간격은 기존 V3.2와 같습니다.

- 4/4 → easy
- 3/4 → good
- 2/4 → hard
- 0~1/4 → again

## ⚑ Flag & Correct

문제를 푼 뒤 결과 영역의 **⚑ 버튼**을 누르면 해당 단어의 정답 데이터를 즉시 수정할 수 있습니다.

수정 가능한 항목:

- 폴란드어 기본 정답
- 한국어 뜻
- 폴란드어 예문
- 한국어 예문
- 추가로 인정할 폴란드어 정답(한 줄에 하나)
- 추가로 인정할 한국어 뜻(한 줄에 하나)

오답으로 판정됐지만 실제로는 맞는 답이었다면 **“이번 답도 정답으로 인정하고 현재 문제 점수를 복구”**를 체크하고 저장하세요.

- 한→폴 / 빈칸 / 듣기: 현재 답을 `accepted_answers`에 추가
- 폴→한: 현재 선택을 `accepted_meanings`에 추가
- 현재 문제의 오답 점수도 즉시 정답으로 복구
- 이후 복습에서는 추가 정답도 자동으로 정답 처리

따라서 동의어, 여러 가능한 번역, 활용형 등으로 인해 정답이 둘 이상인 경우도 처리할 수 있습니다.

## Core 3000 한국어 예문

Core 3000 데이터에는 다음 필드가 포함됩니다.

```text
word
meaning
example
example_ko
accepted_answers
accepted_meanings
```

3,000개 모두 `example_ko`가 있으며, 3,000개 폴란드어 예문 모두 표제어를 포함하도록 검사했습니다.

상위 고빈도 단어 일부 예문은 별도로 다듬었고, 긴 꼬리 어휘는 품사 기반 생성 예문/한국어 힌트를 사용합니다. 자동 생성 문장이 부자연스럽거나 의미가 애매하면 복습 중 ⚑로 바로 수정할 수 있습니다.

## 기존 Supabase를 쓰고 있다면 — 이 SQL을 먼저 1회 실행

V3.2 이하에서 이미 `words` 테이블을 만들었다면 배포 전에 Supabase **SQL Editor**에서 아래 파일을 실행하세요.

```text
supabase/migrations/v3_3_quiz_corrections.sql
```

내용은 새 컬럼 3개만 추가합니다.

```sql
alter table public.words
  add column if not exists example_ko text not null default '',
  add column if not exists accepted_answers text[] not null default '{}',
  add column if not exists accepted_meanings text[] not null default '{}';
```

기존 단어와 리뷰 기록은 삭제되거나 초기화되지 않습니다.

처음부터 새 Supabase 프로젝트를 만드는 경우에는 업데이트된 `supabase/schema.sql`만 실행하면 됩니다.

## Core 3000 설치

아직 Core 3000을 넣지 않았다면 가장 간단합니다.

1. 위 migration 실행
2. V3.3 배포
3. 로그인
4. `Core 3000` 메뉴
5. 하루 새 단어 5 / 10 / 15 / 20 선택
6. `Core 3000 추가`

CSV import는 필요하지 않습니다. `example_ko`와 복수 정답 필드까지 앱이 Supabase `words` 테이블에 자동 저장합니다.

## 환경변수

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_KEY
```

## 로컬 실행

```bash
npm install
npm run dev
```

## Netlify 업데이트

기존 GitHub repository 파일을 이 버전으로 교체한 뒤:

```bash
git add .
git commit -m "Upgrade Reword to V3.3 flag corrections"
git push
```

기존 Netlify 사이트가 자동 재배포됩니다.

## 모바일

기존 iPhone/Safari 자동 줌 수정도 유지합니다.

- form control 16px 이상
- 자동 focus 없음
- 메뉴 이동 시 활성 input blur
- pinch zoom은 차단하지 않음
