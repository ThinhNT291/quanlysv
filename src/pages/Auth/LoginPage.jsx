import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from "jwt-decode";
import { loginUser, GAS_URL } from '../../api/studentApi';
import Swal from 'sweetalert2';

const LoginPage = ({ onLoginSuccess }) => {
  // ĐÃ THÊM: tự điền sẵn username lần đăng nhập nội bộ gần nhất — đỡ phải gõ lại khi bị
  // đẩy về đây do hết phiên (mật khẩu thì KHÔNG lưu/điền sẵn, phải tự gõ lại).
  const [credentials, setCredentials] = useState({ username: localStorage.getItem('tuyensinh_last_username') || '', password: '' });
  const [isLoading, setIsLoading] = useState(false);

// ĐÃ SỬA (Pha 6): dùng chung GAS_URL từ studentApi.js thay vì khai báo WEB_APP_URL
// riêng ở đây — trước đây 2 hằng số cùng giá trị nhưng tách rời, dễ quên đồng bộ.

// 1. Xử lý đăng nhập bằng Google (Phiên bản nối mạng Check Role)
const handleGoogleSuccess = async (credentialResponse) => {
  try {
    // Giải mã tạm để lấy cái ảnh Avatar hiển thị cho đẹp
    const decoded = jwtDecode(credentialResponse.credential);
    
    // Gói Token gửi xuống Trạm kiểm soát của GAS
    const payloadParams = new URLSearchParams();
    payloadParams.append('action', 'verifyToken');
    payloadParams.append('data', JSON.stringify({
        idToken: credentialResponse.credential
    }));

    // Gọi Backend để dò tên trong Sheet TaiKhoan
    const response = await fetch(GAS_URL, {
        method: 'POST',
        body: payloadParams
    });
    
    const result = await response.json();

    // Nếu Backend báo OK (Tìm thấy tên trong Sheet)
    if (result.code === 200) {
        const userInfo = {
            username: result.data.email,
            name: result.data.name || decoded.name,
            avatar: decoded.picture,
            role: result.data.role, // <--- ĂN TIỀN Ở ĐÂY! Lấy đúng Role (Admin, CanBo...) từ Google Sheets
            roles: result.data.roles, // ĐÃ THÊM: mảng role (chữ thường) để hỗ trợ multi-role, App.jsx dùng cái này để so quyền
            // ĐÃ SỬA tên field "token" -> "credential": App.jsx đọc currentUser.credential để tính hạn
            // JWT (checkTokenExpiry) — do lệch tên field, tính năng cảnh báo/gia hạn token trước đây
            // KHÔNG BAO GIỜ chạy (luôn no-op), user bị lỗi âm thầm sau ~1 tiếng mà không có cảnh báo.
            credential: credentialResponse.credential
        };
        
        if (typeof onLoginSuccess === 'function') {
            onLoginSuccess(userInfo);
        }
    } else {
        // Bị Backend từ chối (Không có trong Sheet hoặc sai Token)
        alert("⛔ Từ chối truy cập: " + result.message);
    }
  } catch (error) {
      alert("Lỗi kết nối đến máy chủ xác thực.");
  }
};

  // 2. Xử lý đăng nhập bằng Tài khoản nội bộ (Google Sheets)
  const handleLocalLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const userInfo = await loginUser(credentials.username, credentials.password);
      // ĐÃ VÁ BUG: dòng cũ `userInfo.name = userInfo.username;` LUÔN ghi đè tên hiển
      // thị bằng username/email, bất kể backend (action 'login' trong Quanlysv.gs)
      // đã trả đúng "name" lấy từ cột HoTen trong sheet TaiKhoan rồi — vì vậy tài
      // khoản nội bộ luôn hiện email thay vì họ tên. Giờ chỉ dùng username làm tên
      // hiển thị khi backend KHÔNG trả về name (dự phòng, không còn ghi đè vô điều kiện).
      userInfo.name = userInfo.name || userInfo.username;
      localStorage.setItem('tuyensinh_last_username', credentials.username); // ĐÃ THÊM: nhớ cho lần sau
      onLoginSuccess(userInfo);
    } catch (error) {
      Swal.fire('Lỗi đăng nhập', error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="d-flex align-items-center justify-content-center vh-100" style={{ backgroundColor: '#f4f6f9' }}>
      <div className="card shadow-lg border-0" style={{ maxWidth: '400px', width: '100%', borderRadius: '15px' }}>
        <div className="card-body p-5">
          <div className="text-center mb-4">
            <h2 className="fw-bold" style={{ color: '#037683' }}>
              <i className="bi bi-shield-lock-fill me-2"></i>HỆ THỐNG
            </h2>
            <p className="text-muted small">Vui lòng đăng nhập để tiếp tục</p>
          </div>

          {/* NÚT ĐĂNG NHẬP GOOGLE */}
          <div className="d-flex justify-content-center mb-4">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => Swal.fire('Lỗi', 'Không thể kết nối với Google', 'error')}
              useOneTap
            />
          </div>

          <div className="d-flex align-items-center my-4">
            <hr className="flex-grow-1" />
            <span className="mx-3 text-muted small">Hoặc tài khoản nội bộ</span>
            <hr className="flex-grow-1" />
          </div>

          {/* FORM ĐĂNG NHẬP TRUYỀN THỐNG */}
          <form onSubmit={handleLocalLogin}>
            <div className="mb-3">
              <input 
                type="text" 
                className="form-control form-control-lg bg-light" 
                placeholder="Tên đăng nhập" 
                value={credentials.username}
                onChange={e => setCredentials({...credentials, username: e.target.value})}
                required
              />
            </div>
            <div className="mb-4">
              <input 
                type="password" 
                className="form-control form-control-lg bg-light" 
                placeholder="Mật khẩu" 
                value={credentials.password}
                onChange={e => setCredentials({...credentials, password: e.target.value})}
                required
              />
            </div>
            <button className="btn btn-primary w-100 btn-lg fw-bold" type="submit" disabled={isLoading}>
              {isLoading ? 'Đang kiểm tra...' : 'ĐĂNG NHẬP'}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
};

export default LoginPage;