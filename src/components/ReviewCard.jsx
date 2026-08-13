import { useEffect, useMemo, useState } from 'react'

const MODE_LABELS = {
  mixed: '혼합',
  forward: '폴 → 한',
  reverse: '한 → 폴',
  cloze: '빈칸',
  listening: '듣기',
}

const hashText = (text = '') => {
  let hash = 0
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0
  return Math.abs(hash)
}

const escapeRegExp = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function getAvailableModes(word) {
  const modes = ['forward', 'reverse', 'listening']
  if (word?.example && word?.word) {
    const pattern = new RegExp(`\\b${escapeRegExp(word.word)}\\b`, 'i')
    if (pattern.test(word.example)) modes.push('cloze')
  }
  return modes
}

function resolveMode(word, selectedMode) {
  if (!word) return 'forward'
  if (selectedMode !== 'mixed') {
    if (selectedMode === 'cloze' && !getAvailableModes(word).includes('cloze')) return 'forward'
    return selectedMode
  }
  const modes = getAvailableModes(word)
  const key = `${word.id || word.word}-${new Date().toISOString().slice(0, 10)}`
  return modes[hashText(key) % modes.length]
}

function clozeExample(word) {
  if (!word?.example || !word?.word) return ''
  const pattern = new RegExp(`\\b${escapeRegExp(word.word)}\\b`, 'i')
  return word.example.replace(pattern, '________')
}

export default function ReviewCard({ word, position, total, onGrade, selectedMode = 'mixed' }) {
  const [revealed, setRevealed] = useState(false)
  const activeMode = useMemo(() => resolveMode(word, selectedMode), [word?.id, selectedMode])

  useEffect(() => setRevealed(false), [word?.id, activeMode])

  const speak = () => {
    if (!word?.word || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(word.word)
    utterance.lang = 'pl-PL'
    utterance.rate = 0.88
    window.speechSynthesis.speak(utterance)
  }

  useEffect(() => {
    if (activeMode === 'listening' && word) {
      const timer = window.setTimeout(speak, 180)
      return () => window.clearTimeout(timer)
    }
  }, [word?.id, activeMode])

  if (!word) {
    return (
      <section className="review-empty panel">
        <div className="success-orb">✓</div>
        <h2>오늘 복습 완료</h2>
        <p>지금 예정된 단어를 모두 끝냈어요.</p>
      </section>
    )
  }

  const prompt = (() => {
    if (activeMode === 'reverse') return <div className="review-word review-word-meaning">{word.meaning}</div>
    if (activeMode === 'cloze') return <div className="cloze-prompt">{clozeExample(word)}</div>
    if (activeMode === 'listening') {
      return (
        <div className="listening-prompt">
          <button type="button" className="speaker-btn" onClick={speak} aria-label="폴란드어 발음 다시 듣기">🔊</button>
          <strong>듣고 단어를 떠올려보세요</strong>
          <span>버튼을 누르면 다시 들을 수 있어요.</span>
        </div>
      )
    }
    return <div className="review-word">{word.word}</div>
  })()

  return (
    <section className="review-card panel">
      <div className="review-topline">
        <span>{position} / {total}</span>
        <span>{MODE_LABELS[activeMode]} · {word.tags?.slice(0, 2).join(' · ') || 'VOCAB'}</span>
      </div>
      <div className="progress"><span style={{ width: `${Math.max(6, total ? (position / total) * 100 : 0)}%` }} /></div>

      <div className="prompt-area">{prompt}</div>

      {!revealed ? (
        <button className="reveal-btn" onClick={() => setRevealed(true)}>정답 보기</button>
      ) : (
        <div className="answer-area">
          {activeMode !== 'forward' && <div className="answer-word">{word.word}</div>}
          <div className="meaning">{word.meaning}</div>
          {word.example && <div className="example">{word.example}</div>}
          {word.note && <div className="note">{word.note}</div>}
          <div className="grade-grid">
            <button onClick={() => onGrade('again')}><strong>몰라요</strong><span>1일</span></button>
            <button onClick={() => onGrade('hard')}><strong>어려움</strong><span>짧게</span></button>
            <button onClick={() => onGrade('good')}><strong>알아요</strong><span>적당히</span></button>
            <button onClick={() => onGrade('easy')}><strong>쉬움</strong><span>길게</span></button>
          </div>
        </div>
      )}
    </section>
  )
}
