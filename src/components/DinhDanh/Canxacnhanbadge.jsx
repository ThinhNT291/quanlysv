import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchSoLuongCanXacNhanDinhDanhCuaToi, fetchSoLuongCapNghiTrungDinhDanh, baoAdminDinhDanh } from '../../api/studentApi';

// ĐÃ THÊM (PHA 1·D1 — "Hàng đợi xác nhận định danh"): bong bóng thông báo nhỏ, gắn vào
// đầu các trang có chức năng NHẬP LIỆU tạo/sửa hồ sơ (Thu hồ sơ / Xét tuyển / Thẩm định).
// Cột "chờ xác nhận" CHỈ hiện số lượng hồ sơ do CHÍNH tài khoản đang đăng nhập đã nhập/sửa
// mà hệ thống chưa chắc chắn được đây là người mới hay người đã có sẵn (xem
// dinhDanhGanTuDongChoHoSoMoi_/dinhDanhDongBoKhiSuaHoSo_ trong DinhDanh.gs).
//
// ĐÃ THÊM (đợt sau): kèm thêm cột "cần gộp" — số NHÓM hồ sơ định danh ĐÃ TỒN TẠI SẴN đang
// nghi trùng nhau (xem _dinhDanhNhomNghiTrungHienCo_ trong DinhDanh.gs) — số này KHÔNG
// thuộc riêng tài khoản nào (không có khái niệm "của tôi"), hiện chung cho mọi tài khoản có
// quyền nhập liệu để biết hệ thống đang có việc cần Admin/ThamDinh xử lý.
//
// KHÔNG hiện gì nếu cả 2 số đều = 0, không làm rối giao diện những lúc không có gì cần chú ý.
//
// Việc XỬ LÝ (xác nhận/gộp hồ sơ) chỉ Admin/ThamDinh làm được (trang "/xac-nhan-dinh-danh")
// — tài khoản nhập liệu thường (CanBo/TuyenSinh) không có quyền tự xử lý, nên bấm vào bong
// bóng chỉ mở popup xem số liệu + nút "Báo Admin" (đẩy tin nhắn qua Google Chat webhook),
// KHÔNG điều hướng.
const CanXacNhanBadge = () => {
  const navigate = useNavigate();
  const [soLuong, setSoLuong] = useState(0);       // của riêng tài khoản đang đăng nhập
  const [soLuongGop, setSoLuongGop] = useState(0);  // chung toàn hệ thống
  const [coQuyenXuLy, setCoQuyenXuLy] = useState(false); // Admin hoặc ThamDinh

  useEffect(() => {
    try {
      const saved = localStorage.getItem('tuyensinh_user');
      const user = saved ? JSON.parse(saved) : null;
      const roles = Array.isArray(user?.roles) ? user.roles.map(r => String(r).toLowerCase()) : [];
      setCoQuyenXuLy(roles.includes('admin') || roles.includes('thamdinh'));
    } catch (e) { /* không đọc được -> coi như không có quyền xử lý, an toàn */ }

    let huy = false;
    const napLai = () => {
      fetchSoLuongCanXacNhanDinhDanhCuaToi().then(n => { if (!huy) setSoLuong(n); });
      fetchSoLuongCapNghiTrungDinhDanh().then(n => { if (!huy) setSoLuongGop(n); });
    };
    napLai();
    const timer = setInterval(napLai, 60000); // làm mới mỗi 60s, không cần realtime tuyệt đối
    return () => { huy = true; clearInterval(timer); };
  }, []);

  if (!soLuong && !soLuongGop) return null;

  const handleClick = () => {
    if (coQuyenXuLy) {
      navigate('/xac-nhan-dinh-danh');
    } else {
      moPopupThongBao(soLuong, soLuongGop);
    }
  };

  const phanNhan = [];
  if (soLuong > 0) phanNhan.push(`${soLuong} chờ xác nhận`);
  if (soLuongGop > 0) phanNhan.push(`${soLuongGop} cần gộp`);

  return (
    <button
      type="button"
      className="btn btn-sm btn-warning fw-bold shadow-sm d-inline-flex align-items-center"
      onClick={handleClick}
      title={coQuyenXuLy
        ? 'Bấm để mở Hàng đợi xác nhận định danh'
        : 'Cần Admin/ThẩmĐịnh xác nhận hoặc gộp hồ sơ định danh — bấm để xem chi tiết và báo.'}
    >
      <i className="bi bi-person-fill-exclamation me-2"></i>
      {phanNhan.join(' · ')}
    </button>
  );
};

// Tách riêng để tránh phải import Swal ở mọi nơi dùng component này khi không cần (chỉ tài
// khoản không có quyền xử lý mới bấm tới nhánh này) — import động (lazy) cho gọn.
function moPopupThongBao(soLuong, soLuongGop) {
  import('sweetalert2').then(({ default: Swal }) => {
    const dong = [];
    if (soLuong > 0) dong.push(`<li><b>${soLuong}</b> hồ sơ bạn nhập/sửa mà hệ thống chưa chắc chắn là người mới hay đã có sẵn.</li>`);
    if (soLuongGop > 0) dong.push(`<li><b>${soLuongGop}</b> cặp hồ sơ định danh đã có sẵn trong hệ thống, đang nghi là trùng nhau, cần gộp.</li>`);

    Swal.fire({
      icon: 'info',
      title: 'Cần Admin/Thẩm định xử lý định danh',
      html: `<ul class="text-start small mb-0">${dong.join('')}</ul>`,
      showCancelButton: true,
      confirmButtonText: '<i class="bi bi-send"></i> Báo Admin ngay',
      cancelButtonText: 'Để sau',
      confirmButtonColor: '#0d6efd',
    }).then(r => {
      if (!r.isConfirmed) return;
      baoAdminDinhDanh({ soCanXacNhan: soLuong, soCanGop: soLuongGop })
        .then(() => Swal.fire({ icon: 'success', title: 'Đã báo Admin', timer: 1400, showConfirmButton: false }))
        .catch(err => Swal.fire('Không gửi được', err.message, 'error'));
    });
  });
}

export default CanXacNhanBadge;