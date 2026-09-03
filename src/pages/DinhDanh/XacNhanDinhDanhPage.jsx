import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Swal from 'sweetalert2';
import { fetchDanhSachXacNhanDinhDanh, xuLyNghiTrungDinhDanh } from '../../api/studentApi';

// ĐÃ THÊM (PHA 1·D1 — bước 4, "Hàng đợi xác nhận định danh"): trang riêng, CHỈ Admin, gom
// TOÀN BỘ hồ sơ đang "CẦN_XÁC_NHẬN" (do addAdmission/importAdmissions/importStudents/
// updateAdmission tự động đánh dấu khi tên+ngày sinh trùng ai đó nhưng CCCD chưa đủ dữ
// liệu để khẳng định — xem dinhDanhGanTuDongChoHoSoMoi_/dinhDanhDongBoKhiSuaHoSo_ trong
// DinhDanh.gs) về ĐÚNG 1 nơi xử lý, thay vì chặn/hỏi ngay tại chỗ tạo/sửa hồ sơ.
//
// Danh sách này TỰ DỌN: 1 dòng biến mất khỏi đây ngay khi xử lý xong (không cần bấm gì
// thêm để "đóng" nó) — nhờ backend đổi thẳng cột SV_KEY từ "CẦN_XÁC_NHẬN" sang sv_key thật.
const XacNhanDinhDanhPage = () => {
  const queryClient = useQueryClient();
  const [dangXuLy, setDangXuLy] = useState(null); // dòng (object) đang mở modal xử lý
  const [svKeyDaChon, setSvKeyDaChon] = useState('');

  const { data: danhSach = [], isLoading, isError, error, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ['dinhDanhCanXacNhan'],
    queryFn: fetchDanhSachXacNhanDinhDanh,
  });

  const xuLyMutation = useMutation({
    mutationFn: xuLyNghiTrungDinhDanh,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dinhDanhCanXacNhan'] });
      setDangXuLy(null);
      setSvKeyDaChon('');
      Swal.fire({ icon: 'success', title: 'Đã xử lý', timer: 1400, showConfirmButton: false });
    },
    onError: (err) => Swal.fire('Lỗi', err.message, 'error'),
  });

  const moModal = (row) => {
    setDangXuLy(row);
    setSvKeyDaChon('');
  };
  const dongModal = () => { setDangXuLy(null); setSvKeyDaChon(''); };

  const xacNhanGanVao = () => {
    if (!svKeyDaChon) return;
    Swal.fire({
      icon: 'question', title: 'Xác nhận đúng là người này?',
      text: 'Mọi mã (CCCD/MSV) của hồ sơ đang chờ sẽ được gắn thêm vào hồ sơ định danh đã chọn — không huỷ được bằng thao tác thường, chỉ sửa lại được qua Apps Script.',
      showCancelButton: true, confirmButtonText: 'Đúng, gộp vào', cancelButtonText: 'Xem lại',
    }).then(r => {
      if (r.isConfirmed) xuLyMutation.mutate({ maSV: dangXuLy.maSV, hanhDong: 'ganVao', svKeyChon: svKeyDaChon });
    });
  };

  const xacNhanTaoMoi = () => {
    Swal.fire({
      icon: 'question', title: 'Xác nhận đây là người KHÁC?',
      text: 'Hệ thống sẽ tạo 1 hồ sơ định danh mới, tách hẳn khỏi (các) hồ sơ nghi trùng đang hiện bên phải.',
      showCancelButton: true, confirmButtonText: 'Đúng, tạo mới', cancelButtonText: 'Xem lại',
    }).then(r => {
      if (r.isConfirmed) xuLyMutation.mutate({ maSV: dangXuLy.maSV, hanhDong: 'taoMoi' });
    });
  };

  const nhanDoiChieu = (dc) => {
    if (dc === 'khop') return { text: '✔ CCCD khớp', cls: 'bg-success' };
    if (dc === 'hoSoCuChuaCoCccd') return { text: 'Hồ sơ cũ chưa có CCCD', cls: 'bg-warning text-dark' };
    return { text: 'Không có CCCD để so', cls: 'bg-secondary' };
  };

  return (
    <div className="container-fluid py-3">
      <div className="row mb-3 align-items-center">
        <div className="col-md-6">
          <h4 className="text-uppercase fw-bold" style={{ color: '#037683' }}>
            <i className="bi bi-person-fill-exclamation me-2"></i>Hàng đợi xác nhận định danh
          </h4>
          <p className="text-muted small mb-0">
            Hồ sơ trùng tên + ngày sinh với ai đó đã có trong hệ thống, nhưng chưa đủ CCCD để tự khẳng định là cùng 1 người hay khác người — cần Admin xem và xác nhận tay.
          </p>
        </div>
        <div className="col-md-6 text-md-end mt-2 mt-md-0">
          <span className="small text-muted me-2">
            {isFetching ? '⏳ Đang tải...' : dataUpdatedAt ? `✔ Cập nhật: ${new Date(dataUpdatedAt).toLocaleTimeString('vi-VN')}` : ''}
          </span>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => refetch()} disabled={isFetching}>
            <i className="bi bi-arrow-clockwise me-1"></i>Tải lại
          </button>
        </div>
      </div>

      {isError && <div className="alert alert-danger">Lỗi tải danh sách: {error?.message}</div>}

      {!isLoading && danhSach.length === 0 && !isError && (
        <div className="alert alert-success">
          <i className="bi bi-check-circle-fill me-2"></i>Không có hồ sơ nào đang chờ xác nhận định danh.
        </div>
      )}

      {danhSach.length > 0 && (
        <div className="table-responsive shadow-sm">
          <table className="table table-hover table-bordered bg-white align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>Mã SV</th>
                <th>Họ tên</th>
                <th>Ngày sinh</th>
                <th>CCCD</th>
                <th>Ngành</th>
                <th>Kênh nộp</th>
                <th>Tài khoản nhập liệu</th>
                <th>Số ứng viên nghi trùng</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {danhSach.map(row => (
                <tr key={row.maSV || row.dong}>
                  <td className="fw-bold">{row.maSV}</td>
                  <td>{row.hoTen}</td>
                  <td>{row.ngaySinh}</td>
                  <td>{row.cccd || <span className="text-muted fst-italic">— trống —</span>}</td>
                  <td>{row.nganh}</td>
                  <td>{row.kenhNop}</td>
                  <td>{row.taiKhoanNhapLieu}</td>
                  <td className="text-center">
                    <span className={`badge ${row.ungVien.length > 0 ? 'bg-warning text-dark' : 'bg-secondary'}`}>
                      {row.ungVien.length}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-sm btn-primary fw-bold" onClick={() => moModal(row)}>
                      <i className="bi bi-search me-1"></i>Xử lý
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL SO SÁNH CẠNH NHAU — hồ sơ đang chờ (trái) vs từng ứng viên nghi trùng (phải) */}
      {dangXuLy && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => { if (e.target === e.currentTarget) dongModal(); }}>
          <div className="modal-dialog modal-xl modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title fw-bold">Xác nhận định danh — {dangXuLy.hoTen}</h5>
                <button type="button" className="btn-close" onClick={dongModal}></button>
              </div>
              <div className="modal-body">
                <div className="row g-3">
                  <div className="col-md-5">
                    <div className="card border-primary h-100">
                      <div className="card-header bg-primary text-white fw-bold">Hồ sơ đang chờ (mới)</div>
                      <div className="card-body small">
                        <div><b>Mã SV:</b> {dangXuLy.maSV}</div>
                        <div><b>Họ tên:</b> {dangXuLy.hoTen}</div>
                        <div><b>Ngày sinh:</b> {dangXuLy.ngaySinh}</div>
                        <div><b>CCCD:</b> {dangXuLy.cccd || <span className="text-muted fst-italic">trống</span>}</div>
                        <div><b>Ngành:</b> {dangXuLy.nganh}</div>
                        <div><b>Kênh nộp:</b> {dangXuLy.kenhNop}</div>
                        <div><b>Tài khoản nhập liệu:</b> {dangXuLy.taiKhoanNhapLieu}</div>
                      </div>
                    </div>
                  </div>

                  <div className="col-md-7">
                    <div className="fw-bold mb-2 text-muted">Ứng viên nghi trùng ({dangXuLy.ungVien.length})</div>
                    {dangXuLy.ungVien.length === 0 && (
                      <div className="alert alert-info small mb-0">
                        Không tìm thấy ứng viên nào (có thể do thiếu tên/ngày sinh lúc tra cứu). Có thể "Khác người — Tạo hồ sơ mới" ở dưới.
                      </div>
                    )}
                    <div className="d-flex flex-column gap-2">
                      {dangXuLy.ungVien.map(uv => {
                        const dc = nhanDoiChieu(uv.doi_chieu_cccd);
                        return (
                          <label key={uv.sv_key}
                            className={`card p-2 mb-0 ${svKeyDaChon === uv.sv_key ? 'border-success' : ''}`}
                            style={{ cursor: 'pointer' }}>
                            <div className="d-flex align-items-start gap-2">
                              <input type="radio" className="form-check-input mt-1" name="svKeyChon"
                                checked={svKeyDaChon === uv.sv_key}
                                onChange={() => setSvKeyDaChon(uv.sv_key)} />
                              <div className="flex-grow-1 small">
                                <div className="d-flex justify-content-between align-items-center">
                                  <span className="fw-bold">{uv.ho_ten_chuan_hoa} — {uv.ngay_sinh}</span>
                                  <span className={`badge ${dc.cls}`}>{dc.text}</span>
                                </div>
                                <div className="text-muted" style={{ fontSize: '0.75rem' }}>sv_key: {uv.sv_key}</div>
                                {uv.ma_phu.length > 0 ? (
                                  <div className="mt-1">
                                    {uv.ma_phu.map((m, idx) => (
                                      <span key={idx} className={`badge me-1 mb-1 ${m.hieu_luc_den ? 'bg-light text-muted text-decoration-line-through' : 'bg-info text-dark'}`}>
                                        {m.loai_ma}: {m.gia_tri}
                                      </span>
                                    ))}
                                  </div>
                                ) : <div className="text-muted fst-italic mt-1">Chưa có mã phụ nào</div>}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-outline-secondary" onClick={dongModal} disabled={xuLyMutation.isPending}>
                  Đóng (xử lý sau)
                </button>
                <button className="btn btn-outline-danger fw-bold" onClick={xacNhanTaoMoi} disabled={xuLyMutation.isPending}>
                  <i className="bi bi-person-plus me-1"></i>Khác người — Tạo hồ sơ mới
                </button>
                <button className="btn btn-success fw-bold" onClick={xacNhanGanVao} disabled={!svKeyDaChon || xuLyMutation.isPending}>
                  <i className="bi bi-check2-circle me-1"></i>Đúng là người này — Gộp vào
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default XacNhanDinhDanhPage;