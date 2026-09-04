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
import XacNhanDinhDanhPage from './pages/DinhDanh/XacNhanDinhDanhPage'; // ĐÃ THÊM (Pha 1·D1 — bước 4)
import KhoSinhVienPage from './pages/KhoSinhVien/KhoSinhVienPage'; // ĐÃ THÊM: "Kho tra cứu sinh viên" — gộp Trung Gian + KETQUA + Đào tạo
import ChiTietHoSoKhoPage from './pages/KhoSinhVien/ChiTietHoSoKhoPage'; // ĐÃ THÊM: trang chi tiết 1 hồ sơ trong Kho

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

  // ĐÃ THÊM: gom menu chính thành 3 nhóm xổ xuống (Tuyển sinh / Thẩm định / Hệ thống) cho
  // hàng menu đỡ dài — openGroup giữ đúng 1 tên nhóm đang mở ('tuyensinh'|'thamdinh'|
  // 'hethong') hoặc null. Dùng CHUNG 1 cơ chế đóng khi bấm ra ngoài/Esc như dropdown tài
  // khoản ở trên, chỉ khác là phải tra đúng ref của nhóm đang mở (mỗi nhóm 1 ref riêng vì
  // 3 nhóm là 3 khối DOM tách biệt trong <ul className="navbar-nav">).
  const [openGroup, setOpenGroup] = useState(null);
  const tuyenSinhRef = useRef(null);
  const thamDinhRef = useRef(null);
  const heThongRef = useRef(null);

  useEffect(() => {
    if (!openGroup) return;
    const refTheoNhom = { tuyensinh: tuyenSinhRef, thamdinh: thamDinhRef, hethong: heThongRef };
    const handleClickOutside = (e) => {
      const ref = refTheoNhom[openGroup];
      if (ref && ref.current && !ref.current.contains(e.target)) setOpenGroup(null);
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') setOpenGroup(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openGroup]);

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
  // request nào bị GAS trả về code 401 (hết phiên — sessionToken quá 8 tiếng không thao
  // tác, hoặc idToken/sessionToken không hợp lệ) — tự đăng xuất + báo lý do ngay. Đây là
  // cơ chế DUY NHẤT xử lý hết phiên nay (tài khoản Google cũng dùng sessionToken sliding
  // 8 tiếng y hệt tài khoản nội bộ, xem action 'verifyToken' — không còn phụ thuộc Google
  // tự gia hạn idToken ngầm nữa).
  useEffect(() => {
    const onSessionExpired = (e) => {
      handleLogout(e.detail && e.detail.message ? e.detail.message : "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.");
    };
    window.addEventListener('app:session-expired', onSessionExpired);
    return () => window.removeEventListener('app:session-expired', onSessionExpired);
  }, []);

// ====================================================
  // TÍNH NĂNG TỰ ĐỘNG LOGOUT KHI KHÔNG THAO TÁC (idle timeout)
  // ====================================================
  // ĐÃ BỎ: toàn bộ cơ chế "gia hạn token ngầm" qua Google One Tap (checkTokenExpiry +
  // window.google.accounts.id.initialize()/prompt() mỗi 30s). Cơ chế đó vốn mong manh —
  // phụ thuộc cookie bên thứ 3 hoặc FedCM (không phải trình duyệt nào cũng hỗ trợ đủ,
  // ví dụ Firefox từng báo "Skipping unsupported feature name identity-credentials-get"),
  // Google tự khoá popup sau khi bị người dùng từ chối/tắt vài lần, và mỗi lần thử lại
  // gọi initialize() chồng lên phiên trước gây cảnh báo "initialize() is called multiple
  // times" cùng các request bị NS_BINDING_ABORTED — dù đã vá nhiều lần vẫn tái diễn "gia
  // hạn thất bại". Giờ tài khoản Google được cấp sessionToken nội bộ ngay lúc đăng nhập
  // (xem action 'verifyToken' trong Quanlysv.gs) — sessionToken này TRƯỢT HẠN 8 tiếng mỗi
  // khi có request thành công (validateSession phía server), y hệt tài khoản nội bộ vốn
  // đã chạy ổn định — nên không còn cần Google tự gia hạn idToken ngầm nữa. Nếu sessionToken
  // hết hạn thật (8 tiếng không thao tác), interceptor 401 trong studentApi.js đã tự bắt
  // và đăng xuất (xem sự kiện 'app:session-expired' ở trên) — không cần thêm cơ chế riêng.
  useEffect(() => {
    let idleTimer;

    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      if (currentUser) {
        idleTimer = setTimeout(() => {
          handleLogout("Phiên làm việc hết hạn do không tương tác quá 30 phút.");
        }, 30 * 60 * 1000);
      }
    };

    if (currentUser) {
      const events = ['mousemove', 'keydown', 'scroll', 'click'];
      events.forEach(e => window.addEventListener(e, resetIdleTimer));
      resetIdleTimer();
    }

    return () => {
      clearTimeout(idleTimer);
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
                không bị vỡ dòng, tránh phải xuống 2 dòng hay tách cột trên di động.
                ĐÃ SỬA: bỏ mục "Trang chủ" khỏi menu chính -> gắn lối về trang chủ ngay vào
                đây (cả logo lẫn chữ đều bấm được), đổi tên "HỆ THỐNG TUYỂN SINH" 1 dòng
                thành "HỆ THỐNG / QUẢN LÝ SINH VIÊN" 2 dòng, chữ nhỏ lại, căn giữa. */}
            <NavLink
              to="/"
              end
              onClick={() => setIsNavCollapsed(true)}
              className="navbar-brand fw-bold d-flex align-items-center text-decoration-none"
              style={{ color: '#0dcaf0', letterSpacing: '0.5px' }}
            >
              <img src={logoPhuXuan} alt="Phú Xuan University" className="app-logo me-2" />
              <i className="bi bi-mortarboard-fill me-2"></i>
              <span className="d-flex flex-column text-center lh-1" style={{ fontSize: '0.8rem' }}>
                <span>HỆ THỐNG</span>
                <span>QUẢN LÝ SINH VIÊN</span>
              </span>
            </NavLink>

            {/* CỤM TÀI KHOẢN — ĐÃ KÉO RA KHỎI navbar-collapse: trước đây nằm chung trong menu
                ☰ nên trên di động phải mở hẳn menu mới thấy đang đăng nhập là ai / mới đăng
                xuất được. Giờ luôn hiển thị ngang hàng ngay cạnh thương hiệu, nhờ ms-auto +
                flex-wrap sẵn có của .navbar nên màn quá hẹp sẽ tự xuống dòng chứ không tràn. */}
            <div className="nav-item dropdown d-flex align-items-center flex-shrink-0 position-relative ms-auto me-2 me-lg-3 mt-2 mt-lg-0 order-lg-2" ref={userDropdownRef}>
              {/* ĐÃ SỬA: ẩn username khỏi nút bấm — giờ chỉ hiện avatar + role, gọn hơn. Tên
                  tài khoản (displayName) chuyển vào bên trong menu xổ xuống, xem bên dưới. */}
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
                <span className="small fw-bold me-1">{currentUser.role}</span>
              </a>

              <ul
                className={`dropdown-menu dropdown-menu-end shadow border-0 mt-2 ${isUserDropdownOpen ? 'show' : ''}`}
                style={{ position: 'absolute', right: 0, top: '100%' }}
              >
                {/* ĐÃ THÊM: dòng username + avatar đầu menu — bấm vào sẽ mở trang hồ sơ cá
                    nhân của tài khoản đang đăng nhập. Trang đó làm sau (hiện là placeholder
                    "đang xây dựng", xem route /ho-so-ca-nhan trong Routes bên dưới) nên
                    KHÔNG hiện lỗi/trắng trang khi bấm vào trước khi trang thật xong. */}
                <li>
                  <NavLink
                    to="/ho-so-ca-nhan"
                    className="dropdown-item py-2 d-flex align-items-center gap-2"
                    onClick={() => {
                      setIsNavCollapsed(true);
                      setIsUserDropdownOpen(false);
                    }}
                  >
                    {currentUser.avatar ? (
                      <img src={currentUser.avatar} alt="avatar" className="rounded-circle" width="28" height="28" />
                    ) : (
                      <i className="bi bi-person-circle fs-5"></i>
                    )}
                    <span className="fw-bold">{displayName}</span>
                  </NavLink>
                </li>
                <li><hr className="dropdown-divider" /></li>
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

              {/* MENU CHÍNH: ĐÃ SỬA — gom lại còn đúng 3 nhóm xổ xuống (Tuyển sinh/Thẩm định/
                  Hệ thống) cho hàng menu đỡ dài, thay vì liệt kê phẳng từng trang như trước.
                  "Trang chủ" đã bỏ khỏi đây (chuyển sang gắn vào logo/chữ header, xem phía
                  trên). Mỗi nhóm chỉ hiện nếu tài khoản có quyền với ÍT NHẤT 1 trang bên
                  trong nhóm đó; từng mục con bên trong vẫn tự kiểm tra quyền riêng như cũ,
                  phòng trường hợp 1 tài khoản chỉ có quyền 1/2 mục trong nhóm. */}
              <ul className="navbar-nav me-auto mb-2 mb-lg-0 ms-lg-4 gap-2">

                {/* NHÓM 1 — TUYỂN SINH: Quản lý hồ sơ (Nhập học) + Nhập liệu Xét tuyển. */}
                {hasAnyRole(currentUser.roles, ['CanBo', 'TuyenSinh', 'ThamDinh', 'Admin']) && (
                  <li className="nav-item dropdown position-relative" ref={tuyenSinhRef}>
                    <a
                      className="nav-link px-3 rounded dropdown-toggle text-light"
                      href="#"
                      onClick={(e) => { e.preventDefault(); setOpenGroup(openGroup === 'tuyensinh' ? null : 'tuyensinh'); }}
                      style={{ cursor: 'pointer' }}
                    >
                      <i className="bi bi-mortarboard-fill me-1"></i> Tuyển sinh
                    </a>
                    <ul
                      className={`dropdown-menu shadow border-0 mt-2 ${openGroup === 'tuyensinh' ? 'show' : ''}`}
                      style={{ position: 'absolute', left: 0, top: '100%', zIndex: 1030 }}
                    >
                      {hasAnyRole(currentUser.roles, ['CanBo', 'ThamDinh', 'Admin']) && (
                        <li>
                          <NavLink
                            to="/thu-ho-so-nhap-hoc"
                            onClick={() => { setIsNavCollapsed(true); setOpenGroup(null); }}
                            className={({ isActive }) => `dropdown-item text-start py-2 ${isActive ? 'active' : ''}`}
                          >
                            <i className="bi bi-people-fill me-2"></i>Quản lý hồ sơ (Nhập học)
                          </NavLink>
                        </li>
                      )}
                      {hasAnyRole(currentUser.roles, ['TuyenSinh', 'ThamDinh', 'Admin']) && (
                        <li>
                          <NavLink
                            to="/xet-tuyen"
                            onClick={() => { setIsNavCollapsed(true); setOpenGroup(null); }}
                            className={({ isActive }) => `dropdown-item text-start py-2 ${isActive ? 'active' : ''}`}
                          >
                            <i className="bi bi-card-checklist me-2"></i>Nhập liệu Xét tuyển
                          </NavLink>
                        </li>
                      )}
                    </ul>
                  </li>
                )}

                {/* NHÓM 2 — THẨM ĐỊNH: Ban Thẩm định + Xác nhận định danh. */}
                {hasAnyRole(currentUser.roles, ['ThamDinh', 'Admin']) && (
                  <li className="nav-item dropdown position-relative" ref={thamDinhRef}>
                    <a
                      className="nav-link px-3 rounded dropdown-toggle text-light"
                      href="#"
                      onClick={(e) => { e.preventDefault(); setOpenGroup(openGroup === 'thamdinh' ? null : 'thamdinh'); }}
                      style={{ cursor: 'pointer' }}
                    >
                      <i className="bi bi-clipboard-check me-1"></i> Thẩm định
                    </a>
                    <ul
                      className={`dropdown-menu shadow border-0 mt-2 ${openGroup === 'thamdinh' ? 'show' : ''}`}
                      style={{ position: 'absolute', left: 0, top: '100%', zIndex: 1030 }}
                    >
                      {hasAnyRole(currentUser.roles, ['ThamDinh', 'Admin']) && (
                        <li>
                          <NavLink
                            to="/tham-dinh"
                            onClick={() => { setIsNavCollapsed(true); setOpenGroup(null); }}
                            className={({ isActive }) => `dropdown-item text-start py-2 ${isActive ? 'active' : ''}`}
                          >
                            <i className="bi bi-clipboard-check me-2"></i>Ban Thẩm định
                          </NavLink>
                        </li>
                      )}
                      {hasAnyRole(currentUser.roles, ['Admin', 'ThamDinh']) && (
                        <li>
                          <NavLink
                            to="/xac-nhan-dinh-danh"
                            onClick={() => { setIsNavCollapsed(true); setOpenGroup(null); }}
                            className={({ isActive }) => `dropdown-item text-start py-2 ${isActive ? 'active' : ''}`}
                          >
                            <i className="bi bi-person-fill-exclamation me-2"></i>Xác nhận định danh
                          </NavLink>
                        </li>
                      )}
                    </ul>
                  </li>
                )}

                {/* NHÓM 3 — HỆ THỐNG: Kho tra cứu sinh viên + Cấu hình hệ thống. */}
                {hasAnyRole(currentUser.roles, ['CanBo', 'TuyenSinh', 'ThamDinh', 'Admin']) && (
                  <li className="nav-item dropdown position-relative" ref={heThongRef}>
                    <a
                      className="nav-link px-3 rounded dropdown-toggle text-light"
                      href="#"
                      onClick={(e) => { e.preventDefault(); setOpenGroup(openGroup === 'hethong' ? null : 'hethong'); }}
                      style={{ cursor: 'pointer' }}
                    >
                      <i className="bi bi-hdd-stack-fill me-1"></i> Hệ thống
                    </a>
                    <ul
                      className={`dropdown-menu shadow border-0 mt-2 ${openGroup === 'hethong' ? 'show' : ''}`}
                      style={{ position: 'absolute', left: 0, top: '100%', zIndex: 1030 }}
                    >
                      {hasAnyRole(currentUser.roles, ['CanBo', 'TuyenSinh', 'ThamDinh', 'Admin']) && (
                        <li>
                          <NavLink
                            to="/quan-ly-ho-so-moi"
                            onClick={() => { setIsNavCollapsed(true); setOpenGroup(null); }}
                            className={({ isActive }) => `dropdown-item text-start py-2 ${isActive ? 'active' : ''}`}
                          >
                            <i className="bi bi-archive-fill me-2"></i>Kho tra cứu sinh viên
                          </NavLink>
                        </li>
                      )}
                      {hasAnyRole(currentUser.roles, ['Admin']) && (
                        <li>
                          <NavLink
                            to="/settings"
                            onClick={() => { setIsNavCollapsed(true); setOpenGroup(null); }}
                            className={({ isActive }) => `dropdown-item text-start py-2 ${isActive ? 'active' : ''}`}
                          >
                            <i className="bi bi-gear-fill me-2"></i>Cấu hình hệ thống
                          </NavLink>
                        </li>
                      )}
                    </ul>
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
            {/* ĐÃ SỬA: thêm ThamDinh (chỉ xem — xem ghi chú ở nav link phía trên và
                AdmissionsPage.jsx). ProtectedRoute tự OR thêm Admin sẵn. */}
            <Route path="/thu-ho-so-nhap-hoc" element={
              <ProtectedRoute userRoles={currentUser.roles} allowedRoles={['CanBo', 'ThamDinh']}>
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

            {/* Kho tra cứu sinh viên — ĐÃ THÊM. ProtectedRoute tự OR thêm Admin sẵn. */}
            <Route path="/quan-ly-ho-so-moi" element={
              <ProtectedRoute userRoles={currentUser.roles} allowedRoles={['CanBo', 'TuyenSinh', 'ThamDinh']}>
                <KhoSinhVienPage />
              </ProtectedRoute>
            } />
            {/* ĐÃ THÊM: trang chi tiết 1 hồ sơ trong Kho — route con, cùng quyền như trang
                Kho ở trên (không phải trang/file riêng, chỉ là 1 route khác của cùng bundle
                React — không tốn thêm lưu trữ dù có bao nhiêu hồ sơ). */}
            <Route path="/quan-ly-ho-so-moi/ho-so/:cccd/:nganh" element={
              <ProtectedRoute userRoles={currentUser.roles} allowedRoles={['CanBo', 'TuyenSinh', 'ThamDinh']}>
                <ChiTietHoSoKhoPage />
              </ProtectedRoute>
            } />

            {/* Hàng đợi xác nhận định danh (Admin + ThamDinh) — ĐÃ THÊM (Pha 1·D1 — bước 4);
                ĐÃ SỬA: allowedRoles=['ThamDinh'] — ProtectedRoute tự OR thêm Admin (xem định
                nghĩa ở trên), nên kết quả là đúng 2 role Admin + ThamDinh được vào. */}
            <Route path="/xac-nhan-dinh-danh" element={
              <ProtectedRoute userRoles={currentUser.roles} allowedRoles={['ThamDinh']}>
                <XacNhanDinhDanhPage />
              </ProtectedRoute>
            } />
            
            {/* Các trang chung ai cũng vào được */}
            <Route path="/user-stats" element={<UserStatsPage />} />

            {/* ĐÃ THÊM: trang hồ sơ cá nhân — mở từ dòng username trong menu tài khoản.
                PLACEHOLDER tạm thời (trang thật làm sau) — có route thật để bấm vào không
                bị lỗi/trắng trang, không cần ProtectedRoute vì ai đăng nhập cũng xem được
                hồ sơ của chính mình, giống /user-stats ở trên. */}
            <Route path="/ho-so-ca-nhan" element={
              <div className="d-flex flex-column align-items-center justify-content-center mt-5 pt-5 text-center">
                <h1 className="text-info display-1"><i className="bi bi-person-badge"></i></h1>
                <h3 className="text-muted mt-3 fw-bold">Trang hồ sơ cá nhân</h3>
                <p className="text-secondary">Đang được xây dựng — sẽ sớm ra mắt.</p>
              </div>
            } />

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