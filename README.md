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
