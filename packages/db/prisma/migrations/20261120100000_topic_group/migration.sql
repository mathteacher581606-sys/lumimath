-- Nhóm mục lục tự đặt tên. Chỉ THÊM cột, không xoá/sửa dữ liệu.
ALTER TABLE "Topic" ADD COLUMN IF NOT EXISTS "isGroup" BOOLEAN NOT NULL DEFAULT false;
