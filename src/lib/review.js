export const REVIEW_GRADES = {
  again: { label: '다시', score: 0 },
  hard: { label: '어려움', score: 1 },
  good: { label: '알아요', score: 2 },
  easy: { label: '쉬움', score: 3 },
}

const addDays = (date, days) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  next.setHours(0, 0, 0, 0)
  return next.toISOString()
}

export function gradeFromQuizScore(correctCount) {
  if (correctCount >= 4) return 'easy'
  if (correctCount === 3) return 'good'
  if (correctCount === 2) return 'hard'
  return 'again'
}

export function nextSchedule(word, grade) {
  const now = new Date()
  const repetitions = Number(word.repetitions || 0)
  const currentInterval = Math.max(0, Number(word.interval_days || 0))
  let interval = 1
  let nextRepetitions = repetitions

  // Intervals are strictly ordered: again < hard < good < easy.
  // The quiz maps 0-1/4, 2/4, 3/4, 4/4 to those four grades.
  if (grade === 'again') {
    interval = 1
    nextRepetitions = 0
  } else if (grade === 'hard') {
    interval = currentInterval <= 1 ? 2 : Math.max(2, Math.round(currentInterval * 1.4))
    nextRepetitions = repetitions
  } else if (grade === 'good') {
    interval = currentInterval <= 1 ? 4 : Math.max(4, Math.round(currentInterval * 2.2))
    nextRepetitions = repetitions + 1
  } else {
    interval = currentInterval <= 1 ? 7 : Math.max(7, Math.round(currentInterval * 3.2))
    nextRepetitions = repetitions + 1
  }

  return {
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

  if (!days.has(localDateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1)
  }

  while (days.has(localDateKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}
