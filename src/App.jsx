import React, { useState } from 'react';
import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';
import AdmissionsPage from './pages/Admissions/AdmissionsPage'; 
import SettingsPage from './pages/Settings/SettingsPage'; 
import LoginPage from './pages/Auth/LoginPage'; 
import UserStatsPage from './pages/Settings/UserStatsPage'; 

const App = () => {
  // State quản lý menu dọc trên điện thoại
  const [isNavCollapsed, setIsNavCollapsed] = useState(true);
  
  // THÊM STATE NÀY ĐỂ QUẢN LÝ ĐÓNG/MỞ MENU TÀI KHOẢN
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  
  const [currentUser, setCurrentUser] = useState(() => {
    const savedUser = localStorage.getItem('tuyensinh_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const handleLoginSuccess = (userInfo) => {
    setCurrentUser(userInfo);
    localStorage.setItem('tuyensinh_user', JSON.stringify(userInfo));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('tuyensinh_user');
  };

  if (!currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  const displayName = currentUser.name || currentUser.username;

  return (
    <HashRouter>
      <div style={{ minHeight: '100vh', backgroundColor: '#f4f6f9' }}>
        
        <nav className="navbar navbar-expand-lg navbar-dark bg-dark shadow-sm sticky-top">
          <div className="container-fluid px-4">
            <span className="navbar-brand fw-bold" style={{ color: '#0dcaf0', letterSpacing: '1px' }}>
              <i className="bi bi-mortarboard-fill me-2"></i> HỆ THỐNG TUYỂN SINH
            </span>
            
            <button className="navbar-toggler border-0 shadow-none" type="button" onClick={() => setIsNavCollapsed(!isNavCollapsed)}>
              <span className="navbar-toggler-icon"></span>
            </button>

            <div className={`${isNavCollapsed ? 'collapse' : ''} navbar-collapse`} id="navbarNav">
              <ul className="navbar-nav me-auto mb-2 mb-lg-0 ms-lg-4 gap-2">
                <li className="nav-item">
                  <NavLink to="/" end onClick={() => setIsNavCollapsed(true)} className={({isActive}) => `nav-link px-3 rounded ${isActive ? 'active bg-primary text-white shadow-sm' : 'text-light'}`}>
                    <i className="bi bi-people-fill me-1"></i> Quản lý hồ sơ
                  </NavLink>
                </li>
                <li className="nav-item">
                  <NavLink to="/settings" onClick={() => setIsNavCollapsed(true)} className={({isActive}) => `nav-link px-3 rounded ${isActive ? 'active bg-primary text-white shadow-sm' : 'text-light'}`}>
                    <i className="bi bi-gear-fill me-1"></i> Cấu hình hệ thống
                  </NavLink>
                </li>
              </ul>
              
              {/* DROPDOWN USER MENU (ĐÃ SỬA LẠI BẰNG REACT STATE) */}
              <div className="nav-item dropdown d-flex align-items-center mt-3 mt-lg-0 position-relative">
                <a 
                  className="nav-link dropdown-toggle text-light d-flex align-items-center p-0" 
                  href="#" 
                  // Bấm vào thì đảo ngược trạng thái Đóng/Mở
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
                
                {/* Dùng class 'show' của Bootstrap để ép nó hiện ra khi state là true */}
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
                        setIsUserDropdownOpen(false); // Chuyển trang thì tự động cụp menu lại
                      }}
                    >
                      <i className="bi bi-graph-up-arrow me-2 text-primary"></i> Thống kê cá nhân
                    </NavLink>
                  </li>
                  <li><hr className="dropdown-divider" /></li>
                  <li>
                    <button className="dropdown-item text-danger py-2" onClick={handleLogout}>
                      <i className="bi bi-box-arrow-right me-2"></i> Đăng xuất
                    </button>
                  </li>
                </ul>
              </div>

            </div>
          </div>
        </nav>

        <div className="p-2 p-md-3">
          <Routes>
            <Route path="/" element={<AdmissionsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/user-stats" element={<UserStatsPage />} />
            <Route path="*" element={
              <div className="d-flex flex-column align-items-center justify-content-center mt-5 pt-5">
                <h1 className="text-muted display-1"><i className="bi bi-emoji-frown"></i></h1>
                <h3 className="text-muted mt-3">404 - Không tìm thấy trang</h3>
              </div>
            } />
          </Routes>
        </div>

      </div>
    </HashRouter>
  );
};

export default App;