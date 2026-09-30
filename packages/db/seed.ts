import { PrismaClient, Role, Difficulty, QuestionType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Bắt đầu seed dữ liệu...');

  // ---------- Tạo Giáo viên ----------
  const teacherPass = await bcrypt.hash('Teacher@123', 10);
  const teacher = await prisma.user.upsert({
    where: { email: 'teacher@lumimath.vn' },
    update: {},
    create: {
      email: 'teacher@lumimath.vn',
      passwordHash: teacherPass,
      role: Role.TEACHER,
      fullName: 'Nguyễn Văn A',
      school: 'THPT Chuyên Lê Hồng Phong',
      workplace: 'TP.HCM',
      teacherCode: 'GV-000001',
      questionBank: {
        create: {
          name: 'Ngân hàng Toán 12',
          topics: {
            create: [
              { name: 'Ứng dụng đạo hàm', grade: 12 },
              { name: 'Nguyên hàm - Tích phân', grade: 12 },
              { name: 'Số phức', grade: 12 },
              { name: 'Hình học không gian', grade: 12 },
            ],
          },
        },
      },
    },
    include: { questionBank: { include: { topics: true } } },
  });

  // ---------- Tạo Học sinh ----------
  const studentPass = await bcrypt.hash('Student@123', 10);
  const student = await prisma.user.upsert({
    where: { email: 'student@lumimath.vn' },
    update: {},
    create: {
      email: 'student@lumimath.vn',
      passwordHash: studentPass,
      role: Role.STUDENT,
      fullName: 'Trần Thị B',
      school: 'THPT Chuyên Lê Hồng Phong',
      className: '12A1',
      studentCode: 'HS-000001',
    },
  });

  // ---------- Tạo câu hỏi mẫu ----------
  const bankId = teacher.questionBank!.id;
  const topic = teacher.questionBank!.topics[0];

  const samples = [
    {
      code: 'A100001',
      type: QuestionType.MCQ,
      content: 'Cho hàm số $y = x^2 - 2x + 3$. Tọa độ đỉnh của parabol là:',
      options: [
        { id: 'A', text: '$I(1;2)$' },
        { id: 'B', text: '$I(-1;2)$' },
        { id: 'C', text: '$I(1;-2)$' },
        { id: 'D', text: '$I(2;1)$' },
      ],
      answer: 'A',
      solution: 'Đỉnh $I\\left(-\\frac{b}{2a}; -\\frac{\\Delta}{4a}\\right) = (1;2)$',
      difficulty: Difficulty.NHAN_BIET,
    },
    {
      code: 'A100002',
      type: QuestionType.MCQ,
      content: 'Hàm số $y = -x^3 + 3x$ đồng biến trên khoảng nào?',
      options: [
        { id: 'A', text: '$(-1;1)$' },
        { id: 'B', text: '$(-\\infty;-1)$' },
        { id: 'C', text: '$(1;+\\infty)$' },
        { id: 'D', text: '$\\mathbb{R}$' },
      ],
      answer: 'A',
      solution: "$y' = -3x^2 + 3 > 0 \\Leftrightarrow -1 < x < 1$",
      difficulty: Difficulty.THONG_HIEU,
    },
    {
      code: 'A100003',
      type: QuestionType.TRUE_FALSE,
      content: 'Cho hàm số $y = x^4 - 2x^2$. Xét tính đúng sai:',
      options: [
        { id: 'a', text: 'Hàm số có 3 điểm cực trị' },
        { id: 'b', text: 'Hàm số đạt cực đại tại $x = 0$' },
        { id: 'c', text: 'Hàm số có giá trị nhỏ nhất bằng $-1$' },
        { id: 'd', text: 'Đồ thị hàm số nhận $Oy$ làm trục đối xứng' },
      ],
      answer: { a: true, b: true, c: true, d: true },
      difficulty: Difficulty.VAN_DUNG,
    },
  ];

  for (const q of samples) {
    await prisma.question.upsert({
      where: { code: q.code },
      update: {},
      create: {
        ...q,
        bankId,
        topicId: topic.id,
        grade: 12,
        aiClassified: false,
      },
    });
  }

  console.log('✅ Seed xong!');
  console.log('👨‍🏫 Giáo viên: teacher@lumimath.vn / Teacher@123');
  console.log('👨‍🎓 Học sinh: student@lumimath.vn / Student@123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());