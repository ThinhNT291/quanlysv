// ==========================================================================
// PHA 1 · C — Backfill dữ liệu cũ (Khóa định danh)
// ==========================================================================
// Chạy TAY, MỘT LẦN (hoặc lặp lại an toàn), sau khi Pha 1·B (DinhDanh.gs) đã
// test xong. Đọc TOÀN BỘ hồ sơ đang có trong tab dữ liệu chính của Trunggian
// (tab đầu tiên theo VỊ TRÍ — đúng quy ước dùng chung với getThamDinhData/
// searchOldRecord/importStudents trong Quanlysv.gs, không tìm theo tên, để
// không đọc nhầm tab "Sheet1" rác nếu lỡ có). Với MỖI hồ sơ:
//   - Tra cứu trước (dinhDanhTraCuu — đúng nguyên tắc "tra cứu trước khi tạo").
//   - Không có kết quả khớp  → TẠO MỚI sv_key, gắn kèm MSV/CCCD của dòng đó.
//   - Có ĐÚNG 1 kết quả khớp → GẮN THÊM mã vào sv_key đã có (không tạo mới).
//   - Có NHIỀU HƠN 1 kết quả khớp (nghi trùng thật) → BỎ QUA, liệt kê riêng
//     để xử lý TAY — không bao giờ tự động gộp (đúng nguyên tắc CALPADS).
//
// 2 hàm:
//  - xemTruocBackfillDinhDanh() → DRY RUN, KHÔNG GHI GÌ CẢ, chỉ log thống kê +
//    danh sách các dòng cần chú ý (nghi trùng / thiếu tên-ngày sinh) để rà
//    trước khi chạy thật.
//  - chayBackfillDinhDanh()     → CHẠY THẬT, ghi vào 3 bảng. AN TOÀN CHẠY LẠI
//    NHIỀU LẦN (idempotent): dòng đã backfill rồi (đã có đúng mã đó gắn vào
//    đúng sv_key, còn hiệu lực) sẽ tự bỏ qua, không tạo trùng lặp.
//
// LUÔN chạy xemTruocBackfillDinhDanh() trước, đọc kỹ log (đặc biệt phần "nghi
// trùng"), rồi mới chạy chayBackfillDinhDanh(). Trước khi chạy thật, nhớ xoá
// dòng dữ liệu TEST ("Nguyễn Văn A" / test@test.com) đã tạo lúc test Pha 1·B ở
// cả 3 tab hoso_dinh_danh/dinh_danh_phu/lich_su_dinh_danh, kẻo lẫn vào registry
// thật ngay từ đầu.
// ==========================================================================

// Đọc tab dữ liệu chính của Trunggian, trả về mảng {dong, hoTen, ngaySinh, cccd, maSV}.
function _duyetTrunggianDeBackfill() {
  const TRUNGGIAN_SHEET_ID = PropertiesService.getScriptProperties().getProperty('TRUNGGIAN_SHEET_ID');
  const ss = SpreadsheetApp.openById(TRUNGGIAN_SHEET_ID);
  const sheet = ss.getSheets()[0]; // tab đầu tiên theo VỊ TRÍ — đúng quy ước dùng chung toàn hệ.
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const headers = values[0].map(h => String(h).toUpperCase().trim().replace(/\s+/g, ' '));
  const idxHoTen = headers.indexOf("TÊN SINH VIÊN");
  const idxNgaySinh = headers.indexOf("NGÀY SINH");
  const idxCccd = headers.indexOf("CĂN CƯỚC") !== -1 ? headers.indexOf("CĂN CƯỚC")
    : (headers.indexOf("SỐ CCCD") !== -1 ? headers.indexOf("SỐ CCCD") : headers.indexOf("CCCD"));
  const idxMaSV = headers.findIndex(h => h === "MÃ SINH VIÊN" || h === "MÃ SỐ NGƯỜI HỌC" || h === "MASV" || h === "MÃ SV");

  if (idxHoTen === -1 || idxNgaySinh === -1) {
    throw new Error("Không tìm thấy cột 'TÊN SINH VIÊN' hoặc 'NGÀY SINH' trên tab dữ liệu chính của Trunggian.");
  }

  const rows = [];
  for (let i = 1; i < values.length; i++) {
    rows.push({
      dong: i + 1,
      hoTen: values[i][idxHoTen],
      ngaySinh: values[i][idxNgaySinh],
      cccd: idxCccd !== -1 ? String(values[i][idxCccd] || "").replace(/^['"]+|['"]+$/g, '').trim() : "",
      maSV: idxMaSV !== -1 ? String(values[i][idxMaSV] || "").replace(/^'/, '').trim() : ""
    });
  }
  return rows;
}

// Quyết định hành động cho 1 dòng, KHÔNG ghi gì — dùng chung cho cả dry-run lẫn chạy thật.
function _quyetDinhBackfillChoDong(row) {
  const hoTenChuan = chuanHoaHoTen_(row.hoTen);
  const ngaySinhChuan = chuanHoaNgaySinh_(row.ngaySinh);
  if (!hoTenChuan || !ngaySinhChuan) {
    return { hanhDong: 'boQua', lyDo: 'Thiếu tên hoặc ngày sinh' };
  }
  // ĐÃ SỬA (rà lại nguyên tắc chống trùng — ca sinh đôi/trùng tên sau chuẩn hoá): tên +
  // ngày sinh khớp KHÔNG còn đủ để tự động gắn vào — phải đối chiếu thêm CCCD (dữ liệu
  // thứ 3), và CHỈ tự gắn khi CCCD xác nhận khớp. Xem doi_chieu_cccd trong dinhDanhTraCuu().
  const ketQuaTraCuuGoc = dinhDanhTraCuu(row.hoTen, row.ngaySinh, row.cccd);

  // Loại thẳng các ứng viên bị CCCD PHỦ NHẬN — bằng chứng mạnh đây là 2 người khác nhau
  // (đúng ca sinh đôi/trùng tên sau chuẩn hoá), không được coi là "khớp" nữa.
  const ungVienConLai = ketQuaTraCuuGoc.filter(k => k.doi_chieu_cccd !== 'khac');

  if (ungVienConLai.length === 0) return { hanhDong: 'taoMoi' };

  if (ungVienConLai.length === 1) {
    const k = ungVienConLai[0];
    if (k.doi_chieu_cccd === 'khop') {
      // CCCD xác nhận đúng 1 người — an toàn để tự động gắn vào, không cần hỏi tay.
      return { hanhDong: 'ganVao', svKey: k.sv_key };
    }
    // Chỉ khớp tên+ngày sinh, CHƯA có CCCD để xác nhận (hồ sơ cũ chưa có, hoặc dòng này
    // chưa có CCCD) — CHƯA ĐỦ CHẮC CHẮN, không được tự gộp, phải đưa người xác nhận tay.
    return { hanhDong: 'nghiTrung', lyDo: 'Khớp tên+ngày sinh nhưng chưa có CCCD để xác nhận (' + k.doi_chieu_cccd + ')', ungVien: [k.sv_key] };
  }

  // Vẫn còn từ 2 ứng viên trở lên sau khi loại bằng CCCD — nghi trùng thật, không đoán.
  return { hanhDong: 'nghiTrung', lyDo: ungVienConLai.length + ' hồ sơ định danh cùng tên+ngày sinh, CCCD chưa phân biệt được', ungVien: ungVienConLai.map(k => k.sv_key) };
}

function xemTruocBackfillDinhDanh() {
  const rows = _duyetTrunggianDeBackfill();
  let taoMoi = 0, ganVao = 0, boQua = 0, nghiTrung = 0;
  const dsNghiTrung = [], dsBoQua = [];

  rows.forEach(row => {
    const qd = _quyetDinhBackfillChoDong(row);
    if (qd.hanhDong === 'taoMoi') taoMoi++;
    else if (qd.hanhDong === 'ganVao') ganVao++;
    else if (qd.hanhDong === 'nghiTrung') { nghiTrung++; dsNghiTrung.push({ dong: row.dong, hoTen: row.hoTen, ungVien: qd.ungVien }); }
    else { boQua++; dsBoQua.push({ dong: row.dong, hoTen: row.hoTen, lyDo: qd.lyDo }); }
  });

  Logger.log("=== XEM TRƯỚC BACKFILL (dry run — chưa ghi gì) ===");
  Logger.log("Tổng số dòng đọc được: " + rows.length);
  Logger.log("Sẽ tạo sv_key mới: " + taoMoi);
  Logger.log("Sẽ gắn vào sv_key có sẵn: " + ganVao);
  Logger.log("Nghi trùng (>1 hồ sơ khớp — cần xử lý TAY, backfill thật sẽ TỰ BỎ QUA các dòng này): " + nghiTrung);
  Logger.log("Bỏ qua (thiếu tên/ngày sinh): " + boQua);
  if (dsNghiTrung.length > 0) Logger.log("Chi tiết nghi trùng: " + JSON.stringify(dsNghiTrung));
  if (dsBoQua.length > 0) Logger.log("Chi tiết bỏ qua: " + JSON.stringify(dsBoQua));

  return { tongSo: rows.length, taoMoi: taoMoi, ganVao: ganVao, nghiTrung: nghiTrung, boQua: boQua, dsNghiTrung: dsNghiTrung, dsBoQua: dsBoQua };
}

function chayBackfillDinhDanh() {
  const rows = _duyetTrunggianDeBackfill();
  let taoMoi = 0, ganVao = 0, boQuaThieu = 0, nghiTrung = 0;
  const dsNghiTrung = [];

  rows.forEach(row => {
    const qd = _quyetDinhBackfillChoDong(row);

    if (qd.hanhDong === 'boQua') { boQuaThieu++; return; }
    if (qd.hanhDong === 'nghiTrung') { nghiTrung++; dsNghiTrung.push({ dong: row.dong, hoTen: row.hoTen, ungVien: qd.ungVien }); return; }

    if (qd.hanhDong === 'taoMoi') {
      const maBanDau = [];
      if (row.maSV) maBanDau.push({ loaiMa: 'MSV', giaTri: row.maSV, nguonCap: 'Trường', laMaChinh: true });
      if (row.cccd) maBanDau.push({ loaiMa: 'CCCD', giaTri: row.cccd, nguonCap: 'Công an', laMaChinh: true });
      dinhDanhTaoMoi(row.hoTen, row.ngaySinh, 'backfill-1C', maBanDau);
      taoMoi++;
    } else {
      // Idempotent: chỉ gắn mã nếu CHƯA có đúng mã đó, còn hiệu lực — chạy lại lần 2 sẽ
      // không tạo dòng dinh_danh_phu đúp.
      if (row.maSV && !_dinhDanhDaCoMaHieuLuc(qd.svKey, 'MSV', row.maSV)) {
        dinhDanhThemMa_(qd.svKey, 'MSV', row.maSV, 'Trường', 'backfill-1C', true);
      }
      if (row.cccd && !_dinhDanhDaCoMaHieuLuc(qd.svKey, 'CCCD', row.cccd)) {
        dinhDanhThemMa_(qd.svKey, 'CCCD', row.cccd, 'Công an', 'backfill-1C', true);
      }
      ganVao++;
    }
  });

  Logger.log("=== BACKFILL ĐÃ CHẠY XONG ===");
  Logger.log("Tổng số dòng đọc được: " + rows.length);
  Logger.log("Đã tạo sv_key mới: " + taoMoi);
  Logger.log("Đã gắn vào sv_key có sẵn: " + ganVao);
  Logger.log("Nghi trùng (BỎ QUA, cần xử lý TAY): " + nghiTrung);
  Logger.log("Bỏ qua (thiếu tên/ngày sinh): " + boQuaThieu);
  if (dsNghiTrung.length > 0) Logger.log("Chi tiết nghi trùng: " + JSON.stringify(dsNghiTrung));

  return { tongSo: rows.length, taoMoi: taoMoi, ganVao: ganVao, nghiTrung: nghiTrung, boQuaThieu: boQuaThieu, dsNghiTrung: dsNghiTrung };
}

function _dinhDanhDaCoMaHieuLuc(svKey, loaiMa, giaTri) {
  const sheet = layTabDinhDanhPhu_();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === svKey && data[i][1] === loaiMa && String(data[i][2]).trim() === String(giaTri).trim() && !data[i][5]) {
      return true;
    }
  }
  return false;
}

// ==========================================================================
// PHA 1 · D1 (bước 1) — Điền cột SV_KEY cho các hồ sơ ĐÃ CÓ trên Trunggian
// ==========================================================================
// Chạy TAY, MỘT LẦN, SAU KHI đã chạy xong chayBackfillDinhDanh() ở trên (Pha
// 1·C) — lúc đó 3 bảng định danh đã có đủ dữ liệu ứng với các hồ sơ hiện có.
// Hàm này KHÔNG tạo/sửa gì trong 3 bảng định danh — chỉ ĐỌC dinh_danh_phu
// rồi ĐIỀN NGƯỢC sv_key tìm được vào cột "SV_KEY" trên tab dữ liệu chính của
// Trunggian (cột ông đã tự tay thêm vào).
//
// Nguyên tắc AN TOÀN — chỉ điền, không bao giờ ghi đè:
//   - Dòng nào cột SV_KEY đã có giá trị (dù đúng/sai) -> BỎ QUA, không đụng.
//   - Khớp theo MSV trước; nếu MSV không cho ra đúng 1 kết quả, thử khớp
//     theo CCCD.
//   - MSV và CCCD của cùng 1 dòng lại trỏ về 2 sv_key KHÁC NHAU, hoặc 1
//     trong 2 mã trỏ tới NHIỀU HƠN 1 sv_key -> nghi vấn dữ liệu, KHÔNG tự
//     chọn đại 1 cái — liệt kê riêng để rà tay, không ghi gì.
//   - Không tìm được sv_key nào khớp (cả MSV lẫn CCCD) -> BỎ QUA, liệt kê ra
//     để rà tay (khả năng dòng đó bị Pha 1·C xếp vào "nghi trùng"/"bỏ qua").
//
// CÁCH DÙNG: chạy hàm dienSvKeyChoHoSoDaCo(), đọc kỹ Logger.log kết quả
// (View > Executions > (lần chạy) > Logs) trước khi tin tưởng dữ liệu.
function dienSvKeyChoHoSoDaCo() {
  const TRUNGGIAN_SHEET_ID = PropertiesService.getScriptProperties().getProperty('TRUNGGIAN_SHEET_ID');
  const ss = SpreadsheetApp.openById(TRUNGGIAN_SHEET_ID);
  const sheet = ss.getSheets()[0];
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) { Logger.log("Không có dữ liệu trên Trunggian."); return { daDien: 0 }; }

  const headers = values[0].map(h => String(h).toUpperCase().trim().replace(/\s+/g, ' '));
  const idxSvKey = headers.indexOf("SV_KEY");
  if (idxSvKey === -1) {
    throw new Error("Không tìm thấy cột 'SV_KEY' trên tab dữ liệu chính của Trunggian — kiểm tra lại tên cột đã thêm (phải đúng chữ 'SV_KEY').");
  }
  const idxHoTen = headers.indexOf("TÊN SINH VIÊN");
  const idxCccd = headers.indexOf("CĂN CƯỚC") !== -1 ? headers.indexOf("CĂN CƯỚC")
    : (headers.indexOf("SỐ CCCD") !== -1 ? headers.indexOf("SỐ CCCD") : headers.indexOf("CCCD"));
  const idxMaSV = headers.findIndex(h => h === "MÃ SINH VIÊN" || h === "MÃ SỐ NGƯỜI HỌC" || h === "MASV" || h === "MÃ SV");

  // Dựng bảng tra nhanh giá trị (đã chuẩn hoá) -> [sv_key,...] cho MSV và CCCD riêng, chỉ
  // lấy mã CÒN HIỆU LỰC (hieu_luc_den trống) — đọc 1 lần, tránh quét lại dinh_danh_phu cho
  // mỗi dòng của Trunggian.
  const maPhu = layTabDinhDanhPhu_().getDataRange().getValues();
  const traTheoMSV = {}, traTheoCCCD = {};
  for (let i = 1; i < maPhu.length; i++) {
    if (maPhu[i][5]) continue; // hieu_luc_den đã có giá trị -> mã này hết hiệu lực, bỏ qua
    const svKey = maPhu[i][0];
    const loaiMa = maPhu[i][1];
    const giaTriChuan = chuanHoaMaSo_(maPhu[i][2]);
    if (!svKey || !giaTriChuan) continue;
    const dich = loaiMa === 'MSV' ? traTheoMSV : (loaiMa === 'CCCD' ? traTheoCCCD : null);
    if (!dich) continue;
    if (!dich[giaTriChuan]) dich[giaTriChuan] = [];
    if (dich[giaTriChuan].indexOf(svKey) === -1) dich[giaTriChuan].push(svKey);
  }

  let daDien = 0, boQuaDaCo = 0, boQuaKhongTim = 0, canRaTay = 0;
  const dsKhongTim = [], dsCanRaTay = [];

  for (let i = 1; i < values.length; i++) {
    const dong = i + 1;
    const svKeyHienTai = String(values[i][idxSvKey] || "").trim();
    if (svKeyHienTai) { boQuaDaCo++; continue; }

    const hoTenRow = idxHoTen !== -1 ? values[i][idxHoTen] : "";
    const maSVRow = idxMaSV !== -1 ? chuanHoaMaSo_(String(values[i][idxMaSV] || "").replace(/^'/, '')) : "";
    const cccdRow = idxCccd !== -1 ? chuanHoaMaSo_(values[i][idxCccd]) : "";

    const ungVienMSV = maSVRow ? (traTheoMSV[maSVRow] || []) : [];
    const ungVienCCCD = cccdRow ? (traTheoCCCD[cccdRow] || []) : [];

    if (ungVienMSV.length > 1 || ungVienCCCD.length > 1) {
      canRaTay++;
      dsCanRaTay.push({ dong: dong, hoTen: hoTenRow, lyDo: "Mã trỏ tới nhiều hơn 1 sv_key", ungVienMSV: ungVienMSV, ungVienCCCD: ungVienCCCD });
      continue;
    }

    let svKeyChon = null;
    if (ungVienMSV.length === 1 && ungVienCCCD.length === 1) {
      if (ungVienMSV[0] === ungVienCCCD[0]) {
        svKeyChon = ungVienMSV[0];
      } else {
        canRaTay++;
        dsCanRaTay.push({ dong: dong, hoTen: hoTenRow, lyDo: "MSV và CCCD trỏ về 2 sv_key khác nhau", svKeyTheoMSV: ungVienMSV[0], svKeyTheoCCCD: ungVienCCCD[0] });
        continue;
      }
    } else if (ungVienMSV.length === 1) {
      svKeyChon = ungVienMSV[0];
    } else if (ungVienCCCD.length === 1) {
      svKeyChon = ungVienCCCD[0];
    }

    if (!svKeyChon) {
      boQuaKhongTim++;
      dsKhongTim.push({ dong: dong, hoTen: hoTenRow });
      continue;
    }

    sheet.getRange(dong, idxSvKey + 1).setValue(svKeyChon);
    daDien++;
  }

  Logger.log("=== ĐIỀN SV_KEY CHO HỒ SƠ ĐÃ CÓ — XONG ===");
  Logger.log("Đã điền: " + daDien);
  Logger.log("Bỏ qua (đã có sẵn SV_KEY, không đụng vào): " + boQuaDaCo);
  Logger.log("Không tìm được sv_key khớp (MSV lẫn CCCD) — cần rà lại Pha 1·C: " + boQuaKhongTim);
  Logger.log("Cần rà tay (mã trỏ tới nhiều/khác sv_key): " + canRaTay);
  if (dsKhongTim.length > 0) Logger.log("Chi tiết không tìm được: " + JSON.stringify(dsKhongTim));
  if (dsCanRaTay.length > 0) Logger.log("Chi tiết cần rà tay: " + JSON.stringify(dsCanRaTay));

  return { daDien: daDien, boQuaDaCo: boQuaDaCo, boQuaKhongTim: boQuaKhongTim, canRaTay: canRaTay, dsKhongTim: dsKhongTim, dsCanRaTay: dsCanRaTay };
}

// ==========================================================================
// ĐÃ THÊM — thống nhất cách HIỂN THỊ cột "NGÀY SINH" trên Goc01 (đi cùng đợt vá lỗi chuẩn
// hoá ngày sinh: chuanHoaNgaySinh_/chuanHoaNgaySinhThanhDate_ trong DinhDanh.gs).
// ==========================================================================
// Chạy TAY, MỘT LẦN (an toàn chạy lại nhiều lần) — áp định dạng hiển thị "yyyy/mm/dd" cho
// toàn bộ cột "NGÀY SINH" trên tab dữ liệu chính của Trunggian, kể cả các dòng CHƯA có dữ
// liệu (để hồ sơ nhập/import SAU này cũng tự hiện đúng kiểu, không cần chạy lại). CHỈ đổi
// CÁCH HIỂN THỊ của ô, KHÔNG đổi giá trị bên trong — ô nào đã là Date object thật (từ
// addAdmission/importAdmissions/importStudents bản đã vá) sẽ tự hiện đúng ngay; ô nào vẫn
// còn là chuỗi/số thô từ trước khi vá thì cần chạy lại chayBackfillDinhDanh() +
// dienSvKeyChoHoSoDaCo() sau khi tự sửa tay các ô đó (xem hướng dẫn kèm theo).
function dinhDangCotNgaySinhGoc01() {
  const TRUNGGIAN_SHEET_ID = PropertiesService.getScriptProperties().getProperty('TRUNGGIAN_SHEET_ID');
  const ss = SpreadsheetApp.openById(TRUNGGIAN_SHEET_ID);
  const sheet = ss.getSheets()[0];
  const values = sheet.getDataRange().getValues();
  if (values.length === 0) { Logger.log("Không có dữ liệu trên Trunggian."); return; }
  const headers = values[0].map(h => String(h).toUpperCase().trim().replace(/\s+/g, ' '));
  const idxNgaySinh = headers.indexOf("NGÀY SINH");
  if (idxNgaySinh === -1) {
    throw new Error("Không tìm thấy cột 'NGÀY SINH' trên tab dữ liệu chính của Trunggian.");
  }
  const soDong = Math.max(sheet.getMaxRows() - 1, 1);
  // ĐÃ SỬA: dùng chung hằng số DINH_DANG_NGAY_SINH (khai báo trong Quanlysv.gs, cùng phạm vi
  // global GAS) thay vì hardcode chuỗi riêng ở đây — đổi định dạng chỉ cần sửa 1 chỗ duy nhất.
  sheet.getRange(2, idxNgaySinh + 1, soDong, 1).setNumberFormat(DINH_DANG_NGAY_SINH);
  Logger.log("Đã áp định dạng " + DINH_DANG_NGAY_SINH + " cho cột NGÀY SINH, từ dòng 2 tới dòng " + sheet.getMaxRows() + ".");
}