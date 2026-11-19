---

description: "Task list — sửa ảnh upload bị hỏng do sai thang chất lượng JPEG"
---

# Tasks: Sửa lỗi ảnh bài làm học sinh bị hỏng khi tải lên

**Input**: `/specs/010-upload-image-corruption/`
**Prerequisites**: plan.md ✅, spec.md ✅

## Phase 1: Chẩn đoán

- [x] T001 Rà `storage/uploads`: 2.409 tệp; tệp mới nhất chỉ **6–10 KB** trong khi ảnh gốc
      cùng ngày là **1 MB** → nghi vấn bước nén
- [x] T002 Xem trực tiếp 2 tệp: `up2.jpg` (1 MB, dưới ngưỡng nén) **sắc nét**;
      `up1.jpg` (8,6 KB, đã nén) **vỡ khối, xám, quay 90°** ⇒ lỗi ở bước nén
- [x] T003 Thực nghiệm `canvas.toBuffer('image/jpeg', q)`:
      `q=0.75|0.6|0.5|0.4` → **13,1 KB (cả 4)**; `q=75|60|50|40` → **185|131|111|92 KB**
      ⇒ **`@napi-rs/canvas` dùng thang 0–100**, mã cũ truyền thang 0–1

## Phase 2: Sửa

- [x] T010 [US1] `compressImage()` — đổi sang `[85, 75, 65, 55]` (thang 0–100)
- [x] T011 [US1] `maxDim` 1280 → **1600** (đủ nét cho chữ viết tay)
- [x] T012 [US1] Chốt an toàn: bỏ kết quả **< 8 KB**; không nén vừa ngưỡng ⇒ **giữ ảnh gốc**
- [x] T013 [US1] Giữ nguyên nhánh ảnh ≤ 1 MB (không nén) và nhánh lỗi giải mã

## Phase 3: Chống hồi quy EXIF

- [x] T020 [US1] Phát hiện `loadImage()` **đã tự áp EXIF** (2400×3200 + EXIF 6 → **3200×2400**)
- [x] T021 [US1] Bỏ phần xoay EXIF thủ công (bản đầu gây **quay 2 lần**: ảnh ra 1200×1600
      thay vì 1600×1200) — chỉ vẽ `drawImage` trực tiếp

## Phase 4: Kiểm thử thực tế

- [x] T030 [US1] Upload ảnh **2,6 MB** qua API thật → lưu **401,3 KB**, `compressed=true`,
      tải lại 200, magic `ffd8ff`
- [x] T031 [US1] Ảnh ra **1200×1600**, rõ nét, đúng chiều (xem trực tiếp)
- [x] T032 [US1] Ảnh 2,6 MB có **EXIF=6** → ra **1600×1200** (xoay đúng 1 lần), 401,6 KB
- [x] T033 [US1] Ảnh ≤ 1 MB vẫn lưu nguyên bản (nhánh `compressed=false` giữ nguyên)
- [x] T034 Đếm phạm vi ảnh cũ bị ảnh hưởng: **17 JPEG 8–30 KB** + **4 JPEG < 8 KB**
      (phần lớn tạo 11-12 và 11-13) — **không thể phục hồi**
- [x] T035 `nest build` pass; `pm2 restart` ok; API 200

## Requirements coverage

| FR | Task |
|---|---|
| FR-001 | T003, T010 |
| FR-002 | T020, T021 |
| FR-003 | T012 |
| FR-004 | T012 |
| FR-005 | T013 |
| FR-006 | (giữ nguyên `MAX_SIZE` 15 MB và `EXT_BY_TYPE`) |
