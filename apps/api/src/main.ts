import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';

// Nạp file .env ở thư mục GỐC dự án (đảm bảo đọc đúng key, không đọc nhầm packages/db/.env)
function loadRootEnv() {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '..', '.env'),
    path.resolve(process.cwd(), '..', '..', '..', '.env'),
  ];
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      let value = t.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}
loadRootEnv();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors();

  // API chạy sau Cloudflare Tunnel (cloudflared → localhost) nên IP thật của học sinh
  // nằm ở X-Forwarded-For / CF-Connecting-IP. Bật trust proxy để rate-limit tính theo
  // TỪNG học sinh — nếu không, mọi người dùng chung 1 IP 127.0.0.1 và cả lớp sẽ bị 429.
  app.set('trust proxy', true);

  // Nâng giới hạn body (mặc định chỉ 100kb → lỗi "request entity too large"
  // khi dán file .tex lớn). Upload file đọc raw stream riêng nên không bị ảnh hưởng.
  app.useBodyParser('json', { limit: '50mb' });
  app.useBodyParser('urlencoded', { limit: '50mb', extended: true });

  // Bảo mật header (chống XSS, clickjacking...)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const helmet = require('helmet');
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = process.env.API_PORT || 4000;
  await app.listen(port);
  console.log(`🚀 API LumiMath đang chạy tại: http://localhost:${port}/api`);
}

bootstrap();
