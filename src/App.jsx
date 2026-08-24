import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { sendFeedback } from './api/studentApi';
import AdmissionsPage from './pages/Admissions/AdmissionsPage'; 
import SettingsPage from './pages/Settings/SettingsPage'; 
import LoginPage from './pages/Auth/LoginPage'; 
import UserStatsPage from './pages/Settings/UserStatsPage'; 
import XetTuyenPage from './pages/XetTuyen/XetTuyenPage'; 
import ThamDinhPage from './pages/ThamDinh/ThamDinhPage'; // ĐÃ THÊM (Pha 2 roadmap)

// Dùng để khởi tạo lại GIS ngay trong App.jsx cho việc gia hạn token ngầm (xem useEffect bên dưới)
// — cùng giá trị Client ID đã dùng ở main.jsx/LoginPage.jsx.
const GOOGLE_CLIENT_ID_RENEWAL = "311965248456-01ts8h9g6tuj0slob58n8vrfm091c4u7.apps.googleusercontent.com";

// ĐÃ THÊM: hàm này được checkTokenExpiry() gọi tới nhưng CHƯA TỪNG được định nghĩa
// ở đâu trong file — do bug credential/token (đã sửa ở trên) nên checkTokenExpiry
// luôn return sớm, dòng gọi parseJwt() không bao giờ chạy tới nên lỗi "parseJwt is
// not defined" chưa từng lộ ra. Giờ credential đã có thật, phải có hàm này thì mới
// không bị crash. Chỉ giải mã phần payload của JWT, không cần thư viện ngoài.
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

// ĐÃ THÊM: helper so quyền không phân biệt hoa/thường, hỗ trợ 1 tài khoản có
// nhiều role cùng lúc (userRoles là mảng, khớp với "roles" mảng backend trả về ở
// action verifyToken/login) — thay cho so trực tiếp 1 chuỗi như bản cũ.
const hasAnyRole = (userRoles, allowedRoles) => {
  if (!Array.isArray(userRoles)) return false;
  const allowedLower = allowedRoles.map(r => r.toLowerCase());
  return userRoles.some(r => allowedLower.includes(String(r).toLowerCase()));
};

// TRẠM KIỂM SOÁT PHÂN QUYỀN
const ProtectedRoute = ({ userRoles, allowedRoles, children }) => {
  // Nếu 1 trong các Role của user nằm trong danh sách được phép -> Cho qua
  if (hasAnyRole(userRoles, allowedRoles) || hasAnyRole(userRoles, ['Admin'])) {
    return children;
  }
  // Nếu không -> Hiện màn hình Khóa
  return (
    <div className="d-flex flex-column align-items-center justify-content-center mt-5 pt-5 text-center">
      <h1 className="text-danger display-1"><i className="bi bi-shield-lock-fill"></i></h1>
      <h3 className="text-muted mt-3 fw-bold">KHÔNG CÓ QUYỀN TRUY CẬP</h3>
      <p className="text-secondary">Tài khoản của bạn không được phân quyền sử dụng chức năng này.</p>
    </div>
  );
};

// ĐÃ THÊM: đảm bảo luôn có "roles" (mảng) dù backend cũ chưa trả về, hoặc phiên
// đăng nhập cũ còn lưu trong localStorage từ trước khi có trường này — tránh
// user cũ bị văng ra màn hình "KHÔNG CÓ QUYỀN" oan sau khi cập nhật code.
const normalizeUserInfo = (userInfo) => {
  if (!userInfo) return userInfo;
  if (Array.isArray(userInfo.roles) && userInfo.roles.length > 0) return userInfo;
  const roles = String(userInfo.role || "").split(",").map(r => r.trim().toLowerCase()).filter(Boolean);
  return { ...userInfo, roles };
};

const App = () => {
  // State quản lý menu dọc trên điện thoại
  const [isNavCollapsed, setIsNavCollapsed] = useState(true);
  
  // State quản lý Đóng/Mở menu tài khoản
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  
  const [currentUser, setCurrentUser] = useState(() => {
    const savedUser = localStorage.getItem('tuyensinh_user');
    return savedUser ? normalizeUserInfo(JSON.parse(savedUser)) : null;
  });

  // ĐÃ SỬA: đưa handleLogout ra ngoài useEffect (trước đây khai báo local bên trong,
  // không dùng lại được ở nơi khác) để dùng chung cho: idle-timeout, hết hạn JWT
  // Google, VÀ sự kiện "app:session-expired" (hết phiên tài khoản nội bộ) bên dưới.
  // ĐÃ SỬA: chỉ xoá sessionStorage khi CHỦ ĐỘNG bấm "Đăng xuất" (clearStorage=true) —
  // các trang như XetTuyenPage đang tự lưu form nhập dở vào sessionStorage để chống
  // mất dữ liệu khi F5. Trước đây hết phiên tự động (idle/hết hạn token/hết session
  // nội bộ) cũng bị sessionStorage.clear() theo, xoá mất đúng lúc dữ liệu cần giữ
  // nhất. Giờ hết phiên tự động sẽ GIỮ NGUYÊN sessionStorage — đăng nhập lại xong,
  // các trang có cơ chế tự khôi phục (như XetTuyenPage) sẽ tự nạp lại form cũ.
  const handleLogout = (msg, clearStorage = false) => {
    setCurrentUser(null);
    localStorage.removeItem('tuyensinh_user');
    if (clearStorage) sessionStorage.clear();
    if (msg) alert(msg);
    window.location.href = "/";
  };

  // ĐÃ THÊM: lắng nghe sự kiện "app:session-expired" do studentApi.js bắn ra khi bất kỳ
  // request nào bị GAS trả về code 401 (hết phiên tài khoản nội bộ sau 8 tiếng không
  // thao tác, hoặc idToken/sessionToken không hợp lệ) — tự đăng xuất + báo lý do ngay,
  // không cần đợi checkTokenExpiry (cơ chế đó chỉ áp dụng cho JWT Google).
  useEffect(() => {
    const onSessionExpired = (e) => {
      handleLogout(e.detail && e.detail.message ? e.detail.message : "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.");
    };
    window.addEventListener('app:session-expired', onSessionExpired);
    return () => window.removeEventListener('app:session-expired', onSessionExpired);
  }, []);

// ====================================================
  // TÍNH NĂNG TỰ ĐỘNG LOGOUT & CẢNH BÁO / GIA HẠN TOKEN
  // ====================================================
  useEffect(() => {
    let idleTimer;
    let tokenCheckInterval;

    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      if (currentUser) {
        idleTimer = setTimeout(() => {
          handleLogout("Phiên làm việc hết hạn do không tương tác quá 30 phút.");
        }, 30 * 60 * 1000); 
      }
    };

    const checkTokenExpiry = () => {
      if (!currentUser?.credential) return;
      const decoded = parseJwt(currentUser.credential);
      if (!decoded || !decoded.exp) return;
      
      const timeToExpiry = (decoded.exp * 1000) - Date.now();
      
      if (timeToExpiry <= 0) {
          handleLogout("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
      } else if (timeToExpiry > 0 && timeToExpiry <= 5 * 60 * 1000) {
          // Còn dưới 5 phút -> Gọi Google One Tap để cấp lại ngầm
          if (!window.isRenewing) {
              window.isRenewing = true; // Cờ chặn gọi nhiều lần
              if (window.google && window.google.accounts && window.google.accounts.id) {
                  // ĐÃ SỬA BUG: bản cũ trông cậy vào onSuccess của <GoogleLogin> (chỉ tồn tại ở
                  // LoginPage, đã unmount sau khi đăng nhập) để "hứng" token mới — nên prompt()
                  // gọi ra nhưng không có gì nhận kết quả, gia hạn ngầm KHÔNG BAO GIỜ thực sự
                  // cập nhật currentUser. Giờ initialize() lại NGAY TẠI ĐÂY với callback riêng,
                  // sống suốt vòng đời App (không phụ thuộc LoginPage còn mount hay không), để
                  // thật sự nhận và lưu token mới khi Google gia hạn thành công.
                  window.google.accounts.id.initialize({
                      client_id: GOOGLE_CLIENT_ID_RENEWAL,
                      callback: (response) => {
                          window.isRenewing = false;
                          setCurrentUser(prev => {
                              if (!prev) return prev;
                              const updated = { ...prev, credential: response.credential };
                              localStorage.setItem('tuyensinh_user', JSON.stringify(updated));
                              return updated;
                          });
                      }
                  });
                  window.google.accounts.id.prompt((notification) => {
                      // Nếu hệ thống Google KHÔNG THỂ hiển thị popup gia hạn ngầm
                      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                          window.isRenewing = false;
                          if (window.confirm("Phiên đăng nhập sắp hết hạn và hệ thống tự gia hạn thất bại. Đăng xuất ngay để làm mới?")) {
                              handleLogout("Đã đăng xuất để bảo mật dữ liệu.");
                          }
                      }
                  });
              }
          }
      } else {
          window.isRenewing = false; // Token còn khỏe thì reset cờ
      }
    };

    if (currentUser) {
      const events = ['mousemove', 'keydown', 'scroll', 'click'];
      events.forEach(e => window.addEventListener(e, resetIdleTimer));
      resetIdleTimer();
      tokenCheckInterval = setInterval(checkTokenExpiry, 30000); 
    }

    return () => {
      clearTimeout(idleTimer);
      clearInterval(tokenCheckInterval);
      const events = ['mousemove', 'keydown', 'scroll', 'click'];
      events.forEach(e => window.removeEventListener(e, resetIdleTimer));
    };
  }, [currentUser]);


  const handleLoginSuccess = (userInfo) => {
    const normalized = normalizeUserInfo(userInfo);
    setCurrentUser(normalized);
    localStorage.setItem('tuyensinh_user', JSON.stringify(normalized));
  };

  // ĐÃ SỬA: dùng lại handleLogout(msg) khai báo ở trên (không alert khi msg rỗng — tự
  // bấm nút "Đăng xuất" thì không cần cảnh báo gì), tránh khai báo trùng tên 2 lần.
  const handleLogoutClick = () => handleLogout(null, true); // bấm tay -> xoá luôn sessionStorage

  // ĐÃ THÊM: nút "Phản hồi" ở footer toàn app — mở form nhập, gửi qua Google Chat.
  // Dùng Swal (đã có sẵn trong dự án) thay vì tự viết modal riêng cho gọn.
  const handleOpenFeedback = async () => {
    const { value: noiDung, isConfirmed } = await Swal.fire({
      title: '💬 Gửi phản hồi',
      input: 'textarea',
      inputPlaceholder: 'Mô tả lỗi gặp phải hoặc góp ý của bạn...',
      showCancelButton: true,
      confirmButtonText: 'Gửi',
      cancelButtonText: 'Hủy',
      inputValidator: (value) => !value?.trim() ? 'Vui lòng nhập nội dung phản hồi!' : undefined,
    });
    if (!isConfirmed || !noiDung) return;

    try {
      await sendFeedback(noiDung.trim());
      Swal.fire({ icon: 'success', title: 'Cảm ơn bạn!', text: 'Chúng tôi đã nhận được phản hồi.' });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Gửi thất bại', text: err.message });
    }
  };

  if (!currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  const displayName = currentUser.name || currentUser.username;

  return (
    <HashRouter>
      <div style={{ minHeight: '100vh', backgroundColor: '#f4f6f9', paddingBottom: '38px' }}>
        
        <nav className="navbar navbar-expand-lg navbar-dark bg-dark shadow-sm sticky-top">
          <div className="container-fluid px-4">
            <span className="navbar-brand fw-bold" style={{ color: '#0dcaf0', letterSpacing: '1px' }}>
              <i className="bi bi-mortarboard-fill me-2"></i> HỆ THỐNG TUYỂN SINH
            </span>
            
            <button className="navbar-toggler border-0 shadow-none" type="button" onClick={() => setIsNavCollapsed(!isNavCollapsed)}>
              <span className="navbar-toggler-icon"></span>
            </button>

            <div className={`${isNavCollapsed ? 'collapse' : ''} navbar-collapse`} id="navbarNav">
              
              {/* MENU CHÍNH: Đã bọc điều kiện ẩn/hiện theo quyền */}
              <ul className="navbar-nav me-auto mb-2 mb-lg-0 ms-lg-4 gap-2">
                {/* MENU QUẢN LÝ HỒ SƠ: Dành cho CanBo và Admin */}
                {hasAnyRole(currentUser.roles, ['CanBo', 'Admin']) && (
                  <li className="nav-item">
                    <NavLink to="/thu-ho-so-nhap-hoc" onClick={() => setIsNavCollapsed(true)} className={({isActive}) => `nav-link px-3 rounded ${isActive ? 'active bg-primary text-white shadow-sm' : 'text-light'}`}>
                      <i className="bi bi-people-fill me-1"></i> Quản lý hồ sơ
                    </NavLink>
                  </li>
                )}

                {/* MENU XÉT TUYỂN: Dành cho TuyenSinh, ThamDinh và Admin */}
                {hasAnyRole(currentUser.roles, ['TuyenSinh', 'ThamDinh', 'Admin']) && (
                  <li className="nav-item">
                    <NavLink to="/xet-tuyen" onClick={() => setIsNavCollapsed(true)} className={({isActive}) => `nav-link px-3 rounded ${isActive ? 'active bg-primary text-white shadow-sm' : 'text-light'}`}>
                      <i className="bi bi-card-checklist me-1"></i> Nhập liệu Xét tuyển
                    </NavLink>
                  </li>
                )}

                {/* MENU THẨM ĐỊNH: Dành cho ThamDinh và Admin — ĐÃ THÊM (Pha 2 roadmap) */}
                {hasAnyRole(currentUser.roles, ['ThamDinh', 'Admin']) && (
                  <li className="nav-item">
                    <NavLink to="/tham-dinh" onClick={() => setIsNavCollapsed(true)} className={({isActive}) => `nav-link px-3 rounded ${isActive ? 'active bg-primary text-white shadow-sm' : 'text-light'}`}>
                      <i className="bi bi-clipboard-check me-1"></i> Ban Thẩm định
                    </NavLink>
                  </li>
                )}

                {/* CẤU HÌNH: Chỉ Admin mới thấy */}
                {hasAnyRole(currentUser.roles, ['Admin']) && (
                  <li className="nav-item">
                    <NavLink to="/settings" onClick={() => setIsNavCollapsed(true)} className={({isActive}) => `nav-link px-3 rounded ${isActive ? 'active bg-primary text-white shadow-sm' : 'text-light'}`}>
                      <i className="bi bi-gear-fill me-1"></i> Cấu hình hệ thống
                    </NavLink>
                  </li>
                )}
              </ul>
              
              {/* DROPDOWN USER MENU */}
              <div className="nav-item dropdown d-flex align-items-center mt-3 mt-lg-0 position-relative">
                <a 
                  className="nav-link dropdown-toggle text-light d-flex align-items-center p-0" 
                  href="#" 
                  onClick={(e) => {
                    e.preventDefault();
                    setIsUserDropdownOpen(!isUserDropdownOpen);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {currentUser.avatar ? (
                    <img src={currentUser.avatar} alt="avatar" className="rounded-circle me-2" width="32" height="32" />
                  ) : (
                    <i className="bi bi-person-circle fs-4 me-2"></i>
                  )}
                  <div className="d-flex flex-column lh-1 text-start me-1">
                    <span className="fw-bold small">{displayName}</span>
                    <span className="small opacity-75" style={{ fontSize: '0.75rem' }}>{currentUser.role}</span>
                  </div>
                </a>
                
                <ul 
                  className={`dropdown-menu dropdown-menu-end shadow border-0 mt-2 ${isUserDropdownOpen ? 'show' : ''}`} 
                  style={{ position: 'absolute', right: 0, top: '100%' }}
                >
                  <li>
                    <NavLink 
                      to="/user-stats" 
                      className="dropdown-item py-2" 
                      onClick={() => {
                        setIsNavCollapsed(true);
                        setIsUserDropdownOpen(false);
                      }}
                    >
                      <i className="bi bi-graph-up-arrow me-2 text-primary"></i> Thống kê cá nhân
                    </NavLink>
                  </li>
                  <li><hr className="dropdown-divider" /></li>
                  <li>
                    <button className="dropdown-item text-danger py-2" onClick={handleLogoutClick}>
                      <i className="bi bi-box-arrow-right me-2"></i> Đăng xuất
                    </button>
                  </li>
                </ul>
              </div>

            </div>
          </div>
        </nav>

        <div className="p-2 p-md-3">
          {/* VÙNG ĐỊNH TUYẾN CHÍNH (Chỉ giữ 1 khối Routes duy nhất) */}
          <Routes>
            {/* Nhóm 1: Cán bộ — ĐÃ ĐỔI TÊN đường dẫn "/" -> "/thu-ho-so-nhap-hoc" theo quy hoạch
                4 route: thu-ho-so-nhap-hoc / xet-tuyen / settings / tham-dinh (sắp thêm) */}
            <Route path="/" element={<Navigate to="/thu-ho-so-nhap-hoc" replace />} />
            <Route path="/thu-ho-so-nhap-hoc" element={
              <ProtectedRoute userRoles={currentUser.roles} allowedRoles={['CanBo']}>
                <AdmissionsPage />
              </ProtectedRoute>
            } />

            {/* Nhóm 2: Tuyển sinh (Xét tuyển) */}
            <Route path="/xet-tuyen" element={
              <ProtectedRoute userRoles={currentUser.roles} allowedRoles={['TuyenSinh', 'ThamDinh']}>
                <XetTuyenPage />
              </ProtectedRoute>
            } />

            {/* Nhóm 3: Thẩm định — ĐÃ THÊM (Pha 2 roadmap), UI thật sẽ hoàn thiện ở Pha 3+ */}
            <Route path="/tham-dinh" element={
              <ProtectedRoute userRoles={currentUser.roles} allowedRoles={['ThamDinh']}>
                <ThamDinhPage />
              </ProtectedRoute>
            } />

            {/* Nhóm 4: Settings (Chỉ Admin) */}
            <Route path="/settings" element={
              <ProtectedRoute userRoles={currentUser.roles} allowedRoles={[]}>
                <SettingsPage />
              </ProtectedRoute>
            } />
            
            {/* Các trang chung ai cũng vào được */}
            <Route path="/user-stats" element={<UserStatsPage />} />
            
            {/* Trang báo lỗi 404 */}
            <Route path="*" element={
              <div className="d-flex flex-column align-items-center justify-content-center mt-5 pt-5">
                <h1 className="text-muted display-1"><i className="bi bi-emoji-frown"></i></h1>
                <h3 className="text-muted mt-3">404 - Không tìm thấy trang</h3>
              </div>
            } />
          </Routes>
        </div>

        {/* ĐÃ THÊM: footer cố định dưới cùng, hiện xuyên suốt toàn app — nút Phản hồi bên
            trái, dòng "Cập nhật lần cuối" bên phải theo đúng yêu cầu. */}
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1020,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '6px 16px', background: 'rgba(255,255,255,0.95)',
          borderTop: '1px solid #dee2e6', fontSize: '0.8rem'
        }}>
          <button className="btn btn-sm btn-outline-secondary" onClick={handleOpenFeedback}>
            💬 Phản hồi
          </button>
          <span className="text-muted">Cập nhật lần cuối bởi Nguyễn Tiến Thịnh</span>
        </div>

      </div>
    </HashRouter>
  );
};

export default App;