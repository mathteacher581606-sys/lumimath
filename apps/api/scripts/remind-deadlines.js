// Script nhắc nộp bài — chạy mỗi giờ qua cron trên VPS
// Tìm bài giảng BTVN có deadline trong 24h tới → nhắc HS chưa nộp (1 lần duy nhất)
// Gửi thông báo trong app + email (nếu SMTP cấu hình + HS bật nhận email)
const fs = require('fs');
const path = require('path');

// Nạp .env từ gốc dự án
function loadEnv() {
  const candidates = [
    '/opt/lumimath/.env',
    path.resolve(__dirname, '..', '..', '..', '.env'),
    path.resolve(process.cwd(), '.env'),
  ];
  for (const f of candidates) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      const k = t.slice(0, eq).trim();
      if (process.env[k] === undefined) process.env[k] = v;
    }
  }
}
loadEnv();

const { PrismaClient } = require('@prisma/client');
const nodemailer = require('nodemailer');
const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 3600 * 1000);

  const lessons = await prisma.lesson.findMany({
    where: {
      examId: { not: null },
      deadline: { gte: now, lte: in24h },
    },
    include: {
      course: {
        include: {
          enrollments: {
            include: {
              student: { select: { id: true, email: true, fullName: true, emailNotify: true } },
            },
          },
        },
      },
      exam: { select: { id: true, title: true } },
    },
  });

  let sent = 0;
  for (const lesson of lessons) {
    for (const en of lesson.course.enrollments) {
      const student = en.student;

      // Đã nộp bài chưa?
      const submitted = await prisma.examAttempt.findFirst({
        where: {
          examId: lesson.examId,
          studentId: student.id,
          submittedAt: { not: null },
        },
      });
      if (submitted) continue;

      // Đã nhắc chưa? (1 lần duy nhất)
      const reminded = await prisma.deadlineReminder.findUnique({
        where: {
          lessonId_studentId: { lessonId: lesson.id, studentId: student.id },
        },
      });
      if (reminded) continue;

      const deadlineStr = lesson.deadline.toLocaleString('vi-VN');

      // Thông báo trong app
      await prisma.notification.create({
        data: {
          userId: student.id,
          title: '⏰ BTVN sắp hết hạn!',
          body: `"${lesson.exam.title}" — hạn nộp ${deadlineStr}. Hoàn thành trước hạn nhé!`,
          link: `/student/courses/${lesson.courseId}`,
        },
      });
      await prisma.deadlineReminder.create({
        data: { lessonId: lesson.id, studentId: student.id },
      });

      // Email nhắc
      if (
        process.env.SMTP_HOST &&
        process.env.SMTP_USER &&
        student.emailNotify !== false
      ) {
        try {
          const t = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT || 587),
            secure: String(process.env.SMTP_PORT) === '465',
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
          });
          await t.sendMail({
            from: process.env.SMTP_FROM || `"LumiMath" <${process.env.SMTP_USER}>`,
            to: student.email,
            subject: `⏰ Nhắc nộp bài: ${lesson.exam.title}`,
            html: `<h3>Xin chào ${student.fullName}!</h3>
<p>Bài tập <b>${lesson.exam.title}</b> sẽ hết hạn lúc <b>${deadlineStr}</b>.</p>
<p>Hãy hoàn thành trước hạn nộp nhé!</p>
<p style="color:#888">— LumiMath</p>`,
          });
        } catch (e) {
          console.error('Email loi:', e.message);
        }
      }
      sent++;
    }
  }

  console.log(
    `[remind-deadlines] ${new Date().toISOString()} — da nhac ${sent} hoc sinh`,
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Loi remind-deadlines:', e);
  await prisma.$disconnect();
  process.exit(1);
});
