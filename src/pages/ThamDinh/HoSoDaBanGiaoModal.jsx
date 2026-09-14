// ĐÃ THÊM (tinh chỉnh UI/UX — modal xem NHANH cho hồ sơ đã bàn giao): dùng ở trang XÉT
// TUYỂN, trong tính năng "🔍 Tìm hồ sơ cũ" (XetTuyenPage.jsx) — khi nhân viên nhập liệu
// bấm vào 1 kết quả tìm kiếm ĐÃ được bàn giao sang Đào tạo/CTSV, thay vì đẩy hồ sơ lên
// form để sửa (vô nghĩa/nguy hiểm với 1 hồ sơ đã xử lý xong) thì hiện modal CHỈ-ĐỌC này.
// KHÔNG có nút thao tác nào ngoài "Đóng" — đây thuần tuý là xem lại, không có "Hoàn tác
// bàn giao" ở đây (hành động đó thuộc quyền/ngữ cảnh của trang Thẩm định, xem
// ThamDinhPage.jsx — trang Xét tuyển không có nút này).
//
// Khối 1: bảng 2 cột (tiêu đề/nội dung) — thông tin hồ sơ cơ bản (đọc thẳng từ `row`,
// TrungGian cấp) + dữ liệu đã lưu CSDL (`ketQuaLuuCSDL`, do backend cấp — xem
// layKetQuaFullMap_/hdPost_searchOldRecord, TuyenSinh.gs) NẾU hồ sơ từng được "💾 Lưu
// CSDL". CỐ TÌNH KHÔNG hiện: điểm "thô" (RAW_DIEM_HK/RAW_DIEM_KHAC_1/2 — JSON nội bộ từng
// môn, không dành để đọc trực tiếp) và "TÀI KHOẢN NHẬP LIỆU" (theo yêu cầu — modal này chỉ
// để xem thông tin hồ sơ, không phải để lộ ai đã nhập liệu).
// Khối 2: trạng thái xử lý hồ sơ (thẩm định / lưu CSDL / bàn giao) — CHƯA gồm trạng thái ký
// GBTT (cần thêm 1 lượt tra cứu YeuCauKy theo CCCD+Ngành, để dành làm sau nếu thấy cần).
import React from 'react';

// Các cột đã hiển thị riêng ở Khối 1 (thông tin hồ sơ cơ bản), CỘT NỘI BỘ (điểm thô/tài
// khoản nhập liệu) — bỏ qua khi liệt kê tiếp dữ liệu ketQuaLuuCSDL để tránh lặp lại/lộ
// thông tin không nên hiện ở đây.
const KHOI1_BO_QUA = new Set([
  'CĂN CƯỚC', 'SỐ CCCD', 'CCCD', 'NGÀNH', 'NGÀNH ĐÀO TẠO', 'HỌ VÀ TÊN', 'TÊN SINH VIÊN',
  'MÃ SINH VIÊN', 'MÃ SV', 'NGÀY SINH', 'KHÓA', 'HỆ ĐÀO TẠO', 'HÌNH THỨC ĐÀO TẠO', 'NĂM XÉT TUYỂN',
  'TÀI KHOẢN NHẬP LIỆU', 'RAW_DIEM_HK', 'RAW_DIEM_KHAC_1', 'RAW_DIEM_KHAC_2',
]);
// Phòng trường hợp có thêm RAW_DIEM_KHAC_3/4/... sau này (đã thấy nhắc tới khả năng này
// trong ghi chú của XetTuyenPage.jsx) — chặn theo TIỀN TỐ thay vì liệt kê hết từng cái.
const laCotNoiBo = (tenCot) => {
  const c = String(tenCot || '').toUpperCase();
  return KHOI1_BO_QUA.has(c) || c.startsWith('RAW_DIEM') || c.startsWith('TÀI KHOẢN');
};

const HoSoDaBanGiaoModal = ({ row, ketQuaLuuCSDL, getVal, generateMaSV, onClose }) => {
  const hoTen = getVal(row, ['TÊN SINH VIÊN', 'HỌ VÀ TÊN']);

  const hoSoCoBan = [
    ['Mã sinh viên', generateMaSV(row)],
    ['Họ và tên', hoTen],
    ['Căn cước công dân', getVal(row, ['CĂN CƯỚC', 'CCCD', 'SỐ CCCD'])],
    ['Ngày sinh', getVal(row, ['NGÀY SINH'])],
    ['Ngành', getVal(row, ['NGÀNH', 'NGÀNH ĐÀO TẠO'])],
    ['Khóa', getVal(row, ['KHÓA'])],
    ['Hệ đào tạo', getVal(row, ['HỆ ĐÀO TẠO'])],
    ['Hình thức đào tạo', getVal(row, ['HÌNH THỨC ĐÀO TẠO'])],
    ['Năm xét tuyển', getVal(row, ['NĂM XÉT TUYỂN'])],
  ].filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '');

  const hangKetQua = ketQuaLuuCSDL
    ? Object.entries(ketQuaLuuCSDL).filter(([k, v]) => !laCotNoiBo(k) && String(v || '').trim() !== '')
    : [];

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-dialog modal-lg modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header bg-light">
            <h5 className="modal-title fw-bold">🔒 Hồ sơ đã bàn giao Đào tạo — {hoTen}</h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            <div className="alert alert-secondary small mb-3">
              Hồ sơ này đã được bàn giao sang Phòng Đào tạo/CTSV — chỉ xem lại thông tin ở đây, không sửa được nữa.
            </div>

            <h6 className="fw-bold mb-2">📋 Thông tin hồ sơ</h6>
            <div className="table-responsive mb-3">
              <table className="table table-sm table-bordered mb-0">
                <tbody>
                  {hoSoCoBan.map(([tieuDe, noiDung]) => (
                    <tr key={tieuDe}>
                      <th className="bg-light" style={{ width: '38%' }}>{tieuDe}</th>
                      <td>{String(noiDung)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {ketQuaLuuCSDL ? (
              <>
                <h6 className="fw-bold mb-2">🎓 Kết quả đã lưu CSDL (điểm / số môn / tín chỉ công nhận dự kiến...)</h6>
                <div className="table-responsive mb-3">
                  <table className="table table-sm table-bordered mb-0">
                    <tbody>
                      {hangKetQua.length === 0 ? (
                        <tr><td className="text-muted fst-italic">Không có thêm dữ liệu chi tiết nào khác ngoài thông tin hồ sơ ở trên.</td></tr>
                      ) : hangKetQua.map(([tieuDe, noiDung]) => (
                        <tr key={tieuDe}>
                          <th className="bg-light" style={{ width: '38%' }}>{tieuDe}</th>
                          <td>{String(noiDung)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="alert alert-warning small mb-3">
                Hồ sơ này CHƯA từng được "💾 Lưu CSDL" trước khi bàn giao — không còn giữ được chi tiết điểm/tín chỉ công nhận.
              </div>
            )}

            <h6 className="fw-bold mb-2">📌 Trạng thái xử lý</h6>
            <ul className="list-group list-group-flush small">
              <li className="list-group-item">✅ Đã duyệt trúng tuyển</li>
              <li className="list-group-item">{ketQuaLuuCSDL ? '✅' : '➖'} Đã lưu vào CSDL</li>
              <li className="list-group-item">✅ Đã bàn giao Đào tạo/CTSV</li>
            </ul>
          </div>
          <div className="modal-footer">
            <button className="btn btn-outline-secondary" onClick={onClose}>Đóng</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HoSoDaBanGiaoModal;