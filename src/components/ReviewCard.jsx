import { useEffect, useState } from 'react'

export default function ReviewCard({ word, position, total, onGrade }) {
  const [revealed, setRevealed] = useState(false)

  useEffect(() => setRevealed(false), [word?.id])

  if (!word) {
    return (
      <section className="review-empty panel">
        <div className="success-orb">✓</div>
        <h2>오늘 복습 완료</h2>
        <p>지금 예정된 단어를 모두 끝냈어요.</p>
      </section>
    )
  }

  return (
    <section className="review-card panel">
      <div className="review-topline">
        <span>{position} / {total}</span>
        <span>{word.tags?.slice(0, 2).join(' · ') || 'VOCAB'}</span>
      </div>
      <div className="progress"><span style={{ width: `${Math.max(6, (position / total) * 100)}%` }} /></div>

      <div className="review-word">{word.word}</div>
      {!revealed ? (
        <button className="reveal-btn" onClick={() => setRevealed(true)}>정답 보기</button>
      ) : (
        <div className="answer-area">
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
