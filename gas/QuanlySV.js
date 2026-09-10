// ============================================================================
// Quanlysv.gs — Dispatcher chính (doGet/doPost) của Web App + hằng số Spreadsheet chính.
// ĐÃ TÁCH (2026-09-10, 2 đợt):
//   Đợt 1: các helper theo miền nghiệp vụ (session/auth, dữ liệu tuyển sinh, ký điện tử,
//   tiện ích chung) đã chuyển sang Auth.gs/TuyenSinh.gs/KySo.gs/TienIch.gs.
//   Đợt 2 (đợt này): thân của TỪNG ACTION bên trong doGet (switch) và doPost (chuỗi if)
//   đã được tách thành các hàm riêng có tên (tiền tố hdGet_/hdPost_ + đúng tên action),
//   đặt vào ĐÚNG file theo miền nghiệp vụ của action đó (kể cả DinhDanh.gs đã có sẵn) —
//   doGet/doPost giờ CHỈ còn là dispatcher mỏng: so khớp action rồi gọi đúng 1 hàm.
// LƯU Ý: Apps Script gộp TẤT CẢ file .gs trong project vào CHUNG 1 phạm vi thực thi khi
// chạy, nên việc tách file này thuần tuý là tổ chức lại cho gọn, KHÔNG làm thay đổi bất kỳ
// hành vi/logic nào — đã tự kiểm chứng bằng cách rebuild lại đúng nguyên văn file gốc từ
// các mảnh đã tách (khớp 100%, xem log chi tiết trong plan). Muốn tìm thân xử lý 1 action
// cụ thể: tìm tên hàm hdGet_<action>/hdPost_<action> trong Auth.gs/TuyenSinh.gs/KySo.gs/
// TienIch.gs/DinhDanh.gs — GET hay POST thì xem đúng đoạn dispatcher bên dưới sẽ rõ.
// ============================================================================

// Thay bằng ID file Google Sheets "quanlysv" thực tế của ông
const SPREADSHEET_ID = "10cOj-d63aumv-fyjmo6AATWsk-v8y5P5c5wNvEIgyO4";

// ===============================================
// HÀM XỬ LÝ REQUEST GET (Lấy dữ liệu)
// ===============================================
function doGet(e) {
  if (!e || !e.parameter || !e.parameter.action) {
    return responseJSON(400, "Thiếu tham số action. Tuy nhiên Web App vẫn đang chạy bình thường!", null);
  }
  
  const action = e.parameter.action;
  
  try {
    switch(action) {
      // ==========================================================
      // TRANG "THU HỒ SƠ NHẬP HỌC" — ĐỌC/GHI THẲNG SHEET TRUNG GIAN (không còn
      // dùng sheet "SinhVien" nữa — sheet đó cùng action 'getStudents' cũ đã bị xoá
      // hẳn khỏi code, đã xác nhận không còn nơi nào gọi tới) để dữ liệu luôn đồng nhất với Xét tuyển/Thẩm định,
      // và không cần bước "nối" 2 sheet lại với nhau nữa. Chỉ lấy đúng hồ sơ do trang này
      // tạo ra, nhờ cột KÊNH NỘP = "Thu hồ sơ trực tiếp" (xem hằng số ADMISSIONS_* và các
      // hàm dùng chung ngay phía trên hàm doPost bên dưới).
      // ==========================================================
      case 'getAdmissionsData': return hdGet_getAdmissionsData(e);

      // Trả về đúng danh sách cột dùng cho modal/file mẫu "Thêm hồ sơ" — KHÔNG phải
      // toàn bộ header thật của Trung Gian (sheet đó còn nhiều cột hệ thống khác như
      // TIME/NGÀY CẬP NHẬT/TÀI KHOẢN NHẬP LIỆU/KÊNH NỘP không cần người dùng điền tay).
      // Khai báo TẠI 1 NƠI DUY NHẤT (ADMISSIONS_DATA_FIELDS/ADMISSIONS_CHECK_FIELDS) để
      // modal thêm hồ sơ, file mẫu Excel, và action nhập Excel luôn khớp nhau tuyệt đối.
      case 'getAdmissionsHeaders': return hdGet_getAdmissionsHeaders(e);

      // ĐÃ THÊM (rà soát đồng bộ file mẫu 2 trang): trả về đúng danh sách cột file mẫu
      // Excel bên trang Xét tuyển — CHUYỂN từ mảng hardcode trong XetTuyenPage.jsx
      // (hàm handleDownloadTemplate cũ) sang đây làm NGUỒN DUY NHẤT, cùng triết lý với
      // getAdmissionsHeaders ở trên, để sau này thêm/sửa/xoá cột chỉ cần sửa 1 chỗ
      // (XETTUYEN_TEMPLATE_HEADERS) thay vì phải nhớ sửa cả GAS lẫn JSX. LƯU Ý: mảng
      // này CHỈ dùng để hiển thị cột trong file mẫu — action 'importStudents' đọc file
      // Excel theo alias độc lập (hàm getField trong executeImport), không phụ thuộc
      // mảng này, nên đổi ở đây không ảnh hưởng logic đọc/parse file đã nhập.
      case 'getXetTuyenHeaders': return hdGet_getXetTuyenHeaders(e);

      // Danh sách các khoản đã nộp của 1 hồ sơ — dùng cho khối "Nộp tiền" bên phải trang Thu hồ sơ.
      case 'getPayments': return hdGet_getPayments(e);

      // ĐÃ THÊM (Pha 3 roadmap): trả TOÀN BỘ hồ sơ trong sheet TrungGian cho trang
      // Thẩm định — khác với 'searchOldRecord' (chỉ tìm theo từ khoá). Giữ nguyên
      // format trả về y hệt CheckID.gs cũ (key = tên cột gốc trên Sheet, viết hoa,
      // Date object tự format dd/mm/yyyy, CCCD tự bỏ dấu nháy đơn) để phía React tái
      // dùng đúng logic tính toán (getVal/generateMaSV/getBestScoreText...) đã có
      // sẵn từ bản vanilla JS cũ, không phải viết lại từ đầu.
      case 'getThamDinhData': return hdGet_getThamDinhData(e);

      case 'getConfig': return hdGet_getConfig(e);
      // ĐÃ THÊM (Công nhận KQHT & chuyển đổi tín chỉ — Nguồn 2 "miễn theo văn bằng cũ",
      // 2026-09-09 — KHÔNG liên quan Ký điện tử Pha 2): đọc 3 bảng học phần miễn CỐ ĐỊNH
      // (Điều 6 Quyết định 007a/2025/QĐ-PXU-NBS) từ 1 tab MỚI "MienTheoVanBangCu" trong
      // CÙNG spreadsheet khung CTĐT (SHEET_CTDT_ID, đã dùng ở action 'compareCurriculum') —
      // gộp chung chỗ vì cùng bản chất "dữ liệu tham chiếu chương trình đào tạo", không tách
      // spreadsheet riêng. Đọc GENERIC theo tên header (giống getThamDinhData) để admin tự
      // sửa/thêm dòng trong Sheet mà KHÔNG cần sửa code — đúng lựa chọn đã chốt với người
      // dùng (thay vì viết cứng 3 danh sách trong code). Trả về mảng PHẲNG, để phía frontend
      // tự lọc theo LOẠI VĂN BẰNG (giống cách 'config.Nganh' vẫn trả mảng phẳng rồi lọc sau).
      case 'layDanhSachMienVanBangCu': return hdGet_layDanhSachMienVanBangCu(e);
      // ĐÃ THÊM (Công nhận KQHT & chuyển đổi tín chỉ — Nguồn 3 "miễn theo chứng chỉ",
      // 2026-09-10 — KHÔNG liên quan Ký điện tử Pha 2): đọc bảng tra cứu Điều 8-11 (Ngoại
      // ngữ/Tin học/LLCT) từ 1 tab MỚI "MienTheoChungChi" trong CÙNG spreadsheet khung CTĐT —
      // ĐÚNG tiền lệ đã chốt cho Nguồn 2 (Sheet cấu hình riêng, admin tự sửa không cần đụng
      // code). LƯU Ý: GDQP&AN KHÔNG nằm trong tab này — xử lý bằng quy tắc riêng gắn với tick
      // văn bằng cũ (Nguồn 2) + bảng điểm đã quét, xem tinhDongMienGDQP() phía frontend
      // (thamDinhHelpers.js) — không tra bảng tĩnh nào ở đây.
      case 'layDanhSachMienTheoChungChi': return hdGet_layDanhSachMienTheoChungChi(e);
      // ĐÃ THÊM: đọc chỉ tiêu tuyển sinh theo từng năm/ngành — dùng cho trang Cài đặt
      // (nhập chỉ tiêu) và sau này cho trang "Kho tra cứu sinh viên" (tính % đạt chỉ
      // tiêu). Sheet riêng "ChiTieuTuyenSinh" (không gộp vào CauHinh vì bản chất khác:
      // CauHinh là danh mục "hiện có gì" (không gắn năm), còn chỉ tiêu là số liệu GẮN
      // VỚI TỪNG NĂM, tích luỹ qua nhiều năm chứ không thay thế nhau). Trả về TOÀN BỘ
      // các năm luôn (dữ liệu rất nhỏ, vài chục dòng/năm) — phía client tự lọc theo
      // năm đang chọn, giống đúng cách CauHinh đang làm.
      case 'getChiTieu': return hdGet_getChiTieu(e);
      // ==========================================================
      // ĐÃ THÊM: "KHO TRA CỨU SINH VIÊN" — CỔNG TÌM KIẾM/LỌC/PHÂN TRANG, gộp 3 nguồn
      // đã có sẵn (KHÔNG tạo sheet mới, KHÔNG copy dữ liệu ra chỗ khác — chỉ đọc rồi
      // ghép ngay lúc trả kết quả, tránh có 2 nơi lưu cùng 1 sự thật):
      //   1) Trung Gian (docTrunggianRaw) — MỌI hồ sơ, cả 2 kênh (Xét tuyển online +
      //      Thu hồ sơ trực tiếp) — đây là danh sách GỐC, đầy đủ nhất.
      //   2) Sheet "KETQUA" (KETQUA_SHEET_ID) — hồ sơ ĐÃ được Thẩm định bấm "Duyệt
      //      trúng tuyển" chính thức.
      //   3) Sheet Đào tạo (getSheets()[0] của CHÍNH spreadsheet KETQUA_SHEET_ID, xem
      //      action 'capNhatDaoTao' bên dưới) — hồ sơ ĐÃ được bàn giao cho Đào tạo/CTSV.
      // Khớp cả 3 theo cùng 1 khoá CĂN CƯỚC+NGÀNH (giống mọi chỗ chống trùng khác trong
      // hệ thống) — 1 hồ sơ có mặt ở càng nhiều nguồn thì càng ở giai đoạn sau trong
      // vòng đời (xem suyRaTrangThaiVongDoi_ bên dưới).
      // LỌC/TÌM/PHÂN TRANG NGAY TẠI ĐÂY (phía server) — KHÔNG trả nguyên cả kho về cho
      // trình duyệt rồi lọc như các trang cũ (ThamDinhPage...), vì kho này cộng dồn qua
      // nhiều năm nên sẽ ngày càng lớn dần, không dừng lại như 1 đợt tuyển sinh.
      // ==========================================================
      case 'timKiemKhoSinhVien': return hdGet_timKiemKhoSinhVien(e);
      // ĐÃ THÊM: "KHO TRA CỨU SINH VIÊN" — bảng thống kê tổng hợp (KPI + biểu đồ) đặt phía
      // trên bảng kết quả. CỐ Ý KHÔNG dùng chung 1 hàm gộp dữ liệu với action
      // 'timKiemKhoSinhVien' ở trên — viết vòng lặp riêng, độc lập, để sửa/kiểm tra hàm
      // này KHÔNG đụng gì tới action tìm kiếm đang chạy ổn định (chấp nhận lặp code 1 chút
      // đổi lấy an toàn). Vẫn dùng CHUNG cache kho_layDuLieuTho_() — nếu trang Kho tải cả
      // bảng lẫn thống kê gần nhau thì chỉ tốn đúng 1 lượt đọc Sheets thật sự cho cả 2.
      //
      // Chỉ lọc theo NĂM XÉT TUYỂN (không lọc theo ngành/khoá/từ khoá... như bảng kết quả)
      // vì đây là dashboard TỔNG QUAN, không phải kết quả của 1 lượt tìm kiếm cụ thể — gõ
      // vào ô tìm nhanh không nên làm KPI nhảy số theo. % so với chỉ tiêu CHỈ tính được khi
      // đã chọn đúng 1 năm cụ thể (cộng chỉ tiêu nhiều năm lại không có ý nghĩa — mỗi năm
      // đăng ký chỉ tiêu riêng với Bộ GDĐT, đã thống nhất lúc bàn cách làm chỉ tiêu).
      case 'layThongKeKho': return hdGet_layThongKeKho(e);
      // ĐÃ THÊM: trang chi tiết 1 hồ sơ (route con /quan-ly-ho-so-moi/ho-so/:cccd/:nganh) —
      // khác 2 action 'timKiemKhoSinhVien'/'layThongKeKho' ở trên, action này ĐỌC TRỰC TIẾP,
      // KHÔNG qua cache kho_layDuLieuTho_(): xem 1 hồ sơ cụ thể là hành động ít xảy ra hơn
      // nhiều so với tìm kiếm/lọc, và ưu tiên LUÔN LUÔN MỚI NHẤT (VD vừa duyệt xong bấm xem
      // ngay) hơn là tiết kiệm 1 lượt đọc Sheets.
      //
      // Trả về "toàn bộ trường" của cả 3 nguồn dưới dạng object {tên cột: giá trị} (hàm
      // kho_hangThanhKV_ ở dưới) THAY VÌ liệt kê cứng từng cột — sheet Trung Gian có thể có
      // thêm cột khác nhau tuỳ đợt/trường (địa chỉ, trường THPT, điểm thi, link giấy tờ...)
      // mà action này không cần biết trước tên — liệt kê cứng sẽ sớm bị thiếu trường mới.
      //
      // "timeline" 3 bước (Nộp hồ sơ -> Duyệt trúng tuyển -> Bàn giao Đào tạo) là LỊCH SỬ
      // THẬT DUY NHẤT hiện có đủ tin cậy để hiển thị (đã thống nhất: sheet NhatKy hiện chỉ
      // ghi nhật ký thao tác của người dùng, không có cột nào gắn được chắc chắn với 1 hồ sơ
      // cụ thể, nên KHÔNG dùng NhatKy ở đây để tránh hiển thị sai/thiếu).
      //
      // "maPhu" + "maSinhVien" ở đây chính là chỗ đặt sẵn cho việc kết nối Đào tạo/Khảo thí/
      // Tài chính sau này (đúng ý đã bàn: mã SV hệ thống tự sinh sẽ là mã dùng chung liên
      // thông) — FE sẽ vẽ thêm các khối "Chưa kết nối" cạnh phần này, action này chỉ cần trả
      // đúng 2 trường đó.
      case 'layChiTietHoSoKho': return hdGet_layChiTietHoSoKho(e);
      // ĐÃ THÊM (theo yêu cầu — tab "Điểm số" ở trang chi tiết hồ sơ): đọc điểm 1 sinh viên
      // từ file Google Sheets ĐÃ ĐƯỢC MIRROR từ hệ thống Đào tạo (xem gas/
      // MirrorBangDiemDaoTao.gs — file mirror chạy trigger RIÊNG dưới 1 tài khoản khác có
      // quyền view file nguồn, action này CHỈ ĐỌC file đã mirror, không đụng gì tới file
      // nguồn). Mỗi ngành có 1 sheet riêng bên file đã mirror (NGANH_CAU_HINH_DIEM bên
      // dưới) — HIỆN MỚI CẤU HÌNH THỬ đúng ngành "Quản trị kinh doanh" để test, các ngành
      // còn lại thêm dần vào bảng này khi có tên sheet thật (phải khớp CHÍNH XÁC tên tab,
      // kể cả dấu phẩy/khoảng trắng, vì mirror giữ nguyên tên sheet y hệt file nguồn).
      case 'layBangDiemDaoTao': return hdGet_layBangDiemDaoTao(e);
      case 'getLogs': return hdGet_getLogs(e);
      // ==========================================================
      // PHA 1·B roadmap ("Khóa định danh") — CỔNG 1 và CỔNG 3, xem DinhDanh.gs.
      // Chạy song song, chưa migrate gì, chưa có action nào khác gọi tới — tạm
      // giới hạn Admin vì đang là hạ tầng thử nghiệm, chưa nối vào UI.
      // ==========================================================
      case 'dinhDanhTraCuu': return hdGet_dinhDanhTraCuu(e);

      case 'dinhDanhLayMa': return hdGet_dinhDanhLayMa(e);

      // ==========================================================
      // PHA 1·D1 (bước 4) — "Hàng đợi xác nhận định danh", xem DinhDanh.gs.
      // ==========================================================
      // Danh sách đầy đủ (bảng so sánh) — Admin + ThamDinh (ĐÃ SỬA: trước chỉ Admin, theo
      // yêu cầu mở thêm quyền xử lý cho Ban thẩm định — vẫn lộ thông tin cá nhân nhiều hồ
      // sơ cùng lúc nên KHÔNG mở rộng thêm ngoài 2 role này).
      case 'dinhDanhDanhSachCanXacNhan': return hdGet_dinhDanhDanhSachCanXacNhan(e);

      // Đếm nhanh cho bong bóng thông báo ở các trang nhập liệu — CHỈ trả về số lượng hồ
      // sơ CHÍNH tài khoản đang gọi đã nhập/sửa đang chờ xác nhận, không lộ dữ liệu của
      // người khác, nên mở quyền rộng hơn cho các role thực sự tạo/sửa hồ sơ.
      case 'dinhDanhSoLuongCanXacNhanCuaToi': return hdGet_dinhDanhSoLuongCanXacNhanCuaToi(e);

      // ==========================================================
      // PHA 1·D2 — "Gộp 2 hồ sơ định danh đã tồn tại", xem DinhDanh.gs.
      // Admin + ThamDinh (ĐÃ SỬA: trước chỉ Admin) — tìm kiếm lộ dữ liệu định danh của
      // nhiều hồ sơ, và cả 2 action đều phục vụ trực tiếp cho thao tác gộp (thay đổi khoá
      // định danh), nên KHÔNG mở rộng thêm ngoài 2 role này.
      // ==========================================================
      case 'dinhDanhTimKiemHoSo': return hdGet_dinhDanhTimKiemHoSo(e);

      case 'dinhDanhXemTruocGop': return hdGet_dinhDanhXemTruocGop(e);

      // ĐÃ THÊM — "Gợi ý cặp nghi trùng" cho panel Gộp thủ công (xem _dinhDanhNhomNghiTrungHienCo_
      // trong DinhDanh.gs). Cùng quyền với 2 action gộp ở trên.
      case 'dinhDanhGoiYCapNghiTrung': return hdGet_dinhDanhGoiYCapNghiTrung(e);

      // ĐÃ THÊM — đếm nhanh số nhóm nghi trùng cho bong bóng thông báo ở các tài khoản
      // KHÔNG có quyền tự xử lý — cùng mức mở quyền như dinhDanhSoLuongCanXacNhanCuaToi.
      case 'dinhDanhSoLuongCapNghiTrung': return hdGet_dinhDanhSoLuongCapNghiTrung(e);

      // ĐÃ THÊM — KÝ ĐIỆN TỬ PHA 1 (Bước 2): lấy ảnh chữ ký cá nhân của CHÍNH người
      // đang đăng nhập (không nhận tham số email — luôn tự suy ra từ g.userInfo, tránh
      // 1 người xem/đoán được chữ ký của người khác). allowedRoles=[] vì đây là dữ liệu
      // cá nhân của bất kỳ tài khoản nào, không giới hạn theo vai trò.
      case 'layChuKyCuaToi': return hdGet_layChuKyCuaToi(e);

      // ĐÃ THÊM — KÝ ĐIỆN TỬ PHA 1 (Bước 3): đọc bảng cấu hình "chức danh ký" cho 1
      // loại tài liệu (mặc định GBTT) — dữ liệu để dựng bảng "Chọn người ký" khi
      // Thẩm định bấm "Xuất GBTT". Vai trò giới hạn ['ThamDinh','Admin'] vì đây là
      // hành động chuẩn bị xuất văn bản, không phải xem hồ sơ cá nhân của chính mình.
      case 'layCauHinhChucDanhKy': return hdGet_layCauHinhChucDanhKy(e);

      // ĐÃ THÊM (Ký điện tử Pha 1 — Bước 4): danh sách yêu cầu ký đang CHỜ đúng người
      // đang đăng nhập (BuocKy.TRANG_THAI = DEN_LUOT + email khớp) — dữ liệu cho trang
      // "Hồ sơ chờ ký". allowedRoles=[] vì việc ký thuộc về dữ liệu BuocKy (chức danh
      // gán theo email), không phải theo vai trò hệ thống.
      case 'layDanhSachChoToiKy': return hdGet_layDanhSachChoToiKy(e);

      // ĐÃ THÊM (Bước 4): đếm nhanh số hồ sơ đang chờ mình ký — cho badge trên menu.
      case 'laySoLuongChoToiKy': return hdGet_laySoLuongChoToiKy(e);

      // ĐÃ THÊM (Bước 4): xem trước nội dung 1 yêu cầu ký — trả PDF dạng BASE64 THẲNG
      // TRONG JSON (không ghi file preview công khai lên Drive) để không lộ bản Doc
      // đang ký dở qua link, đúng rủi ro đã lường ở kế hoạch mục 12. Nếu yêu cầu đã
      // HOAN_THANH thì trả thẳng link PDF cuối cùng (đã share công khai từ trước).
      case 'xemTruocYeuCauKy': return hdGet_xemTruocYeuCauKy(e);

      // ĐÃ THÊM (Ký điện tử Pha 2 — Bước 6, luồng PDF/pdf-lib): frontend POLL action này
      // sau khi kyYeuCau trả về {dangXuLy:true} — để biết trigger nền (xuLyKyPdfNen) đã xử
      // lý xong hay chưa. Trả về TRẠNG THÁI BƯỚC CỦA CHÍNH NGƯỜI GỌI (không phải trạng thái
      // tổng — đúng cơ chế phân quyền như mọi action Ký điện tử khác, dựa vào BuocKy.EMAIL):
      // "DANG_XU_LY" = còn đang chờ trigger; "DA_KY" = xong phần của người này (có thể vẫn
      // còn người khác chưa ký); "DEN_LUOT" = xử lý nền bị lỗi, ĐÃ tự trả về DEN_LUOT để bấm
      // "Ký" lại (xem catch trong xuLyKyPdfNen — kèm lý do lỗi trong ghiChu). hoanTat=true
      // kèm pdfUrl khi CẢ yêu cầu đã HOAN_THANH (không chỉ riêng bước của người gọi).
      case 'kiemTraTrangThaiKy': return hdGet_kiemTraTrangThaiKy(e);

      // ĐÃ THÊM (Ký điện tử Pha 1 — Bước 7): "Đã ký" / lịch sử — khác layDanhSachChoToiKy
      // (chỉ liệt kê bước ĐANG DEN_LUOT của mình) ở chỗ liệt kê MỌI yêu cầu người này có
      // liên quan (đã ký/đang chờ/sắp tới lượt bất kỳ bước nào, HOẶC là người tạo), bất
      // kể trạng thái — để người ký bước 1 vẫn xem/tải lại được văn bản sau khi người
      // cuối đã ký xong (yêu cầu đó không còn nằm trong "chờ ký" của họ nữa).
      case 'layLichSuKyCuaToi': return hdGet_layLichSuKyCuaToi(e);

      default: {
        return responseJSON(400, "Action GET không hợp lệ", null);
      }
    }
  } catch (error) {
    return responseJSON(500, "Lỗi Server: " + error.toString(), null);
  }
}

// Hàm Helper format JSON
function responseJSON(statusCode, message, data) {
  const response = {
    code: statusCode,
    message: message,
    data: data
  };
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===============================================
// HÀM XỬ LÝ REQUEST POST
// ===============================================
function doPost(e) {
  if (!e || !e.parameter || !e.parameter.action) {
    return responseJSON(400, "Thiếu tham số action", null);
  }
  
  try {
    const action = e.parameter.action;
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // ĐÃ XOÁ: các action cũ addStudent/deleteStudent/editStudent/toggleDocument/
    // toggleStatus (ghi trực tiếp sheet "SinhVien"/"GiayTo") — đã xác nhận không còn
    // frontend nào gọi tới (StudentTable.jsx/DocumentList.jsx giờ chỉ dùng các action
    // *Admission ghi thẳng Trung Gian, xem addAdmission/toggleAdmissionField phía dưới).

   // 7. LƯU CẤU HÌNH HỆ THỐNG VÀ GHI LỊCH SỬ
    if (action === 'saveConfig') return hdPost_saveConfig(e, ss);

    // ĐÃ THÊM: lưu chỉ tiêu tuyển sinh — CHỈ THAY THẾ các dòng của ĐÚNG 1 năm đang lưu
    // (params.nam), giữ nguyên mọi năm khác — khác với saveConfig phía trên (xoá sạch
    // ghi lại toàn sheet), vì chỉ tiêu tích luỹ qua nhiều năm chứ không phải 1 danh mục
    // hiện-có-gì-là-đủ như CauHinh.
    if (action === 'saveChiTieu') return hdPost_saveChiTieu(e, ss);

    // =====================================
    // ĐĂNG NHẬP TÀI KHOẢN NỘI BỘ (KHÔNG CÓ GMAIL)
    // ĐÃ SỬA (bug bảo mật nghiêm trọng): bản cũ so username với cột Email và
    // password với cột Role — vì Role chỉ có 4 giá trị cố định (Admin/TuyenSinh/
    // CanBo/Thamdinh) nên ai biết email 1 tài khoản là đăng nhập được ngay,
    // bỏ qua hoàn toàn xác thực. Giờ dùng CỘT D (MatKhauHash) riêng, lưu bản băm
    // SHA-256 chứ không lưu chữ thường — xem hàm taoHashMatKhau() cuối file để
    // tự tạo hash khi cấp tài khoản mới. Tài khoản đăng nhập Google để trống cột
    // này thì action 'login' sẽ luôn không khớp — không xung đột với luồng Google.
    // =====================================
    if (action === 'login') return hdPost_login(e, ss);

    // =====================================
    // 9. KIỂM TRA ĐĂNG NHẬP BẰNG GOOGLE TOKEN (PHÂN QUYỀN MỚI)
    // =====================================
    if (action === 'verifyToken') return hdPost_verifyToken(e, ss);

    // =====================================
    // 10. YÊU CẦU CẤP QUYỀN (GỬI VỀ GOOGLE CHAT)
    // =====================================
    if (action === 'requestAccess') return hdPost_requestAccess(e, ss);
// =====================================
    // 11. TÌM KIẾM HỒ SƠ CŨ (TỪ FILE TRUNG GIAN)
    // =====================================
    if (action === 'searchOldRecord') return hdPost_searchOldRecord(e, ss);

    // ĐÃ XOÁ: action cũ 'importStudentsAdmissions' (ghi trực tiếp sheet "SinhVien") —
    // đã xác nhận không còn frontend nào gọi tới, xem importAdmissions bên dưới.

    // =====================================
    // TRANG "THU HỒ SƠ NHẬP HỌC" — 6 ACTION, ĐỌC/GHI THẲNG SHEET TRUNG GIAN
    // (xem hằng số + hàm dùng chung ADMISSIONS_*/docTrunggianRaw()/generateMaSVTuChung()
    // ngay phía trên hàm doPost). ĐÃ THAY THẾ HOÀN TOÀN các action cũ addStudent/
    // editStudent/deleteStudent/toggleDocument/toggleStatus/importStudentsAdmissions
    // (ghi trực tiếp sheet "SinhVien"/"GiayTo") cho trang này — 5 action cũ đó cùng
    // sheet "SinhVien"/"GiayTo" đã được xác nhận không còn nơi nào gọi tới và đã xoá
    // hẳn khỏi code (xem lịch sử sửa đổi nếu cần đối chiếu lại).
    // =====================================

    // THÊM HỒ SƠ MỚI (modal "Thêm hồ sơ")
    if (action === 'addAdmission') return hdPost_addAdmission(e, ss);

    // SỬA HỒ SƠ (chỉ sửa hồ sơ thuộc đúng kênh "Thu hồ sơ trực tiếp")
    if (action === 'updateAdmission') return hdPost_updateAdmission(e, ss);

    // XÓA HỒ SƠ (chỉ xóa hồ sơ thuộc đúng kênh "Thu hồ sơ trực tiếp")
    if (action === 'deleteAdmission') return hdPost_deleteAdmission(e, ss);

    // TICK/SỬA 1 Ô GIẤY TỜ HOẶC "XN NHẬP HỌC" — thay cho toggleDocument cũ. Field truyền
    // lên là TÊN CỘT TRUNG GIAN thật (VD "ẢNH THẺ", "GIẤY TỜ ƯU TIÊN", hoặc chính
    // ADMISSIONS_STATUS_FIELD khi tick/bỏ tick "XN nhập học" ở khung bên phải).
    if (action === 'toggleAdmissionField') return hdPost_toggleAdmissionField(e, ss);

    // NHẬP EXCEL — ghi thẳng vào Trung Gian, dùng đúng bộ cột ADMISSIONS_* (đồng nhất
    // với modal thêm tay). File mẫu do action 'getAdmissionsHeaders' sinh ra ở trên khớp
    // đúng các cột được đọc ở đây — đổi 1 trong 2 chỗ thì nhớ đổi luôn chỗ còn lại.
    if (action === 'importAdmissions') return hdPost_importAdmissions(e, ss);

    // LƯU 1 KHOẢN NỘP TIỀN (tick loại phí -> ghi/xoá 1 dòng trong tab NopTien)
    if (action === 'savePayment') return hdPost_savePayment(e, ss);

    // =====================================
    // ĐÃ THÊM (rà soát Trunggian.gs): CHECK TRÙNG CHO IMPORT EXCEL BÊN XÉT TUYỂN — gọi
    // 1 LẦN DUY NHẤT cho cả loạt (không phải hỏi từng dòng) ngay lúc bấm "Nhập" trong
    // modal import, TRƯỚC khi đẩy hẳn vào dataList hiển thị trên trang. Không dùng cho
    // nhánh nhập tay (nhập tay chỉ so với dataList cục bộ, không gọi server, để không
    // làm chậm thao tác gõ liên tục — đã thống nhất với người dùng).
    // =====================================
    if (action === 'checkDuplicatesXetTuyen') return hdPost_checkDuplicatesXetTuyen(e, ss);

   // =====================================
    // 6. NHẬP EXCEL & ĐẨY DỮ LIỆU (MÃ SV = NĂM + HỆ + HT + 6 SỐ CUỐI CCCD)
    // (Dùng cho luồng XÉT TUYỂN, ghi vào sheet TRUNG GIAN — KHÔNG phải sheet này)
    // =====================================
    if (action === 'importStudents') return hdPost_importStudents(e, ss);

    // =====================================
    // ĐÃ THÊM (PHA 1 ROADMAP): 4 ACTION CÒN THIẾU CỦA BAN THẨM ĐỊNH — port nguyên
    // logic nghiệp vụ từ 4 file .gs cũ (Biennhantrungtuyen/yeucaubosung/LuuvaoCSDL/
    // Capnhatchodaotao), chuyển ID hardcode sang PropertiesService (xem
    // setupSecurityKeys() cuối file), và dùng chung requireAuth() thay vì tự viết
    // lại xác thực riêng như bản cũ.
    // =====================================

    // 16. DUYỆT TRÚNG TUYỂN -> XUẤT PDF BIÊN NHẬN (port từ Biennhantrungtuyen.gs)
    if (action === 'trungTuyen') return hdPost_trungTuyen(e, ss);

    // 17. BÁO THIẾU HỒ SƠ -> XUẤT PDF (port từ yeucaubosung.gs)
    if (action === 'baoThieu') return hdPost_baoThieu(e, ss);

    // 18. LƯU KẾT QUẢ VÀO SHEET KETQUA (port từ LuuvaoCSDL.gs, giữ nguyên upsert 2 lớp)
    if (action === 'luuKetQua') return hdPost_luuKetQua(e, ss);

    // 19. BÀN GIAO ĐÀO TẠO (port từ Capnhatchodaotao.gs — ĐÃ SỬA: dùng openById() thay
    // vì getActiveSpreadsheet(), vì Quanlysv.gs là standalone script, không gắn liền
    // vào 1 file Sheet cụ thể nào để "active")
    if (action === 'capNhatDaoTao') return hdPost_capNhatDaoTao(e, ss);

    // =====================================
    // 12. QUÉT CCCD BẰNG AI GEMINI
    // =====================================
    if (action === 'scanDocument') return hdPost_scanDocument(e, ss);

    // =====================================
    // 13. QUÉT BẢNG ĐIỂM
    // =====================================
    if (action === 'scanTranscript') return hdPost_scanTranscript(e, ss);

    // =====================================
    // 14. ĐỐI SÁNH KHUNG CTĐT
    // =====================================
    if (action === 'compareCurriculum') return hdPost_compareCurriculum(e, ss);

    // =====================================
    // 14b. QUÉT CHỨNG CHỈ (Công nhận KQHT & chuyển đổi tín chỉ — Nguồn 3 "miễn theo chứng
    // chỉ", 2026-09-10 — KHÔNG liên quan Ký điện tử Pha 2): mỗi dòng upload ở
    // ThamDinhPage.jsx cán bộ CHỌN TRƯỚC "Loại chứng chỉ" (dropdown) rồi mới upload ảnh —
    // action này CHỈ làm đúng 1 việc: ĐỌC thông tin trên ảnh (tên chứng chỉ, mức đạt, ngày
    // cấp...), TUYỆT ĐỐI KHÔNG tự quyết định môn nào được miễn — việc "điều kiện -> hệ quả"
    // (tra bảng Điều 8-11, kiểm hạn 24 tháng, ghép cặp HSK+HSKK...) luôn nằm ở tầng thuần JS
    // phía frontend (tinhCacDongMienChungChi trong thamDinhHelpers.js), đúng nguyên tắc đã
    // chốt xuyên suốt tính năng này "không giao AI quyết định chính sách".
    // =====================================
    if (action === 'scanChungChi') return hdPost_scanChungChi(e, ss);

    // =====================================
    // 15. XUẤT TEMPLATE EXCEL
    // =====================================
    if (action === 'exportTemplate') return hdPost_exportTemplate(e, ss);

    // =====================================
    // 15b. LƯU KẾT QUẢ ĐỐI SÁNH ĐÃ CHỈNH TAY (Công nhận KQHT & chuyển đổi tín chỉ,
    // 2026-09-09 — KHÔNG liên quan gì tới Ký điện tử Pha 2): người thẩm định mở
    // DoiSanhModal.jsx, gộp/gỡ tay bảng đối sánh AI trả về, rồi bấm nút "Lưu" mới gọi
    // action này — KHÔNG tự lưu khi đang chỉnh sửa (bản nháp lúc chỉnh sửa sống ở
    // sessionStorage phía frontend, qua đúng cơ chế scanCache/updateScanCache đã có
    // sẵn cho việc quét bảng điểm — tách biệt hoàn toàn khỏi cột lưu chính thức ở
    // đây). Ghi vào cột MỚI "KẾT QUẢ ĐỐI SÁNH JSON" trên sheet Trung gian (CẦN TỰ
    // THÊM cột này — đúng quy ước code không tự tạo cột của cả hệ thống). Vì
    // getThamDinhData đọc MỌI cột theo tên header một cách chung (generic, xem case
    // 'getThamDinhData' ở đầu file), thêm cột này KHÔNG cần sửa gì phía đọc dữ liệu —
    // chỉ cần action GHI này, lần sau load lại trang sẽ tự thấy giá trị đã lưu.
    // =====================================
    if (action === 'luuKetQuaDoiSanh') return hdPost_luuKetQuaDoiSanh(e, ss);

    // =====================================
    // ĐÃ THÊM: GỬI PHẢN HỒI LỖI QUA GOOGLE CHAT — port từ GoiAPI.gs cũ, giữ nguyên
    // nguyên tắc quan trọng: lấy TÊN TÀI KHOẢN từ email đã được requireAuth() xác thực
    // thật (g.userInfo.email), KHÔNG dùng field client tự gửi lên, tránh giả mạo tên
    // người gửi phản hồi. Không giới hạn role — ai đăng nhập hợp lệ cũng gửi được.
    // =====================================
    if (action === 'feedback') return hdPost_feedback(e, ss);

    // ==========================================================
    // PHA 1·B roadmap ("Khóa định danh") — CỔNG 2 và CỔNG 4, xem DinhDanh.gs.
    // Chạy song song, chưa migrate gì, chưa có action nào khác (addAdmission,
    // importStudents...) gọi tới — tạm giới hạn Admin vì đang là hạ tầng thử
    // nghiệm, chưa nối vào UI.
    // ==========================================================
    if (action === 'dinhDanhTao') return hdPost_dinhDanhTao(e, ss);

    if (action === 'dinhDanhCapNhatMa') return hdPost_dinhDanhCapNhatMa(e, ss);

    // PHA 1·D1 (bước 4) — duyệt 1 ca trong "Hàng đợi xác nhận định danh" (xem DinhDanh.gs).
    // Admin + ThamDinh (ĐÃ SỬA: trước chỉ Admin) — đây là hành động thay đổi dữ liệu khoá
    // định danh, không phải nhập liệu thường ngày, nên KHÔNG mở rộng thêm ngoài 2 role này.
    if (action === 'dinhDanhXuLyNghiTrung') return hdPost_dinhDanhXuLyNghiTrung(e, ss);

    // PHA 1·D2 — gộp thật 2 hồ sơ định danh đã tồn tại (xem DinhDanh.gs). Admin + ThamDinh
    // (ĐÃ SỬA: trước chỉ Admin) — thay đổi khoá định danh gốc, không phải nhập liệu thường
    // ngày, nên KHÔNG mở rộng thêm ngoài 2 role này.
    if (action === 'dinhDanhGopHoSo') return hdPost_dinhDanhGopHoSo(e, ss);

    // ĐÃ THÊM — tài khoản nhập liệu (không có quyền tự xử lý định danh) bấm "Báo Admin" từ
    // bong bóng thông báo -> đẩy 1 tin nhắn Google Chat (xem dinhDanhBaoAdmin trong
    // DinhDanh.gs). Mở quyền rộng như dinhDanhSoLuongCanXacNhanCuaToi/dinhDanhSoLuongCapNghiTrung
    // — hành động này KHÔNG đổi dữ liệu định danh, chỉ gửi 1 tin nhắn báo, nên không cần
    // giới hạn về Admin/ThamDinh.
    if (action === 'dinhDanhBaoAdmin') return hdPost_dinhDanhBaoAdmin(e, ss);

    // ĐÃ THÊM — KÝ ĐIỆN TỬ PHA 1 (Bước 2): lưu/thay ảnh chữ ký cá nhân của CHÍNH
    // người đang đăng nhập. allowedRoles=[] — bất kỳ tài khoản nào cũng cần tải chữ
    // ký của MÌNH lên, không giới hạn vai trò (vai trò chỉ quyết định AI được xuất
    // GBTT/AI được cấu hình ChucDanhKy, không quyết định ai được có chữ ký cá nhân).
    if (action === 'luuChuKyCuaToi') return hdPost_luuChuKyCuaToi(e, ss);

    // ĐÃ THÊM — KÝ ĐIỆN TỬ PHA 1 (Bước 2): xoá ảnh chữ ký cá nhân của CHÍNH người
    // đang đăng nhập.
    if (action === 'xoaChuKyCuaToi') return hdPost_xoaChuKyCuaToi(e, ss);

    // ĐÃ THÊM (Ký điện tử Pha 1 — Bước 4): tạo yêu cầu ký GBTT cho 1 lô sinh viên —
    // copy mẫu Doc, điền nội dung + tên người ký, ghi 1 dòng YeuCauKy + N dòng BuocKy
    // (bước 1 = DEN_LUOT, còn lại CHO_TRUOC), CHƯA gửi email (Bước 6). Doc trung gian
    // được GIỮ LẠI (không trash) — đây là văn bản sống để lần lượt đóng dấu, khác hẳn
    // action 'trungTuyen' (xoá Doc ngay sau khi xuất PDF).
    if (action === 'taoYeuCauKyGBTT') return hdPost_taoYeuCauKyGBTT(e, ss);

    // ĐÃ THÊM (Ký điện tử Pha 2 — Bước 5 — tổng quát hoá thêm loại văn bản khác GBTT):
    // action DÙNG CHUNG cho MỌI loại văn bản khác GBTT — nhận loaiTaiLieu + nội dung
    // placeholder tự do từ client, dùng lại đúng luồng taoYeuCauKy_ (copy mẫu Doc, điền
    // {{...}}, ghi YeuCauKy/BuocKy, gửi email "đến lượt ký" — xem chú thích đầy đủ tại nơi
    // khai báo hàm). Thêm 1 loại văn bản MỚI (khác GBTT) từ giờ CHỈ CẦN: 1 Doc mẫu theo
    // đúng quy ước placeholder (nội dung tự do {{TEN_BAT_KY}}, cộng {{HOTEN_<MA>}}/
    // {{NGAYKY_<MA>}}/{{CHUKY_<MA>}} cho từng chức danh ký), 1 Script Property
    // "<LOAI>_TEMPLATE_DOC_ID" + "<LOAI>_FOLDER_ID" (LOAI = loaiTaiLieu viết hoa), và 1
    // (hoặc nhiều) dòng ChucDanhKy có cột APDUNGCHO = đúng mã loaiTaiLieu đó — KHÔNG cần
    // sửa thêm code gì ở đây hay ở bất kỳ đâu khác trong luồng ký (kyYeuCau/tuChoiKy/
    // huyYeuCauKy/nhacNhoKyDinhKy đều đọc theo YeuCauKy.LOAI_TAI_LIEU nên đã dùng chung
    // sẵn từ trước).
    // GBTT KHÔNG dùng action này — vẫn giữ action riêng 'taoYeuCauKyGBTT' ở trên (xử lý
    // theo LÔ nhiều sinh viên/1 lần gọi, khác action này chỉ tạo ĐÚNG 1 yêu cầu/1 lần gọi).
    if (action === 'taoYeuCauKy') return hdPost_taoYeuCauKy(e, ss);

    // ĐÃ THÊM (Ký điện tử Pha 2 — Bước 6 — "tải file lên ký ngay, không cần mẫu"): KHÁC hẳn
    // taoYeuCauKy ở trên (Bước 5, vẫn dựa vào 1 Doc MẪU + {{placeholder}} lặp lại nhiều
    // lần) — action này nhận THẲNG 1 file người tạo tự tải lên (ảnh hoặc PDF có sẵn), KHÔNG
    // có mẫu/placeholder gì cả, coi file đó là tài liệu CUỐI CÙNG luôn — đúng mô hình
    // DocuSign/Dropbox Sign thật (xem "Vấn đề phát sinh khi rà lại luồng văn bản mới" trong
    // kế hoạch). Vì không có Doc mẫu để dò vị trí {{CHUKY_<MA>}}, BẮT BUỘC phải có
    // VI_TRI_KY_JSON (click-to-place — UI thật CHƯA xây, xem tham số viTriKyJson) khớp đủ
    // MỌI người ký — thiếu là báo lỗi NGAY tại đây (xacThucViTriKy_), không tạo yêu cầu nửa
    // vời. Yêu cầu tạo qua action này LUÔN đi vào nhánh PDF/pdf-lib mới trong kyYeuCau (vì
    // VI_TRI_KY_JSON luôn có dữ liệu) — không bao giờ chạm nhánh Docs cũ.
    // PHẠM VI HIỆN TẠI (cố ý thu hẹp): CHỈ nhận file ĐÃ LÀ PDF sẵn — KHÔNG nhận ảnh/Word ở
    // action này. Lý do: chuyển ảnh sang PDF cần pdf-lib (embedPng/embedJpg, hàm anhSangPdf_
    // đã viết sẵn bên dưới nhưng CHƯA gọi ở đây) — mà pdf-lib là API BẤT ĐỒNG BỘ (Promise),
    // trong khi action này chạy TRỰC TIẾP trong doPost KHÔNG async (đã kiểm chứng bằng thực
    // nghiệm: khai báo async cho doGet/doPost bị Apps Script từ chối thẳng, xem lịch sử
    // trong kế hoạch) — nên KHÔNG thể gọi `await anhSangPdf_(...)` ngay tại đây, giống hệt
    // lý do kyYeuCau phải tách việc ký PDF ra trigger riêng. Muốn nhận ảnh/Word ở action
    // TẠO yêu cầu (khác lúc KÝ, vốn đã có cơ chế trigger+polling) sẽ cần thêm 1 vòng
    // trigger+polling NỮA riêng cho bước "tạo" — chưa cần thiết cho nhu cầu hiện tại (PDF là
    // định dạng phổ biến nhất cho văn bản cần ký; file Word tự lưu (Save As/Export) sang PDF
    // trước khi tải lên là đủ dùng).
    if (action === 'taoYeuCauKyTuFile') return hdPost_taoYeuCauKyTuFile(e, ss);

    // ĐÃ THÊM (Ký điện tử Pha 1 — Bước 4): thực hiện 1 lượt ký — đóng dấu ảnh chữ ký
    // cá nhân + dòng "Ký ngày..." vào đúng vị trí chức danh của người gọi, rồi chuyển
    // sang bước kế tiếp (DEN_LUOT) hoặc xuất PDF hoàn chỉnh nếu đây là bước cuối cùng.
    // Bọc LockService để 2 lượt ký/double-click không chạy chồng lên nhau và làm hỏng
    // chuỗi bước (xem rủi ro đã lường ở kế hoạch mục 12).
    if (action === 'kyYeuCau') return hdPost_kyYeuCau(e, ss);

    // ĐÃ THÊM (Ký điện tử Pha 2 — Bước 2): người ĐANG TỚI LƯỢT (đúng cơ chế phân quyền
    // của kyYeuCau — dựa vào BuocKy.TRANG_THAI=DEN_LUOT + email, không theo Role) từ chối
    // ký kèm lý do bắt buộc — dừng NGAY cả chuỗi (không chuyển bước kế tiếp), báo email
    // người tạo. Cột BuocKy đang DEN_LUOT được đổi sang TU_CHOI (giữ nguyên, KHÔNG xoá) để
    // còn hiện trong lịch sử/xem lại — chỉ YeuCauKy.TRANG_THAI đổi sang BI_TU_CHOI, các nơi
    // đọc "chờ ký" (layDanhSachChoToiKy/laySoLuongChoToiKy) đã lọc theo cờ này.
    if (action === 'tuChoiKy') return hdPost_tuChoiKy(e, ss);

    // ĐÃ THÊM (Ký điện tử Pha 2 — Bước 2): người TẠO yêu cầu (hoặc Admin) thu hồi 1 yêu
    // cầu đang chạy dở — chỉ khi CHƯA hoàn tất. Kiểm quyền theo DỮ LIỆU (giống
    // xemTruocYeuCauKy: so YeuCauKy.NGUOI_TAO_EMAIL, không theo Role riêng lẻ nào khác
    // ngoài Admin), không phải theo vị trí trong chuỗi ký như tuChoiKy.
    if (action === 'huyYeuCauKy') return hdPost_huyYeuCauKy(e, ss);

    return responseJSON(400, "Action POST không hợp lệ", null);

  } catch (error) {
    return responseJSON(500, "Lỗi Server: " + error.toString(), null);
  }
}