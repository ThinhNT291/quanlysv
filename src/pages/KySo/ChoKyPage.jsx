// ĐÃ THÊM (Ký điện tử Pha 1 — Bước 4): trang "Hồ sơ chờ ký" — danh sách các yêu cầu
// ký (GBTT) đang tới lượt CHÍNH người đang đăng nhập, đúng khuôn danh sách + modal của
// XacNhanDinhDanhPage.jsx (DinhDanh/). Không bọc ProtectedRoute theo vai trò — xem chú
// thích tại route /ho-so-cho-ky trong App.jsx (đây là dữ liệu BuocKy theo email, không
// phải theo Role hệ thống).
//
// ĐÃ THÊM (Bước 7): tab thứ 2 "Đã ký / Lịch sử" — liệt kê MỌI yêu cầu người này có liên
// quan (đã ký/đang chờ tới lượt/là người tạo), dùng để xem lại + tải PDF sau khi văn bản
// đã hoàn tất (điều tab "Đang chờ ký" không còn hiện nữa một khi đã ký xong phần của mình).
// Quy ước để quyết định có hiện nút "Ký" hay không khi mở modal xem trước: CHỈ dòng mở từ
// danh sách "Đang chờ ký" (danhSachChoKy, do backend đã lọc đúng TRANG_THAI=DEN_LUOT +
// đúng email) mới cho ký — dòng mở từ tab "Lịch sử" luôn ở chế độ chỉ xem, kể cả khi (hiếm
// gặp) nó cũng đang tới lượt mình, để tránh phải tự so khớp email ở phía frontend (danh
// sách lịch sử không có cột email từng bước, chỉ có tên hiển thị — so tên không đáng tin).
// Nếu đúng là đang tới lượt, dòng đó luôn có mặt song song bên tab "Đang chờ ký".
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Swal from 'sweetalert2';
import { fetchDanhSachChoToiKy, fetchLichSuKyCuaToi, xemTruocYeuCauKy, kyYeuCau } from '../../api/studentApi';

const BADGE_BUOC = {
  DA_KY: 'bg-success',
  DEN_LUOT: 'bg-warning text-dark',
  CHO_TRUOC: 'bg-secondary',
};

const ChoKyPage = () => {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('choky'); // 'choky' | 'lichsu'
  const [dangXem, setDangXem] = useState(null); // { maYeuCau, tieuDe, hoTenSV, cacBuoc, coTheKy, ... } của dòng đang mở modal

  const { data, isLoading, isError, error, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ['choToiKy'],
    queryFn: fetchDanhSachChoToiKy,
  });
  const danhSachChoKy = data?.danhSach || [];
  const coChuKy = data?.coChuKy ?? true; // mặc định true để không doạ nhầm trong lúc đang tải

  const {
    data: dataLichSu, isLoading: dangTaiLichSu, isError: loiLichSu, error: errLichSu,
    dataUpdatedAt: capNhatLichSu, refetch: taiLaiLichSu, isFetching: dangFetchLichSu,
  } = useQuery({
    queryKey: ['lichSuKy'],
    queryFn: fetchLichSuKyCuaToi,
    enabled: tab === 'lichsu',
  });
  const danhSachLichSu = dataLichSu?.danhSach || [];

  const { data: xemTruoc, isLoading: dangTaiPreview, isError: loiPreview, error: errPreview } = useQuery({
    queryKey: ['xemTruocYeuCauKy', dangXem?.maYeuCau],
    queryFn: () => xemTruocYeuCauKy(dangXem.maYeuCau),
    enabled: !!dangXem,
  });

  const kyMutation = useMutation({
    mutationFn: kyYeuCau,
    onSuccess: (ket) => {
      queryClient.invalidateQueries({ queryKey: ['choToiKy'] });
      queryClient.invalidateQueries({ queryKey: ['lichSuKy'] });
      setDangXem(null);
      Swal.fire({
        icon: 'success',
        title: 'Đã ký thành công',
        text: ket?.hoanTat ? 'Văn bản đã đủ chữ ký và hoàn tất.' : 'Đang chờ người tiếp theo ký.',
      });
    },
    onError: (err) => Swal.fire({ icon: 'error', title: 'Lỗi khi ký', text: err.message }),
  });

  const moModal = (row, coTheKy) => setDangXem({ ...row, coTheKy });
  const dongModal = () => setDangXem(null);

  const xacNhanKy = () => {
    if (!dangXem || !dangXem.coTheKy) return;
    Swal.fire({
      icon: 'question',
      title: 'Xác nhận ký văn bản này?',
      text: 'Ảnh chữ ký cá nhân của bạn sẽ được đóng vào đúng vị trí chức danh, kèm ngày giờ ký — không thể sửa/thu hồi sau khi đã ký.',
      showCancelButton: true, confirmButtonText: 'Ký ngay', cancelButtonText: 'Huỷ', confirmButtonColor: '#198754',
    }).then((r) => {
      if (r.isConfirmed) kyMutation.mutate({ maYeuCau: dangXem.maYeuCau });
    });
  };

  const renderBadgeBuoc = (cacBuoc) => (cacBuoc || []).map((b) => (
    <span
      key={b.thuTu}
      className={`badge me-1 mb-1 ${BADGE_BUOC[b.trangThai] || 'bg-secondary'}`}
      title={b.tenNguoiKy}
    >
      {b.thuTu}. {b.tenChucDanh}
    </span>
  ));

  return (
    <div className="container-fluid py-3">
      <div className="row mb-3 align-items-center">
        <div className="col-md-6">
          <h4 className="text-uppercase fw-bold" style={{ color: '#037683' }}>
            <i className="bi bi-vector-pen me-2"></i>Hồ sơ chờ ký
          </h4>
          <p className="text-muted small mb-0">
            Các văn bản (Giấy báo trúng tuyển...) đang tới lượt bạn ký, theo đúng thứ tự chức danh đã cấu hình.
          </p>
        </div>
        <div className="col-md-6 text-md-end mt-2 mt-md-0">
          <span className="small text-muted me-2">
            {tab === 'choky'
              ? (isFetching ? '⏳ Đang tải...' : dataUpdatedAt ? `✔ Cập nhật: ${new Date(dataUpdatedAt).toLocaleTimeString('vi-VN')}` : '')
              : (dangFetchLichSu ? '⏳ Đang tải...' : capNhatLichSu ? `✔ Cập nhật: ${new Date(capNhatLichSu).toLocaleTimeString('vi-VN')}` : '')}
          </span>
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={() => (tab === 'choky' ? refetch() : taiLaiLichSu())}
            disabled={tab === 'choky' ? isFetching : dangFetchLichSu}
          >
            <i className="bi bi-arrow-clockwise me-1"></i>Tải lại
          </button>
        </div>
      </div>

      {!coChuKy && !isLoading && (
        <div className="alert alert-warning">
          <i className="bi bi-exclamation-triangle-fill me-2"></i>
          Bạn chưa tải chữ ký cá nhân lên — vào menu tài khoản → <b>Hồ sơ cá nhân</b> để thêm trước khi ký bất kỳ văn bản nào.
        </div>
      )}

      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button className={`nav-link ${tab === 'choky' ? 'active fw-bold' : ''}`} onClick={() => setTab('choky')}>
            <i className="bi bi-pen me-1"></i>Đang chờ ký
            {danhSachChoKy.length > 0 && <span className="badge bg-danger rounded-pill ms-2">{danhSachChoKy.length}</span>}
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${tab === 'lichsu' ? 'active fw-bold' : ''}`} onClick={() => setTab('lichsu')}>
            <i className="bi bi-clock-history me-1"></i>Đã ký / Lịch sử
          </button>
        </li>
      </ul>

      {tab === 'choky' && (
        <>
          {isError && <div className="alert alert-danger">Lỗi tải danh sách: {error?.message}</div>}

          {!isLoading && danhSachChoKy.length === 0 && !isError && (
            <div className="alert alert-success">
              <i className="bi bi-check-circle-fill me-2"></i>Không có văn bản nào đang chờ bạn ký.
            </div>
          )}

          {danhSachChoKy.length > 0 && (
            <div className="table-responsive shadow-sm">
              <table className="table table-hover table-bordered bg-white align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Văn bản</th>
                    <th>Sinh viên</th>
                    <th>Ngành</th>
                    <th>Người tạo</th>
                    <th>Thời gian tạo</th>
                    <th>Tiến độ ký</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {danhSachChoKy.map((row) => (
                    <tr key={row.maYeuCau}>
                      <td>{row.tieuDe}</td>
                      <td className="fw-bold">{row.hoTenSV}</td>
                      <td>{row.nganh}</td>
                      <td>{row.nguoiTaoTen}</td>
                      <td className="small text-muted">{row.thoiGianTao}</td>
                      <td>{renderBadgeBuoc(row.cacBuoc)}</td>
                      <td>
                        <button className="btn btn-sm btn-primary fw-bold" onClick={() => moModal(row, true)}>
                          <i className="bi bi-eye me-1"></i>Xem &amp; Ký
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'lichsu' && (
        <>
          {loiLichSu && <div className="alert alert-danger">Lỗi tải lịch sử: {errLichSu?.message}</div>}

          {!dangTaiLichSu && danhSachLichSu.length === 0 && !loiLichSu && (
            <div className="alert alert-secondary">
              <i className="bi bi-info-circle me-2"></i>Chưa có văn bản nào bạn từng ký hoặc liên quan.
            </div>
          )}

          {danhSachLichSu.length > 0 && (
            <div className="table-responsive shadow-sm">
              <table className="table table-hover table-bordered bg-white align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Văn bản</th>
                    <th>Sinh viên</th>
                    <th>Ngành</th>
                    <th>Người tạo</th>
                    <th>Thời gian tạo</th>
                    <th>Trạng thái</th>
                    <th>Tiến độ ký</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {danhSachLichSu.map((row) => (
                    <tr key={row.maYeuCau}>
                      <td>{row.tieuDe}</td>
                      <td className="fw-bold">{row.hoTenSV}</td>
                      <td>{row.nganh}</td>
                      <td>{row.nguoiTaoTen}{row.laNguoiTao ? ' (bạn)' : ''}</td>
                      <td className="small text-muted">{row.thoiGianTao}</td>
                      <td>
                        {row.trangThai === 'HOAN_THANH'
                          ? <span className="badge bg-success">Hoàn tất</span>
                          : <span className="badge bg-warning text-dark">Đang ký</span>}
                      </td>
                      <td>{renderBadgeBuoc(row.cacBuoc)}</td>
                      <td className="text-nowrap">
                        <button className="btn btn-sm btn-outline-primary me-1" onClick={() => moModal(row, false)}>
                          <i className="bi bi-eye me-1"></i>Xem
                        </button>
                        {row.trangThai === 'HOAN_THANH' && row.pdfUrl && (
                          <a className="btn btn-sm btn-success" href={row.pdfUrl} target="_blank" rel="noreferrer">
                            <i className="bi bi-download me-1"></i>Tải PDF
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* MODAL XEM TRƯỚC + KÝ */}
      {dangXem && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => { if (e.target === e.currentTarget) dongModal(); }}>
          <div className="modal-dialog modal-xl modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title fw-bold">{dangXem.tieuDe}</h5>
                <button type="button" className="btn-close" onClick={dongModal}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  {dangXem.cacBuoc.map((b) => (
                    <span
                      key={b.thuTu}
                      className={`badge me-1 mb-1 ${BADGE_BUOC[b.trangThai] || 'bg-secondary'}`}
                    >
                      {b.thuTu}. {b.tenChucDanh} — {b.tenNguoiKy} {b.trangThai === 'DA_KY' ? `(đã ký ${b.thoiGianKy})` : b.trangThai === 'DEN_LUOT' ? '(đang chờ)' : ''}
                    </span>
                  ))}
                </div>

                {!dangXem.coTheKy && (
                  <div className="alert alert-secondary py-2 small mb-3">
                    <i className="bi bi-info-circle me-1"></i>Đang xem ở chế độ chỉ xem (mở từ tab Lịch sử). Nếu đây thật sự đang tới lượt bạn ký, hãy vào tab <b>Đang chờ ký</b>.
                  </div>
                )}

                {dangTaiPreview && <div className="text-center text-muted py-5">Đang tạo bản xem trước...</div>}
                {loiPreview && <div className="alert alert-danger">Lỗi tạo bản xem trước: {errPreview?.message}</div>}
                {xemTruoc?.pdfBase64 && (
                  <iframe
                    title="Xem trước GBTT"
                    src={`data:application/pdf;base64,${xemTruoc.pdfBase64}`}
                    style={{ width: '100%', height: '60vh', border: '1px solid #dee2e6' }}
                  />
                )}
                {xemTruoc?.pdfUrlCuoiCung && (
                  <div className="alert alert-success">
                    Văn bản đã hoàn tất. <a href={xemTruoc.pdfUrlCuoiCung} target="_blank" rel="noreferrer">Mở/tải PDF cuối cùng</a>.
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-outline-secondary" onClick={dongModal} disabled={kyMutation.isPending}>
                  {dangXem.coTheKy ? 'Đóng (ký sau)' : 'Đóng'}
                </button>
                {dangXem.coTheKy && (
                  <button
                    className="btn btn-success fw-bold"
                    onClick={xacNhanKy}
                    disabled={!coChuKy || kyMutation.isPending || dangTaiPreview}
                    title={!coChuKy ? 'Cần tải chữ ký cá nhân trước (Hồ sơ cá nhân)' : ''}
                  >
                    <i className="bi bi-pen me-1"></i>{kyMutation.isPending ? 'Đang ký...' : 'Ký văn bản này'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChoKyPage;