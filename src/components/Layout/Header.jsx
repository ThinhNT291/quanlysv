import React from 'react';

const Header = () => {
  return (
    <header style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 20px', background: '#fff', borderBottom: '1px solid #ccc' }}>
      <div className="logo">
        <h4>Trường Đại Học Phú Xuân</h4>
      </div>
      <div className="user-info">
        <span>Xin chào, Nguyễn Tiến Thịnh</span>
        {/* Nút đăng xuất sẽ xử lý sau */}
      </div>
    </header>
  );
};

export default Header;