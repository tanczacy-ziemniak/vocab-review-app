import { useEffect, useMemo, useState } from 'react'
import { supabase, isSupabaseConfigured } from './lib/supabase'
import { computeGoalStreak, isDue, levelFromXp, localDateKey, nextSchedule } from './lib/review'
import AuthScreen from './components/AuthScreen'
import WordForm from './components/WordForm'
import ReviewCard from './components/ReviewCard'
import ImportBox from './components/ImportBox'
import core3000 from './data/polish-core-3000.json'

const LOCAL_WORDS = 'reword.words.v1'
const LOCAL_REVIEWS = 'reword.reviews.v1'
const LOCAL_PREFS = 'reword.preferences.v3_5'
const DAILY_GOAL_CHOICES = [1, 5, 10, 20]
const normalizeWord = (value = '') => value.trim().toLocaleLowerCase('pl-PL')
const CORE_DOMAIN_ORDER = [
  '기본 표현', '사람·관계', '집·일상', '음식·쇼핑', '이동·장소', '일·학업', '기술·미디어',
  '건강·몸', '감정·생각', '여가·문화', '시간·수량', '사회·행정', '자연·환경', '행동·상태', '사물·기타',
]
const coreEntryMap = new Map(core3000.map((entry) => [normalizeWord(entry.word), entry]))
const LEGACY_EXAMPLE_KO_MARKERS = ['뜻으로 사용돼요', '뜻의 단어가 사용돼요', '원본 빈도 자료에는', '문장에는 “']
const isLegacyExampleKo = (value = '') => LEGACY_EXAMPLE_KO_MARKERS.some((marker) => String(value).includes(marker))
const enrichCoreWord = (word) => {
  if (!(word?.tags || []).includes('core3000')) return word
  const entry = coreEntryMap.get(normalizeWord(word?.word || ''))
  if (!entry) return word

  const shouldRefreshKorean = !String(word.example_ko || '').trim() || isLegacyExampleKo(word.example_ko)
  return {
    ...word,
    example: String(word.example || '').trim() ? word.example : (entry.example || ''),
    example_ko: shouldRefreshKorean ? (entry.example_ko || '') : word.example_ko,
  }
}

const readLocal = (key) => {
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}

const readLocalPrefs = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_PREFS) || '{}')
    return { dailyGoal: Number(parsed.dailyGoal || 5), xp: Number(parsed.xp || 0) }
  } catch {
    return { dailyGoal: 5, xp: 0 }
  }
}

const sortWords = (items) => [...items].sort((a, b) => new Date(a.next_review_at || 0) - new Date(b.next_review_at || 0))
const seededIndex = (seed, length, salt = 0) => length ? Math.abs(Math.floor((Number(seed) + salt) * 1000003)) % length : 0

const domainOfWord = (word) => {
  const domainTag = (word?.tags || []).find((tag) => String(tag).startsWith('분야:'))
  if (domainTag) return domainTag.replace('분야:', '')
  return coreEntryMap.get(normalizeWord(word?.word))?.domain || '내 단어장'
}

function App() {
  const localPrefs = readLocalPrefs()
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [words, setWords] = useState([])
  const [reviews, setReviews] = useState([])
  const [tab, setTab] = useState('today')
  const [search, setSearch] = useState('')
  const [tag, setTag] = useState('전체')
  const [editing, setEditing] = useState(null)
  const [toast, setToast] = useState('')
  const [dark, setDark] = useState(() => localStorage.getItem('reword.theme') === 'dark')
  const [coreInstalling, setCoreInstalling] = useState(false)
  const [coreInstallProgress, setCoreInstallProgress] = useState(0)
  const [dailyGoal, setDailyGoal] = useState(localPrefs.dailyGoal)
  const [xp, setXp] = useState(localPrefs.xp)
  const [reviewScope, setReviewScope] = useState('random')
  const [reviewSeed, setReviewSeed] = useState(() => Math.random())

  const notify = (message) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2400)
  }

  const goToTab = (nextTab) => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    setTab(nextTab)
  }

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.setItem('reword.theme', dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => {
    if (!isSupabaseConfigured) localStorage.setItem(LOCAL_PREFS, JSON.stringify({ dailyGoal, xp }))
  }, [dailyGoal, xp])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      const now = new Date().toISOString()
      const localWords = readLocal(LOCAL_WORDS).map((word) => {
        const isLockedCore = (word.tags || []).includes('core3000') && Number(word.review_count || 0) === 0 && new Date(word.next_review_at || 0) > new Date()
        const unlocked = isLockedCore ? { ...word, next_review_at: now } : word
        return enrichCoreWord(unlocked)
      })
      const localReviews = readLocal(LOCAL_REVIEWS)
      setWords(sortWords(localWords))
      setReviews(localReviews)
      localStorage.setItem(LOCAL_WORDS, JSON.stringify(localWords))
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (isSupabaseConfigured && session?.user) loadRemote()
  }, [session?.user?.id])

  const loadAllReviews = async () => {
    const rows = []
    const pageSize = 1000
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .order('reviewed_at', { ascending: false })
        .range(from, from + pageSize - 1)
      if (error) throw error
      rows.push(...(data || []))
      if (!data || data.length < pageSize) break
    }
    return rows
  }

  const unlockFutureCoreRows = async (wordRows) => {
    const now = new Date()
    const targets = wordRows.filter((word) =>
      (word.tags || []).includes('core3000') &&
      Number(word.review_count || 0) === 0 &&
      new Date(word.next_review_at || 0) > now,
    )
    if (!targets.length) return wordRows

    const nowIso = now.toISOString()
    for (let i = 0; i < targets.length; i += 200) {
      const ids = targets.slice(i, i + 200).map((word) => word.id)
      const { error } = await supabase.from('words').update({ next_review_at: nowIso }).in('id', ids)
      if (error) throw error
    }
    const targetIds = new Set(targets.map((word) => word.id))
    return wordRows.map((word) => targetIds.has(word.id) ? { ...word, next_review_at: nowIso } : word)
  }

  const loadRemote = async () => {
    try {
      const [{ data: wordRows, error: wordError }, reviewRows, { data: prefs, error: prefError }] = await Promise.all([
        supabase.from('words').select('*').order('created_at', { ascending: false }),
        loadAllReviews(),
        supabase.from('user_preferences').select('*').eq('user_id', session.user.id).maybeSingle(),
      ])
      if (wordError) throw wordError
      if (prefError) throw prefError

      const unlockedWords = (await unlockFutureCoreRows(wordRows || [])).map(enrichCoreWord)
      let nextPrefs = prefs
      if (!nextPrefs) {
        const seedXp = unlockedWords.reduce((sum, word) => sum + Number(word.review_count || 0) * 8, 0)
        const { data, error } = await supabase
          .from('user_preferences')
          .insert({ user_id: session.user.id, daily_goal: 5, xp: seedXp })
          .select()
          .single()
        if (error) throw error
        nextPrefs = data
      }

      setWords(sortWords(unlockedWords))
      setReviews(reviewRows || [])
      setDailyGoal(Number(nextPrefs.daily_goal || 5))
      setXp(Number(nextPrefs.xp || 0))
    } catch (error) {
      notify(error?.message || '데이터를 불러오지 못했어요.')
    }
  }

  const persistLocal = (nextWords, nextReviews = reviews) => {
    setWords(sortWords(nextWords))
    setReviews(nextReviews)
    localStorage.setItem(LOCAL_WORDS, JSON.stringify(nextWords))
    localStorage.setItem(LOCAL_REVIEWS, JSON.stringify(nextReviews))
  }

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) notify(error.message)
  }

  const saveDailyGoal = async (value) => {
    const nextGoal = Number(value)
    setDailyGoal(nextGoal)
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('user_preferences')
        .upsert({ user_id: session.user.id, daily_goal: nextGoal }, { onConflict: 'user_id' })
      if (error) return notify(error.message)
    }
    notify(`하루 목표를 ${nextGoal}문제로 설정했어요.`)
  }

  const saveWord = async (form) => {
    const now = new Date().toISOString()
    if (editing) {
      const payload = { word: form.word, meaning: form.meaning, example: form.example, note: form.note, tags: form.tags, updated_at: now }
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.from('words').update(payload).eq('id', editing.id).select().single()
        if (error) return notify(error.message)
        setWords((prev) => sortWords(prev.map((x) => x.id === editing.id ? data : x)))
      } else {
        persistLocal(words.map((x) => x.id === editing.id ? { ...x, ...payload } : x))
      }
      setEditing(null)
      notify('수정했어요.')
      return
    }

    const payload = {
      ...form,
      next_review_at: now,
      interval_days: 0,
      repetitions: 0,
      review_count: 0,
      difficulty_grade: 'learning',
      recent_results: [],
      recent_quiz_modes: [],
    }

    if (isSupabaseConfigured) {
      const { data, error } = await supabase.from('words').insert({ ...payload, user_id: session.user.id }).select().single()
      if (error) return notify(error.message)
      setWords((prev) => sortWords([data, ...prev]))
    } else {
      const local = { ...payload, id: crypto.randomUUID(), created_at: now, updated_at: now }
      persistLocal([local, ...words])
    }
    notify('단어를 추가했어요.')
  }

  const importWords = async (items) => {
    if (!items.length) return notify('가져올 수 있는 단어가 없어요.')
    const now = new Date().toISOString()
    const payloads = items.map((x) => ({
      ...x,
      example: '', example_ko: '', accepted_answers: [], accepted_meanings: [], note: '', tags: [],
      next_review_at: now, interval_days: 0, repetitions: 0, review_count: 0,
      difficulty_grade: 'learning', recent_results: [], recent_quiz_modes: [],
    }))

    if (isSupabaseConfigured) {
      const { data, error } = await supabase.from('words').insert(payloads.map((x) => ({ ...x, user_id: session.user.id }))).select()
      if (error) return notify(error.message)
      setWords((prev) => sortWords([...(data || []), ...prev]))
    } else {
      const locals = payloads.map((x) => ({ ...x, id: crypto.randomUUID(), created_at: now, updated_at: now }))
      persistLocal([...locals, ...words])
    }
    notify(`${items.length}개 단어를 추가했어요.`)
  }

  const installCore3000 = async () => {
    if (coreInstalling) return
    const existing = new Set(words.map((w) => normalizeWord(w.word)))
    const missing = core3000.filter((entry) => !existing.has(normalizeWord(entry.word)))
    if (!missing.length) return notify('Core 3000이 이미 모두 들어 있어요.')

    setCoreInstalling(true)
    setCoreInstallProgress(0)
    const now = new Date().toISOString()
    const payloads = missing.map((entry) => ({
      word: entry.word,
      meaning: entry.meaning,
      example: entry.example || '',
      example_ko: entry.example_ko || '',
      accepted_answers: entry.accepted_answers || [],
      accepted_meanings: entry.accepted_meanings || [],
      note: entry.note || `Polish Core 3000 · 빈도 #${entry.rank}`,
      tags: Array.from(new Set([...(entry.tags || []), 'core3000', `분야:${entry.domain || '사물·기타'}`])),
      next_review_at: now,
      interval_days: 0,
      repetitions: 0,
      review_count: 0,
      difficulty_grade: 'learning',
      recent_results: [],
      recent_quiz_modes: [],
    }))

    try {
      if (isSupabaseConfigured) {
        const chunkSize = 250
        const inserted = []
        for (let i = 0; i < payloads.length; i += chunkSize) {
          const chunk = payloads.slice(i, i + chunkSize).map((x) => ({ ...x, user_id: session.user.id }))
          const { data, error } = await supabase.from('words').insert(chunk).select()
          if (error) throw error
          inserted.push(...(data || []))
          setCoreInstallProgress(Math.round((Math.min(i + chunkSize, payloads.length) / payloads.length) * 100))
        }
        setWords((prev) => sortWords([...inserted, ...prev]))
      } else {
        const locals = payloads.map((x) => ({ ...x, id: crypto.randomUUID(), created_at: now, updated_at: now }))
        persistLocal([...locals, ...words])
        setCoreInstallProgress(100)
      }
      notify(`${payloads.length}개를 추가했어요. 이제 원하는 만큼 바로 풀 수 있어요.`)
    } catch (error) {
      notify(error?.message || 'Core 3000 추가 중 오류가 발생했어요.')
      if (isSupabaseConfigured) await loadRemote()
    } finally {
      setCoreInstalling(false)
    }
  }

  const saveQuizCorrection = async (word, updates) => {
    const payload = { ...updates, updated_at: new Date().toISOString() }
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.from('words').update(payload).eq('id', word.id).select().single()
      if (error) {
        notify(error.message)
        throw error
      }
      setWords((prev) => sortWords(prev.map((item) => item.id === word.id ? data : item)))
      notify('정답 데이터를 수정했어요.')
      return data
    }

    const updated = { ...word, ...payload }
    persistLocal(words.map((item) => item.id === word.id ? updated : item))
    notify('정답 데이터를 수정했어요.')
    return updated
  }

  const deleteWord = async (word) => {
    if (!window.confirm(`“${word.word}”을 삭제할까요?`)) return
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('words').delete().eq('id', word.id)
      if (error) return notify(error.message)
      setWords((prev) => prev.filter((x) => x.id !== word.id))
    } else persistLocal(words.filter((x) => x.id !== word.id))
  }

  const dueWords = useMemo(() => sortWords(words.filter(isDue)), [words])
  const domainOptions = useMemo(() => {
    const installedDomains = new Set(words.map(domainOfWord))
    return [...CORE_DOMAIN_ORDER.filter((domain) => installedDomains.has(domain)), ...(installedDomains.has('내 단어장') ? ['내 단어장'] : [])]
  }, [words])

  const scopedDueWords = useMemo(() => {
    if (reviewScope === 'random') return dueWords
    return dueWords.filter((word) => domainOfWord(word) === reviewScope)
  }, [dueWords, reviewScope])

  const reviewWord = useMemo(() => {
    if (!scopedDueWords.length) return null
    if (reviewScope !== 'random') return scopedDueWords[seededIndex(reviewSeed, scopedDueWords.length)]

    const grouped = new Map()
    for (const word of scopedDueWords) {
      const domain = domainOfWord(word)
      if (!grouped.has(domain)) grouped.set(domain, [])
      grouped.get(domain).push(word)
    }
    const availableDomains = [...grouped.keys()].sort()
    const pickedDomain = availableDomains[seededIndex(reviewSeed, availableDomains.length, 0.137)]
    const candidates = grouped.get(pickedDomain) || scopedDueWords
    return candidates[seededIndex(reviewSeed, candidates.length, 0.731)]
  }, [scopedDueWords, reviewScope, reviewSeed])

  const completeWordQuiz = async (isCorrect, quizMode) => {
    if (!reviewWord) return

    const previousResults = Array.isArray(reviewWord.recent_results)
      ? reviewWord.recent_results.filter((item) => typeof item === 'boolean')
      : []
    const previousModes = Array.isArray(reviewWord.recent_quiz_modes)
      ? reviewWord.recent_quiz_modes.filter(Boolean)
      : []
    const recentResults = [...previousResults, Boolean(isCorrect)].slice(-4)
    const recentModes = [...previousModes, quizMode].slice(-4)
    const schedule = nextSchedule(reviewWord, recentResults)
    const { grade, ...wordSchedule } = schedule
    const wordUpdate = { ...wordSchedule, recent_results: recentResults, recent_quiz_modes: recentModes }
    const earnedXp = isCorrect ? 12 : 6
    const reviewRecord = {
      word_id: reviewWord.id,
      grade,
      is_correct: Boolean(isCorrect),
      quiz_mode: quizMode,
      reviewed_at: new Date().toISOString(),
      previous_interval: Number(reviewWord.interval_days || 0),
      next_interval: schedule.interval_days,
      goal_target: dailyGoal,
      xp_earned: earnedXp,
    }

    if (isSupabaseConfigured) {
      const { error } = await supabase.from('words').update(wordUpdate).eq('id', reviewWord.id)
      if (error) return notify(error.message)
      const { data: insertedReview, error: reviewError } = await supabase
        .from('reviews')
        .insert({ ...reviewRecord, user_id: session.user.id })
        .select()
        .single()
      if (reviewError) return notify(reviewError.message)

      const nextXp = xp + earnedXp
      const { error: xpError } = await supabase
        .from('user_preferences')
        .upsert({ user_id: session.user.id, daily_goal: dailyGoal, xp: nextXp }, { onConflict: 'user_id' })
      if (xpError) notify(xpError.message)
      setXp(nextXp)
      setWords((prev) => sortWords(prev.map((x) => x.id === reviewWord.id ? { ...x, ...wordUpdate } : x)))
      setReviews((prev) => [insertedReview || { ...reviewRecord, id: crypto.randomUUID() }, ...prev])
    } else {
      const nextWords = words.map((x) => x.id === reviewWord.id ? { ...x, ...wordUpdate } : x)
      const nextReviews = [{ ...reviewRecord, id: crypto.randomUUID() }, ...reviews]
      persistLocal(nextWords, nextReviews)
      setXp((value) => value + earnedXp)
    }
    setReviewSeed(Math.random())
    notify(`${isCorrect ? '정답' : '복습 완료'} · +${earnedXp} XP`)
  }

  const allTags = useMemo(() => ['전체', ...Array.from(new Set(words.flatMap((w) => w.tags || []))).sort()], [words])
  const filteredWords = useMemo(() => words.filter((w) => {
    const term = search.trim().toLowerCase()
    const matchesSearch = !term || [w.word, w.meaning, w.example, w.note].some((v) => (v || '').toLowerCase().includes(term))
    const matchesTag = tag === '전체' || (w.tags || []).includes(tag)
    return matchesSearch && matchesTag
  }), [words, search, tag])

  const todayKey = localDateKey()
  const todayReviews = reviews.filter((r) => localDateKey(new Date(r.reviewed_at)) === todayKey)
  const todayGoalMet = todayReviews.length >= dailyGoal
  const streak = computeGoalStreak(reviews, dailyGoal)
  const learned = words.filter((w) => w.difficulty_grade === 'easy' || Number(w.repetitions || 0) >= 2).length
  const mastery = words.length ? Math.round((learned / words.length) * 100) : 0
  const levelInfo = levelFromXp(xp)

  const coreWordSet = useMemo(() => new Set(core3000.map((entry) => normalizeWord(entry.word))), [])
  const coreWordsInLibrary = useMemo(() => Array.from(new Map(words.filter((w) => coreWordSet.has(normalizeWord(w.word))).map((w) => [normalizeWord(w.word), w])).values()), [words, coreWordSet])
  const coreInstalledCount = coreWordsInLibrary.length
  const coreReviewedCount = coreWordsInLibrary.filter((w) => Number(w.review_count || 0) > 0).length
  const coreMasteredCount = coreWordsInLibrary.filter((w) => w.difficulty_grade === 'easy' || Number(w.repetitions || 0) >= 2).length
  const coreRemaining = Math.max(0, 3000 - coreInstalledCount)

  const quizCoreEntries = useMemo(() => {
    const currentByWord = new Map(words.map((item) => [normalizeWord(item.word), item]))
    return core3000.map((entry) => {
      const current = currentByWord.get(normalizeWord(entry.word))
      return current ? { ...entry, ...current, rank: entry.rank, domain: entry.domain } : entry
    })
  }, [words])

  const domainStats = useMemo(() => {
    const wordById = new Map(words.map((word) => [word.id, word]))
    return CORE_DOMAIN_ORDER.map((domain) => {
      const deckEntries = core3000.filter((entry) => entry.domain === domain)
      const entryWords = new Set(deckEntries.map((entry) => normalizeWord(entry.word)))
      const installed = coreWordsInLibrary.filter((word) => entryWords.has(normalizeWord(word.word)))
      const reviewed = installed.filter((word) => Number(word.review_count || 0) > 0)
      const mastered = installed.filter((word) => word.difficulty_grade === 'easy' || Number(word.repetitions || 0) >= 2)
      const fieldXp = reviews.reduce((sum, review) => {
        const reviewWordItem = wordById.get(review.word_id)
        if (!reviewWordItem || domainOfWord(reviewWordItem) !== domain) return sum
        return sum + (Number(review.xp_earned) > 0 ? Number(review.xp_earned) : 8)
      }, 0)
      const fieldLevel = levelFromXp(fieldXp)
      return {
        domain,
        total: deckEntries.length,
        installed: installed.length,
        reviewed: reviewed.length,
        mastered: mastered.length,
        progress: deckEntries.length ? Math.round((mastered.length / deckEntries.length) * 100) : 0,
        level: fieldLevel.level,
        xp: fieldXp,
      }
    })
  }, [coreWordsInLibrary, reviews, words])

  if (loading) return <div className="splash">Reword</div>
  if (isSupabaseConfigured && !session) return <AuthScreen onSignIn={signIn} />

  return (
    <div className="app-shell">
      {toast && <div className="toast">{toast}</div>}
      <aside className="sidebar">
        <div className="brand-lockup compact">
          <div className="brand-mark">R</div>
          <div><h1>Reword</h1><p>{isSupabaseConfigured ? 'Cloud sync' : 'Local mode'}</p></div>
        </div>
        <nav>
          <button className={tab === 'today' ? 'active' : ''} onClick={() => goToTab('today')}><span>◉</span> Today <b>{dueWords.length}</b></button>
          <button className={tab === 'words' ? 'active' : ''} onClick={() => goToTab('words')}><span>▤</span> 단어장</button>
          <button className={tab === 'core' ? 'active' : ''} onClick={() => goToTab('core')}><span>3000</span> Core 3000</button>
          <button className={tab === 'add' ? 'active' : ''} onClick={() => { setEditing(null); goToTab('add') }}><span>＋</span> 단어 추가</button>
          <button className={tab === 'import' ? 'active' : ''} onClick={() => goToTab('import')}><span>⇩</span> 가져오기</button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => goToTab('settings')}><span>⚙</span> 설정</button>
        </nav>
        <div className="sidebar-bottom">
          <button className="settings-btn" onClick={() => setDark((v) => !v)}>{dark ? '☀︎ 라이트 모드' : '◐ 다크 모드'}</button>
          {isSupabaseConfigured && <button className="settings-btn" onClick={() => supabase.auth.signOut()}>로그아웃</button>}
        </div>
      </aside>

      <main className="content">
        <header className="mobile-header">
          <div className="brand-lockup compact"><div className="brand-mark">R</div><h1>Reword</h1></div>
          <div className="mobile-level"><b>Lv.{levelInfo.level}</b><span>{xp.toLocaleString()} XP</span></div>
        </header>

        {tab === 'today' && (
          <div className="page-stack">
            <section className="hero-row">
              <div><span className="eyebrow">DAILY REVIEW</span><h2>오늘의 복습</h2><p>하루 제한 없이 원하는 만큼 풀고, 설정한 목표를 채운 날만 연속학습으로 인정돼요.</p></div>
              <div className="date-pill">{new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' }).format(new Date())}</div>
            </section>

            <section className="level-panel panel">
              <div className="level-copy">
                <span className="eyebrow">YOUR LEVEL</span>
                <div><strong>Lv. {levelInfo.level}</strong><b>{xp.toLocaleString()} XP</b></div>
                <p>정답 +12 XP · 오답도 학습한 만큼 +6 XP</p>
              </div>
              <div className="level-progress-wrap">
                <div className="level-progress"><span style={{ width: `${levelInfo.progress}%` }} /></div>
                <small>{levelInfo.intoLevel.toLocaleString()} / {levelInfo.needed.toLocaleString()} XP · 다음 레벨</small>
              </div>
            </section>

            <section className="stats-grid">
              <article className={todayGoalMet ? 'goal-met' : ''}><span>오늘 목표</span><strong>{todayReviews.length}/{dailyGoal}</strong><small>{todayGoalMet ? '✓ 달성' : `${Math.max(0, dailyGoal - todayReviews.length)}문제 남음`}</small></article>
              <article><span>복습 가능</span><strong>{dueWords.length}</strong><small>제한 없음</small></article>
              <article><span>연속 학습</span><strong>{streak}</strong><small>일</small></article>
              <article><span>기억 안정화</span><strong>{mastery}%</strong><small>{learned}/{words.length}</small></article>
            </section>

            <section className="review-scope panel">
              <div className="scope-heading">
                <div><span className="eyebrow">QUIZ FIELD</span><strong>어떤 분야를 풀까요?</strong></div>
                <span>{reviewScope === 'random' ? '매 문제 분야 랜덤' : reviewScope}</span>
              </div>
              <div className="scope-chips">
                <button className={reviewScope === 'random' ? 'active' : ''} onClick={() => { setReviewScope('random'); setReviewSeed(Math.random()) }}>🎲 랜덤 분야</button>
                {domainOptions.map((domain) => (
                  <button key={domain} className={reviewScope === domain ? 'active' : ''} onClick={() => { setReviewScope(domain); setReviewSeed(Math.random()) }}>{domain}</button>
                ))}
              </div>
            </section>

            <ReviewCard
              word={reviewWord}
              position={todayReviews.length + 1}
              total={todayReviews.length + scopedDueWords.length}
              domainLabel={reviewWord ? domainOfWord(reviewWord) : reviewScope === 'random' ? '랜덤 분야' : reviewScope}
              onComplete={completeWordQuiz}
              onSaveCorrection={saveQuizCorrection}
              coreEntries={quizCoreEntries}
            />
          </div>
        )}

        {tab === 'words' && (
          <div className="page-stack">
            <section className="hero-row"><div><span className="eyebrow">LIBRARY</span><h2>내 단어장</h2><p>{words.length}개의 단어를 관리하고 검색할 수 있어요.</p></div></section>
            <section className="panel library-panel">
              <div className="toolbar">
                <input className="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="단어, 뜻, 예문 검색" />
                <select value={tag} onChange={(e) => setTag(e.target.value)}>{allTags.map((t) => <option key={t}>{t}</option>)}</select>
              </div>
              <div className="word-list">
                {filteredWords.length === 0 && <div className="empty-list">조건에 맞는 단어가 없어요.</div>}
                {filteredWords.map((w) => (
                  <article className="word-row" key={w.id}>
                    <div><strong>{w.word}</strong><span>{w.meaning}</span><div className="chips">{(w.tags || []).map((t) => <em key={t}>{t}</em>)}</div></div>
                    <div className="word-meta"><span>{isDue(w) ? '오늘' : new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' }).format(new Date(w.next_review_at))}</span><small>{w.review_count || 0}회 복습</small></div>
                    <div className="row-actions"><button onClick={() => { setEditing(w); goToTab('add') }}>수정</button><button onClick={() => deleteWord(w)}>삭제</button></div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

        {tab === 'core' && (
          <div className="page-stack">
            <section className="hero-row">
              <div><span className="eyebrow">POLISH CORE 3000</span><h2>Core 3000 & 분야 스탯</h2><p>3,000개를 모두 열어 두고 원하는 분야를 원하는 만큼 연습할 수 있어요.</p></div>
            </section>

            <section className="panel core-overview">
              <div className="core-title-row">
                <div>
                  <span className="core-kicker">CORE DECK</span>
                  <h3>{coreInstalledCount >= 3000 ? 'Core 3000 준비 완료' : 'Polish Core 3000'}</h3>
                  <p>설치 즉시 모든 미학습 단어가 복습 가능해요. 하루 새 단어 제한은 없고, 실제 복습 간격만 최근 4회 성적에 따라 조절돼요.</p>
                </div>
                <div className="core-ring"><strong>{Math.round((coreInstalledCount / 3000) * 100)}%</strong><span>설치</span></div>
              </div>

              <div className="core-progress-line"><span style={{ width: `${Math.min(100, (coreInstalledCount / 3000) * 100)}%` }} /></div>
              <div className="core-stats">
                <div><span>단어장에 있음</span><strong>{coreInstalledCount.toLocaleString()}</strong><small>/ 3,000</small></div>
                <div><span>한 번 이상 복습</span><strong>{coreReviewedCount.toLocaleString()}</strong><small>단어</small></div>
                <div><span>안정화</span><strong>{coreMasteredCount.toLocaleString()}</strong><small>단어</small></div>
              </div>

              {coreInstalledCount < 3000 && (
                <div className="core-install-area">
                  <div className="core-speed-heading"><div><strong>모든 단어 바로 열기</strong><span>설치 후 3,000개 모두 복습 후보가 됩니다.</span></div><b>{coreRemaining.toLocaleString()}개</b></div>
                  {coreInstalling && <div className="install-progress"><div><span style={{ width: `${coreInstallProgress}%` }} /></div><small>{coreInstallProgress}% 추가 중</small></div>}
                  <button className="primary-btn core-install-btn" disabled={coreInstalling} onClick={installCore3000}>{coreInstalling ? 'Core 3000 추가 중…' : coreInstalledCount ? `남은 ${coreRemaining.toLocaleString()}개 추가` : 'Core 3000 추가'}</button>
                  <p className="core-footnote">기존 단어는 중복 추가하지 않아요. 예문·한국어 예문·복수 정답·분야 정보가 함께 저장되며 하루 배정 제한은 없습니다.</p>
                </div>
              )}
            </section>

            <section className="panel domain-panel">
              <div className="panel-heading domain-heading"><div><span className="eyebrow">FIELD STATS</span><h2>분야별 스탯</h2></div><span>복습할수록 분야 레벨도 올라가요</span></div>
              <div className="domain-grid">
                {domainStats.map((stat) => (
                  <button key={stat.domain} className="domain-card" onClick={() => { setReviewScope(stat.domain); setReviewSeed(Math.random()); goToTab('today') }}>
                    <div className="domain-card-top"><strong>{stat.domain}</strong><b>Lv.{stat.level}</b></div>
                    <div className="domain-bar"><span style={{ width: `${stat.progress}%` }} /></div>
                    <div className="domain-numbers"><span>안정화 {stat.mastered}/{stat.total}</span><span>{stat.xp.toLocaleString()} XP</span></div>
                  </button>
                ))}
              </div>
            </section>

            <section className="panel core-preview-panel">
              <div className="panel-heading core-preview-heading"><div><span className="eyebrow">PREVIEW</span><h2>가장 자주 쓰는 단어</h2></div><span>빈도순</span></div>
              <div className="core-preview-list">
                {core3000.slice(0, 20).map((entry) => (
                  <div className="core-preview-row" key={entry.rank}><b>{entry.rank}</b><strong>{entry.word}</strong><span>{entry.meaning}</span></div>
                ))}
              </div>
            </section>
          </div>
        )}

        {tab === 'settings' && (
          <div className="page-stack">
            <section className="hero-row"><div><span className="eyebrow">SETTINGS</span><h2>학습 설정</h2><p>많이 풀어도 제한은 없고, 여기서 정한 최소 목표가 연속학습 기준이 돼요.</p></div></section>
            <section className="panel settings-panel-v35">
              <div className="setting-block">
                <div className="setting-title"><div><span className="eyebrow">DAILY GOAL</span><h3>하루 최소 목표</h3><p>선택한 문제 수를 채운 날에만 연속학습일이 1일 늘어요.</p></div><strong>{dailyGoal}문제</strong></div>
                <div className="goal-buttons">
                  {DAILY_GOAL_CHOICES.map((value) => <button key={value} className={dailyGoal === value ? 'active' : ''} onClick={() => saveDailyGoal(value)}>{value}</button>)}
                </div>
                <div className="goal-today-row"><span>오늘 진행</span><strong>{todayReviews.length} / {dailyGoal}</strong><span>{todayGoalMet ? '✓ 오늘 streak 인정' : '아직 streak에 추가되지 않음'}</span></div>
              </div>

              <div className="setting-block">
                <div className="setting-title"><div><span className="eyebrow">XP</span><h3>경험치</h3><p>정답은 +12 XP, 오답도 복습 노력으로 +6 XP를 받아요.</p></div><strong>Lv.{levelInfo.level}</strong></div>
                <div className="level-progress"><span style={{ width: `${levelInfo.progress}%` }} /></div>
              </div>

              <div className="setting-actions-grid">
                <button onClick={() => setDark((value) => !value)}><strong>{dark ? '☀︎ 라이트 모드' : '◐ 다크 모드'}</strong><span>화면 테마 변경</span></button>
                <button onClick={() => goToTab('import')}><strong>⇩ 대량 가져오기</strong><span>텍스트로 단어 여러 개 추가</span></button>
                {isSupabaseConfigured && <button onClick={() => supabase.auth.signOut()}><strong>로그아웃</strong><span>현재 계정에서 나가기</span></button>}
              </div>
            </section>
          </div>
        )}

        {tab === 'add' && <WordForm initialWord={editing} onSave={saveWord} onCancel={editing ? () => { setEditing(null); goToTab('words') } : null} />}
        {tab === 'import' && <ImportBox onImport={importWords} />}

        <nav className="bottom-nav">
          <button className={tab === 'today' ? 'active' : ''} onClick={() => goToTab('today')}><span>◉</span><small>Today</small></button>
          <button className={tab === 'words' ? 'active' : ''} onClick={() => goToTab('words')}><span>▤</span><small>단어장</small></button>
          <button className={tab === 'core' ? 'active' : ''} onClick={() => goToTab('core')}><span className="nav-3000">3K</span><small>Core</small></button>
          <button className={tab === 'add' ? 'active' : ''} onClick={() => { setEditing(null); goToTab('add') }}><span>＋</span><small>추가</small></button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => goToTab('settings')}><span>⚙</span><small>설정</small></button>
        </nav>
      </main>
    </div>
  )
}

export default App
