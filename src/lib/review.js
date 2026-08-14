export const REVIEW_GRADES = {
  learning: { label: '측정 중', score: -1 },
  again: { label: '다시', score: 0 },
  hard: { label: '어려움', score: 1 },
  good: { label: '알아요', score: 2 },
  easy: { label: '쉬움', score: 3 },
}

const BASE_INTERVAL = { again: 1, hard: 2, good: 4, easy: 7 }
const MAX_INTERVAL = { again: 1, hard: 4, good: 14, easy: 180 }
const GRADE_RANK = { again: 0, hard: 1, good: 2, easy: 3 }

const addDays = (date, days) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  next.setHours(0, 0, 0, 0)
  return next.toISOString()
}

const boolHistory = (items) => Array.isArray(items)
  ? items.filter((item) => typeof item === 'boolean').slice(-4)
  : []

/**
 * 난이도는 항상 최근 네 번의 '서로 다른 날짜에 걸친 한 문제 복습' 결과만 사용한다.
 * 4회 미만이면 아직 난이도를 확정하지 않고 매일 다시 노출한다.
 */
export function gradeFromRecentResults(items) {
  const recent = boolHistory(items)
  if (recent.length < 4) return 'learning'
  const correct = recent.filter(Boolean).length
  if (correct === 4) return 'easy'
  if (correct === 3) return 'good'
  if (correct === 2) return 'hard'
  return 'again'
}

export function recentResultSummary(items) {
  const recent = boolHistory(items)
  return {
    count: recent.length,
    correct: recent.filter(Boolean).length,
    grade: gradeFromRecentResults(recent),
  }
}

/**
 * 첫 네 번은 1일 간격으로 측정한다.
 * 그 이후에는 최근 4회로 난이도를 재평가하고 난이도 구간에 맞춰 간격을 조절한다.
 * - 다시: 1일
 * - 어려움: 2~4일
 * - 알아요: 4~14일
 * - 쉬움: 7~180일
 * 같은 난이도를 계속 유지하면 쉬운 단어는 점차 길어지고,
 * 최근 성적이 나빠져 난이도가 올라가면 즉시 더 짧은 구간으로 내려온다.
 */
export function nextSchedule(word, recentResults) {
  const now = new Date()
  const recent = boolHistory(recentResults)
  const grade = gradeFromRecentResults(recent)
  const repetitions = Number(word.repetitions || 0)
  const currentInterval = Math.max(1, Number(word.interval_days || 1))
  const previousGrade = ['again', 'hard', 'good', 'easy'].includes(word.difficulty_grade)
    ? word.difficulty_grade
    : 'learning'

  let interval = 1
  let nextRepetitions = repetitions

  if (grade === 'learning') {
    interval = 1
    nextRepetitions = 0
  } else if (grade === 'again') {
    interval = 1
    nextRepetitions = 0
  } else if (previousGrade === 'learning') {
    interval = BASE_INTERVAL[grade]
    nextRepetitions = grade === 'hard' ? 0 : 1
  } else {
    const currentRank = GRADE_RANK[grade]
    const previousRank = GRADE_RANK[previousGrade]
    const base = BASE_INTERVAL[grade]
    const cap = MAX_INTERVAL[grade]

    if (currentRank < previousRank) {
      // 최근 성적이 나빠졌다면 이전 간격을 절반 수준으로 줄이고 새 난이도의 상한도 적용한다.
      interval = Math.min(cap, Math.max(base, Math.round(currentInterval * 0.5)))
    } else if (currentRank > previousRank) {
      // 최근 성적이 좋아졌다면 새 난이도 구간으로 이동하면서 조금씩 확장한다.
      interval = Math.min(cap, Math.max(base, Math.round(currentInterval * 1.25)))
    } else if (grade === 'easy') {
      interval = Math.min(cap, Math.max(base, Math.round(currentInterval * 1.8)))
    } else if (grade === 'good') {
      interval = Math.min(cap, Math.max(base, Math.round(currentInterval * 1.25)))
    } else {
      // hard는 오래 유지돼도 너무 멀어지지 않게 2~4일에 머문다.
      interval = Math.min(cap, Math.max(base, currentInterval))
    }

    if (grade === 'easy' || grade === 'good') nextRepetitions = repetitions + 1
    else nextRepetitions = repetitions
  }

  return {
    grade,
    difficulty_grade: grade,
    last_reviewed_at: now.toISOString(),
    next_review_at: addDays(now, interval),
    interval_days: interval,
    repetitions: nextRepetitions,
    review_count: Number(word.review_count || 0) + 1,
  }
}

export function isDue(word) {
  if (!word.next_review_at) return true
  return new Date(word.next_review_at).getTime() <= Date.now()
}

export function localDateKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function computeStreak(reviews) {
  const days = new Set(reviews.map((r) => localDateKey(new Date(r.reviewed_at))))
  let streak = 0
  const cursor = new Date()
  cursor.setHours(12, 0, 0, 0)

  if (!days.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1)

  while (days.has(localDateKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}
