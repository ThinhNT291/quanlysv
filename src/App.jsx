import React, { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';
import Swal from 'sweetalert2';
import { sendFeedback } from './api/studentApi';
import './App.css';
import logoPhuXuan from './assets/logo-phuxuan.png'; // ĐÃ THÊM: logo trường, đặt góc trên-trái navbar
import Home from './pages/Home'; // ĐÃ THÊM: trang chủ dạng thẻ chức năng sau đăng nhập
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
  const userDropdownRef = useRef(null);

  // ĐÃ THÊM: tự đóng dropdown tài khoản khi bấm ra ngoài hoặc nhấn Esc.
  useEffect(() => {
    if (!isUserDropdownOpen) return;
    const handleClickOutside = (e) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target)) {
        setIsUserDropdownOpen(false);
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') setIsUserDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isUserDropdownOpen]);

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
      } else if (timeToExpiry > 0 && timeToExpiry <= 15 * 60 * 1000) {
          // ĐÃ SỬA: mốc bắt đầu thử gia hạn kéo sớm ra từ 5 phút -> 15 phút trước khi
          // hết hạn. Mỗi lần thử cách nhau 30s (tokenCheckInterval bên dưới) nên trước
          // đây chỉ có ~10 lượt thử trong khung 5 phút — nếu Google tạm chặn/cooldown
          // one-tap hơi lâu 1 chút (chuyện bình thường bên phía Google, ngoài tầm kiểm
          // soát của mình) là hết khung luôn, hụt cả 10 lượt thì bung thẳng ra "hết
          // hạn". Giờ có ~30 lượt thử trong khung 15 phút -> nhiều cơ hội hơn hẳn để
          // ít nhất 1 lượt thành công trước khi tới hạn thật.
          // Còn dưới 15 phút -> Gọi Google One Tap để cấp lại ngầm
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
                      // ĐÃ THÊM: bật FedCM cho prompt() — đây chính là nguyên nhân thật của lỗi
                      // "[GSI_LOGGER]: The given origin is not allowed for the given client ID."
                      // dù origin ĐÃ khai báo đúng trong Console. Khi prompt() gọi mà KHÔNG bật
                      // FedCM, Google dùng cơ chế cũ: 1 iframe ẩn gọi XHR tới
                      // accounts.google.com/gsi/status để tự kiểm tra origin — cơ chế này cần
                      // cookie bên thứ 3 (third-party cookie) gửi kèm iframe đó. Trình duyệt hiện
                      // đại (đặc biệt Chrome ở chế độ Ẩn danh mà ông vừa test, hoặc Chrome thường
                      // đã bật chặn cookie bên thứ 3 theo lộ trình Privacy Sandbox) chặn cookie
                      // này -> request tới gsi/status coi như "không có phiên hợp lệ" và trả về
                      // y hệt lỗi origin-not-allowed, DÙ origin khai báo hoàn toàn chính xác. Bật
                      // use_fedcm_for_prompt: true thì trình duyệt tự xác thực bằng API FedCM gốc
                      // của Chrome (không qua iframe/cookie bên thứ 3 nữa) -> hết bị lỗi giả này.
                      // Lưu ý: nút đăng nhập Google (LoginPage.jsx, có useOneTap) CŨNG đi qua
                      // đúng cơ chế prompt() này nên nhiều khả năng cũng đang âm thầm gặp lỗi y
                      // hệt lúc đăng nhập — chỉ là không lộ ra vì nút "Đăng nhập bằng Google" vẫn
                      // bấm tay được qua cơ chế popup riêng (không phải prompt) nên che mất lỗi.
                      use_fedcm_for_prompt: true,
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
                          // ĐÃ THÊM: log rõ LÝ DO Google từ chối hiện popup — trước đây gặp
                          // "gia hạn thất bại" là bó tay, không biết vì sao (trình duyệt chặn
                          // cookie bên thứ 3, Google tự tạm khoá popup do trước đó người dùng
                          // đã bấm tắt nhiều lần, phiên Google đã đăng xuất, v.v. — mỗi lý do
                          // sửa một kiểu khác nhau). Mở Console (F12) lúc gặp lỗi để xem đúng
                          // nguyên nhân, báo lại để xử lý đúng chỗ thay vì đoán mò.
                          console.warn(
                              '[Gia hạn phiên Google] Popup không hiển thị được — lý do:',
                              notification.isNotDisplayed() ? notification.getNotDisplayedReason() : notification.getSkippedReason()
                          );
                          window.isRenewing = false;
                          if (window.confirm("Phiên đăng nhập sắp hết hạn và hệ thống tự gia hạn thất bại. Đăng xuất ngay để làm mới?")) {
                              handleLogout("Đã đăng xuất để bảo mật dữ liệu.");
                          }
                      }
                  });
              } else {
                  // ĐÃ SỬA BUG: trước đây window.isRenewing = true được set NGAY TRƯỚC khi
                  // kiểm tra window.google có sẵn sàng hay chưa — nếu lúc đó window.google
                  // (script accounts.google.com/gsi/client) CHƯA kịp tải xong hoặc bị chặn
                  // hẳn (ví dụ trình chặn quảng cáo chặn domain accounts.google.com trên
                  // tên miền công khai như github.io — khác với localhost lúc dev thường
                  // được các bộ lọc bỏ qua), khối if() này rơi vào nhánh else và isRenewing
                  // bị KẸT ở true VĨNH VIỄN — mọi lần checkTokenExpiry() sau đó (mỗi 30s)
                  // đều bị chặn ngay từ đầu (if (!window.isRenewing) return), không bao giờ
                  // thử lại, không log gì, không hiện popup xác nhận nào — cứ thế im lặng
                  // tới khi hết hạn thật thì bung thẳng ra "Phiên đăng nhập đã hết hạn" mà
                  // không hề thấy bước "gia hạn thất bại" trước đó (đúng hiện tượng gặp trên
                  // github.io). Giờ reset lại cờ + log rõ lý do để lần sau (30s kế tiếp) có
                  // cơ hội thử lại, và để biết chính xác window.google có tải được hay không.
                  console.warn('[Gia hạn phiên Google] window.google.accounts.id chưa sẵn sàng (script accounts.google.com/gsi/client chưa tải xong hoặc bị chặn) — sẽ thử lại sau 30s.');
                  window.isRenewing = false;
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
            {/* ĐÃ THÊM: logo trường ở góc trên-trái, đứng cùng dòng với tên hệ thống — logo
                tự thu nhỏ ở màn hình hẹp (xem .app-logo trong App.css) để cụm thương hiệu
                không bị vỡ dòng, tránh phải xuống 2 dòng hay tách cột trên di động. */}
            <span className="navbar-brand fw-bold d-flex align-items-center" style={{ color: '#0dcaf0', letterSpacing: '1px' }}>
              <img src={logoPhuXuan} alt="Phú Xuan University" className="app-logo me-2" />
              <i className="bi bi-mortarboard-fill me-2"></i> HỆ THỐNG TUYỂN SINH
            </span>

            {/* CỤM TÀI KHOẢN — ĐÃ KÉO RA KHỎI navbar-collapse: trước đây nằm chung trong menu
                ☰ nên trên di động phải mở hẳn menu mới thấy đang đăng nhập là ai / mới đăng
                xuất được. Giờ luôn hiển thị ngang hàng ngay cạnh thương hiệu, nhờ ms-auto +
                flex-wrap sẵn có của .navbar nên màn quá hẹp sẽ tự xuống dòng chứ không tràn. */}
            <div className="nav-item dropdown d-flex align-items-center flex-shrink-0 position-relative ms-auto me-2 me-lg-3 mt-2 mt-lg-0 order-lg-2" ref={userDropdownRef}>
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

            <button className="navbar-toggler border-0 shadow-none" type="button" onClick={() => setIsNavCollapsed(!isNavCollapsed)}>
              <span className="navbar-toggler-icon"></span>
            </button>

            <div className={`${isNavCollapsed ? 'collapse' : ''} navbar-collapse app-nav-collapse order-lg-1`} id="navbarNav">

              {/* MENU CHÍNH: Đã bọc điều kiện ẩn/hiện theo quyền */}
              <ul className="navbar-nav me-auto mb-2 mb-lg-0 ms-lg-4 gap-2">
                {/* ĐÃ THÊM: lối về Trang chủ — trước đây "/" chỉ redirect thẳng sang Quản lý
                    hồ sơ nên rời trang đó là không còn cách nào quay lại màn hình chọn
                    chức năng nữa. */}
                <li className="nav-item">
                  <NavLink to="/" end onClick={() => setIsNavCollapsed(true)} className={({isActive}) => `nav-link px-3 rounded ${isActive ? 'active bg-primary text-white shadow-sm' : 'text-light'}`}>
                    <i className="bi bi-house-door-fill me-1"></i> Trang chủ
                  </NavLink>
                </li>

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

            </div>
          </div>
        </nav>

        <div className="p-2 p-md-3">
          {/* VÙNG ĐỊNH TUYẾN CHÍNH (Chỉ giữ 1 khối Routes duy nhất) */}
          <Routes>
            {/* ĐÃ SỬA: "/" trước đây redirect thẳng sang Quản lý hồ sơ (Navigate replace),
                giờ trỏ về Trang chủ dạng thẻ chức năng — mỗi thẻ tự lọc theo quyền của
                currentUser (xem Home.jsx), không cần bọc thêm ProtectedRoute ở đây. */}
            <Route path="/" element={<Home currentUser={currentUser} />} />
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