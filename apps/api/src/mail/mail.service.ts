import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  isConfigured(): boolean {
    return !!(
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
    );
  }

  private async transporter() {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_PORT || '') === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // Gửi email; nếu SMTP chưa cấu hình thì log thay vì lỗi
  async send(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.isConfigured()) {
      this.logger.warn(`[Email chưa cấu hình SMTP] → ${to} | ${subject}`);
      return false;
    }
    try {
      const transport = await this.transporter();
      await transport.sendMail({
        from:
          process.env.SMTP_FROM ||
          `"LumiMath" <${process.env.SMTP_USER}>`,
        to,
        subject,
        html,
      });
      this.logger.log(`Đã gửi email → ${to} | ${subject}`);
      return true;
    } catch (e) {
      this.logger.error(`Gửi email thất bại → ${to}: ${(e as Error).message}`);
      return false;
    }
  }

  // Mẫu email đẹp (kiểu bưu thiếp đơn giản)
  private layout(title: string, bodyHtml: string): string {
    return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f4f2ec;font-family:Georgia,serif;color:#1c1917;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e0d5;">
    <div style="background:#1c1917;padding:18px 24px;">
      <span style="color:#fbfaf7;font-size:20px;font-weight:700;letter-spacing:0.02em;">LumiMath</span>
    </div>
    <div style="padding:24px;">
      <h2 style="margin:0 0 12px;font-size:18px;">${title}</h2>
      ${bodyHtml}
      <p style="margin:20px 0 0;font-size:12px;color:#8a8577;">
        Nếu bạn không yêu cầu email này, hãy bỏ qua. — LumiMath
      </p>
    </div>
  </div>
</body></html>`;
  }

  sendWelcome(to: string, fullName: string, roleLabel: string, code: string) {
    return this.send(
      to,
      'Chào mừng đến với LumiMath!',
      this.layout(
        `Xin chào ${fullName}!`,
        `<p style="font-size:14px;line-height:1.6;">Tài khoản <b>${roleLabel}</b> của bạn đã được tạo thành công.</p>
         <p style="font-size:14px;line-height:1.6;">Mã định danh: <b style="font-family:monospace;">${code}</b></p>
         <p style="font-size:14px;line-height:1.6;">Hãy đăng nhập và bắt đầu học tập ngay!</p>`,
      ),
    );
  }

  sendPasswordReset(to: string, link: string) {
    return this.send(
      to,
      'Đặt lại mật khẩu LumiMath',
      this.layout(
        'Yêu cầu đặt lại mật khẩu',
        `<p style="font-size:14px;line-height:1.6;">Bạn đã yêu cầu đặt lại mật khẩu. Nhấn nút bên dưới để tạo mật khẩu mới (liên kết hết hạn sau 30 phút):</p>
         <p style="margin:18px 0;"><a href="${link}" style="background:#c2703d;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Đặt lại mật khẩu</a></p>`,
      ),
    );
  }

  sendNewPassword(to: string, fullName: string, password: string) {
    return this.send(
      to,
      'Mật khẩu mới của bạn trên LumiMath',
      this.layout(
        `Mật khẩu mới — ${fullName}`,
        `<p style="font-size:14px;line-height:1.6;">Giáo viên/quản trị viên đã đặt lại mật khẩu cho tài khoản của bạn:</p>
         <p style="font-size:18px;font-family:monospace;background:#f4f2ec;padding:10px 14px;border-radius:6px;display:inline-block;">${password}</p>
         <p style="font-size:14px;line-height:1.6;">Hãy đăng nhập và đổi mật khẩu ngay trong mục Cài đặt.</p>`,
      ),
    );
  }

  sendOtp(to: string, code: string) {
    return this.send(
      to,
      `Mã xác nhận LumiMath: ${code}`,
      this.layout(
        'Mã xác nhận đăng ký',
        `<p style="font-size:14px;line-height:1.6;">Mã xác nhận của bạn là:</p>
         <p style="font-size:30px;letter-spacing:8px;font-family:monospace;font-weight:700;background:#f4f2ec;padding:12px 18px;border-radius:8px;display:inline-block;color:#7b1113;">${code}</p>
         <p style="font-size:13px;line-height:1.6;color:#6b6459;">Mã có hiệu lực trong <b>5 phút</b>. Không chia sẻ mã này với ai.</p>`,
      ),
    );
  }

  sendNotification(to: string, title: string, body: string, link?: string) {
    return this.send(
      to,
      title,
      this.layout(
        title,
        `<p style="font-size:14px;line-height:1.6;">${body}</p>
         ${link ? `<p style="margin:14px 0 0;"><a href="${link}" style="color:#c2703d;font-weight:600;">Xem chi tiết →</a></p>` : ''}`,
      ),
    );
  }
}
