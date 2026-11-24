// Định dạng đề dùng chung cho .tex / PDF / Word (mẫu đề 2025)

export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

/** Lời dẫn của từng phần theo mẫu đề 2025 */
export function partInstruction(type: string, from: number, to: number): string {
  const range = from === to ? `câu ${from}` : `câu ${from} đến câu ${to}`;
  switch (type) {
    case 'MCQ':
      return `Câu trắc nghiệm nhiều phương án lựa chọn. Thí sinh trả lời từ ${range}. Mỗi câu hỏi thí sinh chỉ chọn một phương án.`;
    case 'TRUE_FALSE':
      return `Câu trắc nghiệm đúng sai. Thí sinh trả lời từ ${range}. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.`;
    case 'SHORT_ANSWER':
      return `Câu trắc nghiệm trả lời ngắn. Thí sinh trả lời từ ${range}.`;
    case 'ESSAY':
      return `Tự luận. Thí sinh trình bày lời giải từ ${range}.`;
    default:
      return `Thí sinh trả lời từ ${range}.`;
  }
}

/** Điểm hiển thị kiểu Việt Nam: 0,25 */
export function viScore(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}
