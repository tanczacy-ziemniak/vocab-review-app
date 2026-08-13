import { useState } from 'react'

export default function AuthScreen({ onSignIn, onSignUp }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('signin')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      if (mode === 'signin') await onSignIn(email, password)
      else await onSignUp(email, password)
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
            <p>오늘 기억해야 할 단어만.</p>
          </div>
        </div>

        <form onSubmit={submit} className="auth-form">
          <label>
            이메일
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
          </label>
          <label>
            비밀번호
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="6자 이상" />
          </label>
          <button className="primary-btn" disabled={busy}>
            {busy ? '처리 중…' : mode === 'signin' ? '로그인' : '계정 만들기'}
          </button>
        </form>

        <button className="text-btn" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? '처음인가요? 계정 만들기' : '이미 계정이 있나요? 로그인'}
        </button>
      </section>
    </main>
  )
}
