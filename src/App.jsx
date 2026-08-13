import { useEffect, useMemo, useState } from 'react'
import { supabase, isSupabaseConfigured } from './lib/supabase'
import { computeStreak, isDue, localDateKey, nextSchedule } from './lib/review'
import AuthScreen from './components/AuthScreen'
import WordForm from './components/WordForm'
import ReviewCard from './components/ReviewCard'
import ImportBox from './components/ImportBox'

const LOCAL_WORDS = 'reword.words.v1'
const LOCAL_REVIEWS = 'reword.reviews.v1'

const REVIEW_MODES = [
  ['mixed', '혼합'],
  ['forward', '폴 → 한'],
  ['reverse', '한 → 폴'],
  ['cloze', '빈칸'],
  ['listening', '듣기'],
]

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
  const [reviewMode, setReviewMode] = useState(() => localStorage.getItem('reword.reviewMode') || 'mixed')
  const [reviewOffset, setReviewOffset] = useState(0)

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
    localStorage.setItem('reword.reviewMode', reviewMode)
  }, [reviewMode])

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
    const payloads = items.map((x) => ({ ...x, example: '', note: '', tags: [], next_review_at: now, interval_days: 0, repetitions: 0, review_count: 0 }))

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

  const gradeWord = async (grade) => {
    if (!reviewWord) return
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
              <div><span className="eyebrow">DAILY REVIEW</span><h2>오늘의 복습</h2><p>기억이 흐려지기 직전의 단어를 먼저 보여줘요.</p></div>
              <div className="date-pill">{new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' }).format(new Date())}</div>
            </section>
            <section className="stats-grid">
              <article><span>오늘 복습</span><strong>{todayReviews.length}</strong><small>완료</small></article>
              <article><span>복습 대기</span><strong>{dueWords.length}</strong><small>단어</small></article>
              <article><span>연속 학습</span><strong>{streak}</strong><small>일</small></article>
              <article><span>기억 안정화</span><strong>{mastery}%</strong><small>{learned}/{words.length}</small></article>
            </section>
            <section className="review-mode-bar" aria-label="복습 방식">
              <span>복습 방식</span>
              <div className="review-mode-buttons">
                {REVIEW_MODES.map(([value, label]) => (
                  <button key={value} className={reviewMode === value ? 'active' : ''} onClick={() => setReviewMode(value)}>{label}</button>
                ))}
              </div>
            </section>
            <ReviewCard
              word={reviewWord}
              position={dueWords.length ? todayReviews.length + 1 : todayReviews.length}
              total={todayReviews.length + dueWords.length}
              onGrade={gradeWord}
              selectedMode={reviewMode}
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

        {tab === 'add' && <WordForm initialWord={editing} onSave={saveWord} onCancel={editing ? () => { setEditing(null); goToTab('words') } : null} />}
        {tab === 'import' && <ImportBox onImport={importWords} />}

        <nav className="bottom-nav">
          <button className={tab === 'today' ? 'active' : ''} onClick={() => goToTab('today')}><span>◉</span><small>Today</small></button>
          <button className={tab === 'words' ? 'active' : ''} onClick={() => goToTab('words')}><span>▤</span><small>단어장</small></button>
          <button className={tab === 'add' ? 'active' : ''} onClick={() => { setEditing(null); goToTab('add') }}><span>＋</span><small>추가</small></button>
          <button className={tab === 'import' ? 'active' : ''} onClick={() => goToTab('import')}><span>⇩</span><small>가져오기</small></button>
        </nav>
      </main>
    </div>
  )
}

export default App
