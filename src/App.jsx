import { useEffect, useMemo, useState } from 'react'
import { supabase, isSupabaseConfigured } from './lib/supabase'
import { computeStreak, gradeFromQuizScore, isDue, localDateKey, nextSchedule } from './lib/review'
import AuthScreen from './components/AuthScreen'
import WordForm from './components/WordForm'
import ReviewCard from './components/ReviewCard'
import ImportBox from './components/ImportBox'
import core3000 from './data/polish-core-3000.json'

const LOCAL_WORDS = 'reword.words.v1'
const LOCAL_REVIEWS = 'reword.reviews.v1'
const CORE_DAILY_KEY = 'reword.coreDaily.v1'
const CORE_DAILY_CHOICES = [5, 10, 15, 20]
const normalizeWord = (value = '') => value.trim().toLocaleLowerCase('pl-PL')


const readLocal = (key) => {
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}

const sortWords = (items) => [...items].sort((a, b) => new Date(a.next_review_at || 0) - new Date(b.next_review_at || 0))

function App() {
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
  const [reviewOffset, setReviewOffset] = useState(0)
  const [coreDaily, setCoreDaily] = useState(() => Number(localStorage.getItem(CORE_DAILY_KEY) || 10))
  const [coreInstalling, setCoreInstalling] = useState(false)
  const [coreInstallProgress, setCoreInstallProgress] = useState(0)

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
    localStorage.setItem(CORE_DAILY_KEY, String(coreDaily))
  }, [coreDaily])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setWords(sortWords(readLocal(LOCAL_WORDS)))
      setReviews(readLocal(LOCAL_REVIEWS))
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

  const loadRemote = async () => {
    const [{ data: wordRows, error: wordError }, { data: reviewRows, error: reviewError }] = await Promise.all([
      supabase.from('words').select('*').order('created_at', { ascending: false }),
      supabase.from('reviews').select('*').order('reviewed_at', { ascending: false }).limit(1000),
    ])
    if (wordError || reviewError) return notify(wordError?.message || reviewError?.message)
    setWords(sortWords(wordRows || []))
    setReviews(reviewRows || [])
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
    const payloads = items.map((x) => ({ ...x, example: '', example_ko: '', accepted_answers: [], accepted_meanings: [], note: '', tags: [], next_review_at: now, interval_days: 0, repetitions: 0, review_count: 0 }))

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

    const startedAt = new Date()
    const payloads = missing.map((entry, index) => {
      const dayOffset = Math.floor(index / coreDaily)
      const scheduled = new Date(startedAt)
      if (dayOffset > 0) {
        scheduled.setDate(scheduled.getDate() + dayOffset)
        scheduled.setHours(6, 0, 0, 0)
      }
      return {
        word: entry.word,
        meaning: entry.meaning,
        example: entry.example || '',
        example_ko: entry.example_ko || '',
        accepted_answers: entry.accepted_answers || [],
        accepted_meanings: entry.accepted_meanings || [],
        note: entry.note || `Polish Core 3000 · 빈도 #${entry.rank}`,
        tags: Array.from(new Set([...(entry.tags || []), 'core3000'])),
        next_review_at: scheduled.toISOString(),
        interval_days: 0,
        repetitions: 0,
        review_count: 0,
      }
    })

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
        const nowIso = startedAt.toISOString()
        const locals = payloads.map((x) => ({ ...x, id: crypto.randomUUID(), created_at: nowIso, updated_at: nowIso }))
        persistLocal([...locals, ...words])
        setCoreInstallProgress(100)
      }
      notify(`${payloads.length}개를 추가했어요. 오늘은 ${Math.min(coreDaily, payloads.length)}개부터 시작해요.`)
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
  const reviewWord = dueWords[Math.min(reviewOffset, Math.max(0, dueWords.length - 1))]

  useEffect(() => {
    if (reviewOffset >= dueWords.length) setReviewOffset(0)
  }, [dueWords.length, reviewOffset])

  const completeWordQuiz = async (correctCount) => {
    if (!reviewWord) return
    const grade = gradeFromQuizScore(correctCount)
    const schedule = nextSchedule(reviewWord, grade)
    const reviewRecord = {
      word_id: reviewWord.id,
      grade,
      reviewed_at: new Date().toISOString(),
      previous_interval: Number(reviewWord.interval_days || 0),
      next_interval: schedule.interval_days,
    }

    if (isSupabaseConfigured) {
      const { error } = await supabase.from('words').update(schedule).eq('id', reviewWord.id)
      if (error) return notify(error.message)
      await supabase.from('reviews').insert({ ...reviewRecord, user_id: session.user.id })
      setWords((prev) => sortWords(prev.map((x) => x.id === reviewWord.id ? { ...x, ...schedule } : x)))
      setReviews((prev) => [{ ...reviewRecord, id: crypto.randomUUID() }, ...prev])
    } else {
      const nextWords = words.map((x) => x.id === reviewWord.id ? { ...x, ...schedule } : x)
      const nextReviews = [{ ...reviewRecord, id: crypto.randomUUID() }, ...reviews]
      persistLocal(nextWords, nextReviews)
    }
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
  const streak = computeStreak(reviews)
  const learned = words.filter((w) => Number(w.repetitions || 0) >= 2).length
  const mastery = words.length ? Math.round((learned / words.length) * 100) : 0

  const coreWordSet = useMemo(() => new Set(core3000.map((entry) => normalizeWord(entry.word))), [])
  const coreWordsInLibrary = useMemo(() => Array.from(new Map(words.filter((w) => coreWordSet.has(normalizeWord(w.word))).map((w) => [normalizeWord(w.word), w])).values()), [words, coreWordSet])
  const coreInstalledCount = coreWordsInLibrary.length
  const coreReviewedCount = coreWordsInLibrary.filter((w) => Number(w.review_count || 0) > 0).length
  const coreMasteredCount = coreWordsInLibrary.filter((w) => Number(w.repetitions || 0) >= 2).length
  const coreRemaining = Math.max(0, 3000 - coreInstalledCount)
  const coreEstimatedDays = Math.ceil(coreRemaining / coreDaily)
  const quizCoreEntries = useMemo(() => {
    const currentByWord = new Map(words.map((item) => [normalizeWord(item.word), item]))
    return core3000.map((entry) => {
      const current = currentByWord.get(normalizeWord(entry.word))
      return current ? { ...entry, ...current, rank: entry.rank } : entry
    })
  }, [words])

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
        </nav>
        <div className="sidebar-bottom">
          <button className="settings-btn" onClick={() => setDark((v) => !v)}>{dark ? '☀︎ 라이트 모드' : '◐ 다크 모드'}</button>
          {isSupabaseConfigured && <button className="settings-btn" onClick={() => supabase.auth.signOut()}>로그아웃</button>}
        </div>
      </aside>

      <main className="content">
        <header className="mobile-header">
          <div className="brand-lockup compact"><div className="brand-mark">R</div><h1>Reword</h1></div>
          <button onClick={() => setDark((v) => !v)}>{dark ? '☀︎' : '◐'}</button>
        </header>

        {tab === 'today' && (
          <div className="page-stack">
            <section className="hero-row">
              <div><span className="eyebrow">DAILY REVIEW</span><h2>오늘의 복습</h2><p>한 단어를 듣기·폴→한·한→폴·빈칸 네 방식으로 확인해요.</p></div>
              <div className="date-pill">{new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' }).format(new Date())}</div>
            </section>
            <section className="stats-grid">
              <article><span>오늘 복습</span><strong>{todayReviews.length}</strong><small>완료</small></article>
              <article><span>복습 대기</span><strong>{dueWords.length}</strong><small>단어</small></article>
              <article><span>연속 학습</span><strong>{streak}</strong><small>일</small></article>
              <article><span>기억 안정화</span><strong>{mastery}%</strong><small>{learned}/{words.length}</small></article>
            </section>
            <ReviewCard
              word={reviewWord}
              position={dueWords.length ? todayReviews.length + 1 : todayReviews.length}
              total={todayReviews.length + dueWords.length}
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
              <div>
                <span className="eyebrow">POLISH CORE 3000</span>
                <h2>자주 쓰는 폴란드어 3,000</h2>
                <p>빈도 순서대로 조금씩 열어 두고, 기존 단어는 자동으로 건너뛰어요.</p>
              </div>
            </section>

            <section className="panel core-overview">
              <div className="core-title-row">
                <div>
                  <span className="core-kicker">CORE DECK</span>
                  <h3>{coreInstalledCount >= 3000 ? 'Core 3000 설치 완료' : 'Polish Core 3000'}</h3>
                  <p>3,000개를 한꺼번에 오늘 복습으로 만들지 않고, 예문과 함께 빈도 순위대로 매일 새 단어를 배정해요.</p>
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
                  <div className="core-speed-heading">
                    <div><strong>하루 새 단어</strong><span>처음 보는 단어가 풀리는 속도</span></div>
                    <b>{coreDaily}개</b>
                  </div>
                  <div className="speed-buttons">
                    {CORE_DAILY_CHOICES.map((value) => (
                      <button key={value} className={coreDaily === value ? 'active' : ''} disabled={coreInstalling} onClick={() => setCoreDaily(value)}>{value}</button>
                    ))}
                  </div>
                  <div className="core-estimate">
                    <span>남은 {coreRemaining.toLocaleString()}개</span>
                    <span>새 단어 기준 약 {coreEstimatedDays.toLocaleString()}일</span>
                  </div>
                  {coreInstalling && (
                    <div className="install-progress">
                      <div><span style={{ width: `${coreInstallProgress}%` }} /></div>
                      <small>{coreInstallProgress}% 추가 중</small>
                    </div>
                  )}
                  <button className="primary-btn core-install-btn" disabled={coreInstalling} onClick={installCore3000}>
                    {coreInstalling ? 'Core 3000 추가 중…' : coreInstalledCount ? `남은 ${coreRemaining.toLocaleString()}개 추가` : 'Core 3000 추가'}
                  </button>
                  <p className="core-footnote">같은 철자의 단어가 이미 단어장에 있으면 중복 추가하지 않아요. Core 3000에는 빈칸 복습용 폴란드어 예문이 함께 저장됩니다. 설치 후 하루 분량은 Today에 바로 나타나고, 나머지는 앞으로 자동 배정돼요.</p>
                </div>
              )}
            </section>

            <section className="panel core-preview-panel">
              <div className="panel-heading core-preview-heading">
                <div><span className="eyebrow">PREVIEW</span><h2>가장 자주 쓰는 단어</h2></div>
                <span>빈도순</span>
              </div>
              <div className="core-preview-list">
                {core3000.slice(0, 20).map((entry) => (
                  <div className="core-preview-row" key={entry.rank}>
                    <b>{entry.rank}</b>
                    <strong>{entry.word}</strong>
                    <span>{entry.meaning}</span>
                  </div>
                ))}
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
          <button className={tab === 'import' ? 'active' : ''} onClick={() => goToTab('import')}><span>⇩</span><small>가져오기</small></button>
        </nav>
      </main>
    </div>
  )
}

export default App
