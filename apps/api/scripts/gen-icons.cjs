const { createCanvas } = require("@napi-rs/canvas");
const fs = require("fs");

function drawIcon(size, maskable) {
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  // Nen
  ctx.fillStyle = "#1c1917";
  if (maskable) {
    ctx.fillRect(0, 0, size, size);
  } else {
    const r = size * 0.22;
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, r);
    ctx.fill();
  }
  // Chu L trang
  ctx.fillStyle = "#fbfaf7";
  const margin = maskable ? size * 0.14 : 0;
  const inner = size - margin * 2;
  ctx.font = `700 ${inner * 0.52}px Georgia, 'Times New Roman', serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("L", size / 2, size / 2 + inner * 0.03);
  // Cham accent
  ctx.fillStyle = "#c2703d";
  ctx.beginPath();
  ctx.arc(size * 0.73, size * 0.27, size * 0.07, 0, Math.PI * 2);
  ctx.fill();
  return c.toBuffer("image/png");
}

fs.writeFileSync("C:/Users/Admin/lumimath/apps/web/public/icons/icon-192.png", drawIcon(192, false));
fs.writeFileSync("C:/Users/Admin/lumimath/apps/web/public/icons/icon-512.png", drawIcon(512, false));
fs.writeFileSync("C:/Users/Admin/lumimath/apps/web/public/icons/icon-maskable-512.png", drawIcon(512, true));
console.log("Da tao 3 icon PWA");