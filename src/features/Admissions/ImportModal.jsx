import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { fetchAdmissionsHeaders } from '../../api/studentApi';
import { chuanHoaNgaySinhImport } from '../../utils/ngaySinh';

// ĐÃ VIẾT LẠI TOÀN BỘ: file mẫu giờ được DỰNG ĐỘNG từ danh sách cột do server trả về
// (action getAdmissionsHeaders, cùng bộ ADMISSIONS_DATA_FIELDS/ADMISSIONS_CHECK_FIELDS
// mà addAdmission/importAdmissions bên Quanlysv.gs đang dùng) — cùng nguyên lý cơ chế
// "tự tóm tiêu đề" bên trang Xét tuyển, thay cho file mẫu tĩnh hardcode theo cột sheet
// SinhVien cũ. Nhờ vậy file mẫu luôn khớp tuyệt đối với dữ liệu thật sẽ đổ vào Trung
// Gian, không cần sửa 2 nơi khi đổi cột. Import cũng gọi thẳng importAdmissions (ghi
// vào Trung Gian) thay vì importStudentsToAdmissions (sheet SinhVien) cũ.
const ImportModal = ({ onClose, onImport, isPending }) => {
  const [previewData, setPreviewData] = useState([]);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef(null);

  const { data: headersInfo, isLoading: isLoadingHeaders } = useQuery({
    queryKey: ['admissionsHeaders'],
    queryFn: fetchAdmissionsHeaders,
    staleTime: Infinity,
  });

  // Lắng nghe phím ESC để đóng
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Tải file mẫu — cột lấy thẳng từ server (dataFields + checkFields + statusField),
  // 1 dòng ví dụ để người dùng biết định dạng, không hardcode tên cột ở frontend.
  const handleDownloadTemplate = () => {
    if (!headersInfo) return;
    const allCols = [...headersInfo.dataFields, ...headersInfo.checkFields, headersInfo.statusField];
    const vidu = {};
    allCols.forEach(c => { vidu[c] = ''; });
    vidu['NGÀY SINH'] = '15/05/2008';
    vidu[headersInfo.statusField] = headersInfo.statusValue; // gợi ý đúng giá trị hệ thống hiểu là "đã trúng tuyển"
    headersInfo.checkFields.forEach(c => { if (c !== 'GIẤY TỜ ƯU TIÊN') vidu[c] = 'x'; });

    const ws = XLSX.utils.json_to_sheet([vidu], { header: allCols });
    // ĐÃ THÊM: khoá cột "NGÀY SINH" ở định dạng CHỮ (Text, number format "@") ngay trong file
    // mẫu — nếu không, Excel có thể tự ý đổi ô này thành kiểu Date khi người nhập liệu sửa/gõ
    // tiếp, và tuỳ theo vùng miền (locale) máy của người đó, "15/05/2008" có thể bị hiểu nhầm
    // sang tháng/ngày thay vì ngày/tháng — hệ thống LUÔN hiểu cột này theo đúng dd/MM/yyyy
    // (xem chuanHoaNgaySinhImport ở utils/ngaySinh.js, khớp đúng backend DinhDanh.gs).
    const ngaySinhColIdx = allCols.indexOf('NGÀY SINH');
    if (ngaySinhColIdx !== -1 && ws['!ref']) {
      const colLetter = XLSX.utils.encode_col(ngaySinhColIdx);
      const range = XLSX.utils.decode_range(ws['!ref']);
      for (let r = 1; r <= range.e.r; r++) { // bỏ dòng 0 (header)
        const addr = colLetter + (r + 1);
        if (ws[addr]) { ws[addr].t = 's'; ws[addr].z = '@'; }
      }
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template_ThuHoSo");
    XLSX.writeFile(wb, "File_Mau_Thu_Ho_So_Nhap_Hoc.xlsx");
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
      // ĐÃ SỬA: chuẩn hoá "NGÀY SINH" về ISO (yyyy-MM-dd) ngay khi đọc file, để bảng xem
      // trước hiện đúng NHƯ đã nhập qua form (input type="date"), thay vì để lộ chuỗi/số thô
      // tuỳ Excel đọc ra — xem chuanHoaNgaySinhImport (utils/ngaySinh.js).
      const data = XLSX.utils.sheet_to_json(ws).map(row => (
        row['NGÀY SINH'] === undefined ? row : { ...row, 'NGÀY SINH': chuanHoaNgaySinhImport(row['NGÀY SINH']) }
      ));
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

            <button className="btn btn-outline-info mb-4" onClick={handleDownloadTemplate} disabled={isLoadingHeaders || !headersInfo}>
              <i className="bi bi-file-earmark-arrow-down me-2"></i>
              {isLoadingHeaders ? 'Đang tải cấu trúc cột...' : 'Tải file mẫu (.xlsx)'}
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