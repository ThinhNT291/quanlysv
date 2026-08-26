import axios from 'axios';

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
// PHẦN 1: API QUẢN LÝ SINH VIÊN
// ==========================================

export const fetchStudents = async () => {
  const auth = getAuthParams();
  const response = await axios.get(`${GAS_URL}?action=getStudents&idToken=${encodeURIComponent(auth.idToken)}&sessionToken=${encodeURIComponent(auth.sessionToken)}`);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi lấy dữ liệu');
};

export const addStudent = async (newStudent) => {
  const formData = new URLSearchParams();
  formData.append('action', 'addStudent');
  const auth = getAuthParams();
  formData.append('idToken', auth.idToken);
  formData.append('sessionToken', auth.sessionToken);
  formData.append('data', JSON.stringify(newStudent));

  const response = await axios.post(GAS_URL, formData);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi khi thêm sinh viên');
};

export const deleteStudent = async (maSV) => {
  const formData = new URLSearchParams();
  formData.append('action', 'deleteStudent');
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

export const updateStudent = async (updatedStudent) => {
  const formData = new URLSearchParams();
  formData.append('action', 'editStudent');
  const auth = getAuthParams();
  formData.append('idToken', auth.idToken);
  formData.append('sessionToken', auth.sessionToken);
  formData.append('data', JSON.stringify(updatedStudent));

  const response = await axios.post(GAS_URL, formData);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi khi cập nhật');
};

// ==========================================
// PHẦN 2: API QUẢN LÝ GIẤY TỜ (MASTER-DETAIL)
// ==========================================

export const fetchDocuments = async (maSV) => {
  const auth = getAuthParams();
  const response = await axios.get(`${GAS_URL}?action=getDocuments&MaSV=${maSV}&idToken=${encodeURIComponent(auth.idToken)}&sessionToken=${encodeURIComponent(auth.sessionToken)}`);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  return [];
};

// Đánh dấu nộp / rút giấy tờ HOẶC cập nhật ghi chú
export const toggleDocument = async ({ maSV, tenGiayTo, isChecked, ghiChu = '' }) => {
  const formData = new URLSearchParams();
  formData.append('action', 'toggleDocument');
  const auth = getAuthParams();
  formData.append('idToken', auth.idToken);
  formData.append('sessionToken', auth.sessionToken);
  formData.append('MaSV', maSV);
  formData.append('TenGiayTo', tenGiayTo);
  formData.append('IsChecked', isChecked);
  formData.append('GhiChu', ghiChu); // Gửi thêm dòng này

  const response = await axios.post(GAS_URL, formData);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi cập nhật giấy tờ');
};

// Cập nhật trạng thái nhập học nhanh
export const toggleStatusStudent = async ({ maSV, status }) => {
  const formData = new URLSearchParams();
  formData.append('action', 'toggleStatus');
  const auth = getAuthParams();
  formData.append('idToken', auth.idToken);
  formData.append('sessionToken', auth.sessionToken);
  formData.append('MaSV', maSV);
  formData.append('Status', status);

  const response = await axios.post(GAS_URL, formData);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi cập nhật trạng thái');
};

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

// ĐÃ THÊM: import Excel RIÊNG cho trang Thu hồ sơ nhập học (AdmissionsPage) — ghi
// đúng vào sheet SinhVien, khác với importStudents() ở trên (dùng cho Xét tuyển).
// GIỮ LẠI (không xoá) phòng còn nơi nào tham chiếu — trang Thu hồ sơ giờ dùng
// importAdmissions() bên dưới, ghi thẳng Trung Gian thay vì sheet SinhVien.
export const importStudentsToAdmissions = async (studentsArray) => {
  const formData = new URLSearchParams();
  formData.append('action', 'importStudentsAdmissions');
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

// ==========================================================
// ĐÃ THÊM: TRANG "THU HỒ SƠ NHẬP HỌC" — nhóm API mới, đọc/ghi THẲNG sheet Trung Gian
// (khớp action mới trong Quanlysv.gs: getAdmissionsData/addAdmission/updateAdmission/
// deleteAdmission/toggleAdmissionField/importAdmissions/getAdmissionsHeaders/
// getPayments/savePayment). Thay thế fetchStudents/addStudent/updateStudent/
// deleteStudent/toggleDocument/toggleStatusStudent/importStudentsToAdmissions cho
// RIÊNG trang này — các hàm cũ ở trên vẫn còn nguyên, không đụng tới.
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