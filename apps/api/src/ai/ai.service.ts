import { HttpException, Injectable } from '@nestjs/common';

@Injectable()
export class AiService {
  private async chat(
    messages: { role: string; content: string }[],
  ): Promise<string> {
    const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
    const apiKey = process.env.DEEPSEEK_API_KEY;

    if (!apiKey || apiKey.startsWith('sk-chua')) {
      throw new HttpException('Chưa cấu hình DeepSeek API key', 500);
    }

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages,
          temperature: 0.3,
          max_tokens: 2000,
        }),
      });
    } catch (e) {
      throw new HttpException(
        'Không kết nối được DeepSeek: ' + (e as Error).message,
        503,
      );
    }

    if (!res.ok) {
      const err = await res.text();
      throw new HttpException(
        'DeepSeek API lỗi: ' + err.slice(0, 300),
        502,
      );
    }

    const data: any = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  private parseJson(text: string): any {
    let cleaned = text.trim();
    const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) cleaned = fence[1].trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);
    return JSON.parse(cleaned);
  }

  async gradeEssay(prompt: string, rubric: string, studentAnswer: string) {
    const system =
      'Bạn là giáo viên Toán THPT giàu kinh nghiệm. Chấm bài tự luận và chỉ trả về JSON hợp lệ.';
    const user = [
      'Đề bài: ' + prompt,
      'Đáp án/tiêu chí: ' + (rubric || 'Không có'),
      'Bài làm học sinh: ' + studentAnswer,
      '',
      'Hãy trả về JSON với đúng các trường sau:',
      '{"score": <số từ 0 đến 10>, "strengths": [<các điểm mạnh>], "weaknesses": [<các điểm yếu>], "suggestion": "<nhận xét tổng thể>"}',
    ].join('\n');

    const content = await this.chat([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ]);

    try {
      return this.parseJson(content);
    } catch (e) {
      return {
        raw: content,
        score: null,
        strengths: [],
        weaknesses: [],
        suggestion: '',
      };
    }
  }

  async classifyQuestion(content: string) {
    const system =
      'Bạn là chuyên gia phân loại câu hỏi Toán theo chương trình GDPT 2018 Việt Nam. Chỉ trả về JSON hợp lệ.';
    const user = [
      'Câu hỏi: ' + content,
      '',
      'Hãy trả về JSON với đúng các trường sau:',
      '{"grade": <10 hoặc 11 hoặc 12>, "topic": "<tên chủ đề>", "difficulty": "<NHAN_BIET | THONG_HIEU | VAN_DUNG | VAN_DUNG_CAO>"}',
    ].join('\n');

    const content2 = await this.chat([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ]);

    try {
      return this.parseJson(content2);
    } catch (e) {
      return { raw: content2, grade: null, topic: '', difficulty: null };
    }
  }
}
