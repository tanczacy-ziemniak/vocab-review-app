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

  if (grade === 'learning' || grade === 'again') {
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
      interval = Math.min(cap, Math.max(base, Math.round(currentInterval * 0.5)))
    } else if (currentRank > previousRank) {
      interval = Math.min(cap, Math.max(base, Math.round(currentInterval * 1.25)))
    } else if (grade === 'easy') {
      interval = Math.min(cap, Math.max(base, Math.round(currentInterval * 1.8)))
    } else if (grade === 'good') {
      interval = Math.min(cap, Math.max(base, Math.round(currentInterval * 1.25)))
    } else {
      interval = Math.min(cap, Math.max(base, currentInterval))
    }

    if (grade === 'easy' || grade === 'good') nextRepetitions = repetitions + 1
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

/**
 * 각 날짜의 실제 목표(goal_target)를 기준으로 streak를 계산한다.
 * 오늘 아직 목표를 못 채웠다면 어제까지의 streak는 유지하지만 오늘 몫은 늘지 않는다.
 * V3.5 이전 기록은 목표 정보가 없으므로 1문제를 완료한 날로 간주한다.
 */
export function computeGoalStreak(reviews, currentGoal = 1) {
  const ordered = [...(reviews || [])]
    .filter((r) => r?.reviewed_at)
    .sort((a, b) => new Date(a.reviewed_at) - new Date(b.reviewed_at))

  const days = new Map()
  for (const review of ordered) {
    const key = localDateKey(new Date(review.reviewed_at))
    const current = days.get(key) || { count: 0, goal: 1 }
    current.count += 1
    if (Number(review.goal_target) > 0) current.goal = Number(review.goal_target)
    days.set(key, current)
  }

  const cursor = new Date()
  cursor.setHours(12, 0, 0, 0)
  const todayKey = localDateKey(cursor)
  const today = days.get(todayKey) || { count: 0, goal: currentGoal }

  let streak = 0
  if (today.count >= Math.max(1, today.goal || currentGoal)) {
    streak = 1
  } else {
    cursor.setDate(cursor.getDate() - 1)
  }

  while (true) {
    const key = localDateKey(cursor)
    if (key === todayKey && streak === 1) {
      cursor.setDate(cursor.getDate() - 1)
      continue
    }
    const day = days.get(key)
    if (!day || day.count < Math.max(1, day.goal || 1)) break
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }

  return streak
}

export function levelFromXp(xp = 0) {
  const safeXp = Math.max(0, Number(xp) || 0)
  const level = Math.floor(Math.sqrt(safeXp / 100)) + 1
  const currentFloor = 100 * Math.pow(level - 1, 2)
  const nextFloor = 100 * Math.pow(level, 2)
  return {
    level,
    xp: safeXp,
    currentFloor,
    nextFloor,
    intoLevel: safeXp - currentFloor,
    needed: nextFloor - currentFloor,
    progress: nextFloor === currentFloor ? 100 : Math.min(100, Math.round(((safeXp - currentFloor) / (nextFloor - currentFloor)) * 100)),
  }
}
