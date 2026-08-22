import axios from 'axios';

// DÁN LINK GOOGLE APPS SCRIPT (WEB APP URL) CỦA ÔNG VÀO ĐÂY
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzkp4Nqb3kP3DjEGBucxLKPDgQamDMO8mQOOCg71_a_iHqnmuGWjU54e-QvxNGzELN9/exec';
// ==========================================
// PHẦN 1: API QUẢN LÝ SINH VIÊN
// ==========================================

export const fetchStudents = async () => {
  const response = await axios.get(`${GAS_URL}?action=getStudents`);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi lấy dữ liệu');
};

export const addStudent = async (newStudent) => {
  const formData = new URLSearchParams();
  formData.append('action', 'addStudent');
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
  const response = await axios.get(`${GAS_URL}?action=getDocuments&MaSV=${maSV}`);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  return [];
};

// Đánh dấu nộp / rút giấy tờ HOẶC cập nhật ghi chú
export const toggleDocument = async ({ maSV, tenGiayTo, isChecked, ghiChu = '' }) => {
  const formData = new URLSearchParams();
  formData.append('action', 'toggleDocument');
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

// Nhập dữ liệu hàng loạt từ file Excel
export const importStudents = async (studentsArray) => {
  const formData = new URLSearchParams();
  formData.append('action', 'importStudents');
  formData.append('data', JSON.stringify(studentsArray));

  const response = await axios.post(GAS_URL, formData);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi khi import danh sách Excel');
};

// ==========================================
// PHẦN 4: API CẤU HÌNH HỆ THỐNG
// ==========================================

// Đọc danh sách cấu hình từ Sheet
export const fetchConfig = async () => {
  const response = await axios.get(`${GAS_URL}?action=getConfig`);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi tải cấu hình');
};

// Lưu danh sách cấu hình xuống Sheet
export const saveConfig = async (configData) => {
  const formData = new URLSearchParams();
  formData.append('action', 'saveConfig');
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
  const response = await axios.get(`${GAS_URL}?action=getLogs&username=${username}`);
  if (response.data && response.data.code === 200) {
    return response.data.data;
  }
  throw new Error(response.data.message || 'Lỗi tải nhật ký');
};