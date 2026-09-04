import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAdmissions } from '../../api/studentApi';

// NẾU CÁC FILE NÀY NẰM CHUNG THƯ MỤC VỚI NHAU, DÙNG './' THAY VÌ '../../'
import SearchFilter from '../../features/Admissions/SearchFilter';
import StudentTable from '../../features/Admissions/StudentTable';
import DocumentList from '../../features/Admissions/DocumentList';
import AdmissionsChart from '../../features/Admissions/AdmissionsChart';
import CanXacNhanBadge from '../../components/DinhDanh/CanXacNhanBadge'; // ĐÃ THÊM (Pha 1·D1)

// ĐÃ SỬA: đọc thẳng sheet Trung Gian qua fetchAdmissions (chỉ đúng kênh "Thu hồ sơ
// trực tiếp", nhờ cột KÊNH NỘP lọc ở backend) thay cho fetchStudents (sheet SinhVien cũ)
// — khớp với StudentTable/DocumentList đã đổi sang key kiểu Trung Gian.
const AdmissionsPage = () => {
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [searchFilters, setSearchFilters] = useState({ maSV: '', hoTen: '' });

  // ĐÃ THÊM: trang này giờ cũng mở cho ThẩmĐịnh vào xem (trước chỉ CanBo/Admin) — nhưng
  // backend (addAdmission/updateAdmission/deleteAdmission/importAdmissions/
  // toggleAdmissionField/savePayment) vẫn CHỈ chấp nhận CanBo/Admin, nên ThẩmĐịnh phải ở
  // chế độ CHỈ XEM (ẩn hết nút/ô bấm sẽ ghi dữ liệu) — không thì bấm vào sẽ dính lỗi 403
  // khó hiểu. Đọc role trực tiếp từ localStorage, cùng cách CanXacNhanBadge đang làm, để
  // không phải sửa lại toàn bộ cây props chỉ vì 1 cờ quyền.
  const chiXem = (() => {
    try {
      const saved = localStorage.getItem('tuyensinh_user');
      const user = saved ? JSON.parse(saved) : null;
      const roles = Array.isArray(user?.roles) ? user.roles.map(r => String(r).toLowerCase()) : [];
      const coQuyenSua = roles.includes('canbo') || roles.includes('admin');
      return !coQuyenSua && roles.includes('thamdinh');
    } catch (e) { return false; } // không đọc được -> coi như không hạn chế thêm, giữ hành vi cũ
  })();

  const { data: students = [] } = useQuery({
    queryKey: ['admissions'],
    queryFn: fetchAdmissions,
  });

  const tongHoSo = students.length;
  const daNhapHoc = students.filter(sv => String(sv['TRẠNG THÁI THẨM ĐỊNH'] || '').trim() === 'Đã trúng tuyển').length;
  const tyLe = tongHoSo === 0 ? 0 : Math.round((daNhapHoc / tongHoSo) * 100);

  return (
    <div className="container-fluid py-3">
      <div className="row mb-3 align-items-center">
        <div className="col-md-6">
          <h4 className="text-uppercase fw-bold" style={{ color: '#037683' }}>Gọi nhập học hồ sơ</h4>
        </div>
        <div className="col-md-6 text-md-end mt-2 mt-md-0">
          {chiXem && <span className="badge bg-secondary me-2 align-middle"><i className="bi bi-eye me-1"></i>Chế độ chỉ xem</span>}
          <CanXacNhanBadge />
        </div>
      </div>

      <div className="row mb-3">
        <div className="col-md-3">
          <div className="card bg-primary text-white border-0 shadow-sm h-100">
            <div className="card-body">
              <h6 className="card-title opacity-75">Tổng hồ sơ tiếp nhận</h6>
              <h2 className="mb-0">{tongHoSo}</h2>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card bg-success text-white border-0 shadow-sm h-100">
            <div className="card-body">
              <h6 className="card-title opacity-75">Đã xác nhận nhập học</h6>
              <h2 className="mb-0">{daNhapHoc} <span className="fs-6 opacity-75">({tyLe}%)</span></h2>
            </div>
          </div>
        </div>
        
        {/* ĐÃ SỬA LẠI KHUNG BIỂU ĐỒ GỌN GÀNG, KHÔNG BỊ LỒNG 2 LẦN */}
        <div className="col-md-6">
          <div className="card border-0 shadow-sm h-100 bg-white">
            <div className="card-body p-2 d-flex align-items-center justify-content-center" style={{ minHeight: '120px' }}>
              <AdmissionsChart students={students} />
            </div>
          </div>
        </div>
      </div>
      
      <SearchFilter searchFilters={searchFilters} onSearchChange={setSearchFilters} />
      
      <div className="row g-3">
        <div className="col-lg-8">
          <StudentTable
            selectedStudent={selectedStudent}
            onSelectStudent={setSelectedStudent}
            searchFilters={searchFilters}
            chiXem={chiXem}
          />
        </div>
        <div className="col-lg-4">
          <DocumentList selectedStudent={selectedStudent} chiXem={chiXem} />
        </div>
      </div>
    </div>
  );
};

export default AdmissionsPage;