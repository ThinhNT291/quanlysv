import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchSoLuongCanXacNhanDinhDanhCuaToi } from '../../api/studentApi';

// ĐÃ THÊM (PHA 1·D1 — "Hàng đợi xác nhận định danh"): bong bóng thông báo nhỏ, gắn vào
// đầu các trang có chức năng NHẬP LIỆU tạo/sửa hồ sơ (Thu hồ sơ / Xét tuyển / Thẩm định).
// CHỈ hiện số lượng hồ sơ do CHÍNH tài khoản đang đăng nhập đã nhập/sửa mà hệ thống chưa
// chắc chắn được đây là người mới hay người đã có sẵn (xem dinhDanhGanTuDongChoHoSoMoi_/
// dinhDanhDongBoKhiSuaHoSo_ trong DinhDanh.gs) — KHÔNG hiện gì nếu số lượng = 0, không làm
// rối giao diện những lúc không có gì cần chú ý.
//
// Việc XỬ LÝ (gộp/tách hồ sơ) chỉ Admin làm được (trang "/xac-nhan-dinh-danh") — tài khoản
// nhập liệu thường không có quyền tự xử lý, nên bấm vào bong bóng chỉ đưa ra gợi ý liên hệ
// Admin, KHÔNG điều hướng, trừ khi chính người bấm cũng có quyền Admin.
const CanXacNhanBadge = () => {
  const navigate = useNavigate();
  const [soLuong, setSoLuong] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('tuyensinh_user');
      const user = saved ? JSON.parse(saved) : null;
      const roles = Array.isArray(user?.roles) ? user.roles.map(r => String(r).toLowerCase()) : [];
      setIsAdmin(roles.includes('admin'));
    } catch (e) { /* không đọc được -> coi như không phải Admin, an toàn */ }

    let huy = false;
    const napLai = () => {
      fetchSoLuongCanXacNhanDinhDanhCuaToi().then(n => { if (!huy) setSoLuong(n); });
    };
    napLai();
    const timer = setInterval(napLai, 60000); // làm mới mỗi 60s, không cần realtime tuyệt đối
    return () => { huy = true; clearInterval(timer); };
  }, []);

  if (!soLuong) return null;

  const handleClick = () => {
    if (isAdmin) {
      navigate('/xac-nhan-dinh-danh');
    } else {
      Swal_ThongBao(soLuong);
    }
  };

  return (
    <button
      type="button"
      className="btn btn-sm btn-warning fw-bold shadow-sm d-inline-flex align-items-center"
      onClick={handleClick}
      title={isAdmin
        ? 'Bấm để mở Hàng đợi xác nhận định danh'
        : 'Các hồ sơ này cần Admin xác nhận có phải trùng với hồ sơ đã có hay không — hãy báo Admin xử lý.'}
    >
      <i className="bi bi-person-fill-exclamation me-2"></i>
      {soLuong} hồ sơ chờ xác nhận định danh
    </button>
  );
};

// Tách riêng để tránh phải import Swal ở mọi nơi dùng component này khi không cần (chỉ tài
// khoản không phải Admin mới bấm tới nhánh này) — import động (lazy) cho gọn.
function Swal_ThongBao(soLuong) {
  import('sweetalert2').then(({ default: Swal }) => {
    Swal.fire({
      icon: 'info',
      title: 'Chờ Admin xác nhận',
      html: `Có <b>${soLuong}</b> hồ sơ bạn nhập/sửa mà hệ thống chưa chắc chắn là người mới hay đã có sẵn trong dữ liệu.<br/>Vui lòng báo Admin vào mục "Hàng đợi xác nhận định danh" để xử lý.`,
    });
  });
}

export default CanXacNhanBadge;