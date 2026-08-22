import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchConfig } from '../../api/studentApi'; // Nhúng API lấy cấu hình vào đây

const AddStudentModal = ({ onClose, onSave, isPending, initialData }) => {
  // 1. TẢI CẤU HÌNH ĐỘNG TỪ GOOGLE SHEETS
  const { data: configData, isLoading: isConfigLoading } = useQuery({
    queryKey: ['systemConfig'],
    queryFn: fetchConfig,
    staleTime: Infinity, // Cấu hình ít đổi nên lưu cache vĩnh viễn cho nhẹ máy
  });

  // State lưu trữ form
  const [formData, setFormData] = useState({
    MaSV: '', HoTen: '', NgaySinh: '', CCCD: '', Nganh: '',
    KhoaNhapHoc: '', DoiTuongUT: '', KhuVucUT: '', DoiTuongDauVao: 'Trung học phổ thông',
    NamXetTuyen: '', HinhThucDT: 'Chính quy', PhuongThucDT: 'Đại trà', 
    HeDT: 'Đại học', LinkHoSo: '', TrangThai: 1
  });

  // 2. NẠP DỮ LIỆU BAN ĐẦU
  useEffect(() => {
    if (initialData) {
      // Đang ở chế độ SỬA HỒ SƠ
      const formattedDate = initialData.NgaySinh ? new Date(initialData.NgaySinh).toISOString().split('T')[0] : '';
      setFormData({ ...initialData, NgaySinh: formattedDate });
    } else if (configData) {
      // Đang ở chế độ THÊM MỚI: Tự động lấy giá trị đầu tiên trong Cấu hình làm mặc định
      setFormData(prev => ({
        ...prev,
        Nganh: configData.Nganh?.[0] || '',
        KhoaNhapHoc: configData.KhoaNhapHoc?.[0] || '',
        DoiTuongUT: configData.DoiTuongUT?.[0] || '',
        KhuVucUT: configData.KhuVucUT?.[0] || '',
        NamXetTuyen: configData.NamXetTuyen?.[0] || '',
      }));
    }
  }, [initialData, configData]);

  // Lắng nghe phím ESC để đóng Modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  // Các mảng cố định (Không cần đưa vào cấu hình vì nó là quy chuẩn quốc gia)
  const danhSachDoiTuongDauVao = ['Trung học phổ thông', 'Trung cấp TN trước 2022', 'Trung cấp TN sau 2022', 'Cao đẳng', 'Đại học'];

  return (
    <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-lg">
        <div className="modal-content shadow">
          
          <div className="modal-header bg-light">
            <h5 className="modal-title text-primary fw-bold">{initialData ? 'SỬA HỒ SƠ SINH VIÊN' : 'THÊM HỒ SƠ MỚI'}</h5>
            <button type="button" className="btn-close" onClick={onClose} title="Đóng (Bấm ESC)"></button>
          </div>
          
          <div className="modal-body p-4 position-relative">
            
            {/* Hiệu ứng mờ khi đang tải cấu hình */}
            {isConfigLoading && (
              <div className="position-absolute w-100 h-100 top-0 start-0 d-flex flex-column justify-content-center align-items-center bg-white" style={{ zIndex: 10, opacity: 0.8 }}>
                <div className="spinner-border text-primary" role="status"></div>
                <span className="mt-2 text-muted fw-bold">Đang đồng bộ dữ liệu cấu hình...</span>
              </div>
            )}

            <form id="addStudentForm" onSubmit={handleSubmit}>
              
              <div className="row g-3">
                <h6 className="text-muted border-bottom pb-2">I. Thông tin cá nhân</h6>
                <div className="col-md-6">
                  <label className="form-label small">Mã sinh viên</label>
                  <input type="text" className="form-control" name="MaSV" value={formData.MaSV} onChange={handleChange} required disabled={!!initialData} />
                </div>
                <div className="col-md-6">
                  <label className="form-label small">Họ và tên</label>
                  <input type="text" className="form-control" name="HoTen" value={formData.HoTen} onChange={handleChange} required />
                </div>
                <div className="col-md-6">
                  <label className="form-label small">Ngày sinh</label>
                  <input type="date" className="form-control" name="NgaySinh" value={formData.NgaySinh} onChange={handleChange} required />
                </div>
                <div className="col-md-6">
                  <label className="form-label small">Số CCCD</label>
                  <input type="text" className="form-control" name="CCCD" value={formData.CCCD} onChange={handleChange} />
                </div>

                <h6 className="text-muted border-bottom pb-2 mt-4">II. Thông tin Tuyển sinh & Đào tạo</h6>
                
                <div className="col-md-4">
                  <label className="form-label small">Khóa nhập học</label>
                  <select className="form-select" name="KhoaNhapHoc" value={formData.KhoaNhapHoc} onChange={handleChange}>
                    {configData?.KhoaNhapHoc?.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
                
                <div className="col-md-4">
                  <label className="form-label small">Năm xét tuyển</label>
                  <select className="form-select" name="NamXetTuyen" value={formData.NamXetTuyen} onChange={handleChange}>
                    {configData?.NamXetTuyen?.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>

                <div className="col-md-4">
                  <label className="form-label small">Ngành trúng tuyển</label>
                  {/* NÂNG CẤP: Chuyển Ngành thành Select box đổ data từ Cấu hình */}
                  <select className="form-select" name="Nganh" value={formData.Nganh} onChange={handleChange}>
                    {configData?.Nganh?.map(nganh => <option key={nganh} value={nganh}>{nganh}</option>)}
                  </select>
                </div>

                <div className="col-md-4">
                  <label className="form-label small">Đối tượng ưu tiên</label>
                  <select className="form-select" name="DoiTuongUT" value={formData.DoiTuongUT} onChange={handleChange}>
                    {configData?.DoiTuongUT?.map(dt => <option key={dt} value={dt}>{dt}</option>)}
                  </select>
                </div>
                
                <div className="col-md-4">
                  <label className="form-label small">Khu vực ưu tiên</label>
                  <select className="form-select" name="KhuVucUT" value={formData.KhuVucUT} onChange={handleChange}>
                    {configData?.KhuVucUT?.map(kv => <option key={kv} value={kv}>{kv}</option>)}
                  </select>
                </div>

                <div className="col-md-4">
                  <label className="form-label small">Đối tượng đầu vào</label>
                  <select className="form-select" name="DoiTuongDauVao" value={formData.DoiTuongDauVao} onChange={handleChange}>
                    {danhSachDoiTuongDauVao.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>

                <div className="col-md-4">
                  <label className="form-label small">Hệ đào tạo</label>
                  <select className="form-select" name="HeDT" value={formData.HeDT} onChange={handleChange}>
                    <option value="Cao đẳng">Cao đẳng</option>
                    <option value="Đại học">Đại học</option>
                    <option value="Liên thông CĐ - ĐH">Liên thông CĐ - ĐH</option>
                    <option value="Liên thông ĐH - ĐH">Liên thông ĐH - ĐH</option>
                    <option value="Thạc sĩ">Thạc sĩ</option>
                    <option value="Chứng chỉ ngắn hạn">Chứng chỉ ngắn hạn</option>
                  </select>
                </div>
                
                <div className="col-md-4">
                  <label className="form-label small">Hình thức đào tạo</label>
                  <select className="form-select" name="HinhThucDT" value={formData.HinhThucDT} onChange={handleChange}>
                    <option value="Chính quy">Chính quy</option>
                    <option value="Thường xuyên">Thường xuyên</option>
                  </select>
                </div>
                
                <div className="col-md-4">
                  <label className="form-label small">Phương thức ĐT</label>
                  <select className="form-select" name="PhuongThucDT" value={formData.PhuongThucDT} onChange={handleChange}>
                    <option value="Đại trà">Đại trà</option>
                    <option value="Từ xa">Từ xa</option>
                    <option value="Vừa học vừa làm">Vừa học vừa làm</option>
                    <option value="Liên thông">Liên thông</option>
                  </select>
                </div>

                <div className="col-12">
                  <label className="form-label small">Link hồ sơ (Google Drive, v.v.)</label>
                  <input type="url" className="form-control" name="LinkHoSo" value={formData.LinkHoSo} onChange={handleChange} placeholder="https://..." />
                </div>

              </div>
            </form>
          </div>
          
          <div className="modal-footer bg-light">
            <span className="text-muted small me-auto">Mẹo: Bấm phím ESC để đóng nhanh</span>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isPending || isConfigLoading}>Hủy bỏ</button>
            <button type="submit" form="addStudentForm" className="btn btn-primary px-4" disabled={isPending || isConfigLoading}>
              {isPending ? 'Đang lưu...' : 'Lưu hồ sơ'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddStudentModal;