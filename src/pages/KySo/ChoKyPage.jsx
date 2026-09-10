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
//
// ĐÃ THÊM (Ký điện tử Pha 2 — Bước 2): "Từ chối ký" (nút cạnh "Ký văn bản này" trong modal,
// bắt buộc nhập lý do, dừng cả chuỗi) và "Thu hồi yêu cầu" (nút "Thu hồi" ở tab Lịch sử,
// chỉ người TẠO thấy, chỉ khi yêu cầu còn DANG_KY) — xem action tuChoiKy/huyYeuCauKy
// (Quanlysv.gs). YeuCauKy.TRANG_THAI có thêm BI_TU_CHOI/DA_HUY, xem TRANG_THAI_YEU_CAU.
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Swal from 'sweetalert2';
import { fetchDanhSachChoToiKy, fetchLichSuKyCuaToi, xemTruocYeuCauKy, kyYeuCau, kiemTraTrangThaiKy, tuChoiKy, huyYeuCauKy, layChuKyCuaToi } from '../../api/studentApi';

const BADGE_BUOC = {
  DA_KY: 'bg-success',
  DEN_LUOT: 'bg-warning text-dark',
  CHO_TRUOC: 'bg-secondary',
  // ĐÃ THÊM — Ký điện tử Pha 2 (Bước 2): trạng thái mới của 1 BƯỚC (BuocKy.TRANG_THAI)
  // khi người đang tới lượt bấm "Từ chối" — không đụng gì tới TRANG_THAI của các trạng
  // thái cũ, chỉ thêm màu badge để hiện đúng trong renderBadgeBuoc/modal xem trước.
  TU_CHOI: 'bg-danger',
};

// ĐÃ THÊM — Ký điện tử Pha 2 (Bước 2): nhãn/màu cho YeuCauKy.TRANG_THAI ở cột "Trạng
// thái" tab Lịch sử — trước đây chỉ có 2 giá trị (HOAN_THANH / còn lại coi là "Đang ký"),
// giờ thêm BI_TU_CHOI/DA_HUY nên không thể suy luận nhị phân như cũ nữa.
const TRANG_THAI_YEU_CAU = {
  HOAN_THANH: { label: 'Hoàn tất', badge: 'bg-success' },
  BI_TU_CHOI: { label: 'Bị từ chối ký', badge: 'bg-danger' },
  DA_HUY: { label: 'Đã thu hồi', badge: 'bg-secondary' },
  DANG_KY: { label: 'Đang ký', badge: 'bg-warning text-dark' },
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
  // ĐÃ THÊM (Ký điện tử Pha 2 — Bước 7): cờ CẤP TÀI KHOẢN — true nếu người này có cấu hình
  // chữ ký số (CA_NHA_CUNG_CAP/CA_MA_THUE_BAO trên TaiKhoan, xem layDanhSachChoToiKy). CHỈ
  // khi true mới hỏi "ký bằng ảnh hay ký số" lúc bấm Ký (xacNhanKy bên dưới) — mặc định
  // false lúc đang tải/không có để KHÔNG hỏi gì cả, giữ nguyên hành vi cũ cho tài khoản
  // thường (tuyệt đại đa số).
  const coTheKyCA = data?.coTheKyCA ?? false;

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

  // ĐÃ THÊM (theo yêu cầu — xem trước hình ảnh chữ ký cá nhân ngay tại modal Xem
  // trước/Ký, để người ký biết chắc ảnh nào sẽ được đóng vào văn bản trước khi bấm Ký):
  // dùng lại đúng layChuKyCuaToi() đã có sẵn (HoSoCaNhanPage.jsx) — cùng queryKey
  // ['chuKyCuaToi'] để dùng chung cache nếu người dùng đã từng mở trang Hồ sơ cá nhân
  // trong phiên này, không gọi lại API thừa. Chỉ tải khi dòng đang mở THẬT SỰ cho ký
  // (coTheKy) — mở từ tab Lịch sử (chỉ xem) thì không cần thiết.
  const { data: chuKyCuaToi, isLoading: dangTaiChuKyPreview } = useQuery({
    queryKey: ['chuKyCuaToi'],
    queryFn: layChuKyCuaToi,
    enabled: !!dangXem?.coTheKy,
  });

  // ĐÃ THÊM (Ký điện tử Pha 2 — Bước 6, luồng PDF/pdf-lib): kyYeuCau giờ có thể trả về
  // { dangXuLy: true, hoanTat: false } thay vì kết quả ngay — việc đóng dấu PDF chạy NỀN
  // qua trigger (xem action kyYeuCau/Quanlysv.gs), có thể mất tới ~1 phút mới xong, KHÁC
  // hẳn luồng Docs/GBTT cũ (luôn xong ngay trong request). Hàm này TỰ LẶP gọi
  // kiemTraTrangThaiKy() mỗi 3 giây cho tới khi bước của người dùng không còn "DANG_XU_LY"
  // nữa (thành "DA_KY" = xong, hoặc quay lại "DEN_LUOT" = xử lý nền lỗi, xem ghiChu) — tối
  // đa ~2 phút (40 lần) rồi báo "đang xử lý lâu hơn dự kiến" thay vì treo mãi hộp loading.
  const doiTrangThaiKyPdfNen_ = async (maYeuCau, { toiDa = 40, cachQuang = 3000 } = {}) => {
    for (let lan = 0; lan < toiDa; lan++) {
      await new Promise((r) => setTimeout(r, cachQuang));
      const kq = await kiemTraTrangThaiKy(maYeuCau);
      if (kq.trangThaiBuoc !== 'DANG_XU_LY') return kq;
    }
    return null; // timeout — chưa rõ kết quả, để người dùng tự kiểm tra lại sau
  };

  const kyMutation = useMutation({
    mutationFn: kyYeuCau,
    onSuccess: async (ket, bienDaGui) => {
      setDangXem(null);
      // ĐÃ SỬA (Bước 6): TRƯỚC ĐÂY luôn invalidate query + báo "Đã ký thành công" NGAY —
      // đúng cho luồng Docs/GBTT (xong thật trong request) nhưng SAI cho luồng PDF/pdf-lib
      // mới (chỉ mới BẮT ĐẦU xử lý nền, invalidate ngay sẽ nạp lại danh sách với dữ liệu
      // CŨ — tab "Lịch sử" hiện lại "Đang ký"/nút "Thu hồi" dù thực ra đã ký xong phần
      // mình, gây hiểu nhầm "vào lịch sử không xem được" — xem hội thoại 2026-09-09). Giờ
      // tách 2 nhánh: dangXuLy=true thì hiện hộp "Đang xử lý...", TỰ CHỜ kết quả thật rồi
      // mới invalidate + báo kết quả CUỐI CÙNG; ngược lại (GBTT) giữ nguyên hành vi cũ.
      if (ket?.dangXuLy) {
        Swal.fire({
          icon: 'info',
          title: 'Đang xử lý chữ ký...',
          text: ket.thongBao || 'Có thể mất tới khoảng 1 phút, vui lòng đợi...',
          allowOutsideClick: false, allowEscapeKey: false, showConfirmButton: false,
          didOpen: () => Swal.showLoading(),
        });
        const ketQua = await doiTrangThaiKyPdfNen_(bienDaGui.maYeuCau);
        queryClient.invalidateQueries({ queryKey: ['choToiKy'] });
        queryClient.invalidateQueries({ queryKey: ['lichSuKy'] });
        if (!ketQua) {
          Swal.fire({ icon: 'warning', title: 'Đang xử lý lâu hơn dự kiến', text: 'Vào tab "Đã ký / Lịch sử" kiểm tra lại sau ít phút.' });
        } else if (ketQua.trangThaiBuoc === 'DA_KY') {
          Swal.fire({
            icon: 'success', title: 'Đã ký thành công',
            text: ketQua.hoanTat ? 'Văn bản đã đủ chữ ký và hoàn tất.' : 'Đang chờ người tiếp theo ký.',
          });
        } else {
          Swal.fire({ icon: 'error', title: 'Xử lý ký thất bại', text: ketQua.ghiChu || 'Đã tự đưa về trạng thái chờ ký lại — bấm "Ký" lại để thử lại.' });
        }
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['choToiKy'] });
      queryClient.invalidateQueries({ queryKey: ['lichSuKy'] });
      Swal.fire({
        icon: 'success',
        title: 'Đã ký thành công',
        text: ket?.hoanTat ? 'Văn bản đã đủ chữ ký và hoàn tất.' : 'Đang chờ người tiếp theo ký.',
      });
    },
    onError: (err) => Swal.fire({ icon: 'error', title: 'Lỗi khi ký', text: err.message }),
  });

  // ĐÃ THÊM — Ký điện tử Pha 2 (Bước 2): từ chối ký — cùng khuôn với kyMutation, chỉ khác
  // thông báo thành công vì đây là dừng chuỗi chứ không phải tiến tới bước kế tiếp.
  const tuChoiMutation = useMutation({
    mutationFn: tuChoiKy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['choToiKy'] });
      queryClient.invalidateQueries({ queryKey: ['lichSuKy'] });
      setDangXem(null);
      Swal.fire({ icon: 'success', title: 'Đã từ chối ký', text: 'Người tạo yêu cầu sẽ được thông báo qua email.' });
    },
    onError: (err) => Swal.fire({ icon: 'error', title: 'Lỗi khi từ chối ký', text: err.message }),
  });

  // ĐÃ THÊM — Ký điện tử Pha 2 (Bước 2): người TẠO thu hồi yêu cầu — dùng ở tab Lịch sử
  // (xem renderBadgeTrangThai/nút Huỷ bên dưới), không liên quan tới modal xem trước/ký.
  const huyMutation = useMutation({
    mutationFn: huyYeuCauKy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['choToiKy'] });
      queryClient.invalidateQueries({ queryKey: ['lichSuKy'] });
      Swal.fire({ icon: 'success', title: 'Đã thu hồi yêu cầu ký' });
    },
    onError: (err) => Swal.fire({ icon: 'error', title: 'Lỗi khi thu hồi', text: err.message }),
  });

  const moModal = (row, coTheKy) => setDangXem({ ...row, coTheKy });
  const dongModal = () => setDangXem(null);

  // ĐÃ SỬA (Ký điện tử Pha 2 — Bước 7): CHỈ khi tài khoản có cấu hình chữ ký số (coTheKyCA)
  // mới hỏi thêm 1 bước "ký bằng ảnh hay ký số" — chính người ký (chủ thuê bao CA) tự chọn
  // ngay lúc này, KHÔNG phải cấu hình cố định sẵn theo chức danh (xem lại thiết kế ban đầu ở
  // Quanlysv.gs — đã sửa vì 1 người có thể muốn ký ảnh cho văn bản này, ký số cho văn bản
  // khác). Tài khoản không có CA (đa số) thì hành vi giữ nguyên 100% — thẳng vào hộp xác
  // nhận ký ảnh như trước, không có bước hỏi thêm nào.
  const xacNhanKy = () => {
    if (!dangXem || !dangXem.coTheKy) return;
    if (coTheKyCA) {
      Swal.fire({
        icon: 'question',
        title: 'Chọn cách ký',
        input: 'radio',
        inputOptions: {
          ANH: 'Ký bằng ảnh chữ ký cá nhân (như thường)',
          CA: 'Ký bằng chữ ký số (CA) — cần xác nhận trên ứng dụng chữ ký số của bạn',
        },
        inputValidator: (v) => (!v ? 'Vui lòng chọn 1 cách ký' : undefined),
        showCancelButton: true, confirmButtonText: 'Tiếp tục', cancelButtonText: 'Huỷ',
      }).then((r) => {
        if (r.isConfirmed) xacNhanKyBuoc2_(r.value);
      });
      return;
    }
    xacNhanKyBuoc2_('ANH');
  };

  const xacNhanKyBuoc2_ = (phuongThucKy) => {
    if (phuongThucKy === 'CA') {
      Swal.fire({
        icon: 'question',
        title: 'Ký bằng chữ ký số?',
        html: 'Hệ thống sẽ gửi yêu cầu ký số tới thuê bao chữ ký số của bạn — cần xác nhận trên ứng dụng chữ ký số (VD: SmartCA) trước khi hoàn tất. Không thể sửa/thu hồi sau khi đã ký. Lưu ý: chữ ký số chỉ dùng được cho bước ký CUỐI CÙNG của văn bản.',
        showCancelButton: true, confirmButtonText: 'Gửi yêu cầu ký số', cancelButtonText: 'Huỷ', confirmButtonColor: '#198754',
      }).then((r) => {
        if (r.isConfirmed) kyMutation.mutate({ maYeuCau: dangXem.maYeuCau, phuongThucKy: 'CA' });
      });
      return;
    }
    // ĐÃ SỬA (theo yêu cầu — xem trước ảnh chữ ký ngay trong hộp xác nhận cuối cùng, ngay
    // trước lúc bấm Ký thật): đổi "text" thành "html", chèn thêm ảnh preview nếu đã tải
    // được (chuKyCuaToi.coChuKy) — không có thì vẫn hiện chữ như cũ, không chặn luồng ký
    // (nút Ký ngoài modal cũng đã tự khoá sẵn khi !coChuKy, xem disabled ở nút "Ký văn
    // bản này" phía dưới).
    Swal.fire({
      icon: 'question',
      title: 'Xác nhận ký văn bản này?',
      html: `Ảnh chữ ký cá nhân của bạn sẽ được đóng vào đúng vị trí chức danh, kèm ngày giờ ký — không thể sửa/thu hồi sau khi đã ký.` +
        (chuKyCuaToi?.coChuKy
          ? `<div class="mt-2 p-2 border rounded d-inline-block" style="background-image: repeating-conic-gradient(#e9ecef 0% 25%, #fff 0% 50%); background-size: 16px 16px;">
               <img src="data:${chuKyCuaToi.mimeType || 'image/png'};base64,${chuKyCuaToi.anhBase64}" style="max-width:200px;max-height:100px;display:block;" />
             </div>`
          : ''),
      showCancelButton: true, confirmButtonText: 'Ký ngay', cancelButtonText: 'Huỷ', confirmButtonColor: '#198754',
    }).then((r) => {
      if (r.isConfirmed) kyMutation.mutate({ maYeuCau: dangXem.maYeuCau, phuongThucKy: 'ANH' });
    });
  };

  // ĐÃ THÊM — Ký điện tử Pha 2 (Bước 2): xin lý do bằng Swal input (bắt buộc gõ, không
  // cho gửi rỗng — backend cũng chặn lại lần nữa nếu lỡ qua được, xem action tuChoiKy).
  const xacNhanTuChoi = () => {
    if (!dangXem || !dangXem.coTheKy) return;
    Swal.fire({
      icon: 'warning',
      title: 'Từ chối ký văn bản này?',
      html: 'Chuỗi ký sẽ dừng lại ngay, người tạo yêu cầu sẽ nhận email báo kèm lý do bạn nhập bên dưới.',
      input: 'textarea',
      inputPlaceholder: 'Nhập lý do từ chối ký...',
      inputValidator: (value) => (!value || !value.trim() ? 'Vui lòng nhập lý do' : undefined),
      showCancelButton: true, confirmButtonText: 'Từ chối ký', cancelButtonText: 'Huỷ thao tác', confirmButtonColor: '#dc3545',
    }).then((r) => {
      if (r.isConfirmed) tuChoiMutation.mutate({ maYeuCau: dangXem.maYeuCau, lyDo: r.value.trim() });
    });
  };

  // ĐÃ THÊM — Ký điện tử Pha 2 (Bước 2): thu hồi yêu cầu do mình tạo — dùng ở tab Lịch sử
  // (nút chỉ hiện khi row.laNguoiTao && row.trangThai === 'DANG_KY', xem JSX bên dưới).
  const xacNhanHuy = (row) => {
    Swal.fire({
      icon: 'warning',
      title: 'Thu hồi yêu cầu ký này?',
      text: `Văn bản "${row.tieuDe}" sẽ dừng lại ngay, người đang chờ ký (nếu có) sẽ được báo qua email.`,
      showCancelButton: true, confirmButtonText: 'Thu hồi', cancelButtonText: 'Không', confirmButtonColor: '#dc3545',
    }).then((r) => {
      if (r.isConfirmed) huyMutation.mutate({ maYeuCau: row.maYeuCau });
    });
  };

  // ĐÃ THÊM — Ký điện tử Pha 2 (Bước 3): nhãn nhỏ cạnh tên văn bản cho biết chế độ ký —
  // chỉ hiện khi SONG_SONG (TUAN_TU là mặc định/đa số, không cần nhắc lại mọi dòng).
  const renderBadgeCheDoKy = (cheDoKy) =>
    cheDoKy === 'SONG_SONG' ? <span className="badge bg-info text-dark ms-1">Song song</span> : null;

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
                      <td>{row.tieuDe}{renderBadgeCheDoKy(row.cheDoKy)}</td>
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
                      <td>{row.tieuDe}{renderBadgeCheDoKy(row.cheDoKy)}</td>
                      <td className="fw-bold">{row.hoTenSV}</td>
                      <td>{row.nganh}</td>
                      <td>{row.nguoiTaoTen}{row.laNguoiTao ? ' (bạn)' : ''}</td>
                      <td className="small text-muted">{row.thoiGianTao}</td>
                      <td>
                        {(() => {
                          const tt = TRANG_THAI_YEU_CAU[row.trangThai] || TRANG_THAI_YEU_CAU.DANG_KY;
                          return <span className={`badge ${tt.badge}`}>{tt.label}</span>;
                        })()}
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
                        {/* ĐÃ THÊM — Ký điện tử Pha 2 (Bước 2): chỉ người TẠO mới thấy nút Huỷ,
                            và chỉ khi yêu cầu còn đang chạy (DANG_KY) — đã hoàn tất/từ chối/huỷ
                            rồi thì ẩn, tránh gọi lại action vô ích (backend cũng đã tự chặn). */}
                        {row.laNguoiTao && row.trangThai === 'DANG_KY' && (
                          <button
                            className="btn btn-sm btn-outline-danger ms-1"
                            onClick={() => xacNhanHuy(row)}
                            disabled={huyMutation.isPending}
                          >
                            <i className="bi bi-x-circle me-1"></i>Thu hồi
                          </button>
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

                {/* ĐÃ THÊM (theo yêu cầu — hiển thị ảnh chữ ký cá nhân ngay tại đây, trước
                    khi bấm Ký, để đối chiếu chắc chắn đúng ảnh sẽ đóng vào văn bản): chỉ hiện
                    khi dòng này THẬT SỰ cho ký (coTheKy) — mở từ tab Lịch sử (chỉ xem) thì
                    không cần vì không có nút Ký để mà xem trước cho việc đó. */}
                {dangXem.coTheKy && !dangTaiChuKyPreview && (
                  chuKyCuaToi?.coChuKy ? (
                    <div className="alert alert-light border d-flex align-items-center gap-3 py-2 mb-3">
                      <div
                        className="p-1 border rounded bg-white flex-shrink-0"
                        style={{
                          backgroundImage: 'repeating-conic-gradient(#e9ecef 0% 25%, #fff 0% 50%)',
                          backgroundSize: '16px 16px',
                        }}
                      >
                        <img
                          src={`data:${chuKyCuaToi.mimeType || 'image/png'};base64,${chuKyCuaToi.anhBase64}`}
                          alt="Chữ ký cá nhân"
                          style={{ maxWidth: 140, maxHeight: 70, display: 'block' }}
                        />
                      </div>
                      <div className="small text-muted">
                        <i className="bi bi-info-circle me-1"></i>Đây là ảnh chữ ký cá nhân sẽ được đóng vào văn bản này khi bạn bấm "Ký văn bản này".
                      </div>
                    </div>
                  ) : (
                    <div className="alert alert-warning py-2 small mb-3">
                      <i className="bi bi-exclamation-triangle me-1"></i>Bạn chưa có chữ ký cá nhân — cần tải lên ở trang "Hồ sơ cá nhân" trước khi ký được văn bản này.
                    </div>
                  )
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

                {/* ĐÃ THÊM: tài liệu tham khảo/minh chứng đính kèm (nếu có) — KHÔNG phải file
                    để ký, chỉ để người ký xem thêm trước khi quyết định — xem taiLieuThamKhao
                    (taoYeuCauKyTuFile/xemTruocYeuCauKy, Quanlysv.gs). Không có gì thì không
                    hiện khối này, không đổi giao diện cho các yêu cầu cũ/không có file đính
                    kèm (mảng rỗng/undefined). */}
                {xemTruoc?.taiLieuThamKhao?.length > 0 && (
                  <div className="mt-3">
                    <div className="fw-bold small mb-1"><i className="bi bi-paperclip me-1"></i>Tài liệu tham khảo/minh chứng đính kèm:</div>
                    <ul className="small mb-0">
                      {xemTruoc.taiLieuThamKhao.map((tl, idx) => (
                        <li key={idx}><a href={tl.url} target="_blank" rel="noreferrer">{tl.tenFile}</a></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-outline-secondary" onClick={dongModal} disabled={kyMutation.isPending || tuChoiMutation.isPending}>
                  {dangXem.coTheKy ? 'Đóng (ký sau)' : 'Đóng'}
                </button>
                {dangXem.coTheKy && (
                  <>
                    {/* ĐÃ THÊM — Ký điện tử Pha 2 (Bước 2): cạnh nút Ký, không phụ thuộc coChuKy
                        (từ chối không cần có sẵn ảnh chữ ký cá nhân, khác nút Ký). */}
                    <button
                      className="btn btn-outline-danger fw-bold"
                      onClick={xacNhanTuChoi}
                      disabled={kyMutation.isPending || tuChoiMutation.isPending || dangTaiPreview}
                    >
                      <i className="bi bi-x-circle me-1"></i>{tuChoiMutation.isPending ? 'Đang gửi...' : 'Từ chối ký'}
                    </button>
                    <button
                      className="btn btn-success fw-bold"
                      onClick={xacNhanKy}
                      disabled={!coChuKy || kyMutation.isPending || tuChoiMutation.isPending || dangTaiPreview}
                      title={!coChuKy ? 'Cần tải chữ ký cá nhân trước (Hồ sơ cá nhân)' : ''}
                    >
                      <i className="bi bi-pen me-1"></i>{kyMutation.isPending ? 'Đang ký...' : 'Ký văn bản này'}
                    </button>
                  </>
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