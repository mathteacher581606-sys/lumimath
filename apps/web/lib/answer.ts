// Định dạng đáp án để hiển thị.
// - Chuỗi trả về nguyên văn (có thể chứa LaTeX $...$)
// - Đúng/Sai {a:true,b:false,c:false,d:true} → "Đ-S-S-Đ"
// - Tự luận {text, images} → phần text
export function formatAnswer(answer: any): string {
  if (typeof answer === 'string') return answer;
  if (typeof answer === 'boolean') return answer ? 'Đúng' : 'Sai';
  if (Array.isArray(answer)) {
    return answer.map((x) => formatAnswer(x)).join(', ');
  }
  if (answer && typeof answer === 'object') {
    // Câu tự luận: { text, images }
    if (typeof answer.text === 'string') return answer.text;
    const entries = Object.entries(answer);
    if (!entries.length) return '';
    // Đúng/Sai: mọi giá trị là boolean → Đ-S-S-Đ theo thứ tự a,b,c,d (hoặc 1,2,3,4)
    if (entries.every(([, v]) => typeof v === 'boolean')) {
      return entries
        .sort(([a], [b]) =>
          String(a).localeCompare(String(b), undefined, { numeric: true }),
        )
        .map(([, v]) => (v ? 'Đ' : 'S'))
        .join('-');
    }
    return entries.map(([k, v]) => `${String(k).toUpperCase()}: ${String(v)}`).join(' · ');
  }
  return answer === null || answer === undefined ? '' : String(answer);
}
