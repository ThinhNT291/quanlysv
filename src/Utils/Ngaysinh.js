// ĐÃ THÊM — thống nhất cách đọc "NGÀY SINH" từ file Excel import (thư viện xlsx/SheetJS),
// dùng chung cho cả 2 luồng import (ImportModal.jsx — Thu hồ sơ, XetTuyenPage.jsx — Xét
// tuyển), để cả 2 nơi hiểu dữ liệu giống hệt nhau, và giống với cách backend hiểu (xem
// chuanHoaNgaySinh_ / chuanHoaNgaySinhThanhDate_ trong gas/DinhDanh.gs — PHẢI giữ đúng
// cùng quy ước, sửa 1 bên mà quên bên kia sẽ lại lệch nhau y hệt lỗi vừa vá).
//
// QUY ƯỚC BẮT BUỘC: chuỗi dạng "N/N/YYYY" LUÔN hiểu là dd/MM/yyyy (ngày trước, tháng sau)
// — đúng định dạng file mẫu đang yêu cầu người nhập liệu tuân theo, KHÔNG BAO GIỜ hiểu theo
// kiểu Mỹ (MM/dd/yyyy).
//
// Vì sao cần hàm riêng thay vì để nguyên chuỗi đọc từ Excel: thư viện xlsx (SheetJS) không
// bật cellDates, nên 1 ô Excel mà NGƯỜI DÙNG (hoặc chính Excel) đã lỡ đổi thành kiểu Date sẽ
// đọc ra 1 SỐ SERIAL thô (VD 45696) thay vì chuỗi ngày — nếu không giải mã lại, số này sẽ
// không bao giờ khớp được với ngày sinh của hồ sơ khác khi hệ thống chống trùng định danh.
export function chuanHoaNgaySinhImport(raw) {
  if (raw === null || raw === undefined || raw === '') return '';
  if (raw instanceof Date) return toIso(raw.getFullYear(), raw.getMonth() + 1, raw.getDate());

  // Số serial Excel/Sheets THẬT (kiểu number), hoặc chuỗi toàn số do đã bị stringify trước
  // khi tới đây (VD getField() ở XetTuyenPage.jsx luôn String() hoá) — cả 2 trường hợp đều
  // giải mã như nhau.
  const raw2 = typeof raw === 'number' ? raw : (/^\d+$/.test(String(raw).trim()) ? Number(String(raw).trim()) : NaN);
  if (!Number.isNaN(raw2) && raw2 > 18000 && raw2 < 91000) {
    const d = new Date(Date.UTC(1899, 11, 30) + raw2 * 86400000);
    return toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  const s = String(raw).trim();
  const mIso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); // đã ISO sẵn (VD đã qua chuẩn hoá trước đó)
  if (mIso) return toIso(+mIso[1], +mIso[2], +mIso[3]);

  const mSlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // dd/MM/yyyy — ngày trước
  if (mSlash) return toIso(+mSlash[3], +mSlash[2], +mSlash[1]);

  return s; // không nhận diện được -> giữ nguyên, để hiện rõ trên bảng xem trước mà tự sửa tay
}

function toIso(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}