# Reword V3.4 — Single Random Review + Rolling Difficulty

개인용 폴란드어 단어 복습 앱입니다. React + Vite + Supabase + Netlify 구성입니다.

## V3.4 핵심 변경

한 단어가 복습에 등장할 때 **문제는 딱 1개만** 냅니다.

가능한 유형은 기존과 동일합니다.

1. **듣기** — `pl-PL` TTS를 듣고 폴란드어 4지선다
2. **폴 → 한** — 폴란드어를 보고 한국어 뜻 4지선다
3. **한 → 폴** — 한국어 뜻을 보고 폴란드어 직접 입력
4. **빈칸** — 한국어 예문 + 폴란드어 빈칸 문장을 보고 직접 입력

같은 단어의 네 유형을 같은 세션에서 연속으로 내지 않습니다. 최근에 덜 나온 유형을 우선한 뒤 랜덤으로 하나를 골라, 장기적으로 네 유형이 골고루 나오게 합니다.

## 최근 4회 슬라이딩 난이도

새 단어는 서로 다른 복습 시점의 결과가 4개 쌓일 때까지 1일 간격으로 다시 나옵니다.

- 최근 4회 중 4개 정답 → **쉬움**
- 최근 4회 중 3개 정답 → **알아요**
- 최근 4회 중 2개 정답 → **어려움**
- 최근 4회 중 0~1개 정답 → **다시**

5번째부터는 항상 가장 오래된 결과 하나를 버리고 최신 결과를 넣습니다.

예:

```text
O O X X  → 어려움
O X X O  → 어려움
X X O O  → 어려움
X O O O  → 알아요
O O O O  → 쉬움
```

따라서 예전에 어려웠던 단어도 최근에 잘하면 난이도가 내려가고, 반대로 쉬웠던 단어도 최근에 틀리면 다시 어려워집니다.

복습 간격은 다음 구간에서 움직입니다.

- 측정 중: 1일
- 다시: 1일
- 어려움: 2~4일
- 알아요: 4~14일
- 쉬움: 7~180일

같은 쉬움 상태를 계속 유지하면 간격이 점차 길어지고, 최근 4회 성적이 나빠지면 더 짧은 난이도 구간으로 즉시 내려옵니다.

## ⚑ Flag & Correct

V3.3 기능을 그대로 유지합니다.

- 폴란드어 정답 수정
- 한국어 뜻 수정
- 폴란드어/한국어 예문 수정
- 복수 정답 등록
- 잘못된 오답을 현재 복습에서 정답으로 복구

Flag에서 현재 답을 정답으로 복구한 뒤 `다음 단어`를 누르면 **복구된 정답 결과가 최근 4회 기록에 저장**됩니다.

## 모바일 `다음 단어` 버튼 수정

V3.3 모바일 CSS에서 flag 버튼과 다음 버튼이 모두 `width: 100%` 영향을 받아 다음 버튼이 카드 밖으로 넘칠 수 있었습니다.

V3.4에서는 모바일 결과 영역을 다음처럼 고정했습니다.

```text
[ ⚑ ] [          다음 단어          ]
```

두 버튼이 카드 너비 안에 항상 들어옵니다.

## 기존 V3.3 Supabase에서 업그레이드

Supabase > **SQL Editor**에서 아래 파일을 한 번 실행하세요.

```text
supabase/migrations/v3_4_single_review_window.sql
```

추가되는 정보:

```text
words.difficulty_grade
words.recent_results
words.recent_quiz_modes
reviews.is_correct
reviews.quiz_mode
```

V3.3에서 같은 세션에 4문제를 연속으로 풀었던 기록은 새 `recent_results`에 복사하지 않습니다. 새 방식의 독립적인 한 문제 복습부터 다시 4회를 모읍니다.

기존 단어, 뜻, 예문, Flag 수정 내용, Core 3000 데이터와 기존 `next_review_at`은 삭제하거나 초기화하지 않습니다.

처음부터 새 Supabase 프로젝트를 만드는 경우에는 최신 `supabase/schema.sql`을 실행하면 됩니다.

## Core 3000

CSV import는 필요 없습니다.

`Core 3000` 메뉴에서 하루 새 단어 수를 선택하고 추가하면 앱이 Supabase에 자동 저장합니다.

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

```bash
git add .
git commit -m "Upgrade Reword to V3.4 rolling review"
git push
```

Netlify가 기존 사이트를 자동 재배포합니다.
