import { useState } from 'react'

export default function ImportBox({ onImport }) {
  const [text, setText] = useState('')

  const submit = () => {
    const rows = text.split('\n').map((line) => line.trim()).filter(Boolean)
    const items = rows.map((line) => {
      const parts = line.split(/\t|\s+-\s+|\s*;\s*/)
      return { word: parts[0]?.trim(), meaning: parts.slice(1).join(' - ').trim() }
    }).filter((x) => x.word && x.meaning)
    onImport(items)
    setText('')
  }

  return (
    <section className="panel import-box">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">BULK IMPORT</span>
          <h2>여러 단어 한 번에 추가</h2>
        </div>
      </div>
      <p className="muted">한 줄에 <code>단어 - 뜻</code>, 탭, 또는 세미콜론으로 구분하세요.</p>
      <textarea rows="8" value={text} onChange={(e) => setText(e.target.value)} placeholder={'przepis - 레시피\nzupa - 수프\nsklep - 가게'} />
      <div className="form-actions"><button className="primary-btn" disabled={!text.trim()} onClick={submit}>가져오기</button></div>
    </section>
  )
}
