// ĐÃ THÊM (Ký điện tử Pha 1 — Bước 2): trang "Hồ sơ cá nhân" thật, thay cho placeholder
// "Đang được xây dựng" trước đây trong App.jsx (route /ho-so-ca-nhan). Đọc thẳng
// localStorage.getItem('tuyensinh_user') giống UserStatsPage.jsx — dự án không có
// Context/hook auth riêng, đây là quy ước chung của toàn bộ codebase.
//
// Khối 1: thông tin tài khoản (chỉ đọc).
// Khối 2: chữ ký cá nhân — ảnh chữ ký này sẽ được đóng dấu tự động vào Giấy báo trúng
// tuyển (GBTT) khi người dùng ký duyệt ở trang "Hồ sơ chờ ký" (Bước 4 trở đi).
// Khối 3 (ĐÃ THÊM): kết nối chữ ký số (CA) — trước đây việc gắn CA_NHA_CUNG_CAP/
// CA_MA_THUE_BAO cho 1 tài khoản hoàn toàn do Admin tự gõ tay trong Sheet, không có gì
// đảm bảo mã thuê bao đúng/còn hoạt động. Khối này cho người dùng tự "kết nối" CA của
// mình — bấm Kết nối sẽ xác thực THẬT với nhà cung cấp (ca-sign-service/check-certificate,
// không ký/không gửi thông báo tới điện thoại) trước khi lưu.
import React, { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Swal from 'sweetalert2';
import {
  layChuKyCuaToi, luuChuKyCuaToi, xoaChuKyCuaToi,
  layThongTinCaCuaToi, ketNoiChuKySo, xoaCaCuaToi,
} from '../../api/studentApi';

// Danh sách nhà cung cấp CA đã hỗ trợ — hiện chỉ VNPT SmartCA (xem NhaCungCapCA_/
// xacThucChungThuCA_ ở KySo.gs); thêm hãng khác sau này chỉ cần thêm 1 dòng ở đây.
const NHA_CUNG_CAP_CA = [
  { ma: 'VNPT_SMARTCA', ten: 'VNPT SmartCA' },
];

const HoSoCaNhanPage = () => {
  const currentUser = JSON.parse(localStorage.getItem('tuyensinh_user')) || {};
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [dangXuLyAnh, setDangXuLyAnh] = useState(false);
  const [nhaCungCapChon, setNhaCungCapChon] = useState(NHA_CUNG_CAP_CA[0].ma);
  const [maThueBaoNhap, setMaThueBaoNhap] = useState('');

  const { data: chuKy, isLoading: dangTaiChuKy } = useQuery({
    queryKey: ['chuKyCuaToi'],
    queryFn: layChuKyCuaToi,
  });

  const luuMutation = useMutation({
    mutationFn: luuChuKyCuaToi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chuKyCuaToi'] });
      Swal.fire({ icon: 'success', title: 'Đã lưu chữ ký cá nhân', timer: 1500, showConfirmButton: false });
    },
    onError: (err) => Swal.fire({ icon: 'error', title: 'Lỗi lưu chữ ký', text: err.message }),
    onSettled: () => setDangXuLyAnh(false),
  });

  const xoaMutation = useMutation({
    mutationFn: xoaChuKyCuaToi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chuKyCuaToi'] });
      Swal.fire({ icon: 'success', title: 'Đã xoá chữ ký', timer: 1500, showConfirmButton: false });
    },
    onError: (err) => Swal.fire({ icon: 'error', title: 'Lỗi xoá chữ ký', text: err.message }),
  });

  // ĐÃ THÊM: xử lý file ảnh chữ ký — theo đúng khuôn "Scan bảng điểm AI" của
  // ThamDinhPage.jsx (FileReader/canvas), NHƯNG khác 1 điểm quan trọng: xuất PNG
  // (không phải JPEG) để giữ nền trong suốt — JPEG không có kênh alpha, chữ ký sẽ
  // mang theo 1 ô nền trắng và che mất khung/đường kẻ bên dưới khi đóng vào văn bản.
  const handleChonAnh = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    setDangXuLyAnh(true);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_W = 500;
      const MAX_H = 250;
      let w = img.width;
      let h = img.height;
      const ty = Math.min(MAX_W / w, MAX_H / h, 1); // chỉ thu nhỏ, không phóng to ảnh bé
      w = Math.round(w * ty);
      h = Math.round(h * ty);
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const base64Full = canvas.toDataURL('image/png');
      const anhBase64 = base64Full.split(',')[1];
      luuMutation.mutate({ anhBase64, mimeType: 'image/png' });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => {
      setDangXuLyAnh(false);
      Swal.fire({ icon: 'error', title: 'Không đọc được ảnh', text: 'Vui lòng chọn lại file ảnh khác (PNG/JPEG).' });
    };
    img.src = URL.createObjectURL(file);
  };

  const handleXoaAnh = () => {
    Swal.fire({
      icon: 'question', title: 'Xoá chữ ký cá nhân?',
      text: 'Bạn sẽ không ký được văn bản nào cho tới khi tải chữ ký mới lên.',
      showCancelButton: true, confirmButtonText: 'Xoá', cancelButtonText: 'Huỷ', confirmButtonColor: '#dc3545'
    }).then((r) => { if (r.isConfirmed) xoaMutation.mutate(); });
  };

  // KHỐI 3 — Kết nối chữ ký số (CA)
  const { data: thongTinCa, isLoading: dangTaiCa } = useQuery({
    queryKey: ['thongTinCaCuaToi'],
    queryFn: layThongTinCaCuaToi,
  });

  const ketNoiMutation = useMutation({
    mutationFn: ketNoiChuKySo,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['thongTinCaCuaToi'] });
      setMaThueBaoNhap('');
      Swal.fire({
        icon: 'success', title: 'Đã kết nối chữ ký số',
        text: data?.tenChuSoHuu ? `Chủ sở hữu chứng thư: ${data.tenChuSoHuu}` : undefined,
      });
    },
    onError: (err) => Swal.fire({ icon: 'error', title: 'Không kết nối được', text: err.message }),
  });

  const xoaCaMutation = useMutation({
    mutationFn: xoaCaCuaToi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thongTinCaCuaToi'] });
      Swal.fire({ icon: 'success', title: 'Đã huỷ kết nối chữ ký số', timer: 1500, showConfirmButton: false });
    },
    onError: (err) => Swal.fire({ icon: 'error', title: 'Lỗi huỷ kết nối', text: err.message }),
  });

  const handleKetNoiCa = () => {
    const maThueBao = maThueBaoNhap.trim();
    if (!maThueBao) {
      Swal.fire({ icon: 'warning', title: 'Thiếu mã thuê bao', text: 'Vui lòng nhập mã thuê bao chữ ký số.' });
      return;
    }
    Swal.fire({
      icon: 'question', title: 'Xác thực chữ ký số này?',
      html: `Hệ thống sẽ liên hệ <b>${NHA_CUNG_CAP_CA.find(n => n.ma === nhaCungCapChon)?.ten}</b> để kiểm tra mã thuê bao <b>${maThueBao}</b> — quá trình này KHÔNG gửi thông báo xác nhận nào tới điện thoại của bạn, chỉ tra cứu.`,
      showCancelButton: true, confirmButtonText: 'Xác thực & kết nối', cancelButtonText: 'Huỷ',
    }).then((r) => {
      if (r.isConfirmed) ketNoiMutation.mutate({ nhaCungCap: nhaCungCapChon, maThueBao });
    });
  };

  const handleXoaCa = () => {
    Swal.fire({
      icon: 'question', title: 'Huỷ kết nối chữ ký số?',
      text: 'Bạn sẽ không dùng được lựa chọn "Ký số" cho tới khi kết nối lại.',
      showCancelButton: true, confirmButtonText: 'Huỷ kết nối', cancelButtonText: 'Đóng', confirmButtonColor: '#dc3545'
    }).then((r) => { if (r.isConfirmed) xoaCaMutation.mutate(); });
  };

  return (
    <div className="container-fluid py-4" style={{ maxWidth: 760 }}>
      <h4 className="fw-bold mb-4" style={{ color: '#037683' }}>
        <i className="bi bi-person-badge me-2"></i>HỒ SƠ CÁ NHÂN
      </h4>

      {/* KHỐI 1 — Thông tin tài khoản (chỉ đọc) */}
      <div className="card shadow-sm mb-4">
        <div className="card-body d-flex align-items-center gap-3">
          {currentUser.avatar ? (
            <img src={currentUser.avatar} alt="avatar" className="rounded-circle" width="56" height="56" />
          ) : (
            <i className="bi bi-person-circle" style={{ fontSize: 56, color: '#037683' }}></i>
          )}
          <div>
            <div className="fw-bold fs-5">{currentUser.name || currentUser.username || '—'}</div>
            <div className="text-muted small">{currentUser.username || ''}</div>
            <div className="text-muted small">Vai trò: {currentUser.role || (currentUser.roles || []).join(', ') || '—'}</div>
          </div>
        </div>
      </div>

      {/* KHỐI 2 — Chữ ký cá nhân */}
      <div className="card shadow-sm">
        <div className="card-header bg-white fw-bold">
          <i className="bi bi-pen me-2"></i>Chữ ký cá nhân
        </div>
        <div className="card-body">
          <p className="text-muted small mb-3">
            Ảnh chữ ký này sẽ được tự động đóng dấu vào văn bản khi bạn bấm "Ký" ở trang
            "Hồ sơ chờ ký". Nên dùng ảnh nền trong suốt (PNG) — ký trên giấy trắng, chụp/scan,
            cắt sát chữ ký, tách nền nếu có thể để đẹp nhất khi in ra.
          </p>

          {dangTaiChuKy ? (
            <div className="text-muted">Đang tải...</div>
          ) : chuKy?.coChuKy ? (
            <div className="mb-3">
              <div
                className="d-inline-block p-2 border rounded"
                style={{
                  backgroundImage: 'repeating-conic-gradient(#e9ecef 0% 25%, #fff 0% 50%)',
                  backgroundSize: '16px 16px',
                }}
              >
                <img
                  src={`data:${chuKy.mimeType || 'image/png'};base64,${chuKy.anhBase64}`}
                  alt="Chữ ký cá nhân"
                  style={{ maxWidth: 300, maxHeight: 150, display: 'block' }}
                />
              </div>
              <div className="text-muted small mt-1">Cập nhật lúc: {chuKy.capNhat || '—'}</div>
            </div>
          ) : (
            <div className="alert alert-warning py-2 px-3 mb-3">
              Bạn chưa có chữ ký cá nhân. Cần tải lên trước khi ký bất kỳ văn bản nào.
            </div>
          )}

          <input
            type="file" accept="image/png,image/jpeg" ref={fileInputRef}
            style={{ display: 'none' }} onChange={handleChonAnh}
          />
          <div className="d-flex gap-2">
            <button
              className="btn btn-primary btn-sm"
              disabled={dangXuLyAnh || luuMutation.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              {dangXuLyAnh || luuMutation.isPending ? '⏳ Đang lưu...' : (chuKy?.coChuKy ? '🔄 Đổi chữ ký' : '📤 Tải chữ ký lên')}
            </button>
            {chuKy?.coChuKy && (
              <button
                className="btn btn-outline-danger btn-sm"
                disabled={xoaMutation.isPending}
                onClick={handleXoaAnh}
              >
                {xoaMutation.isPending ? '⏳ Đang xoá...' : '🗑️ Xoá chữ ký'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KHỐI 3 — Kết nối chữ ký số (CA) */}
      <div className="card shadow-sm mt-4">
        <div className="card-header bg-white fw-bold">
          <i className="bi bi-patch-check me-2"></i>Chữ ký số (CA)
        </div>
        <div className="card-body">
          <p className="text-muted small mb-3">
            Ngoài chữ ký ảnh ở trên, bạn có thể kết nối chứng thư số (CA) của mình để ký các
            văn bản ở bước ký CUỐI CÙNG bằng chữ ký số pháp lý thay vì ảnh. Khi bấm "Ký" ở
            trang "Hồ sơ chờ ký", bạn sẽ được hỏi chọn ký bằng ảnh hay ký số mỗi lần.
          </p>

          {dangTaiCa ? (
            <div className="text-muted">Đang tải...</div>
          ) : thongTinCa?.coCA ? (
            <div className="mb-3">
              <div className="alert alert-success py-2 px-3 mb-2">
                <i className="bi bi-check-circle me-1"></i>
                Đã kết nối <b>{NHA_CUNG_CAP_CA.find(n => n.ma === thongTinCa.nhaCungCap)?.ten || thongTinCa.nhaCungCap}</b> —
                mã thuê bao: <b>{thongTinCa.maThueBao}</b>
              </div>
              <button
                className="btn btn-outline-danger btn-sm"
                disabled={xoaCaMutation.isPending}
                onClick={handleXoaCa}
              >
                {xoaCaMutation.isPending ? '⏳ Đang huỷ...' : '🗑️ Huỷ kết nối'}
              </button>
            </div>
          ) : (
            <div>
              <div className="alert alert-secondary py-2 px-3 mb-3">
                Bạn chưa kết nối chữ ký số nào. Đây là tính năng tuỳ chọn — không kết nối vẫn
                ký được văn bản bằng chữ ký ảnh như bình thường.
              </div>
              <div className="row g-2 align-items-end mb-2">
                <div className="col-sm-4">
                  <label className="form-label small mb-1">Nhà cung cấp</label>
                  <select
                    className="form-select form-select-sm"
                    value={nhaCungCapChon}
                    onChange={(e) => setNhaCungCapChon(e.target.value)}
                  >
                    {NHA_CUNG_CAP_CA.map((n) => (
                      <option key={n.ma} value={n.ma}>{n.ten}</option>
                    ))}
                  </select>
                </div>
                <div className="col-sm-5">
                  <label className="form-label small mb-1">Mã thuê bao</label>
                  <input
                    type="text" className="form-control form-control-sm"
                    placeholder="VD: số CCCD đã đăng ký SmartCA"
                    value={maThueBaoNhap}
                    onChange={(e) => setMaThueBaoNhap(e.target.value)}
                  />
                </div>
                <div className="col-sm-3">
                  <button
                    className="btn btn-primary btn-sm w-100"
                    disabled={ketNoiMutation.isPending}
                    onClick={handleKetNoiCa}
                  >
                    {ketNoiMutation.isPending ? '⏳ Đang xác thực...' : '🔗 Kết nối'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HoSoCaNhanPage;