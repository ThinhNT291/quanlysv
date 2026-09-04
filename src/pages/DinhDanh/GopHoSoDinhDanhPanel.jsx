import React, { useState } from 'react';
import Swal from 'sweetalert2';
import { timKiemHoSoDinhDanh, xemTruocGopDinhDanh, gopHoSoDinhDanh } from '../../api/studentApi';

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
  const [moRong, setMoRong] = useState(false);
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

  const huyPreview = () => { setXemTruoc(null); setGoXacNhan(''); };

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

  return (
    <div className="card mt-4 border-warning">
      <div className="card-header bg-warning-subtle d-flex justify-content-between align-items-center"
        style={{ cursor: 'pointer' }} onClick={() => setMoRong(!moRong)}>
        <span className="fw-bold text-dark">
          <i className="bi bi-people-fill me-2"></i>Gộp 2 hồ sơ định danh đã tồn tại (thủ công)
        </span>
        <i className={`bi bi-chevron-${moRong ? 'up' : 'down'}`}></i>
      </div>

      {moRong && (
        <div className="card-body">
          <p className="text-muted small">
            Dùng khi phát hiện 2 sv_key <b>ĐÃ TỒN TẠI SẴN</b> (mỗi cái đã có mã/hồ sơ tuyển sinh riêng) thật ra là cùng 1 người —
            khác với bảng "Hàng đợi xác nhận" ở trên (dành cho hồ sơ MỚI vừa nhập, chưa từng có sv_key riêng).
          </p>

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