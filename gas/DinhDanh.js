// ==========================================================================
// PHA 1 · B — "Dựng registry + 4 endpoint" (Khóa định danh)
// ==========================================================================
// Theo roadmap "Từ hệ thống tuyển sinh đến UMS", mục 05. File này CHỈ chứa
// logic nghiệp vụ (đọc/ghi 3 tab hoso_dinh_danh/dinh_danh_phu/lich_su_dinh_danh
// đã dựng ở Pha 1·A, trong chính file Trunggian). 4 action tương ứng 4 "cổng
// tham chiếu" trong roadmap được gắn vào doGet/doPost SẴN CÓ trong
// Quanlysv.gs (không định nghĩa doGet/doPost thứ hai — 1 project Apps Script
// chỉ được có đúng 1 hàm doGet và 1 hàm doPost).
//
// ĐANG Ở PHA 1·B ĐÚNG NGHĨA: 4 action dưới đây CHẠY SONG SONG hệ hiện tại,
// CHƯA migrate gì, CHƯA có bất kỳ action nào khác (addAdmission, importStudents...)
// gọi tới các hàm này — an toàn để thử và sửa mà không ảnh hưởng luồng Xét
// tuyển/Thẩm định/Thu hồ sơ đang chạy. Việc gắn sv_key vào luồng nghiệp vụ
// thật là Pha 1·D, chưa làm ở đây.
//
// Quyền truy cập: tạm giới hạn Admin — đây là hạ tầng đang xây/thử, chưa phải
// tính năng cho người dùng cuối. Nới quyền (VD cho CanBo) khi thật sự nối vào
// UI ở các pha sau.
// ==========================================================================

function layTrunggianSS_() {
  const TRUNGGIAN_SHEET_ID = PropertiesService.getScriptProperties().getProperty('TRUNGGIAN_SHEET_ID');
  return SpreadsheetApp.openById(TRUNGGIAN_SHEET_ID);
}

function layTabHoSoDinhDanh_() {
  const sheet = layTrunggianSS_().getSheetByName('hoso_dinh_danh');
  if (!sheet) throw new Error("Chưa có tab 'hoso_dinh_danh' — chạy SetupDinhDanh.gs (Pha 1·A) trước.");
  return sheet;
}

function layTabDinhDanhPhu_() {
  const sheet = layTrunggianSS_().getSheetByName('dinh_danh_phu');
  if (!sheet) throw new Error("Chưa có tab 'dinh_danh_phu' — chạy SetupDinhDanh.gs (Pha 1·A) trước.");
  return sheet;
}

function layTabLichSuDinhDanh_() {
  const sheet = layTrunggianSS_().getSheetByName('lich_su_dinh_danh');
  if (!sheet) throw new Error("Chưa có tab 'lich_su_dinh_danh' — chạy SetupDinhDanh.gs (Pha 1·A) trước.");
  return sheet;
}

// Không dấu, viết hoa, gọn khoảng trắng — CHỈ dùng để so khớp tìm trùng,
// không dùng để hiển thị (giữ nguyên bản có dấu ở nơi khác nếu cần hiển thị).
function chuanHoaHoTen_(hoTen) {
  if (!hoTen) return "";
  let s = String(hoTen).trim().toUpperCase();
  s = s.replace(/Đ/g, "D"); // NFD không tách được Đ/đ của tiếng Việt, phải đổi tay trước.
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // bỏ toàn bộ dấu (combining marks) sau khi tách — escape \u thay vì ký tự thô để tránh lỗi copy-paste vào Apps Script editor.
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

// Quy về yyyy-MM-dd để so khớp ổn định — chấp nhận cả Date object (Sheets tự convert)
// lẫn chuỗi dd/MM/yyyy (định dạng Trunggian/AdmissionPage hay dùng).
// ĐÃ SỬA (phát hiện khi test thật — hệ thống cứ tạo sv_key mới liên tục dù tên+ngày sinh
// giống hệt nhau): ô "NGÀY SINH" trên Trunggian đôi khi KHÔNG được Apps Script nhận diện là
// kiểu Date thật (VD dữ liệu được dán/nhập vào dưới dạng số/Text thuần dù nhìn trên Sheet
// vẫn ra hình dạng ngày tháng) — lúc đó getValues() trả về 1 SỐ THÔ (serial number, kiểu
// Sheets/Excel đếm số ngày kể từ 30/12/1899), không phải Date object, không khớp nhánh nào
// ở trên, rơi thẳng xuống return s — lưu nguyên chuỗi số đó ("45696"...) làm "ngày đã chuẩn
// hoá". Ngày dạng này KHÔNG BAO GIỜ so khớp bằng được với ngày chuẩn hoá đúng của hồ sơ
// khác (VD "2025-02-08" từ hồ sơ nộp qua form) -> dinhDanhTraCuu() luôn ra rỗng -> hệ thống
// tưởng chưa từng có ai, tạo sv_key mới liên tục — im lặng, không báo lỗi gì. Thêm nhánh
// nhận diện số thô, giải mã lại đúng ngày bằng chính công thức Sheets/Excel dùng (khoảng
// serial hợp lệ cho năm ~1949-2149 là 18000-91000, đủ rộng cho ngày sinh sinh viên).
function chuanHoaNgaySinh_(ngaySinh) {
  if (ngaySinh === null || ngaySinh === undefined || ngaySinh === '') return "";
  if (ngaySinh instanceof Date) return Utilities.formatDate(ngaySinh, "GMT+7", "yyyy-MM-dd");
  if (typeof ngaySinh === 'number' && ngaySinh > 18000 && ngaySinh < 91000) {
    const ngayTuSo = new Date(Date.UTC(1899, 11, 30) + ngaySinh * 86400000);
    return Utilities.formatDate(ngayTuSo, "GMT+7", "yyyy-MM-dd");
  }
  const s = String(ngaySinh).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[3] + "-" + m[2].padStart(2, '0') + "-" + m[1].padStart(2, '0');
  return s;
}

// ĐÃ THÊM — riêng cho HIỂN THỊ trên các màn hình xử lý định danh (Hàng đợi xác nhận, Gộp hồ
// sơ): chuanHoaNgaySinh_() ở trên cố ý LUÔN trả về ISO (yyyy-MM-dd) vì đó là khoá dùng để SO
// KHỚP (ghi thẳng vào cột ngay_sinh của hoso_dinh_danh) — không được đổi định dạng đó, sẽ ảnh
// hưởng logic so trùng. Hàm này KHÔNG đụng vào giá trị/khoá so khớp, chỉ đổi CÁCH HIỂN THỊ
// (ISO -> dd/MM/yyyy, đúng quy ước hiển thị chung của hệ thống) ngay tại nơi trả JSON cho
// giao diện, để Admin không phải tự đọc ngày kiểu Mỹ/ISO khi đối chiếu tay.
function _ngaySinhHienThi_(iso) {
  if (!iso) return iso;
  const m = String(iso).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return iso; // không đúng ISO (hiếm, dữ liệu lỗi) -> hiện nguyên văn để lộ ra mà rà tay
  return m[3].padStart(2, '0') + '/' + m[2].padStart(2, '0') + '/' + m[1];
}

// ==========================================================================
// ĐÃ THÊM — thống nhất cách GHI "NGÀY SINH" xuống Trunggian, theo yêu cầu rà lại sau khi
// phát hiện lỗi ở chuanHoaNgaySinh_() phía trên: dù hồ sơ đến từ nhập tay (input
// type="date" -> luôn ISO yyyy-MM-dd) hay từ file mẫu Excel import (dd/MM/yyyy, hoặc số
// serial nếu Excel tự ý đổi ô đó thành kiểu Date), cột "NGÀY SINH" trên Goc01 LUÔN được
// ghi xuống dưới dạng 1 Date OBJECT THẬT — không phải chuỗi/số thô tuỳ nguồn — để:
//   - Không còn phụ thuộc Apps Script có "đoán" đúng ô đó là ngày hay không (nguồn gốc lỗi
//     vừa vá ở chuanHoaNgaySinh_).
//   - Hiển thị trên Sheet đồng nhất 1 kiểu bất kể nhập tay hay import (áp number format
//     "yyyy/mm/dd" cho cả cột — xem dinhDangCotNgaySinhGoc01() trong BackfillDinhDanh.gs,
//     chạy tay 1 lần).
// QUY ƯỚC BẮT BUỘC (khớp đúng chuanHoaNgaySinh_() ở trên, 2 hàm không bao giờ được hiểu
// lệch nhau): chuỗi dạng "N/N/YYYY" LUÔN là dd/MM/yyyy (ngày trước) — đúng định dạng file
// mẫu đang yêu cầu người nhập liệu tuân theo, KHÔNG BAO GIỜ hiểu kiểu Mỹ MM/dd/yyyy.
// Dùng giờ 12:00 trưa khi dựng Date từ y/m/d để tránh lệch sang ngày trước/sau do quy đổi
// múi giờ lúc Sheets lưu lại thành serial number.
function chuanHoaNgaySinhThanhDate_(ngaySinh) {
  if (ngaySinh instanceof Date) return ngaySinh;
  if (typeof ngaySinh === 'number' && ngaySinh > 18000 && ngaySinh < 91000) {
    return new Date(Date.UTC(1899, 11, 30) + ngaySinh * 86400000);
  }
  const s = String(ngaySinh === null || ngaySinh === undefined ? "" : ngaySinh).trim();
  if (!s) return ngaySinh; // rỗng -> giữ nguyên (thường là "" hoặc undefined), không tự bịa ngày
  const mIso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (mIso) return new Date(+mIso[1], +mIso[2] - 1, +mIso[3], 12, 0, 0);
  const mSlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mSlash) return new Date(+mSlash[3], +mSlash[2] - 1, +mSlash[1], 12, 0, 0);
  return ngaySinh; // không nhận diện được kiểu gì -> giữ nguyên, để lộ ra trên Sheet mà rà tay
}

// Ép mọi giá trị ngày/giờ đọc từ Sheets về đúng chuỗi hiển thị giờ VN (GMT+7) trước khi
// đưa vào response — KHÔNG BAO GIỜ trả thẳng 1 Date object ra ngoài, vì JSON.stringify()
// tự gọi .toISOString() (quy đổi UTC) làm giờ/ngày bị lùi lại so với giờ VN thật.
function formatNgayGioVN_(val) {
  if (val instanceof Date) return Utilities.formatDate(val, "GMT+7", "dd/MM/yyyy HH:mm:ss");
  return val;
}

function ghiLichSuDinhDanh_(svKey, loaiSuKien, nguoiThucHien, duLieuTruoc, duLieuSau) {
  const sheet = layTabLichSuDinhDanh_();
  sheet.appendRow([
    svKey, loaiSuKien, Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss"),
    nguoiThucHien || '', JSON.stringify(duLieuTruoc || null), JSON.stringify(duLieuSau || null)
  ]);
}

// --------------------------------------------------------------------------
// CỔNG 1 — GET /dinh-danh/tra-cuu
// Bắt buộc gọi TRƯỚC khi tạo hồ sơ mới (nguyên tắc "tra cứu trước khi tạo").
// Khớp CHÍNH XÁC theo họ tên chuẩn hoá + ngày sinh — không tìm mờ, để không
// bỏ sót lẫn không báo trùng giả (theo đúng nguyên tắc CALPADS trong roadmap).
// --------------------------------------------------------------------------
function dinhDanhTraCuu(hoTen, ngaySinh, cccd) {
  const hoTenChuan = chuanHoaHoTen_(hoTen);
  const ngaySinhChuan = chuanHoaNgaySinh_(ngaySinh);
  if (!hoTenChuan || !ngaySinhChuan) {
    throw new Error("Thiếu họ tên hoặc ngày sinh — bắt buộc để tra cứu trước khi tạo hồ sơ.");
  }

  const sheet = layTabHoSoDinhDanh_();
  const data = sheet.getDataRange().getValues();
  const ketQua = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const svKey = row[0], hoTenRow = row[1], ngaySinhRow = row[2], trangThai = row[3];
    if (trangThai === 'merged') continue; // hồ sơ đã gộp — không phải bản ghi "sống", bỏ qua.
    if (String(hoTenRow).trim() === hoTenChuan && chuanHoaNgaySinh_(ngaySinhRow) === ngaySinhChuan) {
      // ĐÃ SỬA: Sheets tự convert chuỗi "yyyy-MM-dd" ghi lúc tạo thành kiểu Date thật khi
      // lưu — đọc lại ra Date object. Nếu trả thẳng Date object đó, JSON.stringify() tự gọi
      // .toISOString() (quy đổi UTC), làm ngày sinh lùi mất 1 hôm so với giờ VN (GMT+7) —
      // y hệt bug cũ từng vá ở getStudentsData(). Luôn ép qua chuanHoaNgaySinh_() (đã tự
      // nhận diện Date/chuỗi, format cứng theo GMT+7) trước khi đưa vào response.
      // ĐÃ THÊM: kèm tao_luc — để UI phân biệt được các ứng viên trùng tên+ngày sinh với
      // nhau khi chưa có mã phụ nào (xem XacNhanDinhDanhPage.jsx), không cần lộ nguyên sv_key.
      ketQua.push({ sv_key: svKey, ho_ten_chuan_hoa: hoTenRow, ngay_sinh: chuanHoaNgaySinh_(ngaySinhRow), trang_thai: trangThai, tao_luc: formatNgayGioVN_(row[5]) });
    }
  }

  // ĐÃ SỬA (rà lại nguyên tắc chống trùng): họ tên chuẩn hoá + ngày sinh KHÔNG đủ để
  // tự tin — 2 người sinh đôi, hoặc 2 tên khác dấu nhưng chuẩn hoá trùng nhau (VD "Lê
  // Văn Anh" và "Lê Văn Ánh" đều ra "LE VAN ANH"), hoàn toàn có thể trùng cả 2 trường
  // này. CCCD là dữ liệu thứ 3 mình đã có sẵn (thu ngay lúc nhập hồ sơ, không cần thu
  // thêm) — dùng làm bằng chứng QUYẾT ĐỊNH thay vì chỉ "tham khảo": mỗi ứng viên khớp
  // được gắn thêm doi_chieu_cccd để bên gọi (dinhDanhTaoMoi/backfill/sau này là UI) tự
  // quyết định, KHÔNG được tự ý coi "1 kết quả khớp" là chắc chắn đúng 1 người — đúng
  // nguyên tắc CALPADS/EMPI: nghi trùng phải có người xác nhận tay, không bao giờ tự
  // động gộp chỉ dựa trên tên + ngày sinh.
  //   'khop'                 — CCCD đưa lên KHỚP CCCD đang gắn cho sv_key đó -> gần như
  //                            chắc chắn cùng 1 người, an toàn để tự gắn thêm mã.
  //   'khac'                 — CCCD đưa lên KHÁC CCCD đang gắn cho sv_key đó -> bằng
  //                            chứng mạnh đây là 2 NGƯỜI KHÁC NHAU (đúng ca sinh đôi) —
  //                            bên gọi phải loại ứng viên này ra, không được gắn vào.
  //   'hoSoCuChuaCoCccd'     — hồ sơ cũ tìm được chưa từng gắn CCCD nào để đối chiếu.
  //   'khongCoCccdDeSo'      — phía tra cứu không đưa CCCD lên để đối chiếu.
  // 2 trạng thái cuối đều là "CHƯA ĐỦ THÔNG TIN để tự tin" — bên gọi phải coi là nghi
  // trùng cần người xác nhận tay, không được tự động gộp.
  if (ketQua.length > 0) {
    const maPhu = layTabDinhDanhPhu_().getDataRange().getValues();
    const cccdHieuLucTheoKey = {}; // chỉ lấy CCCD CÒN HIỆU LỰC (hieu_luc_den rỗng) của mỗi sv_key.
    for (let i = 1; i < maPhu.length; i++) {
      if (maPhu[i][1] === 'CCCD' && !maPhu[i][5]) {
        cccdHieuLucTheoKey[maPhu[i][0]] = String(maPhu[i][2]).trim();
      }
    }
    ketQua.forEach(k => {
      const cccdDaCo = cccdHieuLucTheoKey[k.sv_key];
      if (!cccd) {
        k.doi_chieu_cccd = 'khongCoCccdDeSo';
      } else if (!cccdDaCo) {
        k.doi_chieu_cccd = 'hoSoCuChuaCoCccd';
      } else if (cccdDaCo === String(cccd).trim()) {
        k.doi_chieu_cccd = 'khop';
      } else {
        k.doi_chieu_cccd = 'khac';
      }
    });
  }
  return ketQua;
}

// --------------------------------------------------------------------------
// CỔNG 2 — POST /dinh-danh
// Chỉ nên gọi sau khi dinhDanhTraCuu() ở trên không ra kết quả khớp nào.
// Ở Pha 1·B này backend KHÔNG tự chặn cứng việc gọi trực tiếp không qua tra
// cứu trước (đang chạy song song để thử) — trách nhiệm gọi đúng thứ tự thuộc
// về phía gọi (UI/luồng nghiệp vụ) khi nối vào ở Pha 1·D.
// Cho phép gắn kèm mã ban đầu (VD MSV) trong cùng 1 lần gọi cho tiện, dù
// hợp đồng gốc trong roadmap là 1 endpoint riêng (CỔNG 4) — 2 việc logic tách
// biệt (dinhDanhTaoMoi_ tạo hồ sơ, dinhDanhThemMa_ gắn mã), chỉ gộp lệnh gọi.
// --------------------------------------------------------------------------
function dinhDanhTaoMoi(hoTen, ngaySinh, taoBoi, maBanDauArr) {
  const hoTenChuan = chuanHoaHoTen_(hoTen);
  const ngaySinhChuan = chuanHoaNgaySinh_(ngaySinh);
  if (!hoTenChuan || !ngaySinhChuan) {
    throw new Error("Thiếu họ tên hoặc ngày sinh — bắt buộc để tạo hồ sơ định danh.");
  }

  const svKey = Utilities.getUuid();
  const sheet = layTabHoSoDinhDanh_();
  const now = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
  sheet.appendRow([svKey, hoTenChuan, ngaySinhChuan, 'active', '', now, taoBoi || '']);
  ghiLichSuDinhDanh_(svKey, 'created', taoBoi, null, { ho_ten_chuan_hoa: hoTenChuan, ngay_sinh: ngaySinhChuan });

  const maDaGan = [];
  (maBanDauArr || []).forEach(m => {
    if (m && m.loaiMa && m.giaTri) {
      maDaGan.push(dinhDanhThemMa_(svKey, m.loaiMa, m.giaTri, m.nguonCap, taoBoi, m.laMaChinh));
    }
  });
  return { sv_key: svKey, ma_da_gan: maDaGan };
}

// --------------------------------------------------------------------------
// CỔNG 3 — GET /dinh-danh/{sv_key}/ma
// Trả toàn bộ mã (đang VÀ đã từng) gắn với 1 sv_key — kiểu FHIR identifier[].
// --------------------------------------------------------------------------
function dinhDanhLayMa(svKey) {
  if (!svKey) throw new Error("Thiếu sv_key.");
  const sheet = layTabDinhDanhPhu_();
  const data = sheet.getDataRange().getValues();
  const ketQua = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === svKey) {
      // ĐÃ SỬA: cùng bug với ngay_sinh ở dinhDanhTraCuu() — hieu_luc_tu/den ghi vào dạng
      // chuỗi "dd/MM/yyyy HH:mm:ss" cũng có thể bị Sheets tự convert thành Date thật, ép
      // qua formatNgayGioVN_() trước khi trả ra để không lộ dạng UTC lệch giờ.
      ketQua.push({
        loai_ma: data[i][1], gia_tri: data[i][2], nguon_cap: data[i][3],
        hieu_luc_tu: formatNgayGioVN_(data[i][4]), hieu_luc_den: formatNgayGioVN_(data[i][5]), la_ma_chinh: data[i][6]
      });
    }
  }
  return ketQua;
}

// --------------------------------------------------------------------------
// CỔNG 4 — PATCH /dinh-danh/{sv_key}/ma  (Apps Script Web App không có PATCH
// thật — gộp vào doPost, phân biệt bằng tham số "hanhDong").
// hanhDong = 'them'       → thêm mã mới, KHÔNG bao giờ sửa đè dòng cũ.
// hanhDong = 'hetHieuLuc' → đóng hiệu lực 1 mã đang có (hieu_luc_den), không xoá dòng.
// --------------------------------------------------------------------------
function dinhDanhCapNhatMa(svKey, hanhDong, params, nguoiThucHien) {
  if (!svKey) throw new Error("Thiếu sv_key.");
  if (hanhDong === 'them') {
    if (!params || !params.loaiMa || !params.giaTri) throw new Error("Thiếu loaiMa hoặc giaTri.");
    return dinhDanhThemMa_(svKey, params.loaiMa, params.giaTri, params.nguonCap, nguoiThucHien, params.laMaChinh);
  }
  if (hanhDong === 'hetHieuLuc') {
    if (!params || !params.loaiMa || !params.giaTri) throw new Error("Thiếu loaiMa hoặc giaTri.");
    const daDong = dinhDanhHetHieuLucMa_(svKey, params.loaiMa, params.giaTri, nguoiThucHien);
    if (!daDong) throw new Error("Không tìm thấy mã đang hiệu lực khớp loaiMa/giaTri để đóng.");
    return { da_dong: true };
  }
  throw new Error("hanhDong không hợp lệ — chỉ nhận 'them' hoặc 'hetHieuLuc'.");
}

function dinhDanhThemMa_(svKey, loaiMa, giaTri, nguonCap, nguoiThucHien, laMaChinh) {
  const sheet = layTabDinhDanhPhu_();
  const now = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
  sheet.appendRow([svKey, loaiMa, String(giaTri).trim(), nguonCap || '', now, '', laMaChinh ? true : false]);
  ghiLichSuDinhDanh_(svKey, 'them_ma', nguoiThucHien, null, { loai_ma: loaiMa, gia_tri: giaTri });
  return { loai_ma: loaiMa, gia_tri: giaTri };
}

function dinhDanhHetHieuLucMa_(svKey, loaiMa, giaTri, nguoiThucHien) {
  const sheet = layTabDinhDanhPhu_();
  const data = sheet.getDataRange().getValues();
  const now = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === svKey && data[i][1] === loaiMa && String(data[i][2]).trim() === String(giaTri).trim() && !data[i][5]) {
      sheet.getRange(i + 1, 6).setValue(now); // cột hieu_luc_den
      ghiLichSuDinhDanh_(svKey, 'het_hieu_luc_ma', nguoiThucHien, { loai_ma: loaiMa, gia_tri: giaTri }, null);
      return true;
    }
  }
  return false;
}

// ==========================================================================
// PHA 1 · D1 (bước 2) — Tự động gắn sv_key ngay khi TẠO HỒ SƠ MỚI
// ==========================================================================
// Gọi hàm này từ Quanlysv.gs NGAY TRƯỚC KHI ghi 1 dòng MỚI vào tab dữ liệu
// chính của Trunggian (addAdmission / importAdmissions / importStudents —
// nhánh tạo mới), để tự tra cứu-gắn-hoặc-tạo sv_key và trả về giá trị ghi
// thẳng vào cột SV_KEY. Đây là phần "cộng thêm, không đổi gì đang chạy" của
// Pha 1·D — CHỈ ghi thêm 1 cột mới, KHÔNG đụng vào bất kỳ cột/logic nào các
// action đang dùng để đối chiếu trùng lặp (vẫn là MSV / CCCD+Ngành như cũ).
//
// Nguyên tắc bất di bất dịch: hàm này KHÔNG BAO GIỜ được phép làm hỏng hành
// động nghiệp vụ chính (tạo hồ sơ tuyển sinh) — mọi lỗi bị bắt và nuốt ở
// đây, trả về "" (coi như chưa gắn được, có thể bù bằng script chạy tay sau).
//
// Cách quyết định — ĐÚNG NGUYÊN TẮC đã sửa ở Pha 1·C (không bao giờ tự gộp
// chỉ dựa trên tên+ngày sinh, luôn cần CCCD xác nhận hoặc không tìm thấy ai
// khác để loại trừ):
//   - Không có ứng viên nào trùng tên+ngày sinh (hoặc trùng nhưng CCCD khác
//     hẳn -> chắc chắn khác người)              -> TẠO sv_key MỚI.
//   - Đúng 1 ứng viên, CCCD KHỚP                -> GẮN vào sv_key đó.
//   - Đúng 1 ứng viên nhưng CCCD chưa đủ dữ liệu để xác nhận, HOẶC nhiều hơn
//     1 ứng viên còn lại sau khi loại trừ       -> "CẦN_XÁC_NHẬN" (nghi
//     trùng — không tự gộp, không tự tạo mới đè lên khả năng trùng, để
//     người có quyền xử lý qua dinhDanhCapNhatMa() sau).
function dinhDanhGanTuDongChoHoSoMoi_(hoTen, ngaySinh, cccd, nguoiThucHien) {
  try {
    if (!hoTen || !ngaySinh) return ""; // thiếu dữ liệu bắt buộc để tra cứu/tạo -> bỏ qua, không chặn hồ sơ chính
    const cccdChuan = chuanHoaMaSo_(cccd);

    const ketQuaTraCuu = dinhDanhTraCuu(hoTen, ngaySinh, cccdChuan);
    const ungVienConLai = ketQuaTraCuu.filter(k => k.doi_chieu_cccd !== 'khac');

    if (ungVienConLai.length === 0) {
      const maBanDau = cccdChuan ? [{ loaiMa: 'CCCD', giaTri: cccdChuan, nguonCap: 'Tự động khi tạo hồ sơ', laMaChinh: true }] : [];
      const ketQuaTao = dinhDanhTaoMoi(hoTen, ngaySinh, nguoiThucHien, maBanDau);
      return ketQuaTao.sv_key;
    }

    if (ungVienConLai.length === 1 && ungVienConLai[0].doi_chieu_cccd === 'khop') {
      return ungVienConLai[0].sv_key;
    }

    // Trùng tên+ngày sinh nhưng CCCD chưa đủ để khẳng định -> không tự gộp, đánh dấu cần
    // người xác nhận tay thay vì để trống lặng lẽ (để trống sẽ không ai biết mà xử lý).
    return "CẦN_XÁC_NHẬN";
  } catch (err) {
    Logger.log("dinhDanhGanTuDongChoHoSoMoi_ lỗi (không chặn tạo hồ sơ, để trống SV_KEY): " + err.toString());
    return "";
  }
}

// Chuẩn hoá mã số (CCCD/MSV) trước khi so sánh/lưu — bỏ dấu nháy đầu (Sheets hay thêm
// khi ghi số dài dạng text) + khoảng trắng thừa. GIỮ NGUYÊN cách chuẩn hoá này khớp với
// _duyetTrunggianDeBackfill() (BackfillDinhDanh.gs) để 2 nơi luôn so khớp được với nhau.
function chuanHoaMaSo_(giaTri) {
  return String(giaTri || "").replace(/^['"]+|['"]+$/g, '').trim();
}

// ==========================================================================
// PHA 1 · D1 (bước 3) — Đồng bộ registry khi SỬA hồ sơ đã có (updateAdmission)
// ==========================================================================
// Gọi từ action 'updateAdmission' trong Quanlysv.gs, sau khi đã biết dữ liệu
// CŨ (trước khi ghi đè) và dữ liệu MỚI (payload gửi lên) của 3 trường liên
// quan tới định danh: TÊN SINH VIÊN, NGÀY SINH, CĂN CƯỚC.
//
// 3 tình huống:
//   1) Dòng CHƯA có sv_key thật (cột SV_KEY đang trống hoặc "CẦN_XÁC_NHẬN")
//      -> coi như 1 lần "tra cứu trước khi tạo" MỚI, dùng đúng dữ liệu MỚI
//      vừa sửa (tái dùng dinhDanhGanTuDongChoHoSoMoi_ — cùng 1 luật quyết
//      định như lúc tạo hồ sơ). Trả sv_key/""/"CẦN_XÁC_NHẬN" mới, để
//      Quanlysv.gs ghi lại vào cột SV_KEY.
//   2) Dòng ĐÃ có sv_key thật, CĂN CƯỚC bị sửa khác đi -> đây chính là phần
//      còn thiếu đã nói trước (đồng bộ CCCD vào registry): ĐÓNG hiệu lực
//      CCCD cũ trong dinh_danh_phu (hieu_luc_den = lúc sửa) rồi THÊM CCCD
//      mới — đúng kiểu append-only, không sửa đè dòng cũ, có nhật ký qua
//      dinhDanhHetHieuLucMa_/dinhDanhThemMa_. sv_key KHÔNG đổi.
//   3) Dòng ĐÃ có sv_key thật, TÊN/NGÀY SINH bị sửa khác đi -> KHÔNG tự sửa
//      hoso_dinh_danh (đó là bảng khoá gốc dùng để TRA CỨU trùng cho mọi
//      hồ sơ khác — sửa nhầm ở đây ảnh hưởng cả hệ thống) — chỉ GHI NHẬT KÝ
//      (lich_su_dinh_danh) để có dấu vết; việc có cập nhật hồ sơ gốc hay
//      không nên qua công cụ xác nhận TAY riêng (xem phần bàn về modal
//      duyệt "nghi trùng"/xác nhận — chưa dựng, dự kiến dùng chung 1 màn
//      hình review cho cả nghi trùng lẫn sửa tên/ngày sinh kiểu này).
// Không bao giờ tự đổi sv_key hoặc merged_into ở đây — đổi sv_key là việc
// gộp/tách hồ sơ, phải qua xác nhận tay, không lẫn vào luồng sửa thông tin
// thường ngày. Lỗi ở đây tuyệt đối không được chặn việc sửa hồ sơ tuyển sinh.
function dinhDanhDongBoKhiSuaHoSo_(svKeyCu, hoTenCu, ngaySinhCu, cccdCu, hoTenMoi, ngaySinhMoi, cccdMoi, nguoiThucHien) {
  try {
    if (!svKeyCu || svKeyCu === 'CẦN_XÁC_NHẬN') {
      return dinhDanhGanTuDongChoHoSoMoi_(hoTenMoi, ngaySinhMoi, cccdMoi, nguoiThucHien);
    }

    const cccdCuChuan = chuanHoaMaSo_(cccdCu);
    const cccdMoiChuan = chuanHoaMaSo_(cccdMoi);
    if (cccdMoiChuan && cccdMoiChuan !== cccdCuChuan) {
      if (cccdCuChuan) dinhDanhHetHieuLucMa_(svKeyCu, 'CCCD', cccdCuChuan, nguoiThucHien);
      if (!_dinhDanhDaCoMaHieuLuc(svKeyCu, 'CCCD', cccdMoiChuan)) {
        dinhDanhThemMa_(svKeyCu, 'CCCD', cccdMoiChuan, 'Cập nhật khi sửa hồ sơ', nguoiThucHien, true);
      }
    }

    const hoTenCuChuan = chuanHoaHoTen_(hoTenCu), hoTenMoiChuan = chuanHoaHoTen_(hoTenMoi);
    const ngaySinhCuChuan = chuanHoaNgaySinh_(ngaySinhCu), ngaySinhMoiChuan = chuanHoaNgaySinh_(ngaySinhMoi);
    if ((hoTenMoiChuan && hoTenMoiChuan !== hoTenCuChuan) || (ngaySinhMoiChuan && ngaySinhMoiChuan !== ngaySinhCuChuan)) {
      ghiLichSuDinhDanh_(svKeyCu, 'sua_ho_so_khac_ho_so_goc', nguoiThucHien,
        { ho_ten: hoTenCuChuan, ngay_sinh: ngaySinhCuChuan },
        { ho_ten: hoTenMoiChuan, ngay_sinh: ngaySinhMoiChuan });
    }

    return svKeyCu; // không bao giờ đổi sv_key ở nhánh này
  } catch (err) {
    Logger.log("dinhDanhDongBoKhiSuaHoSo_ lỗi (không chặn việc sửa hồ sơ): " + err.toString());
    return svKeyCu || "";
  }
}

// ==========================================================================
// PHA 1 · D1 (bước 4) — "Hàng đợi xác nhận định danh"
// ==========================================================================
// THIẾT KẾ: không gắn modal rải rác ở từng nơi tạo/sửa hồ sơ (Thu hồ sơ/Xét
// tuyển/Thẩm định) — nơi đó chỉ ĐÁNH DẤU "CẦN_XÁC_NHẬN" rồi cho qua, không
// chặn, không hỏi ai (xem dinhDanhGanTuDongChoHoSoMoi_/dinhDanhDongBoKhiSuaHoSo_
// ở trên). Việc XỬ LÝ dồn về đúng 1 nơi — 1 trang riêng, Admin xem/duyệt theo
// giờ rảnh, không phải xử lý ngay tại chỗ. Kiểu "duplicate workqueue" của các
// hệ MDM/EMPI lớn (NextGate, CALPADS...), không phải modal chặn thao tác.
//
// Hàng đợi TỰ DỌN — không cần bảng trạng thái riêng: 1 dòng biến mất khỏi
// dinhDanhDanhSachCanXacNhan() ngay khi được xử lý xong (cột SV_KEY đổi từ
// "CẦN_XÁC_NHẬN" sang 1 sv_key thật, qua dinhDanhXuLyNghiTrung()).

// CỔNG 5 — GET: toàn bộ danh sách đang chờ xác nhận (dành cho trang Admin).
// Với mỗi dòng, tra cứu lại luôn các ứng viên khả dĩ (loại bỏ ứng viên đã bị
// CCCD phủ nhận) kèm ĐẦY ĐỦ bộ mã phụ của từng ứng viên, để trang Admin vẽ
// được bảng so sánh cạnh nhau (hồ sơ mới vs từng ứng viên) mà không phải gọi
// thêm request riêng cho từng dòng.
function dinhDanhDanhSachCanXacNhan() {
  const TRUNGGIAN_SHEET_ID = PropertiesService.getScriptProperties().getProperty('TRUNGGIAN_SHEET_ID');
  const ss = SpreadsheetApp.openById(TRUNGGIAN_SHEET_ID);
  const sheet = ss.getSheets()[0];
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const headers = values[0].map(h => String(h).toUpperCase().trim().replace(/\s+/g, ' '));
  const idxSvKey = headers.indexOf("SV_KEY");
  if (idxSvKey === -1) return [];
  const idxMaSV = headers.findIndex(h => h === "MÃ SINH VIÊN" || h === "MÃ SỐ NGƯỜI HỌC" || h === "MASV" || h === "MÃ SV");
  const idxHoTen = headers.indexOf("TÊN SINH VIÊN");
  const idxNgaySinh = headers.indexOf("NGÀY SINH");
  const idxCccd = headers.indexOf("CĂN CƯỚC") !== -1 ? headers.indexOf("CĂN CƯỚC") : headers.indexOf("CCCD");
  const idxNganh = headers.indexOf("NGÀNH");
  const idxKenh = headers.indexOf("KÊNH NỘP");
  const idxTaiKhoan = headers.indexOf("TÀI KHOẢN NHẬP LIỆU");

  const ketQua = [];
  for (let i = 1; i < values.length; i++) {
    const svKeyCell = String(values[i][idxSvKey] || "").trim();
    if (svKeyCell !== 'CẦN_XÁC_NHẬN') continue;

    const hoTen = idxHoTen !== -1 ? values[i][idxHoTen] : "";
    const ngaySinh = idxNgaySinh !== -1 ? values[i][idxNgaySinh] : "";
    const cccd = idxCccd !== -1 ? values[i][idxCccd] : "";
    const maSV = idxMaSV !== -1 ? chuanHoaMaSo_(String(values[i][idxMaSV] || "").replace(/^'/, '')) : "";

    let ungVien = [];
    try {
      const traCuu = dinhDanhTraCuu(hoTen, ngaySinh, cccd);
      ungVien = traCuu.filter(k => k.doi_chieu_cccd !== 'khac').map(k => {
        let maPhu = [];
        try { maPhu = dinhDanhLayMa(k.sv_key); } catch (e2) { /* hiếm khi lỗi, bỏ qua */ }
        // ĐÃ SỬA: hiện ngày sinh dd/MM/yyyy cho Admin dễ đối chiếu — k.ngay_sinh (ISO) vẫn
        // được dùng nguyên cho so khớp ở trên, chỉ đổi CÁCH HIỂN THỊ ngay tại đây. Kèm
        // tao_luc (đã có sẵn từ dinhDanhTraCuu ở trên) để UI hiện thay cho sv_key thô.
        return { sv_key: k.sv_key, ho_ten_chuan_hoa: k.ho_ten_chuan_hoa, ngay_sinh: _ngaySinhHienThi_(k.ngay_sinh), doi_chieu_cccd: k.doi_chieu_cccd, tao_luc: k.tao_luc, ma_phu: maPhu };
      });
    } catch (e) {
      // Thiếu tên/ngày sinh hoặc lỗi tra cứu (hiếm) -> vẫn trả dòng ra, để trống ứng viên,
      // người duyệt tự quyết định "khác người — tạo mới" nếu cần.
    }

    ketQua.push({
      dong: i + 1,
      maSV: maSV,
      hoTen: hoTen,
      ngaySinh: _ngaySinhHienThi_(chuanHoaNgaySinh_(ngaySinh)),
      cccd: chuanHoaMaSo_(cccd),
      nganh: idxNganh !== -1 ? values[i][idxNganh] : "",
      kenhNop: idxKenh !== -1 ? values[i][idxKenh] : "",
      taiKhoanNhapLieu: idxTaiKhoan !== -1 ? values[i][idxTaiKhoan] : "",
      ungVien: ungVien
    });
  }
  return ketQua;
}

// CỔNG 6 — GET: đếm nhanh cho 1 tài khoản (dùng cho bong bóng thông báo ở các trang nhập
// liệu — Thu hồ sơ/Xét tuyển/Thẩm định) — CHỈ trả về số lượng, KHÔNG trả dữ liệu chi tiết
// của người khác, nên có thể mở rộng quyền cho các role nhập liệu, không chỉ Admin.
function dinhDanhSoLuongCanXacNhanCuaToi(email) {
  const emailChuan = String(email || "").trim().toLowerCase();
  if (!emailChuan) return 0;
  const TRUNGGIAN_SHEET_ID = PropertiesService.getScriptProperties().getProperty('TRUNGGIAN_SHEET_ID');
  const ss = SpreadsheetApp.openById(TRUNGGIAN_SHEET_ID);
  const sheet = ss.getSheets()[0];
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return 0;
  const headers = values[0].map(h => String(h).toUpperCase().trim().replace(/\s+/g, ' '));
  const idxSvKey = headers.indexOf("SV_KEY");
  const idxTaiKhoan = headers.indexOf("TÀI KHOẢN NHẬP LIỆU");
  if (idxSvKey === -1 || idxTaiKhoan === -1) return 0;
  let dem = 0;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idxSvKey] || "").trim() !== 'CẦN_XÁC_NHẬN') continue;
    if (String(values[i][idxTaiKhoan] || "").trim().toLowerCase() === emailChuan) dem++;
  }
  return dem;
}

// CỔNG 7 — POST: xử lý 1 ca nghi trùng trong hàng đợi.
// hanhDong = 'ganVao' (cần kèm svKeyChon) -> đúng là người đã có sv_key đó, gắn CCCD/MSV
//            của dòng này vào (đủ mã hơn theo thời gian, không đổi hoso_dinh_danh).
// hanhDong = 'taoMoi' -> chắc chắn khác người, tạo sv_key MỚI riêng cho dòng này.
// Luôn kiểm tra dòng đang thật sự ở trạng thái "CẦN_XÁC_NHẬN" trước khi ghi (chống 2 Admin
// duyệt trùng 1 dòng cùng lúc) — nếu không còn đúng trạng thái đó, báo lỗi rõ ràng thay vì
// âm thầm ghi đè.
function dinhDanhXuLyNghiTrung(maSV, hanhDong, svKeyChon, nguoiDuyet) {
  if (!maSV) throw new Error("Thiếu Mã SV của hồ sơ cần xử lý.");
  if (hanhDong !== 'ganVao' && hanhDong !== 'taoMoi') {
    throw new Error("hanhDong không hợp lệ — chỉ nhận 'ganVao' hoặc 'taoMoi'.");
  }

  const TRUNGGIAN_SHEET_ID = PropertiesService.getScriptProperties().getProperty('TRUNGGIAN_SHEET_ID');
  const ss = SpreadsheetApp.openById(TRUNGGIAN_SHEET_ID);
  const sheet = ss.getSheets()[0];
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(h => String(h).toUpperCase().trim().replace(/\s+/g, ' '));
  const idxSvKey = headers.indexOf("SV_KEY");
  const idxMaSV = headers.findIndex(h => h === "MÃ SINH VIÊN" || h === "MÃ SỐ NGƯỜI HỌC" || h === "MASV" || h === "MÃ SV");
  const idxHoTen = headers.indexOf("TÊN SINH VIÊN");
  const idxNgaySinh = headers.indexOf("NGÀY SINH");
  const idxCccd = headers.indexOf("CĂN CƯỚC") !== -1 ? headers.indexOf("CĂN CƯỚC") : headers.indexOf("CCCD");
  if (idxSvKey === -1 || idxMaSV === -1) throw new Error("Không tìm thấy cột SV_KEY hoặc Mã sinh viên trên Trunggian.");

  const maSVChuan = chuanHoaMaSo_(maSV);
  let dong = -1;
  for (let i = 1; i < values.length; i++) {
    if (chuanHoaMaSo_(String(values[i][idxMaSV] || "").replace(/^'/, '')) === maSVChuan) { dong = i + 1; break; }
  }
  if (dong === -1) throw new Error("Không tìm thấy hồ sơ với Mã SV này trên Trunggian.");

  const row = values[dong - 1];
  const svKeyHienTai = String(row[idxSvKey] || "").trim();
  if (svKeyHienTai !== 'CẦN_XÁC_NHẬN') {
    throw new Error("Hồ sơ này không (còn) ở trạng thái chờ xác nhận — có thể đã được xử lý, tải lại danh sách.");
  }

  const hoTen = idxHoTen !== -1 ? row[idxHoTen] : "";
  const ngaySinh = idxNgaySinh !== -1 ? row[idxNgaySinh] : "";
  const cccd = idxCccd !== -1 ? row[idxCccd] : "";
  const cccdChuan = chuanHoaMaSo_(cccd);

  let svKeyMoi;
  if (hanhDong === 'taoMoi') {
    const maBanDau = [];
    if (cccdChuan) maBanDau.push({ loaiMa: 'CCCD', giaTri: cccdChuan, nguonCap: 'Xác nhận nghi trùng — khác người', laMaChinh: true });
    if (maSVChuan) maBanDau.push({ loaiMa: 'MSV', giaTri: maSVChuan, nguonCap: 'Trường', laMaChinh: true });
    const ketQuaTao = dinhDanhTaoMoi(hoTen, ngaySinh, nguoiDuyet, maBanDau);
    svKeyMoi = ketQuaTao.sv_key;
  } else { // 'ganVao'
    if (!svKeyChon) throw new Error("Thiếu svKeyChon — cần chọn đúng hồ sơ định danh để gắn vào.");
    const hoSoGoc = layTabHoSoDinhDanh_().getDataRange().getValues();
    const tonTai = hoSoGoc.some(r => r[0] === svKeyChon && r[3] !== 'merged');
    if (!tonTai) throw new Error("sv_key được chọn không tồn tại hoặc đã bị gộp — tải lại danh sách rồi thử lại.");
    if (cccdChuan && !_dinhDanhDaCoMaHieuLuc(svKeyChon, 'CCCD', cccdChuan)) {
      dinhDanhThemMa_(svKeyChon, 'CCCD', cccdChuan, 'Xác nhận nghi trùng — cùng 1 người', nguoiDuyet, true);
    }
    if (maSVChuan && !_dinhDanhDaCoMaHieuLuc(svKeyChon, 'MSV', maSVChuan)) {
      dinhDanhThemMa_(svKeyChon, 'MSV', maSVChuan, 'Trường', nguoiDuyet, true);
    }
    svKeyMoi = svKeyChon;
  }

  sheet.getRange(dong, idxSvKey + 1).setValue(svKeyMoi);
  ghiLichSuDinhDanh_(svKeyMoi, hanhDong === 'taoMoi' ? 'xac_nhan_nghi_trung_khac_nguoi' : 'xac_nhan_nghi_trung_gan_vao',
    nguoiDuyet, { maSV: maSVChuan, trangThaiTruoc: 'CẦN_XÁC_NHẬN' }, { sv_key: svKeyMoi });

  return { maSV: maSVChuan, svKey: svKeyMoi };
}

// ==========================================================================
// PHA 1 · D2 — "Gộp 2 hồ sơ định danh đã tồn tại" (khác với hàng đợi ở trên)
// ==========================================================================
// KHÁC BIỆT với CỔNG 7: dinhDanhXuLyNghiTrung() ở trên chỉ xử lý ca "1 dòng
// MỚI vừa nhập, chưa có sv_key riêng" (nguồn luôn là 1 dòng Trunggian thô).
// Ở đây là ca KHÁC: 2 sv_key ĐÃ TỒN TẠI TỪ TRƯỚC, mỗi cái đã có mã phụ/hồ sơ
// tuyển sinh riêng, sau này mới phát hiện ra là CÙNG 1 NGƯỜI (VD 2 kênh nộp
// hồ sơ độc lập, cả 2 lần đều thiếu CCCD nên hệ thống tự tạo 2 sv_key khác
// nhau — xem dinhDanhGanTuDongChoHoSoMoi_). Mượn đúng khung "source/target"
// của thao tác chuẩn FHIR Patient $merge (hl7.org/fhir/patient-operation-
// merge.html): nguồn (source) bị đánh dấu 'merged' + merged_into trỏ sang
// đích (target) — is bản rút gọn của Patient.link 'replaces'/'replaced-by',
// không xoá gì, chỉ chuyển và đánh dấu.
//
// AN TOÀN — đây là thao tác sửa khoá định danh, không có nút "hoàn tác" tự
// động, nên bắt buộc 2 lớp kiểm tra trước khi ghi:
//   1) dinhDanhXemTruocGop() — CHỈ ĐỌC, validate + trả số liệu (sẽ chuyển
//      bao nhiêu mã/hồ sơ) để phía UI bắt xác nhận tay (VD gõ lại đúng tên)
//      trước khi gọi bước ghi.
//   2) dinhDanhGopHoSo() — VALIDATE LẠI TỪ ĐẦU (không tin dữ liệu xem trước
//      cũ phía client), phòng trường hợp giữa lúc xem và lúc bấm xác nhận có
//      Admin khác đã xử lý 1 trong 2 hồ sơ này rồi (race condition).

// Tìm 1 hồ sơ định danh theo đúng sv_key, kèm số dòng trên sheet để có thể ghi đè.
function _dinhDanhTimHoSoTheoKey_(svKey) {
  const data = layTabHoSoDinhDanh_().getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === svKey) {
      // ĐÃ SỬA: ngay_sinh trả về đây CHỈ dùng để hiển thị (xem trước gộp) và không được
      // dinhDanhGopHoSo() dùng lại cho logic ghi/so khớp gì — an toàn đổi sang dd/MM/yyyy.
      return {
        dong: i + 1, sv_key: data[i][0], ho_ten_chuan_hoa: data[i][1],
        ngay_sinh: _ngaySinhHienThi_(chuanHoaNgaySinh_(data[i][2])), trang_thai: data[i][3],
        merged_into: data[i][4], tao_luc: formatNgayGioVN_(data[i][5]), tao_boi: data[i][6]
      };
    }
  }
  return null;
}

// Đếm số dòng Trunggian đang gắn mỗi sv_key — dùng chung cho tìm kiếm lẫn xem trước, đọc
// Trunggian ĐÚNG 1 LẦN rồi tra bằng map thay vì quét lại cho từng sv_key (đỡ tốn quota khi
// Trunggian đã có nhiều dòng).
function _dinhDanhDemDongTrunggianTheoKey_() {
  const TRUNGGIAN_SHEET_ID = PropertiesService.getScriptProperties().getProperty('TRUNGGIAN_SHEET_ID');
  const ss = SpreadsheetApp.openById(TRUNGGIAN_SHEET_ID);
  const sheet = ss.getSheets()[0];
  const values = sheet.getDataRange().getValues();
  const map = {};
  if (values.length <= 1) return map;
  const headers = values[0].map(h => String(h).toUpperCase().trim().replace(/\s+/g, ' '));
  const idxSvKey = headers.indexOf("SV_KEY");
  if (idxSvKey === -1) return map;
  for (let i = 1; i < values.length; i++) {
    const k = values[i][idxSvKey];
    if (!k || k === 'CẦN_XÁC_NHẬN') continue;
    map[k] = (map[k] || 0) + 1;
  }
  return map;
}

// Kiểm tra 1 cặp nguồn/đích có hợp lệ để gộp không — DÙNG CHUNG cho cả xem trước lẫn ghi
// thật, để 2 nơi luôn áp cùng 1 luật, không lệch nhau.
function _dinhDanhKiemTraGop_(svKeyNguon, svKeyDich) {
  if (!svKeyNguon || !svKeyDich) throw new Error("Thiếu sv_key nguồn hoặc đích.");
  if (svKeyNguon === svKeyDich) throw new Error("Hồ sơ nguồn và đích không được trùng nhau.");
  const hoSoNguon = _dinhDanhTimHoSoTheoKey_(svKeyNguon);
  const hoSoDich = _dinhDanhTimHoSoTheoKey_(svKeyDich);
  if (!hoSoNguon) throw new Error("Không tìm thấy hồ sơ định danh nguồn (sv_key: " + svKeyNguon + ") — có thể đã bị đổi, tải lại tìm kiếm.");
  if (!hoSoDich) throw new Error("Không tìm thấy hồ sơ định danh đích (sv_key: " + svKeyDich + ") — có thể đã bị đổi, tải lại tìm kiếm.");
  if (hoSoNguon.trang_thai === 'merged') {
    throw new Error("Hồ sơ nguồn đã bị gộp vào hồ sơ khác trước đó (merged_into: " + hoSoNguon.merged_into + ") — tải lại tìm kiếm để lấy hồ sơ còn sống.");
  }
  if (hoSoDich.trang_thai === 'merged') {
    throw new Error("Hồ sơ đích đã bị gộp vào hồ sơ khác trước đó (merged_into: " + hoSoDich.merged_into + ") — hãy chọn lại, hoặc gộp thẳng vào " + hoSoDich.merged_into + ".");
  }
  return { hoSoNguon: hoSoNguon, hoSoDich: hoSoDich };
}

// CỔNG 8 — GET: tìm hồ sơ định danh (theo họ tên/sv_key/CCCD/MSV) để chọn làm nguồn/đích.
// Chỉ trả hồ sơ CÒN SỐNG (trang_thai != 'merged') — hồ sơ đã gộp không còn là điểm đến/đi
// hợp lệ cho 1 lần gộp mới (muốn gộp tiếp thì gộp vào đúng cái merged_into của nó).
function dinhDanhTimKiemHoSo(tuKhoa) {
  const tk = String(tuKhoa || "").trim();
  if (!tk || tk.length < 2) throw new Error("Nhập ít nhất 2 ký tự để tìm (họ tên, sv_key, hoặc CCCD/MSV).");
  const tkHoTen = chuanHoaHoTen_(tk);
  const tkMa = chuanHoaMaSo_(tk);

  const hoSoData = layTabHoSoDinhDanh_().getDataRange().getValues();
  const maPhuData = layTabDinhDanhPhu_().getDataRange().getValues();
  const trunggianMap = _dinhDanhDemDongTrunggianTheoKey_();

  const maPhuTheoKey = {};   // sv_key -> mảng mã phụ (cả đang lẫn hết hiệu lực, để xem toàn cảnh)
  const svKeyKhopMa = {};    // sv_key có ít nhất 1 mã ĐANG HIỆU LỰC khớp từ khoá
  for (let i = 1; i < maPhuData.length; i++) {
    const svKey = maPhuData[i][0];
    if (!maPhuTheoKey[svKey]) maPhuTheoKey[svKey] = [];
    maPhuTheoKey[svKey].push({ loai_ma: maPhuData[i][1], gia_tri: maPhuData[i][2], hieu_luc_den: formatNgayGioVN_(maPhuData[i][5]) });
    if (tkMa && !maPhuData[i][5] && chuanHoaMaSo_(maPhuData[i][2]) === tkMa) svKeyKhopMa[svKey] = true;
  }

  const ketQua = [];
  for (let i = 1; i < hoSoData.length; i++) {
    const svKey = hoSoData[i][0], hoTen = String(hoSoData[i][1] || ""), trangThai = hoSoData[i][3];
    if (trangThai === 'merged') continue;
    const khop = (svKey === tk) || (tkHoTen && hoTen.indexOf(tkHoTen) !== -1) || svKeyKhopMa[svKey];
    if (!khop) continue;
    ketQua.push({
      sv_key: svKey, ho_ten_chuan_hoa: hoTen, ngay_sinh: _ngaySinhHienThi_(chuanHoaNgaySinh_(hoSoData[i][2])),
      trang_thai: trangThai, tao_luc: formatNgayGioVN_(hoSoData[i][5]),
      ma_phu: maPhuTheoKey[svKey] || [], soDongTrunggian: trunggianMap[svKey] || 0
    });
    if (ketQua.length >= 25) break; // tránh trả về quá nhiều, người dùng nên tìm cụ thể hơn
  }
  return ketQua;
}

// CỔNG 9 — GET: xem trước 1 cặp gộp — CHỈ ĐỌC, không ghi gì, để UI hiện đủ số liệu bắt
// người duyệt xác nhận tay trước khi gọi CỔNG 10.
function dinhDanhXemTruocGop(svKeyNguon, svKeyDich) {
  const kt = _dinhDanhKiemTraGop_(svKeyNguon, svKeyDich);
  const trunggianMap = _dinhDanhDemDongTrunggianTheoKey_();
  return {
    nguon: Object.assign({}, kt.hoSoNguon, { ma_phu: dinhDanhLayMa(svKeyNguon), soDongTrunggian: trunggianMap[svKeyNguon] || 0 }),
    dich: Object.assign({}, kt.hoSoDich, { ma_phu: dinhDanhLayMa(svKeyDich), soDongTrunggian: trunggianMap[svKeyDich] || 0 })
  };
}

// CỔNG 10 — POST: gộp thật. svKeyNguon bị đánh dấu 'merged' (không xoá), mọi mã phụ +
// mọi dòng Trunggian đang gắn svKeyNguon được chuyển hết sang svKeyDich. Ghi nhật ký CẢ
// 2 CHIỀU (nguồn lẫn đích) — tra theo sv_key nào cũng ra đúng lịch sử, đúng tinh thần
// Patient.link 2 chiều (replaces/replaced-by) của FHIR $merge.
function dinhDanhGopHoSo(svKeyNguon, svKeyDich, nguoiThucHien) {
  // Validate lại từ đầu — KHÔNG tin dữ liệu xem trước cũ phía client (xem ghi chú ở đầu mục).
  const kt = _dinhDanhKiemTraGop_(svKeyNguon, svKeyDich);

  // 1) Chuyển dòng dinh_danh_phu của nguồn sang đích — chỉ đổi "chủ sở hữu" (cột sv_key),
  // không sửa nội dung từng dòng, vẫn đúng nguyên tắc append-only đã theo từ đầu.
  // ĐÃ SỬA (rà lại sau khi test thật): nếu ĐÍCH đã có sẵn đúng loại+giá trị mã ĐANG HIỆU
  // LỰC (VD cả 2 hồ sơ đều có CCCD giống nhau — ca rất thường gặp khi 2 kênh nộp cùng thu
  // đúng 1 CCCD thật), chuyển thẳng dòng của nguồn sang sẽ tạo ra 2 dòng active TRÙNG NHAU
  // dưới cùng 1 sv_key đích — không sai dữ liệu nhưng gây rối khi xem lại (đúng thứ người
  // dùng mô tả là "vẫn còn dòng báo mã tồn tại ở 2 hồ sơ" sau khi gộp). Dùng lại đúng hàm
  // idempotent-check _dinhDanhDaCoMaHieuLuc() đã có sẵn (cùng hàm chayBackfillDinhDanh()
  // dùng): nếu đích đã có mã đó rồi thì ĐÓNG HIỆU LỰC bản bên nguồn thay vì nhân đôi; chỉ
  // mã nào đích CHƯA có (hoặc mã đã hết hiệu lực từ trước) mới thật sự chuyển chủ.
  const maPhuSheet = layTabDinhDanhPhu_();
  const maPhuData = maPhuSheet.getDataRange().getValues();
  const now = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
  let soMaPhuDaChuyen = 0, soMaPhuTrungDaDong = 0;
  for (let i = 1; i < maPhuData.length; i++) {
    if (maPhuData[i][0] !== svKeyNguon) continue;
    const dangHieuLuc = !maPhuData[i][5];
    const loaiMa = maPhuData[i][1];
    const giaTriChuan = chuanHoaMaSo_(maPhuData[i][2]);
    if (dangHieuLuc && _dinhDanhDaCoMaHieuLuc(svKeyDich, loaiMa, giaTriChuan)) {
      maPhuSheet.getRange(i + 1, 6).setValue(now); // đóng hiệu lực bản trùng bên nguồn, không chuyển
      soMaPhuTrungDaDong++;
    } else {
      maPhuSheet.getRange(i + 1, 1).setValue(svKeyDich);
      soMaPhuDaChuyen++;
    }
  }

  // 2) Chuyển toàn bộ dòng Trunggian đang gắn sv_key nguồn sang đích.
  const TRUNGGIAN_SHEET_ID = PropertiesService.getScriptProperties().getProperty('TRUNGGIAN_SHEET_ID');
  const ss = SpreadsheetApp.openById(TRUNGGIAN_SHEET_ID);
  const sheet = ss.getSheets()[0];
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(h => String(h).toUpperCase().trim().replace(/\s+/g, ' '));
  const idxSvKey = headers.indexOf("SV_KEY");
  let soDongTrunggianDaChuyen = 0;
  if (idxSvKey !== -1) {
    for (let i = 1; i < values.length; i++) {
      if (values[i][idxSvKey] === svKeyNguon) {
        sheet.getRange(i + 1, idxSvKey + 1).setValue(svKeyDich);
        soDongTrunggianDaChuyen++;
      }
    }
  }

  // 3) Đánh dấu hồ sơ nguồn 'merged', trỏ sang đích — KHÔNG xoá dòng, giữ để tra ngược/khôi
  // phục thủ công qua Apps Script nếu lỡ chọn nhầm.
  const hoSoSheet = layTabHoSoDinhDanh_();
  hoSoSheet.getRange(kt.hoSoNguon.dong, 4).setValue('merged');   // cột trang_thai
  hoSoSheet.getRange(kt.hoSoNguon.dong, 5).setValue(svKeyDich);  // cột merged_into

  // 4) Nhật ký 2 chiều. ĐÃ SỬA: 3 bước ghi dữ liệu THẬT ở trên (1-2-3) đã xong và không thể
  // "hoàn tác" bằng cách throw ở đây — nếu ghi nhật ký lỗi (hiếm, VD quota Sheets tức thời)
  // mà để lỗi đó văng ra ngoài, phía gọi (doPost) sẽ trả về mã lỗi 400 dù dữ liệu ĐÃ đổi
  // đúng rồi, khiến UI hiểu nhầm là gộp thất bại (không tự dọn màn hình tìm kiếm, còn báo
  // lỗi cho người dùng dù Sheet đã đúng) — cùng nguyên tắc "không để log làm hỏng hành
  // động chính" đã áp dụng cho dinhDanhGanTuDongChoHoSoMoi_/dinhDanhDongBoKhiSuaHoSo_.
  try {
    ghiLichSuDinhDanh_(svKeyNguon, 'gop_bi_gop_vao', nguoiThucHien,
      { trang_thai: 'active' }, { trang_thai: 'merged', merged_into: svKeyDich, soMaPhuDaChuyen: soMaPhuDaChuyen, soMaPhuTrungDaDong: soMaPhuTrungDaDong, soDongTrunggianDaChuyen: soDongTrunggianDaChuyen });
    ghiLichSuDinhDanh_(svKeyDich, 'gop_nhan_tu_hoso_khac', nguoiThucHien,
      null, { tu_sv_key: svKeyNguon, soMaPhuDaChuyen: soMaPhuDaChuyen, soMaPhuTrungDaDong: soMaPhuTrungDaDong, soDongTrunggianDaChuyen: soDongTrunggianDaChuyen });
  } catch (err) {
    Logger.log("dinhDanhGopHoSo: ghi nhật ký lỗi (dữ liệu đã gộp đúng, chỉ thiếu dòng log) — " + err.toString());
  }

  return { svKeyNguon: svKeyNguon, svKeyDich: svKeyDich, soMaPhuDaChuyen: soMaPhuDaChuyen, soMaPhuTrungDaDong: soMaPhuTrungDaDong, soDongTrunggianDaChuyen: soDongTrunggianDaChuyen };
}

// ==========================================================================
// ĐÃ THÊM — "Gợi ý cặp nghi trùng" cho công cụ Gộp thủ công (PHA 1·D2 ở trên): trước đây
// Admin/ThamDinh phải TỰ BIẾT 2 sv_key nào trùng nhau rồi mới gõ tìm — không có gì gợi ý.
// Ở đây quét thẳng NHỮNG HỒ SƠ ĐỊNH DANH ĐANG SỐNG (chưa 'merged') trong hoso_dinh_danh,
// nhóm theo đúng tiêu chí "nghi trùng" đã dùng xuyên suốt hệ thống (họ tên chuẩn hoá + ngày
// sinh) — nhóm nào có từ 2 sv_key trở lên là 1 gợi ý. CHỈ ĐỌC — không tự gộp gì (đúng
// nguyên tắc không bao giờ tự động gộp chỉ dựa trên tên+ngày sinh).
function _dinhDanhNhomNghiTrungHienCo_() {
  const data = layTabHoSoDinhDanh_().getDataRange().getValues();
  const nhom = {}; // key: "hoTen|ngaySinh" -> mảng {sv_key, tao_luc, tao_boi}
  for (let i = 1; i < data.length; i++) {
    if (data[i][3] === 'merged') continue; // đã gộp rồi -> không còn là ứng viên nghi trùng
    const hoTen = String(data[i][1] || '').trim();
    const ngaySinh = chuanHoaNgaySinh_(data[i][2]);
    if (!hoTen || !ngaySinh) continue;
    const key = hoTen + '|' + ngaySinh;
    if (!nhom[key]) nhom[key] = [];
    nhom[key].push({ sv_key: data[i][0], ho_ten_chuan_hoa: hoTen, ngay_sinh: ngaySinh, tao_luc: formatNgayGioVN_(data[i][5]), tao_boi: data[i][6] });
  }
  const ketQua = [];
  Object.keys(nhom).forEach(key => {
    if (nhom[key].length > 1) ketQua.push({ hoTen: nhom[key][0].ho_ten_chuan_hoa, ngaySinh: nhom[key][0].ngay_sinh, hoSo: nhom[key] });
  });
  return ketQua;
}

// CỔNG 11 — GET: danh sách đầy đủ các nhóm nghi trùng (kèm mã phụ + số hồ sơ tuyển sinh của
// từng sv_key trong nhóm) — dùng cho UI gợi ý trong panel Gộp thủ công. CHỈ Admin/ThamDinh
// (cùng quyền với toàn bộ tính năng Gộp).
function dinhDanhGoiYCapNghiTrung() {
  const nhom = _dinhDanhNhomNghiTrungHienCo_();
  const trunggianMap = _dinhDanhDemDongTrunggianTheoKey_();
  return nhom.map(n => ({
    hoTen: n.hoTen, ngaySinh: _ngaySinhHienThi_(n.ngaySinh),
    hoSo: n.hoSo.map(h => {
      let maPhu = [];
      try { maPhu = dinhDanhLayMa(h.sv_key); } catch (e) { /* hiếm khi lỗi, bỏ qua */ }
      return { sv_key: h.sv_key, tao_luc: h.tao_luc, tao_boi: h.tao_boi, ma_phu: maPhu, soDongTrunggian: trunggianMap[h.sv_key] || 0 };
    })
  }));
}

// CỔNG 12 — GET: chỉ đếm SỐ NHÓM đang nghi trùng — dùng cho bong bóng thông báo ở các tài
// khoản KHÔNG có quyền tự xử lý (không lộ chi tiết ai trùng với ai, chỉ 1 con số để biết có
// việc cần báo Admin). Mở quyền rộng như dinhDanhSoLuongCanXacNhanCuaToi ở CỔNG 6.
function dinhDanhSoLuongCapNghiTrung() {
  return _dinhDanhNhomNghiTrungHienCo_().length;
}

// CỔNG 13 — POST: tài khoản nhập liệu (không có quyền tự xử lý định danh) bấm "Báo Admin"
// ngay từ bong bóng thông báo -> đẩy 1 tin nhắn Google Chat qua webhook đã cấu hình sẵn
// (WEBHOOK_GCHAT trong Script Properties — cùng webhook đang dùng để báo thêm/sửa/xoá hồ sơ
// ở Quanlysv.gs, tái dùng guiTinNhanGoogleChat() đã có sẵn ở đó, cùng phạm vi global GAS).
function dinhDanhBaoAdmin(nguoiBao, soCanXacNhan, soCanGop) {
  const webhook = PropertiesService.getScriptProperties().getProperty('WEBHOOK_GCHAT');
  if (!webhook) throw new Error("Chưa cấu hình WEBHOOK_GCHAT trong Script Properties — không gửi được thông báo.");
  const phan = [];
  if (soCanXacNhan > 0) phan.push(soCanXacNhan + " hồ sơ cần xác nhận định danh");
  if (soCanGop > 0) phan.push(soCanGop + " cặp hồ sơ định danh nghi trùng cần gộp");
  const noiDung = phan.length > 0 ? phan.join(", ") : "hồ sơ cần xử lý định danh";
  const msg = "🔔 *Yêu cầu xử lý định danh*\n" + (nguoiBao || "Một tài khoản") + " báo có " + noiDung +
    " — vào mục \"Xác nhận định danh\" để xử lý.";
  guiTinNhanGoogleChat(webhook, msg);
  return { daGui: true };
}


// ============================================================================
// ĐÃ THÊM (2026-09-10) — Thân xử lý các action Định danh (trùng lặp hồ sơ), tách ra từ
// doGet/doPost (Quanlysv.gs) để dispatcher gọn hơn, đặt CHUNG file với các helper Định
// danh đã có sẵn (đúng miền nghiệp vụ). Tên hàm: hdGet_<action>/hdPost_<action> khớp đúng
// tên action gốc phía frontend — HÀNH VI GIỮ NGUYÊN 100% so với trước khi tách.
// ============================================================================

function hdGet_dinhDanhTraCuu(e) {
        const g = requireAuth(e.parameter, ['Admin']);
        if (!g.ok) return g.resp;
        try {
          return responseJSON(200, "Thành công", dinhDanhTraCuu(e.parameter.hoTen, e.parameter.ngaySinh, e.parameter.cccd));
        } catch (err) {
          return responseJSON(400, err.message, null);
        }
      }

function hdGet_dinhDanhLayMa(e) {
        const g = requireAuth(e.parameter, ['Admin']);
        if (!g.ok) return g.resp;
        try {
          return responseJSON(200, "Thành công", dinhDanhLayMa(e.parameter.svKey));
        } catch (err) {
          return responseJSON(400, err.message, null);
        }
      }

function hdGet_dinhDanhDanhSachCanXacNhan(e) {
        const g = requireAuth(e.parameter, ['Admin', 'ThamDinh']);
        if (!g.ok) return g.resp;
        try {
          return responseJSON(200, "Thành công", dinhDanhDanhSachCanXacNhan());
        } catch (err) {
          return responseJSON(400, err.message, null);
        }
      }

function hdGet_dinhDanhSoLuongCanXacNhanCuaToi(e) {
        const g = requireAuth(e.parameter, ['CanBo', 'TuyenSinh', 'ThamDinh', 'Admin']);
        if (!g.ok) return g.resp;
        try {
          return responseJSON(200, "Thành công", { soLuong: dinhDanhSoLuongCanXacNhanCuaToi(g.userInfo.email) });
        } catch (err) {
          return responseJSON(400, err.message, null);
        }
      }

function hdGet_dinhDanhTimKiemHoSo(e) {
        const g = requireAuth(e.parameter, ['Admin', 'ThamDinh']);
        if (!g.ok) return g.resp;
        try {
          return responseJSON(200, "Thành công", dinhDanhTimKiemHoSo(e.parameter.tuKhoa));
        } catch (err) {
          return responseJSON(400, err.message, null);
        }
      }

function hdGet_dinhDanhXemTruocGop(e) {
        const g = requireAuth(e.parameter, ['Admin', 'ThamDinh']);
        if (!g.ok) return g.resp;
        try {
          return responseJSON(200, "Thành công", dinhDanhXemTruocGop(e.parameter.svKeyNguon, e.parameter.svKeyDich));
        } catch (err) {
          return responseJSON(400, err.message, null);
        }
      }

function hdGet_dinhDanhGoiYCapNghiTrung(e) {
        const g = requireAuth(e.parameter, ['Admin', 'ThamDinh']);
        if (!g.ok) return g.resp;
        try {
          return responseJSON(200, "Thành công", dinhDanhGoiYCapNghiTrung());
        } catch (err) {
          return responseJSON(400, err.message, null);
        }
      }

function hdGet_dinhDanhSoLuongCapNghiTrung(e) {
        const g = requireAuth(e.parameter, ['CanBo', 'TuyenSinh', 'ThamDinh', 'Admin']);
        if (!g.ok) return g.resp;
        try {
          return responseJSON(200, "Thành công", { soLuong: dinhDanhSoLuongCapNghiTrung() });
        } catch (err) {
          return responseJSON(400, err.message, null);
        }
      }

function hdPost_dinhDanhTao(e, ss) {
      const g = requireAuth(e.parameter, ['Admin']);
      if (!g.ok) return g.resp;
      try {
        const parsedData = JSON.parse(e.parameter.data);
        const ketQua = dinhDanhTaoMoi(parsedData.hoTen, parsedData.ngaySinh, g.userInfo.email, parsedData.maBanDau);
        return responseJSON(200, "Tạo hồ sơ định danh thành công", ketQua);
      } catch (err) {
        return responseJSON(400, err.message, null);
      }
    }

function hdPost_dinhDanhCapNhatMa(e, ss) {
      const g = requireAuth(e.parameter, ['Admin']);
      if (!g.ok) return g.resp;
      try {
        const parsedData = JSON.parse(e.parameter.data);
        const ketQua = dinhDanhCapNhatMa(parsedData.svKey, parsedData.hanhDong, parsedData.params, g.userInfo.email);
        return responseJSON(200, "Cập nhật mã định danh thành công", ketQua);
      } catch (err) {
        return responseJSON(400, err.message, null);
      }
    }

function hdPost_dinhDanhXuLyNghiTrung(e, ss) {
      const g = requireAuth(e.parameter, ['Admin', 'ThamDinh']);
      if (!g.ok) return g.resp;
      try {
        const parsedData = JSON.parse(e.parameter.data);
        const ketQua = dinhDanhXuLyNghiTrung(parsedData.maSV, parsedData.hanhDong, parsedData.svKeyChon, g.userInfo.email);
        return responseJSON(200, "Xử lý nghi trùng thành công", ketQua);
      } catch (err) {
        return responseJSON(400, err.message, null);
      }
    }

function hdPost_dinhDanhGopHoSo(e, ss) {
      const g = requireAuth(e.parameter, ['Admin', 'ThamDinh']);
      if (!g.ok) return g.resp;
      try {
        const parsedData = JSON.parse(e.parameter.data);
        const ketQua = dinhDanhGopHoSo(parsedData.svKeyNguon, parsedData.svKeyDich, g.userInfo.email);
        return responseJSON(200, "Gộp hồ sơ định danh thành công", ketQua);
      } catch (err) {
        return responseJSON(400, err.message, null);
      }
    }

function hdPost_dinhDanhBaoAdmin(e, ss) {
      const g = requireAuth(e.parameter, ['CanBo', 'TuyenSinh', 'ThamDinh', 'Admin']);
      if (!g.ok) return g.resp;
      try {
        const parsedData = JSON.parse(e.parameter.data);
        const ketQua = dinhDanhBaoAdmin(g.userInfo.name || g.userInfo.email, parsedData.soCanXacNhan, parsedData.soCanGop);
        return responseJSON(200, "Đã báo Admin", ketQua);
      } catch (err) {
        return responseJSON(400, err.message, null);
      }
    }