# 016 — Khóa học & bài học: rà soát, bảo mật, giao diện mới

## Bảo mật (API)
- [x] Không gửi mật khẩu ghi danh cho học sinh (`hasPassword`), kể cả `/courses/my`
- [x] `GET /courses/:id`: chỉ chủ khóa / trợ giảng / admin thấy toàn bộ; khóa chưa xuất bản → 404 với HS
- [x] Quiz củng cố: phiếu ký HMAC, chỉ chấm bộ câu đã phát (chặn dò đáp án ngân hàng bằng mã câu bất kỳ)
- [x] Quiz/ghi chú/thảo luận/hoàn thành bài: kiểm tra ghi danh + bài thuộc khóa + không ẩn + đã tới giờ mở
- [x] Bài giao: mọi thao tác sửa/xoá/chấm/trả bài/ghi chú ảnh/xuất điểm kiểm tra đúng khóa trong URL
- [x] Đề / câu ngân hàng / bài giảng gắn vào bài giao & bài giảng phải thuộc GV (hoặc chủ khóa)
- [x] Giới hạn thử mật khẩu ghi danh 10 lần/15 phút; bình luận ≤ 2.000, ghi chú ≤ 20.000 ký tự
- [x] Trợ giảng được vào thảo luận bài giảng

## Tính năng
- [x] `Assignment.lessonId` — bài tập trong bài giảng dùng chung hệ thống Bài tập (thay "bài tập tự luận" cũ không có API)
- [x] `Lesson.hidden` (bài nháp) + `Lesson.publishAt` (hẹn giờ mở)
- [x] `POST /courses/:id/lessons/:lid/view` — ghi nhận lượt mở bài; `GET …/viewers`; `POST …/remind` (≤ 1 lần/30 phút/bài)
- [x] Học tuần tự: HS **được xem trước** bài sau (theo yêu cầu GV), chỉ chặn đánh dấu hoàn thành sai thứ tự
- [x] "Học tiếp": trang khóa học tự mở bài xem gần nhất; nhiệm vụ trang chủ mở đúng bài
- [x] Sửa: quiz không bắt đầu được; sửa bài giảng làm mất "xem thử miễn phí"; sao chép bài giảng không liệt kê khóa nguồn

## Giao diện (token theme, không emoji)
- [x] HS: đầu trang gọn + mục lục chương (tiến độ, chấm trạng thái) + một bài đang học + bài trước/tiếp + mục lục dạng ngăn trên điện thoại
- [x] GV: tab Bài giảng · Học sinh · Điểm & hoạt động · Cài đặt khóa; menu ⋯ (lên/xuống/ẩn/xem như HS/xoá); danh sách đã xem/chưa xem + nút nhắc
- [x] `/teacher/review-queue`, `/teacher/courses/:id/lessons/:lid/submissions` (gọi API không tồn tại) → chuyển hướng

## Kiểm chứng
- Syntax pass (ts.transpileModule) tất cả file sửa. Chưa build trên VPS.
- Cần `prisma db push` (chỉ thêm cột: Lesson.hidden, Lesson.publishAt, Assignment.lessonId).
