import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchStudents, addStudent, deleteStudent, updateStudent, toggleStatusStudent, importStudentsToAdmissions } from '../../api/studentApi';
import moment from 'moment';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import AddStudentModal from './AddStudentModal';
import ImportModal from './ImportModal';
import PrintModal from './PrintModal'; // Kéo cái máy in vào đây

const StudentTable = ({ selectedStudent, onSelectStudent, searchFilters }) => {
  const queryClient = useQueryClient();
  
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [printingStudent, setPrintingStudent] = useState(null); // State quản lý việc in
  const [editingStudent, setEditingStudent] = useState(null);

  const [visibleCount, setVisibleCount] = useState(20); 
  const observerTarget = useRef(null);

  const { data: students, isLoading, isError, error } = useQuery({
    queryKey: ['students'],
    queryFn: fetchStudents,
  });

  const addMutation = useMutation({ mutationFn: addStudent, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['students'] }); Swal.fire('Thành công!', 'Đã thêm hồ sơ', 'success'); setShowModal(false); }, onError: (err) => Swal.fire('Lỗi', err.message, 'error') });
  const updateMutation = useMutation({ mutationFn: updateStudent, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['students'] }); Swal.fire('Thành công!', 'Đã cập nhật', 'success'); setShowModal(false); setEditingStudent(null); }, onError: (err) => Swal.fire('Lỗi', err.message, 'error') });
  const deleteMutation = useMutation({ mutationFn: deleteStudent, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['students'] }); Swal.fire('Đã xóa!', 'Hồ sơ đã bị xóa.', 'success'); }, onError: (err) => Swal.fire('Lỗi', err.message, 'error') });
  
  const importMutation = useMutation({ 
    // ĐÃ SỬA: dùng đúng importStudentsToAdmissions (ghi vào sheet SinhVien) thay vì
    // importStudents cũ (ghi nhầm vào sheet TrungGian của luồng Xét tuyển)
    mutationFn: importStudentsToAdmissions, 
    onSuccess: (result) => { 
      queryClient.invalidateQueries({ queryKey: ['students'] }); 
      const addedMsg = result ? `Đã thêm ${result.added} hồ sơ mới` + (result.skipped ? `, bỏ qua ${result.skipped} hồ sơ trùng Mã SV.` : '.') : 'Đã nạp danh sách từ Excel';
      Swal.fire('Thành công!', addedMsg, 'success'); 
      setShowImportModal(false); 
    }, 
    onError: (err) => Swal.fire('Lỗi', err.message, 'error') 
  });

  const statusMutation = useMutation({
    mutationFn: toggleStatusStudent,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['students'] });
      const previousStudents = queryClient.getQueryData(['students']);
      queryClient.setQueryData(['students'], (old) => {
        return old?.map(sv => sv.MaSV === variables.maSV ? { ...sv, TrangThai: variables.status ? 1 : 0 } : sv);
      });
      return { previousStudents };
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['students'], context.previousStudents);
      Swal.fire('Lỗi', 'Không thể đổi trạng thái: ' + err.message, 'error');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
    }
  });

  const handleDelete = (maSV) => {
    Swal.fire({
      title: 'Bạn có chắc chắn?', text: `Xóa hồ sơ của sinh viên mã ${maSV}?`, icon: 'warning',
      showCancelButton: true, confirmButtonColor: '#d33', cancelButtonColor: '#3085d6',
      confirmButtonText: 'Xóa luôn!', cancelButtonText: 'Hủy'
    }).then((result) => { if (result.isConfirmed) deleteMutation.mutate(maSV); });
  };

  const handleEdit = (sv) => { setEditingStudent(sv); setShowModal(true); };
  const handleAdd = () => { setEditingStudent(null); setShowModal(true); };

  // HÀM GỌI MODAL IN
  const handlePrint = (sv) => {
    setPrintingStudent(sv);
  };

  const filteredStudents = students?.filter(sv => {
    if (!searchFilters) return true;
    const keywordMaSV_CCCD = searchFilters.maSV.toLowerCase();
    const keywordHoTen = searchFilters.hoTen.toLowerCase();
    const matchMaSV_CCCD = keywordMaSV_CCCD === '' || (sv.MaSV && sv.MaSV.toString().toLowerCase().includes(keywordMaSV_CCCD)) || (sv.CCCD && sv.CCCD.toString().toLowerCase().includes(keywordMaSV_CCCD));
    const matchHoTen = keywordHoTen === '' || (sv.HoTen && sv.HoTen.toString().toLowerCase().includes(keywordHoTen));
    return matchMaSV_CCCD && matchHoTen;
  }) || [];

  const tongHoSo = filteredStudents.length;
  const daNhapHoc = filteredStudents.filter(sv => sv.TrangThai === 'Đã nhập trường' || sv.TrangThai === 1 || sv.TrangThai === 'TRUE' || sv.TrangThai === true).length;

  const observerCallback = useCallback((entries) => {
    if (entries[0].isIntersecting) setVisibleCount(prev => prev + 20);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(observerCallback, { threshold: 1 });
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [observerCallback]);

  const displayStudents = filteredStudents.slice(0, visibleCount);

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(filteredStudents);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DanhSachSV");
    XLSX.writeFile(wb, "Danh_Sach_Sinh_Vien.xlsx");
  };

  return (
    <div className="card position-relative shadow-sm border-0">
      <div className="card-header d-flex flex-wrap justify-content-between align-items-center bg-white gap-2">
        <div className="d-flex align-items-center flex-wrap">
          <h5 className="card-title mb-0 me-3">Danh sách sinh viên</h5>
          <span className="badge bg-light text-dark border me-2">Tổng: {tongHoSo}</span>
          <span className="badge bg-success me-3">Đã xác nhận: {daNhapHoc}</span>
          
          <div className="btn-group me-2">
            <button className="btn btn-outline-success btn-sm" onClick={handleExport} title="Xuất danh sách">
              <i className="bi bi-download me-1"></i> Xuất
            </button>
            <button className="btn btn-outline-primary btn-sm" onClick={() => setShowImportModal(true)}>
              <i className="bi bi-upload me-1"></i> Nhập Excel
            </button>
          </div>
        </div>
        
        <button className="btn btn-primary btn-sm" onClick={handleAdd}>
          <i className="bi bi-plus-circle me-1"></i> + Thêm đăng ký
        </button>
      </div>
      
      {/* CÁC MODALS TRỢ GIÚP */}
      {showModal && (
        <AddStudentModal 
          onClose={() => { setShowModal(false); setEditingStudent(null); }}
          onSave={(data) => editingStudent ? updateMutation.mutate(data) : addMutation.mutate(data)}
          isPending={addMutation.isPending || updateMutation.isPending}
          initialData={editingStudent} 
        />
      )}

      {showImportModal && (
        <ImportModal 
          onClose={() => setShowImportModal(false)}
          onImport={(data) => importMutation.mutate(data)}
          isPending={importMutation.isPending}
        />
      )}

      {/* MODAL IN GIẤY BÁO */}
      {printingStudent && (
        <PrintModal 
          student={printingStudent}
          onClose={() => setPrintingStudent(null)}
        />
      )}

      <div className="card-body p-0 table-responsive" style={{ maxHeight: '600px', overflowY: 'auto' }}>
        {isLoading && (
          <div className="text-center py-4 text-primary">
            <div className="spinner-border" role="status"></div>
            <p className="mt-2">Đang tải dữ liệu...</p>
          </div>
        )}

        {isError && (
          <div className="text-center py-4 text-danger"><p>Lỗi: {error.message}</p></div>
        )}

        {!isLoading && !isError && (
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light sticky-top">
              <tr>
                <th className="text-center px-2" style={{width: '150px'}}>Thao tác</th>
                <th>Mã sinh viên</th>
                <th>Số CCCD</th>
                <th>Họ tên</th>
                <th>Ngày sinh</th>
                <th>Ngành</th>
                <th className="text-center">Xác nhận nhập học</th>
              </tr>
            </thead>
            <tbody>
              {displayStudents.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center text-muted py-4">Không tìm thấy sinh viên.</td>
                </tr>
              ) : (
                displayStudents.map((sv, index) => {
                  const isChecked = sv.TrangThai === 'Đã nhập trường' || sv.TrangThai === 1 || sv.TrangThai === 'TRUE' || sv.TrangThai === true;
                  
                  return (
                    <tr 
                      key={index}
                      onClick={() => onSelectStudent(sv)}
                      className={selectedStudent?.MaSV === sv.MaSV ? 'table-primary' : ''}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="text-center px-2" onClick={(e) => e.stopPropagation()}>
                        <div className="d-flex justify-content-center gap-1">
                          <button className="btn btn-sm btn-outline-secondary p-1 px-2" onClick={() => handlePrint(sv)} title="In hồ sơ">In</button>
                          <button className="btn btn-sm btn-outline-info p-1 px-2" onClick={() => handleEdit(sv)} title="Sửa">Sửa</button>
                          <button className="btn btn-sm btn-outline-danger p-1 px-2" onClick={() => handleDelete(sv.MaSV)} disabled={deleteMutation.isPending} title="Xóa">Xóa</button>
                        </div>
                      </td>
                      <td className="fw-medium text-secondary">{sv.MaSV}</td>
                      <td>{sv.CCCD}</td>
                      <td className="fw-bold">{sv.HoTen}</td>
                      <td>{sv.NgaySinh ? moment(sv.NgaySinh).format('DD/MM/YYYY') : ''}</td>
                      <td>{sv.Nganh}</td>
                      <td className="text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="form-check d-flex justify-content-center">
                          <input 
                            type="checkbox" 
                            className="form-check-input fs-5" 
                            style={{ cursor: 'pointer' }}
                            checked={isChecked} 
                            onChange={(e) => statusMutation.mutate({ maSV: sv.MaSV, status: e.target.checked })}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
              {visibleCount < filteredStudents.length && (
                <tr ref={observerTarget}>
                  <td colSpan="7" className="text-center py-3 text-muted">
                    <div className="spinner-border spinner-border-sm me-2" role="status"></div>
                    Đang tải thêm...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default StudentTable;