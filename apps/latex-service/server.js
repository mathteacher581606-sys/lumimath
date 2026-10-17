const http = require('http');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = process.env.PORT || 8080;

function runLatex(texSource, images) {
  return new Promise((resolve, reject) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'latex-'));
    const texFile = path.join(dir, 'main.tex');
    fs.writeFileSync(texFile, texSource, 'utf8');

    // Ghi các ảnh base64 kèm theo vào thư mục biên dịch
    for (const img of images || []) {
      const name = path.basename(String(img && img.name ? img.name : ''));
      if (name && img && img.data) {
        fs.writeFileSync(path.join(dir, name), Buffer.from(img.data, 'base64'));
      }
    }

    const cmd =
      'cd ' +
      dir +
      ' && latexmk -pdf -shell-escape -interaction=nonstopmode -halt-on-error main.tex';

    exec(cmd, { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) {
        const logFile = path.join(dir, 'main.log');
        const log = fs.existsSync(logFile)
          ? fs.readFileSync(logFile, 'utf8')
          : stderr || stdout || String(err);
        reject(new Error(log));
        return;
      }

      const pdfFile = path.join(dir, 'main.pdf');
      if (!fs.existsSync(pdfFile)) {
        reject(new Error('Không tìm thấy file PDF sau khi compile'));
        return;
      }

      const pdf = fs.readFileSync(pdfFile);
      resolve(pdf);
    });
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'latex' }));
    return;
  }

  if (req.method === 'POST' && req.url === '/compile') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const { source, images } = JSON.parse(body);
        if (!source) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Thiếu trường "source"' }));
          return;
        }
        const pdf = await runLatex(source, images);
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Length': pdf.length,
        });
        res.end(pdf);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(e.message || e) }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => {
  console.log('LaTeX service running on port ' + PORT);
});
