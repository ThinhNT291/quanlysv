import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from "jwt-decode";
import { loginUser, GAS_URL } from '../../api/studentApi';
import Swal from 'sweetalert2';
// ĐÃ THÊM (2026-09-15 — bố cục màn đăng nhập 2 cột): ảnh nền cột trái. Giả định file
// nằm ở src/assets/px.jpg (cùng thư mục assets đang chứa logo-phuxuan.png, xem
// App.jsx) — nếu bạn đặt ảnh ở đường dẫn khác thì chỉ cần sửa đúng dòng import này.
import bgPhuXuan from '../../assets/px.jpg';

const LoginPage = ({ onLoginSuccess }) => {
  // ĐÃ THÊM: tự điền sẵn username lần đăng nhập nội bộ gần nhất — đỡ phải gõ lại khi bị
  // đẩy về đây do hết phiên (mật khẩu thì KHÔNG lưu/điền sẵn, phải tự gõ lại).
  const [credentials, setCredentials] = useState({ username: localStorage.getItem('tuyensinh_last_username') || '', password: '' });
  const [isLoading, setIsLoading] = useState(false);

// ĐÃ SỬA (Pha 6): dùng chung GAS_URL từ studentApi.js thay vì khai báo WEB_APP_URL
// riêng ở đây — trước đây 2 hằng số cùng giá trị nhưng tách rời, dễ quên đồng bộ.

// 1. Xử lý đăng nhập bằng Google (Phiên bản nối mạng Check Role)
const handleGoogleSuccess = async (credentialResponse) => {
  try {
    // Giải mã tạm để lấy cái ảnh Avatar hiển thị cho đẹp
    const decoded = jwtDecode(credentialResponse.credential);
    
    // Gói Token gửi xuống Trạm kiểm soát của GAS
    const payloadParams = new URLSearchParams();
    payloadParams.append('action', 'verifyToken');
    payloadParams.append('data', JSON.stringify({
        idToken: credentialResponse.credential
    }));

    // Gọi Backend để dò tên trong Sheet TaiKhoan
    const response = await fetch(GAS_URL, {
        method: 'POST',
        body: payloadParams
    });
    
    const result = await response.json();

    // Nếu Backend báo OK (Tìm thấy tên trong Sheet)
    if (result.code === 200) {
        const userInfo = {
            username: result.data.email,
            name: result.data.name || decoded.name,
            avatar: decoded.picture,
            role: result.data.role, // <--- ĂN TIỀN Ở ĐÂY! Lấy đúng Role (Admin, CanBo...) từ Google Sheets
            roles: result.data.roles, // ĐÃ THÊM: mảng role (chữ thường) để hỗ trợ multi-role, App.jsx dùng cái này để so quyền
            credential: credentialResponse.credential,
            // ĐÃ THÊM: sessionToken nội bộ (trượt hạn 8 tiếng) mà backend (action 'verifyToken')
            // giờ cấp luôn cho tài khoản Google, y hệt tài khoản thường — studentApi.js
            // (getAuthParams) sẽ ưu tiên gửi cái này ở MỌI request thay vì phụ thuộc vào
            // idToken Google (hết hạn cứng sau 1 tiếng, phải nhờ Google tự gia hạn ngầm mới
            // sống tiếp được — cơ chế đó hay bị "gia hạn thất bại", giờ không cần tới nữa).
            sessionToken: result.data.sessionToken
        };
        
        if (typeof onLoginSuccess === 'function') {
            onLoginSuccess(userInfo);
        }
    } else {
        // Bị Backend từ chối (Không có trong Sheet hoặc sai Token)
        alert("⛔ Từ chối truy cập: " + result.message);
    }
  } catch (error) {
      alert("Lỗi kết nối.");
  }
};

  // 2. Xử lý đăng nhập bằng Tài khoản nội bộ (Google Sheets)
  const handleLocalLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const userInfo = await loginUser(credentials.username, credentials.password);
      // ĐÃ VÁ BUG: dòng cũ `userInfo.name = userInfo.username;` LUÔN ghi đè tên hiển
      // thị bằng username/email, bất kể backend (action 'login' trong Quanlysv.gs)
      // đã trả đúng "name" lấy từ cột HoTen trong sheet TaiKhoan rồi — vì vậy tài
      // khoản nội bộ luôn hiện email thay vì họ tên. Giờ chỉ dùng username làm tên
      // hiển thị khi backend KHÔNG trả về name (dự phòng, không còn ghi đè vô điều kiện).
      userInfo.name = userInfo.name || userInfo.username;
      localStorage.setItem('tuyensinh_last_username', credentials.username); // ĐÃ THÊM: nhớ cho lần sau
      onLoginSuccess(userInfo);
    } catch (error) {
      Swal.fire('Lỗi đăng nhập', error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    // ĐÃ SỬA (2026-09-15 — theo yêu cầu bố cục lại màn đăng nhập): trước đây hộp thoại
    // nằm CHÍNH GIỮA màn hình trên nền màu phẳng. Giờ tách 2 cột: trái là ảnh nền +
    // giới thiệu hệ thống (chỉ hiện từ breakpoint lg/992px trở lên qua class
    // "d-none d-lg-flex/d-lg-block" — ẩn hẳn trên điện thoại/tablet dọc để tránh chật
    // chội, hộp đăng nhập trên màn hẹp sẽ tự chiếm toàn bộ chiều rộng như hành vi cũ),
    // phải giữ NGUYÊN 100% hộp thoại + logic đăng nhập cũ, chỉ đổi khung bọc ngoài.
    // ĐÃ SỬA (theo phản hồi — làm mờ ranh giới giữa 2 khối thay vì chia cứng): trước
    // đây ảnh nền và khối đăng nhập là 2 flex-item cạnh nhau -> có 1 đường ranh giới
    // thẳng, cứng. Giờ đổi cấu trúc: ảnh nền tách thành 1 lớp `position: absolute`
    // riêng, PHỦ RỘNG HƠN (85% thay vì 58%) và dùng `mask-image`/`WebkitMaskImage`
    // dạng gradient để tự mờ dần về phía phải (từ nét 100% xuống trong suốt 0%) —
    // phần trong suốt sẽ lộ ra đúng màu nền `#f4f6f9` của khối cha bên dưới, tạo hiệu
    // ứng ảnh tan dần vào nền thay vì bị cắt đường thẳng. Chữ giới thiệu và khối đăng
    // nhập tách thành 2 phần tử riêng, đặt `position: relative` để luôn nổi TRÊN lớp
    // ảnh (mặc định phần tử absolute không có z-index vẫn nằm dưới các phần tử
    // position:relative đứng sau nó trong DOM).
    <div style={{ position: 'relative', minHeight: '100vh', backgroundColor: '#f4f6f9', overflow: 'hidden' }} className="d-flex">
      {/* LỚP ẢNH NỀN — phủ rộng hơn phần chữ giới thiệu bên dưới để có đủ khoảng
          không gian mờ dần, không tự vẽ chữ ở đây (chữ tách riêng, xem khối kế tiếp) */}
      <div
        className="d-none d-lg-block"
        style={{
          position: 'absolute', top: 0, left: 0, bottom: 0,
          width: '82%',
          backgroundImage: `linear-gradient(180deg, rgba(3,20,30,0.25) 0%, rgba(3,20,30,0.8) 100%), url(${bgPhuXuan})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          WebkitMaskImage: 'linear-gradient(to right, black 0%, black 55%, transparent 92%)',
          maskImage: 'linear-gradient(to right, black 0%, black 55%, transparent 92%)',
        }}
      />

      {/* CỘT TRÁI: tên hệ thống — nổi trên lớp ảnh, KHÔNG bị mờ theo mask ở trên vì là
          phần tử riêng. ĐÃ SỬA: bỏ thẻ <br/> cứng + tăng maxWidth (560px -> 640px) +
          giảm cỡ chữ (2rem -> 1.75rem) vì dòng "QUẢN LÝ HỒ SƠ TUYỂN SINH - ĐÀO TẠO"
          trước đây tự ngắt dòng ở giữa "ĐÀO" và "TẠO" (rớt lẻ 1 chữ "TẠO" xuống dòng
          3) do không đủ chỗ hiển thị hết trên 1 dòng ở kích thước cũ — giờ để trình
          duyệt TỰ ngắt dòng theo đúng chỗ còn trống, không ép cứng vị trí xuống dòng
          nữa nên không còn rớt lẻ 1 chữ mồ côi như vậy. */}
      <div
        className="d-none d-lg-flex flex-column justify-content-end text-white p-5"
        style={{ position: 'relative', flex: '1 1 58%' }}
      >
        <div style={{ maxWidth: '640px' }}>
          <h1 className="fw-bold mb-3" style={{ fontSize: '1.75rem', lineHeight: 1.35 }}>
            HỆ THỐNG THẨM ĐỊNH, QUẢN LÝ HỒ SƠ TUYỂN SINH - ĐÀO TẠO
          </h1>
          <p className="mb-0" style={{ opacity: 0.9 }}>Trường Đại học Phú Xuân</p>
        </div>
      </div>

      {/* CỘT PHẢI: hộp thoại đăng nhập. ĐÃ SỬA (theo phản hồi): bỏ hẳn tiêu đề "HỆ
          THỐNG" (đang đè ngay trên nút đăng nhập Google, thừa vì tên hệ thống đã ghi
          rõ bên cột trái) + dịch toàn bộ chữ tĩnh trong khối này sang tiếng Anh. LƯU
          Ý: thông báo lỗi lấy trực tiếp từ backend (result.message / error.message)
          vẫn giữ nguyên tiếng Việt vì đó là chuỗi do GAS trả về — muốn dịch nốt phần
          này phải sửa ở phía backend (Quanlysv.gs), ngoài phạm vi file frontend này. */}
      <div className="d-flex align-items-center justify-content-center flex-grow-1 p-4" style={{ position: 'relative' }}>
      <div className="card shadow-lg border-0" style={{ maxWidth: '400px', width: '100%', borderRadius: '15px' }}>
        <div className="card-body p-5">
          <div className="text-center mb-4">
            <p className="text-muted small mb-0">Please sign in to continue</p>
          </div>

          {/* NÚT ĐĂNG NHẬP GOOGLE */}
          <div className="d-flex justify-content-center mb-4">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => Swal.fire('Error', 'Unable to connect to Google', 'error')}
              useOneTap
            />
          </div>

          <div className="d-flex align-items-center my-4">
            <hr className="flex-grow-1" />
            <span className="mx-3 text-muted small">Or use an internal account</span>
            <hr className="flex-grow-1" />
          </div>

          {/* FORM ĐĂNG NHẬP TRUYỀN THỐNG */}
          <form onSubmit={handleLocalLogin}>
            <div className="mb-3">
              <input 
                type="text" 
                className="form-control form-control-lg bg-light" 
                placeholder="Username" 
                value={credentials.username}
                onChange={e => setCredentials({...credentials, username: e.target.value})}
                required
              />
            </div>
            <div className="mb-4">
              <input 
                type="password" 
                className="form-control form-control-lg bg-light" 
                placeholder="Password" 
                value={credentials.password}
                onChange={e => setCredentials({...credentials, password: e.target.value})}
                required
              />
            </div>
            <button className="btn btn-primary w-100 btn-lg fw-bold" type="submit" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'SIGN IN'}
            </button>
          </form>

        </div>
      </div>
      </div>
    </div>
  );
};

export default LoginPage;