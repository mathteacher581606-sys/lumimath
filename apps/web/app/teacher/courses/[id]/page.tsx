'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, getUser } from '@/lib/api';
import LatexRenderer from '@/components/LatexRenderer';
import BackButton from '@/components/BackButton';
import LessonComments from '@/components/LessonComments';
import ImageAnnotator from '@/components/ImageAnnotator';

export default function TeacherCourseDetail() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.id as string;

  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Form bài giảng
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    chapter: '',
    newChapter: '',
    order: '',
    youtubeUrl: '',
    content: '',
    duration: '',
    pdfLinks: [] as string[],
    videos: [] as { title: string; url: string }[],
    materials: [] as { title: string; url: string }[],
    examId: '',
    deadline: '',
    quizOn: false,
    quizExamId: '',
    quizCount: '5',
    quizPass: '50',
    quizNeg: false,
    quizNegW: '0',
    quizMax: '0',
    preview: false,
  });
  const [saving, setSaving] = useState(false);
  const [openLesson, setOpenLesson] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [myExams, setMyExams] = useState<any[]>([]);

  // Sửa / xóa khóa học
  const [showEditCourse, setShowEditCourse] = useState(false);
  const [courseForm, setCourseForm] = useState({
    title: '',
    description: '',
    grade: '',
    password: '',
    isPublished: true,
    sequential: false,
    coverUrl: '',
    bannerUrl: '',
  });
  const [savingCourse, setSavingCourse] = useState(false);
  const [deleteCourseConfirm, setDeleteCourseConfirm] = useState(false);

  // Quản lý chương (sửa tên + sắp xếp lại thứ tự)
  const [chapterEditor, setChapterEditor] = useState(false);
  const [chapterList, setChapterList] = useState<{ orig: string; name: string }[]>([]);
  const [savingChapters, setSavingChapters] = useState(false);

  // Quản lý học sinh
  const [students, setStudents] = useState<any[] | null>(null);
  const [showStudents, setShowStudents] = useState(false);
  const [removingStudent, setRemovingStudent] = useState<string | null>(null);
  // Nhập học sinh từ Excel
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  // Sao chép bài giảng từ khóa học khác
  const [showCopy, setShowCopy] = useState(false);
  const [myCourses, setMyCourses] = useState<any[]>([]);
  const [copySourceId, setCopySourceId] = useState('');
  const [sourceLessons, setSourceLessons] = useState<any[]>([]);
  const [selectedLessonIds, setSelectedLessonIds] = useState<string[]>([]);
  const [copying, setCopying] = useState(false);
  const [copyResult, setCopyResult] = useState<string | null>(null);
  // Trợ giảng
  const [assistants, setAssistants] = useState<any[]>([]);
  const [showAssistants, setShowAssistants] = useState(false);
  const [assistantEmail, setAssistantEmail] = useState('');
  const [addingAssistant, setAddingAssistant] = useState(false);
  const [assistantMsg, setAssistantMsg] = useState<string | null>(null);

  const currentUserId = getUser()?.id || '';
  const isOwner = !course || course.teacherId === currentUserId;

  async function loadAssistants() {
    try {
      setAssistants(await apiFetch(`/courses/${courseId}/assistants`));
    } catch (e: any) {
      showToast('❌ ' + e.message);
    }
  }

  async function addAssistant() {
    const email = assistantEmail.trim();
    if (!email) return;
    setAddingAssistant(true);
    setAssistantMsg(null);
    try {
      await apiFetch(`/courses/${courseId}/assistants`, {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setAssistantEmail('');
      await loadAssistants();
      setAssistantMsg('✅ Đã thêm trợ giảng');
    } catch (e: any) {
      setAssistantMsg('❌ ' + e.message);
    } finally {
      setAddingAssistant(false);
    }
  }

  async function removeAssistant(assistantId: string) {
    if (!confirm('Gỡ trợ giảng này khỏi khóa học?')) return;
    try {
      await apiFetch(`/courses/${courseId}/assistants/${assistantId}`, {
        method: 'DELETE',
      });
      await loadAssistants();
    } catch (e: any) {
      showToast('❌ ' + e.message);
    }
  }

  async function openCopyPanel() {
    setShowCopy(!showCopy);
    if (!showCopy && myCourses.length === 0) {
      try {
        const list = await apiFetch('/courses/my');
        setMyCourses((list || []).filter((c: any) => c.id !== courseId));
      } catch (e: any) {
        showToast('❌ ' + e.message);
      }
    }
  }

  async function loadSourceLessons(courseId: string) {
    setCopySourceId(courseId);
    setSelectedLessonIds([]);
    setCopyResult(null);
    if (!courseId) {
      setSourceLessons([]);
      return;
    }
    try {
      const c = await apiFetch(`/courses/${courseId}`);
      setSourceLessons(c?.lessons || []);
    } catch (e: any) {
      showToast('❌ ' + e.message);
      setSourceLessons([]);
    }
  }

  function toggleCopyLesson(id: string) {
    setSelectedLessonIds((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : [...p, id],
    );
  }

  function toggleAll() {
    if (selectedLessonIds.length === sourceLessons.length) {
      setSelectedLessonIds([]);
    } else {
      setSelectedLessonIds(sourceLessons.map((l: any) => l.id));
    }
  }

  async function doCopyLessons() {
    if (!copySourceId || selectedLessonIds.length === 0) {
      showToast('⚠️ Chọn khóa học nguồn và ít nhất 1 bài giảng');
      return;
    }
    setCopying(true);
    setCopyResult(null);
    try {
      const r = await apiFetch(`/courses/${courseId}/copy-lessons`, {
        method: 'POST',
        body: JSON.stringify({
          sourceCourseId: copySourceId,
          lessonIds: selectedLessonIds,
        }),
      });
      setCopyResult(`✅ Đã sao chép ${r.copied} bài giảng`);
      setSelectedLessonIds([]);
      await loadCourse();
    } catch (e: any) {
      setCopyResult('❌ ' + e.message);
    } finally {
      setCopying(false);
    }
  }

  async function downloadImportTemplate() {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `/api/courses/${courseId}/import-students/template`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error('Không tải được file mẫu');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mau-nhap-hoc-sinh-khoa-hoc.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      showToast('❌ ' + e.message);
    }
  }

  async function handleImportStudents(file: File) {
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/courses/${courseId}/import-students`, {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          Authorization: `Bearer ${token}`,
        },
        body: file,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setImportResult({ error: data.message || 'Nhập thất bại' });
      } else {
        setImportResult(data);
        await loadStudents();
        showToast('✅ Đã nhập xong');
      }
    } catch (e: any) {
      setImportResult({ error: e.message });
    } finally {
      setImporting(false);
    }
  }

  async function loadStudents() {
    try {
      const data = await apiFetch(`/courses/${courseId}/students`);
      setStudents(data);
    } catch (e: any) {
      console.error(e);
    }
  }

  async function removeStudent(studentId: string, name: string) {
    if (!confirm(`Gỡ học sinh "${name}" khỏi khóa học?`)) return;
    setRemovingStudent(studentId);
    try {
      await apiFetch(`/courses/${courseId}/students/${studentId}`, {
        method: 'DELETE',
      });
      await loadStudents();
      showToast(`Đã gỡ học sinh ${name}`);
    } catch (e: any) {
      showToast(e.message);
    } finally {
      setRemovingStudent(null);
    }
  }

  async function resetStudentPassword(student: any) {
    const newPassword = prompt(
      `Nhập mật khẩu mới cho học sinh "${student.fullName}" (tối thiểu 6 ký tự):`,
    );
    if (!newPassword) return;
    setRemovingStudent(student.id);
    try {
      const data = await apiFetch('/auth/reset-student-password', {
        method: 'POST',
        body: JSON.stringify({ studentId: student.id, newPassword }),
      });
      showToast(`Đã đặt lại mật khẩu cho ${student.fullName}`);
    } catch (e: any) {
      showToast(e.message);
    } finally {
      setRemovingStudent(null);
    }
  }

  // Sửa thông tin tài khoản học sinh đã đăng ký
  const [editingStudent, setEditingStudent] = useState<any | null>(null);
  const [studentForm, setStudentForm] = useState({ fullName: '', email: '', className: '', grade: '' });
  const [savingStudent, setSavingStudent] = useState(false);

  function openEditStudent(s: any) {
    setEditingStudent(s);
    setStudentForm({
      fullName: s.student.fullName || '',
      email: s.student.email || '',
      className: s.student.className || '',
      grade: s.student.grade != null ? String(s.student.grade) : '',
    });
  }

  async function saveEditStudent() {
    if (!editingStudent) return;
    setSavingStudent(true);
    try {
      await apiFetch(`/courses/${courseId}/students/${editingStudent.student.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...studentForm,
          grade: studentForm.grade === '' ? null : Number(studentForm.grade),
        }),
      });
      showToast('Đã cập nhật thông tin học sinh');
      setEditingStudent(null);
      await loadStudents();
    } catch (e: any) {
      showToast(e.message);
    } finally {
      setSavingStudent(false);
    }
  }

  // Bảng điểm khóa học
  const [courseResults, setCourseResults] = useState<any>(null);
  const [showResults, setShowResults] = useState(false);

  // Thống kê hoạt động học sinh
  const [activity, setActivity] = useState<any[] | null>(null);
  const [showActivity, setShowActivity] = useState(false);
  const [lessonStats, setLessonStats] = useState<Record<string, { viewed: number; completed: number }>>({});

  async function loadActivity() {
    try {
      setActivity(await apiFetch(`/courses/${courseId}/activity`));
    } catch (e: any) {
      console.error(e);
    }
  }

  async function loadCourseResults() {
    try {
      const data = await apiFetch(`/courses/${courseId}/results`);
      setCourseResults(data);
    } catch (e: any) {
      console.error(e);
    }
  }

  async function exportCourseResults(format: 'pdf' | 'xlsx') {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `/api/courses/${courseId}/results/export?format=${format}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(String(err.message || 'Xuất thất bại').slice(-300));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = format === 'pdf' ? 'bang-diem-khoa-hoc.pdf' : 'bang-diem-khoa-hoc.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert('Không xuất được: ' + e.message);
    }
  }

  function openEditCourse() {
    setCourseForm({
      title: course?.title || '',
      description: course?.description || '',
      grade: course?.grade ? String(course.grade) : '',
      password: '',
      isPublished: !!course?.isPublished,
      sequential: !!course?.sequential,
      coverUrl: course?.coverUrl || '',
      bannerUrl: course?.bannerUrl || '',
    });
    setShowEditCourse(true);
  }

  async function saveCourse(e: React.FormEvent) {
    e.preventDefault();
    setSavingCourse(true);
    try {
      const body: any = {
        title: courseForm.title,
        description: courseForm.description,
        isPublished: courseForm.isPublished,
        sequential: !!courseForm.sequential,
        coverUrl: courseForm.coverUrl || null,
        bannerUrl: courseForm.bannerUrl || null,
      };
      if (courseForm.grade) body.grade = Number(courseForm.grade);
      if (courseForm.password) body.password = courseForm.password;
      await apiFetch(`/courses/${courseId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setShowEditCourse(false);
      showToast('Đã cập nhật khóa học');
      loadCourse();
    } catch (e: any) {
      showToast(e.message);
    } finally {
      setSavingCourse(false);
    }
  }

  async function confirmDeleteCourse() {
    try {
      await apiFetch(`/courses/${courseId}`, { method: 'DELETE' });
      showToast('Đã xóa khóa học');
      router.push('/teacher');
    } catch (e: any) {
      showToast(e.message);
      setDeleteCourseConfirm(false);
    }
  }

  // Bài tập tự luận
  const [exercisesByLesson, setExercisesByLesson] = useState<Record<string, any[]>>({});
  const [showExForm, setShowExForm] = useState<string | null>(null);
  const [exForm, setExForm] = useState({ prompt: '', rubric: '', maxScore: '10' });
  const [exSaving, setExSaving] = useState(false);
  const [openSubmissions, setOpenSubmissions] = useState<string | null>(null);

  // Chốt điểm bài nộp
  const [reviewSub, setReviewSub] = useState<any>(null);
  const [reviewScore, setReviewScore] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [annotatingSrc, setAnnotatingSrc] = useState<string | null>(null);
  const [annotatingBusy, setAnnotatingBusy] = useState(false);

  function openReviewSubmission(ex: any, s: any) {
    setReviewSub({ exercise: ex, submission: s });
    setReviewScore(
      s.teacherScore !== null && s.teacherScore !== undefined
        ? String(s.teacherScore)
        : s.aiScore !== null && s.aiScore !== undefined
          ? String(s.aiScore)
          : '',
    );
    setReviewNote(s.teacherNote || '');
  }

  // Nhận ảnh đã sửa từ ImageAnnotator → upload → lưu vào bài nộp
  async function handleAnnotatedBlob(blob: Blob) {
    if (!reviewSub) return;
    setAnnotatingBusy(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/uploads/image', {
        method: 'POST',
        headers: {
          'Content-Type': 'image/png',
          Authorization: `Bearer ${token}`,
        },
        body: blob,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Không lưu được ảnh' }));
        throw new Error(err.message || 'Không lưu được ảnh');
      }
      const data = await res.json();
      await apiFetch(
        `/exercises/${reviewSub.exercise.id}/submissions/${reviewSub.submission.id}/annotations`,
        {
          method: 'POST',
          body: JSON.stringify({ urls: [data.url] }),
        },
      );
      setReviewSub({
        ...reviewSub,
        submission: {
          ...reviewSub.submission,
          annotatedUrls: [...(reviewSub.submission.annotatedUrls || []), data.url],
        },
      });
      setAnnotatingSrc(null);
      showToast('Đã lưu ảnh sửa bài');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setAnnotatingBusy(false);
    }
  }

  async function saveReview() {
    if (!reviewSub) return;
    const { exercise, submission } = reviewSub;
    const score = Number(reviewScore);
    if (isNaN(score) || score < 0 || score > exercise.maxScore) {
      alert(`Điểm phải từ 0 đến ${exercise.maxScore}`);
      return;
    }
    setReviewSaving(true);
    try {
      await apiFetch(
        `/exercises/${exercise.id}/submissions/${submission.id}/review`,
        {
          method: 'POST',
          body: JSON.stringify({
            teacherScore: score,
            teacherNote: reviewNote,
          }),
        },
      );
      showToast('Đã chốt điểm và gửi nhận xét cho học sinh');
      setReviewSub(null);
      const lessonId = exercise.lessonId;
      loadExercises(lessonId);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setReviewSaving(false);
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function loadCourse() {
    setLoading(true);
    try {
      const data = await apiFetch(`/courses/${courseId}`);
      setCourse(data);
      // Tự mở bài giảng đầu tiên (bố cục sidebar kiểu Udemy)
      const first = data.lessons?.[0];
      if (first && !openLesson) {
        setOpenLesson(first.id);
        loadExercises(first.id);
      }
      apiFetch(`/courses/${courseId}/lesson-stats`)
        .then(setLessonStats)
        .catch(() => {});
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCourse();
    apiFetch('/exams')
      .then((data) => setMyExams(data))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  async function loadExercises(lessonId: string) {
    try {
      const data = await apiFetch(`/courses/${courseId}/lessons/${lessonId}/exercises`);
      setExercisesByLesson((prev) => ({ ...prev, [lessonId]: data }));
    } catch (e: any) {
      console.error(e);
    }
  }

  function toggleLesson(lessonId: string) {
    const opening = openLesson !== lessonId;
    setOpenLesson(opening ? lessonId : null);
    if (opening) loadExercises(lessonId);
  }

  async function createExercise(lessonId: string, e: React.FormEvent) {
    e.preventDefault();
    setExSaving(true);
    try {
      await apiFetch(`/courses/${courseId}/lessons/${lessonId}/exercises`, {
        method: 'POST',
        body: JSON.stringify({
          prompt: exForm.prompt,
          rubric: exForm.rubric || undefined,
          maxScore: Number(exForm.maxScore) || 10,
        }),
      });
      setExForm({ prompt: '', rubric: '', maxScore: '10' });
      setShowExForm(null);
      showToast('Đã thêm bài tập tự luận');
      loadExercises(lessonId);
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setExSaving(false);
    }
  }

  async function deleteExercise(lessonId: string, exerciseId: string) {
    if (!confirm('Xóa bài tập này?')) return;
    try {
      await apiFetch(`/courses/${courseId}/lessons/${lessonId}/exercises/${exerciseId}`, {
        method: 'DELETE',
      });
      showToast('Đã xóa bài tập');
      loadExercises(lessonId);
    } catch (err: any) {
      showToast(err.message);
    }
  }

  // ===== Chọn câu tự luận từ ngân hàng đề =====
  const [bankPicker, setBankPicker] = useState<string | null>(null); // lessonId
  const [bankQuestions, setBankQuestions] = useState<any[]>([]);
  const [bankSearch, setBankSearch] = useState('');
  const [bankSelected, setBankSelected] = useState<string[]>([]);
  const [bankMaxScore, setBankMaxScore] = useState('10');
  const [bankLoading, setBankLoading] = useState(false);

  async function openBankPicker(lessonId: string) {
    setBankPicker(lessonId);
    setBankSelected([]);
    setBankSearch('');
    setBankMaxScore('10');
    await searchBank('');
  }

  async function searchBank(q: string) {
    setBankLoading(true);
    try {
      const data = await apiFetch(
        `/bank/questions?type=ESSAY&limit=100&q=${encodeURIComponent(q)}`,
      );
      setBankQuestions(data);
    } catch (e: any) {
      showToast(e.message);
    } finally {
      setBankLoading(false);
    }
  }

  function toggleBankSelect(id: string) {
    setBankSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function assignFromBank() {
    if (!bankPicker) return;
    if (!bankSelected.length) {
      showToast('Chọn ít nhất 1 câu hỏi');
      return;
    }
    setExSaving(true);
    try {
      await apiFetch(`/courses/${courseId}/lessons/${bankPicker}/exercises/from-bank`, {
        method: 'POST',
        body: JSON.stringify({
          questionIds: bankSelected,
          maxScore: Number(bankMaxScore) || 10,
        }),
      });
      showToast(`Đã gán ${bankSelected.length} câu tự luận làm BTVN`);
      setBankPicker(null);
      loadExercises(bankPicker);
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setExSaving(false);
    }
  }

  // ===== Block editor (soạn bài theo khối) =====
  const [useBlocks, setUseBlocks] = useState(false);
  const [blocks, setBlocks] = useState<{ id: string; type: string; content: string }[]>([]);

  function serializeBlocks(): string {
    return blocks
      .map((b) => {
        if (b.type === 'latex') return `$$\n${b.content}\n$$`;
        if (b.type === 'callout') return `> **📌 Lưu ý:** ${b.content.replace(/\n/g, '\n> ')}`;
        if (b.type === 'image') return `![ảnh](${b.content})`;
        return b.content;
      })
      .join('\n\n');
  }

  function addBlock(type: string) {
    setBlocks((prev) => [
      ...prev,
      { id: Math.random().toString(36).slice(2), type, content: '' },
    ]);
  }

  function updateBlock(id: string, patch: any) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function moveBlock(id: string, dir: -1 | 1) {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      const swap = prev[idx + dir];
      if (!swap) return prev;
      const next = [...prev];
      [next[idx], next[idx + dir]] = [next[idx + dir], next[idx]];
      return next;
    });
  }

  function removeBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }

  function resetForm() {
    setForm({ title: '', chapter: '', newChapter: '', order: '', youtubeUrl: '', content: '', duration: '', pdfLinks: [], videos: [], materials: [], examId: '', deadline: '', quizOn: false, quizExamId: '', quizCount: '5', quizPass: '50', quizNeg: false, quizNegW: '0', quizMax: '0', preview: false });
    setEditingId(null);
  }

  function startAdd() {
    resetForm();
    setUseBlocks(false);
    setBlocks([]);
    setShowForm(true);
  }

  function startEdit(lesson: any) {
    setEditingId(lesson.id);
    const existingBlocks = Array.isArray(lesson.blocks) ? lesson.blocks : null;
    setUseBlocks(!!existingBlocks);
    setBlocks(
      existingBlocks ||
        (lesson.content
          ? [{ id: 'c0', type: 'text', content: lesson.content || '' }]
          : []),
    );
    setForm({
      title: lesson.title || '',
      chapter: lesson.chapter || '',
      newChapter: '',
      order: lesson.order != null ? String(lesson.order) : '',
      youtubeUrl: lesson.youtubeUrl || '',
      content: lesson.content || '',
      duration: lesson.duration ? String(lesson.duration) : '',
      pdfLinks: lesson.pdfLinks || [],
      videos: Array.isArray(lesson.videos) ? lesson.videos : [],
      materials: Array.isArray(lesson.materials) ? lesson.materials : [],
      examId: lesson.examId || '',
      deadline: lesson.deadline ? new Date(lesson.deadline).toISOString().slice(0, 16) : '',
      quizOn: false,
      quizExamId: '',
      quizCount: '5',
      quizPass: '50',
      quizNeg: false,
      quizNegW: '0',
      quizMax: '0',
      preview: false,
    });
    setShowForm(true);
  }

  async function saveLesson(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: any = { title: form.title };
      // Chương: chọn chương đã có, hoặc gõ tên chương mới
      const chapterVal =
        form.chapter === '__new__'
          ? (form.newChapter || '').trim() || null
          : form.chapter || null;
      body.chapter = chapterVal;
      // STT bài học (nhập trực tiếp, áp dụng cho cả thêm mới và sửa)
      if (form.order !== '') {
        body.order = Number(form.order);
      } else if (!editingId) {
        body.order = (course?.lessons?.length ?? 0);
      }
      if (form.youtubeUrl) body.youtubeUrl = form.youtubeUrl;
      body.videos = (form.videos || []).filter((v: any) => (v.url || '').trim());
      body.materials = (form.materials || []).filter((m: any) => (m.url || '').trim());
      if (useBlocks) {
        body.content = serializeBlocks();
        body.blocks = blocks;
      } else if (form.content) {
        body.content = form.content;
        body.blocks = null;
      }
      if (form.duration) body.duration = Number(form.duration);
      body.pdfLinks = form.pdfLinks.filter((l) => l.trim());
      body.examId = form.examId || null;
      body.deadline = form.deadline ? new Date(form.deadline).toISOString() : null;
      body.isPreviewFree = form.preview;

      let lessonId = editingId;
      if (editingId) {
        await apiFetch(`/courses/${courseId}/lessons/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        showToast('✅ Đã cập nhật bài giảng!');
      } else {
        const created = await apiFetch(`/courses/${courseId}/lessons`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        lessonId = created.id;
        showToast('✅ Đã thêm bài giảng!');
      }
      // Cấu hình Quiz củng cố (nếu bật)
      if (form.quizOn && lessonId) {
        await apiFetch(`/courses/${courseId}/lessons/${lessonId}/quiz`, {
          method: 'PUT',
          body: JSON.stringify({
            examId: form.quizExamId,
            questionCount: Number(form.quizCount) || 5,
            passingPercent: Number(form.quizPass) || 50,
            negativeMarking: form.quizNeg,
            negativeWeight: Number(form.quizNegW) || 0,
            maxAttempts: Number(form.quizMax) || 0,
          }),
        });
        showToast('✅ Đã lưu bài giảng + quiz củng cố!');
      }
      setShowForm(false);
      resetForm();
      loadCourse();
    } catch (err: any) {
      showToast('❌ ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/courses/${courseId}/lessons/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      showToast('🗑️ Đã xóa bài giảng!');
      setDeleteTarget(null);
      loadCourse();
    } catch (err: any) {
      showToast('❌ ' + err.message);
    }
  }

  // Đổi thứ tự bài giảng (hoán đổi order với bài kề)
  async function moveLesson(lesson: any, dir: -1 | 1) {
    const ls = [...(course.lessons || [])].sort((a: any, b: any) => a.order - b.order);
    const idx = ls.findIndex((x: any) => x.id === lesson.id);
    const swap = ls[idx + dir];
    if (!swap) return;
    try {
      await apiFetch(`/courses/${courseId}/lessons/${lesson.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ order: swap.order }),
      });
      await apiFetch(`/courses/${courseId}/lessons/${swap.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ order: lesson.order }),
      });
      loadCourse();
    } catch (err: any) {
      showToast('❌ ' + err.message);
    }
  }

  if (loading)
    return (
      <div className="page-container">
        {/* Khung chờ đúng bố cục trang khóa học: banner + sidebar chương + danh sách bài */}
        <div className="skeleton" style={{ height: 92, borderRadius: 16, marginBottom: 16 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 280px) minmax(0, 1fr)', gap: 14 }}>
          <div className="skeleton" style={{ height: 380, borderRadius: 14 }} />
          <div>
            <div className="skeleton" style={{ height: 40, borderRadius: 10, marginBottom: 10 }} />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 54, borderRadius: 10, marginBottom: 8 }} />
            ))}
          </div>
        </div>
      </div>
    );
  if (!course) return <div className="page-container">Không tìm thấy khóa học.</div>;

  // Gom bài giảng theo chương (giữ nguyên thứ tự)
  const lessonGroups: { chapter: string; lessons: any[] }[] = [];
  (course.lessons || []).forEach((l: any) => {
    const key = l.chapter || '';
    const last = lessonGroups[lessonGroups.length - 1];
    if (last && last.chapter === key) last.lessons.push(l);
    else lessonGroups.push({ chapter: key, lessons: [l] });
  });

  // Số thứ tự bài TRONG TỪNG CHƯƠNG (1..n), không phải số toàn khóa
  const chapterNoOf: Record<string, number> = {};
  {
    let cur = '\u0000';
    let n = 0;
    for (const l of course.lessons || []) {
      const c = l.chapter || '';
      if (c !== cur) {
        cur = c;
        n = 1;
      } else {
        n++;
      }
      chapterNoOf[l.id] = n;
    }
  }

  // Mở trình quản lý chương
  function openChapterEditor() {
    const seen = new Set<string>();
    const list: { orig: string; name: string }[] = [];
    for (const l of course.lessons || []) {
      const c = l.chapter || '';
      if (seen.has(c)) continue;
      seen.add(c);
      list.push({ orig: c, name: c });
    }
    setChapterList(list);
    setChapterEditor(true);
  }

  function moveChapter(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= chapterList.length) return;
    const next = [...chapterList];
    [next[i], next[j]] = [next[j], next[i]];
    setChapterList(next);
  }

  async function saveChapters() {
    setSavingChapters(true);
    try {
      // 1) Đổi tên các chương đã sửa
      for (const c of chapterList) {
        const name = c.name.trim();
        if (c.orig && name && name !== c.orig) {
          await apiFetch(`/courses/${courseId}/chapters/rename`, {
            method: 'PATCH',
            body: JSON.stringify({ oldTitle: c.orig, newTitle: name }),
          });
        }
      }
      // 2) Sắp xếp lại thứ tự chương (đánh lại order bài học theo chương)
      const order = chapterList.map((c) => (c.orig ? c.name.trim() || c.orig : c.orig));
      await apiFetch(`/courses/${courseId}/chapters/reorder`, {
        method: 'POST',
        body: JSON.stringify({ order }),
      });
      showToast('✅ Đã cập nhật chương');
      setChapterEditor(false);
      loadCourse();
    } catch (e: any) {
      showToast('❌ ' + e.message);
    } finally {
      setSavingChapters(false);
    }
  }

  return (
    <div className="page-container" style={{ maxWidth: 1600 }}>
      {/* Header khóa học — phong cách đỏ đô */}
      <div className="lm-band">
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2>
            <BackButton to="/teacher" label="Về trang chủ" />
            📚 {course.title}
          </h2>
          {course.description && (
            <p className="lm-band-sub">{course.description}</p>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {course.password ? (
              <span className="badge badge-warning" style={{ background: 'rgba(240,179,85,0.3)', color: '#fff' }}>Mã: {course.password}</span>
            ) : (
              <span className="badge badge-success">Khóa học mở</span>
            )}
            {course.isPublished ? (
              <span className="badge" style={{ background: 'rgba(255,255,255,0.16)', color: '#fff' }}>Công khai</span>
            ) : (
              <span className="badge badge-warning">Bản nháp</span>
            )}
            <span className="badge" style={{ background: 'rgba(255,255,255,0.16)', color: '#fff' }}>{course.lessons?.length ?? 0} bài giảng</span>
            <span className="badge" style={{ background: 'rgba(255,255,255,0.16)', color: '#fff' }}>{students !== null ? students.length : (course._count?.enrollments ?? 0)} học sinh</span>
            {course.sequential && (
              <span className="badge" style={{ background: 'rgba(240,179,85,0.3)', color: '#fff' }}>🔒 Học tuần tự</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          <Link href={`/teacher/courses/${courseId}/announcements`} className="btn-lm ghost" style={{ textDecoration: 'none' }}>
            📣 Bảng tin
          </Link>
          <Link href={`/teacher/courses/${courseId}/assignments`} className="btn-lm ghost" style={{ textDecoration: 'none' }}>
            📚 Giao bài tập
          </Link>
          {isOwner && (
            <button className="btn-lm ghost" onClick={openEditCourse}>
              ✏️ Sửa khóa học
            </button>
          )}
          <button className="btn-lm amber" onClick={startAdd}>
            + Thêm bài giảng
          </button>
        </div>
      </div>

      {/* Banner khóa học (bannerUrl) — fallback ảnh đại diện */}
      {(course.bannerUrl || course.coverUrl) && (
        <div
          style={{
            borderRadius: 18,
            overflow: 'hidden',
            position: 'relative',
            height: 160,
            marginBottom: 20,
            background: '#000',
            boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
          }}
        >
          <img
            src={course.bannerUrl || course.coverUrl}
            alt={course.title}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.5), transparent 55%)' }} />
          <div style={{ position: 'absolute', left: 20, bottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 15, textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>
              🎨 Banner khóa học
            </span>
          </div>
        </div>
      )}

      {/* Form sửa khóa học */}
      {showEditCourse && (
        <form onSubmit={saveCourse} className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>✏️ Sửa khóa học</h3>
          <div className="form-group">
            <label>Tên khóa học *</label>
            <input
              value={courseForm.title}
              onChange={(e) => setCourseForm({ ...courseForm, title: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Mô tả</label>
            <input
              value={courseForm.description}
              onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })}
            />
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Lớp</label>
              <select
                value={courseForm.grade}
                onChange={(e) => setCourseForm({ ...courseForm, grade: e.target.value })}
              >
                <option value="">Tất cả</option>
                <option value="10">Lớp 10</option>
                <option value="11">Lớp 11</option>
                <option value="12">Lớp 12</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Mật khẩu tham gia (để trống = khóa học mở)</label>
              <input
                value={courseForm.password}
                onChange={(e) => setCourseForm({ ...courseForm, password: e.target.value })}
                placeholder="Không đổi"
              />
            </div>
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={courseForm.isPublished}
              onChange={(e) => setCourseForm({ ...courseForm, isPublished: e.target.checked })}
              style={{ width: 'auto' }}
            />
            <label style={{ margin: 0 }}>Công khai (học sinh có thể thấy)</label>
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={!!courseForm.sequential}
              onChange={(e) => setCourseForm({ ...courseForm, sequential: e.target.checked })}
              style={{ width: 'auto' }}
            />
            <label style={{ margin: 0 }}>
              🔒 Học tuần tự — học sinh phải hoàn thành bài trước mới mở được bài sau
            </label>
          </div>
          <div className="form-group">
            <label>🖼 Ảnh đại diện khóa học (hiện trên thẻ khóa học ở trang đăng ký + trang chủ học sinh)</label>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {courseForm.coverUrl && (
                <img
                  src={courseForm.coverUrl}
                  alt="Ảnh đại diện"
                  style={{ width: 150, height: 84, objectFit: 'cover', borderRadius: 10, border: '2px solid var(--lm-amber)' }}
                />
              )}
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    const token = localStorage.getItem('token');
                    const res = await fetch('/api/uploads/image', {
                      method: 'POST',
                      headers: {
                        'Content-Type': f.type || 'image/png',
                        Authorization: `Bearer ${token}`,
                      },
                      body: f,
                    });
                    if (!res.ok) throw new Error('Không tải ảnh lên được');
                    const data = await res.json();
                    setCourseForm({ ...courseForm, coverUrl: data.url });
                  } catch (err: any) {
                    alert('❌ ' + err.message);
                  }
                }}
              />
              {courseForm.coverUrl && (
                <button
                  type="button"
                  className="lm-filter-btn"
                  style={{ fontSize: 12 }}
                  onClick={() => setCourseForm({ ...courseForm, coverUrl: '' })}
                >
                  🗑 Xóa ảnh đại diện
                </button>
              )}
            </div>
          </div>

          <div className="form-group">
            <label>🎨 Banner khóa học (dải ảnh lớn hiện BÊN TRONG trang khóa học)</label>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {courseForm.bannerUrl && (
                <img
                  src={courseForm.bannerUrl}
                  alt="Banner"
                  style={{ width: 200, height: 70, objectFit: 'cover', borderRadius: 10, border: '2px solid var(--color-rule)' }}
                />
              )}
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    const token = localStorage.getItem('token');
                    const res = await fetch('/api/uploads/image', {
                      method: 'POST',
                      headers: {
                        'Content-Type': f.type || 'image/png',
                        Authorization: `Bearer ${token}`,
                      },
                      body: f,
                    });
                    if (!res.ok) throw new Error('Không tải ảnh lên được');
                    const data = await res.json();
                    setCourseForm({ ...courseForm, bannerUrl: data.url });
                  } catch (err: any) {
                    alert('❌ ' + err.message);
                  }
                }}
              />
              {courseForm.bannerUrl && (
                <button
                  type="button"
                  className="lm-filter-btn"
                  style={{ fontSize: 12 }}
                  onClick={() => setCourseForm({ ...courseForm, bannerUrl: '' })}
                >
                  🗑 Xóa banner
                </button>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" disabled={savingCourse} style={{ flex: 1 }}>
              {savingCourse ? 'Đang lưu…' : 'Lưu thay đổi'}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              style={{ width: 'auto' }}
              onClick={() => setShowEditCourse(false)}
            >
              Hủy
            </button>
            {isOwner && (
              <button
                type="button"
                className="btn btn-danger"
                style={{ width: 'auto' }}
                onClick={() => setDeleteCourseConfirm(true)}
              >
                🗑️ Xóa khóa học
              </button>
            )}
          </div>
        </form>
      )}

      {/* Form thêm/sửa bài giảng */}
      {showForm && (
        <form onSubmit={saveLesson} className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>
            {editingId ? '✏️ Sửa bài giảng' : '📝 Thêm bài giảng mới'}
          </h3>

          <div className="form-group">
            <label>Tên bài giảng *</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="VD: Bài 1: Đạo hàm"
              required
            />
          </div>

          <div className="form-group">
            <label>Chương (chọn chương đã tạo hoặc tạo chương mới)</label>
            <select
              value={form.chapter}
              onChange={(e) => setForm({ ...form, chapter: e.target.value })}
            >
              <option value="">— Không thuộc chương nào —</option>
              {Array.from(
                new Set(
                  (course?.lessons || [])
                    .map((l: any) => l.chapter)
                    .filter(Boolean),
                ),
              ).map((c) => (
                <option key={c as string} value={c as string}>
                  {c as string}
                </option>
              ))}
              <option value="__new__">＋ Tạo chương mới…</option>
            </select>
            {form.chapter === '__new__' && (
              <input
                value={form.newChapter}
                onChange={(e) => setForm({ ...form, newChapter: e.target.value })}
                placeholder="Nhập tên chương mới — VD: Chương II: Tích phân"
                style={{ marginTop: 8 }}
                autoFocus
              />
            )}
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <div className="form-group" style={{ width: 140 }}>
              <label>STT bài học</label>
              <input
                type="number"
                min={0}
                value={form.order}
                onChange={(e) => setForm({ ...form, order: e.target.value })}
                placeholder={
                  editingId
                    ? String(
                        (course?.lessons || []).find((l: any) => l.id === editingId)
                          ?.order ?? 0,
                      )
                    : String(course?.lessons?.length ?? 0)
                }
              />
              <p style={{ fontSize: 11.5, color: 'var(--color-muted)', marginTop: 4 }}>
                Thứ tự hiển thị trong giáo trình (0 = đầu tiên)
              </p>
            </div>
            <div className="form-group" style={{ flex: 1, display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.preview}
                  onChange={(e) => setForm({ ...form, preview: e.target.checked })}
                  style={{ width: 'auto' }}
                />
                <span style={{ fontSize: 13, fontWeight: 700 }}>
                  👁️ Xem thử miễn phí
                  <span style={{ display: 'block', fontSize: 11.5, fontWeight: 500, color: 'var(--color-muted)' }}>
                    HS chưa đăng ký vẫn xem được bài này
                  </span>
                </span>
              </label>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Thời lượng (phút, tùy chọn)</label>
              <input
                type="number"
                min={0}
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: e.target.value })}
                placeholder="VD: 45"
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <div className="form-group" style={{ flex: 2 }}>
              <label>Link YouTube (tùy chọn)</label>
              <input
                value={form.youtubeUrl}
                onChange={(e) => setForm({ ...form, youtubeUrl: e.target.value })}
                placeholder="https://youtu.be/..."
              />
            </div>
          </div>

          {/* ===== NHIỀU VIDEO CÓ TIÊU ĐỀ ===== */}
          <div className="form-group">
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>🎬 Video bài giảng (nhiều video, mỗi video có tiêu đề)</span>
              <button
                type="button"
                className="lm-filter-btn"
                style={{ padding: '3px 10px', fontSize: 12 }}
                onClick={() =>
                  setForm({ ...form, videos: [...(form.videos || []), { title: '', url: '' }] })
                }
              >
                ＋ Thêm video
              </button>
            </label>
            {(form.videos || []).map((v: any, i: number) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <input
                  value={v.title}
                  onChange={(e) => {
                    const vids = [...(form.videos || [])];
                    vids[i] = { ...vids[i], title: e.target.value };
                    setForm({ ...form, videos: vids });
                  }}
                  placeholder={`Tiêu đề video ${i + 1} (VD: Phần 1: Lý thuyết)`}
                  style={{ flex: 1 }}
                />
                <input
                  value={v.url}
                  onChange={(e) => {
                    const vids = [...(form.videos || [])];
                    vids[i] = { ...vids[i], url: e.target.value };
                    setForm({ ...form, videos: vids });
                  }}
                  placeholder="https://youtu.be/... hoặc URL .mp4"
                  style={{ flex: 1.4 }}
                />
                <button
                  type="button"
                  onClick={() =>
                    setForm({ ...form, videos: (form.videos || []).filter((_: any, j: number) => j !== i) })
                  }
                  style={{ background: 'var(--color-danger-wash)', border: 'none', borderRadius: 6, padding: '4px 9px', cursor: 'pointer', fontSize: 12 }}
                >
                  ✕
                </button>
              </div>
            ))}
            {(!form.videos || form.videos.length === 0) && (
              <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                Chưa có video — bấm "＋ Thêm video" (hoặc để trống dùng Link YouTube phía trên).
              </p>
            )}
          </div>

          {/* ===== TÀI LIỆU ĐẶT TÊN RIÊNG ===== */}
          <div className="form-group">
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>📎 Tài liệu bài giảng (đặt tên riêng từng file)</span>
              <button
                type="button"
                className="lm-filter-btn"
                style={{ padding: '3px 10px', fontSize: 12 }}
                onClick={() =>
                  setForm({ ...form, materials: [...(form.materials || []), { title: '', url: '' }] })
                }
              >
                ＋ Thêm tài liệu
              </button>
            </label>
            {(form.materials || []).map((m: any, i: number) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <input
                  value={m.title}
                  onChange={(e) => {
                    const mats = [...(form.materials || [])];
                    mats[i] = { ...mats[i], title: e.target.value };
                    setForm({ ...form, materials: mats });
                  }}
                  placeholder="Tên tài liệu (VD: Phiếu bài tập, Slide note)"
                  style={{ flex: 1 }}
                />
                <input
                  type="file"
                  accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.zip,.txt,.png,.jpg"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      const token = localStorage.getItem('token');
                      const res = await fetch('/api/uploads/file', {
                        method: 'POST',
                        headers: {
                          'Content-Type': f.type || 'application/pdf',
                          'x-file-ext': f.name.split('.').pop() || 'pdf',
                          Authorization: `Bearer ${token}`,
                        },
                        body: f,
                      });
                      if (!res.ok) {
                        const err = await res.json().catch(() => ({}));
                        alert('❌ ' + (err.message || 'Không tải được file'));
                        return;
                      }
                      const data = await res.json();
                      const mats = [...(form.materials || [])];
                      mats[i] = { ...mats[i], url: data.url, title: mats[i].title || f.name };
                      setForm({ ...form, materials: mats });
                    } catch (err: any) {
                      alert('❌ ' + err.message);
                    }
                  }}
                  style={{ flex: 1, fontSize: 12 }}
                />
                <button
                  type="button"
                  onClick={() =>
                    setForm({ ...form, materials: (form.materials || []).filter((_: any, j: number) => j !== i) })
                  }
                  style={{ background: 'var(--color-danger-wash)', border: 'none', borderRadius: 6, padding: '4px 9px', cursor: 'pointer', fontSize: 12 }}
                >
                  ✕
                </button>
              </div>
            ))}
            {(!form.materials || form.materials.length === 0) && (
              <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                Chưa có tài liệu — bấm "＋ Thêm tài liệu" để tải file lên và đặt tên hiển thị cho học sinh.
              </p>
            )}
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Nội dung bài giảng (LaTeX/markdown, tùy chọn)</span>
              <button
                type="button"
                className={`lm-filter-btn${useBlocks ? ' on' : ''}`}
                style={{ padding: '3px 10px', fontSize: 11.5 }}
                onClick={() => setUseBlocks(!useBlocks)}
              >
                🧱 Soạn theo khối
              </button>
            </label>

            {useBlocks ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {blocks.length === 0 && (
                    <p style={{ fontSize: 12.5, color: 'var(--color-muted)' }}>
                      Chưa có khối nào — bấm "＋ Thêm khối" bên dưới.
                    </p>
                  )}
                  {blocks.map((b) => (
                    <div key={b.id} style={{ border: '1px solid var(--color-rule)', borderRadius: 8, padding: 8, background: 'var(--color-surface)' }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                        <select
                          value={b.type}
                          onChange={(e) => updateBlock(b.id, { type: e.target.value })}
                          style={{ flex: 1, padding: '4px 6px', borderRadius: 6, fontSize: 12 }}
                        >
                          <option value="text">📝 Đoạn văn (markdown + $...$)</option>
                          <option value="latex">∑ Công thức lớn ($$...$$)</option>
                          <option value="callout">📌 Ghi chú nổi bật</option>
                          <option value="image">🖼 Hình ảnh (dán link /uploads...)</option>
                        </select>
                        <button type="button" className="lm-filter-btn" style={{ padding: '2px 6px', fontSize: 11 }} onClick={() => moveBlock(b.id, -1)}>↑</button>
                        <button type="button" className="lm-filter-btn" style={{ padding: '2px 6px', fontSize: 11 }} onClick={() => moveBlock(b.id, 1)}>↓</button>
                        <button
                          type="button"
                          className="lm-filter-btn"
                          style={{ padding: '2px 6px', fontSize: 11, color: 'var(--color-danger)' }}
                          onClick={() => removeBlock(b.id)}
                        >
                          ✕
                        </button>
                      </div>
                      <textarea
                        rows={b.type === 'latex' ? 3 : 4}
                        value={b.content}
                        onChange={(e) => updateBlock(b.id, { content: e.target.value })}
                        placeholder={
                          b.type === 'latex'
                            ? 'x^2 + y^2 = 1'
                            : b.type === 'callout'
                              ? 'Nhớ: công thức...'
                              : b.type === 'image'
                                ? '/uploads/ten-anh.png'
                                : 'Gõ nội dung… công thức $x^2$'
                        }
                        style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--color-rule)', fontSize: 13, fontFamily: 'var(--font-mono)' }}
                      />
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" className="lm-filter-btn" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => addBlock('text')}>＋ Đoạn văn</button>
                    <button type="button" className="lm-filter-btn" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => addBlock('latex')}>＋ Công thức</button>
                    <button type="button" className="lm-filter-btn" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => addBlock('callout')}>＋ Ghi chú</button>
                    <button type="button" className="lm-filter-btn" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => addBlock('image')}>＋ Hình</button>
                  </div>
                </div>
                <div style={{ border: '1px dashed var(--color-rule)', borderRadius: 8, padding: 10, background: 'var(--color-surface)', minHeight: 120 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-muted)', marginBottom: 6 }}>👁️ XEM TRƯỚC</div>
                  <LatexRenderer content={serializeBlocks()} />
                </div>
              </div>
            ) : (
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={4}
                placeholder="Nội dung bài giảng... (dùng $...$ cho công thức toán)"
              />
            )}
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Tài liệu PDF (link Google Drive, tùy chọn)</span>
              <button
                type="button"
                className="btn btn-outline"
                style={{ width: 'auto', padding: '6px 14px', fontSize: 13 }}
                onClick={() => setForm({ ...form, pdfLinks: [...form.pdfLinks, ''] })}
              >
                + Thêm link
              </button>
            </label>
            {form.pdfLinks.map((link, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  value={link}
                  onChange={(e) => {
                    const links = [...form.pdfLinks];
                    links[i] = e.target.value;
                    setForm({ ...form, pdfLinks: links });
                  }}
                  placeholder={`Link tài liệu ${i + 1} (https://drive.google.com/...)`}
                />
                <button
                  type="button"
                  onClick={() => setForm({ ...form, pdfLinks: form.pdfLinks.filter((_, idx) => idx !== i) })}
                  style={{ background: 'color-mix(in oklch, var(--color-danger) 12%, var(--color-paper))', color: 'var(--color-danger)', border: 'none', borderRadius: 8, padding: '0 12px', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="form-group">
            <label>BTVN — Đề thi online (học sinh làm ngay trong bài giảng)</label>
            <select
              value={form.examId}
              onChange={(e) => setForm({ ...form, examId: e.target.value })}
            >
              <option value="">— Không gán đề —</option>
              {myExams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.title}
                  {ex.grade ? ` (Lớp ${ex.grade})` : ''}
                  {ex.status === 'PUBLISHED' ? ' · Công khai' : ' · Nháp'}
                </option>
              ))}
            </select>
            <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 4 }}>
              Một đề có thể gán cho nhiều bài giảng, nhiều khóa học.
            </p>
          </div>

          {form.examId && (
            <div className="form-group">
              <label>⏰ Hạn nộp BTVN (để trống = không giới hạn)</label>
              <input
                type="datetime-local"
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              />
              <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 4 }}>
                Học sinh nộp sau hạn sẽ bị đánh dấu "Nộp muộn" trong bảng điểm.
              </p>
            </div>
          )}

          <div
            className="form-group"
            style={{
              border: form.quizOn ? '1.5px solid var(--lm-amber)' : '1px dashed var(--color-rule)',
              borderRadius: 8,
              padding: 12,
              background: form.quizOn ? 'var(--color-track)' : 'transparent',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: 'var(--color-warning)' }}>
              <input
                type="checkbox"
                checked={form.quizOn}
                onChange={(e) => setForm({ ...form, quizOn: e.target.checked })}
                style={{ width: 'auto' }}
              />
              🧩 Quiz củng cố ngay trong bài giảng (trắc nghiệm trộn đề, chấm ngay)
            </label>
            {form.quizOn && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                <div className="form-group" style={{ flex: 2, minWidth: 200, margin: 0 }}>
                  <label style={{ fontSize: 12 }}>Đề thi lấy câu trắc nghiệm</label>
                  <select
                    value={form.quizExamId}
                    onChange={(e) => setForm({ ...form, quizExamId: e.target.value })}
                  >
                    <option value="">— Chọn đề —</option>
                    {myExams.map((ex) => (
                      <option key={ex.id} value={ex.id}>{ex.title}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ width: 130, margin: 0 }}>
                  <label style={{ fontSize: 12 }}>Số câu</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={form.quizCount}
                    onChange={(e) => setForm({ ...form, quizCount: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ width: 130, margin: 0 }}>
                  <label style={{ fontSize: 12 }}>Ngưỡng đạt %</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.quizPass}
                    onChange={(e) => setForm({ ...form, quizPass: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ width: 130, margin: 0 }}>
                  <label style={{ fontSize: 12 }}>Số lần làm (0 = vô hạn)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.quizMax}
                    onChange={(e) => setForm({ ...form, quizMax: e.target.value })}
                  />
                </div>
                <div
                  className="form-group"
                  style={{ flex: '1 1 220px', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={form.quizNeg}
                      onChange={(e) => setForm({ ...form, quizNeg: e.target.checked })}
                      style={{ width: 'auto' }}
                    />
                    🔴 Trừ điểm câu sai:
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={form.quizNegW}
                    onChange={(e) => setForm({ ...form, quizNegW: e.target.value })}
                    disabled={!form.quizNeg}
                    style={{ width: 70, padding: '4px 6px', margin: 0 }}
                    placeholder="25"
                  />
                  <span style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>điểm/câu</span>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn" disabled={saving} style={{ flex: 1 }}>
              {saving ? 'Đang lưu...' : editingId ? 'Cập nhật bài giảng' : 'Lưu bài giảng'}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              style={{ width: 'auto' }}
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
            >
              Hủy
            </button>
          </div>
        </form>
      )}

      {/* Bảng điểm khóa học */}
      <div className="card" style={{ marginBottom: 24, padding: 16 }}>
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => {
            setShowResults(!showResults);
            if (!showResults && courseResults === null) loadCourseResults();
          }}
        >
          <strong style={{ fontSize: 15 }}>📊 Bảng điểm khóa học</strong>
          <span style={{ color: 'var(--color-muted)' }}>{showResults ? '▲' : '▼'}</span>
        </div>
        {showResults && (
          <div style={{ marginTop: 12 }}>
            {courseResults === null ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 14, borderRadius: 6 }} />
                ))}
              </div>
            ) : courseResults.students.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                Chưa có học sinh. Điểm sẽ hiển thị khi học sinh tham gia và làm bài BTVN.
              </p>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button
                    className="btn btn-outline"
                    style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}
                    onClick={() => exportCourseResults('pdf')}
                  >
                    📄 Xuất PDF
                  </button>
                  <button
                    className="btn btn-outline"
                    style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}
                    onClick={() => exportCourseResults('xlsx')}
                  >
                    📊 Xuất Excel
                  </button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-rule)' }}>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Học sinh</th>
                        {courseResults.exams.map((e: any) => (
                          <th key={e.id} style={{ padding: '6px 8px', textAlign: 'center', fontSize: 11, color: 'var(--color-muted)' }} title={e.title}>
                            {e.title.slice(0, 22)}
                          </th>
                        ))}
                        <th style={{ padding: '6px 8px', textAlign: 'center', fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Tổng</th>
                        <th style={{ padding: '6px 8px', textAlign: 'center', fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Tiến độ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {courseResults.students.map((s: any) => (
                        <tr key={s.student.id} style={{ borderBottom: '1px solid var(--color-rule)' }}>
                          <td style={{ padding: '6px 8px' }}>
                            <strong>{s.student.fullName}</strong>{' '}
                            <span className="mono" style={{ fontSize: 10, color: 'var(--color-muted)' }}>
                              {s.student.studentCode}
                            </span>
                          </td>
                          {courseResults.exams.map((e: any) => (
                            <td key={e.id} style={{ padding: '6px 8px', textAlign: 'center' }}>
                              <span
                                className="mono"
                                style={{
                                  fontWeight: 600,
                                  color:
                                    s.scores[e.id] === null
                                      ? 'var(--color-muted)'
                                      : s.scores[e.id] >= e.totalScore * 0.5
                                        ? 'var(--color-success)'
                                        : 'var(--color-danger)',
                                }}
                              >
                                {s.scores[e.id] === null ? '—' : `${s.scores[e.id]}/${e.totalScore}`}
                              </span>
                            </td>
                          ))}
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            <span className="mono" style={{ fontWeight: 700 }}>
                              {s.maxTotal > 0 ? `${s.sum}/${s.maxTotal}` : '—'}
                            </span>
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--color-muted)' }}>
                            {Math.round((s.progress ?? 0) * 100)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Thống kê hoạt động học sinh */}
      <div className="card" style={{ marginBottom: 24, padding: 16 }}>
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => {
            setShowActivity(!showActivity);
            if (!showActivity && activity === null) loadActivity();
          }}
        >
          <strong style={{ fontSize: 15 }}>📈 Hoạt động học tập (ai học bài nào, bao lâu)</strong>
          <span style={{ color: 'var(--color-muted)' }}>{showActivity ? '▲' : '▼'}</span>
        </div>
        {showActivity && (
          <div style={{ marginTop: 12 }}>
            {activity === null ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 14, borderRadius: 6 }} />
                ))}
              </div>
            ) : activity.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>Chưa có dữ liệu hoạt động.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--color-rule)' }}>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Học sinh</th>
                      <th style={{ padding: '6px 8px', textAlign: 'center', fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Bài hoàn thành</th>
                      <th style={{ padding: '6px 8px', textAlign: 'center', fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Thời gian học</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Bài học gần nhất</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Hoạt động gần nhất</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.map((a: any) => (
                      <tr key={a.student.id} style={{ borderBottom: '1px solid var(--color-rule)' }}>
                        <td style={{ padding: '6px 8px' }}>
                          <strong>{a.student.fullName}</strong>{' '}
                          <span className="mono" style={{ fontSize: 10, color: 'var(--color-muted)' }}>{a.student.studentCode}</span>
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                          <span className="mono">{a.completedLessons}/{a.totalLessons}</span>
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                          <span className="mono">{Math.floor(a.totalSec / 60)}p{a.totalSec % 60}g</span>
                        </td>
                        <td style={{ padding: '6px 8px', color: 'var(--color-muted)' }}>{a.lastLessonTitle || '—'}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--color-muted)' }}>
                          {a.lastActive ? new Date(a.lastActive).toLocaleString('vi-VN') : 'Chưa hoạt động'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Danh sách bài giảng */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>
          Bài giảng ({course.lessons?.length ?? 0})
        </h2>
        <button className="btn-lm ghost" style={{ padding: '6px 12px', fontSize: 12.5 }} onClick={openCopyPanel}>
          📋 Sao chép bài giảng từ khóa học khác
        </button>
      </div>

      {showCopy && (
        <div className="card" style={{ marginBottom: 16, padding: 16, background: 'var(--color-paper-2)' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>📋 Sao chép bài giảng vào khóa học này</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
            <label style={{ fontSize: 13 }}>Khóa học nguồn:</label>
            <select
              value={copySourceId}
              onChange={(e) => loadSourceLessons(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--color-rule)', background: 'var(--color-paper)', color: 'var(--color-ink)', fontSize: 13.5, minWidth: 260 }}
            >
              <option value="">— Chọn khóa học —</option>
              {myCourses.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.title || c.id} ({c._count?.lessons ?? 0} bài)
                </option>
              ))}
            </select>
          </div>

          {sourceLessons.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <label style={{ fontSize: 12.5, cursor: 'pointer', userSelect: 'none' }} onClick={toggleAll}>
                  <input type="checkbox" checked={selectedLessonIds.length === sourceLessons.length && sourceLessons.length > 0} readOnly style={{ marginRight: 6 }} />
                  Chọn tất cả ({sourceLessons.length} bài)
                </label>
              </div>
              <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--color-rule)', borderRadius: 8, background: 'var(--color-paper-2)', padding: 6 }}>
                {sourceLessons.map((l: any) => (
                  <label key={l.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 8px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid var(--color-rule)' }}>
                    <input
                      type="checkbox"
                      checked={selectedLessonIds.includes(l.id)}
                      onChange={() => toggleCopyLesson(l.id)}
                      style={{ marginTop: 3 }}
                    />
                    <span>
                      {l.chapter ? <span style={{ color: 'var(--color-muted)', fontSize: 11.5 }}>{l.chapter} · </span> : null}
                      {l.title || '(không tên)'}
                    </span>
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
                <button className="btn-lm amber" style={{ padding: '7px 14px', fontSize: 13 }} onClick={doCopyLessons} disabled={copying || selectedLessonIds.length === 0}>
                  {copying ? '⏳ Đang sao chép…' : `Sao chép ${selectedLessonIds.length} bài`}
                </button>
                {copyResult && <span style={{ fontSize: 13 }}>{copyResult}</span>}
              </div>
            </>
          )}
          {copySourceId && sourceLessons.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>Khóa học này chưa có bài giảng.</p>
          )}
        </div>
      )}

      {/* Trợ giảng (chỉ chủ khóa học) */}
      {isOwner && (
        <div className="card" style={{ marginBottom: 24, padding: 16 }}>
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            onClick={() => {
              setShowAssistants(!showAssistants);
              if (!showAssistants && assistants.length === 0) loadAssistants();
            }}
          >
            <strong style={{ fontSize: 15 }}>
              👥 Trợ giảng ({assistants.length})
            </strong>
            <span style={{ color: 'var(--color-muted)' }}>{showAssistants ? '▲' : '▼'}</span>
          </div>
          {showAssistants && (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 10 }}>
                Trợ giảng có toàn quyền quản lý khóa học (bài giảng, bài tập, học sinh, chấm điểm) — chỉ không thể xóa khóa học.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <input
                  type="email"
                  placeholder="Email giáo viên (VD: giangvien@...)"
                  value={assistantEmail}
                  onChange={(e) => setAssistantEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addAssistant()}
                  style={{ flex: 1, minWidth: 220, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-rule)', background: 'var(--color-paper)', color: 'var(--color-ink)' }}
                />
                <button className="btn-lm amber" style={{ padding: '8px 14px', fontSize: 13 }} onClick={addAssistant} disabled={addingAssistant}>
                  {addingAssistant ? '⏳…' : '+ Thêm trợ giảng'}
                </button>
              </div>
              {assistantMsg && <div style={{ fontSize: 13, marginBottom: 8 }}>{assistantMsg}</div>}
              {assistants.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <tbody>
                    {assistants.map((a: any) => (
                      <tr key={a.id} style={{ borderBottom: '1px solid var(--color-rule)' }}>
                        <td style={{ padding: '8px 4px' }}>
                          <strong>{a.user?.fullName}</strong>{' '}
                          <span className="mono" style={{ fontSize: 11, color: 'var(--color-muted)' }}>{a.user?.email}</span>
                        </td>
                        <td style={{ padding: '8px 4px', textAlign: 'right' }}>
                          <button className="btn-lm ghost" style={{ padding: '4px 10px', fontSize: 12, color: 'var(--color-danger)' }} onClick={() => removeAssistant(a.id)}>
                            Gỡ
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>Chưa có trợ giảng.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Quản lý học sinh */}
      <div className="card" style={{ marginBottom: 24, padding: 16 }}>
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flex: 1, minWidth: 200 }}
            onClick={() => {
              setShowStudents(!showStudents);
              if (!showStudents && students === null) loadStudents();
            }}
          >
            <strong style={{ fontSize: 15 }}>
              👥 Học sinh ({students !== null ? students.length : course._count?.enrollments ?? 0})
            </strong>
            <span style={{ color: 'var(--color-muted)' }}>{showStudents ? '▲' : '▼'}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="btn-lm ghost"
              style={{ padding: '6px 12px', fontSize: 12.5 }}
              onClick={() => setShowImport(!showImport)}
              title="Nhập danh sách học sinh từ file Excel"
            >
              📥 Nhập Excel
            </button>
          </div>
        </div>

        {/* Panel nhập Excel */}
        {showImport && (
          <div style={{ marginTop: 12, padding: 12, background: 'var(--color-paper-2)', borderRadius: 8, border: '1px solid var(--color-rule)' }}>
            <div style={{ fontSize: 13, marginBottom: 10, lineHeight: 1.7 }}>
              Tải <b>file mẫu</b>, điền danh sách học sinh (Họ tên, Email, Lớp, Mật khẩu, Trường), rồi tải file lên.
              Học sinh chưa có tài khoản sẽ được <b>tạo tự động</b> và thêm vào khóa học này.
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn-lm ghost" style={{ padding: '6px 12px', fontSize: 12.5 }} onClick={downloadImportTemplate}>
                ⬇️ Tải file mẫu
              </button>
              <label className="btn-lm amber" style={{ padding: '6px 12px', fontSize: 12.5, cursor: 'pointer', display: 'inline-block' }}>
                {importing ? '⏳ Đang nhập…' : '📤 Chọn file .xlsx'}
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImportStudents(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            {importResult && (
              <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.8 }}>
                {importResult.error ? (
                  <span style={{ color: 'var(--color-danger)' }}>❌ {importResult.error}</span>
                ) : (
                  <>
                    <div>✅ Đã nhập <b>{importResult.enrolled}</b> học sinh mới vào khóa học.</div>
                    {importResult.created?.length > 0 && (
                      <div>🆕 Tạo mới <b>{importResult.created.length}</b> tài khoản (xem mật khẩu bên dưới).</div>
                    )}
                    {importResult.already?.length > 0 && (
                      <div style={{ color: 'var(--color-muted)' }}>⏭ {importResult.already.length} học sinh đã có trong khóa học.</div>
                    )}
                    {importResult.skipped?.length > 0 && (
                      <div style={{ color: 'var(--color-warning)' }}>
                        ⚠️ {importResult.skipped.length} dòng bị bỏ qua:
                        {importResult.skipped.slice(0, 10).map((s: any, i: number) => (
                          <div key={i} style={{ fontSize: 12 }}>• Dòng {s.row}: {s.reason}</div>
                        ))}
                        {importResult.skipped.length > 10 && <div style={{ fontSize: 12 }}>… và {importResult.skipped.length - 10} dòng khác</div>}
                      </div>
                    )}
                    {importResult.created?.length > 0 && (
                      <details style={{ marginTop: 6 }}>
                        <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>Tài khoản &amp; mật khẩu đã tạo (lưu lại ngay)</summary>
                        <ul style={{ margin: '6px 0 0 18px', fontSize: 12.5, fontFamily: 'monospace' }}>
                          {importResult.created.map((c: any, i: number) => (
                            <li key={i}>{c.fullName} · {c.email} · <b>{c.password}</b></li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {showStudents && (
          <div style={{ marginTop: 12 }}>
            {students === null ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 14, borderRadius: 6 }} />
                ))}
              </div>
            ) : students.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                Chưa có học sinh đăng ký. Chia sẻ mã khóa học để học sinh tham gia.
              </p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-rule)' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Học sinh</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Lớp</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Tiến độ</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase' }}>XP</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s: any) => (
                    <tr key={s.student.id} style={{ borderBottom: '1px solid var(--color-rule)' }}>
                      <td style={{ padding: '6px 8px' }}>
                        <strong>{s.student.fullName}</strong>{' '}
                        <span className="mono" style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                          {s.student.studentCode}
                        </span>
                      </td>
                      <td style={{ padding: '6px 8px', color: 'var(--color-muted)' }}>
                        {s.student.className || '—'}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                        <span className="mono">{Math.round((s.progress ?? 0) * 100)}%</span>
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--color-muted)' }}>
                        {s.student.xp} XP (Lv {s.student.level})
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button
                            className="btn btn-outline"
                            style={{ width: 'auto', padding: '4px 10px', fontSize: 11 }}
                            onClick={() => openEditStudent(s)}
                          >
                            ✏️ Sửa
                          </button>
                          <button
                            className="btn btn-outline"
                            style={{ width: 'auto', padding: '4px 10px', fontSize: 11 }}
                            disabled={removingStudent === s.student.id}
                            onClick={() => resetStudentPassword(s.student)}
                          >
                            Đặt lại MK
                          </button>
                          <button
                            className="btn btn-outline"
                            style={{ width: 'auto', padding: '4px 10px', fontSize: 11, color: 'var(--color-danger)' }}
                            disabled={removingStudent === s.student.id}
                            onClick={() => removeStudent(s.student.id, s.student.fullName)}
                          >
                            Gỡ
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {!course.lessons || course.lessons.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--color-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📝</div>
          <p>Chưa có bài giảng. Nhấn "+ Thêm bài giảng" để bắt đầu.</p>
        </div>
      ) : (
        <div className="lm-course-layout">
          {/* ===== SIDEBAR GIÁO TRÌNH (kiểu Udemy) ===== */}
          <aside className="lm-course-sidebar">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 10px 8px', gap: 6 }}>
              <span style={{ fontWeight: 800, color: 'var(--lm-maroon)', fontSize: 13.5 }}>
                📖 Giáo trình
              </span>
              <button
                type="button"
                onClick={openChapterEditor}
                title="Sửa tên chương và thứ tự chương"
                style={{ border: '1px solid var(--color-rule)', background: 'var(--color-paper)', color: 'var(--color-ink)', borderRadius: 8, padding: '3px 8px', fontSize: 11.5, cursor: 'pointer' }}
              >
                ⚙️ Sửa chương
              </button>
            </div>
            {course.lessons.map((l: any, idx: number) => {
              const prevL = idx > 0 ? course.lessons[idx - 1] : null;
              const chapterRow =
                (l.chapter || '') !== (prevL?.chapter || '')
                  ? l.chapter || 'Chung'
                  : null;
              const isCur = openLesson === l.id;
              const st = lessonStats[l.id];
              return (
                <div key={l.id}>
                  {chapterRow && (
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--color-warning)', padding: '8px 10px 4px' }}>
                      📚 {chapterRow}
                    </div>
                  )}
                  <button
                    type="button"
                    className={`lm-side-lesson${isCur ? ' current' : ''}`}
                    onClick={() => toggleLesson(l.id)}
                  >
                    <span className="tick" style={{ color: 'var(--lm-amber)' }}>›</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      {chapterNoOf[l.id]}. {l.title}
                    </span>
                    {st ? (
                      <span style={{ fontSize: 10.5, color: 'var(--color-muted)', flexShrink: 0 }}>
                        👁️{st.viewed} ✅{st.completed}
                      </span>
                    ) : null}
                  </button>
                </div>
              );
            })}
          </aside>

          {/* ===== CHI TIẾT BÀI ĐANG CHỌN ===== */}
          <div style={{ minWidth: 0 }}>
          {lessonGroups.map((group) => (
            <div key={group.chapter || 'other'}>
              {group.chapter && (
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: 'var(--color-accent)',
                    padding: '10px 4px 6px',
                    borderBottom: '2px solid var(--color-accent)',
                    marginBottom: 10,
                  }}
                >
                  📚 {group.chapter}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {group.lessons.map((lesson: any) => {
                  const lessonNo = chapterNoOf[lesson.id] || 1;
                  return (
            <div key={lesson.id} className="card" style={{ padding: 18, display: openLesson === lesson.id ? 'block' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div
                  style={{ cursor: 'pointer', flex: 1 }}
                  onClick={() => toggleLesson(lesson.id)}
                >
                  <strong>
                    Bài {lessonNo}: {lesson.title}
                  </strong>
                  <span style={{ color: 'var(--color-muted)', fontSize: 12, marginLeft: 10 }}>
                    {lesson.youtubeUrl ? '🎬 Video' : ''}
                    {lesson.youtubeUrl && lesson.pdfLinks?.length ? ' · ' : ''}
                    {lesson.pdfLinks?.length ? `📄 ${lesson.pdfLinks.length} tài liệu` : ''}
                    {lesson.exam ? ' · 📝 BTVN' : ''}
                    {lesson._count?.exercises ? ` · ✍️ ${lesson._count.exercises} bài tự luận` : ''}
                    {lessonStats[lesson.id] ? (
                      <span className="badge badge-accent" style={{ marginLeft: 6, fontSize: 11 }}>
                        👁️ {lessonStats[lesson.id].viewed} đã xem · ✅ {lessonStats[lesson.id].completed} hoàn thành
                      </span>
                    ) : null}
                    {lesson.deadline ? (
                      <span className="badge badge-warning" style={{ marginLeft: 6, fontSize: 11 }}>
                        ⏰ Hạn: {new Date(lesson.deadline).toLocaleString('vi-VN')}
                      </span>
                    ) : null}
                    {openLesson === lesson.id ? ' ▲' : ' ▼'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-outline"
                    style={{ width: 'auto', padding: '6px 8px', fontSize: 13 }}
                    title="Lên trên"
                    onClick={() => moveLesson(lesson, -1)}
                  >
                    ↑
                  </button>
                  <button
                    className="btn btn-outline"
                    style={{ width: 'auto', padding: '6px 8px', fontSize: 13 }}
                    title="Xuống dưới"
                    onClick={() => moveLesson(lesson, 1)}
                  >
                    ↓
                  </button>
                  <button
                    className="btn btn-outline"
                    style={{ width: 'auto', padding: '6px 12px', fontSize: 13 }}
                    onClick={() => startEdit(lesson)}
                  >
                    ✏️ Sửa
                  </button>
                  <button
                    className="btn btn-danger"
                    style={{ width: 'auto', padding: '6px 12px', fontSize: 13 }}
                    onClick={() => setDeleteTarget(lesson)}
                  >
                    🗑️ Xóa
                  </button>
                </div>
              </div>

              {openLesson === lesson.id && (
                <div style={{ marginTop: 12 }}>
                  {lesson.content && (
                    <div style={{ marginBottom: 10 }}>
                      <LatexRenderer content={lesson.content} />
                    </div>
                  )}
                  {lesson.pdfLinks?.length > 0 && (
                    <div style={{ fontSize: 13 }}>
                      <strong>📄 Tài liệu:</strong>
                      <ul style={{ paddingLeft: 20, marginTop: 4 }}>
                        {lesson.pdfLinks.map((l: string, j: number) => (
                          <li key={j}>
                            <a href={l} target="_blank" rel="noreferrer" style={{ color: 'var(--color-accent)' }}>
                              Tài liệu {j + 1}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* ===== Bài tập tự luận (chấm AI) ===== */}
                  <div
                    style={{
                      marginTop: 14,
                      borderTop: '1px solid var(--color-rule)',
                      paddingTop: 12,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 8,
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <strong style={{ fontSize: 14 }}>Bài tập tự luận</strong>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn btn-outline"
                          style={{ width: 'auto', padding: '5px 12px', fontSize: 12 }}
                          onClick={() => openBankPicker(lesson.id)}
                        >
                          🏦 Chọn từ ngân hàng đề
                        </button>
                        <button
                          className="btn btn-outline"
                          style={{ width: 'auto', padding: '5px 12px', fontSize: 12 }}
                          onClick={() =>
                            setShowExForm(showExForm === lesson.id ? null : lesson.id)
                          }
                        >
                          {showExForm === lesson.id ? 'Hủy' : '+ Gõ đề mới'}
                        </button>
                      </div>
                    </div>

                    {showExForm === lesson.id && (
                      <form
                        onSubmit={(e) => createExercise(lesson.id, e)}
                        style={{
                          padding: 12,
                          border: '1px solid var(--color-rule)',
                          borderRadius: 8,
                          marginBottom: 10,
                          background: 'var(--color-paper)',
                        }}
                      >
                        <div className="form-group" style={{ marginBottom: 10 }}>
                          <label>Đề bài *</label>
                          <textarea
                            value={exForm.prompt}
                            onChange={(e) => setExForm({ ...exForm, prompt: e.target.value })}
                            rows={3}
                            placeholder="VD: Chứng minh rằng với mọi x > 0 ta có..."
                            required
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 10 }}>
                          <label>Đáp án / tiêu chí chấm (để AI chấm chính xác hơn)</label>
                          <textarea
                            value={exForm.rubric}
                            onChange={(e) => setExForm({ ...exForm, rubric: e.target.value })}
                            rows={3}
                            placeholder="Gợi ý lời giải hoặc các ý cần có..."
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 10, maxWidth: 160 }}>
                          <label>Thang điểm</label>
                          <input
                            type="number"
                            value={exForm.maxScore}
                            onChange={(e) => setExForm({ ...exForm, maxScore: e.target.value })}
                            min={1}
                            max={100}
                          />
                        </div>
                        <button className="btn" style={{ width: 'auto' }} disabled={exSaving}>
                          {exSaving ? 'Đang lưu…' : 'Lưu bài tập'}
                        </button>
                      </form>
                    )}

                    {exercisesByLesson[lesson.id]?.length ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {exercisesByLesson[lesson.id].map((ex: any) => (
                          <div
                            key={ex.id}
                            style={{
                              padding: 10,
                              border: '1px solid var(--color-rule)',
                              borderRadius: 8,
                              background: 'var(--color-paper)',
                            }}
                          >
                            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                              <div style={{ flex: 1, fontSize: 13 }}>
                                <LatexRenderer content={ex.prompt} />
                                <div className="mono" style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 4 }}>
                                  Thang {ex.maxScore} điểm · {ex.submissions?.length ?? 0} bài nộp
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                <button
                                  className="btn btn-outline"
                                  style={{ width: 'auto', padding: '4px 10px', fontSize: 12 }}
                                  onClick={() =>
                                    setOpenSubmissions(openSubmissions === ex.id ? null : ex.id)
                                  }
                                >
                                  Bài nộp ({ex.submissions?.length ?? 0})
                                </button>
                                <button
                                  className="btn btn-danger"
                                  style={{ width: 'auto', padding: '4px 10px', fontSize: 12 }}
                                  onClick={() => deleteExercise(lesson.id, ex.id)}
                                >
                                  Xóa
                                </button>
                              </div>
                            </div>

                            {openSubmissions === ex.id && (
                              <div style={{ marginTop: 10 }}>
                                {!ex.submissions?.length ? (
                                  <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                                    Chưa có học sinh nộp bài.
                                  </p>
                                ) : (
                                  ex.submissions.map((s: any) => (
                                    <div
                                      key={s.id}
                                      style={{
                                        padding: 10,
                                        border: '1px solid var(--color-rule)',
                                        borderRadius: 6,
                                        marginBottom: 8,
                                        background: 'var(--color-paper-2)',
                                      }}
                                    >
                                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                                        <strong style={{ fontSize: 13 }}>{s.student?.fullName}</strong>
                                        <span className="mono" style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                                          {s.student?.studentCode}
                                        </span>
                                        {s.teacherScore !== null && s.teacherScore !== undefined ? (
                                          <span className="badge badge-success">
                                            Đã chốt: {s.teacherScore}/{ex.maxScore}
                                          </span>
                                        ) : s.aiScore !== null && s.aiScore !== undefined ? (
                                          <span className="badge badge-accent">Sơ bộ: {s.aiScore}/{ex.maxScore}</span>
                                        ) : (
                                          <span className="badge badge-warning">Chờ chấm</span>
                                        )}
                                      </div>
                                      <p style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{s.content}</p>
                                      {s.imageUrls?.length > 0 && (
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                                          {s.imageUrls.map((url: string, i: number) => (
                                            <a key={i} href={url} target="_blank" rel="noreferrer">
                                              <img
                                                src={url}
                                                alt={`Ảnh ${i + 1}`}
                                                style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--color-rule)' }}
                                              />
                                            </a>
                                          ))}
                                        </div>
                                      )}
                                      {s.aiFeedback && (
                                        <div
                                          style={{
                                            fontSize: 12,
                                            marginTop: 6,
                                            padding: 8,
                                            background: 'color-mix(in oklch, var(--color-accent) 7%, var(--color-paper))',
                                            borderRadius: 6,
                                            whiteSpace: 'pre-wrap',
                                          }}
                                        >
                                          <strong style={{ fontSize: 11 }}>Bản nháp chấm sơ bộ:</strong>
                                          <div style={{ marginTop: 2 }}>{s.aiFeedback}</div>
                                        </div>
                                      )}
                                      {s.teacherNote && (
                                        <div
                                          style={{
                                            fontSize: 12,
                                            marginTop: 6,
                                            padding: 8,
                                            background: 'color-mix(in oklch, var(--color-success) 10%, var(--color-paper))',
                                            borderRadius: 6,
                                            whiteSpace: 'pre-wrap',
                                          }}
                                        >
                                          <strong style={{ fontSize: 11 }}>📝 Thầy cô nhận xét:</strong>
                                          <div style={{ marginTop: 2 }}>{s.teacherNote}</div>
                                        </div>
                                      )}
                                      <div style={{ marginTop: 8 }}>
                                        <button
                                          className="btn"
                                          style={{ width: 'auto', padding: '5px 12px', fontSize: 12 }}
                                          onClick={() => openReviewSubmission(ex, s)}
                                        >
                                          {s.teacherScore !== null && s.teacherScore !== undefined ? '✏️ Sửa điểm chốt' : '✅ Chốt điểm'}
                                        </button>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                        Chưa có bài tập. Thêm bài tập tự luận để chấm điểm cho học sinh.
                      </p>
                    )}

                    {/* Thảo luận bài giảng */}
                    <LessonComments courseId={courseId as string} lessonId={lesson.id} />
                  </div>
                </div>
              )}
            </div>
                  );
                })}
              </div>
            </div>
          ))}
          </div>
        </div>
      )}

      {/* Modal xác nhận xóa */}
      {deleteTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1500,
            padding: 20,
          }}
          onClick={() => setDeleteTarget(null)}
        >
          <div className="auth-card" onClick={(e) => e.stopPropagation()}>
            <div className="logo">🗑️</div>
            <h1>Xóa bài giảng?</h1>
            <p className="subtitle">
              Bạn chắc chắn muốn xóa bài giảng <strong>{deleteTarget.title}</strong>? Hành động này không thể hoàn tác.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={confirmDelete}>
                Xóa
              </button>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setDeleteTarget(null)}>
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal quản lý chương: đổi tên + sắp xếp thứ tự */}
      {chapterEditor && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'color-mix(in oklch, var(--color-ink) 45%, transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
            padding: 16,
          }}
          onClick={() => !savingChapters && setChapterEditor(false)}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: 560, margin: 0, maxHeight: '86vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginBottom: 6 }}>⚙️ Quản lý chương</h3>
            <p style={{ fontSize: 12.5, color: 'var(--color-muted)', marginBottom: 14 }}>
              Sửa tên chương và dùng nút ▲ ▼ để đổi thứ tự. Bài học trong mỗi chương được đánh số lại từ 1.
            </p>

            {chapterList.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>Khóa học chưa có chương nào.</p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {chapterList.map((c, i) => (
                <div key={c.orig || 'empty'} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--color-muted)', width: 22, textAlign: 'right' }}>
                    {i + 1}.
                  </span>
                  <input
                    value={c.name}
                    onChange={(e) => {
                      const next = [...chapterList];
                      next[i] = { ...next[i], name: e.target.value };
                      setChapterList(next);
                    }}
                    placeholder={c.orig ? 'Tên chương' : 'Chương chưa đặt tên'}
                    style={{ flex: 1, padding: '7px 10px', fontSize: 13.5 }}
                  />
                  <button
                    type="button"
                    onClick={() => moveChapter(i, -1)}
                    disabled={i === 0}
                    title="Lên"
                    style={{ padding: '6px 9px', borderRadius: 8, border: '1px solid var(--color-rule)', background: 'var(--color-paper)', cursor: i === 0 ? 'not-allowed' : 'pointer', opacity: i === 0 ? 0.4 : 1 }}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => moveChapter(i, 1)}
                    disabled={i === chapterList.length - 1}
                    title="Xuống"
                    style={{ padding: '6px 9px', borderRadius: 8, border: '1px solid var(--color-rule)', background: 'var(--color-paper)', cursor: i === chapterList.length - 1 ? 'not-allowed' : 'pointer', opacity: i === chapterList.length - 1 ? 0.4 : 1 }}
                  >
                    ▼
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
              <button
                className="btn-lm ghost"
                type="button"
                onClick={() => setChapterEditor(false)}
                disabled={savingChapters}
              >
                Hủy
              </button>
              <button
                className="btn-lm amber"
                type="button"
                onClick={saveChapters}
                disabled={savingChapters}
              >
                {savingChapters ? 'Đang lưu…' : 'Lưu thay đổi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal xác nhận xóa khóa học */}
      {deleteCourseConfirm && (
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
          onClick={() => setDeleteCourseConfirm(false)}
        >
          <div className="auth-card" onClick={(e) => e.stopPropagation()}>
            <div className="logo">🗑️</div>
            <h1>Xóa khóa học?</h1>
            <p className="subtitle">
              Xóa khóa học <strong>{course?.title}</strong> sẽ xóa toàn bộ bài giảng, bài tập và
              dữ liệu đăng ký. Hành động này không thể hoàn tác!
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={confirmDeleteCourse}>
                Xóa vĩnh viễn
              </button>
              <button
                className="btn btn-outline"
                style={{ flex: 1 }}
                onClick={() => setDeleteCourseConfirm(false)}
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal chốt điểm bài nộp */}
      {reviewSub && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'color-mix(in oklch, var(--color-ink) 50%, transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1600,
            padding: 16,
          }}
          onClick={() => setReviewSub(null)}
        >
          <div
            style={{
              background: 'var(--color-paper)',
              borderRadius: 14,
              maxWidth: 680,
              width: '100%',
              maxHeight: '88vh',
              overflowY: 'auto',
              padding: 20,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 16, marginBottom: 4 }}>
              ✅ Chốt điểm — {reviewSub.submission.student?.fullName}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 10 }}>
              Thang điểm {reviewSub.exercise.maxScore} · {reviewSub.submission.student?.studentCode}
            </p>

            <div style={{ fontSize: 13, marginBottom: 10 }}>
              <strong>Đề bài:</strong> <LatexRenderer content={reviewSub.exercise.prompt} />
            </div>

            <div style={{ fontSize: 13, marginBottom: 10, padding: 10, background: 'var(--color-paper-2)', borderRadius: 8, whiteSpace: 'pre-wrap' }}>
              <strong>Bài làm:</strong>
              <div style={{ marginTop: 4 }}>{reviewSub.submission.content}</div>
            </div>

            {reviewSub.submission.imageUrls?.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <strong style={{ fontSize: 13 }}>Ảnh bài làm (bấm "✏️ Sửa" để viết trực tiếp lên ảnh):</strong>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {reviewSub.submission.imageUrls.map((url: string, i: number) => (
                    <div key={i} style={{ position: 'relative' }}>
                      <img
                        src={url}
                        alt={`Ảnh ${i + 1}`}
                        style={{ width: 130, height: 130, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--color-rule)' }}
                      />
                      <button
                        className="btn"
                        style={{
                          position: 'absolute',
                          bottom: 6,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          padding: '4px 10px',
                          fontSize: 11,
                          width: 'auto',
                        }}
                        onClick={() => setAnnotatingSrc(url)}
                      >
                        ✏️ Sửa
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {reviewSub.submission.annotatedUrls?.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <strong style={{ fontSize: 13, color: 'var(--color-success)' }}>
                  📝 Ảnh đã sửa (học sinh sẽ thấy):
                </strong>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {reviewSub.submission.annotatedUrls.map((url: string, i: number) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer">
                      <img
                        src={url}
                        alt={`Đã sửa ${i + 1}`}
                        style={{ width: 130, height: 130, objectFit: 'cover', borderRadius: 8, border: '2px solid var(--color-success)' }}
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {reviewSub.submission.aiFeedback && (
              <div
                style={{
                  fontSize: 12,
                  marginBottom: 10,
                  padding: 8,
                  background: 'color-mix(in oklch, var(--color-accent) 7%, var(--color-paper))',
                  borderRadius: 6,
                  whiteSpace: 'pre-wrap',
                }}
              >
                <strong style={{ fontSize: 11 }}>Bản nháp chấm sơ bộ:</strong>
                <div style={{ marginTop: 2 }}>{reviewSub.submission.aiFeedback}</div>
              </div>
            )}

            <div className="form-group">
              <label>Điểm chốt (0 – {reviewSub.exercise.maxScore})</label>
              <input
                type="number"
                min={0}
                max={reviewSub.exercise.maxScore}
                step={0.25}
                value={reviewScore}
                onChange={(e) => setReviewScore(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>📝 Nhận xét của thầy cô (học sinh và phụ huynh sẽ thấy)</label>
              <textarea
                rows={4}
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="Nhận xét về bài làm, cách trình bày..."
              />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn" style={{ flex: 1 }} onClick={saveReview} disabled={reviewSaving}>
                {reviewSaving ? 'Đang lưu…' : '✅ Chốt điểm & gửi nhận xét'}
              </button>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setReviewSub(null)}>
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sửa bài trên ảnh */}
      {annotatingSrc && (
        <ImageAnnotator
          src={annotatingSrc}
          onCancel={() => setAnnotatingSrc(null)}
          onSave={handleAnnotatedBlob}
        />
      )}

      {/* Modal chọn câu tự luận từ ngân hàng đề */}
      {bankPicker && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'color-mix(in oklch, var(--color-ink) 50%, transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1700,
            padding: 16,
          }}
          onClick={() => setBankPicker(null)}
        >
          <div
            style={{
              background: 'var(--color-paper)',
              borderRadius: 14,
              maxWidth: 720,
              width: '100%',
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              padding: 18,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 16, marginBottom: 4 }}>🏦 Chọn câu tự luận từ ngân hàng đề</h2>
            <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 10 }}>
              Đã chọn <strong>{bankSelected.length}</strong> câu · mỗi câu sẽ thành 1 bài BTVN riêng
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input
                value={bankSearch}
                onChange={(e) => setBankSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    searchBank(bankSearch);
                  }
                }}
                placeholder="Tìm câu hỏi (nội dung, chủ đề)..."
                style={{ flex: 1 }}
              />
              <button className="btn" style={{ width: 'auto' }} onClick={() => searchBank(bankSearch)}>
                🔍 Tìm
              </button>
              <div className="form-group" style={{ width: 120, margin: 0 }}>
                <label style={{ fontSize: 11 }}>Điểm/câu</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={bankMaxScore}
                  onChange={(e) => setBankMaxScore(e.target.value)}
                />
              </div>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, border: '1px solid var(--color-rule)', borderRadius: 8 }}>
              {bankLoading ? (
                <p style={{ padding: 20, color: 'var(--color-muted)', fontSize: 13 }}>Đang tải…</p>
              ) : bankQuestions.length === 0 ? (
                <p style={{ padding: 20, color: 'var(--color-muted)', fontSize: 13 }}>
                  Không có câu tự luận nào trong ngân hàng đề.
                </p>
              ) : (
                bankQuestions.map((q: any) => {
                  const checked = bankSelected.includes(q.id);
                  return (
                    <label
                      key={q.id}
                      style={{
                        display: 'flex',
                        gap: 10,
                        alignItems: 'flex-start',
                        padding: '10px 12px',
                        borderBottom: '1px solid var(--color-rule)',
                        cursor: 'pointer',
                        background: checked ? 'color-mix(in oklch, var(--color-accent) 8%, var(--color-paper))' : 'transparent',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleBankSelect(q.id)}
                        style={{ width: 'auto', marginTop: 4 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13 }}>
                          <LatexRenderer content={q.content} />
                        </div>
                        <div className="mono" style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 3 }}>
                          {q.code} {q.topic?.name ? '· ' + q.topic.name : ''}
                          {q.grade ? ` · Lớp ${q.grade}` : ''}
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button
                className="btn"
                style={{ flex: 1 }}
                onClick={assignFromBank}
                disabled={exSaving || bankSelected.length === 0}
              >
                {exSaving ? 'Đang gán…' : `✅ Gán ${bankSelected.length || ''} câu làm BTVN`}
              </button>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setBankPicker(null)}>
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal sửa thông tin học sinh */}
      {editingStudent && (
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
          onClick={() => setEditingStudent(null)}
        >
          <div className="auth-card" onClick={(e) => e.stopPropagation()}>
            <div className="logo">✏️</div>
            <h1>Sửa học sinh</h1>
            <p className="subtitle">
              {editingStudent.student.studentCode} · {editingStudent.student.email}
            </p>
            <div className="form-group">
              <label>Họ tên</label>
              <input value={studentForm.fullName} onChange={(e) => setStudentForm({ ...studentForm, fullName: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input value={studentForm.email} onChange={(e) => setStudentForm({ ...studentForm, email: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Khối (1–12)</label>
              <input
                value={studentForm.grade}
                onChange={(e) => setStudentForm({ ...studentForm, grade: e.target.value })}
                type="number"
                min={1}
                max={12}
                placeholder="VD: 12"
              />
            </div>
            <div className="form-group">
              <label>Lớp</label>
              <input value={studentForm.className} onChange={(e) => setStudentForm({ ...studentForm, className: e.target.value })} placeholder="VD: 12A1" />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn" style={{ flex: 1 }} disabled={savingStudent} onClick={saveEditStudent}>
                {savingStudent ? 'Đang lưu…' : 'Lưu'}
              </button>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setEditingStudent(null)}>
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
