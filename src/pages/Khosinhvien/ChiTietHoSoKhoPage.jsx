import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { layChiTietHoSoKho } from '../../api/studentApi';
import './KhoSinhVien.css';

// ===================================================================
// TRANG CHI TIẾT 1 HỒ SƠ (route con /quan-ly-ho-so-moi/ho-so/:cccd/:nganh) — ĐÃ THÊM
// theo yêu cầu: bấm vào 1 dòng ở trang Kho sẽ mở ra TRANG RIÊNG (không phải modal nữa —
// modal cũ đã bỏ) hiện đầy đủ thông tin hồ sơ đó, từ lịch sử tuyển sinh cho tới "hiện tại"
// (để trong ngoặc kép = còn để trống chỗ cho dữ liệu Đào tạo/Khảo thí/Tài chính sau này,
// khi các hệ thống đó được kết nối — xem 3 khối "Chưa kết nối" ở dưới).
//
// LƯU Ý về URL dạng /:cccd/:nganh — đây CHỈ là 1 route con của CÙNG 1 trang React (dùng
// HashRouter, phần path nằm sau dấu #), KHÔNG phải tạo 1 trang/file HTML riêng cho mỗi
// sinh viên — nên KHÔNG tốn thêm lưu trữ nào cả, dù có 100 hay 1 triệu hồ sơ, mã nguồn
// (bundle JS) vẫn chỉ có đúng 1 bản, chỉ đổi cccd/nganh trong URL rồi gọi API lấy đúng hồ
// sơ đó. Đổi từ modal sang route thật (dùng thẻ <Link>) cũng nhân tiện SỬA LUÔN lỗi bấm
// chọn/copy chữ trong bảng bị hiểu nhầm thành bấm mở hồ sơ (link thật thì trình duyệt tự
// phân biệt được kéo-chọn-chữ với bấm-để-mở, khác hẳn onClick gắn cho cả dòng <tr>).
// ===================================================================

const BADGE_MAU = {
  'Đang chờ duyệt': 'secondary',
  'Mới bổ sung': 'info',
  'Đã báo thiếu': 'warning',
  'Đã duyệt': 'primary',
  'Đã trúng tuyển': 'success',
  'Đã trúng tuyển (chờ bàn giao)': 'success',
  'Đã bàn giao Đào tạo': 'dark',
};

// 3 khối "chưa kết nối" — đặt sẵn chỗ cho các hệ thống khác của trường, đúng ý đã bàn:
// mã sinh viên hệ thống tự sinh sẽ là mã DÙNG CHUNG khi liên thông dữ liệu sau này.
const HE_THONG_TUONG_LAI = [
  { ten: 'Đào tạo (kết quả học tập hiện tại)', icon: 'bi-mortarboard' },
  { ten: 'Khảo thí', icon: 'bi-clipboard-check' },
  { ten: 'Tài chính / Kế toán', icon: 'bi-cash-coin' },
];

// Bảng key-value đơn giản, dùng chung cho cả 3 khối "Dữ liệu đầy đủ" bên dưới — bỏ qua
// nếu không có dữ liệu (null) hoặc rỗng.
const BangKV = ({ tieuDe, data }) => {
  const entries = Object.entries(data || {});
  if (entries.length === 0) return null;
  return (
    <div className="card border-0 shadow-sm mb-3">
      <div className="card-body py-2">
        <div className="small fw-bold text-muted mb-2">{tieuDe}</div>
        <div className="table-responsive">
          <table className="table table-sm mb-0">
            <tbody>
              {entries.map(([k, v]) => (
                <tr key={k}>
                  <td className="text-muted" style={{ width: '35%', whiteSpace: 'nowrap' }}>{k}</td>
                  <td className="fw-medium">{String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const ChiTietHoSoKhoPage = () => {
  const { cccd, nganh } = useParams();
  const navigate = useNavigate();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['khoChiTietHoSo', cccd, nganh],
    queryFn: () => layChiTietHoSoKho(cccd, nganh),
  });

  const handlePrint = () => window.print();

  if (isLoading) {
    return (
      <div className="container-fluid py-5 text-center">
        <div className="spinner-border text-primary"></div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="container-fluid py-4">
        <button className="btn btn-sm btn-outline-secondary mb-3" onClick={() => navigate('/quan-ly-ho-so-moi')}>
          <i className="bi bi-arrow-left me-1"></i>Quay lại Kho tra cứu
        </button>
        <div className="alert alert-danger">Không tải được hồ sơ: {error?.message || 'Không tìm thấy.'}</div>
      </div>
    );
  }

  return (
    <div className="container-fluid py-3 kho-print-area">
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <button className="btn btn-sm btn-outline-secondary" onClick={() => navigate('/quan-ly-ho-so-moi')}>
            <i className="bi bi-arrow-left"></i>
          </button>
          <h4 className="fw-bold mb-0">{data.hoTen}</h4>
          <span className={`badge bg-${BADGE_MAU[data.trangThai] || 'secondary'}`}>{data.trangThai}</span>
        </div>
        <button className="btn btn-sm btn-outline-primary" onClick={handlePrint}>
          <i className="bi bi-printer me-1"></i>In nhanh
        </button>
      </div>

      {/* ---- Thông tin nhanh ---- */}
      <div className="card border-0 shadow-sm mb-3">
        <div className="card-body py-2">
          <div className="row g-2 small">
            <div className="col-6 col-md-3"><span className="text-muted">CCCD:</span> <strong>{data.cccd}</strong></div>
            <div className="col-6 col-md-3"><span className="text-muted">Mã sinh viên:</span> <strong>{data.maSinhVien || 'Chưa có'}</strong></div>
            <div className="col-6 col-md-3"><span className="text-muted">Ngành:</span> <strong>{data.nganh}</strong></div>
            <div className="col-6 col-md-3"><span className="text-muted">Khóa:</span> <strong>{data.khoa}</strong></div>
            <div className="col-6 col-md-3"><span className="text-muted">Hệ đào tạo:</span> <strong>{data.heDaoTao}</strong></div>
            <div className="col-6 col-md-3"><span className="text-muted">Hình thức đào tạo:</span> <strong>{data.hinhThucDaoTao}</strong></div>
            <div className="col-6 col-md-3"><span className="text-muted">Năm xét tuyển:</span> <strong>{data.namXetTuyen}</strong></div>
            <div className="col-6 col-md-3"><span className="text-muted">Kênh nộp:</span> <strong>{data.kenhNop || 'Xét tuyển online'}</strong></div>
          </div>
        </div>
      </div>

      {/* ---- Lịch sử vòng đời hồ sơ (3 mốc thật, xem chú thích action GAS: chưa có nguồn
          nào khác đủ tin cậy để thêm mốc, VD từng lần "báo thiếu"/"bổ sung" cụ thể). ---- */}
      <div className="card border-0 shadow-sm mb-3">
        <div className="card-body py-3">
          <div className="small fw-bold text-muted mb-3">Lịch sử hồ sơ</div>
          <div className="kho-timeline">
            {data.timeline.map((buoc, idx) => (
              <div key={idx} className={`kho-timeline-buoc ${buoc.xong ? 'kho-timeline-xong' : 'kho-timeline-chua'}`}>
                <div className="kho-timeline-cham"><i className={`bi ${buoc.xong ? 'bi-check-lg' : 'bi-hourglass-split'}`}></i></div>
                <div className="kho-timeline-noidung">
                  <div className="fw-bold">{buoc.buoc}</div>
                  <div className="text-muted small">{buoc.ngay || (buoc.xong ? '' : 'Chưa tới bước này')}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---- Liên kết mã / các hệ thống khác — chỗ đặt sẵn cho "hiện tại" (Đào tạo/Khảo
          thí/Tài chính) như đã bàn: mã sinh viên hệ thống tự sinh sẽ là mã dùng chung khi
          kết nối các hệ thống đó trong tương lai. ---- */}
      <div className="card border-0 shadow-sm mb-3">
        <div className="card-body py-3">
          <div className="small fw-bold text-muted mb-2">Liên kết dữ liệu với hệ thống khác</div>
          <div className="mb-3">
            <span className="text-muted small">Mã liên kết dùng chung (mã sinh viên):</span>{' '}
            <span className="badge bg-primary-subtle text-primary-emphasis border border-primary-subtle fs-6">
              {data.maSinhVien || 'Chưa có (thiếu năm xét tuyển/hệ/hình thức hoặc CCCD)'}
            </span>
          </div>
          {data.maPhu && data.maPhu.length > 0 && (
            <div className="mb-3">
              <div className="text-muted small mb-1">Mã định danh phụ đang liên kết:</div>
              <div className="table-responsive">
                <table className="table table-sm mb-0">
                  <thead><tr><th>Loại mã</th><th>Giá trị</th><th>Nguồn cấp</th><th>Hiệu lực từ</th></tr></thead>
                  <tbody>
                    {data.maPhu.map((m, idx) => (
                      <tr key={idx}><td>{m.loaiMa}</td><td>{m.giaTri}</td><td>{m.nguonCap}</td><td>{m.hieuLucTu}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="row g-2">
            {HE_THONG_TUONG_LAI.map((ht) => (
              <div className="col-md-4" key={ht.ten}>
                <div className="border rounded p-2 text-center text-muted kho-placeholder-he-thong">
                  <i className={`bi ${ht.icon} fs-4 d-block mb-1`}></i>
                  <div className="small fw-bold">{ht.ten}</div>
                  <div className="small">Chưa kết nối</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---- Dữ liệu đầy đủ (nguyên trạng từng nguồn) — không hiện khi in để đỡ tốn giấy,
          phần cần in đã nằm ở "Thông tin nhanh" + "Lịch sử hồ sơ" phía trên. ---- */}
      <div className="kho-hide-on-print">
        <BangKV tieuDe="Toàn bộ dữ liệu đã nộp (Trung Gian)" data={data.chiTietTrungGian} />
        <BangKV tieuDe="Dữ liệu tại KETQUA (đã duyệt trúng tuyển)" data={data.chiTietKetQua} />
        <BangKV tieuDe="Dữ liệu đã bàn giao Đào tạo" data={data.chiTietDaoTao} />
      </div>
    </div>
  );
};

export default ChiTietHoSoKhoPage;