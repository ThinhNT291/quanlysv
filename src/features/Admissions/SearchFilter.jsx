import React from 'react';

const SearchFilter = ({ searchFilters, onSearchChange }) => {
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    onSearchChange(prev => ({ ...prev, [name]: value }));
  };

  // HÀM MỚI: Xóa tìm kiếm khi bấm phím ESC
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      // Báo lên cha (AdmissionsPage) reset cả 2 ô về rỗng
      onSearchChange({ maSV: '', hoTen: '' });
    }
  };

  return (
    <div className="card mb-3 border-0 shadow-sm">
      <div className="card-body">
        <h6 className="card-title text-muted mb-3">Tìm kiếm</h6>
        <div className="row g-3 align-items-end">
          
          <div className="col-md-3">
            <label className="form-label small mb-1">Người tiếp nhận</label>
            <input type="text" className="form-control form-control-sm" placeholder="Nhập tên..." disabled />
          </div>

          <div className="col-md-2">
            <label className="form-label small mb-1">Năm nhập học</label>
            <select className="form-select form-select-sm" disabled>
              <option value="2026">2026</option>
              <option value="2025">2025</option>
            </select>
          </div>

          <div className="col-md-3">
            <label className="form-label small mb-1">Mã sinh viên / CCCD</label>
            <input 
              type="text" 
              className="form-control form-control-sm"
              name="maSV"
              value={searchFilters.maSV}
              onChange={handleChange}
              onKeyDown={handleKeyDown} // Gắn sự kiện nghe phím ESC
              placeholder="Gõ mã hoặc CCCD (Bấm ESC để xóa)..." // Nhắc nhở người dùng
            />
          </div>

          <div className="col-md-3">
            <label className="form-label small mb-1">Họ tên</label>
            <input 
              type="text" 
              className="form-control form-control-sm"
              name="hoTen"
              value={searchFilters.hoTen}
              onChange={handleChange}
              onKeyDown={handleKeyDown} // Gắn sự kiện nghe phím ESC
              placeholder="Gõ họ tên (Bấm ESC để xóa)..." // Nhắc nhở người dùng
            />
          </div>

          <div className="col-md-1">
            <button className="btn btn-sm btn-secondary w-100" disabled>Tìm</button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default SearchFilter;