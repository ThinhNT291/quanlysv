// ============================================================================
// TuyenSinh.gs — Dữ liệu tuyển sinh/thẩm định từ sheet trung gian ("Trung gian"):
// đọc/chuẩn hoá dữ liệu thí sinh, sinh mã sinh viên, suy ra trạng thái vòng đời hồ sơ,
// cache dữ liệu Trung gian (kho_*), đối chiếu cấu hình chỉ tiêu, và tiện ích lọc link
// Drive an toàn dùng khi đọc dữ liệu. TÁCH RA từ Quanlysv.gs (2026-09-10), hành vi giữ
// nguyên 100% — xem ghi chú đầu Quanlysv.gs.
// ============================================================================



// ===============================================
// ĐÃ THÊM: NHÓM HẰNG SỐ + HÀM DÙNG CHUNG CHO TRANG "THU HỒ SƠ NHẬP HỌC" (đọc/ghi thẳng
// sheet Trung Gian). ÔNG CẦN TỰ THÊM 1 CỘT MỚI TÊN ĐÚNG "KÊNH NỘP" (không dấu ngoặc,
// không dấu chấm) vào hàng tiêu đề của sheet Trung Gian TRƯỚC khi dùng các action bên
// dưới — cột này dùng để tách hồ sơ do trang Thu hồ sơ tạo ra khỏi hồ sơ bên Xét tuyển,
// value = "Thu hồ sơ trực tiếp". Bên Xét tuyển không cần sửa gì, cứ để trống cột đó.
// ===============================================
const ADMISSIONS_KENH_NOP = "Thu hồ sơ trực tiếp";
const ADMISSIONS_KENH_FIELD = "KÊNH NỘP";
// Các trường dữ liệu (text/dropdown) hiện trong modal "Thêm hồ sơ" — tên phải khớp
// TUYỆT ĐỐI (sau khi .toUpperCase()) với tiêu đề thật trên sheet Trung Gian.
// ĐÃ THÊM "GIỚI TÍNH"/"NƠI SINH" (theo yêu cầu — bổ sung 2 trường này cho luồng "Thu hồ sơ
// trực tiếp"): mảng này tự động chảy vào CẢ addAdmission/updateAdmission (ghi Sheet) LẪN
// action 'getAdmissionsHeaders' (nguồn duy nhất dựng file mẫu Excel import ở ImportModal.jsx
// — xem chú thích tại getAdmissionsHeaders) nên chỉ cần sửa ĐÚNG 1 chỗ này, không như
// XETTUYEN_TEMPLATE_HEADERS (Xét tuyển có mẫu Excel tách riêng, phải sửa thêm chỗ đó).
const ADMISSIONS_DATA_FIELDS = ["TÊN SINH VIÊN", "NGÀY SINH", "GIỚI TÍNH", "NƠI SINH", "CĂN CƯỚC", "NGÀNH", "KHÓA", "HỆ ĐÀO TẠO", "HÌNH THỨC ĐÀO TẠO", "ĐỐI TƯỢNG ƯU TIÊN", "LINK HỒ SƠ"];
// ĐÃ THÊM: định dạng HIỂN THỊ (không phải giá trị) áp cho ô "NGÀY SINH" mỗi lần ghi — 1 chỗ
// duy nhất, đổi ở đây là đổi cho MỌI nơi ghi (addAdmission/updateAdmission/importAdmissions/
// importStudents) lẫn dinhDangCotNgaySinhGoc01() (BackfillDinhDanh.gs, chạy tay áp lại cho
// dữ liệu cũ). Đổi giá trị này KHÔNG ảnh hưởng gì tới dữ liệu/việc so khớp trùng — chỉ đổi
// cách con số hiện ra trên Sheet.
const DINH_DANG_NGAY_SINH = "yyyy/mm/dd";
// Các cột kiểu "đã có/chưa có" (ghi "x" khi tick, để trống khi bỏ tick) — riêng GIẤY TỜ
// ƯU TIÊN ghi thẳng nội dung ghi chú thay vì "x" (giữ đúng hành vi ô ghi chú cũ).
const ADMISSIONS_CHECK_FIELDS = ["ẢNH THẺ", "BẢN SAO BẰNG THPT/GIẤY BÁO ĐIỂM", "BẢN SAO HỌC BẠ THPT", "BẢN SAO ID", "SƠ YẾU LÝ LỊCH", "GIẤY TỜ ƯU TIÊN"];
const ADMISSIONS_STATUS_FIELD = "TRẠNG THÁI THẨM ĐỊNH";
const ADMISSIONS_STATUS_VALUE = "Đã trúng tuyển"; // riêng của luồng Thu hồ sơ — bên Xét tuyển/Thẩm định dùng "Đã duyệt"/"Đã báo thiếu", không đụng hàng
// ĐÃ THÊM: tên cột hiển thị TRÊN FILE MẪU (trang Nhập học) — xem chú thích tại getAdmissionsHeaders.
const ADMISSIONS_STATUS_TEMPLATE_LABEL = "XÁC NHẬN NHẬP HỌC";
const ADMISSIONS_MASV_NAMES = ["MÃ SINH VIÊN", "MÃ SỐ NGƯỜI HỌC", "MASV", "MÃ SV"];

// ĐÃ THÊM (rà soát đồng bộ file mẫu 2 trang): danh sách cột file mẫu Excel bên trang
// Xét tuyển — COPY NGUYÊN VĂN từ mảng "headers" cũ trong XetTuyenPage.jsx (hàm
// handleDownloadTemplate), chuyển sang đây làm nguồn duy nhất. Dùng cho action GET
// 'getXetTuyenHeaders'.
// ĐÃ SỬA (rà soát cột file mẫu theo Goc01): "BẢN SAO BẰNG TRUNG CẤP"/"BẢNG ĐIỂM TRUNG
// CẤP" đổi tên thành "...( SAU 2022)" — khớp đúng cột thật trên Goc01 sau khi đổi tên (áp
// dụng cho luồng "Tốt nghiệp Trung cấp sau 2022", phân biệt với bộ hồ sơ "TRƯỚC 2022" đã
// có sẵn tên riêng từ trước). "ĐIỂM TB HỆ 4"/"ĐIỂM TB HỆ 10" đổi thành "ĐIỂM TB TOÀN KHÓA
// HỆ 4"/"ĐIỂM TB TOÀN KHÓA HỆ 10" — ĐÂY LÀ FIX BUG THẬT, không chỉ đổi tên cho đẹp: 2 tên
// cũ ("ĐIỂM TB HỆ 4/10") KHÔNG khớp với tên cột thật trên Goc01 ("ĐIỂM TB TOÀN KHÓA HỆ
// 4/10") — nên trước đây các giá trị nhập ở 2 cột này (dù nhập tay hay import Excel) đều
// bị ghi trống vào Goc01 (xem tương ứng bên XetTuyenPage.jsx). Đã bỏ "ĐIỂM CHUẨN" (không
// có logic nào dùng để so khớp điểm chuẩn thật, chỉ hiển thị) — GIỮ LẠI "PHƯƠNG THỨC XÉT
// TUYỂN" (xác nhận vẫn có chức năng thật — tự hiện lại khi sửa hồ sơ + tính điểm ưu tiên
// khi nhập tay, xem chú thích tại XetTuyenPage.jsx).
// ĐÃ THÊM "ĐIỂM PHỎNG VẤN" (theo phản hồi, ngay sau khi cột này được bổ sung thật trên
// Goc01): đặt ngay sau "ĐIỂM CỘNG" — cùng vị trí với chỗ ghi newRow ở handleAddRow và
// cột hiển thị trong bảng "Danh sách chờ đồng bộ" bên XetTuyenPage.jsx, để 3 nơi khớp
// tên cột với nhau. Thiếu cột này trong file mẫu không làm hỏng việc ĐỌC file lúc import
// (executeImport dò theo TÊN cột bất kể thứ tự/có mặt hay không), nhưng người nhập liệu
// tải file mẫu về sẽ không thấy cột để điền điểm phỏng vấn — nay đã có sẵn trong file mẫu.
// ĐÃ THÊM "NĂM TỐT NGHIỆP THPT" (theo phản hồi — Thông tư tuyển sinh đại học mới áp dụng từ
// 15/2/2026, giới hạn khu vực ưu tiên theo năm tốt nghiệp THPT — xem XetTuyenPage.jsx,
// NTN_THPT_TRUOC/NTN_THPT_TU): đặt ngay trước "KHU VỰC ƯU TIÊN" (khớp thứ tự ô trên form) —
// cùng lý do/vị trí như khi thêm "ĐIỂM PHỎNG VẤN" ở trên, để file mẫu tải về có sẵn cột này
// cho người nhập liệu chọn (dropdown 2 giá trị, xem dropdownColumns ở handleDownloadTemplate).
// Thiếu cột này trong file mẫu không làm hỏng việc ĐỌC file lúc import (executeImport dò
// theo TÊN cột bất kể thứ tự/có mặt hay không) — chỉ là người tải file mẫu về sẽ không thấy
// cột để điền nếu bỏ dòng "NĂM TỐT NGHIỆP THPT" ra khỏi mảng này.
const XETTUYEN_TEMPLATE_HEADERS = [
  // ĐÃ THÊM "GIỚI TÍNH", "NƠI SINH" (theo yêu cầu — bổ sung 2 trường này cho luồng Xét
  // tuyển): KHÁC với RAW_DIEM_HK/RAW_DIEM_KHAC_1/2 (nội bộ, cố tình loại khỏi mẫu) — đây là
  // 2 trường dữ liệu thật người dùng cần điền, nên đưa vào mẫu Excel bình thường như NGÀNH/
  // KHÓA.
  // ĐÃ THÊM "MÃ SINH VIÊN" (theo yêu cầu 2026-09-10 — thẩm định lại hồ sơ CŨ đã có MSV
  // thật): cột TUỲ CHỌN, để trống với hồ sơ MỚI hoàn toàn (hệ thống tự sinh mã như trước
  // giờ, xem generateMaSV trong importStudents) — chỉ điền khi đây là hồ sơ CŨ đã có MSV
  // thật cần nhập/thẩm định lại. Xem đoạn xử lý "hồ sơ cũ" trong hdPost_importStudents.
  "STT", "CĂN CƯỚC", "TÊN SINH VIÊN", "NGÀY SINH", "MÃ SINH VIÊN", "GIỚI TÍNH", "NƠI SINH", "NGÀNH", "KHÓA",
  "ĐỐI TƯỢNG ƯU TIÊN", "NĂM TỐT NGHIỆP THPT", "KHU VỰC ƯU TIÊN", "ĐỐI TƯỢNG ĐẦU VÀO", "NĂM XÉT TUYỂN",
  "HỆ ĐÀO TẠO", "HÌNH THỨC ĐÀO TẠO", "PHIẾU ĐĂNG KÝ DỰ TUYỂN", "SƠ YẾU LÝ LỊCH",
  "BẢN SAO ID", "ẢNH THẺ", "GIẤY CHUYỂN NVQS (VỚI NAM)", "BẢN SAO BẰNG THPT/GIẤY BÁO ĐIỂM", "BẢN SAO HỌC BẠ THPT",
  "BẢN SAO BẰNG TRUNG CẤP (SAU 2022)", "BẢNG ĐIỂM TRUNG CẤP (SAU 2022)", "BẰNG THPT/GCN ĐỦ KL KTVH THPT",
  "BẢN SAO BẰNG TRUNG CẤP TRƯỚC 2022", "BẢNG ĐIỂM TRUNG CẤP TRƯỚC 2022", "GCN HOÀN THÀNH CT GDPT",
  "BẰNG CAO ĐẲNG", "BẢNG ĐIỂM CAO ĐẲNG", "BẰNG ĐẠI HỌC", "BẢNG ĐIỂM ĐẠI HỌC", "GIẤY TỜ ƯU TIÊN",
  "PHƯƠNG THỨC XÉT TUYỂN",
  "TOÁN", "VẬT LÍ", "HÓA HỌC", "SINH HỌC", "NGỮ VĂN", "LỊCH SỬ", "ĐỊA LÝ",
  "TIẾNG ANH", "TIẾNG TRUNG", "TIN HỌC", "GDKTPL",
  "ĐIỂM TB TOÀN KHÓA HỆ 4", "ĐIỂM TB TOÀN KHÓA HỆ 10", "ĐIỂM CỘNG", "ĐIỂM PHỎNG VẤN", "LINK HỒ SƠ"
];

// Mở tab đầu tiên (theo VỊ TRÍ, không theo tên) của sheet Trung Gian — đồng bộ với mọi
// action khác trong file này (searchOldRecord/importStudents/getThamDinhData...).
function moTrunggianSheet() {
  const id = PropertiesService.getScriptProperties().getProperty('TRUNGGIAN_SHEET_ID');
  return SpreadsheetApp.openById(id).getSheets()[0];
}

// Đọc header (gốc + đã chuẩn hoá hoa/gọn khoảng trắng) và toàn bộ dữ liệu Trung Gian —
// dùng chung cho mọi action đọc/ghi của trang Thu hồ sơ, tránh lặp code đọc sheet.
function docTrunggianRaw() {
  const sheet = moTrunggianSheet();
  const values = sheet.getDataRange().getValues();
  const headers = values.length > 0 ? values[0] : [];
  const cleanHeaders = headers.map(h => String(h).toUpperCase().trim().replace(/\s+/g, ' '));
  return { sheet, headers, cleanHeaders, values };
}

// Tìm vị trí 1 cột theo nhiều tên khả dĩ (không phân biệt hoa/thường/khoảng trắng thừa) —
// dùng khi 1 khái niệm có thể được đặt tên khác nhau (VD cột Mã sinh viên).
function timCotTheoTen(cleanHeaders) {
  const tenKhaDi = Array.prototype.slice.call(arguments, 1);
  for (let k = 0; k < tenKhaDi.length; k++) {
    const idx = cleanHeaders.indexOf(String(tenKhaDi[k]).toUpperCase().trim());
    if (idx !== -1) return idx;
  }
  return -1;
}

// Lọc + đóng gói dữ liệu Trung Gian CHỈ của kênh "Thu hồ sơ trực tiếp" — nếu sheet chưa
// có cột KÊNH NỘP (chưa kịp thêm tay), tạm thời trả về TOÀN BỘ để không chặn thao tác,
// nhưng đây là tình huống cần ông bổ sung cột sớm, không nên để lâu (sẽ lẫn hồ sơ Xét tuyển).
function getAdmissionsDataFromTrunggian() {
  const { cleanHeaders, values } = docTrunggianRaw();
  if (values.length <= 1) return [];
  const idxKenh = timCotTheoTen(cleanHeaders, ADMISSIONS_KENH_FIELD);
  const results = [];
  for (let i = 1; i < values.length; i++) {
    if (idxKenh !== -1 && String(values[i][idxKenh] || "").trim() !== ADMISSIONS_KENH_NOP) continue;
    const rowObj = {};
    for (let c = 0; c < cleanHeaders.length; c++) {
      let val = values[i][c];
      if (val instanceof Date) {
        val = Utilities.formatDate(val, "GMT+7", "dd/MM/yyyy");
      } else if (cleanHeaders[c] === "CĂN CƯỚC" || cleanHeaders[c] === "CCCD") {
        val = String(val).replace(/^['"]+|['"]+$/g, '');
      } else if (ADMISSIONS_MASV_NAMES.indexOf(cleanHeaders[c]) !== -1) {
        val = String(val).replace(/^['"]+|['"]+$/g, '');
      }
      rowObj[cleanHeaders[c]] = val;
    }
    results.push(rowObj);
  }
  return results;
}

// Sinh Mã sinh viên — CỐ TÌNH COPY nguyên logic từ generateMaSV() bên trong action
// 'importStudents' (hàm đó khai báo cục bộ trong 1 khối if, không gọi được từ ngoài)
// thay vì refactor dùng chung, để không đụng vào action Xét tuyển đang chạy ổn định.
// Cùng 1 công thức: NĂM(2 số) + HỆ ĐÀO TẠO(1 số) + HÌNH THỨC ĐÀO TẠO(1 số) + 6 số cuối CCCD.
function generateMaSVTuChung(namXT, heDT, hinhThuc, cccdStr) {
  const DICT_HE_DT = {
    "Cao đẳng": "01", "Đại học chính quy": "02", "Liên thông ĐH - ĐH (Văn bằng 2)": "03",
    "Thường xuyên: Phương thức ĐTTX": "04", "Liên thông từ CĐ lên ĐH": "05",
    "Thường xuyên: Phương thức VLVH": "06", "Thạc sĩ": "07", "Khóa ngắn hạn cấp chứng chỉ": "08"
  };
  const DICT_HINH_THUC = {
    "Chính quy đại trà": "1", "Liên thông ĐH - ĐH chính quy (VB 2)": "2",
    "Thường xuyên: Phương thức ĐTTX": "3", "Thường xuyên: Phương thức VLVH": "4"
  };
  const aa = String(namXT || "").slice(-2);
  const cleanHeDT = String(heDT || "").trim().toLowerCase();
  const cleanHinhThuc = String(hinhThuc || "").trim().toLowerCase();

  let bb = "00";
  for (let key in DICT_HE_DT) { if (key.toLowerCase() === cleanHeDT) { bb = DICT_HE_DT[key]; break; } }
  if (bb === "00") {
    if (cleanHeDT.includes("cao đẳng")) bb = "01";
    else if (cleanHeDT.includes("đại học") || cleanHeDT.includes("đh chính quy")) bb = "02";
    else if (cleanHeDT.includes("văn bằng 2") || cleanHeDT.includes("vb2") || cleanHeDT.includes("vb 2")) bb = "03";
    else if (cleanHeDT.includes("đttx") || cleanHeDT.includes("từ xa")) bb = "04";
    else if (cleanHeDT.includes("lên đh") || cleanHeDT.includes("lên đại học")) bb = "05";
    else if (cleanHeDT.includes("vlvh") || cleanHeDT.includes("vừa làm vừa học")) bb = "06";
    else if (cleanHeDT.includes("thạc sĩ")) bb = "07";
    else if (cleanHeDT.includes("chứng chỉ") || cleanHeDT.includes("ngắn hạn")) bb = "08";
  }

  let s = "0";
  for (let key in DICT_HINH_THUC) { if (key.toLowerCase() === cleanHinhThuc) { s = DICT_HINH_THUC[key]; break; } }
  if (s === "0") {
    if (cleanHinhThuc.includes("đại trà")) s = "1";
    else if (cleanHinhThuc.includes("văn bằng 2") || cleanHinhThuc.includes("vb 2") || cleanHinhThuc.includes("vb2")) s = "2";
    else if (cleanHinhThuc.includes("đttx") || cleanHinhThuc.includes("từ xa")) s = "3";
    else if (cleanHinhThuc.includes("vlvh") || cleanHinhThuc.includes("vừa làm vừa học")) s = "4";
  }

  if (!aa || aa.length !== 2) return "";
  const cccdClean = String(cccdStr || "").replace(/\D/g, '');
  const xxxxxx = cccdClean.slice(-6).padStart(6, '0');
  return "'" + (aa + bb + s + xxxxxx);
}

// ĐÃ THÊM: suy ra "trạng thái vòng đời" của 1 hồ sơ cho action 'timKiemKhoSinhVien' —
// càng có mặt ở nhiều nguồn (Trung Gian -> KETQUA -> Đào tạo) thì càng ở giai đoạn
// sau. coKetQua/coDaoTao lấy từ việc CÓ tìm thấy đúng khoá CCCD+Ngành ở sheet tương
// ứng hay không (xem ketQuaMap/daoTaoMap trong action). Nhánh cuối (đọc thẳng cột
// TRẠNG THÁI THẨM ĐỊNH của Trung Gian) dùng CHUNG đúng 4 giá trị mà getAppState() bên
// frontend (thamDinhHelpers.js) đang dùng, để 2 nơi không lệch nhau.
function suyRaTrangThaiVongDoi_(trangThaiTrungGian, coKetQua, coDaoTao) {
  if (coDaoTao) return "Đã bàn giao Đào tạo";
  if (coKetQua) return "Đã trúng tuyển (chờ bàn giao)";
  const t = String(trangThaiTrungGian || "");
  if (t.indexOf("Đã trúng tuyển") !== -1) return "Đã trúng tuyển"; // kênh "Thu hồ sơ trực tiếp" — không qua KETQUA.
  if (t.indexOf("Đã duyệt") !== -1) return "Đã duyệt";
  if (t.indexOf("Đã báo thiếu") !== -1) return "Đã báo thiếu";
  if (t.indexOf("Mới bổ sung") !== -1) return "Mới bổ sung";
  return "Đang chờ duyệt";
}

// ĐÃ THÊM: bộ nhớ đệm (cache) tạm cho action 'timKiemKhoSinhVien' — mục đích DUY NHẤT là
// tránh phải MỞ LẠI 3 file Sheets (Trung Gian, KETQUA+Đào tạo, mã định danh phụ) và ĐỌC
// LẠI TOÀN BỘ dữ liệu thô mỗi lần có người bấm tìm/đổi trang/đổi bộ lọc trên trang Kho —
// đây mới là phần thật sự tốn thời gian (mỗi lần mở/đọc 1 sheet là 1 lượt gọi mạng tới
// Google, cộng dồn 3-4 lượt là vài giây), KHÔNG PHẢI vòng lặp lọc/phân trang trong Apps
// Script (vòng lặp vài nghìn dòng chạy dưới 1 giây, không đáng kể). Dùng CacheService (khác
// PropertiesService đang dùng cho session ở đầu file) đúng vì đây là dữ liệu CŨ vài phút
// không sao (khác session cần chính xác tuyệt đối), và CacheService tự hết hạn, khỏi cần
// tự dọn như PropertiesService.
//
// Đánh đổi cần biết: trong TG_KHO_CACHE_GIAY giây sau khi có người vừa duyệt/bàn giao/nộp
// hồ sơ mới, trang Kho có thể CHƯA thấy ngay thay đổi đó (đợi cache hết hạn mới đọc lại).
// Các trang khác (Thẩm định, Xét tuyển, Cài đặt...) KHÔNG bị ảnh hưởng — chúng đọc thẳng
// từ Sheets như cũ, không đi qua cache này.
const TG_KHO_CACHE_GIAY = 120; // 2 phút — thấy vẫn chậm/muốn dữ liệu mới hơn thì chỉnh số này.
const TG_KHO_CACHE_KEY = 'khoSinhVien_raw_v1';
// CHÚ Ý: hạn 100KB/khoá của CacheService tính theo SỐ BYTE (UTF-8), không phải số ký tự
// chuỗi JS (.length). Tiếng Việt có dấu tốn tới 3 byte/ký tự (VD "ề", "ấ"...), nên cắt
// mảnh theo SỐ KÝ TỰ phải chọn số nhỏ, chừa margin an toàn cho trường hợp xấu nhất (toàn
// ký tự 3 byte) thay vì đo byte thật cho từng mảnh (chậm hơn, không cần thiết ở quy mô này).
const TG_KHO_CACHE_MANH_TOI_DA = 25000; // 25.000 ký tự × tối đa 3 byte/ký tự = 75.000 byte, vẫn dưới hạn 100KB.

// Ngày (Date) không tự đi qua JSON.stringify/JSON.parse rồi trở về đúng kiểu Date được —
// phải tự đánh dấu/khôi phục thủ công cho mọi ô kiểu Date trong các mảng 2 chiều đọc từ
// Sheets, nếu không phần lọc theo khoảng ngày (fTuNgay/fDenNgay) bên dưới sẽ đọc sai kiểu
// dữ liệu khi lấy từ cache ra.
function kho_ngayThanhMoc_(hang, i) {
  if (hang[i] instanceof Date) hang[i] = { __ngay__: hang[i].getTime() };
}
function kho_mocThanhNgay_(hang, i) {
  const v = hang[i];
  if (v && typeof v === 'object' && v.__ngay__ !== undefined) hang[i] = new Date(v.__ngay__);
}
function kho_chuanBiMangDeCache_(mang2Chieu) {
  return (mang2Chieu || []).map(function (hang) {
    const banSao = hang.slice();
    for (let i = 0; i < banSao.length; i++) kho_ngayThanhMoc_(banSao, i);
    return banSao;
  });
}
function kho_khoiPhucMangTuCache_(mang2Chieu) {
  return (mang2Chieu || []).map(function (hang) {
    const banSao = hang.slice();
    for (let i = 0; i < banSao.length; i++) kho_mocThanhNgay_(banSao, i);
    return banSao;
  });
}

// Ghi 1 object bất kỳ vào cache, tự cắt thành nhiều "mảnh" <=90KB (CacheService giới hạn
// cứng 100KB/khoá) — im lặng bỏ qua nếu có lỗi (VD dữ liệu quá lớn không cache nổi), vì
// cache chỉ để TĂNG TỐC, không phải yêu cầu bắt buộc — không được để lỗi ở đây làm hỏng
// luôn kết quả tìm kiếm chính.
function kho_cheGhi_(key, obj, ttlGiay) {
  try {
    const cache = CacheService.getScriptCache();
    const chuoi = JSON.stringify(obj);
    const soManh = Math.max(1, Math.ceil(chuoi.length / TG_KHO_CACHE_MANH_TOI_DA));
    for (let i = 0; i < soManh; i++) {
      cache.put(key + '_' + i, chuoi.substring(i * TG_KHO_CACHE_MANH_TOI_DA, (i + 1) * TG_KHO_CACHE_MANH_TOI_DA), ttlGiay);
    }
    cache.put(key + '_meta', String(soManh), ttlGiay);
  } catch (errCache) { /* Bỏ qua — lượt này chỉ là không cache được, KHÔNG phải lỗi tìm kiếm. */ }
}

// Đọc lại object đã ghi bằng kho_cheGhi_ — trả về null nếu chưa có/đã hết hạn/thiếu mảnh
// (thiếu 1 mảnh cũng coi như cache miss toàn bộ, không dùng dữ liệu nửa vời).
function kho_cheDoc_(key) {
  try {
    const cache = CacheService.getScriptCache();
    const meta = cache.get(key + '_meta');
    if (!meta) return null;
    const soManh = parseInt(meta, 10);
    if (!soManh) return null;
    const cacKhoa = [];
    for (let i = 0; i < soManh; i++) cacKhoa.push(key + '_' + i);
    const cacManh = cache.getAll(cacKhoa);
    let chuoi = '';
    for (let i = 0; i < soManh; i++) {
      const manh = cacManh[key + '_' + i];
      if (manh === undefined || manh === null) return null;
      chuoi += manh;
    }
    return JSON.parse(chuoi);
  } catch (errCache) { return null; }
}

// Đọc dữ liệu thô cho action 'timKiemKhoSinhVien': ưu tiên lấy từ cache (nhanh, không gọi
// Sheets), chỉ khi cache trống/hết hạn mới thật sự mở 2 file Sheets (Trung Gian + KETQUA,
// KETQUA cũng chứa luôn tab Đào tạo) + đọc mã định danh phụ, rồi ghi lại vào cache cho
// lượt sau. Trả về ĐÚNG hình dạng mà action 'timKiemKhoSinhVien' đang cần (tgHeaders/
// tgValues/kqValues/dtValues/maPhuData) để chỉ cần đổi lời gọi, không phải sửa lại phần
// lọc/ghép bên dưới nó.
function kho_layDuLieuTho_() {
  const daCache = kho_cheDoc_(TG_KHO_CACHE_KEY);
  if (daCache) {
    return {
      tgHeaders: daCache.tgHeaders,
      tgValues: kho_khoiPhucMangTuCache_(daCache.tgValues),
      kqValues: kho_khoiPhucMangTuCache_(daCache.kqValues),
      dtValues: kho_khoiPhucMangTuCache_(daCache.dtValues),
      maPhuData: kho_khoiPhucMangTuCache_(daCache.maPhuData),
    };
  }

  const { cleanHeaders: tgHeaders, values: tgValues } = docTrunggianRaw();

  const KETQUA_SHEET_ID = PropertiesService.getScriptProperties().getProperty('KETQUA_SHEET_ID');
  const ssKQ = SpreadsheetApp.openById(KETQUA_SHEET_ID);
  const sheetKQ = ssKQ.getSheetByName("KETQUA");
  const kqValues = sheetKQ ? sheetKQ.getDataRange().getValues() : [];
  const sheetDT = ssKQ.getSheets()[0];
  const dtValues = sheetDT ? sheetDT.getDataRange().getValues() : [];

  let maPhuData = [];
  try { maPhuData = layTabDinhDanhPhu_().getDataRange().getValues(); } catch (errMaPhu) { /* Chưa cài đặt phần định danh (SetupDinhDanh.gs) thì bỏ qua. */ }

  kho_cheGhi_(TG_KHO_CACHE_KEY, {
    tgHeaders: tgHeaders,
    tgValues: kho_chuanBiMangDeCache_(tgValues),
    kqValues: kho_chuanBiMangDeCache_(kqValues),
    dtValues: kho_chuanBiMangDeCache_(dtValues),
    maPhuData: kho_chuanBiMangDeCache_(maPhuData),
  }, TG_KHO_CACHE_GIAY);

  return { tgHeaders: tgHeaders, tgValues: tgValues, kqValues: kqValues, dtValues: dtValues, maPhuData: maPhuData };
}

// Lấy (hoặc tạo mới nếu chưa có) tab "NopTien" trong CHÍNH file Trung Gian — đặt cạnh
// dữ liệu hồ sơ để tự động đi theo trigger sao lưu hàng ngày (autoBackupDaily) đang có
// sẵn, không cần dựng cơ chế backup riêng cho khoản thu.
function layHoacTaoSheetNopTien() {
  const id = PropertiesService.getScriptProperties().getProperty('TRUNGGIAN_SHEET_ID');
  const ss = SpreadsheetApp.openById(id);
  let sheet = ss.getSheetByName("NopTien");
  if (!sheet) {
    sheet = ss.insertSheet("NopTien");
    sheet.appendRow(["MaSV", "LoaiPhi", "SoTien", "NguoiThu", "ThoiGian"]);
    sheet.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#e0f2f1");
  }
  return sheet;
}

// ĐÃ THÊM: ánh xạ tên cột dữ liệu (Trung Gian) <-> tên trường tương ứng trong response của
// action 'getConfig' (đọc từ sheet CauHinh) — dùng để kiểm tra 1 giá trị nhập vào có khớp
// đúng danh sách hợp lệ hiện có hay không, TRƯỚC khi ghi xuống Sheet. Đây là lớp chặn THỨ 2
// (sau dropdown Excel ở file mẫu phía frontend, xem utils/excelTemplate.js) — cần thiết vì
// dropdown Excel có thể bị "vượt qua" khi người dùng DÁN (paste) dữ liệu từ nơi khác vào
// thay vì chọn từ danh sách, lúc đó Excel thường không chặn giá trị sai lúc paste.
const COT_CAUHINH_MAP_ = {
  "NGÀNH": "Nganh", "KHÓA": "KhoaNhapHoc", "HỆ ĐÀO TẠO": "HeDaoTao",
  "HÌNH THỨC ĐÀO TẠO": "HinhThucDaoTao", "ĐỐI TƯỢNG ƯU TIÊN": "DoiTuongUT",
  "KHU VỰC ƯU TIÊN": "KhuVucUT", "ĐỐI TƯỢNG ĐẦU VÀO": "DoiTuongDauVao",
  "NĂM XÉT TUYỂN": "NamXetTuyen",
  // ĐÃ THÊM (theo yêu cầu — bổ sung Giới tính/Nơi sinh): "NƠI SINH" là ô nhập tự do, không
  // có danh mục hợp lệ nên KHÔNG đưa vào đây (giống "TÊN SINH VIÊN"/"CĂN CƯỚC" — không phải
  // mọi cột đều cần kiểm tra khớp danh mục).
  "GIỚI TÍNH": "GioiTinh"
};

// Đọc danh sách hợp lệ từ sheet CauHinh — cùng cấu trúc đọc với case 'getConfig' (cố tình
// KHÔNG gộp chung 1 hàm với case đó để không đụng vào code đang chạy ổn định — chỉ đọc
// thêm 1 lần riêng ở đây, dùng cho việc KIỂM TRA thay vì trả về cho dropdown). Trả về {}
// (không có cột nào để kiểm tra) nếu chưa có sheet CauHinh hoặc đọc lỗi — lúc đó
// kiemTraHopLeCauHinh_ coi như không có gì để kiểm tra, KHÔNG chặn bất kỳ giá trị nào,
// tránh phá vỡ hành vi cũ ở những nơi ông chưa từng tạo/điền sheet CauHinh.
function layDanhSachHopLeCauHinh_() {
  try {
    const sheetConfig = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("CauHinh");
    if (!sheetConfig) return {};
    const dataConfig = sheetConfig.getDataRange().getValues();
    if (dataConfig.length <= 1) return {};
    const headers = dataConfig[0];
    const ketQua = {};
    Object.keys(COT_CAUHINH_MAP_).forEach(cot => {
      const idx = headers.indexOf(COT_CAUHINH_MAP_[cot]);
      if (idx === -1) return;
      const ds = [];
      for (let i = 1; i < dataConfig.length; i++) {
        if (dataConfig[i][idx]) ds.push(dataConfig[i][idx].toString().trim());
      }
      if (ds.length > 0) ketQua[cot] = ds;
    });
    return ketQua;
  } catch (err) {
    return {};
  }
}

// Kiểm tra 1 rowMap (key = tên cột đã chuẩn hoá, VD "NGÀNH") có khớp danh sách hợp lệ
// (cauHinh, lấy từ layDanhSachHopLeCauHinh_) hay không. CHỈ kiểm tra cột nào VỪA có mặt
// (khác rỗng) trong rowMap, VỪA có danh sách hợp lệ tương ứng trong cauHinh — cột nào
// CauHinh chưa cấu hình (hoặc rowMap không đụng tới, VD lúc sửa hồ sơ chỉ đổi 1 vài
// trường) thì tự bỏ qua, không chặn. So khớp CHÍNH XÁC (đã trim 2 bên) để không lẫn 2 giá
// trị nhìn giống nhau nhưng có thể cố ý khác nhau (VD khác hoa/thường). Trả về null nếu
// hợp lệ (hoặc không có gì để kiểm tra), hoặc 1 chuỗi mô tả lỗi nếu không khớp.
function kiemTraHopLeCauHinh_(rowMap, cauHinh) {
  for (const cot in cauHinh) {
    const giaTri = rowMap[cot];
    if (giaTri === undefined || giaTri === null) continue;
    const giaTriStr = String(giaTri).trim();
    if (!giaTriStr) continue;
    if (cauHinh[cot].indexOf(giaTriStr) === -1) {
      return 'Cột "' + cot + '" có giá trị "' + giaTriStr + '" không khớp danh sách hợp lệ hiện có (' + cauHinh[cot].join(', ') + ')';
    }
  }
  return null;
}

// ===============================================
// CORE: XÁC THỰC TOKEN GOOGLE VÀ KIỂM TRA QUYỀN
// ===============================================
// ĐÃ THÊM (rà soát Trunggian.gs — port sang đây): trích xuất URL thật từ ô "LINK HỒ
// SƠ" trên sheet TrungGian. getValues() thường chỉ trả về CHỮ HIỂN THỊ của ô, không
// phải URL thật, nếu ô đó là rich-text link (Chèn > Liên kết) hoặc công thức
// =HYPERLINK("url","nhãn"). Ưu tiên: rich-text link -> công thức HYPERLINK -> text
// thô. Chỉ trả về nếu khớp whitelist domain Drive/Docs, mọi thứ khác (javascript:,
// domain lạ, rác do gõ nhầm) -> trả về rỗng, không bao giờ đưa thẳng cho frontend mở.
var ALLOWED_LINK_HOSTS_GAS = ["drive.google.com", "docs.google.com"];

function isSafeDriveUrlGas(url) {
  if (!url) return false;
  var s = String(url).trim();
  if (!/^https:\/\//i.test(s)) return false;
  var hostMatch = s.match(/^https:\/\/([^/]+)/i);
  if (!hostMatch) return false;
  var host = hostMatch[1].toLowerCase();
  return ALLOWED_LINK_HOSTS_GAS.some(function(h) { return host === h || host.endsWith("." + h); });
}

function extractSafeLinkFromCell(richTextCell, formulaText, plainVal) {
  var candidate = "";
  if (richTextCell) {
    var richUrl = richTextCell.getLinkUrl();
    if (richUrl) candidate = richUrl;
  }
  if (!candidate && formulaText) {
    var m = String(formulaText).match(/HYPERLINK\(\s*"([^"]+)"/i);
    if (m) candidate = m[1];
  }
  if (!candidate) candidate = String(plainVal || "");
  return isSafeDriveUrlGas(candidate) ? candidate : "";
}

// ============================================================================
// ĐÃ THÊM (2026-09-10) — Thân xử lý các action Tuyển sinh/Thẩm định/Cấu hình hệ thống,
// tách ra từ doGet/doPost (Quanlysv.gs) để dispatcher gọn hơn. Tên hàm:
// hdGet_<action>/hdPost_<action> khớp đúng tên action gốc phía frontend — HÀNH VI GIỮ
// NGUYÊN 100% so với trước khi tách (nội dung thân hàm copy y nguyên từ case/if gốc,
// chỉ đổi chỗ chứa). hdPost_* nhận thêm tham số ss = đúng SpreadsheetApp.openById(SPREADSHEET_ID)
// đã mở sẵn trong doPost (không tự mở lại, giữ đúng hành vi/tối ưu như bản gốc).
// ============================================================================

function hdGet_getAdmissionsData(e) {
        const g = requireAuth(e.parameter, ['CanBo', 'Admin']);
        if (!g.ok) return g.resp;
        return responseJSON(200, "Thành công", getAdmissionsDataFromTrunggian());
      }

function hdGet_getAdmissionsHeaders(e) {
        const g = requireAuth(e.parameter, ['CanBo', 'Admin']);
        if (!g.ok) return g.resp;
        return responseJSON(200, "Thành công", {
          dataFields: ADMISSIONS_DATA_FIELDS,
          checkFields: ADMISSIONS_CHECK_FIELDS,
          statusField: ADMISSIONS_STATUS_FIELD,
          // ĐÃ THÊM: tên cột HIỂN THỊ riêng cho file mẫu — "TRẠNG THÁI THẨM ĐỊNH" (statusField
          // ở trên) là tên cột THẬT trên Trung Gian, dùng CHUNG với luồng Xét tuyển/Thẩm định
          // (bên đó cùng cột này mang giá trị "Đã duyệt"/"Đã báo thiếu"/... — không liên quan
          // "nhập học" nên KHÔNG đổi tên cột thật được, sẽ sai nghĩa bên Thẩm định). Cán bộ thu
          // hồ sơ trực tiếp lại thấy tên "TRẠNG THÁI THẨM ĐỊNH" khó hiểu, nên riêng TRÊN FILE
          // MẪU của trang Nhập học, đổi nhãn hiển thị thành "XÁC NHẬN NHẬP HỌC" — importAdmissions
          // đọc giá trị từ CẢ 2 tên cột (label mới lẫn statusField cũ) để không phá file mẫu cũ.
          statusFieldLabel: ADMISSIONS_STATUS_TEMPLATE_LABEL,
          statusValue: ADMISSIONS_STATUS_VALUE
        });
      }

function hdGet_getXetTuyenHeaders(e) {
        const g = requireAuth(e.parameter, ['TuyenSinh', 'ThamDinh', 'Admin']);
        if (!g.ok) return g.resp;
        return responseJSON(200, "Thành công", XETTUYEN_TEMPLATE_HEADERS);
      }

function hdGet_getPayments(e) {
        const g = requireAuth(e.parameter, ['CanBo', 'Admin']);
        if (!g.ok) return g.resp;
        const maSVTarget = String(e.parameter.MaSV || "").trim();
        const sheetNT = layHoacTaoSheetNopTien();
        const dataNT = sheetNT.getDataRange().getValues();
        const ketQuaNT = [];
        for (let i = 1; i < dataNT.length; i++) {
          if (String(dataNT[i][0] || "").trim() === maSVTarget) {
            ketQuaNT.push({
              loaiPhi: dataNT[i][1],
              soTien: dataNT[i][2],
              nguoiThu: dataNT[i][3],
              thoiGian: dataNT[i][4] instanceof Date ? Utilities.formatDate(dataNT[i][4], "GMT+7", "dd/MM/yyyy HH:mm:ss") : dataNT[i][4]
            });
          }
        }
        return responseJSON(200, "Thành công", ketQuaNT);
      }

function hdGet_getThamDinhData(e) {
        const g = requireAuth(e.parameter, ['ThamDinh', 'Admin']);
        if (!g.ok) return g.resp;

        const TRUNGGIAN_SHEET_ID = PropertiesService.getScriptProperties().getProperty('TRUNGGIAN_SHEET_ID');
        const ssTD = SpreadsheetApp.openById(TRUNGGIAN_SHEET_ID);
        // ĐÃ VÁ BUG: trước đây ưu tiên tìm tab TÊN "Sheet1" trước, chỉ dùng tab đầu
        // tiên (theo vị trí) nếu không có tab tên "Sheet1". Nếu spreadsheet có sẵn 1
        // tab rác/leftover đặt tên đúng "Sheet1" (VD: tab mặc định Google tự tạo lúc
        // khởi tạo file, gần như rỗng) thì hàm này ĐỌC NHẦM SANG TAB RÁC ĐÓ thay vì
        // tab thật chứa dữ liệu — trong khi searchOldRecord/checkDuplicatesXetTuyen/
        // importStudents (cùng file TRUNGGIAN) đều dùng thẳng .getSheets()[0] (tab đầu
        // tiên theo vị trí), không tìm theo tên -> đọc đúng tab thật. Giờ đồng bộ lại,
        // luôn lấy tab đầu tiên theo vị trí giống 3 action kia, không tìm theo tên nữa.
        const sheetTD = ssTD.getSheets()[0];
        if (!sheetTD) return responseJSON(404, "Không tìm thấy sheet dữ liệu Trung gian", null);

        const values = sheetTD.getDataRange().getValues();
        if (values.length <= 1) return responseJSON(200, "Thành công", []);

        const headers = values[0];
        const cleanHeaders = headers.map(h => String(h).toUpperCase().trim().replace(/\s+/g, ' '));
        const linkColIndex = cleanHeaders.indexOf("LINK HỒ SƠ");

        // ĐÃ THÊM (2026-09-10 — ưu tiên hiển thị Mã sinh viên THẬT thay vì luôn để trang
        // Thẩm định tự sinh mã tạm): dựng map cccd+nganh -> Mã sinh viên THẬT từ sheet KETQUA
        // (đã duyệt trúng tuyển chính thức) — ưu tiên CAO NHẤT. Nếu không có trong KETQUA,
        // giữ nguyên giá trị đã đọc thô ở cột "MÃ SINH VIÊN" ngay trên chính Trung Gian/Goc01
        // (hồ sơ CŨ nhập tay qua "Hồ sơ cũ (có MSV)" bên Xét tuyển sẽ có sẵn ở đây) — ưu tiên
        // THỨ NHÌ. Chỉ khi CẢ HAI đều trống, frontend (generateMaSV() trong thamDinhHelpers.js)
        // mới tự sinh mã tạm để hiển thị — ưu tiên CUỐI CÙNG. Dùng lại kho_layDuLieuTho_() để
        // tận dụng cache sẵn có (action 'timKiemKhoSinhVien' cũng đọc KETQUA qua đây), tránh
        // mở thêm 1 lượt đọc Sheets sống mỗi lần tải trang Thẩm định.
        const ketQuaMapMSV_ = {};
        try {
          const kqValuesTD = kho_layDuLieuTho_().kqValues;
          if (kqValuesTD.length > 1) {
            const kqHeadersTD = kqValuesTD[0].map(h => String(h).toUpperCase().trim().replace(/\s+/g, ' '));
            const idxCccdKQTD = timCotTheoTen(kqHeadersTD, "CĂN CƯỚC", "SỐ CCCD", "CCCD");
            const idxNganhKQTD = timCotTheoTen(kqHeadersTD, "NGÀNH ĐÀO TẠO", "NGÀNH");
            const idxMaSVKQTD = timCotTheoTen(kqHeadersTD, "MÃ SINH VIÊN", "MÃ SV");
            if (idxCccdKQTD !== -1 && idxNganhKQTD !== -1 && idxMaSVKQTD !== -1) {
              for (let i = 1; i < kqValuesTD.length; i++) {
                const cccdKQTD = String(kqValuesTD[i][idxCccdKQTD] || "").replace(/^['"]+|['"]+$/g, '').trim();
                const maSVKQTD = String(kqValuesTD[i][idxMaSVKQTD] || "").replace(/^['"]+|['"]+$/g, '').trim();
                if (!cccdKQTD || !maSVKQTD) continue;
                const nganhKQTD = String(kqValuesTD[i][idxNganhKQTD] || "").trim().toLowerCase();
                ketQuaMapMSV_[cccdKQTD + "_" + nganhKQTD] = maSVKQTD;
              }
            }
          }
        } catch (errKQMSV) { /* Không đọc được KETQUA thì bỏ qua — vẫn hiển thị được theo 2 ưu tiên còn lại. */ }

        // ĐÃ SỬA (rà soát Trunggian.gs): lấy rich-text + công thức TOÀN BỘ vùng dữ liệu
        // 1 lần duy nhất (đỡ gọi API nhiều lần trong vòng lặp) — chỉ khi thật sự có cột
        // "LINK HỒ SƠ" trên sheet.
        const richTextValues = linkColIndex !== -1 ? sheetTD.getDataRange().getRichTextValues() : null;
        const formulaValues = linkColIndex !== -1 ? sheetTD.getDataRange().getFormulas() : null;

        const results = [];
        for (let i = 1; i < values.length; i++) {
          const rowObj = {};
          for (let c = 0; c < cleanHeaders.length; c++) {
            const key = cleanHeaders[c];
            let val = values[i][c];
            if (val instanceof Date) {
              const dd = String(val.getDate()).padStart(2, '0');
              const mm = String(val.getMonth() + 1).padStart(2, '0');
              const yyyy = val.getFullYear();
              val = dd + '/' + mm + '/' + yyyy;
            } else if (key === "CĂN CƯỚC" || key === "SỐ CCCD" || key === "CCCD") {
              val = String(val).replace(/^['"]+|['"]+$/g, '');
            } else if (c === linkColIndex) {
              val = extractSafeLinkFromCell(richTextValues[i][c], formulaValues[i][c], val);
            }
            rowObj[key] = val;
          }
          // Áp ưu tiên CAO NHẤT (Mã sinh viên thật từ KETQUA) nếu có — ghi đè giá trị vừa
          // đọc thô ở trên; nếu KETQUA không có, GIỮ NGUYÊN giá trị thô đọc được ngay từ cột
          // "MÃ SINH VIÊN" trên Trung Gian (đã có sẵn trong rowObj, không cần làm gì thêm).
          const cccdRowTD_ = String(rowObj["CĂN CƯỚC"] || rowObj["SỐ CCCD"] || rowObj["CCCD"] || "").trim();
          const nganhRowTD_ = String(rowObj["NGÀNH"] || rowObj["NGÀNH ĐÀO TẠO"] || "").trim().toLowerCase();
          const maSVThatKQTD_ = ketQuaMapMSV_[cccdRowTD_ + "_" + nganhRowTD_];
          if (maSVThatKQTD_) rowObj["MÃ SINH VIÊN"] = maSVThatKQTD_;
          results.push(rowObj);
        }
        return responseJSON(200, "Thành công", results);
      }

function hdGet_getConfig(e) {
        // Cấu hình dropdown (Ngành, Hệ, KV...) dùng ở nhiều trang khác nhau -> chỉ cần
        // đăng nhập hợp lệ (bất kỳ role nào), không giới hạn role cụ thể.
        const g = requireAuth(e.parameter, []);
        if (!g.ok) return g.resp;
        const sheetConfig = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("CauHinh");
        if (!sheetConfig) {
          return responseJSON(404, "Vui lòng tạo Sheet có tên chính xác là 'CauHinh'", null);
        }
        
        const dataConfig = sheetConfig.getDataRange().getValues();
        const config = {
            Nganh: [], KhoaNhapHoc: [], DoiTuongUT: [], KhuVucUT: [],
            NamXetTuyen: [], DoiTuongDauVao: [], HeDaoTao: [], HinhThucDaoTao: [],
            // ĐÃ THÊM (theo yêu cầu — bổ sung Giới tính/Nơi sinh): danh mục Giới tính, dùng
            // cho dropdown ở Xét tuyển/Thu hồ sơ trực tiếp + trang Cấu hình (SettingsPage.jsx).
            GioiTinh: []
        };

        if (dataConfig.length > 1) {
          const headers = dataConfig[0];
          // Dò tìm vị trí cột tự động chống lệch cột
          const idxNganh = headers.indexOf("Nganh");
          const idxKhoa = headers.indexOf("KhoaNhapHoc");
          const idxDtUT = headers.indexOf("DoiTuongUT");
          const idxKvUT = headers.indexOf("KhuVucUT");
          const idxNam = headers.indexOf("NamXetTuyen");
          const idxDtDauVao = headers.indexOf("DoiTuongDauVao");
          const idxHeDT = headers.indexOf("HeDaoTao");
          const idxHinhThuc = headers.indexOf("HinhThucDaoTao");
          const idxGioiTinh = headers.indexOf("GioiTinh");

          for (let i = 1; i < dataConfig.length; i++) {
            if (idxNganh !== -1 && dataConfig[i][idxNganh]) config.Nganh.push(dataConfig[i][idxNganh].toString());
            if (idxKhoa !== -1 && dataConfig[i][idxKhoa]) config.KhoaNhapHoc.push(dataConfig[i][idxKhoa].toString());
            if (idxDtUT !== -1 && dataConfig[i][idxDtUT]) config.DoiTuongUT.push(dataConfig[i][idxDtUT].toString());
            if (idxKvUT !== -1 && dataConfig[i][idxKvUT]) config.KhuVucUT.push(dataConfig[i][idxKvUT].toString());
            if (idxNam !== -1 && dataConfig[i][idxNam]) config.NamXetTuyen.push(dataConfig[i][idxNam].toString());
            if (idxDtDauVao !== -1 && dataConfig[i][idxDtDauVao]) config.DoiTuongDauVao.push(dataConfig[i][idxDtDauVao].toString());
            if (idxHeDT !== -1 && dataConfig[i][idxHeDT]) config.HeDaoTao.push(dataConfig[i][idxHeDT].toString());
            if (idxHinhThuc !== -1 && dataConfig[i][idxHinhThuc]) config.HinhThucDaoTao.push(dataConfig[i][idxHinhThuc].toString());
            if (idxGioiTinh !== -1 && dataConfig[i][idxGioiTinh]) config.GioiTinh.push(dataConfig[i][idxGioiTinh].toString());
          }
        }
        // ĐÃ THÊM (Công nhận KQHT & chuyển đổi tín chỉ, 2026-09-09): trần tổng số tín
        // chỉ được công nhận/chuyển đổi, dùng để cảnh báo trong DoiSanhModal.jsx khi
        // người thẩm định gộp vượt ngưỡng — theo Điều 5.1 Quyết định 007a/2025/QĐ-
        // PXU-NBS ("không vượt quá 50% khối lượng CTĐT, không tính GDTC/GDQP&AN"),
        // hiện quy về 1 con số cố định (Script Property, mặc định 63 nếu chưa cấu
        // hình) thay vì tự tính 50% theo từng ngành — dễ chỉnh tay qua Script
        // Properties nếu sau này cần khác nhau giữa các ngành/hệ đào tạo.
        config.TranTinChiCongNhan = Number(PropertiesService.getScriptProperties().getProperty('TRAN_TIN_CHI_CONG_NHAN')) || 63;
        return responseJSON(200, "Thành công", config);
      }

function hdGet_layDanhSachMienVanBangCu(e) {
        const g = requireAuth(e.parameter, ['ThamDinh', 'Admin']);
        if (!g.ok) return g.resp;

        const SHEET_CTDT_ID = "1Kscs9TxM59T-Xt5F0nBLko6XL90BwZbXH95vZhv3a0w";
        const ssCTDT = SpreadsheetApp.openById(SHEET_CTDT_ID);
        const sheetMien = ssCTDT.getSheetByName("MienTheoVanBangCu");
        if (!sheetMien) {
          return responseJSON(404, "Chưa có tab 'MienTheoVanBangCu' trong Sheet khung CTĐT — vui lòng tự tạo tab này (đúng tên), hàng 1 là header gồm 3 cột: 'LOẠI VĂN BẰNG' (Đại học/Cao đẳng/Trung cấp), 'TÊN HỌC PHẦN', 'SỐ TÍN CHỈ'.", null);
        }

        const values = sheetMien.getDataRange().getValues();
        if (values.length <= 1) return responseJSON(200, "Thành công", []);
        const headers = values[0].map(h => String(h).toUpperCase().trim().replace(/\s+/g, ' '));
        const idxLoai = headers.indexOf("LOẠI VĂN BẰNG");
        const idxTen = headers.indexOf("TÊN HỌC PHẦN");
        const idxTC = headers.indexOf("SỐ TÍN CHỈ");
        if (idxLoai === -1 || idxTen === -1 || idxTC === -1) {
          return responseJSON(404, "Tab 'MienTheoVanBangCu' thiếu cột bắt buộc — cần đúng 3 header: 'LOẠI VĂN BẰNG', 'TÊN HỌC PHẦN', 'SỐ TÍN CHỈ'.", null);
        }

        const ketQua = [];
        for (let i = 1; i < values.length; i++) {
          const tenHocPhan = String(values[i][idxTen] || "").trim();
          const loaiVanBang = String(values[i][idxLoai] || "").trim();
          if (!tenHocPhan || !loaiVanBang) continue; // bỏ qua dòng trống
          ketQua.push({ loaiVanBang: loaiVanBang, tenHocPhan: tenHocPhan, soTinChi: Number(values[i][idxTC]) || 0 });
        }
        return responseJSON(200, "Thành công", ketQua);
      }

function hdGet_layDanhSachMienTheoChungChi(e) {
        const g = requireAuth(e.parameter, ['ThamDinh', 'Admin']);
        if (!g.ok) return g.resp;

        const SHEET_CTDT_ID = "1Kscs9TxM59T-Xt5F0nBLko6XL90BwZbXH95vZhv3a0w";
        const ssCTDT = SpreadsheetApp.openById(SHEET_CTDT_ID);
        const sheetMien = ssCTDT.getSheetByName("MienTheoChungChi");
        if (!sheetMien) {
          return responseJSON(404, "Chưa có tab 'MienTheoChungChi' trong Sheet khung CTĐT — vui lòng tự tạo tab này (đúng tên), hàng 1 là header gồm: 'LOẠI CHỨNG CHỈ', 'TÊN HỌC PHẦN', 'SỐ TÍN CHỈ', 'ĐIỂM QUY ĐỔI' (tuỳ chọn), 'HẠN THÁNG' (tuỳ chọn).", null);
        }

        const values = sheetMien.getDataRange().getValues();
        if (values.length <= 1) return responseJSON(200, "Thành công", []);
        const headers = values[0].map(h => String(h).toUpperCase().trim().replace(/\s+/g, ' '));
        const idxLoai = headers.indexOf("LOẠI CHỨNG CHỈ");
        const idxTen = headers.indexOf("TÊN HỌC PHẦN");
        const idxTC = headers.indexOf("SỐ TÍN CHỈ");
        const idxDiem = headers.indexOf("ĐIỂM QUY ĐỔI"); // tuỳ chọn — không bắt buộc phải có
        const idxHan = headers.indexOf("HẠN THÁNG"); // tuỳ chọn — chỉ có ý nghĩa với Ngoại ngữ (trừ Tiếng Trung)
        if (idxLoai === -1 || idxTen === -1 || idxTC === -1) {
          return responseJSON(404, "Tab 'MienTheoChungChi' thiếu cột bắt buộc — cần đúng 3 header: 'LOẠI CHỨNG CHỈ', 'TÊN HỌC PHẦN', 'SỐ TÍN CHỈ'.", null);
        }

        const ketQua = [];
        for (let i = 1; i < values.length; i++) {
          const tenHocPhan = String(values[i][idxTen] || "").trim();
          const loaiChungChi = String(values[i][idxLoai] || "").trim();
          if (!tenHocPhan || !loaiChungChi) continue; // bỏ qua dòng trống
          ketQua.push({
            loaiChungChi: loaiChungChi,
            tenHocPhan: tenHocPhan,
            soTinChi: Number(values[i][idxTC]) || 0,
            diemQuyDoi: idxDiem !== -1 ? (Number(values[i][idxDiem]) || 0) : 0,
            hanThang: idxHan !== -1 ? (Number(values[i][idxHan]) || 0) : 0,
          });
        }
        return responseJSON(200, "Thành công", ketQua);
      }

function hdGet_getChiTieu(e) {
        const g = requireAuth(e.parameter, []);
        if (!g.ok) return g.resp;
        const sheetCT = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("ChiTieuTuyenSinh");
        if (!sheetCT) return responseJSON(404, "Vui lòng tạo Sheet có tên chính xác là 'ChiTieuTuyenSinh' (cột: Nam, Nganh, ChiTieu)", null);
        const dataCT = sheetCT.getDataRange().getValues();
        const items = [];
        if (dataCT.length > 1) {
          const headers = dataCT[0];
          const idxNam = headers.indexOf("Nam");
          const idxNganh = headers.indexOf("Nganh");
          const idxChiTieu = headers.indexOf("ChiTieu");
          if (idxNam === -1 || idxNganh === -1 || idxChiTieu === -1) {
            return responseJSON(400, "Sheet 'ChiTieuTuyenSinh' thiếu cột Nam/Nganh/ChiTieu", null);
          }
          for (let i = 1; i < dataCT.length; i++) {
            const nam = String(dataCT[i][idxNam] || "").trim();
            const nganh = String(dataCT[i][idxNganh] || "").trim();
            if (!nam || !nganh) continue;
            items.push({ nam: nam, nganh: nganh, chiTieu: Number(dataCT[i][idxChiTieu]) || 0 });
          }
        }
        return responseJSON(200, "Thành công", items);
      }

function hdGet_timKiemKhoSinhVien(e) {
        const g = requireAuth(e.parameter, ['CanBo', 'TuyenSinh', 'ThamDinh', 'Admin']);
        if (!g.ok) return g.resp;

        // ĐÃ THÊM: đọc 4 nguồn thô (Trung Gian + KETQUA + Đào tạo + mã định danh phụ) qua
        // lớp cache kho_layDuLieuTho_() thay vì tự mở/đọc từng sheet ở đây mỗi lần — xem
        // chú thích đầy đủ tại các hàm kho_* phía trên (tìm 'ĐÃ THÊM: bộ nhớ đệm'). Toàn bộ
        // phần lọc/ghép/phân trang bên dưới GIỮ NGUYÊN như cũ, chỉ đổi nguồn lấy dữ liệu thô.
        const duLieuTho = kho_layDuLieuTho_();
        const tgHeaders = duLieuTho.tgHeaders;
        const tgValues = duLieuTho.tgValues;
        if (tgValues.length <= 1) return responseJSON(200, "Thành công", { items: [], tongSo: 0, trang: 1, kichThuoc: 20, tongTrang: 0 });

        const idxCccdTG = timCotTheoTen(tgHeaders, "CĂN CƯỚC", "SỐ CCCD", "CCCD");
        const idxHoTenTG = timCotTheoTen(tgHeaders, "TÊN SINH VIÊN", "HỌ VÀ TÊN", "HỌ TÊN");
        const idxNganhTG = timCotTheoTen(tgHeaders, "NGÀNH", "NGÀNH ĐÀO TẠO");
        const idxKhoaTG = timCotTheoTen(tgHeaders, "KHÓA");
        const idxHeDTTG = timCotTheoTen(tgHeaders, "HỆ ĐÀO TẠO");
        const idxHinhThucTG = timCotTheoTen(tgHeaders, "HÌNH THỨC ĐÀO TẠO");
        const idxNamXTTG = timCotTheoTen(tgHeaders, "NĂM XÉT TUYỂN");
        const idxTrangThaiTG = timCotTheoTen(tgHeaders, "TRẠNG THÁI THẨM ĐỊNH", "TRẠNG THÁI");
        const idxKenhNopTG = timCotTheoTen(tgHeaders, "KÊNH NỘP");
        const idxSvKeyTG = timCotTheoTen(tgHeaders, "SV_KEY");
        const idxNgayNopTG = timCotTheoTen(tgHeaders, "TIME", "NGÀY NỘP", "NGÀY XỬ LÝ");
        // ĐÃ THÊM (2026-09-10 — ưu tiên hiển thị Mã sinh viên THẬT): đọc thẳng cột "MÃ SINH
        // VIÊN" ngay trên Trung Gian/Goc01 (hồ sơ CŨ nhập tay qua "Hồ sơ cũ (có MSV)" bên
        // Xét tuyển sẽ có sẵn ở đây) — dùng làm ưu tiên THỨ NHÌ, sau KETQUA, trước khi tự sinh.
        const idxMaSVTG = timCotTheoTen(tgHeaders, "MÃ SINH VIÊN", "MÃ SV");

        // ---- 2) Sheet KETQUA (đã duyệt trúng tuyển chính thức) ----
        const kqValues = duLieuTho.kqValues;
        const ketQuaMap = {}; // key -> { ngayDuyet, maSinhVien }
        if (kqValues.length > 1) {
          const kqHeaders = kqValues[0].map(h => String(h).toUpperCase().trim().replace(/\s+/g, ' '));
          const idxCccdKQ = timCotTheoTen(kqHeaders, "CĂN CƯỚC", "SỐ CCCD", "CCCD");
          const idxNganhKQ = timCotTheoTen(kqHeaders, "NGÀNH ĐÀO TẠO", "NGÀNH");
          const idxNgayKQ = timCotTheoTen(kqHeaders, "NGÀY CẬP NHẬT HỒ SƠ", "NGÀY CẬP NHẬT");
          const idxMaSVKQ = timCotTheoTen(kqHeaders, "MÃ SINH VIÊN", "MÃ SV");
          if (idxCccdKQ !== -1 && idxNganhKQ !== -1) {
            for (let i = 1; i < kqValues.length; i++) {
              const cccdK = String(kqValues[i][idxCccdKQ] || "").replace(/^['"]+|['"]+$/g, '').trim();
              const nganhK = String(kqValues[i][idxNganhKQ] || "").trim().toLowerCase();
              if (!cccdK) continue;
              const ngayDuyetVal = idxNgayKQ !== -1 ? kqValues[i][idxNgayKQ] : "";
              ketQuaMap[cccdK + "_" + nganhK] = {
                ngayDuyet: ngayDuyetVal instanceof Date ? Utilities.formatDate(ngayDuyetVal, "GMT+7", "dd/MM/yyyy") : String(ngayDuyetVal || ""),
                maSinhVien: idxMaSVKQ !== -1 ? String(kqValues[i][idxMaSVKQ] || "").replace(/^['"]+|['"]+$/g, '') : ""
              };
            }
          }
        }

        // ---- 3) Sheet Đào tạo (đã bàn giao — tab đầu tiên của CHÍNH spreadsheet KETQUA) ----
        const dtValues = duLieuTho.dtValues;
        const daoTaoMap = {}; // key -> { ngayBanGiao }
        if (dtValues.length > 1) {
          const dtHeaders = dtValues[0].map(h => String(h).toUpperCase().trim().replace(/\s+/g, ' '));
          const idxCccdDT = timCotTheoTen(dtHeaders, "CĂN CƯỚC", "SỐ CCCD", "CCCD");
          const idxNganhDT = timCotTheoTen(dtHeaders, "NGÀNH", "NGÀNH ĐÀO TẠO");
          const idxNgayDT = timCotTheoTen(dtHeaders, "NGÀY CẬP NHẬT HỒ SƠ", "NGÀY CẬP NHẬT");
          if (idxCccdDT !== -1 && idxNganhDT !== -1) {
            for (let i = 1; i < dtValues.length; i++) {
              const cccdD = String(dtValues[i][idxCccdDT] || "").replace(/^['"]+|['"]+$/g, '').trim();
              const nganhD = String(dtValues[i][idxNganhDT] || "").trim().toLowerCase();
              if (!cccdD) continue;
              const ngayBanGiaoVal = idxNgayDT !== -1 ? dtValues[i][idxNgayDT] : "";
              daoTaoMap[cccdD + "_" + nganhD] = {
                ngayBanGiao: ngayBanGiaoVal instanceof Date ? Utilities.formatDate(ngayBanGiaoVal, "GMT+7", "dd/MM/yyyy") : String(ngayBanGiaoVal || "")
              };
            }
          }
        }

        // ---- Từ khoá theo MÃ PHỤ (mã định danh do module khác cấp, xem DinhDanh.gs) ----
        // Nếu từ khoá khớp 1 mã phụ ĐANG HIỆU LỰC nào đó -> lấy sv_key tương ứng, dùng để
        // khớp thêm với cột SV_KEY trên Trung Gian (chỉ hồ sơ đã được gắn sv_key mới tìm
        // được theo đường này — hồ sơ nào chưa gắn thì tìm theo tên/CCCD/mã SV như thường).
        const tuKhoa = String(e.parameter.tuKhoa || "").trim();
        let svKeyKhopTuKhoa = null;
        if (tuKhoa && idxSvKeyTG !== -1) {
          // maPhuData đã đọc sẵn trong kho_layDuLieuTho_() (mảng rỗng nếu chưa cài đặt phần
          // định danh SetupDinhDanh.gs hoặc đọc lỗi — không cần try/catch riêng ở đây nữa).
          const maPhuData = duLieuTho.maPhuData;
          const tkMa = chuanHoaMaSo_(tuKhoa);
          for (let i = 1; i < maPhuData.length; i++) {
            if (!maPhuData[i][5] && chuanHoaMaSo_(maPhuData[i][2]) === tkMa) { svKeyKhopTuKhoa = maPhuData[i][0]; break; }
          }
        }

        // ---- Tham số lọc/phân trang ----
        const fNganh = String(e.parameter.nganh || "").trim();
        const fKhoa = String(e.parameter.khoa || "").trim();
        const fHeDaoTao = String(e.parameter.heDaoTao || "").trim();
        const fHinhThuc = String(e.parameter.hinhThucDaoTao || "").trim();
        const fNamXT = String(e.parameter.namXetTuyen || "").trim();
        const fTrangThai = String(e.parameter.trangThai || "").trim();
        const fTuNgay = e.parameter.tuNgay ? new Date(e.parameter.tuNgay) : null;
        if (fTuNgay) fTuNgay.setHours(0, 0, 0, 0);
        const fDenNgay = e.parameter.denNgay ? new Date(e.parameter.denNgay) : null;
        if (fDenNgay) fDenNgay.setHours(23, 59, 59, 999);
        const trang = Math.max(1, parseInt(e.parameter.trang, 10) || 1);
        const kichThuoc = Math.min(100, Math.max(1, parseInt(e.parameter.kichThuoc, 10) || 20));
        const tkChuan = tuKhoa ? chuanHoaHoTen_(tuKhoa) : "";
        const tkMaChuan = tuKhoa ? chuanHoaMaSo_(tuKhoa) : "";

        // ---- Ghép 3 nguồn + lọc ----
        const ketQuaLoc = [];
        for (let i = 1; i < tgValues.length; i++) {
          const row = tgValues[i];
          const cccd = idxCccdTG !== -1 ? String(row[idxCccdTG] || "").replace(/^['"]+|['"]+$/g, '').trim() : "";
          if (!cccd) continue; // không có CCCD thì không đủ để ghép khoá — bỏ qua (giống mọi chỗ chống trùng khác).
          const nganh = idxNganhTG !== -1 ? String(row[idxNganhTG] || "").trim() : "";
          const key = cccd + "_" + nganh.toLowerCase();
          const hoTen = idxHoTenTG !== -1 ? String(row[idxHoTenTG] || "") : "";
          const khoa = idxKhoaTG !== -1 ? String(row[idxKhoaTG] || "") : "";
          const heDaoTao = idxHeDTTG !== -1 ? String(row[idxHeDTTG] || "") : "";
          const hinhThuc = idxHinhThucTG !== -1 ? String(row[idxHinhThucTG] || "") : "";
          const namXT = idxNamXTTG !== -1 ? String(row[idxNamXTTG] || "") : "";
          const kenhNop = idxKenhNopTG !== -1 ? String(row[idxKenhNopTG] || "") : "";
          const svKey = idxSvKeyTG !== -1 ? String(row[idxSvKeyTG] || "").trim() : "";
          const ngayNopRaw = idxNgayNopTG !== -1 ? row[idxNgayNopTG] : "";

          if (fNganh && nganh !== fNganh) continue;
          if (fKhoa && khoa !== fKhoa) continue;
          if (fHeDaoTao && heDaoTao !== fHeDaoTao) continue;
          if (fHinhThuc && hinhThuc !== fHinhThuc) continue;
          if (fNamXT && namXT !== fNamXT) continue;

          const ketQuaCuaHang = ketQuaMap[key];
          const daoTaoCuaHang = daoTaoMap[key];
          // generateMaSVTuChung() trả về có dấu nháy đơn ' đứng đầu (để Sheets ép kiểu Text
          // nếu ghi trực tiếp xuống ô) — ở đây chỉ dùng để HIỂN THỊ/TÌM KIẾM nên phải bỏ đi,
          // giống cách mọi nơi khác vẫn làm với CCCD/MSV đọc từ sheet.
          // ĐÃ SỬA (2026-09-10): thêm ưu tiên THỨ NHÌ — Mã sinh viên đọc thẳng trên chính
          // Trung Gian (idxMaSVTG) — trước đây thiếu bậc này nên hồ sơ CŨ đã có MSV thật
          // nhưng CHƯA có trong KETQUA vẫn bị hiện mã tự sinh giả. Thứ tự đúng: KETQUA ->
          // Mã sinh viên ở Goc01 -> tự sinh (chỉ khi cả 2 đều trống).
          const maSVGoc01 = idxMaSVTG !== -1 ? String(row[idxMaSVTG] || "").replace(/^['"]+|['"]+$/g, '').trim() : "";
          const maSinhVien = (ketQuaCuaHang && ketQuaCuaHang.maSinhVien)
            || maSVGoc01
            || (namXT && heDaoTao && hinhThuc && cccd ? generateMaSVTuChung(namXT, heDaoTao, hinhThuc, cccd).replace(/^'/, '') : "");
          const trangThaiVongDoi = suyRaTrangThaiVongDoi_(
            idxTrangThaiTG !== -1 ? String(row[idxTrangThaiTG] || "") : "", !!ketQuaCuaHang, !!daoTaoCuaHang
          );
          if (fTrangThai && trangThaiVongDoi !== fTrangThai) continue;

          // Ngày nộp — đủ định dạng (Date thật hoặc chuỗi dd/mm/yyyy hay yyyy-mm-dd, xem
          // cùng cách getRawDateNumber() bên frontend thamDinhHelpers.js đang xử lý).
          let ngayNopMs = 0, ngayNopHienThi = "";
          if (ngayNopRaw instanceof Date) {
            ngayNopMs = ngayNopRaw.getTime();
            ngayNopHienThi = Utilities.formatDate(ngayNopRaw, "GMT+7", "dd/MM/yyyy");
          } else if (ngayNopRaw) {
            const raw = String(ngayNopRaw).trim();
            const token = raw.split(' ').find(p => p.indexOf('/') !== -1 || p.indexOf('-') !== -1) || '';
            let d = null;
            if (token.indexOf('-') !== -1) { const p = token.split('-'); d = new Date(p[0], p[1] - 1, p[2]); }
            else if (token.indexOf('/') !== -1) { const p = token.split('/'); d = new Date(p[2], p[1] - 1, p[0]); }
            if (d && !isNaN(d.getTime())) { ngayNopMs = d.getTime(); ngayNopHienThi = Utilities.formatDate(d, "GMT+7", "dd/MM/yyyy"); }
          }
          if (fTuNgay && (!ngayNopMs || ngayNopMs < fTuNgay.getTime())) continue;
          if (fDenNgay && (!ngayNopMs || ngayNopMs > fDenNgay.getTime())) continue;

          if (tuKhoa) {
            const khopTen = tkChuan && chuanHoaHoTen_(hoTen).indexOf(tkChuan) !== -1;
            const khopCccd = tkMaChuan && cccd.indexOf(tkMaChuan) !== -1;
            const khopMaSV = tkMaChuan && maSinhVien && chuanHoaMaSo_(maSinhVien).indexOf(tkMaChuan) !== -1;
            const khopSvKey = svKey && (svKey === tuKhoa.trim());
            const khopMaPhu = svKeyKhopTuKhoa && svKey && svKey === svKeyKhopTuKhoa;
            if (!khopTen && !khopCccd && !khopMaSV && !khopSvKey && !khopMaPhu) continue;
          }

          ketQuaLoc.push({
            cccd: cccd, hoTen: hoTen, nganh: nganh, khoa: khoa, heDaoTao: heDaoTao, hinhThucDaoTao: hinhThuc,
            namXetTuyen: namXT, kenhNop: kenhNop, maSinhVien: maSinhVien, svKey: svKey,
            trangThai: trangThaiVongDoi, ngayNop: ngayNopHienThi, ngayNopMs: ngayNopMs,
            ngayDuyet: ketQuaCuaHang ? ketQuaCuaHang.ngayDuyet : "", ngayBanGiao: daoTaoCuaHang ? daoTaoCuaHang.ngayBanGiao : ""
          });
        }

        // Mặc định mới nộp nhất trước (giống ThamDinhPage) — có thể mở rộng tham số sortBy sau.
        ketQuaLoc.sort((a, b) => b.ngayNopMs - a.ngayNopMs);

        const tongSo = ketQuaLoc.length;
        const batDau = (trang - 1) * kichThuoc;
        const trangHienTai = ketQuaLoc.slice(batDau, batDau + kichThuoc);

        return responseJSON(200, "Thành công", {
          items: trangHienTai, tongSo: tongSo, trang: trang, kichThuoc: kichThuoc,
          tongTrang: Math.max(1, Math.ceil(tongSo / kichThuoc))
        });
      }

function hdGet_layThongKeKho(e) {
        const g = requireAuth(e.parameter, ['CanBo', 'TuyenSinh', 'ThamDinh', 'Admin']);
        if (!g.ok) return g.resp;

        const duLieuTho = kho_layDuLieuTho_();
        const tgHeaders = duLieuTho.tgHeaders;
        const tgValues = duLieuTho.tgValues;
        const fNamXT = String(e.parameter.namXetTuyen || "").trim();

        if (tgValues.length <= 1) {
          return responseJSON(200, "Thành công", {
            namXetTuyen: fNamXT, tongHoSo: 0, theoTrangThai: [], theoNganh: [], theoKhoa: [], theoHeDaoTao: [], theoHinhThuc: [],
            tongDaTrungTuyen: 0, tongChiTieu: null, phanTramTong: null
          });
        }

        const idxCccdTG = timCotTheoTen(tgHeaders, "CĂN CƯỚC", "SỐ CCCD", "CCCD");
        const idxNganhTG = timCotTheoTen(tgHeaders, "NGÀNH", "NGÀNH ĐÀO TẠO");
        const idxKhoaTG = timCotTheoTen(tgHeaders, "KHÓA");
        const idxHeDTTG = timCotTheoTen(tgHeaders, "HỆ ĐÀO TẠO");
        const idxHinhThucTG = timCotTheoTen(tgHeaders, "HÌNH THỨC ĐÀO TẠO");
        const idxNamXTTG = timCotTheoTen(tgHeaders, "NĂM XÉT TUYỂN");
        const idxTrangThaiTG = timCotTheoTen(tgHeaders, "TRẠNG THÁI THẨM ĐỊNH", "TRẠNG THÁI");

        // ---- Map KETQUA + Đào tạo (giống hệt cách 'timKiemKhoSinhVien' đang làm, chỉ bớt
        // các trường không cần cho thống kê — xem action đó để đối chiếu logic). ----
        const kqValues = duLieuTho.kqValues;
        const ketQuaMap = {};
        if (kqValues.length > 1) {
          const kqHeaders = kqValues[0].map(h => String(h).toUpperCase().trim().replace(/\s+/g, ' '));
          const idxCccdKQ = timCotTheoTen(kqHeaders, "CĂN CƯỚC", "SỐ CCCD", "CCCD");
          const idxNganhKQ = timCotTheoTen(kqHeaders, "NGÀNH ĐÀO TẠO", "NGÀNH");
          if (idxCccdKQ !== -1 && idxNganhKQ !== -1) {
            for (let i = 1; i < kqValues.length; i++) {
              const cccdK = String(kqValues[i][idxCccdKQ] || "").replace(/^['"]+|['"]+$/g, '').trim();
              const nganhK = String(kqValues[i][idxNganhKQ] || "").trim().toLowerCase();
              if (!cccdK) continue;
              ketQuaMap[cccdK + "_" + nganhK] = true;
            }
          }
        }

        const dtValues = duLieuTho.dtValues;
        const daoTaoMap = {};
        if (dtValues.length > 1) {
          const dtHeaders = dtValues[0].map(h => String(h).toUpperCase().trim().replace(/\s+/g, ' '));
          const idxCccdDT = timCotTheoTen(dtHeaders, "CĂN CƯỚC", "SỐ CCCD", "CCCD");
          const idxNganhDT = timCotTheoTen(dtHeaders, "NGÀNH", "NGÀNH ĐÀO TẠO");
          if (idxCccdDT !== -1 && idxNganhDT !== -1) {
            for (let i = 1; i < dtValues.length; i++) {
              const cccdD = String(dtValues[i][idxCccdDT] || "").replace(/^['"]+|['"]+$/g, '').trim();
              const nganhD = String(dtValues[i][idxNganhDT] || "").trim().toLowerCase();
              if (!cccdD) continue;
              daoTaoMap[cccdD + "_" + nganhD] = true;
            }
          }
        }

        // ---- Duyệt Trung Gian, gộp số liệu (chỉ lọc theo năm nếu có chọn) ----
        const demTrangThai = {};
        const demTheoNganh = {}; // nganh -> { tongHoSo, daTrungTuyen }
        const demTheoKhoa = {};
        const demTheoHe = {};
        const demTheoHinhThuc = {};
        let tongHoSo = 0;
        let tongDaTrungTuyen = 0;

        for (let i = 1; i < tgValues.length; i++) {
          const row = tgValues[i];
          const cccd = idxCccdTG !== -1 ? String(row[idxCccdTG] || "").replace(/^['"]+|['"]+$/g, '').trim() : "";
          if (!cccd) continue; // giống timKiemKhoSinhVien: không có CCCD thì không đủ để ghép khoá.
          const namXT = idxNamXTTG !== -1 ? String(row[idxNamXTTG] || "").trim() : "";
          if (fNamXT && namXT !== fNamXT) continue;

          const nganh = (idxNganhTG !== -1 ? String(row[idxNganhTG] || "").trim() : "") || "(Chưa rõ ngành)";
          const khoa = (idxKhoaTG !== -1 ? String(row[idxKhoaTG] || "").trim() : "") || "(Chưa rõ khóa)";
          const heDaoTao = (idxHeDTTG !== -1 ? String(row[idxHeDTTG] || "").trim() : "") || "(Chưa rõ hệ)";
          const hinhThuc = (idxHinhThucTG !== -1 ? String(row[idxHinhThucTG] || "").trim() : "") || "(Chưa rõ hình thức)";
          // Khoá ghép dùng NGÀNH GỐC (chưa gán "(Chưa rõ ngành)") để khớp đúng ketQuaMap/
          // daoTaoMap — giống hệt khoá mà timKiemKhoSinhVien và mọi nơi chống trùng khác dùng.
          const nganhGoc = idxNganhTG !== -1 ? String(row[idxNganhTG] || "").trim() : "";
          const key = cccd + "_" + nganhGoc.toLowerCase();
          const coKetQua = !!ketQuaMap[key];
          const coDaoTao = !!daoTaoMap[key];
          const trangThaiVongDoi = suyRaTrangThaiVongDoi_(
            idxTrangThaiTG !== -1 ? String(row[idxTrangThaiTG] || "") : "", coKetQua, coDaoTao
          );

          tongHoSo++;
          demTrangThai[trangThaiVongDoi] = (demTrangThai[trangThaiVongDoi] || 0) + 1;
          demTheoKhoa[khoa] = (demTheoKhoa[khoa] || 0) + 1;
          demTheoHe[heDaoTao] = (demTheoHe[heDaoTao] || 0) + 1;
          demTheoHinhThuc[hinhThuc] = (demTheoHinhThuc[hinhThuc] || 0) + 1;

          if (!demTheoNganh[nganh]) demTheoNganh[nganh] = { tongHoSo: 0, daTrungTuyen: 0 };
          demTheoNganh[nganh].tongHoSo++;
          if (coKetQua) {
            demTheoNganh[nganh].daTrungTuyen++;
            tongDaTrungTuyen++;
          }
        }

        // ---- Ghép với chỉ tiêu tuyển sinh (sheet ChiTieuTuyenSinh, CHỈ khi đã chọn đúng
        // 1 năm cụ thể — xem giải thích ở đầu action). Đọc header y hệt cách action
        // 'getChiTieu' đang đọc (chính xác hoa/thường "Nam"/"Nganh"/"ChiTieu", không qua
        // timCotTheoTen vì sheet này do action getChiTieu/saveChiTieu tự quản, tên cột cố
        // định, không cần dò nhiều biến thể tên như các sheet nhập liệu thủ công khác). ----
        let tongChiTieu = null, phanTramTong = null;
        const theoNganh = Object.keys(demTheoNganh).sort().map(function (n) {
          return {
            nganh: n, tongHoSo: demTheoNganh[n].tongHoSo, daTrungTuyen: demTheoNganh[n].daTrungTuyen,
            chiTieu: null, phanTramNganh: null
          };
        });

        if (fNamXT) {
          const sheetCT = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("ChiTieuTuyenSinh");
          const ctValues = sheetCT ? sheetCT.getDataRange().getValues() : [];
          if (ctValues.length > 1) {
            const ctHeaders = ctValues[0];
            const idxNamCT = ctHeaders.indexOf("Nam");
            const idxNganhCT = ctHeaders.indexOf("Nganh");
            const idxChiTieuCT = ctHeaders.indexOf("ChiTieu");
            if (idxNamCT !== -1 && idxNganhCT !== -1 && idxChiTieuCT !== -1) {
              const chiTieuMap = {};
              let tongChiTieuNam = 0;
              for (let i = 1; i < ctValues.length; i++) {
                if (String(ctValues[i][idxNamCT]).trim() !== fNamXT) continue;
                const nganhCT = String(ctValues[i][idxNganhCT] || "").trim();
                const soCT = Number(ctValues[i][idxChiTieuCT]) || 0;
                if (!nganhCT) continue;
                chiTieuMap[nganhCT] = soCT;
                tongChiTieuNam += soCT;
              }
              if (tongChiTieuNam > 0) {
                tongChiTieu = tongChiTieuNam;
                phanTramTong = Math.round((tongDaTrungTuyen / tongChiTieuNam) * 1000) / 10; // làm tròn 1 số thập phân
              }
              theoNganh.forEach(function (item) {
                const ct = chiTieuMap[item.nganh];
                if (ct !== undefined && ct > 0) {
                  item.chiTieu = ct;
                  item.phanTramNganh = Math.round((item.daTrungTuyen / ct) * 1000) / 10;
                }
              });
            }
          }
        }

        const kho_demThanhMangSapXep_ = function (demObj) {
          return Object.keys(demObj).sort(function (a, b) { return demObj[b] - demObj[a]; }).map(function (k) {
            return { ten: k, soLuong: demObj[k] };
          });
        };

        return responseJSON(200, "Thành công", {
          namXetTuyen: fNamXT,
          tongHoSo: tongHoSo,
          theoTrangThai: kho_demThanhMangSapXep_(demTrangThai),
          theoNganh: theoNganh,
          theoKhoa: kho_demThanhMangSapXep_(demTheoKhoa),
          theoHeDaoTao: kho_demThanhMangSapXep_(demTheoHe),
          theoHinhThuc: kho_demThanhMangSapXep_(demTheoHinhThuc),
          tongDaTrungTuyen: tongDaTrungTuyen,
          tongChiTieu: tongChiTieu,
          phanTramTong: phanTramTong
        });
      }

function hdGet_layChiTietHoSoKho(e) {
        const g = requireAuth(e.parameter, ['CanBo', 'TuyenSinh', 'ThamDinh', 'Admin']);
        if (!g.ok) return g.resp;

        // ĐÃ SỬA (theo phản hồi): URL trang chi tiết hồ sơ trước đây lộ thẳng CCCD + Ngành
        // (/quan-ly-ho-so-moi/ho-so/:cccd/:nganh) — giờ trang Kho gửi lên "key8" (8 ký tự
        // cuối của SV_KEY, xem KhoSinhVienPage.jsx) thay cho cccd/nganh. Endpoint này VẪN
        // nhận cccd+nganh làm phương án dự phòng (chỉ dùng cho hồ sơ CŨ chưa từng được gắn
        // SV_KEY tự động — xem dinhDanhGanTuDongChoHoSoMoi_ — nên chưa có key8 để tra) chứ
        // không đổi hẳn, tránh hồ sơ cũ bỗng dưng không mở được nữa.
        const key8 = String(e.parameter.key8 || "").trim().toLowerCase();
        let cccd = String(e.parameter.cccd || "").trim();
        let nganh = String(e.parameter.nganh || "").trim();
        if (!key8 && (!cccd || !nganh)) return responseJSON(400, "Thiếu tham số key8 (hoặc cccd/nganh cho liên kết cũ)", null);

        const kho_hangThanhKV_ = function (headersGoc, row) {
          const kq = {};
          for (let i = 0; i < headersGoc.length; i++) {
            const ten = String(headersGoc[i] || "").trim();
            if (!ten) continue;
            let v = row[i];
            if (v instanceof Date) v = Utilities.formatDate(v, "GMT+7", "dd/MM/yyyy HH:mm");
            else v = String(v == null ? "" : v).replace(/^'/, '');
            if (v === "") continue;
            kq[ten] = v;
          }
          return kq;
        };

        // ---- 1) Trung Gian ----
        const { cleanHeaders: tgHeaders, headers: tgHeadersGoc, values: tgValues } = docTrunggianRaw();
        const idxCccdTG = timCotTheoTen(tgHeaders, "CĂN CƯỚC", "SỐ CCCD", "CCCD");
        const idxNganhTG = timCotTheoTen(tgHeaders, "NGÀNH", "NGÀNH ĐÀO TẠO");
        const idxSvKeyTG = timCotTheoTen(tgHeaders, "SV_KEY");
        let hangTG = null;
        for (let i = 1; i < tgValues.length; i++) {
          if (key8) {
            const svk = idxSvKeyTG !== -1 ? String(tgValues[i][idxSvKeyTG] || "").trim().toLowerCase() : "";
            if (!svk || svk.slice(-8) !== key8) continue;
            hangTG = tgValues[i];
            cccd = idxCccdTG !== -1 ? String(hangTG[idxCccdTG] || "").replace(/^['"]+|['"]+$/g, '').trim() : "";
            nganh = idxNganhTG !== -1 ? String(hangTG[idxNganhTG] || "").trim() : "";
            break;
          }
          const c = idxCccdTG !== -1 ? String(tgValues[i][idxCccdTG] || "").replace(/^['"]+|['"]+$/g, '').trim() : "";
          if (!c || c !== cccd) continue;
          const n = idxNganhTG !== -1 ? String(tgValues[i][idxNganhTG] || "").trim() : "";
          if (n.toLowerCase() === nganh.toLowerCase()) { hangTG = tgValues[i]; break; }
        }
        if (!hangTG) return responseJSON(404, key8 ? "Không tìm thấy hồ sơ (mã liên kết không khớp bản ghi nào)" : "Không tìm thấy hồ sơ (CCCD + Ngành không khớp bản ghi nào)", null);

        const idxHoTenTG = timCotTheoTen(tgHeaders, "TÊN SINH VIÊN", "HỌ VÀ TÊN", "HỌ TÊN");
        const idxKhoaTG = timCotTheoTen(tgHeaders, "KHÓA");
        const idxHeDTTG = timCotTheoTen(tgHeaders, "HỆ ĐÀO TẠO");
        const idxHinhThucTG = timCotTheoTen(tgHeaders, "HÌNH THỨC ĐÀO TẠO");
        const idxNamXTTG = timCotTheoTen(tgHeaders, "NĂM XÉT TUYỂN");
        const idxTrangThaiTG = timCotTheoTen(tgHeaders, "TRẠNG THÁI THẨM ĐỊNH", "TRẠNG THÁI");
        const idxKenhNopTG = timCotTheoTen(tgHeaders, "KÊNH NỘP");
        const idxNgayNopTG = timCotTheoTen(tgHeaders, "TIME", "NGÀY NỘP", "NGÀY XỬ LÝ");
        // ĐÃ THÊM (2026-09-10 — xem chú thích đầy đủ tại hdGet_timKiemKhoSinhVien): ưu tiên
        // THỨ NHÌ cho Mã sinh viên hiển thị, đọc thẳng trên Trung Gian.
        const idxMaSVTG = timCotTheoTen(tgHeaders, "MÃ SINH VIÊN", "MÃ SV");

        const hoTen = idxHoTenTG !== -1 ? String(hangTG[idxHoTenTG] || "") : "";
        const khoa = idxKhoaTG !== -1 ? String(hangTG[idxKhoaTG] || "") : "";
        const heDaoTao = idxHeDTTG !== -1 ? String(hangTG[idxHeDTTG] || "") : "";
        const hinhThuc = idxHinhThucTG !== -1 ? String(hangTG[idxHinhThucTG] || "") : "";
        const namXT = idxNamXTTG !== -1 ? String(hangTG[idxNamXTTG] || "") : "";
        const kenhNop = idxKenhNopTG !== -1 ? String(hangTG[idxKenhNopTG] || "") : "";
        const svKey = idxSvKeyTG !== -1 ? String(hangTG[idxSvKeyTG] || "").trim() : "";

        let ngayNopHienThi = "";
        const ngayNopRaw = idxNgayNopTG !== -1 ? hangTG[idxNgayNopTG] : "";
        if (ngayNopRaw instanceof Date) ngayNopHienThi = Utilities.formatDate(ngayNopRaw, "GMT+7", "dd/MM/yyyy HH:mm");
        else if (ngayNopRaw) ngayNopHienThi = String(ngayNopRaw);

        // ---- 2) KETQUA ----
        const KETQUA_SHEET_ID = PropertiesService.getScriptProperties().getProperty('KETQUA_SHEET_ID');
        const ssKQ = SpreadsheetApp.openById(KETQUA_SHEET_ID);
        const sheetKQ = ssKQ.getSheetByName("KETQUA");
        const kqValues = sheetKQ ? sheetKQ.getDataRange().getValues() : [];
        let hangKQ = null, kqHeadersGoc = [], kqHeaders = [];
        if (kqValues.length > 1) {
          kqHeadersGoc = kqValues[0];
          kqHeaders = kqHeadersGoc.map(h => String(h).toUpperCase().trim().replace(/\s+/g, ' '));
          const idxCccdKQ = timCotTheoTen(kqHeaders, "CĂN CƯỚC", "SỐ CCCD", "CCCD");
          const idxNganhKQ = timCotTheoTen(kqHeaders, "NGÀNH ĐÀO TẠO", "NGÀNH");
          if (idxCccdKQ !== -1 && idxNganhKQ !== -1) {
            for (let i = 1; i < kqValues.length; i++) {
              const c = String(kqValues[i][idxCccdKQ] || "").replace(/^['"]+|['"]+$/g, '').trim();
              if (!c || c !== cccd) continue;
              const n = String(kqValues[i][idxNganhKQ] || "").trim();
              if (n.toLowerCase() === nganh.toLowerCase()) { hangKQ = kqValues[i]; break; }
            }
          }
        }

        // ---- 3) Đào tạo ----
        const sheetDT = ssKQ.getSheets()[0];
        const dtValues = sheetDT ? sheetDT.getDataRange().getValues() : [];
        let hangDT = null, dtHeadersGoc = [], dtHeaders = [];
        if (dtValues.length > 1) {
          dtHeadersGoc = dtValues[0];
          dtHeaders = dtHeadersGoc.map(h => String(h).toUpperCase().trim().replace(/\s+/g, ' '));
          const idxCccdDT = timCotTheoTen(dtHeaders, "CĂN CƯỚC", "SỐ CCCD", "CCCD");
          const idxNganhDT = timCotTheoTen(dtHeaders, "NGÀNH", "NGÀNH ĐÀO TẠO");
          if (idxCccdDT !== -1 && idxNganhDT !== -1) {
            for (let i = 1; i < dtValues.length; i++) {
              const c = String(dtValues[i][idxCccdDT] || "").replace(/^['"]+|['"]+$/g, '').trim();
              if (!c || c !== cccd) continue;
              const n = String(dtValues[i][idxNganhDT] || "").trim();
              if (n.toLowerCase() === nganh.toLowerCase()) { hangDT = dtValues[i]; break; }
            }
          }
        }

        const ngayDuyet = (function () {
          if (!hangKQ) return "";
          const idxNgay = timCotTheoTen(kqHeaders, "NGÀY CẬP NHẬT HỒ SƠ", "NGÀY CẬP NHẬT");
          const v = idxNgay !== -1 ? hangKQ[idxNgay] : "";
          return v instanceof Date ? Utilities.formatDate(v, "GMT+7", "dd/MM/yyyy HH:mm") : String(v || "");
        })();
        const maSinhVienTuKQ = (function () {
          if (!hangKQ) return "";
          const idxMa = timCotTheoTen(kqHeaders, "MÃ SINH VIÊN", "MÃ SV");
          return idxMa !== -1 ? String(hangKQ[idxMa] || "").replace(/^['"]+|['"]+$/g, '') : "";
        })();
        const ngayBanGiao = (function () {
          if (!hangDT) return "";
          const idxNgay = timCotTheoTen(dtHeaders, "NGÀY CẬP NHẬT HỒ SƠ", "NGÀY CẬP NHẬT");
          const v = idxNgay !== -1 ? hangDT[idxNgay] : "";
          return v instanceof Date ? Utilities.formatDate(v, "GMT+7", "dd/MM/yyyy HH:mm") : String(v || "");
        })();

        // ĐÃ SỬA (2026-09-10): thêm ưu tiên THỨ NHÌ (Mã sinh viên ở Goc01/Trung Gian) trước
        // khi rơi xuống tự sinh — xem chú thích đầy đủ tại hdGet_timKiemKhoSinhVien.
        const maSVGoc01 = idxMaSVTG !== -1 ? String(hangTG[idxMaSVTG] || "").replace(/^['"]+|['"]+$/g, '').trim() : "";
        const maSinhVien = maSinhVienTuKQ
          || maSVGoc01
          || (namXT && heDaoTao && hinhThuc && cccd ? generateMaSVTuChung(namXT, heDaoTao, hinhThuc, cccd).replace(/^'/, '') : "");
        const trangThaiVongDoi = suyRaTrangThaiVongDoi_(
          idxTrangThaiTG !== -1 ? String(hangTG[idxTrangThaiTG] || "") : "", !!hangKQ, !!hangDT
        );

        // ---- Mã định danh phụ ĐANG HIỆU LỰC gắn với sv_key này (nếu hồ sơ đã được gắn
        // định danh) — đây là chỗ dữ liệu sẽ "dày lên" khi kết nối thêm module khác sau này. ----
        let maPhu = [];
        if (svKey) {
          try {
            const maPhuData = layTabDinhDanhPhu_().getDataRange().getValues();
            for (let i = 1; i < maPhuData.length; i++) {
              if (String(maPhuData[i][0]).trim() !== svKey) continue;
              if (maPhuData[i][5]) continue; // có ngày hiệu_lực_đến -> đã hết hiệu lực, bỏ qua
              maPhu.push({
                loaiMa: String(maPhuData[i][1] || ""),
                giaTri: String(maPhuData[i][2] || ""),
                nguonCap: String(maPhuData[i][3] || ""),
                hieuLucTu: maPhuData[i][4] instanceof Date ? Utilities.formatDate(maPhuData[i][4], "GMT+7", "dd/MM/yyyy") : String(maPhuData[i][4] || "")
              });
            }
          } catch (errMaPhu) { /* Chưa cài đặt phần định danh (SetupDinhDanh.gs) thì bỏ qua. */ }
        }

        return responseJSON(200, "Thành công", {
          cccd: cccd, nganh: nganh, hoTen: hoTen, khoa: khoa, heDaoTao: heDaoTao, hinhThucDaoTao: hinhThuc,
          namXetTuyen: namXT, kenhNop: kenhNop, maSinhVien: maSinhVien, svKey: svKey, trangThai: trangThaiVongDoi,
          timeline: [
            { buoc: "Nộp hồ sơ", ngay: ngayNopHienThi, xong: !!ngayNopHienThi },
            { buoc: "Duyệt trúng tuyển", ngay: ngayDuyet, xong: !!hangKQ },
            { buoc: "Bàn giao Đào tạo", ngay: ngayBanGiao, xong: !!hangDT }
          ],
          maPhu: maPhu,
          chiTietTrungGian: kho_hangThanhKV_(tgHeadersGoc, hangTG),
          chiTietKetQua: hangKQ ? kho_hangThanhKV_(kqHeadersGoc, hangKQ) : null,
          chiTietDaoTao: hangDT ? kho_hangThanhKV_(dtHeadersGoc, hangDT) : null
        });
      }

function hdGet_layBangDiemDaoTao(e) {
        const g = requireAuth(e.parameter, ['CanBo', 'TuyenSinh', 'ThamDinh', 'Admin']);
        if (!g.ok) return g.resp;

        const nganh = String(e.parameter.nganh || "").trim();
        const maSinhVien = String(e.parameter.maSinhVien || "").replace(/^['"]+|['"]+$/g, '').trim();
        if (!nganh || !maSinhVien) return responseJSON(400, "Thiếu tham số nganh/maSinhVien", null);

        // File Google Sheets đích đã được mirror TOÀN BỘ từ file nguồn Đào tạo (mỗi ngành 1
        // sheet) — ID này khớp đúng file ông đã tạo + share cho tài khoản đang chạy Web App.
        // ĐÃ SỬA (theo yêu cầu — thêm khối tóm tắt tín chỉ ở tab "Điểm số"): gộp tên sheet +
        // tổng số tín chỉ toàn khoá (khác nhau tuỳ chương trình đào tạo của từng ngành) vào
        // CHUNG 1 object cấu hình/ngành, thay vì để riêng 1 bảng tra tên sheet như trước.
        const BANGDIEM_DAOTAO_ID = "1ZTjp9IL3Pfmw4Rv7DNgplgit3_y0T3lN6TOx0pIDHgU";
        const NGANH_CAU_HINH_DIEM = {
          "Quản trị kinh doanh": { sheet: "QTKD K2,3", tongTinChiCanHoc: 126 },
        };
        const capNhatDiem = NGANH_CAU_HINH_DIEM[nganh];
        // ĐÃ CHỌN trả code 200 kèm cờ "coDuLieu:false" (thay vì 404) cho MỌI trường hợp
        // "chưa có dữ liệu" ở dưới — đây là trạng thái BÌNH THƯỜNG (ngành chưa cấu hình/sinh
        // viên chưa có điểm kỳ này...), KHÔNG phải lỗi, để tab "Điểm số" bên React hiện
        // thông báo nhẹ nhàng thay vì rơi vào nhánh isError của useQuery.
        if (!capNhatDiem) return responseJSON(200, "Ngành chưa được cấu hình liên kết dữ liệu điểm", { coDuLieu: false, lyDo: "CHUA_CAU_HINH_NGANH" });
        const tenSheet = capNhatDiem.sheet;

        const ssDiem = SpreadsheetApp.openById(BANGDIEM_DAOTAO_ID);
        const sheetDiem = ssDiem.getSheetByName(tenSheet);
        if (!sheetDiem) return responseJSON(200, "Không tìm thấy sheet điểm cho ngành này (tên sheet có thể chưa khớp)", { coDuLieu: false, lyDo: "KHONG_THAY_SHEET" });

        const duLieuDiem = sheetDiem.getDataRange().getValues();
        // Quy ước cấu trúc sheet điểm (đã chốt với người dùng): hàng 4 (index 3) = tiêu đề
        // môn học; hàng 5 (index 4, ngay dưới hàng tên môn) = số TÍN CHỈ của từng môn, cùng
        // cột với tên môn tương ứng — MỚI THÊM; cột A-E (index 0-4) = thông tin sinh viên
        // riêng, trong đó cột B (index 1) = Mã sinh viên (khoá đối chiếu); cột F->BF (index
        // 5->57, 53 môn) = điểm từng môn; cột BG (index 58, ngay sau cột môn cuối) = tổng số
        // tín chỉ sinh viên ĐÃ hoàn thành tính tới thời điểm mirror — MỚI THÊM.
        const IDX_HANG_TIEU_DE_MON = 3;
        const IDX_HANG_TIN_CHI_MON = 4;
        const IDX_COT_MA_SV = 1;
        const IDX_COT_MON_BAT_DAU = 5;
        const IDX_COT_MON_KET_THUC = 57;
        const IDX_COT_TONG_TIN_CHI_HOAN_THANH = 58;

        if (duLieuDiem.length <= IDX_HANG_TIN_CHI_MON) {
          return responseJSON(200, "Sheet điểm của ngành này chưa có dữ liệu", { coDuLieu: false, lyDo: "SHEET_RONG" });
        }
        const hangTieuDeMon = duLieuDiem[IDX_HANG_TIEU_DE_MON];
        const hangTinChiMon = duLieuDiem[IDX_HANG_TIN_CHI_MON];

        let hangSV = null;
        for (let i = IDX_HANG_TIEU_DE_MON + 1; i < duLieuDiem.length; i++) {
          const maSVHang = String(duLieuDiem[i][IDX_COT_MA_SV] || "").replace(/^['"]+|['"]+$/g, '').trim();
          if (maSVHang && maSVHang.toLowerCase() === maSinhVien.toLowerCase()) { hangSV = duLieuDiem[i]; break; }
        }
        if (!hangSV) return responseJSON(200, "Chưa tìm thấy dữ liệu điểm của sinh viên này bên Đào tạo", { coDuLieu: false, lyDo: "KHONG_THAY_SV" });

        const monHoc = [];
        for (let c = IDX_COT_MON_BAT_DAU; c <= IDX_COT_MON_KET_THUC && c < hangTieuDeMon.length; c++) {
          const tenMon = String(hangTieuDeMon[c] || "").trim();
          if (!tenMon) continue;
          let diem = hangSV[c];
          // GIỮ NGUYÊN kiểu dữ liệu gốc (số vẫn số, chữ vẫn chữ) — đúng yêu cầu "có gì lấy
          // nấy, cả số cả chữ", KHÔNG parse/ép kiểu gì cả. Chỉ đổi Date (nếu lỡ có) thành
          // chuỗi để trả JSON được, JSON không tự serialize được kiểu Date của Apps Script.
          if (diem instanceof Date) diem = Utilities.formatDate(diem, "GMT+7", "dd/MM/yyyy");
          if (diem === "" || diem === null || diem === undefined) continue; // môn chưa có điểm -> bỏ qua, không hiện dòng trống
          // ĐÃ THÊM: kèm số tín chỉ của môn (lấy nguyên, không ép kiểu) — frontend tự
          // Number() khi tính điểm trung bình có trọng số, môn nào tín chỉ trống/không phải
          // số thì tự loại khỏi phép tính, không làm sai điểm TB.
          monHoc.push({ mon: tenMon, diem: diem, tinChi: hangTinChiMon[c] });
        }

        // ĐÃ THÊM: tổng tín chỉ đã hoàn thành (cột BG) — dùng cho khối tóm tắt "tín chỉ tích
        // luỹ / tổng tín chỉ toàn khoá" ở đầu tab Điểm số bên React.
        let tongTinChiHoanThanh = hangSV[IDX_COT_TONG_TIN_CHI_HOAN_THANH];
        if (tongTinChiHoanThanh instanceof Date) tongTinChiHoanThanh = Utilities.formatDate(tongTinChiHoanThanh, "GMT+7", "dd/MM/yyyy");

        return responseJSON(200, "Thành công", {
          coDuLieu: true, tenSheet: tenSheet, monHoc: monHoc,
          tongTinChiCanHoc: capNhatDiem.tongTinChiCanHoc,
          tongTinChiHoanThanh: tongTinChiHoanThanh,
        });
      }

function hdPost_saveConfig(e, ss) {
      const g = requireAuth(e.parameter, ['Admin']);
      if (!g.ok) return g.resp;
      const parsedData = JSON.parse(e.parameter.data);
      const sheet = ss.getSheetByName("CauHinh");
      if (!sheet) return responseJSON(404, "Chưa tạo Sheet CauHinh", null);
      
      sheet.clearContents();
      // ĐÃ THÊM "GioiTinh" (theo yêu cầu — bổ sung Giới tính/Nơi sinh) vào cuối danh sách
      // cột — không chèn giữa để không xáo trộn vị trí cột của các danh mục cũ trên Sheet.
      const headers = ["Nganh", "KhoaNhapHoc", "DoiTuongUT", "KhuVucUT", "NamXetTuyen", "DoiTuongDauVao", "HeDaoTao", "HinhThucDaoTao", "GioiTinh"];
      sheet.appendRow(headers);

      // FIX LỖI: Nhận dạng linh hoạt bất kể studentApi.js đẩy lên cục data như thế nào
      const config = parsedData.Nganh ? parsedData : parsedData.config;
      if (!config) return responseJSON(400, "Dữ liệu cấu hình không hợp lệ", null);

      let maxRows = 0;
      headers.forEach(h => {
        if (config[h] && config[h].length > maxRows) maxRows = config[h].length;
      });

      if (maxRows > 0) {
        const rows = [];
        for (let i = 0; i < maxRows; i++) {
          // ĐÃ SỬA: bọc thêm "config[h] &&" trước khi đọc config[h][i] — phòng trường hợp 1
          // danh mục hoàn toàn vắng mặt trong payload gửi lên (VD front-end cũ chưa kịp cập
          // nhật, chưa gửi kèm "GioiTinh") thì config[h] là undefined, đọc thẳng
          // config[h][i] sẽ NÉM LỖI (Cannot read property of undefined) làm hỏng luôn việc
          // lưu MỌI danh mục khác trong cùng lần lưu — không chỉ riêng cột thiếu.
          rows.push(headers.map(h => (config[h] && config[h][i]) || ""));
        }
        sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
      }

      // GHI LOG LỊCH SỬ THAO TÁC (ĐÃ SỬA — trước đây ghi nhầm vào sheet "LichSuCauHinh",
      // KHÁC với sheet "NhatKy" mà hdGet_getLogs/mục "Lịch sử" thực sự đọc, nên tính năng
      // đó coi như chưa từng hiển thị được log thật nào; xem chú thích đầy đủ ở
      // ghiLichSuThaoTac_ trong Auth.gs). Vẫn dùng email đã xác thực server-side
      // (g.userInfo.email), không tin "userEmail" do client tự khai.
      ghiLichSuThaoTac_(g.userInfo.email, "Đã cập nhật cấu hình hệ thống", "");

      return responseJSON(200, "Lưu cấu hình thành công", null);
    }

function hdPost_saveChiTieu(e, ss) {
      const g = requireAuth(e.parameter, ['Admin']);
      if (!g.ok) return g.resp;
      const parsedData = JSON.parse(e.parameter.data);
      const nam = String(parsedData.nam || "").trim();
      const items = Array.isArray(parsedData.items) ? parsedData.items : [];
      if (!nam) return responseJSON(400, "Thiếu năm cần lưu chỉ tiêu", null);

      const sheet = ss.getSheetByName("ChiTieuTuyenSinh");
      if (!sheet) return responseJSON(404, "Chưa tạo Sheet 'ChiTieuTuyenSinh' (cột: Nam, Nganh, ChiTieu)", null);

      let data = sheet.getDataRange().getValues();
      if (data.length === 0) {
        sheet.appendRow(["Nam", "Nganh", "ChiTieu"]);
        data = sheet.getDataRange().getValues();
      }
      const headers = data[0];
      const idxNam = headers.indexOf("Nam");
      const idxNganh = headers.indexOf("Nganh");
      const idxChiTieu = headers.indexOf("ChiTieu");
      if (idxNam === -1 || idxNganh === -1 || idxChiTieu === -1) {
        return responseJSON(400, "Sheet 'ChiTieuTuyenSinh' thiếu cột Nam/Nganh/ChiTieu", null);
      }

      // Giữ lại nguyên vẹn mọi dòng KHÔNG thuộc năm đang lưu, rồi nối thêm đúng các dòng
      // hợp lệ (ngành + chỉ tiêu > 0) của năm này vào sau — ghi đè lại toàn sheet 1 lần
      // (đơn giản, an toàn hơn dò-sửa-từng-dòng, vì số dòng/năm rất nhỏ).
      const rowsGiuNguyen = [];
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][idxNam] || "").trim() !== nam) rowsGiuNguyen.push(data[i]);
      }
      const rowsNamNay = items
        .filter(it => it && String(it.nganh || "").trim() && Number(it.chiTieu) > 0)
        .map(it => {
          const row = new Array(headers.length).fill("");
          row[idxNam] = nam; row[idxNganh] = String(it.nganh).trim(); row[idxChiTieu] = Number(it.chiTieu);
          return row;
        });

      sheet.clearContents();
      sheet.appendRow(headers);
      const allRows = rowsGiuNguyen.concat(rowsNamNay);
      if (allRows.length > 0) sheet.getRange(2, 1, allRows.length, headers.length).setValues(allRows);

      // GHI LOG LỊCH SỬ THAO TÁC (ĐÃ SỬA — cùng lý do như hdPost_saveConfig ở trên: trước
      // đây ghi nhầm sheet "LichSuCauHinh" thay vì "NhatKy").
      ghiLichSuThaoTac_(g.userInfo.email, "Đã cập nhật chỉ tiêu tuyển sinh năm " + nam, "");

      return responseJSON(200, "Lưu chỉ tiêu tuyển sinh thành công", null);
    }

function hdPost_searchOldRecord(e, ss) {
      const parsedData = JSON.parse(e.parameter.data);
      
      // ĐÃ SỬA: dùng requireAuth() thay cho verifyGoogleIdToken() tự viết riêng — hỗ trợ
      // luôn sessionToken (tài khoản nội bộ), trước đây chỉ nhận Google idToken.
      // requireAuth() đọc thẳng params.idToken/params.sessionToken, "parsedData" đã có
      // đúng 2 field này (frontend gửi kèm cả 2, xem postAiAction() ở studentApi.js).
      const g = requireAuth(parsedData, ['TuyenSinh', 'ThamDinh', 'Admin']);
      if (!g.ok) return g.resp;
      
      const kw = String(parsedData.keyword).trim().toLowerCase();
      if (!kw) return responseJSON(400, "Thiếu từ khóa", null);

      // ĐÃ SỬA (2026-09-10): trước đây hardcode cứng ID Trung Gian ngay tại đây — không đổi
      // được khi chuyển sang project GAS môi trường TEST (Script Property TRUNGGIAN_SHEET_ID
      // bị đổi riêng nhưng chỗ này vẫn luôn mở đúng 1 ID cố định, khiến test trên project TEST
      // âm thầm đọc nhầm vào sheet Trung Gian THẬT). Đổi sang dùng lại helper moTrunggianSheet()
      // (đã có sẵn, đọc từ Script Property) cho đồng bộ với mọi action khác trong file.
      const sheet = moTrunggianSheet();
      
      const values = sheet.getDataRange().getValues();
      const rawHeaders = values[0];
      // Chuẩn hóa tiêu đề: Viết hoa, xóa dấu cách thừa để dò cho chuẩn
      const cleanHeaders = rawHeaders.map(h => String(h).trim().toUpperCase().replace(/\s+/g, ' '));
      
      let results = [];
      for (let i = 1; i < values.length; i++) {
        // Dò linh hoạt: Dù ông đặt tên là CĂN CƯỚC hay CCCD đều tìm được
        const idxCccd = cleanHeaders.indexOf("CĂN CƯỚC") !== -1 ? cleanHeaders.indexOf("CĂN CƯỚC") : cleanHeaders.indexOf("CCCD");
        const idxName = cleanHeaders.indexOf("TÊN SINH VIÊN") !== -1 ? cleanHeaders.indexOf("TÊN SINH VIÊN") : cleanHeaders.indexOf("HỌ VÀ TÊN");
        const idxNganh = cleanHeaders.indexOf("NGÀNH");
        const idxStatus = cleanHeaders.indexOf("TRẠNG THÁI THẨM ĐỊNH");

        const cccd = idxCccd !== -1 ? String(values[i][idxCccd] || "").replace(/\D/g, '') : "";
        const hoTen = idxName !== -1 ? String(values[i][idxName] || "").toLowerCase() : "";
        
        if (cccd.includes(kw) || hoTen.includes(kw)) {
           let rowData = {};
           // Đóng gói data bằng tên tiêu đề GỐC để nhả về React Form cho khớp
           // ĐÃ VÁ BUG THẬT (theo phản hồi — "một số hồ sơ đẩy ngược lên không kèm năm
           // sinh", dù ô trên Goc01 double-click vẫn hiện đúng ngày trên lịch — tức ô đó
           // là Date THẬT, không hỏng): trước đây gán thẳng values[i][idx] không đổi gì —
           // với 1 ô kiểu Date thật (mọi hồ sơ NGÀY SINH đẩy qua "importStudents" đều được
           // ép thành Date thật, xem chuanHoaNgaySinhThanhDate_), JSON.stringify() ở
           // responseJSON() tự động gọi .toJSON()/toISOString() trên Date đó -> ra chuỗi
           // ISO GIỜ UTC kiểu "2005-06-15T17:00:00.000Z" (lệch múi giờ +7 so với ngày thật
           // đang hiển thị trên Sheet) — <input type="date"> bên React (XetTuyenPage.jsx)
           // không nhận dạng được chuỗi có "T...Z" này nên hiện TRỐNG, đúng y hệt hiện
           // tượng đã báo. Hồ sơ CŨ (NGÀY SINH còn lưu dạng text từ trước khi có
           // chuanHoaNgaySinhThanhDate_) thì không dính lỗi này -> khớp với "một số hồ sơ",
           // không phải tất cả. Sửa giống ĐÚNG cách getThamDinhData() phía trên đang làm:
           // tự tay lấy getDate()/getMonth()/getFullYear() theo múi giờ THỰC của Apps
           // Script (khớp với ngày hiển thị trên Sheet) rồi ghép thành "dd/mm/yyyy" — không
           // qua toISOString()/UTC nên không bị lệch ngày. Frontend (loadOldCandidate) đã
           // được sửa cùng lúc để tự nhận dạng "dd/mm/yyyy" này và đổi sang "yyyy-MM-dd"
           // đúng định dạng <input type="date"> cần.
           rawHeaders.forEach((h, idx) => {
              let val = values[i][idx];
              if (val instanceof Date) {
                const dd = String(val.getDate()).padStart(2, '0');
                const mm = String(val.getMonth() + 1).padStart(2, '0');
                const yyyy = val.getFullYear();
                val = dd + '/' + mm + '/' + yyyy;
              }
              rowData[h] = val;
           });

           results.push({
              hoTen: idxName !== -1 ? values[i][idxName] : "Unknown",
              cccd: cccd,
              nganh: idxNganh !== -1 ? values[i][idxNganh] : "Unknown",
              trangThai: idxStatus !== -1 ? values[i][idxStatus] : "Chưa rõ",
              fullData: rowData
           });
        }
      }
      return results.length > 0 ? responseJSON(200, "Tìm thấy", results) : responseJSON(404, "Không tìm thấy hồ sơ nào", null);
    }

function hdPost_addAdmission(e, ss) {
      const g = requireAuth(e.parameter, ['CanBo', 'Admin']);
      if (!g.ok) return g.resp;
      const payload = JSON.parse(e.parameter.data);
      const trunggian = docTrunggianRaw();

      const namHienTai = String(new Date().getFullYear());
      const maSV = generateMaSVTuChung(namHienTai, payload["HỆ ĐÀO TẠO"], payload["HÌNH THỨC ĐÀO TẠO"], payload["CĂN CƯỚC"]);
      if (!maSV) return responseJSON(400, "Thiếu Hệ đào tạo/Hình thức đào tạo/Căn cước — không sinh được Mã sinh viên", null);

      const rowMap = {};
      ADMISSIONS_DATA_FIELDS.forEach(f => { rowMap[f] = payload[f] || ""; });
      // ĐÃ THÊM: kiểm tra NGÀNH/HỆ ĐÀO TẠO/HÌNH THỨC ĐÀO TẠO/ĐỐI TƯỢNG ƯU TIÊN/KHÓA khớp
      // đúng danh sách hợp lệ ở sheet CauHinh — chặn NGAY TỪ ĐẦU, trước khi kịp sinh Mã SV/
      // gắn sv_key/ghi bất kỳ gì xuống Sheet, để tránh dữ liệu "thủng" (không khớp danh sách
      // hệ thống hiểu được, dẫn tới hiển thị/thống kê/lọc sai về sau). Xem kiemTraHopLeCauHinh_.
      const loiCauHinhAdd = kiemTraHopLeCauHinh_(rowMap, layDanhSachHopLeCauHinh_());
      if (loiCauHinhAdd) return responseJSON(400, loiCauHinhAdd, null);
      // ĐÃ THÊM: ghi "NGÀY SINH" xuống Sheet luôn dưới dạng Date object thật (xem
      // chuanHoaNgaySinhThanhDate_ trong DinhDanh.gs) — vá lỗi ô ngày sinh bị lưu thành
      // chuỗi/số thô tuỳ nguồn nhập, khiến chống trùng định danh im lặng không hoạt động.
      if (rowMap["NGÀY SINH"]) rowMap["NGÀY SINH"] = chuanHoaNgaySinhThanhDate_(rowMap["NGÀY SINH"]);
      ADMISSIONS_CHECK_FIELDS.forEach(f => {
        rowMap[f] = f === "GIẤY TỜ ƯU TIÊN" ? String(payload[f] || "").trim() : (payload[f] ? "x" : "");
      });
      rowMap[ADMISSIONS_STATUS_FIELD] = payload["XN_NHAP_HOC"] ? ADMISSIONS_STATUS_VALUE : "";
      rowMap["NĂM XÉT TUYỂN"] = namHienTai;
      rowMap["TIME"] = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
      rowMap["TÀI KHOẢN NHẬP LIỆU"] = g.userInfo.email;
      rowMap[ADMISSIONS_KENH_FIELD] = ADMISSIONS_KENH_NOP;
      ADMISSIONS_MASV_NAMES.forEach(n => { rowMap[n] = maSV; }); // ghi vào đúng biến thể tên cột đang thật sự tồn tại trên sheet
      if (payload["CĂN CƯỚC"]) rowMap["CĂN CƯỚC"] = "'" + String(payload["CĂN CƯỚC"]).replace(/'/g, '');
      // PHA 1·D1 (bước 2) — tự động tra cứu/gắn/tạo sv_key cho hồ sơ mới, ghi thẳng vào cột
      // SV_KEY (nếu sheet Trung Gian có cột này — ông đã tự thêm tay). Hoàn toàn không ảnh
      // hưởng logic tạo Mã SV/ghi hồ sơ ở trên — chỉ CỘNG THÊM 1 cột, lỗi ở đây không chặn
      // việc thêm hồ sơ (xem chi tiết trong dinhDanhGanTuDongChoHoSoMoi_ ở DinhDanh.gs).
      rowMap["SV_KEY"] = dinhDanhGanTuDongChoHoSoMoi_(payload["TÊN SINH VIÊN"], payload["NGÀY SINH"], payload["CĂN CƯỚC"], g.userInfo.email);

      const newRow = trunggian.cleanHeaders.map(h => rowMap[h] !== undefined ? rowMap[h] : "");
      trunggian.sheet.appendRow(newRow);
      // ĐÃ THÊM: áp định dạng hiển thị ngay tại chỗ ghi — không phụ thuộc đã chạy tay
      // dinhDangCotNgaySinhGoc01() hay chưa/có phủ tới đúng dòng vừa thêm hay không.
      const idxNgaySinhAdd = trunggian.cleanHeaders.indexOf("NGÀY SINH");
      if (idxNgaySinhAdd !== -1) {
        trunggian.sheet.getRange(trunggian.sheet.getLastRow(), idxNgaySinhAdd + 1).setNumberFormat(DINH_DANG_NGAY_SINH);
      }

      // ĐÃ THÊM: cho phép modal "Thêm hồ sơ" gửi kèm luôn danh sách khoản đã tick ở
      // khối Nộp tiền ngay lúc tạo mới (payload["_noptien"] = [{loaiPhi, soTien}, ...])
      // — vì lúc submit modal chưa có Mã SV để gọi savePayment() riêng, nên gộp chung
      // vào action này, ghi bằng đúng Mã SV vừa sinh ra ở trên.
      const dsNopTien = payload["_noptien"];
      if (Array.isArray(dsNopTien) && dsNopTien.length > 0) {
        const sheetNT = layHoacTaoSheetNopTien();
        const nowNT = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
        const maSVClean = maSV.replace(/^'/, '');
        dsNopTien.forEach(kt => {
          if (!kt || !kt.loaiPhi) return;
          sheetNT.appendRow([maSVClean, kt.loaiPhi, kt.soTien || "", g.userInfo.email, nowNT]);
        });
      }

      return responseJSON(200, "Thêm hồ sơ thành công", { maSV: maSV.replace(/^'/, '') });
    }

function hdPost_updateAdmission(e, ss) {
      const g = requireAuth(e.parameter, ['CanBo', 'Admin']);
      if (!g.ok) return g.resp;
      const payload = JSON.parse(e.parameter.data);
      const { sheet, cleanHeaders, values } = docTrunggianRaw();
      const idxMaSV = timCotTheoTen.apply(null, [cleanHeaders].concat(ADMISSIONS_MASV_NAMES));
      const idxKenh = timCotTheoTen(cleanHeaders, ADMISSIONS_KENH_FIELD);
      if (idxMaSV === -1) return responseJSON(404, "Không tìm thấy cột Mã sinh viên trên Trung Gian", null);

      const maSVTarget = String(payload["MÃ SINH VIÊN"] || "").replace(/^'/, '').trim();
      let rowIndex = -1;
      for (let i = 1; i < values.length; i++) {
        const cellMaSV = String(values[i][idxMaSV] || "").replace(/^'/, '').trim();
        if (cellMaSV === maSVTarget && (idxKenh === -1 || String(values[i][idxKenh] || "").trim() === ADMISSIONS_KENH_NOP)) { rowIndex = i + 1; break; }
      }
      if (rowIndex === -1) return responseJSON(404, "Không tìm thấy hồ sơ này (hoặc không thuộc kênh Thu hồ sơ trực tiếp)", null);

      const rowMap = {};
      ADMISSIONS_DATA_FIELDS.forEach(f => { if (payload[f] !== undefined) rowMap[f] = payload[f]; });
      // ĐÃ THÊM: cùng lý do như addAdmission — kiểm tra khớp danh sách hợp lệ ở CauHinh
      // TRƯỚC khi ghi. Chỉ kiểm tra đúng những trường ĐANG SỬA (rowMap chỉ chứa field có
      // trong payload) — trường không đụng tới thì không bị buộc phải hợp lệ lại từ đầu.
      const loiCauHinhUpdate = kiemTraHopLeCauHinh_(rowMap, layDanhSachHopLeCauHinh_());
      if (loiCauHinhUpdate) return responseJSON(400, loiCauHinhUpdate, null);
      // ĐÃ THÊM: cùng lý do như addAdmission — ghi "NGÀY SINH" xuống Sheet dưới dạng Date
      // object thật, không phải chuỗi/số thô tuỳ nguồn nhập.
      if (rowMap["NGÀY SINH"]) rowMap["NGÀY SINH"] = chuanHoaNgaySinhThanhDate_(rowMap["NGÀY SINH"]);
      ADMISSIONS_CHECK_FIELDS.forEach(f => {
        if (payload[f] === undefined) return;
        rowMap[f] = f === "GIẤY TỜ ƯU TIÊN" ? String(payload[f] || "").trim() : (payload[f] ? "x" : "");
      });
      if (payload["XN_NHAP_HOC"] !== undefined) rowMap[ADMISSIONS_STATUS_FIELD] = payload["XN_NHAP_HOC"] ? ADMISSIONS_STATUS_VALUE : "";
      rowMap["NGÀY CẬP NHẬT HỒ SƠ"] = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
      rowMap["TÀI KHOẢN NHẬP LIỆU"] = g.userInfo.email;
      if (payload["CĂN CƯỚC"]) rowMap["CĂN CƯỚC"] = "'" + String(payload["CĂN CƯỚC"]).replace(/'/g, '');

      // PHA 1·D1 (bước 3) — đồng bộ CCCD đổi vào registry + tự gắn sv_key nếu dòng này
      // trước đó chưa có (trống/"CẦN_XÁC_NHẬN"); xem dinhDanhDongBoKhiSuaHoSo_ ở
      // DinhDanh.gs để biết đầy đủ 3 tình huống. Đọc dữ liệu CŨ từ đúng dòng đang sửa
      // (values[rowIndex-1]) TRƯỚC khi ghi đè, so với dữ liệu MỚI trong payload.
      const oldRow = values[rowIndex - 1];
      const idxSvKeyCol = cleanHeaders.indexOf("SV_KEY");
      const idxHoTenCol = cleanHeaders.indexOf("TÊN SINH VIÊN");
      const idxNgaySinhCol = cleanHeaders.indexOf("NGÀY SINH");
      const idxCccdCol = cleanHeaders.indexOf("CĂN CƯỚC");
      const svKeyCu = idxSvKeyCol !== -1 ? String(oldRow[idxSvKeyCol] || "").trim() : "";
      const hoTenCu = idxHoTenCol !== -1 ? oldRow[idxHoTenCol] : "";
      const ngaySinhCu = idxNgaySinhCol !== -1 ? oldRow[idxNgaySinhCol] : "";
      const cccdCu = idxCccdCol !== -1 ? oldRow[idxCccdCol] : "";
      const hoTenMoi = rowMap["TÊN SINH VIÊN"] !== undefined ? rowMap["TÊN SINH VIÊN"] : hoTenCu;
      const ngaySinhMoi = rowMap["NGÀY SINH"] !== undefined ? rowMap["NGÀY SINH"] : ngaySinhCu;
      const cccdMoi = payload["CĂN CƯỚC"] !== undefined ? payload["CĂN CƯỚC"] : cccdCu;
      const svKeyMoi = dinhDanhDongBoKhiSuaHoSo_(svKeyCu, hoTenCu, ngaySinhCu, cccdCu, hoTenMoi, ngaySinhMoi, cccdMoi, g.userInfo.email);
      if (idxSvKeyCol !== -1 && svKeyMoi && svKeyMoi !== svKeyCu) rowMap["SV_KEY"] = svKeyMoi;

      cleanHeaders.forEach((h, colIndex) => {
        if (rowMap[h] !== undefined) {
          const cell = sheet.getRange(rowIndex, colIndex + 1);
          cell.setValue(rowMap[h]);
          // ĐÃ THÊM: áp định dạng hiển thị ngay tại chỗ ghi cho NGÀY SINH — cùng lý do như
          // addAdmission, không phụ thuộc đã chạy tay dinhDangCotNgaySinhGoc01() hay chưa.
          if (h === "NGÀY SINH") cell.setNumberFormat(DINH_DANG_NGAY_SINH);
        }
      });
      return responseJSON(200, "Cập nhật thành công", null);
    }

function hdPost_deleteAdmission(e, ss) {
      const g = requireAuth(e.parameter, ['CanBo', 'Admin']);
      if (!g.ok) return g.resp;
      const maSVTarget = String(e.parameter.MaSV || "").replace(/^'/, '').trim();
      const { sheet, cleanHeaders, values } = docTrunggianRaw();
      const idxMaSV = timCotTheoTen.apply(null, [cleanHeaders].concat(ADMISSIONS_MASV_NAMES));
      const idxKenh = timCotTheoTen(cleanHeaders, ADMISSIONS_KENH_FIELD);
      if (idxMaSV === -1) return responseJSON(404, "Không tìm thấy cột Mã sinh viên trên Trung Gian", null);
      for (let i = 1; i < values.length; i++) {
        const cellMaSV = String(values[i][idxMaSV] || "").replace(/^'/, '').trim();
        if (cellMaSV === maSVTarget && (idxKenh === -1 || String(values[i][idxKenh] || "").trim() === ADMISSIONS_KENH_NOP)) {
          sheet.deleteRow(i + 1);
          return responseJSON(200, "Xóa hồ sơ thành công", null);
        }
      }
      return responseJSON(404, "Không tìm thấy hồ sơ này (hoặc không thuộc kênh Thu hồ sơ trực tiếp)", null);
    }

function hdPost_toggleAdmissionField(e, ss) {
      const g = requireAuth(e.parameter, ['CanBo', 'Admin']);
      if (!g.ok) return g.resp;
      const maSVTarget = String(e.parameter.MaSV || "").replace(/^'/, '').trim();
      const fieldName = String(e.parameter.Field || "").toUpperCase().trim();
      const isChecked = e.parameter.IsChecked === 'true';
      const ghiChu = e.parameter.GhiChu || '';

      const { sheet, cleanHeaders, values } = docTrunggianRaw();
      const idxMaSV = timCotTheoTen.apply(null, [cleanHeaders].concat(ADMISSIONS_MASV_NAMES));
      const idxField = cleanHeaders.indexOf(fieldName);
      if (idxMaSV === -1 || idxField === -1) return responseJSON(404, "Không tìm thấy cột cần cập nhật trên Trung Gian: " + fieldName, null);

      for (let i = 1; i < values.length; i++) {
        const cellMaSV = String(values[i][idxMaSV] || "").replace(/^'/, '').trim();
        if (cellMaSV === maSVTarget) {
          let giaTri = "";
          if (isChecked) {
            giaTri = fieldName === ADMISSIONS_STATUS_FIELD ? ADMISSIONS_STATUS_VALUE
                   : fieldName === "GIẤY TỜ ƯU TIÊN" ? (ghiChu || "x")
                   : "x";
          }
          sheet.getRange(i + 1, idxField + 1).setValue(giaTri);
          return responseJSON(200, "Cập nhật thành công", null);
        }
      }
      return responseJSON(404, "Không tìm thấy hồ sơ này", null);
    }

function hdPost_importAdmissions(e, ss) {
      const g = requireAuth(e.parameter, ['CanBo', 'Admin']);
      if (!g.ok) return g.resp;
      const rows = JSON.parse(e.parameter.data);
      if (!rows || rows.length === 0) return responseJSON(200, "Không có dữ liệu", { added: 0, skipped: 0 });

      const { sheet, cleanHeaders, values } = docTrunggianRaw();
      const idxMaSV = timCotTheoTen.apply(null, [cleanHeaders].concat(ADMISSIONS_MASV_NAMES));
      const existingMaSV = {};
      for (let i = 1; i < values.length; i++) {
        if (idxMaSV !== -1) {
          const v = String(values[i][idxMaSV] || "").replace(/^'/, '').trim();
          if (v) existingMaSV[v] = true;
        }
      }

      const namHienTai = String(new Date().getFullYear());
      const newRows = [];
      let skipped = 0;
      // ĐÃ THÊM: đọc CauHinh 1 LẦN DUY NHẤT cho cả loạt (không đọc lại trong từng dòng —
      // đỡ tốn API Sheets khi import hàng trăm dòng cùng lúc). Xem kiemTraHopLeCauHinh_.
      const cauHinhImport = layDanhSachHopLeCauHinh_();
      const invalidRows = [];

      rows.forEach(raw => {
        const cleanRow = {};
        for (const key in raw) cleanRow[String(key).toUpperCase().trim().replace(/\s+/g, ' ')] = raw[key];

        const maSV = generateMaSVTuChung(namHienTai, cleanRow["HỆ ĐÀO TẠO"], cleanRow["HÌNH THỨC ĐÀO TẠO"], cleanRow["CĂN CƯỚC"]);
        const maSVClean = maSV.replace(/^'/, '');
        if (!maSVClean || existingMaSV[maSVClean]) { skipped++; return; }
        existingMaSV[maSVClean] = true;

        const rowMap = {};
        ADMISSIONS_DATA_FIELDS.forEach(f => { rowMap[f] = cleanRow[f] || ""; });
        // ĐÃ THÊM: kiểm tra khớp danh sách hợp lệ ở CauHinh — dòng nào sai thì BỎ QUA, KHÔNG
        // ghi vào Sheet (gom vào invalidRows để báo rõ cho người import biết dòng nào/cột
        // nào sai, thay vì lọt vào rồi làm thủng dữ liệu về sau). Cùng lý do như addAdmission.
        const loiCauHinhImport = kiemTraHopLeCauHinh_(rowMap, cauHinhImport);
        if (loiCauHinhImport) {
          invalidRows.push({ ten: cleanRow["TÊN SINH VIÊN"] || "", cccd: cleanRow["CĂN CƯỚC"] || "", loi: loiCauHinhImport });
          return;
        }
        // ĐÃ THÊM: cùng lý do như addAdmission/updateAdmission — file mẫu import có thể tới
        // dưới dạng chuỗi dd/MM/yyyy (gõ tay) hoặc số serial (nếu Excel tự ý đổi ô đó thành
        // kiểu Date) — luôn quy về Date object thật trước khi ghi xuống Sheet.
        if (rowMap["NGÀY SINH"]) rowMap["NGÀY SINH"] = chuanHoaNgaySinhThanhDate_(rowMap["NGÀY SINH"]);
        ADMISSIONS_CHECK_FIELDS.forEach(f => { rowMap[f] = cleanRow[f] || ""; }); // file mẫu: điền "x" thẳng trong ô Excel
        // ĐÃ SỬA: cột này trên file mẫu giờ hiển thị tên "XÁC NHẬN NHẬP HỌC" (dễ hiểu hơn tên
        // cột thật ADMISSIONS_STATUS_FIELD — xem ADMISSIONS_STATUS_TEMPLATE_LABEL) và mô tả
        // "điền x nếu đã xác nhận" — nên đổi cách nhận diện từ SO KHỚP ĐÚNG NGUYÊN VĂN "Đã
        // trúng tuyển" sang kiểu Ô TICK (x/true/1/có/v), cùng 1 danh sách chấp nhận với các
        // cột giấy tờ khác. Đọc từ CẢ 2 tên cột (label mới lẫn tên cột thật cũ) để không phá
        // vỡ file mẫu cũ (còn giữ tên cột cũ, hoặc còn ghi nguyên văn "Đã trúng tuyển").
        const rawXacNhanNhapHoc = String(cleanRow[ADMISSIONS_STATUS_TEMPLATE_LABEL] || cleanRow[ADMISSIONS_STATUS_FIELD] || "").trim().toUpperCase();
        const daXacNhanNhapHoc = ["X", "TRUE", "1", "CÓ", "V", "ĐÃ TRÚNG TUYỂN"].indexOf(rawXacNhanNhapHoc) !== -1;
        rowMap[ADMISSIONS_STATUS_FIELD] = daXacNhanNhapHoc ? ADMISSIONS_STATUS_VALUE : "";
        rowMap["NĂM XÉT TUYỂN"] = namHienTai;
        rowMap["TIME"] = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
        rowMap["TÀI KHOẢN NHẬP LIỆU"] = g.userInfo.email;
        rowMap[ADMISSIONS_KENH_FIELD] = ADMISSIONS_KENH_NOP;
        ADMISSIONS_MASV_NAMES.forEach(n => { rowMap[n] = maSV; });
        if (cleanRow["CĂN CƯỚC"]) rowMap["CĂN CƯỚC"] = "'" + String(cleanRow["CĂN CƯỚC"]).replace(/'/g, '');
        // PHA 1·D1 (bước 2) — như addAdmission: tự gắn sv_key cho từng hồ sơ mới trong file
        // Excel import (mọi dòng qua nhánh này CHẮC CHẮN là hồ sơ mới — đã lọc trùng MSV ở
        // trên rồi mới tới đây).
        rowMap["SV_KEY"] = dinhDanhGanTuDongChoHoSoMoi_(cleanRow["TÊN SINH VIÊN"], cleanRow["NGÀY SINH"], cleanRow["CĂN CƯỚC"], g.userInfo.email);

        newRows.push(cleanHeaders.map(h => rowMap[h] !== undefined ? rowMap[h] : ""));
      });

      if (newRows.length > 0) {
        const startRowImport = sheet.getLastRow() + 1;
        sheet.getRange(startRowImport, 1, newRows.length, cleanHeaders.length).setValues(newRows);
        // ĐÃ THÊM: áp định dạng hiển thị cho cả khối NGÀY SINH vừa nhập, ngay tại chỗ ghi —
        // cùng lý do như addAdmission/updateAdmission.
        const idxNgaySinhImport = cleanHeaders.indexOf("NGÀY SINH");
        if (idxNgaySinhImport !== -1) {
          sheet.getRange(startRowImport, idxNgaySinhImport + 1, newRows.length, 1).setNumberFormat(DINH_DANG_NGAY_SINH);
        }
      }
      let messageImportAdm = "Nhập Excel thành công";
      if (invalidRows.length > 0) {
        messageImportAdm += " — nhưng có " + invalidRows.length + " dòng bị BỎ QUA do dữ liệu không khớp danh sách hợp lệ (xem chi tiết bên dưới), cần sửa và nhập lại riêng các dòng đó.";
      }
      return responseJSON(200, messageImportAdm, { added: newRows.length, skipped: skipped, invalidRows: invalidRows });
    }

function hdPost_savePayment(e, ss) {
      const g = requireAuth(e.parameter, ['CanBo', 'Admin']);
      if (!g.ok) return g.resp;
      const maSVTarget = String(e.parameter.MaSV || "").trim();
      const loaiPhi = String(e.parameter.LoaiPhi || "").trim();
      const soTien = e.parameter.SoTien;
      const isChecked = e.parameter.IsChecked === 'true';

      const sheetNT = layHoacTaoSheetNopTien();
      const dataNT = sheetNT.getDataRange().getValues();
      let foundRow = -1;
      for (let i = 1; i < dataNT.length; i++) {
        if (String(dataNT[i][0] || "").trim() === maSVTarget && String(dataNT[i][1] || "").trim() === loaiPhi) { foundRow = i + 1; break; }
      }
      const now = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
      if (isChecked) {
        if (foundRow === -1) sheetNT.appendRow([maSVTarget, loaiPhi, soTien, g.userInfo.email, now]);
        else sheetNT.getRange(foundRow, 3, 1, 3).setValues([[soTien, g.userInfo.email, now]]);
      } else if (foundRow !== -1) {
        sheetNT.deleteRow(foundRow);
      }
      return responseJSON(200, "Cập nhật thành công", null);
    }

function hdPost_checkDuplicatesXetTuyen(e, ss) {
      const g = requireAuth(e.parameter, ['TuyenSinh', 'ThamDinh', 'Admin']);
      if (!g.ok) return g.resp;

      const keysToCheck = JSON.parse(e.parameter.data); // mảng [{cccd, nganh}, ...]
      // ĐÃ SỬA (2026-09-10): tương tự hdPost_searchOldRecord — bỏ ID hardcode, dùng lại
      // helper moTrunggianSheet() đọc từ Script Property TRUNGGIAN_SHEET_ID, để project TEST
      // (đã đổi riêng Script Property) không bị đọc nhầm vào sheet Trung Gian THẬT.
      const sheetDup = moTrunggianSheet();
      const dataDup = sheetDup.getDataRange().getValues();
      const headersDup = dataDup[0].map(h => String(h).trim().toUpperCase().replace(/\s+/g, ' '));

      const cccdColDup = headersDup.indexOf("CĂN CƯỚC") !== -1 ? headersDup.indexOf("CĂN CƯỚC") : headersDup.indexOf("CCCD");
      const nganhColDup = headersDup.indexOf("NGÀNH");
      const tenColDup = headersDup.indexOf("TÊN SINH VIÊN");
      const statusColDup = headersDup.indexOf("TRẠNG THÁI ĐẨY");

      const seenInBatch = {};
      const results = keysToCheck.map((k, idx) => {
        const cleanCccd = String(k.cccd || "").replace(/\D/g, '');
        const cleanNganh = String(k.nganh || "").trim().toLowerCase();
        const batchKey = cleanCccd + "|" + cleanNganh;

        if (cccdColDup !== -1 && nganhColDup !== -1 && cleanCccd) {
          for (let i = 1; i < dataDup.length; i++) {
            const sheetCccd = String(dataDup[i][cccdColDup]).replace(/\D/g, '');
            const sheetNganh = String(dataDup[i][nganhColDup]).trim().toLowerCase();
            if (sheetCccd === cleanCccd && sheetNganh === cleanNganh) {
              return {
                cccd: k.cccd, nganh: k.nganh, exists: true, duplicateInBatch: false,
                ten: tenColDup !== -1 ? String(dataDup[i][tenColDup] || "") : "",
                trangThai: statusColDup !== -1 ? String(dataDup[i][statusColDup] || "") : "",
              };
            }
          }
        }

        if (cleanCccd && Object.prototype.hasOwnProperty.call(seenInBatch, batchKey)) {
          return { cccd: k.cccd, nganh: k.nganh, exists: false, duplicateInBatch: true, duplicateWithRow: seenInBatch[batchKey] };
        }
        if (cleanCccd) seenInBatch[batchKey] = idx;
        return { cccd: k.cccd, nganh: k.nganh, exists: false, duplicateInBatch: false };
      });

      return responseJSON(200, "Thành công", { results });
    }

function hdPost_importStudents(e, ss) {
      // Đoán theo quyền route "/xet-tuyen" trong App.jsx (['TuyenSinh','ThamDinh']) —
      // bạn xác nhận lại nếu ý đồ thực tế khác (vd chỉ TuyenSinh mới được import).
      const g = requireAuth(e.parameter, ['TuyenSinh', 'ThamDinh', 'Admin']);
      if (!g.ok) return g.resp;
      const studentsArray = JSON.parse(e.parameter.data);
      // ĐÃ SỬA (2026-09-10): bỏ ID hardcode cứng — trước đây luôn mở đúng 1 sheet Trung Gian
      // cố định bất kể đang chạy trên project GAS nào, khiến project TEST (Script Property
      // TRUNGGIAN_SHEET_ID đã đổi riêng) vẫn âm thầm đọc/ghi nhầm vào sheet THẬT. Giữ lại biến
      // ssTrungGian (cả spreadsheet, không chỉ sheet) vì hàm này còn dùng lại nó bên dưới để
      // mở/tạo sheet "Backup".
      const TRUNGGIAN_ID = PropertiesService.getScriptProperties().getProperty('TRUNGGIAN_SHEET_ID');
      const ssTrungGian = SpreadsheetApp.openById(TRUNGGIAN_ID);
      const sheet = ssTrungGian.getSheets()[0];
      
      const data = sheet.getDataRange().getValues();
      const rawHeaders = data[0]; 
      const cleanHeaders = rawHeaders.map(h => String(h).trim().toUpperCase().replace(/\s+/g, ' '));
      
      const idxCccd = cleanHeaders.indexOf("CĂN CƯỚC") !== -1 ? cleanHeaders.indexOf("CĂN CƯỚC") : cleanHeaders.indexOf("CCCD");
      const idxNganh = cleanHeaders.indexOf("NGÀNH");
      const idxMaSV = cleanHeaders.findIndex(h => h === "MÃ SINH VIÊN" || h === "MÃ SỐ NGƯỜI HỌC" || h === "MASV" || h === "MÃ SV");
      // ĐÃ THÊM (rà soát an toàn 2 luồng chung 1 sheet): mọi hồ sơ do action này ghi (dùng
      // riêng cho luồng Xét tuyển — nhập tay hoặc import Excel, đều đẩy qua đây khi bấm
      // "Đẩy dữ liệu lên hệ thống") giờ được gắn KÊNH NỘP = "TS Online", song song với
      // "Thu hồ sơ trực tiếp" bên trang Nhập học — để phân biệt 2 luồng ngay trên sheet,
      // và để action trungTuyen/baoThieu đối chiếu thêm cột này khi ghi trạng thái.
      const idxKenh = cleanHeaders.indexOf("KÊNH NỘP");
      const KENH_TS_ONLINE = "TS Online";
      const KENH_TRUC_TIEP_GUARD = "Thu hồ sơ trực tiếp";
      // ĐÃ THÊM (theo phản hồi — hồ sơ ĐÃ DUYỆT bị "tụt" về Mới bổ sung khi sửa/bổ sung,
      // dẫn tới bấm Duyệt lại được lần nữa): cần biết vị trí cột trạng thái để, SAU KHI ghi
      // đè xong 1 dòng UPDATE, kiểm tra xem trạng thái TRƯỚC lần sửa này có phải "Đã duyệt"
      // không — nếu có thì ghi đè LẦN 2 đúng ô này (xem đoạn code ngay sau vòng forEach ở
      // dưới), không cho phép hạ xuống "Mới bổ sung" như client vừa gửi.
      const idxStatus = cleanHeaders.indexOf("TRẠNG THÁI THẨM ĐỊNH");
      // Các cột bookkeeping luôn đổi mỗi lần sửa (timestamp/tài khoản) — không tính là
      // "thay đổi có ý nghĩa" khi liệt kê cho cán bộ Thẩm định xem hồ sơ vừa cập nhật gì.
      const CAC_COT_BO_QUA_KHI_BAO_CAP_NHAT = ["TRẠNG THÁI THẨM ĐỊNH", "NGÀY CẬP NHẬT HỒ SƠ", "TIME", "TÀI KHOẢN NHẬP LIỆU"];
      // ĐÃ THÊM (chặn "phá khoá" hồ sơ đã duyệt — theo phản hồi 2026-09-10: "hồ sơ đã duyệt
      // khi tải lên thì đúng là khoá, nhưng F5 cái là nó mở sạch... chặn dự phòng ở đâu đó,
      // nếu thấy dữ liệu đẩy lên nằm trong các trường bị khoá lại thay đổi thì từ chối ghi").
      // Trước đây việc "khoá" chỉ nằm ở tầng giao diện (disabled={isOldRecordApproved} trên
      // Form, XetTuyenPage.jsx) — F5 làm mất cờ đó (đã sửa riêng ở XetTuyenPage.jsx, lưu qua
      // sessionStorage), nhưng dù frontend có bị sửa/bỏ qua thế nào, backend PHẢI tự chặn
      // được — đây là lớp chặn THẬT SỰ. Danh sách dưới đây khớp ĐÚNG các trường có
      // disabled={isOldRecordApproved} trên Form (không tính Link hồ sơ và hồ sơ giấy tờ tick
      // bổ sung — 2 nhóm đó CỐ Ý vẫn cho sửa sau khi duyệt, xem banner cảnh báo trên Form).
      // Nếu hồ sơ TRƯỚC lần sửa này đã "Đã duyệt" mà client gửi giá trị khác giá trị đang có
      // ở các cột này, GIỮ NGUYÊN giá trị cũ (không ghi giá trị mới) — xem đoạn kiểm tra
      // daDuyetTruocKhiSua trong vòng lặp UPDATE bên dưới.
      const COT_KHOA_KHI_DA_DUYET = [
        "TÊN SINH VIÊN", "CĂN CƯỚC", "CCCD", "MÃ SINH VIÊN", "GIỚI TÍNH", "NGÀY SINH", "NƠI SINH",
        "ĐỐI TƯỢNG ĐẦU VÀO", "NGÀNH", "HỆ ĐÀO TẠO", "HÌNH THỨC ĐÀO TẠO", "KHÓA",
        "NĂM XÉT TUYỂN", "NĂM TỐT NGHIỆP THPT", "ĐỐI TƯỢNG ƯU TIÊN", "KHU VỰC ƯU TIÊN"
      ];

      // TỪ ĐIỂN MÃ HÓA
      const DICT_HE_DT = {
        "Cao đẳng": "01", "Đại học chính quy": "02", "Liên thông ĐH - ĐH (Văn bằng 2)": "03",
        "Thường xuyên: Phương thức ĐTTX": "04", "Liên thông từ CĐ lên ĐH": "05",
        "Thường xuyên: Phương thức VLVH": "06", "Thạc sĩ": "07", "Khóa ngắn hạn cấp chứng chỉ": "08"
      };
      
      const DICT_HINH_THUC = {
        "Chính quy đại trà": "1", "Liên thông ĐH - ĐH chính quy (VB 2)": "2",
        "Thường xuyên: Phương thức ĐTTX": "3", "Thường xuyên: Phương thức VLVH": "4"
      };

      const existingMap = {};
      for (let i = 1; i < data.length; i++) {
         const cccdRow = idxCccd !== -1 ? String(data[i][idxCccd] || "").replace(/\D/g, '') : "";
         const nganhRow = idxNganh !== -1 ? String(data[i][idxNganh] || "").trim().toLowerCase() : "";
         if (cccdRow && nganhRow) existingMap[`${cccdRow}_${nganhRow}`] = i + 1;
      }

      let inserted = 0; let updated = 0; let failedList = [];
      // ĐÃ THÊM (rà soát Trunggian.gs — port sang đây, giữ đúng hành vi an toàn cũ):
      // hồ sơ SỬA (_Action=UPDATE) nhưng KHÔNG khớp được dòng nào theo CCCD+Ngành hiện
      // có trên sheet -> KHÔNG được âm thầm rớt xuống appendRow tạo dòng MỚI (bug cũ ở
      // đây trước khi sửa) — phải báo lỗi rõ ràng, gom vào failedUpdates.
      const failedUpdates = [];
      // ĐÃ THÊM (theo yêu cầu 2026-09-10 — thẩm định lại hồ sơ CŨ đã có MSV thật, nhập tay/
      // import Excel bên Xét tuyển): dò trước toàn bộ MSV đã có trên Trunggian, dùng để
      // chống trùng CHO RIÊNG các dòng "hồ sơ cũ" (client tự gửi kèm giá trị ở cột MSV thay
      // vì để hệ thống tự sinh — xem đoạn xử lý trong nhánh INSERT bên dưới). Hồ sơ MỚI tự
      // sinh mã (generateMaSV) không cần tới danh sách này vì công thức tự nó đã không
      // trùng nhau (gắn theo CCCD).
      const existingMaSVSet = {};
      if (idxMaSV !== -1) {
        for (let i = 1; i < data.length; i++) {
          const vMasv = String(data[i][idxMaSV] || "").replace(/^'/, '').trim();
          if (vMasv) existingMaSVSet[vMasv] = true;
        }
      }
      const failedMaSVTrung = [];
      const insertedDetails = []; const updatedDetails = [];
      // ĐÃ THÊM: kiểm tra NGÀNH/HỆ ĐÀO TẠO/HÌNH THỨC ĐÀO TẠO/ĐỐI TƯỢNG ƯU TIÊN/KHU VỰC ƯU
      // TIÊN/ĐỐI TƯỢNG ĐẦU VÀO/NĂM XÉT TUYỂN khớp danh sách hợp lệ ở CauHinh — áp dụng cho
      // CẢ nhập tay lẫn import Excel bên Xét tuyển (2 luồng đều đẩy qua đúng action này khi
      // bấm "Đẩy dữ liệu lên hệ thống"). Đọc CauHinh 1 LẦN DUY NHẤT cho cả loạt. Cùng lý do
      // như addAdmission/importAdmissions — xem kiemTraHopLeCauHinh_.
      const cauHinhImportStudents = layDanhSachHopLeCauHinh_();
      const invalidRowsImportStudents = [];

      // Lấy/tạo tab "Backup" — backup dòng cũ TRƯỚC khi ghi đè, y hệt Trunggian.gs cũ.
      let backupSheet = ssTrungGian.getSheetByName("Backup");
      if (!backupSheet) backupSheet = ssTrungGian.insertSheet("Backup");

      // 🌟 HÀM SINH MÃ TỰ ĐỘNG THÔNG MINH (Bất tử với việc gõ sai chữ hoa/thường)
      const generateMaSV = (namXT, heDT, hinhThuc, cccdStr) => {
          const aa = String(namXT || "").slice(-2); 
          
          const cleanHeDT = String(heDT || "").trim().toLowerCase();
          const cleanHinhThuc = String(hinhThuc || "").trim().toLowerCase();
          
          let bb = "00";
          for (let key in DICT_HE_DT) {
              if (key.toLowerCase() === cleanHeDT) { bb = DICT_HE_DT[key]; break; }
          }
          // Bọc giáp: Quét từ khóa lỡ người dùng sửa tên Hệ Đào Tạo quá tay
          if (bb === "00") {
              if (cleanHeDT.includes("cao đẳng")) bb = "01";
              else if (cleanHeDT.includes("đại học") || cleanHeDT.includes("đh chính quy")) bb = "02";
              else if (cleanHeDT.includes("văn bằng 2") || cleanHeDT.includes("vb2") || cleanHeDT.includes("vb 2")) bb = "03";
              else if (cleanHeDT.includes("đttx") || cleanHeDT.includes("từ xa")) bb = "04";
              else if (cleanHeDT.includes("lên đh") || cleanHeDT.includes("lên đại học")) bb = "05";
              else if (cleanHeDT.includes("vlvh") || cleanHeDT.includes("vừa làm vừa học")) bb = "06";
              else if (cleanHeDT.includes("thạc sĩ")) bb = "07";
              else if (cleanHeDT.includes("chứng chỉ") || cleanHeDT.includes("ngắn hạn")) bb = "08";
          }
          
          let s = "0";
          for (let key in DICT_HINH_THUC) {
              if (key.toLowerCase() === cleanHinhThuc) { s = DICT_HINH_THUC[key]; break; }
          }
          // Bọc giáp: Quét từ khóa lỡ người dùng sửa tên Hình Thức quá tay
          if (s === "0") {
              if (cleanHinhThuc.includes("đại trà")) s = "1";
              else if (cleanHinhThuc.includes("văn bằng 2") || cleanHinhThuc.includes("vb 2") || cleanHinhThuc.includes("vb2")) s = "2";
              else if (cleanHinhThuc.includes("đttx") || cleanHinhThuc.includes("từ xa")) s = "3";
              else if (cleanHinhThuc.includes("vlvh") || cleanHinhThuc.includes("vừa làm vừa học")) s = "4";
          }
          
          if (!aa || aa.length !== 2) return ""; 
          
          const cccdClean = String(cccdStr || "").replace(/\D/g, '');
          const xxxxxx = cccdClean.slice(-6).padStart(6, '0');
          
          const finalCode = `${aa}${bb}${s}${xxxxxx}`;
          return "'" + finalCode; 
      };

      studentsArray.forEach(s => {
        const cleanS = {};
        for (let key in s) {
            cleanS[String(key).trim().toUpperCase().replace(/\s+/g, ' ')] = s[key];
        }

        // ĐÃ THÊM: chặn NGAY TỪ ĐẦU (trước cả backup/ghi đè/tạo dòng mới) nếu có trường
        // không khớp danh sách hợp lệ — gom vào invalidRowsImportStudents, KHÔNG ghi gì cả,
        // để không làm thủng dữ liệu (dữ liệu không khớp được các trường giá trị cố định).
        const loiCauHinhIS = kiemTraHopLeCauHinh_(cleanS, cauHinhImportStudents);
        if (loiCauHinhIS) {
          invalidRowsImportStudents.push({
            ten: cleanS["TÊN SINH VIÊN"] || "",
            nganh: cleanS["NGÀNH"] || cleanS["NGANH"] || "",
            cccd: String(cleanS["CĂN CƯỚC"] || cleanS["CCCD"] || "").replace(/\D/g, ''),
            loi: loiCauHinhIS,
          });
          return;
        }

        const cccdTarget = String(cleanS["CĂN CƯỚC"] || cleanS["CCCD"] || "").replace(/\D/g, '');
        const nganhTarget = String(cleanS["NGÀNH"] || cleanS["NGANH"] || "").trim().toLowerCase();
        const keyMap = `${cccdTarget}_${nganhTarget}`;
        const rowIndex = existingMap[keyMap];

        if (cleanS["CĂN CƯỚC"]) cleanS["CĂN CƯỚC"] = "'" + String(cleanS["CĂN CƯỚC"]).replace(/'/g, '');
        if (cleanS["CCCD"]) cleanS["CCCD"] = "'" + String(cleanS["CCCD"]).replace(/'/g, '');

        const newMaSV = generateMaSV(cleanS["NĂM XÉT TUYỂN"], cleanS["HỆ ĐÀO TẠO"], cleanS["HÌNH THỨC ĐÀO TẠO"], cccdTarget);
        const targetMaSVCol = idxMaSV !== -1 ? cleanHeaders[idxMaSV] : null;

        if (cleanS["_ACTION"] === 'UPDATE') {
          if (rowIndex) {
            // Backup dòng cũ TRƯỚC khi ghi đè, giống hệt Trunggian.gs cũ.
            const oldRowData = sheet.getRange(rowIndex, 1, 1, cleanHeaders.length).getValues()[0];
            if (backupSheet.getLastRow() === 0) {
              const backupHeaders = cleanHeaders.slice();
              backupHeaders.push("BACKUP DATE");
              backupSheet.appendRow(backupHeaders);
              backupSheet.getRange(1, 1, 1, backupHeaders.length).setFontWeight("bold").setBackground("#e0f2f1");
            }
            const rowToBackup = oldRowData.slice();
            rowToBackup.push(Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss"));
            backupSheet.appendRow(rowToBackup);

            // ĐÃ THÊM: tự gắn "TS Online" cho hồ sơ Xét tuyển đang sửa nếu KÊNH NỘP đang
            // trống — CHỈ khi chưa phải "Thu hồ sơ trực tiếp" (phòng trường hợp hiếm: sửa
            // nhầm 1 hồ sơ Nhập học trùng CCCD+Ngành — tuyệt đối không ghi đè kênh của nó).
            if (idxKenh !== -1 && cleanS["KÊNH NỘP"] === undefined) {
              const existingKenh = String(oldRowData[idxKenh] || "").trim();
              if (existingKenh !== KENH_TRUC_TIEP_GUARD) cleanS["KÊNH NỘP"] = KENH_TS_ONLINE;
            }

            const changeLines = [];
            // ĐÃ THÊM: danh sách TÊN CỘT (không kèm giá trị, ngắn gọn hơn changeLines) thật sự
            // đổi khác — dùng để nhét vào ô "TRẠNG THÁI THẨM ĐỊNH" cho cán bộ Thẩm định thấy
            // ngay hồ sơ vừa cập nhật CHỖ NÀO mà không cần mò vào tin nhắn Google Chat.
            const changedHeaderNames = [];
            // ĐÃ THÊM: xem chú thích đầy đủ tại khai báo COT_KHOA_KHI_DA_DUYET phía trên đầu
            // hàm — tính TRƯỚC vòng lặp ghi đè, dựa trên oldRowData (trạng thái TRƯỚC lần sửa
            // này, đọc TRƯỚC khi ghi bất kỳ gì xuống dòng này ở dưới).
            const daDuyetTruocKhiSua = idxStatus !== -1 && String(oldRowData[idxStatus] || "").trim().indexOf("Đã duyệt") !== -1;
            const rejectedFieldNames = [];
            cleanHeaders.forEach((h, colIndex) => {
              if (cleanS[h] !== undefined) {
                  if (colIndex === idxMaSV) {
                      const oldData = String(data[rowIndex - 1][colIndex] || "").trim();
                      if (!oldData && cleanS[h]) sheet.getRange(rowIndex, colIndex + 1).setValue(cleanS[h]);
                  } else {
                      const oldValStr = String(oldRowData[colIndex] === null || oldRowData[colIndex] === undefined ? "" : oldRowData[colIndex]).trim();
                      const newValStr = String(cleanS[h]).trim();
                      // ĐÃ THÊM: hồ sơ đã duyệt TRƯỚC lần sửa này -> từ chối tuyệt đối việc ghi
                      // đè các cột định danh/điều kiện xét tuyển, dù client gửi giá trị khác đi
                      // — bỏ qua HẲN field này (không log thay đổi, không setValue), giữ nguyên
                      // giá trị đang có trên Sheet. Đây là lớp chặn THẬT ở backend, không phụ
                      // thuộc Form phía trình duyệt có bị sửa/bỏ qua disabled hay không.
                      if (daDuyetTruocKhiSua && oldValStr !== newValStr && COT_KHOA_KHI_DA_DUYET.indexOf(h) !== -1) {
                        rejectedFieldNames.push(h);
                        return;
                      }
                      if (oldValStr !== newValStr) {
                        changeLines.push(h + ": \"" + truncateForChat(oldValStr) + "\" → \"" + truncateForChat(newValStr) + "\"");
                        if (CAC_COT_BO_QUA_KHI_BAO_CAP_NHAT.indexOf(h) === -1) changedHeaderNames.push(h);
                      }
                      // ĐÃ THÊM: cột NGÀY SINH luôn ghi xuống dưới dạng Date object thật (xem
                      // chuanHoaNgaySinhThanhDate_ ở DinhDanh.gs) — dòng log thay đổi ở trên vẫn
                      // dùng giá trị gốc (newValStr) để hiện dễ đọc trên Google Chat, chỉ giá trị
                      // THẬT SỰ ghi xuống ô mới đổi sang Date.
                      const cellUpd = sheet.getRange(rowIndex, colIndex + 1);
                      cellUpd.setValue(h === "NGÀY SINH" ? chuanHoaNgaySinhThanhDate_(cleanS[h]) : cleanS[h]);
                      // ĐÃ THÊM: áp định dạng hiển thị ngay tại chỗ ghi cho NGÀY SINH — cùng lý
                      // do như addAdmission/updateAdmission/importAdmissions.
                      if (h === "NGÀY SINH") cellUpd.setNumberFormat(DINH_DANG_NGAY_SINH);
                  }
              }
            });

            // ĐÃ THÊM (theo phản hồi — hồ sơ ĐÃ DUYỆT bị "tụt" về Mới bổ sung khi sửa/bổ
            // sung, dẫn tới bấm Duyệt lại được lần nữa): nếu trạng thái TRƯỚC lần sửa này
            // (oldRowData, đọc TRƯỚC khi ghi đè ở trên) đã là "Đã duyệt", GHI ĐÈ LẦN 2 đúng ô
            // trạng thái thành "Đã duyệt (Có cập nhật: <các cột vừa đổi>)" — KHÔNG để giá trị
            // "Mới bổ sung" mà client vừa gửi (ở vòng forEach trên) tồn tại. Cố tình KHÔNG
            // thêm cột cờ riêng — mọi nơi đang kiểm tra trạng thái (getAppState() bên
            // thamDinhHelpers.js, ThamDinhPage.jsx) đều dùng chuỗi con "Đã duyệt" (.includes)
            // nên vẫn nhận đúng là ĐÃ DUYỆT dù có thêm hậu tố; ThamDinhPage.jsx nhận diện thêm
            // hậu tố "(Có cập nhật" để đổi màu nút + cho bấm Duyệt lại (mở khoá TẠM riêng nút
            // đó, xem ThamDinhPage.jsx). Nếu không có cột gì thật sự đổi (chỉ có timestamp/tài
            // khoản, xem CAC_COT_BO_QUA_KHI_BAO_CAP_NHAT) thì trả về đúng "Đã duyệt" sạch,
            // không thêm hậu tố thừa.
            if (idxStatus !== -1 && daDuyetTruocKhiSua) {
              const trangThaiSauKhiSua = changedHeaderNames.length > 0
                ? "Đã duyệt (Có cập nhật: " + changedHeaderNames.join(', ') + ")"
                : "Đã duyệt";
              sheet.getRange(rowIndex, idxStatus + 1).setValue(trangThaiSauKhiSua);
            }

            updated++;
            updatedDetails.push({
              ten: cleanS["TÊN SINH VIÊN"] || "", nganh: cleanS["NGÀNH"] || cleanS["NGANH"] || "", changes: changeLines,
              // ĐÃ THÊM: các cột bị TỪ CHỐI ghi (xem COT_KHOA_KHI_DA_DUYET) — báo luôn trong
              // thông báo Google Chat để cán bộ Thẩm định/Tuyển sinh biết có người cố sửa
              // trường đã khoá của 1 hồ sơ đã duyệt, không âm thầm mất dấu vết.
              rejected: rejectedFieldNames
            });
          } else {
             // ĐÃ SỬA: trước đây rớt xuống appendRow tạo dòng MỚI khi không khớp được hồ sơ
             // gốc cần sửa — nguy cơ tạo hồ sơ trùng do CCCD/Ngành gửi lên lệch với dòng gốc.
             // Giờ CHỈ báo lỗi rõ ràng, không ghi gì cả.
             failedUpdates.push({ cccd: cccdTarget, nganh: cleanS["NGÀNH"] || cleanS["NGANH"] || "", ten: cleanS["TÊN SINH VIÊN"] || "" });
          }
        } else {
          if (rowIndex) {
             failedList.push({ cccd: cccdTarget, nganh: cleanS["NGÀNH"] || cleanS["NGANH"] || "" });
          } else {
             // ĐÃ THÊM (theo yêu cầu 2026-09-10 — "hồ sơ cũ" đã có MSV thật, nhập tay/import
             // Excel bên Xét tuyển): nếu dòng này ĐÃ có sẵn giá trị ở cột MSV (client tự gửi
             // lên — khác hồ sơ MỚI hoàn toàn, luôn để trống cho hệ thống tự sinh), coi là
             // "hồ sơ cũ" — dòng if ngay dưới (tự sinh mã) vốn đã tự bỏ qua khi có giá trị,
             // KHÔNG cần sửa gì thêm ở đó — nhưng phải chống trùng MSV trước khi ghi: (1) đã
             // tồn tại ở dòng khác trên Trunggian, hoặc (2) trùng với 1 dòng KHÁC ngay trong
             // CHÍNH lô đang đẩy lên (2 hồ sơ khác nhau lỡ gõ trùng tay) — trùng thì BỎ QUA
             // dòng này, không ghi, báo riêng cho người nhập (khác "TRÙNG CCCD+NGÀNH" ở
             // failedList — đây là trùng đúng MSV).
             const msvNhapTay = targetMaSVCol ? String(cleanS[targetMaSVCol] || "").replace(/^'/, '').trim() : "";
             if (msvNhapTay) {
               if (existingMaSVSet[msvNhapTay]) {
                 failedMaSVTrung.push({ ten: cleanS["TÊN SINH VIÊN"] || "", nganh: cleanS["NGÀNH"] || cleanS["NGANH"] || "", masv: msvNhapTay });
                 return;
               }
               existingMaSVSet[msvNhapTay] = true;
             }
             if (targetMaSVCol && !cleanS[targetMaSVCol] && newMaSV) cleanS[targetMaSVCol] = newMaSV;
             // ĐÃ THÊM: hồ sơ MỚI từ luồng Xét tuyển -> gắn KÊNH NỘP = "TS Online" mặc định
             // (không có gì để "ghi đè nhầm" ở nhánh này vì đây là dòng hoàn toàn mới).
             if (idxKenh !== -1 && !cleanS["KÊNH NỘP"]) cleanS["KÊNH NỘP"] = KENH_TS_ONLINE;
             // PHA 1·D1 (bước 2) — như addAdmission/importAdmissions: tự gắn sv_key cho hồ sơ
             // MỚI (chỉ nhánh này — dòng hoàn toàn mới, không đụng nhánh UPDATE ở trên, việc
             // đồng bộ sv_key khi SỬA hồ sơ đã có sẽ làm riêng sau, như đã thống nhất).
             if (!cleanS["SV_KEY"]) cleanS["SV_KEY"] = dinhDanhGanTuDongChoHoSoMoi_(cleanS["TÊN SINH VIÊN"], cleanS["NGÀY SINH"], cccdTarget, g.userInfo.email);
             // ĐÃ THÊM (theo yêu cầu 2026-09-10): hồ sơ CŨ đã có MSV thật (msvNhapTay) ->
             // đăng ký NGAY vào sổ định danh (dinh_danh_phu) làm mã MSV chính thức, PHỤ THÊM
             // cho sv_key vừa có ở trên — không cần đợi chạy backfill riêng mới biết tới MSV
             // này. Hồ sơ MỚI TINH (MSV do generateMaSV tự sinh, không tick/điền "hồ sơ cũ")
             // KHÔNG áp dụng nhánh này — giữ nguyên hành vi hiện tại (chỉ CCCD được đăng ký
             // lúc tạo, xem dinhDanhGanTuDongChoHoSoMoi_), MSV loại này sẽ được sổ định danh
             // biết tới qua lần backfill sau, như hiện tại. Lỗi ở đây không được chặn việc
             // tạo hồ sơ chính — cùng nguyên tắc "không bao giờ làm hỏng nghiệp vụ chính" của
             // dinhDanhGanTuDongChoHoSoMoi_.
             if (msvNhapTay && cleanS["SV_KEY"] && cleanS["SV_KEY"] !== "CẦN_XÁC_NHẬN") {
               try { dinhDanhThemMa_(cleanS["SV_KEY"], 'MSV', msvNhapTay, 'Trường', g.userInfo.email, true); }
               catch (errMaCu) { Logger.log("Lỗi đăng ký MSV hồ sơ cũ vào định danh (không chặn tạo hồ sơ): " + errMaCu.toString()); }
             }
             // ĐÃ THÊM: cùng lý do — ghi NGÀY SINH xuống dưới dạng Date object thật, làm SAU
             // khi đã gọi dinhDanhGanTuDongChoHoSoMoi_ ở trên (hàm đó tự nhận diện được cả giá
             // trị gốc lẫn Date object nên gọi trước/sau đều đúng, không phải đổi thứ tự).
             if (cleanS["NGÀY SINH"]) cleanS["NGÀY SINH"] = chuanHoaNgaySinhThanhDate_(cleanS["NGÀY SINH"]);
             const newRow = cleanHeaders.map(h => cleanS[h] !== undefined ? cleanS[h] : "");
             sheet.appendRow(newRow);
             // ĐÃ THÊM: áp định dạng hiển thị ngay tại chỗ ghi cho NGÀY SINH — cùng lý do như
             // các nơi ghi khác ở trên.
             const idxNgaySinhIns = cleanHeaders.indexOf("NGÀY SINH");
             if (idxNgaySinhIns !== -1) {
               sheet.getRange(sheet.getLastRow(), idxNgaySinhIns + 1).setNumberFormat(DINH_DANG_NGAY_SINH);
             }
             inserted++;
             existingMap[keyMap] = sheet.getLastRow();
             insertedDetails.push({ ten: cleanS["TÊN SINH VIÊN"] || "", nganh: cleanS["NGÀNH"] || cleanS["NGANH"] || "" });
          }
        }
      });

      // ĐÃ THÊM (rà soát Trunggian.gs): thông báo Google Chat chi tiết từng hồ sơ mới/
      // sửa/trùng/lỗi — y hệt bản cũ, kèm giới hạn độ dài an toàn cho webhook Chat.
      if (inserted > 0 || updated > 0 || failedList.length > 0 || failedUpdates.length > 0 || invalidRowsImportStudents.length > 0 || failedMaSVTrung.length > 0) {
        let msg = "🔔 *THÔNG BÁO CẬP NHẬT DỮ LIỆU TỪ TUYỂN SINH*\n";
        if (inserted > 0) {
          msg += "\n➕ *" + inserted + " hồ sơ MỚI:*\n";
          insertedDetails.forEach(d => { msg += "• " + (d.ten || "(chưa rõ tên)") + " — Ngành: " + (d.nganh || "(chưa rõ)") + "\n"; });
        }
        if (updated > 0) {
          msg += "\n🔄 *" + updated + " hồ sơ BỔ SUNG:*\n";
          updatedDetails.forEach(d => {
            msg += "• " + (d.ten || "(chưa rõ tên)") + " — Ngành: " + (d.nganh || "(chưa rõ)") + "\n";
            if (d.changes.length > 0) d.changes.forEach(c => { msg += "    ↳ " + c + "\n"; });
            else msg += "    ↳ (không có trường nào thay đổi giá trị)\n";
            // ĐÃ THÊM: xem chú thích tại COT_KHOA_KHI_DA_DUYET/rejectedFieldNames —
            // hồ sơ đã duyệt, có người gửi giá trị khác cho (các) cột đã khoá, đã bị chặn.
            if (d.rejected && d.rejected.length > 0) {
              msg += "    🔒 ĐÃ CHẶN sửa (hồ sơ đã duyệt, giữ nguyên giá trị cũ): " + d.rejected.join(', ') + "\n";
            }
          });
        }
        if (failedList.length > 0) {
          msg += "\n⚠️ *" + failedList.length + " hồ sơ TRÙNG* (cùng Căn cước + Ngành đã tồn tại) bị bỏ qua, không ghi đè:\n";
          failedList.forEach(d => { msg += "• Ngành: " + (d.nganh || "(chưa rõ)") + " — CCCD: " + (d.cccd || "") + "\n"; });
        }
        if (failedUpdates.length > 0) {
          msg += "\n🚫 *" + failedUpdates.length + " hồ sơ SỬA THẤT BẠI* (không khớp được hồ sơ gốc theo CCCD+Ngành) — CẦN KIỂM TRA:\n";
          failedUpdates.forEach(d => { msg += "• " + (d.ten || "(chưa rõ tên)") + " — Ngành: " + (d.nganh || "(chưa rõ)") + " — CCCD: " + (d.cccd || "") + "\n"; });
        }
        if (invalidRowsImportStudents.length > 0) {
          msg += "\n🚫 *" + invalidRowsImportStudents.length + " hồ sơ BỊ CHẶN* do dữ liệu không khớp danh sách hợp lệ (CauHinh) — CẦN SỬA VÀ NHẬP LẠI:\n";
          invalidRowsImportStudents.forEach(d => { msg += "• " + (d.ten || "(chưa rõ tên)") + " — Ngành: " + (d.nganh || "(chưa rõ)") + " — Lỗi: " + d.loi + "\n"; });
        }
        // ĐÃ THÊM (theo yêu cầu 2026-09-10): hồ sơ CŨ gõ MSV trùng với dòng khác (đã có trên
        // Trunggian, hoặc trùng nội bộ chính lô đang đẩy lên) — xem đoạn xử lý trong forEach.
        if (failedMaSVTrung.length > 0) {
          msg += "\n🚫 *" + failedMaSVTrung.length + " hồ sơ CŨ bị BỎ QUA do TRÙNG MÃ SINH VIÊN* với hồ sơ khác — CẦN KIỂM TRA LẠI MSV:\n";
          failedMaSVTrung.forEach(d => { msg += "• " + (d.ten || "(chưa rõ tên)") + " — Ngành: " + (d.nganh || "(chưa rõ)") + " — MSV: " + d.masv + "\n"; });
        }
        msg += "\n👤 Người thực hiện: " + g.userInfo.email;

        const CHAT_MSG_SAFE_LIMIT = 3800;
        if (msg.length > CHAT_MSG_SAFE_LIMIT) msg = msg.substring(0, CHAT_MSG_SAFE_LIMIT) + "\n\n… (tin nhắn quá dài, đã rút gọn — xem đầy đủ trên hệ thống)";

        const webhookImport = PropertiesService.getScriptProperties().getProperty('WEBHOOK_GCHAT');
        try { guiTinNhanGoogleChat(webhookImport, msg); } catch (chatErr) { /* lỗi gửi Chat không ảnh hưởng dữ liệu đã ghi thành công */ }
      }

      let message = `Đã đẩy thành công lên hệ thống:\n- Thêm mới: ${inserted} hồ sơ\n- Cập nhật (Sửa): ${updated} hồ sơ`;
      if (failedList.length > 0) {
         message += `\n\n⚠️ TỪ CHỐI ${failedList.length} hồ sơ do TRÙNG LẶP dữ liệu cũ! Vui lòng dùng chức năng "Tìm hồ sơ cũ" để Sửa.`;
      }
      if (failedUpdates.length > 0) {
         message += `\n\n🚫 ${failedUpdates.length} hồ sơ SỬA THẤT BẠI do không khớp được hồ sơ gốc!`;
      }
      if (invalidRowsImportStudents.length > 0) {
         message += `\n\n🚫 ${invalidRowsImportStudents.length} hồ sơ BỊ CHẶN do dữ liệu không khớp danh sách hợp lệ (NGÀNH/HỆ ĐÀO TẠO/...) — xem chi tiết bên dưới, cần sửa và nhập lại riêng.`;
      }
      if (failedMaSVTrung.length > 0) {
         message += `\n\n🚫 ${failedMaSVTrung.length} hồ sơ CŨ bị BỎ QUA do TRÙNG MÃ SINH VIÊN với hồ sơ khác — kiểm tra lại MSV đã nhập.`;
      }

      return responseJSON(200, message, { inserted, updated, failedList, failedUpdates, invalidRows: invalidRowsImportStudents, failedMaSVTrung });
    }

function hdPost_trungTuyen(e, ss) {
      const g = requireAuth(e.parameter, ['ThamDinh', 'Admin']);
      if (!g.ok) return g.resp;

      const rawData = JSON.parse(e.parameter.data);
      if (!rawData || rawData.length === 0) return responseJSON(400, "Không có dữ liệu", null);

      const props = PropertiesService.getScriptProperties();
      const TEMPLATE_DOC_ID = props.getProperty('TRUNGTUYEN_TEMPLATE_DOC_ID');
      const FOLDER_ID = props.getProperty('TRUNGTUYEN_FOLDER_ID');
      const WEBHOOK_GCHAT = props.getProperty('WEBHOOK_GCHAT');
      const TRUNGGIAN_SHEET_ID = props.getProperty('TRUNGGIAN_SHEET_ID');

      // Kết quả từng bản ghi — mặc định "success" vì tất cả sẽ có mặt trong biên nhận PDF
      // chung; hạ xuống "warning" nếu bước ghi trạng thái riêng của từng người bị lỗi.
      const results = rawData.map(sv => ({
        cccd: String(sv.soCCCD || "").trim(), hoTen: String(sv.hoTen || "").trim(),
        nganh: String(sv.nganh || "").trim().toLowerCase(), status: "success",
        message: "Đã đưa vào biên nhận trúng tuyển."
      }));

      try {
        const folder = DriveApp.getFolderById(FOLDER_ID);
        const templateDoc = DriveApp.getFileById(TEMPLATE_DOC_ID);
        const tempDocFile = templateDoc.makeCopy("Nhap_TrungTuyen_" + new Date().getTime(), folder);
        const doc = DocumentApp.openById(tempDocFile.getId());
        const body = doc.getBody();

        const ngayChuan = rawData[0].ngayCapNhat || Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy");
        body.replaceText("{{NGAY}}", ngayChuan);

        const tableData = [["STT", "Họ và tên", "Ngày sinh", "Số CCCD", "Ngành", "Trạng thái"]];
        rawData.forEach((sv, index) => {
          try {
            tableData.push([(index + 1).toString(), String(sv.hoTen || "").trim(), String(sv.ngaySinh || "").trim(), String(sv.soCCCD || "").trim(), String(sv.nganh || "").trim(), "Trúng tuyển - Đủ hồ sơ"]);
          } catch (rowErr) {
            tableData.push([(index + 1).toString(), String(sv.hoTen || "(lỗi dữ liệu)"), "", String(sv.soCCCD || ""), String(sv.nganh || ""), "Trúng tuyển - Đủ hồ sơ"]);
            results[index].status = "warning";
            results[index].message = "Dữ liệu dòng có lỗi khi dựng bảng: " + rowErr.toString();
          }
        });

        const searchResult = body.findText("{{BANG_DANH_SACH}}");
        if (searchResult) {
          const element = searchResult.getElement();
          const parentParagraph = element.getParent();
          const insertIndex = body.getChildIndex(parentParagraph);
          body.removeChild(parentParagraph);
          const table = body.insertTable(insertIndex, tableData);

          const tableStyle = {};
          tableStyle[DocumentApp.Attribute.HORIZONTAL_ALIGNMENT] = DocumentApp.HorizontalAlignment.CENTER;
          table.setAttributes(tableStyle);

          const colWidths = [35, 135, 80, 100, 210, 140];
          for (let c = 0; c < colWidths.length; c++) { table.setColumnWidth(c, colWidths[c]); }

          for (let r = 0; r < table.getNumRows(); r++) {
            const row = table.getRow(r);
            for (let cellIdx = 0; cellIdx < row.getNumCells(); cellIdx++) {
              const cell = row.getCell(cellIdx);
              const par = cell.getChild(0).asParagraph();
              const text = par.editAsText();
              text.setFontSize(13); par.setLineSpacing(1.15);
              cell.setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER);
              if (r === 0) {
                cell.setBackgroundColor("#e3f2fd"); par.setAlignment(DocumentApp.HorizontalAlignment.CENTER); text.setBold(true);
              } else {
                if (cellIdx === 0 || cellIdx === 2 || cellIdx === 3 || cellIdx === 5) par.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
                else par.setAlignment(DocumentApp.HorizontalAlignment.LEFT);
              }
            }
          }
        }
        doc.saveAndClose();

        const dateString = Utilities.formatDate(new Date(), "GMT+7", "dd_MM_yyyy");
        const pdfBlob = tempDocFile.getAs(MimeType.PDF);
        pdfBlob.setName("Bien_nhan_Trung_Tuyen_" + dateString + ".pdf");
        const pdfFile = folder.createFile(pdfBlob);
        pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        const pdfUrl = pdfFile.getUrl();
        tempDocFile.setTrashed(true);

        try {
          UrlFetchApp.fetch(WEBHOOK_GCHAT, {
            method: "post", headers: { "Content-Type": "application/json; charset=UTF-8" },
            payload: JSON.stringify({ text: "🎉 *THÔNG BÁO TRÚNG TUYỂN*\nHiện tại có *" + rawData.length + " thí sinh* Trúng tuyển và Đủ hồ sơ (Ngày: " + ngayChuan + ").\n\n👉 *Click để tải/in danh sách:* " + pdfUrl }),
            muteHttpExceptions: true
          });
        } catch (notifyErr) { /* Lỗi gửi thông báo Chat không ảnh hưởng tới PDF đã tạo thành công */ }

        // Ghi trạng thái "Đã duyệt" vào sheet TrungGian dựa theo header
        try {
          const ss2 = SpreadsheetApp.openById(TRUNGGIAN_SHEET_ID);
          // ĐÃ VÁ BUG (đồng bộ với getThamDinhData): bỏ tìm theo tên "Sheet1", luôn lấy
          // tab đầu tiên theo vị trí -> ghi đúng tab thật, không lệch sang tab rác trùng tên.
          const sheet2 = ss2.getSheets()[0];
          if (sheet2) {
            const values = sheet2.getDataRange().getValues();
            const headers = values[0];
            // ĐÃ THÊM (rà soát an toàn 2 luồng chung 1 sheet): dò thêm cột KÊNH NỘP —
            // trước đây chỉ khớp theo CCCD+NGÀNH, nên nếu 1 hồ sơ "Thu hồ sơ trực tiếp"
            // (trang Nhập học, đã có trạng thái "Đã trúng tuyển") trùng CCCD+Ngành với 1
            // hồ sơ Xét tuyển đang được duyệt ở đây, sẽ bị GHI ĐÈ NHẦM sang "Đã duyệt".
            // Giờ bắt buộc khớp thêm KÊNH NỘP (nếu sheet có cột này) trước khi ghi.
            let cccdCol = -1, nganhCol = -1, statusCol = -1, kenhCol = -1;
            for (let h = 0; h < headers.length; h++) {
              const hName = String(headers[h]).toUpperCase().trim().replace(/\s+/g, ' ');
              if (hName === "CĂN CƯỚC" || hName === "SỐ CCCD" || hName === "CCCD") cccdCol = h;
              if (hName === "NGÀNH ĐÀO TẠO" || hName === "NGÀNH") nganhCol = h;
              if (hName.indexOf("TRẠNG THÁI") !== -1) statusCol = h;
              if (hName === "KÊNH NỘP") kenhCol = h;
            }
            if (cccdCol !== -1 && nganhCol !== -1 && statusCol !== -1) {
              rawData.forEach((sv, idx) => {
                try {
                  const payloadCccd = String(sv.soCCCD).replace(/\D/g, '');
                  const payloadNganh = String(sv.nganh).trim().toLowerCase();
                  const payloadKenh = String(sv.kenhNop || "").trim();
                  let found = false;
                  for (let i = 1; i < values.length; i++) {
                    const sheetCccd = String(values[i][cccdCol]).replace(/\D/g, '');
                    const sheetNganh = String(values[i][nganhCol]).trim().toLowerCase();
                    const sheetKenh = kenhCol !== -1 ? String(values[i][kenhCol] || "").trim() : "";
                    if (sheetCccd === payloadCccd && sheetNganh === payloadNganh && (kenhCol === -1 || sheetKenh === payloadKenh)) {
                      sheet2.getRange(i + 1, statusCol + 1).setValue("Đã duyệt");
                      found = true; break;
                    }
                  }
                  if (!found) {
                    results[idx].status = "warning";
                    results[idx].message = "Đã có trong biên nhận PDF, nhưng không tìm thấy dòng tương ứng để cập nhật trạng thái.";
                  }
                } catch (recErr) {
                  results[idx].status = "warning";
                  results[idx].message = "Đã có trong biên nhận PDF, nhưng lỗi khi cập nhật trạng thái: " + recErr.toString();
                }
              });
              SpreadsheetApp.flush();
            }
          }
        } catch (e2) { /* Lỗi tổng khi ghi trạng thái không làm hỏng kết quả PDF đã tạo thành công */ }

        // ĐÃ THÊM: ghi lịch sử "ai đã duyệt trúng tuyển, khi nào, bao nhiêu thí sinh" — trước
        // đây hành động này KHÔNG hề được ghi log, dù đã xác thực được người gọi qua
        // requireAuth() (xác thực identity ≠ lưu lại identity).
        ghiLichSuThaoTac_(g.userInfo.email, "Duyệt trúng tuyển", rawData.length + " thí sinh (ngày " + ngayChuan + ") — PDF: " + pdfUrl);

        return responseJSON(200, "success", { pdfUrl: pdfUrl, results: results });
      } catch (error) {
        return responseJSON(500, error.toString(), null);
      }
    }

// ĐÃ THÊM (theo phản hồi — "Xác nhận lại" 1 hồ sơ ĐÃ DUYỆT vừa được sửa/bổ sung, trạng thái
// đang mang hậu tố "(Có cập nhật: ...)" do hdPost_importStudents gắn): trước đây modal chi
// tiết (ThamDinhPage.jsx) gọi THẲNG action 'trungTuyen' (hdPost_trungTuyen ở trên) cho lượt
// "Xác nhận lại" này — nghĩa là MỖI lần xác nhận lại đều xuất PDF biên nhận MỚI + bắn lại
// thông báo Google Chat y hệt lần duyệt trúng tuyển ĐẦU TIÊN, dù chỉ là xác nhận cán bộ đã
// xem lại phần vừa đổi, không phải 1 quyết định trúng tuyển mới. Action RIÊNG này KHÔNG tạo
// Doc/PDF, KHÔNG gọi Webhook Google Chat — chỉ tìm đúng dòng theo CCCD+Ngành(+Kênh nộp, cùng
// quy ước chống ghi nhầm với hdPost_trungTuyen) rồi ghi lại "Đã duyệt" sạch vào cột trạng
// thái (xoá hậu tố "(Có cập nhật: ...)"). Có ghi log riêng (khác "Duyệt trúng tuyển") để phân
// biệt rõ trong NhatKy — đây là 1 lượt XEM LẠI, không phải 1 lượt DUYỆT MỚI.
function hdPost_xacNhanCapNhatDaDuyet(e, ss) {
      const g = requireAuth(e.parameter, ['ThamDinh', 'Admin']);
      if (!g.ok) return g.resp;
      try {
        const rawData = JSON.parse(e.parameter.data);
        if (!Array.isArray(rawData) || rawData.length === 0) return responseJSON(400, "Không có dữ liệu", null);

        const TRUNGGIAN_ID = PropertiesService.getScriptProperties().getProperty('TRUNGGIAN_SHEET_ID');
        const ssTrungGian = SpreadsheetApp.openById(TRUNGGIAN_ID);
        const sheet = ssTrungGian.getSheets()[0];
        const values = sheet.getDataRange().getValues();
        const headers = values[0];

        let cccdCol = -1, nganhCol = -1, statusCol = -1, kenhCol = -1;
        for (let h = 0; h < headers.length; h++) {
          const hName = String(headers[h]).toUpperCase().trim().replace(/\s+/g, ' ');
          if (hName === "CĂN CƯỚC" || hName === "SỐ CCCD" || hName === "CCCD") cccdCol = h;
          if (hName === "NGÀNH ĐÀO TẠO" || hName === "NGÀNH") nganhCol = h;
          if (hName.indexOf("TRẠNG THÁI") !== -1) statusCol = h;
          if (hName === "KÊNH NỘP") kenhCol = h;
        }
        if (cccdCol === -1 || nganhCol === -1 || statusCol === -1) {
          return responseJSON(500, "Sheet Trung Gian thiếu cột CĂN CƯỚC/NGÀNH/TRẠNG THÁI", null);
        }

        const results = [];
        rawData.forEach(sv => {
          const cccd = String(sv.soCCCD || "").replace(/\D/g, '');
          const nganh = String(sv.nganh || "").trim().toLowerCase();
          const kenh = String(sv.kenhNop || "").trim();
          let found = false;
          for (let i = 1; i < values.length; i++) {
            const sheetCccd = String(values[i][cccdCol]).replace(/\D/g, '');
            const sheetNganh = String(values[i][nganhCol]).trim().toLowerCase();
            const sheetKenh = kenhCol !== -1 ? String(values[i][kenhCol] || "").trim() : "";
            if (sheetCccd === cccd && sheetNganh === nganh && (kenhCol === -1 || sheetKenh === kenh)) {
              found = true;
              const rawStatus = String(values[i][statusCol] || "").trim();
              // ĐÃ THÊM: chỉ xử lý đúng tình huống "Đã duyệt (...)" — nếu từ lúc mở modal tới
              // giờ trạng thái đã bị đổi sang khác (VD ai đó vừa Y/C bổ sung ở tab khác) thì
              // báo lỗi rõ ràng, KHÔNG âm thầm ép về "Đã duyệt".
              if (rawStatus.indexOf("Đã duyệt") === -1) {
                results.push({ cccd: cccd, nganh: nganh, status: "error", message: "Hồ sơ không còn ở trạng thái Đã duyệt (có thể vừa bị đổi ở nơi khác) — tải lại trang để xem trạng thái mới nhất." });
              } else {
                sheet.getRange(i + 1, statusCol + 1).setValue("Đã duyệt");
                results.push({ cccd: cccd, nganh: nganh, status: "success", message: "Đã xác nhận lại — không xuất biên nhận mới." });
              }
              break;
            }
          }
          if (!found) results.push({ cccd: cccd, nganh: nganh, status: "error", message: "Không tìm thấy hồ sơ tương ứng." });
        });
        SpreadsheetApp.flush();

        ghiLichSuThaoTac_(g.userInfo.email, "Xác nhận lại hồ sơ đã duyệt (có cập nhật)", rawData.length + " thí sinh — không xuất biên nhận/thông báo mới");

        return responseJSON(200, "success", { results: results });
      } catch (err) {
        return responseJSON(500, "Lỗi xác nhận lại: " + dienGiaiLoi_(err), null);
      }
    }

function hdPost_baoThieu(e, ss) {
      const g = requireAuth(e.parameter, ['ThamDinh', 'Admin']);
      if (!g.ok) return g.resp;

      const rawData = JSON.parse(e.parameter.data);
      const data = (rawData || []).filter(sv => sv.hosoThieu && sv.hosoThieu.toLowerCase().indexOf("thiếu") !== -1);
      if (data.length === 0) return responseJSON(400, "Không có hồ sơ thiếu", null);

      const props = PropertiesService.getScriptProperties();
      const TEMPLATE_DOC_ID = props.getProperty('BAOTHIEU_TEMPLATE_DOC_ID');
      const FOLDER_ID = props.getProperty('BAOTHIEU_FOLDER_ID');
      const WEBHOOK_GCHAT = props.getProperty('WEBHOOK_GCHAT');
      const TRUNGGIAN_SHEET_ID = props.getProperty('TRUNGGIAN_SHEET_ID');

      const results = data.map(sv => ({
        cccd: String(sv.soCCCD || "").trim(), hoTen: String(sv.hoTen || "").trim(),
        nganh: String(sv.nganh || "").trim().toLowerCase(), status: "success",
        message: "Đã đưa vào biên nhận báo thiếu hồ sơ."
      }));

      try {
        const folder = DriveApp.getFolderById(FOLDER_ID);
        const templateDoc = DriveApp.getFileById(TEMPLATE_DOC_ID);
        const tempDocFile = templateDoc.makeCopy("Nhap_" + new Date().getTime(), folder);
        const doc = DocumentApp.openById(tempDocFile.getId());
        const body = doc.getBody();

        const ngayChuan = data[0].ngayCapNhat || Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy");
        body.replaceText("{{NGAY}}", ngayChuan);

        const tableData = [["STT", "Họ và tên", "Số CCCD", "Hồ sơ còn thiếu", "Ngày cập nhật hồ sơ"]];
        data.forEach((sv, index) => {
          try {
            tableData.push([(index + 1).toString(), String(sv.hoTen || "").trim(), String(sv.soCCCD || "").trim(), String(sv.hosoThieu || "").trim(), String(sv.ngayCapNhat || "").trim()]);
          } catch (rowErr) {
            tableData.push([(index + 1).toString(), String(sv.hoTen || "(lỗi dữ liệu)"), String(sv.soCCCD || ""), String(sv.hosoThieu || ""), ""]);
            results[index].status = "warning";
            results[index].message = "Dữ liệu dòng có lỗi khi dựng bảng: " + rowErr.toString();
          }
        });

        const searchResult = body.findText("{{BANG_DANH_SACH}}");
        if (searchResult) {
          const element = searchResult.getElement();
          const parentParagraph = element.getParent();
          const insertIndex = body.getChildIndex(parentParagraph);
          body.removeChild(parentParagraph);
          const table = body.insertTable(insertIndex, tableData);

          const tableStyle = {};
          tableStyle[DocumentApp.Attribute.HORIZONTAL_ALIGNMENT] = DocumentApp.HorizontalAlignment.CENTER;
          table.setAttributes(tableStyle);

          const colWidths = [40, 190, 110, 270, 90];
          for (let c = 0; c < colWidths.length; c++) { table.setColumnWidth(c, colWidths[c]); }

          for (let r = 0; r < table.getNumRows(); r++) {
            const row = table.getRow(r);
            for (let cellIdx = 0; cellIdx < row.getNumCells(); cellIdx++) {
              const cell = row.getCell(cellIdx);
              const par = cell.getChild(0).asParagraph();
              const text = par.editAsText();
              text.setFontSize(13); par.setLineSpacing(1.15);
              if (cellIdx === 0 || cellIdx === 2 || cellIdx === 4) par.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
              else par.setAlignment(DocumentApp.HorizontalAlignment.LEFT);
              if (r === 0) {
                cell.setBackgroundColor("#e8f5e9"); par.setAlignment(DocumentApp.HorizontalAlignment.CENTER); text.setBold(true);
              }
            }
          }
        }
        doc.saveAndClose();

        const pdfBlob = tempDocFile.getAs(MimeType.PDF);
        const dateString = Utilities.formatDate(new Date(), "GMT+7", "dd_MM_yyyy");
        pdfBlob.setName("Bien_nhan_ho_so_" + dateString + ".pdf");
        const pdfFile = folder.createFile(pdfBlob);
        pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        const pdfUrl = pdfFile.getUrl();
        tempDocFile.setTrashed(true);

        try {
          UrlFetchApp.fetch(WEBHOOK_GCHAT, {
            method: "post", headers: { "Content-Type": "application/json; charset=UTF-8" },
            payload: JSON.stringify({ text: "🎯 *BAN THẨM ĐỊNH HỒ SƠ*\nHiện tại *" + data.length + " thí sinh* còn thiếu hồ sơ (Ngày: " + ngayChuan + ").\n\n👉 *Click để tải/in biên nhận:* " + pdfUrl }),
            muteHttpExceptions: true
          });
        } catch (notifyErr) { /* Lỗi gửi thông báo Chat không ảnh hưởng tới PDF đã tạo thành công */ }

        try {
          const ss2 = SpreadsheetApp.openById(TRUNGGIAN_SHEET_ID);
          // ĐÃ VÁ BUG (đồng bộ với getThamDinhData): bỏ tìm theo tên "Sheet1", luôn lấy
          // tab đầu tiên theo vị trí -> ghi đúng tab thật, không lệch sang tab rác trùng tên.
          const sheet2 = ss2.getSheets()[0];
          if (sheet2) {
            const values = sheet2.getDataRange().getValues();
            const headers = values[0];
            // ĐÃ THÊM (rà soát an toàn 2 luồng chung 1 sheet): dò thêm cột KÊNH NỘP, cùng
            // lý do đã sửa ở action 'trungTuyen' — tránh ghi đè nhầm trạng thái "Đã trúng
            // tuyển" (Thu hồ sơ trực tiếp) thành "Đã báo thiếu" khi trùng CCCD+Ngành.
            let cccdCol = -1, nganhCol = -1, statusCol = -1, kenhCol = -1;
            for (let h = 0; h < headers.length; h++) {
              const hName = String(headers[h]).toUpperCase().trim().replace(/\s+/g, ' ');
              if (hName === "CĂN CƯỚC" || hName === "SỐ CCCD" || hName === "CCCD") cccdCol = h;
              if (hName === "NGÀNH ĐÀO TẠO" || hName === "NGÀNH") nganhCol = h;
              if (hName.indexOf("TRẠNG THÁI") !== -1) statusCol = h;
              if (hName === "KÊNH NỘP") kenhCol = h;
            }
            if (cccdCol !== -1 && nganhCol !== -1 && statusCol !== -1) {
              data.forEach((sv, idx) => {
                try {
                  const payloadCccd = String(sv.soCCCD).replace(/\D/g, '');
                  const payloadNganh = String(sv.nganh).trim().toLowerCase();
                  const payloadKenh = String(sv.kenhNop || "").trim();
                  let found = false;
                  for (let i = 1; i < values.length; i++) {
                    const sheetCccd = String(values[i][cccdCol]).replace(/\D/g, '');
                    const sheetNganh = String(values[i][nganhCol]).trim().toLowerCase();
                    const sheetKenh = kenhCol !== -1 ? String(values[i][kenhCol] || "").trim() : "";
                    if (sheetCccd === payloadCccd && sheetNganh === payloadNganh && (kenhCol === -1 || sheetKenh === payloadKenh)) {
                      sheet2.getRange(i + 1, statusCol + 1).setValue("Đã báo thiếu");
                      found = true; break;
                    }
                  }
                  if (!found) {
                    results[idx].status = "warning";
                    results[idx].message = "Đã có trong biên nhận PDF, nhưng không tìm thấy dòng tương ứng để cập nhật trạng thái.";
                  }
                } catch (recErr) {
                  results[idx].status = "warning";
                  results[idx].message = "Đã có trong biên nhận PDF, nhưng lỗi khi cập nhật trạng thái: " + recErr.toString();
                }
              });
              SpreadsheetApp.flush();
            }
          }
        } catch (e2) { /* Lỗi tổng khi ghi trạng thái không làm hỏng kết quả PDF đã tạo thành công */ }

        return responseJSON(200, "success", { pdfUrl: pdfUrl, results: results });
      } catch (error) {
        return responseJSON(500, error.toString(), null);
      }
    }

function hdPost_luuKetQua(e, ss) {
      const g = requireAuth(e.parameter, ['ThamDinh', 'Admin']);
      if (!g.ok) return g.resp;

      const KETQUA_SHEET_ID = PropertiesService.getScriptProperties().getProperty('KETQUA_SHEET_ID');
      const ssKQ = SpreadsheetApp.openById(KETQUA_SHEET_ID);
      const sheetKQ = ssKQ.getSheetByName("KETQUA");
      if (!sheetKQ) return responseJSON(404, "Không tìm thấy sheet KETQUA!", null);

      const incomingData = JSON.parse(e.parameter.data);
      if (!incomingData || incomingData.length === 0) return responseJSON(200, "Không có dữ liệu mới.", { results: [] });

      const lastRow = sheetKQ.getLastRow();
      const lastCol = sheetKQ.getLastColumn();
      const headers = sheetKQ.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim().toUpperCase().replace(/\s+/g, ' '));

      let cccdColIndex = headers.findIndex(h => h === "CĂN CƯỚC" || h === "SỐ CCCD" || h === "CCCD");
      let nganhColIndex = headers.findIndex(h => h === "NGÀNH ĐÀO TẠO" || h === "NGÀNH");
      const updateColIndex = headers.findIndex(h => h === "NGÀY CẬP NHẬT HỒ SƠ" || h === "NGÀY CẬP NHẬT");
      if (cccdColIndex === -1) cccdColIndex = 2;
      if (nganhColIndex === -1) nganhColIndex = 5;

      const existingRecords = {};
      if (lastRow > 1) {
        const existingData = sheetKQ.getRange(2, 1, lastRow - 1, lastCol).getValues();
        for (let i = 0; i < existingData.length; i++) {
          const cccdKey = String(existingData[i][cccdColIndex]).replace(/^['"]+|['"]+$/g, '').trim();
          const nganhKey = String(existingData[i][nganhColIndex]).trim().toLowerCase();
          if (cccdKey !== "") existingRecords[cccdKey + "_" + nganhKey] = { rowIndex: i + 2, data: existingData[i] };
        }
      }

      const newRows = []; const newRowsResultIndex = [];
      let skipCount = 0; let updateCount = 0; const results = [];

      for (let k = 0; k < incomingData.length; k++) {
        const obj = incomingData[k];
        let rowCccd = "", rowHoTen = "", rowNganh = "";
        try {
          const cleanObj = {};
          for (const key in obj) { cleanObj[key.trim().toUpperCase().replace(/\s+/g, ' ')] = obj[key]; }
          rowCccd = String(cleanObj["CĂN CƯỚC"] || cleanObj["SỐ CCCD"] || cleanObj["CCCD"] || "").replace(/^['"]+|['"]+$/g, '').trim();
          rowHoTen = String(cleanObj["HỌ VÀ TÊN"] || cleanObj["HỌ TÊN"] || "").trim();
          rowNganh = String(cleanObj["NGÀNH ĐÀO TẠO"] || cleanObj["NGÀNH"] || "").trim().toLowerCase();
          const rowCombinedKey = rowCccd + "_" + rowNganh;

          if (rowCccd === "") {
            results.push({ cccd: rowCccd, hoTen: rowHoTen, nganh: rowNganh, status: "error", message: "Thiếu số CCCD, đã bỏ qua bản ghi này." });
            continue;
          }

          const rowArray = new Array(lastCol).fill("");
          for (let col = 0; col < headers.length; col++) {
            const headerName = headers[col];
            let val = "";
            if (cleanObj[headerName] !== undefined) val = cleanObj[headerName];
            else if (headerName === "CĂN CƯỚC" || headerName === "SỐ CCCD") val = cleanObj["CĂN CƯỚC"] || cleanObj["SỐ CCCD"] || cleanObj["CCCD"];
            else if (headerName === "BẢN SAO ID" || headerName === "BẢN SAO CCCD" || headerName === "BẢN SAO CĂN CƯỚC") val = cleanObj["BẢN SAO ID"] || cleanObj["BẢN SAO CCCD"];
            else if (headerName === "PHIẾU ĐĂNG KÝ DỰ TUYỂN" || headerName === "PHIẾU ĐK") val = cleanObj["PHIẾU ĐĂNG KÝ DỰ TUYỂN"] || cleanObj["PHIẾU ĐK"];

            if ((headerName === "CĂN CƯỚC" || headerName === "SỐ CCCD" || headerName === "MÃ SINH VIÊN" || headerName === "MÃ SV") && val) {
              rowArray[col] = "'" + String(val).replace(/^['"]+|['"]+$/g, '');
            } else {
              rowArray[col] = val || "";
            }
          }

          if (existingRecords[rowCombinedKey]) {
            let isDifferent = false;
            const oldData = existingRecords[rowCombinedKey].data;
            for (let c = 0; c < headers.length; c++) {
              if (c === updateColIndex) continue;
              const oldValStr = String(oldData[c] || "").trim();
              const newValStr = String(rowArray[c] || "").replace(/^'/, '').trim();
              if (oldValStr !== newValStr) { isDifferent = true; break; }
            }
            if (isDifferent) {
              sheetKQ.getRange(existingRecords[rowCombinedKey].rowIndex, 1, 1, lastCol).setValues([rowArray]);
              existingRecords[rowCombinedKey].data = rowArray;
              updateCount++;
              results.push({ cccd: rowCccd, hoTen: rowHoTen, nganh: rowNganh, status: "updated", message: "Đã cập nhật (ghi đè) hồ sơ cũ." });
            } else {
              skipCount++;
              results.push({ cccd: rowCccd, hoTen: rowHoTen, nganh: rowNganh, status: "skipped", message: "Dữ liệu không đổi, đã bỏ qua." });
            }
          } else {
            results.push({ cccd: rowCccd, hoTen: rowHoTen, nganh: rowNganh, status: "added", message: "Đã thêm mới." });
            newRowsResultIndex.push(results.length - 1);
            newRows.push(rowArray);
            existingRecords[rowCombinedKey] = { rowIndex: -1, data: rowArray };
          }
        } catch (recErr) {
          results.push({ cccd: rowCccd, hoTen: rowHoTen, nganh: rowNganh, status: "error", message: recErr.toString() });
        }
      }

      if (newRows.length > 0) {
        try {
          sheetKQ.getRange(lastRow + 1, 1, newRows.length, lastCol).setValues(newRows);
        } catch (bulkErr) {
          for (let m = 0; m < newRowsResultIndex.length; m++) {
            results[newRowsResultIndex[m]].status = "error";
            results[newRowsResultIndex[m]].message = "Lỗi khi ghi vào Sheet: " + bulkErr.toString();
          }
        }
      }

      // ĐÃ THÊM: ghi lịch sử "ai đã lưu kết quả thẩm định, khi nào, bao nhiêu dòng thêm/sửa/bỏ
      // qua" — trước đây hành động này KHÔNG hề được ghi log dù đã xác thực được người gọi.
      ghiLichSuThaoTac_(g.userInfo.email, "Lưu kết quả thẩm định (KETQUA)", "Thêm: " + newRows.length + ", cập nhật: " + updateCount + ", bỏ qua (không đổi): " + skipCount);

      return responseJSON(200, "success", { added: newRows.length, updated: updateCount, skipped: skipCount, results: results });
    }

function hdPost_capNhatDaoTao(e, ss) {
      const g = requireAuth(e.parameter, ['ThamDinh', 'Admin']);
      if (!g.ok) return g.resp;

      const KETQUA_SHEET_ID = PropertiesService.getScriptProperties().getProperty('KETQUA_SHEET_ID');
      const WEBHOOK_GCHAT = PropertiesService.getScriptProperties().getProperty('WEBHOOK_GCHAT');
      const ssDT = SpreadsheetApp.openById(KETQUA_SHEET_ID);
      const sheetDT = ssDT.getSheets()[0];

      const incomingData = JSON.parse(e.parameter.data);
      if (!incomingData || incomingData.length === 0) return responseJSON(400, "Không có dữ liệu", null);

      const lastRow = sheetDT.getLastRow();
      const lastCol = Math.max(sheetDT.getLastColumn(), 13);
      const headers = sheetDT.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim().toUpperCase().replace(/\s+/g, ' '));

      let cccdIndex = -1, nganhIndex = -1;
      for (let c = 0; c < headers.length; c++) {
        if (headers[c] === "CĂN CƯỚC" || headers[c] === "SỐ CCCD" || headers[c] === "CCCD") cccdIndex = c;
        if (headers[c] === "NGÀNH" || headers[c] === "NGÀNH ĐÀO TẠO") nganhIndex = c;
      }

      const existingKeys = {};
      if (lastRow > 1 && cccdIndex !== -1 && nganhIndex !== -1) {
        const existingData = sheetDT.getRange(2, 1, lastRow - 1, lastCol).getValues();
        for (let i = 0; i < existingData.length; i++) {
          const cKey = String(existingData[i][cccdIndex] || "").replace(/^['"]+|['"]+$/g, '').trim();
          const nKey = String(existingData[i][nganhIndex] || "").trim().toLowerCase();
          if (cKey !== "") existingKeys[cKey + "_" + nKey] = true;
        }
      }

      const newRows = [];
      const todayStr = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");

      for (let k = 0; k < incomingData.length; k++) {
        const obj = incomingData[k];
        const cleanObj = {};
        for (const key in obj) cleanObj[key.trim().toUpperCase().replace(/\s+/g, ' ')] = obj[key];

        const rCccd = String(cleanObj["CĂN CƯỚC"] || cleanObj["CCCD"] || "").replace(/^['"]+|['"]+$/g, '').trim();
        const rNganh = String(cleanObj["NGÀNH"] || cleanObj["NGÀNH ĐÀO TẠO"] || "").trim().toLowerCase();
        const rKey = rCccd + "_" + rNganh;

        if (rCccd !== "" && !existingKeys[rKey]) {
          const rowArray = new Array(lastCol).fill("");
          for (let col = 0; col < headers.length; col++) {
            const hName = headers[col];
            let val = cleanObj[hName] || "";
            if (hName === "NGÀY CẬP NHẬT HỒ SƠ" || hName === "NGÀY CẬP NHẬT") val = todayStr;
            if ((hName === "CĂN CƯỚC" || hName === "CCCD") && val) val = "'" + String(val).replace(/^['"]+|['"]+$/g, '');
            rowArray[col] = val;
          }
          newRows.push(rowArray);
          existingKeys[rKey] = true;
        }
      }

      if (newRows.length > 0) {
        sheetDT.getRange(lastRow + 1, 1, newRows.length, lastCol).setValues(newRows);
        const SHEET_URL = ssDT.getUrl();
        try {
          UrlFetchApp.fetch(WEBHOOK_GCHAT, {
            method: "post", headers: { "Content-Type": "application/json; charset=UTF-8" },
            payload: JSON.stringify({ text: "🚀 *BAN THẨM ĐỊNH BÀN GIAO*\nĐã cập nhật *" + newRows.length + " hồ sơ trúng tuyển* sang cho Đào tạo/CTSV.\n👉 Danh sách tại đây: " + SHEET_URL }),
            muteHttpExceptions: true
          });
        } catch (notifyErr) { /* Lỗi gửi thông báo Chat không ảnh hưởng tới việc bàn giao đã thành công */ }
      }

      return responseJSON(200, "success", { added: newRows.length });
    }

function hdPost_scanDocument(e, ss) {
      const parsedData = JSON.parse(e.parameter.data);
      
      const g = requireAuth(parsedData, ['TuyenSinh', 'ThamDinh', 'Admin']);
      if (!g.ok) return g.resp;
      
      const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
      if (!apiKey) return responseJSON(500, "Hệ thống chưa cấu hình Khóa Gemini API", null);
      
      const promptText = "Bạn là chuyên gia đọc giấy tờ tùy thân Việt Nam. Ảnh đưa vào có thể là Căn cước công dân (CCCD) HOẶC Hộ chiếu (Passport) — hãy tự xác định đúng loại giấy tờ dựa trên tiêu đề in trên ảnh.\n\n" +
          "QUY TẮC TRÍCH XUẤT:\n" +
          "- Nếu là CCCD: lấy số CCCD (12 số), họ tên, ngày sinh, và ngày hết hạn => field ngay_het_han. (ngay_cap để rỗng).\n" +
          "- Nếu là Hộ chiếu: lấy số hộ chiếu, họ tên, ngày sinh, và ngày cấp => field ngay_cap. (ngay_het_han để rỗng).\n" +
          "- Mọi ngày tháng trả về theo định dạng YYYY-MM-DD. Không đọc rõ thì để rỗng \"\".\n\n" +
          "Trả về DUY NHẤT một chuỗi JSON hợp lệ (Không bọc bằng markdown), đúng cấu trúc sau:\n" +
          "{\"loai_giay_to\": \"cccd hoặc hochieu\", \"so_giay_to\": \"số CCCD hoặc số hộ chiếu\", \"hoten\": \"HỌ TÊN IN HOA\", \"ngaysinh\": \"YYYY-MM-DD\", \"ngay_het_han\": \"YYYY-MM-DD hoặc rỗng\", \"ngay_cap\": \"YYYY-MM-DD hoặc rỗng\"}";

      const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=" + apiKey.trim();
      const payload = {
        "contents": [{
          "parts": [
            { "text": promptText },
            { "inline_data": { "mime_type": parsedData.mimeType, "data": parsedData.imageBase64 } }
          ]
        }]
      };

      try {
        const response = UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true });
        const jsonGemini = JSON.parse(response.getContentText());
        
        if (jsonGemini.candidates && jsonGemini.candidates[0].content.parts[0].text) {
           let rawText = jsonGemini.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
           return responseJSON(200, "Quét thành công", JSON.parse(rawText));
        } else {
           return responseJSON(500, "Ảnh quá mờ hoặc AI không nhận diện được", jsonGemini);
        }
      } catch (err) { return responseJSON(500, "Lỗi gọi AI: " + err.toString(), null); }
    }

function hdPost_scanTranscript(e, ss) {
      const parsedData = JSON.parse(e.parameter.data);
      
      // Bảng điểm / Đối sánh / Xuất file -> Chỉ ThamDinh và Admin mới được dùng
      const g = requireAuth(parsedData, ['ThamDinh', 'Admin']);
      if (!g.ok) return g.resp;
      
      const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
      const promptText = "Bạn là chuyên gia số hóa dữ liệu. Trích xuất ĐẦY ĐỦ, tuyệt đối không được bỏ sót bất kỳ môn học nào có trong ảnh. Trả về DUY NHẤT một mảng JSON hợp lệ chứa các đối tượng (Tuyệt đối không bọc bằng ký hiệu markdown ```json), mỗi đối tượng gồm 5 trường: {\"monhoc\": \"Tên môn học\", \"tinchi\": \"Số tín chỉ (nếu không thấy để 0)\", \"diem_chu\": \"Điểm chữ (A, B, C... nếu không có để rỗng)\", \"diem_he4\": \"Điểm hệ 4 (nếu không có để rỗng)\", \"diem_he10\": \"Điểm hệ 10 (nếu không có để rỗng)\"}";

      const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=" + apiKey.trim();
      const payload = {
        "contents": [{ "parts": [ { "text": promptText }, { "inline_data": { "mime_type": parsedData.mimeType, "data": parsedData.imageBase64 } } ] }]
      };

      try {
        const response = UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true });
        const jsonGemini = JSON.parse(response.getContentText());
        
        if (jsonGemini.candidates && jsonGemini.candidates[0].content.parts[0].text) {
           let rawText = jsonGemini.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
           return responseJSON(200, "Quét thành công", JSON.parse(rawText));
        } else { return responseJSON(500, "Không nhận diện được bảng điểm", jsonGemini); }
      } catch (err) { return responseJSON(500, "Lỗi AI: " + err.toString(), null); }
    }

function hdPost_compareCurriculum(e, ss) {
      const parsedData = JSON.parse(e.parameter.data);
      const g = requireAuth(parsedData, ['ThamDinh', 'Admin']);
      if (!g.ok) return g.resp;
      
      const SHEET_CTDT_ID = "1Kscs9TxM59T-Xt5F0nBLko6XL90BwZbXH95vZhv3a0w"; 
      const ssCTDT = SpreadsheetApp.openById(SHEET_CTDT_ID);
      const sheetCTDT = ssCTDT.getSheetByName(parsedData.nganh);
      if (!sheetCTDT) return responseJSON(404, "Không tìm thấy Sheet CTĐT của ngành: " + parsedData.nganh, null);
      
      const values = sheetCTDT.getDataRange().getValues();
      let ctdtData = [];
      for (let i = 1; i < values.length; i++) {
        ctdtData.push({ "nhom_mon": values[i][1], "ten_mon": values[i][2], "tin_chi": values[i][3], "mon_tuong_duong": values[i][4] || "" });
      }
      
      const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
      const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=" + apiKey.trim();
      const promptText = "Bạn là Trưởng phòng Đào tạo. Đối sánh Bảng điểm (JSON 1) với Khung CTĐT chuẩn (JSON 2).\n1. MATCH nếu tên môn học trùng ý nghĩa hoặc nằm trong 'mon_tuong_duong'.\n2. Số tín chỉ môn đã học phải >= tín chỉ môn chuẩn thì 'Đạt', nhỏ hơn thì 'Học bổ sung'.\n3. Bỏ qua 'Thực tập tốt nghiệp', 'Thực tập doanh nghiệp'.\n4. KHÔNG bỏ sót môn chuẩn nào.\n\nJSON 1: " + JSON.stringify(parsedData.transcript) + "\nJSON 2: " + JSON.stringify(ctdtData) + "\n\nTrả về DUY NHẤT JSON:\n{\"matched\": [{\"nhom_mon\": \"...\", \"mon_chuan\": \"...\", \"tin_chi_chuan\": \"...\", \"mon_da_hoc\": \"...\", \"tin_chi_da_hoc\": \"...\", \"ket_luan\": \"Đạt / Học bổ sung\"}], \"unmatched\": [{\"nhom_mon\": \"...\", \"mon_chuan\": \"...\", \"tin_chi_chuan\": \"...\"}]}";

      try {
        const response = UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", payload: JSON.stringify({ "contents": [{"parts": [{ "text": promptText }]}] }), muteHttpExceptions: true });
        const jsonDoisanh = JSON.parse(response.getContentText());
        
        if (jsonDoisanh.candidates && jsonDoisanh.candidates[0].content.parts[0].text) {
          let rawText = jsonDoisanh.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
          let ketQua = JSON.parse(rawText);
          ketQua.matched = ketQua.matched || [];
          ketQua.unmatched = ketQua.unmatched || [];

          const chuanHoaTen = (s) => String(s || "").trim().toLowerCase();
          let boTenDaMatched = {}; let boTenDaUnmatched = {};
          ketQua.matched.forEach(m => boTenDaMatched[chuanHoaTen(m.mon_chuan)] = true);
          ketQua.unmatched = ketQua.unmatched.filter(u => !boTenDaMatched[chuanHoaTen(u.mon_chuan)]);
          ketQua.unmatched.forEach(u => boTenDaUnmatched[chuanHoaTen(u.mon_chuan)] = true);

          ctdtData.forEach(c => {
            const key = chuanHoaTen(c.ten_mon);
            if (!boTenDaMatched[key] && !boTenDaUnmatched[key]) {
              ketQua.unmatched.push({ "nhom_mon": c.nhom_mon, "mon_chuan": c.ten_mon, "tin_chi_chuan": c.tin_chi });
              boTenDaUnmatched[key] = true;
            }
          });
          return responseJSON(200, "Đối sánh hoàn tất", ketQua);
        }
        return responseJSON(500, "Lỗi phân tích AI", null);
      } catch (err) { return responseJSON(500, "Lỗi đối sánh: " + err.toString(), null); }
    }

function hdPost_scanChungChi(e, ss) {
      const parsedData = JSON.parse(e.parameter.data);
      const g = requireAuth(parsedData, ['ThamDinh', 'Admin']);
      if (!g.ok) return g.resp;

      const MO_TA_LOAI_CHUNG_CHI = {
        'NN_ANH': 'chứng chỉ/kết quả thi tiếng Anh (VStep, IELTS, TOEFL, TOEIC, CEFR, Cambridge...)',
        'NN_TRUNG_HSK': 'chứng chỉ HSK (Hán ngữ thủy bình khảo thí — Nghe/Đọc/Viết tiếng Trung)',
        'NN_TRUNG_HSKK': 'chứng chỉ HSKK (Hán ngữ khẩu ngữ khảo thí — Nói tiếng Trung)',
        'NN_NHAT': 'chứng chỉ JLPT (Năng lực Nhật ngữ)',
        'NN_HAN': 'chứng chỉ TOPIK (Năng lực tiếng Hàn)',
        'NN_PHAP': 'chứng chỉ tiếng Pháp (DALF, TCF, TEF...)',
        'BANG_NGANH_NN': 'bằng tốt nghiệp Trung cấp/Cao đẳng chuyên ngành Ngoại ngữ',
        'TIN_HOC': 'chứng chỉ Tin học (MOS, IC3, ICDL, Ứng dụng CNTT cơ bản...)',
        'LLCT': 'bằng/giấy chứng nhận Trung cấp hoặc Cao cấp Lý luận chính trị',
        'GDQP': 'chứng chỉ/giấy chứng nhận hoàn thành Giáo dục quốc phòng và An ninh (GDQP&AN)',
      };
      const loaiChungChi = String(parsedData.loaiChungChi || '');
      const moTa = MO_TA_LOAI_CHUNG_CHI[loaiChungChi];
      if (!moTa) return responseJSON(400, "Loại chứng chỉ không hợp lệ: " + loaiChungChi, null);

      const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
      const promptText = "Bạn là chuyên gia số hóa văn bằng/chứng chỉ. Ảnh đưa vào ĐÃ ĐƯỢC KHAI BÁO TRƯỚC là " + moTa + ".\n\n" +
          "Nhiệm vụ CỦA BẠN CHỈ LÀ ĐỌC thông tin có trên ảnh — TUYỆT ĐỐI KHÔNG tự suy luận/quyết định người này có được miễn học phần nào hay không, việc đó do hệ thống khác tự tra bảng quy định.\n\n" +
          "Trích xuất: tên chứng chỉ/kỳ thi/văn bằng thực tế in trên ảnh (tenChungChi), mức đạt/điểm/band/xếp loại nếu có in trên ảnh (mucDat, để rỗng \"\" nếu không thấy), ngày cấp theo định dạng YYYY-MM-DD (ngayCap, để rỗng \"\" nếu không đọc được), họ tên người được cấp nếu có (hoTen, để rỗng nếu không thấy), và tự đánh giá ẢNH CÓ ĐÚNG LOẠI đã khai báo ở trên hay không (nhanDienDung: true/false — false CHỈ KHI ảnh rõ ràng là 1 loại giấy tờ KHÁC HẲN, true nếu đúng loại hoặc không chắc chắn).\n\n" +
          "Trả về DUY NHẤT một chuỗi JSON hợp lệ (không bọc markdown), đúng cấu trúc sau:\n" +
          "{\"tenChungChi\": \"...\", \"mucDat\": \"...\", \"ngayCap\": \"YYYY-MM-DD hoặc rỗng\", \"hoTen\": \"...\", \"nhanDienDung\": true}";

      const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=" + apiKey.trim();
      const payload = {
        "contents": [{ "parts": [ { "text": promptText }, { "inline_data": { "mime_type": parsedData.mimeType, "data": parsedData.imageBase64 } } ] }]
      };

      try {
        const response = UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true });
        const jsonGemini = JSON.parse(response.getContentText());
        if (jsonGemini.candidates && jsonGemini.candidates[0].content.parts[0].text) {
          let rawText = jsonGemini.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
          return responseJSON(200, "Quét thành công", JSON.parse(rawText));
        } else { return responseJSON(500, "Ảnh quá mờ hoặc AI không nhận diện được", jsonGemini); }
      } catch (err) { return responseJSON(500, "Lỗi AI: " + err.toString(), null); }
    }

function hdPost_exportTemplate(e, ss) {
      const parsedData = JSON.parse(e.parameter.data);
      const g = requireAuth(parsedData, ['ThamDinh', 'Admin']);
      if (!g.ok) return g.resp;

      const TEMPLATE_ID = PropertiesService.getScriptProperties().getProperty('TEMPLATE_ID');
      const folderId = "1HO9VaKvfb2pPaIViBGjc-OjgscaOjHP-"; 
      const folder = DriveApp.getFolderById(folderId);
      
      try {
        const tempFile = DriveApp.getFileById(TEMPLATE_ID.trim()).makeCopy(parsedData.fileName || "PhieuThamDinh_AI");
        const tempId = tempFile.getId();
        const ssTemp = SpreadsheetApp.openById(tempId);
        const sheetTemp = ssTemp.getSheets()[0];
        
        for (let key in parsedData.mappingData) {
          sheetTemp.createTextFinder("{{" + key + "}}").replaceAllWith(String(parsedData.mappingData[key] || ""));
        }
        
        let tableData = []; let stt = 1;
        (parsedData.compareMatched || []).forEach(m => tableData.push([stt++, m.nhom_mon, m.mon_chuan, m.tin_chi_chuan, m.mon_da_hoc, m.tin_chi_da_hoc, m.ket_luan]));
        (parsedData.compareUnmatched || []).forEach(u => tableData.push([stt++, u.nhom_mon, u.mon_chuan, u.tin_chi_chuan, "", "", "Chưa học"]));
        
        if (tableData.length > 0) {
          const range = sheetTemp.getRange(sheetTemp.getLastRow() + 1, 1, tableData.length, tableData[0].length);
          range.setValues(tableData);
          range.setBorder(true, true, true, true, true, true, "black", SpreadsheetApp.BorderStyle.SOLID);
        }
        
        SpreadsheetApp.flush(); 
        
        const urlExport = "https://docs.google.com/spreadsheets/d/" + tempId + "/export?exportFormat=xlsx&format=xlsx";
        const responseExcel = UrlFetchApp.fetch(urlExport, { method: "get", headers: { 'Authorization': 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
        
        if (responseExcel.getResponseCode() !== 200) throw new Error("Lỗi Export API");
        
        const blob = responseExcel.getBlob().setName((parsedData.fileName || "PhieuThamDinh") + ".xlsx");
        folder.createFile(blob);
        tempFile.setTrashed(true); 
        
        return responseJSON(200, "Xuất Excel thành công", { base64: Utilities.base64Encode(blob.getBytes()) });
      } catch (err) {
        return responseJSON(500, "Lỗi tạo file Excel: " + err.message, null);
      }
    }

function hdPost_luuKetQuaDoiSanh(e, ss) {
      const parsedData = JSON.parse(e.parameter.data);
      const g = requireAuth(parsedData, ['ThamDinh', 'Admin']);
      if (!g.ok) return g.resp;

      const cccd = String(parsedData.cccd || "").replace(/^['"]+|['"]+$/g, '').trim();
      if (!cccd) return responseJSON(400, "Thiếu số CCCD", null);

      const TRUNGGIAN_SHEET_ID = PropertiesService.getScriptProperties().getProperty('TRUNGGIAN_SHEET_ID');
      const ssTD = SpreadsheetApp.openById(TRUNGGIAN_SHEET_ID);
      const sheetTD = ssTD.getSheets()[0]; // đúng vị trí (không tìm theo tên) — khớp getThamDinhData
      if (!sheetTD) return responseJSON(404, "Không tìm thấy sheet dữ liệu Trung gian", null);

      const lastRow = sheetTD.getLastRow();
      const lastCol = sheetTD.getLastColumn();
      if (lastRow <= 1) return responseJSON(404, "Không tìm thấy hồ sơ khớp CCCD " + cccd, null);
      const headers = sheetTD.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).toUpperCase().trim().replace(/\s+/g, ' '));

      const colIndex = headers.indexOf("KẾT QUẢ ĐỐI SÁNH JSON");
      if (colIndex === -1) return responseJSON(404, "Chưa có cột 'Kết quả đối sánh JSON' trên sheet Trung gian — vui lòng tự thêm cột này (đúng tên) trước khi lưu.", null);

      const cccdColIndex = headers.findIndex(h => h === "CĂN CƯỚC" || h === "SỐ CCCD" || h === "CCCD");
      if (cccdColIndex === -1) return responseJSON(404, "Không tìm thấy cột CCCD trên sheet Trung gian", null);

      const idCol = sheetTD.getRange(2, cccdColIndex + 1, lastRow - 1, 1).getValues();
      let foundRow = -1;
      for (let i = 0; i < idCol.length; i++) {
        const v = String(idCol[i][0]).replace(/^['"]+|['"]+$/g, '').trim();
        if (v === cccd) { foundRow = i + 2; break; }
      }
      if (foundRow === -1) return responseJSON(404, "Không tìm thấy hồ sơ khớp CCCD " + cccd, null);

      sheetTD.getRange(foundRow, colIndex + 1).setValue(JSON.stringify(parsedData.ketQuaDoiSanh || []));
      return responseJSON(200, "Đã lưu kết quả đối sánh", { savedRow: foundRow });
    }