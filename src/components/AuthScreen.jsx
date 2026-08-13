import { useState } from 'react'

export default function AuthScreen({ onSignIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await onSignIn(email, password)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-lockup">
          <div className="brand-mark">R</div>
          <div>
            <h1>Reword</h1>
            <p>개인 단어 복습 공간</p>
          </div>
        </div>

        <form onSubmit={submit} className="auth-form">
          <label>
            이메일
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@example.com" />
          </label>
          <label>
            비밀번호
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="current-password" placeholder="비밀번호" />
          </label>
          <button className="primary-btn" disabled={busy}>
            {busy ? '로그인 중…' : '로그인'}
          </button>
        </form>
        <p className="auth-private-note">새 계정 생성은 비활성화된 개인용 앱입니다.</p>
      </section>
    </main>
  )
}
