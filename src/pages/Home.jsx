import React, { useState, useEffect } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import './Home.css';
// ĐÃ THÊM: ảnh nền thật cho từng thẻ (ông gửi 4 ảnh, đặt đúng theo thứ tự ông chỉ định)
import imgNhapHoc from '../assets/nhaphoc.jpg';
import imgNhapLieu from '../assets/nhaplieu.jpg';
import imgThamDinh from '../assets/thamdinh.jpg';
import imgThongKe from '../assets/thongke.jpg';
import imgCauHinh from '../assets/cauhinh.jpg';
// ĐÃ THÊM: 2 nguồn dữ liệu thật cho khối "Việc cần xử lý" + "Hoạt động gần đây" bên
// dưới lưới thẻ — dùng lại action đã có sẵn, không tạo action GAS mới.
import { laySoLuongChoToiKy, fetchSoLuongCanXacNhanDinhDanhCuaToi, fetchLogs, fetchDanhSachBaoThieu, fetchThongKeTrangThaiThamDinh, fetchHoatDong24h, fetchBangTinMoiNhat } from '../api/studentApi';

// DANH SÁCH THẺ CHỨC NĂNG — mỗi thẻ ứng với 1 route đã có sẵn trong App.jsx, cùng
// điều kiện phân quyền y hệt menu ngang (hasAnyRole) để Trang chủ không lộ ra
// chức năng mà tài khoản không được phép bấm vào.
// "gradient" vẫn giữ làm lớp phủ tối màu (scrim) đè lên ảnh để chữ trắng luôn đọc
// được dù ảnh sáng/tối khác nhau — không phải màu nền thuần nữa.
const CARDS = [
  {
    key: 'admissions',
    title: 'Thu hồ sơ nhập học',
    desc: 'Tiếp nhận trực tiếp và theo dõi hồ sơ sinh viên trúng tuyển.',
    icon: 'bi-people-fill',
    to: '/thu-ho-so-nhap-hoc',
    roles: ['CanBo'],
    image: imgNhapHoc,
    gradient: 'linear-gradient(135deg, #0d6efd 0%, #6610f2 100%)',
  },
  {
    key: 'xettuyen',
    title: 'Nhập liệu hồ sơ tuyển sinh',
    desc: 'Nhập thông tin hồ sơ thí sinh, tra cứu hồ sơ cũ.',
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
    title: 'Cài đặt',
    desc: 'Cài đặt chung.',
    icon: 'bi-gear-fill',
    to: '/settings',
    roles: ['Admin'],
    image: imgCauHinh,
    gradient: 'linear-gradient(135deg, #495057 0%, #212529 100%)',
  },
  {
    key: 'stats',
    title: 'Thống kê',
    desc: 'Xem lại số liệu theo thời gian.',
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
  const isThamDinhView = hasAnyRole(roles, ['ThamDinh', 'Admin']);
  const visibleCards = CARDS.filter(c => isAdmin || hasAnyRole(roles, c.roles));
  const displayName = currentUser?.name || currentUser?.username || '';

  // ĐÃ THÊM: khối "Việc cần xử lý" — CỐ Ý khác trang Thống kê (/user-stats, xem icon
  // tài khoản): trang đó là số liệu LỊCH SỬ/biểu đồ theo thời gian, còn khối này là
  // việc ĐANG CHỜ xử lý NGAY BÂY GIỜ, mang tính tác vụ chứ không phải báo cáo — nên
  // không trùng ý nghĩa dù cùng lấy dữ liệu dạng "số lượng".
  const [choKy, setChoKy] = useState(null); // null = đang tải/lỗi, số = đã có kết quả
  const [choXacNhan, setChoXacNhan] = useState(null);
  // ĐÃ THÊM: "Hồ sơ cần bổ sung" — theo yêu cầu hiện số lượng + tên + ngày yêu cầu
  // (không hiện nội dung cụ thể thiếu gì — dữ liệu đó chưa được lưu lại, xem
  // hdPost_baoThieu/Tuyensinh.gs). null = đang tải/lỗi, mảng = đã có kết quả.
  const [danhSachBoSung, setDanhSachBoSung] = useState(null);
  const [boSungSomNhatEpoch, setBoSungSomNhatEpoch] = useState(null);
  // ĐÃ THÊM (2026-09-16 — chẩn đoán bug "Việc cần xử lý" không lên dữ liệu): trước
  // đây lỗi fetch bị .catch(() => {}) NUỐT IM LẶNG — danhSachBoSung giữ nguyên null
  // mãi mãi, mà null lại bị coi là "rỗng" ở điều kiện render bên dưới -> lỗi thật
  // (401/500/network...) và "thật sự không có gì" nhìn Y HỆT NHAU trên UI, không
  // cách nào phân biệt được để debug. Giờ tách riêng 1 cờ lỗi — báo rõ lỗi tải thay
  // vì im lặng giả vờ "hết việc rồi".
  const [boSungError, setBoSungError] = useState(false);
  const [thongKeThamDinh, setThongKeThamDinh] = useState(null);
  const [thongKeError, setThongKeError] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    let daHuy = false;
    if (isThamDinhView) {
      fetchThongKeTrangThaiThamDinh()
        .then(d => { if (!daHuy) setThongKeThamDinh(d); })
        .catch(() => { if (!daHuy) { setThongKeError(true); setThongKeThamDinh({}); } });
      return () => { daHuy = true; };
    }
    laySoLuongChoToiKy().then(d => { if (!daHuy) setChoKy(d?.soLuong ?? 0); }).catch(() => {});
    fetchSoLuongCanXacNhanDinhDanhCuaToi().then(n => { if (!daHuy) setChoXacNhan(n); });
    fetchDanhSachBaoThieu()
      .then(d => { if (!daHuy) { setDanhSachBoSung(d?.danhSach || []); setBoSungSomNhatEpoch(d?.boSungSomNhatEpoch ?? null); } })
      .catch(err => {
        if (daHuy) return;
        console.error('[Home] fetchDanhSachBaoThieu lỗi:', err);
        setBoSungError(true);
        setDanhSachBoSung([]);
      });
    return () => { daHuy = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isThamDinhView]);

  // ĐÃ THÊM: "Hoạt động gần đây" — nhật ký của chính người đang đăng nhập, action
  // getLogs có sẵn. LƯU Ý: tên field bên dưới (thoiGian/noiDung...) là DỰ ĐOÁN, chưa
  // có mẫu response thật để đối chiếu — nếu hiện sai/trống, gửi 1 mẫu console.log để
  // sửa đúng tên field.
  const [activities, setActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [hoatDong24h, setHoatDong24h] = useState(null);
  // ĐÃ THÊM: "Tin tức mới nhất" (Bảng tin, trang mới "Quản lý văn bản") — chỉ hiện mục
  // "Tin tức" (không hiện "Văn bản hành chính") ở khối này, lấy 3 tin đầu tiên (đã sắp
  // mới nhất lên đầu ở backend, xem hdGet_layBangTinMoiNhat/VanBan.gs).
  const [tinTucMoi, setTinTucMoi] = useState([]);
  const [tinTucLoading, setTinTucLoading] = useState(true);
  useEffect(() => {
    if (!currentUser?.username) { setActivitiesLoading(false); return; }
    let daHuy = false;
    fetchLogs(currentUser.username)
      .then(list => { if (!daHuy) setActivities(Array.isArray(list) ? list : []); })
      .catch(() => {})
      .finally(() => { if (!daHuy) setActivitiesLoading(false); });
    fetchHoatDong24h().then(d => { if (!daHuy) setHoatDong24h(d); }).catch(() => {});
    fetchBangTinMoiNhat()
      .then(list => { if (!daHuy) setTinTucMoi((Array.isArray(list) ? list : []).filter(it => it.loai === 'Tin tức').slice(0, 3)); })
      .catch(() => {})
      .finally(() => { if (!daHuy) setTinTucLoading(false); });
    return () => { daHuy = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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


  return (
    <div className="home-wrapper">
      {/* ĐÃ SỬA (theo yêu cầu — bỏ ảnh nền, thay texture): trước đây là ảnh thật
          (imgHomeBg) + gradient fade phức tạp để làm trắng phần trên. Giờ không còn
          ảnh nào cả — .home-page-backdrop (Home.css) tự vẽ hoạ tiết caro chéo mờ mờ
          bằng CSS thuần (repeating-linear-gradient), không cần file ảnh, luôn sắc nét
          ở mọi zoom. Xem chú thích chi tiết + cách chỉnh độ đậm/khoảng cách tại
          Home.css. */}
      <div className="home-page-backdrop" aria-hidden="true"></div>

      <div className="home-welcome mb-4">
        <h3 className="fw-bold mb-1">Chào {displayName} </h3>
        <p className="text-muted mb-0">Chọn tác vụ của bạn.</p>
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
        <div className="alert alert-warning">Tài khoản của bạn chưa có chức năng nào.</div>
      )}

      {/* ĐÃ THÊM: khối overview bên dưới lưới thẻ — 2 cột trên màn rộng, xếp dọc trên
          di động. CỐ Ý không dùng số liệu thống kê/biểu đồ ở đây (đã có trang riêng),
          chỉ đưa ra việc ĐANG CHỜ xử lý + nhật ký hoạt động gần nhất — mang tính "hôm
          nay tôi cần làm gì", không phải "báo cáo tổng hợp". */}
      <div className="home-overview-grid mt-4">
        <div className="home-overview-panel">
          <h6 className="fw-bold mb-3">Việc cần xử lý</h6>
          {isThamDinhView ? (
            thongKeThamDinh === null ? (
              <div className="text-muted small">Đang tải...</div>
            ) : thongKeError ? (
              <div className="text-danger small">Không tải được thống kê — mở Console (F12) xem chi tiết lỗi.</div>
            ) : (
              <>
                <ul className="home-activity-list mb-0">
                  {['Mới bổ sung', 'Chưa thẩm định', 'Tái rà soát', 'Đã duyệt chưa bàn giao'].map(nhom => (
                    <li key={nhom} className="d-flex justify-content-between align-items-center">
                      <span className="home-activity-desc">{nhom}</span>
                      <span style={{ color: '#03258c', fontWeight: 700, fontSize: '15px' }}>{thongKeThamDinh[nhom] ?? 0}</span>
                    </li>
                  ))}
                </ul>
                {thongKeThamDinh.ctdSomNhatEpoch && (() => {
                  const deadline = thongKeThamDinh.ctdSomNhatEpoch + 6 * 3600 * 1000;
                  const conLai = deadline - nowTick;
                  if (conLai <= 0) {
                    return (
                      <div className="mt-2 pt-2 border-top text-danger small">
                        Đã quá 6 tiếng kể từ hồ sơ đầu tiên chưa thẩm định: {thongKeThamDinh.ctdSomNhatTen || '(chưa rõ tên)'}
                      </div>
                    );
                  }
                  const hh = String(Math.floor(conLai / 3600000)).padStart(2, '0');
                  const mm = String(Math.floor((conLai % 3600000) / 60000)).padStart(2, '0');
                  const ss = String(Math.floor((conLai % 60000) / 1000)).padStart(2, '0');
                  return (
                    <div className="mt-2 pt-2 border-top">
                      <span className="text-muted small">Deadline thẩm định hồ sơ đầu tiên: </span>
                      <span style={{ fontSize: '15px', fontWeight: 700 }}>{hh}:{mm}:{ss}</span>
                    </div>
                  );
                })()}
              </>
            )
          ) : choKy === null && choXacNhan === null && danhSachBoSung === null ? (
            <div className="text-muted small">Đang tải...</div>
          ) : boSungError ? (
            // ĐÃ THÊM: lỗi tải "Hồ sơ cần bổ sung" giờ hiện RÕ RÀNG thay vì lẫn vào câu
            // "đã xử lý hết rồi". Chi tiết lỗi thật nằm trong Console (F12), dòng
            // "[Home] fetchDanhSachBaoThieu lỗi:".
            <div className="text-danger small">
              Không tải được danh sách hồ sơ cần bổ sung — mở Console (F12) xem chi tiết lỗi.
            </div>
          ) : !choKy && !choXacNhan && (!danhSachBoSung || danhSachBoSung.length === 0) ? (
            <div className="text-muted small">Không có việc gì đang chờ — bạn đã xử lý hết rồi.</div>
          ) : (
            <div className="d-flex flex-column gap-2">
              {choKy > 0 && (
                <div
                  className="home-todo-item"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate('/ho-so-cho-ky')}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/ho-so-cho-ky'); } }}
                >
                  <svg width="16" height="16" viewBox="0 0 18 18" fill="none"><path d="M5 2H11L14 5V16H5V2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M7 10L8.5 11.5L11.5 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <span>Bạn có <strong>{choKy}</strong> hồ sơ đang chờ ký</span>
                </div>
              )}
              {choXacNhan > 0 && (
                <div
                  className="home-todo-item"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate('/xac-nhan-dinh-danh')}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/xac-nhan-dinh-danh'); } }}
                >
                  <svg width="16" height="16" viewBox="0 0 18 18" fill="none"><path d="M9 3L16 15H2L9 3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M9 7.5V10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><circle cx="9" cy="12.7" r="0.9" fill="currentColor" /></svg>
                  <span><strong>{choXacNhan}</strong> hồ sơ cần xác nhận định danh</span>
                </div>
              )}
              {/* ĐÃ THÊM: "Hồ sơ cần bổ sung" — theo yêu cầu hiện số lượng + tên + ngày yêu
                  cầu (không phải 1 dòng gộp như 2 mục trên, vì cần liệt kê TỪNG hồ sơ).
                  ngayBaoThieu có thể rỗng nếu sheet Trung Gian chưa thêm cột "NGÀY BÁO
                  THIẾU" — xem chú thích ở Tuyensinh.gs. */}
              {danhSachBoSung && danhSachBoSung.length > 0 && (
                <div className="home-bosung-box">
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <svg width="16" height="16" viewBox="0 0 18 18" fill="none"><path d="M5 2H11L14 5V16H5V2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M7 6H12M7 9H12M7 12H10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
                    <span><strong>{danhSachBoSung.length}</strong> hồ sơ cần bổ sung</span>
                  </div>
                  <ul className="home-bosung-list">
                    {danhSachBoSung.slice(0, 5).map((hs, idx) => (
                      <li key={idx}>
                        <span>{hs.hoTen || 'Chưa rõ tên'}</span>
                        <span className="home-bosung-date">{hs.ngayBaoThieu || 'không rõ ngày'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {boSungSomNhatEpoch && (() => {
                const trongQua = Math.max(0, nowTick - boSungSomNhatEpoch);
                const ngay = Math.floor(trongQua / 86400000);
                const conLaiTrongNgay = trongQua % 86400000;
                const hh = String(Math.floor(conLaiTrongNgay / 3600000)).padStart(2, '0');
                const mm = String(Math.floor((conLaiTrongNgay % 3600000) / 60000)).padStart(2, '0');
                const ss = String(Math.floor((conLaiTrongNgay % 60000) / 1000)).padStart(2, '0');
                const hienThi = ngay > 0 ? `${ngay} ngày, ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
                return (
                  <div className="mt-2 pt-2 border-top">
                    <span className="text-muted small">Thời gian kể từ lúc nhận yêu cầu bổ sung đầu tiên: </span>
                    <span style={{ fontSize: '17px', fontWeight: 700 }}>{hienThi}</span>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        <div className="home-overview-panel">
          <h6 className="fw-bold mb-3">Hoạt động gần đây</h6>
          {hoatDong24h && (hoatDong24h.soUp > 0 || hoatDong24h.soCapNhat > 0) && (
            <ul className="small mb-2 ps-3">
              {hoatDong24h.soUp > 0 && <li>Bạn mới tải lên hệ thống <strong>{hoatDong24h.soUp}</strong> hồ sơ.</li>}
              {hoatDong24h.soCapNhat > 0 && <li>Bạn mới bổ sung <strong>{hoatDong24h.soCapNhat}</strong> hồ sơ.</li>}
            </ul>
          )}
          {activitiesLoading ? (
            <div className="text-muted small">Đang tải...</div>
          ) : activities.length === 0 ? (
            <div className="text-center py-2" style={{ fontSize: '28px' }}>🌸</div>
          ) : (
            <ul className="home-activity-list">
              {activities.slice(0, 5).map((log, idx) => (
                <li key={idx}>
                  <span className="home-activity-time">{log.thoiGian || log.time || log.timestamp || ''}</span>
                  <span className="home-activity-desc">{log.noiDung || log.hanhDong || log.action || log.description || 'Hoạt động'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="home-overview-panel">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h6 className="fw-bold mb-0">Tin tức mới nhất</h6>
            <NavLink to="/quan-ly-van-ban" className="small text-decoration-none">Xem tất cả →</NavLink>
          </div>
          {tinTucLoading ? (
            <div className="text-muted small">Đang tải...</div>
          ) : tinTucMoi.length === 0 ? (
            <div className="text-center py-2" style={{ fontSize: '28px' }}>🌸</div>
          ) : (
            <ul className="home-activity-list mb-0">
              {tinTucMoi.map((tt, idx) => (
                <li key={idx}>
                  <span className="home-activity-time">{tt.ngayDang || ''}</span>
                  <span className="home-activity-desc">{tt.tieuDe || '(Chưa có tiêu đề)'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default Home;