-- Bài giảng: ẩn (nháp) + hẹn giờ mở; Bài tập: gắn vào bài giảng. Chỉ THÊM cột, không xoá dữ liệu.
ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "hidden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "publishAt" TIMESTAMP(3);
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "lessonId" TEXT;
CREATE INDEX IF NOT EXISTS "Assignment_lessonId_idx" ON "Assignment"("lessonId");
DO $$ BEGIN
  ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_lessonId_fkey"
    FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
