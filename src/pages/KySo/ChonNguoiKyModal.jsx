// ĐÃ THÊM (Ký điện tử Pha 1 — Bước 3): khối "chọn người ký" — đúng cái người dùng gọi
// là "bảng thứ 2" khi xuất GBTT. Đây KHÔNG phải 1 modal độc lập (dù tên file có chữ
// Modal, giữ tên theo đúng kế hoạch đã chốt) — nó được NHÚNG thẳng vào bên trong modal
// xác nhận hàng loạt sẵn có của ThamDinhPage.jsx (batchPreview), ngay dưới bảng danh
// sách sinh viên, để tránh "hộp thoại chồng hộp thoại".
//
// Cách dùng: <ChonNguoiKyModal loaiTaiLieu="GBTT" giaTri={arr} onChange={setArr} />
// `giaTri` là mảng người ký hiện tại của form cha, dạng:
//   [{ maChucDanh, tenChucDanh, thuTu, email, ten, chon }, ...]
// Component TỰ SEED (điền sẵn) mảng này 1 LẦN DUY NHẤT từ cấu hình ChucDanhKy khi tải
// xong — dùng useRef làm cờ "đã seed chưa" để không đè lên chỉnh sửa dở dang của
// người dùng nếu component re-render (vd cha đổi state khác làm re-render toàn bộ).
import React, { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { layCauHinhChucDanhKy } from '../../api/studentApi';

const ChonNguoiKyModal = ({ loaiTaiLieu = 'GBTT', giaTri = [], onChange }) => {
  const daSeed = useRef(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['cauHinhChucDanhKy', loaiTaiLieu],
    queryFn: () => layCauHinhChucDanhKy(loaiTaiLieu),
  });

  // Seed 1 lần duy nhất khi có dữ liệu cấu hình — mỗi chức danh mặc định được CHỌN
  // (chon:true) với người ký = đúng email mặc định trong ChucDanhKy.
  useEffect(() => {
    if (daSeed.current || !data) return;
    daSeed.current = true;
    const khoiTao = (data.chucDanh || []).map((cd) => ({
      maChucDanh: cd.maChucDanh,
      tenChucDanh: cd.tenChucDanh,
      thuTu: cd.thuTu,
      email: cd.emailMacDinh,
      ten: cd.tenMacDinh,
      chon: true,
    }));
    onChange(khoiTao);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const capNhatDong = (maChucDanh, thayDoi) => {
    onChange(giaTri.map((d) => (d.maChucDanh === maChucDanh ? { ...d, ...thayDoi } : d)));
  };

  const timTaiKhoan = (email) => (data?.danhSachTaiKhoan || []).find((tk) => tk.email === email);

  if (isLoading) {
    return <div className="text-muted small mt-3">Đang tải cấu hình người ký...</div>;
  }
  if (isError) {
    return (
      <div className="alert alert-danger small mt-3 mb-0">
        Không tải được cấu hình chức danh ký: {error?.message || 'Lỗi không xác định'}
      </div>
    );
  }
  if (!data?.chucDanh?.length) {
    return (
      <div className="alert alert-warning small mt-3 mb-0">
        Chưa có chức danh ký nào được cấu hình cho loại tài liệu "{loaiTaiLieu}". Vào sheet
        ChucDanhKy để thêm (xem hướng dẫn Bước 1 của tính năng Ký điện tử).
      </div>
    );
  }

  return (
    <div className="mt-4">
      <h6 className="fw-bold mb-2">
        <i className="bi bi-vector-pen me-2"></i>Danh sách người ký (theo thứ tự)
      </h6>
      <p className="text-muted small mb-2">
        Vị trí ký khoá cứng theo chức danh — có thể đổi tài khoản ký ở đây cho riêng
        lần xuất này mà không ảnh hưởng cấu hình mặc định.
      </p>
      <div className="table-responsive">
        <table className="table table-sm table-bordered align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th style={{ width: 50 }}>Ký</th>
              <th>Chức danh</th>
              <th>Người ký</th>
              <th style={{ width: 140 }}>Chữ ký</th>
            </tr>
          </thead>
          <tbody>
            {giaTri.map((d, idx) => {
              const tk = timTaiKhoan(d.email);
              const coChuKy = tk ? tk.coChuKy : false;
              return (
                <tr key={d.maChucDanh} className={!d.chon ? 'text-muted' : ''}>
                  <td>{idx + 1}</td>
                  <td>
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={d.chon}
                      onChange={(e) => capNhatDong(d.maChucDanh, { chon: e.target.checked })}
                    />
                  </td>
                  <td>{d.tenChucDanh}</td>
                  <td>
                    <select
                      className="form-select form-select-sm"
                      disabled={!d.chon}
                      value={d.email || ''}
                      onChange={(e) => {
                        const tkMoi = timTaiKhoan(e.target.value);
                        capNhatDong(d.maChucDanh, { email: e.target.value, ten: tkMoi ? tkMoi.ten : '' });
                      }}
                    >
                      <option value="">-- Chưa chọn --</option>
                      {(data.danhSachTaiKhoan || []).map((tk) => (
                        <option key={tk.email} value={tk.email}>{tk.ten} ({tk.email})</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {!d.chon || !d.email ? (
                      <span className="badge bg-secondary">Bỏ qua</span>
                    ) : coChuKy ? (
                      <span className="badge bg-success">Đã có chữ ký</span>
                    ) : (
                      <span className="badge bg-danger">Chưa có chữ ký</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ChonNguoiKyModal;