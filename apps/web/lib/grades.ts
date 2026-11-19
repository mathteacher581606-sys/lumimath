// Danh sách lớp dùng chung cho ngân hàng câu hỏi (THCS 6–9, THPT 10–12).
export const GRADES = ['6', '7', '8', '9', '10', '11', '12'];

export function gradeLevel(g: string | number): string {
  const n = Number(g);
  if (n >= 10) return 'THPT';
  if (n >= 6) return 'THCS';
  return '';
}
