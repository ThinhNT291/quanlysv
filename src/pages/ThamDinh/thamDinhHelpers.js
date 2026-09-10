// ĐÃ PORT từ thamdinh_-_app.js (repo Thẩm định vanilla JS cũ) — giữ nguyên logic
// nghiệp vụ, chỉ đổi cú pháp cho khớp module ES + JSX. Khác biệt cố ý duy nhất:
// KHÔNG dùng dangerouslySetInnerHTML/escapeHtml như bản cũ nữa — trả về dữ liệu
// thuần (số/chuỗi), để component React tự render qua JSX (React tự escape hết,
// an toàn hơn cách "escape thủ công" của bản cũ, không cần lo XSS ở tầng này nữa).
import { DICT_HO_SO, DICT_KHU_VUC, DICT_DOI_TUONG, DICT_NGANH, DICT_TO_HOP, SUBJ_MAP, MAP_HE_DAO_TAO, MAP_HINH_THUC, ALLOWED_LINK_HOSTS, isDocDaHuy } from './thamDinhConfig';

// Lấy giá trị 1 cột trong row theo danh sách tên cột khả dĩ (không phân biệt hoa/thường/khoảng trắng thừa)
export function getVal(row, keys) {
  for (const k of keys) {
    const searchKey = k.trim().toUpperCase().replace(/\s+/g, ' ');
    for (const rowKey in row) {
      const cleanRowKey = rowKey.trim().toUpperCase().replace(/\s+/g, ' ');
      if (cleanRowKey === searchKey) {
        const rawValue = row[rowKey] !== undefined && row[rowKey] !== null ? row[rowKey] : "";
        let val = String(rawValue).trim();
        if (val.startsWith("'")) val = val.substring(1);
        return val;
      }
    }
  }
  return "";
}

// Chuẩn hoá chuỗi cho ô tìm kiếm nhanh: bỏ dấu tiếng Việt + chữ thường
export function normalizeText(str) {
  return String(str || "")
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

// ĐÃ THÊM (Công nhận KQHT & chuyển đổi tín chỉ — Nguồn 2 "miễn theo văn bằng cũ",
// 2026-09-09 — KHÔNG liên quan Ký điện tử Pha 2): chuẩn hoá tên học phần để so khớp giữa
// bảng miễn cố định (Điều 6, tab Sheet "MienTheoVanBangCu") với khung CTĐT ngành (2 nguồn
// dữ liệu độc lập — cách gõ dấu gạch ngang/khoảng trắng có thể lệch nhau dù cùng 1 tên môn)
// — mạnh hơn normalizeText thường (bỏ thêm mọi ký tự không phải chữ/số).
export function chuanHoaTenHocPhan(s) {
  return normalizeText(s).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Lấy TOÀN BỘ khung CTĐT ngành (matched+unmatched luôn CỘNG LẠI = toàn bộ khung, xem action
// 'compareCurriculum' ở Quanlysv.gs) từ compareResult AI — dùng chung cho DoiSanhModal.jsx
// (tính pool "môn chuẩn chưa dùng") VÀ Nguồn 2 (so tên để áp mẫu miễn theo văn bằng cũ).
export function layAllChuanTuCompareResult(compareResult) {
  if (!compareResult) return [];
  return [
    ...(compareResult.matched || []).map((m) => ({ nhom_mon: m.nhom_mon, ten: m.mon_chuan, tin_chi: m.tin_chi_chuan })),
    ...(compareResult.unmatched || []).map((u) => ({ nhom_mon: u.nhom_mon, ten: u.mon_chuan, tin_chi: u.tin_chi_chuan })),
  ];
}

// Tập hợp tên "môn chuẩn" đã xuất hiện (tách theo dấu phẩy, chuẩn hoá mạnh) trong 1 danh sách
// dòng "đã tương đương" — dùng để Nguồn 2 tự BỎ QUA học phần đã được Nguồn 1 (AI/gộp tay) xử
// lý rồi, tránh cùng 1 học phần bị cộng tín chỉ 2 lần khi tick thêm mẫu miễn.
export function layTenChuanDaDung(list) {
  const set = new Set();
  (list || []).forEach((m) => {
    String(m.mon_chuan || '').split(',').forEach((s) => {
      const t = chuanHoaTenHocPhan(s);
      if (t) set.add(t);
    });
  });
  return set;
}

// Nguồn 2 — áp mẫu miễn CỐ ĐỊNH theo văn bằng cũ (Điều 6, KHÔNG qua AI, đúng nguyên tắc đã
// chốt "không giao AI quyết định môn nào được miễn theo chính sách"). Với loaiVanBang đã tick
// ('Đại học'/'Cao đẳng'/'Trung cấp', rỗng = không tick), tra dsMienVanBangCu (action
// layDanhSachMienVanBangCu) lấy đúng danh sách học phần + TC cố định của loại đó, so tên
// (chuanHoaTenHocPhan) với allChuan (khung CTĐT NGÀNH đang xét, từ layAllChuanTuCompareResult)
// để lấy đúng nhom_mon/tên thật của ngành đó — chỉ dùng string-match tĩnh, không AI.
// tenDaDungTruoc (Set, từ layTenChuanDaDung): học phần nào đã nằm trong đó thì BỎ QUA, tránh
// cộng trùng tín chỉ nếu Nguồn 1 đã xử lý học phần đó rồi.
// Trả {rows, khongKhop}: rows theo đúng format dòng "đã tương đương" của DoiSanhModal.jsx
// (thêm field nguon:'chinh_sach' để phân biệt nguồn gốc, hiện badge riêng); khongKhop = tên
// học phần trong mẫu miễn KHÔNG tìm thấy trong khung CTĐT ngành (cán bộ tự bổ sung tay qua
// Nguồn 1 nếu thật sự cần — không tự đoán/ép vào).
export function tinhCacDongMienVanBangCu({ loaiVanBang, dsMienVanBangCu, allChuan, tenDaDungTruoc }) {
  if (!loaiVanBang) return { rows: [], khongKhop: [] };
  const daDung = tenDaDungTruoc || new Set();
  const mucList = (dsMienVanBangCu || []).filter((x) => x.loaiVanBang === loaiVanBang);
  const chuanMap = new Map();
  (allChuan || []).forEach((c) => {
    const key = chuanHoaTenHocPhan(c.ten);
    if (key && !chuanMap.has(key)) chuanMap.set(key, c);
  });
  const rows = [];
  const khongKhop = [];
  mucList.forEach((muc) => {
    const key = chuanHoaTenHocPhan(muc.tenHocPhan);
    const c = chuanMap.get(key);
    if (!c) { khongKhop.push(muc.tenHocPhan); return; }
    if (daDung.has(key)) return; // đã được Nguồn 1 (AI/gộp tay) xử lý -> bỏ qua, tránh trùng
    rows.push({
      nhom_mon: c.nhom_mon,
      mon_chuan: c.ten,
      tin_chi_chuan: muc.soTinChi,
      mon_da_hoc: `(Miễn theo văn bằng ${loaiVanBang} đã có)`,
      tin_chi_da_hoc: muc.soTinChi,
      ket_luan: 'Đạt',
      nguon: 'chinh_sach',
    });
  });
  return { rows, khongKhop };
}

// ĐÃ THÊM (Công nhận KQHT & chuyển đổi tín chỉ — Nguồn 3 "miễn theo chứng chỉ", 2026-09-10 —
// KHÔNG liên quan Ký điện tử Pha 2): value dropdown "Loại chứng chỉ" (DS_LOAI_CHUNG_CHI,
// thamDinhConfig.js) -> nhãn "LOẠI CHỨNG CHỈ" dùng để tra tab Sheet "MienTheoChungChi". HSK và
// HSKK CÙNG trỏ về 1 nhãn "Ngoại ngữ - Tiếng Trung" — chỉ tra bảng khi đã đủ CẢ HAI (xem
// tinhCacDongMienChungChi). GDQP cố ý KHÔNG có mặt ở đây — xử lý bằng quy tắc riêng
// (tinhDongMienGDQP), không tra bảng tĩnh nào.
export const NHAN_TRA_BANG_CHUNG_CHI = {
  NN_ANH: 'Ngoại ngữ - Tiếng Anh',
  NN_TRUNG_HSK: 'Ngoại ngữ - Tiếng Trung',
  NN_TRUNG_HSKK: 'Ngoại ngữ - Tiếng Trung',
  NN_NHAT: 'Ngoại ngữ - Tiếng Nhật',
  NN_HAN: 'Ngoại ngữ - Tiếng Hàn',
  NN_PHAP: 'Ngoại ngữ - Tiếng Pháp',
  BANG_NGANH_NN: 'Bằng TC/CĐ chuyên ngành Ngoại ngữ',
  TIN_HOC: 'Tin học',
  LLCT: 'LLCT',
};
// Các loại phải CÒN HẠN trong vòng 24 tháng kể từ ngày cấp (Điều 8-11 — Ngoại ngữ TRỪ tiếng
// Trung). Tiếng Trung/Bằng ngành NN/Tin học/LLCT không giới hạn hạn sử dụng.
export const LOAI_CAN_HAN_24_THANG = new Set(['NN_ANH', 'NN_NHAT', 'NN_HAN', 'NN_PHAP']);

// Số tháng ĐẦY ĐỦ giữa ngày cấp và hôm nay (âm nếu ngày cấp ở tương lai) — dùng so với 24
// tháng. Trả về null nếu ngayCapStr không đọc được thành ngày hợp lệ (OCR đọc rỗng/sai định
// dạng) — nơi gọi tự quyết định xử lý sao (không tự coi "không đọc được" là "còn hạn").
function soThangGiuaNgay(ngayCapStr, denNgay) {
  const ngayCap = new Date(ngayCapStr);
  if (isNaN(ngayCap.getTime())) return null;
  let thang = (denNgay.getFullYear() - ngayCap.getFullYear()) * 12 + (denNgay.getMonth() - ngayCap.getMonth());
  if (denNgay.getDate() < ngayCap.getDate()) thang -= 1;
  return thang;
}

// Nguồn 3 — áp dụng cho các chứng chỉ Ngoại ngữ/Tin học/LLCT/Bằng ngành NN (KHÔNG gồm GDQP,
// xem tinhDongMienGDQP riêng bên dưới). dsChungChiDaQuet: mảng các dòng đã OCR ở
// ThamDinhPage.jsx, mỗi dòng {loaiChungChiValue, ocrResult: {tenChungChi, mucDat, ngayCap,
// hoTen, nhanDienDung}, loi}. Cũng theo đúng nguyên tắc đã chốt "không giao AI quyết định
// chính sách" — AI (scanChungChi) chỉ trả dữ liệu đọc được, hàm NÀY (thuần JS) mới tự quyết
// định điều kiện -> hệ quả bằng cách tra dsMienTheoChungChi (tab Sheet "MienTheoChungChi").
export function tinhCacDongMienChungChi({ dsChungChiDaQuet, dsMienTheoChungChi, allChuan, tenDaDungTruoc }) {
  const daDung = tenDaDungTruoc || new Set();
  const rows = [];
  const canhBao = [];
  const hopLe = (dsChungChiDaQuet || []).filter((c) => c.ocrResult && !c.loi && c.loaiChungChiValue && c.loaiChungChiValue !== 'GDQP');
  if (hopLe.length === 0) return { rows, canhBao };

  const now = new Date();
  const chuanMap = new Map();
  (allChuan || []).forEach((c) => {
    const key = chuanHoaTenHocPhan(c.ten);
    if (key && !chuanMap.has(key)) chuanMap.set(key, c);
  });

  // Nhóm Tiếng Trung: cần ĐỦ CẢ HAI HSK + HSKK mới kích hoạt — chỉ có 1 trong 2 thì cảnh báo,
  // KHÔNG tự thêm miễn (đúng nguyên văn yêu cầu người dùng, 2026-09-10).
  const coHSK = hopLe.some((c) => c.loaiChungChiValue === 'NN_TRUNG_HSK');
  const coHSKK = hopLe.some((c) => c.loaiChungChiValue === 'NN_TRUNG_HSKK');
  if ((coHSK || coHSKK) && !(coHSK && coHSKK)) {
    canhBao.push('Tiếng Trung: Chưa đủ điều kiện, cần bổ sung đủ HSK và HSKK.');
  }

  const nhanDaXuLy = new Set(); // mỗi nhãn (LOẠI CHỨNG CHỈ) chỉ xử lý ĐÚNG 1 LẦN
  hopLe.forEach((c) => {
    const nhan = NHAN_TRA_BANG_CHUNG_CHI[c.loaiChungChiValue];
    if (!nhan || nhanDaXuLy.has(nhan)) return;

    if (c.loaiChungChiValue === 'NN_TRUNG_HSK' || c.loaiChungChiValue === 'NN_TRUNG_HSKK') {
      if (!(coHSK && coHSKK)) return; // chưa đủ bộ -> chưa kích hoạt, đã cảnh báo ở trên
    } else if (LOAI_CAN_HAN_24_THANG.has(c.loaiChungChiValue)) {
      const ngayCap = c.ocrResult?.ngayCap;
      const soThang = ngayCap ? soThangGiuaNgay(ngayCap, now) : null;
      if (soThang === null) {
        canhBao.push(`${nhan}: không đọc được ngày cấp trên ảnh — cán bộ tự kiểm tra hạn 24 tháng trước khi công nhận (chưa tự thêm miễn).`);
        return;
      } else if (soThang > 24) {
        canhBao.push(`${nhan}: chứng chỉ cấp ngày ${ngayCap} đã QUÁ HẠN 24 tháng — KHÔNG tự thêm miễn.`);
        return;
      }
    }
    nhanDaXuLy.add(nhan);

    const mucList = (dsMienTheoChungChi || []).filter((x) => x.loaiChungChi === nhan);
    if (mucList.length === 0) {
      canhBao.push(`${nhan}: chưa có dòng cấu hình miễn nào trong tab "MienTheoChungChi" — báo Admin bổ sung.`);
      return;
    }
    mucList.forEach((muc) => {
      const key = chuanHoaTenHocPhan(muc.tenHocPhan);
      const chuan = chuanMap.get(key);
      if (!chuan) { canhBao.push(`${nhan}: không khớp được học phần "${muc.tenHocPhan}" với khung CTĐT ngành.`); return; }
      if (daDung.has(key)) return; // đã được nguồn khác xử lý -> bỏ qua, tránh cộng trùng
      rows.push({
        nhom_mon: chuan.nhom_mon,
        mon_chuan: chuan.ten,
        tin_chi_chuan: muc.soTinChi,
        mon_da_hoc: `(Miễn theo chứng chỉ: ${nhan}${muc.diemQuyDoi ? ' — quy đổi ' + muc.diemQuyDoi + ' điểm' : ''})`,
        tin_chi_da_hoc: muc.soTinChi,
        ket_luan: 'Đạt',
        nguon: 'chung_chi',
      });
      daDung.add(key);
    });
  });

  return { rows, canhBao };
}

// Nguồn 3 — GDQP&AN (Điều 8): KHÔNG tra bảng tab "MienTheoChungChi" như các loại chứng chỉ
// khác — quy tắc do người dùng chốt trực tiếp (2026-09-10), gắn với BẬC văn bằng cũ đã tick ở
// Nguồn 2 CHỨ KHÔNG PHẢI 1 bảng tra cứu tĩnh:
// 1) Tick "Đại học" + bảng điểm CŨ (đã quét ở Nguồn 1) có môn GDQP -> tự thêm vào danh sách
//    MIỄN (kết luận "Đạt").
// 2) Tick "Cao đẳng"/"Trung cấp" + bảng điểm cũ có môn GDQP -> tự thêm vào danh sách CÔNG
//    NHẬN nhưng kết luận "Học bổ sung" (không miễn hoàn toàn).
// 3) Có upload chứng chỉ GDQP&AN riêng (Nguồn 3) mà 2 trường hợp trên KHÔNG áp dụng (chưa
//    tick văn bằng, hoặc bảng điểm cũ không có môn GDQP) -> vẫn thêm 1 dòng nhưng ghi chú
//    "Hỏi TTQP" (Trung tâm Giáo dục Quốc phòng) để cán bộ tự xác minh — hệ thống KHÔNG tự
//    quyết định miễn/không trong trường hợp này.
function timMonGDQPTrongDanhSach(list, tenKey) {
  return (list || []).find((x) => {
    const ten = normalizeText(x[tenKey]);
    return ten.includes('quoc phong') || ten.includes('an ninh');
  }) || null;
}
export function timMonGDQPTrongKhungCTDT(allChuan) { return timMonGDQPTrongDanhSach(allChuan, 'ten'); }
export function timMonGDQPTrongBangDiem(transcriptJSON) { return timMonGDQPTrongDanhSach(transcriptJSON, 'monhoc'); }

export function tinhDongMienGDQP({ mienVanBangCu, allChuan, transcriptJSON, coChungChiGDQPHopLe, tenDaDungTruoc }) {
  const daDung = tenDaDungTruoc || new Set();
  const chuan = timMonGDQPTrongKhungCTDT(allChuan);
  const key = chuan ? chuanHoaTenHocPhan(chuan.ten) : null;
  if (key && daDung.has(key)) return null; // đã được nguồn khác xử lý -> bỏ qua

  const daHocGDQP = timMonGDQPTrongBangDiem(transcriptJSON);
  if (mienVanBangCu && daHocGDQP) {
    const ketLuan = mienVanBangCu === 'Đại học' ? 'Đạt' : 'Học bổ sung';
    return {
      nhom_mon: chuan ? chuan.nhom_mon : '',
      mon_chuan: chuan ? chuan.ten : 'Giáo dục quốc phòng & An ninh',
      tin_chi_chuan: chuan ? chuan.tin_chi : (daHocGDQP.tinchi || 0),
      mon_da_hoc: `${daHocGDQP.monhoc} (theo bảng điểm cũ — văn bằng ${mienVanBangCu} đã có)`,
      tin_chi_da_hoc: daHocGDQP.tinchi || 0,
      ket_luan: ketLuan,
      nguon: 'chinh_sach',
    };
  }
  if (coChungChiGDQPHopLe) {
    return {
      nhom_mon: chuan ? chuan.nhom_mon : '',
      mon_chuan: chuan ? chuan.ten : 'Giáo dục quốc phòng & An ninh',
      tin_chi_chuan: chuan ? chuan.tin_chi : 0,
      mon_da_hoc: '(Đã nộp chứng chỉ GDQP&AN — hệ thống KHÔNG tự xác nhận, cần cán bộ kiểm tra)',
      tin_chi_da_hoc: 0,
      ket_luan: 'Học bổ sung',
      nguon: 'chung_chi',
      ghiChu: 'Hỏi TTQP',
    };
  }
  return null;
}

// Bỏ mọi dòng do Nguồn 2/3 tự thêm (chinh_sach/chung_chi), CHỈ giữ dòng Nguồn 1 (AI/gộp tay
// thủ công) — dùng làm "baseline gốc" trước khi tính lại toàn bộ các dòng tự động.
export function layNguon1ThuanTuy(list) {
  return (list || []).filter((m) => m.nguon !== 'chinh_sach' && m.nguon !== 'chung_chi');
}

// Hàm TỔNG HỢP — tính lại TOÀN BỘ các dòng "tự động" (Nguồn 2 + GDQP Điều 8 + Nguồn 3 chứng
// chỉ khác) trên CÙNG 1 baseline Nguồn 1, xử lý dedup XUYÊN SUỐT cả 3 nguồn (mỗi học phần chỉ
// tính 1 lần dù nhiều nguồn cùng "muốn" miễn nó — nguồn xử lý TRƯỚC giữ quyền, nguồn sau tự bỏ
// qua). Dùng CHUNG cho cả ThamDinhPage.jsx (khi tick/upload) và DoiSanhModal.jsx (khi Reset) —
// tránh 2 nơi tự viết lại thứ tự merge rồi lệch nhau theo thời gian.
export function tinhTatCaCacDongTuDong({ mienVanBangCu, dsMienVanBangCu, dsChungChiDaQuet, dsMienTheoChungChi, allChuan, transcriptJSON, baselineNguon1 }) {
  const canhBao = [];
  let daXuLy = baselineNguon1 || [];
  const rows = [];

  const { rows: rowsN2, khongKhop: khongKhopN2 } = tinhCacDongMienVanBangCu({
    loaiVanBang: mienVanBangCu, dsMienVanBangCu, allChuan,
    tenDaDungTruoc: layTenChuanDaDung(daXuLy),
  });
  rows.push(...rowsN2);
  daXuLy = [...daXuLy, ...rowsN2];
  if (mienVanBangCu && khongKhopN2.length > 0) {
    canhBao.push(`Miễn theo văn bằng cũ (${mienVanBangCu}): không tìm thấy trong khung CTĐT ngành: ${khongKhopN2.join(', ')}.`);
  }

  const coChungChiGDQPHopLe = (dsChungChiDaQuet || []).some((c) => c.loaiChungChiValue === 'GDQP' && c.ocrResult && !c.loi);
  const dongGDQP = tinhDongMienGDQP({
    mienVanBangCu, allChuan, transcriptJSON, coChungChiGDQPHopLe,
    tenDaDungTruoc: layTenChuanDaDung(daXuLy),
  });
  if (dongGDQP) {
    rows.push(dongGDQP);
    daXuLy = [...daXuLy, dongGDQP];
    if (dongGDQP.ghiChu) canhBao.push(`GDQP&AN: ${dongGDQP.ghiChu} — đã nộp chứng chỉ nhưng hệ thống không tự xác nhận được, cán bộ tự kiểm tra với Trung tâm GDQP.`);
  }

  const { rows: rowsN3, canhBao: canhBaoN3 } = tinhCacDongMienChungChi({
    dsChungChiDaQuet, dsMienTheoChungChi, allChuan,
    tenDaDungTruoc: layTenChuanDaDung(daXuLy),
  });
  rows.push(...rowsN3);
  canhBao.push(...canhBaoN3);

  return { rows, canhBao };
}

// Khoá ghép đôi CCCD + Ngành — nhận diện 1 hồ sơ duy nhất, khớp cách các GAS backend chống trùng
// ĐÃ SỬA (lỗi tick chọn 1 hồ sơ mà nhiều hồ sơ khác bị chọn/bỏ chọn theo): khi CCCD trống
// (hồ sơ thiếu dữ liệu/test), nhiều hồ sơ khác nhau có thể cùng ra khoá rỗng + cùng ngành
// (vd: "_công nghệ thông tin") -> selectedKeys.has(key) trả về true/false GIỐNG NHAU cho tất
// cả các hồ sơ đó, nên tick 1 dòng khiến các dòng còn lại cũng đổi trạng thái theo.
// Cách sửa: chỉ khi CCCD có giá trị mới dùng khoá cũ (cccd + "_" + ngành) — GIỮ NGUYÊN hành vi
// hiện tại (khớp với cách BE chống trùng theo CCCD+Ngành). Khi CCCD trống, ghép thêm các
// trường khác (họ tên, ngày sinh, SĐT, email, khóa) để giảm khả năng trùng khoá giữa các hồ sơ.
export function getRowKey(row) {
  const cccd = getVal(row, ["CĂN CƯỚC", "CCCD", "SỐ CCCD"]).replace(/^['"]+|['"]+$/g, '').trim();
  const nganh = getVal(row, ["NGÀNH", "NGÀNH ĐÀO TẠO"]).trim().toLowerCase();
  if (cccd) return cccd + "_" + nganh;
  const hoTen = normalizeText(getVal(row, ["TÊN SINH VIÊN", "HỌ VÀ TÊN"]));
  const ngaySinh = getVal(row, ["NGÀY SINH", "NGÀNH SINH"]).trim();
  const sdt = getVal(row, ["SỐ ĐIỆN THOẠI", "SĐT", "ĐIỆN THOẠI"]).trim();
  const email = getVal(row, ["EMAIL"]).trim().toLowerCase();
  const khoa = getVal(row, ["KHÓA"]).trim();
  return ["", nganh, hoTen, ngaySinh, sdt, email, khoa].join("_");
}

export function generateMaSV(row) {
  const namTuyen = getVal(row, ["NĂM XÉT TUYỂN", "Năm xét tuyển"]) || new Date().getFullYear();
  const heDaoTao = getVal(row, ["HỆ ĐÀO TẠO", "Hệ đào tạo"]);
  const hinhThuc = getVal(row, ["HÌNH THỨC ĐÀO TẠO", "Hình thức đào tạo"]);
  const cccd = getVal(row, ["CĂN CƯỚC", "CCCD", "SỐ CCCD"]) || "";
  const maNam = String(namTuyen).slice(-2);
  const maHe = MAP_HE_DAO_TAO[heDaoTao] || "00";
  const maHinhThuc = MAP_HINH_THUC[hinhThuc] || "0";
  const maCCCD = cccd.slice(-6);
  return `${maNam}${maHe}${maHinhThuc}${maCCCD}`;
}

// Trả về { value, combo, unit, empty } thay vì chuỗi HTML dựng sẵn như bản cũ —
// component tự quyết định cách hiển thị (JSX), tránh phải escape/dangerouslySetInnerHTML.
export function getBestScore(row) {
  const dtDauVao = getVal(row, ["ĐỐI TƯỢNG ĐẦU VÀO", "ĐỐI TƯỢNG"]);
  if (dtDauVao === "Tốt nghiệp THPT") {
    const nganh = getVal(row, ["NGÀNH", "NGÀNH ĐÀO TẠO"]);
    const diemCong = parseFloat(getVal(row, ["ĐIỂM CỘNG"]).replace(',', '.')) || 0;
    const kvVal = getVal(row, ["KHU VỰC ƯU TIÊN"]);
    const dtVal = getVal(row, ["ĐỐI TƯỢ ƯU TIÊN", "ĐỐI TƯỢNG ƯU TIÊN"]);
    // ĐÃ SỬA (theo phản hồi — chặn khu vực ưu tiên theo năm tốt nghiệp THPT): xem chú thích
    // đầy đủ tại biChanKhuVucUTTheoNamTN_TD phía trên — chặn cả khi cột "KHU VỰC ƯU TIÊN" trên
    // sheet có giá trị nhưng "NĂM TỐT NGHIỆP THPT" khớp mốc "Trước...".
    const namTotNghiepVal = getVal(row, ["NĂM TỐT NGHIỆP THPT"]);
    const uTienBanDau = (biChanKhuVucUTTheoNamTN_TD(namTotNghiepVal) ? 0 : (DICT_KHU_VUC[kvVal] || 0)) + (DICT_DOI_TUONG[dtVal] || 0);

    const combos = DICT_NGANH[nganh] || [];
    let maxScore = 0; let bestCombo = "";
    combos.forEach(maToHop => {
      const subjects = DICT_TO_HOP[maToHop];
      if (subjects) {
        const s1 = parseFloat(getVal(row, [SUBJ_MAP[subjects[0]]]).replace(',', '.')) || 0;
        const s2 = parseFloat(getVal(row, [SUBJ_MAP[subjects[1]]]).replace(',', '.')) || 0;
        const s3 = parseFloat(getVal(row, [SUBJ_MAP[subjects[2]]]).replace(',', '.')) || 0;
        const total = s1 + s2 + s3;
        if (s1 > 0 && s2 > 0 && s3 > 0 && total > maxScore) { maxScore = total; bestCombo = maToHop; }
      }
    });

    if (maxScore > 0) {
      const finalUTien = maxScore >= 22.5 ? ((30 - maxScore) / 7.5) * uTienBanDau : uTienBanDau;
      const finalTotalScore = (maxScore + finalUTien + diemCong).toFixed(2);
      return { empty: false, value: finalTotalScore, combo: bestCombo, unit: "" };
    }
    return { empty: true, message: "Chưa đủ điểm" };
  } else {
    const h4 = getVal(row, ["ĐIỂM TB TOÀN KHÓA HỆ 4"]);
    const h10 = getVal(row, ["ĐIỂM TB TOÀN KHÓA HỆ 10"]);
    if (h4) return { empty: false, value: h4, combo: "", unit: "Hệ 4" };
    if (h10) return { empty: false, value: h10, combo: "", unit: "Hệ 10" };
    return { empty: true, message: "Chưa có điểm" };
  }
}

export function getRawScoreNumber(row) {
  const score = getBestScore(row);
  if (score.empty) return 0;
  return parseFloat(score.value) || 0;
}

// ĐÃ VÁ BUG (nguyên nhân hồ sơ MỚI đẩy lên không hiện trong bảng Thẩm định): cột
// "TIME" thực tế đang lưu theo thứ tự GIỜ TRƯỚC NGÀY — "hh:mm:ss dd/mm/yyyy" (đúng
// như yêu cầu giữ nguyên, KHÔNG đổi định dạng lưu). Code cũ lấy .split(' ')[0] —
// token ĐẦU TIÊN — tưởng đó là phần ngày, nhưng token đầu thực ra là "hh:mm:ss"
// (chỉ có dấu ':', không có '/' lẫn '-') -> if/else if bên dưới luôn rớt xuống
// "return 0". Ở filteredData (ThamDinhPage.jsx), rowDateMs === 0 bị coi là "không
// có ngày hợp lệ" và LOẠI HẲN dòng đó khỏi bảng mỗi khi có bộ lọc ngày đang áp dụng
// — mà bộ lọc ngày mặc định LUÔN bật (7 ngày trước -> hôm nay), nên mọi hồ sơ mới
// đẩy lên đều biến mất, trong khi 1 số hồ sơ cũ (có thể do cột TIME của chúng từng
// bị Google Sheet tự nhận thành kiểu Date, được backend getThamDinhData tự format
// lại thành "dd/mm/yyyy" không có giờ) lại tình cờ parse đúng nên vẫn hiện ra.
// Giờ tìm ĐÚNG token có chứa '/' hoặc '-' ở bất kỳ vị trí nào trong chuỗi (không
// giả định thứ tự) — vừa fix hồ sơ mới, vừa tương thích ngược với hồ sơ cũ.
export function getRawDateNumber(row) {
  const raw = getVal(row, ["TIME", "NGÀY NỘP", "NGÀY XỬ LÝ"]).trim();
  if (!raw) return 0;
  const dateToken = raw.split(' ').find(p => p.includes('/') || p.includes('-')) || '';
  if (dateToken.includes('-')) { const p = dateToken.split('-'); return new Date(p[0], p[1] - 1, p[2]).getTime(); }
  if (dateToken.includes('/')) { const p = dateToken.split('/'); return new Date(p[2], p[1] - 1, p[0]).getTime(); }
  return 0;
}

// Danh sách tên giấy tờ còn thiếu (không tính loại đã bị huỷ ở repo Xét tuyển)
export function getMissingDocs(row) {
  const dtDauVao = getVal(row, ["ĐỐI TƯỢNG ĐẦU VÀO", "ĐỐI TƯỢNG"]);
  const dsTienQuyet = DICT_HO_SO.tien_quyet[dtDauVao] || [];
  const dsChung = DICT_HO_SO.chung || [];
  const missing = [];

  [...dsChung, ...dsTienQuyet].forEach(doc => {
    if (isDocDaHuy(doc)) return;
    let keysToCheck = [doc.name];
    if (doc.id === 'doc_cccd') keysToCheck = ["BẢN SAO ID", "BẢN SAO CCCD", "BẢN SAO CĂN CƯỚC"];
    if (doc.id === 'doc_phieu_dk') keysToCheck = ["PHIẾU ĐĂNG KÝ DỰ TUYỂN", "PHIẾU ĐK"];
    if (doc.id === 'doc_syll') keysToCheck = ["SƠ YẾU LÝ LỊCH", "SYLL"];

    const val = getVal(row, keysToCheck).toUpperCase();
    if (val !== "TRUE" && val !== "1" && val !== "V" && val !== "X" && val !== "CÓ") {
      missing.push(doc.name);
    }
  });
  return missing;
}

// Chỉ quét lỗi hồ sơ TIÊN QUYẾT (dùng để khoá nút Duyệt ở Pha 4 sau này)
export function getMissingTienQuyet(row) {
  const dtDauVao = getVal(row, ["ĐỐI TƯỢNG ĐẦU VÀO", "ĐỐI TƯỢNG"]);
  const dsTienQuyet = DICT_HO_SO.tien_quyet[dtDauVao] || [];
  const missingTQ = [];
  dsTienQuyet.forEach(doc => {
    if (isDocDaHuy(doc)) return;
    const val = getVal(row, [doc.name]).toUpperCase();
    if (val !== "TRUE" && val !== "1" && val !== "V" && val !== "X" && val !== "CÓ") {
      missingTQ.push(doc.name);
    }
  });
  return missingTQ;
}

// Xác định trạng thái thẩm định (_appState) từ cột TRẠNG THÁI THẨM ĐỊNH/TRẠNG THÁI
// ĐÃ THÊM: nhận diện "Đã trúng tuyển" — trạng thái riêng của luồng Thu hồ sơ trực tiếp
// (trang Nhập học, KÊNH NỘP = "Thu hồ sơ trực tiếp"), KHÔNG qua thẩm định/duyệt như Xét
// tuyển. Trước đây giá trị này rơi vào default "Đang chờ duyệt" — khiến hồ sơ đã trúng
// tuyển sẵn hiện lẫn trong hàng chờ duyệt như hồ sơ Xét tuyển mới, dễ bị thao tác nhầm.
export function getAppState(row) {
  const trangThai = getVal(row, ["TRẠNG THÁI THẨM ĐỊNH", "TRẠNG THÁI"]);
  if (trangThai.includes("Đã trúng tuyển")) return "Đã trúng tuyển";
  if (trangThai.includes("Đã duyệt")) return "Đã duyệt";
  if (trangThai.includes("Đã báo thiếu")) return "Đã báo thiếu";
  if (trangThai.includes("Mới bổ sung")) return "Mới bổ sung";
  return "Đang chờ duyệt";
}

// ĐÃ THÊM: điểm chuẩn nhánh "Tốt nghiệp THPT" giờ KHÁC NHAU theo "PHƯƠNG THỨC XÉT
// TUYỂN" (trước đây hardcode chung 1 mức 15.0 cho cả 3 phương thức — SAI, theo yêu cầu
// thực tế: Điểm thi THPT = 15, Điểm học bạ (thường) = 16, Điểm học bạ (TBTS 2025) = 15).
// GIỮ ĐỒNG BỘ với bảng tương tự bên XetTuyenPage.jsx (dùng cho bảng xem trước lúc nhập
// tay) — đổi mức điểm chuẩn thì phải đổi ở CẢ 2 nơi.
const DIEM_CHUAN_THPT = { THI_THPT: 15, HOC_BA: 16, HOC_BA_2025: 15 };

// ĐÃ THÊM (theo phản hồi — Thông tư về tuyển sinh đại học mới áp dụng từ 15/2/2026: khu vực
// ưu tiên bị giới hạn theo năm tốt nghiệp THPT). "ĐỘC LẬP NHƯNG ĐỒNG BỘ" với XetTuyenPage.jsx
// (xem NTN_THPT_TRUOC/NTN_THPT_TU/biChanKhuVucUTTheoNamTN ở đó) — file này không import trực
// tiếp từ XetTuyenPage.jsx (không thuộc cùng "module dùng chung" nào cả) nên phải tự khai báo
// lại Y HỆT: mốc năm = năm dương lịch thực tế lúc chạy trừ đi 1 (KHÔNG hardcode cố định 1
// năm). Đổi công thức/nhãn thì phải đổi ở CẢ 2 nơi.
// Đây chính là "lớp phòng thủ thứ 2" theo đúng yêu cầu gốc: trang Thẩm định đọc THẲNG dữ liệu
// Trung Gian (không qua form Xét tuyển), nên hồ sơ nào bị ai đó sửa trực tiếp cột "KHU VỰC ƯU
// TIÊN" trên sheet (bỏ qua form) vẫn bị chặn cộng điểm ở đây, miễn cột "NĂM TỐT NGHIỆP THPT"
// của dòng đó khớp mốc "Trước...".
const MOC_NAM_TN_THPT_TD = new Date().getFullYear() - 1;
const NTN_THPT_TRUOC_TD = `Trước ${MOC_NAM_TN_THPT_TD}`;
const biChanKhuVucUTTheoNamTN_TD = (namTotNghiep) => String(namTotNghiep || '').trim() === NTN_THPT_TRUOC_TD;

// Suy ra khoá phương thức (THI_THPT/HOC_BA/HOC_BA_2025) từ nhãn tiếng Việt lưu trên
// cột "PHƯƠNG THỨC XÉT TUYỂN" (hoặc chính khoá đó, phòng khi có nơi lưu thẳng khoá).
// Trả về "" nếu không nhận diện được (hồ sơ cũ chưa có cột này, hoặc bị bỏ trống lúc
// import) — nơi gọi phải tự xử lý trường hợp không rõ phương thức, KHÔNG được mặc định
// ngầm 1 mức điểm chuẩn nào cả (dễ khiến người thẩm định hiểu nhầm là điểm chuẩn thật).
// ĐÃ SỬA (theo phản hồi — modal thẩm định hiện "chưa rõ Phương thức xét tuyển" dù bên
// Xét tuyển đã chọn đúng "Điểm học bạ"): trước đây so khớp CHÍNH XÁC TỪNG KÝ TỰ (kể cả
// hoa/thường, dấu câu) với đúng 3 chuỗi XetTuyenPage.jsx tự sinh ra — nhập tay qua dropdown
// luôn ra đúng 1 trong 3 chuỗi đó nên khớp được, NHƯNG cột "PHƯƠNG THỨC XÉT TUYỂN" này lại
// KHÔNG nằm trong danh sách "dropdownColumns" của file mẫu Excel (xem handleDownloadTemplate),
// tức là lúc IMPORT EXCEL người nhập liệu gõ tay hoàn toàn tự do — chỉ cần lệch 1 chút (viết
// hoa/thường khác, thừa/thiếu khoảng trắng, gõ "Học bạ" thay vì "Điểm học bạ"...) là so khớp
// chính xác trượt ngay, ra "" (không nhận diện được) dù ý người dùng rất rõ ràng. Giờ dùng
// normalizeText() (đã có sẵn trong file này, bỏ dấu + hạ chữ thường + gọn khoảng trắng) rồi
// dò theo TỪ KHOÁ thay vì so khớp nguyên văn — chấp nhận mọi biến thể hoa/thường/dấu câu,
// miễn còn giữ đúng cụm từ khoá gốc. Vẫn ưu tiên nhận thẳng khi có nơi lưu sẵn đúng khoá kỹ
// thuật (THI_THPT/HOC_BA/HOC_BA_2025, không qua normalize vì đây là khoá cố định, không phải
// nhãn tiếng Việt tự do).
function suyRaPhuongThuc(row) {
  const raw = getVal(row, ["PHƯƠNG THỨC XÉT TUYỂN", "LOẠI ĐIỂM"]);
  if (!raw) return "";
  if (raw === "THI_THPT" || raw === "HOC_BA" || raw === "HOC_BA_2025") return raw;
  const chuan = normalizeText(raw);
  // ĐÃ THÊM (theo phản hồi): bên XetTuyenPage.jsx, khi hồ sơ Học bạ (thường) có nhập Điểm
  // phỏng vấn (PV), cột "PHƯƠNG THỨC XÉT TUYỂN" trên Goc01 giờ được ghi thẳng thành "Phỏng
  // vấn" thay vì "Điểm học bạ" (để nhận ra ngay trên sheet hồ sơ nào có phỏng vấn) — bản
  // chất VẪN LÀ phương thức Học bạ (điểm chuẩn 16, được cộng PV), nên nhận diện "phong van"
  // TRẢ VỀ THẲNG "HOC_BA" ở đây — không cần thêm khoá/nhánh tính điểm riêng nào khác, mọi
  // logic dùng phuongThuc === 'HOC_BA' (điểm chuẩn, điều kiện cộng PV...) tự động đúng.
  if (chuan.includes("phong van")) return "HOC_BA";
  if (chuan.includes("hoc ba")) {
    // "TBTS" (viết tắt "tổng bình quân trung sinh"/tên gọi riêng của phương thức mới,
    // dùng thống nhất với XetTuyenPage.jsx) hoặc năm "2025" đi kèm -> phương thức mới.
    return (chuan.includes("tbts") || chuan.includes("2025")) ? "HOC_BA_2025" : "HOC_BA";
  }
  if (chuan.includes("thi thpt") || chuan.includes("diem thi")) return "THI_THPT";
  return "";
}

// ĐÃ THÊM (Pha 5): bản mở rộng của getBestScore() — dùng cho panel điểm chi tiết
// trong modal (bảng từng tổ hợp + trạng thái Đạt/Trượt), hỗ trợ "khảo sát ngành
// khác" (targetNganh khác ngành đăng ký thật của thí sinh) — port từ
// calculateAndRenderScores() trong app.js cũ, trả dữ liệu thuần thay vì HTML dựng
// sẵn để component tự render qua JSX.
export function calculateScores(row, targetNganh) {
  const dtDauVao = getVal(row, ["ĐỐI TƯỢNG ĐẦU VÀO", "ĐỐI TƯỢNG"]);
  const diemCong = parseFloat(getVal(row, ["ĐIỂM CỘNG"]).replace(',', '.')) || 0;
  const kvVal = getVal(row, ["KHU VỰC ƯU TIÊN"]);
  const dtVal = getVal(row, ["ĐỐI TƯỢ ƯU TIÊN", "ĐỐI TƯỢNG ƯU TIÊN"]);
  // ĐÃ SỬA (theo phản hồi — chặn khu vực ưu tiên theo năm tốt nghiệp THPT): xem chú thích
  // đầy đủ tại biChanKhuVucUTTheoNamTN_TD phía trên (cùng lý do với getBestScore ở trên).
  const namTotNghiepVal = getVal(row, ["NĂM TỐT NGHIỆP THPT"]);
  // ĐÃ SỬA (Ký điện tử Pha 1 — Bước 4, theo yêu cầu bổ sung placeholder GBTT): tách
  // riêng 2 thành phần khu vực/đối tượng (trước đây cộng gộp thẳng vào uTienBanDau) —
  // Giấy báo trúng tuyển cần hiện RIÊNG "điểm ưu tiên khu vực" và "điểm ưu tiên đối
  // tượng", không chỉ tổng. Giữ NGUYÊN uTienBanDau = tổng 2 thành phần (không đổi kết
  // quả finalTotalScore hiện có ở dưới).
  const diemKhuVucRaw = biChanKhuVucUTTheoNamTN_TD(namTotNghiepVal) ? 0 : (DICT_KHU_VUC[kvVal] || 0);
  const diemDoiTuongRaw = DICT_DOI_TUONG[dtVal] || 0;
  const uTienBanDau = diemKhuVucRaw + diemDoiTuongRaw;

  if (dtDauVao === "Tốt nghiệp THPT") {
    const combos = DICT_NGANH[targetNganh] || [];
    const comboResults = [];
    let maxScore = 0; let bestCombo = "";

    combos.forEach(maToHop => {
      const subjects = DICT_TO_HOP[maToHop];
      if (subjects) {
        const s1 = parseFloat(getVal(row, [SUBJ_MAP[subjects[0]]]).replace(',', '.')) || 0;
        const s2 = parseFloat(getVal(row, [SUBJ_MAP[subjects[1]]]).replace(',', '.')) || 0;
        const s3 = parseFloat(getVal(row, [SUBJ_MAP[subjects[2]]]).replace(',', '.')) || 0;
        const total = s1 + s2 + s3;
        comboResults.push({ combo: maToHop, s1, s2, s3, total });
        if (s1 > 0 && s2 > 0 && s3 > 0 && total > maxScore) { maxScore = total; bestCombo = maToHop; }
      }
    });

    if (maxScore > 0) {
      const finalUTien = maxScore >= 22.5 ? ((30 - maxScore) / 7.5) * uTienBanDau : uTienBanDau;
      // ĐÃ SỬA: điểm chuẩn giờ tra theo phương thức xét tuyển thay vì hardcode 15.0 —
      // xem DIEM_CHUAN_THPT/suyRaPhuongThuc phía trên. Hồ sơ không xác định được phương
      // thức (cột trống/giá trị lạ) -> diemChuan = null, diemChuanLabel hiện rõ "chưa rõ
      // phương thức" thay vì âm thầm coi như 15 hay 16 — để người thẩm định tự đối chiếu.
      // ĐÃ CHUYỂN LÊN TRƯỚC finalTotalScore (trước đây tính SAU) — cần biết phuongThuc
      // rồi mới quyết định có cộng Điểm phỏng vấn (PV) vào finalTotalScore hay không, xem
      // ngay bên dưới.
      const phuongThuc = suyRaPhuongThuc(row);
      const diemChuan = phuongThuc ? DIEM_CHUAN_THPT[phuongThuc] : null;
      const diemChuanLabel = diemChuan != null ? String(diemChuan) : "15 hoặc 16 (chưa rõ Phương thức xét tuyển)";

      // ĐÃ VÁ BUG THẬT (theo phản hồi — modal thẩm định chi tiết chỉ hiện điểm tổ hợp,
      // chưa cộng Điểm phỏng vấn): bên XetTuyenPage.jsx (phương thức "Điểm học bạ"), khi
      // (điểm tổ hợp cao nhất + điểm cộng + điểm ưu tiên) nằm trong khoảng đủ điều kiện, ô
      // "ĐIỂM PV" hiện ra và được cộng thêm vào điểm xét tuyển cuối cùng (tối đa 2 điểm) —
      // nhưng calculateScores() ở đây (dùng cho modal thẩm định + panel tổ hợp) trước giờ
      // CHƯA BAO GIỜ tính tới PV, dù cột "ĐIỂM PHỎNG VẤN" đã có sẵn trên Goc01 — khiến điểm
      // xét tuyển hiển thị/dùng để xét Đạt-Trượt ở đây LUÔN THIẾU đúng phần PV so với công
      // thức thật, có thể khiến 1 hồ sơ biên (sát điểm chuẩn) bị đánh giá TRƯỢT oan trong
      // khi thực ra đã ĐẠT nhờ PV.
      // Áp ĐÚNG 1 điều kiện duy nhất, khớp y hệt XetTuyenPage.jsx: chỉ cộng PV khi phương
      // thức là "Điểm học bạ" (HOC_BA, không áp dụng THI_THPT/HOC_BA_2025) VÀ (điểm TỔ HỢP
      // CAO NHẤT + ĐIỂM CỘNG + ĐIỂM ƯU TIÊN) BẰNG 15 ĐẾN DƯỚI 16 (>= 15 và < 16) — ĐÃ SỬA
      // theo phản hồi 2 lần: (1) trước đây để NGHIÊM NGẶT > 15, tức đúng 15.0 bị loại oan;
      // giờ 15.0 vẫn được tính, chỉ đúng 16.0 là bị loại; (2) tổng dùng để so ngưỡng trước
      // đây THIẾU HẲN Điểm ưu tiên (finalUTien), chỉ mới Tổ hợp + Điểm cộng — SAI theo đúng
      // yêu cầu gốc, giờ đã cộng thêm finalUTien vào tổng này. Tối đa 2 điểm PV.
      const diemPhongVanRaw = parseFloat(getVal(row, ["ĐIỂM PHỎNG VẤN", "ĐIỂM PV"]).replace(',', '.')) || 0;
      const tongDiemXetPV = maxScore + diemCong + finalUTien;
      const diemPhongVan = (phuongThuc === 'HOC_BA' && tongDiemXetPV >= 15 && tongDiemXetPV < 16)
        ? Math.min(Math.round(diemPhongVanRaw * 100) / 100, 2)
        : 0;
      const finalTotalScore = (maxScore + finalUTien + diemCong + diemPhongVan).toFixed(2);

      // ĐÃ THÊM (Ký điện tử Pha 1 — Bước 4): quy đổi lại 2 thành phần khu vực/đối tượng
      // theo ĐÚNG tỉ lệ đã áp dụng cho finalUTien (công thức giảm dần khi maxScore >=
      // 22.5 — xem finalUTien phía trên) — để diemUuTienKhuVuc + diemUuTienDoiTuong
      // LUÔN CỘNG LẠI ĐÚNG BẰNG finalUTien đã thực tế cộng vào điểm trúng tuyển, không
      // in ra 2 con số khu vực/đối tượng "thô" rồi lệch với tổng thật trên GBTT.
      const heSoQuyDoiUuTien = uTienBanDau > 0 ? finalUTien / uTienBanDau : 1;
      const diemUuTienKhuVuc = Math.round(diemKhuVucRaw * heSoQuyDoiUuTien * 100) / 100;
      const diemUuTienDoiTuong = Math.round(diemDoiTuongRaw * heSoQuyDoiUuTien * 100) / 100;

      // ĐÃ THÊM (theo phản hồi — "check bằng cách nào không?" khi PV không lên điểm): trả
      // thêm "maxScore" (điểm tổ hợp thô, trước ưu tiên/điểm cộng/PV) và "diemPhongVanRaw"
      // (giá trị PV ĐÃ NHẬP trên cột "ĐIỂM PHỎNG VẤN", BẤT KỂ có đủ điều kiện cộng hay
      // không) — khác với "diemPhongVan" (giá trị PV THỰC SỰ được cộng vào điểm, 0 nếu
      // chưa đủ điều kiện). Có cả 2 con số này, ThamDinhPage.jsx tự so sánh và hiện luôn
      // 1 dòng giải thích ngay trong modal khi hồ sơ có nhập PV nhưng chưa được cộng — tự
      // trả lời "vì sao" mà không cần dò code, xem đoạn hiển thị "diemPhongVanRaw > 0 &&
      // diemPhongVan === 0" bên ThamDinhPage.jsx.
      return {
        type: 'thpt', hasScore: true, diemCong, uuTien: finalUTien, diemPhongVan, diemPhongVanRaw, maxScore,
        finalTotalScore, bestCombo, comboResults, phuongThuc, diemChuanLabel, diemChuan,
        dat: diemChuan != null ? parseFloat(finalTotalScore) >= diemChuan : null,
        diemUuTienKhuVuc, diemUuTienDoiTuong, // ĐÃ THÊM (Bước 4) — xem chú thích ở heSoQuyDoiUuTien phía trên
      };
    }
    return { type: 'thpt', hasScore: false, comboResults: [] };
  } else {
    const h4 = getVal(row, ["ĐIỂM TB TOÀN KHÓA HỆ 4"]);
    const h10 = getVal(row, ["ĐIỂM TB TOÀN KHÓA HỆ 10"]);
    let dtbLabel = "ĐTB Hệ 4 / Hệ 10"; let dtbVal = "Chưa nhập điểm"; let diemChuanText = "-";
    if (h4 && !h10) { dtbLabel = "ĐTB Hệ 4"; dtbVal = h4; diemChuanText = "02"; }
    else if (h10 && !h4) { dtbLabel = "ĐTB Hệ 10"; dtbVal = h10; diemChuanText = "05"; }
    else if (h4 && h10) { dtbLabel = "ĐTB Hệ 4 / Hệ 10"; dtbVal = `${h4} / ${h10}`; diemChuanText = "Hệ 4: 02 | Hệ 10: 05"; }
    return { type: 'other', diemCong, uuTien: uTienBanDau, dtbLabel, dtbVal, diemChuanText };
  }
}

// Chỉ mở link nếu đúng domain Google Drive/Docs — chống mở link độc hại nếu dữ liệu
// Sheet (do thí sinh tự nhập) bị chèn link lạ.
export function isSafeDriveUrl(url) {
  if (!url) return false;
  if (!/^https:\/\//i.test(url)) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return ALLOWED_LINK_HOSTS.some(h => host === h || host.endsWith("." + h));
  } catch (e) {
    return false;
  }
}

// Khoá dùng để lưu/khôi phục kết quả quét bảng điểm + đối sánh CTĐT riêng cho từng
// hồ sơ (ưu tiên CCCD, hồ sơ thiếu CCCD thì dùng Họ tên + TIME làm khoá dự phòng).
export function getCandidateScanKey(row) {
  const cccd = getVal(row, ["CĂN CƯỚC", "CCCD", "SỐ CCCD"]).replace(/^['"]+|['"]+$/g, '').trim();
  if (cccd) return cccd;
  return (getVal(row, ["TÊN SINH VIÊN", "HỌ VÀ TÊN"]) + "|" + getVal(row, ["TIME"])).trim();
}