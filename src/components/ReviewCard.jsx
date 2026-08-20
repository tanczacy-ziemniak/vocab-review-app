import { useEffect, useMemo, useState } from 'react'

const QUIZ_MODES = ['listening', 'forward', 'reverse', 'cloze']
const MODE_LABELS = {
  listening: '듣기',
  forward: '폴 → 한',
  reverse: '한 → 폴',
  cloze: '빈칸',
}

const BAND_TAGS = new Set(['core3000', 'core-500', 'core-1000', 'core-2000', 'core-3000'])

const normalize = (value = '') => String(value)
  .normalize('NFC')
  .trim()
  .toLocaleLowerCase('pl-PL')
  .replace(/[.!?,;:]+$/g, '')
  .replace(/\s+/g, ' ')

const escapeRegExp = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const asList = (value) => Array.isArray(value) ? value.filter(Boolean) : []
const asBoolList = (value) => Array.isArray(value) ? value.filter((item) => typeof item === 'boolean') : []
const uniqueText = (items) => Array.from(new Map(items.filter(Boolean).map((value) => [normalize(value), String(value).trim()])).values())

const shuffle = (items) => {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

const posOf = (entry) => (entry?.tags || []).find((tag) => !BAND_TAGS.has(tag)) || 'core'
const bandOf = (entry) => (entry?.tags || []).find((tag) => /^core-\d+$/.test(tag)) || ''
const acceptedPolish = (word) => uniqueText([word?.word, ...asList(word?.accepted_answers)])
const acceptedKorean = (word) => uniqueText([word?.meaning, ...asList(word?.accepted_meanings)])

/**
 * 한 번의 복습에서는 문제 하나만 낸다.
 * 완전한 순수 랜덤 대신 최근 4회에서 덜 나온 유형을 우선한 뒤 그 안에서 랜덤 선택한다.
 * 따라서 같은 날 네 유형이 연속으로 나오지 않으면서도 장기적으로 네 유형이 고르게 섞인다.
 */
function chooseQuizMode(recentModes = []) {
  const recent = asList(recentModes).filter((mode) => QUIZ_MODES.includes(mode)).slice(-4)
  const counts = Object.fromEntries(QUIZ_MODES.map((mode) => [mode, recent.filter((item) => item === mode).length]))
  const minimum = Math.min(...QUIZ_MODES.map((mode) => counts[mode]))
  let candidates = QUIZ_MODES.filter((mode) => counts[mode] === minimum)
  const lastMode = recent.at(-1)
  if (candidates.length > 1 && lastMode) {
    const withoutImmediateRepeat = candidates.filter((mode) => mode !== lastMode)
    if (withoutImmediateRepeat.length) candidates = withoutImmediateRepeat
  }
  return candidates[Math.floor(Math.random() * candidates.length)] || 'forward'
}

const commonEdgeScore = (a = '', b = '') => {
  const x = normalize(a)
  const y = normalize(b)
  let prefix = 0
  let suffix = 0
  while (prefix < Math.min(x.length, y.length) && x[prefix] === y[prefix]) prefix += 1
  while (suffix < Math.min(x.length, y.length) && x[x.length - 1 - suffix] === y[y.length - 1 - suffix]) suffix += 1
  return Math.min(3, prefix) + Math.min(3, suffix)
}

function similarDistractors(word, coreEntries, mode) {
  if (!word || !coreEntries?.length) return []
  const target = coreEntries.find((entry) => normalize(entry.word) === normalize(word.word)) || word
  const targetPos = posOf(target)
  const targetBand = bandOf(target)
  const targetRank = Number(target.rank || 1500)
  const targetMeaningLength = (target.meaning || word.meaning || '').length
  const validWords = new Set(acceptedPolish(word).map(normalize))
  const validMeanings = new Set(acceptedKorean(word).map(normalize))

  const seen = new Set()
  const candidates = coreEntries
    .filter((entry) => !validWords.has(normalize(entry.word)))
    .filter((entry) => mode !== 'forward' || !validMeanings.has(normalize(entry.meaning)))
    .filter((entry) => {
      const value = mode === 'forward' ? normalize(entry.meaning) : normalize(entry.word)
      if (!value || seen.has(value)) return false
      seen.add(value)
      return true
    })
    .map((entry) => {
      let score = 0
      if (posOf(entry) === targetPos) score += 8
      if (targetBand && bandOf(entry) === targetBand) score += 2
      const rankDistance = Math.abs(Number(entry.rank || 1500) - targetRank)
      score += Math.max(0, 4 - Math.log10(rankDistance + 1) * 1.8)

      if (mode === 'listening') {
        score += commonEdgeScore(entry.word, word.word) * 1.5
        score += Math.max(0, 4 - Math.abs(entry.word.length - word.word.length))
      } else {
        score += Math.max(0, 3 - Math.abs((entry.meaning || '').length - targetMeaningLength) / 4)
      }
      return { entry, score }
    })
    .sort((a, b) => b.score - a.score)

  return shuffle(candidates.slice(0, 24)).slice(0, 3).map(({ entry }) => entry)
}

function makeOptions(word, coreEntries, mode) {
  const distractors = similarDistractors(word, coreEntries, mode)
  const raw = mode === 'forward'
    ? [{ value: word.meaning, correct: true }, ...distractors.map((entry) => ({ value: entry.meaning, correct: false }))]
    : [{ value: word.word, correct: true }, ...distractors.map((entry) => ({ value: entry.word, correct: false }))]

  const seen = new Set()
  return shuffle(raw.filter((option) => {
    const key = normalize(option.value)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })).slice(0, 4)
}

function clozeExample(word) {
  const example = word?.example || `W tekście pojawia się słowo „${word?.word || ''}”.`
  const targets = acceptedPolish(word).sort((a, b) => b.length - a.length)
  for (const target of targets) {
    if (!target) continue
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escapeRegExp(target)})(?=$|[^\\p{L}\\p{N}_])`, 'iu')
    const match = pattern.exec(example)
    if (!match) continue
    const index = match.index + match[1].length
    return `${example.slice(0, index)}________${example.slice(index + match[2].length)}`
  }
  return `${example} → ________`
}

function difficultyFromResults(results = []) {
  const recent = asBoolList(results).slice(-4)
  if (recent.length < 4) return { grade: 'learning', label: '측정 중', score: recent.filter(Boolean).length, count: recent.length }
  const score = recent.filter(Boolean).length
  if (score === 4) return { grade: 'easy', label: '쉬움', score, count: 4 }
  if (score === 3) return { grade: 'good', label: '알아요', score, count: 4 }
  if (score === 2) return { grade: 'hard', label: '어려움', score, count: 4 }
  return { grade: 'again', label: '다시', score, count: 4 }
}

const linesToList = (value = '') => uniqueText(String(value).split(/\n+/).map((item) => item.trim()))
const listToLines = (value) => asList(value).join('\n')

export default function ReviewCard({ word, position, total, domainLabel, onComplete, onSaveCorrection, coreEntries = [] }) {
  const [typedAnswer, setTypedAnswer] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [flagOpen, setFlagOpen] = useState(false)
  const [flagSaving, setFlagSaving] = useState(false)
  const [flagForm, setFlagForm] = useState(null)

  const activeMode = useMemo(
    () => chooseQuizMode(word?.recent_quiz_modes),
    [word?.id, word?.review_count, JSON.stringify(word?.recent_quiz_modes || [])],
  )
  const options = useMemo(
    () => (activeMode === 'forward' || activeMode === 'listening' ? makeOptions(word, coreEntries, activeMode) : []),
    [word?.id, word?.word, word?.meaning, word?.accepted_answers, word?.accepted_meanings, activeMode, coreEntries],
  )

  useEffect(() => {
    setTypedAnswer('')
    setFeedback(null)
    setSubmitting(false)
    setFlagOpen(false)
    setFlagForm(null)
  }, [word?.id])

  const speak = () => {
    if (!word?.word || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(word.word)
    utterance.lang = 'pl-PL'
    utterance.rate = 0.88
    window.speechSynthesis.speak(utterance)
  }

  useEffect(() => {
    if (activeMode !== 'listening' || !word || feedback) return undefined
    const timer = window.setTimeout(speak, 180)
    return () => window.clearTimeout(timer)
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

  const savedResults = asBoolList(word.recent_results).slice(-4)
  const previewResults = feedback ? [...savedResults, Boolean(feedback.isCorrect)].slice(-4) : savedResults
  const difficulty = difficultyFromResults(previewResults)
  const historyDots = Array.from({ length: 4 }, (_, index) => {
    const offset = 4 - previewResults.length
    if (index < offset) return null
    return previewResults[index - offset]
  })

  const answerQuestion = (isCorrect, selectedValue = '') => {
    if (feedback) return
    setFeedback({ isCorrect, selectedValue })
  }

  const isAcceptedTyped = (value) => acceptedPolish(word).some((answer) => normalize(answer) === normalize(value))

  const submitTyped = (event) => {
    event?.preventDefault()
    if (!typedAnswer.trim() || feedback) return
    answerQuestion(isAcceptedTyped(typedAnswer), typedAnswer)
  }

  const moveNext = async () => {
    if (!feedback || submitting) return
    setSubmitting(true)
    try {
      await onComplete(Boolean(feedback.isCorrect), activeMode)
    } finally {
      setSubmitting(false)
    }
  }

  const openFlag = () => {
    setFlagForm({
      word: word.word || '',
      meaning: word.meaning || '',
      example: word.example || '',
      example_ko: word.example_ko || '',
      accepted_answers: listToLines(word.accepted_answers),
      accepted_meanings: listToLines(word.accepted_meanings),
      acceptCurrent: Boolean(feedback && !feedback.isCorrect),
    })
    setFlagOpen(true)
  }

  const saveFlag = async (event) => {
    event.preventDefault()
    if (!flagForm || flagSaving) return
    setFlagSaving(true)
    try {
      let extraAnswers = linesToList(flagForm.accepted_answers)
      let extraMeanings = linesToList(flagForm.accepted_meanings)

      if (flagForm.acceptCurrent && feedback?.selectedValue) {
        if (activeMode === 'forward') extraMeanings = uniqueText([...extraMeanings, feedback.selectedValue])
        else extraAnswers = uniqueText([...extraAnswers, feedback.selectedValue])
      }

      const updates = {
        word: flagForm.word.trim(),
        meaning: flagForm.meaning.trim(),
        example: flagForm.example.trim(),
        example_ko: flagForm.example_ko.trim(),
        accepted_answers: extraAnswers.filter((item) => normalize(item) !== normalize(flagForm.word)),
        accepted_meanings: extraMeanings.filter((item) => normalize(item) !== normalize(flagForm.meaning)),
      }

      await onSaveCorrection?.(word, updates)

      if (flagForm.acceptCurrent && feedback && !feedback.isCorrect) {
        setFeedback((previous) => ({ ...previous, isCorrect: true, corrected: true }))
      }

      setFlagOpen(false)
    } catch (error) {
      console.error(error)
    } finally {
      setFlagSaving(false)
    }
  }

  const isChoiceMode = activeMode === 'forward' || activeMode === 'listening'
  const isTypedMode = activeMode === 'reverse' || activeMode === 'cloze'
  const acceptedKoreanSet = new Set(acceptedKorean(word).map(normalize))
  const acceptedPolishSet = new Set(acceptedPolish(word).map(normalize))

  return (
    <section className="review-card quiz-card panel">
      <div className="review-topline">
        <span>단어 {position} / {total}</span>
        <span>{MODE_LABELS[activeMode]}{domainLabel ? ` · ${domainLabel}` : ''}</span>
      </div>

      <div className="rolling-history" aria-label="최근 네 번의 복습 결과">
        <div className="history-copy">
          <strong>{difficulty.count < 4 ? `난이도 측정 ${difficulty.count}/4` : `최근 4회 ${difficulty.score}/4 · ${difficulty.label}`}</strong>
          <span>{difficulty.count < 4 ? '4회가 쌓일 때까지 하루 간격으로 확인해요.' : '항상 가장 최근 4회만 난이도에 반영돼요.'}</span>
        </div>
        <div className="history-dots" aria-hidden="true">
          {historyDots.map((result, index) => (
            <i key={index} className={result === true ? 'correct' : result === false ? 'wrong' : 'empty'} />
          ))}
        </div>
      </div>

      <div className="quiz-prompt-area">
        {activeMode === 'forward' && (
          <>
            <span className="quiz-instruction">가장 알맞은 한국어 뜻을 고르세요</span>
            <div className="review-word">{word.word}</div>
          </>
        )}

        {activeMode === 'listening' && (
          <div className="listening-prompt">
            <button type="button" className="speaker-btn" onClick={speak} aria-label="폴란드어 발음 다시 듣기">🔊</button>
            <strong>들은 단어를 고르세요</strong>
            <span>비슷한 단어 3개가 함께 나와요.</span>
          </div>
        )}

        {activeMode === 'reverse' && (
          <>
            <span className="quiz-instruction">폴란드어로 직접 입력하세요</span>
            <div className="review-word review-word-meaning">{word.meaning}</div>
          </>
        )}

        {activeMode === 'cloze' && (
          <>
            <span className="quiz-instruction">한국어 문장을 보고 폴란드어 빈칸을 완성하세요</span>
            <div className="cloze-ko-sentence">
              <small>한국어</small>
              <strong>{word.example_ko || `이 문장에서는 “${word.meaning}”이라는 뜻으로 사용돼요.`}</strong>
            </div>
            <div className="cloze-prompt">{clozeExample(word)}</div>
          </>
        )}
      </div>

      {isChoiceMode && (
        <div className="choice-grid">
          {options.map((option) => {
            const optionIsCorrect = option.correct || (activeMode === 'forward'
              ? acceptedKoreanSet.has(normalize(option.value))
              : acceptedPolishSet.has(normalize(option.value)))
            const chosen = feedback?.selectedValue === option.value
            const stateClass = feedback
              ? optionIsCorrect ? 'correct' : chosen ? 'wrong' : 'dimmed'
              : ''
            return (
              <button
                key={option.value}
                type="button"
                className={stateClass}
                disabled={Boolean(feedback)}
                onClick={() => answerQuestion(optionIsCorrect, option.value)}
              >
                {option.value}
              </button>
            )
          })}
        </div>
      )}

      {isTypedMode && (
        <form className="typed-answer" onSubmit={submitTyped}>
          <input
            value={typedAnswer}
            disabled={Boolean(feedback)}
            onChange={(event) => setTypedAnswer(event.target.value)}
            placeholder="폴란드어 입력"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck="false"
          />
          {!feedback && <button type="submit" className="primary-btn" disabled={!typedAnswer.trim()}>확인</button>}
        </form>
      )}

      {feedback && (
        <div className={`quiz-feedback ${feedback.isCorrect ? 'correct' : 'wrong'}`}>
          <div className="feedback-copy">
            <strong>{feedback.corrected ? '정답으로 수정됨' : feedback.isCorrect ? '정답' : '오답'}</strong>
            <span>{feedback.isCorrect ? `${word.word} · ${word.meaning}` : <>정답: <b>{word.word}</b> · {word.meaning}</>}</span>
            {activeMode === 'cloze' && word.example && <small>{word.example}</small>}
            <small>{difficulty.count < 4 ? `이번 결과 포함 ${difficulty.count}/4회 수집` : `최근 4회 기준: ${difficulty.label} (${difficulty.score}/4)`}</small>
          </div>
          <div className="feedback-actions">
            <button type="button" className="flag-btn" onClick={openFlag} title="정답/예문 오류 수정" aria-label="정답 또는 예문 오류 수정">⚑</button>
            <button type="button" className="next-word-btn" onClick={moveNext} disabled={submitting}>
              {submitting ? '저장 중…' : '다음 단어'}
            </button>
          </div>
        </div>
      )}

      {flagOpen && flagForm && (
        <div className="correction-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFlagOpen(false) }}>
          <form className="correction-modal" onSubmit={saveFlag} role="dialog" aria-modal="true" aria-labelledby="correction-title">
            <div className="correction-heading">
              <div>
                <span className="eyebrow">FLAG & CORRECT</span>
                <h3 id="correction-title">정답 데이터 수정</h3>
              </div>
              <button type="button" className="modal-close" onClick={() => setFlagOpen(false)} aria-label="닫기">×</button>
            </div>

            {feedback?.selectedValue && (
              <div className="flag-current-answer">
                <span>이번에 입력/선택한 답</span>
                <strong>{feedback.selectedValue}</strong>
              </div>
            )}

            <div className="correction-grid">
              <label>폴란드어 정답<input value={flagForm.word} onChange={(e) => setFlagForm((v) => ({ ...v, word: e.target.value }))} required /></label>
              <label>한국어 뜻<input value={flagForm.meaning} onChange={(e) => setFlagForm((v) => ({ ...v, meaning: e.target.value }))} required /></label>
              <label className="span-2">폴란드어 예문<textarea rows="3" value={flagForm.example} onChange={(e) => setFlagForm((v) => ({ ...v, example: e.target.value }))} /></label>
              <label className="span-2">한국어 예문<textarea rows="3" value={flagForm.example_ko} onChange={(e) => setFlagForm((v) => ({ ...v, example_ko: e.target.value }))} /></label>
              <label>추가 인정 폴란드어 정답<textarea rows="3" value={flagForm.accepted_answers} onChange={(e) => setFlagForm((v) => ({ ...v, accepted_answers: e.target.value }))} placeholder={'한 줄에 하나씩\n예: zrobiłem'} /></label>
              <label>추가 인정 한국어 뜻<textarea rows="3" value={flagForm.accepted_meanings} onChange={(e) => setFlagForm((v) => ({ ...v, accepted_meanings: e.target.value }))} placeholder={'한 줄에 하나씩\n예: 만들다'} /></label>
            </div>

            {feedback && !feedback.isCorrect && (
              <label className="accept-current-row">
                <input type="checkbox" checked={flagForm.acceptCurrent} onChange={(e) => setFlagForm((v) => ({ ...v, acceptCurrent: e.target.checked }))} />
                <span>이번 답도 정답으로 인정하고 이번 복습 결과를 정답으로 복구</span>
              </label>
            )}

            <p className="correction-help">복수 정답이면 기존 정답을 지우지 말고 ‘추가 인정 정답’에 한 줄씩 넣으면 다음 복습부터 모두 정답 처리돼요.</p>

            <div className="correction-actions">
              <button type="button" className="secondary-btn" onClick={() => setFlagOpen(false)}>취소</button>
              <button type="submit" className="primary-btn" disabled={flagSaving}>{flagSaving ? '저장 중…' : '수정 저장'}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
