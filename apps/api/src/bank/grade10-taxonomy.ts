// Cây mục lục chuẩn lớp 10 (CHƯƠNG → Bài → Dạng) — theo danh mục giáo viên cung cấp.
// Dùng để seed vào Topic (3 cấp) và làm danh sách cho AI phân loại dạng bài.

export type TaxonomyLesson = { name: string; forms: string[] };
export type TaxonomyChapter = {
  name: string;
  lessons: TaxonomyLesson[];
};

export const GRADE10_TAXONOMY: TaxonomyChapter[] = [
  {
    name: 'CHƯƠNG I. MỆNH ĐỀ VÀ TẬP HỢP',
    lessons: [
      {
        name: 'Bài 1: Mệnh Đề',
        forms: [
          'Dạng 1. Phát biểu, xét ĐS & Phủ định của mệnh đề logic',
          'Dạng 2. Phát biểu, xét ĐS của mệnh đề chứa biến',
          'Dạng 3. Phát biểu, xét ĐS của mệnh đề kéo theo, mệnh đề đảo. ĐK cần & đủ',
          'Dạng 4. Phát biểu, xét ĐS của mệnh đề tương đương',
          'Dạng 5. Phát biểu, xét ĐS của mệnh đề "với mọi/ tồn tại" & Phủ định của chúng',
          'Dạng 6. Toán thực tế về Mệnh đề',
        ],
      },
      {
        name: 'Bài 2. Tập Hợp & Các Phép Toán Trên Tập Hợp',
        forms: [
          'Dạng 1. Lý thuyết & Các khái niệm cơ bản Tập hợp',
          'Dạng 2. Các tập hợp số & Mối quan hệ giữa chúng',
          'Dạng 3. Giao, hợp, hiệu, bù các tập hợp hữu hạn phần tử',
          'Dạng 4. Giao, hợp, hiệu, bù các tập con hay dùng của R',
          'Dạng 5. Toán thực tế về Tập hợp',
        ],
      },
      {
        name: 'Mở rộng',
        forms: [
          '1. Bài toán mệnh đề, MĐCB, MĐ với mọi/ tồn tại chứa tham số',
          'Dạng 2. Bài toán tập hợp & các phép toán chứa tham số',
        ],
      },
    ],
  },
  {
    name: 'CHƯƠNG II. BẤT PHƯƠNG TRÌNH & HỆ BPT BẬC NHẤT HAI ẨN',
    lessons: [
      {
        name: 'Bài 1. Bất Phương Trình Bậc Nhất Hai Ẩn',
        forms: [
          'Dạng 1. Lý thuyết & Xác định BPT bậc nhất hai ẩn',
          'Dạng 2. Xác định nghiệm & Biểu diễn miền nghiệm của BPT bậc nhất hai ẩn',
          'Dạng 3. Toán thực tế về BPT bậc nhất hai ẩn',
        ],
      },
      {
        name: 'Bài 2. Hệ Bất Phương Trình Bậc Nhất Hai Ẩn',
        forms: [
          'Dạng 1. Lý thuyết & Xác định hệ BPT bậc nhất hai ẩn',
          'Dạng 2. Xác định nghiệm & Biểu diễn miền nghiệm của hệ BPT bậc nhất hai ẩn',
          'Dạng 3. Toán thực tế về hệ BPT bậc nhất hai ẩn',
        ],
      },
      {
        name: 'Mở rộng',
        forms: [
          'Dạng 1. Điều kiện để xác định một BPT, hệ BPT bậc nhất hai ẩn',
          'Dạng 2. Điều kiện để cặp số là nghiệm/ không là nghiệm của BPT, hệ BPT',
          'Dạng 3. Điều kiện để miền nghiệm BPT, hệ BPT thỏa mãn điều kiện cho trước',
        ],
      },
    ],
  },
  {
    name: 'CHƯƠNG III. HỆ THỨC LƯỢNG TRONG TAM GIÁC',
    lessons: [
      {
        name: 'Bài 1. Giá Trị Lượng Giác Của Góc Từ 0 Độ Đến 180 Độ',
        forms: [
          'Dạng 1. Lý thuyết & Công thức lượng giác của góc hình học',
          'Dạng 2. Biểu diễn & Tính số đo góc lượng giác',
          'Dạng 3. Xét dấu & tính giá trị lượng giác',
          'Dạng 4. Đơn giản, chứng minh, max min biểu thức lượng giác góc hình học',
          'Dạng 5. Toán thực tế về Giá trị lượng giác góc hình học',
        ],
      },
      {
        name: 'Bài 2. Hệ Thức Lượng Trong Tam Giác',
        forms: [
          'Dạng 1. Lý thuyết Hệ thức lượng trong tam giác',
          'Dạng 2. Định lý sin, cosin. Giải tam giác',
          'Dạng 3. Công thức S tam giác, trung tuyến, chiều cao, bán kính',
          'Dạng 4. Toán thực tế Hệ thức lượng tam giác',
        ],
      },
    ],
  },
  {
    name: 'CHƯƠNG IV. VECTƠ.',
    lessons: [
      {
        name: 'Bài 1. Các Khái Niệm Mở Đầu (Bài 7 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Các khái niệm cơ bản về vectơ',
          'Dạng 2. Xác định hai vectơ cùng phương, cùng hướng, bằng nhau, đối nhau',
          'Dạng 3. Tính độ dài của vectơ',
          'Dạng 4. Toán thực tế về các khái niệm mở đầu của vectơ',
        ],
      },
      {
        name: 'Bài 2. Tổng Và Hiệu Của Hai Vectơ (Bài 8 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Quy tắc cộng, trừ vectơ (ba điểm, hình bình hành, quy tắc hiệu)',
          'Dạng 2. Rút gọn & Chứng minh đẳng thức vectơ',
          'Dạng 3. Tính độ dài của vectơ tổng, hiệu',
          'Dạng 4. Toán thực tế về tổng và hiệu của hai vectơ (tổng hợp lực, vận tốc...)',
        ],
      },
      {
        name: 'Bài 3. Tích Của Một Vectơ Với Một Số (Bài 9 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Tính chất tích của một vectơ với một số',
          'Dạng 2. Chứng minh đẳng thức vectơ & Phân tích một vectơ theo hai vectơ không cùng phương',
          'Dạng 3. Xác định điểm thỏa mãn đẳng thức vectơ & Chứng minh 3 điểm thẳng hàng, song song',
          'Dạng 4. Toán thực tế về tích của một vectơ với một số',
        ],
      },
      {
        name: 'Bài 4. Vectơ Trong Mặt Phẳng Tọa Độ (Bài 10 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Tìm tọa độ của điểm, của vectơ trên hệ trục Oxy',
          'Dạng 2. Các phép toán tọa độ vectơ (tổng, hiệu, tích với một số)',
          'Dạng 3. Sự cùng phương của hai vectơ, 3 điểm thẳng hàng & Tọa độ trung điểm, trọng tâm',
          'Dạng 4. Toán thực tế về vectơ trong mặt phẳng tọa độ',
        ],
      },
      {
        name: 'Bài 5. Tích Vô Hướng Của Hai Vectơ (Bài 11 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Tính tích vô hướng theo định nghĩa, tính chất',
          'Dạng 2. Biểu thức tọa độ của tích vô hướng & Ứng dụng (độ dài, góc, vuông góc)',
          'Dạng 3. Chứng minh đẳng thức, tính chất hình học bằng tích vô hướng',
          'Dạng 4. Toán thực tế về tích vô hướng (tính công của lực...)',
        ],
      },
      {
        name: 'Mở rộng',
        forms: [
          'Dạng 1. Tìm tập hợp điểm (quỹ tích) thỏa mãn đẳng thức vectơ, độ dài hoặc tích vô hướng',
          'Dạng 2. Cực trị (Max - Min) biểu thức độ dài vectơ và tích vô hướng',
          'Dạng 3. Bài toán vectơ trong mặt phẳng tọa độ chứa tham số m',
        ],
      },
    ],
  },
  {
    name: 'CHƯƠNG V. CÁC SỐ ĐẶC TRƯNG CỦA MẪU SỐ LIỆU KHÔNG GHÉP NHÓM.',
    lessons: [
      {
        name: 'Bài 1. Số Gần Đúng Và Sai Số (Bài 12 SGK)',
        forms: [
          'Dạng 1. Lý thuyết về số gần đúng và sai số',
          'Dạng 2. Xác định sai số tuyệt đối, độ chính xác và sai số tương đối',
          'Dạng 3. Quy tròn số đúng và số gần đúng',
          'Dạng 4. Toán thực tế về số gần đúng và sai số',
        ],
      },
      {
        name: 'Bài 2. Các Số Đặc Trưng Đo Xu Thế Trung Tâm (Bài 13 SGK)',
        forms: [
          'Dạng 1. Lý thuyết về các số đặc trưng đo xu thế trung tâm',
          'Dạng 2. Tính số trung bình cộng (số trung bình) và mốt',
          'Dạng 3. Tính trung vị và tứ phân vị',
          'Dạng 4. Toán thực tế & Đọc, phân tích bảng số liệu, biểu đồ thống kê',
        ],
      },
      {
        name: 'Bài 3. Các Số Đặc Trưng Đo Độ Phân Tán (Bài 14 SGK)',
        forms: [
          'Dạng 1. Lý thuyết về các số đặc trưng đo độ phân tán',
          'Dạng 2. Tính khoảng biến thiên và khoảng tứ phân vị',
          'Dạng 3. Tính phương sai và độ lệch chuẩn',
          'Dạng 4. Xác định giá trị bất thường (ngoại lệ) của mẫu số liệu',
          'Dạng 5. Toán thực tế về các số đặc trưng đo độ phân tán',
        ],
      },
      {
        name: 'Mở rộng',
        forms: [
          'Dạng 1. Tìm giá trị còn thiếu (chứa tham số) trong mẫu số liệu khi biết các số đặc trưng',
          'Dạng 2. Sự thay đổi của các số đặc trưng khi biến đổi mẫu số liệu',
        ],
      },
    ],
  },
  {
    name: 'CHƯƠNG VI. HÀM SỐ, ĐỒ THỊ VÀ ỨNG DỤNG.',
    lessons: [
      {
        name: 'Bài 1. Hàm Số (Bài 15 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Khái niệm hàm số, tính giá trị của hàm số',
          'Dạng 2. Tìm tập xác định và tập giá trị của hàm số',
          'Dạng 3. Xét sự biến thiên (đồng biến, nghịch biến) của hàm số',
          'Dạng 4. Đọc và khai thác bảng biến thiên, đồ thị hàm số',
          'Dạng 5. Toán thực tế về hàm số',
        ],
      },
      {
        name: 'Bài 2. Hàm Số Bậc Hai (Bài 16 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Khảo sát, vẽ đồ thị hàm số bậc hai (đỉnh, trục đối xứng, bảng biến thiên)',
          'Dạng 2. Xác định hàm số bậc hai (Parabol) khi biết các yếu tố cho trước hoặc từ đồ thị',
          'Dạng 3. Sự tương giao của Parabol với đường thẳng & Giá trị lớn nhất, nhỏ nhất',
          'Dạng 4. Toán thực tế về hàm số bậc hai (quỹ đạo, cổng Parabol, tối ưu doanh thu/chi phí...)',
        ],
      },
      {
        name: 'Bài 3. Dấu Của Tam Thức Bậc Hai (Bài 17 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Nhận diện, xét dấu tam thức bậc hai, biểu thức tích - thương',
          'Dạng 2. Giải bất phương trình bậc hai một ẩn & Hệ bất phương trình bậc hai',
          'Dạng 3. Giải bất phương trình tích, bất phương trình chứa ẩn ở mẫu quy về bậc hai',
          'Dạng 4. Toán thực tế về dấu của tam thức bậc hai và bất phương trình bậc hai',
        ],
      },
      {
        name: 'Bài 4. Phương Trình Quy Về Phương Trình Bậc Hai (Bài 18 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Phương trình dạng √(ax² + bx + c) = √(dx² + ex + f)',
          'Dạng 2. Phương trình dạng √(ax² + bx + c) = dx + e',
          'Dạng 3. Một số phương trình quy về bậc hai khác (đặt ẩn phụ, trùng phương...)',
          'Dạng 4. Toán thực tế về phương trình quy về phương trình bậc hai',
        ],
      },
      {
        name: 'Mở rộng',
        forms: [
          'Dạng 1. Tìm tham số m để hàm số xác định hoặc đơn điệu trên miền K cho trước',
          'Dạng 2. Bài toán tương giao và định lý Vi-ét của hàm số bậc hai chứa tham số m',
          'Dạng 3. Tìm tham số m để tam thức bậc hai không đổi dấu trên R hoặc trên miền K',
          'Dạng 4. Phương trình chứa căn thức có tham số m',
          'Dạng 5. Đồ thị hàm số chứa dấu giá trị tuyệt đối và phép suy đồ thị',
        ],
      },
    ],
  },
  {
    name: 'CHƯƠNG VII. PHƯƠNG PHÁP TỌA ĐỘ TRONG MẶT PHẲNG.',
    lessons: [
      {
        name: 'Bài 1. Phương Trình Đường Thẳng (Bài 19 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Xác định vectơ chỉ phương, vectơ pháp tuyến, hệ số góc',
          'Dạng 2. Viết phương trình tham số và phương trình tổng quát của đường thẳng',
          'Dạng 3. Viết phương trình các đường đặc biệt trong tam giác (đường cao, trung tuyến, trung trực)',
          'Dạng 4. Toán thực tế về phương trình đường thẳng',
        ],
      },
      {
        name: 'Bài 2. Vị Trí Tương Đối Giữa Hai Đường Thẳng. Góc Và Khoảng Cách (Bài 20 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Xét vị trí tương đối, tìm giao điểm của hai đường thẳng',
          'Dạng 2. Tính góc giữa hai đường thẳng & Viết PT đường thẳng tạo với đường thẳng góc alpha',
          'Dạng 3. Tính khoảng cách từ điểm đến đường thẳng, giữa 2 đường thẳng song song & PT phân giác',
          'Dạng 4. Tìm tọa độ hình chiếu vuông góc và điểm đối xứng qua đường thẳng',
          'Dạng 5. Toán thực tế về vị trí tương đối, góc và khoảng cách',
        ],
      },
      {
        name: 'Bài 3. Đường Tròn Trong Mặt Phẳng Tọa Độ (Bài 21 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Nhận dạng phương trình đường tròn, tìm tâm và bán kính',
          'Dạng 2. Viết phương trình đường tròn (biết tâm và bán kính, đi qua 3 điểm, tiếp xúc đường thẳng...)',
          'Dạng 3. Viết phương trình tiếp tuyến của đường tròn (tại 1 điểm, đi qua 1 điểm, biết phương)',
          'Dạng 4. Vị trí tương đối giữa đường thẳng và đường tròn, giữa hai đường tròn',
          'Dạng 5. Toán thực tế về đường tròn trong mặt phẳng tọa độ',
        ],
      },
      {
        name: 'Bài 4. Ba Đường Conic (Bài 22 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Các yếu tố của Elip, lập phương trình chính tắc của Elip',
          'Dạng 2. Các yếu tố của Hypebol & Lập phương trình chính tắc của Hypebol',
          'Dạng 3. Các yếu tố của Parabol & Lập phương trình chính tắc của Parabol',
          'Dạng 4. Toán thực tế và tính chất quang học về ba đường Conic',
        ],
      },
      {
        name: 'Mở rộng',
        forms: [
          'Dạng 1. Bài toán đường thẳng, đường tròn, vị trí tương đối, góc, khoảng cách chứa tham số m',
          'Dạng 2. Bài toán tìm tọa độ đỉnh trong tam giác, tứ giác đặc biệt (hình vuông, chữ nhật, thoi...)',
          'Dạng 3. Bài toán cực trị (Max - Min) hình học Oxy liên quan đến đường thẳng, đường tròn, Conic',
        ],
      },
    ],
  },
  {
    name: 'CHƯƠNG VIII. ĐẠI SỐ TỔ HỢP.',
    lessons: [
      {
        name: 'Bài 1. Quy Tắc Đếm (Bài 23 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Bài toán sử dụng quy tắc cộng, quy tắc nhân, sơ đồ hình cây',
          'Dạng 2. Bài toán đếm số tự nhiên thỏa mãn điều kiện cho trước',
          'Dạng 3. Toán thực tế kết hợp quy tắc cộng và quy tắc nhân',
        ],
      },
      {
        name: 'Bài 2. Hoán Vị, Chỉnh Hợp Và Tổ Hợp (Bài 24 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Rút gọn biểu thức, giải PT - BPT chứa hoán vị, chỉnh hợp, tổ hợp',
          'Dạng 2. Bài toán đếm sử dụng Hoán vị (xếp hàng dọc, bàn tròn, lập số...)',
          'Dạng 3. Bài toán đếm sử dụng Chỉnh hợp',
          'Dạng 4. Bài toán đếm sử dụng Tổ hợp (chọn người, chọn vật, đếm hình học...)',
          'Dạng 5. Toán thực tế tổng hợp về hoán vị, chỉnh hợp và tổ hợp',
        ],
      },
      {
        name: 'Bài 3. Nhị Thức Newton (Bài 25 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Khai triển nhị thức Newton (a + b)^n với n = 4, n = 5',
          'Dạng 2. Tìm hệ số, số hạng cụ thể trong khai triển nhị thức Newton',
          'Dạng 3. Tính tổng hoặc chứng minh đẳng thức tổ hợp nhờ nhị thức Newton',
          'Dạng 4. Toán thực tế ứng dụng nhị thức Newton',
        ],
      },
      {
        name: 'Mở rộng',
        forms: [
          'Dạng 1. Bài toán đếm nâng cao (phần bù, nguyên lý bù trừ, vách ngăn, hoán vị lặp...)',
          'Dạng 2. Khai triển nhị thức Newton với số mũ n lớn hoặc khai triển đa thức (a + b + c)^n',
        ],
      },
    ],
  },
  {
    name: 'CHƯƠNG IX. TÍNH XÁC SUẤT THEO ĐỊNH NGHĨA CỔ ĐIỂN.',
    lessons: [
      {
        name: 'Bài 1. Biến Cố Và Định Nghĩa Cổ Điển Của Xác Suất (Bài 26 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Mô tả không gian mẫu, biến cố, biến cố đối',
          'Dạng 2. Tính xác suất bằng phương pháp liệt kê hoặc sơ đồ hình cây',
          'Dạng 3. Toán thực tế cơ bản về xác suất cổ điển',
        ],
      },
      {
        name: 'Bài 2. Thực Hành Tính Xác Suất Theo Định Nghĩa Cổ Điển (Bài 27 SGK)',
        forms: [
          'Dạng 1. Tính xác suất bằng quy tắc đếm, hoán vị, chỉnh hợp, tổ hợp',
          'Dạng 2. Tính xác suất bằng cách sử dụng biến cố đối',
          'Dạng 3. Bài toán xác suất liên quan đến lập số tự nhiên và hình học',
          'Dạng 4. Toán thực tế về tính xác suất (trò chơi, rút thẻ, chọn sản phẩm, y sinh...)',
        ],
      },
      {
        name: 'Mở rộng',
        forms: [
          'Dạng 1. Bài toán xác suất vận dụng cao (ghép nhiều giai đoạn, phân chia trường hợp phức tạp)',
          'Dạng 2. Bài toán tìm tham số n (số phần tử) khi biết trước xác suất của biến cố',
        ],
      },
    ],
  },
];
