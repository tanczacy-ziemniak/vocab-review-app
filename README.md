# Reword V3.1 — Polish Core 3000 (한국어 뜻 개선판)

이 빌드는 V3 Core 3000 기능에 개선된 한국어 뜻 데이터 3,000개를 앱 내부에 직접 포함한 버전입니다.

- 3,000개 고유 폴란드어 표제어
- 개선된 한국어 뜻 내장
- Core 3000 전용 화면
- 하루 새 단어 5 / 10 / 15 / 20개 선택
- 기존 단어 자동 중복 제외
- 기존 Supabase 스키마와 호환

# Reword

Netlify에 바로 올릴 수 있는 개인 단어 복습 웹앱입니다.

## 포함 기능

- 이메일/비밀번호 로그인 (Supabase 설정 시)
- 단어 추가 / 수정 / 삭제
- 태그와 검색
- 오늘 복습할 단어 자동 선별
- `몰라요 / 어려움 / 알아요 / 쉬움` 4단계 spaced repetition
- 복습 기록 / streak / 기억 안정화 지표
- 여러 단어 붙여넣기 import
- 반응형 모바일 UI
- 다크모드
- Supabase가 없을 때 localStorage 기반 Local Mode

## 1. 로컬 실행

```bash
npm install
npm run dev
```

Supabase 환경변수가 없으면 Local Mode로 바로 실행됩니다. 데이터는 현재 브라우저의 localStorage에만 저장됩니다.

## 2. Supabase 연결

1. Supabase에서 새 프로젝트를 만듭니다.
2. `supabase/schema.sql` 전체를 SQL Editor에서 실행합니다.
3. `.env.example`을 `.env`로 복사합니다.
4. Supabase Project Settings > API의 Project URL과 anon/public key를 넣습니다.

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

5. 다시 `npm run dev`를 실행합니다.

가입 후 이메일 인증을 원하지 않으면 Supabase Authentication 설정에서 Email confirmation을 조정할 수 있습니다.

## 3. Netlify 배포

### GitHub를 사용할 때

1. 이 폴더를 GitHub repository에 push합니다.
2. Netlify > Add new site > Import an existing project에서 repository를 선택합니다.
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Site configuration > Environment variables에 아래 2개를 추가합니다.
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Deploy합니다.

`netlify.toml`이 포함되어 있으므로 일반적인 SPA 배포 설정은 자동으로 잡힙니다.

### Supabase 없이 먼저 테스트

환경변수를 넣지 않고 배포하면 Local Mode로 동작합니다. 로그인 없이 바로 단어를 저장해 볼 수 있지만, 기기 간 동기화는 되지 않습니다.

## 4. 현재 복습 알고리즘

가벼운 MVP용 spaced repetition입니다.

- 몰라요: 1일 후, 학습 단계 초기화
- 어려움: 기존 interval × 약 1.4
- 알아요: 1일 → 3일 → 이후 × 약 2.2
- 쉬움: 3일 → 7일 → 이후 × 약 3.2

나중에 FSRS로 교체하기 쉽도록 `src/lib/review.js`에 로직을 분리했습니다.

## 5. 다음 추천 확장

- FSRS 알고리즘
- TTS 발음 듣기
- 빈칸 문제 / 한국어→외국어 / 외국어→한국어 랜덤 출제
- CSV 파일 업로드
- AI 기반 뜻/예문/활용 자동 생성
- PWA 설치 및 오프라인 캐시
- 학습 목표(하루 20개 등)

## V2 changes

- Fixed iPhone/Safari focus zoom by keeping form controls at 16px+, removing automatic input focus, and blurring focused controls during tab navigation.
- Added review modes: Mixed, Polish→Korean, Korean→Polish, cloze, and listening.
- Listening mode uses the browser Speech Synthesis API with `pl-PL` pronunciation.
- Login UI is now sign-in only for a private single-user deployment. **Also disable new sign-ups in Supabase Auth settings**; hiding the button alone is not an access-control measure.
- No database migration is required from V1 to V2.

## V3 · Polish Core 3000

- `Core 3000` 메뉴에서 빈도 기반 Polish Core 3000을 한 번에 설치할 수 있습니다.
- 설치 전에 하루 새 단어 수를 `5 / 10 / 15 / 20` 중 선택합니다.
- 3,000개를 모두 즉시 due로 만들지 않고, 선택한 속도에 맞춰 `next_review_at`을 앞으로 분산합니다.
- 이미 단어장에 동일한 폴란드어 표제어가 있으면 자동으로 건너뜁니다.
- 설치가 중간에 끊겨도 다시 누르면 남은 단어만 설치합니다.
- 기존 V2 Supabase 스키마를 그대로 사용하므로 `schema.sql`을 다시 실행할 필요가 없습니다.
- 데이터 출처 및 한국어 뜻 생성 방식은 `DATA_SOURCES.md`를 참고하세요.
