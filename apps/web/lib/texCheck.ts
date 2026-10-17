// Kiểm tra nhanh dấu ngoặc nhọn { } có cân bằng trong mã LaTeX
// (bỏ qua các ký tự sau dấu \ để không tính \{ \} và lệnh)
export interface BraceIssue {
  line: number;
  char: number;
  msg: string;
}

export function findBraceIssue(tex: string): BraceIssue | null {
  const lines = (tex || '').split('\n');
  let depth = 0;
  let lastOpenLine = 1;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci];
      if (ch === '\\') {
        ci++; // bỏ qua ký tự tiếp theo (lệnh như \{ \} )
        continue;
      }
      if (ch === '{') {
        depth++;
        lastOpenLine = li + 1;
      } else if (ch === '}') {
        depth--;
        if (depth < 0) {
          return {
            line: li + 1,
            char: ci + 1,
            msg: 'Dư dấu "}" — có ngoặc đóng thừa ở vị trí này',
          };
        }
      }
    }
  }
  if (depth > 0) {
    return {
      line: lastOpenLine,
      char: 0,
      msg: `Thiếu ${depth} dấu "}" — có ngoặc mở chưa được đóng (bắt đầu từ dòng ${lastOpenLine})`,
    };
  }
  return null;
}
