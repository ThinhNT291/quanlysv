// ============================================================================
// KySo.gs — Toàn bộ nghiệp vụ Ký điện tử (Pha 1 + Pha 2): tạo yêu cầu ký (theo loại
// văn bản có mẫu / tải file tự do), đóng dấu chữ ký lên Doc hoặc PDF (pdf-lib), ký số
// CA qua adapter VNPT SmartCA, xử lý nền qua trigger (ký PDF/ký CA), nhắc ký định kỳ,
// và các helper tra cứu ChucDanhKy/TaiKhoan liên quan. TÁCH RA từ Quanlysv.gs
// (2026-09-10), hành vi giữ nguyên 100% — xem ghi chú đầu Quanlysv.gs.
// ============================================================================



// ĐÃ THÊM (Ký điện tử Pha 1 — Bước 3): mở đúng spreadsheet chứa 3 tab mới
// ChucDanhKy/YeuCauKy/BuocKy. Theo kế hoạch mục 1.0: mặc định dùng CHUNG file với
// TaiKhoan (ACCOUNTS_SHEET_ID) vì đây là dữ liệu xoay quanh danh tính người dùng và
// file đó đã có ACL chặt sẵn (đang chứa cột hash mật khẩu). Cho phép override bằng
// property KYSO_SHEET_ID nếu sau này người dùng muốn tách riêng ra file khác.
function moKySoSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('KYSO_SHEET_ID') || props.getProperty('ACCOUNTS_SHEET_ID');
  return SpreadsheetApp.openById(id);
}

// ĐÃ THÊM (Ký điện tử Pha 1 — Bước 3): mở 1 tab trong file Ký điện tử, trả null nếu
// chưa tồn tại — ĐÚNG quy ước hiện có của TaiKhoan/CauHinh: code KHÔNG tự tạo tab,
// người dùng tự tạo tay (xem hướng dẫn Bước 1). Caller tự quyết định trả 404 kèm tên
// tab còn thiếu để người dùng biết chính xác cần tạo tab nào.
function laySheetKySo_(tenTab) {
  const ss = moKySoSpreadsheet_();
  return ss.getSheetByName(tenTab);
}

// ĐÃ THÊM (Ký điện tử Pha 1 — Bước 4): đọc tab ChucDanhKy, lọc theo loại tài liệu +
// đã kích hoạt, sắp theo thứ tự — dùng CHUNG cho action layCauHinhChucDanhKy (đọc để
// hiển thị bảng chọn người ký) VÀ taoYeuCauKyGBTT (xác thực danh sách người ký gửi lên
// từ client khớp đúng cấu hình thật trên Sheet, không tin thẳng dữ liệu từ trình duyệt).
function layChucDanhKy_(loaiTaiLieu) {
  const sheet = laySheetKySo_("ChucDanhKy");
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const ds = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const maChucDanh = String(row[0] || "").trim();
    if (!maChucDanh) continue;
    const apDungCho = String(row[4] || "").trim();
    const kichHoat = row[5];
    const daKichHoat = kichHoat === true || String(kichHoat).trim().toUpperCase() === 'TRUE';
    if (apDungCho !== loaiTaiLieu || !daKichHoat) continue;
    ds.push({
      maChucDanh: maChucDanh,
      tenChucDanh: String(row[1] || "").trim(),
      emailMacDinh: String(row[2] || "").trim(),
      thuTu: Number(row[3]) || (i + 1)
    });
  }
  ds.sort((a, b) => a.thuTu - b.thuTu);
  return ds;
}

// Tìm 1 dòng trong tab YeuCauKy theo MA_YEU_CAU (cột A) — cùng khuôn với
// timDongTaiKhoan_ bên dưới, tách riêng vì khoá tìm kiếm khác nhau (mã yêu cầu, không
// phải email) và không cần chuẩn hoá qua chuanHoaEmail_.
function timDongYeuCau_(sheetYeuCau, maYeuCau) {
  const data = sheetYeuCau.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === maYeuCau) {
      return { rowIndex: i + 1, row: data[i] };
    }
  }
  return null;
}

// Sinh mã yêu cầu ký duy nhất, dễ đọc — vd "GBTT-20260907-A3F19C".
function taoMaYeuCau_(loai) {
  const ngay = Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd");
  const ngauNhien = Utilities.getUuid().replace(/-/g, '').substring(0, 6).toUpperCase();
  return loai + "-" + ngay + "-" + ngauNhien;
}

// Escape ký tự đặc biệt của regex khi ghép MỘT GIÁ TRỊ ĐỘNG vào PATTERN của
// findText()/replaceText() — khác với thoatChuoiThayThe_ bên dưới (dùng cho vế THAY
// THẾ). maChucDanh theo quy ước chỉ gồm A-Z0-9_ nên về lý thuyết không cần, nhưng vẫn
// escape để phòng thân trong trường hợp ai đó lỡ đặt mã chức danh sai quy ước.
function thoatRegex_(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Escape ký tự đặc biệt khi dùng 1 CHUỖI ĐỘNG (tên người, ngày ký...) làm vế THAY THẾ
// của replaceText() — Matcher của Java hiểu \ và $ là ký tự đặc biệt trong CẢ vế thay
// thế lẫn vế pattern, không escape sẽ vỡ khi tên/nội dung chứa 2 ký tự này.
function thoatChuoiThayThe_(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/\$/g, '\\$');
}

// ============================================================================
// ĐÃ THÊM (Ký điện tử Pha 2 — Bước 5 — tổng quát hoá thêm loại văn bản khác GBTT)
// 4 hàm dưới đây tách ra từ taoYeuCauKyGBTT (trước đây viết thẳng cho riêng GBTT) để
// DÙNG CHUNG cho MỌI loại văn bản — xem 2 action 'taoYeuCauKyGBTT'/'taoYeuCauKy' ở trên
// để biết cách dùng. Thêm 1 loại văn bản mới từ giờ KHÔNG cần sửa bất kỳ hàm nào trong
// nhóm này — chỉ cần đúng quy ước Doc mẫu + Script Property + dòng ChucDanhKy như chú
// thích tại action 'taoYeuCauKy'.
// ============================================================================

// Map thông điệp lỗi từ xacThucNguoiKy_/layMauThuMuc_ sang mã HTTP phù hợp — GIỮ ĐÚNG mã
// lỗi taoYeuCauKyGBTT đã trả trước khi tách hàm (404 = thiếu cấu hình chức danh, 400 =
// danh sách người ký gửi lên không khớp cấu hình, còn lại — thiếu Script Property/không
// mở được mẫu Doc — coi là lỗi hệ thống 500).
function maHttpTuLoiChuanBiKy_(message) {
  const m = String(message || "");
  if (m.indexOf("Chưa cấu hình chức danh") === 0) return 404;
  if (m.indexOf("Danh sách người ký không hợp lệ") === 0) return 400;
  return 500;
}

// Xác thực + chuẩn hoá danh sách người ký gửi từ client cho 1 loại tài liệu — đối chiếu
// lại với cấu hình ChucDanhKy thật trên Sheet (đã kích hoạt + đúng loaiTaiLieu), không tin
// thẳng dữ liệu client (client có thể bị sửa tay/lỗi cache). Lấy TÊN thật từ sheet TaiKhoan
// nếu người đó đã có tài khoản, y hệt cách taoYeuCauKyGBTT làm trước đây. Throw Error nếu
// không hợp lệ — caller bọc try/catch, dùng maHttpTuLoiChuanBiKy_ để suy ra mã HTTP.
function xacThucNguoiKy_(loaiTaiLieu, dsNguoiKyRaw) {
  const cauHinhChucDanh = layChucDanhKy_(loaiTaiLieu);
  if (cauHinhChucDanh.length === 0) {
    throw new Error("Chưa cấu hình chức danh ký nào cho loại văn bản \"" + loaiTaiLieu + "\" (sheet ChucDanhKy)");
  }
  const mapChucDanh = {};
  cauHinhChucDanh.forEach(cd => { mapChucDanh[cd.maChucDanh] = cd; });

  const dsNguoiKy = (dsNguoiKyRaw || [])
    .filter(nk => nk && nk.email && mapChucDanh[nk.maChucDanh])
    .map(nk => {
      const cd = mapChucDanh[nk.maChucDanh];
      const emailChuan = chuanHoaEmail_(nk.email);
      const dongTK = timDongTaiKhoan_(emailChuan);
      return {
        maChucDanh: cd.maChucDanh,
        tenChucDanh: cd.tenChucDanh,
        thuTu: cd.thuTu,
        email: emailChuan,
        ten: dongTK ? String(dongTK.row[2] || "") : (String(nk.ten || "").trim() || emailChuan)
      };
    })
    .sort((a, b) => a.thuTu - b.thuTu);

  if (dsNguoiKy.length === 0) {
    throw new Error("Danh sách người ký không hợp lệ (chức danh không khớp cấu hình hiện tại, hoặc thiếu email)");
  }
  return { cauHinhChucDanh: cauHinhChucDanh, dsNguoiKy: dsNguoiKy };
}

// Mở mẫu Doc + thư mục lưu của 1 loại tài liệu, tra theo ĐÚNG quy ước tên Script Property
// "<LOAI>_TEMPLATE_DOC_ID"/"<LOAI>_FOLDER_ID" (LOAI = loaiTaiLieu viết hoa) — đây CHÍNH LÀ
// quy ước cho phép thêm loại văn bản mới mà không cần sửa code: chỉ cần đặt đúng tên 2
// Script Property này trỏ tới Doc mẫu/thư mục Drive tương ứng. Throw Error nếu thiếu cấu
// hình hoặc không mở được (ID sai/không có quyền truy cập).
function layMauThuMuc_(loaiTaiLieu) {
  const props = PropertiesService.getScriptProperties();
  const tienTo = String(loaiTaiLieu || "").trim().toUpperCase();
  const TEMPLATE_DOC_ID = props.getProperty(tienTo + '_TEMPLATE_DOC_ID');
  const FOLDER_ID = props.getProperty(tienTo + '_FOLDER_ID');
  if (!TEMPLATE_DOC_ID) throw new Error("Chưa cấu hình Script Property \"" + tienTo + "_TEMPLATE_DOC_ID\"");
  if (!FOLDER_ID) throw new Error("Chưa cấu hình Script Property \"" + tienTo + "_FOLDER_ID\"");
  try {
    return { templateDoc: DriveApp.getFileById(TEMPLATE_DOC_ID), folder: DriveApp.getFolderById(FOLDER_ID) };
  } catch (openErr) {
    throw new Error("Không mở được mẫu Doc/thư mục của \"" + loaiTaiLieu + "\": " + openErr.toString());
  }
}

// ĐÃ THÊM (Ký điện tử Pha 2 — Bước 6 — taoYeuCauKyTuFile, luồng "tải file lên ký ngay"):
// xác thực danh sách người ký cho luồng TỰ DO — KHÁC hẳn xacThucNguoiKy_ (đòi hỏi đối
// chiếu với cấu hình ChucDanhKy có sẵn cho 1 "loại văn bản" cố định). Luồng tự do KHÔNG có
// loại văn bản/cấu hình chức danh trước — người tạo tự đặt maChucDanh/tenChucDanh cho từng
// người ký NGAY LÚC TẠO yêu cầu (đúng ý tưởng UI tab "Người ký" trong kế hoạch). CHỈ kiểm:
// có ít nhất 1 người, mỗi người có email + maChucDanh, và maChucDanh KHÔNG TRÙNG NHAU trong
// cùng 1 yêu cầu (dùng làm khoá nối với VI_TRI_KY_JSON — trùng sẽ gán nhầm vị trí ký giữa 2
// người). Lấy TÊN thật từ TaiKhoan nếu email đã có tài khoản (giống xacThucNguoiKy_), không
// bắt buộc phải có tài khoản từ trước — nhưng người đó vẫn cần tự tải chữ ký cá nhân lên
// TRƯỚC KHI bấm "Ký" thật (layChuKyBlob_ kiểm ở đúng lúc ký, không kiểm ở đây).
function xacThucNguoiKyTuDo_(dsNguoiKyRaw) {
  const dsNguoiKy = (dsNguoiKyRaw || [])
    .filter(nk => nk && nk.email && String(nk.maChucDanh || "").trim())
    .map((nk, idx) => {
      const emailChuan = chuanHoaEmail_(nk.email);
      const dongTK = timDongTaiKhoan_(emailChuan);
      return {
        maChucDanh: String(nk.maChucDanh).trim(),
        tenChucDanh: String(nk.tenChucDanh || nk.maChucDanh).trim(),
        email: emailChuan,
        ten: dongTK ? String(dongTK.row[2] || "") : (String(nk.ten || "").trim() || emailChuan)
      };
    });

  if (dsNguoiKy.length === 0) {
    throw new Error("Danh sách người ký không hợp lệ (thiếu email hoặc mã chức danh cho ít nhất 1 người)");
  }
  const daDungMa = {};
  dsNguoiKy.forEach(nk => {
    if (daDungMa[nk.maChucDanh]) throw new Error("Mã chức danh \"" + nk.maChucDanh + "\" bị lặp lại — mỗi người ký trong cùng 1 yêu cầu cần 1 mã chức danh khác nhau");
    daDungMa[nk.maChucDanh] = true;
  });
  return dsNguoiKy;
}

// ĐÃ THÊM (Ký điện tử Pha 2 — Bước 6 — taoYeuCauKyTuFile): kiểm VI_TRI_KY_JSON có đủ vị
// trí ký cho MỌI người trong dsNguoiKy hay không — xem "ĐÃ CHỐT" trong kế hoạch (Bước 6b):
// 1 khi đã dùng pdf-lib, toạ độ là NGUỒN BẮT BUỘC DUY NHẤT (không có fallback "tự dò trong
// Doc mẫu" như luồng Docs), nên phải chặn ngay lúc TẠO yêu cầu — không được âm thầm tạo 1
// yêu cầu thiếu toạ độ rồi để lỗi vỡ ra muộn lúc người ta bấm "Ký" (xem dongDauChuKyVaoPdf_/
// xuLyKyPdfNen — throw "Thiếu vị trí ký cho chức danh..." nếu thiếu, nhưng đó là lớp phòng
// vệ THỨ 2, không thay được việc chặn sớm ở đây). Trả lại CHÍNH mảng đã parse (không đổi
// gì) nếu hợp lệ, để caller lưu thẳng vào cột VI_TRI_KY_JSON.
function xacThucViTriKy_(dsNguoiKy, viTriKyRaw) {
  let dsViTri;
  try {
    dsViTri = JSON.parse(viTriKyRaw || "[]");
  } catch (parseErr) {
    throw new Error("VI_TRI_KY_JSON không hợp lệ (không phải JSON đúng định dạng)");
  }
  if (!Array.isArray(dsViTri)) throw new Error("VI_TRI_KY_JSON phải là 1 mảng vị trí ký");
  const maCoViTri = {};
  dsViTri.forEach(v => { if (v && v.maChucDanh) maCoViTri[String(v.maChucDanh).trim()] = true; });
  const thieu = dsNguoiKy.filter(nk => !maCoViTri[nk.maChucDanh]).map(nk => nk.maChucDanh);
  if (thieu.length > 0) throw new Error("Thiếu vị trí ký (VI_TRI_KY_JSON) cho chức danh: " + thieu.join(", "));
  return dsViTri;
}

// Map thông điệp lỗi từ xacThucNguoiKyTuDo_/xacThucViTriKy_ sang mã HTTP — cùng nguyên tắc
// maHttpTuLoiChuanBiKy_ (400 = dữ liệu client gửi lên không hợp lệ, 500 = lỗi hệ thống).
function maHttpTuLoiTaoTuFile_(message) {
  const m = String(message || "");
  if (m.indexOf("Danh sách người ký không hợp lệ") === 0) return 400;
  if (m.indexOf("Mã chức danh") === 0) return 400;
  if (m.indexOf("Thiếu vị trí ký") === 0) return 400;
  if (m.indexOf("VI_TRI_KY_JSON") === 0) return 400;
  if (m.indexOf("Định dạng file") === 0) return 400;
  return 500;
}

// Thư mục lưu PDF của luồng "tải file lên ký ngay" (taoYeuCauKyTuFile) — KHÁC quy ước
// "<LOAI>_FOLDER_ID" của taoYeuCauKy (Bước 5, LOAI do người dùng tự đặt cho từng loại văn
// bản CÓ MẪU) vì luồng này không có "loại văn bản" cố định để đặt tên Property theo. Dùng 1
// Script Property CHUNG "TUFILE_FOLDER_ID" (TUỲ CHỌN, tự thêm nếu muốn gọn Drive) — chưa
// cấu hình thì tạm lưu vào thư mục gốc Drive của tài khoản chạy script, vẫn hoạt động bình
// thường, chỉ không gọn gàng bằng.
function layThuMucTuFile_() {
  const folderId = PropertiesService.getScriptProperties().getProperty('TUFILE_FOLDER_ID');
  if (!folderId) return DriveApp.getRootFolder();
  try {
    return DriveApp.getFolderById(folderId);
  } catch (err) {
    return DriveApp.getRootFolder();
  }
}

// Tạo ĐÚNG 1 yêu cầu ký (1 Doc trung gian + 1 dòng YeuCauKy + N dòng BuocKy + email "đến
// lượt ký") — phần lõi DÙNG CHUNG cho mọi loại văn bản, tách từ taoYeuCauKyGBTT. Nhận vào
// cauHinhChucDanh/dsNguoiKy/templateDoc/folder đã xác thực + mở sẵn ở NGOÀI (bởi
// xacThucNguoiKy_/layMauThuMuc_, gọi ĐÚNG 1 LẦN cho cả lô — không lặp lại mỗi văn bản, xem
// action 'taoYeuCauKyGBTT'). Throw Error nếu lỗi — caller (mỗi sinh viên/mỗi lần gọi) tự
// bọc try/catch.
//
//   loaiTaiLieu: mã loại văn bản (vd "GBTT") — dùng cho taoMaYeuCau_ + cột B YeuCauKy.
//   tieuDe: tiêu đề hiển thị (cột C), vd "Giấy báo trúng tuyển - Nguyễn Văn A".
//   noiDungPlaceholder: object phẳng {TEN_PLACEHOLDER: giá trị} — thay MỌI {{...}} nội
//     dung trong Doc mẫu, KHÔNG gồm {{HOTEN_<MA>}}/{{NGAYKY_<MA>}}/{{CHUKY_<MA>}} (3
//     placeholder đó hàm tự xử lý riêng theo từng chức danh trong dsNguoiKy).
//   thongTinLienQuan: {maSinhVien, hoTen, canCuoc, nganh} — metadata cột D-G YeuCauKy, để
//     trống hết nếu văn bản không gắn với 1 sinh viên cụ thể.
//   cauHinhChucDanh/dsNguoiKy: kết quả xacThucNguoiKy_.
//   cheDoKy: "TUAN_TU" | "SONG_SONG".
//   templateDoc/folder: kết quả layMauThuMuc_.
//   g: kết quả requireAuth() đã xác thực — lấy email/tên người tạo.
//   now: (tuỳ chọn) mốc thời gian dùng CHUNG cho cả lô (taoYeuCauKyGBTT truyền vào để mọi
//     sinh viên trong 1 đợt xuất cùng 1 giờ tạo, khớp hành vi gốc) — không truyền thì tự
//     lấy new Date() (đủ dùng cho action taoYeuCauKy — chỉ tạo 1 yêu cầu/lần gọi).
function taoYeuCauKy_(loaiTaiLieu, tieuDe, noiDungPlaceholder, thongTinLienQuan, cauHinhChucDanh, dsNguoiKy, cheDoKy, templateDoc, folder, g, now) {
  const sheetYeuCau = laySheetKySo_("YeuCauKy");
  const sheetBuoc = laySheetKySo_("BuocKy");
  if (!sheetYeuCau) throw new Error("Chưa tạo sheet YeuCauKy (xem hướng dẫn Bước 1)");
  if (!sheetBuoc) throw new Error("Chưa tạo sheet BuocKy (xem hướng dẫn Bước 1)");

  const thoiDiem = now || new Date();
  const thoiGianTao = Utilities.formatDate(thoiDiem, "GMT+7", "dd/MM/yyyy HH:mm");
  const maDaChon = {};
  dsNguoiKy.forEach(nk => { maDaChon[nk.maChucDanh] = nk; });
  const tt = thongTinLienQuan || {};

  const tenFileDoc = String(loaiTaiLieu).replace(/\s+/g, "_") + "_" +
    (String(tt.hoTen || tieuDe || "VanBan").trim().replace(/\s+/g, "_") || "VanBan") + "_" + thoiDiem.getTime();
  const tempDocFile = templateDoc.makeCopy(tenFileDoc, folder);
  const doc = DocumentApp.openById(tempDocFile.getId());
  const body = doc.getBody();

  Object.keys(noiDungPlaceholder || {}).forEach(key => {
    body.replaceText("\\{\\{" + key + "\\}\\}", thoatChuoiThayThe_(noiDungPlaceholder[key]));
  });

  // Điền sẵn tên người ký cho chức danh ĐƯỢC CHỌN; xoá trắng cả 3 placeholder của chức
  // danh KHÔNG dùng trong lần tạo này (khác chức danh chưa kích hoạt — những mã đó không
  // nằm trong cauHinhChucDanh nên không đụng tới).
  cauHinhChucDanh.forEach(cd => {
    const maAnToan = thoatRegex_(cd.maChucDanh);
    const nk = maDaChon[cd.maChucDanh];
    if (nk) {
      body.replaceText("\\{\\{HOTEN_" + maAnToan + "\\}\\}", thoatChuoiThayThe_(nk.ten));
    } else {
      body.replaceText("\\{\\{HOTEN_" + maAnToan + "\\}\\}", "");
      body.replaceText("\\{\\{NGAYKY_" + maAnToan + "\\}\\}", "");
      body.replaceText("\\{\\{CHUKY_" + maAnToan + "\\}\\}", "");
    }
  });

  doc.saveAndClose();

  const maYeuCau = taoMaYeuCau_(loaiTaiLieu);
  sheetYeuCau.appendRow([
    maYeuCau, loaiTaiLieu, tieuDe, String(tt.maSinhVien || ""), String(tt.hoTen || ""),
    String(tt.canCuoc || ""), String(tt.nganh || ""), g.userInfo.email, g.userInfo.name || g.userInfo.email,
    thoiGianTao, "DANG_KY", 1, tempDocFile.getId(), "", "", "", "",
    // Cột R (index 17) = CHE_DO_KY — CẦN TỰ THÊM tay tiêu đề cột này trên sheet YeuCauKy
    // (đúng quy ước: code không tự tạo cột), xem kyYeuCau đọc lại đúng cột này khi xét
    // "hoàn tất" (dongYC.row[17]).
    cheDoKy
  ]);
  // SONG_SONG thì MỌI bước bắt đầu DEN_LUOT ngay từ đầu (không có khái niệm CHO_TRUOC/
  // "tới lượt" nữa) — khác TUAN_TU chỉ bước 1 là DEN_LUOT, còn lại CHO_TRUOC chờ kyYeuCau
  // tuần tự promote dần.
  dsNguoiKy.forEach((nk, idx) => {
    sheetBuoc.appendRow([
      maYeuCau, idx + 1, nk.maChucDanh, nk.tenChucDanh, nk.email, nk.ten,
      (cheDoKy === "SONG_SONG" || idx === 0) ? "DEN_LUOT" : "CHO_TRUOC", "", "", ""
    ]);
  });

  // Sự kiện email #1 — báo "đến lượt ký". TUAN_TU chỉ báo người ký ĐẦU TIÊN (bước 2 trở
  // đi sẽ được báo lúc kyYeuCau chuyển bước, xem action đó); SONG_SONG báo NGAY cho TẤT CẢ
  // vì mọi bước đều DEN_LUOT từ đầu, không có "người kế tiếp" nào để báo sau nữa. KHÔNG
  // dùng getLastRow()/getRange() để ghi lại THOI_GIAN_GUI_MAIL ở đây — hàm này không bọc
  // LockService (có thể gọi hàng loạt liên tiếp từ taoYeuCauKyGBTT, khoá cả quá trình sẽ
  // quá lâu), 2 yêu cầu tạo cùng lúc có thể chen dòng nhau; gửi thất bại chỉ được phản ánh
  // qua "message" trả về, không cố ghi vào đúng dòng Sheet như kyYeuCau.
  const nguoiCanBaoNgay = cheDoKy === "SONG_SONG" ? dsNguoiKy : [dsNguoiKy[0]];
  const linkChoKyMoi = layLinkChoKy_();
  const loiGuiMail = [];
  nguoiCanBaoNgay.forEach(nk => {
    const noiDungMailMoi =
      "<p>Chào " + nk.ten + ",</p>" +
      "<p>Văn bản <b>" + tieuDe + "</b> đang chờ bạn ký với vai trò <b>" + nk.tenChucDanh + "</b>" +
      (cheDoKy === "SONG_SONG" ? " (ký song song — không cần đợi người khác ký trước)" : "") + ".</p>" +
      (linkChoKyMoi ? "<p><a href=\"" + linkChoKyMoi + "\">Bấm vào đây để xem và ký</a></p>" : "<p>Vào menu tài khoản → \"Hồ sơ chờ ký\" trên hệ thống để ký.</p>");
    const ketQuaMailMoi = guiEmailThongBao(nk.email, "Đến lượt bạn ký: " + tieuDe, noiDungMailMoi);
    if (!ketQuaMailMoi.ok) loiGuiMail.push(nk.tenChucDanh + ": " + ketQuaMailMoi.lyDo);
  });

  const nguoiKyDauTien = dsNguoiKy[0];
  return {
    maYeuCau: maYeuCau,
    message: (cheDoKy === "SONG_SONG"
      ? "Đã tạo yêu cầu ký song song, đang chờ " + dsNguoiKy.length + " người ký."
      : "Đã tạo yêu cầu ký, đang chờ " + nguoiKyDauTien.tenChucDanh + " (" + nguoiKyDauTien.email + ") ký.")
      + (loiGuiMail.length > 0 ? " ⚠️ Gửi email thông báo thất bại (" + loiGuiMail.join("; ") + ") — người ký vẫn có thể tự vào \"Hồ sơ chờ ký\" để ký bình thường." : "")
  };
}

// ĐÃ THÊM (Ký điện tử Pha 1 — Bước 4): đóng dấu ảnh chữ ký + dòng "Ký ngày..." vào
// đúng vị trí đã khoá cứng theo chức danh (placeholder {{CHUKY_<MA>}} /
// {{NGAYKY_<MA>}} trong file mẫu GBTT — xem hướng dẫn tạo mẫu). Trả false nếu mẫu
// thiếu placeholder chữ ký của chức danh này — caller phải coi đây là lỗi, KHÔNG được
// tự ý đổi trạng thái bước ký khi trả về false.
// ĐÃ SỬA (theo phản hồi — bug "trang 2 (mã ký thứ 2 của cùng 1 chức danh trong cùng văn
// bản) không hiện ảnh chữ ký, dòng ngày ký cũng không lên màu"): trước đây MỌI bước xử lý
// (chèn ảnh CHUKY, tô màu/cỡ chữ NGAYKY) chỉ áp dụng cho ĐÚNG 1 lần xuất hiện ĐẦU TIÊN của
// mỗi placeholder trong Doc (do body.findText() gốc chỉ trả về khớp đầu tiên) — với mẫu chỉ
// ký 1 lần/văn bản thì không sao, nhưng mẫu có NHIỀU khối ký cùng chức danh (VD lặp lại ở
// cuối mỗi trang cho tiện xác nhận khi in) thì chỉ khối ĐẦU TIÊN được xử lý đúng, các khối
// sau bị bỏ sót hoàn toàn (ảnh không chèn, hoặc dòng chữ đã thay đúng nội dung nhưng không
// được ép lại màu/cỡ chữ nên vẫn mang định dạng cũ của placeholder — nếu placeholder đó
// cũng được tô trắng để ẩn trước khi ký thì dòng chữ thật SAU KHI KÝ cũng bị ẩn theo, đúng
// y hệt hiện tượng "không lên màu"). Giờ LẶP xử lý đến khi hết MỌI bản sao trong toàn bộ Doc
// — xem 2 vòng while bên dưới + helper apDungMauMoiBanSao_.
// ĐÃ THÊM (theo yêu cầu): tham số tenNguoiKy + dòng mới {{NGUOIKY_<MA>}} = "Signed by:
// <tên>", cùng cỡ chữ/màu với "Signed date:" — placeholder MỚI, người dùng tự thêm vào mẫu
// Doc ở vị trí muốn (khuyến nghị đặt ngay TRÊN {{NGAYKY_<MA>}}); mẫu Doc cũ chưa có
// placeholder này thì bỏ qua êm, không lỗi gì (vẫn kiểm tra findText trước như NGAYKY).
function dongDauChuKyVaoDoc_(doc, maChucDanh, blob, thoiGian, tenNguoiKy) {
  const body = doc.getBody();
  const maAnToan = thoatRegex_(maChucDanh);

  const timDauTien = body.findText("\\{\\{CHUKY_" + maAnToan + "\\}\\}");
  if (!timDauTien) return false;

  // Đoạn chứa placeholder bị XOÁ KHỎI DOC ngay khi xử lý xong (oCha.removeChild(par) —
  // giữ nguyên cơ chế cũ, chỉ khác là giờ chạy trong vòng lặp), nên gọi lại findText() từ
  // đầu Doc ở mỗi vòng vẫn AN TOÀN — không lặp vô hạn, vì bản sao vừa xử lý không còn tồn
  // tại để khớp lại lần nữa; mỗi vòng chỉ khớp đúng 1 bản sao CÒN LẠI (nếu có).
  let tim = timDauTien;
  while (tim) {
    const el = tim.getElement();
    const par = el.getParent();
    const oCha = par.getParent(); // ô bảng (TableCell) chứa placeholder — xem quy ước khối chữ ký trong mẫu
    const viTri = oCha.getChildIndex(par);
    oCha.removeChild(par);
    const parMoi = oCha.insertParagraph(viTri, "");
    const anh = parMoi.appendInlineImage(blob);
    // ĐÃ SỬA (theo phản hồi — "đặt 300px vẫn bé tí, phải là RỘNG TỐI THIỂU chứ nhỉ"): ông
    // chẩn đoán đúng — bản trước chỉ THU NHỎ khi ảnh gốc > rongToiDa (if (anh.getWidth() >
    // rongToiDa)), còn ảnh chữ ký gốc của đa số người dùng vốn đã bé sẵn (dưới 300px ngang)
    // thì điều kiện đó không bao giờ đúng -> giữ nguyên kích thước gốc bé tí, không hề phóng
    // to. Giờ bỏ hẳn điều kiện so sánh, LUÔN ép ảnh về ĐÚNG rongToiDa (to ra hoặc nhỏ lại đều
    // được) — đúng nghĩa "kích thước cố định" như yêu cầu ban đầu, không phải "tối đa" nữa.
    // (Tên biến/Script Property CHUKY_ANH_RONG_TOI_DA giữ nguyên để không phải đổi tên
    // Property ông đã lỡ tạo — chỉ khác Ý NGHĨA sử dụng trong code, không phải đổi tên key.)
    const rongToiDa = Number(PropertiesService.getScriptProperties().getProperty('CHUKY_ANH_RONG_TOI_DA')) || 200;
    const tyLe = rongToiDa / anh.getWidth();
    anh.setWidth(rongToiDa).setHeight(Math.round(anh.getHeight() * tyLe));
    // LƯU Ý (theo phản hồi — "ảnh chạy ra giữa trang" sau khi đưa {{CHUKY_<MA>}} ra khỏi
    // bảng): CENTER ở đây luôn canh giữa theo đúng BỀ RỘNG CỦA "oCha" (ô bảng chứa nó, nếu
    // còn nằm trong bảng — nên ảnh canh giữa ĐÚNG NGAY DƯỚI cột/tên chức danh đó; hoặc TOÀN
    // BỘ THÂN TRANG nếu đặt trực tiếp ngoài bảng — nên ảnh canh giữa lệch hẳn ra giữa trang,
    // không còn nằm đúng dưới tên/chức danh nào nữa). Đây không phải bug — CENTER làm đúng
    // chức năng của nó, chỉ là bối cảnh (container) đã đổi. Với mẫu có NHIỀU người ký cạnh
    // nhau (VD 3 cột Người lập/Trưởng ban/Hiệu trưởng) thì {{CHUKY_<MA>}} NÊN đặt lại vào
    // đúng ô bảng của chức danh đó để giữ đúng vị trí — bảng không phải nguyên nhân ảnh nhỏ.
    parMoi.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    tim = body.findText("\\{\\{CHUKY_" + maAnToan + "\\}\\}");
  }

  // ĐÃ THÊM (theo yêu cầu — dòng "Signed by: <tên người ký>" ngay TRÊN "Signed date:"):
  // xử lý TRƯỚC NGAYKY để 2 dòng lần lượt đúng thứ tự khi người dùng đặt 2 placeholder liền
  // nhau trong mẫu (không bắt buộc — vị trí thật do người dùng tự sắp trong Doc quyết định).
  if (body.findText("\\{\\{NGUOIKY_" + maAnToan + "\\}\\}")) {
    const nguoiKyText = "Signed by: " + String(tenNguoiKy || "");
    body.replaceText("\\{\\{NGUOIKY_" + maAnToan + "\\}\\}", thoatChuoiThayThe_(nguoiKyText));
    apDungMauMoiBanSao_(body, nguoiKyText, '#1155CC', 9);
  }

  // ĐÃ SỬA (theo yêu cầu — đổi nhãn "Ký ngày" thành "Signed date:", cỡ chữ nhỏ 9pt, màu
  // xanh nước biển #1155CC (đúng màu "Blue" mặc định trong bảng màu Google Docs, dễ đối
  // chiếu/chỉnh tay nếu muốn đổi màu khác) — thay cho chữ thường/màu đen mặc định trước
  // đây.
  if (body.findText("\\{\\{NGAYKY_" + maAnToan + "\\}\\}")) {
    const ngayKyText = "Signed date: " + Utilities.formatDate(thoiGian, "GMT+7", "dd/MM/yyyy HH:mm");
    body.replaceText("\\{\\{NGAYKY_" + maAnToan + "\\}\\}", thoatChuoiThayThe_(ngayKyText));
    // ĐÃ THÊM (theo yêu cầu — cho phép ẩn mã {{NGAYKY_<MA>}} TRƯỚC khi ký bằng cách tô chữ
    // MÀU TRẮNG ngay trong mẫu Doc, xem hướng dẫn tạo mẫu cập nhật): replaceText() ở trên
    // GIỮ NGUYÊN định dạng (màu + cỡ chữ) đang có sẵn tại vị trí placeholder — nếu
    // placeholder được tô trắng để ẩn lúc chưa tới lượt ký, dòng "Signed date: ..." vừa
    // thay vào cũng sẽ bị ăn theo màu trắng đó (vô hình luôn, kể cả sau khi đã ký thật) nếu
    // không ép lại màu + cỡ chữ NGAY TẠI ĐÂY — KHÔNG phó mặc cho định dạng có sẵn của mẫu
    // Doc nữa (khác Bước 4 gốc, lúc đó mẫu chưa cần tô ẩn nên cứ để mặc định là đủ).
    apDungMauMoiBanSao_(body, ngayKyText, '#1155CC', 9);
  }
  return true;
}

// ĐÃ THÊM (theo phản hồi — sửa bug "trang 2 không lên màu"): tìm MỌI bản sao (không chỉ
// bản đầu tiên) của 1 đoạn văn bản ĐÃ ĐƯỢC THAY VÀO Doc rồi ép lại màu/cỡ chữ cho từng bản
// — dùng ngay sau replaceText() ở dongDauChuKyVaoDoc_ để đảm bảo chữ "Signed date:"/"Signed
// by:" luôn hiện đúng màu dù chức danh đó ký nhiều vị trí trong cùng văn bản. Khác nhánh
// CHUKY (xử lý bằng removeChild nên tìm lại từ đầu Doc là an toàn): ở đây văn bản KHÔNG bị
// xoá khỏi Doc sau khi tô màu, nên BẮT BUỘC dùng findText(pattern, from) với "from" là kết
// quả lần trước để tiếp tục tìm SAU vị trí đó — nếu tìm lại từ đầu mỗi lần sẽ lặp vô hạn
// đúng ngay bản đầu tiên.
function apDungMauMoiBanSao_(body, textCanTim, mauChu, coChu) {
  let tim = body.findText(thoatRegex_(textCanTim));
  while (tim) {
    const el = tim.getElement().asText();
    const batDau = tim.getStartOffset();
    const ketThuc = tim.getEndOffsetInclusive();
    el.setForegroundColor(batDau, ketThuc, mauChu);
    el.setFontSize(batDau, ketThuc, coChu);
    tim = body.findText(thoatRegex_(textCanTim), tim);
  }
}

// ĐÃ THÊM (Ký điện tử Pha 2 — Bước 6, luồng PDF/pdf-lib): chuyển mảng byte KIỂU JAVA CÓ
// DẤU (-128..127) mà Blob.getBytes() của Apps Script trả về sang Uint8Array KHÔNG DẤU
// (0..255) mà pdf-lib đòi hỏi (PDFDocument.load()/embedPng()/embedJpg()...) — KHÔNG có
// bước này, pdf-lib báo lỗi khó hiểu "pdf must be of type string or Uint8Array or
// ArrayBuffer, but was actually of type NaN" (đã tự tay xác nhận qua smoke test riêng
// trước khi viết hàm thật này, xem lịch sử trong kế hoạch — file smoke test chỉ TẠM,
// có thể đã bị xoá). PHẢI gọi hàm này ở MỌI nơi đưa bytes từ Drive/Blob vào bất kỳ API
// pdf-lib nào.
function guiGasBytesSangUint8Array_(gasBytes) {
  const u8 = new Uint8Array(gasBytes.length);
  for (let i = 0; i < gasBytes.length; i++) u8[i] = gasBytes[i] & 0xFF;
  return u8;
}

// ĐÃ THÊM (2026-09-09, sửa lỗi "WinAnsi cannot encode..." phát hiện khi test thật): pdf-lib
// dùng font chuẩn (Helvetica) + WinAnsiEncoding chỉ hỗ trợ dấu kiểu Tây Âu (é/è/ê/à/ù/ü...),
// KHÔNG hỗ trợ hầu hết dấu tiếng Việt thật (ế/ừ/ộ/ẫ...) — ném lỗi cứng nếu gặp. Tự bỏ dấu
// bằng cách chuẩn: Unicode NFD tách chữ cái khỏi dấu thanh/dấu phụ (vd "ế" -> "e" + 2 dấu tổ
// hợp) rồi xoá dải dấu tổ hợp U+0300-U+036F — riêng "đ/Đ" không tách được bằng NFD (là 1 chữ
// cái riêng, không phải chữ cái + dấu) nên xử lý tay thêm. CHỈ dùng cho dòng "Signed by" vẽ
// bằng pdf-lib (xem dongDauChuKyVaoPdf_) — KHÔNG đụng gì tới luồng Docs (dongDauChuKyVaoDoc_,
// Google Docs API hỗ trợ Unicode đầy đủ, không cần bỏ dấu).
function boDauTiengViet_(str) {
  if (!str) return "";
  let s = String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/đ/g, 'd').replace(/Đ/g, 'D');
  return s;
}

// ĐÃ THÊM (Ký điện tử Pha 2 — Bước 6, luồng PDF/pdf-lib): đóng dấu ảnh chữ ký + dòng
// "Signed by"/"Signed date" TRỰC TIẾP lên 1 PDF bằng pdf-lib — khác dongDauChuKyVaoDoc_
// (thao tác trên Google Doc còn sống, dựa vào tìm placeholder {{CHUKY_<MA>}}). Dùng cho
// luồng tải file tự do (taoYeuCauKyTuFile, chưa code) vì tài liệu đó KHÔNG có Doc mẫu để
// tìm placeholder — CHỈ có toạ độ tuyệt đối đọc từ VI_TRI_KY_JSON (xem "Quyết định kiến
// trúc" + Bước 6 trong kế hoạch — 1 khi đã xuất PDF tĩnh, pdf-lib KHÔNG có cách "tìm lại"
// vị trí văn bản như Docs.findText(), nên toạ độ là NGUỒN BẮT BUỘC DUY NHẤT, không có
// fallback nào khác).
// Tham số viTri = {trang, xTyLe, yTyLe, loaiO} (1 phần tử của mảng VI_TRI_KY_JSON, đã lọc
// đúng maChucDanh từ trước — xem xuLyKyPdfNen).
// LƯU Ý TRỤC Y (xem kế hoạch): xTyLe/yTyLe lưu theo hệ toạ độ CANVAS (gốc TRÊN-TRÁI, y
// tăng dần XUỐNG — tự nhiên khi frontend bắt sự kiện click), còn pdf-lib vẽ theo hệ toạ
// độ PDF THẬT (gốc DƯỚI-TRÁI, y tăng dần LÊN) — NGƯỢC CHIỀU nhau — nên phải tự đảo trục Y
// ở ĐÚNG NƠI NÀY (backend), KHÔNG đảo ở frontend, tránh 2 nơi cùng đảo hoặc quên đảo. Coi
// điểm click là góc TRÊN-TRÁI của khung ký (không phải tâm khung).
// Trả về Uint8Array của PDF ĐÃ ký (KHÔNG tự ghi vào Drive — caller (xuLyKyPdfNen) tự
// quyết định tạo file mới/xoá file cũ, vì DriveApp không ghi đè nội dung nhị phân tại chỗ).
async function dongDauChuKyVaoPdf_(pdfBytesU8, viTri, chuKyBlob, thoiGian, tenNguoiKy) {
  const pdfDoc = await PDFLib.PDFDocument.load(pdfBytesU8);
  const soTrang = Math.max(0, (Number(viTri.trang) || 1) - 1);
  const trangs = pdfDoc.getPages();
  const trang = trangs[soTrang] || trangs[0];
  const caoTrang = trang.getHeight();
  const rongTrang = trang.getWidth();

  // Kích thước khung ký CỐ ĐỊNH theo loaiO (xem "Quyết định kiến trúc" — mô hình "ô kích
  // thước cố định" kiểu DocuSign, KHÔNG cho kéo-thả đổi kích thước tự do). Định dạng Script
  // Property: "rộng,cao" tính bằng point PDF (1pt = 1/72 inch) — có giá trị mặc định nếu
  // Admin chưa tự cấu hình.
  const kieuKhung = String(viTri.loaiO || "DAY_DU").trim().toUpperCase();
  const propKhung = kieuKhung === "NHAY" ? 'KHUNG_CHU_KY_NHAY_WH' : 'KHUNG_CHU_KY_DAY_DU_WH';
  const macDinhKhung = kieuKhung === "NHAY" ? '80,40' : '160,70';
  const whRaw = String(PropertiesService.getScriptProperties().getProperty(propKhung) || macDinhKhung).split(',');
  const khungRong = Number(whRaw[0]) || 160;
  const khungCao = Number(whRaw[1]) || 70;

  const xTyLe = Number(viTri.xTyLe) || 0;
  const yTyLe = Number(viTri.yTyLe) || 0;
  const xGoc = rongTrang * xTyLe;
  const yGocTrenKhung = caoTrang * (1 - yTyLe);
  const yGocDuoiKhung = yGocTrenKhung - khungCao;

  // ĐÃ SỬA (2026-09-09 — "vừa ký vừa có khung hình cho CA"): chuKyBlob giờ CÓ THỂ null —
  // trước đây hàm này chỉ dùng cho luồng ẢNH (xuLyKyPdfNen), nơi chuKyBlob LUÔN bắt buộc (đã
  // chặn từ trước khi gọi vào đây). Giờ TÁI DÙNG lại đúng hàm này cho cả người ký CHỌN KÝ SỐ
  // (CA) trong luồng tải-file-tự-do (xem xuLyKyCA) — người ký CA không bắt buộc phải có ảnh
  // chữ ký cá nhân (bản thân chữ ký số mới là thứ có giá trị pháp lý, ảnh chỉ là dấu hiệu
  // trực quan) — nếu chuKyBlob null thì vẽ khung viền + chữ "DA KY SO" ở giữa thay vì ảnh, để
  // người xem vẫn thấy RÕ có người đã ký tại đó (khác hẳn để trống hoàn toàn, dễ hiểu lầm là
  // CHƯA ai ký) — nếu CÓ ảnh (kể cả người ký CA cũng lỡ tải ảnh chữ ký cá nhân lên) vẫn ưu
  // tiên dùng ảnh như bình thường.
  const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
  if (chuKyBlob) {
    // Ảnh chữ ký co theo tỉ lệ NHỎ HƠN giữa (khungRong/anhRong) và (khungCao/anhCao), giữ
    // nguyên khung hình — mở rộng đúng nguyên lý dongDauChuKyVaoDoc_ (co ảnh theo 1 chiều
    // rộng cố định), chỉ khác giờ có cả chiều cao để không bị méo/tràn khung.
    const contentType = chuKyBlob.getContentType() || "";
    const anhBytes = guiGasBytesSangUint8Array_(chuKyBlob.getBytes());
    const anhEmbed = /png/i.test(contentType) ? await pdfDoc.embedPng(anhBytes) : await pdfDoc.embedJpg(anhBytes);
    const tyLeCo = Math.min(khungRong / anhEmbed.width, khungCao / anhEmbed.height);
    const anhRongVe = anhEmbed.width * tyLeCo;
    const anhCaoVe = anhEmbed.height * tyLeCo;
    // Canh giữa ảnh trong khung (cả ngang lẫn dọc) — giống hiệu ứng CENTER của
    // dongDauChuKyVaoDoc_ nhưng tự tính tay vì PDF không có khái niệm "canh giữa ô".
    const anhX = xGoc + (khungRong - anhRongVe) / 2;
    const anhY = yGocDuoiKhung + (khungCao - anhCaoVe) / 2;
    trang.drawImage(anhEmbed, { x: anhX, y: anhY, width: anhRongVe, height: anhCaoVe });
  } else {
    const chuKySoText = "DA KY SO";
    const chuKySoSize = 12;
    const textWidth = font.widthOfTextAtSize(chuKySoText, chuKySoSize);
    trang.drawRectangle({
      x: xGoc, y: yGocDuoiKhung, width: khungRong, height: khungCao,
      borderWidth: 1, borderColor: PDFLib.rgb(0x11 / 255, 0x55 / 255, 0xCC / 255), opacity: 0,
    });
    trang.drawText(chuKySoText, {
      x: xGoc + (khungRong - textWidth) / 2,
      y: yGocDuoiKhung + khungCao / 2 - chuKySoSize / 2,
      size: chuKySoSize, font: font, color: PDFLib.rgb(0x11 / 255, 0x55 / 255, 0xCC / 255),
    });
  }

  // "Signed by"/"Signed date" vẽ NGAY DƯỚI khung (không rasterize — text vector thật, chọn/
  // copy được) — cùng màu/cỡ chữ với dongDauChuKyVaoDoc_ (#1155CC, 9pt trong Doc; ở đây
  // dùng 8pt cho gọn vì khung PDF nhỏ hơn nhiều so với cả 1 dòng trong bảng Doc). LƯU Ý khi
  // dùng UI click-to-place (Bước 6, chưa xây): người tạo cần tự chừa khoảng cách dọc giữa
  // các khung ký liền kề để 2 dòng chữ này không đè lên khung/chữ của người ký khác — bản
  // xem trước PDF.js sẽ cho thấy ngay nếu bị đè, tự điều chỉnh lại điểm click là đủ.
  const coChu = 8;
  const mauChu = PDFLib.rgb(0x11 / 255, 0x55 / 255, 0xCC / 255); // #1155CC — cùng màu Signed by/date của luồng Docs
  const dongTenY = yGocDuoiKhung - coChu - 2;
  const dongNgayY = dongTenY - coChu - 2;
  // ĐÃ SỬA (2026-09-09, phát hiện khi test thật): giả định ban đầu ("Signed by" luôn dùng
  // tên không dấu kiểu "Nguyen Van A") SAI với thực tế — tên tài khoản Google thật CÓ dấu
  // tiếng Việt đầy đủ (VD "ế"), mà font chuẩn Helvetica/WinAnsiEncoding của pdf-lib KHÔNG
  // hỗ trợ hầu hết dấu tiếng Việt (chỉ hỗ trợ kiểu Tây Âu: é/è/ê/à... không có ế/ừ/ộ...) —
  // pdf-lib ném lỗi cứng "WinAnsi cannot encode..." thay vì bỏ qua. Vendor thêm font Unicode
  // riêng (fontkit + file .ttf) là hướng ĐÚNG lâu dài nhưng tốn công hơn hẳn — theo yêu cầu
  // người dùng (2026-09-09, "phức tạp thì ép về không dấu, viết hoa hết cho khỏe"), CHỐT
  // dùng giải pháp đơn giản: bỏ dấu + VIẾT HOA toàn bộ tên người ký CHỈ TRONG dòng chữ
  // "Signed by" (ảnh chữ ký cá nhân phía trên vẫn nguyên vẹn, không đụng gì) — vừa chắc chắn
  // không lỗi với bất kỳ tên nào, vừa giống cách nhiều văn bản hành chính in tên không dấu.
  trang.drawText("Signed by: " + boDauTiengViet_(tenNguoiKy).toUpperCase(), { x: xGoc, y: dongTenY, size: coChu, font: font, color: mauChu });
  trang.drawText("Signed date: " + Utilities.formatDate(thoiGian, "GMT+7", "dd/MM/yyyy HH:mm"), { x: xGoc, y: dongNgayY, size: coChu, font: font, color: mauChu });

  return await pdfDoc.save();
}

// ĐÃ THÊM (Ký điện tử Pha 2 — Bước 6 — taoYeuCauKyTuFile): bọc 1 ảnh (PNG/JPG người dùng
// tự tải lên) thành 1 trang PDF ĐÚNG kích thước ảnh gốc (point = pixel gốc, KHÔNG ép về A4
// để khỏi méo/co ảnh) — hợp với việc chụp/scan 1 trang giấy rồi tải ảnh lên ký thẳng, không
// cần qua Word/PDF trung gian. Trả về Uint8Array PDF (1 trang duy nhất).
async function anhSangPdf_(anhBytesU8, mimeType) {
  const pdfDoc = await PDFLib.PDFDocument.create();
  const anhEmbed = /png/i.test(mimeType) ? await pdfDoc.embedPng(anhBytesU8) : await pdfDoc.embedJpg(anhBytesU8);
  const trang = pdfDoc.addPage([anhEmbed.width, anhEmbed.height]);
  trang.drawImage(anhEmbed, { x: 0, y: 0, width: anhEmbed.width, height: anhEmbed.height });
  return await pdfDoc.save();
}

// ĐÃ THÊM (Ký điện tử Pha 2 — Bước 6): đăng ký 1 trigger CHẠY ĐÚNG 1 LẦN để việc đóng dấu
// pdf-lib (async) chạy trong 1 lượt thực thi RIÊNG — xem chú thích tại action kyYeuCau: Web
// App (doGet/doPost) KHÔNG BAO GIỜ đợi được Promise trả về (đã tự tay xác nhận: khai báo
// async cho doGet/doPost khiến Apps Script báo lỗi "The script completed but the returned
// value is not a supported return type" — Promise không phải kiểu trả về hợp lệ của Web
// App), còn trigger THÌ CÓ đợi (dùng chung cơ chế thực thi với "Run" thủ công trong trình
// soạn thảo — đã xác nhận qua smoke test riêng trước khi viết hàm này).
// Trigger 1-lần KHÔNG truyền được tham số riêng — phải gửi job qua CacheService, khoá theo
// chính getUniqueId() của trigger vừa tạo, đọc lại trong xuLyKyPdfNen qua e.triggerUid.
// Dùng CacheService (KHÁC PropertiesService dùng cho session ở đầu file) vì job chỉ sống
// vài chục giây tới ~1 phút (quan sát thực tế: trigger .after(1000) KHÔNG kích hoạt ngay,
// có thể mất tới ~1 phút) rồi tự dọn — không cần tự canh hết hạn/dọn rác thủ công.
function datLichXuLyKyPdfNen_(maYeuCau, emailNguoiKy) {
  const trigger = ScriptApp.newTrigger('xuLyKyPdfNen').timeBased().after(1000).create();
  CacheService.getScriptCache().put('pdfjob_' + trigger.getUniqueId(), JSON.stringify({ maYeuCau: maYeuCau, email: emailNguoiKy }), 600);
}

// ĐÃ THÊM (Ký điện tử Pha 2 — Bước 6): hàm THỰC SỰ chạy khi trigger ở datLichXuLyKyPdfNen_
// kích hoạt — làm lại ĐÚNG những việc kyYeuCau làm cho luồng Docs (đóng dấu, xét hoàn tất/
// chuyển bước kế tiếp, gửi mail), chỉ khác thao tác trên PDF bằng dongDauChuKyVaoPdf_ thay
// vì dongDauChuKyVaoDoc_. CỐ TÌNH KHÔNG dùng chung code với nhánh Docs trong kyYeuCau (dù
// trùng lặp logic buocChuaKy/buocChoTruoc) — tách hẳn để KHÔNG rủi ro ảnh hưởng luồng GBTT
// đang chạy ổn định khi sửa nhánh này về sau (xem "ĐÃ CHỐT PHẠM VI" trong kế hoạch).
// Bọc LockService RIÊNG (KHÁC lock của doPost — đã release ngay khi kyYeuCau trả response
// tạm "đang xử lý", trigger chạy ở 1 lượt thực thi hoàn toàn tách biệt).
async function xuLyKyPdfNen(e) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'pdfjob_' + e.triggerUid;
  const raw = cache.get(cacheKey);

  // Xoá trigger 1-lần NGAY LẬP TỨC (trước khi xử lý gì khác) — tránh trigger rác tồn đọng
  // nếu code bên dưới lỗi giữa chừng.
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'xuLyKyPdfNen' && t.getUniqueId() === e.triggerUid) ScriptApp.deleteTrigger(t);
  });

  if (!raw) { console.error('xuLyKyPdfNen: không tìm thấy job trong cache cho trigger ' + e.triggerUid); return; }
  cache.remove(cacheKey);
  const job = JSON.parse(raw);
  const maYeuCau = job.maYeuCau;
  const emailChuan = chuanHoaEmail_(job.email);

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (lockErr) {
    // Không có nơi nào để trả lỗi về (không phải HTTP request) — bước vẫn đứng ở DANG_XU_LY;
    // đây là trường hợp HIẾM (đụng đúng lúc 1 lượt ký/trigger khác đang giữ lock 15s) — nếu
    // xảy ra, người dùng cần Admin tự đổi tay BuocKy về DEN_LUOT để bấm ký lại.
    console.error('xuLyKyPdfNen: không giành được lock cho ' + maYeuCau);
    return;
  }

  try {
    const sheetYeuCau = laySheetKySo_("YeuCauKy");
    const sheetBuoc = laySheetKySo_("BuocKy");
    const dongYC = timDongYeuCau_(sheetYeuCau, maYeuCau);
    if (!dongYC) { console.error('xuLyKyPdfNen: không tìm thấy yêu cầu ' + maYeuCau); return; }

    const dataBuoc = sheetBuoc.getDataRange().getValues();
    let dongBuocIndex = -1;
    for (let i = 1; i < dataBuoc.length; i++) {
      if (String(dataBuoc[i][0]).trim() === maYeuCau && chuanHoaEmail_(dataBuoc[i][4]) === emailChuan && String(dataBuoc[i][6] || "").trim() === "DANG_XU_LY") {
        dongBuocIndex = i; break;
      }
    }
    if (dongBuocIndex === -1) { console.error('xuLyKyPdfNen: không tìm thấy bước DANG_XU_LY khớp ' + maYeuCau + '/' + emailChuan); return; }

    try {
      const chuKyBlob = layChuKyBlob_(emailChuan);
      if (!chuKyBlob) throw new Error("Người ký chưa tải chữ ký cá nhân lên");

      const maChucDanh = String(dataBuoc[dongBuocIndex][2] || "").trim();
      const tenNguoiDangKy = String(dataBuoc[dongBuocIndex][5] || "").trim();
      const docId = String(dongYC.row[12] || "");
      if (!docId) throw new Error("Yêu cầu ký thiếu DOC_ID");

      const viTriKyRaw = String(dongYC.row[18] || "").trim();
      const dsViTri = JSON.parse(viTriKyRaw || "[]");
      const viTri = dsViTri.find(v => String(v.maChucDanh || "").trim() === maChucDanh);
      if (!viTri) throw new Error("Thiếu vị trí ký cho chức danh " + maChucDanh + " trong VI_TRI_KY_JSON");

      const now = new Date();
      const pdfFileGoc = DriveApp.getFileById(docId);
      const pdfBytesU8 = guiGasBytesSangUint8Array_(pdfFileGoc.getBlob().getBytes());
      const pdfBytesMoi = await dongDauChuKyVaoPdf_(pdfBytesU8, viTri, chuKyBlob, now, tenNguoiDangKy);

      // DriveApp không ghi đè NỘI DUNG file nhị phân tại chỗ — phải tạo file MỚI rồi trỏ
      // DOC_ID sang file mới, xoá (chuyển vào thùng rác) file cũ để không rác Drive. Đặt lại
      // đúng tên cũ + cùng thư mục cũ để người dùng không thấy lạ khi mở link.
      const tenCu = pdfFileGoc.getName();
      const parentsIt = pdfFileGoc.getParents();
      const thuMucCu = parentsIt.hasNext() ? parentsIt.next() : DriveApp.getRootFolder();
      const pdfBlobMoi = Utilities.newBlob(pdfBytesMoi, MimeType.PDF, tenCu);
      const pdfFileMoi = thuMucCu.createFile(pdfBlobMoi);
      pdfFileGoc.setTrashed(true);
      sheetYeuCau.getRange(dongYC.rowIndex, 13).setValue(pdfFileMoi.getId()); // cột M = DOC_ID

      const thoiGianKy = Utilities.formatDate(now, "GMT+7", "dd/MM/yyyy HH:mm");
      sheetBuoc.getRange(dongBuocIndex + 1, 7).setValue("DA_KY");     // cột G
      sheetBuoc.getRange(dongBuocIndex + 1, 8).setValue(thoiGianKy); // cột H

      // Lặp lại ĐÚNG logic buocChuaKy/buocChoTruoc của kyYeuCau (xem chú thích gốc ở đó) —
      // cố tình COPY thay vì tách hàm dùng chung, xem lý do ở đầu hàm này.
      const buocChuaKy = [];
      const buocChoTruoc = [];
      for (let i = 1; i < dataBuoc.length; i++) {
        if (i === dongBuocIndex || String(dataBuoc[i][0]).trim() !== maYeuCau) continue;
        const tt = String(dataBuoc[i][6] || "").trim();
        if (tt === "DA_KY") continue;
        buocChuaKy.push(i);
        if (tt === "CHO_TRUOC") buocChoTruoc.push({ index: i, thuTu: Number(dataBuoc[i][1]) || 0 });
      }

      if (buocChuaKy.length > 0) {
        if (buocChoTruoc.length > 0) {
          buocChoTruoc.sort((a, b) => a.thuTu - b.thuTu);
          const buocKeTiep = buocChoTruoc[0];
          sheetBuoc.getRange(buocKeTiep.index + 1, 7).setValue("DEN_LUOT");
          sheetYeuCau.getRange(dongYC.rowIndex, 12).setValue(buocKeTiep.thuTu);

          const emailKeTiep = String(dataBuoc[buocKeTiep.index][4] || "").trim();
          const tenKeTiep = String(dataBuoc[buocKeTiep.index][5] || "") || emailKeTiep;
          const tenChucDanhKeTiep = String(dataBuoc[buocKeTiep.index][3] || "");
          const linkChoKy = layLinkChoKy_();
          const noiDungMail1 =
            "<p>Chào " + tenKeTiep + ",</p>" +
            "<p>Văn bản <b>" + String(dongYC.row[2] || "") + "</b> " +
            "đang chờ bạn ký với vai trò <b>" + tenChucDanhKeTiep + "</b>, sau khi " + tenNguoiDangKy + " đã ký.</p>" +
            (linkChoKy ? "<p><a href=\"" + linkChoKy + "\">Bấm vào đây để xem và ký</a></p>" : "<p>Vào menu tài khoản → \"Hồ sơ chờ ký\" trên hệ thống để ký.</p>");
          const ketQuaMail1 = guiEmailThongBao(emailKeTiep, "Đến lượt bạn ký: " + String(dongYC.row[2] || ""), noiDungMail1);
          if (ketQuaMail1.ok) {
            sheetBuoc.getRange(buocKeTiep.index + 1, 9).setValue(thoiGianKy);
          } else {
            sheetBuoc.getRange(buocKeTiep.index + 1, 10).setValue("Gửi mail thất bại: " + ketQuaMail1.lyDo);
          }
        }
        return; // còn người chưa ký — xong việc của trigger này
      }

      // Chữ ký cuối cùng — hoàn tất. Khác nhánh Docs (kyYeuCau): file ở DOC_ID Ở ĐÂY ĐÃ LÀ
      // PDF SẴN (từ đầu, vì luồng ad-hoc-upload không qua Doc trung gian) — không cần
      // getAs(MimeType.PDF) export lại lần nữa, chỉ cần share công khai.
      pdfFileMoi.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      sheetYeuCau.getRange(dongYC.rowIndex, 11).setValue("HOAN_THANH"); // cột K
      sheetYeuCau.getRange(dongYC.rowIndex, 12).setValue(0);            // cột L
      sheetYeuCau.getRange(dongYC.rowIndex, 14).setValue(pdfFileMoi.getUrl()); // cột N
      sheetYeuCau.getRange(dongYC.rowIndex, 15).setValue(pdfFileMoi.getId());  // cột O
      sheetYeuCau.getRange(dongYC.rowIndex, 16).setValue(thoiGianKy);          // cột P

      const nguoiTaoEmail = String(dongYC.row[7] || "").trim();
      const dsDaKyHtml = dataBuoc
        .filter(r => String(r[0]).trim() === maYeuCau)
        .sort((a, b) => (Number(a[1]) || 0) - (Number(b[1]) || 0))
        .map(r => "<li>" + String(r[3] || "") + " — " + String(r[5] || "") + (r[7] ? " (đã ký " + r[7] + ")" : "") + "</li>")
        .join("");
      const noiDungMail2 =
        "<p>Văn bản <b>" + String(dongYC.row[2] || "") + "</b> đã được ký đầy đủ và hoàn tất.</p>" +
        "<p>Danh sách đã ký:</p><ul>" + dsDaKyHtml + "</ul>" +
        "<p><a href=\"" + pdfFileMoi.getUrl() + "\">Xem/tải PDF hoàn chỉnh</a></p>";
      const ketQuaMail2 = guiEmailThongBao(nguoiTaoEmail, "Đã hoàn tất ký: " + String(dongYC.row[2] || ""), noiDungMail2);
      if (!ketQuaMail2.ok) {
        sheetYeuCau.getRange(dongYC.rowIndex, 17).setValue("Gửi mail hoàn tất thất bại: " + ketQuaMail2.lyDo); // cột Q = GHI_CHU
      }
    } catch (processErr) {
      // Lỗi xử lý PDF/ký — TRẢ BƯỚC VỀ LẠI DEN_LUOT (KHÔNG để kẹt mãi ở DANG_XU_LY) để
      // người dùng chỉ cần bấm "Ký" lại là được thử lại từ đầu — ghi rõ lý do vào GHI_CHU
      // (cột J của BuocKy) để còn tra được nếu lỗi lặp lại nhiều lần.
      sheetBuoc.getRange(dongBuocIndex + 1, 7).setValue("DEN_LUOT");
      sheetBuoc.getRange(dongBuocIndex + 1, 10).setValue("Lỗi xử lý ký PDF nền: " + dienGiaiLoi_(processErr));
      console.error('xuLyKyPdfNen lỗi: ' + dienGiaiLoi_(processErr));
    }
  } finally {
    lock.releaseLock();
  }
}

// ĐÃ THÊM (Ký điện tử Pha 2 — Bước 8, nối ca-sign-service thật): TÁI DÙNG Y HỆT cơ chế
// trigger 1-lần + CacheService của datLichXuLyKyPdfNen_/xuLyKyPdfNen (xem chú thích đầy đủ ở
// đó) — chỉ khác việc "xử lý" ở đây là gọi NhaCungCapCA_.guiYeuCauKyCA_ (Cloud Run) thay vì
// dongDauChuKyVaoPdf_ (pdf-lib tại chỗ). Prefix cache key khác ('cajob_' thay vì 'pdfjob_')
// để 2 loại job không đụng nhau nếu cả 2 trigger cùng chờ kích hoạt 1 lúc.
function datLichXuLyKyCA_(maYeuCau, emailNguoiKy) {
  const trigger = ScriptApp.newTrigger('xuLyKyCA').timeBased().after(1000).create();
  CacheService.getScriptCache().put('cajob_' + trigger.getUniqueId(), JSON.stringify({ maYeuCau: maYeuCau, email: emailNguoiKy }), 600);
}

// Hàm THỰC SỰ chạy khi trigger ở datLichXuLyKyCA_ kích hoạt. ĐÃ SỬA (2026-09-09 — "vừa ký
// vừa có khung hình cho CA"): TRỞ LẠI cần khai báo async — bản đầu (chỉ gọi UrlFetchApp,
// đồng bộ tự nhiên) không cần, nhưng giờ với luồng tải-file-tự-do (có VI_TRI_KY_JSON) cần
// vẽ khung ký nhìn thấy được bằng dongDauChuKyVaoPdf_ (pdf-lib, thật sự async) TRƯỚC KHI ký
// số — CA phải là thao tác CUỐI CÙNG trên file nên bước vẽ appearance này BẮT BUỘC chạy
// trước, không được chạy sau. An toàn để dùng async ở đây vì đây vẫn là hàm TRIGGER (đã kiểm
// chứng nhiều lần: trigger 1-lần đợi được Promise, khác hẳn doGet/doPost) — xem xuLyKyPdfNen.
async function xuLyKyCA(e) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'cajob_' + e.triggerUid;
  const raw = cache.get(cacheKey);

  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'xuLyKyCA' && t.getUniqueId() === e.triggerUid) ScriptApp.deleteTrigger(t);
  });

  if (!raw) { console.error('xuLyKyCA: không tìm thấy job trong cache cho trigger ' + e.triggerUid); return; }
  cache.remove(cacheKey);
  const job = JSON.parse(raw);
  const maYeuCau = job.maYeuCau;
  const emailChuan = chuanHoaEmail_(job.email);

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (lockErr) {
    console.error('xuLyKyCA: không giành được lock cho ' + maYeuCau);
    return;
  }

  let dongBuocIndex = -1;
  let sheetBuoc;
  try {
    const sheetYeuCau = laySheetKySo_("YeuCauKy");
    sheetBuoc = laySheetKySo_("BuocKy");
    const dongYC = timDongYeuCau_(sheetYeuCau, maYeuCau);
    if (!dongYC) { console.error('xuLyKyCA: không tìm thấy yêu cầu ' + maYeuCau); return; }

    const dataBuoc = sheetBuoc.getDataRange().getValues();
    for (let i = 1; i < dataBuoc.length; i++) {
      if (String(dataBuoc[i][0]).trim() === maYeuCau && chuanHoaEmail_(dataBuoc[i][4]) === emailChuan && String(dataBuoc[i][6] || "").trim() === "DANG_XU_LY") {
        dongBuocIndex = i; break;
      }
    }
    if (dongBuocIndex === -1) { console.error('xuLyKyCA: không tìm thấy bước DANG_XU_LY khớp ' + maYeuCau + '/' + emailChuan); return; }

    try {
      const docId = String(dongYC.row[12] || "");
      if (!docId) throw new Error("Yêu cầu ký thiếu DOC_ID");
      const thongTinCa = layThongTinCaThueBao_(emailChuan);
      if (!thongTinCa) throw new Error("Tài khoản không còn cấu hình CA_NHA_CUNG_CAP/CA_MA_THUE_BAO");

      // CA luôn là bước CUỐI CÙNG (đã chặn ở kyYeuCau trước khi vào nhánh này) — file ở
      // docId có thể là Google Doc (GBTT/loại văn bản cấu hình sẵn) hoặc PDF thật (luồng
      // tải-file-tự-do) — getAs(MimeType.PDF) xử lý đúng cho cả 2 trường hợp.
      //
      // ĐÃ THÊM (2026-09-09 — "vừa ký vừa có khung hình cho CA"): nếu yêu cầu này có
      // VI_TRI_KY_JSON (luồng tải-file-tự-do) thì vẽ khung ký NHÌN THẤY ĐƯỢC (ảnh chữ ký cá
      // nhân nếu người này có tải lên, không thì khung viền + chữ "DA KY SO") tại đúng vị trí
      // đã chọn — TRƯỚC KHI gọi ký số, đúng thứ tự bắt buộc (appearance trước, crypto sau
      // cùng). Luồng GBTT/Docs-based (viTriKyRaw rỗng) không có khái niệm "khung ký" nên bỏ
      // qua bước này, giữ nguyên hành vi cũ (chỉ export PDF hiện trạng rồi ký số thẳng).
      const maChucDanhCA = String(dataBuoc[dongBuocIndex][2] || "").trim();
      const tenNguoiKyCA = String(dataBuoc[dongBuocIndex][5] || "").trim();
      const viTriKyRaw = String(dongYC.row[18] || "").trim();
      let pdfHienTai;
      if (viTriKyRaw) {
        const dsViTri = JSON.parse(viTriKyRaw || "[]");
        const viTri = dsViTri.find(v => String(v.maChucDanh || "").trim() === maChucDanhCA);
        if (!viTri) throw new Error("Thiếu vị trí ký cho chức danh " + maChucDanhCA + " trong VI_TRI_KY_JSON");
        const chuKyBlobCA = layChuKyBlob_(emailChuan); // null nếu chưa tải ảnh chữ ký lên — OK cho CA (xem dongDauChuKyVaoPdf_)
        const pdfBytesU8CA = guiGasBytesSangUint8Array_(DriveApp.getFileById(docId).getBlob().getBytes());
        const pdfBytesDaVeXongCA = await dongDauChuKyVaoPdf_(pdfBytesU8CA, viTri, chuKyBlobCA, new Date(), tenNguoiKyCA);
        pdfHienTai = Utilities.newBlob(pdfBytesDaVeXongCA, MimeType.PDF, "tmp_truoc_ky_so.pdf");
      } else {
        pdfHienTai = DriveApp.getFileById(docId).getAs(MimeType.PDF);
      }
      const ketQua = NhaCungCapCA_.guiYeuCauKyCA_(thongTinCa.nhaCungCap, thongTinCa, pdfHienTai);
      if (!ketQua || !ketQua.xong || !ketQua.pdfDaKyBase64) {
        throw new Error("Nhà cung cấp CA không trả về PDF đã ký (transactionId: " + (ketQua && ketQua.transactionId) + ")");
      }

      const now = new Date();
      const thoiGianKy = Utilities.formatDate(now, "GMT+7", "dd/MM/yyyy HH:mm");
      const pdfBytesMoi = Utilities.base64Decode(ketQua.pdfDaKyBase64);
      const props = PropertiesService.getScriptProperties();
      const folderCuoi = DriveApp.getFolderById(props.getProperty('GBTT_FOLDER_ID'));
      const tenFileMoi = "DaKySo_" + String(dongYC.row[4] || "SV").replace(/\s+/g, "_") + "_" + now.getTime() + ".pdf";
      const pdfBlobMoi = Utilities.newBlob(pdfBytesMoi, MimeType.PDF, tenFileMoi);
      const pdfFileMoi = folderCuoi.createFile(pdfBlobMoi);
      pdfFileMoi.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      sheetBuoc.getRange(dongBuocIndex + 1, 7).setValue("DA_KY");                             // cột G
      sheetBuoc.getRange(dongBuocIndex + 1, 8).setValue(thoiGianKy);                          // cột H
      sheetBuoc.getRange(dongBuocIndex + 1, 12).setValue("DA_KY");                            // cột L = TRANG_THAI_CA
      sheetBuoc.getRange(dongBuocIndex + 1, 13).setValue(String(ketQua.transactionId || "")); // cột M = CA_TRANSACTION_ID

      sheetYeuCau.getRange(dongYC.rowIndex, 11).setValue("HOAN_THANH");       // cột K
      sheetYeuCau.getRange(dongYC.rowIndex, 12).setValue(0);                  // cột L
      sheetYeuCau.getRange(dongYC.rowIndex, 14).setValue(pdfFileMoi.getUrl()); // cột N
      sheetYeuCau.getRange(dongYC.rowIndex, 15).setValue(pdfFileMoi.getId());  // cột O
      sheetYeuCau.getRange(dongYC.rowIndex, 16).setValue(thoiGianKy);          // cột P

      const nguoiTaoEmail = String(dongYC.row[7] || "").trim();
      const dsDaKyHtml = dataBuoc
        .filter(r => String(r[0]).trim() === maYeuCau)
        .sort((a, b) => (Number(a[1]) || 0) - (Number(b[1]) || 0))
        .map(r => "<li>" + String(r[3] || "") + " — " + String(r[5] || "") + (r[7] ? " (đã ký " + r[7] + ")" : "") + "</li>")
        .join("");
      const noiDungMail2 =
        "<p>Văn bản <b>" + String(dongYC.row[2] || "") + "</b> (sinh viên: " + String(dongYC.row[4] || "") + ") đã được ký số hoàn tất.</p>" +
        "<p>Danh sách đã ký:</p><ul>" + dsDaKyHtml + "</ul>" +
        "<p><a href=\"" + pdfFileMoi.getUrl() + "\">Xem/tải PDF hoàn chỉnh</a></p>";
      const ketQuaMail2 = guiEmailThongBao(nguoiTaoEmail, "Đã hoàn tất ký: " + String(dongYC.row[2] || ""), noiDungMail2);
      if (!ketQuaMail2.ok) {
        sheetYeuCau.getRange(dongYC.rowIndex, 17).setValue("Gửi mail hoàn tất thất bại: " + ketQuaMail2.lyDo); // cột Q
      }
    } catch (processErr) {
      // Y HỆT xuLyKyPdfNen: trả bước về DEN_LUOT (không kẹt mãi ở DANG_XU_LY) để người dùng
      // bấm "Ký" lại thử tiếp — ghi lý do vào GHI_CHU + TRANG_THAI_CA=LOI để còn tra được.
      sheetBuoc.getRange(dongBuocIndex + 1, 7).setValue("DEN_LUOT");
      sheetBuoc.getRange(dongBuocIndex + 1, 10).setValue("Lỗi ký số (CA): " + dienGiaiLoi_(processErr));
      sheetBuoc.getRange(dongBuocIndex + 1, 12).setValue("LOI"); // cột L = TRANG_THAI_CA
      console.error('xuLyKyCA lỗi: ' + dienGiaiLoi_(processErr));
    }
  } finally {
    lock.releaseLock();
  }
}

// Mở tab TaiKhoan (đã có sẵn, dùng cho đăng nhập — xem getUserInfoFromSheet) và tìm
// đúng dòng theo email. Dùng lại được cho cả đọc (layChuKyCuaToi) lẫn ghi
// (luuChuKyCuaToi/xoaChuKyCuaToi) — tránh viết trùng vòng lặp quét sheet 3 lần.
// Trả về null nếu không có tab TaiKhoan hoặc không tìm thấy tài khoản.
function timDongTaiKhoan_(email) {
  const accountSheetId = PropertiesService.getScriptProperties().getProperty('ACCOUNTS_SHEET_ID');
  const ss = SpreadsheetApp.openById(accountSheetId);
  const sheet = ss.getSheetByName("TaiKhoan");
  if (!sheet) return null;
  const emailChuan = chuanHoaEmail_(email);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (chuanHoaEmail_(data[i][0]) === emailChuan) {
      return { sheet: sheet, rowIndex: i + 1, row: data[i] }; // rowIndex 1-based cho getRange()
    }
  }
  return null;
}

// Đọc blob ảnh chữ ký cá nhân của 1 email (cột E = CHU_KY_FILE_ID trên TaiKhoan) —
// null nếu tài khoản chưa tải chữ ký lên hoặc file đã bị xoá ngoài ý muốn. Dùng ở
// action kyYeuCau (Bước 4-5) để đóng dấu vào Doc.
function layChuKyBlob_(email) {
  const dong = timDongTaiKhoan_(email);
  if (!dong || dong.row.length < 5) return null;
  const fileId = String(dong.row[4] || "").trim();
  if (!fileId) return null;
  try {
    return DriveApp.getFileById(fileId).getBlob();
  } catch (err) {
    return null;
  }
}

// ============================================================================
// ĐÃ THÊM (Ký điện tử Pha 2 — Bước 7 — lớp adapter CA)
// Chỉ 2 hàm dưới đây biết tới "chữ ký số" — kyYeuCau chỉ gọi NhaCungCapCA_, không biết
// gì về hãng cụ thể. Thêm 1 nhà cung cấp CA mới sau này = thêm 1 case trong switch, KHÔNG
// đụng gì tới kyYeuCau/state machine BuocKy/YeuCauKy.
// ============================================================================

// Đọc thông tin thuê bao CA của 1 email — cột G (index 6) = CA_NHA_CUNG_CAP, cột H
// (index 7) = CA_MA_THUE_BAO trên TaiKhoan (CẦN TỰ THÊM tay 2 cột này, đúng quy ước code
// không tự tạo cột — chỉ cần điền cho (những) tài khoản thật sự ký bằng CA, VD Hiệu
// trưởng). Trả về null nếu tài khoản chưa cấu hình — kyYeuCau dùng để báo lỗi rõ ràng
// thay vì âm thầm coi như ký ảnh.
function layThongTinCaThueBao_(email) {
  const dong = timDongTaiKhoan_(email);
  if (!dong || dong.row.length < 8) return null;
  const nhaCungCap = String(dong.row[6] || "").trim();
  const maThueBao = String(dong.row[7] || "").trim();
  if (!nhaCungCap || !maThueBao) return null;
  return { nhaCungCap: nhaCungCap, maThueBao: maThueBao };
}

// Lớp adapter chữ ký số (CA). ĐÃ CÀI ĐẶT VNPT SmartCA (2026-09-09) — nhưng KHÔNG gọi thẳng
// API VNPT từ đây: việc lắp signature_value (VNPT trả về) vào đúng cấu trúc CMS/PAdES của
// PDF đòi hỏi thao tác mật mã (ASN.1/CMS) mà Apps Script không có công cụ hỗ trợ và VNPT chỉ
// phát hành thư viện làm sẵn cho Java/.NET (không có bản JS) — xem "PHÁT HIỆN QUAN TRỌNG" +
// "ĐÃ CHỐT hướng đi" trong kế hoạch. Việc đó được tách hẳn ra 1 dịch vụ Cloud Run Node.js
// riêng (thư mục ca-sign-service/, ĐÃ tự kiểm chứng đúng bằng openssl + Foxit Reader thật) —
// guiYeuCauKyCA_ ở đây chỉ gọi HTTP sang dịch vụ đó.
// Ký CA LUÔN BẤT ĐỒNG BỘ (người ký cần xác nhận trên app SmartCA, có thể mất vài giây tới
// vài phút) — nhưng KHÁC thiết kế ban đầu (gửi đi / tra cứu sau, 2 lượt gọi riêng từ GAS):
// ca-sign-service/POST /sign đã tự polling xong xuôi BÊN TRONG chính nó (gọi get_certificate
// -> sign -> tự lặp lại tra cứu status cho tới khi thuê bao xác nhận xong hoặc hết hạn) rồi
// mới trả lời — nên với GAS, đây là ĐÚNG 1 lệnh gọi HTTP DUY NHẤT (có thể treo tới ~90 giây
// chờ VNPT), không phải nhiều lượt polling từ phía GAS nữa. Vì vậy guiYeuCauKyCA_ dưới đây
// trả thẳng luôn kết quả CUỐI CÙNG (xong:true kèm PDF đã ký) — traCuuTrangThaiKyCA_ giữ lại
// trong interface cho ĐÚNG THIẾT KẾ ADAPTER (phòng nhà cung cấp khác sau này cần polling thật
// từ phía GAS) nhưng KHÔNG dùng tới cho VNPT_SMARTCA.
// LƯU Ý RỦI RO CHƯA KIỂM CHỨNG: 1 lệnh UrlFetchApp.fetch() treo tới ~90 giây — TRIGGER 1-lần
// (nơi hàm này được gọi, xem xuLyKyCA) có ngân sách thực thi 6 phút nên KHÔNG phải vấn đề ở
// phía Apps Script; nhưng CHƯA xác nhận được UrlFetchApp tự nó có giới hạn ngắn hơn cho 1 lượt
// gọi ra ngoài hay không (tài liệu Google không ghi rõ số cụ thể) — nếu gặp lỗi timeout khi
// test thật, hướng khắc phục: tách ca-sign-service thành 2 endpoint /sign/start (nhanh, chỉ
// gửi yêu cầu) + /sign/status (poll từng lượt ngắn), khớp lại đúng thiết kế "gửi đi/tra cứu
// sau" ban đầu — CHƯA cần làm ngay, chỉ làm nếu thực tế đo được là cần.
const NhaCungCapCA_ = {
  // Gửi 1 file PDF đi ký số cho 1 thuê bao — với VNPT_SMARTCA, hàm này BLOCK cho tới khi
  // xong hẳn (ca-sign-service tự polling nội bộ) rồi trả về {transactionId, xong:true,
  // pdfDaKyBase64, serialNumber}. Ném lỗi (throw) nếu gửi/ký thất bại — caller (xuLyKyCA) tự
  // bắt lỗi, trả bước về DEN_LUOT.
  guiYeuCauKyCA_: function (nhaCungCap, thongTinThueBao, pdfBlob) {
    switch (String(nhaCungCap || "").trim().toUpperCase()) {
      case 'VNPT_SMARTCA':
        return kyVnptSmartCa_(thongTinThueBao, pdfBlob);
      default:
        throw new Error("Chưa hỗ trợ nhà cung cấp chữ ký số: " + nhaCungCap);
    }
  },
  // Tra cứu trạng thái 1 giao dịch đã gửi — CHƯA dùng tới cho VNPT_SMARTCA (xem chú thích
  // phía trên: ca-sign-service đã tự polling xong bên trong guiYeuCauKyCA_ rồi). Giữ lại cho
  // đúng thiết kế adapter, phòng nhà cung cấp khác sau này cần polling thật từ phía GAS.
  traCuuTrangThaiKyCA_: function (nhaCungCap, transactionId) {
    switch (String(nhaCungCap || "").trim().toUpperCase()) {
      case 'VNPT_SMARTCA':
        throw new Error("VNPT_SMARTCA không dùng traCuuTrangThaiKyCA_ — guiYeuCauKyCA_ đã tự chờ xong xuôi (xem chú thích ở NhaCungCapCA_)");
      default:
        throw new Error("Chưa hỗ trợ nhà cung cấp chữ ký số: " + nhaCungCap);
    }
  }
};

// Gọi sang ca-sign-service (Cloud Run) để lắp chữ ký VNPT SmartCA thật vào PDF. Cần 5 Script
// Property (Admin tự thêm 1 lần, KHÔNG có trong code — đúng quy ước bảo mật của dự án):
//   CA_SIGN_SERVICE_URL    — URL dịch vụ Cloud Run, VD https://ca-sign-service-xxx.run.app
//   CA_SIGN_SERVICE_SECRET — đúng giá trị SIGNING_SECRET lúc deploy Cloud Run (header
//                            X-Signing-Secret, chống ai đó gọi thẳng URL Cloud Run từ ngoài)
//   VNPT_SP_ID / VNPT_SP_PASSWORD — định danh đối tác VNPT-IT cấp (KHÔNG phải mật khẩu cá
//                            nhân của thuê bao ký — đây là tài khoản CHUNG của cả trường)
//   VNPT_ENVIRONMENT       — 'uat' (mặc định, môi trường thử nghiệm) hoặc 'production'
function kyVnptSmartCa_(thongTinThueBao, pdfBlob) {
  const props = PropertiesService.getScriptProperties();
  const url = String(props.getProperty('CA_SIGN_SERVICE_URL') || '').trim();
  const secret = String(props.getProperty('CA_SIGN_SERVICE_SECRET') || '').trim();
  const spId = String(props.getProperty('VNPT_SP_ID') || '').trim();
  const spPassword = String(props.getProperty('VNPT_SP_PASSWORD') || '').trim();
  const environment = String(props.getProperty('VNPT_ENVIRONMENT') || 'uat').trim();
  if (!url || !secret) throw new Error("Chưa cấu hình CA_SIGN_SERVICE_URL/CA_SIGN_SERVICE_SECRET (Script Properties)");
  if (!spId || !spPassword) throw new Error("Chưa cấu hình VNPT_SP_ID/VNPT_SP_PASSWORD (Script Properties)");
  if (!thongTinThueBao || !thongTinThueBao.maThueBao) throw new Error("Thiếu mã thuê bao SmartCA (CA_MA_THUE_BAO)");

  const docId = 'DOC_' + Utilities.getUuid();
  const payload = {
    pdfBase64: Utilities.base64Encode(pdfBlob.getBytes()),
    spId: spId,
    spPassword: spPassword,
    userId: thongTinThueBao.maThueBao,
    docId: docId,
    transactionDesc: 'Ky dien tu van ban - He thong tuyen sinh',
    environment: environment,
    maxWaitMs: 90000
  };
  const resp = UrlFetchApp.fetch(url.replace(/\/+$/, '') + '/sign', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Signing-Secret': secret },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const httpCode = resp.getResponseCode();
  let body = null;
  try { body = JSON.parse(resp.getContentText()); } catch (parseErr) { body = null; }

  if (httpCode !== 200 || !body || !body.success) {
    const lyDo = (body && body.message) || resp.getContentText().slice(0, 300) || ('HTTP ' + httpCode);
    const maLoi = body && body.code;
    if (maLoi === 'NO_CERTIFICATE') {
      throw new Error("Thuê bao chưa có chứng thư SmartCA nào đang hoạt động (kiểm tra lại trên app SmartCA): " + lyDo);
    }
    if (maLoi === 'CONFIRM_TIMEOUT') {
      throw new Error("Hết thời gian chờ xác nhận trên app SmartCA (90 giây) — vui lòng bấm Ký lại rồi xác nhận nhanh hơn: " + lyDo);
    }
    throw new Error("ca-sign-service báo lỗi (HTTP " + httpCode + (maLoi ? ", " + maLoi : "") + "): " + lyDo);
  }

  return {
    transactionId: body.transactionId || docId,
    xong: true,
    pdfDaKyBase64: body.signedPdfBase64,
    serialNumber: body.serialNumber
  };
}

// ============================================================================
// ĐÃ THÊM (theo yêu cầu — Khối 3 "Chữ ký số (CA)" ở Hồ sơ cá nhân): trước đây việc gắn
// CA_NHA_CUNG_CAP/CA_MA_THUE_BAO cho 1 tài khoản HOÀN TOÀN thủ công — Admin tự mở Sheet gõ
// tay, không có gì đảm bảo mã thuê bao gõ vào là ĐÚNG và THẬT SỰ có chứng thư đang hoạt động
// (gõ sai 1 số là chỉ phát hiện ra lúc ký thật, có thể vài tháng sau). Nhóm hàm dưới đây cho
// người dùng tự "kết nối" CA của MÌNH ngay tại Hồ sơ cá nhân — nhưng KHÔNG lưu thẳng dữ liệu
// họ gõ: bắt buộc xác thực THẬT với nhà cung cấp trước (gọi ca-sign-service/check-certificate
// — endpoint MỚI, CHỈ tra cứu chứng thư, không ký/không gửi thông báo xác nhận nào tới điện
// thoại thuê bao, khác hẳn /sign) — chỉ lưu khi nhà cung cấp xác nhận có ít nhất 1 chứng thư
// đang hoạt động. Cùng nguyên tắc adapter với NhaCungCapCA_/guiYeuCauKyCA_ ở trên: thêm nhà
// cung cấp mới sau này = thêm 1 case, không đụng gì tới hdPost_ketNoiChuKySo.
// ============================================================================

function xacThucChungThuCA_(nhaCungCap, maThueBao) {
  switch (String(nhaCungCap || "").trim().toUpperCase()) {
    case 'VNPT_SMARTCA':
      return kiemTraChungThuVnptSmartCa_(maThueBao);
    default:
      throw new Error("Chưa hỗ trợ xác thực nhà cung cấp chữ ký số: " + nhaCungCap);
  }
}

// Gọi ca-sign-service/check-certificate (KHÔNG ký, chỉ tra cứu) — dùng đúng lại 4 Script
// Property đã có sẵn cho việc ký thật (CA_SIGN_SERVICE_URL/CA_SIGN_SERVICE_SECRET/
// VNPT_SP_ID/VNPT_SP_PASSWORD, xem kyVnptSmartCa_ ở trên), không cần cấu hình thêm gì mới.
function kiemTraChungThuVnptSmartCa_(maThueBao) {
  const props = PropertiesService.getScriptProperties();
  const url = String(props.getProperty('CA_SIGN_SERVICE_URL') || '').trim();
  const secret = String(props.getProperty('CA_SIGN_SERVICE_SECRET') || '').trim();
  const spId = String(props.getProperty('VNPT_SP_ID') || '').trim();
  const spPassword = String(props.getProperty('VNPT_SP_PASSWORD') || '').trim();
  const environment = String(props.getProperty('VNPT_ENVIRONMENT') || 'uat').trim();
  if (!url || !secret) throw new Error("Chưa cấu hình CA_SIGN_SERVICE_URL/CA_SIGN_SERVICE_SECRET (Script Properties)");
  if (!spId || !spPassword) throw new Error("Chưa cấu hình VNPT_SP_ID/VNPT_SP_PASSWORD (Script Properties)");
  if (!maThueBao) throw new Error("Thiếu mã thuê bao SmartCA");

  const resp = UrlFetchApp.fetch(url.replace(/\/+$/, '') + '/check-certificate', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Signing-Secret': secret },
    payload: JSON.stringify({ spId: spId, spPassword: spPassword, userId: maThueBao, environment: environment }),
    muteHttpExceptions: true
  });
  const httpCode = resp.getResponseCode();
  let body = null;
  try { body = JSON.parse(resp.getContentText()); } catch (parseErr) { body = null; }

  if (httpCode !== 200 || !body || !body.success) {
    const lyDo = (body && body.message) || resp.getContentText().slice(0, 300) || ('HTTP ' + httpCode);
    const maLoi = body && body.code;
    if (maLoi === 'NO_CERTIFICATE') {
      throw new Error("Mã thuê bao này chưa có chứng thư số SmartCA nào đang hoạt động — kiểm tra lại trên app SmartCA rồi thử lại.");
    }
    throw new Error("ca-sign-service báo lỗi (HTTP " + httpCode + (maLoi ? ", " + maLoi : "") + "): " + lyDo);
  }
  return { serialNumber: body.serialNumber || '', tenChuSoHuu: body.tenChuSoHuu || '' };
}

// GET: đọc thông tin CA của CHÍNH người đang đăng nhập (chỉ trả lại cái gì ĐÃ LƯU, không tự
// gọi VNPT lại mỗi lần tải trang Hồ sơ cá nhân — muốn xác thực lại thì bấm "Kết nối" lại).
function hdGet_layThongTinCaCuaToi(e) {
  const g = requireAuth(e.parameter, []);
  if (!g.ok) return g.resp;
  const info = layThongTinCaThueBao_(g.userInfo.email);
  return responseJSON(200, "Thành công", info
    ? { coCA: true, nhaCungCap: info.nhaCungCap, maThueBao: info.maThueBao }
    : { coCA: false, nhaCungCap: '', maThueBao: '' });
}

// POST: người dùng tự nhập nhà cung cấp + mã thuê bao — XÁC THỰC THẬT trước, chỉ lưu khi
// nhà cung cấp xác nhận hợp lệ.
function hdPost_ketNoiChuKySo(e, ss) {
  const g = requireAuth(e.parameter, []);
  if (!g.ok) return g.resp;
  try {
    const data = JSON.parse(e.parameter.data || '{}');
    const nhaCungCap = String(data.nhaCungCap || '').trim();
    const maThueBao = String(data.maThueBao || '').trim();
    if (!nhaCungCap || !maThueBao) return responseJSON(400, "Thiếu nhà cung cấp hoặc mã thuê bao", null);

    let ketQuaXacThuc;
    try {
      ketQuaXacThuc = xacThucChungThuCA_(nhaCungCap, maThueBao);
    } catch (errXacThuc) {
      // ĐÃ THÊM: trả lỗi ngay ở đây, KHÔNG ghi gì vào TaiKhoan — xác thực thất bại thì
      // không có gì để lưu, tránh Admin/người dùng tưởng đã kết nối xong.
      return responseJSON(400, "Không xác thực được với nhà cung cấp: " + errXacThuc.message, null);
    }

    const dong = timDongTaiKhoan_(g.userInfo.email);
    if (!dong) return responseJSON(404, "Không tìm thấy tài khoản " + g.userInfo.email + " trong sheet TaiKhoan", null);
    if (dong.sheet.getLastColumn() < 8) {
      return responseJSON(400, "Sheet TaiKhoan chưa có đủ cột CA_NHA_CUNG_CAP (G)/CA_MA_THUE_BAO (H) — liên hệ Admin bổ sung 2 cột này trước khi dùng chức năng chữ ký số.", null);
    }
    dong.sheet.getRange(dong.rowIndex, 7).setValue(nhaCungCap); // cột G
    dong.sheet.getRange(dong.rowIndex, 8).setValue(maThueBao); // cột H

    return responseJSON(200, "Đã kết nối chữ ký số thành công", {
      serialNumber: ketQuaXacThuc.serialNumber || '',
      tenChuSoHuu: ketQuaXacThuc.tenChuSoHuu || ''
    });
  } catch (err) {
    return responseJSON(500, "Lỗi kết nối chữ ký số: " + dienGiaiLoi_(err), null);
  }
}

// POST: huỷ kết nối CA của CHÍNH người đang đăng nhập — chỉ xoá trắng cột G/H, KHÔNG đụng
// tới ảnh chữ ký thường (cột E/F, xem hdPost_xoaChuKyCuaToi).
function hdPost_xoaCaCuaToi(e, ss) {
  const g = requireAuth(e.parameter, []);
  if (!g.ok) return g.resp;
  try {
    const dong = timDongTaiKhoan_(g.userInfo.email);
    if (!dong) return responseJSON(404, "Không tìm thấy tài khoản " + g.userInfo.email + " trong sheet TaiKhoan", null);
    if (dong.sheet.getLastColumn() < 8) return responseJSON(200, "Không có chữ ký số để xoá", { daXoa: true });
    dong.sheet.getRange(dong.rowIndex, 7, 1, 2).clearContent(); // xoá trắng cột G+H
    return responseJSON(200, "Đã huỷ kết nối chữ ký số", { daXoa: true });
  } catch (err) {
    return responseJSON(500, "Lỗi huỷ kết nối chữ ký số: " + dienGiaiLoi_(err), null);
  }
}

// ĐÃ THÊM (Ký điện tử Pha 1 — Bước 6): kênh thông báo EMAIL đầu tiên của cả dự án —
// trước đây chỉ có Google Chat (guiTinNhanGoogleChat ở trên). KHÔNG BAO GIỜ throw lỗi
// ra ngoài — nếu gửi mail hỏng thì chữ ký/trạng thái đã ghi vào Sheet RỒI, không thể
// (và không nên) rollback chỉ vì mail lỗi; caller tự ghi lại lyDo vào cột GHI_CHU nếu
// cần, vẫn coi hành động chính (ký/tạo yêu cầu) là THÀNH CÔNG.
// ĐÃ SỬA (theo yêu cầu — gửi mail dưới địa chỉ phụ "Gửi thư dưới dạng"/Send As, tránh lộ
// email thật của tài khoản đang chạy script): đổi MailApp.sendEmail() -> GmailApp.sendEmail()
// vì CHỈ GmailApp hỗ trợ tham số "from" — bắt buộc địa chỉ đó đã được xác minh trong Gmail
// (Cài đặt > Tài khoản và Nhập > "Gửi thư dưới dạng", cùng tài khoản Google đang đứng tên
// chạy script này) thì mới gửi đúng dưới tên đó; nếu CHƯA xác minh, Gmail âm thầm bỏ qua
// "from" và tự gửi bằng địa chỉ thật (KHÔNG báo lỗi gì) — nên nếu vẫn thấy mail đến từ địa
// chỉ thật sau khi đổi, việc đầu tiên cần kiểm là xác minh "Gửi thư dưới dạng" đã HOÀN TẤT
// (bấm link xác nhận gửi tới hộp thư phụ) hay còn đang ở trạng thái chờ xác nhận.
// EMAIL_GUI_DUOI_TEN lấy từ Script Properties (đổi được không cần deploy lại code), có sẵn
// giá trị mặc định thinh.nguyen@pxu.edu.vn theo yêu cầu nếu Admin chưa tự cấu hình Property
// này (không phải secret nên không cần dấu XOÁ TRƯỚC KHI COMMIT như GEMINI_API_KEY/WEBHOOK_GCHAT).
function guiEmailThongBao(nguoiNhan, tieuDe, noiDungHtml) {
  try {
    if (!nguoiNhan) return { ok: false, lyDo: "Thiếu địa chỉ email người nhận" };
    // MailApp/GmailApp dùng CHUNG 1 quota gửi email/ngày (100 với Gmail thường, 1500 với
    // Workspace) — kiểm trước để trả lý do rõ ràng thay vì để GmailApp.sendEmail ném lỗi
    // chung chung. Vẫn gọi qua MailApp.getRemainingDailyQuota() vì GmailApp không có hàm
    // tương đương riêng.
    if (MailApp.getRemainingDailyQuota() <= 0) return { ok: false, lyDo: "Đã hết quota gửi email trong ngày hôm nay" };
    const emailGuiDuoiTen = String(PropertiesService.getScriptProperties().getProperty('EMAIL_GUI_DUOI_TEN') || "thinh.nguyen@pxu.edu.vn").trim();
    GmailApp.sendEmail(nguoiNhan, tieuDe, "", {
      htmlBody: noiDungHtml,
      name: "Hệ thống Quản lý sinh viên — Ký điện tử",
      from: emailGuiDuoiTen
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, lyDo: err.toString() };
  }
}

// Dựng link dẫn thẳng người ký vào trang "Hồ sơ chờ ký" trên frontend — dùng property
// APP_URL (URL frontend đã deploy, KHÔNG phải URL Web App GAS). Trả "" nếu chưa cấu
// hình APP_URL, để email vẫn gửi được (chỉ thiếu link bấm nhanh) thay vì lỗi cả email.
function layLinkChoKy_() {
  const appUrl = String(PropertiesService.getScriptProperties().getProperty('APP_URL') || "").trim();
  if (!appUrl) return "";
  return appUrl.replace(/\/$/, "") + "/#/ho-so-cho-ky";
}

// ===============================================
// ĐÃ THÊM — KÝ ĐIỆN TỬ PHA 2 (Bước 4): nhắc email định kỳ cho bước đang DEN_LUOT quá lâu
// chưa ký. KHÔNG phải action doGet/doPost — đây là hàm chạy theo TIME TRIGGER (cài đặt 1
// lần bằng thietLapTriggerNhacKy() bên dưới), nên không có request/response HTTP nào cả.
// ===============================================

// Cột "thời gian" trong các sheet Ký điện tử đôi khi bị chính Google Sheets TỰ ĐỘNG diễn
// giải thành giá trị Date thật (tuỳ định dạng cột đang áp cho ô đó), đôi khi vẫn giữ
// nguyên dạng CHUỖI "dd/MM/yyyy HH:mm" y hệt lúc Utilities.formatDate ghi vào — các nơi
// khác trong file này (vd layDanhSachChoToiKy/layLichSuKyCuaToi) đã phải xử lý cả 2 khả
// năng khi HIỂN THỊ, ở đây cần xử lý cả 2 khả năng khi TÍNH TOÁN (số mili-giây) nên tách
// riêng 1 helper dùng chung, không viết trùng logic parse ở nhacNhoKyDinhKy(). Trả về
// null nếu ô trống/không đọc được — caller phải tự bỏ qua dòng đó thay vì báo nhắc nhầm.
function layThoiDiemMs_(giaTri) {
  if (giaTri instanceof Date) return giaTri.getTime();
  const m = String(giaTri || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!m) return null;
  // Chuỗi được ghi theo giờ "GMT+7" (xem Utilities.formatDate ở các nơi ghi cột này) —
  // dựng lại Date theo ĐÚNG các con số đó thay vì new Date(chuỗi) mặc định (cách hiểu phụ
  // thuộc định dạng/locale, không đáng tin). Chấp nhận sai lệch nhỏ nếu timezone dự án
  // Apps Script không đúng GMT+7 — đây là ngưỡng nhắc nhở mềm, không phải mốc pháp lý.
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5])).getTime();
}

// Quét toàn bộ BuocKy đang DEN_LUOT, gửi lại email nhắc nếu đã quá SO_NGAY_NHAC_KY ngày
// kể từ lần gửi mail gần nhất cho ĐÚNG bước đó (cột I = THOI_GIAN_GUI_MAIL) — nếu cột đó
// còn trống (lần gửi mail đầu tiên lúc tạo yêu cầu không ghi lại được do taoYeuCauKyGBTT
// cố ý không khoá LockService khi chạy hàng loạt, xem chú thích ở đó) thì lùi về
// YeuCauKy.THOI_GIAN_TAO làm mốc thay thế. Bỏ qua các yêu cầu đã DA_HUY/BI_TU_CHOI/
// HOAN_THANH (chỉ còn TRANG_THAI=DANG_KY mới cần nhắc). Trả về số email đã nhắc thành
// công — để xem kết quả ngay khi CHẠY TAY thử hàm này trong trình soạn thảo Apps Script
// (Execution log sẽ in ra giá trị return).
function nhacNhoKyDinhKy() {
  const sheetBuoc = laySheetKySo_("BuocKy");
  const sheetYeuCau = laySheetKySo_("YeuCauKy");
  if (!sheetBuoc || !sheetYeuCau) return 0; // chưa cấu hình đủ sheet — im lặng bỏ qua, hàm này chạy tự động không có ai để báo lỗi

  const soNgay = Number(PropertiesService.getScriptProperties().getProperty('SO_NGAY_NHAC_KY')) || 3; // mặc định 3 ngày nếu chưa cấu hình Script Property

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (lockErr) {
    return 0; // đang có lượt ký/từ chối/thu hồi khác chạy — bỏ qua lượt quét này, trigger ngày mai tự chạy lại, không cần báo lỗi cho ai
  }

  try {
    const dataBuoc = sheetBuoc.getDataRange().getValues();
    const dataYeuCau = sheetYeuCau.getDataRange().getValues();
    const mapYeuCau = {};
    for (let i = 1; i < dataYeuCau.length; i++) mapYeuCau[String(dataYeuCau[i][0]).trim()] = dataYeuCau[i];

    const nowMs = Date.now();
    const linkChoKy = layLinkChoKy_();
    let soDaNhac = 0;

    for (let i = 1; i < dataBuoc.length; i++) {
      const row = dataBuoc[i];
      if (String(row[6] || "").trim() !== "DEN_LUOT") continue;
      const maYeuCau = String(row[0]).trim();
      const yc = mapYeuCau[maYeuCau];
      if (!yc) continue; // dữ liệu mồ côi (hiếm) — bỏ qua thay vì làm hỏng cả lượt quét
      if (String(yc[10] || "").trim() !== "DANG_KY") continue; // đã DA_HUY/BI_TU_CHOI/HOAN_THANH — không còn gì để nhắc

      const mocMs = layThoiDiemMs_(row[8]) ?? layThoiDiemMs_(yc[9]); // ưu tiên THOI_GIAN_GUI_MAIL của bước, lùi về THOI_GIAN_TAO của yêu cầu
      if (mocMs === null) continue; // không đọc được mốc thời gian nào — bỏ qua an toàn thay vì nhắc nhầm

      const soNgayDaTroi = (nowMs - mocMs) / (24 * 60 * 60 * 1000);
      if (soNgayDaTroi < soNgay) continue;

      const email = String(row[4] || "").trim();
      if (!email) continue;
      const ten = String(row[5] || "") || email;
      const tenChucDanh = String(row[3] || "");

      const noiDungMail =
        "<p>Chào " + ten + ",</p>" +
        "<p>Nhắc bạn: văn bản <b>" + String(yc[2] || "") + "</b> (sinh viên: " + String(yc[4] || "") + ") vẫn đang chờ bạn ký với vai trò " +
        "<b>" + tenChucDanh + "</b> — đã " + Math.floor(soNgayDaTroi) + " ngày.</p>" +
        (linkChoKy ? "<p><a href=\"" + linkChoKy + "\">Bấm vào đây để xem và ký</a></p>" : "<p>Vào menu tài khoản → \"Hồ sơ chờ ký\" trên hệ thống để ký.</p>");
      const ketQua = guiEmailThongBao(email, "[Nhắc ký] " + String(yc[2] || ""), noiDungMail);
      if (ketQua.ok) {
        sheetBuoc.getRange(i + 1, 9).setValue(new Date()); // cột I = THOI_GIAN_GUI_MAIL — cập nhật mốc để lần quét sau tính lại từ đây, tránh nhắc dồn dập mỗi ngày
        soDaNhac++;
      }
      // Gửi thất bại (vd hết quota) thì bỏ qua êm, không ghi GHI_CHU — trigger chạy lại
      // ngày mai sẽ tự thử lại đúng dòng này vì mốc thời gian chưa được cập nhật.
    }
    return soDaNhac;
  } finally {
    lock.releaseLock();
  }
}

// CHẠY TAY ĐÚNG 1 LẦN: mở project Apps Script → thanh công cụ trên cùng, ô chọn hàm →
// chọn "thietLapTriggerNhacKy" → bấm Run (▷) → lần đầu sẽ xin cấp quyền, bấm cho phép.
// Cài xong 1 trigger chạy nhacNhoKyDinhKy() mỗi ngày 1 lần (khoảng 7h sáng theo timezone
// dự án — đổi giờ ở atHour() nếu muốn). KHÔNG chạy lại hàm này thêm lần nữa — mỗi lần
// chạy tạo THÊM 1 trigger mới (gửi nhắc trùng nhiều lần/ngày) chứ không thay thế trigger
// cũ; nếu lỡ chạy nhầm, vào biểu tượng đồng hồ "Trình kích hoạt" (Triggers) ở menu bên
// trái trình soạn thảo để xoá bớt trigger thừa. Đây KHÔNG phải action doGet/doPost và
// KHÔNG tự cài khi deploy — Apps Script không có cơ chế "chạy code lúc deploy", phải gọi
// tay đúng 1 lần như thế này.
function thietLapTriggerNhacKy() {
  ScriptApp.newTrigger('nhacNhoKyDinhKy')
    .timeBased()
    .everyDays(1)
    .atHour(7)
    .create();
}

// ============================================================================
// ĐÃ THÊM (2026-09-10) — Thân xử lý các action Ký điện tử, tách ra từ doGet/doPost
// (Quanlysv.gs) để dispatcher gọn hơn. Tên hàm: hdGet_<action>/hdPost_<action> khớp đúng
// tên action gốc phía frontend — HÀNH VI GIỮ NGUYÊN 100% so với trước khi tách.
// ============================================================================

function hdGet_layChuKyCuaToi(e) {
        const g = requireAuth(e.parameter, []);
        if (!g.ok) return g.resp;
        try {
          const dong = timDongTaiKhoan_(g.userInfo.email);
          if (!dong) return responseJSON(404, "Không tìm thấy tài khoản " + g.userInfo.email + " trong sheet TaiKhoan", null);
          const fileId = dong.row.length >= 5 ? String(dong.row[4] || "").trim() : "";
          if (!fileId) {
            return responseJSON(200, "Thành công", { coChuKy: false, anhBase64: null, mimeType: null, capNhat: "" });
          }
          const blob = DriveApp.getFileById(fileId).getBlob();
          const capNhatRaw = dong.row.length >= 6 ? dong.row[5] : "";
          const capNhat = capNhatRaw instanceof Date ? Utilities.formatDate(capNhatRaw, "GMT+7", "dd/MM/yyyy HH:mm") : String(capNhatRaw || "");
          return responseJSON(200, "Thành công", {
            coChuKy: true,
            anhBase64: Utilities.base64Encode(blob.getBytes()),
            mimeType: blob.getContentType() || "image/png",
            capNhat: capNhat
          });
        } catch (err) {
          // File chữ ký đã bị xoá ngoài ý muốn (vd ai đó dọn tay trong Drive) -> coi
          // như chưa có chữ ký, không để lỗi 500 chặn cả trang Hồ sơ cá nhân.
          return responseJSON(200, "Thành công", { coChuKy: false, anhBase64: null, mimeType: null, capNhat: "" });
        }
      }

function hdGet_layCauHinhChucDanhKy(e) {
        // ĐÃ SỬA (theo yêu cầu — mở trang "Tạo yêu cầu ký số" cho TuyenSinh/CanBo): action
        // này vốn chỉ ThamDinh/Admin gọi được (dùng cho ChonNguoiKyModal ở trang Thẩm định),
        // nhưng TaoYeuCauKySoPage.jsx (/ho-so-ky-so) cũng gọi action này để lấy danh sách tài
        // khoản — giờ nới thêm TuyenSinh/CanBo để trang đó dùng được cho 2 vai trò mới.
        const g = requireAuth(e.parameter, ['ThamDinh', 'TuyenSinh', 'CanBo', 'Admin']);
        if (!g.ok) return g.resp;
        const loaiTaiLieu = String(e.parameter.loaiTaiLieu || 'GBTT').trim();

        // ĐÃ SỬA (Bước 4): chuyển phần đọc/lọc/sắp ChucDanhKy sang helper dùng chung
        // layChucDanhKy_() — taoYeuCauKyGBTT (action POST) cũng cần đọc đúng danh sách
        // này để xác thực dữ liệu người ký gửi lên từ client, tránh viết trùng 2 nơi.
        const dsChucDanh = layChucDanhKy_(loaiTaiLieu);
        if (dsChucDanh.length === 0 && !laySheetKySo_("ChucDanhKy")) {
          return responseJSON(404, "Chưa tạo sheet ChucDanhKy (xem hướng dẫn Bước 1 của tính năng Ký điện tử)", null);
        }

        const chucDanh = dsChucDanh.map(cd => {
          const dongTK = cd.emailMacDinh ? timDongTaiKhoan_(cd.emailMacDinh) : null;
          const tenMacDinh = dongTK ? String(dongTK.row[2] || "") : "";
          const coChuKyMacDinh = !!(dongTK && dongTK.row.length >= 5 && String(dongTK.row[4] || "").trim());
          return {
            maChucDanh: cd.maChucDanh,
            tenChucDanh: cd.tenChucDanh,
            emailMacDinh: cd.emailMacDinh,
            tenMacDinh: tenMacDinh,
            coChuKyMacDinh: coChuKyMacDinh,
            thuTu: cd.thuTu
          };
        });

        // Kèm luôn danh sách tài khoản để frontend dựng dropdown "đổi người ký" mà
        // không cần gọi thêm 1 API riêng (đúng thiết kế đã chốt ở kế hoạch mục 4-D).
        const sheetTK = laySheetKySo_("TaiKhoan");
        const danhSachTaiKhoan = [];
        if (sheetTK) {
          const dataTK = sheetTK.getDataRange().getValues();
          for (let i = 1; i < dataTK.length; i++) {
            const email = String(dataTK[i][0] || "").trim();
            if (!email) continue;
            danhSachTaiKhoan.push({
              email: email,
              ten: String(dataTK[i][2] || "") || email,
              coChuKy: dataTK[i].length >= 5 && !!String(dataTK[i][4] || "").trim()
            });
          }
        }

        return responseJSON(200, "Thành công", { chucDanh: chucDanh, danhSachTaiKhoan: danhSachTaiKhoan });
      }

function hdGet_layDanhSachChoToiKy(e) {
        const g = requireAuth(e.parameter, []);
        if (!g.ok) return g.resp;

        const sheetBuoc = laySheetKySo_("BuocKy");
        const sheetYeuCau = laySheetKySo_("YeuCauKy");
        if (!sheetBuoc || !sheetYeuCau) return responseJSON(404, "Chưa tạo đủ sheet BuocKy/YeuCauKy (xem hướng dẫn Bước 1)", null);

        const emailChuan = chuanHoaEmail_(g.userInfo.email);
        const coChuKy = !!layChuKyBlob_(emailChuan);
        // ĐÃ THÊM (Ký điện tử Pha 2 — Bước 7): cờ CẤP TÀI KHOẢN (không phải theo từng yêu
        // cầu) báo frontend biết người này có cấu hình chữ ký số (CA_NHA_CUNG_CAP/
        // CA_MA_THUE_BAO trên TaiKhoan) hay không — CHỈ khi true frontend mới hỏi "ký bằng
        // ảnh hay ký số" lúc bấm Ký (xem ChoKyPage.jsx); false thì giữ nguyên hành vi cũ,
        // không hỏi gì cả (tuyệt đại đa số tài khoản vẫn vậy).
        const coTheKyCA = !!layThongTinCaThueBao_(emailChuan);

        const dataBuoc = sheetBuoc.getDataRange().getValues();
        const dataYeuCau = sheetYeuCau.getDataRange().getValues();
        const mapYeuCau = {};
        for (let i = 1; i < dataYeuCau.length; i++) mapYeuCau[String(dataYeuCau[i][0]).trim()] = dataYeuCau[i];

        const danhSach = [];
        for (let i = 1; i < dataBuoc.length; i++) {
          const row = dataBuoc[i];
          if (chuanHoaEmail_(row[4]) !== emailChuan) continue;
          if (String(row[6] || "").trim() !== "DEN_LUOT") continue;
          const maYeuCau = String(row[0]).trim();
          const yc = mapYeuCau[maYeuCau];
          if (!yc) continue; // dữ liệu mồ côi (hiếm) — bỏ qua thay vì làm hỏng cả danh sách
          // ĐÃ THÊM (Ký điện tử Pha 2 — Bước 2): action tuChoiKy/huyYeuCauKy KHÔNG đổi
          // BuocKy.TRANG_THAI của bước đang DEN_LUOT (giữ nguyên để còn hiện trong lịch sử/
          // xem-lại) — chỉ đổi YeuCauKy.TRANG_THAI (cột K/index 10) sang BI_TU_CHOI/DA_HUY.
          // Không lọc theo yc[10] ở đây thì yêu cầu đã bị từ chối/thu hồi vẫn hiện nhầm trong
          // "chờ ký" của người đang giữ bước DEN_LUOT đó — phải chặn ở đây.
          if (String(yc[10] || "").trim() !== "DANG_KY") continue;

          const cacBuoc = [];
          for (let j = 1; j < dataBuoc.length; j++) {
            if (String(dataBuoc[j][0]).trim() !== maYeuCau) continue;
            const tgKy = dataBuoc[j][7];
            cacBuoc.push({
              thuTu: Number(dataBuoc[j][1]) || 0,
              tenChucDanh: String(dataBuoc[j][3] || ""),
              tenNguoiKy: String(dataBuoc[j][5] || ""),
              trangThai: String(dataBuoc[j][6] || ""),
              thoiGianKy: tgKy instanceof Date ? Utilities.formatDate(tgKy, "GMT+7", "dd/MM/yyyy HH:mm") : String(tgKy || "")
            });
          }
          cacBuoc.sort((a, b) => a.thuTu - b.thuTu);

          const tgTao = yc[9];
          danhSach.push({
            maYeuCau: maYeuCau,
            tieuDe: String(yc[2] || ""),
            hoTenSV: String(yc[4] || ""),
            nganh: String(yc[6] || ""),
            nguoiTaoTen: String(yc[8] || ""),
            thoiGianTao: tgTao instanceof Date ? Utilities.formatDate(tgTao, "GMT+7", "dd/MM/yyyy HH:mm") : String(tgTao || ""),
            // ĐÃ THÊM (Ký điện tử Pha 2 — Bước 3): cột R (index 17) = CHE_DO_KY — rỗng (yêu
            // cầu tạo trước khi có cột này) coi như TUAN_TU, đúng hành vi mặc định cũ.
            cheDoKy: String(yc[17] || "TUAN_TU").trim() || "TUAN_TU",
            cacBuoc: cacBuoc
          });
        }

        return responseJSON(200, "Thành công", { coChuKy: coChuKy, coTheKyCA: coTheKyCA, danhSach: danhSach });
      }

function hdGet_laySoLuongChoToiKy(e) {
        const g = requireAuth(e.parameter, []);
        if (!g.ok) return g.resp;
        const sheetBuoc = laySheetKySo_("BuocKy");
        if (!sheetBuoc) return responseJSON(200, "Thành công", { soLuong: 0 });
        const emailChuan = chuanHoaEmail_(g.userInfo.email);
        const data = sheetBuoc.getDataRange().getValues();
        // ĐÃ SỬA (Ký điện tử Pha 2 — Bước 2): trước đây chỉ đếm theo BuocKy.TRANG_THAI=
        // DEN_LUOT, không kiểm YeuCauKy — sau khi có tuChoiKy/huyYeuCauKy (đổi YeuCauKy.
        // TRANG_THAI sang BI_TU_CHOI/DA_HUY mà KHÔNG đụng tới BuocKy đang DEN_LUOT, xem chú
        // thích ở layDanhSachChoToiKy) badge sẽ đếm dư nếu không lọc thêm — cùng logic với
        // layDanhSachChoToiKy, chỉ tính khi YeuCauKy vẫn còn DANG_KY.
        const sheetYeuCau = laySheetKySo_("YeuCauKy");
        const mapTrangThaiYC = {};
        if (sheetYeuCau) {
          const dataYC = sheetYeuCau.getDataRange().getValues();
          for (let i = 1; i < dataYC.length; i++) mapTrangThaiYC[String(dataYC[i][0]).trim()] = String(dataYC[i][10] || "").trim();
        }
        let soLuong = 0;
        for (let i = 1; i < data.length; i++) {
          if (chuanHoaEmail_(data[i][4]) !== emailChuan) continue;
          if (String(data[i][6] || "").trim() !== "DEN_LUOT") continue;
          if (mapTrangThaiYC[String(data[i][0]).trim()] !== "DANG_KY") continue;
          soLuong++;
        }
        return responseJSON(200, "Thành công", { soLuong: soLuong });
      }

function hdGet_xemTruocYeuCauKy(e) {
        const g = requireAuth(e.parameter, []);
        if (!g.ok) return g.resp;
        const maYeuCau = String(e.parameter.maYeuCau || "").trim();
        if (!maYeuCau) return responseJSON(400, "Thiếu mã yêu cầu", null);

        const sheetYeuCau = laySheetKySo_("YeuCauKy");
        const sheetBuoc = laySheetKySo_("BuocKy");
        if (!sheetYeuCau || !sheetBuoc) return responseJSON(404, "Chưa tạo đủ sheet YeuCauKy/BuocKy (xem hướng dẫn Bước 1)", null);

        const dongYC = timDongYeuCau_(sheetYeuCau, maYeuCau);
        if (!dongYC) return responseJSON(404, "Không tìm thấy yêu cầu ký " + maYeuCau, null);

        // Kiểm quyền theo DỮ LIỆU (không theo Role): người tạo yêu cầu, hoặc có mặt
        // trong chuỗi ký (BuocKy) của chính yêu cầu này, hoặc Admin.
        const emailChuan = chuanHoaEmail_(g.userInfo.email);
        const laAdmin = (g.userInfo.roles || []).indexOf('Admin') !== -1;
        const laNguoiTao = chuanHoaEmail_(dongYC.row[7]) === emailChuan;
        let coMatTrongChuoiKy = false;
        const dataBuoc = sheetBuoc.getDataRange().getValues();
        for (let i = 1; i < dataBuoc.length; i++) {
          if (String(dataBuoc[i][0]).trim() === maYeuCau && chuanHoaEmail_(dataBuoc[i][4]) === emailChuan) { coMatTrongChuoiKy = true; break; }
        }
        if (!laAdmin && !laNguoiTao && !coMatTrongChuoiKy) return responseJSON(403, "Bạn không có quyền xem yêu cầu ký này", null);

        try {
          const trangThai = String(dongYC.row[10] || "");
          const pdfUrlCuoi = String(dongYC.row[13] || "");
          // ĐÃ THÊM (tài liệu tham khảo — Bước 6, mục còn thiếu đã ghi trong kế hoạch): cột T
          // (index 19) = TAI_LIEU_THAM_KHAO_JSON — CẦN TỰ THÊM tay tiêu đề cột này trên
          // YeuCauKy (đúng quy ước). Chỉ luồng taoYeuCauKyTuFile ghi cột này — mọi yêu cầu
          // khác (GBTT/taoYeuCauKy_) không có cột này/để trống thì parse ra mảng rỗng, không
          // lỗi gì. Trả về CẢ 2 nhánh bên dưới (đang ký dở/đã hoàn tất) để modal xem trước
          // luôn hiện được link, không phụ thuộc trạng thái yêu cầu.
          let dsTaiLieuThamKhaoXem = [];
          try { dsTaiLieuThamKhaoXem = JSON.parse(String(dongYC.row[19] || "[]")) || []; } catch (parseErr) { dsTaiLieuThamKhaoXem = []; }
          if (trangThai === "HOAN_THANH" && pdfUrlCuoi) {
            return responseJSON(200, "Thành công", { tenFile: String(dongYC.row[2] || ""), trangThai: trangThai, pdfUrlCuoiCung: pdfUrlCuoi, pdfBase64: null, taiLieuThamKhao: dsTaiLieuThamKhaoXem });
          }
          const docId = String(dongYC.row[12] || "");
          if (!docId) return responseJSON(500, "Yêu cầu ký thiếu DOC_ID", null);
          const pdfBlob = DriveApp.getFileById(docId).getAs(MimeType.PDF);
          return responseJSON(200, "Thành công", {
            tenFile: String(dongYC.row[2] || "GiayBaoTrungTuyen"),
            trangThai: trangThai,
            pdfBase64: Utilities.base64Encode(pdfBlob.getBytes()),
            pdfUrlCuoiCung: null,
            taiLieuThamKhao: dsTaiLieuThamKhaoXem
          });
        } catch (err) {
          return responseJSON(500, "Lỗi tạo bản xem trước: " + dienGiaiLoi_(err), null);
        }
      }

function hdGet_kiemTraTrangThaiKy(e) {
        const g = requireAuth(e.parameter, []);
        if (!g.ok) return g.resp;
        const maYeuCau = String(e.parameter.maYeuCau || "").trim();
        if (!maYeuCau) return responseJSON(400, "Thiếu mã yêu cầu", null);

        const sheetYeuCau = laySheetKySo_("YeuCauKy");
        const sheetBuoc = laySheetKySo_("BuocKy");
        if (!sheetYeuCau || !sheetBuoc) return responseJSON(404, "Chưa tạo đủ sheet YeuCauKy/BuocKy (xem hướng dẫn Bước 1)", null);

        const dongYC = timDongYeuCau_(sheetYeuCau, maYeuCau);
        if (!dongYC) return responseJSON(404, "Không tìm thấy yêu cầu ký " + maYeuCau, null);

        const emailChuan = chuanHoaEmail_(g.userInfo.email);
        const dataBuoc = sheetBuoc.getDataRange().getValues();
        let trangThaiBuocCuaToi = "";
        let ghiChuBuoc = "";
        for (let i = 1; i < dataBuoc.length; i++) {
          if (String(dataBuoc[i][0]).trim() === maYeuCau && chuanHoaEmail_(dataBuoc[i][4]) === emailChuan) {
            trangThaiBuocCuaToi = String(dataBuoc[i][6] || "").trim();
            ghiChuBuoc = String(dataBuoc[i][9] || "").trim();
            break;
          }
        }
        if (!trangThaiBuocCuaToi) return responseJSON(403, "Bạn không có bước ký nào trong yêu cầu này", null);

        const trangThaiYC = String(dongYC.row[10] || "");
        const hoanTat = trangThaiYC === "HOAN_THANH";
        return responseJSON(200, "success", {
          trangThaiBuoc: trangThaiBuocCuaToi,
          ghiChu: ghiChuBuoc,
          hoanTat: hoanTat,
          pdfUrl: hoanTat ? String(dongYC.row[13] || "") : null
        });
      }

function hdGet_layLichSuKyCuaToi(e) {
        const g = requireAuth(e.parameter, []);
        if (!g.ok) return g.resp;

        const sheetYeuCau = laySheetKySo_("YeuCauKy");
        const sheetBuoc = laySheetKySo_("BuocKy");
        if (!sheetYeuCau || !sheetBuoc) return responseJSON(404, "Chưa tạo đủ sheet YeuCauKy/BuocKy (xem hướng dẫn Bước 1)", null);

        const emailChuan = chuanHoaEmail_(g.userInfo.email);
        const dataYeuCau = sheetYeuCau.getDataRange().getValues();
        const dataBuoc = sheetBuoc.getDataRange().getValues();

        const maLienQuan = new Set();
        for (let i = 1; i < dataBuoc.length; i++) {
          if (chuanHoaEmail_(dataBuoc[i][4]) === emailChuan) maLienQuan.add(String(dataBuoc[i][0]).trim());
        }

        const danhSach = [];
        for (let i = 1; i < dataYeuCau.length; i++) {
          const row = dataYeuCau[i];
          const maYeuCau = String(row[0]).trim();
          const laNguoiTao = chuanHoaEmail_(row[7]) === emailChuan;
          if (!maLienQuan.has(maYeuCau) && !laNguoiTao) continue;

          const cacBuoc = [];
          for (let j = 1; j < dataBuoc.length; j++) {
            if (String(dataBuoc[j][0]).trim() !== maYeuCau) continue;
            const tgKy = dataBuoc[j][7];
            cacBuoc.push({
              thuTu: Number(dataBuoc[j][1]) || 0,
              tenChucDanh: String(dataBuoc[j][3] || ""),
              tenNguoiKy: String(dataBuoc[j][5] || ""),
              trangThai: String(dataBuoc[j][6] || ""),
              thoiGianKy: tgKy instanceof Date ? Utilities.formatDate(tgKy, "GMT+7", "dd/MM/yyyy HH:mm") : String(tgKy || "")
            });
          }
          cacBuoc.sort((a, b) => a.thuTu - b.thuTu);

          const tgTao = row[9];
          danhSach.push({
            maYeuCau: maYeuCau,
            tieuDe: String(row[2] || ""),
            hoTenSV: String(row[4] || ""),
            nganh: String(row[6] || ""),
            nguoiTaoTen: String(row[8] || ""),
            thoiGianTao: tgTao instanceof Date ? Utilities.formatDate(tgTao, "GMT+7", "dd/MM/yyyy HH:mm") : String(tgTao || ""),
            trangThai: String(row[10] || ""),
            pdfUrl: String(row[13] || ""),
            // ĐÃ THÊM (Ký điện tử Pha 2 — Bước 3): xem chú thích ở layDanhSachChoToiKy.
            cheDoKy: String(row[17] || "TUAN_TU").trim() || "TUAN_TU",
            laNguoiTao: laNguoiTao,
            cacBuoc: cacBuoc
          });
        }
        // Mới nhất lên trước — dữ liệu luôn được appendRow ở CUỐI sheet nên đảo ngược
        // thứ tự dòng là đủ, không cần parse lại chuỗi ngày giờ để so sánh.
        danhSach.reverse();

        return responseJSON(200, "Thành công", { danhSach: danhSach });
      }

function hdPost_luuChuKyCuaToi(e, ss) {
      const g = requireAuth(e.parameter, []);
      if (!g.ok) return g.resp;
      try {
        const parsedData = JSON.parse(e.parameter.data);
        const anhBase64 = String(parsedData.anhBase64 || "");
        if (!anhBase64) return responseJSON(400, "Thiếu dữ liệu ảnh chữ ký", null);

        // Chặn ảnh quá lớn — base64 phình khoảng 4/3 lần so với nhị phân gốc, nên
        // ~2 triệu ký tự base64 tương ứng khoảng 1.5MB ảnh gốc.
        if (anhBase64.length > 2 * 1024 * 1024) {
          return responseJSON(400, "Ảnh chữ ký quá lớn (tối đa khoảng 1.5MB). Vui lòng chọn ảnh nhỏ hơn.", null);
        }

        const dong = timDongTaiKhoan_(g.userInfo.email);
        if (!dong) return responseJSON(404, "Không tìm thấy tài khoản " + g.userInfo.email + " trong sheet TaiKhoan", null);
        if (dong.sheet.getLastColumn() < 6) {
          return responseJSON(400, "Sheet TaiKhoan chưa có đủ cột CHU_KY_FILE_ID (E)/CHU_KY_CAP_NHAT (F) — liên hệ Admin bổ sung 2 cột này trước khi dùng chức năng chữ ký.", null);
        }

        const props = PropertiesService.getScriptProperties();
        const folderId = props.getProperty('CHUKY_FOLDER_ID');
        if (!folderId) return responseJSON(500, "Chưa cấu hình Script Property CHUKY_FOLDER_ID — liên hệ Admin.", null);
        const folder = DriveApp.getFolderById(folderId);

        // Xoá ảnh cũ (nếu có) trước khi lưu ảnh mới — tránh rác Drive tích tụ mỗi lần
        // người dùng đổi chữ ký.
        const fileIdCu = dong.row.length >= 5 ? String(dong.row[4] || "").trim() : "";
        if (fileIdCu) {
          try { DriveApp.getFileById(fileIdCu).setTrashed(true); } catch (delErr) { /* file cũ đã mất thì bỏ qua */ }
        }

        const mimeType = String(parsedData.mimeType || "image/png");
        const blob = Utilities.newBlob(Utilities.base64Decode(anhBase64), mimeType, "chuky_" + chuanHoaEmail_(g.userInfo.email) + ".png");
        const file = folder.createFile(blob);
        // KHÔNG setSharing — ảnh chữ ký cá nhân phải ở chế độ private, chỉ code GAS
        // (chạy dưới quyền chủ script) đọc được qua DriveApp.getFileById(), không lộ
        // ra link công khai như PDF biên nhận.

        const now = new Date();
        dong.sheet.getRange(dong.rowIndex, 5).setValue(file.getId()); // cột E
        dong.sheet.getRange(dong.rowIndex, 6).setValue(now); // cột F

        return responseJSON(200, "Đã lưu chữ ký cá nhân", {
          fileId: file.getId(),
          capNhat: Utilities.formatDate(now, "GMT+7", "dd/MM/yyyy HH:mm")
        });
      } catch (err) {
        return responseJSON(500, "Lỗi lưu chữ ký: " + dienGiaiLoi_(err), null);
      }
    }

function hdPost_xoaChuKyCuaToi(e, ss) {
      const g = requireAuth(e.parameter, []);
      if (!g.ok) return g.resp;
      try {
        const dong = timDongTaiKhoan_(g.userInfo.email);
        if (!dong) return responseJSON(404, "Không tìm thấy tài khoản " + g.userInfo.email + " trong sheet TaiKhoan", null);
        if (dong.sheet.getLastColumn() < 6) {
          return responseJSON(200, "Không có chữ ký để xoá", { daXoa: true });
        }
        const fileId = dong.row.length >= 5 ? String(dong.row[4] || "").trim() : "";
        if (fileId) {
          try { DriveApp.getFileById(fileId).setTrashed(true); } catch (delErr) { /* file đã mất thì bỏ qua, vẫn xoá tham chiếu trên Sheet */ }
        }
        dong.sheet.getRange(dong.rowIndex, 5, 1, 2).clearContent(); // xoá trắng cột E+F
        return responseJSON(200, "Đã xoá chữ ký cá nhân", { daXoa: true });
      } catch (err) {
        return responseJSON(500, "Lỗi xoá chữ ký: " + dienGiaiLoi_(err), null);
      }
    }

function hdPost_taoYeuCauKyGBTT(e, ss) {
      const g = requireAuth(e.parameter, ['ThamDinh', 'Admin']);
      if (!g.ok) return g.resp;

      const data = JSON.parse(e.parameter.data || '{}');
      const dsSinhVien = Array.isArray(data.sinhVien) ? data.sinhVien : [];
      const dsNguoiKyRaw = Array.isArray(data.nguoiKy) ? data.nguoiKy : [];
      // ĐÃ THÊM (Ký điện tử Pha 2 — Bước 3): chế độ ký CHUNG cho cả đợt xuất này — bất kỳ
      // giá trị nào khác "SONG_SONG" đều coi là TUAN_TU (giữ nguyên hành vi Pha 1), tránh
      // vỡ luồng nếu client gửi thiếu/sai field này (dữ liệu cũ từ trước khi có field này
      // cũng rơi vào nhánh mặc định TUAN_TU, không cần migrate gì).
      const cheDoKy = String(data.cheDoKy || "").trim() === "SONG_SONG" ? "SONG_SONG" : "TUAN_TU";

      if (dsSinhVien.length === 0) return responseJSON(400, "Không có sinh viên nào để xuất GBTT", null);
      if (dsSinhVien.length > 15) return responseJSON(400, "Chỉ được xuất tối đa 15 sinh viên/lần (giới hạn thời gian chạy của Apps Script) — vui lòng chia nhỏ đợt xuất.", null);

      // ĐÃ SỬA (Ký điện tử Pha 2 — Bước 5 — tổng quát hoá thêm loại văn bản khác GBTT):
      // phần "xác thực người ký khớp ChucDanhKy" + "mở mẫu Doc/thư mục" trước đây viết
      // thẳng ở đây, giờ tách ra 2 helper DÙNG CHUNG với action tổng quát taoYeuCauKy bên
      // dưới (xacThucNguoiKy_/layMauThuMuc_, xem chú thích đầy đủ tại nơi khai báo) — vẫn
      // gọi ĐÚNG 1 LẦN cho cả lô trước vòng lặp dsSinhVien (không phải 1 lần/sinh viên),
      // giữ nguyên hành vi gốc: lỗi cấu hình báo NGAY, không lặp lại N lần.
      let cauHinhChucDanh, dsNguoiKy, templateDoc, folder;
      try {
        const xacThuc = xacThucNguoiKy_('GBTT', dsNguoiKyRaw);
        cauHinhChucDanh = xacThuc.cauHinhChucDanh;
        dsNguoiKy = xacThuc.dsNguoiKy;
        const mauThuMuc = layMauThuMuc_('GBTT');
        templateDoc = mauThuMuc.templateDoc;
        folder = mauThuMuc.folder;
      } catch (chuanBiErr) {
        return responseJSON(maHttpTuLoiChuanBiKy_(chuanBiErr.message), chuanBiErr.message, null);
      }

      const sheetYeuCau = laySheetKySo_("YeuCauKy");
      const sheetBuoc = laySheetKySo_("BuocKy");
      if (!sheetYeuCau) return responseJSON(404, "Chưa tạo sheet YeuCauKy (xem hướng dẫn Bước 1)", null);
      if (!sheetBuoc) return responseJSON(404, "Chưa tạo sheet BuocKy (xem hướng dẫn Bước 1)", null);

      const now = new Date();

      // ĐÃ THÊM (theo yêu cầu — placeholder "Ngày xuất giấy báo" in nghiêng + "Tháng nhập
      // học" trong mẫu GBTT): 2 giá trị này áp dụng CHUNG cho CẢ ĐỢT xuất (không phải riêng
      // từng sinh viên) — người tạo yêu cầu chọn 1 lần trên modal "Xuất GBTT + chọn người
      // ký" (ChonNguoiKyModal, ThamDinhPage.jsx), gửi kèm data.ngayXuatGiayBao ('YYYY-MM-DD'
      // — <input type="date">) và data.thangNhapHoc ('YYYY-MM' — <input type="month">). Định
      // dạng hiển thị chốt theo yêu cầu: "ngày 08 tháng 09 năm 2026" (đệm số 0 cả ngày/tháng)
      // và "tháng 9 năm 2026" (không đệm số 0) — nếu mẫu Doc đã có sẵn chữ "tháng ... năm..."
      // xung quanh placeholder thì sửa lại cách ghép chuỗi thangNhapHocVN cho khớp, tránh
      // lặp chữ "tháng"/"năm" 2 lần.
      // LƯU Ý IN NGHIÊNG/IN ĐẬM: hoàn toàn do ĐỊNH DẠNG CÓ SẴN của bản thân placeholder
      // (VD {{NGAY_XUAT_GIAY_BAO}}) trong mẫu Doc quyết định — replaceText() giữ nguyên định
      // dạng ký tự đang có tại vị trí placeholder khi thay chuỗi, không cần thêm code gì ở
      // đây. Áp dụng y hệt cho MỌI placeholder khác muốn in đậm/in nghiêng: bôi đen TRỌN VẸN
      // cả cụm {{...}} (không bôi thiếu 1 đầu) rồi bấm Bold/Italic ngay trong Google Docs khi
      // soạn mẫu — không sửa gì bên code.
      // Mặc định "Ngày xuất giấy báo" = hôm nay nếu người tạo yêu cầu bỏ trống ô ngày trên
      // modal (ô này luôn có sẵn giá trị mặc định = hôm nay ở frontend rồi, nhánh dự phòng
      // ở đây chỉ để chắc chắn không lỡ ra placeholder rỗng nếu có gì bất thường).
      const isoNgayXuat = data.ngayXuatGiayBao || Utilities.formatDate(now, "GMT+7", "yyyy-MM-dd");
      let ngayXuatGiayBaoVN = "";
      {
        const mDate = String(isoNgayXuat).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (mDate) ngayXuatGiayBaoVN = `ngày ${mDate[3]} tháng ${mDate[2]} năm ${mDate[1]}`;
      }
      let thangNhapHocVN = "";
      if (data.thangNhapHoc) {
        const mMonth = String(data.thangNhapHoc).match(/^(\d{4})-(\d{2})$/);
        if (mMonth) thangNhapHocVN = `tháng ${parseInt(mMonth[2], 10)} năm ${mMonth[1]}`;
      }
      // ĐÃ THÊM (theo yêu cầu — placeholder "Số quyết định" trong mẫu GBTT): CHUNG cho CẢ
      // ĐỢT xuất này, giống hệt NGAY_XUAT_GIAY_BAO/THANG_NHAP_HOC ở trên — người tạo yêu cầu
      // gõ tự do dạng "xx/năm" (VD "01/2026", "012/2025") ngay trên modal, KHÔNG cần chuyển
      // đổi định dạng gì thêm ở đây (khác 2 mốc ngày/tháng phía trên phải ghép thành câu
      // tiếng Việt) — in thẳng nguyên văn vào placeholder.
      const soQuyetDinh = String(data.soQuyetDinh || "").trim();

      // Mỗi sinh viên bọc try/catch RIÊNG — 1 hồ sơ lỗi (vd thiếu placeholder lạ trong
      // Doc mẫu) không được làm hỏng cả lô, đúng tinh thần action 'trungTuyen' cũ.
      // ĐÃ SỬA (Bước 5): phần copy mẫu/điền {{...}}/ghi sheet/gửi mail "đến lượt ký" trước
      // đây viết thẳng trong vòng lặp này, giờ dùng chung taoYeuCauKy_ (xem chú thích đầy
      // đủ tại nơi khai báo) — GIỐNG HỆT hành vi cũ, chỉ khác chỗ đặt code.
      const results = dsSinhVien.map(sv => {
        const hoTen = String(sv.hoTen || "").trim();
        try {
          const noiDung = {
            HO_TEN: hoTen,
            NGAY_SINH: String(sv.ngaySinh || ""),
            // ĐÃ THÊM (theo yêu cầu — bổ sung placeholder Nơi sinh/Giới tính): rỗng nếu hồ sơ
            // chưa có dữ liệu (VD nhập trước khi có 2 cột này trên Goc01) — không chặn xuất
            // GBTT, chỉ hiện trống tại đúng vị trí placeholder trong mẫu.
            GIOI_TINH: String(sv.gioiTinh || ""),
            NOI_SINH: String(sv.noiSinh || ""),
            CAN_CUOC: String(sv.canCuoc || ""),
            MA_SINH_VIEN: String(sv.maSinhVien || ""),
            NGANH: String(sv.nganh || ""),
            KHOA: String(sv.khoa || ""),
            HE_DAO_TAO: String(sv.heDaoTao || ""),
            HINH_THUC_DAO_TAO: String(sv.hinhThucDaoTao || ""),
            DIEM_TRUNG_TUYEN: String(sv.diemTrungTuyen || ""),
            // ĐÃ THÊM (theo yêu cầu bổ sung): điểm từng môn của ĐÚNG tổ hợp đạt cao nhất
            // (bestCombo) — tên môn + điểm đã dựng sẵn bên ThamDinhPage.jsx
            // (buildGbttPayload, dùng calculateScores + DICT_TO_HOP/SUBJ_MAP). Rỗng nếu
            // hồ sơ không thuộc nhánh "Tốt nghiệp THPT" (CĐ/ĐH/Trung cấp dùng ĐTB, không
            // có khái niệm tổ hợp môn).
            MON1_TEN: String(sv.mon1Ten || ""), MON1_DIEM: String(sv.mon1Diem ?? ""),
            MON2_TEN: String(sv.mon2Ten || ""), MON2_DIEM: String(sv.mon2Diem ?? ""),
            MON3_TEN: String(sv.mon3Ten || ""), MON3_DIEM: String(sv.mon3Diem ?? ""),
            // ĐÃ THÊM: điểm ưu tiên khu vực/đối tượng RIÊNG (đã quy đổi đúng tỉ lệ áp
            // dụng thật — xem chú thích diemUuTienKhuVuc/diemUuTienDoiTuong trong
            // thamDinhHelpers.js phía frontend) — cộng lại đúng bằng phần ưu tiên đã
            // tính vào DIEM_TRUNG_TUYEN, không lệch số khi in ra GBTT.
            DIEM_UU_TIEN_KHU_VUC: String(sv.diemUuTienKhuVuc ?? ""),
            DIEM_UU_TIEN_DOI_TUONG: String(sv.diemUuTienDoiTuong ?? ""),
            // ĐÃ THÊM (theo phản hồi — thiếu sót từ trước, quên đưa vào mẫu GBTT):
            // Điểm phỏng vấn (chỉ có giá trị với hồ sơ Học bạ có phỏng vấn, xem
            // buildGbttPayload bên ThamDinhPage.jsx) — rỗng nếu hồ sơ không có phỏng vấn.
            DIEM_PHONG_VAN: String(sv.diemPhongVan ?? ""),
            NGAY: Utilities.formatDate(now, "GMT+7", "dd/MM/yyyy"),
            NAM: Utilities.formatDate(now, "GMT+7", "yyyy"),
            // ĐÃ THÊM: xem chú thích đầy đủ tại chỗ tính ngayXuatGiayBaoVN/thangNhapHocVN ở
            // trên — GIỐNG NHAU cho mọi sinh viên trong cùng 1 đợt xuất này.
            NGAY_XUAT_GIAY_BAO: ngayXuatGiayBaoVN,
            THANG_NHAP_HOC: thangNhapHocVN,
            // ĐÃ THÊM: xem chú thích đầy đủ tại chỗ tính soQuyetDinh ở trên — GIỐNG NHAU
            // cho mọi sinh viên trong cùng 1 đợt xuất này.
            SO_QUYET_DINH: soQuyetDinh
          };

          const ketQua = taoYeuCauKy_(
            'GBTT', "Giấy báo trúng tuyển - " + hoTen, noiDung,
            { maSinhVien: sv.maSinhVien, hoTen: hoTen, canCuoc: sv.canCuoc, nganh: sv.nganh },
            cauHinhChucDanh, dsNguoiKy, cheDoKy, templateDoc, folder, g, now
          );
          return { hoTen: hoTen, maYeuCau: ketQua.maYeuCau, status: "success", message: ketQua.message };
        } catch (err) {
          return { hoTen: hoTen, status: "error", message: dienGiaiLoi_(err) };
        }
      });

      return responseJSON(200, "success", { results: results });
    }

function hdPost_taoYeuCauKy(e, ss) {
      const g = requireAuth(e.parameter, ['ThamDinh', 'Admin']);
      if (!g.ok) return g.resp;

      const data = JSON.parse(e.parameter.data || '{}');
      const loaiTaiLieu = String(data.loaiTaiLieu || "").trim().toUpperCase();
      if (!loaiTaiLieu) return responseJSON(400, "Thiếu loại tài liệu (loaiTaiLieu)", null);
      if (loaiTaiLieu === 'GBTT') return responseJSON(400, "GBTT dùng action riêng \"taoYeuCauKyGBTT\" (xử lý theo lô sinh viên) — action này dành cho loại văn bản KHÁC GBTT.", null);

      const tieuDe = String(data.tieuDe || "").trim() || loaiTaiLieu;
      const noiDungPlaceholder = (data.noiDung && typeof data.noiDung === 'object' && !Array.isArray(data.noiDung)) ? data.noiDung : {};
      const thongTinLienQuan = (data.thongTinLienQuan && typeof data.thongTinLienQuan === 'object' && !Array.isArray(data.thongTinLienQuan)) ? data.thongTinLienQuan : {};
      const dsNguoiKyRaw = Array.isArray(data.nguoiKy) ? data.nguoiKy : [];
      const cheDoKy = String(data.cheDoKy || "").trim() === "SONG_SONG" ? "SONG_SONG" : "TUAN_TU";

      try {
        const xacThuc = xacThucNguoiKy_(loaiTaiLieu, dsNguoiKyRaw);
        const mauThuMuc = layMauThuMuc_(loaiTaiLieu);
        const sheetYeuCauKt = laySheetKySo_("YeuCauKy");
        const sheetBuocKt = laySheetKySo_("BuocKy");
        if (!sheetYeuCauKt) return responseJSON(404, "Chưa tạo sheet YeuCauKy (xem hướng dẫn Bước 1)", null);
        if (!sheetBuocKt) return responseJSON(404, "Chưa tạo sheet BuocKy (xem hướng dẫn Bước 1)", null);
        const ketQua = taoYeuCauKy_(
          loaiTaiLieu, tieuDe, noiDungPlaceholder, thongTinLienQuan,
          xacThuc.cauHinhChucDanh, xacThuc.dsNguoiKy, cheDoKy, mauThuMuc.templateDoc, mauThuMuc.folder, g
        );
        return responseJSON(200, "success", ketQua);
      } catch (err) {
        return responseJSON(maHttpTuLoiChuanBiKy_(err.message), dienGiaiLoi_(err), null);
      }
    }

function hdPost_taoYeuCauKyTuFile(e, ss) {
      // ĐÃ SỬA (theo yêu cầu — mở trang "Tạo yêu cầu ký số" cho TuyenSinh/CanBo): trước đây
      // chỉ ThamDinh/Admin tạo được yêu cầu ký từ file tải lên, giờ nới thêm TuyenSinh/CanBo.
      const g = requireAuth(e.parameter, ['ThamDinh', 'TuyenSinh', 'CanBo', 'Admin']);
      if (!g.ok) return g.resp;

      const data = JSON.parse(e.parameter.data || '{}');
      const tieuDe = String(data.tieuDe || "").trim();
      if (!tieuDe) return responseJSON(400, "Thiếu tiêu đề văn bản", null);

      const mimeType = String(data.mimeType || "").trim().toLowerCase();
      const fileBase64 = String(data.fileBase64 || "");
      if (!fileBase64) return responseJSON(400, "Thiếu file tải lên (fileBase64)", null);
      if (mimeType !== "application/pdf") {
        return responseJSON(400, "Định dạng file chưa hỗ trợ — hiện CHỈ nhận file PDF. Nếu là file Word/Excel/ảnh, hãy lưu (Save As/Export/In ra PDF) trước khi tải lên.", null);
      }

      const dsNguoiKyRaw = Array.isArray(data.nguoiKy) ? data.nguoiKy : [];
      const cheDoKy = String(data.cheDoKy || "").trim() === "SONG_SONG" ? "SONG_SONG" : "TUAN_TU";
      const thongTinLienQuan = (data.thongTinLienQuan && typeof data.thongTinLienQuan === 'object' && !Array.isArray(data.thongTinLienQuan)) ? data.thongTinLienQuan : {};
      // ĐÃ THÊM (Ký điện tử Pha 2 — Bước 6, phần "tài liệu tham khảo/minh chứng" — mục còn
      // thiếu đã ghi trong kế hoạch): danh sách file ĐÍNH KÈM CHỈ ĐỂ XEM, KHÔNG ký lên — VD
      // hồ sơ gốc/minh chứng liên quan. Mỗi phần tử {tenFile, fileBase64, mimeType} — không
      // giới hạn định dạng (khác file để ký, bắt buộc PDF) vì các file này không đi qua
      // pdf-lib/dongDauChuKyVaoPdf_ ở đâu cả, chỉ lưu Drive + chia sẻ link xem.
      const dsTaiLieuThamKhaoRaw = Array.isArray(data.taiLieuThamKhao) ? data.taiLieuThamKhao : [];

      try {
        const dsNguoiKy = xacThucNguoiKyTuDo_(dsNguoiKyRaw);
        const dsViTri = xacThucViTriKy_(dsNguoiKy, JSON.stringify(data.viTriKyJson || []));

        const sheetYeuCauTf = laySheetKySo_("YeuCauKy");
        const sheetBuocTf = laySheetKySo_("BuocKy");
        if (!sheetYeuCauTf) return responseJSON(404, "Chưa tạo sheet YeuCauKy (xem hướng dẫn Bước 1)", null);
        if (!sheetBuocTf) return responseJSON(404, "Chưa tạo sheet BuocKy (xem hướng dẫn Bước 1)", null);

        // PDF sẵn — chỉ decode base64 rồi ghi thẳng vào Drive, KHÔNG cần pdf-lib/Uint8Array
        // ở bước này (Utilities.base64Decode() trả về đúng kiểu byte[] mà Utilities.newBlob()
        // cần — khác các chỗ đưa bytes vào API pdf-lib mới cần guiGasBytesSangUint8Array_).
        const pdfBytes = Utilities.base64Decode(fileBase64);

        const folderTf = layThuMucTuFile_();
        const tenFileLuu = String(data.tenFile || tieuDe).replace(/\s+/g, "_") + "_" + new Date().getTime() + ".pdf";
        const pdfFileTf = folderTf.createFile(Utilities.newBlob(pdfBytes, MimeType.PDF, tenFileLuu));

        // Lưu từng file tham khảo vào CÙNG thư mục, chia sẻ xem-được-bằng-link NGAY (giống
        // cách PDF cuối cùng được chia sẻ khi hoàn tất ở kyYeuCau) — đơn giản hơn nhiều so
        // với việc kiểm quyền Drive riêng cho từng người ký mỗi lần họ mở "Hồ sơ chờ ký"; các
        // file này vốn không nhạy cảm hơn PDF chính (đã cùng chia sẻ kiểu này khi ký xong).
        const dsTaiLieuThamKhao = [];
        dsTaiLieuThamKhaoRaw.forEach((tl, idxTl) => {
          const b64 = String((tl && tl.fileBase64) || "");
          if (!b64) return;
          const tenGoc = String((tl && tl.tenFile) || ("TaiLieu_" + (idxTl + 1)));
          const mimeTl = String((tl && tl.mimeType) || "application/octet-stream");
          try {
            const bytesTl = Utilities.base64Decode(b64);
            const fileTl = folderTf.createFile(Utilities.newBlob(bytesTl, mimeTl, tenGoc));
            fileTl.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            dsTaiLieuThamKhao.push({ tenFile: tenGoc, fileId: fileTl.getId(), url: fileTl.getUrl() });
          } catch (tlErr) {
            // Không chặn cả yêu cầu chỉ vì 1 file tham khảo lỗi (VD base64 hỏng) — bỏ qua,
            // người tạo tự nhận ra thiếu file trong danh sách trả về nếu cần.
          }
        });

        const maYeuCauTf = taoMaYeuCau_("TUFILE");
        const nowTf = new Date();
        const thoiGianTaoTf = Utilities.formatDate(nowTf, "GMT+7", "dd/MM/yyyy HH:mm");
        const ttTf = thongTinLienQuan;
        // Đúng 20 cột A..T — xem taoYeuCauKy_ để đối chiếu thứ tự A..S, thêm MỚI cột T =
        // TAI_LIEU_THAM_KHAO_JSON (CẦN TỰ THÊM tay tiêu đề cột này trên sheet YeuCauKy, đúng
        // quy ước) — taoYeuCauKy_/taoYeuCauKyGBTT KHÔNG ghi cột này (để trống là bình thường,
        // coi như "không có tài liệu tham khảo"). VI_TRI_KY_JSON (cột S) LUÔN có dữ liệu ở
        // đây (khác taoYeuCauKy_ luôn để trống).
        sheetYeuCauTf.appendRow([
          maYeuCauTf, "TUFILE", tieuDe, String(ttTf.maSinhVien || ""), String(ttTf.hoTen || ""),
          String(ttTf.canCuoc || ""), String(ttTf.nganh || ""), g.userInfo.email, g.userInfo.name || g.userInfo.email,
          thoiGianTaoTf, "DANG_KY", 1, pdfFileTf.getId(), "", "", "", "",
          cheDoKy, JSON.stringify(dsViTri), JSON.stringify(dsTaiLieuThamKhao)
        ]);
        dsNguoiKy.forEach((nk, idx) => {
          sheetBuocTf.appendRow([
            maYeuCauTf, idx + 1, nk.maChucDanh, nk.tenChucDanh, nk.email, nk.ten,
            (cheDoKy === "SONG_SONG" || idx === 0) ? "DEN_LUOT" : "CHO_TRUOC", "", "", ""
          ]);
        });

        // Sự kiện email "đến lượt ký" — Y HỆT đoạn cuối taoYeuCauKy_ (cố tình COPY, không
        // dùng chung hàm — xem lý do ở xuLyKyPdfNen: tách hẳn luồng Docs/PDF để không rủi ro
        // ảnh hưởng lẫn nhau khi sửa 1 trong 2 sau này).
        const nguoiCanBaoNgayTf = cheDoKy === "SONG_SONG" ? dsNguoiKy : [dsNguoiKy[0]];
        const linkChoKyTf = layLinkChoKy_();
        // ĐÃ THÊM (tài liệu tham khảo): chèn link tải các file tham khảo (nếu có) vào email
        // "đến lượt ký" — người ký thấy ngay minh chứng liên quan mà KHÔNG cần tìm ở đâu
        // khác; hoàn toàn không đổi gì nếu không có file tham khảo nào (dsTaiLieuThamKhao
        // rỗng), giữ nguyên nội dung mail cũ.
        const htmlTaiLieuThamKhaoTf = dsTaiLieuThamKhao.length > 0
          ? "<p>Tài liệu tham khảo/minh chứng đính kèm:</p><ul>" +
            dsTaiLieuThamKhao.map(tl => "<li><a href=\"" + tl.url + "\">" + tl.tenFile + "</a></li>").join("") +
            "</ul>"
          : "";
        const loiGuiMailTf = [];
        nguoiCanBaoNgayTf.forEach(nk => {
          const noiDungMailTf =
            "<p>Chào " + nk.ten + ",</p>" +
            "<p>Văn bản <b>" + tieuDe + "</b> đang chờ bạn ký với vai trò <b>" + nk.tenChucDanh + "</b>" +
            (cheDoKy === "SONG_SONG" ? " (ký song song — không cần đợi người khác ký trước)" : "") + ".</p>" +
            htmlTaiLieuThamKhaoTf +
            (linkChoKyTf ? "<p><a href=\"" + linkChoKyTf + "\">Bấm vào đây để xem và ký</a></p>" : "<p>Vào menu tài khoản → \"Hồ sơ chờ ký\" trên hệ thống để ký.</p>");
          const ketQuaMailTf = guiEmailThongBao(nk.email, "Đến lượt bạn ký: " + tieuDe, noiDungMailTf);
          if (!ketQuaMailTf.ok) loiGuiMailTf.push(nk.tenChucDanh + ": " + ketQuaMailTf.lyDo);
        });

        const nguoiKyDauTienTf = dsNguoiKy[0];
        return responseJSON(200, "success", {
          maYeuCau: maYeuCauTf,
          message: (cheDoKy === "SONG_SONG"
            ? "Đã tạo yêu cầu ký song song, đang chờ " + dsNguoiKy.length + " người ký."
            : "Đã tạo yêu cầu ký, đang chờ " + nguoiKyDauTienTf.tenChucDanh + " (" + nguoiKyDauTienTf.email + ") ký.")
            + (loiGuiMailTf.length > 0 ? " ⚠️ Gửi email thông báo thất bại (" + loiGuiMailTf.join("; ") + ") — người ký vẫn có thể tự vào \"Hồ sơ chờ ký\" để ký bình thường." : "")
        });
      } catch (err) {
        return responseJSON(maHttpTuLoiTaoTuFile_(err.message), dienGiaiLoi_(err), null);
      }
    }

function hdPost_kyYeuCau(e, ss) {
      const g = requireAuth(e.parameter, []);
      if (!g.ok) return g.resp;

      const data = JSON.parse(e.parameter.data || '{}');
      const maYeuCau = String(data.maYeuCau || "").trim();
      if (!maYeuCau) return responseJSON(400, "Thiếu mã yêu cầu", null);

      const lock = LockService.getScriptLock();
      try {
        lock.waitLock(15000);
      } catch (lockErr) {
        return responseJSON(429, "Hệ thống đang bận xử lý 1 lượt ký khác, vui lòng thử lại sau ít giây", null);
      }

      try {
        const sheetYeuCau = laySheetKySo_("YeuCauKy");
        const sheetBuoc = laySheetKySo_("BuocKy");
        if (!sheetYeuCau || !sheetBuoc) return responseJSON(404, "Chưa tạo đủ sheet YeuCauKy/BuocKy (xem hướng dẫn Bước 1)", null);

        const dongYC = timDongYeuCau_(sheetYeuCau, maYeuCau);
        if (!dongYC) return responseJSON(404, "Không tìm thấy yêu cầu ký " + maYeuCau, null);
        if (String(dongYC.row[10] || "") === "HOAN_THANH") return responseJSON(400, "Yêu cầu ký này đã hoàn tất trước đó", null);

        const emailChuan = chuanHoaEmail_(g.userInfo.email);
        const dataBuoc = sheetBuoc.getDataRange().getValues();
        let dongBuocIndex = -1;
        for (let i = 1; i < dataBuoc.length; i++) {
          if (String(dataBuoc[i][0]).trim() === maYeuCau && chuanHoaEmail_(dataBuoc[i][4]) === emailChuan && String(dataBuoc[i][6] || "").trim() === "DEN_LUOT") {
            dongBuocIndex = i; break;
          }
        }
        // Đây CHÍNH LÀ toàn bộ cơ chế phân quyền ký — không dựa vào Role, dựa vào việc
        // có đúng 1 dòng BuocKy đang DEN_LUOT khớp email người gọi hay không.
        if (dongBuocIndex === -1) return responseJSON(403, "Chưa tới lượt bạn ký (hoặc yêu cầu này không dành cho bạn)", null);

        const maChucDanh = String(dataBuoc[dongBuocIndex][2] || "").trim();
        // ĐÃ THÊM (theo yêu cầu — dòng mới "Signed by: <tên tài khoản>" trong Doc): tên hiển
        // thị của người đang ký, lấy từ chính cột "ten" đã ghi khi tạo yêu cầu (cột F/index 5
        // của BuocKy — xem dsNguoiKy.forEach(...sheetBuoc.appendRow...) ở taoYeuCauKyGBTT),
        // fallback về tên tài khoản Google đang đăng nhập nếu vì lý do gì đó cột này trống.
        const tenNguoiDangKy = String(dataBuoc[dongBuocIndex][5] || g.userInfo.name || "").trim();
        const docId = String(dongYC.row[12] || "");
        if (!docId) return responseJSON(500, "Yêu cầu ký thiếu DOC_ID", null);

        // ĐÃ SỬA (Ký điện tử Pha 2 — Bước 7): tính TRƯỚC "còn ai khác chưa ký không" — bản
        // gốc (Bước 3) tính SAU khi đã đóng dấu ảnh, nhưng nhánh CA mới thêm bên dưới cần
        // biết điều này TRƯỚC khi quyết định có cho ký CA hay không (PAdES chỉ hợp lệ nếu là
        // bước ký CUỐI CÙNG — xem "Quyết định kiến trúc" trong kế hoạch). Bước đang xét luôn
        // bị loại khỏi buocChuaKy (i === dongBuocIndex) nên tính trước hay sau hoàn toàn
        // tương đương với bản gốc — KHÔNG đổi hành vi của nhánh ảnh bên dưới.
        const buocChuaKy = [];
        const buocChoTruoc = [];
        for (let i = 1; i < dataBuoc.length; i++) {
          if (i === dongBuocIndex || String(dataBuoc[i][0]).trim() !== maYeuCau) continue;
          const tt = String(dataBuoc[i][6] || "").trim();
          if (tt === "DA_KY") continue;
          buocChuaKy.push(i);
          if (tt === "CHO_TRUOC") buocChoTruoc.push({ index: i, thuTu: Number(dataBuoc[i][1]) || 0 });
        }

        // ĐÃ SỬA THỨ TỰ (2026-09-09, sửa BUG THẬT phát hiện khi test): bản trước kiểm tra
        // viTriKyRaw (nhánh pdf-lib/ảnh) TRƯỚC RỒI MỚI tính laBuocCA — nghĩa là BẤT KỲ yêu
        // cầu nào có VI_TRI_KY_JSON (tức MỌI yêu cầu tạo qua "/ho-so-ky-so" — action
        // taoYeuCauKyTuFile LUÔN bắt buộc có toạ độ ký, xem xacThucViTriKy_) sẽ return sớm ở
        // nhánh ảnh, KHÔNG BAO GIỜ chạm được tới nhánh CA bên dưới dù người ký chọn "Ký số"
        // trên giao diện — nhánh CA (dù đã viết đúng ở Bước 7/8) thực chất KHÔNG THỂ nào được
        // gọi tới với loại yêu cầu này. Giờ tính `laBuocCA` TRƯỚC, và nhánh ảnh chỉ nhận
        // (`viTriKyRaw && !laBuocCA`) — nếu người ký chọn CA thì bỏ qua hẳn nhánh ảnh, đi
        // thẳng xuống nhánh CA bên dưới, bất kể có VI_TRI_KY_JSON hay không.
        // LƯU Ý (chưa xử lý, ghi nhận làm sau): nhánh CA hiện KHÔNG vẽ appearance (hình ảnh/
        // khung ký nhìn thấy được) tại vị trí đã chọn trong VI_TRI_KY_JSON cho luồng tải-file-
        // tự-do — ca-sign-service tạo 1 widget ẩn (Rect [0,0,0,0], xem lib/placeholder.js) —
        // chỉ có lớp chữ ký số MẬT MÃ, không có dấu hiệu trực quan trên trang. Với luồng GBTT/
        // Docs-based (viTriKyRaw rỗng) không bị ảnh hưởng gì (không có khái niệm "khung ký"
        // để vẽ). Nếu sau này cần CA cũng hiện khung ký nhìn thấy được cho luồng tải-file-tự-
        // do, cần ghép thêm bước dongDauChuKyVaoPdf_ (vẽ appearance TRƯỚC) rồi mới gọi CA (ký
        // số PHẢI là thao tác cuối cùng) — chưa làm, không chặn việc test luồng CA hiện tại.
        const phuongThucKyYeuCau = String(data.phuongThucKy || "ANH").trim().toUpperCase();
        const laBuocCA = phuongThucKyYeuCau === "CA";

        // ĐÃ THÊM (Ký điện tử Pha 2 — Bước 6, luồng PDF/pdf-lib): nếu yêu cầu này có
        // VI_TRI_KY_JSON (cột S/index 18 của YeuCauKy) — nghĩa là được tạo qua luồng tải
        // file tự do (taoYeuCauKyTuFile) — thì DOC_ID Ở ĐÂY ĐÃ LÀ 1 FILE PDF THẬT rồi (không
        // phải Google Doc), và việc đóng dấu ẢNH (khi người ký KHÔNG chọn CA) BẮT BUỘC dùng
        // pdf-lib (xem "Quyết định kiến trúc" trong kế hoạch — pdf-lib chỉ chạy đúng bên
        // trong 1 lượt thực thi ASYNC THẬT SỰ, KHÔNG chạy được ngay trong doPost đồng bộ này
        // — đã kiểm chứng qua nhiều vòng test riêng trước khi viết đoạn này: "chờ bận" thất
        // bại, doPost/doGet khai báo async bị Apps Script từ chối thẳng, chỉ trigger 1-lần
        // mới đợi được Promise). Nhánh này KHÔNG đóng dấu ngay — chỉ đánh dấu bước hiện tại
        // là "đang xử lý" (DANG_XU_LY, KHÁC DA_KY), đăng ký 1 trigger để việc đóng dấu PDF
        // thật chạy trong 1 lượt thực thi RIÊNG (xem xuLyKyPdfNen), rồi TRẢ VỀ NGAY —
        // frontend tự polling action kiemTraTrangThaiKy cho tới khi bước này chuyển hẳn sang
        // DA_KY (hoặc quay lại DEN_LUOT nếu xử lý nền lỗi). GBTT KHÔNG đi vào nhánh này
        // (VI_TRI_KY_JSON luôn để trống với GBTT), nên hành vi GBTT hiện tại GIỮ NGUYÊN 100%.
        const viTriKyRaw = String(dongYC.row[18] || "").trim();
        if (viTriKyRaw && !laBuocCA) {
          sheetBuoc.getRange(dongBuocIndex + 1, 7).setValue("DANG_XU_LY"); // cột G
          datLichXuLyKyPdfNen_(maYeuCau, emailChuan);
          return responseJSON(200, "success", {
            hoanTat: false,
            dangXuLy: true,
            thongBao: "Đang xử lý chữ ký, vui lòng đợi trong giây lát (có thể mất tới khoảng 1 phút) rồi kiểm tra lại."
          });
        }

        if (laBuocCA) {
          // Ràng buộc BẮT BUỘC — chữ ký số PAdES chỉ hợp lệ nếu là thao tác CUỐI CÙNG trên
          // file (bất kỳ chỉnh sửa/đóng dấu nào sau đó sẽ làm hỏng tính hợp lệ), nên không
          // cho ký CA nếu còn ai khác (bước ảnh) chưa ký trước bước này.
          if (buocChuaKy.length > 0) {
            return responseJSON(400, "Chữ ký số (CA) phải là bước ký CUỐI CÙNG trong chuỗi — hiện còn " + buocChuaKy.length + " người khác chưa ký. Vui lòng đợi mọi người ký ảnh xong rồi mới tới lượt ký số.", null);
          }
          const thongTinCa = layThongTinCaThueBao_(emailChuan);
          if (!thongTinCa) {
            return responseJSON(400, "Tài khoản của bạn chưa được cấu hình thông tin chữ ký số — liên hệ Admin thêm CA_NHA_CUNG_CAP/CA_MA_THUE_BAO trên sheet TaiKhoan.", null);
          }
          // ĐÃ SỬA (2026-09-09, sau khi ca-sign-service triển khai xong): KHÔNG gọi
          // NhaCungCapCA_ trực tiếp ở đây nữa — 1 lượt ký CA thật (gọi sang ca-sign-service,
          // service đó tự chờ VNPT tới khi thuê bao xác nhận xong trên app SmartCA) có thể
          // mất tới ~90 giây, vượt xa thời gian hợp lý cho 1 request đồng bộ của doPost — ĐÚNG
          // BÀI HỌC đã rút ra ở luồng pdf-lib (Bước 6: Web App KHÔNG đợi được việc lâu, phải
          // tách qua trigger 1-lần mới đợi được). Đánh dấu "đang xử lý" + đăng ký trigger
          // (xuLyKyCA, TÁI DÙNG đúng cơ chế CacheService như datLichXuLyKyPdfNen_) rồi trả về
          // NGAY — frontend tự polling kiemTraTrangThaiKy y hệt luồng pdf-lib, KHÔNG cần đổi
          // gì thêm ở đó hay ở ChoKyPage.jsx (đã có sẵn từ Bước 6).
          sheetBuoc.getRange(dongBuocIndex + 1, 7).setValue("DANG_XU_LY");             // cột G
          sheetBuoc.getRange(dongBuocIndex + 1, 12).setValue("DANG_GUI_YEU_CAU_KY");   // cột L = TRANG_THAI_CA (CẦN TỰ THÊM cột)
          datLichXuLyKyCA_(maYeuCau, emailChuan);
          return responseJSON(200, "success", {
            hoanTat: false,
            dangXuLy: true,
            thongBao: "Đã gửi yêu cầu ký số — vui lòng xác nhận trên ứng dụng chữ ký số (VD: SmartCA) rồi đợi hệ thống tự kiểm tra lại (có thể mất tới khoảng 1-2 phút)."
          });
        }

        const chuKyBlob = layChuKyBlob_(emailChuan);
        if (!chuKyBlob) return responseJSON(400, "Bạn chưa tải chữ ký cá nhân lên — vào Hồ sơ cá nhân để thêm chữ ký trước khi ký văn bản này.", null);

        const now = new Date();
        let doc;
        try {
          doc = DocumentApp.openById(docId);
        } catch (openErr) {
          return responseJSON(500, "Không mở được văn bản để ký: " + dienGiaiLoi_(openErr), null);
        }
        const daDong = dongDauChuKyVaoDoc_(doc, maChucDanh, chuKyBlob, now, tenNguoiDangKy);
        doc.saveAndClose();
        if (!daDong) {
          return responseJSON(500, "Không tìm thấy vị trí ký (chức danh " + maChucDanh + ") trong văn bản — mẫu Doc có thể thiếu placeholder {{CHUKY_" + maChucDanh + "}}. Hồ sơ CHƯA được đánh dấu đã ký.", null);
        }

        const thoiGianKy = Utilities.formatDate(now, "GMT+7", "dd/MM/yyyy HH:mm");
        sheetBuoc.getRange(dongBuocIndex + 1, 7).setValue("DA_KY");     // cột G
        sheetBuoc.getRange(dongBuocIndex + 1, 8).setValue(thoiGianKy); // cột H

        // ĐÃ SỬA (Ký điện tử Pha 2 — Bước 3): trước đây chỉ tìm bước CHO_TRUOC để suy ra
        // "còn ai chưa ký không" — ĐÚNG cho chế độ TUAN_TU (mọi bước chưa ký đều CHO_TRUOC,
        // trừ đúng 1 bước vừa ký) nhưng SAI cho SONG_SONG (mọi bước bắt đầu DEN_LUOT ngay từ
        // đầu, KHÔNG BAO GIỜ có CHO_TRUOC — buocConLai cũ luôn rỗng dù còn người chưa ký,
        // khiến hồ sơ bị chốt "hoàn tất" ngay sau chữ ký ĐẦU TIÊN, rất nguy hiểm). Giờ tách
        // 2 việc: (1) tìm MỌI bước khác chưa DA_KY (DEN_LUOT hoặc CHO_TRUOC) để biết còn ai
        // chưa ký — không phân biệt chế độ; (2) chỉ khi trong số đó có bước CHO_TRUOC (nghĩa
        // là đang TUAN_TU) mới cần promote 1 bước lên DEN_LUOT — SONG_SONG thì mọi người đã
        // DEN_LUOT sẵn từ lúc tạo yêu cầu (xem taoYeuCauKyGBTT), không có gì để promote.
        // (Bước 7: buocChuaKy/buocChoTruoc giờ tính Ở TRÊN, trước nhánh CA — xem chú thích
        // tại đó — nhưng danh sách vẫn y hệt bản gốc tính ở đây, không đổi kết quả.)
        if (buocChuaKy.length > 0) {
          if (buocChoTruoc.length > 0) {
            buocChoTruoc.sort((a, b) => a.thuTu - b.thuTu);
            const buocKeTiep = buocChoTruoc[0];
            sheetBuoc.getRange(buocKeTiep.index + 1, 7).setValue("DEN_LUOT"); // cột G
            sheetYeuCau.getRange(dongYC.rowIndex, 12).setValue(buocKeTiep.thuTu); // cột L = BUOC_HIEN_TAI

            // ĐÃ THÊM (Bước 6): sự kiện email #1 — báo "đến lượt ký" cho người kế tiếp.
            // Không rollback bước đã chuyển nếu gửi mail hỏng — chỉ ghi lý do vào cột
            // GHI_CHU của đúng dòng BuocKy đó để tra sau, người ký vẫn tự vào "Hồ sơ chờ
            // ký" thấy được như thường (email chỉ là tiện ích nhắc, không phải điều kiện).
            const emailKeTiep = String(dataBuoc[buocKeTiep.index][4] || "").trim();
            const tenKeTiep = String(dataBuoc[buocKeTiep.index][5] || "") || emailKeTiep;
            const tenChucDanhKeTiep = String(dataBuoc[buocKeTiep.index][3] || "");
            const linkChoKy = layLinkChoKy_();
            const noiDungMail1 =
              "<p>Chào " + tenKeTiep + ",</p>" +
              "<p>Văn bản <b>" + String(dongYC.row[2] || "") + "</b> (sinh viên: " + String(dongYC.row[4] || "") + ") " +
              "đang chờ bạn ký với vai trò <b>" + tenChucDanhKeTiep + "</b>, sau khi " + String(dataBuoc[dongBuocIndex][5] || "") + " đã ký.</p>" +
              (linkChoKy ? "<p><a href=\"" + linkChoKy + "\">Bấm vào đây để xem và ký</a></p>" : "<p>Vào menu tài khoản → \"Hồ sơ chờ ký\" trên hệ thống để ký.</p>");
            const ketQuaMail1 = guiEmailThongBao(emailKeTiep, "Đến lượt bạn ký: " + String(dongYC.row[2] || ""), noiDungMail1);
            if (ketQuaMail1.ok) {
              sheetBuoc.getRange(buocKeTiep.index + 1, 9).setValue(thoiGianKy); // cột I = THOI_GIAN_GUI_MAIL
            } else {
              sheetBuoc.getRange(buocKeTiep.index + 1, 10).setValue("Gửi mail thất bại: " + ketQuaMail1.lyDo); // cột J = GHI_CHU
            }
          }
          // SONG_SONG (hoặc không còn CHO_TRUOC nào để promote): những người còn lại đã
          // DEN_LUOT sẵn từ đầu, không cần làm gì thêm — chỉ báo người vừa ký là xong phần
          // mình, còn phải chờ (những) người khác.
          return responseJSON(200, "success", { hoanTat: false, thongBao: "Bạn đã ký thành công. Văn bản đang chờ (những) người còn lại ký." });
        }

        // Không còn bước nào chờ — đây là chữ ký cuối cùng: xuất PDF hoàn chỉnh, chia
        // sẻ link công khai (chỉ bản CUỐI mới share công khai, khác bản đang ký dở ở
        // action xemTruocYeuCauKy), đóng yêu cầu.
        const props = PropertiesService.getScriptProperties();
        const folderCuoi = DriveApp.getFolderById(props.getProperty('GBTT_FOLDER_ID'));
        const pdfBlob = DriveApp.getFileById(docId).getAs(MimeType.PDF);
        pdfBlob.setName("GBTT_" + String(dongYC.row[4] || "SV").replace(/\s+/g, "_") + "_" + now.getTime() + ".pdf");
        const pdfFile = folderCuoi.createFile(pdfBlob);
        pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

        sheetYeuCau.getRange(dongYC.rowIndex, 11).setValue("HOAN_THANH"); // cột K
        sheetYeuCau.getRange(dongYC.rowIndex, 12).setValue(0);            // cột L
        sheetYeuCau.getRange(dongYC.rowIndex, 14).setValue(pdfFile.getUrl()); // cột N
        sheetYeuCau.getRange(dongYC.rowIndex, 15).setValue(pdfFile.getId());  // cột O
        sheetYeuCau.getRange(dongYC.rowIndex, 16).setValue(thoiGianKy);       // cột P

        // ĐÃ THÊM (Bước 6): sự kiện email #2 — báo "hoàn tất" cho người TẠO yêu cầu
        // (KHÔNG gửi cho người vừa ký cuối, đúng thiết kế đã chốt — họ vừa thao tác
        // xong, tự biết kết quả ngay trên màn hình). Lấy danh sách người đã ký kèm
        // thời gian để liệt kê trong mail, đọc lại dataBuoc đã có sẵn trong bộ nhớ.
        const nguoiTaoEmail = String(dongYC.row[7] || "").trim();
        const dsDaKyHtml = dataBuoc
          .filter(r => String(r[0]).trim() === maYeuCau)
          .sort((a, b) => (Number(a[1]) || 0) - (Number(b[1]) || 0))
          .map(r => "<li>" + String(r[3] || "") + " — " + String(r[5] || "") + (r[7] ? " (đã ký " + r[7] + ")" : "") + "</li>")
          .join("");
        const noiDungMail2 =
          "<p>Văn bản <b>" + String(dongYC.row[2] || "") + "</b> (sinh viên: " + String(dongYC.row[4] || "") + ") đã được ký đầy đủ và hoàn tất.</p>" +
          "<p>Danh sách đã ký:</p><ul>" + dsDaKyHtml + "</ul>" +
          "<p><a href=\"" + pdfFile.getUrl() + "\">Xem/tải PDF hoàn chỉnh</a></p>";
        const ketQuaMail2 = guiEmailThongBao(nguoiTaoEmail, "Đã hoàn tất ký: " + String(dongYC.row[2] || ""), noiDungMail2);
        if (!ketQuaMail2.ok) {
          sheetYeuCau.getRange(dongYC.rowIndex, 17).setValue("Gửi mail hoàn tất thất bại: " + ketQuaMail2.lyDo); // cột Q = GHI_CHU
        }

        return responseJSON(200, "success", { hoanTat: true, pdfUrl: pdfFile.getUrl(), thongBao: "Đã ký xong toàn bộ — văn bản đã hoàn tất." });
      } catch (err) {
        return responseJSON(500, "Lỗi khi ký: " + dienGiaiLoi_(err), null);
      } finally {
        lock.releaseLock();
      }
    }

function hdPost_tuChoiKy(e, ss) {
      const g = requireAuth(e.parameter, []);
      if (!g.ok) return g.resp;

      const data = JSON.parse(e.parameter.data || '{}');
      const maYeuCau = String(data.maYeuCau || "").trim();
      const lyDo = String(data.lyDo || "").trim();
      if (!maYeuCau) return responseJSON(400, "Thiếu mã yêu cầu", null);
      if (!lyDo) return responseJSON(400, "Vui lòng nhập lý do từ chối ký", null);

      const lock = LockService.getScriptLock();
      try {
        lock.waitLock(15000);
      } catch (lockErr) {
        return responseJSON(429, "Hệ thống đang bận xử lý 1 lượt ký khác, vui lòng thử lại sau ít giây", null);
      }

      try {
        const sheetYeuCau = laySheetKySo_("YeuCauKy");
        const sheetBuoc = laySheetKySo_("BuocKy");
        if (!sheetYeuCau || !sheetBuoc) return responseJSON(404, "Chưa tạo đủ sheet YeuCauKy/BuocKy (xem hướng dẫn Bước 1)", null);

        const dongYC = timDongYeuCau_(sheetYeuCau, maYeuCau);
        if (!dongYC) return responseJSON(404, "Không tìm thấy yêu cầu ký " + maYeuCau, null);
        const trangThaiHienTai = String(dongYC.row[10] || "");
        if (trangThaiHienTai !== "DANG_KY") return responseJSON(400, "Yêu cầu ký này không còn ở trạng thái đang chờ ký (hiện: " + trangThaiHienTai + ")", null);

        const emailChuan = chuanHoaEmail_(g.userInfo.email);
        const dataBuoc = sheetBuoc.getDataRange().getValues();
        let dongBuocIndex = -1;
        for (let i = 1; i < dataBuoc.length; i++) {
          if (String(dataBuoc[i][0]).trim() === maYeuCau && chuanHoaEmail_(dataBuoc[i][4]) === emailChuan && String(dataBuoc[i][6] || "").trim() === "DEN_LUOT") {
            dongBuocIndex = i; break;
          }
        }
        if (dongBuocIndex === -1) return responseJSON(403, "Chưa tới lượt bạn ký (hoặc yêu cầu này không dành cho bạn)", null);

        const now = new Date();
        const thoiGianTuChoi = Utilities.formatDate(now, "GMT+7", "dd/MM/yyyy HH:mm");
        sheetBuoc.getRange(dongBuocIndex + 1, 7).setValue("TU_CHOI");      // cột G
        sheetBuoc.getRange(dongBuocIndex + 1, 8).setValue(thoiGianTuChoi); // cột H
        // Cột K (index 11) = LY_DO_TU_CHOI — CẦN TỰ THÊM tay trên sheet BuocKy nếu chưa có
        // (đúng quy ước Pha 1: code không tự tạo cột, xem cột mới trong kế hoạch Pha 2).
        sheetBuoc.getRange(dongBuocIndex + 1, 11).setValue(lyDo);

        sheetYeuCau.getRange(dongYC.rowIndex, 11).setValue("BI_TU_CHOI"); // cột K

        const tenNguoiTuChoi = String(dataBuoc[dongBuocIndex][5] || g.userInfo.name || "").trim();
        const tenChucDanh = String(dataBuoc[dongBuocIndex][3] || "");
        const nguoiTaoEmail = String(dongYC.row[7] || "").trim();
        const noiDungMail =
          "<p>Văn bản <b>" + String(dongYC.row[2] || "") + "</b> (sinh viên: " + String(dongYC.row[4] || "") + ") đã bị " +
          "<b>" + tenNguoiTuChoi + "</b> (" + tenChucDanh + ") từ chối ký.</p>" +
          "<p><b>Lý do:</b> " + lyDo + "</p>" +
          "<p>Chuỗi ký đã dừng lại — vui lòng kiểm tra và tạo lại yêu cầu ký khác nếu cần.</p>";
        const ketQuaMail = guiEmailThongBao(nguoiTaoEmail, "Yêu cầu ký bị từ chối: " + String(dongYC.row[2] || ""), noiDungMail);
        if (!ketQuaMail.ok) {
          sheetYeuCau.getRange(dongYC.rowIndex, 17).setValue("Gửi mail báo từ chối thất bại: " + ketQuaMail.lyDo); // cột Q = GHI_CHU
        }

        return responseJSON(200, "success", { thongBao: "Đã từ chối ký. Người tạo yêu cầu sẽ được thông báo." });
      } catch (err) {
        return responseJSON(500, "Lỗi khi từ chối ký: " + dienGiaiLoi_(err), null);
      } finally {
        lock.releaseLock();
      }
    }

function hdPost_huyYeuCauKy(e, ss) {
      const g = requireAuth(e.parameter, []);
      if (!g.ok) return g.resp;

      const data = JSON.parse(e.parameter.data || '{}');
      const maYeuCau = String(data.maYeuCau || "").trim();
      if (!maYeuCau) return responseJSON(400, "Thiếu mã yêu cầu", null);

      const lock = LockService.getScriptLock();
      try {
        lock.waitLock(15000);
      } catch (lockErr) {
        return responseJSON(429, "Hệ thống đang bận xử lý 1 lượt ký khác, vui lòng thử lại sau ít giây", null);
      }

      try {
        const sheetYeuCau = laySheetKySo_("YeuCauKy");
        const sheetBuoc = laySheetKySo_("BuocKy");
        if (!sheetYeuCau) return responseJSON(404, "Chưa tạo sheet YeuCauKy (xem hướng dẫn Bước 1)", null);

        const dongYC = timDongYeuCau_(sheetYeuCau, maYeuCau);
        if (!dongYC) return responseJSON(404, "Không tìm thấy yêu cầu ký " + maYeuCau, null);

        const emailChuan = chuanHoaEmail_(g.userInfo.email);
        const laAdmin = (g.userInfo.roles || []).indexOf('Admin') !== -1;
        const laNguoiTao = chuanHoaEmail_(dongYC.row[7]) === emailChuan;
        if (!laAdmin && !laNguoiTao) return responseJSON(403, "Chỉ người tạo yêu cầu (hoặc Admin) mới được thu hồi", null);

        const trangThaiHienTai = String(dongYC.row[10] || "");
        if (trangThaiHienTai === "HOAN_THANH") return responseJSON(400, "Yêu cầu đã hoàn tất, không thể thu hồi", null);
        if (trangThaiHienTai !== "DANG_KY") return responseJSON(400, "Yêu cầu này không còn ở trạng thái có thể thu hồi (hiện: " + trangThaiHienTai + ")", null);

        sheetYeuCau.getRange(dongYC.rowIndex, 11).setValue("DA_HUY"); // cột K

        // Báo cho người đang giữ bước DEN_LUOT (nếu có) biết yêu cầu đã bị người tạo thu
        // hồi — tránh họ ngỡ ngàng khi thấy yêu cầu tự nhiên biến mất khỏi "chờ ký". Không
        // chặn/rollback nếu gửi mail hỏng, giống mọi email tiện ích khác trong tính năng này.
        if (sheetBuoc) {
          const dataBuoc = sheetBuoc.getDataRange().getValues();
          for (let i = 1; i < dataBuoc.length; i++) {
            if (String(dataBuoc[i][0]).trim() === maYeuCau && String(dataBuoc[i][6] || "").trim() === "DEN_LUOT") {
              const emailDangCho = String(dataBuoc[i][4] || "").trim();
              const tenDangCho = String(dataBuoc[i][5] || "") || emailDangCho;
              if (emailDangCho) {
                const noiDungMail =
                  "<p>Chào " + tenDangCho + ",</p>" +
                  "<p>Văn bản <b>" + String(dongYC.row[2] || "") + "</b> (sinh viên: " + String(dongYC.row[4] || "") + ") đang chờ bạn ký " +
                  "đã bị người tạo <b>thu hồi</b> — không cần ký nữa, yêu cầu này sẽ không còn hiện trong \"Hồ sơ chờ ký\".</p>";
                guiEmailThongBao(emailDangCho, "Yêu cầu ký đã bị thu hồi: " + String(dongYC.row[2] || ""), noiDungMail);
              }
              break;
            }
          }
        }

        return responseJSON(200, "success", { thongBao: "Đã thu hồi yêu cầu ký." });
      } catch (err) {
        return responseJSON(500, "Lỗi khi thu hồi yêu cầu: " + dienGiaiLoi_(err), null);
      } finally {
        lock.releaseLock();
      }
    }