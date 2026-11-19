// Cây mục lục chuẩn lớp 12 (CHƯƠNG → Bài → Dạng) — đầy đủ 6 chương, gồm các nhánh luyện thi ĐH/ĐGNL/ĐGTD.

export type TaxonomyLesson = { name: string; forms: string[] };
export type TaxonomyChapter = { name: string; lessons: TaxonomyLesson[] };

export const GRADE12_TAXONOMY: TaxonomyChapter[] = [
  {
    name: 'CHƯƠNG I. ỨNG DỤNG ĐẠO HÀM ĐỂ KHẢO SÁT VÀ VẼ ĐỒ THỊ HÀM SỐ.',
    lessons: [
      {
        name: 'Bài 1. Tính Đơn Điệu & Cực Trị Của Hàm Số',
        forms: [
          'Dạng 1. Lý thuyết xét tính đơn điệu & cực trị của hàm số',
          'Dạng 2. Xét tính đơn điệu hàm số khi biết BBT/ ĐTHS',
          'Dạng 3. Xét tính đơn điệu hàm số khi biết giả thiết đạo hàm',
          'Dạng 4. Xét tính đơn điệu hàm số khi biết công thức tường minh',
          'Dạng 5. Tìm cực trị hàm số khi biết BBT/ ĐTHS',
          'Dạng 6. Tìm cực trị hàm số khi biết giả thiết đạo hàm',
          'Dạng 7. Tìm cực trị hàm số khi biết công thức tường minh',
          'Dạng 8: Kết hợp đơn điệu và cực trị hàm số',
          'Dạng 9. Tìm tham số m để hàm số (bậc 3, phân thức, căn thức...) đơn điệu trên R hoặc trên khoảng K',
          'Dạng 10. Tìm tham số m để hàm số đạt cực trị tại x = x0 hoặc có số điểm cực trị thỏa mãn điều kiện',
          'Dạng 11. Đường thẳng đi qua hai điểm cực trị & Bài toán cực trị hàm bậc ba thỏa mãn điều kiện hình học (diện tích, khoảng cách, góc...)',
          'Dạng 12. Đơn điệu và cực trị của hàm số hợp f(u), hàm liên kết g(x) = f(u(x)) + h(x), hàm trị tuyệt đối',
        ],
      },
      {
        name: 'Bài 2. Giá Trị Lớn Nhất & Nhỏ Nhất Của Hàm Số',
        forms: [
          'Dạng 1. Lý thuyết xét max, min hàm số',
          'Dạng 2. Xét max, min hàm số khi biết BBT/ ĐTHS',
          'Dạng 3. Xét max, min hàm số khi biết giả thiết đạo hàm',
          'Dạng 4. Xét max, min hàm số khi biết công thức tường minh',
          'Dạng 5. Tìm tham số m để Max, Min của hàm số trên đoạn [a; b] thỏa mãn điều kiện cho trước',
          'Dạng 6. Max, Min của hàm số hợp f(u) và hàm liên kết g(x) = f(u(x)) + h(x)',
          'Dạng 7. Max, Min của hàm số chứa dấu giá trị tuyệt đối |f(x)|, |f(x) + m| (kỹ thuật bất đẳng thức & cô lập m)',
          'Dạng 8. Ứng dụng Max, Min để giải phương trình, bất phương trình và tìm điều kiện có nghiệm chứa tham số m',
        ],
      },
      {
        name: 'Bài 3. Đường Tiệm Cận Của Đồ Thị Hàm Số',
        forms: [
          'Dạng 1. Lý thuyết Xét tiệm cận của ĐTHS',
          'Dạng 2. Xét tiệm cận của ĐTHS có công thức tường minh',
          'Dạng 3. Xét tiệm cận của ĐTHS khi biết BBT/ ĐTHS',
          'Dạng 4. Xét tiệm cận hàm liên kết khi biết BBT/ ĐTHS hàm thành phần',
          'Dạng 5. Tìm tham số m để ĐTHS có đúng k đường tiệm cận (tiệm cận đứng, tiệm cận ngang, tiệm cận xiên)',
          'Dạng 6. Bài toán tiệm cận kết hợp yếu tố hình học (khoảng cách từ 1 điểm đến tiệm cận, diện tích tạo bởi tiệm cận và trục tọa độ, góc giữa hai tiệm cận...)',
        ],
      },
      {
        name: 'Bài 4. Khảo Sát Biến Thiên & Vẽ Đồ Thị Hàm Số',
        forms: [
          'Dạng 1. Tổng hợp các tính chất cơ bản hàm số',
          'Dạng 2. Nhận diện ĐTHS, xét dấu hệ số và xác định hàm số',
          'Dạng 3. Tâm đối xứng, trục đối xứng, điểm uốn và cặp điểm đối xứng trên ĐTHS',
          'Dạng 4. Điểm cố định của họ đồ thị hàm số & Điểm có tọa độ nguyên thuộc ĐTHS',
          'Dạng 5. Phép biến đổi đồ thị & Đồ thị hàm số chứa dấu giá trị tuyệt đối: y = |f(x)|, y = f(|x|), y = |u(x)|.v(x)',
          'Dạng 6. Viết phương trình tiếp tuyến của ĐTHS (tại 1 điểm, biết hệ số góc, đi qua 1 điểm) & Điều kiện tiếp xúc',
          'Dạng 7. Sự tương giao của hai đồ thị (bằng công thức tường minh & bằng BBT/ĐTHS)',
          'Dạng 8. Biện luận số nghiệm của phương trình, bất phương trình bằng đồ thị (cô lập tham số m)',
          'Dạng 9. Bài toán tương giao chứa tham số m thỏa mãn điều kiện nghiệm (định lý Vi-ét, độ dài dây cung, diện tích, cấp số cộng...)',
        ],
      },
      {
        name: 'Bài 5. Ứng Dụng Đạo Hàm Giải Quyết Các Bài Toán Thực Tiễn',
        forms: [
          'Dạng 1. Tốc độ thay đổi một đại lượng (chuyển động, tăng trưởng, …)',
          'Dạng 2. Tối ưu hóa trong kinh tế học (chi phí, doanh thu, lợi nhuận, thuế)',
          'Dạng 3. Tối ưu hóa chứa yếu tố hình học',
          'Dạng 4. Bài toán thực tế khác',
          'Dạng 5. Bài toán tối ưu đường đi - thời gian - chi phí truyền tải (dây cáp, ống dẫn qua 2 môi trường, định luật khúc xạ...)',
          'Dạng 6. Bài toán thực tế mô hình hóa bằng hàm bậc ba, hàm phân thức (ax+b)/(cx+d), hàm phân thức bậc 2 trên bậc 1, hàm mũ - lôgarit',
        ],
      },
      {
        name: 'Mở rộng',
        forms: [
          'Dạng 1. Bài toán hàm hợp, hàm ẩn nâng cao (phương pháp ghép trục, đổi biến, đạo hàm hàm hợp nhiều tầng)',
          'Dạng 2. Biện luận số điểm cực trị của hàm số chứa trị tuyệt đối y = |f(x) + m| và y = f(|x| + m)',
          "Dạng 3. Khôi phục công thức hàm số f(x), g(x) từ đồ thị đạo hàm f'(x) hoặc điều kiện tiếp xúc/tương giao",
          'Dạng 4. Bài toán sử dụng hàm đặc trưng kết hợp khảo sát hàm số',
          'Dạng 5. Bài toán cực trị nhiều biến quy về khảo sát hàm một biến (dùng điều kiện ràng buộc hoặc đánh giá)',
        ],
      },
    ],
  },
  {
    name: 'CHƯƠNG II. VECTƠ VÀ HỆ TRỤC TOẠ ĐỘ TRONG KHÔNG GIAN.',
    lessons: [
      {
        name: 'Bài 1. Vectơ Trong Không Gian',
        forms: [
          'Dạng 1. Lý thuyết Véctơ trong không gian',
          'Dạng 2. Biểu thức véctơ cơ bản (tổng, hiệu, tích với số thực)',
          'Dạng 3. Biểu thức tích vô hướng hai véctơ trong không gian',
          'Dạng 4. Kết hợp các phép toán về Véctơ trong không gian',
          'Dạng 5. Toán thực tế về Vectơ trong không gian (cân bằng lực 3D, dây cáp treo vật nặng, chân đế máy ảnh...)',
        ],
      },
      {
        name: 'Bài 2. Hệ Trục Tọa Độ Trong Không Gian',
        forms: [
          'Dạng 1: Lý thuyết về Hệ trục không gian Oxyz & Tọa độ điểm, véctơ',
          'Dạng 2: Mở đầu tọa độ điểm, véctơ. Các thông số hệ trục Oxy',
          'Dạng 3. Tọa độ hình chiếu vuông góc, điểm đối xứng qua các trục Ox, Oy, Oz và các mặt phẳng tọa độ (Oxy), (Oyz), (Ozx)',
          'Dạng 4. Xác định tọa độ các đỉnh của hình hộp, hình lăng trụ, hình chóp gắn vào hệ trục Oxyz',
          'Dạng 5. Toán thực tế gắn hệ trục tọa độ Oxyz (định vị GPS, radar, mô hình kiến trúc - nhà kính - mái vòm...)',
        ],
      },
      {
        name: 'Bài 3. Biểu Thức Tọa Độ Của Các Phép Toán Vectơ',
        forms: [
          'Dạng 1. Tọa độ điểm, tọa độ vectơ cơ bản',
          'Dạng 2. Biểu thức tọa độ vectơ cơ bản (tổng, hiệu, tích với số thực) & Ứng dụng',
          'Dạng 3. Biểu thức tọa độ tích có hướng, tích hỗn tạp & Ứng dụng',
          'Dạng 4. Biểu thức tọa độ tích vô hướng & Ứng dụng',
          'Dạng 5. Toán thực tế tọa độ điểm, vectơ & Biểu thức tọa độ vectơ',
        ],
      },
      {
        name: 'Mở rộng',
        forms: [
          'Dạng 1. Tìm điểm M thuộc trục tọa độ hoặc mặt phẳng tọa độ thỏa mãn đẳng thức vectơ / điều kiện hình học (tam giác vuông, cân, đều, thẳng hàng, đồng phẳng)',
          'Dạng 2. Bài toán cực trị (Max - Min) biểu thức độ dài vectơ, tổng khoảng cách, tích vô hướng trong Oxyz (tâm tỉ cự, bất đẳng thức vectơ)',
          'Dạng 3. Bài toán tọa độ vectơ trong không gian chứa tham số m',
        ],
      },
    ],
  },
  {
    name: 'CHƯƠNG III. CÁC SỐ ĐẶC TRƯNG ĐO MỨC ĐỘ PHÂN TÁN CỦA MẪU SỐ LIỆU GHÉP NHÓM.',
    lessons: [
      {
        name: 'Bài 1. Khoảng biến thiên. Khoảng tứ phân vị',
        forms: [
          'Dạng 1. Lý thuyết khoảng biến thiên, khoảng tứ phân vị của MSL ghép nhóm',
          'Dạng 2. Khoảng biến thiên, khoảng tứ phân vị của MSL ghép nhóm',
          'Dạng 3. Giá trị bất thường của MSL ghép nhóm',
          'Dạng 4. Toán thực tế về khoảng biến thiên, khoảng tứ phân vị và nhận xét mức độ phân tán từ biểu đồ/bảng tần số',
        ],
      },
      {
        name: 'Bài 2. Phương sai. Độ lệch chuẩn',
        forms: [
          'Dạng 1. Lý thuyết về phương sai, độ lệch chuẩn của MSL ghép nhóm',
          'Dạng 2. Phương sai, độ lệch chuẩn nhóm',
          'Dạng 3. Kết hợp các số đặc trưng & thông số bảng của MSL ghép nhóm',
          'Dạng 4. Toán thực tế sử dụng phương sai, độ lệch chuẩn để so sánh độ ổn định, độ đồng đều, mức độ rủi ro giữa hai hay nhiều mẫu số liệu',
        ],
      },
      {
        name: 'Mở rộng',
        forms: [
          'Dạng 1. Tìm tần số hoặc tham số (x, y, m) còn khuyết trong bảng số liệu ghép nhóm khi biết khoảng tứ phân vị, phương sai, độ lệch chuẩn',
          'Dạng 2. Bài toán tổng hợp kết hợp cả số đặc trưng đo xu thế trung tâm (Lớp 11) và số đặc trưng đo độ phân tán (Lớp 12)',
        ],
      },
    ],
  },
  {
    name: 'CHƯƠNG IV. NGUYÊN HÀM VÀ TÍCH PHÂN.',
    lessons: [
      {
        name: 'Bài 1. Nguyên Hàm (Bài 11 SGK)',
        forms: [
          'Dạng 1. Lý thuyết, định nghĩa & Tính chất cơ bản của nguyên hàm',
          'Dạng 2. Nguyên hàm của hàm số lũy thừa, đa thức, phân thức hữu tỉ cơ bản',
          'Dạng 3. Nguyên hàm của hàm số lượng giác',
          'Dạng 4. Nguyên hàm của hàm số mũ',
          'Dạng 5. Tìm nguyên hàm F(x) thỏa mãn điều kiện cho trước F(x0) = y0 (xác định hằng số C)',
          'Dạng 6. Toán thực tế về nguyên hàm (bài toán vận tốc - quãng đường - gia tốc, tốc độ tăng trưởng, lưu lượng nước/điện...)',
        ],
      },
      {
        name: 'Bài 2. Tích Phân (Bài 12 SGK)',
        forms: [
          'Dạng 1. Lý thuyết, ý nghĩa hình học và các tính chất của tích phân',
          'Dạng 2. Tính tích phân bằng bảng nguyên hàm cơ bản (đa thức, phân thức, lượng giác, mũ)',
          'Dạng 3. Tích phân của hàm số chứa dấu giá trị tuyệt đối & Hàm số cho bởi nhiều công thức',
          'Dạng 4. Khai thác tính chất tuyến tính, tách cận của tích phân (tính tích phân khi biết tích phân thành phần)',
          'Dạng 5. Toán thực tế về tích phân (quãng đường vật chuyển động biến đổi, công của lực, nhiệt lượng, kinh tế học, sinh học...)',
        ],
      },
      {
        name: 'Bài 3. Ứng Dụng Hình Học Của Tích Phân (Bài 13 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Công thức tính diện tích hình phẳng, thể tích vật thể',
          'Dạng 2. Tính diện tích hình phẳng giới hạn bởi các đường có phương trình tường minh',
          'Dạng 3. Tính diện tích hình phẳng dựa vào đồ thị cho sẵn (khôi phục hàm số hoặc đọc giao điểm)',
          'Dạng 4. Tính thể tích vật thể giới hạn bởi hai mặt phẳng x = a, x = b khi biết diện tích thiết diện S(x)',
          'Dạng 5. Tính thể tích khối tròn xoay khi quay hình phẳng quanh trục Ox (và mở rộng quanh Oy)',
          'Dạng 6. Toán thực tế ứng dụng diện tích hình phẳng & thể tích vật thể (thiết kế cổng chào, bồn chứa, bình hoa, chi tiết máy, chi phí sơn/lát gạch...)',
        ],
      },
      {
        name: 'Mở rộng (Luyện thi ĐH - ĐGNL - ĐGTD)',
        forms: [
          'Dạng 1. Phương pháp tính nguyên hàm - tích phân nâng cao: Đổi biến số (loại 1, loại 2) và Nguyên hàm - Tích phân từng phần (Múa cột)',
          'Dạng 2. Nguyên hàm - Tích phân của hàm phân thức hữu tỉ phức tạp & Hàm chứa căn thức',
          "Dạng 3. Tích phân hàm ẩn, phương trình vi phân cơ bản (f'(x) + p(x).f(x) = q(x), f'(x).f(x) = g(x)...)",
          'Dạng 4. Tích phân của các hàm số đặc biệt (hàm chẵn, hàm lẻ, hàm tuần hoàn, tính chất đối xứng cận)',
          'Dạng 5. Bài toán tìm tham số m hoặc tỉ số diện tích (đường thẳng/Parabol chia hình phẳng thành hai phần có diện tích bằng nhau hoặc theo tỉ lệ k)',
          'Dạng 6. Bài toán cực trị (Max - Min) liên quan đến tích phân, diện tích hình phẳng, thể tích khối tròn xoay và bất đẳng thức tích phân',
        ],
      },
    ],
  },
  {
    name: 'CHƯƠNG V. PHƯƠNG PHÁP TỌA ĐỘ TRONG KHÔNG GIAN.',
    lessons: [
      {
        name: 'Bài 1. Phương Trình Mặt Phẳng (Bài 14 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Xác định vectơ pháp tuyến, cặp vectơ chỉ phương, điểm thuộc mặt phẳng',
          'Dạng 2. Lập phương trình tổng quát của mặt phẳng (biết điểm và VTPT, đi qua 3 điểm, phương trình mặt phẳng theo đoạn chắn, trung trực...)',
          'Dạng 3. Lập phương trình mặt phẳng chứa hoặc song song với đường thẳng / vuông góc với mặt phẳng cho trước',
          'Dạng 4. Vị trí tương đối giữa hai mặt phẳng (song song, cắt nhau, trùng nhau, vuông góc) & Tìm tham số m',
          'Dạng 5. Khoảng cách từ một điểm đến một mặt phẳng & Khoảng cách giữa hai mặt phẳng song song',
          'Dạng 6. Toán thực tế về phương trình mặt phẳng và khoảng cách trong không gian',
        ],
      },
      {
        name: 'Bài 2. Phương Trình Đường Thẳng Trong Không Gian (Bài 15 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Xác định vectơ chỉ phương, điểm thuộc đường thẳng (PT tham số và PT chính tắc)',
          'Dạng 2. Lập phương trình đường thẳng cơ bản (qua 2 điểm, qua 1 điểm và vuông góc mặt phẳng, song song đường thẳng...)',
          'Dạng 3. Lập phương trình đường thẳng nâng cao (giao tuyến 2 mặt phẳng, đường thẳng cắt và vuông góc với đường thẳng, đường vuông góc chung của 2 đường chéo nhau...)',
          'Dạng 4. Vị trí tương đối giữa hai đường thẳng (cắt nhau, song song, chéo nhau, trùng nhau) & Vị trí tương đối giữa đường thẳng và mặt phẳng (tìm giao điểm)',
          'Dạng 5. Tìm tọa độ hình chiếu vuông góc và điểm đối xứng của một điểm qua đường thẳng, qua mặt phẳng; hình chiếu của đường thẳng lên mặt phẳng',
          'Dạng 6. Khoảng cách từ một điểm đến một đường thẳng & Khoảng cách giữa hai đường thẳng chéo nhau',
          'Dạng 7. Toán thực tế về phương trình đường thẳng trong không gian (quỹ đạo bay của máy bay/drone, tia sáng, đường hầm, cáp treo...)',
        ],
      },
      {
        name: 'Bài 3. Công Thức Tính Góc Trong Không Gian (Bài 16 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Công thức tọa độ tính góc trong không gian',
          'Dạng 2. Tính góc giữa hai đường thẳng bằng phương pháp tọa độ',
          'Dạng 3. Tính góc giữa đường thẳng và mặt phẳng bằng phương pháp tọa độ',
          'Dạng 4. Tính góc giữa hai mặt phẳng (và góc nhị diện) bằng phương pháp tọa độ',
          'Dạng 5. Bài toán tìm tham số m hoặc lập phương trình đường thẳng, mặt phẳng thỏa mãn điều kiện về góc',
          'Dạng 6. Toán thực tế về tính góc trong không gian (độ dốc mái nhà, góc nghiêng tấm pin mặt trời, góc chiếu sáng/quan sát...)',
        ],
      },
      {
        name: 'Bài 4. Phương Trình Mặt Cầu (Bài 17 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Nhận diện phương trình mặt cầu, xác định tâm I và bán kính R (kể cả điều kiện tham số m để là mặt cầu)',
          'Dạng 2. Lập phương trình mặt cầu (biết tâm và bán kính, đường kính AB, đi qua 4 điểm, ngoại tiếp hình chóp/lăng trụ...)',
          'Dạng 3. Lập phương trình mặt cầu tiếp xúc với mặt phẳng hoặc tiếp xúc với đường thẳng',
          'Dạng 4. Vị trí tương đối giữa mặt cầu và mặt phẳng (thiết diện là đường tròn, tìm tâm và bán kính đường tròn giao tuyến)',
          'Dạng 5. Vị trí tương đối giữa mặt cầu và đường thẳng (tiếp tuyến của mặt cầu, dây cung của mặt cầu)',
          'Dạng 6. Toán thực tế về phương trình mặt cầu (vùng phủ sóng radar/trạm phát sóng 5G, định vị vệ tinh, quả địa cầu, kiến trúc vòm cầu...)',
        ],
      },
      {
        name: 'Mở rộng (Luyện thi ĐH - ĐGNL - ĐGTD)',
        forms: [
          'Dạng 1. Phương pháp gắn hệ trục tọa độ Oxyz (Tọa độ hóa) để giải các bài toán Hình học không gian cổ điển Lớp 11 (góc, khoảng cách, thể tích)',
          'Dạng 2. Bài toán tập hợp điểm (quỹ tích) trong không gian Oxyz (mặt cầu, đường tròn cố định, mặt phẳng...)',
          'Dạng 3. Cực trị hình học Oxyz về khoảng cách và độ dài (từ điểm đến đường/mặt, tổng/hiệu khoảng cách MA + MB, MA + k.MB...)',
          'Dạng 4. Cực trị hình học Oxyz về góc, diện tích tam giác/thiết diện, thể tích tứ diện và bán kính mặt cầu',
          'Dạng 5. Bài toán tiếp tuyến từ một điểm ngoài mặt cầu (nón tiếp tuyến, mặt phẳng đi qua các tiếp điểm) & Chùm mặt phẳng - Chùm mặt cầu',
        ],
      },
    ],
  },
  {
    name: 'CHƯƠNG VI. XÁC SUẤT CÓ ĐIỀU KIỆN.',
    lessons: [
      {
        name: 'Bài 1. Xác Suất Có Điều Kiện (Bài 18 SGK)',
        forms: [
          'Dạng 1. Lý thuyết, định nghĩa & Tính chất của xác suất có điều kiện P(A|B)',
          'Dạng 2. Tính xác suất có điều kiện bằng định nghĩa, bảng dữ liệu thống kê 2x2 hoặc biểu đồ Ven',
          'Dạng 3. Tính xác suất bằng công thức nhân xác suất tổng quát P(AB) = P(A).P(B|A) và sơ đồ hình cây',
          'Dạng 4. Mối liên hệ giữa xác suất có điều kiện và tính độc lập của hai biến cố',
          'Dạng 5. Toán thực tế về xác suất có điều kiện (rút thăm không hoàn lại, kiểm tra chất lượng sản phẩm, di truyền học, khảo sát xã hội học...)',
        ],
      },
      {
        name: 'Bài 2. Công Thức Xác Suất Toàn Phần Và Công Thức Bayes (Bài 19 SGK)',
        forms: [
          'Dạng 1. Lý thuyết về hệ biến cố đầy đủ, công thức xác suất toàn phần và công thức Bayes',
          'Dạng 2. Tính xác suất bằng công thức xác suất toàn phần (kết hợp sơ đồ hình cây 2 nhánh, 3 nhánh)',
          'Dạng 3. Tính xác suất hậu nghiệm bằng công thức Bayes',
          'Dạng 4. Bài toán kết hợp cả công thức xác suất toàn phần và công thức Bayes trong cùng một đề toán (dạng câu hỏi Đúng/Sai và Trả lời ngắn)',
          'Dạng 5. Toán thực tế trọng tâm (xét nghiệm y học - dương tính giả/âm tính giả, phân xưởng sản xuất - phế phẩm, lọc thư rác AI, tín hiệu truyền tin, bảo hiểm...)',
        ],
      },
      {
        name: 'Mở rộng (Luyện thi ĐH - ĐGNL - ĐGTD)',
        forms: [
          'Dạng 1. Công thức xác suất toàn phần và công thức Bayes mở rộng cho hệ đầy đủ từ 3 biến cố trở lên (B1, B2, B3, ..., Bn)',
          'Dạng 2. Chuỗi phép thử phụ thuộc qua nhiều giai đoạn (chuyển sản phẩm/bi qua nhiều hộp liên tiếp, quá trình lặp nhiều bước)',
          'Dạng 3. Bài toán tìm tham số (số lượng phần tử n, tỉ lệ p) hoặc tối ưu hóa quyết định khi biết trước xác suất có điều kiện / xác suất Bayes',
          'Dạng 4. Bài toán xác suất kết hợp Đại số tổ hợp nâng cao (Lớp 10) và Xác suất có điều kiện (Lớp 12)',
        ],
      },
    ],
  },
];
