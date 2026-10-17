// Chủ đề theo chương trình GDPT 2018 (Việt Nam), phân theo lớp
export const TOPICS_BY_GRADE: Record<string, string[]> = {
  '12': [
    'Ứng dụng đạo hàm & Khảo sát hàm số',
    'Hàm số lũy thừa, Mũ & Logarit',
    'Nguyên hàm, Tích phân & Ứng dụng',
    'Phương pháp tọa độ trong không gian (Oxyz)',
    'Vectơ trong không gian',
    'Số phức',
    'Xác suất có điều kiện & Biến cố độc lập',
    'Thống kê & Các số đặc trưng',
  ],
  '11': [
    'Hàm số lượng giác & Phương trình lượng giác',
    'Dãy số, Cấp số cộng & Cấp số nhân',
    'Giới hạn & Hàm số liên tục',
    'Đạo hàm & Tiếp tuyến',
    'Quan hệ song song trong không gian',
    'Quan hệ vuông góc trong không gian',
    'Xác suất cổ điển & Quy tắc tính xác suất',
    'Hàm số mũ & Logarit (Cơ bản)',
  ],
  '10': [
    'Mệnh đề & Tập hợp',
    'Bất phương trình & Hệ bất phương trình bậc nhất',
    'Hàm số bậc nhất & Bậc hai',
    'Hệ thức lượng trong tam giác & Vectơ',
    'Phương pháp tọa độ trong mặt phẳng (Oxy)',
    'Đại số tổ hợp (Đếm, Hoán vị, Chỉnh hợp, Tổ hợp, Nhị thức)',
    'Thống kê & Bảng số liệu',
  ],
};

export function getTopicsForGrade(grade: string | number): string[] {
  return TOPICS_BY_GRADE[String(grade)] || [];
}
