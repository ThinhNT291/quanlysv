import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { timKiemKhoSinhVien, layThongKeKho, fetchConfig } from '../../api/studentApi';
import DateRangePicker from '../ThamDinh/DateRangePicker';
import './KhoSinhVien.css';

// ===================================================================
// TRANG "KHO TRA CỨU SINH VIÊN" (route /quan-ly-ho-so-moi) — lớp tra cứu/tổng hợp,
// KHÔNG lưu dữ liệu riêng, chỉ gọi 1 API DUY NHẤT (action 'timKiemKhoSinhVien' trong
// Quanlysv.gs) đã tự gộp 3 nguồn (Trung Gian + KETQUA + Đào tạo) VÀ tự lọc/phân trang
// ngay trên server — trang này chỉ gửi tham số lọc lên, KHÔNG tự lọc mảng cũ trong
// trình duyệt (khác hẳn ThamDinhPage/XetTuyenPage — xem giải thích trong hội thoại đã
// chốt trước khi build trang này: kho sẽ cộng dồn qua nhiều năm, không dừng lại như
// 1 đợt tuyển sinh, nên phải lọc/phân trang phía server ngay từ đầu).
// ===================================================================

const PAGE_SIZE_DEFAULT = 20;

// Đúng các giá trị mà suyRaTrangThaiVongDoi_() bên Quanlysv.gs có thể trả về.
const TRANG_THAI_OPTIONS = [
  'Đang chờ duyệt', 'Mới bổ sung', 'Đã báo thiếu', 'Đã duyệt',
  'Đã trúng tuyển', 'Đã trúng tuyển (chờ bàn giao)', 'Đã bàn giao Đào tạo',
];

const BADGE_MAU = {
  'Đang chờ duyệt': 'secondary',
  'Mới bổ sung': 'info',
  'Đã báo thiếu': 'warning',
  'Đã duyệt': 'primary',
  'Đã trúng tuyển': 'success',
  'Đã trúng tuyển (chờ bàn giao)': 'success',
  'Đã bàn giao Đào tạo': 'dark',
};

// Cùng 7 trạng thái như BADGE_MAU nhưng đổi ra mã màu hex — dùng cho biểu đồ tròn (recharts
// không nhận trực tiếp tên class Bootstrap như "success", phải tự quy đổi hex).
const MAU_HEX = {
  'Đang chờ duyệt': '#6c757d',
  'Mới bổ sung': '#0dcaf0',
  'Đã báo thiếu': '#ffc107',
  'Đã duyệt': '#0d6efd',
  'Đã trúng tuyển': '#198754',
  'Đã trúng tuyển (chờ bàn giao)': '#20c997',
  'Đã bàn giao Đào tạo': '#212529',
};

const KhoSinhVienPage = () => {
  const [searchInput, setSearchInput] = useState('');
  const [tuKhoa, setTuKhoa] = useState('');
  const [nganh, setNganh] = useState('');
  const [khoa, setKhoa] = useState('');
  const [heDaoTao, setHeDaoTao] = useState('');
  const [hinhThucDaoTao, setHinhThucDaoTao] = useState('');
  const [namXetTuyen, setNamXetTuyen] = useState('');
  const [trangThai, setTrangThai] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [trang, setTrang] = useState(1);
  const [kichThuoc, setKichThuoc] = useState(PAGE_SIZE_DEFAULT);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [showStats, setShowStats] = useState(false);

  // Gõ vào ô "Tìm nhanh" -> chờ 400ms không gõ thêm mới thật sự gọi API (debounce) —
  // tránh gọi lại GAS liên tục theo từng phím gõ (khác quick-search lọc client-side cũ,
  // ở đây MỖI LẦN đổi từ khoá là 1 lượt gọi mạng thật sự).
  useEffect(() => {
    const t = setTimeout(() => {
      setTuKhoa(searchInput.trim());
      setTrang(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Danh mục Ngành/Khóa/Hệ/Hình thức/Năm cho các ô lọc — dùng lại đúng danh mục chuẩn ở
  // trang Cài đặt (CauHinh), không tự dò từ dữ liệu đang tải (trang này mỗi lần chỉ tải
  // đúng 1 trang kết quả, không đủ để suy ra hết danh mục như ThamDinhPage đang làm).
  const { data: configData } = useQuery({ queryKey: ['systemConfig'], queryFn: fetchConfig });

  const filterParams = useMemo(() => ({
    tuKhoa, nganh, khoa, heDaoTao, hinhThucDaoTao, namXetTuyen, trangThai,
    tuNgay: dateFrom, denNgay: dateTo, trang, kichThuoc,
  }), [tuKhoa, nganh, khoa, heDaoTao, hinhThucDaoTao, namXetTuyen, trangThai, dateFrom, dateTo, trang, kichThuoc]);

  // placeholderData: keepPreviousData — giữ nguyên bảng cũ trong lúc chờ trang/lọc mới
  // tải về, đỡ bị "trắng bảng nháy nháy" mỗi lần đổi lọc/chuyển trang.
  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['khoSinhVien', filterParams],
    queryFn: () => timKiemKhoSinhVien(filterParams),
    placeholderData: keepPreviousData,
  });

  const items = data?.items || [];
  const tongSo = data?.tongSo || 0;
  const tongTrang = data?.tongTrang || 1;

  // ĐÃ THÊM: bảng thống kê tổng hợp (KPI + biểu đồ) — dùng CHUNG bộ lọc "Năm xét tuyển" ở
  // trên (không thêm ô chọn năm riêng, đỡ rối) — chọn năm vừa lọc bảng kết quả vừa thu hẹp
  // thống kê về đúng năm đó (và mới tính được % so với chỉ tiêu, xem action GAS). Không đổi
  // theo các ô lọc khác (tuKhoa, ngành, khoá...) vì đây là dashboard TỔNG QUAN, gõ tìm không
  // nên làm KPI nhảy số theo.
  const { data: thongKe, isLoading: isLoadingThongKe } = useQuery({
    queryKey: ['khoThongKe', namXetTuyen],
    queryFn: () => layThongKeKho(namXetTuyen),
    placeholderData: keepPreviousData,
  });

  const resetFilters = () => {
    setSearchInput('');
    setTuKhoa('');
    setNganh(''); setKhoa(''); setHeDaoTao(''); setHinhThucDaoTao(''); setNamXetTuyen('');
    setTrangThai(''); setDateFrom(''); setDateTo('');
    setTrang(1);
  };

  const isFilterActive = !!(tuKhoa || nganh || khoa || heDaoTao || hinhThucDaoTao || namXetTuyen || trangThai || dateFrom || dateTo);
  // Chỉ 5 ô trong nhóm "Lọc thêm" xổ dưới — dùng để nổi chấm cam trên nút khi đang đóng.
  const moreFiltersActive = !!(nganh || khoa || heDaoTao || hinhThucDaoTao || namXetTuyen);

  return (
    <div className="container-fluid py-3">
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <h3 className="text-uppercase fw-bold mb-0" style={{ color: '#037683' }}>
          <i className="bi bi-archive-fill me-2"></i>Kho tra cứu sinh viên
        </h3>
        <span className="text-muted small">
          {isLoading ? 'Đang tải...' : `Tìm thấy ${tongSo} hồ sơ${isFetching ? ' (đang cập nhật...)' : ''}`}
        </span>
      </div>

      {/* ---- ĐÃ THÊM: bảng thống kê tổng hợp (KPI luôn hiện + biểu đồ xổ dưới) — khớp
          action 'layThongKeKho'. Theo đúng "Năm xét tuyển" đang chọn ở bộ lọc bên dưới
          (để trống = gộp mọi năm; % so với chỉ tiêu chỉ tính được khi có chọn đúng 1
          năm). ---- */}
      <div className="row g-2 mb-3">
        <div className="col-6 col-md-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body py-2 px-3">
              <div className="text-muted small">Tổng hồ sơ{namXetTuyen ? ` (năm ${namXetTuyen})` : ' (mọi năm)'}</div>
              <div className="fs-4 fw-bold">{isLoadingThongKe ? '…' : (thongKe?.tongHoSo ?? 0)}</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body py-2 px-3">
              <div className="text-muted small">Đã trúng tuyển</div>
              <div className="fs-4 fw-bold text-success">{isLoadingThongKe ? '…' : (thongKe?.tongDaTrungTuyen ?? 0)}</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body py-2 px-3">
              <div className="text-muted small">Đã bàn giao Đào tạo</div>
              <div className="fs-4 fw-bold text-dark">
                {isLoadingThongKe ? '…' : (thongKe?.theoTrangThai || []).find(t => t.ten === 'Đã bàn giao Đào tạo')?.soLuong || 0}
              </div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body py-2 px-3 d-flex justify-content-between align-items-start">
              <div>
                <div className="text-muted small">% đạt chỉ tiêu</div>
                <div className="fs-4 fw-bold" style={{ color: '#037683' }}>
                  {isLoadingThongKe ? '…' : (thongKe?.phanTramTong !== null && thongKe?.phanTramTong !== undefined ? `${thongKe.phanTramTong}%` : '—')}
                </div>
                {!namXetTuyen && <div className="text-muted" style={{ fontSize: 11 }}>Chọn 1 năm ở bộ lọc để xem</div>}
                {namXetTuyen && (thongKe?.tongChiTieu === null || thongKe?.tongChiTieu === undefined) && !isLoadingThongKe && (
                  <div className="text-muted" style={{ fontSize: 11 }}>Chưa nhập chỉ tiêu năm {namXetTuyen}</div>
                )}
              </div>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary py-0 px-2"
                onClick={() => setShowStats((v) => !v)}
                title="Xem thống kê chi tiết theo ngành/khóa/hệ/hình thức"
              >
                <i className={`bi bi-bar-chart-fill`}></i> <i className={`bi bi-chevron-${showStats ? 'up' : 'down'}`}></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      {showStats && (
        <div className="row g-2 mb-3">
          <div className="col-md-4">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body py-2">
                <div className="small fw-bold text-muted mb-1">Theo trạng thái vòng đời</div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={(thongKe?.theoTrangThai || []).map(t => ({ name: t.ten, value: t.soLuong }))}
                      innerRadius="45%" outerRadius="80%" paddingAngle={2} dataKey="value"
                    >
                      {(thongKe?.theoTrangThai || []).map((t, idx) => (
                        <Cell key={idx} fill={MAU_HEX[t.ten] || '#adb5bd'} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          <div className="col-md-8">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body py-2">
                <div className="small fw-bold text-muted mb-1">
                  Theo ngành đào tạo{(thongKe?.theoNganh || []).some(n => n.chiTieu !== null) ? ' — đã trúng tuyển so với chỉ tiêu' : ' — theo tổng hồ sơ'}
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={(thongKe?.theoNganh || []).slice().sort((a, b) => b.tongHoSo - a.tongHoSo).slice(0, 8)}
                    layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                    <YAxis dataKey="nganh" type="category" width={140} tick={{ fontSize: 10, fill: '#6c757d' }} />
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {(thongKe?.theoNganh || []).some(n => n.chiTieu !== null) ? (
                      <>
                        <Bar dataKey="daTrungTuyen" name="Đã trúng tuyển" fill="#198754" radius={[0, 4, 4, 0]} barSize={10} />
                        <Bar dataKey="chiTieu" name="Chỉ tiêu" fill="#ffc107" radius={[0, 4, 4, 0]} barSize={10} />
                      </>
                    ) : (
                      <Bar dataKey="tongHoSo" name="Tổng hồ sơ" fill="#0dcaf0" radius={[0, 4, 4, 0]} barSize={12} />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          <div className="col-md-6">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body py-2">
                <div className="small fw-bold text-muted mb-1">Theo khóa</div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={(thongKe?.theoKhoa || []).slice(0, 8)} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                    <YAxis dataKey="ten" type="category" width={90} tick={{ fontSize: 10, fill: '#6c757d' }} />
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                    <Bar dataKey="soLuong" name="Số hồ sơ" fill="#6f42c1" radius={[0, 4, 4, 0]} barSize={12} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          <div className="col-md-6">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body py-2">
                <div className="small fw-bold text-muted mb-2">Theo hệ &amp; hình thức đào tạo</div>
                <div className="mb-2">
                  <div className="text-muted" style={{ fontSize: 11 }}>Hệ đào tạo</div>
                  <div className="d-flex flex-wrap gap-1">
                    {(thongKe?.theoHeDaoTao || []).map((h) => (
                      <span key={h.ten} className="badge bg-primary-subtle text-primary-emphasis border border-primary-subtle">
                        {h.ten}: {h.soLuong}
                      </span>
                    ))}
                    {(thongKe?.theoHeDaoTao || []).length === 0 && <span className="text-muted small">Không có dữ liệu</span>}
                  </div>
                </div>
                <div>
                  <div className="text-muted" style={{ fontSize: 11 }}>Hình thức đào tạo</div>
                  <div className="d-flex flex-wrap gap-1">
                    {(thongKe?.theoHinhThuc || []).map((h) => (
                      <span key={h.ten} className="badge bg-info-subtle text-info-emphasis border border-info-subtle">
                        {h.ten}: {h.soLuong}
                      </span>
                    ))}
                    {(thongKe?.theoHinhThuc || []).length === 0 && <span className="text-muted small">Không có dữ liệu</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---- Bộ lọc: hàng "ghim" luôn hiện + "Lọc thêm" xổ dưới, đồng bộ pattern đã
          chốt ở ThamDinhPage (Tìm nhanh/Thời gian/Trạng thái luôn hiện, phần ít dùng
          hơn gom vào 1 hàng ẩn/hiện). ---- */}
      <div className="card border-0 shadow-sm mb-3">
        <div className="card-body py-2">
          <div className="d-flex flex-wrap align-items-center gap-2">
            <input
              type="search"
              className="form-control form-control-sm"
              style={{ flex: '1 1 220px', minWidth: 160 }}
              placeholder="🔎 Tìm theo tên / CCCD / mã sinh viên / mã định danh phụ..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <div style={{ flex: '0 0 auto', width: 170 }}>
              <DateRangePicker
                from={dateFrom}
                to={dateTo}
                onChange={(lo, hi) => { setDateFrom(lo); setDateTo(hi); setTrang(1); }}
              />
            </div>
            <select
              className="form-select form-select-sm"
              style={{ flex: '0 1 190px', minWidth: 150 }}
              value={trangThai}
              onChange={(e) => { setTrangThai(e.target.value); setTrang(1); }}
              title="Trạng thái"
            >
              <option value="">-- Mọi trạng thái --</option>
              {TRANG_THAI_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button
              type="button"
              className={`btn btn-sm ${isFilterActive ? 'kho-reset-btn-active' : 'kho-reset-btn'}`}
              onClick={resetFilters}
              title="Xóa bộ lọc"
            >
              <i className="bi bi-x-circle me-1"></i>Bỏ lọc
            </button>
            <button
              type="button"
              className={`btn btn-sm ms-auto position-relative ${showMoreFilters ? 'btn-info text-white' : 'btn-outline-secondary'}`}
              onClick={() => setShowMoreFilters((v) => !v)}
            >
              <i className="bi bi-funnel me-1"></i>Lọc thêm
              <i className={`bi bi-chevron-${showMoreFilters ? 'up' : 'down'} ms-1`}></i>
              {moreFiltersActive && !showMoreFilters && <span className="kho-more-filter-dot" title="Đang có lọc áp dụng trong nhóm này"></span>}
            </button>
          </div>

          {showMoreFilters && (
            <div className="row g-2 mt-1">
              <div className="col-6 col-md-3">
                <label className="form-label small fw-bold mb-1">Ngành đào tạo</label>
                <select className="form-select form-select-sm" value={nganh} onChange={(e) => { setNganh(e.target.value); setTrang(1); }}>
                  <option value="">-- Tất cả --</option>
                  {(configData?.Nganh || []).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="col-6 col-md-3">
                <label className="form-label small fw-bold mb-1">Khóa</label>
                <select className="form-select form-select-sm" value={khoa} onChange={(e) => { setKhoa(e.target.value); setTrang(1); }}>
                  <option value="">-- Tất cả --</option>
                  {(configData?.KhoaNhapHoc || []).map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div className="col-6 col-md-3">
                <label className="form-label small fw-bold mb-1">Hệ đào tạo</label>
                <select className="form-select form-select-sm" value={heDaoTao} onChange={(e) => { setHeDaoTao(e.target.value); setTrang(1); }}>
                  <option value="">-- Tất cả --</option>
                  {(configData?.HeDaoTao || []).map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div className="col-6 col-md-3">
                <label className="form-label small fw-bold mb-1">Hình thức đào tạo</label>
                <select className="form-select form-select-sm" value={hinhThucDaoTao} onChange={(e) => { setHinhThucDaoTao(e.target.value); setTrang(1); }}>
                  <option value="">-- Tất cả --</option>
                  {(configData?.HinhThucDaoTao || []).map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div className="col-6 col-md-3">
                <label className="form-label small fw-bold mb-1">Năm xét tuyển</label>
                <select className="form-select form-select-sm" value={namXetTuyen} onChange={(e) => { setNamXetTuyen(e.target.value); setTrang(1); }}>
                  <option value="">-- Tất cả --</option>
                  {(configData?.NamXetTuyen || []).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---- Bảng kết quả ---- */}
      <div className="card border-0 shadow-sm">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th style={{ width: 40 }} className="text-center">STT</th>
                <th>Họ tên</th>
                <th>CCCD</th>
                <th>Mã sinh viên</th>
                <th>Ngành</th>
                <th>Khóa</th>
                <th>Trạng thái</th>
                <th>Ngày nộp</th>
                <th style={{ width: 60 }} className="text-center">Xem</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan="9" className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary"></div></td></tr>
              ) : isError ? (
                <tr><td colSpan="9" className="text-center py-4 text-danger">Lỗi tải dữ liệu: {error?.message}</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan="9" className="text-center py-4 text-muted">Không tìm thấy hồ sơ nào khớp điều kiện.</td></tr>
              ) : (
                items.map((item, idx) => {
                  // ĐÃ SỬA: bỏ onClick trên cả <tr> (bị lỗi kéo-chọn-chữ hiểu nhầm thành bấm
                  // mở hồ sơ) — thay bằng <Link> thật gắn đúng vào tên, mở trang chi tiết
                  // riêng (route con /quan-ly-ho-so-moi/ho-so/:cccd/:nganh), KHÔNG phải modal
                  // nữa. cccd/nganh đưa vào URL qua encodeURIComponent để an toàn với ký tự
                  // có dấu/khoảng trắng trong tên ngành.
                  const duongDanChiTiet = `/quan-ly-ho-so-moi/ho-so/${encodeURIComponent(item.cccd)}/${encodeURIComponent(item.nganh)}`;
                  return (
                    <tr key={`${item.cccd}_${item.nganh}`.toLowerCase()}>
                      <td className="text-center">{(trang - 1) * kichThuoc + idx + 1}</td>
                      <td><Link to={duongDanChiTiet} className="kho-ten-link">{item.hoTen}</Link></td>
                      <td>{item.cccd}</td>
                      <td>{item.maSinhVien || <span className="text-muted fst-italic">chưa có</span>}</td>
                      <td>{item.nganh}</td>
                      <td>{item.khoa}</td>
                      <td><span className={`badge bg-${BADGE_MAU[item.trangThai] || 'secondary'}`}>{item.trangThai}</span></td>
                      <td>{item.ngayNop}</td>
                      <td className="text-center">
                        <Link to={duongDanChiTiet} className="btn btn-sm btn-outline-primary py-0 px-2">
                          <i className="bi bi-eye"></i>
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="card-body py-2 d-flex flex-wrap justify-content-between align-items-center gap-2 border-top">
          <span className="small text-muted">
            {tongSo === 0 ? 'Không có hồ sơ nào.' : `Đang hiển thị ${(trang - 1) * kichThuoc + 1}–${Math.min(trang * kichThuoc, tongSo)} / ${tongSo} hồ sơ`}
          </span>
          <div className="d-flex align-items-center gap-2">
            <select className="form-select form-select-sm" style={{ width: 90 }} value={kichThuoc} onChange={(e) => { setKichThuoc(Number(e.target.value)); setTrang(1); }}>
              <option value={10}>10/trang</option>
              <option value={20}>20/trang</option>
              <option value={50}>50/trang</option>
              <option value={100}>100/trang</option>
            </select>
            <button className="btn btn-sm btn-outline-secondary" disabled={trang <= 1} onClick={() => setTrang((p) => p - 1)}>‹</button>
            <span className="small">{trang}/{tongTrang}</span>
            <button className="btn btn-sm btn-outline-secondary" disabled={trang >= tongTrang} onClick={() => setTrang((p) => p + 1)}>›</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KhoSinhVienPage;