import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { layChiTietHoSoKho, layBangDiemDaoTao } from '../../api/studentApi';
import './KhoSinhVien.css';

// ===================================================================
// TRANG CHI TIẾT 1 HỒ SƠ — ĐÃ THÊM theo yêu cầu: bấm vào 1 dòng ở trang Kho sẽ mở ra TRANG
// RIÊNG (không phải modal nữa — modal cũ đã bỏ) hiện đầy đủ thông tin hồ sơ đó, từ lịch sử
// tuyển sinh cho tới "hiện tại" (để trong ngoặc kép = còn để trống chỗ cho dữ liệu Đào
// tạo/Khảo thí/Tài chính sau này, khi các hệ thống đó được kết nối — xem 3 khối "Chưa kết
// nối" ở dưới).
//
// LƯU Ý về URL — đây CHỈ là 1 route con của CÙNG 1 trang React (dùng HashRouter, phần path
// nằm sau dấu #), KHÔNG phải tạo 1 trang/file HTML riêng cho mỗi sinh viên — nên KHÔNG tốn
// thêm lưu trữ nào cả, dù có 100 hay 1 triệu hồ sơ, mã nguồn (bundle JS) vẫn chỉ có đúng 1
// bản, chỉ đổi tham số trong URL rồi gọi API lấy đúng hồ sơ đó. Đổi từ modal sang route thật
// (dùng thẻ <Link>) cũng nhân tiện SỬA LUÔN lỗi bấm chọn/copy chữ trong bảng bị hiểu nhầm
// thành bấm mở hồ sơ (link thật thì trình duyệt tự phân biệt được kéo-chọn-chữ với
// bấm-để-mở, khác hẳn onClick gắn cho cả dòng <tr>).
//
// ĐÃ SỬA (theo phản hồi, tránh lộ CCCD + Ngành ngay trên thanh địa chỉ): route CHÍNH giờ là
// "/sprofile/student/:key8" (key8 = 8 ký tự cuối SV_KEY, xem KhoSinhVienPage.jsx). Route CŨ
// "/quan-ly-ho-so-moi/ho-so/:cccd/:nganh" vẫn còn (xem App.jsx) làm dự phòng cho hồ sơ chưa
// từng được gắn SV_KEY — component này tự nhận biết đang mở theo kiểu nào qua useParams().
//
// ĐÃ VIẾT LẠI (theo yêu cầu — "trang overview" tham khảo các hệ thống quản lý sinh viên
// thật): trang giờ chia TAB thay vì xếp chồng hết mọi khối lên nhau — "Thông tin nhanh" ở
// đầu trang vẫn LUÔN HIỆN (không nằm trong tab nào) vì đây là thứ cần thấy ngay bất kể đang
// xem tab gì, đúng kiểu "hồ sơ luôn có 1 khối tóm tắt cố định + tab bên dưới" hay gặp ở các
// trang hồ sơ nhân sự/CRM. 4 tab: "Tổng quan" (lịch sử hồ sơ + liên kết hệ thống khác),
// "Thông tin cá nhân" (toàn bộ dữ liệu đã nộp), "Điểm số" (MỚI — dữ liệu mirror từ hệ thống
// Đào tạo, xem TabDiemSo bên dưới + action 'layBangDiemDaoTao' bên Quanlysv.gs), "Dữ liệu
// gốc" (2 khối KETQUA/Đào tạo nguyên trạng, dành cho đối chiếu nâng cao).
// ===================================================================

const BADGE_MAU = {
  'Đang chờ duyệt': 'secondary',
  'Mới bổ sung': 'info',
  'Đã báo thiếu': 'warning',
  'Đã duyệt': 'primary',
  'Đã trúng tuyển': 'success',
  'Đã trúng tuyển (chờ bàn giao)': 'success',
  'Đã bàn giao Đào tạo': 'dark',
};

// ĐÃ SỬA: "Đào tạo (kết quả học tập hiện tại)" tách RIÊNG khỏi mảng này — giờ đã có dữ liệu
// thật (tab "Điểm số"), không còn là placeholder "chưa kết nối" nữa, xem khối bấm-để-chuyển-
// tab ngay phía trên chỗ .map(HE_THONG_TUONG_LAI) trong JSX. 2 hệ thống còn lại (Khảo thí/
// Tài chính) vẫn thật sự CHƯA kết nối nên giữ nguyên kiểu placeholder cũ.
const HE_THONG_TUONG_LAI = [
  { ten: 'Khảo thí', icon: 'bi-clipboard-check' },
  { ten: 'Tài chính / Kế toán', icon: 'bi-cash-coin' },
];

// Danh sách 4 tab của trang — đặt ở module scope để dùng chung cho cả thanh nav lẫn việc
// xét đang ở tab nào, tránh gõ lặp tên/icon ở 2 chỗ dễ bị lệch nhau khi sửa sau này.
const DS_TAB = [
  { id: 'tongquan', ten: 'Tổng quan', icon: 'bi-grid-1x2' },
  { id: 'canhan', ten: 'Thông tin cá nhân', icon: 'bi-person-vcard' },
  { id: 'diemso', ten: 'Điểm số', icon: 'bi-mortarboard' },
  { id: 'goc', ten: 'Dữ liệu gốc', icon: 'bi-database' },
];

// Bảng key-value đơn giản, dùng chung cho các khối "Dữ liệu đầy đủ" — bỏ qua nếu không có
// dữ liệu (null) hoặc rỗng. ĐÃ THÊM prop "loaiTru" (mảng tên cột cần ẩn) — dùng ở tab "Thông
// tin cá nhân" để bỏ các cột kỹ thuật (SV_KEY, Link hồ sơ...) và các cột đã tách sang card
// "Hồ sơ đã nộp" riêng (xem HoSoDaNop bên dưới), tránh hiện lặp 2 lần.
const BangKV = ({ tieuDe, data, loaiTru }) => {
  const entries = Object.entries(data || {}).filter(([k]) => !(loaiTru || []).includes(k));
  if (entries.length === 0) return null;
  return (
    <div className="card border-0 shadow-sm mb-3">
      <div className="card-body py-2">
        <div className="small fw-bold text-muted mb-2">{tieuDe}</div>
        <div className="table-responsive">
          <table className="table table-sm mb-0">
            <tbody>
              {entries.map(([k, v]) => (
                <tr key={k}>
                  <td className="text-muted" style={{ width: '35%', whiteSpace: 'nowrap' }}>{k}</td>
                  <td className="fw-medium">{String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ===================================================================
// ĐÃ THÊM (theo yêu cầu — tab "Thông tin cá nhân" gọn lại, thêm card "Hồ sơ đã nộp"): PORT
// lại cấu trúc DICT_HO_SO bên src/pages/ThamDinh/thamDinhConfig.js (đang dùng ở trang Thẩm
// định) nhưng đổi "cot" thành ĐÚNG tên cột thật trên sheet Trung Gian (XETTUYEN_TEMPLATE_
// HEADERS bên Quanlysv.gs) — vì ở đây đọc thẳng từ chiTietTrungGian (key = tên cột gốc),
// khác với bên Thẩm định vốn tra theo doc.id qua nhiều tên cột khả dĩ. Nếu sau này đổi tên
// cột nào bên Quanlysv.gs/XETTUYEN_TEMPLATE_HEADERS, PHẢI sửa lại đúng "cot" tương ứng ở đây.
// ===================================================================
const HO_SO_CHUNG = [
  { ten: 'Sơ yếu lý lịch', cot: 'SƠ YẾU LÝ LỊCH' },
  { ten: 'Bản sao ID', cot: 'BẢN SAO ID' },
  { ten: 'Ảnh thẻ', cot: 'ẢNH THẺ' },
];
// 2 loại hồ sơ này KHÔNG PHẢI ai cũng có (giấy ưu tiên chỉ SV thuộc diện ưu tiên, giấy NVQS
// chỉ SV nam) — theo yêu cầu, chỉ hiện dòng khi thực sự có dữ liệu ("có tick").
const HO_SO_CO_DIEU_KIEN = [
  { ten: 'Giấy tờ ưu tiên', cot: 'GIẤY TỜ ƯU TIÊN' },
  { ten: 'Giấy chuyển NVQS (với nam)', cot: 'GIẤY CHUYỂN NVQS (VỚI NAM)' },
];
// Hồ sơ "tiên quyết" khác nhau tuỳ "ĐỐI TƯỢNG ĐẦU VÀO" — chỉ hiện ĐÚNG 1 nhóm khớp với đối
// tượng của hồ sơ đang xem, không liệt kê cả 5 nhóm như trước.
const HO_SO_TIEN_QUYET = {
  'Tốt nghiệp THPT': [
    { ten: 'Phiếu đăng ký dự tuyển', cot: 'PHIẾU ĐĂNG KÝ DỰ TUYỂN' },
    { ten: 'Bản sao Bằng THPT/Giấy báo điểm', cot: 'BẢN SAO BẰNG THPT/GIẤY BÁO ĐIỂM' },
    { ten: 'Bản sao Học bạ THPT', cot: 'BẢN SAO HỌC BẠ THPT' },
  ],
  'Tốt nghiệp Trung cấp sau 2022': [
    { ten: 'Phiếu đăng ký dự tuyển', cot: 'PHIẾU ĐĂNG KÝ DỰ TUYỂN' },
    { ten: 'Bản sao bằng trung cấp (sau 2022)', cot: 'BẢN SAO BẰNG TRUNG CẤP (SAU 2022)' },
    { ten: 'Bảng điểm trung cấp (sau 2022)', cot: 'BẢNG ĐIỂM TRUNG CẤP (SAU 2022)' },
    { ten: 'Bằng THPT/GCN đủ KL KTVH THPT', cot: 'BẰNG THPT/GCN ĐỦ KL KTVH THPT' },
  ],
  'Tốt nghiệp Cao đẳng': [
    { ten: 'Phiếu đăng ký dự tuyển', cot: 'PHIẾU ĐĂNG KÝ DỰ TUYỂN' },
    { ten: 'Bằng Cao đẳng', cot: 'BẰNG CAO ĐẲNG' },
    { ten: 'Bảng điểm Cao đẳng', cot: 'BẢNG ĐIỂM CAO ĐẲNG' },
  ],
  'Tốt nghiệp Đại học': [
    { ten: 'Phiếu đăng ký dự tuyển', cot: 'PHIẾU ĐĂNG KÝ DỰ TUYỂN' },
    { ten: 'Bằng Đại học', cot: 'BẰNG ĐẠI HỌC' },
    { ten: 'Bảng điểm Đại học', cot: 'BẢNG ĐIỂM ĐẠI HỌC' },
  ],
  'Tốt nghiệp Trung cấp trước 2022': [
    { ten: 'Phiếu đăng ký dự tuyển', cot: 'PHIẾU ĐĂNG KÝ DỰ TUYỂN' },
    { ten: 'GCN hoàn thành CT GDPT', cot: 'GCN HOÀN THÀNH CT GDPT' },
    { ten: 'Bản sao Bằng TC trước 2022', cot: 'BẢN SAO BẰNG TRUNG CẤP TRƯỚC 2022' },
    { ten: 'Bảng điểm TC trước 2022', cot: 'BẢNG ĐIỂM TRUNG CẤP TRƯỚC 2022' },
  ],
  'Trung học nghề': [
    { ten: 'Phiếu đăng ký dự tuyển', cot: 'PHIẾU ĐĂNG KÝ DỰ TUYỂN' },
    { ten: 'GCN hoàn thành CT GDPT', cot: 'GCN HOÀN THÀNH CT GDPT' },
    { ten: 'Bản sao Bằng TC trước 2022', cot: 'BẢN SAO BẰNG TRUNG CẤP TRƯỚC 2022' },
    { ten: 'Bảng điểm TC trước 2022', cot: 'BẢNG ĐIỂM TRUNG CẤP TRƯỚC 2022' },
  ],
};

// Các cột KHÔNG hiện ở bảng "Thông tin đã nộp" (KV chung) trong tab "Thông tin cá nhân —
// gồm 3 nhóm: (1) cột kỹ thuật/nội bộ (SV_KEY, Link hồ sơ, Tài khoản nhập liệu) theo đúng
// yêu cầu; (2) điểm thi/điểm xét tuyển thô (môn thi + điểm TB/điểm cộng/điểm phỏng vấn) —
// đây là điểm ĐẦU VÀO lúc xét tuyển, khác với điểm HỌC TẬP thật ở tab "Điểm số"; (3) các cột
// hồ sơ/giấy tờ đã hiện riêng ở card "Hồ sơ đã nộp" (HoSoDaNop) ngay phía trên, bỏ khỏi đây
// để khỏi lặp lại 2 lần.
const KHOA_LOAI_TRU_THONG_TIN_CANHAN = [
  // ĐÃ THÊM "RAW_DIEM_HK" (theo phản hồi — còn sót dòng raw điểm): cột JSON nội bộ trên
  // Goc01 lưu chi tiết điểm từng Lớp/Kỳ (xem TOM_TAT_BAN_GIAO.md) — trang Thẩm định cũng
  // loại cột này khi xuất (ThamDinhPage.jsx/CAC_COT_LOAI_BO_KHI_XUAT), không phải thứ người
  // xem hồ sơ cần thấy dạng chuỗi JSON thô.
  'SV_KEY', 'LINK HỒ SƠ', 'TÀI KHOẢN NHẬP LIỆU', 'RAW_DIEM_HK',
  'TOÁN', 'VẬT LÍ', 'HÓA HỌC', 'SINH HỌC', 'NGỮ VĂN', 'LỊCH SỬ', 'ĐỊA LÝ',
  'TIẾNG ANH', 'TIẾNG TRUNG', 'TIN HỌC', 'GDKTPL',
  'ĐIỂM TB TOÀN KHÓA HỆ 4', 'ĐIỂM TB TOÀN KHÓA HỆ 10', 'ĐIỂM CỘNG', 'ĐIỂM PHỎNG VẤN',
  'PHIẾU ĐĂNG KÝ DỰ TUYỂN', 'SƠ YẾU LÝ LỊCH', 'BẢN SAO ID', 'ẢNH THẺ',
  'GIẤY CHUYỂN NVQS (VỚI NAM)', 'BẢN SAO BẰNG THPT/GIẤY BÁO ĐIỂM', 'BẢN SAO HỌC BẠ THPT',
  'BẢN SAO BẰNG TRUNG CẤP (SAU 2022)', 'BẢNG ĐIỂM TRUNG CẤP (SAU 2022)', 'BẰNG THPT/GCN ĐỦ KL KTVH THPT',
  'BẢN SAO BẰNG TRUNG CẤP TRƯỚC 2022', 'BẢNG ĐIỂM TRUNG CẤP TRƯỚC 2022', 'GCN HOÀN THÀNH CT GDPT',
  'BẰNG CAO ĐẲNG', 'BẢNG ĐIỂM CAO ĐẲNG', 'BẰNG ĐẠI HỌC', 'BẢNG ĐIỂM ĐẠI HỌC', 'GIẤY TỜ ƯU TIÊN',
];

// Card "Hồ sơ đã nộp" — thay cho việc liệt kê lẫn lộn các cột giấy tờ trong bảng KV chung.
// Luôn hiện nhóm "chung"; 2 loại "có điều kiện" (ưu tiên/NVQS) chỉ hiện khi có dữ liệu; nhóm
// "tiên quyết" chỉ hiện ĐÚNG 1 bộ khớp "ĐỐI TƯỢNG ĐẦU VÀO" của hồ sơ.
const HoSoDaNop = ({ chiTietTrungGian }) => {
  if (!chiTietTrungGian) return null;
  const doiTuongDauVao = chiTietTrungGian['ĐỐI TƯỢNG ĐẦU VÀO'];
  const dsTienQuyet = HO_SO_TIEN_QUYET[doiTuongDauVao] || [];
  const dsCoDieuKien = HO_SO_CO_DIEU_KIEN.filter((hs) => !!chiTietTrungGian[hs.cot]);
  const dsHienThi = [...HO_SO_CHUNG, ...dsCoDieuKien, ...dsTienQuyet];
  return (
    <div className="card border-0 shadow-sm mb-3">
      <div className="card-body py-2">
        <div className="small fw-bold text-muted mb-2">
          Hồ sơ đã nộp{doiTuongDauVao ? <span className="fw-normal"> — nhóm "{doiTuongDauVao}"</span> : ''}
        </div>
        {!doiTuongDauVao && (
          <div className="small text-muted fst-italic mb-2">
            Hồ sơ chưa có "Đối tượng đầu vào" nên chưa xác định được nhóm hồ sơ tiên quyết tương ứng.
          </div>
        )}
        <div className="table-responsive">
          <table className="table table-sm mb-0">
            <tbody>
              {dsHienThi.map((hs) => (
                <tr key={hs.cot}>
                  <td className="fw-medium">{hs.ten}</td>
                  <td style={{ width: 40 }} className="text-end">
                    {chiTietTrungGian[hs.cot]
                      ? <i className="bi bi-check-circle-fill text-success"></i>
                      : <i className="bi bi-dash-circle text-muted"></i>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ĐÃ THÊM (theo yêu cầu — cột "Điểm hệ 4"/"Điểm chữ" + xếp loại ở tab "Điểm số"): bảng quy
// đổi điểm hệ 10 sang hệ chữ/hệ 4/xếp loại — copy đúng bảng quy chế đào tạo tín chỉ (ảnh
// người dùng gửi). Sắp xếp GIẢM DẦN theo "min" để chỉ cần so ">= min" là ra đúng bậc, không
// cần chặn cả 2 đầu. CHỈ áp dụng khi điểm gốc là SỐ — nhiều môn bên Đào tạo ghi điểm bằng
// chữ (VD "Đạt"/"Miễn"...), những môn đó không quy đổi được, quyDoiDiem10 trả về null.
const BANG_QUY_DOI_DIEM = [
  { min: 9.5, chu: 'A+', he4: 4.0, xepLoai: 'Giỏi' },
  { min: 8.5, chu: 'A', he4: 3.8, xepLoai: 'Giỏi' },
  { min: 8.0, chu: 'B+', he4: 3.5, xepLoai: 'Khá' },
  { min: 7.0, chu: 'B', he4: 3.0, xepLoai: 'Khá' },
  { min: 6.5, chu: 'C+', he4: 2.5, xepLoai: 'Trung bình' },
  { min: 5.5, chu: 'C', he4: 2.0, xepLoai: 'Trung bình' },
  { min: 5.0, chu: 'D+', he4: 1.5, xepLoai: 'Trung bình yếu' },
  { min: 4.0, chu: 'D', he4: 1.0, xepLoai: 'Trung bình yếu' },
  { min: 0, chu: 'F', he4: 0.0, xepLoai: 'Kém' },
];
const quyDoiDiem10 = (diem10) => {
  if (typeof diem10 !== 'number' || isNaN(diem10)) return null;
  return BANG_QUY_DOI_DIEM.find((b) => diem10 >= b.min) || null;
};

// ĐÃ THÊM: nội dung tab "Điểm số" — tách thành component con để tự gọi useQuery riêng
// (chỉ tab này cần thêm 1 API phụ, không ảnh hưởng gì tới query chính "layChiTietHoSoKho").
// enabled: false cho tới khi có đủ nganh + maSinhVien (2 thứ này lấy từ chính dữ liệu hồ sơ
// đã tải ở component cha) — tránh gọi API với tham số rỗng.
const TabDiemSo = ({ nganh, maSinhVien }) => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['bangDiemDaoTao', nganh, maSinhVien],
    queryFn: () => layBangDiemDaoTao(nganh, maSinhVien),
    enabled: !!nganh && !!maSinhVien,
  });

  if (!maSinhVien) {
    return (
      <div className="alert alert-secondary mb-0">
        <i className="bi bi-info-circle me-1"></i>
        Hồ sơ chưa có Mã sinh viên nên chưa tra được điểm bên hệ thống Đào tạo.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-center py-4">
        <div className="spinner-border spinner-border-sm text-primary"></div>
      </div>
    );
  }

  if (isError) {
    return <div className="alert alert-danger mb-0">Không tải được bảng điểm: {error?.message}</div>;
  }

  // ĐÃ THÊM: dịch mã "lyDo" (backend trả về khi coDuLieu:false) sang câu chữ dễ hiểu — xem
  // đầy đủ các mã này tại action 'layBangDiemDaoTao' bên Quanlysv.gs.
  const LY_DO_HIEN_THI = {
    CHUA_CAU_HINH_NGANH: 'Ngành này chưa được cấu hình liên kết dữ liệu điểm với hệ thống Đào tạo.',
    KHONG_THAY_SHEET: 'Chưa tìm thấy đúng sheet điểm cho ngành này (có thể tên sheet vừa đổi bên Đào tạo).',
    SHEET_RONG: 'Sheet điểm của ngành này hiện chưa có dữ liệu.',
    KHONG_THAY_SV: 'Chưa tìm thấy dữ liệu điểm của sinh viên này bên Đào tạo (Mã sinh viên chưa khớp, hoặc chưa có kết quả học tập kỳ nào).',
  };

  if (!data || !data.coDuLieu) {
    return (
      <div className="alert alert-secondary mb-0">
        <i className="bi bi-info-circle me-1"></i>
        {LY_DO_HIEN_THI[data?.lyDo] || 'Chưa có dữ liệu điểm.'}
      </div>
    );
  }

  if (data.monHoc.length === 0) {
    return <div className="alert alert-secondary mb-0">Tìm thấy sinh viên trong bảng điểm nhưng chưa có môn nào ghi điểm.</div>;
  }

  // ĐÃ THÊM: tính khối tóm tắt (điểm TB có trọng số tín chỉ, số môn đạt/chưa đạt, xếp loại
  // học lực) — CHỈ tính trên các môn có ĐIỂM SỐ (numeric) VÀ có tín chỉ hợp lệ (số > 0); môn
  // ghi điểm bằng chữ (VD "Đạt"/"Miễn"...) vẫn hiện đủ ở bảng chi tiết bên dưới nhưng không
  // đưa vào phép tính này, vì không có cách nào suy ra 1 con số cụ thể để cộng vào điểm TB.
  let tongDiemNhanTinChi = 0, tongTinChiTinhDiem = 0, soMonDat = 0, soMonChuaDat = 0;
  data.monHoc.forEach((m) => {
    if (typeof m.diem !== 'number' || isNaN(m.diem)) return;
    if (m.diem >= 4.0) soMonDat++; else soMonChuaDat++;
    const tc = Number(m.tinChi);
    if (!isNaN(tc) && tc > 0) {
      tongDiemNhanTinChi += m.diem * tc;
      tongTinChiTinhDiem += tc;
    }
  });
  const diemTBHe10 = tongTinChiTinhDiem > 0 ? tongDiemNhanTinChi / tongTinChiTinhDiem : null;
  const xepLoaiChung = diemTBHe10 !== null ? quyDoiDiem10(diemTBHe10) : null;

  return (
    <>
      {/* ĐÃ THÊM: "thẻ chỉ số" tóm tắt đặt TRÊN bảng chi tiết từng môn — kiểu bố cục rất phổ
          biến ở các cổng đào tạo thật (VD PowerSchool "Grades" luôn có GPA nổi bật ở đầu
          trang trước khi liệt kê từng môn). */}
      <div className="row g-2 mb-3">
        <div className="col-6 col-md-3">
          <div className="border rounded p-2 text-center h-100">
            <div className="text-muted small">Điểm TB (hệ 10)</div>
            <div className="fs-4 fw-bold">{diemTBHe10 !== null ? diemTBHe10.toFixed(2) : '-'}</div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="border rounded p-2 text-center h-100">
            <div className="text-muted small">Điểm TB (hệ 4) — Xếp loại</div>
            <div className="fs-4 fw-bold">{xepLoaiChung ? xepLoaiChung.he4.toFixed(1) : '-'}</div>
            <div className="small text-muted">{xepLoaiChung ? xepLoaiChung.xepLoai : ''}</div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="border rounded p-2 text-center h-100">
            <div className="text-muted small">Số môn đạt / chưa đạt</div>
            <div className="fs-4 fw-bold">
              <span className="text-success">{soMonDat}</span> / <span className="text-danger">{soMonChuaDat}</span>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="border rounded p-2 text-center h-100">
            <div className="text-muted small">Tín chỉ tích luỹ</div>
            <div className="fs-4 fw-bold">
              {data.tongTinChiHoanThanh ?? '-'}{data.tongTinChiCanHoc ? ` / ${data.tongTinChiCanHoc}` : ''}
            </div>
          </div>
        </div>
      </div>

      <div className="table-responsive">
        {/* ĐÃ CHỌN: xoay bảng lại (mỗi môn 1 dòng, "Môn học | Điểm") thay vì để ngang như trong
            sheet gốc (mỗi môn 1 cột) — dễ đọc hơn hẳn, nhất là trên điện thoại, đúng kiểu bảng
            điểm/transcript hay thấy ở cổng đào tạo các trường. Cột "Điểm" giữ NGUYÊN dữ liệu
            thô từ backend (có cả số lẫn chữ tuỳ môn) — không tô màu/xếp loại gì thêm ở CHÍNH
            cột này vì quy ước điểm của Đào tạo chưa thống nhất 1 kiểu duy nhất để suy luận
            Đạt/Chưa đạt cho đúng. 2 cột "Điểm hệ 4"/"Điểm chữ" MỚI THÊM chỉ quy đổi được khi
            điểm gốc là số — môn ghi điểm bằng chữ hiện "-" ở 2 cột này. */}
        <table className="table table-sm table-striped table-bordered mb-0 align-middle">
          <thead className="table-light">
            <tr>
              <th style={{ width: '46%' }}>Môn học</th>
              <th className="text-center">Điểm</th>
              <th className="text-center">Điểm hệ 4</th>
              <th className="text-center">Điểm chữ</th>
            </tr>
          </thead>
          <tbody>
            {data.monHoc.map((m, idx) => {
              const qd = quyDoiDiem10(m.diem);
              return (
                <tr key={idx}>
                  <td>{m.mon}</td>
                  <td className="text-center fw-bold">{m.diem}</td>
                  <td className="text-center">{qd ? qd.he4.toFixed(1) : '-'}</td>
                  <td className="text-center">{qd ? qd.chu : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
};

const ChiTietHoSoKhoPage = () => {
  // key8 -> route chính "/sprofile/student/:key8"; cccd/nganh -> route dự phòng cũ
  // "/quan-ly-ho-so-moi/ho-so/:cccd/:nganh" (chỉ khớp 1 trong 2 kiểu tuỳ đang ở route nào).
  const { key8, cccd, nganh } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('tongquan');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['khoChiTietHoSo', key8, cccd, nganh],
    queryFn: () => layChiTietHoSoKho({ key8, cccd, nganh }),
  });

  const handlePrint = () => window.print();

  if (isLoading) {
    return (
      <div className="container-fluid py-5 text-center">
        <div className="spinner-border text-primary"></div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="container-fluid py-4">
        <button className="btn btn-sm btn-outline-secondary mb-3" onClick={() => navigate('/quan-ly-ho-so-moi')}>
          <i className="bi bi-arrow-left me-1"></i>Quay lại Kho tra cứu
        </button>
        <div className="alert alert-danger">Không tải được hồ sơ: {error?.message || 'Không tìm thấy.'}</div>
      </div>
    );
  }

  return (
    <div className="container-fluid py-3 kho-print-area">
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <button className="btn btn-sm btn-outline-secondary" onClick={() => navigate('/quan-ly-ho-so-moi')}>
            <i className="bi bi-arrow-left"></i>
          </button>
          <h4 className="fw-bold mb-0">{data.hoTen}</h4>
          <span className={`badge bg-${BADGE_MAU[data.trangThai] || 'secondary'}`}>{data.trangThai}</span>
        </div>
        <button className="btn btn-sm btn-outline-primary" onClick={handlePrint}>
          <i className="bi bi-printer me-1"></i>In nhanh
        </button>
      </div>

      {/* ---- Thông tin nhanh — LUÔN HIỆN, không nằm trong tab nào (đúng ý cần thấy ngay bất
          kể đang xem tab gì). ---- */}
      <div className="card border-0 shadow-sm mb-3">
        <div className="card-body py-2">
          <div className="row g-2 small">
            <div className="col-6 col-md-3"><span className="text-muted">CCCD:</span> <strong>{data.cccd}</strong></div>
            <div className="col-6 col-md-3"><span className="text-muted">Mã sinh viên:</span> <strong>{data.maSinhVien || 'Chưa có'}</strong></div>
            <div className="col-6 col-md-3"><span className="text-muted">Ngành:</span> <strong>{data.nganh}</strong></div>
            <div className="col-6 col-md-3"><span className="text-muted">Khóa:</span> <strong>{data.khoa}</strong></div>
            <div className="col-6 col-md-3"><span className="text-muted">Hệ đào tạo:</span> <strong>{data.heDaoTao}</strong></div>
            <div className="col-6 col-md-3"><span className="text-muted">Hình thức đào tạo:</span> <strong>{data.hinhThucDaoTao}</strong></div>
            <div className="col-6 col-md-3"><span className="text-muted">Năm xét tuyển:</span> <strong>{data.namXetTuyen}</strong></div>
            <div className="col-6 col-md-3"><span className="text-muted">Kênh nộp:</span> <strong>{data.kenhNop || 'Xét tuyển online'}</strong></div>
          </div>
        </div>
      </div>

      {/* ---- Thanh tab — ẩn hẳn khi in (bấm chọn tab không có ý nghĩa gì trên giấy), các
          tab-pane bên dưới tự quyết định pane nào vẫn hiện khi in qua class riêng (xem
          KhoSinhVien.css: .kho-print-tab-force ép hiện, .kho-hide-on-print ép ẩn — không phụ
          thuộc đang chọn tab nào trên màn hình lúc bấm in). ---- */}
      <ul className="nav nav-tabs kho-hide-on-print mb-3">
        {DS_TAB.map((tab) => (
          <li className="nav-item" key={tab.id}>
            <button
              type="button"
              className={`nav-link ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <i className={`bi ${tab.icon} me-1`}></i>{tab.ten}
            </button>
          </li>
        ))}
      </ul>

      <div className="tab-content">
        {/* ---- TAB Tổng quan: lịch sử hồ sơ + liên kết hệ thống khác — LUÔN hiện khi in
            (kho-print-tab-force), giống hành vi cũ (2 khối này trước đây không nằm trong
            .kho-hide-on-print). ---- */}
        <div className={`tab-pane kho-print-tab-force ${activeTab === 'tongquan' ? 'active' : ''}`}>
          <div className="card border-0 shadow-sm mb-3">
            <div className="card-body py-3">
              <div className="small fw-bold text-muted mb-3">Lịch sử hồ sơ</div>
              <div className="kho-timeline">
                {data.timeline.map((buoc, idx) => (
                  <div key={idx} className={`kho-timeline-buoc ${buoc.xong ? 'kho-timeline-xong' : 'kho-timeline-chua'}`}>
                    <div className="kho-timeline-cham"><i className={`bi ${buoc.xong ? 'bi-check-lg' : 'bi-hourglass-split'}`}></i></div>
                    <div className="kho-timeline-noidung">
                      <div className="fw-bold">{buoc.buoc}</div>
                      <div className="text-muted small">{buoc.ngay || (buoc.xong ? '' : 'Chưa tới bước này')}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card border-0 shadow-sm mb-3">
            <div className="card-body py-3">
              <div className="small fw-bold text-muted mb-2">Liên kết dữ liệu với hệ thống khác</div>
              <div className="mb-3">
                <span className="text-muted small">Mã liên kết (mã sinh viên):</span>{' '}
                <span className="badge bg-primary-subtle text-primary-emphasis border border-primary-subtle fs-6">
                  {data.maSinhVien || 'Chưa có (thiếu năm xét tuyển/hệ/hình thức hoặc CCCD)'}
                </span>
              </div>
              {data.maPhu && data.maPhu.length > 0 && (
                <div className="mb-3">
                  <div className="text-muted small mb-1">Mã định danh đang liên kết:</div>
                  <div className="table-responsive">
                    <table className="table table-sm mb-0">
                      <thead><tr><th>Loại mã</th><th>Giá trị</th><th>Nguồn cấp</th><th>Hiệu lực từ</th></tr></thead>
                      <tbody>
                        {data.maPhu.map((m, idx) => (
                          <tr key={idx}><td>{m.loaiMa}</td><td>{m.giaTri}</td><td>{m.nguonCap}</td><td>{m.hieuLucTu}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div className="row g-2">
                {/* ĐÃ SỬA: "Đào tạo (kết quả học tập hiện tại)" giờ là 1 nút BẤM ĐƯỢC (đã có
                    dữ liệu thật ở tab "Điểm số"), khác hẳn kiểu viền đứt nét "Chưa kết nối"
                    của 2 khối còn lại — bấm vào để nhảy thẳng sang tab đó. */}
                <div className="col-md-4">
                  <button type="button" className="btn btn-outline-primary w-100 h-100 text-center py-2" onClick={() => setActiveTab('diemso')}>
                    <i className="bi bi-mortarboard fs-4 d-block mb-1"></i>
                    <div className="small fw-bold">Đào tạo (tiến độ học tập hiện tại)</div>
                  </button>
                </div>
                {HE_THONG_TUONG_LAI.map((ht) => (
                  <div className="col-md-4" key={ht.ten}>
                    <div className="border rounded p-2 text-center text-muted kho-placeholder-he-thong">
                      <i className={`bi ${ht.icon} fs-4 d-block mb-1`}></i>
                      <div className="small fw-bold">{ht.ten}</div>
                      <div className="small">Chưa kết nối</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ---- TAB Thông tin cá nhân — ẨN khi in (kho-hide-on-print), giữ đúng hành vi cũ
            (dữ liệu thô này chưa từng được in). ĐÃ SỬA (theo phản hồi): bỏ bảng dump "Toàn bộ
            dữ liệu đã nộp" liệt kê lẫn lộn mọi cột — thay bằng card "Hồ sơ đã nộp" (HoSoDaNop,
            đúng nhóm chung/tiên quyết/có điều kiện) + 1 bảng KV còn lại đã LỌC BỚT cột kỹ
            thuật (SV_KEY/Link hồ sơ/Tài khoản nhập liệu) và cột điểm xét tuyển thô (đã có tab
            "Điểm số" riêng cho điểm thật) — xem KHOA_LOAI_TRU_THONG_TIN_CANHAN phía trên. ---- */}
        <div className={`tab-pane kho-hide-on-print ${activeTab === 'canhan' ? 'active' : ''}`}>
          <HoSoDaNop chiTietTrungGian={data.chiTietTrungGian} />
          <BangKV tieuDe="Thông tin sinh viên" data={data.chiTietTrungGian} loaiTru={KHOA_LOAI_TRU_THONG_TIN_CANHAN} />
        </div>

        {/* ---- TAB Điểm số (MỚI) — LUÔN hiện khi in, xem TabDiemSo phía trên. ---- */}
        <div className={`tab-pane kho-print-tab-force ${activeTab === 'diemso' ? 'active' : ''}`}>
          <div className="card border-0 shadow-sm mb-3">
            <div className="card-body py-3">
              <div className="small fw-bold text-muted mb-3">Điểm số (dữ liệu từ Đào tạo)</div>
              <TabDiemSo nganh={data.nganh} maSinhVien={data.maSinhVien} />
            </div>
          </div>
        </div>

        {/* ---- TAB Dữ liệu gốc: KETQUA + Đào tạo nguyên trạng — ẨN khi in, giữ đúng hành vi
            cũ. ---- */}
        <div className={`tab-pane kho-hide-on-print ${activeTab === 'goc' ? 'active' : ''}`}>
          <BangKV tieuDe="Dữ liệu tại KETQUA (đã duyệt trúng tuyển)" data={data.chiTietKetQua} />
          <BangKV tieuDe="Dữ liệu đã bàn giao Đào tạo" data={data.chiTietDaoTao} />
        </div>
      </div>
    </div>
  );
};

export default ChiTietHoSoKhoPage;