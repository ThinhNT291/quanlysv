import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';

const ImportModal = ({ onClose, onImport, isPending }) => {
  const [previewData, setPreviewData] = useState([]);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef(null);

  // Lắng nghe phím ESC để đóng
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Tải file mẫu
  const handleDownloadTemplate = () => {
    const templateData = [{
      MaSV: 'SV001', HoTen: 'Nguyễn Văn A', NgaySinh: '2008-05-15', CCCD: '079012345678', 
      Nganh: 'Khoa học máy tính', KhoaNhapHoc: '01', DoiTuongUT: '01', KhuVucUT: 'KV1', 
      DoiTuongDauVao: 'Trung học phổ thông', NamXetTuyen: '2026', HinhThucDT: 'Chính quy', 
      PhuongThucDT: 'Đại trà', HeDT: 'Đại học', LinkHoSo: '', TrangThai: 0
    }];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template_NhapLiệu");
    XLSX.writeFile(wb, "File_Mau_Nhap_Sinh_Vien.xlsx");
  };

  // Xử lý khi người dùng chọn file
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws);
      setPreviewData(data);
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog">
        <div className="modal-content shadow">
          <div className="modal-header bg-light">
            <h5 className="modal-title text-primary fw-bold">NHẬP DỮ LIỆU TỪ EXCEL</h5>
            <button type="button" className="btn-close" onClick={onClose} title="Đóng (Bấm ESC)"></button>
          </div>
          
          <div className="modal-body p-4 text-center">
            
            <button className="btn btn-outline-info mb-4" onClick={handleDownloadTemplate}>
              <i className="bi bi-file-earmark-arrow-down me-2"></i> Tải file mẫu (.xlsx)
            </button>

            <div 
              className="border border-2 border-dashed rounded p-4 mb-3"
              style={{ cursor: 'pointer', backgroundColor: '#f8f9fa' }}
              onClick={() => fileInputRef.current.click()}
            >
              <i className="bi bi-cloud-upload fs-1 text-secondary mb-2"></i>
              <h6 className="text-secondary">{fileName ? fileName : 'Bấm vào đây để chọn file Excel'}</h6>
              <input 
                type="file" 
                accept=".xlsx, .xls" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                onChange={handleFileSelect} 
              />
            </div>

            {previewData.length > 0 && (
              <div className="alert alert-success py-2 mb-0">
                <i className="bi bi-check-circle-fill me-2"></i>
                Hệ thống tìm thấy <strong>{previewData.length}</strong> hồ sơ hợp lệ.
              </div>
            )}
          </div>
          
          <div className="modal-footer bg-light">
            <span className="text-muted small me-auto">Bấm ESC để đóng</span>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy bỏ</button>
            
            {previewData.length > 0 && (
              <button 
                type="button" 
                className="btn btn-primary px-4" 
                onClick={() => onImport(previewData)}
                disabled={isPending}
              >
                {isPending ? 'Đang nạp...' : 'Nạp dữ liệu'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImportModal;