import axios from 'axios';

// ĐÃ THÊM (phát hiện khi test Ký điện tử Pha 2 — Bước 3, ký song song): trước đây KHÔNG
// đặt timeout nào cả — 1 request treo (GAS xử lý chậm/xếp hàng) sẽ nằm chờ VÔ HẠN, chiếm
// 1 kết nối trong pool của trình duyệt, cộng dồn theo thời gian nếu người dùng cứ F5/đổi
// tab liên tục (mỗi lần lại bắn thêm request mới trong khi request cũ còn treo đó) — góp
// phần vào hiện tượng nhiều request "Blocked"/"CORS Failed" dồn ứ thấy trên Network tab.
// Đặt timeout hợp lý (45s — GAS vốn có thể chậm vài chục giây khi đang bận, không đặt
// quá ngắn kẻo huỷ oan request đang xử lý bình thường) để request treo tự báo lỗi và giải
// phóng, thay vì nằm im mãi.
axios.defaults.timeout = 45000;

// DÁN LINK GOOGLE APPS SCRIPT (WEB APP URL) CỦA ÔNG VÀO ĐÂY
// ĐÃ SỬA (Pha 6 — rà soát cutover): thêm "export" để LoginPage.jsx dùng chung đúng
// 1 hằng số này, thay vì tự khai báo WEB_APP_URL riêng — trước đây 2 file có 2 hằng
// số URL trùng giá trị nhưng tách rời nhau, dễ quên đồng bộ khi đổi deployment URL.
export const GAS_URL = 'https://script.google.com/macros/s/AKfycbzkp4Nqb3kP3DjEGBucxLKPDgQamDMO8mQOOCg71_a_iHqnmuGWjU54e-QvxNGzELN9/exec';

// ĐÃ THÊM: bắt lỗi 401 (chưa đăng nhập / hết phiên) ở MỘT CHỖ DUY NHẤT, áp dụng cho
// mọi lời gọi GAS trong file này — thay vì mỗi hàm phải tự kiểm tra riêng. Lưu ý: Apps
// Script Web App luôn trả HTTP 200 thật (không set được mã HTTP khác), lỗi/quyền nằm
// trong field "code" của JSON trả về — nên phải đọc response.data.code, không phải
// response.status. Chỉ code 401 (chưa đăng nhập/hết phiên) mới ép đăng xuất; code 403
// (có đăng nhập nhưng sai quyền hành động cụ thể) để nguyên cho từng hàm tự báo lỗi.
axios.interceptors.response.use((response) => {
  if (response.data && response.data.code === 401) {
    localStorage.removeItem('tuyensinh_user');
    window.dispatchEvent(new CustomEvent('app:session-expired', {
      detail: { message: response.data.message || 'Phiên đăng nhập đã hết hạn.' }
    }));
  }
  return response;
});

// ĐÃ THÊM: đa số action GAS giờ bắt buộc idToken (Google) HOẶC sessionToken (tài
// khoản nội bộ) — hàm này lấy 1 trong 2 thứ đang lưu trong localStorage (App.jsx
// ghi field "credential" cho Google, "sessionToken" cho tài khoản nội bộ) để đính
// kèm vào mọi request. Chỉ 1 trong 2 field có giá trị tuỳ loại tài khoản đăng nhập.
const getAuthParams = () => {
  try {
    const saved = localStorage.getItem('tuyensinh_user');
    if (!saved) return { idToken: '', sessionToken: '' };
    const user = JSON.parse(saved);
    return { idToken: user.credential || '', sessionToken: user.sessionToken || '' };
  } catch (e) {
    return { idToken: '', sessionToken: '' };
  }
};
// ==========================================
// ĐÃ XOÁ: PHẦN 1 (API QUẢN LÝ SINH VIÊN — fetchStudents/addStudent/deleteStudent/
// updateStudent, ghi thẳng sheet "SinhVien") và PHẦN 2 (API QUẢN LÝ GIẤY TỜ —
// fetchDocuments/toggleDocument/toggleStatusStudent, ghi thẳng sheet "GiayTo").
// Đã xác nhận không còn StudentTable.jsx/DocumentList.jsx/component nào import các
// hàm này nữa — trang Thu hồ sơ giờ dùng nhóm API "Trung Gian" ở PHẦN 3B bên dưới
// (fetchAdmissions/addAdmission/updateAdmission/deleteAdmission/toggleAdmissionField/
// importAdmissions). 2 sheet "SinhVien"/"GiayTo" phía Google Sheets có thể đổi tên
// sang dạng lưu trữ (VD "SinhVien_OLD_ARCHIVE") để giữ 1 thời gian an toàn trước khi
// xoá hẳn.
// ==========================================

// ==========================================
// PHẦN 3: API TIỆN ÍCH NÂNG CAO
// ==========================================

// ĐÃ THÊM (Pha 3 roadmap): lấy toàn bộ hồ sơ cho trang Thẩm định
export const fetchThamDinhData = async () => {
  const auth = getAuthParams();
  const response = await axios.get(`${GAS_URL}?action=getThamDinhData&idToken=${encodeURIComponent(auth.idToken)}&sessionToken=${encodeURIComponent(auth.sessionToken)}`);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi lấy dữ liệu Thẩm định');
};

// ĐÃ THÊM (Pha 4 roadmap): 4 hành động của Ban thẩm định — nối vào 4 action GAS
// đã viết sẵn ở Pha 1 (trungTuyen/baoThieu/luuKetQua/capNhatDaoTao). Mỗi hàm nhận
// mảng payload (1 phần tử cho thao tác đơn, nhiều phần tử cho batch) — khớp đúng
// format mà GAS đang chờ (JSON.parse(e.parameter.data) phải là mảng).
const postThamDinhAction = async (action, payloadArray) => {
  const formData = new URLSearchParams();
  formData.append('action', action);
  const auth = getAuthParams();
  formData.append('idToken', auth.idToken);
  formData.append('sessionToken', auth.sessionToken);
  formData.append('data', JSON.stringify(payloadArray));

  const response = await axios.post(GAS_URL, formData);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi thao tác Thẩm định');
};

export const duyetTrungTuyen = (payloadArray) => postThamDinhAction('trungTuyen', payloadArray);
export const baoThieuHoSo = (payloadArray) => postThamDinhAction('baoThieu', payloadArray);
export const luuKetQuaThamDinh = (payloadArray) => postThamDinhAction('luuKetQua', payloadArray);
export const banGiaoDaoTao = (payloadArray) => postThamDinhAction('capNhatDaoTao', payloadArray);

// ĐÃ THÊM (Pha 5): 3 action AI — CHÚ Ý các action này đọc idToken TỪ BÊN TRONG "data"
// (JSON.parse(e.parameter.data).idToken) chứ không phải field idToken/sessionToken
// riêng như các action khác — giữ đúng quy ước đã viết sẵn ở Gas_Quanlysv.gs, không
// đổi lại cho "đồng bộ" vì sẽ phải sửa cả backend, ngoài phạm vi đợt này.
// ĐÃ SỬA: giờ gửi kèm cả sessionToken (không chỉ idToken) — backend đã cập nhật dùng
// requireAuth() cho cả 3 action này, hỗ trợ tài khoản nội bộ (trước đây chỉ Google).
const postAiAction = async (action, dataObj) => {
  const formData = new URLSearchParams();
  formData.append('action', action);
  const auth = getAuthParams();
  formData.append('data', JSON.stringify({ idToken: auth.idToken, sessionToken: auth.sessionToken, ...dataObj }));

  const response = await axios.post(GAS_URL, formData);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi xử lý AI');
};

export const scanTranscriptImage = (imageBase64, mimeType) => postAiAction('scanTranscript', { imageBase64, mimeType });
export const compareCurriculumAI = (nganh, transcript) => postAiAction('compareCurriculum', { nganh, transcript });
export const exportThamDinhTemplate = (payload) => postAiAction('exportTemplate', payload);
// ĐÃ THÊM (Công nhận KQHT & chuyển đổi tín chỉ, 2026-09-09): lưu chính thức bảng đối
// sánh SAU KHI người thẩm định gộp/gỡ tay trong DoiSanhModal.jsx — chỉ gọi khi bấm
// nút "Lưu", KHÔNG tự lưu lúc đang chỉnh sửa.
export const luuKetQuaDoiSanh = ({ cccd, ketQuaDoiSanh }) => postAiAction('luuKetQuaDoiSanh', { cccd, ketQuaDoiSanh });
// ĐÃ THÊM (Công nhận KQHT & chuyển đổi tín chỉ — Nguồn 2 "miễn theo văn bằng cũ",
// 2026-09-09): đọc 3 bảng học phần miễn cố định (Điều 6) từ tab "MienTheoVanBangCu" — GET
// đơn giản, không cần idToken/sessionToken gửi qua body như postAiAction (theo đúng cách
// fetchConfig đang làm cho action GET khác).
export const fetchDanhSachMienVanBangCu = async () => {
  const auth = getAuthParams();
  const response = await axios.get(`${GAS_URL}?action=layDanhSachMienVanBangCu&idToken=${encodeURIComponent(auth.idToken)}&sessionToken=${encodeURIComponent(auth.sessionToken)}`);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi tải danh sách miễn theo văn bằng cũ');
};
// ĐÃ THÊM (Công nhận KQHT & chuyển đổi tín chỉ — Nguồn 3 "miễn theo chứng chỉ", 2026-09-10):
// đọc bảng tra Điều 8-11 (tab "MienTheoChungChi") — GET đơn giản, khớp đúng cách
// fetchDanhSachMienVanBangCu ở trên đang làm cho Nguồn 2.
export const fetchDanhSachMienTheoChungChi = async () => {
  const auth = getAuthParams();
  const response = await axios.get(`${GAS_URL}?action=layDanhSachMienTheoChungChi&idToken=${encodeURIComponent(auth.idToken)}&sessionToken=${encodeURIComponent(auth.sessionToken)}`);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi tải danh sách miễn theo chứng chỉ');
};
// ĐÃ THÊM (Nguồn 3): OCR 1 ảnh chứng chỉ — chỉ đọc thông tin (tenChungChi/mucDat/ngayCap/
// hoTen/nhanDienDung), KHÔNG quyết định miễn học phần nào (việc đó ở tinhCacDongMienChungChi,
// thamDinhHelpers.js). loaiChungChi là 1 trong các value của DS_LOAI_CHUNG_CHI
// (thamDinhConfig.js) — cán bộ chọn loại TRƯỚC khi upload ảnh.
export const scanChungChiImage = (loaiChungChi, imageBase64, mimeType) =>
  postAiAction('scanChungChi', { loaiChungChi, imageBase64, mimeType });

// Nhập dữ liệu hàng loạt từ file Excel
// ĐÃ THÊM (rà soát đồng bộ file mẫu 2 trang): lấy danh sách cột file mẫu Excel bên
// trang Xét tuyển TỪ SERVER (action getXetTuyenHeaders, nguồn XETTUYEN_TEMPLATE_HEADERS
// trong Quanlysv.gs) — thay cho mảng "headers" hardcode trước đây nằm ngay trong
// XetTuyenPage.jsx, để đồng bộ cách làm với trang Thu hồ sơ (fetchAdmissionsHeaders).
export const fetchXetTuyenHeaders = async () => {
  const auth = getAuthParams();
  const response = await axios.get(`${GAS_URL}?action=getXetTuyenHeaders&idToken=${encodeURIComponent(auth.idToken)}&sessionToken=${encodeURIComponent(auth.sessionToken)}`);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi lấy danh sách cột file mẫu');
};

export const importStudents = async (studentsArray) => {
  const formData = new URLSearchParams();
  formData.append('action', 'importStudents');
  const auth = getAuthParams();
  formData.append('idToken', auth.idToken);
  formData.append('sessionToken', auth.sessionToken);
  formData.append('data', JSON.stringify(studentsArray));

  const response = await axios.post(GAS_URL, formData);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi khi import danh sách Excel');
};

// ĐÃ XOÁ: hàm cũ importStudentsToAdmissions (action 'importStudentsAdmissions', ghi
// thẳng sheet "SinhVien") — đã xác nhận không còn nơi nào gọi tới, xem importAdmissions
// bên dưới (ghi thẳng Trung Gian). LƯU Ý: importStudents() ở trên (không có hậu tố
// "ToAdmissions") là hàm KHÁC, vẫn đang dùng cho trang Xét tuyển — không đụng tới.

// ==========================================================
// TRANG "THU HỒ SƠ NHẬP HỌC" — nhóm API đọc/ghi THẲNG sheet Trung Gian (khớp action
// trong Quanlysv.gs: getAdmissionsData/addAdmission/updateAdmission/deleteAdmission/
// toggleAdmissionField/importAdmissions/getAdmissionsHeaders/getPayments/savePayment).
// ĐÃ THAY THẾ HOÀN TOÀN fetchStudents/addStudent/updateStudent/deleteStudent/
// toggleDocument/toggleStatusStudent/importStudentsToAdmissions cho RIÊNG trang này —
// các hàm cũ đã được xoá hẳn (xem PHẦN 1/2 ở trên).
// ==========================================================

export const fetchAdmissions = async () => {
  const auth = getAuthParams();
  const response = await axios.get(`${GAS_URL}?action=getAdmissionsData&idToken=${encodeURIComponent(auth.idToken)}&sessionToken=${encodeURIComponent(auth.sessionToken)}`);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi lấy dữ liệu');
};

// Danh sách tên cột dùng cho modal Thêm hồ sơ + file mẫu Excel — lấy TỪ SERVER (không
// hardcode ở frontend) để luôn đồng nhất tuyệt đối với action addAdmission/importAdmissions.
export const fetchAdmissionsHeaders = async () => {
  const auth = getAuthParams();
  const response = await axios.get(`${GAS_URL}?action=getAdmissionsHeaders&idToken=${encodeURIComponent(auth.idToken)}&sessionToken=${encodeURIComponent(auth.sessionToken)}`);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi lấy danh sách cột');
};

export const addAdmission = async (formData_) => {
  const formData = new URLSearchParams();
  formData.append('action', 'addAdmission');
  const auth = getAuthParams();
  formData.append('idToken', auth.idToken);
  formData.append('sessionToken', auth.sessionToken);
  formData.append('data', JSON.stringify(formData_));

  const response = await axios.post(GAS_URL, formData);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi khi thêm hồ sơ');
};

export const updateAdmission = async (updatedData) => {
  const formData = new URLSearchParams();
  formData.append('action', 'updateAdmission');
  const auth = getAuthParams();
  formData.append('idToken', auth.idToken);
  formData.append('sessionToken', auth.sessionToken);
  formData.append('data', JSON.stringify(updatedData));

  const response = await axios.post(GAS_URL, formData);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi khi cập nhật');
};

export const deleteAdmission = async (maSV) => {
  const formData = new URLSearchParams();
  formData.append('action', 'deleteAdmission');
  const auth = getAuthParams();
  formData.append('idToken', auth.idToken);
  formData.append('sessionToken', auth.sessionToken);
  formData.append('MaSV', maSV);

  const response = await axios.post(GAS_URL, formData);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi khi xóa');
};

// Tick/sửa 1 ô giấy tờ (Field = tên cột Trung Gian, VD "ẢNH THẺ") HOẶC "XN nhập học"
// (Field = "TRẠNG THÁI THẨM ĐỊNH") — dùng chung 1 action cho cả 2 trường hợp.
export const toggleAdmissionField = async ({ maSV, field, isChecked, ghiChu = '' }) => {
  const formData = new URLSearchParams();
  formData.append('action', 'toggleAdmissionField');
  const auth = getAuthParams();
  formData.append('idToken', auth.idToken);
  formData.append('sessionToken', auth.sessionToken);
  formData.append('MaSV', maSV);
  formData.append('Field', field);
  formData.append('IsChecked', isChecked);
  formData.append('GhiChu', ghiChu);

  const response = await axios.post(GAS_URL, formData);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi cập nhật');
};

export const importAdmissions = async (rowsArray) => {
  const formData = new URLSearchParams();
  formData.append('action', 'importAdmissions');
  const auth = getAuthParams();
  formData.append('idToken', auth.idToken);
  formData.append('sessionToken', auth.sessionToken);
  formData.append('data', JSON.stringify(rowsArray));

  const response = await axios.post(GAS_URL, formData);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi khi import danh sách Excel');
};

// ---- Nộp tiền (khối bên phải trang Thu hồ sơ) ----

export const fetchPayments = async (maSV) => {
  const auth = getAuthParams();
  const response = await axios.get(`${GAS_URL}?action=getPayments&MaSV=${encodeURIComponent(maSV)}&idToken=${encodeURIComponent(auth.idToken)}&sessionToken=${encodeURIComponent(auth.sessionToken)}`);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  return [];
};

export const savePayment = async ({ maSV, loaiPhi, soTien, isChecked }) => {
  const formData = new URLSearchParams();
  formData.append('action', 'savePayment');
  const auth = getAuthParams();
  formData.append('idToken', auth.idToken);
  formData.append('sessionToken', auth.sessionToken);
  formData.append('MaSV', maSV);
  formData.append('LoaiPhi', loaiPhi);
  formData.append('SoTien', soTien);
  formData.append('IsChecked', isChecked);

  const response = await axios.post(GAS_URL, formData);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi lưu khoản nộp tiền');
};

// ==========================================================
// PHA 1·D1 (bước 4) — "Hàng đợi xác nhận định danh" (Khóa định danh)
// Khớp 3 action GAS: dinhDanhDanhSachCanXacNhan (GET, Admin) / dinhDanhSoLuongCanXacNhanCuaToi
// (GET, mọi role nhập liệu — dùng cho bong bóng thông báo) / dinhDanhXuLyNghiTrung (POST, Admin).
// ==========================================================

// Danh sách đầy đủ (kèm ứng viên + bộ mã phụ của từng ứng viên) — dùng cho trang Admin.
export const fetchDanhSachXacNhanDinhDanh = async () => {
  const auth = getAuthParams();
  const response = await axios.get(`${GAS_URL}?action=dinhDanhDanhSachCanXacNhan&idToken=${encodeURIComponent(auth.idToken)}&sessionToken=${encodeURIComponent(auth.sessionToken)}`);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi lấy danh sách chờ xác nhận định danh');
};

// Chỉ đếm — dùng cho bong bóng thông báo ở các trang Thu hồ sơ/Xét tuyển/Thẩm định, lỗi thì
// coi như 0 (không có gì để hiện) thay vì làm phiền người dùng bằng thông báo lỗi vặt.
export const fetchSoLuongCanXacNhanDinhDanhCuaToi = async () => {
  try {
    const auth = getAuthParams();
    const response = await axios.get(`${GAS_URL}?action=dinhDanhSoLuongCanXacNhanCuaToi&idToken=${encodeURIComponent(auth.idToken)}&sessionToken=${encodeURIComponent(auth.sessionToken)}`);
    if (response.data && response.data.code === 200) {
      return response.data.data.soLuong || 0;
    }
    return 0;
  } catch (e) {
    return 0;
  }
};

// hanhDong: 'ganVao' (kèm svKeyChon) hoặc 'taoMoi'.
export const xuLyNghiTrungDinhDanh = async ({ maSV, hanhDong, svKeyChon }) => {
  const formData = new URLSearchParams();
  formData.append('action', 'dinhDanhXuLyNghiTrung');
  const auth = getAuthParams();
  formData.append('idToken', auth.idToken);
  formData.append('sessionToken', auth.sessionToken);
  formData.append('data', JSON.stringify({ maSV, hanhDong, svKeyChon }));

  const response = await axios.post(GAS_URL, formData);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi xử lý nghi trùng định danh');
};

// ==========================================================
// PHA 1·D2 — "Gộp 2 hồ sơ định danh đã tồn tại" (khác với hàng đợi ở trên: 2 sv_key ĐÃ
// TỒN TẠI SẴN, mỗi cái đã có mã/hồ sơ riêng, phát hiện sau là cùng 1 người). Khớp 3 action
// GAS: dinhDanhTimKiemHoSo / dinhDanhXemTruocGop (GET, chỉ đọc) / dinhDanhGopHoSo (POST,
// ghi thật) — cả 3 đều Admin.
// ==========================================================

// Tìm hồ sơ định danh theo họ tên / sv_key / CCCD / MSV, để chọn làm nguồn hoặc đích.
export const timKiemHoSoDinhDanh = async (tuKhoa) => {
  const auth = getAuthParams();
  const response = await axios.get(`${GAS_URL}?action=dinhDanhTimKiemHoSo&tuKhoa=${encodeURIComponent(tuKhoa)}&idToken=${encodeURIComponent(auth.idToken)}&sessionToken=${encodeURIComponent(auth.sessionToken)}`);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi tìm kiếm hồ sơ định danh');
};

// Xem trước 1 cặp gộp (nguồn/đích) — CHỈ ĐỌC, không ghi gì, dùng để hiện số liệu bắt xác
// nhận tay trước khi gọi gopHoSoDinhDanh().
export const xemTruocGopDinhDanh = async (svKeyNguon, svKeyDich) => {
  const auth = getAuthParams();
  const response = await axios.get(`${GAS_URL}?action=dinhDanhXemTruocGop&svKeyNguon=${encodeURIComponent(svKeyNguon)}&svKeyDich=${encodeURIComponent(svKeyDich)}&idToken=${encodeURIComponent(auth.idToken)}&sessionToken=${encodeURIComponent(auth.sessionToken)}`);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi xem trước gộp hồ sơ định danh');
};

// Gộp thật — svKeyNguon bị đánh dấu "đã gộp" (không xoá), mọi mã/hồ sơ của nguồn chuyển
// hết sang svKeyDich. Không có API "hoàn tác" — phía UI phải bắt xác nhận tay kỹ trước khi gọi.
export const gopHoSoDinhDanh = async ({ svKeyNguon, svKeyDich }) => {
  const formData = new URLSearchParams();
  formData.append('action', 'dinhDanhGopHoSo');
  const auth = getAuthParams();
  formData.append('idToken', auth.idToken);
  formData.append('sessionToken', auth.sessionToken);
  formData.append('data', JSON.stringify({ svKeyNguon, svKeyDich }));

  const response = await axios.post(GAS_URL, formData);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi gộp hồ sơ định danh');
};

// ĐÃ THÊM — "Gợi ý cặp nghi trùng": danh sách các nhóm hồ sơ định danh đang sống trùng
// tên+ngày sinh, để panel Gộp thủ công gợi ý sẵn thay vì bắt Admin/ThamDinh tự gõ tìm.
export const fetchGoiYCapNghiTrungDinhDanh = async () => {
  const auth = getAuthParams();
  const response = await axios.get(`${GAS_URL}?action=dinhDanhGoiYCapNghiTrung&idToken=${encodeURIComponent(auth.idToken)}&sessionToken=${encodeURIComponent(auth.sessionToken)}`);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi tải gợi ý cặp nghi trùng');
};

// Chỉ đếm số nhóm nghi trùng — dùng cho bong bóng thông báo ở các tài khoản không có quyền
// tự xử lý, lỗi thì coi như 0 (cùng nguyên tắc như fetchSoLuongCanXacNhanDinhDanhCuaToi).
export const fetchSoLuongCapNghiTrungDinhDanh = async () => {
  try {
    const auth = getAuthParams();
    const response = await axios.get(`${GAS_URL}?action=dinhDanhSoLuongCapNghiTrung&idToken=${encodeURIComponent(auth.idToken)}&sessionToken=${encodeURIComponent(auth.sessionToken)}`);
    if (response.data && response.data.code === 200) {
      return response.data.data.soLuong || 0;
    }
    return 0;
  } catch (e) {
    return 0;
  }
};

// Tài khoản không có quyền tự xử lý bấm "Báo Admin" từ bong bóng thông báo -> đẩy 1 tin
// nhắn Google Chat qua webhook đã cấu hình sẵn (xem dinhDanhBaoAdmin trong DinhDanh.gs).
export const baoAdminDinhDanh = async ({ soCanXacNhan, soCanGop }) => {
  const formData = new URLSearchParams();
  formData.append('action', 'dinhDanhBaoAdmin');
  const auth = getAuthParams();
  formData.append('idToken', auth.idToken);
  formData.append('sessionToken', auth.sessionToken);
  formData.append('data', JSON.stringify({ soCanXacNhan, soCanGop }));

  const response = await axios.post(GAS_URL, formData);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi gửi báo Admin');
};

// ==========================================
// PHẦN 4: API CẤU HÌNH HỆ THỐNG
// ==========================================

// Đọc danh sách cấu hình từ Sheet
export const fetchConfig = async () => {
  const auth = getAuthParams();
  const response = await axios.get(`${GAS_URL}?action=getConfig&idToken=${encodeURIComponent(auth.idToken)}&sessionToken=${encodeURIComponent(auth.sessionToken)}`);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi tải cấu hình');
};

// Lưu danh sách cấu hình xuống Sheet
export const saveConfig = async (configData) => {
  const formData = new URLSearchParams();
  formData.append('action', 'saveConfig');
  const auth = getAuthParams();
  formData.append('idToken', auth.idToken);
  formData.append('sessionToken', auth.sessionToken);
  formData.append('data', JSON.stringify(configData));

  const response = await axios.post(GAS_URL, formData);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi lưu cấu hình');
};

// ĐÃ THÊM: Chỉ tiêu tuyển sinh theo năm/ngành (trang Cài đặt) — khác saveConfig ở chỗ
// GAS chỉ thay thế đúng các dòng của 1 năm đang lưu, giữ nguyên các năm khác (xem
// action 'saveChiTieu' trong Quanlysv.gs). fetchChiTieu trả về TOÀN BỘ mọi năm luôn
// (dữ liệu nhỏ), phía trang tự lọc theo năm đang chọn.
export const fetchChiTieu = async () => {
  const auth = getAuthParams();
  const response = await axios.get(`${GAS_URL}?action=getChiTieu&idToken=${encodeURIComponent(auth.idToken)}&sessionToken=${encodeURIComponent(auth.sessionToken)}`);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi tải chỉ tiêu tuyển sinh');
};

// nam: chuỗi/số năm; items: mảng [{ nganh, chiTieu }] — CHỈ của đúng năm này.
export const saveChiTieu = async (nam, items) => {
  const formData = new URLSearchParams();
  formData.append('action', 'saveChiTieu');
  const auth = getAuthParams();
  formData.append('idToken', auth.idToken);
  formData.append('sessionToken', auth.sessionToken);
  formData.append('data', JSON.stringify({ nam, items }));

  const response = await axios.post(GAS_URL, formData);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi lưu chỉ tiêu tuyển sinh');
};

// ĐÃ THÊM: "Kho tra cứu sinh viên" — 1 API DUY NHẤT vừa lọc vừa phân trang NGAY TRÊN
// SERVER (khớp action 'timKiemKhoSinhVien' trong Quanlysv.gs — gộp Trung Gian + KETQUA
// + Đào tạo). Khác mọi hàm fetch...Data() khác trong file này (tải hết 1 lần rồi lọc
// bên React) — ở đây mỗi lần đổi bộ lọc/trang phải GỌI LẠI hàm này với tham số mới,
// KHÔNG tự lọc mảng cũ trong trình duyệt, để không phải tải lại toàn bộ kho mỗi lần.
// params: { tuKhoa, nganh, khoa, heDaoTao, hinhThucDaoTao, namXetTuyen, trangThai,
//           tuNgay, denNgay, trang, kichThuoc } — mọi trường đều optional.
export const timKiemKhoSinhVien = async (params = {}) => {
  const auth = getAuthParams();
  const qs = new URLSearchParams({
    action: 'timKiemKhoSinhVien',
    idToken: auth.idToken,
    sessionToken: auth.sessionToken,
  });
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.append(k, v);
  });
  const response = await axios.get(`${GAS_URL}?${qs.toString()}`);
  if (response.data && response.data.code === 200) {
    return response.data.data; // { items, tongSo, trang, kichThuoc, tongTrang }
  }
  throw new Error(response.data.message || 'Lỗi tìm kiếm kho sinh viên');
};

// ĐÃ THÊM: bảng thống kê tổng hợp (KPI + biểu đồ) đặt phía trên bảng kết quả ở trang Kho
// (khớp action 'layThongKeKho' trong Quanlysv.gs). Chỉ có 1 tham số duy nhất — năm xét
// tuyển (optional, để trống = gộp mọi năm; % so với chỉ tiêu chỉ tính được khi CÓ chọn
// đúng 1 năm, xem giải thích trong action GAS).
export const layThongKeKho = async (namXetTuyen = '') => {
  const auth = getAuthParams();
  const qs = new URLSearchParams({
    action: 'layThongKeKho',
    idToken: auth.idToken,
    sessionToken: auth.sessionToken,
  });
  if (namXetTuyen) qs.append('namXetTuyen', namXetTuyen);
  const response = await axios.get(`${GAS_URL}?${qs.toString()}`);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi tải thống kê kho sinh viên');
};

// ĐÃ SỬA (theo phản hồi, tránh lộ CCCD/Ngành ngay trên thanh địa chỉ): trang chi tiết 1 hồ
// sơ giờ dùng route "/sprofile/student/:key8" (key8 = 8 ký tự cuối SV_KEY — xem
// KhoSinhVienPage.jsx), gọi hàm này với key8. Vẫn giữ được gọi kiểu cũ (cccd, nganh) làm
// phương án dự phòng cho hồ sơ CŨ chưa có SV_KEY (xem route dự phòng còn giữ lại trong
// App.jsx) — action 'layChiTietHoSoKho' bên GAS tự nhận biết đang được gọi kiểu nào.
// Đọc trực tiếp, KHÔNG qua cache — luôn lấy bản mới nhất.
export const layChiTietHoSoKho = async ({ key8, cccd, nganh } = {}) => {
  const auth = getAuthParams();
  const qs = new URLSearchParams({
    action: 'layChiTietHoSoKho',
    idToken: auth.idToken,
    sessionToken: auth.sessionToken,
  });
  if (key8) {
    qs.append('key8', key8);
  } else {
    qs.append('cccd', cccd || '');
    qs.append('nganh', nganh || '');
  }
  const response = await axios.get(`${GAS_URL}?${qs.toString()}`);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi tải chi tiết hồ sơ');
};

// ĐÃ THÊM (theo yêu cầu — tab "Điểm số" ở trang chi tiết hồ sơ): đọc điểm từ file Google
// Sheets đã mirror từ hệ thống Đào tạo (xem action 'layBangDiemDaoTao' bên Quanlysv.gs —
// chỉ đọc, không ghi gì). Trả về code 200 kèm cờ "coDuLieu" cho cả trường hợp chưa có dữ
// liệu (ngành chưa cấu hình/chưa tìm thấy sinh viên...) — KHÔNG throw ở các trường hợp đó,
// để trang tự hiện thông báo nhẹ nhàng thay vì rơi vào nhánh lỗi của useQuery.
export const layBangDiemDaoTao = async (nganh, maSinhVien) => {
  const auth = getAuthParams();
  const qs = new URLSearchParams({
    action: 'layBangDiemDaoTao',
    idToken: auth.idToken,
    sessionToken: auth.sessionToken,
    nganh: nganh || '',
    maSinhVien: maSinhVien || '',
  });
  const response = await axios.get(`${GAS_URL}?${qs.toString()}`);
  if (response.data && response.data.code === 200) {
    return response.data.data; // { coDuLieu, monHoc: [{mon, diem}], ... } hoặc { coDuLieu:false, lyDo }
  }
  throw new Error(response.data.message || 'Lỗi tải bảng điểm');
};

// ==========================================
// PHẦN 5: API XÁC THỰC (AUTHENTICATION)
// ==========================================

export const loginUser = async (username, password) => {
  const formData = new URLSearchParams();
  formData.append('action', 'login');
  formData.append('data', JSON.stringify({ username, password }));

  const response = await axios.post(GAS_URL, formData);
  
  if (response.data && response.data.code === 200) {
    return response.data.data; // Trả về thông tin user
  }
  
  throw new Error(response.data.message || 'Lỗi đăng nhập');
};

// Lấy nhật ký hoạt động của một user
export const fetchLogs = async (username) => {
  const auth = getAuthParams();
  const response = await axios.get(`${GAS_URL}?action=getLogs&username=${username}&idToken=${encodeURIComponent(auth.idToken)}&sessionToken=${encodeURIComponent(auth.sessionToken)}`);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi tải nhật ký');
};

// ==========================================
// PHẦN 6: PHẢN HỒI LỖI (gửi qua Google Chat, hiện ở footer toàn app)
// ==========================================
export const sendFeedback = (noiDung) => postAiAction('feedback', { noiDung });

// ==========================================
// PHẦN 7: API KÝ ĐIỆN TỬ (Pha 1 — chữ ký ảnh)
// ĐÃ THÊM — Bước 2 (chữ ký cá nhân). Các hàm cho Bước 3 trở đi (cấu hình chức danh,
// tạo yêu cầu ký, hàng chờ ký, xem trước, ký) sẽ được thêm dần vào phần này.
// ==========================================

// Factory POST dùng chung cho nhóm action Ký điện tử — giống hệt postThamDinhAction
// ở PHẦN 3, chỉ khác gửi 1 OBJECT (data={...}) thay vì mảng, vì các action này thao
// tác trên 1 tài khoản/1 yêu cầu tại 1 thời điểm, không phải danh sách hàng loạt.
const postKySoAction = async (action, dataObj = {}) => {
  const formData = new URLSearchParams();
  formData.append('action', action);
  const auth = getAuthParams();
  formData.append('idToken', auth.idToken);
  formData.append('sessionToken', auth.sessionToken);
  formData.append('data', JSON.stringify(dataObj));

  const response = await axios.post(GAS_URL, formData);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi thao tác ký duyệt');
};

// Lấy ảnh chữ ký cá nhân của người đang đăng nhập — trả { coChuKy, anhBase64, mimeType, capNhat }.
export const layChuKyCuaToi = async () => {
  const auth = getAuthParams();
  const response = await axios.get(`${GAS_URL}?action=layChuKyCuaToi&idToken=${encodeURIComponent(auth.idToken)}&sessionToken=${encodeURIComponent(auth.sessionToken)}`);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi tải chữ ký cá nhân');
};

// Lưu/thay ảnh chữ ký cá nhân — { anhBase64 (đã bỏ tiền tố data:...;base64,), mimeType }.
export const luuChuKyCuaToi = ({ anhBase64, mimeType }) => postKySoAction('luuChuKyCuaToi', { anhBase64, mimeType });

// Xoá ảnh chữ ký cá nhân đang lưu.
export const xoaChuKyCuaToi = () => postKySoAction('xoaChuKyCuaToi', {});

// ĐÃ THÊM (Khối 3 "Chữ ký số (CA)" ở Hồ sơ cá nhân): người dùng tự kết nối CA của
// mình (nhà cung cấp + mã thuê bao), backend xác thực THẬT với nhà cung cấp trước
// khi lưu — xem hdGet_layThongTinCaCuaToi/hdPost_ketNoiChuKySo/hdPost_xoaCaCuaToi
// (KySo.gs) và POST /check-certificate (ca-sign-service).

// Lấy thông tin CA đã lưu của người đang đăng nhập — { coCA, nhaCungCap, maThueBao }.
export const layThongTinCaCuaToi = async () => {
  const auth = getAuthParams();
  const response = await axios.get(`${GAS_URL}?action=layThongTinCaCuaToi&idToken=${encodeURIComponent(auth.idToken)}&sessionToken=${encodeURIComponent(auth.sessionToken)}`);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi tải thông tin chữ ký số');
};

// Kết nối CA — { nhaCungCap, maThueBao }. Backend xác thực với nhà cung cấp trước khi lưu.
export const ketNoiChuKySo = ({ nhaCungCap, maThueBao }) => postKySoAction('ketNoiChuKySo', { nhaCungCap, maThueBao });

// Huỷ kết nối CA đang lưu.
export const xoaCaCuaToi = () => postKySoAction('xoaCaCuaToi', {});

// ĐÃ THÊM — Bước 3: đọc bảng cấu hình "chức danh ký" cho 1 loại tài liệu (mặc định
// GBTT) — dùng để dựng bảng "Chọn người ký" trong ChonNguoiKyModal. Trả về
// { chucDanh: [...], danhSachTaiKhoan: [...] }.
export const layCauHinhChucDanhKy = async (loaiTaiLieu = 'GBTT') => {
  const auth = getAuthParams();
  const response = await axios.get(`${GAS_URL}?action=layCauHinhChucDanhKy&loaiTaiLieu=${encodeURIComponent(loaiTaiLieu)}&idToken=${encodeURIComponent(auth.idToken)}&sessionToken=${encodeURIComponent(auth.sessionToken)}`);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi tải cấu hình chức danh ký');
};

// ĐÃ THÊM — Bước 4: tạo yêu cầu ký GBTT cho 1 lô sinh viên đã duyệt.
// { sinhVien: [...], nguoiKy: [{maChucDanh, email, ten?}, ...] } -> { results: [...] }.
// ĐÃ THÊM (theo yêu cầu bổ sung — placeholder "Ngày xuất giấy báo"/"Tháng nhập học"):
// ngayXuatGiayBao ('YYYY-MM-DD') và thangNhapHoc ('YYYY-MM') áp dụng CHUNG cho cả đợt xuất
// này (không phải riêng từng sinh viên) — xem noiDung/NGAY_XUAT_GIAY_BAO/THANG_NHAP_HOC ở
// action taoYeuCauKyGBTT (Quanlysv.gs).
// ĐÃ SỬA (theo phản hồi — bug "Số quyết định không chèn vào được"): hàm này CHỦ ĐỘNG liệt
// kê từng field cần gửi (destructuring) rồi mới forward — field nào không được liệt kê ở
// đây sẽ bị ÂM THẦM RỚT MẤT dù ThamDinhPage.jsx đã gửi kèm trong object truyền vào, KHÔNG
// báo lỗi gì cả. Trước đây thêm "soQuyetDinh" vào state + payload phía ThamDinhPage.jsx và
// vào noiDung/SO_QUYET_DINH phía Quanlysv.gs nhưng QUÊN thêm vào đúng 1 nơi TRUNG GIAN này
// — nguyên nhân thật của bug, không phải do phía Doc mẫu/placeholder ông đặt sai. Nhớ: mỗi
// khi thêm field mới cho action này, phải sửa ĐỦ CẢ 3 nơi (JSX gửi lên, hàm forward ở đây,
// noiDung phía Quanlysv.gs), thiếu 1 trong 3 đều coi như field đó không đi tới đâu cả.
// ĐÃ THÊM (Ký điện tử Pha 2 — Bước 3): cheDoKy ('TUAN_TU' mặc định / 'SONG_SONG') — nhớ
// quy tắc ở trên: field mới phải sửa ĐỦ CẢ 3 nơi, đây là nơi thứ 2 (JSX gửi lên ở
// ThamDinhPage.jsx, forward ở đây, đọc data.cheDoKy ở action taoYeuCauKyGBTT Quanlysv.gs).
export const taoYeuCauKyGBTT = ({ sinhVien, nguoiKy, ngayXuatGiayBao, thangNhapHoc, soQuyetDinh, cheDoKy }) =>
  postKySoAction('taoYeuCauKyGBTT', { sinhVien, nguoiKy, ngayXuatGiayBao, thangNhapHoc, soQuyetDinh, cheDoKy });

// ĐÃ THÊM (Ký điện tử Pha 2 — Bước 5 — tổng quát hoá thêm loại văn bản khác GBTT): action
// dùng chung cho MỌI loại văn bản KHÁC GBTT (GBTT vẫn dùng taoYeuCauKyGBTT ở trên, xử lý
// theo lô nhiều sinh viên) — chỉ tạo ĐÚNG 1 yêu cầu ký/1 lần gọi.
//   loaiTaiLieu: mã loại văn bản (khớp cột APDUNGCHO trên sheet ChucDanhKy, vd "QDCN").
//   tieuDe: tiêu đề hiển thị của yêu cầu ký.
//   noiDung: object phẳng {TEN_PLACEHOLDER: giá trị} — thay {{TEN_PLACEHOLDER}} trong Doc
//     mẫu của loại văn bản đó (không gồm {{HOTEN_<MA>}}/{{NGAYKY_<MA>}}/{{CHUKY_<MA>}} — 3
//     placeholder này backend tự điền theo từng chức danh trong nguoiKy).
//   thongTinLienQuan: {maSinhVien?, hoTen?, canCuoc?, nganh?} — để trống nếu văn bản không
//     gắn với 1 sinh viên cụ thể.
//   nguoiKy: [{maChucDanh, email, ten?}, ...] — khớp cấu hình ChucDanhKy của loaiTaiLieu đó.
//   cheDoKy: 'TUAN_TU' (mặc định) | 'SONG_SONG'.
// Chưa có trang nào gọi hàm này — export sẵn cho UI của loại văn bản mới sau này dùng, xem
// action 'taoYeuCauKy' (Quanlysv.gs) + kế hoạch Bước 5.
export const taoYeuCauKy = ({ loaiTaiLieu, tieuDe, noiDung, thongTinLienQuan, nguoiKy, cheDoKy }) =>
  postKySoAction('taoYeuCauKy', { loaiTaiLieu, tieuDe, noiDung, thongTinLienQuan, nguoiKy, cheDoKy });

// ĐÃ THÊM (Ký điện tử Pha 2 — Bước 6 — "tải file lên ký ngay, không cần mẫu"): KHÁC hẳn
// taoYeuCauKy ở trên (vẫn cần 1 Doc mẫu + {{placeholder}}) — action này nhận THẲNG 1 file
// người tạo tự chọn, coi đó là tài liệu CUỐI CÙNG luôn, không có mẫu/placeholder gì cả.
//   tieuDe: tiêu đề hiển thị của yêu cầu ký.
//   fileBase64/mimeType/tenFile: nội dung file người dùng chọn (đọc qua FileReader ở
//     frontend rồi encode base64) — HIỆN CHỈ chấp nhận mimeType 'application/pdf' (xem chú
//     thích action 'taoYeuCauKyTuFile'/Quanlysv.gs — lý do KHÔNG nhận ảnh/Word ở bước này).
//   nguoiKy: [{maChucDanh, tenChucDanh, email, ten?}, ...] — KHÁC taoYeuCauKy ở trên,
//     maChucDanh/tenChucDanh ở đây do NGƯỜI TẠO TỰ ĐẶT ngay lúc này (không có cấu hình
//     ChucDanhKy sẵn để chọn từ đó) — mỗi người 1 mã KHÔNG TRÙNG trong cùng yêu cầu.
//   viTriKyJson: [{maChucDanh, trang, xTyLe, yTyLe, loaiO}, ...] — BẮT BUỘC đủ 1 phần tử
//     cho MỖI người trong nguoiKy (xem tab "Xem trước & đặt chữ ký" trong kế hoạch — UI
//     click-to-place, dùng PDF.js ở frontend, CHƯA xây) — thiếu là bị 400 ngay khi tạo.
//   thongTinLienQuan/cheDoKy: giống hệt taoYeuCauKy ở trên.
//   taiLieuThamKhao: [{tenFile, fileBase64, mimeType}, ...] — TUỲ CHỌN (mảng rỗng/bỏ qua
//     nếu không có gì) — file ĐÍNH KÈM CHỈ ĐỂ XEM, KHÔNG ký lên (VD hồ sơ gốc/minh chứng) —
//     không giới hạn định dạng như file để ký (không bắt buộc PDF).
export const taoYeuCauKyTuFile = ({ tieuDe, fileBase64, mimeType, tenFile, nguoiKy, viTriKyJson, thongTinLienQuan, cheDoKy, taiLieuThamKhao }) =>
  postKySoAction('taoYeuCauKyTuFile', { tieuDe, fileBase64, mimeType, tenFile, nguoiKy, viTriKyJson, thongTinLienQuan, cheDoKy, taiLieuThamKhao });

// Danh sách yêu cầu ký đang chờ người đang đăng nhập ký — cho trang "Hồ sơ chờ ký".
export const fetchDanhSachChoToiKy = async () => {
  const auth = getAuthParams();
  const response = await axios.get(`${GAS_URL}?action=layDanhSachChoToiKy&idToken=${encodeURIComponent(auth.idToken)}&sessionToken=${encodeURIComponent(auth.sessionToken)}`);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi tải danh sách chờ ký');
};

// Đếm nhanh số hồ sơ đang chờ mình ký — cho badge trên menu tài khoản.
export const laySoLuongChoToiKy = async () => {
  const auth = getAuthParams();
  const response = await axios.get(`${GAS_URL}?action=laySoLuongChoToiKy&idToken=${encodeURIComponent(auth.idToken)}&sessionToken=${encodeURIComponent(auth.sessionToken)}`);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi đếm số hồ sơ chờ ký');
};

// Xem trước nội dung 1 yêu cầu ký (PDF base64, hoặc link PDF cuối nếu đã hoàn tất).
export const xemTruocYeuCauKy = async (maYeuCau) => {
  const auth = getAuthParams();
  const response = await axios.get(`${GAS_URL}?action=xemTruocYeuCauKy&maYeuCau=${encodeURIComponent(maYeuCau)}&idToken=${encodeURIComponent(auth.idToken)}&sessionToken=${encodeURIComponent(auth.sessionToken)}`);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi tạo bản xem trước');
};

// Thực hiện 1 lượt ký cho yêu cầu maYeuCau (dùng đúng chữ ký cá nhân đã lưu ở Hồ sơ cá nhân).
// LƯU Ý (Ký điện tử Pha 2 — Bước 6, luồng PDF/pdf-lib): với yêu cầu tạo qua luồng tải file
// tự do (VI_TRI_KY_JSON có dữ liệu), response trả về NGAY với { dangXuLy: true, hoanTat:
// false } — việc đóng dấu thật sự chạy NỀN qua trigger, chưa xong ngay lúc gọi xong hàm
// này. Trang gọi hàm này cần TỰ POLL bằng kiemTraTrangThaiKy() bên dưới cho tới khi
// trangThaiBuoc chuyển thành "DA_KY" (hoặc "DEN_LUOT" nếu xử lý nền lỗi, xem ghiChu) — GBTT
// (luồng Docs cũ) KHÔNG bị ảnh hưởng, vẫn trả kết quả ngay như trước (dangXuLy sẽ là
// undefined/falsy).
// ĐÃ SỬA (Ký điện tử Pha 2 — Bước 7): thêm phuongThucKy ('ANH' mặc định / 'CA') — do
// CHÍNH người ký chọn ngay lúc bấm "Ký" (xem ChoKyPage.jsx — chỉ hỏi khi coTheKyCA=true từ
// fetchDanhSachChoToiKy), không phải cấu hình cố định theo chức danh. Không truyền field
// này (mọi nơi gọi cũ) tương đương 'ANH' — hành vi giữ nguyên 100% cho tài khoản không CA.
export const kyYeuCau = ({ maYeuCau, ghiChu, phuongThucKy }) => postKySoAction('kyYeuCau', { maYeuCau, ghiChu, phuongThucKy });

// ĐÃ THÊM (Ký điện tử Pha 2 — Bước 6): dùng để POLL trạng thái sau khi kyYeuCau trả về
// dangXuLy=true (luồng PDF/pdf-lib nền, xem action 'kiemTraTrangThaiKy' + xuLyKyPdfNen
// trong Quanlysv.gs). Gọi lặp lại (vd mỗi 3-5s) cho tới khi trangThaiBuoc !== "DANG_XU_LY".
export const kiemTraTrangThaiKy = async (maYeuCau) => {
  const auth = getAuthParams();
  const response = await axios.get(`${GAS_URL}?action=kiemTraTrangThaiKy&maYeuCau=${encodeURIComponent(maYeuCau)}&idToken=${encodeURIComponent(auth.idToken)}&sessionToken=${encodeURIComponent(auth.sessionToken)}`);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi kiểm tra trạng thái ký');
};

// ĐÃ THÊM — Ký điện tử Pha 2 (Bước 2): người ĐANG TỚI LƯỢT từ chối ký kèm lý do bắt
// buộc — dừng cả chuỗi, báo email người tạo yêu cầu.
export const tuChoiKy = ({ maYeuCau, lyDo }) => postKySoAction('tuChoiKy', { maYeuCau, lyDo });

// ĐÃ THÊM — Ký điện tử Pha 2 (Bước 2): người TẠO yêu cầu (hoặc Admin) thu hồi 1 yêu
// cầu đang chạy dở, chỉ khi chưa hoàn tất.
export const huyYeuCauKy = ({ maYeuCau }) => postKySoAction('huyYeuCauKy', { maYeuCau });

// ĐÃ THÊM — Bước 7: lịch sử MỌI yêu cầu ký người đang đăng nhập có liên quan (đã ký/
// đang chờ/là người tạo), không chỉ riêng bước đang tới lượt — cho tab "Đã ký" trên
// trang Hồ sơ chờ ký, để xem lại/tải PDF sau khi văn bản đã hoàn tất.
export const fetchLichSuKyCuaToi = async () => {
  const auth = getAuthParams();
  const response = await axios.get(`${GAS_URL}?action=layLichSuKyCuaToi&idToken=${encodeURIComponent(auth.idToken)}&sessionToken=${encodeURIComponent(auth.sessionToken)}`);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi tải lịch sử ký');
};