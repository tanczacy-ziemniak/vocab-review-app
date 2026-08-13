import { useEffect, useState } from 'react'

const empty = { word: '', meaning: '', example: '', note: '', tags: '' }

export default function WordForm({ initialWord, onSave, onCancel }) {
  const [form, setForm] = useState(empty)

  useEffect(() => {
    setForm(initialWord ? { ...initialWord, tags: (initialWord.tags || []).join(', ') } : empty)
  }, [initialWord])

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const submit = (e) => {
    e.preventDefault()
    onSave({
      ...form,
      word: form.word.trim(),
      meaning: form.meaning.trim(),
      example: form.example.trim(),
      note: form.note.trim(),
      tags: form.tags.split(',').map((v) => v.trim()).filter(Boolean),
    })
    if (!initialWord) setForm(empty)
  }

  return (
    <form className="panel form-grid" onSubmit={submit}>
      <div className="panel-heading">
        <div>
          <span className="eyebrow">WORD</span>
          <h2>{initialWord ? '단어 수정' : '새 단어 추가'}</h2>
        </div>
      </div>

      <label>
        단어
        <input autoFocus value={form.word} onChange={(e) => update('word', e.target.value)} placeholder="przepis" required />
      </label>
      <label>
        뜻
        <input value={form.meaning} onChange={(e) => update('meaning', e.target.value)} placeholder="레시피" required />
      </label>
      <label className="span-2">
        예문
        <textarea value={form.example} onChange={(e) => update('example', e.target.value)} placeholder="Mam dobry przepis na zupę." rows="3" />
      </label>
      <label className="span-2">
        메모
        <textarea value={form.note} onChange={(e) => update('note', e.target.value)} placeholder="przepis na + 목적어" rows="2" />
      </label>
      <label className="span-2">
        태그
        <input value={form.tags} onChange={(e) => update('tags', e.target.value)} placeholder="A2, food, noun" />
      </label>

      <div className="form-actions span-2">
        {onCancel && <button type="button" className="secondary-btn" onClick={onCancel}>취소</button>}
        <button className="primary-btn">{initialWord ? '저장' : '추가'}</button>
      </div>
    </form>
  )
}
