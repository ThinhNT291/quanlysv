import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchConfig } from '../../api/studentApi';

const AddStudentModal = ({ onClose, onSave, isPending, initialData }) => {
  const { data: configData, isLoading: isConfigLoading } = useQuery({
    queryKey: ['systemConfig'],
    queryFn: fetchConfig,
    staleTime: Infinity,
  });

  // DANH SÁCH CÁC LOẠI GIẤY TỜ CỐ ĐỊNH
  const DANH_SACH_GIAY_TO = [
    'Học bạ THPT', 
    'Bằng/Giấy CNTN', 
    'Giấy khai sinh', 
    'CCCD/CMND', 
    'Ảnh thẻ', 
    'Giấy khám sức khỏe', 
    'Minh chứng ưu tiên'
  ];

  // Thêm field GiayTo (dạng mảng) vào state
  const [formData, setFormData] = useState({
    MaSV: '', HoTen: '', NgaySinh: '', CCCD: '', Nganh: '',
    KhoaNhapHoc: '', DoiTuongUT: '', KhuVucUT: '', DoiTuongDauVao: 'Trung học phổ thông',
    NamXetTuyen: '', HinhThucDT: 'Chính quy', PhuongThucDT: 'Đại trà', 
    HeDT: 'Đại học', LinkHoSo: '', TrangThai: 1, GiayTo: []
  });

  // ĐÃ SỬA: chỉ cắt lấy phần yyyy-mm-dd trực tiếp từ chuỗi backend trả về, KHÔNG dựng
  // lại new Date(...).toISOString() nữa — cách cũ quy đổi qua UTC nên bị lùi 1 ngày so
  // với ngày sinh thật (GMT+7), và mỗi lần sửa hồ sơ sẽ lưu đè ngày sai đó vào sheet.
  const normalizeNgaySinh = (val) => {
    if (!val) return '';
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(val).trim());
    return m ? m[1] : '';
  };

  useEffect(() => {
    if (initialData) {
      const formattedDate = normalizeNgaySinh(initialData.NgaySinh);

      // Chuyển chuỗi GiayTo từ Sheet (VD: "Học bạ, CCCD") thành mảng để check vào ô
      const giayToMang = initialData.GiayTo ? initialData.GiayTo.split(',').map(item => item.trim()) : [];
      
      setFormData({ ...initialData, NgaySinh: formattedDate, GiayTo: giayToMang });
    } else if (configData) {
      setFormData(prev => ({
        ...prev,
        Nganh: configData.Nganh?.[0] || '',
        KhoaNhapHoc: configData.KhoaNhapHoc?.[0] || '',
        DoiTuongUT: configData.DoiTuongUT?.[0] || '',
        KhuVucUT: configData.KhuVucUT?.[0] || '',
        NamXetTuyen: configData.NamXetTuyen?.[0] || '',
        GiayTo: []
      }));
    }
  }, [initialData, configData]);

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

  // HÀM XỬ LÝ KHI TICK/BỎ TICK GIẤY TỜ
  const handleGiayToToggle = (loaiGiayTo) => {
    setFormData(prev => {
      const dangCo = prev.GiayTo || [];
      if (dangCo.includes(loaiGiayTo)) {
        // Nếu đã có thì gỡ bỏ
        return { ...prev, GiayTo: dangCo.filter(item => item !== loaiGiayTo) };
      } else {
        // Nếu chưa có thì thêm vào
        return { ...prev, GiayTo: [...dangCo, loaiGiayTo] };
      }
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Trước khi lưu xuống Sheet, gom cái mảng GiayTo lại thành 1 chuỗi cách nhau bằng dấu phẩy
    const dataToSave = {
      ...formData,
      GiayTo: formData.GiayTo.join(', ')
    };
    onSave(dataToSave);
  };

  const danhSachDoiTuongDauVao = ['Trung học phổ thông', 'Trung cấp TN trước 2022', 'Trung cấp TN sau 2022', 'Cao đẳng', 'Đại học'];

  return (
    <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-lg modal-dialog-scrollable">
        <div className="modal-content shadow">
          
          <div className="modal-header bg-light">
            <h5 className="modal-title text-primary fw-bold">{initialData ? 'SỬA HỒ SƠ SINH VIÊN' : 'THÊM HỒ SƠ MỚI'}</h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>
          
          <div className="modal-body p-4 position-relative">
            {isConfigLoading && (
              <div className="position-absolute w-100 h-100 top-0 start-0 d-flex flex-column justify-content-center align-items-center bg-white" style={{ zIndex: 10, opacity: 0.8 }}>
                <div className="spinner-border text-primary"></div>
                <span className="mt-2 text-muted fw-bold">Đang tải cấu hình...</span>
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

                {/* KHU VỰC III: CHECKBOX GIẤY TỜ */}
                <h6 className="text-muted border-bottom pb-2 mt-4">III. Danh mục giấy tờ đã nộp</h6>
                <div className="col-12">
                  <div className="d-flex flex-wrap gap-3 p-3 bg-light rounded border">
                    {DANH_SACH_GIAY_TO.map((doc, idx) => (
                      <div className="form-check" key={idx}>
                        <input 
                          className="form-check-input" 
                          type="checkbox" 
                          id={`doc-${idx}`}
                          checked={formData.GiayTo.includes(doc)}
                          onChange={() => handleGiayToToggle(doc)}
                        />
                        <label className="form-check-label small cursor-pointer" htmlFor={`doc-${idx}`}>
                          {doc}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="col-12 mt-3">
                  <label className="form-label small">Link hồ sơ (Google Drive, v.v.)</label>
                  <input type="url" className="form-control" name="LinkHoSo" value={formData.LinkHoSo} onChange={handleChange} placeholder="https://..." />
                </div>

              </div>
            </form>
          </div>
          
          <div className="modal-footer bg-light">
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