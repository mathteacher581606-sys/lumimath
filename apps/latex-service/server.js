const http = require('http');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = process.env.PORT || 8080;
// Chỉ nghe trên localhost (API gọi qua http://localhost:8080). Trong Docker đặt HOST=0.0.0.0
// và CHỈ publish cổng ra 127.0.0.1 (xem docker-compose.yml).
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY = 25 * 1024 * 1024; // 25MB (mã nguồn + ảnh base64)
const MAX_PARALLEL = Number(process.env.LATEX_PARALLEL || 2); // VPS 2 vCPU
const TIMEOUT_MS = 90 * 1000;

// ===== BẢO MẬT BIÊN DỊCH =====
// - KHÔNG bật -shell-escape: mã LaTeX không được chạy lệnh hệ thống (\write18).
// - openin_any / openout_any = p (paranoid): chỉ đọc/ghi file trong thư mục biên dịch,
//   không đọc được /etc/passwd, biến môi trường, file của tiến trình khác.
const TEX_ENV = {
  ...process.env,
  openin_any: 'p',
  openout_any: 'p',
  shell_escape: 'f',
};

// ===== ĐỊNH DẠNG NẠP SẴN (lmfmt) =====
// Tài liệu mở đầu bằng "\documentclass[...]{standalone}" + "\usepackage{lumimath}" được đổi sang
// dùng lmfmt.fmt (đã nạp sẵn mọi gói lúc dựng image) → nhanh hơn ~5 lần.
// \endofdump (gói mylatexformat) cho phép tài liệu vẫn thêm preamble riêng sau đó.
const FMT_NAME = 'lmfmt';
let FMT_OK = false;
try {
  FMT_OK = !!require('child_process')
    .execFileSync('kpsewhich', ['-engine=pdftex', FMT_NAME + '.fmt'], { encoding: 'utf8' })
    .trim();
} catch {
  FMT_OK = false;
}
console.log(FMT_OK ? 'Dùng định dạng nạp sẵn lmfmt' : 'Không có lmfmt.fmt — biên dịch thường');

// \standaloneconfig chỉ nhận option của standalone — option của lớp khác (12pt, a4paper…) gây lỗi xkeyval → bỏ đi
const STANDALONE_KEYS = new Set([
  'class', 'multi', 'crop', 'preview', 'border', 'margin', 'varwidth', 'ignorerest', 'tikz', 'convert',
  'float', 'angle', 'beamer', 'math', 'ragged2e', 'mode', 'order', 'sort', 'sort-by', 'pdftex', 'dvips',
  'xetex', 'luatex', 'dvipdfmx', 'ptex', 'uptex', 'latex', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'pdf',
  'png-ext', 'jpg-ext', 'config', 'preview-ext', 'varwidth-ext', 'multi-ext', 'beamer-ext', 'math-ext',
]);
function standaloneOpts(raw) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of String(raw)) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  return parts
    .map((x) => x.trim())
    .filter((x) => {
      if (!x) return false;
      const key = x.split('=')[0].trim();
      return STANDALONE_KEYS.has(key);
    })
    .join(',');
}

function withFormat(src) {
  if (!FMT_OK) return null;
  const m = String(src).match(/^\s*\\documentclass(?:\[([^\]]*)\])?\{standalone\}[ \t]*\r?\n[ \t]*\\usepackage\{lumimath\}[ \t]*\r?\n/);
  if (!m) return null;
  const opts = standaloneOpts(m[1] || '');
  return (
    '\\documentclass{standalone}\n\\endofdump\n' +
    (opts ? '\\standaloneconfig{' + opts + '}\n' : '') +
    src.slice(m[0].length)
  );
}

// Hàng đợi đơn giản: tối đa MAX_PARALLEL lần biên dịch chạy cùng lúc
let running = 0;
const waiting = [];
function acquire() {
  if (running < MAX_PARALLEL) {
    running++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
}
function release() {
  const next = waiting.shift();
  if (next) next();
  else running--;
}

function runLatex(texSource, images, fmt) {
  return new Promise((resolve, reject) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'latex-'));
    const cleanup = () => fs.rm(dir, { recursive: true, force: true }, () => {});
    try {
      fs.writeFileSync(path.join(dir, 'main.tex'), texSource, 'utf8');
      // Ảnh base64 kèm theo: chỉ nhận tên file đơn giản, không cho đường dẫn
      for (const img of images || []) {
        const name = path.basename(String(img && img.name ? img.name : ''));
        if (!/^[\w.-]{1,120}$/.test(name) || name.startsWith('.')) continue;
        if (img && typeof img.data === 'string') {
          fs.writeFileSync(path.join(dir, name), Buffer.from(img.data, 'base64'));
        }
      }
    } catch (e) {
      cleanup();
      reject(e);
      return;
    }

    const args = ['-pdf', '-no-shell-escape', '-interaction=nonstopmode', '-halt-on-error'];
    if (fmt) args.push('-pdflatex=pdflatex -fmt=' + FMT_NAME + ' %O %S');
    args.push('main.tex');
    execFile(
      'latexmk',
      args,
      { cwd: dir, timeout: TIMEOUT_MS, env: TEX_ENV, maxBuffer: 20 * 1024 * 1024 },
      (err, stdout, stderr) => {
        try {
          if (err) {
            const logFile = path.join(dir, 'main.log');
            const log = fs.existsSync(logFile)
              ? fs.readFileSync(logFile, 'utf8')
              : stderr || stdout || String(err);
            reject(new Error(err.killed ? 'Biên dịch quá thời gian cho phép\n' + log : log));
            return;
          }
          const pdfFile = path.join(dir, 'main.pdf');
          if (!fs.existsSync(pdfFile)) {
            reject(new Error('Không tìm thấy file PDF sau khi compile'));
            return;
          }
          resolve(fs.readFileSync(pdfFile));
        } finally {
          cleanup(); // luôn xoá thư mục tạm (trước đây để lại → đầy ổ đĩa)
        }
      },
    );
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'latex', format: FMT_OK ? FMT_NAME : null, running, waiting: waiting.length }));
    return;
  }

  if (req.method === 'POST' && req.url === '/compile') {
    const chunks = [];
    let size = 0;
    let aborted = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        aborted = true;
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Dữ liệu biên dịch quá lớn' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', async () => {
      if (aborted) return;
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'JSON không hợp lệ' }));
        return;
      }
      const { source, images } = body || {};
      if (!source || typeof source !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Thiếu trường "source"' }));
        return;
      }
      await acquire();
      try {
        const imgs = Array.isArray(images) ? images : [];
        const fast = withFormat(source);
        let pdf;
        if (fast) {
          try {
            pdf = await runLatex(fast, imgs, true);
          } catch {
            // Hiếm: gói không hợp định dạng nạp sẵn → biên dịch thường (log lỗi lấy từ lần này)
            pdf = await runLatex(source, imgs, false);
          }
        } else {
          pdf = await runLatex(source, imgs, false);
        }
        res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': pdf.length });
        res.end(pdf);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String((e && e.message) || e) }));
      } finally {
        release();
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, HOST, () => {
  console.log(`LaTeX service running on ${HOST}:${PORT}`);
});
