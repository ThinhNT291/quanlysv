import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Navbar from './Navbar';

const MainLayout = () => {
  return (
    <div className="app-container">
      <Header />
      <Navbar />
      
      {/* Khu vực nội dung chính thay đổi theo Route */}
      <main className="main-content" style={{ padding: '20px' }}>
        <Outlet /> 
      </main>
    </div>
  );
};

export default MainLayout;