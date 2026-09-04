import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { fetchAdmissionsHeaders, fetchConfig } from '../../api/studentApi';
import { chuanHoaNgaySinhImport } from '../../utils/ngaySinh';
import { taiFileMauExcel } from '../../utils/excelTemplate';

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

  const [dangTaiMau, setDangTaiMau] = useState(false);

  // Tải file mẫu — cột lấy thẳng từ server (dataFields + checkFields + statusField),
  // 1 dòng ví dụ để người dùng biết định dạng, không hardcode tên cột ở frontend.
  // ĐÃ VIẾT LẠI: dùng helper taiFileMauExcel (utils/excelTemplate.js, chạy bằng exceljs)
  // thay cho thao tác trực tiếp bằng xlsx như trước — lý do đổi: xlsx (bản miễn phí) không
  // ghi được Data Validation (dropdown thật) vào file .xlsx xuất ra. Giờ NGOÀI việc khoá
  // định dạng Text cho NGÀY SINH/CĂN CƯỚC (giữ nguyên lý do như cũ — tránh Excel tự đổi kiểu
  // ô làm sai ngày hoặc mất số 0 ở đầu CCCD), file mẫu còn có thêm dropdown thật cho các cột
  // có danh sách giá trị cố định (NGÀNH/KHÓA/HỆ ĐÀO TẠO/HÌNH THỨC ĐÀO TẠO/ĐỐI TƯỢNG ƯU TIÊN),
  // lấy đúng 1 nguồn dữ liệu với sheet CauHinh (qua fetchConfig — cùng nguồn dropdown đang
  // dùng ở form "Thêm đăng ký" tay) — người nhập liệu chỉ chọn được giá trị có sẵn, giảm hẳn
  // nguy cơ gõ sai/thừa khoảng trắng khiến dữ liệu không khớp được các trường giá trị cố
  // định về sau (backend cũng đã chặn thêm 1 lớp nữa khi ghi, xem importAdmissions).
  // ĐÃ VIẾT LẠI (đồng bộ chuẩn file mẫu với Xét tuyển — XetTuyenPage.jsx): trước đây file
  // mẫu có 1 DÒNG VÍ DỤ (đủ giá trị mẫu ở mọi cột) ngay sau tiêu đề — người dùng phải tự
  // XOÁ dòng đó trước khi điền, quên xoá thì dòng ví dụ bị đọc nhầm thành 1 hồ sơ thật lúc
  // import. Giờ đổi sang đúng cấu trúc 2 dòng tiêu đề thống nhất với Xét tuyển: dòng 1 =
  // tên cột, dòng 2 = MÔ TẢ cách điền riêng cho từng cột (không phải dữ liệu, chữ nghiêng +
  // tô cam nhạt để không nhầm), dữ liệu thật bắt đầu từ dòng 3 — xem handleFileSelect bên
  // dưới đã bỏ qua đúng dòng 2 khi đọc file, không cần người dùng tự xoá gì nữa.
  const handleDownloadTemplate = async () => {
    if (!headersInfo || dangTaiMau) return;
    setDangTaiMau(true);
    try {
      // ĐÃ SỬA: cột cuối trên file mẫu giờ hiện tên "XÁC NHẬN NHẬP HỌC" (statusFieldLabel,
      // do backend cấp — dễ hiểu hơn cho cán bộ thu hồ sơ) thay vì tên cột thật đằng sau
      // ("TRẠNG THÁI THẨM ĐỊNH", statusField — cột này dùng CHUNG với luồng Xét tuyển/Thẩm
      // định nên không đổi tên cột thật được). Fallback về statusField nếu backend cũ chưa
      // deploy statusFieldLabel, để không lỗi.
      const statusLabel = headersInfo.statusFieldLabel || headersInfo.statusField;
      const allCols = [...headersInfo.dataFields, ...headersInfo.checkFields, statusLabel];

      // Lấy danh sách hợp lệ từ CauHinh — nếu gọi lỗi (VD mất mạng) thì vẫn tạo được file
      // mẫu bình thường, chỉ là không có dropdown, không chặn hẳn việc tải file mẫu.
      let config = {};
      try { config = await fetchConfig(); } catch (err) { /* bỏ qua, tạo file mẫu không dropdown */ }

      // ĐÃ BỎ: dropdown chỉ-1-giá-trị ('x') cho các cột giấy tờ (Ảnh thẻ -> Sơ yếu lý
      // lịch) — dropdown này thực ra bó hẹp hơn cả mô tả gợi ý ở dòng 2 (chấp nhận cả
      // "x" lẫn "true", trong khi dropdown chỉ cho chọn đúng "x"), theo yêu cầu bỏ đi để
      // người nhập gõ tự do đúng như mô tả. Vẫn giữ dropdown thật cho các cột có danh
      // sách giá trị cố định từ CauHinh (Ngành/Khóa/Hệ/Hình thức/Đối tượng ưu tiên).
      const dropdownColumns = {
        'NGÀNH': config.Nganh,
        'KHÓA': config.KhoaNhapHoc,
        'HỆ ĐÀO TẠO': config.HeDaoTao,
        'HÌNH THỨC ĐÀO TẠO': config.HinhThucDaoTao,
        'ĐỐI TƯỢNG ƯU TIÊN': config.DoiTuongUT,
      };

      const descRow = { 'CĂN CƯỚC': 'Số CCCD', 'NGÀY SINH': 'dd/mm/yyyy' };
      Object.keys(dropdownColumns).forEach((c) => { descRow[c] = 'chọn dropdown'; });
      headersInfo.checkFields.forEach(c => { if (c !== 'GIẤY TỜ ƯU TIÊN') descRow[c] = 'ghi x hoặc "true"'; });
      // ĐÃ SỬA: mô tả cũ "vd: Đã trúng tuyển" (nguyên văn khó đoán đúng chính tả) đổi thành
      // hướng dẫn kiểu ô tick, khớp với cách backend đọc giá trị mới (xem importAdmissions).
      descRow[statusLabel] = 'điền x nếu đã xác nhận';

      await taiFileMauExcel({
        headers: allCols,
        descRow,
        textLockColumns: ['NGÀY SINH', 'CĂN CƯỚC'],
        dropdownColumns,
        sheetName: 'Template_ThuHoSo',
        fileName: 'File_Mau_Thu_Ho_So_Nhap_Hoc.xlsx',
      });
    } finally {
      setDangTaiMau(false);
    }
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
      // ĐÃ THÊM ".slice(1)": bỏ dòng MÔ TẢ (dòng 2 của file, ngay sau tiêu đề — xem
      // handleDownloadTemplate/descRow phía trên) — sheet_to_json coi dòng 1 là tiêu đề
      // nên phần tử đầu tiên (index 0) của mảng trả về chính là dòng 2 thật của file
      // (dòng mô tả), phải bỏ đi trước khi coi các dòng còn lại là dữ liệu hồ sơ thật.
      const rowsRaw = XLSX.utils.sheet_to_json(ws).slice(1);
      // ĐÃ THÊM: đọc thêm 1 bản song song với raw:false — CHỈ dùng để lấy đúng cột CĂN CƯỚC
      // theo chuỗi ĐÃ ĐỊNH DẠNG (giữ được số 0 ở đầu nếu ô bị Excel coi là Number có định dạng
      // đệm số 0, VD "000000000000"). KHÔNG áp dụng raw:false cho việc đọc NGÀY SINH ở trên —
      // raw:true (mặc định) trả SỐ SERIAL THÔ, được chuanHoaNgaySinhImport giải mã luôn đúng
      // dd/MM/yyyy bất kể định dạng/locale hiển thị của file gốc; raw:false thay vào đó sẽ trả
      // chuỗi ĐÃ ĐỊNH DẠNG theo number-format của chính file nguồn (chưa chắc là dd/MM/yyyy),
      // dễ đọc nhầm ngày/tháng tuỳ file — nên chỉ dùng bản raw:false riêng cho CĂN CƯỚC. Cùng
      // bỏ dòng mô tả (.slice(1)) để chỉ số dòng (i trong .map bên dưới) khớp với rowsRaw.
      const rowsFormatted = XLSX.utils.sheet_to_json(ws, { raw: false }).slice(1);
      const data = rowsRaw.map((row, i) => {
        let out = row['NGÀY SINH'] === undefined ? row : { ...row, 'NGÀY SINH': chuanHoaNgaySinhImport(row['NGÀY SINH']) };
        const cccdKey = Object.keys(row).find(k => {
          const u = k.trim().toUpperCase();
          return u === 'CĂN CƯỚC' || u === 'CCCD' || u === 'SỐ CCCD';
        });
        // Chỉ thay khi giá trị thô là SỐ (đúng trường hợp Excel coi ô CCCD là kiểu Number và
        // đã cắt mất số 0 ở đầu) — ô đã là chuỗi (Text) thì giữ nguyên như cũ.
        if (cccdKey && typeof row[cccdKey] === 'number' && rowsFormatted[i] && rowsFormatted[i][cccdKey] !== undefined) {
          out = { ...out, [cccdKey]: rowsFormatted[i][cccdKey] };
        }
        return out;
      });
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

            <button className="btn btn-outline-info mb-4" onClick={handleDownloadTemplate} disabled={isLoadingHeaders || !headersInfo || dangTaiMau}>
              <i className="bi bi-file-earmark-arrow-down me-2"></i>
              {isLoadingHeaders ? 'Đang tải cấu trúc cột...' : (dangTaiMau ? 'Đang tạo file mẫu...' : 'Tải file mẫu (.xlsx)')}
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