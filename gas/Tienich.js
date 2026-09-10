// ============================================================================
// TienIch.gs — Tiện ích dùng chung nhiều miền nghiệp vụ (không thuộc riêng 1 domain
// nào): chuẩn hoá email, diễn giải lỗi thành thông báo dễ hiểu, gửi tin nhắn Google
// Chat, rút gọn text cho Chat, sao lưu dữ liệu tự động hàng ngày. TÁCH RA từ
// Quanlysv.gs (2026-09-10), hành vi giữ nguyên 100% — xem ghi chú đầu Quanlysv.gs.
// ============================================================================



// ===============================================
// ĐÃ THÊM — KÝ ĐIỆN TỬ PHA 1 (chữ ký ảnh cá nhân): helper dùng chung cho nhóm action
// "Chữ ký cá nhân" (layChuKyCuaToi/luuChuKyCuaToi/xoaChuKyCuaToi, xem doGet/doPost bên
// trên) và sẽ được tái sử dụng ở Bước 4-5 (luồng ký GBTT nhiều người) sau này.
// ===============================================

// Chuẩn hoá email để so sánh — dùng CHUNG cho MỌI phép so email trong toàn bộ tính
// năng ký điện tử (BuocKy.EMAIL_NGUOI_KY vs người đang đăng nhập, ChucDanhKy...).
// Không dùng hàm này ở CẢ HAI vế của 1 phép so sánh sẽ dẫn tới lỗi "chưa tới lượt"
// một cách âm thầm và rất khó debug (vd 1 vế có khoảng trắng thừa, 1 vế viết hoa).
function chuanHoaEmail_(s) {
  return String(s || '').trim().toLowerCase();
}

// ĐÃ THÊM (Bước 7 — trau chuốt thông báo lỗi): các catch-all trong luồng Ký điện tử
// trước đây trả thẳng err.toString() ra cho người dùng — Apps Script bọc lỗi gốc
// thành chuỗi dạng "Exception: <thông điệp gốc, thường là tiếng Anh>", đọc rất khó
// hiểu với người không rành kỹ thuật. Hàm này KHÔNG che giấu lỗi (vẫn giữ nguyên
// thông điệp gốc để còn debug được) — chỉ bỏ tiền tố "Exception:" và thêm 1 câu gợi ý
// tiếng Việt phía trước cho vài nhóm lỗi hay gặp nhất (quyền Drive, quá hạn mức, hết
// giờ chạy) để người dùng biết hướng xử lý mà không cần gửi ảnh lỗi cho Admin.
function dienGiaiLoi_(err) {
  let raw = String((err && err.message) || err || '').replace(/^Exception:\s*/i, '').trim();
  const rawLower = raw.toLowerCase();
  let goiY = '';
  if (rawLower.indexOf('permission') !== -1 || rawLower.indexOf('quyền') !== -1) {
    goiY = 'Có thể tài khoản chạy hệ thống chưa có quyền truy cập đúng file/folder Drive liên quan — liên hệ Admin kiểm tra lại. ';
  } else if (rawLower.indexOf('quota') !== -1 || rawLower.indexOf('hạn mức') !== -1) {
    goiY = 'Có thể đã vượt hạn mức sử dụng Google trong ngày hôm nay — thử lại vào ngày mai hoặc liên hệ Admin. ';
  } else if (rawLower.indexOf('timed out') !== -1 || rawLower.indexOf('timeout') !== -1 || rawLower.indexOf('exceeded maximum execution time') !== -1) {
    goiY = 'Thao tác mất quá lâu (thường do xử lý quá nhiều hồ sơ cùng lúc) — thử lại với số lượng ít hơn. ';
  } else if (rawLower.indexOf('not found') !== -1 || rawLower.indexOf('no item with the given id') !== -1) {
    goiY = 'Có thể 1 file/folder liên quan đã bị xoá hoặc đổi quyền truy cập — liên hệ Admin kiểm tra lại. ';
  }
  return goiY + raw;
}

// Gửi 1 dòng thông báo lên Google Chat — dùng chung cho checkDuplicates/importStudents/autoBackupDaily.
function guiTinNhanGoogleChat(webhookUrl, text) {
  UrlFetchApp.fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    payload: JSON.stringify({ text: text }),
    muteHttpExceptions: true
  });
}

// Cắt ngắn giá trị trước khi đưa vào tin Chat — phòng giá trị là link dài/nội dung dài.
function truncateForChat(s, maxLen) {
  var str = String(s || "");
  var limit = maxLen || 60;
  if (str.length <= limit) return str || "(trống)";
  return str.substring(0, limit) + "...";
}

// ===============================================
// ĐÃ THÊM (rà soát Trunggian.gs — port sang đây): TỰ ĐỘNG SAO LƯU SHEET TRUNG GIAN
// HÀNG NGÀY. Hàm này KHÔNG chạy qua web (không có action gọi tới) — chỉ chạy khi có
// Trigger hẹn giờ. TỰ THIẾT LẬP TRIGGER (không làm được bằng code, phải làm tay 1 lần):
// Apps Script Editor > menu Triggers (icon đồng hồ bên trái) > Add Trigger > chọn hàm
// "autoBackupDaily" > loại "Time-driven" > "Day timer" > khung giờ nửa đêm-1h sáng.
// ===============================================
function autoBackupDaily() {
  const TRUNGGIAN_SHEET_ID = PropertiesService.getScriptProperties().getProperty('TRUNGGIAN_SHEET_ID');
  const ss = SpreadsheetApp.openById(TRUNGGIAN_SHEET_ID);
  const dateStr = Utilities.formatDate(new Date(), "GMT+7", "dd_MM_yyyy");

  const backupFile = DriveApp.getFileById(ss.getId()).makeCopy("Backup_TrungGian_" + dateStr);

  const webhook = PropertiesService.getScriptProperties().getProperty('WEBHOOK_GCHAT');
  try {
    guiTinNhanGoogleChat(webhook, "✅ *AUTO BACKUP*\nĐã tự động sao lưu dữ liệu ngày " + dateStr + " thành công!\nLink file backup: " + backupFile.getUrl());
  } catch (e) { /* lỗi báo Chat không ảnh hưởng việc backup đã thành công */ }
}

// ============================================================================
// ĐÃ THÊM (2026-09-10) — Thân xử lý action dùng chung không thuộc riêng 1 domain (hiện chỉ
// có 'feedback'), tách ra từ doPost (Quanlysv.gs). HÀNH VI GIỮ NGUYÊN 100%.
// ============================================================================

function hdPost_feedback(e, ss) {
      const parsedData = JSON.parse(e.parameter.data);
      const g = requireAuth(parsedData, []);
      if (!g.ok) return g.resp;

      const noiDung = String(parsedData.noiDung || "").trim();
      if (!noiDung) return responseJSON(400, "Nội dung phản hồi đang trống.", null);

      const webhookFeedback = PropertiesService.getScriptProperties().getProperty('WEBHOOK_GCHAT');
      const thoiGian = Utilities.formatDate(new Date(), "GMT+7", "HH:mm dd/MM/yyyy");
      const chatText = "📩 *PHẢN HỒI LỖI MỚI TỪ WEB QUẢN LÝ SINH VIÊN*\n" +
                        "👤 Tài khoản: " + g.userInfo.email + "\n" +
                        "🕐 Thời gian: " + thoiGian + "\n" +
                        "📝 Nội dung:\n" + noiDung;

      try {
        guiTinNhanGoogleChat(webhookFeedback, chatText);
        return responseJSON(200, "Đã gửi phản hồi thành công", null);
      } catch (feedbackErr) {
        return responseJSON(500, "Gửi thất bại: " + feedbackErr.toString(), null);
      }
    }