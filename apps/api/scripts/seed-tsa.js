// Seed đề mẫu TSA — Tư duy Toán học (15 câu, 4 dạng) cho teacher@lumimath.vn
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const TEACHER_EMAIL = 'teacher@lumimath.vn';

// câu: { type, content, options?, answer, solution }
const QUESTIONS = [
  // ===== Phần trắc nghiệm 1 đáp án (MCQ) =====
  { type: 'MCQ', content: 'Tổng tất cả các nghiệm của phương trình $x^2 - 5x + 6 = 0$ là', options: [{id:'A',text:'5'},{id:'B',text:'-5'},{id:'C',text:'6'},{id:'D',text:'-6'}], answer: 'A', solution: 'Theo định lý Vi-ét: $x_1+x_2 = 5$.' },
  { type: 'MCQ', content: 'Đạo hàm của hàm số $y = x^3 - 3x + 1$ là', options: [{id:'A',text:'$3x^2-3$'},{id:'B',text:'$x^2-3$'},{id:'C',text:'$3x^2+3$'},{id:'D',text:'$3x^2-3x$'}], answer: 'A', solution: "$y' = 3x^2 - 3$." },
  { type: 'MCQ', content: '$\\lim\\limits_{x \\to 1} \\dfrac{x^2-1}{x-1}$ bằng', options: [{id:'A',text:'0'},{id:'B',text:'1'},{id:'C',text:'2'},{id:'D',text:'Không tồn tại'}], answer: 'C', solution: '$\\dfrac{x^2-1}{x-1}=x+1 \\to 2$.' },
  { type: 'MCQ', content: 'Cho hình chóp $S.ABC$ có đáy $ABC$ là tam giác đều cạnh $a$, $SA \\perp (ABC)$ và $SA = a\\sqrt{3}$. Thể tích khối chóp là', options: [{id:'A',text:'$\\dfrac{a^3}{4}$'},{id:'B',text:'$\\dfrac{a^3}{2}$'},{id:'C',text:'$\\dfrac{a^3\\sqrt{3}}{4}$'},{id:'D',text:'$\\dfrac{a^3\\sqrt{3}}{2}$'}], answer: 'A', solution: '$V = \\frac{1}{3} \\cdot \\frac{a^2\\sqrt3}{4} \\cdot a\\sqrt3 = \\frac{a^3}{4}$.' },
  { type: 'MCQ', content: 'Cho cấp số cộng $(u_n)$ có $u_1 = 3$ và $u_2 = 7$. Công sai $d$ là', options: [{id:'A',text:'3'},{id:'B',text:'4'},{id:'C',text:'7'},{id:'D',text:'10'}], answer: 'B', solution: '$d = u_2 - u_1 = 4$.' },
  { type: 'MCQ', content: 'Gieo một con xúc xắc cân đối đồng chất một lần. Xác suất để mặt xuất hiện có số chấm là số chẵn là', options: [{id:'A',text:'$\\dfrac{1}{6}$'},{id:'B',text:'$\\dfrac{1}{3}$'},{id:'C',text:'$\\dfrac{1}{2}$'},{id:'D',text:'$\\dfrac{2}{3}$'}], answer: 'C', solution: 'Có 3 mặt chẵn (2,4,6) trong 6 mặt → $\\dfrac{3}{6} = \\dfrac{1}{2}$.' },

  // ===== Trắc nghiệm NHIỀU đáp án (MULTI_ANSWER) =====
  { type: 'MULTI_ANSWER', content: 'Hàm số nào sau đây đồng biến trên $\\mathbb{R}$? (chọn TẤT CẢ các đáp án đúng)', options: [{id:'A',text:'$y=x^3$'},{id:'B',text:'$y=x^2$'},{id:'C',text:'$y=e^x$'},{id:'D',text:'$y=\\dfrac{1}{x}$'}], answer: ['A','C'], solution: '$y=x^3$ và $y=e^x$ đồng biến trên $\\mathbb{R}$; $y=x^2$ không đơn điệu trên $\\mathbb{R}$; $y=1/x$ gián đoạn tại 0.' },
  { type: 'MULTI_ANSWER', content: 'Cho hàm số $y=f(x)$ liên tục trên $[a;b]$. Khẳng định nào ĐÚNG? (chọn TẤT CẢ)', options: [{id:'A',text:'$f(x)$ có giá trị lớn nhất trên $[a;b]$'},{id:'B',text:'$f(x)$ có giá trị nhỏ nhất trên $[a;b]$'},{id:'C',text:'$f(x)$ luôn có cực trị'},{id:'D',text:'$f(x)$ liên tục tại mọi điểm trong $(a;b)$'}], answer: ['A','B','D'], solution: 'Hàm liên tục trên đoạn luôn đạt max/min; liên tục trên khoảng; nhưng không bắt buộc có cực trị.' },
  { type: 'MULTI_ANSWER', content: 'Các số đặc trưng đo độ phân tán của mẫu số liệu ghép nhóm gồm (chọn TẤT CẢ)', options: [{id:'A',text:'Khoảng biến thiên'},{id:'B',text:'Khoảng tứ phân vị'},{id:'C',text:'Phương sai'},{id:'D',text:'Số trung bình'}], answer: ['A','B','C'], solution: 'Số trung bình là đặc trưng đo xu thế trung tâm, không phải độ phân tán.' },

  // ===== Đúng/Sai (TRUE_FALSE) =====
  { type: 'TRUE_FALSE', content: 'Cho các mệnh đề sau:', options: [{id:'a',text:'Mọi số nguyên tố đều là số lẻ.'},{id:'b',text:'$2$ là số nguyên tố chẵn duy nhất.'},{id:'c',text:'Tổng hai số hữu tỉ là số hữu tỉ.'},{id:'d',text:'Tích hai số vô tỉ luôn là số vô tỉ.'}], answer: {a:false,b:true,c:true,d:false}, solution: '2 là số nguyên tố chẵn; tổng hai số hữu tỉ là hữu tỉ; $\\sqrt2 \\cdot \\sqrt2 = 2$ hữu tỉ nên (d) sai.' },
  { type: 'TRUE_FALSE', content: 'Cho tam giác $ABC$ vuông tại $A$. Xét các khẳng định:', options: [{id:'a',text:'$BC^2 = AB^2 + AC^2$.'},{id:'b',text:'$\\cos B = \\dfrac{AB}{BC}$.'},{id:'c',text:'$\\sin C = \\dfrac{AB}{BC}$.'},{id:'d',text:'$\\tan B = \\dfrac{AC}{AB}$.'}], answer: {a:true,b:true,c:true,d:true}, solution: 'Tất cả đều đúng theo hệ thức lượng trong tam giác vuông.' },
  { type: 'TRUE_FALSE', content: 'Cho hàm số $y=x^3-3x+2$. Xét các khẳng định:', options: [{id:'a',text:'Hàm số có hai điểm cực trị.'},{id:'b',text:'Hàm số đồng biến trên $\\mathbb{R}$.'},{id:'c',text:'Đồ thị hàm số có tâm đối xứng.'},{id:'d',text:'$y(1)=0$.'}], answer: {a:true,b:false,c:true,d:true}, solution: "$y'=3x^2-3=3(x-1)(x+1)$ → 2 cực trị; hàm bậc 3 có tâm đối xứng là điểm uốn; $y(1)=1-3+2=0$." },

  // ===== Điền số (SHORT_ANSWER) =====
  { type: 'SHORT_ANSWER', content: 'Số nghiệm nguyên của bất phương trình $x^2 - 4 < 0$ là', answer: '3', solution: '$x^2<4 \\Leftrightarrow -2<x<2$ → các số nguyên $-1,0,1$ (3 nghiệm).' },
  { type: 'SHORT_ANSWER', content: 'Cho $\\int_0^1 (2x+1)\\,dx$. Giá trị của tích phân là', answer: '2', solution: '$\\left[x^2+x\\right]_0^1 = 1+1 = 2$.' },
  { type: 'SHORT_ANSWER', content: 'Cho cấp số nhân có $u_1=2$ và công bội $q=3$. Giá trị $u_3$ là', answer: '18', solution: '$u_3 = u_1 q^2 = 2 \\cdot 9 = 18$.' },
];

async function main() {
  const teacher = await p.user.findUnique({ where: { email: TEACHER_EMAIL } });
  if (!teacher) { console.error('Khong tim thay teacher'); return; }
  const bank = await p.questionBank.findFirst({ where: { teacherId: teacher.id } });
  if (!bank) { console.error('Khong tim thay bank'); return; }

  // Tạo các câu hỏi
  let order = 0;
  const examItems = [];
  for (const q of QUESTIONS) {
    const code = 'TSA-' + String(++order).padStart(2, '0');
    const created = await p.question.create({
      data: {
        code, bankId: bank.id, type: q.type, content: q.content,
        options: q.options ?? null, answer: q.answer, solution: q.solution,
        grade: 12, difficulty: 'VAN_DUNG', form: 'Luyện đề TSA — Tư duy Toán học',
        aiClassified: true,
      },
    });
    examItems.push({ questionId: created.id, part: 1, order, score: 1 });
  }

  // Tạo đề TSA mẫu
  const exam = await p.exam.create({
    data: {
      teacherId: teacher.id,
      title: 'TSA — Tư duy Toán học (Đề mẫu)',
      description: 'Đề luyện thi Đánh giá tư duy (TSA) — môn Toán. 15 câu, đủ 4 dạng: trắc nghiệm 1 đáp án, nhiều đáp án, đúng/sai, điền số.',
      grade: 12,
      duration: 60,
      totalScore: 15,
      status: 'PUBLISHED',
      published: true,
      maxAttempts: 0,
      examKind: 'PRACTICE_TSA',
      sections: [{ title: 'Tư duy Toán học', duration: 60, count: 15 }],
      practiceMode: false,
      answersAtEnd: true,
      items: { create: examItems },
    },
  });

  console.log('Da tao de mau TSA:', exam.id, '| cau hoi:', QUESTIONS.length);
  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
