import React from 'react';
import { Link } from 'react-router-dom';

const Navbar = () => {
  return (
    <nav style={{ background: '#037683', padding: '10px 20px' }}>
      <ul style={{ listStyle: 'none', display: 'flex', gap: '20px', margin: 0, padding: 0 }}>
        <li>
          <Link to="/" style={{ color: 'white', textDecoration: 'none' }}>Trang chủ</Link>
        </li>
        <li>
          <Link to="/admissions" style={{ color: 'white', textDecoration: 'none' }}>Sinh viên nhập trường</Link>
        </li>
      </ul>
    </nav>
  );
};

export default Navbar;