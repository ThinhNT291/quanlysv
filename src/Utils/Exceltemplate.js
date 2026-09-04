// ĐÃ THÊM: helper dùng CHUNG cho mọi màn hình tải "file mẫu Excel" trong hệ thống (Gọi
// nhập học/ImportModal.jsx, Xét tuyển/XetTuyenPage.jsx...) — gom 2 việc từng phải tự viết
// tay riêng ở từng trang:
//
// 1) Khoá định dạng CHỮ (Text, number format "@") cho các cột dễ bị Excel tự đổi kiểu ô
//    khi người dùng gõ thêm dữ liệu (VD "NGÀY SINH" — tránh đổi kiểu Date theo locale máy
//    người dùng; "CĂN CƯỚC" — tránh đổi kiểu Number làm mất số 0 ở đầu dãy).
// 2) Data Validation dropdown THẬT cho các cột có danh sách giá trị hợp lệ cố định (VD
//    NGÀNH, HỆ ĐÀO TẠO...) — người nhập chỉ được CHỌN từ danh sách có sẵn, giảm mạnh nguy
//    cơ gõ sai chính tả/thừa khoảng trắng/khác hoa-thường khiến dữ liệu không khớp được
//    với các trường giá trị cố định khi hệ thống xử lý sau này.
//
// LƯU Ý QUAN TRỌNG — vì sao dùng exceljs cho việc TẠO file mẫu, thay vì thư viện xlsx
// đang dùng ở nơi khác trong dự án: bản xlsx (SheetJS) MIỄN PHÍ đang dùng để ĐỌC file lúc
// import KHÔNG hỗ trợ ghi Data Validation vào file .xlsx xuất ra — tính năng này chỉ có ở
// bản trả phí (SheetJS Pro). exceljs là thư viện mã nguồn mở, miễn phí, hỗ trợ đầy đủ việc
// này. Chỉ dùng exceljs ở ĐÚNG 1 chỗ — hàm helper này, phục vụ riêng việc TẠO file mẫu tải
// về; toàn bộ logic ĐỌC file Excel người dùng tải lên (import) vẫn giữ nguyên xlsx như cũ,
// không đổi gì cả.
//
// ĐÃ VIẾT LẠI (rà soát cột file mẫu): trước đây chỉ hỗ trợ 1 dòng "guideRowText" duy nhất
// (chỉ có nội dung ở cột A). Giờ đổi sang "descRow" — 1 dòng mô tả RIÊNG CHO TỪNG CỘT, nằm
// ngay dòng 2 (sau dòng tiêu đề, trước dữ liệu ví dụ/dữ liệu thật) — để người nhập liệu biết
// ngay từng cột cần điền gì mà không phải hỏi lại. Cả 2 trang import (executeImport bên
// XetTuyenPage.jsx và handleFileSelect bên ImportModal.jsx) đều đã đọc bỏ qua đúng 1 dòng
// này khi đọc dữ liệu thật (dòng 2 luôn được coi là dòng mô tả, không phải dữ liệu — xem
// "dongBatDauDuLieu" bên dưới và "slice(2)"/"rowsRaw.slice(1)" ở 2 trang import).
import ExcelJS from 'exceljs';

/**
 * Tạo và tải về 1 file Excel mẫu.
 *
 * @param {object} opts
 * @param {string[]} opts.headers - Toàn bộ tên cột, đúng thứ tự sẽ xuất hiện trên file.
 * @param {object[]} [opts.rows] - Các dòng dữ liệu ví dụ (mảng object, key = tên cột trong `headers`).
 * @param {Record<string, string>} [opts.descRow] - { [tênCột]: mô tả/hướng dẫn nhập } — chèn 1 dòng mô tả riêng cho từng cột ngay sau dòng tiêu đề (dòng 2), chữ nghiêng + nhỏ hơn dòng tiêu đề 1 cỡ + tô nền cam nhạt cho TOÀN BỘ các ô trong dòng (kể cả cột không có mô tả) để không bị nhầm với dữ liệu thật. Bỏ trống/không truyền = không có dòng này (giữ hành vi cũ).
 * @param {string[]} [opts.textLockColumns] - Tên các cột cần khoá định dạng Text (numFmt "@").
 * @param {Record<string, string[]>} [opts.dropdownColumns] - { [tênCột]: [danh sách giá trị hợp lệ] }. Cột không có trong `headers`, hoặc danh sách rỗng/undefined, sẽ tự bị bỏ qua (không lỗi) — để gọi hàm này an toàn ngay cả khi 1 vài danh mục chưa được cấu hình ở sheet CauHinh.
 * @param {Record<string, string>} [opts.headerColorGroups] - { [tênCột]: mã màu ARGB (VD 'FFD9E8FB') } — tô nền RIÊNG cho 1 số cột ở dòng tiêu đề (dòng 1), dùng để phân nhóm trực quan (VD nhóm giấy tờ theo từng đối tượng đầu vào khác nhau). Cột không có trong map này giữ màu nền mặc định.
 * @param {number} [opts.soDongKhoaText=500] - Số dòng trống phía dưới dòng dữ liệu cuối cùng cần khoá định dạng Text/dropdown sẵn, phòng người dùng gõ thêm nhiều dòng mới.
 * @param {string} [opts.sheetName='Mau'] - Tên sheet chứa dữ liệu.
 * @param {string} opts.fileName - Tên file .xlsx sẽ tải về (nên có đuôi .xlsx).
 */
export async function taiFileMauExcel({
  headers,
  rows = [],
  descRow = {},
  textLockColumns = [],
  dropdownColumns = {},
  headerColorGroups = {},
  soDongKhoaText = 500,
  sheetName = 'Mau',
  fileName,
}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);

  // Dòng 1 — tiêu đề: in đậm, cỡ chữ 11 (mốc để dòng mô tả bên dưới "nhỏ hơn 1 cỡ" so với
  // dòng này), nền mặc định màu xám nhạt cho mọi cột, riêng cột có trong headerColorGroups
  // được tô đè bằng màu nhóm riêng (VD phân biệt "giấy tờ chung" / "giấy tờ theo từng đối
  // tượng đầu vào" — mỗi nhóm đối tượng 1 màu, cho dễ nhìn khi cuộn ngang file mẫu).
  const MAU_NEN_HEADER_MAC_DINH = 'FFE7E6E6';
  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true, size: 11 };
    const ten = headers[colNumber - 1];
    const mau = headerColorGroups[ten] || MAU_NEN_HEADER_MAC_DINH;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: mau } };
  });

  // Dòng 2 — mô tả riêng từng cột: chữ nghiêng, cỡ 10 (nhỏ hơn dòng 1 đúng 1 cỡ), TOÀN BỘ
  // các ô trong dòng (kể cả cột không có mô tả) đều tô cam nhạt — để cả dòng nổi bật hẳn
  // lên, người nhập liệu nhận ra ngay đây KHÔNG PHẢI dữ liệu, tránh gõ đè/tính nhầm là 1
  // dòng hồ sơ thật.
  const MAU_NEN_MO_TA = 'FFFCE4D6';
  const coMoTa = headers.some((h) => descRow[h]);
  if (coMoTa) {
    const moTaRow = ws.addRow(headers.map((h) => descRow[h] || ''));
    moTaRow.eachCell((cell) => {
      cell.font = { italic: true, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MAU_NEN_MO_TA } };
    });
  }

  rows.forEach((r) => ws.addRow(headers.map((h) => (r[h] !== undefined ? r[h] : ''))));

  const dongBatDauDuLieu = 2 + (coMoTa ? 1 : 0);
  const dongCuoiCanKhoa = Math.max(dongBatDauDuLieu + rows.length - 1, soDongKhoaText + 1);

  // Khoá định dạng Text nguyên cả cột — áp dụng luôn cho cả những dòng trống chưa có dữ
  // liệu, để dòng nào người dùng gõ thêm vào sau này (kể cả ngoài phạm vi rows ví dụ ban
  // đầu) cũng đã sẵn là kiểu Text, Excel không tự ý suy luận lại kiểu ô theo giá trị gõ vào.
  textLockColumns.forEach((ten) => {
    const colIdx = headers.indexOf(ten);
    if (colIdx === -1) return;
    ws.getColumn(colIdx + 1).numFmt = '@';
  });

  // Dropdown: nguồn danh sách được ghi vào 1 sheet phụ ẩn ("DanhMuc") rồi tham chiếu tới
  // bằng vùng ô (range), KHÔNG liệt kê trực tiếp giá trị trong công thức data validation —
  // vì Excel giới hạn công thức dạng danh sách liệt kê trực tiếp (inline list) tối đa 255
  // ký tự, trong khi tên Ngành/Hệ đào tạo... ghép chuỗi lại rất dễ vượt qua giới hạn này,
  // nhất là khi CauHinh được quản trị thêm bớt theo thời gian. Tham chiếu vùng ô không bị
  // giới hạn này.
  const tenCotCoDropdown = Object.keys(dropdownColumns).filter((ten) => {
    const values = dropdownColumns[ten];
    return headers.indexOf(ten) !== -1 && Array.isArray(values) && values.length > 0;
  });

  if (tenCotCoDropdown.length > 0) {
    const dmSheet = wb.addWorksheet('DanhMuc');
    dmSheet.state = 'veryHidden'; // ẩn hẳn, người dùng mở file lên sẽ không thấy sheet này (kể cả trong danh sách "Unhide")

    tenCotCoDropdown.forEach((ten, i) => {
      const values = dropdownColumns[ten];
      const dmColIdx = i + 1; // cột A, B, C... bên sheet DanhMuc — đủ dùng vì số cột có dropdown luôn rất ít (<26)
      const dmColLetter = String.fromCharCode(64 + dmColIdx);
      values.forEach((v, r) => { dmSheet.getCell(r + 1, dmColIdx).value = v; });

      const colIdx = headers.indexOf(ten);
      const formula = `DanhMuc!$${dmColLetter}$1:$${dmColLetter}$${values.length}`;
      for (let r = dongBatDauDuLieu; r <= dongCuoiCanKhoa; r++) {
        ws.getCell(r, colIdx + 1).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [formula],
          showErrorMessage: true,
          errorStyle: 'stop',
          errorTitle: 'Giá trị không hợp lệ',
          error: `Cột "${ten}" chỉ chấp nhận 1 trong các giá trị có sẵn — bấm vào ô và chọn từ danh sách xổ xuống, không gõ tự do.`,
        };
      }
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}