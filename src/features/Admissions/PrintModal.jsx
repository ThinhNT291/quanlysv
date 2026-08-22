import React, { useEffect, useState } from 'react';
import moment from 'moment';
import html2pdf from 'html2pdf.js';

const PrintModal = ({ student, onClose }) => {
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isGenerating) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isGenerating]);

  const handleDownloadPDF = async () => {
    setIsGenerating(true);
    
    const element = document.getElementById('pdf-content');

    // FIX LỖI LỀ: html2pdf dùng thứ tự [Trên, Trái, Dưới, Phải]
    // Trên 20, Trái 30, Dưới 20, Phải 20 (Đơn vị: mm)
    const opt = {
      margin:       [20, 30, 20, 20], 
      filename:     `GiayBaoTrungTuyen_${student.MaSV}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, logging: false },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
      await html2pdf().set(opt).from(element).save();
    } catch (error) {
      console.error("Lỗi tạo PDF:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!student) return null;

  return (
    <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 1055 }}>
      <div className="modal-dialog modal-lg" style={{ maxWidth: '850px' }}>
        <div className="modal-content shadow-lg border-0">
          
          <div className="modal-header bg-light">
            <h5 className="modal-title text-primary fw-bold">
              <i className="bi bi-file-earmark-pdf me-2"></i> XUẤT GIẤY BÁO TRÚNG TUYỂN
            </h5>
            <button type="button" className="btn-close" onClick={onClose} disabled={isGenerating} title="Đóng (ESC)"></button>
          </div>
          
          <div className="modal-body p-0 d-flex justify-content-center bg-secondary" style={{ overflowY: 'auto', maxHeight: '75vh' }}>
            
            {/* CSS preview: padding theo thứ tự CSS chuẩn (Trên - Phải - Dưới - Trái) */}
            <div className="bg-white shadow-sm my-4" style={{ width: '210mm', minHeight: '297mm', padding: '20mm 20mm 20mm 30mm' }}>
              
              <div id="pdf-content" style={{ color: '#000', fontFamily: '"Times New Roman", Times, serif' }}>
                
                <div className="row text-center mb-4 d-flex flex-nowrap">
                  <div className="col-5">
                    <h6 className="mb-0 fw-normal fs-6">BỘ GIÁO DỤC VÀ ĐÀO TẠO</h6>
                    <h6 className="mb-0 fw-bold fs-6">TRƯỜNG ĐẠI HỌC ....................</h6>
                    {/* HƯỚNG DẪN CHỈNH KHOẢNG CÁCH: Đổi mt-1 (cách ít) thành mt-2 (cách nhiều hơn). Đổi width để làm dài/ngắn đường kẻ */}
                    <hr className="mt-1 mb-0 mx-auto" style={{ width: '40%', borderTop: '1.5px solid black' }} />
                  </div>
                  <div className="col-7">
                    <h6 className="mb-0 fw-bold fs-6">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</h6>
                    <h6 className="mb-0 fw-bold fs-6">Độc lập - Tự do - Hạnh phúc</h6>
                    {/* Đã xóa gạch chân dính chữ, thay bằng đường kẻ hr độc lập */}
                    <hr className="mt-1 mb-0 mx-auto" style={{ width: '50%', borderTop: '1.5px solid black' }} />
                  </div>
                </div>

                <div className="text-center mt-5 mb-4">
                  <h4 className="fw-bold mb-1">GIẤY BÁO TRÚNG TUYỂN VÀ GỌI NHẬP HỌC</h4>
                  <p className="fst-italic">Năm xét tuyển: {student.NamXetTuyen}</p>
                </div>

                <div style={{ fontSize: '1.15rem', lineHeight: '1.6' }}>
                  <p><strong>HIỆU TRƯỞNG TRƯỜNG ĐẠI HỌC PHÚ XUÂN TRÂN TRỌNG THÔNG BÁO:</strong></p>
                  
                  <div className="row mb-2 d-flex flex-nowrap">
                    <div className="col-7">Anh/Chị: <span className="fw-bold text-uppercase">{student.HoTen}</span></div>
                    <div className="col-5">Ngày sinh: <span className="fw-bold">{student.NgaySinh ? moment(student.NgaySinh).format('DD/MM/YYYY') : '...'}</span></div>
                  </div>
                  
                  <div className="row mb-2 d-flex flex-nowrap">
                    <div className="col-7">Số CMND/CCCD: <span className="fw-bold">{student.CCCD || '..............................'}</span></div>
                    <div className="col-5">Mã SV: <span className="fw-bold">{student.MaSV}</span></div>
                  </div>

                  <div className="row mb-2 d-flex flex-nowrap">
                    <div className="col-12" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Đã trúng tuyển vào ngành: <span className="fw-bold text-uppercase">{student.Nganh || '..............................'}</span>
                    </div>
                  </div>

                  <div className="row mb-3 d-flex flex-nowrap">
                    <div className="col-6">Khóa nhập học: <span className="fw-bold">{student.KhoaNhapHoc}</span></div>
                    <div className="col-6">Đối tượng đầu vào: <span className="fw-bold">{student.DoiTuongDauVao}</span></div>
                  </div>
                  
                  <div className="row mb-3 d-flex flex-nowrap">
                    <div className="col-6">Hệ đào tạo: <span className="fw-bold">{student.HeDT}</span></div>
                    <div className="col-6">Hình thức ĐT: <span className="fw-bold">{student.HinhThucDT}</span></div>
                  </div>

                  <p className="mt-4" style={{ whiteSpace: 'normal', textAlign: 'justify' }}>
                    Yêu cầu Anh/Chị có mặt tại trường vào ngày <strong>...../...../2026</strong> để làm thủ tục nhập học. 
                    Khi đến nhập học, Anh/Chị vui lòng mang theo Giấy báo này cùng với các hồ sơ quy định (Bản chính và bản sao công chứng).
                  </p>
                  <p style={{ whiteSpace: 'normal', textAlign: 'justify' }}>
                    Quá thời hạn 15 ngày kể từ ngày gọi nhập học, nếu Anh/Chị không đến làm thủ tục, kết quả trúng tuyển sẽ bị hủy bỏ.
                  </p>
                </div>

                <div className="row mt-5 d-flex flex-nowrap">
                  <div className="col-6"></div>
                  <div className="col-6 text-center">
                    <p className="fst-italic mb-1">Tp. Huế, ngày ..... tháng ..... năm 2026</p>
                    <h6 className="fw-bold mb-4 pb-4">HIỆU TRƯỞNG</h6>
                    <p className="mt-5 pt-3 fst-italic">(Ký tên và đóng dấu)</p>
                  </div>
                </div>

              </div>
            </div>
          </div>
          
          <div className="modal-footer bg-light">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isGenerating}>Hủy bỏ</button>
            <button type="button" className="btn btn-danger px-4" onClick={handleDownloadPDF} disabled={isGenerating}>
              {isGenerating ? (
                <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> Đang tạo PDF...</>
              ) : (
                <><i className="bi bi-file-earmark-pdf me-2"></i> TẢI FILE PDF</>
              )}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default PrintModal;