// ==========================================================================
// SETUP MỘT LẦN — PHA 1 · A (Chốt schema, khoá lại) của "Khóa định danh"
// ==========================================================================
// File này KHÔNG phải một phần của web app đang chạy (Quanlysv.gs) — chỉ là
// 1 tiện ích chạy TAY, MỘT LẦN DUY NHẤT, để dựng 3 bảng đã chốt trong roadmap
// "Từ hệ thống tuyển sinh đến UMS" (mục 05 — Khóa định danh).
//
// ĐÃ SỬA (03/09 — chốt lại nơi lưu): bản đầu tách hẳn 1 spreadsheet MỚI riêng
// biệt. Sau khi rà lại: Trunggian đã có sẵn trigger autoBackupDaily() (xem
// Quanlysv.gs) tự copy TOÀN BỘ file Trunggian sang Drive mỗi đêm. Nếu 3 bảng
// này nằm ngay dưới dạng 3 TAB MỚI TRONG CHÍNH FILE TRUNGGIAN (không phải
// file riêng), chúng tự động được cuốn theo bản backup có sẵn đó — không cần
// dựng thêm hạ tầng backup riêng. Nguyên tắc "đừng để ai vô tình sửa tay đè
// lên dữ liệu khoá" xử lý bằng cách giới hạn quyền sửa riêng cho 3 tab đó
// (hàm bên dưới tự bật Protection ở mức cảnh báo — xem ghi chú tại
// protectSheetCanhBao_). Tách ra file riêng chỉ thật sự cần khi có 1 module
// ngoài hệ sinh thái Trunggian phải đọc khoá — lúc đó tách cũng không tốn
// công vì cấu trúc dữ liệu đã đúng sẵn.
//
// CÁCH DÙNG:
// 1. Mở project Apps Script hiện tại (cùng project với Quanlysv.gs) trên
//    script.google.com — KHÔNG cần tạo project mới.
// 2. Thêm file mới (File > New > Script file), đặt tên "SetupDinhDanh",
//    dán TOÀN BỘ nội dung file này vào.
// 3. Trên thanh công cụ, chọn hàm "taoHeThongDinhDanh" ở dropdown, bấm Run.
//    Lần đầu chạy sẽ hỏi cấp quyền (giống mọi lần chạy Apps Script khác) — bấm
//    Allow (Cho phép) là được. Hàm đọc TRUNGGIAN_SHEET_ID có sẵn trong
//    Script Properties (PropertiesService) — không cần sửa ID tay trong code.
// 4. Chạy xong, mở file Trunggian ra sẽ thấy 3 tab mới ở cuối:
//    hoso_dinh_danh, dinh_danh_phu, lich_su_dinh_danh — đã có header + đã bật
//    cảnh báo sửa (Protection, mức "warning") để tránh sửa tay nhầm.
// 5. Hàm CHỐNG CHẠY LẶP: nếu 1 trong 3 tab đã tồn tại (VD chạy lại lần 2),
//    hàm sẽ bỏ qua tab đó, không tạo đè/không xoá dữ liệu đã có.
// 6. Sau khi chạy xong 1 lần, có thể XOÁ file "SetupDinhDanh.gs" này khỏi
//    project — nó không cần tồn tại lâu dài, không phải 1 action của web app.
// ==========================================================================

function taoHeThongDinhDanh() {
  const TRUNGGIAN_SHEET_ID = PropertiesService.getScriptProperties().getProperty('TRUNGGIAN_SHEET_ID');
  if (!TRUNGGIAN_SHEET_ID) {
    throw new Error("Chưa có Script Property 'TRUNGGIAN_SHEET_ID' — kiểm tra lại Project Settings > Script Properties.");
  }
  const ss = SpreadsheetApp.openById(TRUNGGIAN_SHEET_ID);
  const ketQua = { taoMoi: [], daCoSan: [] };

  // ---- 1. hoso_dinh_danh: 1 dòng = 1 con người. Khoá gốc, không đổi. ----
  const headersHoSo = [
    "sv_key", "ho_ten_chuan_hoa", "ngay_sinh", "trang_thai",
    "merged_into", "tao_luc", "tao_boi"
  ];
  taoTabNeuChuaCo_(ss, "hoso_dinh_danh", headersHoSo, ketQua,
    "⚠ Bảng lõi hệ thống — không tự ý sửa tay, không tự ý xoá dòng. " +
    "Xem roadmap 'Từ hệ thống tuyển sinh đến UMS', mục 05.");

  // ---- 2. dinh_danh_phu: danh sách mã kiểu FHIR (MSV/CCCD/mã Bộ GD&ĐT...) ----
  const headersMaPhu = [
    "sv_key", "loai_ma", "gia_tri", "nguon_cap",
    "hieu_luc_tu", "hieu_luc_den", "la_ma_chinh"
  ];
  taoTabNeuChuaCo_(ss, "dinh_danh_phu", headersMaPhu, ketQua);

  // ---- 3. lich_su_dinh_danh: nhật ký append-only, không bao giờ xoá dòng ----
  const headersLichSu = [
    "sv_key", "loai_su_kien", "thoi_gian", "nguoi_thuc_hien",
    "du_lieu_truoc", "du_lieu_sau"
  ];
  taoTabNeuChuaCo_(ss, "lich_su_dinh_danh", headersLichSu, ketQua);

  const url = ss.getUrl();
  Logger.log("Xong. Tab mới tạo: " + JSON.stringify(ketQua.taoMoi) +
    " | Tab đã có sẵn (bỏ qua, không đụng vào): " + JSON.stringify(ketQua.daCoSan));
  Logger.log("File Trunggian: " + url);

  return { url: url, id: TRUNGGIAN_SHEET_ID, ketQua: ketQua };
}

// Tạo 1 tab mới với header đã format + bật cảnh báo sửa — CHỈ khi tab đó
// CHƯA tồn tại trong file. Nếu đã có (VD chạy hàm này lần 2), bỏ qua hoàn
// toàn, không đụng vào dữ liệu đã có trong tab đó.
function taoTabNeuChuaCo_(ss, tenTab, headers, ketQua, ghiChuO1) {
  const daCo = ss.getSheetByName(tenTab);
  if (daCo) {
    ketQua.daCoSan.push(tenTab);
    return;
  }
  const sheet = ss.insertSheet(tenTab);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  formatHeaderRow_(sheet, headers.length);
  if (ghiChuO1) {
    sheet.getRange(1, headers.length + 2).setValue(ghiChuO1);
  }
  protectSheetCanhBao_(sheet, tenTab);
  ketQua.taoMoi.push(tenTab);
}

// Định dạng gọn cho dòng tiêu đề: in đậm, đóng băng, tô nền nhạt — thuần hiển
// thị, không ảnh hưởng logic đọc dữ liệu (code luôn đọc theo TÊN cột, không
// theo vị trí/màu sắc).
function formatHeaderRow_(sheet, numCols) {
  const range = sheet.getRange(1, 1, 1, numCols);
  range.setFontWeight("bold");
  range.setBackground("#e3f2f3");
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, numCols);
}

// Bật Protection mức "cảnh báo" (warning-only) cho cả tab — ai sửa tay sẽ
// thấy hộp thoại cảnh báo trước khi được phép tiếp tục, thay vì chặn cứng
// hoàn toàn (chặn cứng theo email cụ thể phải làm tay qua UI Sheets > Data >
// Protected sheets and ranges, vì code không biết trước ai là "người được
// phép sửa" — để dev tự chọn qua UI nếu muốn siết chặt hơn mức cảnh báo này).
function protectSheetCanhBao_(sheet, tenTab) {
  try {
    const protection = sheet.protect().setDescription("Khoá định danh — " + tenTab + " (xem mục 05 roadmap UMS)");
    protection.setWarningOnly(true);
  } catch (e) {
    // Không có quyền set protection (hiếm) — không chặn việc tạo tab, chỉ bỏ qua bước này.
    Logger.log("Không bật được cảnh báo sửa cho tab " + tenTab + ": " + e.toString());
  }
}