'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

const DIFF_LABEL: Record<string, string> = {
  NHAN_BIET: 'Nhận biết',
  THONG_HIEU: 'Thông hiểu',
  VAN_DUNG: 'Vận dụng',
  VAN_DUNG_CAO: 'Vận dụng cao',
};

export default function ExamLibraryPage() {
  const [exams, setExams] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Bộ lọc
  const [fGrade, setFGrade] = useState('');
  const [fTopic, setFTopic] = useState('');
  const [fDifficulty, setFDifficulty] = useState('');
  const [fTemplateOnly, setFTemplateOnly] = useState(false);
  const [fFolderId, setFFolderId] = useState('');

  // Cây mục lục
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParent, setNewFolderParent] = useState('');
  const [moveTarget, setMoveTarget] = useState<any | null>(null);
  const [moveFolderId, setMoveFolderId] = useState('');

  // Sửa đề thi
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [editSaving, setEditSaving] = useState(false);

  // Đổi tên thư mục
  const [renameTarget, setRenameTarget] = useState<any | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Gán vào bài học
  const [assignTarget, setAssignTarget] = useState<any | null>(null);
  const [assignCourse, setAssignCourse] = useState('');
  const [assignLesson, setAssignLesson] = useState('');
  const [lessons, setLessons] = useState<any[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => {
    load();
  }, []);

  // Tự mở rộng mọi thư mục có thư mục con (để nhánh nhỏ luôn nhìn thấy)
  useEffect(() => {
    if (!folders.length) return;
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      for (const f of folders) {
        if (folders.some((x) => x.parentId === f.id)) next.add(f.id);
      }
      return next;
    });
  }, [folders]);

  async function load() {
    setLoading(true);
    try {
      const [examData, topicData, courseData, folderData] = await Promise.all([
        apiFetch('/exams'),
        apiFetch('/bank/topics'),
        apiFetch('/courses'),
        apiFetch('/exams/folders'),
      ]);
      setExams(examData);
      setTopics(topicData);
      setCourses(courseData);
      setFolders(folderData);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // Các id thư mục con của 1 thư mục (lọc đề gồm cả cây con)
  function folderSubtreeIds(rootId: string): Set<string> {
    const ids = new Set<string>([rootId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of folders) {
        if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
          ids.add(f.id);
          grew = true;
        }
      }
    }
    return ids;
  }

  // Lọc theo lớp/chủ đề/độ khó/template/thư mục
  const filtered = exams.filter((ex) => {
    if (fGrade && String(ex.grade ?? '') !== fGrade) return false;
    if (fTopic && ex.topicId !== fTopic) return false;
    if (fDifficulty && ex.difficulty !== fDifficulty) return false;
    if (fTemplateOnly && !ex.isTemplate) return false;
    if (fFolderId) {
      const ids = folderSubtreeIds(fFolderId);
      if (!ex.folderId || !ids.has(ex.folderId)) return false;
    }
    return true;
  });

  // ===== Thư mục =====
  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) {
      alert('Nhập tên thư mục');
      return;
    }
    try {
      await apiFetch('/exams/folders', {
        method: 'POST',
        body: JSON.stringify({ name, parentId: newFolderParent || null }),
      });
      setNewFolderName('');
      setNewFolderParent('');
      setShowFolderModal(false);
      showToast('✅ Đã tạo thư mục!');
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function moveExam() {
    if (!moveTarget) return;
    try {
      await apiFetch(`/exams/${moveTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ folderId: moveFolderId || null }),
      });
      setMoveTarget(null);
      showToast('✅ Đã di chuyển đề thi!');
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  // Danh sách thư mục dạng CÂY có thụt lề (mẹ trước, con lùi sau) cho các ô chọn
  function folderTreeOptions(): { id: string; label: string }[] {
    const out: { id: string; label: string }[] = [];
    const walk = (parentId: string | null, depth: number) => {
      const list = folders.filter((f) => (f.parentId || null) === parentId);
      for (const f of list) {
        out.push({ id: f.id, label: (depth ? '└ '.repeat(depth) + ' ' : '') + f.name });
        walk(f.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }

  async function renameFolder() {
    if (!renameTarget) return;
    const name = renameValue.trim();
    if (!name) {
      alert('Nhập tên thư mục');
      return;
    }
    try {
      await apiFetch(`/exams/folders/${renameTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
      setRenameTarget(null);
      showToast('✅ Đã đổi tên thư mục!');
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function removeFolder(f: any) {
    const ok = confirm(
      `Xóa thư mục "${f.name}"?\n\nCác thư mục con sẽ chuyển về gốc; đề thi bên trong được GIỮ NGUYÊN và chuyển về "Không thư mục".`,
    );
    if (!ok) return;
    try {
      await apiFetch(`/exams/folders/${f.id}`, { method: 'DELETE' });
      showToast('✅ Đã xóa thư mục!');
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  function openEdit(ex: any) {
    setEditForm({
      title: ex.title || '',
      duration: String(ex.duration ?? 45),
      grade: ex.grade ? String(ex.grade) : '',
      topicId: ex.topicId || '',
      difficulty: ex.difficulty || '',
      published: ex.status === 'PUBLISHED' || !!ex.published,
      folderId: ex.folderId || '',
    });
    setEditTarget(ex);
  }

  async function saveEditExam() {
    if (!editTarget) return;
    const title = (editForm.title || '').trim();
    if (!title) {
      alert('Nhập tên đề thi');
      return;
    }
    setEditSaving(true);
    try {
      await apiFetch(`/exams/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title,
          duration: Number(editForm.duration) || 45,
          grade: editForm.grade ? Number(editForm.grade) : null,
          topicId: editForm.topicId || null,
          difficulty: editForm.difficulty || null,
          published: !!editForm.published,
          folderId: editForm.folderId || null,
        }),
      });
      setEditTarget(null);
      showToast('✅ Đã lưu thay đổi đề thi!');
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setEditSaving(false);
    }
  }

  // Tạo đề mới từ template
  async function createFromTemplate(ex: any) {
    const title = prompt(`Tên đề mới (từ template "${ex.title}"):`, `${ex.title} — bản mới`);
    if (!title) return;
    try {
      const data = await apiFetch(`/exams/from-template/${ex.id}`, {
        method: 'POST',
        body: JSON.stringify({ title }),
      });
      showToast('Đã tạo đề từ template!');
      window.location.href = `/teacher/exams/${data.id}`;
    } catch (e: any) {
      alert(e.message);
    }
  }

  function downloadUrl(path: string, filename: string) {
    return async () => {
      const token = localStorage.getItem('token');
      const res = await fetch(`${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        ...(path.includes('compile') ? { method: 'POST' } : {}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(String(err.message || '').slice(-400));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
    };
  }

  function openAssign(ex: any) {
    setAssignTarget(ex);
    setAssignCourse('');
    setAssignLesson('');
    setLessons([]);
  }

  async function pickCourse(courseId: string) {
    setAssignCourse(courseId);
    setAssignLesson('');
    if (!courseId) {
      setLessons([]);
      return;
    }
    try {
      const data = await apiFetch(`/courses/${courseId}`);
      setLessons(data.lessons || []);
    } catch (e: any) {
      console.error(e);
    }
  }

  async function doAssign() {
    if (!assignTarget || !assignLesson) {
      alert('Vui lòng chọn bài giảng');
      return;
    }
    setAssigning(true);
    try {
      await apiFetch(`/exams/${assignTarget.id}/assign`, {
        method: 'POST',
        body: JSON.stringify({ lessonId: assignLesson }),
      });
      setAssignTarget(null);
      showToast('Đã gán đề thi vào bài giảng làm BTVN');
      load();
    } catch (e: any) {
      showToast(e.message);
    } finally {
      setAssigning(false);
    }
  }

  async function unassign(ex: any, lessonId: string) {
    if (!confirm('Bỏ gán đề này khỏi bài giảng?')) return;
    try {
      await apiFetch(`/exams/${ex.id}/unassign/${lessonId}`, {
        method: 'DELETE',
      });
      showToast('Đã bỏ gán BTVN');
      load();
    } catch (e: any) {
      showToast(e.message);
    }
  }

  // Giao bài hàng loạt
  const [bulkTarget, setBulkTarget] = useState<any | null>(null);
  const [bulkCourseIds, setBulkCourseIds] = useState<string[]>([]);
  const [bulkDeadline, setBulkDeadline] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  function openBulk(ex: any) {
    setBulkTarget(ex);
    setBulkCourseIds([]);
    setBulkDeadline('');
  }

  function toggleBulkCourse(id: string) {
    setBulkCourseIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  async function doBulkAssign() {
    if (!bulkTarget) return;
    if (!bulkCourseIds.length) {
      alert('Chọn ít nhất 1 khóa học');
      return;
    }
    setBulkSaving(true);
    try {
      const data = await apiFetch(`/exams/${bulkTarget.id}/assign-bulk`, {
        method: 'POST',
        body: JSON.stringify({
          courseIds: bulkCourseIds,
          deadline: bulkDeadline ? new Date(bulkDeadline).toISOString() : null,
        }),
      });
      setBulkTarget(null);
      showToast(`Đã giao đề cho ${data.created} khóa học (tạo bài giảng BTVN)`);
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBulkSaving(false);
    }
  }

  async function deleteExam(ex: any) {
    if (!confirm(`Xóa đề thi "${ex.title}"?`)) return;
    try {
      await apiFetch(`/exams/${ex.id}`, { method: 'DELETE' });
      showToast('Đã xóa đề thi');
      load();
    } catch (e: any) {
      showToast(e.message);
    }
  }

  return (
    <div className="page-container">
      {/* ====== THANH TIÊU ĐỀ ĐỎ ĐÔ ====== */}
      <div className="lm-band">
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: 'rgba(255,255,255,0.14)',
            border: '1px solid rgba(255,255,255,0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
          }}
        >
          📄
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2>
            Kho đề thi
            <span
              style={{
                fontSize: 11,
                marginLeft: 10,
                padding: '3px 10px',
                borderRadius: 999,
                background: 'rgba(232,163,61,0.35)',
                border: '1px solid rgba(240,179,85,0.55)',
                fontWeight: 600,
                verticalAlign: 'middle',
              }}
            >
              Quản lý đề · BTVN · Thi thử
            </span>
          </h2>
          <p className="lm-band-sub">
            Phân loại theo lớp, chủ đề, độ khó — gán đề vào bài giảng để học sinh làm BTVN online
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/teacher/exams/import" className="btn-lm ghost" style={{ textDecoration: 'none' }}>
            + Nhập đề thi
          </Link>
          <Link href="/teacher/exams/matrix" className="btn-lm amber" style={{ textDecoration: 'none' }}>
            + Tạo đề thi
          </Link>
        </div>
      </div>

      {/* ================= BỐ CỤC 2 CỘT: CÂY MỤC LỤC + NỘI DUNG ================= */}
      <div className="lm-layout">
        <aside className="lm-sidebar">
          <div className="lm-sidebar-head">Cây mục lục</div>
          <button
            type="button"
            className="lm-new-folder-btn"
            onClick={() => {
              setNewFolderName('');
              setNewFolderParent('');
              setShowFolderModal(true);
            }}
          >
            ＋ Tạo thư mục mới
          </button>
          <div className="lm-tree">
            <button
              type="button"
              className={`lm-tree-row all${!fFolderId ? ' active' : ''}`}
              onClick={() => setFFolderId('')}
            >
              <span className="lm-tree-toggle">▤</span>
              <span className="lm-tree-label">Tất cả đề thi</span>
              <span className="lm-tree-count">{exams.length}</span>
            </button>
            {(() => {
              const renderFolders = (parentId: string | null, depth: number): any[] => {
                const list = folders.filter((f) => (f.parentId || null) === parentId);
                return list.map((f) => {
                  const children = folders.filter((x) => x.parentId === f.id);
                  const expanded = expandedFolders.has(f.id);
                  return (
                    <div key={f.id}>
                      <button
                        type="button"
                        className={`lm-tree-row${fFolderId === f.id ? ' active' : ''}`}
                        style={{ paddingLeft: 12 + depth * 18 }}
                        onClick={() => {
                          setFFolderId(fFolderId === f.id ? '' : f.id);
                          // Bấm vào hàng thư mục có con → mở/thu nhánh luôn
                          if (children.length) {
                            setExpandedFolders((prev) => {
                              const next = new Set(prev);
                              if (next.has(f.id)) next.delete(f.id);
                              else next.add(f.id);
                              return next;
                            });
                          }
                        }}
                      >
                        <span className="lm-tree-toggle">
                          {children.length ? (expanded ? '∨' : '›') : ''}
                        </span>
                        <span className="lm-tree-label">{children.length ? '📁' : '📄'} {f.name}</span>
                        <span className="lm-tree-count">{f.examCount}</span>
                        <span
                          className="lm-tree-action"
                          title="Thêm thư mục con trong thư mục này"
                          onClick={(e) => {
                            e.stopPropagation();
                            setNewFolderName('');
                            setNewFolderParent(f.id);
                            setShowFolderModal(true);
                          }}
                        >
                          ＋
                        </span>
                        <span
                          className="lm-tree-action"
                          title="Đổi tên thư mục"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenameValue(f.name);
                            setRenameTarget(f);
                          }}
                        >
                          ✏️
                        </span>
                        <span
                          className="lm-tree-action"
                          title="Xóa thư mục"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFolder(f);
                          }}
                        >
                          🗑️
                        </span>
                      </button>
                      {expanded && renderFolders(f.id, depth + 1)}
                    </div>
                  );
                });
              };
              return renderFolders(null, 0);
            })()}
          </div>
        </aside>

        <div className="lm-main">

      {/* ====== Ô THỐNG KÊ NHANH ====== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 14 }}>
        <div className="lm-stat" style={{ background: 'var(--color-surface)', border: '1px solid var(--lm-line)' }}>
          <span style={{ color: 'var(--color-muted)' }}>Tổng đề thi</span>
          <b style={{ color: 'var(--lm-maroon)' }}>{exams.length}</b>
        </div>
        <div className="lm-stat" style={{ background: 'var(--color-surface)', border: '1px solid var(--lm-line)' }}>
          <span style={{ color: 'var(--color-muted)' }}>Công khai</span>
          <b style={{ color: 'var(--lm-maroon)' }}>{exams.filter((e) => e.status === 'PUBLISHED').length}</b>
        </div>
        <div className="lm-stat" style={{ background: 'var(--color-surface)', border: '1px solid var(--lm-line)' }}>
          <span style={{ color: 'var(--color-muted)' }}>Bản nháp</span>
          <b style={{ color: 'var(--lm-maroon)' }}>{exams.filter((e) => e.status !== 'PUBLISHED').length}</b>
        </div>
        <div className="lm-stat" style={{ background: 'var(--color-surface)', border: '1px solid var(--lm-line)' }}>
          <span style={{ color: 'var(--color-muted)' }}>Template</span>
          <b style={{ color: 'var(--lm-maroon)' }}>{exams.filter((e) => e.isTemplate).length}</b>
        </div>
        <div className="lm-stat" style={{ background: 'var(--color-surface)', border: '1px solid var(--lm-line)' }}>
          <span style={{ color: 'var(--color-muted)' }}>Tổng câu hỏi</span>
          <b style={{ color: 'var(--lm-maroon)' }}>{exams.reduce((s, e) => s + (e._count?.items ?? 0), 0)}</b>
        </div>
        <div className="lm-stat" style={{ background: 'var(--color-surface)', border: '1px solid var(--lm-line)' }}>
          <span style={{ color: 'var(--color-muted)' }}>Lượt làm bài</span>
          <b style={{ color: 'var(--lm-maroon)' }}>{exams.reduce((s, e) => s + (e._count?.attempts ?? 0), 0)}</b>
        </div>
      </div>

      {/* ====== BỘ LỌC ====== */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <select
          value={fGrade}
          onChange={(e) => setFGrade(e.target.value)}
          style={{ padding: '8px 12px', border: '1.5px solid var(--lm-line-2)', borderRadius: 6, fontSize: 12.5, fontWeight: 700, background: 'var(--color-surface)' }}
        >
          <option value="">🎓 Tất cả lớp</option>
          <option value="10">Lớp 10</option>
          <option value="11">Lớp 11</option>
          <option value="12">Lớp 12</option>
        </select>
        <select
          value={fTopic}
          onChange={(e) => setFTopic(e.target.value)}
          style={{ padding: '8px 12px', border: '1.5px solid var(--lm-line-2)', borderRadius: 6, fontSize: 12.5, fontWeight: 700, background: 'var(--color-surface)', maxWidth: 220 }}
        >
          <option value="">📚 Tất cả chủ đề</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <select
          value={fDifficulty}
          onChange={(e) => setFDifficulty(e.target.value)}
          style={{ padding: '8px 12px', border: '1.5px solid var(--lm-line-2)', borderRadius: 6, fontSize: 12.5, fontWeight: 700, background: 'var(--color-surface)' }}
        >
          <option value="">🎯 Tất cả độ khó</option>
          <option value="NHAN_BIET">Nhận biết</option>
          <option value="THONG_HIEU">Thông hiểu</option>
          <option value="VAN_DUNG">Vận dụng</option>
          <option value="VAN_DUNG_CAO">Vận dụng cao</option>
        </select>
        <button
          type="button"
          className={`toolbar-btn${fTemplateOnly ? ' active' : ''}`}
          onClick={() => setFTemplateOnly(!fTemplateOnly)}
        >
          📋 Chỉ template
        </button>
        <span className="pager-pill" style={{ marginLeft: 'auto' }}>
          {filtered.length} đề
        </span>
      </div>

      {loading ? (
        <p style={{ color: 'var(--color-muted)' }}>Đang tải…</p>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 44, color: 'var(--color-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📄</div>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>Không có đề thi phù hợp.</p>
          <p style={{ fontSize: 13, marginTop: 4, marginBottom: 12 }}>Bỏ bớt bộ lọc hoặc tạo đề thi mới.</p>
          <Link href="/teacher/exams/matrix" className="btn-lm amber" style={{ display: 'inline-block', textDecoration: 'none' }}>
            + Tạo đề thi (ma trận)
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((ex) => (
            <div
              key={ex.id}
              className="q-card"
              style={{ borderLeft: '5px solid var(--lm-maroon)' }}
            >
              <div className="q-card-head">
                <span className="q-no">📄 {ex.title}</span>
                {ex.status === 'PUBLISHED' ? (
                  <span className="q-type-badge" style={{ background: 'var(--color-success)', color: 'var(--color-success-ink)' }}>Công khai</span>
                ) : (
                  <span className="q-type-badge" style={{ background: 'var(--color-track)', color: 'var(--color-muted)' }}>Bản nháp</span>
                )}
                {ex.isTemplate && <span className="q-type-badge">📋 Template</span>}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Link
                    href={`/teacher/exams/${ex.id}`}
                    className="q-level-pill"
                    style={{ textDecoration: 'none', borderStyle: 'dashed' }}
                  >
                    🔍 Xem chi tiết
                  </Link>
                </div>
              </div>
              <div className="q-card-body">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {ex.grade && <span className="badge">🎓 Lớp {ex.grade}</span>}
                  {ex.topic && <span className="badge badge-accent">{ex.topic.name}</span>}
                  {ex.folder && <span className="badge badge-warning">📁 {ex.folder.name}</span>}
                  {ex.difficulty && <span className="badge badge-warning">{DIFF_LABEL[ex.difficulty] || ex.difficulty}</span>}
                  <span className="badge">{ex._count?.items ?? 0} câu</span>
                  <span className="badge">{ex.duration} phút</span>
                </div>

                {ex.lessons?.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                    {ex.lessons.map((l: any) => (
                      <div key={l.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span className="badge badge-accent" style={{ fontSize: 10 }}>
                          BTVN · {l.course?.title || ''} — {l.title.slice(0, 40)}
                        </span>
                        <button
                          onClick={() => unassign(ex, l.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--color-danger)',
                            cursor: 'pointer',
                            fontSize: 12,
                            padding: '0 4px',
                          }}
                          title="Bỏ gán"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mono" style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 10 }}>
                  {ex._count?.attempts ?? 0} lượt làm ·{' '}
                  {new Date(ex.createdAt).toLocaleDateString('vi-VN')}
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {ex.isTemplate && (
                    <button
                      type="button"
                      className="lm-filter-btn on"
                      style={{ padding: '6px 11px', fontSize: 12 }}
                      onClick={() => createFromTemplate(ex)}
                    >
                      ⚡ Tạo đề từ template
                    </button>
                  )}
                  <button type="button" className="lm-filter-btn" style={{ padding: '6px 11px', fontSize: 12 }} onClick={downloadUrl(`/api/exams/${ex.id}/compile`, 'de_thi.pdf')}>
                    PDF đề
                  </button>
                  <button type="button" className="lm-filter-btn" style={{ padding: '6px 11px', fontSize: 12 }} onClick={downloadUrl(`/api/exams/${ex.id}/answers-pdf`, 'dap_an.pdf')}>
                    PDF đáp án
                  </button>
                  <button type="button" className="lm-filter-btn" style={{ padding: '6px 11px', fontSize: 12 }} onClick={downloadUrl(`/api/exams/${ex.id}/tex`, 'de_thi.tex')}>
                    .tex
                  </button>
                  <button type="button" className="lm-filter-btn" style={{ padding: '6px 11px', fontSize: 12 }} onClick={() => openAssign(ex)}>
                    🔗 Gán vào bài học
                  </button>
                  <button
                    type="button"
                    className="lm-filter-btn"
                    style={{ padding: '6px 11px', fontSize: 12 }}
                    onClick={() => openEdit(ex)}
                  >
                    ✏️ Sửa
                  </button>
                  <button
                    type="button"
                    className="lm-filter-btn"
                    style={{ padding: '6px 11px', fontSize: 12 }}
                    onClick={() => {
                      setMoveFolderId(ex.folderId || '');
                      setMoveTarget(ex);
                    }}
                  >
                    📁 Di chuyển
                  </button>
                  <button type="button" className="lm-filter-btn" style={{ padding: '6px 11px', fontSize: 12 }} onClick={() => openBulk(ex)}>
                    📤 Giao hàng loạt
                  </button>
                  <button
                    type="button"
                    className="lm-filter-btn"
                    style={{ padding: '6px 11px', fontSize: 12, color: 'var(--color-danger)', borderColor: 'color-mix(in oklch, var(--color-danger) 45%, transparent)' }}
                    onClick={() => deleteExam(ex)}
                  >
                    🗑️ Xóa
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

        </div>
        {/* ===== hết vùng nội dung ===== */}
      </div>
      {/* ===== hết bố cục 2 cột ===== */}

      {/* Modal tạo thư mục */}
      {showFolderModal && (
        <div className="lm-detail-backdrop" onClick={() => setShowFolderModal(false)}>
          <div className="lm-detail" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="lm-detail-head">
              <span className="q-no">📁 Tạo thư mục mới</span>
              <div style={{ marginLeft: 'auto' }}>
                <button type="button" className="lm-detail-close" onClick={() => setShowFolderModal(false)}>✕</button>
              </div>
            </div>
            <div className="lm-detail-body">
              <div className="form-group">
                <label>Tên thư mục *</label>
                <input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="VD: Đề giữa kỳ, Đề HSG, Đề ôn thi THPT..."
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Nằm trong thư mục mẹ (tùy chọn — chọn mẹ trước, con lùi vào sau)</label>
                <select value={newFolderParent} onChange={(e) => setNewFolderParent(e.target.value)}>
                  <option value="">— Thư mục gốc —</option>
                  {folderTreeOptions().map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
              </div>
              <button type="button" className="toolbar-btn" style={{ background: 'var(--lm-maroon)', borderColor: 'var(--lm-maroon)', color: '#fff', width: '100%', justifyContent: 'center' }} onClick={createFolder}>
                ✅ Tạo thư mục
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal di chuyển đề thi */}
      {moveTarget && (
        <div className="lm-detail-backdrop" onClick={() => setMoveTarget(null)}>
          <div className="lm-detail" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="lm-detail-head">
              <span className="q-no">📁 Di chuyển đề thi</span>
              <div style={{ marginLeft: 'auto' }}>
                <button type="button" className="lm-detail-close" onClick={() => setMoveTarget(null)}>✕</button>
              </div>
            </div>
            <div className="lm-detail-body">
              <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 10 }}>
                Chuyển <strong>{moveTarget.title}</strong> sang thư mục:
              </p>
              <div className="form-group">
                <select value={moveFolderId} onChange={(e) => setMoveFolderId(e.target.value)}>
                  <option value="">— Không thư mục —</option>
                  {folderTreeOptions().map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
              </div>
              <button type="button" className="toolbar-btn" style={{ background: 'var(--lm-maroon)', borderColor: 'var(--lm-maroon)', color: '#fff', width: '100%', justifyContent: 'center' }} onClick={moveExam}>
                ✅ Di chuyển
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal sửa đề thi */}
      {editTarget && (
        <div className="lm-detail-backdrop" onClick={() => setEditTarget(null)}>
          <div className="lm-detail" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="lm-detail-head">
              <span className="q-no">✏️ Sửa đề thi</span>
              <div style={{ marginLeft: 'auto' }}>
                <button type="button" className="lm-detail-close" onClick={() => setEditTarget(null)}>✕</button>
              </div>
            </div>
            <div className="lm-detail-body">
              <div className="form-group">
                <label>Tên đề thi *</label>
                <input
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: 1, minWidth: 110 }}>
                  <label>Thời gian (phút)</label>
                  <input
                    type="number"
                    value={editForm.duration}
                    onChange={(e) => setEditForm({ ...editForm, duration: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ flex: 1, minWidth: 100 }}>
                  <label>Lớp</label>
                  <select
                    value={editForm.grade}
                    onChange={(e) => setEditForm({ ...editForm, grade: e.target.value })}
                  >
                    <option value="">— Không xác định —</option>
                    <option value="10">Lớp 10</option>
                    <option value="11">Lớp 11</option>
                    <option value="12">Lớp 12</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Chủ đề (phân loại)</label>
                <select
                  value={editForm.topicId}
                  onChange={(e) => setEditForm({ ...editForm, topicId: e.target.value })}
                >
                  <option value="">— Không phân loại —</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Độ khó chung</label>
                <select
                  value={editForm.difficulty}
                  onChange={(e) => setEditForm({ ...editForm, difficulty: e.target.value })}
                >
                  <option value="">— Không xác định —</option>
                  <option value="NHAN_BIET">Nhận biết</option>
                  <option value="THONG_HIEU">Thông hiểu</option>
                  <option value="VAN_DUNG">Vận dụng</option>
                  <option value="VAN_DUNG_CAO">Vận dụng cao</option>
                </select>
              </div>
              <div className="form-group">
                <label>📁 Thư mục (Kho đề thi)</label>
                <select
                  value={editForm.folderId}
                  onChange={(e) => setEditForm({ ...editForm, folderId: e.target.value })}
                >
                  <option value="">— Không thư mục —</option>
                  {folderTreeOptions().map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 12 }}>
                <input
                  type="checkbox"
                  checked={!!editForm.published}
                  onChange={(e) => setEditForm({ ...editForm, published: e.target.checked })}
                  style={{ width: 'auto' }}
                />
                📢 Công khai cho học sinh thi thử
              </label>
              <button
                type="button"
                className="toolbar-btn"
                disabled={editSaving}
                style={{ background: 'var(--lm-maroon)', borderColor: 'var(--lm-maroon)', color: '#fff', width: '100%', justifyContent: 'center' }}
                onClick={saveEditExam}
              >
                {editSaving ? 'Đang lưu…' : '✅ Lưu thay đổi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal đổi tên thư mục */}
      {renameTarget && (
        <div className="lm-detail-backdrop" onClick={() => setRenameTarget(null)}>
          <div className="lm-detail" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="lm-detail-head">
              <span className="q-no">✏️ Đổi tên thư mục</span>
              <div style={{ marginLeft: 'auto' }}>
                <button type="button" className="lm-detail-close" onClick={() => setRenameTarget(null)}>✕</button>
              </div>
            </div>
            <div className="lm-detail-body">
              <div className="form-group">
                <label>Tên thư mục *</label>
                <input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') renameFolder();
                  }}
                />
              </div>
              <button type="button" className="toolbar-btn" style={{ background: 'var(--lm-maroon)', borderColor: 'var(--lm-maroon)', color: '#fff', width: '100%', justifyContent: 'center' }} onClick={renameFolder}>
                ✅ Lưu tên mới
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal gán vào bài học */}
      {assignTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'color-mix(in oklch, var(--color-ink) 45%, transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1500,
            padding: 20,
          }}
          onClick={() => setAssignTarget(null)}
        >
          <div className="auth-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h1 style={{ fontSize: 22 }}>Gán BTVN</h1>
            <p className="subtitle">
              Gán đề <strong>{assignTarget.title}</strong> vào bài giảng — học sinh sẽ làm bài ngay trong khóa học.
            </p>
            <div className="form-group">
              <label>Khóa học</label>
              <select value={assignCourse} onChange={(e) => pickCourse(e.target.value)}>
                <option value="">— Chọn khóa học —</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Bài giảng</label>
              <select value={assignLesson} onChange={(e) => setAssignLesson(e.target.value)}>
                <option value="">— Chọn bài giảng —</option>
                {lessons.map((l) => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" style={{ flex: 1 }} onClick={doAssign} disabled={assigning}>
                {assigning ? 'Đang gán…' : 'Gán BTVN'}
              </button>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setAssignTarget(null)}>
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal giao bài hàng loạt */}
      {bulkTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'color-mix(in oklch, var(--color-ink) 45%, transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1500,
            padding: 20,
          }}
          onClick={() => setBulkTarget(null)}
        >
          <div
            className="auth-card"
            style={{ maxWidth: 520, width: '100%', maxHeight: '86vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="logo">📤</div>
            <h1>Giao bài hàng loạt</h1>
            <p className="subtitle">
              Đề <strong>{bulkTarget.title}</strong> sẽ được thêm làm bài giảng BTVN vào mỗi khóa học đã chọn.
            </p>

            <div className="form-group">
              <label>Chọn khóa học ({bulkCourseIds.length} đã chọn)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                {courses.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>Chưa có khóa học nào.</p>
                ) : (
                  courses.map((c) => (
                    <label
                      key={c.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 13,
                        padding: '8px 10px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        background: bulkCourseIds.includes(c.id)
                          ? 'color-mix(in oklch, var(--color-accent) 12%, var(--color-paper))'
                          : 'var(--color-paper-2)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={bulkCourseIds.includes(c.id)}
                        onChange={() => toggleBulkCourse(c.id)}
                        style={{ width: 'auto' }}
                      />
                      {c.title}
                      <span className="mono" style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                        ({c._count?.enrollments ?? 0} HS)
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="form-group">
              <label>⏰ Hạn nộp (để trống = không giới hạn)</label>
              <input
                type="datetime-local"
                value={bulkDeadline}
                onChange={(e) => setBulkDeadline(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn" style={{ flex: 1 }} onClick={doBulkAssign} disabled={bulkSaving}>
                {bulkSaving ? 'Đang giao…' : `Giao cho ${bulkCourseIds.length} khóa học`}
              </button>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setBulkTarget(null)}>
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
