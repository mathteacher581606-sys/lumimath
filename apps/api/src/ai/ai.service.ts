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
    // Hỗ trợ cả đối tượng {...} và mảng [...]
    const startObj = cleaned.indexOf('{');
    const startArr = cleaned.indexOf('[');
    let start: number;
    let end: number;
    if (startArr !== -1 && (startObj === -1 || startArr < startObj)) {
      start = startArr;
      end = cleaned.lastIndexOf(']');
    } else {
      start = startObj;
      end = cleaned.lastIndexOf('}');
    }
    if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);
    return JSON.parse(cleaned);
  }

  async gradeEssay(prompt: string, rubric: string, studentAnswer: string) {
    const system =
      'Bạn là giáo viên Toán THPT giàu kinh nghiệm, chấm bài RẤT NGHIÊM KHẮC như chấm thi thật. Chỉ trả về JSON hợp lệ.';
    const user = [
      'Đề bài: ' + prompt,
      'Đáp án/tiêu chí: ' + (rubric || 'Không có'),
      'Bài làm học sinh: ' + studentAnswer,
      '',
      'Yêu cầu chấm nghiêm khắc như giáo viên:',
      '- Trừ điểm nếu thiếu bước lập luận, thiếu điều kiện, thiếu kết luận',
      '- Trừ điểm nếu trình bày lộn xộn, không rõ ràng, sai ký hiệu toán học',
      '- Không cho điểm tối đa nếu bài làm không hoàn chỉnh',
      '',
      'Hãy trả về JSON với đúng các trường sau:',
      '{"score": <số từ 0 đến 10>, "strengths": [<các điểm mạnh>], "weaknesses": [<các điểm yếu cần cải thiện>], "suggestion": "<nhận xét tổng thể về cả nội dung VÀ cách trình bày>"}',
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

  // ============ CHẤM ẢNH BÀI LÀM (VISION: Qwen-VL / Gemini) ============

  visionConfigured(): boolean {
    return !!(
      (process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_BASE_URL) ||
      (process.env.CF_VISION_API_KEY &&
        process.env.CF_VISION_BASE_URL &&
        process.env.CF_VISION_MODEL) ||
      (process.env.VISION_API_KEY &&
        process.env.VISION_BASE_URL &&
        process.env.VISION_MODEL)
    );
  }

  // Gọi vision qua NHIỀU nguồn: DeepSeek (chính) → Gemini (dự phòng) → Cloudflare (nếu cấu hình)
  private async visionChat(contentParts: any[], maxTokens = 1500): Promise<string | null> {
    const providers: { base: string; key: string; model: string }[] = [];
    if (
      process.env.DEEPSEEK_API_KEY &&
      process.env.DEEPSEEK_BASE_URL
    ) {
      providers.push({
        base: process.env.DEEPSEEK_BASE_URL.replace(/\/$/, ''),
        key: process.env.DEEPSEEK_API_KEY,
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      });
    }
    if (
      process.env.CF_VISION_API_KEY &&
      process.env.CF_VISION_BASE_URL &&
      process.env.CF_VISION_MODEL
    ) {
      providers.push({
        base: process.env.CF_VISION_BASE_URL,
        key: process.env.CF_VISION_API_KEY,
        model: process.env.CF_VISION_MODEL,
      });
    }
    if (
      process.env.VISION_API_KEY &&
      process.env.VISION_BASE_URL &&
      process.env.VISION_MODEL
    ) {
      providers.push({
        base: process.env.VISION_BASE_URL,
        key: process.env.VISION_API_KEY,
        model: process.env.VISION_MODEL,
      });
    }
    if (!providers.length) return null;

    for (const prov of providers) {
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const res = await fetch(`${prov.base}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${prov.key}`,
            },
            body: JSON.stringify({
              model: prov.model,
              messages: [{ role: 'user', content: contentParts }],
              temperature: 0.1,
              max_tokens: maxTokens,
            }),
          });
          if (res.status === 429) {
            await new Promise((r) => setTimeout(r, 2500));
            continue;
          }
          if (!res.ok) break; // lỗi khác → chuyển nguồn dự phòng
          const data: any = await res.json();
          let text: string = data?.choices?.[0]?.message?.content || '';
          text = String(text)
            .trim()
            .replace(/^```(?:latex|tex)?\s*/i, '')
            .replace(/\s*```$/, '')
            .trim();
          if (text) return text;
          break;
        }
      } catch {
        /* chuyển nguồn dự phòng */
      }
    }
    return null;
  }

  // Đọc ảnh công thức toán (PNG) → LaTeX. Trả null nếu lỗi
  async imageToLatex(pngBuffer: Buffer): Promise<string | null> {
    if (!this.visionConfigured() || !pngBuffer || !pngBuffer.length) return null;
    const mkParts = (extraRules: string[]): any[] => [
      {
        type: 'text',
        text: [
          'Bạn là bộ chuyển đổi công thức toán học trong ĐỀ THI TOÁN VIỆT NAM.',
          'Ảnh dưới là MỘT công thức toán (có thể chứa vectơ, phân số, căn, giới hạn,',
          'tích phân, tổng sigma, ma trận, chỉ số trên/dưới, ký tự Hy Lạp...).',
          'Trả về CHÍNH XÁC mã LaTeX của công thức.',
          'QUY TẮC BẮT BUỘC:',
          '1. CHỈ trả về mã LaTeX, không bọc trong dấu $, không thêm chữ giải thích.',
          '2. Chỉ MỘT dòng, KHÔNG BAO GIỜ xuống dòng.',
          '3. Tọa độ điểm LUÔN dùng dấu chấm phẩy: M(1;2;3). KHÔNG dùng dấu hai chấm.',
          '4. Sao chép chính xác từng ký tự trong ảnh, không tự ý thêm bớt.',
          '5. Dùng lệnh chuẩn: \\frac, \\sqrt, \\overrightarrow, \\vec, \\lim, \\sum,',
          '\\int, \\begin{pmatrix}...\\end{pmatrix} cho ma trận.',
          '6. Nếu không chắc một ký hiệu, dùng lệnh gần đúng nhất.',
          ...extraRules,
        ].join(' '),
      },
      {
        type: 'image_url',
        image_url: {
          url: 'data:image/png;base64,' + pngBuffer.toString('base64'),
        },
      },
    ];

    const clean = (t: string): string | null => {
      let s = String(t)
        .trim()
        .replace(/```(?:latex|tex)?/gi, '')
        .replace(/^\$+|\$+$/g, '')
        .trim();
      // Bỏ xuống dòng trong công thức
      s = s.replace(/[\r\n]+/g, ' ');
      // Trong cặp ngoặc toạ độ, dấu hai chấm giữa các số → dấu chấm phẩy
      s = s.replace(/\(([^()]*)\)/g, (m, inner: string) => {
        const fixed = inner.replace(/(-?\d):(-?\d)/g, '$1;$2');
        return '(' + fixed + ')';
      });
      s = s.replace(/\s+/g, ' ').trim();
      if (!s || s.length > 2000) return null;
      if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(s)) return null;
      return s;
    };

    let text = await this.visionChat(mkParts([]), 1500);
    let latex = text ? clean(text) : null;
    // Nghi ngờ đọc sai (rác fence, lặp chuỗi, ký tự vectơ lỗi) → đọc lại 1 lần
    const hasJunk =
      latex !== null &&
      (/```/.test(String(text)) ||
        /(\$[^$]{1,60}\$)\s*\1/.test(latex) ||
        /\\vec\{[^}]*\s|u\s*e|a\s*c\b/.test(latex));
    if (hasJunk) {
      const retry = await this.visionChat(
        mkParts([
          'CẢNH BÁO: lần trước bạn trả lời có chỗ SAI hoặc THỪA. Đọc lại ảnh thật kỹ,',
          'trả về ĐÚNG MỘT công thức duy nhất, không lặp lại, không thêm khung code.',
        ]),
        1500,
      );
      const r2 = retry ? clean(retry) : null;
      if (r2) latex = r2;
    }
    return latex;
  }

  // Chấm bài qua ảnh chụp (trình bày + nội dung). Trả null nếu không có vision
  async gradeEssayImages(
    prompt: string,
    rubric: string,
    images: string[],
  ): Promise<any | null> {
    if (!this.visionConfigured() || !images || !images.length) return null;

    const publicBase = (process.env.PUBLIC_WEB_URL || '').replace(/\/$/, '');
    const contentParts: any[] = [
      {
        type: 'text',
        text: [
          'Bạn là giáo viên Toán THPT chấm bài qua ẢNH CHỤP vở của học sinh. Chấm NGHIÊM KHẮC như giáo viên.',
          'Đề bài: ' + prompt,
          'Tiêu chí chấm: ' + (rubric || 'Không có'),
          'Các ảnh dưới đây là bài làm của học sinh (có thể nhiều trang).',
          'Hãy đánh giá: (1) tính đúng đắn của lời giải; (2) đầy đủ các bước lập luận; (3) CÁCH TRÌNH BÀY: chữ viết, sạch sẽ, bố cục rõ ràng, đúng ký hiệu toán học.',
          'Chỉ trả về JSON: {"score": <số 0-10>, "strengths": [..], "weaknesses": [..], "suggestion": "<nhận xét cả nội dung và trình bày>"}',
        ].join('\n'),
      },
      ...images.map((url) => ({
        type: 'image_url',
        image_url: { url: publicBase + url },
      })),
    ];

    try {
      let res: Response | null = null;
      let data: any = null;
      // Thử lại khi nguồn quá tải (429/503/529) — Gemini hay báo "high demand" tạm thời
      const fallbackModel =
        process.env.VISION_MODEL_FALLBACK || 'gemini-3.5-flash';
      for (let attempt = 0; attempt < 3; attempt++) {
        res = await fetch(
          `${process.env.VISION_BASE_URL}/chat/completions`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.VISION_API_KEY}`,
            },
            body: JSON.stringify({
              // Model chính bận → tự chuyển model dự phòng
              model:
                attempt === 2 && fallbackModel
                  ? fallbackModel
                  : process.env.VISION_MODEL,
              messages: [{ role: 'user', content: contentParts }],
              temperature: 0.3,
              max_tokens: 2000,
            }),
          },
        );
        if (res.status === 429 || res.status === 503 || res.status === 529) {
          await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
          continue;
        }
        break;
      }
      if (!res || !res.ok) {
        // Thử nguồn dự phòng (visionChat có nhiều provider + retry)
        const fb = await this.visionChat(contentParts, 2000);
        if (fb) return this.parseJson(fb);
        throw new Error(
          'Vision API lỗi: ' +
            (res ? (await res.text()).slice(0, 200) : 'không phản hồi'),
        );
      }
      data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      return this.parseJson(text);
    } catch (e) {
      return { error: (e as Error).message };
    }
  }

  // Chấm tổng hợp: nội dung chữ (DeepSeek) + trình bày ảnh (Vision nếu có)
  async gradeEssayFull(
    prompt: string,
    rubric: string,
    content: string,
    images: string[],
  ) {
    // Nếu bài nộp CHỈ có ảnh/PDF (không có chữ) → bỏ qua chấm chữ, chỉ chấm ảnh
    const hasRealText =
      !!content &&
      content.trim() !== '' &&
      content !== '(bài làm chỉ có ảnh)' &&
      content !== '(bài làm dạng PDF)' &&
      content !== '(xem ảnh/PDF)' &&
      content !== '(xem ảnh)';
    let textResult: any;
    if (hasRealText) {
      try {
        textResult = await this.gradeEssay(prompt, rubric, content);
      } catch (e) {
        textResult = { error: (e as Error).message };
      }
    } else {
      textResult = {};
    }

    const visionResult = await this.gradeEssayImages(
      prompt,
      rubric,
      images || [],
    );

    const hasTextScore = typeof textResult?.score === 'number';
    const hasVisionScore =
      visionResult && typeof visionResult.score === 'number';

    let score: number | null = null;
    if (hasTextScore && hasVisionScore) {
      score = Math.round((0.6 * textResult.score + 0.4 * visionResult.score) * 10) / 10;
    } else if (hasTextScore) {
      score = textResult.score;
    } else if (hasVisionScore) {
      score = visionResult.score;
    }

    const parts: string[] = [];
    if (hasTextScore || textResult?.suggestion) {
      parts.push(
        `Nội dung: ${textResult?.suggestion || '—'}` +
          (textResult?.strengths?.length
            ? '\n' + textResult.strengths.map((s: string) => `• Mạnh: ${s}`).join('\n')
            : ''),
      );
    }
    if (hasVisionScore || visionResult?.suggestion) {
      parts.push(
        `Trình bày (qua ảnh): ${visionResult?.suggestion || '—'}` +
          (visionResult?.weaknesses?.length
            ? '\n' +
              visionResult.weaknesses
                .map((w: string) => `• Cần cải thiện: ${w}`)
                .join('\n')
            : ''),
      );
    }
    if (!hasVisionScore && (images || []).length > 0) {
      parts.push(
        '(AI đọc ảnh chưa trả kết quả — có thể nguồn AI đang bận, hãy bấm "Chấm bằng AI" lại sau ít phút.)',
      );
    }

    return {
      score,
      suggestion: parts.join('\n'),
      strengths: textResult?.strengths || visionResult?.strengths || [],
      weaknesses: textResult?.weaknesses || visionResult?.weaknesses || [],
      raw: { text: textResult, vision: visionResult },
    };
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

  // Phân loại thô một lô câu hỏi trong MỘT lần gọi AI
  async classifyQuestionsBatch(
    questions: string[],
    context?: { topics?: { name: string; grade: number | null }[]; forms?: string[] },
  ): Promise<any[]> {
    const topics = context?.topics || [];
    const forms = context?.forms || [];
    const topicLines = topics.length
      ? Array.from(new Set(topics.map((t) => t.grade ?? 0)))
          .sort((a, b) => a - b)
          .map((g) => {
            const names = topics
              .filter((t) => (t.grade ?? 0) === g)
              .map((t) => t.name);
            return `CHỦ ĐỀ LỚP ${g || '?'}: ${names.join(' | ')}`;
          })
          .join('\n')
      : '(chưa có chủ đề nào)';
    const formLines = forms.length ? forms.join(', ') : '(chưa có dạng bài nào)';

    const system =
      'Bạn là chuyên gia phân loại câu hỏi Toán theo chương trình GDPT 2018 Việt Nam. Chỉ trả về JSON hợp lệ.';
    const numbered = questions
      .map((q, i) => `Câu ${i + 1}: ${q}`)
      .join('\n\n');
    const user = [
      'Phân loại từng câu hỏi sau (chủ đề, lớp, độ khó, dạng bài):',
      numbered,
      '',
      'DANH SÁCH CHỦ ĐỀ ĐÃ TẠO TRONG NGÂN HÀNG — CHỈ được chọn chủ đề ĐÚNG NGUYÊN TÊN trong danh sách này (đúng cả lớp), KHÔNG thêm tiền tố hay hậu tố:',
      topicLines,
      'Nếu không có chủ đề nào phù hợp → topic = "" (để trống).',
      '',
      'DANH SÁCH DẠNG BÀI ĐÃ CÓ — ưu tiên dùng nếu trùng ý:',
      formLines,
      'Nếu chưa có dạng bài phù hợp → đề xuất tên dạng bài NGẮN GỌN chuẩn SGK, ví dụ: "Phương trình mặt phẳng", "Khoảng cách từ điểm đến mặt phẳng", "Tìm m để hàm số đồng biến", "Tính thể tích khối chóp"; nếu không xác định được → form = "".',
      '',
      'Trả về MẢNG JSON, mỗi phần tử theo đúng thứ tự câu hỏi:',
      '[{"grade": 10|11|12|null, "topic": "tên chủ đề trong danh sách", "difficulty": "NHAN_BIET|THONG_HIEU|VAN_DUNG|VAN_DUNG_CAO", "form": "tên dạng bài"}]',
    ].join('\n');

    const raw = await this.chat([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ]);

    const fallback = () =>
      questions.map(() => ({
        grade: null,
        topic: '',
        difficulty: null,
        form: '',
      }));
    try {
      const parsed = this.parseJson(raw);
      const list = Array.isArray(parsed)
        ? parsed
        : parsed && Array.isArray(parsed.results)
          ? parsed.results
          : null;
      if (!list) return fallback();
      return list.map((r: any) => ({
        grade: r.grade ?? null,
        topic: typeof r.topic === 'string' ? r.topic : '',
        difficulty: r.difficulty ?? null,
        form: typeof r.form === 'string' ? r.form : '',
      }));
    } catch (e) {
      return fallback();
    }
  }

  // Phân tích điểm mạnh / điểm yếu của học sinh sau bài thi
  async analyzeStrengths(
    items: { topic: string; difficulty: string; correct: boolean }[],
  ) {
    const correct = items.filter((i) => i.correct);
    const wrong = items.filter((i) => !i.correct);

    const summarize = (list: { topic: string; difficulty: string }[]) => {
      const byTopic: Record<string, number> = {};
      for (const it of list) {
        const key = it.topic || 'Chưa phân loại';
        byTopic[key] = (byTopic[key] || 0) + 1;
      }
      return Object.entries(byTopic)
        .sort((a, b) => b[1] - a[1])
        .map(([t, n]) => `${t} (${n} câu)`)
        .join(', ');
    };

    const system =
      'Bạn là chuyên gia phân tích năng lực học Toán THPT. Chỉ trả về JSON hợp lệ.';
    const user = [
      'Kết quả bài thi của một học sinh:',
      `- Số câu đúng: ${correct.length}`,
      `- Số câu sai: ${wrong.length}`,
      correct.length ? `- Chủ đề làm đúng: ${summarize(correct)}` : '- Chủ đề làm đúng: không có',
      wrong.length ? `- Chủ đề làm sai: ${summarize(wrong)}` : '- Chủ đề làm sai: không có',
      '',
      'Hãy trả về JSON với đúng các trường sau (tiếng Việt):',
      '{"strengths": ["<2-3 điểm mạnh>"], "weaknesses": ["<2-3 điểm yếu theo chủ đề>"], "advice": "<lời khuyên ngắn gọn>"}',
    ].join('\n');

    try {
      const raw = await this.chat([
        { role: 'system', content: system },
        { role: 'user', content: user },
      ]);
      return this.parseJson(raw);
    } catch (e) {
      return {
        strengths: [],
        weaknesses: [],
        advice: '',
      };
    }
  }
}
