import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchConfig } from '../../api/studentApi';

// ĐÃ VIẾT LẠI TOÀN BỘ: trước đây modal này khai báo theo field sheet "SinhVien"
// (MaSV/HoTen/NgaySinh...) — giờ trang Thu hồ sơ đọc/ghi thẳng sheet Trung Gian nên
// đổi hẳn sang đúng tên cột Trung Gian (viết hoa, có dấu) để không cần tầng chuyển đổi
// nào ở giữa. Checklist 7 loại giấy tờ CŨ (Học bạ THPT, Bằng/Giấy CNTN...) bị bỏ — theo
// yêu cầu, giờ checklist là các CỘT THẬT trên Trung Gian (Ảnh thẻ, Bản sao học bạ...),
// cùng 1 danh sách với khung "Hồ sơ" bên phải (DocumentList.jsx) chứ không phải 2 khái
// niệm tách rời như bản cũ.
const CHECK_FIELDS = [
  'ẢNH THẺ',
  'BẢN SAO BẰNG THPT/GIẤY BÁO ĐIỂM',
  'BẢN SAO HỌC BẠ THPT',
  'BẢN SAO ID',
  'SƠ YẾU LÝ LỊCH',
];
const GIAY_TO_UU_TIEN_FIELD = 'GIẤY TỜ ƯU TIÊN';
const STATUS_FIELD = 'TRẠNG THÁI THẨM ĐỊNH';
const STATUS_VALUE = 'Đã trúng tuyển';

// ĐÃ THÊM: danh sách khoản thu — để ngỏ cửa sau này bổ sung thêm loại khác không cần sửa code nhiều chỗ.
const LOAI_PHI = ['Đồng phục GDTC', 'Bảo hiểm y tế', 'Khám sức khỏe đầu khóa', 'Đoàn phí', 'Học phí', 'Khác'];

const EMPTY_FORM = {
  'TÊN SINH VIÊN': '', 'NGÀY SINH': '', 'CĂN CƯỚC': '', 'NGÀNH': '', 'KHÓA': '',
  'HỆ ĐÀO TẠO': '', 'HÌNH THỨC ĐÀO TẠO': '', 'ĐỐI TƯỢNG ƯU TIÊN': '', 'LINK HỒ SƠ': '',
};

const AddStudentModal = ({ onClose, onSave, isPending, initialData }) => {
  const { data: configData, isLoading: isConfigLoading } = useQuery({
    queryKey: ['systemConfig'],
    queryFn: fetchConfig,
    staleTime: Infinity,
  });

  const [formData, setFormData] = useState(EMPTY_FORM);
  const [checks, setChecks] = useState({}); // { [tenCot]: true/false }
  const [ghiChuUuTien, setGhiChuUuTien] = useState('');
  const [xnNhapHoc, setXnNhapHoc] = useState(false);
  // { [loaiPhi]: { checked, soTien } } — chỉ dùng khi TẠO MỚI (xem ghi chú ở JSX bên dưới)
  const [noptien, setNoptien] = useState({});

  // ĐÃ SỬA: chỉ cắt lấy phần yyyy-mm-dd trực tiếp từ chuỗi backend trả về, KHÔNG dựng
  // lại new Date(...).toISOString() nữa — cách cũ quy đổi qua UTC nên bị lùi 1 ngày so
  // với ngày sinh thật (GMT+7).
  const normalizeNgaySinh = (val) => {
    if (!val) return '';
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(val).trim());
    if (m) return m[1];
    // Sheet Trung Gian trả ngày dạng dd/MM/yyyy (khác sheet SinhVien cũ trả yyyy-MM-dd) — quy đổi lại cho <input type="date">.
    const m2 = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(val).trim());
    return m2 ? `${m2[3]}-${m2[2]}-${m2[1]}` : '';
  };

  useEffect(() => {
    if (initialData) {
      const nextForm = { ...EMPTY_FORM };
      Object.keys(EMPTY_FORM).forEach(k => { nextForm[k] = k === 'NGÀY SINH' ? normalizeNgaySinh(initialData[k]) : (initialData[k] || ''); });
      setFormData(nextForm);

      const nextChecks = {};
      CHECK_FIELDS.forEach(f => { nextChecks[f] = !!initialData[f]; });
      setChecks(nextChecks);

      const uuTienVal = String(initialData[GIAY_TO_UU_TIEN_FIELD] || '').trim();
      setGhiChuUuTien(uuTienVal && uuTienVal.toLowerCase() !== 'x' ? uuTienVal : '');

      setXnNhapHoc(String(initialData[STATUS_FIELD] || '').trim() === STATUS_VALUE);
      setNoptien({});
    } else if (configData) {
      setFormData(prev => ({
        ...prev,
        'NGÀNH': configData.Nganh?.[0] || '',
        'KHÓA': configData.KhoaNhapHoc?.[0] || '',
        'HỆ ĐÀO TẠO': configData.HeDaoTao?.[0] || '',
        'HÌNH THỨC ĐÀO TẠO': configData.HinhThucDaoTao?.[0] || '',
        'ĐỐI TƯỢNG ƯU TIÊN': configData.DoiTuongUT?.[0] || '',
      }));
      setChecks({});
      setGhiChuUuTien('');
      setXnNhapHoc(false);
      setNoptien({});
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
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const toggleCheck = (field) => {
    setChecks(prev => ({ ...prev, [field]: !prev[field] }));
  };

  // Giấy tờ ưu tiên: gõ ghi chú -> tự tick; xoá hết ghi chú -> tự bỏ tick (đúng hành vi ô ghi chú ở khung bên phải hiện tại).
  const isUuTienChecked = ghiChuUuTien.trim().length > 0 || !!checks[GIAY_TO_UU_TIEN_FIELD];

  const toggleNopTien = (loai) => {
    setNoptien(prev => {
      const dangCo = prev[loai];
      if (dangCo?.checked) {
        const next = { ...prev };
        delete next[loai];
        return next;
      }
      return { ...prev, [loai]: { checked: true, soTien: '' } };
    });
  };

  const changeSoTien = (loai, soTien) => {
    setNoptien(prev => ({ ...prev, [loai]: { checked: true, soTien } }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const dataToSave = { ...formData };
    CHECK_FIELDS.forEach(f => { dataToSave[f] = !!checks[f]; });
    dataToSave[GIAY_TO_UU_TIEN_FIELD] = isUuTienChecked ? (ghiChuUuTien.trim() || true) : false;
    dataToSave['XN_NHAP_HOC'] = xnNhapHoc;

    if (initialData) {
      dataToSave['MÃ SINH VIÊN'] = initialData['MÃ SINH VIÊN'];
    } else {
      const dsNopTien = Object.entries(noptien)
        .filter(([, v]) => v.checked)
        .map(([loaiPhi, v]) => ({ loaiPhi, soTien: v.soTien }));
      if (dsNopTien.length > 0) dataToSave['_noptien'] = dsNopTien;
    }

    onSave(dataToSave);
  };

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

                {initialData && (
                  <div className="col-md-6">
                    <label className="form-label small">Mã sinh viên</label>
                    <input type="text" className="form-control" value={initialData['MÃ SINH VIÊN'] || ''} disabled />
                    <div className="form-text">Mã sinh viên do hệ thống tự sinh khi tạo hồ sơ, không sửa được.</div>
                  </div>
                )}
                <div className="col-md-6">
                  <label className="form-label small">Họ và tên</label>
                  <input type="text" className="form-control" name="TÊN SINH VIÊN" value={formData['TÊN SINH VIÊN']} onChange={handleChange} required />
                </div>
                <div className="col-md-6">
                  <label className="form-label small">Ngày sinh</label>
                  <input type="date" className="form-control" name="NGÀY SINH" value={formData['NGÀY SINH']} onChange={handleChange} required />
                </div>
                <div className="col-md-6">
                  <label className="form-label small">Số CCCD</label>
                  <input type="text" className="form-control" name="CĂN CƯỚC" value={formData['CĂN CƯỚC']} onChange={handleChange} />
                </div>

                <h6 className="text-muted border-bottom pb-2 mt-4">II. Thông tin Tuyển sinh & Đào tạo</h6>

                <div className="col-md-4">
                  <label className="form-label small">Khóa</label>
                  <select className="form-select" name="KHÓA" value={formData['KHÓA']} onChange={handleChange}>
                    {configData?.KhoaNhapHoc?.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>

                <div className="col-md-4">
                  <label className="form-label small">Ngành</label>
                  <select className="form-select" name="NGÀNH" value={formData['NGÀNH']} onChange={handleChange}>
                    {configData?.Nganh?.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>

                <div className="col-md-4">
                  <label className="form-label small">Hệ đào tạo</label>
                  <select className="form-select" name="HỆ ĐÀO TẠO" value={formData['HỆ ĐÀO TẠO']} onChange={handleChange}>
                    {configData?.HeDaoTao?.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>

                <div className="col-md-4">
                  <label className="form-label small">Hình thức đào tạo</label>
                  <select className="form-select" name="HÌNH THỨC ĐÀO TẠO" value={formData['HÌNH THỨC ĐÀO TẠO']} onChange={handleChange}>
                    {configData?.HinhThucDaoTao?.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>

                <div className="col-md-4">
                  <label className="form-label small">Đối tượng ưu tiên</label>
                  <select className="form-select" name="ĐỐI TƯỢNG ƯU TIÊN" value={formData['ĐỐI TƯỢNG ƯU TIÊN']} onChange={handleChange}>
                    {configData?.DoiTuongUT?.map(dt => <option key={dt} value={dt}>{dt}</option>)}
                  </select>
                </div>

                <div className="col-md-4 d-flex align-items-end">
                  <div className="form-check">
                    <input className="form-check-input" type="checkbox" id="xnNhapHoc" checked={xnNhapHoc} onChange={(e) => setXnNhapHoc(e.target.checked)} />
                    <label className="form-check-label fw-bold text-success" htmlFor="xnNhapHoc">XN nhập học</label>
                  </div>
                </div>

                {/* KHU VỰC III: CÁC MỤC ĐÃ CÓ (checklist theo đúng cột Trung Gian) */}
                <h6 className="text-muted border-bottom pb-2 mt-4">III. Các mục đã có</h6>
                <div className="col-12">
                  <div className="d-flex flex-wrap gap-3 p-3 bg-light rounded border">
                    {CHECK_FIELDS.map((f) => (
                      <div className="form-check" key={f}>
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id={`check-${f}`}
                          checked={!!checks[f]}
                          onChange={() => toggleCheck(f)}
                        />
                        <label className="form-check-label small cursor-pointer" htmlFor={`check-${f}`}>
                          {f.charAt(0) + f.slice(1).toLowerCase()}
                        </label>
                      </div>
                    ))}

                    <div className="form-check">
                      <input className="form-check-input" type="checkbox" id="check-uutien" checked={isUuTienChecked} readOnly />
                      <label className="form-check-label small" htmlFor="check-uutien">Giấy tờ ưu tiên</label>
                    </div>
                  </div>
                  {isUuTienChecked && (
                    <input
                      type="text"
                      className="form-control form-control-sm border-primary mt-2"
                      placeholder="Nhập loại giấy tờ ưu tiên (VD: Sổ hộ nghèo...)"
                      value={ghiChuUuTien}
                      onChange={(e) => setGhiChuUuTien(e.target.value)}
                    />
                  )}
                </div>

                <div className="col-12 mt-3">
                  <label className="form-label small">Link hồ sơ (Google Drive, v.v.)</label>
                  <input type="url" className="form-control" name="LINK HỒ SƠ" value={formData['LINK HỒ SƠ']} onChange={handleChange} placeholder="https://..." />
                </div>

                {/* KHU VỰC IV: NỘP TIỀN — chỉ hiện lúc TẠO MỚI, gộp chung vào 1 lần lưu vì
                    lúc này chưa có Mã SV để gọi lưu khoản thu riêng. Sửa hồ sơ đã có thì
                    dùng khối "Nộp tiền" tương tác ở khung bên phải (DocumentList.jsx). */}
                {!initialData && (
                  <>
                    <h6 className="text-muted border-bottom pb-2 mt-4">IV. Nộp tiền</h6>
                    <div className="col-12">
                      <div className="p-3 bg-light rounded border">
                        {LOAI_PHI.map(loai => (
                          <div className="row g-2 align-items-center mb-2" key={loai}>
                            <div className="col-auto">
                              <div className="form-check">
                                <input
                                  className="form-check-input"
                                  type="checkbox"
                                  id={`phi-${loai}`}
                                  checked={!!noptien[loai]?.checked}
                                  onChange={() => toggleNopTien(loai)}
                                />
                                <label className="form-check-label small" htmlFor={`phi-${loai}`} style={{ minWidth: 160, display: 'inline-block' }}>{loai}</label>
                              </div>
                            </div>
                            {noptien[loai]?.checked && (
                              <div className="col-auto">
                                <input
                                  type="number"
                                  min="0"
                                  className="form-control form-control-sm"
                                  style={{ width: 160 }}
                                  placeholder="Số tiền"
                                  value={noptien[loai]?.soTien || ''}
                                  onChange={(e) => changeSoTien(loai, e.target.value)}
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

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