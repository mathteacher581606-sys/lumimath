'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import MathText from '@/components/MathText';

const DIFFICULTY_LABEL: Record<string, string> = {
  NHAN_BIET: 'Nhận biết',
  THONG_HIEU: 'Thông hiểu',
  VAN_DUNG: 'Vận dụng',
  VAN_DUNG_CAO: 'Vận dụng cao',
};

export default function BankPage() {
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [texSource, setTexSource] = useState('');
  const [importing, setImporting] = useState(false);

  // Form state
  const [type, setType] = useState('MCQ');
  const [content, setContent] = useState('');
  const [options, setOptions] = useState([
    { id: 'A', text: '' },
    { id: 'B', text: '' },
    { id: 'C', text: '' },
    { id: 'D', text: '' },
  ]);
  const [answer, setAnswer] = useState('A');
  const [tfAnswers, setTfAnswers] = useState<any>({ a: true, b: true, c: true, d: true });
  const [shortAnswer, setShortAnswer] = useState('');
  const [solution, setSolution] = useState('');
  const [grade, setGrade] = useState('12');
  const [difficulty, setDifficulty] = useState('NHAN_BIET');
  const [saving, setSaving] = useState(false);

  async function loadQuestions() {
    setLoading(true);
    try {
      const data = await apiFetch('/bank/questions');
      setQuestions(data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadQuestions();
  }, []);

  async function createQuestion(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: any = { type, content };
      if (grade) body.grade = Number(grade);
      body.difficulty = difficulty;
      if (solution) body.solution = solution;

      if (type === 'MCQ') {
        body.options = options;
        body.answer = answer;
      } else if (type === 'TRUE_FALSE') {
        body.options = options;
        body.answer = tfAnswers;
      } else if (type === 'SHORT_ANSWER') {
        body.answer = shortAnswer;
      } else {
        body.answer = { rubric: solution || '' };
      }

      await apiFetch('/bank/questions', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      alert('Đã thêm câu hỏi!');
      setContent('');
      setSolution('');
      setShortAnswer('');
      setShowForm(false);
      loadQuestions();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function importTex() {
    if (!texSource.trim()) {
      alert('Vui lòng dán code .tex hoặc chọn file');
      return;
    }
    setImporting(true);
    try {
      const result = await apiFetch('/bank/import-tex', {
        method: 'POST',
        body: JSON.stringify({ texSource }),
      });
      alert('Đã nhập ' + result.imported + ' câu hỏi vào ngân hàng đề!');
      setTexSource('');
      setShowImport(false);
      loadQuestions();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setImporting(false);
    }
  }

  function handleFileUpload(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setTexSource(String(reader.result || ''));
    reader.readAsText(file);
  }

  const typeLabel: Record<string, string> = {
    MCQ: 'Trắc nghiệm',
    TRUE_FALSE: 'Đúng/Sai',
    SHORT_ANSWER: 'Trả lời ngắn',
    ESSAY: 'Tự luận',
  };

  return (
    <div className="page-container">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <h2>Ngân hàng đề ({questions.length} câu)</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn"
            style={{ width: 'auto', padding: '10px 18px', background: '#16a34a' }}
            onClick={() => setShowImport(!showImport)}
          >
            📥 Nhập đề .tex
          </button>
          <button
            className="btn"
            style={{ width: 'auto', padding: '10px 18px' }}
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? 'Đóng' : '+ Thêm câu hỏi'}
          </button>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={createQuestion}
          style={{
            background: '#fff',
            padding: 20,
            borderRadius: 12,
            marginBottom: 20,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}
        >
          <div className="form-group">
            <label>Loại câu hỏi</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="MCQ">Trắc nghiệm (1 đáp án)</option>
              <option value="TRUE_FALSE">Đúng/Sai (4 phát biểu)</option>
              <option value="SHORT_ANSWER">Trả lời ngắn</option>
              <option value="ESSAY">Tự luận</option>
            </select>
          </div>

          <div className="form-group">
            <label>Nội dung câu hỏi (dùng $...$ cho công thức toán) *</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 8 }}
              required
            />
          </div>

          {type === 'MCQ' && (
            <div>
              <label style={{ fontWeight: 500, fontSize: 14 }}>Các đáp án (đánh dấu đáp án đúng)</label>
              {options.map((opt, i) => (
                <div key={opt.id} className="form-group" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="radio"
                    name="correct"
                    checked={answer === opt.id}
                    onChange={() => setAnswer(opt.id)}
                    style={{ width: 'auto' }}
                  />
                  <span style={{ fontWeight: 600, width: 20 }}>{opt.id}.</span>
                  <input
                    value={opt.text}
                    onChange={(e) => {
                      const newOpts = [...options];
                      newOpts[i].text = e.target.value;
                      setOptions(newOpts);
                    }}
                    placeholder={`Đáp án ${opt.id}`}
                  />
                </div>
              ))}
            </div>
          )}

          {type === 'TRUE_FALSE' && (
            <div>
              <label style={{ fontWeight: 500, fontSize: 14 }}>4 phát biểu (tick = Đúng)</label>
              {['a', 'b', 'c', 'd'].map((id, i) => (
                <div key={id} className="form-group" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={!!tfAnswers[id]}
                    onChange={(e) => setTfAnswers({ ...tfAnswers, [id]: e.target.checked })}
                    style={{ width: 'auto' }}
                  />
                  <input
                    value={options[i]?.text || ''}
                    onChange={(e) => {
                      const newOpts = [...options];
                      newOpts[i] = { id, text: e.target.value };
                      setOptions(newOpts);
                    }}
                    placeholder={`Phát biểu ${id}`}
                  />
                </div>
              ))}
            </div>
          )}

          {type === 'SHORT_ANSWER' && (
            <div className="form-group">
              <label>Đáp án ngắn</label>
              <input value={shortAnswer} onChange={(e) => setShortAnswer(e.target.value)} placeholder="VD: 42" />
            </div>
          )}

          <div className="form-group">
            <label>Lời giải (tùy chọn)</label>
            <textarea
              value={solution}
              onChange={(e) => setSolution(e.target.value)}
              rows={2}
              style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 8 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Lớp</label>
              <select value={grade} onChange={(e) => setGrade(e.target.value)}>
                <option value="10">Lớp 10</option>
                <option value="11">Lớp 11</option>
                <option value="12">Lớp 12</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Độ khó</label>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                <option value="NHAN_BIET">Nhận biết</option>
                <option value="THONG_HIEU">Thông hiểu</option>
                <option value="VAN_DUNG">Vận dụng</option>
                <option value="VAN_DUNG_CAO">Vận dụng cao</option>
              </select>
            </div>
          </div>

          <button className="btn" disabled={saving}>
            {saving ? 'Đang lưu...' : 'Lưu câu hỏi'}
          </button>
        </form>
      )}

      {showImport && (
        <div
          style={{
            background: '#fff',
            padding: 20,
            borderRadius: 12,
            marginBottom: 20,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}
        >
          <h3 style={{ marginBottom: 8 }}>📥 Nhập đề từ code LaTeX (ex_test)</h3>
          <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
            Dán code LaTeX theo cấu trúc begin{'{ex}'}...end{'{ex}'} hoặc tải file
            .tex. Hệ thống sẽ tự tách thành từng câu hỏi và nạp vào ngân hàng đề.
          </p>
          <div className="form-group">
            <textarea
              value={texSource}
              onChange={(e) => setTexSource(e.target.value)}
              rows={10}
              placeholder="Dán code LaTeX ex_test vào đây..."
              style={{
                width: '100%',
                padding: 10,
                border: '1px solid #ddd',
                borderRadius: 8,
                fontFamily: 'monospace',
                fontSize: 13,
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <label
              className="btn"
              style={{ width: 'auto', cursor: 'pointer', background: '#6b7280', padding: '10px 16px' }}
            >
              📂 Tải file .tex
              <input
                type="file"
                accept=".tex,text/plain"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </label>
            <button className="btn" style={{ width: 'auto' }} onClick={importTex} disabled={importing}>
              {importing ? 'Đang nạp...' : 'Nạp vào ngân hàng'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p>Đang tải...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {questions.map((q) => (
            <div
              key={q.id}
              style={{
                background: '#fff',
                padding: 16,
                borderRadius: 10,
                boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontWeight: 700, color: '#2563eb' }}>{q.code}</span>
                <span style={{ fontSize: 12, background: '#eef2ff', color: '#2563eb', padding: '2px 8px', borderRadius: 6 }}>
                  {typeLabel[q.type] || q.type}
                </span>
                {q.difficulty && (
                  <span style={{ fontSize: 12, background: '#f0fdf4', color: '#16a34a', padding: '2px 8px', borderRadius: 6 }}>
                    {DIFFICULTY_LABEL[q.difficulty] || q.difficulty}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 15 }}>
                <MathText text={q.content} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
