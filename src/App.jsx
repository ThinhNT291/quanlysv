import React, { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query'; // ĐÃ THÊM (Ký điện tử Pha 1 — Bước 4): badge số lượng "Hồ sơ chờ ký"
import Swal from 'sweetalert2';
import { sendFeedback, laySoLuongChoToiKy, fetchSoLuongCanXacNhanDinhDanhCuaToi, fetchDanhSachChoToiKy } from './api/studentApi';
import './App.css';
import logoPhuXuan from './assets/logo-phuxuan.png'; // ĐÃ THÊM: logo trường, đặt góc trên-trái navbar
import Home from './pages/Home'; // ĐÃ THÊM: trang chủ dạng thẻ chức năng sau đăng nhập
import AdmissionsPage from './pages/Admissions/AdmissionsPage';
import SettingsPage from './pages/Settings/SettingsPage';
import LoginPage from './pages/Auth/LoginPage';
import UserStatsPage from './pages/Settings/UserStatsPage';
import XetTuyenPage from './pages/XetTuyen/XetTuyenPage';
import ThamDinhPage from './pages/ThamDinh/ThamDinhPage'; // ĐÃ THÊM (Pha 2 roadmap)
import XacNhanDinhDanhPage from './pages/DinhDanh/XacNhanDinhDanhPage'; // ĐÃ THÊM (Pha 1·D1 — bước 4)
import KhoSinhVienPage from './pages/KhoSinhVien/KhoSinhVienPage'; // ĐÃ THÊM: "Kho tra cứu sinh viên" — gộp Trung Gian + KETQUA + Đào tạo
import ChiTietHoSoKhoPage from './pages/KhoSinhVien/ChiTietHoSoKhoPage'; // ĐÃ THÊM: trang chi tiết 1 hồ sơ trong Kho
import HoSoCaNhanPage from './pages/HoSoCaNhan/HoSoCaNhanPage'; // ĐÃ THÊM (Ký điện tử Pha 1 — Bước 2): thay placeholder "đang xây dựng" cũ
import ChoKyPage from './pages/KySo/ChoKyPage'; // ĐÃ THÊM (Ký điện tử Pha 1 — Bước 4): trang "Hồ sơ chờ ký"
import TaoYeuCauKySoPage from './pages/KySo/TaoYeuCauKySoPage'; // ĐÃ THÊM (Ký điện tử Pha 2 — Bước 6): trang "Tạo yêu cầu ký số" (route /ho-so-ky-so)

// ĐÃ THÊM: helper so quyền không phân biệt hoa/thường, hỗ trợ 1 tài khoản có
// nhiều role cùng lúc (userRoles là mảng, khớp với "roles" mảng backend trả về ở
// action verifyToken/login) — thay cho so trực tiếp 1 chuỗi như bản cũ.
const hasAnyRole = (userRoles, allowedRoles) => {
  if (!Array.isArray(userRoles)) return false;
  const allowedLower = allowedRoles.map(r => r.toLowerCase());
  return userRoles.some(r => allowedLower.includes(String(r).toLowerCase()));
};

// TRẠM KIỂM SOÁT PHÂN QUYỀN
const ProtectedRoute = ({ userRoles, allowedRoles, children }) => {
  // Nếu 1 trong các Role của user nằm trong danh sách được phép -> Cho qua
  if (hasAnyRole(userRoles, allowedRoles) || hasAnyRole(userRoles, ['Admin'])) {
    return children;
  }
  // Nếu không -> Hiện màn hình Khóa
  return (
    <div className="d-flex flex-column align-items-center justify-content-center mt-5 pt-5 text-center">
      <h1 className="text-danger"><svg width="64" height="64" viewBox="0 0 18 18" fill="none"><path d="M9 2L15 4V8.5C15 12 12.5 14.5 9 16C5.5 14.5 3 12 3 8.5V4L9 2Z" stroke="currentColor" strokeWidth="1.3" /><rect x="6.5" y="8" width="5" height="4" rx="0.8" stroke="currentColor" strokeWidth="1.2" /><path d="M7.3 8V6.8C7.3 5.8 8 5 9 5C10 5 10.7 5.8 10.7 6.8V8" stroke="currentColor" strokeWidth="1.2" /></svg></h1>
      <h3 className="text-muted mt-3 fw-bold">KHÔNG CÓ QUYỀN TRUY CẬP</h3>
      <p className="text-secondary">Tài khoản của bạn không có quyền sử dụng chức năng này.</p>
    </div>
  );
};

// ĐÃ THÊM: đảm bảo luôn có "roles" (mảng) dù backend cũ chưa trả về, hoặc phiên
// đăng nhập cũ còn lưu trong localStorage từ trước khi có trường này — tránh
// user cũ bị văng ra màn hình "KHÔNG CÓ QUYỀN" oan sau khi cập nhật code.
const normalizeUserInfo = (userInfo) => {
  if (!userInfo) return userInfo;
  if (Array.isArray(userInfo.roles) && userInfo.roles.length > 0) return userInfo;
  const roles = String(userInfo.role || "").split(",").map(r => r.trim().toLowerCase()).filter(Boolean);
  return { ...userInfo, roles };
};

const App = () => {
  // ĐÃ SỬA (2026-09-15 — chuyển menu ngang navbar-dark sang sidebar trái sáng màu):
  // trước đây "isNavCollapsed" điều khiển ẩn/hiện khối navbar-collapse (menu ☰ đổ
  // xuống dưới navbar trên di động). Giờ thay bằng "isSidebarOpen" — điều khiển
  // ẩn/hiện SIDEBAR TRÁI, dùng chung cho cả desktop lẫn di động (nút 3 gạch trên
  // topbar bấm vào đổi state này). Mặc định: desktop mở sẵn (isSidebarOpen=true),
  // di động ẩn sẵn (xem cách khởi tạo dưới, dùng matchMedia y hệt isMobileNav đã có
  // sẵn) — bấm nút 3 gạch trên di động sẽ mở sidebar dạng overlay đè lên nội dung
  // (xem phần render), không đẩy nội dung sang bên.
  // ĐÃ SỬA: giá trị khởi tạo giờ tính LUÔN cả route ban đầu (không chỉ desktop/mobile
  // như trước) — khớp với effect đặt lại theo route ngay bên dưới (currentHashPath),
  // tránh nháy sai 1 khung hình lúc mới tải trang trước khi effect kịp chạy.
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    const isDesktop = !window.matchMedia('(max-width: 991.98px)').matches;
    const isHome = (window.location.hash.replace(/^#/, '') || '/') === '/';
    return isDesktop && isHome;
  });

  // State quản lý Đóng/Mở menu tài khoản
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const userDropdownRef = useRef(null);

  // ĐÃ THÊM: state + ref cho bảng thông báo (chuông) trên topbar mới — cùng kiểu
  // click-ra-ngoài/Esc-để-đóng như menu tài khoản bên trên (xem effect riêng bên dưới).
  const [isNotiOpen, setIsNotiOpen] = useState(false);
  const notiRef = useRef(null);

  // ĐÃ THÊM (theo phản hồi — mục "Xuất Excel" trong menu tài khoản, CHỈ hiện khi đang ở
  // trang Thẩm định): App.jsx là component TẠO RA <HashRouter>, nên bản thân nó không nằm
  // "bên trong" Router lúc hook chạy -> không gọi useLocation() được ở đây (sẽ báo lỗi
  // "useLocation() may be used only in the context of a <Router>"). Dùng thẳng
  // window.location.hash (HashRouter) + lắng nghe sự kiện "hashchange" của trình duyệt để
  // tự cập nhật mỗi khi chuyển trang — không cần tách thêm component con.
  const [currentHashPath, setCurrentHashPath] = useState(() => window.location.hash.replace(/^#/, '') || '/');
  useEffect(() => {
    const onHashChange = () => setCurrentHashPath(window.location.hash.replace(/^#/, '') || '/');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  const isThamDinhPage = currentHashPath.startsWith('/tham-dinh');

  // ĐÃ THÊM: tự đóng dropdown tài khoản khi bấm ra ngoài hoặc nhấn Esc.
  useEffect(() => {
    if (!isUserDropdownOpen) return;
    const handleClickOutside = (e) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target)) {
        setIsUserDropdownOpen(false);
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') setIsUserDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isUserDropdownOpen]);

  // ĐÃ THÊM: tự đóng bảng thông báo khi bấm ra ngoài hoặc nhấn Esc — giống hệt cơ chế
  // của menu tài khoản ở effect ngay trên, tách riêng vì 2 khối đóng/mở độc lập nhau.
  useEffect(() => {
    if (!isNotiOpen) return;
    const handleClickOutside = (e) => {
      if (notiRef.current && !notiRef.current.contains(e.target)) {
        setIsNotiOpen(false);
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') setIsNotiOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isNotiOpen]);

  // ĐÃ THÊM: gom menu chính thành 3 nhóm xổ xuống (Tuyển sinh / Thẩm định / Hệ thống) cho
  // hàng menu đỡ dài.
  // ĐÃ SỬA (theo phản hồi — mobile KHÔNG được tự đóng nhóm khác khi mở 1 nhóm mới, desktop
  // giữ nguyên kiểu cũ): trước đây openGroup là 1 CHUỖI (chỉ giữ được đúng 1 tên nhóm đang mở
  // cùng lúc) -> mở nhóm này tự đóng nhóm kia, kể cả trên di động. Đổi thành openGroups (object
  // cờ bật/tắt ĐỘC LẬP từng nhóm) để trên di động có thể mở đồng thời nhiều nhóm, mỗi nhóm chỉ
  // đóng lại khi bấm ĐÚNG vào nhóm cha đang mở đó — không đụng các nhóm khác. Desktop
  // (>=992px) vẫn giữ hành vi cũ (mở nhóm mới tự đóng nhóm đang mở) vì đó là kiểu dropdown
  // thường thấy, không phải lỗi. Phân biệt 2 hành vi qua isMobileNav, theo dõi breakpoint lg
  // bằng matchMedia (chỉ cập nhật khi THỰC SỰ vượt qua mốc 991.98px, không phải mỗi lần resize
  // nhỏ lẻ).
  const [openGroups, setOpenGroups] = useState({});
  const [isMobileNav, setIsMobileNav] = useState(() => window.matchMedia('(max-width: 991.98px)').matches);
  const tuyenSinhRef = useRef(null);
  const thamDinhRef = useRef(null);
  const heThongRef = useRef(null);

  // ĐÃ THÊM (2026-09-15 — theo yêu cầu "sidebar mặc định mở ở Trang chủ, ẩn ở các
  // router con"): dùng lại đúng currentHashPath đã có sẵn (khai báo ở trên, cùng lý
  // do không gọi được useLocation() trực tiếp trong App.jsx). Mỗi khi ĐIỀU HƯỚNG
  // sang trang khác (hash đổi), đặt lại isSidebarOpen theo trang ĐÍCH: Trang chủ
  // ("/") -> mở, mọi route con khác -> ẩn (trên mobile luôn ẩn bất kể route, giữ
  // đúng hành vi overlay đã chốt trước đó). Đây là giá trị MẶC ĐỊNH mỗi lần chuyển
  // trang, không khoá cứng — người dùng vẫn bấm nút 3 gạch để tự mở/ẩn thêm bất cứ
  // lúc nào trong lúc đang đứng yên ở 1 trang, chỉ bị tính lại khi thật sự chuyển
  // sang trang khác (không chạy lại khi resize cửa sổ).
  useEffect(() => {
    setIsSidebarOpen(!isMobileNav && currentHashPath === '/');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHashPath]);

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 991.98px)');
    const onChange = (e) => setIsMobileNav(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  // Bấm vào 1 nhóm cha: di động -> chỉ đổi đúng nhóm đó, giữ nguyên các nhóm khác đang mở.
  // ĐÃ SỬA (2026-09-15 — theo yêu cầu "danh sách sidebar không bao giờ tự động
  // collapse, chỉ collapse khi bấm đúng vào mũi tên"): trước đây có 1 effect riêng
  // tự đóng nhóm khi bấm ra ngoài HOẶC nhấn phím Esc — hành vi đó hợp lý cho DROPDOWN
  // nổi tạm thời (kiểu navbar cũ), nhưng sai với SIDEBAR cố định thường trực: người
  // dùng bấm vào vùng nội dung chính để làm việc (điền form, đọc bảng...) không nên
  // vô tình làm sập nhóm đang mở trong sidebar. Đã BỎ HẲN effect đó (click-outside +
  // Escape) và hàm closeAllNavGroups() (không còn ai gọi tới) — giờ CHỈ CÓ MỘT nơi
  // duy nhất thay đổi openGroups: toggleNavGroup(), gọi khi bấm thẳng vào tiêu đề/mũi
  // tên của nhóm (xem JSX bên dưới). tuyenSinhRef/thamDinhRef/heThongRef vẫn giữ
  // nguyên gắn trên JSX (vô hại), dù không còn effect nào đọc tới nữa.
  const toggleNavGroup = (name) => {
    setOpenGroups(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const [currentUser, setCurrentUser] = useState(() => {
    const savedUser = localStorage.getItem('tuyensinh_user');
    return savedUser ? normalizeUserInfo(JSON.parse(savedUser)) : null;
  });

  // ĐÃ THÊM (2026-09-15 — sửa hiện tượng "vào thẳng trang chủ rồi mới báo hết phiên"):
  // trước đây currentUser CHỈ đọc từ localStorage lúc mount, không có bước xác minh
  // sessionToken còn sống thật trên server hay không -> nếu sessionToken đã hết hạn (vd
  // quá 8 tiếng) nhưng localStorage còn lưu, app vẫn render THẲNG trang chủ 1 nhịp, chỉ
  // phát hiện được khi trang chủ tự gọi API đầu tiên và dính lỗi 401 (xem sự kiện
  // 'app:session-expired' bên dưới) -> trải nghiệm "nhảy vào rồi mới văng ra".
  // Giờ nếu có currentUser từ localStorage, chặn render bằng màn hình "Đang xác thực..."
  // ngắn, chủ động gọi thử 1 API nhẹ đã có sẵn (laySoLuongChoToiKy — không giới hạn theo
  // Role, backend tự lọc theo g.userInfo.email, xem chú thích route /ho-so-cho-ky) để ép
  // phát hiện phiên hết hạn NGAY trước khi quyết định render trang nào. KHÔNG tạo action
  // GAS mới riêng cho việc này — dùng lại 1 nguồn action sẵn có (nguyên tắc #6).
  const [dangXacThucPhien, setDangXacThucPhien] = useState(() => !!currentUser);
  useEffect(() => {
    if (!currentUser) { setDangXacThucPhien(false); return; }
    let daHuy = false;
    laySoLuongChoToiKy()
      // Lỗi 401 (hết phiên thật) đã có interceptor của axios lo sẵn (bắn sự kiện
      // 'app:session-expired' -> handleLogout ở dưới) -> không cần xử lý gì thêm ở đây.
      // Lỗi khác (mất mạng, GAS đang chậm, timeout...) thì BỎ QUA, không ép đăng xuất
      // oan chỉ vì 1 lần gọi mạng trục trặc.
      .catch(() => {})
      .finally(() => { if (!daHuy) setDangXacThucPhien(false); });
    return () => { daHuy = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ĐÃ THÊM (Ký điện tử Pha 1 — Bước 4): badge số lượng "Hồ sơ chờ ký" trên menu tài
  // khoản — chỉ gọi khi đã đăng nhập (enabled), tự làm mới mỗi 60s (đủ nhanh để không
  // cảm giác "cũ", không tốn quota gọi liên tục như polling ngắn hơn).
  const { data: soLuongChoKy } = useQuery({
    queryKey: ['soLuongChoToiKy'],
    queryFn: laySoLuongChoToiKy,
    enabled: !!currentUser,
    refetchInterval: 60000,
  });

  // ĐÃ THÊM: nguồn dữ liệu thứ 2 cho bảng thông báo — số hồ sơ chờ xác nhận định danh
  // "của tôi" (hàm này đã tự nuốt lỗi/không có quyền, luôn trả về số, kể cả 0 — dùng
  // lại đúng action có sẵn, không tạo action GAS mới).
  const { data: soLuongChoXacNhan } = useQuery({
    queryKey: ['soLuongChoXacNhanDinhDanh'],
    queryFn: fetchSoLuongCanXacNhanDinhDanhCuaToi,
    enabled: !!currentUser,
    refetchInterval: 60000,
  });

  // ĐÃ THÊM: danh sách CHI TIẾT hồ sơ chờ ký cho bảng thông báo — chỉ gọi khi bảng
  // thực sự đang mở (enabled: isNotiOpen), tránh tải dữ liệu người dùng chưa chắc đã
  // xem. LƯU Ý: tên field bên dưới lúc render (tieuDe/ngayTao...) là DỰ ĐOÁN, chưa có
  // mẫu response thật để đối chiếu — xem chú thích tại chỗ render.
  const { data: danhSachChoKy } = useQuery({
    queryKey: ['danhSachChoToiKy'],
    queryFn: fetchDanhSachChoToiKy,
    enabled: !!currentUser && isNotiOpen,
  });

  // ĐÃ THÊM: tổng số thông báo chưa đọc hiện trên chấm đỏ của chuông — cộng dồn tất cả
  // nguồn "chờ xử lý" đang có. Sau này bổ sung thêm loại thông báo mới (hồ sơ yêu cầu bổ
  // sung, hồ sơ hoàn tác, hồ sơ được duyệt...) chỉ cần cộng thêm vào đây.
  const tongSoThongBao = (soLuongChoKy?.soLuong || 0) + (soLuongChoXacNhan || 0);

  // ĐÃ THÊM (theo phản hồi — tiêu đề tab trình duyệt hiện đúng tên trang đang xem, thay vì
  // luôn cố định "Quản lý sinh viên" như trong index.html): dùng chung currentHashPath đã
  // theo dõi ở trên (qua "hashchange"), không cần thêm cơ chế route nào khác. Đặt SAU khai
  // báo currentUser (bên trên) vì effect này cần đọc currentUser — khai báo trước đó (ngay
  // sau isThamDinhPage) sẽ lỗi "Cannot access 'currentUser' before initialization" vì
  // currentUser lúc đó chưa tồn tại trong phạm vi hàm component. 2 route con có tham số
  // động ("/sprofile/student/:key8" và route dự phòng cũ
  // "/quan-ly-ho-so-moi/ho-so/:cccd/:nganh") không khớp được bằng so sánh nguyên văn nên
  // xét riêng bằng tiền tố ở effect bên dưới.
  const TIEU_DE_THEO_TRANG = {
    '/': 'Trang chủ',
    '/thu-ho-so-nhap-hoc': 'Thu hồ sơ trực tiếp',
    '/xet-tuyen': 'Nhập liệu xét tuyển',
    '/tham-dinh': 'Ban thẩm định',
    '/settings': 'Cấu hình hệ thống',
    '/quan-ly-ho-so-moi': 'Student Overview',
    '/xac-nhan-dinh-danh': 'Định danh hồ sơ',
    '/user-stats': 'Thống kê cá nhân',
    '/ho-so-ca-nhan': 'Hồ sơ cá nhân',
    '/ho-so-cho-ky': 'Hồ sơ chờ ký',
    '/ho-so-ky-so': 'Tạo yêu cầu ký số',
  };
  useEffect(() => {
    if (!currentUser) { document.title = 'Đăng nhập'; return; }
    const pathGoc = currentHashPath.split('?')[0];
    let tieuDe = 'Quản lý sinh viên';
    if (pathGoc.startsWith('/sprofile/student/') || pathGoc.startsWith('/quan-ly-ho-so-moi/ho-so/')) tieuDe = 'Chi tiết hồ sơ sinh viên';
    else if (TIEU_DE_THEO_TRANG[pathGoc]) tieuDe = TIEU_DE_THEO_TRANG[pathGoc];
    document.title = tieuDe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHashPath, currentUser]);

  // ĐÃ SỬA: đưa handleLogout ra ngoài useEffect (trước đây khai báo local bên trong,
  // không dùng lại được ở nơi khác) để dùng chung cho: idle-timeout, hết hạn JWT
  // Google, VÀ sự kiện "app:session-expired" (hết phiên tài khoản nội bộ) bên dưới.
  // ĐÃ SỬA: chỉ xoá sessionStorage khi CHỦ ĐỘNG bấm "Đăng xuất" (clearStorage=true) —
  // các trang như XetTuyenPage đang tự lưu form nhập dở vào sessionStorage để chống
  // mất dữ liệu khi F5. Trước đây hết phiên tự động (idle/hết hạn token/hết session
  // nội bộ) cũng bị sessionStorage.clear() theo, xoá mất đúng lúc dữ liệu cần giữ
  // nhất. Giờ hết phiên tự động sẽ GIỮ NGUYÊN sessionStorage — đăng nhập lại xong,
  // các trang có cơ chế tự khôi phục (như XetTuyenPage) sẽ tự nạp lại form cũ.
  const handleLogout = (msg, clearStorage = false) => {
    setCurrentUser(null);
    localStorage.removeItem('tuyensinh_user');
    if (clearStorage) sessionStorage.clear();
    if (msg) alert(msg);
    window.location.href = "/";
  };

  // ĐÃ THÊM: lắng nghe sự kiện "app:session-expired" do studentApi.js bắn ra khi bất kỳ
  // request nào bị GAS trả về code 401 (hết phiên — sessionToken quá 8 tiếng không thao
  // tác, hoặc idToken/sessionToken không hợp lệ) — tự đăng xuất + báo lý do ngay. Đây là
  // cơ chế DUY NHẤT xử lý hết phiên nay (tài khoản Google cũng dùng sessionToken sliding
  // 8 tiếng y hệt tài khoản nội bộ, xem action 'verifyToken' — không còn phụ thuộc Google
  // tự gia hạn idToken ngầm nữa).
  useEffect(() => {
    const onSessionExpired = (e) => {
      handleLogout(e.detail && e.detail.message ? e.detail.message : "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.");
    };
    window.addEventListener('app:session-expired', onSessionExpired);
    return () => window.removeEventListener('app:session-expired', onSessionExpired);
  }, []);

// ====================================================
  // TÍNH NĂNG TỰ ĐỘNG LOGOUT KHI KHÔNG THAO TÁC (idle timeout)
  // ====================================================
  // ĐÃ BỎ: toàn bộ cơ chế "gia hạn token ngầm" qua Google One Tap (checkTokenExpiry +
  // window.google.accounts.id.initialize()/prompt() mỗi 30s). Cơ chế đó vốn mong manh —
  // phụ thuộc cookie bên thứ 3 hoặc FedCM (không phải trình duyệt nào cũng hỗ trợ đủ,
  // ví dụ Firefox từng báo "Skipping unsupported feature name identity-credentials-get"),
  // Google tự khoá popup sau khi bị người dùng từ chối/tắt vài lần, và mỗi lần thử lại
  // gọi initialize() chồng lên phiên trước gây cảnh báo "initialize() is called multiple
  // times" cùng các request bị NS_BINDING_ABORTED — dù đã vá nhiều lần vẫn tái diễn "gia
  // hạn thất bại". Giờ tài khoản Google được cấp sessionToken nội bộ ngay lúc đăng nhập
  // (xem action 'verifyToken' trong Quanlysv.gs) — sessionToken này TRƯỢT HẠN 8 tiếng mỗi
  // khi có request thành công (validateSession phía server), y hệt tài khoản nội bộ vốn
  // đã chạy ổn định — nên không còn cần Google tự gia hạn idToken ngầm nữa. Nếu sessionToken
  // hết hạn thật (8 tiếng không thao tác), interceptor 401 trong studentApi.js đã tự bắt
  // và đăng xuất (xem sự kiện 'app:session-expired' ở trên) — không cần thêm cơ chế riêng.
  useEffect(() => {
    let idleTimer;

    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      if (currentUser) {
        idleTimer = setTimeout(() => {
          handleLogout("Phiên làm việc hết hạn do không tương tác quá 30 phút.");
        }, 30 * 60 * 1000);
      }
    };

    if (currentUser) {
      const events = ['mousemove', 'keydown', 'scroll', 'click'];
      events.forEach(e => window.addEventListener(e, resetIdleTimer));
      resetIdleTimer();
    }

    return () => {
      clearTimeout(idleTimer);
      const events = ['mousemove', 'keydown', 'scroll', 'click'];
      events.forEach(e => window.removeEventListener(e, resetIdleTimer));
    };
  }, [currentUser]);


  const handleLoginSuccess = (userInfo) => {
    const normalized = normalizeUserInfo(userInfo);
    setCurrentUser(normalized);
    localStorage.setItem('tuyensinh_user', JSON.stringify(normalized));
  };

  // ĐÃ SỬA: dùng lại handleLogout(msg) khai báo ở trên (không alert khi msg rỗng — tự
  // bấm nút "Đăng xuất" thì không cần cảnh báo gì), tránh khai báo trùng tên 2 lần.
  const handleLogoutClick = () => handleLogout(null, true); // bấm tay -> xoá luôn sessionStorage

  // ĐÃ THÊM: nút "Phản hồi" ở footer toàn app — mở form nhập, gửi qua Google Chat.
  // Dùng Swal (đã có sẵn trong dự án) thay vì tự viết modal riêng cho gọn.
  const handleOpenFeedback = async () => {
    const { value: noiDung, isConfirmed } = await Swal.fire({
      title: '💬 Feedback',
      input: 'textarea',
      inputPlaceholder: 'Mô tả lỗi gặp phải hoặc góp ý của bạn...',
      showCancelButton: true,
      confirmButtonText: 'Gửi',
      cancelButtonText: 'Hủy',
      inputValidator: (value) => !value?.trim() ? 'Vui lòng nhập nội dung phản hồi!' : undefined,
    });
    if (!isConfirmed || !noiDung) return;

    try {
      await sendFeedback(noiDung.trim());
      Swal.fire({ icon: 'success', title: 'Cảm ơn bạn!', text: 'Chúng tôi đã nhận được phản hồi.' });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Gửi thất bại', text: err.message });
    }
  };

  // ĐÃ THÊM: xem chú thích tại chỗ khai báo dangXacThucPhien ở trên — chặn render trang
  // chủ/LoginPage cho tới khi có kết quả xác minh phiên (thường chỉ vài trăm ms).
  if (dangXacThucPhien) {
    return (
      <div className="d-flex align-items-center justify-content-center vh-100" style={{ backgroundColor: '#f4f6f9' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Đang xác thực phiên đăng nhập...</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  const displayName = currentUser.name || currentUser.username;

  return (
    <HashRouter>
      {/* ĐÃ SỬA (2026-09-15 — đổi cấu trúc menu: navbar-dark ngang -> sidebar trái sáng
          màu + topbar sáng riêng, theo yêu cầu "dọn nhà" menu cho đỡ phèn, dễ mở rộng
          route sau này chỉ bằng cách thêm 1 mục trong sidebar). Khung ngoài vẫn flex
          column + minHeight:100vh để footer "Phản hồi/Cập nhật lần cuối" nằm đúng cuối
          trang theo dòng chảy bình thường, y hệt trước (xem chú thích tại chính footer
          đó, không đổi gì cả). Bên dưới topbar giờ là 1 hàng flex gồm sidebar trái (ẩn/
          hiện qua isSidebarOpen, nút 3 gạch trên topbar điều khiển) + cột nội dung
          chính bên phải (chứa Routes + footer, không đổi logic bên trong). */}
      <div style={{ minHeight: '100vh', backgroundColor: '#f4f6f9', display: 'flex', flexDirection: 'column' }}>

        {/* TOPBAR — ĐÃ SỬA: đổi nền từ navbar-dark bg-dark sang trắng sáng, thêm nút 3
            gạch (điều khiển isSidebarOpen) bên trái cạnh logo + chuông thông báo (MỚI)
            bên phải. Menu tài khoản giữ NGUYÊN logic cũ (chỉ đổi text-light -> mặc định
            tối vì nền giờ sáng). */}
        <div className="d-flex align-items-center shadow-sm sticky-top bg-white px-3" style={{ height: '56px', flexShrink: 0, zIndex: 1040, borderBottom: '1px solid #e9ecef' }}>
          <button
            className="btn btn-sm btn-light border-0 me-2"
            type="button"
            aria-label={isSidebarOpen ? 'Ẩn menu' : 'Hiện menu'}
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          >
            {/* ĐÃ SỬA (theo phản hồi — icon 3 gạch không hiện): trước đây dùng class
                "bi bi-list" (phụ thuộc webfont bootstrap-icons — nếu font này không
                được nạp đúng ở trang, icon vô hình dù nút vẫn bấm được, dễ gây cảm giác
                "bấm không có gì xảy ra"). Đổi sang SVG vẽ tay nội tuyến — luôn hiện,
                không phụ thuộc font nào cả. */}
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 6H19M3 11H19M3 16H19" stroke="#212529" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>

          <NavLink to="/" end className="d-flex align-items-center text-decoration-none flex-shrink-0" style={{ color: '#037683' }}>
            <img src={logoPhuXuan} alt="Phú Xuan University" className="app-logo me-2" />
            <span className="fw-bold d-none d-sm-inline" style={{ fontSize: '0.95rem' }}>HỆ THỐNG QUẢN LÝ SINH VIÊN</span>
          </NavLink>

          <div className="ms-auto d-flex align-items-center gap-3">
            {/* CHUÔNG THÔNG BÁO — ĐÃ THÊM. Nội dung tạm lấy 2 nguồn có sẵn: hồ sơ chờ ký
                (danh sách thật) + số hồ sơ chờ xác nhận định danh (chỉ có số, chưa có
                API danh sách "của riêng tôi" để liệt kê từng hồ sơ — xem chú thích tại
                chỗ khai báo danhSachChoKy phía trên). Các loại thông báo khác (yêu cầu
                bổ sung hồ sơ, hoàn tác, được duyệt...) sau này thêm vào đúng chỗ cộng
                tongSoThongBao + thêm 1 khối hiển thị tương tự bên dưới. */}
            <div className="position-relative" ref={notiRef}>
              <button
                className="btn btn-sm btn-light border-0 position-relative"
                type="button"
                aria-label="Thông báo"
                onClick={() => setIsNotiOpen(!isNotiOpen)}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10 2C7.5 2 5.5 4 5.5 6.5V9.5L4 13H16L14.5 9.5V6.5C14.5 4 12.5 2 10 2Z" stroke="#212529" strokeWidth="1.4" strokeLinejoin="round" />
                  <path d="M8 15.5C8 16.6 8.9 17.5 10 17.5C11.1 17.5 12 16.6 12 15.5" stroke="#212529" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                {tongSoThongBao > 0 && (
                  <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" style={{ fontSize: '0.6rem' }}>
                    {tongSoThongBao > 99 ? '99+' : tongSoThongBao}
                  </span>
                )}
              </button>

              {isNotiOpen && (
                <div className="shadow bg-white" style={{ position: 'absolute', right: 0, top: '100%', marginTop: '8px', width: '320px', maxHeight: '420px', overflowY: 'auto', borderRadius: '10px', zIndex: 1050 }}>
                  <div className="px-3 py-2 border-bottom fw-bold small">Thông báo</div>

                  {tongSoThongBao === 0 ? (
                    <div className="px-3 py-4 text-center text-muted small">Không có thông báo mới.</div>
                  ) : (
                    <>
                      {soLuongChoKy?.soLuong > 0 && (
                        <div>
                          <div className="px-3 pt-2 pb-1 text-muted" style={{ fontSize: '0.72rem', textTransform: 'uppercase' }}>Hồ sơ chờ ký</div>
                          {/* LƯU Ý: tên field (tieuDe/tenFile/hoTen) bên dưới là DỰ ĐOÁN,
                              chưa có mẫu response thật của fetchDanhSachChoToiKy để đối
                              chiếu — nếu hiện sai/trống, gửi 1 đoạn console.log mẫu để
                              sửa đúng tên field. */}
                          {!danhSachChoKy && (
                            <div className="px-3 py-2 text-muted small">Đang tải...</div>
                          )}
                          {(danhSachChoKy || []).slice(0, 5).map((item, idx) => (
                            <NavLink
                              key={idx}
                              to="/ho-so-cho-ky"
                              className="dropdown-item py-2 px-3 small text-wrap"
                              onClick={() => setIsNotiOpen(false)}
                            >
                              {item.tieuDe || item.tenFile || item.hoTen || `Hồ sơ #${idx + 1}`}
                            </NavLink>
                          ))}
                          <NavLink to="/ho-so-cho-ky" className="dropdown-item py-2 px-3 small text-primary" onClick={() => setIsNotiOpen(false)}>
                            Xem tất cả ({soLuongChoKy.soLuong}) →
                          </NavLink>
                        </div>
                      )}
                      {soLuongChoXacNhan > 0 && (
                        <div className="border-top">
                          <NavLink to="/xac-nhan-dinh-danh" className="dropdown-item py-2 px-3 small" onClick={() => setIsNotiOpen(false)}>
                            <svg width="15" height="15" viewBox="0 0 18 18" fill="none" style={{ marginRight: '8px', verticalAlign: '-2px', color: '#d97706' }}><path d="M9 3L16 15H2L9 3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M9 7.5V10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><circle cx="9" cy="12.7" r="0.9" fill="currentColor" /></svg>
                            {soLuongChoXacNhan} hồ sơ cần xác nhận định danh
                          </NavLink>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* MENU TÀI KHOẢN — logic y hệt bản cũ 100%, chỉ đổi màu chữ vì topbar sáng. */}
            <div className="position-relative" ref={userDropdownRef}>
              <a
                className="d-flex align-items-center p-0"
                href="#"
                onClick={(e) => { e.preventDefault(); setIsUserDropdownOpen(!isUserDropdownOpen); }}
                style={{ cursor: 'pointer' }}
              >
                {currentUser.avatar ? (
                  <img src={currentUser.avatar} alt="avatar" className="rounded-circle" width="32" height="32" />
                ) : (
                  <svg width="26" height="26" viewBox="0 0 18 18" fill="none" style={{ color: '#6c757d' }}><circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.3" /><circle cx="9" cy="7" r="2.3" stroke="currentColor" strokeWidth="1.3" /><path d="M4.5 14.2C5.2 12 7 10.8 9 10.8C11 10.8 12.8 12 13.5 14.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
                )}
              </a>

              <ul
                className={`dropdown-menu dropdown-menu-end shadow border-0 mt-2 user-account-menu ${isUserDropdownOpen ? 'show' : ''}`}
                style={{ position: 'absolute', right: 0, top: '100%' }}
              >
                <li>
                  <NavLink
                    to="/ho-so-ca-nhan"
                    className="dropdown-item py-2 d-flex align-items-center gap-2"
                    onClick={() => setIsUserDropdownOpen(false)}
                  >
                    {currentUser.avatar ? (
                      <img src={currentUser.avatar} alt="avatar" className="rounded-circle" width="28" height="28" />
                    ) : (
                      <svg width="22" height="22" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.3" /><circle cx="9" cy="7" r="2.3" stroke="currentColor" strokeWidth="1.3" /><path d="M4.5 14.2C5.2 12 7 10.8 9 10.8C11 10.8 12.8 12 13.5 14.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
                    )}
                    <span className="fw-bold">{displayName}</span>
                  </NavLink>
                </li>
                <li><hr className="dropdown-divider" /></li>
                <li>
                  <NavLink
                    to="/user-stats"
                    className="dropdown-item py-2"
                    onClick={() => setIsUserDropdownOpen(false)}
                  >
                    <svg width="15" height="15" viewBox="0 0 18 18" fill="none" style={{ marginRight: '8px', verticalAlign: '-2px' }}><path d="M3 15V3M3 15H15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><path d="M6 12V8M9.5 12V5M13 12V9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg> Thống kê cá nhân
                  </NavLink>
                </li>
                {isThamDinhPage && (
                  <>
                    <li><hr className="dropdown-divider" /></li>
                    <li>
                      <button
                        className="dropdown-item py-2"
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent('thamdinh:export-excel'));
                          setIsUserDropdownOpen(false);
                        }}
                      >
                        <svg width="15" height="15" viewBox="0 0 18 18" fill="none" style={{ marginRight: '8px', verticalAlign: '-2px' }}><rect x="3" y="3" width="12" height="12" rx="1.2" stroke="currentColor" strokeWidth="1.4" /><path d="M3 8H15M9 3V15" stroke="currentColor" strokeWidth="1.4" /></svg> Export (All Columns)
                      </button>
                    </li>
                    <li>
                      <button
                        className="dropdown-item py-2"
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent('thamdinh:export-custom'));
                          setIsUserDropdownOpen(false);
                        }}
                      >
                        <svg width="15" height="15" viewBox="0 0 18 18" fill="none" style={{ marginRight: '8px', verticalAlign: '-2px' }}><rect x="3" y="3" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" /><rect x="10" y="3" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" /><rect x="3" y="10" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" /><path d="M11 12L12 13L14.5 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg> Export (Customized)
                      </button>
                    </li>
                  </>
                )}
                <li><hr className="dropdown-divider" /></li>
                <li>
                  <button className="dropdown-item text-danger py-2" onClick={handleLogoutClick}>
                    <svg width="15" height="15" viewBox="0 0 18 18" fill="none" style={{ marginRight: '8px', verticalAlign: '-2px' }}><path d="M7 3H4C3.4 3 3 3.4 3 4V14C3 14.6 3.4 15 4 15H7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><path d="M11 12L15 9L11 6M15 9H6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg> Đăng xuất
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* HÀNG DƯỚI TOPBAR: sidebar trái + cột nội dung chính bên phải. */}
        <div style={{ display: 'flex', flex: '1 1 auto', minHeight: 0 }}>

          {/* BACKDROP — ĐÃ THÊM: chỉ hiện trên di động khi sidebar đang mở dạng overlay
              (theo lựa chọn của bạn — ẩn mặc định, bấm menu trượt ra đè lên), bấm vào để
              đóng lại mà không đẩy nội dung. */}
          {isMobileNav && isSidebarOpen && (
            <div
              onClick={() => setIsSidebarOpen(false)}
              style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 1039 }}
            />
          )}

          {/* SIDEBAR TRÁI — ĐÃ THÊM: thay cho 3 nhóm dropdown ngang cũ. Desktop: nằm
              trong dòng chảy (mở thì đẩy nội dung sang phải, tắt thì content full-width).
              Di động: overlay cố định đè lên nội dung, tự đóng khi bấm 1 link bên trong
              (isMobileNav check trong mỗi onClick bên dưới). Logic phân quyền từng nhóm/
              mục GIỮ NGUYÊN 100% y hệt bản navbar cũ (hasAnyRole), chỉ đổi vỏ hiển thị
              từ dropdown ngang sang accordion dọc. */}
          {isSidebarOpen && (
            <div
              className="bg-white"
              style={{
                width: '230px',
                flexShrink: 0,
                borderRight: '1px solid #e9ecef',
                padding: '14px 10px',
                overflowY: 'auto',
                ...(isMobileNav
                  ? { position: 'fixed', top: '56px', left: 0, bottom: 0, zIndex: 1040, boxShadow: '2px 0 8px rgba(0,0,0,0.15)' }
                  : { position: 'sticky', top: '56px', height: 'calc(100vh - 56px)', zIndex: 1038 }),
              }}
            >
              <NavLink
                to="/"
                end
                onClick={() => { if (isMobileNav) setIsSidebarOpen(false); }}
                className={({ isActive }) => `d-flex align-items-center gap-2 px-2 py-2 rounded text-decoration-none mb-2 ${isActive ? 'bg-light fw-bold' : ''}`}
                style={{ color: '#212529' }}
              >
                <svg width="16" height="16" viewBox="0 0 18 18" fill="none" style={{ marginRight: '8px', flexShrink: 0 }}><path d="M3 9L9 3L15 9M5 8V15H13V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg> Trang chủ
              </NavLink>

              {/* NHÓM 1 — TUYỂN SINH */}
              {hasAnyRole(currentUser.roles, ['CanBo', 'TuyenSinh', 'ThamDinh', 'Admin']) && (
                <div className="mb-1" ref={tuyenSinhRef}>
                  <button
                    type="button"
                    className="btn w-100 d-flex align-items-center justify-content-between px-2 py-2 border-0"
                    onClick={() => toggleNavGroup('tuyensinh')}
                    style={{ color: '#212529', background: openGroups.tuyensinh ? '#f1f3f5' : 'transparent' }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center' }}><svg width="16" height="16" viewBox="0 0 18 18" fill="none" style={{ marginRight: '8px' }}><path d="M9 3L16 6.5L9 10L2 6.5L9 3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M5 8V12C5 12 6.5 14 9 14C11.5 14 13 12 13 12V8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>Tuyển sinh</span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ transform: openGroups.tuyensinh ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease', flexShrink: 0 }}><path d="M4 2L8 6L4 10" stroke="#6c757d" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  {openGroups.tuyensinh && (
                    <div className="ps-4">
                      {hasAnyRole(currentUser.roles, ['CanBo', 'ThamDinh', 'Admin']) && (
                        <NavLink to="/thu-ho-so-nhap-hoc" onClick={() => { if (isMobileNav) setIsSidebarOpen(false); }} className={({ isActive }) => `d-block py-2 text-decoration-none small ${isActive ? 'fw-bold text-primary' : 'text-secondary'}`}>
                          <svg width="14" height="14" viewBox="0 0 18 18" fill="none" style={{ marginRight: '8px', verticalAlign: '-2px' }}><circle cx="6" cy="6" r="2" stroke="currentColor" strokeWidth="1.4" /><circle cx="12" cy="6" r="2" stroke="currentColor" strokeWidth="1.4" /><path d="M2 15C2 12 4 10.5 6 10.5C8 10.5 10 12 10 15M8 15C8 12.5 9.7 11 12 11C14.3 11 16 12.5 16 15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>Thu hồ sơ trực tiếp
                        </NavLink>
                      )}
                      {hasAnyRole(currentUser.roles, ['TuyenSinh', 'ThamDinh', 'Admin']) && (
                        <NavLink to="/xet-tuyen" onClick={() => { if (isMobileNav) setIsSidebarOpen(false); }} className={({ isActive }) => `d-block py-2 text-decoration-none small ${isActive ? 'fw-bold text-primary' : 'text-secondary'}`}>
                          <svg width="14" height="14" viewBox="0 0 18 18" fill="none" style={{ marginRight: '8px', verticalAlign: '-2px' }}><rect x="4" y="3" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.4" /><path d="M7 2.5H11V4.5H7V2.5Z" stroke="currentColor" strokeWidth="1.4" /><path d="M6.5 8H11.5M6.5 11H11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>Nhập hồ sơ trực tuyến
                        </NavLink>
                      )}
                      {hasAnyRole(currentUser.roles, ['ThamDinh', 'TuyenSinh', 'CanBo', 'Admin']) && (
                        <NavLink to="/ho-so-ky-so" onClick={() => { if (isMobileNav) setIsSidebarOpen(false); }} className={({ isActive }) => `d-block py-2 text-decoration-none small ${isActive ? 'fw-bold text-primary' : 'text-secondary'}`}>
                          <svg width="14" height="14" viewBox="0 0 18 18" fill="none" style={{ marginRight: '8px', verticalAlign: '-2px' }}><path d="M5 2H11L14 5V16H5V2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M7 10L8.5 11.5L11.5 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>Hồ sơ ký số
                        </NavLink>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* NHÓM 2 — THẨM ĐỊNH */}
              {hasAnyRole(currentUser.roles, ['ThamDinh', 'Admin']) && (
                <div className="mb-1" ref={thamDinhRef}>
                  <button
                    type="button"
                    className="btn w-100 d-flex align-items-center justify-content-between px-2 py-2 border-0"
                    onClick={() => toggleNavGroup('thamdinh')}
                    style={{ color: '#212529', background: openGroups.thamdinh ? '#f1f3f5' : 'transparent' }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center' }}><svg width="16" height="16" viewBox="0 0 18 18" fill="none" style={{ marginRight: '8px' }}><rect x="4" y="3" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.4" /><path d="M7 2.5H11V4.5H7V2.5Z" stroke="currentColor" strokeWidth="1.4" /><path d="M7 9.5L8.3 11L11.2 7.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>Thẩm định</span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ transform: openGroups.thamdinh ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease', flexShrink: 0 }}><path d="M4 2L8 6L4 10" stroke="#6c757d" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  {openGroups.thamdinh && (
                    <div className="ps-4">
                      {hasAnyRole(currentUser.roles, ['ThamDinh', 'Admin']) && (
                        <NavLink to="/tham-dinh" onClick={() => { if (isMobileNav) setIsSidebarOpen(false); }} className={({ isActive }) => `d-block py-2 text-decoration-none small ${isActive ? 'fw-bold text-primary' : 'text-secondary'}`}>
                          <svg width="14" height="14" viewBox="0 0 18 18" fill="none" style={{ marginRight: '8px', verticalAlign: '-2px' }}><rect x="4" y="3" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.4" /><path d="M7 2.5H11V4.5H7V2.5Z" stroke="currentColor" strokeWidth="1.4" /><path d="M7 9.5L8.3 11L11.2 7.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>Ban Thẩm định
                        </NavLink>
                      )}
                      {hasAnyRole(currentUser.roles, ['Admin', 'ThamDinh']) && (
                        <NavLink to="/xac-nhan-dinh-danh" onClick={() => { if (isMobileNav) setIsSidebarOpen(false); }} className={({ isActive }) => `d-block py-2 text-decoration-none small ${isActive ? 'fw-bold text-primary' : 'text-secondary'}`}>
                          <svg width="14" height="14" viewBox="0 0 18 18" fill="none" style={{ marginRight: '8px', verticalAlign: '-2px' }}><rect x="3" y="4" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" /><circle cx="7" cy="8.3" r="1.5" strokeWidth="1.3" stroke="currentColor" /><path d="M5 12C5 10.6 5.9 9.8 7 9.8C8.1 9.8 9 10.6 9 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /><path d="M11 8H13M11 10.5H13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>Định danh hồ sơ
                        </NavLink>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* NHÓM 3 — HỆ THỐNG */}
              {hasAnyRole(currentUser.roles, ['CanBo', 'TuyenSinh', 'ThamDinh', 'DaoTao', 'Admin']) && (
                <div className="mb-1" ref={heThongRef}>
                  <button
                    type="button"
                    className="btn w-100 d-flex align-items-center justify-content-between px-2 py-2 border-0"
                    onClick={() => toggleNavGroup('hethong')}
                    style={{ color: '#212529', background: openGroups.hethong ? '#f1f3f5' : 'transparent' }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center' }}><svg width="16" height="16" viewBox="0 0 18 18" fill="none" style={{ marginRight: '8px' }}><path d="M9 2L16 5.5L9 9L2 5.5L9 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M2 9.5L9 13L16 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M2 13L9 16.5L16 13" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>Hệ thống</span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ transform: openGroups.hethong ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease', flexShrink: 0 }}><path d="M4 2L8 6L4 10" stroke="#6c757d" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  {openGroups.hethong && (
                    <div className="ps-4">
                      {hasAnyRole(currentUser.roles, ['CanBo', 'TuyenSinh', 'ThamDinh', 'DaoTao', 'Admin']) && (
                        <NavLink to="/quan-ly-ho-so-moi" onClick={() => { if (isMobileNav) setIsSidebarOpen(false); }} className={({ isActive }) => `d-block py-2 text-decoration-none small ${isActive ? 'fw-bold text-primary' : 'text-secondary'}`}>
                          <svg width="14" height="14" viewBox="0 0 18 18" fill="none" style={{ marginRight: '8px', verticalAlign: '-2px' }}><rect x="2.5" y="3" width="13" height="3.5" rx="1" stroke="currentColor" strokeWidth="1.4" /><path d="M3.5 6.5V14.5H14.5V6.5" stroke="currentColor" strokeWidth="1.4" /><path d="M7 9.5H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>Student Overview
                        </NavLink>
                      )}
                      {hasAnyRole(currentUser.roles, ['Admin']) && (
                        <NavLink to="/settings" onClick={() => { if (isMobileNav) setIsSidebarOpen(false); }} className={({ isActive }) => `d-block py-2 text-decoration-none small ${isActive ? 'fw-bold text-primary' : 'text-secondary'}`}>
                          <svg width="14" height="14" viewBox="0 0 18 18" fill="none" style={{ marginRight: '8px', verticalAlign: '-2px' }}><circle cx="9" cy="9" r="2.3" stroke="currentColor" strokeWidth="1.4" /><path d="M9 2.5V4.3M9 13.7V15.5M15.5 9H13.7M4.3 9H2.5M13.5 4.5L12.2 5.8M5.8 12.2L4.5 13.5M13.5 13.5L12.2 12.2M5.8 5.8L4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>Cấu hình hệ thống
                        </NavLink>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* CỘT NỘI DUNG CHÍNH — chứa Routes + footer, KHÔNG đổi gì bên trong (xem tiếp
              bên dưới, y hệt bản cũ). */}
          <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        <div className="p-2 p-md-3" style={{ flex: '1 0 auto' }}>
          {/* VÙNG ĐỊNH TUYẾN CHÍNH (Chỉ giữ 1 khối Routes duy nhất) */}
          <Routes>
            {/* ĐÃ SỬA: "/" trước đây redirect thẳng sang Quản lý hồ sơ (Navigate replace),
                giờ trỏ về Trang chủ dạng thẻ chức năng — mỗi thẻ tự lọc theo quyền của
                currentUser (xem Home.jsx), không cần bọc thêm ProtectedRoute ở đây. */}
            <Route path="/" element={<Home currentUser={currentUser} />} />
            {/* ĐÃ SỬA: thêm ThamDinh (chỉ xem — xem ghi chú ở nav link phía trên và
                AdmissionsPage.jsx). ProtectedRoute tự OR thêm Admin sẵn. */}
            <Route path="/thu-ho-so-nhap-hoc" element={
              <ProtectedRoute userRoles={currentUser.roles} allowedRoles={['CanBo', 'ThamDinh']}>
                <AdmissionsPage />
              </ProtectedRoute>
            } />

            {/* Nhóm 2: Tuyển sinh (Xét tuyển) */}
            <Route path="/xet-tuyen" element={
              <ProtectedRoute userRoles={currentUser.roles} allowedRoles={['TuyenSinh', 'ThamDinh']}>
                <XetTuyenPage />
              </ProtectedRoute>
            } />

            {/* Nhóm 3: Thẩm định — ĐÃ THÊM (Pha 2 roadmap), UI thật sẽ hoàn thiện ở Pha 3+ */}
            <Route path="/tham-dinh" element={
              <ProtectedRoute userRoles={currentUser.roles} allowedRoles={['ThamDinh']}>
                <ThamDinhPage />
              </ProtectedRoute>
            } />

            {/* Nhóm 4: Settings (Chỉ Admin) */}
            <Route path="/settings" element={
              <ProtectedRoute userRoles={currentUser.roles} allowedRoles={[]}>
                <SettingsPage />
              </ProtectedRoute>
            } />

            {/* Kho tra cứu sinh viên — ĐÃ THÊM. ProtectedRoute tự OR thêm Admin sẵn. */}
            {/* ĐÃ THÊM (role mới "DaoTao" — trang Student Overview, 2026-09-14): bộ phận Đào
                tạo được cấp acc riêng (role "DaoTao" trong sheet TaiKhoan), vào được đúng
                trang này thay vì quản lý bằng Excel — chỉ thêm quyền XEM, còn hành động
                "Hoàn tác bàn giao" tự khoá/mở theo trạng thái từng hồ sơ ngay trong
                ChiTietHoSoKhoPage.jsx (xem currentUser truyền xuống bên dưới), không cần
                route riêng. */}
            <Route path="/quan-ly-ho-so-moi" element={
              <ProtectedRoute userRoles={currentUser.roles} allowedRoles={['CanBo', 'TuyenSinh', 'ThamDinh', 'DaoTao']}>
                <KhoSinhVienPage />
              </ProtectedRoute>
            } />
            {/* ĐÃ THÊM: trang chi tiết 1 hồ sơ trong Kho — route con, cùng quyền như trang
                Kho ở trên (không phải trang/file riêng, chỉ là 1 route khác của cùng bundle
                React — không tốn thêm lưu trữ dù có bao nhiêu hồ sơ).
                ĐÃ SỬA (theo phản hồi, tránh lộ CCCD + Ngành ngay trên URL): route CHÍNH giờ
                là "/sprofile/student/:key8" (key8 = 8 ký tự cuối SV_KEY — xem
                KhoSinhVienPage.jsx). Route CŨ /quan-ly-ho-so-moi/ho-so/:cccd/:nganh vẫn giữ
                lại làm dự phòng CHỈ cho hồ sơ chưa từng được gắn SV_KEY (nên chưa có key8 để
                dùng) — cùng trỏ vào đúng 1 component ChiTietHoSoKhoPage, component tự nhận
                biết đang được mở theo kiểu nào (xem useParams() trong đó).
                ĐÃ THÊM: truyền currentUser xuống — ChiTietHoSoKhoPage cần biết role để quyết
                định có hiện nút "Hoàn tác bàn giao" hay không (chỉ ThamDinh/DaoTao/Admin). */}
            <Route path="/sprofile/student/:key8" element={
              <ProtectedRoute userRoles={currentUser.roles} allowedRoles={['CanBo', 'TuyenSinh', 'ThamDinh', 'DaoTao']}>
                <ChiTietHoSoKhoPage currentUser={currentUser} />
              </ProtectedRoute>
            } />
            <Route path="/quan-ly-ho-so-moi/ho-so/:cccd/:nganh" element={
              <ProtectedRoute userRoles={currentUser.roles} allowedRoles={['CanBo', 'TuyenSinh', 'ThamDinh', 'DaoTao']}>
                <ChiTietHoSoKhoPage currentUser={currentUser} />
              </ProtectedRoute>
            } />

            {/* Hàng đợi xác nhận định danh (Admin + ThamDinh) — ĐÃ THÊM (Pha 1·D1 — bước 4);
                ĐÃ SỬA: allowedRoles=['ThamDinh'] — ProtectedRoute tự OR thêm Admin (xem định
                nghĩa ở trên), nên kết quả là đúng 2 role Admin + ThamDinh được vào. */}
            <Route path="/xac-nhan-dinh-danh" element={
              <ProtectedRoute userRoles={currentUser.roles} allowedRoles={['ThamDinh']}>
                <XacNhanDinhDanhPage />
              </ProtectedRoute>
            } />
            
            {/* Các trang chung ai cũng vào được */}
            <Route path="/user-stats" element={<UserStatsPage />} />

            {/* ĐÃ SỬA (Ký điện tử Pha 1 — Bước 2): thay placeholder "đang xây dựng" bằng
                trang thật HoSoCaNhanPage (khối "Chữ ký cá nhân" — nền tảng cho luồng ký
                GBTT ở các bước sau). Vẫn KHÔNG bọc ProtectedRoute — ai đăng nhập cũng xem/
                sửa được hồ sơ của chính mình, giống /user-stats ở trên; backend cũng đã tự
                scope theo đúng email đang đăng nhập (g.userInfo.email), không nhận tham số
                email từ client nên không lộ dữ liệu người khác dù route mở. */}
            <Route path="/ho-so-ca-nhan" element={<HoSoCaNhanPage />} />

            {/* ĐÃ THÊM (Ký điện tử Pha 1 — Bước 4): trang "Hồ sơ chờ ký" — cũng KHÔNG bọc
                ProtectedRoute, cùng lý do với /ho-so-ca-nhan: danh sách chờ ký là dữ liệu
                BuocKy khớp theo email đang đăng nhập, không phải theo vai trò hệ thống —
                khoá theo role sẽ chặn nhầm đúng người cần vào nhất (vd Hiệu trưởng có thể
                chỉ mang role CanBo trong hệ thống). Backend tự lọc theo g.userInfo.email. */}
            <Route path="/ho-so-cho-ky" element={<ChoKyPage />} />

            {/* ĐÃ THÊM (Ký điện tử Pha 2 — Bước 6): trang "Tạo yêu cầu ký số" — CÓ bọc
                ProtectedRoute (khác /ho-so-ca-nhan, /ho-so-cho-ky ở trên) vì đây là hành
                động TẠO yêu cầu ký, không phải xem/ký dữ liệu của chính mình theo email.
                ĐÃ SỬA (theo yêu cầu — mở thêm cho TuyenSinh/CanBo): trước đây chỉ
                allowedRoles=['ThamDinh'], giờ mở thêm 'TuyenSinh','CanBo' — khớp đúng
                requireAuth(['ThamDinh','TuyenSinh','CanBo','Admin']) đã nới ở 2 action GAS
                dùng bởi trang này (hdGet_layCauHinhChucDanhKy, hdPost_taoYeuCauKyTuFile —
                xem KySo.gs). ProtectedRoute tự OR thêm Admin sẵn, không cần liệt kê lại. */}
            <Route path="/ho-so-ky-so" element={
              <ProtectedRoute userRoles={currentUser.roles} allowedRoles={['ThamDinh', 'TuyenSinh', 'CanBo']}>
                <TaoYeuCauKySoPage />
              </ProtectedRoute>
            } />

            {/* Trang báo lỗi 404 */}
            <Route path="*" element={
              <div className="d-flex flex-column align-items-center justify-content-center mt-5 pt-5">
                <h1 className="text-muted"><svg width="64" height="64" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.3" /><circle cx="6.3" cy="7.5" r="0.9" fill="currentColor" /><circle cx="11.7" cy="7.5" r="0.9" fill="currentColor" /><path d="M6 13C6.8 11.7 7.8 11 9 11C10.2 11 11.2 11.7 12 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg></h1>
                <h3 className="text-muted mt-3">404 - Không tìm thấy trang</h3>
              </div>
            } />
          </Routes>
        </div>

        {/* ĐÃ SỬA (theo phản hồi): trước đây footer này position:fixed + always-on-top,
            đè lên nội dung trang (đặc biệt các trang có bảng dài như Xét tuyển/Kho tra
            cứu). Giờ bỏ hẳn position:fixed — footer nằm THEO DÒNG CHẢY BÌNH THƯỜNG ở cuối
            trang (nhờ khối nội dung ở giữa có flex:1, xem div "p-2 p-md-3" phía trên đẩy
            footer này xuống đáy khi trang ngắn) — không còn che nội dung nữa, nhưng cũng
            không còn "luôn hiện trên mọi màn hình khi cuộn" như trước (đánh đổi đúng theo
            yêu cầu: "gắn vào trang, ở dưới cùng luôn, chứ không always ontop nữa"). */}
        <div style={{
          flexShrink: 0,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '6px 16px', background: 'rgba(255,255,255,0.95)',
          borderTop: '1px solid #dee2e6', fontSize: '0.8rem'
        }}>
          <button className="btn btn-sm btn-outline-secondary" onClick={handleOpenFeedback}>
            💬 Phản hồi
          </button>
          <span className="text-muted">Cập nhật lần cuối bởi Nguyễn Tiến Thịnh</span>
        </div>

          </div>
        </div>
      </div>
    </HashRouter>
  );
};

export default App;