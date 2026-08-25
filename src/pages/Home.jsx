import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';
// ĐÃ THÊM: ảnh nền thật cho từng thẻ (ông gửi 4 ảnh, đặt đúng theo thứ tự ông chỉ định)
import imgNhapHoc from '../assets/nhaphoc.jpg';
import imgNhapLieu from '../assets/nhaplieu.jpg';
import imgThamDinh from '../assets/thamdinh.jpg';
import imgThongKe from '../assets/thongke.jpg';
import imgCauHinh from '../assets/cauhinh.jpg';
// ĐÃ THÊM: ảnh nền (banner) phía trên cùng trang chủ. File đang là ảnh placeholder
// (gradient teal) do tui tạm tạo để code không lỗi — ông chỉ cần THAY THẾ đúng file
// này (giữ nguyên tên home-bg.jpg, nằm trong src/assets/) bằng ảnh ông chọn là xong,
// không cần sửa code gì thêm. Ảnh nên nằm ngang (khổ rộng, VD 1600x500 hoặc tỉ lệ gần
// giống) vì banner chỉ cao ~ khoảng 300px nhưng chạy hết chiều ngang trang.
import imgHomeBg from '../assets/home-bg.jpg';

// DANH SÁCH THẺ CHỨC NĂNG — mỗi thẻ ứng với 1 route đã có sẵn trong App.jsx, cùng
// điều kiện phân quyền y hệt menu ngang (hasAnyRole) để Trang chủ không lộ ra
// chức năng mà tài khoản không được phép bấm vào.
// "gradient" vẫn giữ làm lớp phủ tối màu (scrim) đè lên ảnh để chữ trắng luôn đọc
// được dù ảnh sáng/tối khác nhau — không phải màu nền thuần nữa.
const CARDS = [
  {
    key: 'admissions',
    title: 'Quản lý hồ sơ nhập học',
    desc: 'Tiếp nhận, chỉnh sửa và theo dõi hồ sơ sinh viên trúng tuyển.',
    icon: 'bi-people-fill',
    to: '/thu-ho-so-nhap-hoc',
    roles: ['CanBo'],
    image: imgNhapHoc,
    gradient: 'linear-gradient(135deg, #0d6efd 0%, #6610f2 100%)',
  },
  {
    key: 'xettuyen',
    title: 'Nhập liệu Xét tuyển',
    desc: 'Đẩy hồ sơ ứng viên, tra cứu hồ sơ cũ, quét CCCD nhanh.',
    icon: 'bi-card-checklist',
    to: '/xet-tuyen',
    roles: ['TuyenSinh', 'ThamDinh'],
    image: imgNhapLieu,
    gradient: 'linear-gradient(135deg, #008080 0%, #20c997 100%)',
  },
  {
    key: 'thamdinh',
    title: 'Ban Thẩm định',
    desc: 'Rà soát hồ sơ, chấm điểm, xét duyệt trúng tuyển.',
    icon: 'bi-clipboard-check',
    to: '/tham-dinh',
    roles: ['ThamDinh'],
    image: imgThamDinh,
    gradient: 'linear-gradient(135deg, #037683 0%, #0dcaf0 100%)',
  },
  {
    key: 'settings',
    title: 'Cấu hình hệ thống',
    desc: 'Quản lý danh mục ngành, tài khoản, thiết lập chung.',
    icon: 'bi-gear-fill',
    to: '/settings',
    roles: ['Admin'],
    image: imgCauHinh,
    gradient: 'linear-gradient(135deg, #495057 0%, #212529 100%)',
  },
  {
    key: 'stats',
    title: 'Thống kê cá nhân',
    desc: 'Xem lại số liệu thao tác của riêng bạn trên hệ thống.',
    icon: 'bi-graph-up-arrow',
    to: '/user-stats',
    roles: [], // ai đã đăng nhập cũng vào được
    image: imgThongKe,
    gradient: 'linear-gradient(135deg, #fd7e14 0%, #ffc107 100%)',
  },
];

const hasAnyRole = (userRoles, allowedRoles) => {
  if (!allowedRoles || allowedRoles.length === 0) return true;
  if (!Array.isArray(userRoles)) return false;
  const allowedLower = allowedRoles.map(r => r.toLowerCase());
  return userRoles.some(r => allowedLower.includes(String(r).toLowerCase()));
};

const Home = ({ currentUser }) => {
  const navigate = useNavigate();
  const roles = currentUser?.roles || [];
  const isAdmin = hasAnyRole(roles, ['Admin']);
  const visibleCards = CARDS.filter(c => isAdmin || hasAnyRole(roles, c.roles));
  const displayName = currentUser?.name || currentUser?.username || '';

  // Hiệu ứng bấm kiểu "chọn đáp án trắc nghiệm": thẻ được bấm sáng/nhún lên trước,
  // rồi mới điều hướng sang trang tương ứng — thay vì chuyển trang ngay lập tức.
  const [selectedKey, setSelectedKey] = useState(null);

  const handleCardClick = (card) => {
    if (selectedKey) return; // chặn bấm dồn dập khi đang chuyển trang
    setSelectedKey(card.key);
    setTimeout(() => navigate(card.to), 180);
  };

  const handleKeyDown = (e, card) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardClick(card);
    }
  };

  // Lớp phủ tối (scrim) đè lên ảnh nền thật để chữ trắng luôn đọc được, bất kể ảnh
  // sáng hay tối — đậm dần xuống phía dưới, đúng chỗ đặt tiêu đề/mô tả.
  const PHOTO_SCRIM = 'linear-gradient(180deg, rgba(15,23,42,0.30) 0%, rgba(15,23,42,0.50) 45%, rgba(15,23,42,0.82) 100%)';

  // ĐÃ SỬA (lần 4): trước đây tính chiều cao/vị trí banner bằng cách ƯỚC LƯỢNG
  // px của Header+Navbar (min-height: calc(100vh - 170px)) rồi kéo dư 4 phía —
  // vừa không chính xác (hụt/dư tuỳ máy) vừa gây thanh cuộn thừa khi kéo dư v ượt
  // khỏi khung .home-wrapper thật. Giờ đổi cách hoàn toàn: banner dùng position:
  // fixed, LUÔN đúng bằng khung nhìn (viewport) thật — không cần đo/đoán px của
  // Header/Navbar nữa, không bao giờ lệch, cũng không tạo thanh cuộn (phần tử
  // fixed không tính vào chiều cao cuộn trang). Ảnh nằm dưới cùng (z-index âm),
  // phần trùng lên Header/Navbar không thấy được vì 2 khối đó có nền đặc (trắng/
  // xanh) vẽ đè lên trên — nên nhìn NHƯ THỂ ảnh chỉ nằm trong khoảng trống giữa
  // topbar và cạnh dưới màn hình, đúng ý ông. Điểm dừng gradient (đọc từ 0% =
  // đỉnh màn hình, kể cả phần bị Header/Navbar che, xuống 100% = đáy màn hình):
  //   - 0% -> 20%: trắng gần như tuyệt đối — vùng này phần lớn bị Header/Navbar
  //     che khuất rồi nên không cần lo, chỉ cần đủ trắng cho đoạn vừa lộ ra ngay
  //     dưới Navbar (chỗ đặt câu chào).
  //   - 20% -> 48%: trắng tinh 100% — phủ kín khu vực câu chào + lưới thẻ.
  //   - 65% -> 100%: giảm dần độ trắng, tới đáy màn hình thì trong suốt hẳn
  //     (ảnh hiện rõ nét 100%).
  const HOME_BG_FADE = 'linear-gradient(180deg, rgba(255,255,255,0.85) 0%, #ffffff 20%, #ffffff 48%, rgba(255,255,255,0.5) 65%, rgba(255,255,255,0.12) 85%, rgba(255,255,255,0) 100%)';

  return (
    <div className="home-wrapper">
      {/* ĐÃ THÊM: ảnh nền thật — position: fixed nên tự động khớp CHÍNH XÁC khung
          nhìn trình duyệt (xem giải thích chi tiết ở HOME_BG_FADE bên trên), nằm
          SAU câu chào + lưới thẻ (z-index âm) nên không chặn click/che chữ. */}
      <div
        className="home-page-backdrop"
        style={{ backgroundImage: `${HOME_BG_FADE}, url(${imgHomeBg})` }}
        aria-hidden="true"
      ></div>

      <div className="home-welcome mb-4">
        <h3 className="fw-bold mb-1">Chào {displayName} 👋</h3>
        <p className="text-muted mb-0">Chọn một chức năng bên dưới để bắt đầu làm việc.</p>
      </div>

      <div className="home-card-grid">
        {visibleCards.map(card => (
          <div
            key={card.key}
            className={`home-card ${card.image ? 'has-photo' : ''} ${selectedKey === card.key ? 'is-selected' : ''}`}
            style={{ backgroundImage: card.image ? `${PHOTO_SCRIM}, url(${card.image})` : card.gradient }}
            role="button"
            tabIndex={0}
            onClick={() => handleCardClick(card)}
            onKeyDown={(e) => handleKeyDown(e, card)}
          >
            {/* Icon nền lớn mờ mờ chỉ dùng cho thẻ CHƯA có ảnh thật (vd Thống kê cá
                nhân) — thẻ đã có ảnh thì để ảnh tự làm nền, không chồng icon to lên. */}
            {!card.image && <i className={`bi ${card.icon} home-card-icon-bg`}></i>}
            <div className="home-card-body">
              <h5 className="home-card-title">{card.title}</h5>
              <p className="home-card-desc">{card.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {visibleCards.length === 0 && (
        <div className="alert alert-warning">Tài khoản của bạn chưa được phân quyền sử dụng chức năng nào.</div>
      )}
    </div>
  );
};

export default Home;