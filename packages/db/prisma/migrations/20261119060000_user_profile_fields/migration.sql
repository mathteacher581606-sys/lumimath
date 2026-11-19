-- Hồ sơ cá nhân tự sửa trong Cài đặt (chỉ THÊM cột, không xoá dữ liệu)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "birthDate" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "parentPhone" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "theme" TEXT;
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
