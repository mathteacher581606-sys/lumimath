import {
  Controller,
  Get,
  NotFoundException,
  Param,
  PayloadTooLargeException,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Response } from 'express';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

const UPLOAD_DIR = path.join(process.cwd(), 'storage', 'uploads');
const MAX_SIZE = 15 * 1024 * 1024; // 15MB (ảnh lớn sẽ tự nén xuống < 1MB)
const COMPRESS_THRESHOLD = 1024 * 1024; // Nén khi > 1MB

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

const TYPE_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

// Nén ảnh > 1MB: thu nhỏ (cạnh dài tối đa 1280px) + chuyển JPEG với chất lượng giảm dần
async function compressImage(
  buffer: Buffer,
  contentType: string,
): Promise<{ buffer: Buffer; ext: string; compressed: boolean }> {
  const type = contentType.split(';')[0].trim();
  if (buffer.length <= COMPRESS_THRESHOLD) {
    return { buffer, ext: EXT_BY_TYPE[type] || 'png', compressed: false };
  }
  try {
    const img = await loadImage(buffer);
    const maxDim = 1280;
    let { width, height } = img;
    if (Math.max(width, height) > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    for (const quality of [0.75, 0.6, 0.5, 0.4]) {
      const out = canvas.toBuffer('image/jpeg', quality);
      if (out.length <= COMPRESS_THRESHOLD || quality === 0.4) {
        return { buffer: out, ext: 'jpg', compressed: true };
      }
    }
  } catch (e) {
    // Không giải mã được (gif động, svg...) → giữ nguyên file gốc
  }
  return { buffer, ext: EXT_BY_TYPE[type] || 'png', compressed: false };
}

@Controller('uploads')
export class UploadsController {
  // Tải ảnh lên (dán clipboard / chọn file) → trả URL dùng trong nội dung câu hỏi
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('image')
  async uploadImage(@Req() req: any, @Res() res: Response) {    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    if (!buffer.length) {
      return res.status(400).json({ message: 'Không có dữ liệu ảnh' });
    }
    if (buffer.length > MAX_SIZE) {
      throw new PayloadTooLargeException('Ảnh quá lớn (tối đa 5MB)');
    }

    const contentType: string =
      req.headers['content-type'] || 'image/png';

    // Nén ảnh > 1MB trước khi lưu (giảm tải server)
    const { buffer: finalBuffer, ext, compressed } = await compressImage(
      buffer,
      contentType,
    );

    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const filename = `${randomUUID()}.${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), finalBuffer);

    return res.json({
      url: `/api/uploads/${filename}`,
      compressed,
      originalSize: buffer.length,
      savedSize: finalBuffer.length,
    });
  }

  // Tải PDF bài làm (giới hạn 2MB, nén bằng Ghostscript nếu có sẵn)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('pdf')
  async uploadPdf(@Req() req: any, @Res() res: Response) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    if (!buffer.length) {
      return res.status(400).json({ message: 'Không có dữ liệu PDF' });
    }
    const MAX_PDF = 10 * 1024 * 1024; // 10MB (sẽ tự nén xuống nhẹ hơn)
    if (buffer.length > MAX_PDF) {
      throw new PayloadTooLargeException('PDF quá lớn (tối đa 10MB)');
    }

    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const filename = `${randomUUID()}.pdf`;
    let savedBuffer = buffer;
    let compressed = false;

    // Nén PDF bằng Ghostscript (nếu cài sẵn) để đỡ nặng server
    try {
      const tmpIn = path.join(UPLOAD_DIR, `${randomUUID()}_in.pdf`);
      const tmpOut = path.join(UPLOAD_DIR, `${randomUUID()}_out.pdf`);
      fs.writeFileSync(tmpIn, buffer);
      const gs = spawnSync(
        'gs',
        [
          '-sDEVICE=pdfwrite',
          '-dPDFSETTINGS=/ebook',
          '-dNOPAUSE',
          '-dBATCH',
          '-sOutputFile=' + tmpOut,
          tmpIn,
        ],
        { timeout: 30000 },
      );
      if (!gs.error && fs.existsSync(tmpOut) && fs.statSync(tmpOut).size > 0) {
        savedBuffer = fs.readFileSync(tmpOut);
        compressed = true;
      }
      if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
      if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
    } catch (e) {
      /* không nén được — giữ nguyên file */
    }

    fs.writeFileSync(path.join(UPLOAD_DIR, filename), savedBuffer);
    return res.json({
      url: `/api/uploads/${filename}`,
      compressed,
      originalSize: buffer.length,
      savedSize: savedBuffer.length,
    });
  }

  // Tải file tài liệu bài giảng (pdf/docx/pptx/xlsx/zip...) — đặt tên riêng ở FE
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('file')
  async uploadFile(@Req() req: any, @Res() res: Response) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    if (!buffer.length) {
      return res.status(400).json({ message: 'Không có dữ liệu file' });
    }
    if (buffer.length > 25 * 1024 * 1024) {
      throw new PayloadTooLargeException('File quá lớn (tối đa 25MB)');
    }
    const ALLOWED = ['pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls', 'zip', 'rar', 'txt', 'png', 'jpg', 'jpeg'];
    const ext = (req.headers['x-file-ext'] || 'pdf').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
    const finalExt = ALLOWED.includes(ext) ? ext : 'pdf';
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const filename = `${randomUUID()}.${finalExt}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
    return res.json({ url: `/api/uploads/${filename}`, ext: finalExt });
  }

  // Xem ảnh đã tải (public — tên file UUID không đoán được)
  @Get(':filename')
  async getImage(@Param('filename') filename: string, @Res() res: Response) {
    const safe = path.basename(filename);
    const filePath = path.join(UPLOAD_DIR, safe);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Không tìm thấy ảnh');
    }
    const ext = safe.split('.').pop()?.toLowerCase() || 'png';
    const contentType =
      ext === 'pdf' ? 'application/pdf' : TYPE_BY_EXT[ext] || 'image/png';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.send(fs.readFileSync(filePath));
  }
}
