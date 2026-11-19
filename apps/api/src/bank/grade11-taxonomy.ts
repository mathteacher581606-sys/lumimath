// Cây mục lục chuẩn lớp 11 (CHƯƠNG → Bài → Dạng) — đầy đủ 9 chương theo danh mục giáo viên cung cấp.

export type TaxonomyLesson = { name: string; forms: string[] };
export type TaxonomyChapter = { name: string; lessons: TaxonomyLesson[] };

export const GRADE11_TAXONOMY: TaxonomyChapter[] = [
  {
    name: 'CHƯƠNG I. HÀM SỐ LƯỢNG GIÁC. PHƯƠNG TRÌNH LƯỢNG GIÁC',
    lessons: [
      {
        name: 'Bài 1. Giá Trị Lượng Giác Của Góc Lượng Giác',
        forms: [
          'Dạng 1. Lý thuyết Góc lượng giác, hệ thức Chasles & VTLG',
          'Dạng 2. Đơn vị đo góc & Độ dài cung tròn',
          'Dạng 3. Giá trị lượng giác & Đẳng thức liên hệ giữa chúng',
          'Dạng 4. Toán thực tế về Giá trị lượng giác của góc lượng giác',
        ],
      },
      {
        name: 'Bài 2. Công Thức Lượng Giác',
        forms: [
          'Dạng 1. Lý thuyết Công thức lượng giác',
          'Dạng 2. Công thức cộng lượng giác',
          'Dạng 3. Công thức nhân góc, hạ bậc',
          'Dạng 4. Công thức liên hệ tổng và tích lượng giác',
          'Dạng 5. Kết hợp nhiều công thức lượng giác',
          'Dạng 6. Toán thực tế về Công thức lượng giác',
        ],
      },
      {
        name: 'Bài 3. Hàm Số Lượng Giác',
        forms: [
          'Dạng 1. Tập xác định hàm số lượng giác',
          'Dạng 2. Xét tính chẵn lẻ, tính đơn điệu, tính tuần hoàn HSLG',
          'Dạng 3. Tập giá trị & Max min hàm số lượng giác',
          'Dạng 4. Đồ thị hàm số lượng giác & Ứng dụng',
          'Dạng 5. Toán thực tế về Hàm số lượng giác',
        ],
      },
      {
        name: 'Bài 4. Phương Trình Lượng Giác',
        forms: [
          'Dạng 1. Các phương trình lượng giác cơ bản',
          'Dạng 2. Toán thực tế về Phương trình lượng giác cơ bản',
          'Dạng 3. Phương trình lượng giác đưa về dạng tích hoặc đặt ẩn phụ',
          'Dạng 4. Phương trình bậc nhất đối với sinx và cosx (a.sinx + b.cosx = c)',
        ],
      },
      {
        name: 'Mở rộng',
        forms: [
          'Dạng 1. Cực trị (Max - Min) hàm số lượng giác nâng cao & Chứa tham số m',
          'Dạng 2. Biện luận số nghiệm của phương trình lượng giác trên khoảng, đoạn (chứa tham số m)',
          'Dạng 3. Phương trình lượng giác chứa căn thức, giá trị tuyệt đối, đối xứng, đẳng cấp',
        ],
      },
    ],
  },
  {
    name: 'CHƯƠNG II. DÃY SỐ. CẤP SỐ CỘNG & CẤP SỐ NHÂN',
    lessons: [
      {
        name: 'Bài 1. DÃY SỐ',
        forms: [
          'Dạng 1. Lý thuyết dãy số & Xác định một dãy số',
          'Dạng 2. Số hạng tổng quát, số hạng bất kì của dãy số',
          'Dạng 3. Dãy số tăng, giảm',
          'Dạng 4. Dãy số bị chặn, chặn trên, chặn dưới',
          'Dạng 5. Khai thác tổng hợp tính chất dãy số',
          'Dạng 6. Ứng dụng & Toán thực tế về Dãy số',
        ],
      },
      {
        name: 'Bài 2. CẤP SỐ CỘNG',
        forms: [
          'Dạng 1. Lý thuyết & Xác định một cấp số cộng',
          'Dạng 2. Công sai, số hạng, SHTQ của một CSC',
          'Dạng 3. Liên hệ các số hạng trong CSC & Ứng dụng',
          'Dạng 4. Tổng n số hạng đầu của CSC & Ứng dụng',
          'Dạng 5. Tổng hợp các tính chất cấp số cộng',
          'Dạng 6. Ứng dụng & Toán thực tế về CSC',
        ],
      },
      {
        name: 'Bài 3. CẤP SỐ NHÂN',
        forms: [
          'Dạng 1. Lý thuyết & Xác định một cấp số nhân',
          'Dạng 2. Công bội, số hạng, SHTQ của một CSN',
          'Dạng 3. Liên hệ các số hạng trong CSN & Ứng dụng',
          'Dạng 4. Tổng n số hạng đầu của CSN & Ứng dụng',
          'Dạng 5. Tổng hợp các tính chất cấp số nhân',
          'Dạng 6. Ứng dụng & Toán thực tế về CSN',
        ],
      },
      {
        name: 'Mở rộng',
        forms: [
          'Dạng 1. Tìm số hạng tổng quát của dãy số cho bởi hệ thức truy hồi',
          'Dạng 2. Bài toán kết hợp cả Cấp số cộng và Cấp số nhân',
          'Dạng 3. Bài toán dãy số, cấp số cộng, cấp số nhân chứa tham số m',
        ],
      },
    ],
  },
  {
    name: 'CHƯƠNG III. CÁC SỐ ĐẶC TRƯNG ĐO XU THẾ TRUNG TÂM CỦA MẪU SỐ LIỆU GHÉP NHÓM',
    lessons: [
      {
        name: 'Bài 1: Mẫu số liệu ghép nhóm',
        forms: [
          'Dạng 1: Lý thuyết về đọc dữ liệu bảng, biểu đồ ghép nhóm',
          'Dạng 2: Lập bảng tần số ghép nhóm từ mẫu số liệu không ghép nhóm & Hiệu chỉnh nhóm',
          'Dạng 3: Toán thực tế về mẫu số liệu ghép nhóm',
        ],
      },
      {
        name: 'Bài 2. Số đặc trưng xu hướng cho mẫu số liệu ghép nhóm',
        forms: [
          'Dạng 1: Lý thuyết về số đặc trưng đo xu thế trung tâm của MSL ghép nhóm',
          'Dạng 2: Số trung bình của MSL ghép nhóm',
          'Dạng 3: Số trung vị của MSL ghép nhóm',
          'Dạng 4: Tứ phân vị của MSL ghép nhóm',
          'Dạng 5: Số mốt của MSL ghép nhóm',
          'Dạng 6: Bài toán tổng hợp',
          'Dạng 7: Toán thực tế về các số đặc trưng đo xu thế trung tâm của MSL ghép nhóm',
        ],
      },
      {
        name: 'Mở rộng',
        forms: [
          'Dạng 1: Tìm tần số hoặc tham số chưa biết trong bảng ghép nhóm khi biết số đặc trưng',
        ],
      },
    ],
  },
  {
    name: 'CHƯƠNG IV. QUAN HỆ SONG SONG TRONG KHÔNG GIAN.',
    lessons: [
      {
        name: 'Bài 1. Đường Thẳng Và Mặt Phẳng Trong Không Gian (Bài 10 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Các tính chất thừa nhận của hình học không gian',
          'Dạng 2. Tìm giao tuyến của hai mặt phẳng',
          'Dạng 3. Tìm giao điểm của đường thẳng và mặt phẳng',
          'Dạng 4. Chứng minh ba điểm thẳng hàng, ba đường thẳng đồng quy, điểm thuộc mặt phẳng cố định',
          'Dạng 5. Thiết diện của hình chóp cắt bởi mặt phẳng',
          'Dạng 6. Toán thực tế về đường thẳng và mặt phẳng trong không gian',
        ],
      },
      {
        name: 'Bài 2. Hai Đường Thẳng Song Song (Bài 11 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Vị trí tương đối của hai đường thẳng trong không gian',
          'Dạng 2. Chứng minh hai đường thẳng song song',
          'Dạng 3. Tìm giao tuyến của hai mặt phẳng bằng phương pháp song song & Thiết diện',
          'Dạng 4. Toán thực tế về hai đường thẳng song song',
        ],
      },
      {
        name: 'Bài 3. Đường Thẳng Và Mặt Phẳng Song Song (Bài 12 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Vị trí tương đối của đường thẳng và mặt phẳng',
          'Dạng 2. Chứng minh đường thẳng song song với mặt phẳng',
          'Dạng 3. Tìm giao tuyến của hai mặt phẳng & Thiết diện có yếu tố đường thẳng song song mặt phẳng',
          'Dạng 4. Toán thực tế về đường thẳng và mặt phẳng song song',
        ],
      },
      {
        name: 'Bài 4. Hai Mặt Phẳng Song Song (Bài 13 SGK)',
        forms: [
          'Dạng 1. Lý thuyết về hai mặt phẳng song song, định lý Thalès, hình lăng trụ và hình hộp',
          'Dạng 2. Chứng minh hai mặt phẳng song song & Chứng minh đường thẳng song song mặt phẳng',
          'Dạng 3. Định lý Thalès trong không gian & Tỉ số đoạn thẳng',
          'Dạng 4. Thiết diện của hình chóp, hình lăng trụ cắt bởi mặt phẳng song song',
          'Dạng 5. Toán thực tế về hai mặt phẳng song song, hình lăng trụ, hình hộp',
        ],
      },
      {
        name: 'Bài 5. Phép Chiếu Song Song (Bài 14 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Tính chất của phép chiếu song song',
          'Dạng 2. Xác định ảnh của điểm, đoạn thẳng, hình phẳng qua phép chiếu song song & Tỉ số',
          'Dạng 3. Biểu diễn hình học không gian trên mặt phẳng',
          'Dạng 4. Toán thực tế về phép chiếu song song (bóng nắng, bản vẽ kỹ thuật...)',
        ],
      },
      {
        name: 'Mở rộng',
        forms: [
          'Dạng 1. Tính diện tích thiết diện và tỉ số diện tích thiết diện',
          'Dạng 2. Bài toán quỹ tích (tập hợp điểm) và cực trị trong quan hệ song song',
          'Dạng 3. Bài toán xác định vị trí điểm (tham số k) để thỏa mãn điều kiện song song, thiết diện',
        ],
      },
    ],
  },
  {
    name: 'CHƯƠNG V. GIỚI HẠN. HÀM SỐ LIÊN TỤC.',
    lessons: [
      {
        name: 'Bài 1. Giới Hạn Của Dãy Số (Bài 15 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Các tính chất cơ bản về giới hạn của dãy số',
          'Dạng 2. Giới hạn dãy số dạng phân thức hữu tỉ (đa thức chia đa thức)',
          'Dạng 3. Giới hạn dãy số chứa căn thức (nhân lượng liên hợp)',
          'Dạng 4. Giới hạn dãy số chứa lũy thừa, mũ (q^n)',
          'Dạng 5. Tổng của cấp số nhân lùi vô hạn',
          'Dạng 6. Toán thực tế về giới hạn dãy số và cấp số nhân lùi vô hạn (bông tuyết Koch, hình học lặp...)',
        ],
      },
      {
        name: 'Bài 2. Giới Hạn Của Hàm Số (Bài 16 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Tính chất giới hạn hữu hạn, giới hạn một bên, giới hạn tại vô cực',
          'Dạng 2. Giới hạn hàm số xác định (thay số trực tiếp) và giới hạn một bên',
          'Dạng 3. Giới hạn hàm số dạng vô định 0/0 (phân tích nhân tử, nhân liên hợp)',
          'Dạng 4. Giới hạn hàm số tại vô cực & Dạng vô định (∞/∞, ∞ - ∞, 0.∞)',
          'Dạng 5. Toán thực tế về giới hạn của hàm số',
        ],
      },
      {
        name: 'Bài 3. Hàm Số Liên Tục (Bài 17 SGK)',
        forms: [
          'Dạng 1. Lý thuyết về hàm số liên tục tại một điểm, trên một khoảng/đoạn',
          'Dạng 2. Xét tính liên tục của hàm số tại một điểm và trên tập xác định',
          'Dạng 3. Tìm tham số m để hàm số liên tục tại một điểm hoặc trên R',
          'Dạng 4. Ứng dụng tính liên tục chứng minh phương trình có nghiệm',
          'Dạng 5. Toán thực tế về hàm số liên tục',
        ],
      },
      {
        name: 'Mở rộng',
        forms: [
          'Dạng 1. Giới hạn của dãy số cho bởi công thức truy hồi hoặc tổng dãy số rút gọn',
          'Dạng 2. Giới hạn hàm số chứa căn bậc cao (lệch bậc, thêm bớt hạng tử)',
          'Dạng 3. Bài toán giới hạn dãy số, giới hạn hàm số chứa tham số a, b, m',
        ],
      },
    ],
  },
  {
    name: 'CHƯƠNG VI. HÀM SỐ MŨ VÀ HÀM SỐ LÔGARIT.',
    lessons: [
      {
        name: 'Bài 1. Lũy Thừa Với Số Mũ Thực (Bài 18 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Điều kiện xác định của lũy thừa, căn bậc n',
          'Dạng 2. Tính giá trị và rút gọn biểu thức lũy thừa, căn thức',
          'Dạng 3. So sánh các lũy thừa',
          'Dạng 4. Toán thực tế về lũy thừa (lãi kép, tăng trưởng dân số, phóng xạ...)',
        ],
      },
      {
        name: 'Bài 2. Lôgarit (Bài 19 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Điều kiện xác định của biểu thức lôgarit',
          'Dạng 2. Tính giá trị, rút gọn biểu thức lôgarit (quy tắc tính, đổi cơ số)',
          'Dạng 3. Biểu diễn lôgarit này theo một hoặc nhiều lôgarit cho trước',
          'Dạng 4. Toán thực tế về lôgarit (độ pH, độ to âm thanh Bel/dB, độ Richter...)',
        ],
      },
      {
        name: 'Bài 3. Hàm Số Mũ Và Hàm Số Lôgarit (Bài 20 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Tìm tập xác định, tập giá trị của hàm số mũ và hàm số lôgarit',
          'Dạng 2. Sự biến thiên (tính đơn điệu) và cực trị (Max - Min) của hàm số mũ, lôgarit',
          'Dạng 3. Nhận diện, đọc và khai thác đồ thị hàm số mũ, hàm số lôgarit',
          'Dạng 4. Toán thực tế về hàm số mũ và hàm số lôgarit',
        ],
      },
      {
        name: 'Bài 4. Phương Trình, Bất Phương Trình Mũ Và Lôgarit (Bài 21 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Phương trình mũ cơ bản, đưa về cùng cơ số, lôgarit hóa',
          'Dạng 2. Phương trình lôgarit cơ bản, đưa về cùng cơ số, mũ hóa',
          'Dạng 3. Bất phương trình mũ cơ bản và biến đổi đưa về cơ bản',
          'Dạng 4. Bất phương trình lôgarit cơ bản và biến đổi đưa về cơ bản',
          'Dạng 5. Toán thực tế về phương trình, bất phương trình mũ và lôgarit',
        ],
      },
      {
        name: 'Mở rộng',
        forms: [
          'Dạng 1. Tìm tham số m để hàm số mũ, lôgarit xác định trên R hoặc trên miền K',
          'Dạng 2. Phương trình, bất phương trình mũ và lôgarit giải bằng đặt ẩn phụ, hàm đặc trưng, đánh giá',
          'Dạng 3. Bài toán phương trình, bất phương trình mũ và lôgarit chứa tham số m',
          'Dạng 4. Bài toán tìm nghiệm nguyên (x, y) của bất phương trình mũ và lôgarit',
        ],
      },
    ],
  },
  {
    name: 'CHƯƠNG VII. QUAN HỆ VUÔNG GÓC TRONG KHÔNG GIAN.',
    lessons: [
      {
        name: 'Bài 1. Hai Đường Thẳng Vuông Góc (Bài 22 SGK)',
        forms: [
          'Dạng 1. Lý thuyết về góc giữa hai đường thẳng & Hai đường thẳng vuông góc',
          'Dạng 2. Xác định và tính góc giữa hai đường thẳng trong không gian',
          'Dạng 3. Chứng minh hai đường thẳng vuông góc',
          'Dạng 4. Toán thực tế về góc và hai đường thẳng vuông góc',
        ],
      },
      {
        name: 'Bài 2. Đường Thẳng Vuông Góc Với Mặt Phẳng (Bài 23 SGK)',
        forms: [
          'Dạng 1. Lý thuyết về đường thẳng vuông góc với mặt phẳng',
          'Dạng 2. Chứng minh đường thẳng vuông góc với mặt phẳng & Chứng minh hai đường thẳng vuông góc',
          'Dạng 3. Thiết diện của hình chóp, lăng trụ cắt bởi mặt phẳng vuông góc với đường thẳng',
          'Dạng 4. Toán thực tế về đường thẳng vuông góc với mặt phẳng',
        ],
      },
      {
        name: 'Bài 3. Phép Chiếu Vuông Góc. Góc Giữa Đường Thẳng Và Mặt Phẳng (Bài 24 SGK)',
        forms: [
          'Dạng 1. Lý thuyết về phép chiếu vuông góc, định lý ba đường vuông góc, góc giữa đường và mặt',
          'Dạng 2. Xác định hình chiếu vuông góc và tính góc giữa đường thẳng và mặt phẳng',
          'Dạng 3. Công thức diện tích hình chiếu của một đa giác',
          'Dạng 4. Toán thực tế về góc giữa đường thẳng và mặt phẳng',
        ],
      },
      {
        name: 'Bài 4. Hai Mặt Phẳng Vuông Góc (Bài 25 SGK)',
        forms: [
          'Dạng 1. Lý thuyết về góc giữa hai mặt phẳng, góc nhị diện & Hai mặt phẳng vuông góc',
          'Dạng 2. Xác định và tính số đo góc nhị diện, góc giữa hai mặt phẳng',
          'Dạng 3. Chứng minh hai mặt phẳng vuông góc',
          'Dạng 4. Tính chất và bài toán về hình lăng trụ đứng, đều, hình hộp chữ nhật, hình lập phương, chóp đều, chóp cụt đều',
          'Dạng 5. Toán thực tế về góc nhị diện và hai mặt phẳng vuông góc',
        ],
      },
      {
        name: 'Bài 5. Khoảng Cách (Bài 26 SGK)',
        forms: [
          'Dạng 1. Lý thuyết về các loại khoảng cách trong không gian',
          'Dạng 2. Khoảng cách từ một điểm đến một đường thẳng, giữa hai đường thẳng song song',
          'Dạng 3. Khoảng cách từ một điểm đến một mặt phẳng, từ đường thẳng đến mặt phẳng song song, giữa hai mặt phẳng song song',
          'Dạng 4. Đường vuông góc chung và khoảng cách giữa hai đường thẳng chéo nhau',
          'Dạng 5. Toán thực tế về khoảng cách trong không gian',
        ],
      },
      {
        name: 'Bài 6. Thể Tích (Bài 27 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Công thức tính thể tích khối chóp, khối chóp cụt đều, khối lăng trụ, khối hộp',
          'Dạng 2. Tính thể tích khối chóp (có cạnh bên vuông góc đáy, mặt bên vuông góc đáy, chóp đều...)',
          'Dạng 3. Tính thể tích khối chóp cụt đều',
          'Dạng 4. Tính thể tích khối lăng trụ đứng, lăng trụ đều, hình hộp và lăng trụ xiên',
          'Dạng 5. Tỉ số thể tích (công thức Simson) và phương pháp phân chia, lắp ghép khối đa diện',
          'Dạng 6. Toán thực tế về thể tích các khối đa diện',
        ],
      },
      {
        name: 'Mở rộng',
        forms: [
          'Dạng 1. Bài toán kết hợp góc và khoảng cách nâng cao trong không gian',
          'Dạng 2. Tính thể tích khối đa diện khi biết góc và khoảng cách phức tạp',
          'Dạng 3. Bài toán cực trị (Max - Min) về góc, khoảng cách, diện tích thiết diện và thể tích',
        ],
      },
    ],
  },
  {
    name: 'CHƯƠNG VIII. CÁC QUY TẮC TÍNH XÁC SUẤT.',
    lessons: [
      {
        name: 'Bài 1. Biến Cố Hợp, Biến Cố Giao, Biến Cố Độc Lập (Bài 28 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Xác định biến cố hợp, biến cố giao, biến cố xung khắc, biến cố độc lập',
          'Dạng 2. Mô tả và đếm số phần tử của biến cố hợp, biến cố giao',
          'Dạng 3. Toán thực tế về biến cố hợp, biến cố giao và biến cố độc lập',
        ],
      },
      {
        name: 'Bài 2. Công Thức Cộng Xác Suất (Bài 29 SGK)',
        forms: [
          'Dạng 1. Lý thuyết về công thức cộng xác suất',
          'Dạng 2. Tính xác suất của hai biến cố xung khắc',
          'Dạng 3. Tính xác suất bằng công thức cộng tổng quát P(A ∪ B) = P(A) + P(B) - P(AB)',
          'Dạng 4. Toán thực tế vận dụng công thức cộng xác suất (biểu đồ Ven, bảng thống kê...)',
        ],
      },
      {
        name: 'Bài 3. Công Thức Nhân Xác Suất Cho Hai Biến Cố Độc Lập (Bài 30 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Kiểm tra tính độc lập của hai biến cố bằng xác suất',
          'Dạng 2. Tính xác suất bằng công thức nhân cho các biến cố độc lập',
          'Dạng 3. Kết hợp công thức cộng, công thức nhân, sơ đồ hình cây và biến cố đối',
          'Dạng 4. Toán thực tế vận dụng công thức nhân xác suất (bắn súng, y tế, hệ thống mạch điện...)',
        ],
      },
      {
        name: 'Mở rộng',
        forms: [
          'Dạng 1. Bài toán xác suất kết hợp nhiều quy tắc đếm và nhiều giai đoạn độc lập',
          'Dạng 2. Bài toán tìm tham số n hoặc xác suất thành phần p chưa biết',
        ],
      },
    ],
  },
  {
    name: 'CHƯƠNG IX. ĐẠO HÀM.',
    lessons: [
      {
        name: 'Bài 1. Định Nghĩa Và Ý Nghĩa Của Đạo Hàm (Bài 31 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Tính đạo hàm tại một điểm bằng định nghĩa (giới hạn)',
          'Dạng 2. Ý nghĩa hình học của đạo hàm: Hệ số góc và phương trình tiếp tuyến của đồ thị hàm số',
          'Dạng 3. Ý nghĩa vật lý của đạo hàm: Vận tốc tức thời, cường độ dòng điện tức thời...',
          'Dạng 4. Toán thực tế về định nghĩa và ý nghĩa của đạo hàm',
        ],
      },
      {
        name: 'Bài 2. Các Quy Tắc Tính Đạo Hàm (Bài 32 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Công thức đạo hàm của các hàm số sơ cấp cơ bản',
          'Dạng 2. Quy tắc tính đạo hàm của tổng, hiệu, tích, thương',
          'Dạng 3. Đạo hàm của hàm số hợp (đa thức, phân thức, căn thức, lượng giác, mũ, lôgarit)',
          'Dạng 4. Giải phương trình, bất phương trình, chứng minh đẳng thức chứa đạo hàm',
          'Dạng 5. Toán thực tế vận dụng các quy tắc tính đạo hàm (tốc độ thay đổi của một đại lượng)',
        ],
      },
      {
        name: 'Bài 3. Đạo Hàm Cấp Hai (Bài 33 SGK)',
        forms: [
          'Dạng 1. Lý thuyết & Tính đạo hàm cấp hai của hàm số',
          'Dạng 2. Giải phương trình, bất phương trình và chứng minh hệ thức chứa y, y\', y\'\'',
          'Dạng 3. Ý nghĩa cơ học của đạo hàm cấp hai (gia tốc tức thời của chuyển động)',
          'Dạng 4. Toán thực tế về đạo hàm cấp hai',
        ],
      },
      {
        name: 'Mở rộng',
        forms: [
          'Dạng 1. Viết phương trình tiếp tuyến đi qua một điểm hoặc biết hệ số góc nâng cao (chứa tham số m)',
          'Dạng 2. Tìm công thức đạo hàm cấp cao',
          'Dạng 3. Tìm tham số a, b để hàm số có đạo hàm (khả vi) tại một điểm',
        ],
      },
    ],
  },
];
