// ĐÃ THÊM (Công nhận KQHT & chuyển đổi tín chỉ — Nguồn 1 "đối sánh AI theo bảng điểm",
// 2026-09-09 — KHÔNG liên quan tới Ký điện tử Pha 2): modal riêng near-fullscreen cho
// phép người thẩm định GỘP nhiều môn (chuẩn và/hoặc đã học) thành 1 cặp tương đương, hoặc
// GỠ 1 cặp đã có ra khỏi bảng — thay cho việc bảng đối sánh AI trả về trước đây chỉ để
// XEM, không sửa được. Bảng "Kết quả đối sánh sơ bộ" trong modal chi tiết (ThamDinhPage.jsx)
// vẫn giữ nguyên như cũ để xem nhanh; modal này mở thêm khi cần chỉnh tay.
//
// Kiến trúc dữ liệu (đã thống nhất qua trao đổi):
// - `allChuan`/`allDaHoc` = TOÀN BỘ danh sách môn chuẩn (khung CTĐT ngành, từ
//   compareResult.matched + compareResult.unmatched cộng lại — đây LUÔN là toàn bộ khung
//   CTĐT, xem action compareCurriculum ở Quanlysv.gs) / môn đã học (transcriptJSON) — tính
//   1 LẦN từ compareResult GỐC của AI, không đổi theo state đang chỉnh sửa.
// - `matched` = state chỉnh sửa được (mảng các dòng "đã tương đương"), khởi tạo ưu tiên:
//   (1) đã LƯU chính thức trên sheet (cột "KẾT QUẢ ĐỐI SÁNH JSON") > (2) bản nháp phiên làm
//   việc hiện tại (scanCache, sessionStorage, qua onUpdateScanCache) > (3) bản AI gốc.
// - 2 bảng "pool" (môn chuẩn / môn đã học CHƯA DÙNG) là GIÁ TRỊ SUY RA (useMemo), không
//   phải state riêng: pool = toàn bộ trừ đi tên đã xuất hiện (tách theo dấu phẩy) trong
//   `matched` hiện tại — nhờ vậy "Gỡ bỏ" 1 dòng tự động làm 2 môn của nó "hiện lại" trong
//   pool mà không cần code trả-về riêng.
// - "Gộp": chọn N môn chuẩn (pool trái) + N môn đã học (pool phải) -> 1 dòng mới, tên nối
//   bằng dấu phẩy, tín chỉ mỗi bên CỘNG DỒN, kết luận mặc định "Đạt" (sửa được qua dropdown).
// - "Lưu": chỉ ghi xuống sheet khi bấm nút — action GAS `luuKetQuaDoiSanh`.
// - "Đặt lại": quay về đúng compareResult.matched gốc của AI (xoá luôn bản nháp session).
import React, { useState, useEffect, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Swal from 'sweetalert2';
import { luuKetQuaDoiSanh } from '../../api/studentApi';
// ĐÃ THÊM (Công nhận KQHT & chuyển đổi tín chỉ — Nguồn 2 "miễn theo văn bằng cũ",
// 2026-09-09): dùng lại đúng logic áp mẫu miễn Điều 6 ở nút "Đặt lại (Reset)" — Reset giờ
// quay về "baseline tự động" (AI Nguồn 1 + mẫu miễn Nguồn 2 đang tick tại ThamDinhPage.jsx),
// KHÔNG còn chỉ quay về AI-only như bản Nguồn 1 ban đầu nữa, để không bị lệch với ô tick.
import { layTenChuanDaDung, tinhCacDongMienVanBangCu } from './thamDinhHelpers';

const chuanHoaTen = (s) => String(s || '').trim().toLowerCase();
let dongDemId = 0;
const idMoi = () => 'ds-' + (++dongDemId) + '-' + Date.now();

const KET_LUAN_OPTIONS = ['Đạt', 'Học bổ sung'];
const TRAN_MAC_DINH = 63; // dự phòng nếu chưa tải xong appConfig — khớp mặc định phía Quanlysv.gs

const DoiSanhModal = ({ show, onClose, row, cccd, targetNganh, scanEntry, scanKey, onUpdateScanCache, tranTinChi, dsMienVanBangCu }) => {
  const queryClient = useQueryClient();
  const cmp = scanEntry?.compareResult;
  const transcriptJSON = scanEntry?.transcriptJSON || [];

  const allChuan = useMemo(() => {
    if (!cmp) return [];
    const list = [
      ...(cmp.matched || []).map((m) => ({ nhom_mon: m.nhom_mon, ten: m.mon_chuan, tin_chi: m.tin_chi_chuan })),
      ...(cmp.unmatched || []).map((u) => ({ nhom_mon: u.nhom_mon, ten: u.mon_chuan, tin_chi: u.tin_chi_chuan })),
    ];
    return list.map((x, i) => ({ ...x, _id: 'chuan-' + i }));
  }, [cmp]);

  const allDaHoc = useMemo(
    () => transcriptJSON.map((t, i) => ({ ...t, _id: 'dahoc-' + i })),
    [transcriptJSON]
  );

  const savedRaw = row ? row['KẾT QUẢ ĐỐI SÁNH JSON'] : null;

  const [matched, setMatched] = useState([]);
  const [daSeed, setDaSeed] = useState(false);
  const [selectedMatched, setSelectedMatched] = useState(new Set());
  const [selectedChuan, setSelectedChuan] = useState(new Set());
  const [selectedDaHoc, setSelectedDaHoc] = useState(new Set());

  // Seed đúng 1 lần mỗi khi modal MỞ (không seed lại khi scanEntry đổi trong lúc đang mở,
  // tránh đè lên chỉnh sửa dở dang của người dùng).
  useEffect(() => {
    if (!show) { setDaSeed(false); return; }
    if (daSeed) return;
    let initial = null;
    if (savedRaw) {
      try { initial = JSON.parse(savedRaw); } catch (e) { initial = null; }
    }
    if (!initial && scanEntry?.ketQuaDoiSanhDaChinh) initial = scanEntry.ketQuaDoiSanhDaChinh;
    if (!initial) initial = (cmp?.matched || []).map((m) => ({ ...m }));
    setMatched(initial.map((r) => ({ ...r, _id: r._id || idMoi() })));
    setSelectedMatched(new Set());
    setSelectedChuan(new Set());
    setSelectedDaHoc(new Set());
    setDaSeed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  // Mỗi lần matched đổi (sau khi đã seed xong) -> ghi bản nháp vào scanCache/sessionStorage,
  // để không mất khi lỡ đóng modal / tải lại trang trong CÙNG phiên làm việc.
  useEffect(() => {
    if (!daSeed || !scanKey) return;
    onUpdateScanCache(scanKey, { ketQuaDoiSanhDaChinh: matched });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matched]);

  const tenDaDung = useMemo(() => {
    const chuanSet = new Set();
    const daHocSet = new Set();
    matched.forEach((m) => {
      String(m.mon_chuan || '').split(',').forEach((s) => { if (s.trim()) chuanSet.add(chuanHoaTen(s)); });
      String(m.mon_da_hoc || '').split(',').forEach((s) => { if (s.trim()) daHocSet.add(chuanHoaTen(s)); });
    });
    return { chuanSet, daHocSet };
  }, [matched]);

  const poolChuan = useMemo(
    () => allChuan.filter((c) => !tenDaDung.chuanSet.has(chuanHoaTen(c.ten))),
    [allChuan, tenDaDung]
  );
  const poolDaHoc = useMemo(
    () => allDaHoc.filter((t) => !tenDaDung.daHocSet.has(chuanHoaTen(t.monhoc))),
    [allDaHoc, tenDaDung]
  );

  const tongTinChi = useMemo(
    () => matched.reduce((s, m) => s + (parseFloat(m.tin_chi_chuan) || 0), 0),
    [matched]
  );
  const nguong = Number(tranTinChi) || TRAN_MAC_DINH;
  const vuotTran = tongTinChi > nguong;

  const toggleSet = (setter, id) => setter((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleGop = () => {
    const chuanChon = poolChuan.filter((c) => selectedChuan.has(c._id));
    const daHocChon = poolDaHoc.filter((t) => selectedDaHoc.has(t._id));
    if (chuanChon.length === 0 || daHocChon.length === 0) return;
    const nhomMon = [...new Set(chuanChon.map((c) => c.nhom_mon).filter(Boolean))].join(' / ');
    const tenChuan = chuanChon.map((c) => c.ten).join(', ');
    const tenDaHoc = daHocChon.map((t) => t.monhoc).join(', ');
    const tcChuan = chuanChon.reduce((s, c) => s + (parseFloat(c.tin_chi) || 0), 0);
    const tcDaHoc = daHocChon.reduce((s, t) => s + (parseFloat(t.tinchi) || 0), 0);
    const rowMoi = {
      _id: idMoi(),
      nhom_mon: nhomMon,
      mon_chuan: tenChuan,
      tin_chi_chuan: tcChuan,
      mon_da_hoc: tenDaHoc,
      tin_chi_da_hoc: tcDaHoc,
      ket_luan: 'Đạt',
    };
    setMatched((prev) => [...prev, rowMoi]);
    setSelectedChuan(new Set());
    setSelectedDaHoc(new Set());
  };

  const handleGoBo = () => {
    if (selectedMatched.size === 0) return;
    setMatched((prev) => prev.filter((m) => !selectedMatched.has(m._id)));
    setSelectedMatched(new Set());
  };

  const handleSuaKetLuan = (id, giaTri) => {
    setMatched((prev) => prev.map((m) => (m._id === id ? { ...m, ket_luan: giaTri } : m)));
  };

  const handleReset = () => {
    Swal.fire({
      icon: 'warning',
      title: 'Đặt lại bảng đối sánh?',
      text: 'Mọi gộp/gỡ tay trong phiên làm việc này sẽ mất, quay về kết quả AI trả về ban đầu (kèm mẫu miễn theo văn bằng cũ nếu đang tick). Bản đã LƯU chính thức (nếu có) không đổi cho tới khi ông bấm Lưu lại.',
      showCancelButton: true,
      confirmButtonText: 'Đặt lại',
      cancelButtonText: 'Thôi',
      confirmButtonColor: '#b0791f',
    }).then((res) => {
      if (!res.isConfirmed) return;
      const gocAI = (cmp?.matched || []).map((m) => ({ ...m, _id: idMoi() }));
      // ĐÃ THÊM (Nguồn 2, 2026-09-09): tái áp mẫu miễn theo văn bằng cũ đang tick (nếu có) —
      // baseline giờ = AI Nguồn 1 + mẫu miễn Nguồn 2, không còn chỉ AI-only như trước.
      const allChuanPhang = allChuan.map((c) => ({ nhom_mon: c.nhom_mon, ten: c.ten, tin_chi: c.tin_chi }));
      const { rows: dongMienTheo } = tinhCacDongMienVanBangCu({
        loaiVanBang: scanEntry?.mienVanBangCu,
        dsMienVanBangCu,
        allChuan: allChuanPhang,
        tenDaDungTruoc: layTenChuanDaDung(gocAI),
      });
      const goc = [...gocAI, ...dongMienTheo.map((r) => ({ ...r, _id: idMoi() }))];
      setMatched(goc);
      setSelectedMatched(new Set());
      setSelectedChuan(new Set());
      setSelectedDaHoc(new Set());
      if (scanKey) onUpdateScanCache(scanKey, { ketQuaDoiSanhDaChinh: goc });
    });
  };

  const luuMutation = useMutation({ mutationFn: luuKetQuaDoiSanh });

  const handleLuu = async () => {
    try {
      await luuMutation.mutateAsync({ cccd, ketQuaDoiSanh: matched.map(({ _id, ...rest }) => rest) });
      queryClient.invalidateQueries(['thamDinhData']);
      Swal.fire({ icon: 'success', title: 'Đã lưu', timer: 1400, showConfirmButton: false });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Lưu thất bại', text: err.message });
    }
  };

  if (!show) return null;

  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-dialog modal-fullscreen">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title fw-bold mb-0">📋 Đối sánh khung CTĐT — {targetNganh}</h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>
          <div className="modal-body" style={{ background: '#f7f8f4' }}>
            {vuotTran && (
              <div className="alert alert-warning d-flex align-items-center gap-2">
                <span>⚠️</span>
                <div>
                  Tổng tín chỉ đang công nhận (<strong>{tongTinChi}</strong>) đã vượt trần{' '}
                  <strong>{nguong}</strong> tín chỉ (tối đa 50% khối lượng CTĐT). Vẫn lưu được
                  nhưng nên xem lại trước khi chốt.
                </div>
              </div>
            )}

            <div className="d-flex justify-content-between align-items-center mb-2">
              <h6 className="fw-bold mb-0" style={{ color: '#2e7d32' }}>
                Đã tương đương ({matched.length} dòng · {tongTinChi} TC / trần {nguong})
              </h6>
              <button className="btn btn-sm btn-outline-danger" disabled={selectedMatched.size === 0} onClick={handleGoBo}>
                Gỡ bỏ ({selectedMatched.size})
              </button>
            </div>
            <div className="table-responsive mb-4" style={{ maxHeight: 260, border: '1px solid #dee2e6', borderRadius: 6 }}>
              <table className="table table-sm table-bordered mb-0" style={{ fontSize: 13 }}>
                <thead className="table-light">
                  <tr>
                    <th style={{ width: 34 }}></th>
                    <th>Nhóm môn</th>
                    <th>Môn chuẩn</th>
                    <th>TC chuẩn</th>
                    <th>Môn đã học</th>
                    <th>TC đã học</th>
                    <th style={{ width: 160 }}>Kết luận</th>
                  </tr>
                </thead>
                <tbody>
                  {matched.length === 0 && (
                    <tr><td colSpan={7} className="text-muted fst-italic text-center">Chưa có dòng nào.</td></tr>
                  )}
                  {matched.map((m) => (
                    <tr key={m._id}>
                      <td className="text-center">
                        <input type="checkbox" checked={selectedMatched.has(m._id)} onChange={() => toggleSet(setSelectedMatched, m._id)} />
                      </td>
                      <td className="text-start">{m.nhom_mon}</td>
                      <td className="text-start fw-bold">
                        {m.mon_chuan}
                        {/* ĐÃ THÊM (Nguồn 2, 2026-09-09): badge phân biệt dòng do TICK văn bằng cũ
                            tự thêm vào (Điều 6) — khác dòng do AI/gộp tay (Nguồn 1). */}
                        {m.nguon === 'chinh_sach' && (
                          <span className="badge bg-info text-dark ms-1" style={{ fontSize: 10, fontWeight: 'normal' }}>
                            Chính sách
                          </span>
                        )}
                      </td>
                      <td>{m.tin_chi_chuan}</td>
                      <td className="text-start" style={{ color: '#1565c0' }}>{m.mon_da_hoc}</td>
                      <td>{m.tin_chi_da_hoc}</td>
                      <td>
                        <select
                          className="form-select form-select-sm"
                          value={m.ket_luan || 'Đạt'}
                          onChange={(e) => handleSuaKetLuan(m._id, e.target.value)}
                        >
                          {KET_LUAN_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
              <h6 className="fw-bold mb-0" style={{ color: '#6a1b9a' }}>Chọn để gộp thành 1 cặp tương đương</h6>
              <button
                className="btn btn-sm btn-success"
                disabled={selectedChuan.size === 0 || selectedDaHoc.size === 0}
                onClick={handleGop}
              >
                Gộp ({selectedChuan.size} chuẩn + {selectedDaHoc.size} đã học)
              </button>
            </div>
            <div className="row g-3">
              <div className="col-md-6">
                <div className="small fw-bold text-danger mb-1">Môn chuẩn chưa dùng ({poolChuan.length})</div>
                <div className="table-responsive" style={{ maxHeight: 280, border: '1px solid #dee2e6', borderRadius: 6 }}>
                  <table className="table table-sm table-bordered mb-0" style={{ fontSize: 12.5 }}>
                    <thead style={{ background: '#ffebee' }}>
                      <tr><th style={{ width: 30 }}></th><th>Nhóm môn</th><th>Tên môn chuẩn</th><th>TC</th></tr>
                    </thead>
                    <tbody>
                      {poolChuan.length === 0 ? (
                        <tr><td colSpan={4} className="text-muted fst-italic text-center">Không còn môn nào.</td></tr>
                      ) : poolChuan.map((c) => (
                        <tr
                          key={c._id}
                          onClick={() => toggleSet(setSelectedChuan, c._id)}
                          style={{ cursor: 'pointer', background: selectedChuan.has(c._id) ? '#ffe0dd' : undefined }}
                        >
                          <td className="text-center"><input type="checkbox" readOnly checked={selectedChuan.has(c._id)} /></td>
                          <td className="text-start">{c.nhom_mon}</td>
                          <td className="text-start fw-bold">{c.ten}</td>
                          <td>{c.tin_chi}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="col-md-6">
                <div className="small fw-bold mb-1" style={{ color: '#6a1b9a' }}>Môn đã học chưa dùng ({poolDaHoc.length})</div>
                <div className="table-responsive" style={{ maxHeight: 280, border: '1px solid #dee2e6', borderRadius: 6 }}>
                  <table className="table table-sm table-bordered mb-0" style={{ fontSize: 12.5 }}>
                    <thead style={{ background: '#f3e5f5' }}>
                      <tr><th style={{ width: 30 }}></th><th>Tên môn (đã học)</th><th>TC</th><th>Điểm chữ</th><th>Hệ 10</th></tr>
                    </thead>
                    <tbody>
                      {poolDaHoc.length === 0 ? (
                        <tr><td colSpan={5} className="text-muted fst-italic text-center">Không còn môn nào.</td></tr>
                      ) : poolDaHoc.map((t) => (
                        <tr
                          key={t._id}
                          onClick={() => toggleSet(setSelectedDaHoc, t._id)}
                          style={{ cursor: 'pointer', background: selectedDaHoc.has(t._id) ? '#e5d4f0' : undefined }}
                        >
                          <td className="text-center"><input type="checkbox" readOnly checked={selectedDaHoc.has(t._id)} /></td>
                          <td className="text-start fw-bold">{t.monhoc}</td>
                          <td>{t.tinchi}</td>
                          <td>{t.diem_chu}</td>
                          <td>{t.diem_he10}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-footer d-flex justify-content-between">
            <button className="btn btn-outline-warning" onClick={handleReset}>Đặt lại (Reset)</button>
            <div className="d-flex gap-2">
              <button className="btn btn-secondary" onClick={onClose}>Đóng</button>
              <button className="btn btn-primary" disabled={luuMutation.isPending} onClick={handleLuu}>
                {luuMutation.isPending ? 'Đang lưu...' : 'Lưu kết quả đối sánh'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DoiSanhModal;