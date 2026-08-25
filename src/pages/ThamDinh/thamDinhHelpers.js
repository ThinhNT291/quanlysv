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

// Khoá ghép đôi CCCD + Ngành — nhận diện 1 hồ sơ duy nhất, khớp cách các GAS backend chống trùng
export function getRowKey(row) {
  const cccd = getVal(row, ["CĂN CƯỚC", "CCCD", "SỐ CCCD"]).replace(/^['"]+|['"]+$/g, '').trim();
  const nganh = getVal(row, ["NGÀNH", "NGÀNH ĐÀO TẠO"]).trim().toLowerCase();
  return cccd + "_" + nganh;
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
    const uTienBanDau = (DICT_KHU_VUC[kvVal] || 0) + (DICT_DOI_TUONG[dtVal] || 0);

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
export function getAppState(row) {
  const trangThai = getVal(row, ["TRẠNG THÁI THẨM ĐỊNH", "TRẠNG THÁI"]);
  if (trangThai.includes("Đã duyệt")) return "Đã duyệt";
  if (trangThai.includes("Đã báo thiếu")) return "Đã báo thiếu";
  if (trangThai.includes("Mới bổ sung")) return "Mới bổ sung";
  return "Đang chờ duyệt";
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
  const uTienBanDau = (DICT_KHU_VUC[kvVal] || 0) + (DICT_DOI_TUONG[dtVal] || 0);

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
      const finalTotalScore = (maxScore + finalUTien + diemCong).toFixed(2);
      return {
        type: 'thpt', hasScore: true, diemCong, uuTien: finalUTien,
        finalTotalScore, bestCombo, comboResults, dat: parseFloat(finalTotalScore) >= 15.0,
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