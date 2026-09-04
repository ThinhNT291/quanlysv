import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { timKiemHoSoDinhDanh, xemTruocGopDinhDanh, gopHoSoDinhDanh, fetchGoiYCapNghiTrungDinhDanh, fetchSoLuongCapNghiTrungDinhDanh } from '../../api/studentApi';

// ĐÃ THÊM (PHA 1·D2 — "Gộp 2 hồ sơ định danh đã tồn tại"): KHÁC với bảng "Hàng đợi" ở
// XacNhanDinhDanhPage — bảng đó xử lý 1 dòng MỚI vừa nhập chưa có sv_key riêng. Ở đây là ca
// 2 sv_key ĐÃ TỒN TẠI TỪ TRƯỚC (mỗi cái đã có mã phụ/hồ sơ tuyển sinh riêng), sau này mới
// phát hiện là cùng 1 người — mượn khung "source/target" của thao tác chuẩn FHIR Patient
// $merge để đặt tên "nguồn/đích" cho rõ chiều gộp.
//
// AN TOÀN — không có nút hoàn tác tự động, nên bắt buộc luồng: chọn nguồn+đích -> Xem
// trước (chỉ đọc, hiện số liệu) -> gõ lại đúng tên hồ sơ đích để mở khoá nút xác nhận ->
// Swal xác nhận lần 2 -> mới thật sự ghi. Đổi kết quả tìm kiếm hoặc đổi lựa chọn nguồn/đích
// đều huỷ preview cũ, tránh xác nhận nhầm dữ liệu cũ.
const GopHoSoDinhDanhPanel = () => {
  // ĐÃ SỬA: mặc định MỞ SẴN (trước là false, phải bấm mới mở) — giờ cả khối này chỉ được
  // render ra khi thật sự có gì đáng chú ý (xem điều kiện ẩn/hiện ở return bên dưới), nên
  // không cần bắt bấm thêm 1 lần nữa mới thấy nội dung.
  const [moRong, setMoRong] = useState(true);
  const [tuKhoa, setTuKhoa] = useState('');
  const [dangTim, setDangTim] = useState(false);
  const [ketQua, setKetQua] = useState([]);
  const [daTimChua, setDaTimChua] = useState(false);
  const [svKeyNguon, setSvKeyNguon] = useState('');
  const [svKeyDich, setSvKeyDich] = useState('');
  const [xemTruoc, setXemTruoc] = useState(null);
  const [dangXemTruoc, setDangXemTruoc] = useState(false);
  const [goXacNhan, setGoXacNhan] = useState('');
  const [dangGop, setDangGop] = useState(false);

  // ĐÃ THÊM — "Gợi ý cặp nghi trùng": trước đây phải TỰ BIẾT tên/CCCD để gõ tìm, giờ quét
  // sẵn hoso_dinh_danh, nhóm theo tên+ngày sinh, liệt kê ra đây để bấm thẳng vào bảng chọn
  // bên dưới thay vì gõ tìm mò.
  const [goiY, setGoiY] = useState([]);
  const [dangTaiGoiY, setDangTaiGoiY] = useState(false);
  const [daTaiGoiY, setDaTaiGoiY] = useState(false);

  // ĐÃ THÊM — theo yêu cầu: cả khối này CHỈ hiện khi có hồ sơ nghi trùng, thay vì luôn
  // hiện (dù thu gọn) như trước. Tự quét số lượng nhóm nghi trùng ngay khi vào trang, làm
  // mới mỗi 60s — CÙNG CƠ CHẾ với "cần xác nhận" (CanXacNhanBadge): không cần bấm gì,
  // backend đã tự quét sẵn hoso_dinh_danh mỗi lần gọi (xem dinhDanhSoLuongCapNghiTrung).
  // Khác biệt duy nhất so với "cần xác nhận": kết quả không được LƯU thành 1 cột đánh dấu
  // cố định trên Sheet (vì đây là so 2 hồ sơ ĐÃ CÓ SẴN với nhau, không phải 1 dòng mới vừa
  // nhập) — mà tính lại (quét) mỗi lần gọi, nhưng với người dùng thì trải nghiệm y hệt:
  // tự động xuất hiện, không cần thao tác gì trước.
  const [soLuongTuDong, setSoLuongTuDong] = useState(null); // null = chưa tải xong lần đầu
  const [hienThuCong, setHienThuCong] = useState(false); // ép hiện dù quét tự động ra 0 (tìm thủ công theo tiêu chí khác tên+ngày sinh, VD nghi trùng CCCD gõ sai)

  useEffect(() => {
    let huy = false;
    const napLai = () => {
      fetchSoLuongCapNghiTrungDinhDanh().then(n => { if (!huy) setSoLuongTuDong(n); });
    };
    napLai();
    const timer = setInterval(napLai, 60000);
    return () => { huy = true; clearInterval(timer); };
  }, []);

  const huyPreview = () => { setXemTruoc(null); setGoXacNhan(''); };

  const taiGoiY = async () => {
    setDangTaiGoiY(true);
    try {
      const ds = await fetchGoiYCapNghiTrungDinhDanh();
      setGoiY(ds);
      setDaTaiGoiY(true);
    } catch (err) {
      Swal.fire('Lỗi tải gợi ý', err.message, 'error');
    } finally {
      setDangTaiGoiY(false);
    }
  };

  // Đổ thẳng 1 nhóm gợi ý vào đúng bảng chọn nguồn/đích bên dưới (tái dùng lại UI/logic đã
  // có, không phải làm luồng chọn riêng) — coi như kết quả của 1 lần "tìm kiếm".
  const xemNhomGoiY = (nhom) => {
    huyPreview();
    setSvKeyNguon(''); setSvKeyDich('');
    setKetQua(nhom.hoSo.map(h => ({
      sv_key: h.sv_key, ho_ten_chuan_hoa: nhom.hoTen, ngay_sinh: nhom.ngaySinh,
      ma_phu: h.ma_phu, soDongTrunggian: h.soDongTrunggian
    })));
    setTuKhoa(nhom.hoTen);
    setDaTimChua(true);
  };

  const timKiem = async () => {
    if (!tuKhoa || tuKhoa.trim().length < 2) {
      Swal.fire({ icon: 'warning', title: 'Thiếu từ khoá', text: 'Nhập ít nhất 2 ký tự (họ tên, sv_key, hoặc CCCD/MSV).' });
      return;
    }
    setDangTim(true);
    huyPreview();
    try {
      const ds = await timKiemHoSoDinhDanh(tuKhoa.trim());
      setKetQua(ds);
      setDaTimChua(true);
    } catch (err) {
      Swal.fire('Lỗi tìm kiếm', err.message, 'error');
    } finally {
      setDangTim(false);
    }
  };

  const chonNguon = (svKey) => { huyPreview(); setSvKeyNguon(svKey === svKeyNguon ? '' : svKey); };
  const chonDich = (svKey) => { huyPreview(); setSvKeyDich(svKey === svKeyDich ? '' : svKey); };

  const xemTruocGop = async () => {
    if (!svKeyNguon || !svKeyDich) return;
    setDangXemTruoc(true);
    try {
      const data = await xemTruocGopDinhDanh(svKeyNguon, svKeyDich);
      setXemTruoc(data);
      setGoXacNhan('');
    } catch (err) {
      Swal.fire('Không thể gộp', err.message, 'error');
      setXemTruoc(null);
    } finally {
      setDangXemTruoc(false);
    }
  };

  const tenDichChuan = ((xemTruoc && xemTruoc.dich && xemTruoc.dich.ho_ten_chuan_hoa) || '').trim().toLowerCase();
  const daGoDungTen = !!xemTruoc && tenDichChuan !== '' && goXacNhan.trim().toLowerCase() === tenDichChuan;

  const resetSauKhiGop = () => {
    setSvKeyNguon(''); setSvKeyDich(''); huyPreview();
    setKetQua([]); setDaTimChua(false); setTuKhoa('');
  };

  const xacNhanGop = () => {
    if (!daGoDungTen || !xemTruoc) return;
    Swal.fire({
      icon: 'warning',
      title: 'GỘP 2 HỒ SƠ ĐỊNH DANH?',
      html: `Toàn bộ mã (CCCD/MSV) và hồ sơ tuyển sinh đang thuộc <b>${xemTruoc.nguon.ho_ten_chuan_hoa}</b> (nguồn) sẽ chuyển hết sang <b>${xemTruoc.dich.ho_ten_chuan_hoa}</b> (đích).<br/><br/>` +
        `Hồ sơ nguồn sẽ được đánh dấu "đã gộp" (không xoá) nhưng không còn dùng để tra cứu trùng nữa. ` +
        `<b>Không có nút hoàn tác</b> — chỉ sửa lại được qua Apps Script.`,
      showCancelButton: true, confirmButtonText: 'Tôi chắc chắn, gộp ngay', cancelButtonText: 'Xem lại',
      confirmButtonColor: '#dc3545',
    }).then(async (r) => {
      if (!r.isConfirmed) return;
      setDangGop(true);
      try {
        const kq = await gopHoSoDinhDanh({ svKeyNguon, svKeyDich });
        const dongDup = kq.soMaPhuTrungDaDong > 0 ? ` (${kq.soMaPhuTrungDaDong} mã trùng sẵn có ở đích được đóng lại thay vì nhân đôi)` : '';
        Swal.fire({
          icon: 'success', title: 'Đã gộp thành công',
          html: `Đã chuyển <b>${kq.soMaPhuDaChuyen}</b> mã định danh và <b>${kq.soDongTrunggianDaChuyen}</b> hồ sơ tuyển sinh sang hồ sơ đích${dongDup}.`,
        });
        resetSauKhiGop();
        // ĐÃ THÊM: nếu đang mở danh sách gợi ý, tải lại luôn để cặp vừa gộp biến mất khỏi
        // gợi ý (không tự dọn thì Admin dễ bấm nhầm gộp lại cặp đã xử lý xong).
        if (daTaiGoiY) taiGoiY();
        // ĐÃ THÊM: tải lại số lượng nghi trùng tự động — nếu về 0, cả khối này tự ẩn lại
        // đúng như lúc mới vào trang (không đợi tới lần quét 60s tiếp theo).
        fetchSoLuongCapNghiTrungDinhDanh().then(setSoLuongTuDong);
      } catch (err) {
        Swal.fire({
          icon: 'error', title: 'Lỗi khi gộp',
          html: `${err.message}<br/><br/><span class="small text-muted">Nếu dữ liệu thật ra đã đổi đúng trên Sheet (chỉ là lỗi báo về), hãy tìm kiếm lại để kiểm tra trước khi thử gộp lần nữa — tránh gộp trùng 2 lần.</span>`,
        });
      } finally {
        setDangGop(false);
      }
    });
  };

  // ĐÃ THÊM — theo yêu cầu: cả khối này CHỈ hiện khi có hồ sơ nghi trùng. Chưa tải xong
  // lần quét đầu -> chưa biết ẩn/hiện, không render gì (tránh nháy layout lúc vào trang).
  if (soLuongTuDong === null) return null;

  // Quét tự động ra 0 VÀ người dùng cũng chưa chủ động bấm tìm thủ công -> ẩn hẳn khối
  // này, chỉ để lại 1 dòng nhỏ + link mở lại — phòng trường hợp cần tìm nghi trùng theo
  // tiêu chí khác (VD gõ sai CCCD) mà quét tự động (theo tên+ngày sinh) không bắt được.
  if (soLuongTuDong === 0 && !hienThuCong) {
    return (
      <div className="text-center text-muted small mt-3">
        <i className="bi bi-check-circle me-1"></i>Không có hồ sơ định danh nào đang nghi trùng (tự động quét mỗi 60s).{' '}
        <button className="btn btn-link btn-sm p-0 align-baseline" onClick={() => setHienThuCong(true)}>
          Vẫn muốn tìm thủ công?
        </button>
      </div>
    );
  }

  return (
    <div className="card mt-4 border-warning">
      <div className="card-header bg-warning-subtle d-flex justify-content-between align-items-center"
        style={{ cursor: 'pointer' }} onClick={() => setMoRong(!moRong)}>
        <span className="fw-bold text-dark">
          <i className="bi bi-people-fill me-2"></i>Gộp 2 hồ sơ định danh đã tồn tại (thủ công)
          {soLuongTuDong > 0 && <span className="badge bg-danger ms-2">{soLuongTuDong} nhóm nghi trùng</span>}
        </span>
        <i className={`bi bi-chevron-${moRong ? 'up' : 'down'}`}></i>
      </div>

      {moRong && (
        <div className="card-body">
          <p className="text-muted small">
            Dùng khi phát hiện 2 sv_key <b>ĐÃ TỒN TẠI SẴN</b> (mỗi cái đã có mã/hồ sơ tuyển sinh riêng) thật ra là cùng 1 người —
            khác với bảng "Hàng đợi xác nhận" ở trên (dành cho hồ sơ MỚI vừa nhập, chưa từng có sv_key riêng).
          </p>

          {/* ĐÃ THÊM — "Gợi ý cặp nghi trùng": quét sẵn các nhóm hồ sơ định danh cùng tên+ngày
              sinh, để không phải tự gõ tìm mò khi chưa biết ai trùng với ai. */}
          <div className="alert alert-light border mb-3 py-2">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <span className="small text-muted">
                Gợi ý các nhóm hồ sơ định danh đang trùng tên + ngày sinh — không tự gộp, chỉ để bấm vào bảng chọn bên dưới cho nhanh.
              </span>
              <button className="btn btn-sm btn-outline-secondary" onClick={taiGoiY} disabled={dangTaiGoiY}>
                <i className="bi bi-arrow-clockwise me-1"></i>{dangTaiGoiY ? 'Đang tải...' : (daTaiGoiY ? 'Tải lại gợi ý' : 'Tải gợi ý')}
              </button>
            </div>
            {daTaiGoiY && goiY.length === 0 && (
              <div className="small text-success mt-2 mb-0"><i className="bi bi-check-circle-fill me-1"></i>Không có nhóm nào nghi trùng.</div>
            )}
            {goiY.length > 0 && (
              <div className="d-flex flex-column gap-1 mt-2">
                {goiY.map((nhom, idx) => (
                  <div key={idx} className="d-flex justify-content-between align-items-center bg-white border rounded px-2 py-1">
                    <span className="small">
                      <b>{nhom.hoTen}</b> — {nhom.ngaySinh} <span className="badge bg-warning text-dark ms-1">{nhom.hoSo.length} hồ sơ</span>
                    </span>
                    <button className="btn btn-sm btn-outline-primary" onClick={() => xemNhomGoiY(nhom)}>Xem trong bảng chọn</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="input-group mb-3" style={{ maxWidth: 480 }}>
            <input type="text" className="form-control" placeholder="Họ tên, sv_key, CCCD hoặc MSV..."
              value={tuKhoa} onChange={(e) => setTuKhoa(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && timKiem()} />
            <button className="btn btn-outline-primary" onClick={timKiem} disabled={dangTim}>
              {dangTim ? 'Đang tìm...' : 'Tìm'}
            </button>
          </div>

          {daTimChua && ketQua.length === 0 && (
            <div className="alert alert-secondary small">Không tìm thấy hồ sơ định danh nào khớp.</div>
          )}

          {ketQua.length > 0 && (
            <div className="table-responsive mb-3">
              <table className="table table-sm table-bordered align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Họ tên</th>
                    <th>Ngày sinh</th>
                    <th>Mã phụ</th>
                    <th>Số hồ sơ TS</th>
                    <th className="text-center">Nguồn<br /><span className="fw-normal small text-muted">(sẽ bị gộp)</span></th>
                    <th className="text-center">Đích<br /><span className="fw-normal small text-muted">(giữ lại)</span></th>
                  </tr>
                </thead>
                <tbody>
                  {ketQua.map(hs => (
                    <tr key={hs.sv_key} className={hs.sv_key === svKeyNguon ? 'table-danger' : hs.sv_key === svKeyDich ? 'table-success' : ''}>
                      <td>
                        {hs.ho_ten_chuan_hoa}
                        <div className="text-muted" style={{ fontSize: '0.7rem' }}>{hs.sv_key}</div>
                      </td>
                      <td>{hs.ngay_sinh}</td>
                      <td>
                        {hs.ma_phu.length > 0 ? hs.ma_phu.map((m, idx) => (
                          <span key={idx} className={`badge me-1 mb-1 ${m.hieu_luc_den ? 'bg-light text-muted text-decoration-line-through' : 'bg-info text-dark'}`}>
                            {m.loai_ma}: {m.gia_tri}
                          </span>
                        )) : <span className="text-muted fst-italic">chưa có</span>}
                      </td>
                      <td className="text-center">{hs.soDongTrunggian}</td>
                      <td className="text-center">
                        <input type="radio" name="chonNguon" checked={hs.sv_key === svKeyNguon}
                          onChange={() => chonNguon(hs.sv_key)} disabled={hs.sv_key === svKeyDich} />
                      </td>
                      <td className="text-center">
                        <input type="radio" name="chonDich" checked={hs.sv_key === svKeyDich}
                          onChange={() => chonDich(hs.sv_key)} disabled={hs.sv_key === svKeyNguon} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {svKeyNguon && svKeyDich && !xemTruoc && (
            <button className="btn btn-outline-warning fw-bold mb-3" onClick={xemTruocGop} disabled={dangXemTruoc}>
              {dangXemTruoc ? 'Đang kiểm tra...' : 'Xem trước'}
            </button>
          )}

          {xemTruoc && (
            <div className="card border-danger">
              <div className="card-header bg-danger text-white fw-bold">Xem trước — kiểm tra kỹ trước khi gộp</div>
              <div className="card-body">
                <div className="row g-3">
                  <div className="col-md-6">
                    <div className="fw-bold text-danger">NGUỒN — sẽ bị đánh dấu "đã gộp"</div>
                    <div className="small">
                      <div>{xemTruoc.nguon.ho_ten_chuan_hoa} — {xemTruoc.nguon.ngay_sinh}</div>
                      <div className="text-muted">sv_key: {xemTruoc.nguon.sv_key}</div>
                      <div>Sẽ chuyển đi: <b>{xemTruoc.nguon.ma_phu.length}</b> mã định danh, <b>{xemTruoc.nguon.soDongTrunggian}</b> hồ sơ tuyển sinh</div>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="fw-bold text-success">ĐÍCH — giữ lại, nhận thêm dữ liệu</div>
                    <div className="small">
                      <div>{xemTruoc.dich.ho_ten_chuan_hoa} — {xemTruoc.dich.ngay_sinh}</div>
                      <div className="text-muted">sv_key: {xemTruoc.dich.sv_key}</div>
                      <div>Đang có sẵn: <b>{xemTruoc.dich.ma_phu.length}</b> mã định danh, <b>{xemTruoc.dich.soDongTrunggian}</b> hồ sơ tuyển sinh</div>
                    </div>
                  </div>
                </div>
                <hr />
                <label className="form-label small fw-bold">
                  Để mở khoá nút xác nhận, gõ lại đúng họ tên hồ sơ ĐÍCH ("{xemTruoc.dich.ho_ten_chuan_hoa}"):
                </label>
                <input type="text" className="form-control mb-2" value={goXacNhan}
                  onChange={(e) => setGoXacNhan(e.target.value)} placeholder="Gõ lại họ tên hồ sơ đích..." />
                <button className="btn btn-danger fw-bold" onClick={xacNhanGop} disabled={!daGoDungTen || dangGop}>
                  <i className="bi bi-exclamation-triangle-fill me-1"></i>
                  {dangGop ? 'Đang gộp...' : 'Xác nhận gộp'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GopHoSoDinhDanhPanel;