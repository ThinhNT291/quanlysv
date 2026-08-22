import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query'; 
import { fetchStudents } from '../../api/studentApi'; 

// NẾU CÁC FILE NÀY NẰM CHUNG THƯ MỤC VỚI NHAU, DÙNG './' THAY VÌ '../../'
import SearchFilter from '../../features/Admissions/SearchFilter';
import StudentTable from '../../features/Admissions/StudentTable';
import DocumentList from '../../features/Admissions/DocumentList';
import AdmissionsChart from '../../features/Admissions/AdmissionsChart';

const AdmissionsPage = () => {
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [searchFilters, setSearchFilters] = useState({ maSV: '', hoTen: '' });

  const { data: students = [] } = useQuery({
    queryKey: ['students'],
    queryFn: fetchStudents,
  });

  const tongHoSo = students.length;
  const daNhapHoc = students.filter(sv => sv.TrangThai === 'Đã nhập trường' || sv.TrangThai === 1 || sv.TrangThai === 'TRUE' || sv.TrangThai === true).length;
  const tyLe = tongHoSo === 0 ? 0 : Math.round((daNhapHoc / tongHoSo) * 100);

  return (
    <div className="container-fluid py-3">
      <div className="row mb-3 align-items-center">
        <div className="col-md-6">
          <h4 className="text-uppercase fw-bold" style={{ color: '#037683' }}>Gọi nhập học hồ sơ</h4>
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
          />
        </div>
        <div className="col-lg-4">
          <DocumentList selectedStudent={selectedStudent} />
        </div>
      </div>
    </div>
  );
};

export default AdmissionsPage;