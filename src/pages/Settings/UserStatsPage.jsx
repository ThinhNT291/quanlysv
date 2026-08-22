import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchLogs } from '../../api/studentApi';
import moment from 'moment';

const UserStatsPage = () => {
  // Lấy thông tin user đang đăng nhập
  const currentUser = JSON.parse(localStorage.getItem('tuyensinh_user')) || {};
  const [timeFilter, setTimeFilter] = useState('all'); // 'today', '7days', 'all'

  // Kéo dữ liệu từ Google Sheets về
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['userLogs', currentUser.username],
    queryFn: () => fetchLogs(currentUser.username),
    enabled: !!currentUser.username // Chỉ chạy khi có username
  });

  // Xử lý Lọc dữ liệu theo thời gian
  const filteredLogs = logs.filter(log => {
    if (timeFilter === 'all') return true;
    
    const logDate = moment(log.ThoiGian);
    const today = moment().endOf('day');
    
    if (timeFilter === 'today') {
      return logDate.isSame(today, 'day');
    }
    if (timeFilter === '7days') {
      const sevenDaysAgo = moment().subtract(7, 'days').startOf('day');
      return logDate.isBetween(sevenDaysAgo, today, undefined, '[]');
    }
    return true;
  });

  // Thống kê nhanh số lượng theo loại hành động
  const totalActions = filteredLogs.length;
  const adds = filteredLogs.filter(l => l.HanhDong.includes('Thêm')).length;
  const edits = filteredLogs.filter(l => l.HanhDong.includes('Cập nhật') || l.HanhDong.includes('Sửa')).length;
  const deletes = filteredLogs.filter(l => l.HanhDong.includes('Xóa')).length;

  return (
    <div className="container-fluid py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="text-uppercase fw-bold" style={{ color: '#037683' }}>
          <i className="bi bi-graph-up-arrow me-2"></i>THỐNG KÊ HOẠT ĐỘNG
        </h4>
        
        {/* BỘ LỌC THỜI GIAN */}
        <select 
          className="form-select w-auto shadow-sm" 
          value={timeFilter} 
          onChange={(e) => setTimeFilter(e.target.value)}
        >
          <option value="today">Hôm nay</option>
          <option value="7days">7 ngày qua</option>
          <option value="all">Toàn bộ thời gian</option>
        </select>
      </div>

      {/* CÁC THẺ THỐNG KÊ TỔNG QUAN */}
      <div className="row g-3 mb-4">
        <div className="col-md-3">
          <div className="card bg-primary text-white border-0 shadow-sm h-100">
            <div className="card-body">
              <h6 className="opacity-75">Tổng lượt thao tác</h6>
              <h2 className="mb-0">{totalActions}</h2>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card bg-success text-white border-0 shadow-sm h-100">
            <div className="card-body">
              <h6 className="opacity-75">Thêm mới hồ sơ</h6>
              <h2 className="mb-0">{adds}</h2>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card bg-warning text-dark border-0 shadow-sm h-100">
            <div className="card-body">
              <h6 className="opacity-75">Cập nhật / Sửa</h6>
              <h2 className="mb-0">{edits}</h2>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card bg-danger text-white border-0 shadow-sm h-100">
            <div className="card-body">
              <h6 className="opacity-75">Xóa hồ sơ</h6>
              <h2 className="mb-0">{deletes}</h2>
            </div>
          </div>
        </div>
      </div>

      {/* BẢNG NHẬT KÝ HOẠT ĐỘNG */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-bold py-3">
          Chi tiết lịch sử thao tác
        </div>
        <div className="card-body p-0">
          {isLoading ? (
            <div className="text-center p-5">
              <div className="spinner-border text-primary"></div>
              <p className="mt-2 text-muted">Đang tải lịch sử...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center p-5 text-muted fst-italic">
              Không có hoạt động nào trong khoảng thời gian này.
            </div>
          ) : (
            <div className="table-responsive" style={{ maxHeight: '500px' }}>
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light sticky-top">
                  <tr>
                    <th className="px-4">Thời gian</th>
                    <th>Hành động</th>
                    <th>Chi tiết</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log, index) => (
                    <tr key={index}>
                      <td className="px-4 text-muted small">
                        {moment(log.ThoiGian).format('DD/MM/YYYY HH:mm:ss')}
                      </td>
                      <td>
                        <span className={`badge ${
                          log.HanhDong.includes('Thêm') ? 'bg-success' : 
                          log.HanhDong.includes('Xóa') ? 'bg-danger' : 'bg-warning text-dark'
                        }`}>
                          {log.HanhDong}
                        </span>
                      </td>
                      <td>{log.ChiTiet}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      
    </div>
  );
};

export default UserStatsPage;