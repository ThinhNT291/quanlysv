import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from "jwt-decode";
import { loginUser } from '../../api/studentApi';
import Swal from 'sweetalert2';

const LoginPage = ({ onLoginSuccess }) => {
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);

  // 1. Xử lý đăng nhập bằng Google
  const handleGoogleSuccess = (credentialResponse) => {
    // Giải mã cục Token do Google trả về để lấy thông tin Email, Tên, Avatar
    const decoded = jwtDecode(credentialResponse.credential);
    
    // Tạm thời cho phép tất cả ai có mail Google đều vào được (Có thể chặn domain trường sau này)
    const userInfo = {
      username: decoded.email,
      name: decoded.name,
      avatar: decoded.picture,
      role: 'Giảng viên / Cán bộ'
    };
    
    onLoginSuccess(userInfo); // Báo cho App.jsx biết là đã Login thành công
  };

  // 2. Xử lý đăng nhập bằng Tài khoản nội bộ (Google Sheets)
  const handleLocalLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const userInfo = await loginUser(credentials.username, credentials.password);
      userInfo.name = userInfo.username; // Lấy username làm tên hiển thị
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