import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Swal from 'sweetalert2';
import html2pdf from 'html2pdf.js';
// ĐÃ THÊM (theo phản hồi — nút "Xuất Excel" mới trong menu tài khoản): dùng lại đúng thư
// viện "xlsx" (SheetJS) đã có sẵn trong dự án (xem StudentTable.jsx, cùng cách dùng
// json_to_sheet/book_new/writeFile) — không thêm thư viện mới.
import * as XLSX from 'xlsx';
import {
  fetchThamDinhData, duyetTrungTuyen, baoThieuHoSo, luuKetQuaThamDinh, banGiaoDaoTao,
  scanTranscriptImage, compareCurriculumAI, exportThamDinhTemplate, fetchConfig,
  fetchDanhSachMienVanBangCu, // ĐÃ THÊM (Công nhận KQHT & chuyển đổi tín chỉ — Nguồn 2)
  fetchDanhSachMienTheoChungChi, scanChungChiImage, // ĐÃ THÊM (Nguồn 3 "miễn theo chứng chỉ")
  taoYeuCauKyGBTT, // ĐÃ THÊM (Ký điện tử Pha 1 — Bước 4)
  xacNhanCapNhatDaDuyet // ĐÃ THÊM (theo phản hồi — "Xác nhận lại" hồ sơ đã duyệt có cập nhật)
} from '../../api/studentApi';
import {
  getVal, normalizeText, getRowKey, generateMaSV, getBestScore,
  getRawScoreNumber, getRawDateNumber, getMissingDocs, getMissingTienQuyet, getAppState,
  calculateScores, isSafeDriveUrl, getCandidateScanKey,
  // ĐÃ THÊM (Công nhận KQHT & chuyển đổi tín chỉ — Nguồn 2 "miễn theo văn bằng cũ",
  // 2026-09-09): xem chú thích đầy đủ tại nơi định nghĩa trong thamDinhHelpers.js.
  layAllChuanTuCompareResult, layNguon1ThuanTuy, tinhTatCaCacDongTuDong
} from './thamDinhHelpers';
import { DICT_NGANH, DICT_TO_HOP, SUBJ_MAP, DS_LOAI_CHUNG_CHI } from './thamDinhConfig';
import DateRangePicker from './DateRangePicker';
import './ThamDinh.css';
// ĐÃ THÊM (Ký điện tử Pha 1 — Bước 3): bảng "chọn người ký" nhúng vào modal xác nhận
// hàng loạt khi bấm "Xuất GBTT + gửi ký" — xem thêm chú thích tại nơi dùng bên dưới.
import ChonNguoiKyModal from '../KySo/ChonNguoiKyModal';
import CanXacNhanBadge from '../../components/DinhDanh/CanXacNhanBadge'; // ĐÃ THÊM (Pha 1·D1)
// ĐÃ THÊM (Công nhận KQHT & chuyển đổi tín chỉ, 2026-09-09): modal riêng near-fullscreen
// để gộp/gỡ tay bảng đối sánh — xem chú thích đầu file DoiSanhModal.jsx.
import DoiSanhModal from './DoiSanhModal';

// ĐÃ THÊM: hồ sơ đến từ trang "Thu hồ sơ nhập học" (kênh "Thu hồ sơ trực tiếp") đã trúng
// tuyển sẵn khi tạo, KHÔNG đi qua luồng thẩm định/duyệt của Xét tuyển — dùng để (1) ẩn/hiện
// mặc định trong bảng, (2) khoá các nút Duyệt/Báo thiếu để không ai lỡ tay ghi đè trạng
// thái "Đã trúng tuyển" của hồ sơ này thành "Đã duyệt"/"Đã báo thiếu".
const KENH_TRUC_TIEP = "Thu hồ sơ trực tiếp";

// ĐÃ THÊM (theo phản hồi — hiện tên môn thay vì chỉ mã tổ hợp trong modal chi tiết): tra
// theo DICT_TO_HOP (mã tổ hợp -> 3 field điểm, VD "diem_toan") rồi SUBJ_MAP (field điểm ->
// tên cột thật trên Goc01, viết hoa toàn bộ, VD "TOÁN") — chuyển về dạng viết hoa chữ cái
// đầu mỗi từ (VD "TIẾNG ANH" -> "Tiếng Anh") cho dễ đọc, không đổi dữ liệu gốc ở đâu khác.
const tenMonDep = (tenHoa) => String(tenHoa || '').toLowerCase().split(' ').map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : w).join(' ');
const tenMonToHop = (maToHop) => {
  const fields = DICT_TO_HOP[maToHop];
  if (!fields) return '';
  return fields.map(f => tenMonDep(SUBJ_MAP[f])).join(', ');
};

// ===================================================================
// TRANG BAN THẨM ĐỊNH — Pha 3 (KPI/bộ lọc/bảng, chỉ đọc) + Pha 4 (Duyệt trúng
// tuyển, Báo thiếu hồ sơ, Lưu CSDL, Bàn giao Đào tạo, thao tác hàng loạt) + Pha 5
// (quét bảng điểm AI, đối sánh CTĐT, xuất template Excel) — port từ
// thamdinh_-_app.js (vanilla JS cũ), giữ nguyên toàn bộ luật nghiệp vụ.
// ===================================================================

// ĐÃ THÊM (theo phản hồi — rút gọn tên hồ sơ CHỈ ở badge "Thiếu: ..." của cột "Trạng thái
// hồ sơ" trong bảng chính): KHÔNG đổi doc.name gốc trong DICT_HO_SO (thamDinhConfig.js) —
// tên đầy đủ vẫn dùng nguyên cho logic đối chiếu (getMissingDocs/getMissingTienQuyet), cho
// Swal báo thiếu, cho modal chi tiết, và cho cột "DANH SÁCH HỒ SƠ THIẾU" khi xuất Excel —
// chỉ RÚT GỌN CHỮ HIỂN THỊ ở đúng 1 chỗ theo yêu cầu, để badge trong bảng gọn hơn.
const TEN_HO_SO_RUT_GON = {
  "Sơ yếu lý lịch": "SYLL",
  "Bản sao CCCD": "CCCD",
  "Bản sao Bằng THPT/Giấy báo điểm": "Bằng THPT/Giấy báo điểm",
  "Bản sao Học bạ THPT": "Học bạ THPT",
};
const rutGonTenHoSo = (ten) => TEN_HO_SO_RUT_GON[ten] || ten;

const PAGE_SIZE_DEFAULT = 10;
const SCAN_CACHE_KEY = 'td_scan_cache_v1'; // giữ đúng tên key sessionStorage của bản cũ

const fmtDateInput = (d) => {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const nowVnDate = () => new Date().toLocaleDateString('vi-VN');

// ĐÃ THÊM: tên file quét bảng điểm quá dài -> hiển thị rút gọn kiểu "đoạn đầu...đoạn
// cuối" (giữ phần đuôi vì thường chứa đuôi mở rộng .jpg/.pdf), thay vì cắt cụt 1 phía.
const truncateMiddle = (str, maxLen = 26) => {
  if (!str || str.length <= maxLen) return str;
  const headLen = Math.ceil((maxLen - 3) / 2);
  const tailLen = Math.floor((maxLen - 3) / 2);
  return `${str.slice(0, headLen)}...${str.slice(str.length - tailLen)}`;
};

// ĐÃ THÊM (Pha 5): đọc cache quét bảng điểm/đối sánh CTĐT đã lưu từ phiên trước
// (sessionStorage) — khớp đúng hành vi bản cũ (candidateScanCache + 'td_scan_cache_v1').
const loadScanCache = () => {
  try {
    const stored = sessionStorage.getItem(SCAN_CACHE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (e) {
    return {};
  }
};

// ĐÃ THÊM (theo yêu cầu — "Số quyết định" dạng "xx/năm", VD "01/2026", "012/2025"): phần
// số thứ tự có thể 1-4 chữ số (không cố định độ dài như "01"), phần năm luôn đúng 4 chữ số.
const SO_QUYET_DINH_REGEX = /^\d{1,4}\/\d{4}$/;

const ThamDinhPage = () => {
  const queryClient = useQueryClient();
  const { data: rawData = [], isLoading, isError, error, dataUpdatedAt } = useQuery({
    queryKey: ['thamDinhData'],
    queryFn: fetchThamDinhData,
  });

  const today = useMemo(() => new Date(), []);
  const sevenDaysAgo = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d; }, []);
  // ĐÃ THÊM: chốt lại đúng 2 chuỗi ngày mặc định (7 ngày gần nhất) 1 lần duy nhất, dùng
  // lại cả lúc khởi tạo state lẫn lúc "Xóa bộ lọc" / so sánh xem bộ lọc có đang bị đổi
  // khác mặc định hay không (xem isFilterActive bên dưới) — tránh 2 nơi tính ra 2 giá
  // trị lệch nhau do gọi fmtDateInput() ở 2 chỗ khác lúc (dù cùng ngày thì không lệch,
  // nhưng gộp về 1 biến vẫn rõ ràng và an toàn hơn).
  const defaultDateFrom = useMemo(() => fmtDateInput(sevenDaysAgo), [sevenDaysAgo]);
  const defaultDateTo = useMemo(() => fmtDateInput(today), [today]);

  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(defaultDateTo);
  const [filterNganh, setFilterNganh] = useState('');
  const [filterDoiTuong, setFilterDoiTuong] = useState('');
  const [filterHoSo, setFilterHoSo] = useState('');
  const [filterThamDinh, setFilterThamDinh] = useState(''); // ĐÃ THÊM: lọc theo Trạng thái thẩm định
  // ĐÃ THÊM: mặc định ẨN hồ sơ kênh "Thu hồ sơ trực tiếp" (Nhập học) — chủ động bật lên
  // mới thấy. Đây là filter thuần client-side trên rawData đã tải sẵn nên bật/tắt cập
  // nhật bảng NGAY, không cần gọi lại server.
  const [showTrucTiep, setShowTrucTiep] = useState(false);
  const [sortBy, setSortBy] = useState('date_desc');
  // ĐÃ THÊM: tách bộ lọc 2 tầng theo yêu cầu — hàng "ghim" (Tìm nhanh/Thời gian/Trạng
  // thái thẩm định/Sắp xếp) luôn hiện, các ô còn lại (Ngành/Đối tượng/Trạng thái hồ
  // sơ/Nhập học trực tiếp) chỉ xổ ra khi bấm nút "Lọc thêm" — cờ này quyết định hàng
  // đó có đang mở hay không.
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [viewingIndex, setViewingIndex] = useState(null); // ĐÃ SỬA (Pha 5): lưu vị trí trong filteredData thay vì row trực tiếp, để làm nút Trước/Sau
  const [crossCheckNganh, setCrossCheckNganh] = useState(''); // "khảo sát ngành khác" — rỗng = dùng đúng ngành đăng ký thật
  const [scanCache, setScanCache] = useState(loadScanCache); // { [scanKey]: { transcriptJSON, compareResult, scanFileName, ketQuaDoiSanhDaChinh, mienVanBangCu } }
  // ĐÃ THÊM (Công nhận KQHT & chuyển đổi tín chỉ, 2026-09-09): cờ mở/đóng modal đối sánh
  // chi tiết (DoiSanhModal.jsx) — tách khỏi viewingIndex vì modal này lồng BÊN TRONG modal
  // chi tiết đã có, không thay thế nó.
  const [doiSanhModalOpen, setDoiSanhModalOpen] = useState(false);
  // ĐÃ THÊM: cấu hình chung (hiện chỉ dùng TranTinChiCongNhan — trần cảnh báo tín chỉ công
  // nhận cho DoiSanhModal) — staleTime dài vì hầu như không đổi trong 1 phiên làm việc.
  const { data: appConfig } = useQuery({ queryKey: ['appConfig'], queryFn: fetchConfig, staleTime: 5 * 60 * 1000 });
  // ĐÃ THÊM (Công nhận KQHT & chuyển đổi tín chỉ — Nguồn 2 "miễn theo văn bằng cũ",
  // 2026-09-09): 3 bảng miễn cố định (Điều 6), đọc từ tab "MienTheoVanBangCu" — dữ liệu quy
  // định gần như không đổi trong 1 phiên làm việc, staleTime dài như appConfig.
  const { data: dsMienVanBangCu } = useQuery({ queryKey: ['dsMienVanBangCu'], queryFn: fetchDanhSachMienVanBangCu, staleTime: 5 * 60 * 1000 });
  // ĐÃ THÊM (Công nhận KQHT & chuyển đổi tín chỉ — Nguồn 3 "miễn theo chứng chỉ", 2026-09-10):
  // bảng tra Điều 8-11 (tab "MienTheoChungChi") — cùng lý do staleTime dài như dsMienVanBangCu.
  const { data: dsMienTheoChungChi } = useQuery({ queryKey: ['dsMienTheoChungChi'], queryFn: fetchDanhSachMienTheoChungChi, staleTime: 5 * 60 * 1000 });
  // ĐÃ THÊM (Nguồn 3): OCR 1 ảnh chứng chỉ — dùng chung 1 mutation cho MỌI dòng (mọi loại
  // chứng chỉ), phân biệt bằng scanKey+dongId lúc gọi, không cần 1 mutation/dòng.
  const scanChungChiMutation = useMutation({ mutationFn: ({ loaiChungChiValue, imageBase64, mimeType }) => scanChungChiImage(loaiChungChiValue, imageBase64, mimeType) });
  const fileInputRef = useRef(null);
  const [batchPreview, setBatchPreview] = useState(null);
  // ĐÃ THÊM (Ký điện tử Pha 1 — Bước 3): danh sách người ký đang chọn cho lần "Xuất
  // GBTT" hiện tại — được ChonNguoiKyModal tự seed 1 lần từ cấu hình ChucDanhKy. Reset
  // về [] mỗi khi mở lại batchPreview loại 'gbtt' (xem openBatchPreview bên dưới) để
  // không giữ lựa chọn của lần xuất trước.
  const [nguoiKyGBTT, setNguoiKyGBTT] = useState([]);
  // ĐÃ THÊM (theo yêu cầu — placeholder "Ngày xuất giấy báo"/"Tháng nhập học" trong mẫu
  // GBTT): 2 giá trị CHUNG cho CẢ ĐỢT xuất (không phải riêng từng sinh viên), chọn ngay
  // trên modal "Xuất GBTT + chọn người ký" cạnh ChonNguoiKyModal. Mặc định "Ngày xuất giấy
  // báo" = hôm nay (thường đúng đa số trường hợp, vẫn sửa được); "Tháng nhập học" để trống,
  // bắt phải tự chọn vì không có mặc định nào hợp lý (khác trường/đợt tuyển sẽ khác tháng).
  const [ngayXuatGiayBao, setNgayXuatGiayBao] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  // ĐÃ SỬA (theo phản hồi — bug "tháng NaN năm 9/2026" do <input type="month"> không được
  // Firefox/Safari cũ hỗ trợ, tự rớt về Ô NHẬP CHỮ TỰ DO không kiểm tra định dạng gì cả):
  // tách hẳn thành 2 state ĐỘC LẬP thangNH/namNH (bind trực tiếp vào 2 <select> riêng) thay
  // vì 1 state "YYYY-MM" gộp chung rồi tách/ghép qua lại — làm vậy để chọn NĂM trước khi
  // chọn THÁNG (hoặc ngược lại) vẫn GIỮ ĐƯỢC lựa chọn đó ngay trên UI, không bị "biến mất"
  // (nếu gộp chung 1 state và chỉ ghi khi ĐỦ CẢ HAI, chọn 1 ô trước sẽ không lưu được gì,
  // ô vừa chọn lại hiện về "-- Chọn --" ở lần render kế tiếp). "thangNhapHoc" (chuỗi
  // "YYYY-MM" gửi lên backend, giữ NGUYÊN như thiết kế cũ) giờ là giá trị TÍNH RA từ 2
  // state này, không phải state riêng nữa.
  const [thangNH, setThangNH] = useState('');
  const [namNH, setNamNH] = useState('');
  const thangNhapHoc = (thangNH && namNH) ? `${namNH}-${thangNH}` : '';
  const namHienTaiNH = new Date().getFullYear();
  // ĐÃ THÊM (theo yêu cầu — placeholder "Số quyết định" trong mẫu GBTT): 1 giá trị CHUNG
  // cho CẢ ĐỢT xuất (giống hệt ngayXuatGiayBao/thangNhapHoc), gõ tự do đúng dạng "xx/năm"
  // (VD "01/2026", "012/2025" — số thứ tự quyết định không cố định 2 chữ số nên KHÔNG dùng
  // <select>/đệm số như Tháng nhập học, chỉ validate bằng regex khi hiện dòng xem trước +
  // khoá nút "Xác nhận" nếu sai định dạng, xem SO_QUYET_DINH_REGEX bên dưới).
  const [soQuyetDinh, setSoQuyetDinh] = useState('');
  // ĐÃ THÊM (Ký điện tử Pha 2 — Bước 3): chế độ ký cho CẢ ĐỢT xuất này — 'TUAN_TU' (mặc
  // định, giữ nguyên hành vi Pha 1: ký lần lượt đúng thứ tự chức danh) hoặc 'SONG_SONG'
  // (mọi người ký cùng lúc, ký theo thứ tự bất kỳ, hoàn tất khi người CUỐI CÙNG bấm ký —
  // bất kể vai trò). Xem action taoYeuCauKyGBTT/kyYeuCau (Quanlysv.gs).
  const [cheDoKy, setCheDoKy] = useState('TUAN_TU');
  // ĐÃ THÊM: cờ đóng/mở menu xổ xuống của nút "Xuất file" trong modal thẩm định chi
  // tiết — modal được render bằng IIFE gọi có điều kiện (viewingIndex !== null && ...)
  // nên KHÔNG được khai báo useState bên trong đó (vi phạm Rules of Hooks), phải khai
  // báo ở cấp cao nhất của component như các state khác.
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false); // trạng thái đang tạo file PDF sơ bộ (html2pdf.js chạy bất đồng bộ, không qua react-query)
  const exportMenuRef = useRef(null);

  // ĐÃ THÊM: đóng menu "Xuất file" khi bấm ra ngoài — không có Bootstrap JS/react-bootstrap
  // trong dự án (chỉ CSS Bootstrap qua CDN) nên phải tự bắt sự kiện mousedown, giống hệt
  // cách dropdown tài khoản ở App.jsx đang làm.
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (exportMenuOpen && exportMenuRef.current && !exportMenuRef.current.contains(e.target)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [exportMenuOpen]);

  // ĐÃ THÊM (theo phản hồi — modal thẩm định chưa tắt được bằng ESC): cả modal chi tiết
  // (viewingIndex) lẫn modal xác nhận thao tác hàng loạt (batchPreview) trước giờ chỉ tự
  // dựng bằng div/state (không dùng Bootstrap JS thật — xem chú thích exportMenuOpen phía
  // trên), nên KHÔNG có sẵn hành vi đóng-bằng-ESC như modal Bootstrap chuẩn — phải tự bắt
  // sự kiện keydown ở cấp document. Ưu tiên đóng modal chi tiết trước (kèm đóng luôn menu
  // "Xuất file" nếu đang mở, giống hệt cách nút "X"/click ra ngoài đang làm) — modal chi
  // tiết và modal batchPreview không bao giờ mở cùng lúc trong luồng hiện tại, nhưng vẫn
  // ưu tiên rõ ràng phòng trường hợp mở rộng luồng sau này.
  useEffect(() => {
    const handleEscKey = (e) => {
      if (e.key !== 'Escape') return;
      if (viewingIndex !== null) {
        setViewingIndex(null);
        setExportMenuOpen(false);
      } else if (batchPreview) {
        setBatchPreview(null);
      }
    };
    document.addEventListener('keydown', handleEscKey);
    return () => document.removeEventListener('keydown', handleEscKey);
  }, [viewingIndex, batchPreview]);

  const [localOverrides, setLocalOverrides] = useState({});
  const getEffectiveState = (row) => localOverrides[getRowKey(row)]?.appState ?? getAppState(row);
  const getEffectiveSaved = (row) => localOverrides[getRowKey(row)]?.saved ?? false;
  const setOverride = (key, patch) => setLocalOverrides(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const { nganhOptions, doiTuongOptions } = useMemo(() => {
    const nganhSet = new Set(); const doiTuongSet = new Set();
    rawData.forEach(r => {
      const ng = getVal(r, ["NGÀNH", "NGÀNH ĐÀO TẠO"]); if (ng) nganhSet.add(ng);
      const dt = getVal(r, ["ĐỐI TƯỢNG ĐẦU VÀO", "ĐỐI TƯỢNG"]); if (dt) doiTuongSet.add(dt);
    });
    return { nganhOptions: [...nganhSet], doiTuongOptions: [...doiTuongSet] };
  }, [rawData]);

  const filteredData = useMemo(() => {
    const fDate = dateFrom ? new Date(dateFrom) : null; if (fDate) fDate.setHours(0, 0, 0, 0);
    const tDate = dateTo ? new Date(dateTo) : null; if (tDate) tDate.setHours(23, 59, 59, 999);
    const qVal = normalizeText(search);
    const hVal = filterHoSo.toLowerCase();

    let result = rawData.filter(row => {
      if (fDate || tDate) {
        const rowDateMs = getRawDateNumber(row);
        if (rowDateMs === 0) return false;
        if (fDate && rowDateMs < fDate.getTime()) return false;
        if (tDate && rowDateMs > tDate.getTime()) return false;
      }
      // ĐÃ THÊM: mặc định ẩn hồ sơ kênh "Thu hồ sơ trực tiếp" — bật showTrucTiep mới hiện.
      if (!showTrucTiep && getVal(row, ["KÊNH NỘP"]) === KENH_TRUC_TIEP) return false;
      if (filterNganh && getVal(row, ["NGÀNH", "NGÀNH ĐÀO TẠO"]) !== filterNganh) return false;
      if (filterDoiTuong && getVal(row, ["ĐỐI TƯỢNG ĐẦU VÀO", "ĐỐI TƯỢNG"]) !== filterDoiTuong) return false;
      // ĐÃ THÊM: lọc theo Trạng thái thẩm định (tính cả localOverrides qua getEffectiveState,
      // giống hệt cách sortBy === "status" đã dùng bên dưới).
      if (filterThamDinh && getEffectiveState(row) !== filterThamDinh) return false;
      if (qVal) {
        const maSV = generateMaSV(row);
        const cccd = getVal(row, ["CĂN CƯỚC", "CCCD", "SỐ CCCD"]).replace(/^['"]+|['"]+$/g, '');
        const hoTen = getVal(row, ["TÊN SINH VIÊN", "HỌ VÀ TÊN"]);
        const haystack = normalizeText(`${maSV} ${cccd} ${hoTen}`);
        if (!haystack.includes(qVal)) return false;
      }
      const missingCount = getMissingDocs(row).length;
      if (hVal === "đủ" && missingCount > 0) return false;
      if (hVal === "thiếu" && missingCount === 0) return false;
      return true;
    });

    if (sortBy === "date_desc") result.sort((a, b) => getRawDateNumber(b) - getRawDateNumber(a));
    else if (sortBy === "date_asc") result.sort((a, b) => getRawDateNumber(a) - getRawDateNumber(b));
    else if (sortBy === "score_desc") result.sort((a, b) => getRawScoreNumber(b) - getRawScoreNumber(a));
    else if (sortBy === "status") {
      const statusRank = { "Đang chờ duyệt": 1, "Mới bổ sung": 2, "Đã báo thiếu": 3, "Đã duyệt": 4, "Đã trúng tuyển": 5 };
      result.sort((a, b) => (statusRank[getEffectiveState(a)] || 6) - (statusRank[getEffectiveState(b)] || 6));
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawData, dateFrom, dateTo, filterNganh, filterDoiTuong, filterHoSo, filterThamDinh, search, sortBy, localOverrides, showTrucTiep]);

  const kpi = useMemo(() => ({
    total: filteredData.length,
    du: filteredData.filter(r => getMissingDocs(r).length === 0).length,
    thieu: filteredData.filter(r => getMissingDocs(r).length > 0).length,
    daDuyet: filteredData.filter(r => getEffectiveState(r) === "Đã duyệt").length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [filteredData, localOverrides]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const safePage = Math.min(Math.max(currentPage, 1), totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pageRows = filteredData.slice(pageStart, pageStart + pageSize);

  const resetFilters = () => {
    setSearch('');
    // ĐÃ SỬA: trước đây bấm "Xóa bộ lọc" xóa 2 ô ngày về RỖNG (hiện tất cả hồ sơ từ
    // trước tới nay), khác với trạng thái ban đầu lúc mới vào trang (mặc định 7 ngày
    // gần nhất) — giờ trả về đúng mặc định ban đầu để "Xóa bộ lọc" và "mới vào trang"
    // luôn là cùng 1 trạng thái, khớp với logic đổi màu nút bên dưới (isFilterActive).
    setDateFrom(defaultDateFrom); setDateTo(defaultDateTo);
    setFilterNganh(''); setFilterDoiTuong('');
    setFilterHoSo(''); setFilterThamDinh(''); setSortBy('date_desc'); setCurrentPage(1);
    setShowTrucTiep(false);
  };

  // ĐÃ THÊM: có đang khác trạng thái mặc định hay không -> quyết định màu nút "Xóa lọc"
  // (yêu cầu: bình thường không màu, nổi cam nhạt khi người dùng đã chọn/nhập gì đó).
  const isFilterActive = search !== '' || dateFrom !== defaultDateFrom || dateTo !== defaultDateTo ||
    filterNganh !== '' || filterDoiTuong !== '' || filterHoSo !== '' || filterThamDinh !== '' || sortBy !== 'date_desc' ||
    showTrucTiep !== false;

  // ĐÃ SỬA: Ngành đào tạo và nút "Nhập học trực tiếp" chuyển lên hàng ghim (luôn hiện)
  // theo yêu cầu đợt sau, nên nhóm "Lọc thêm" giờ chỉ còn Đối tượng đầu vào/Trạng thái
  // hồ sơ — chấm cam trên nút "Lọc thêm" chỉ cần phản ánh đúng 2 ô còn ẩn trong đó.
  const moreFiltersActive = filterDoiTuong !== '' || filterHoSo !== '';

  const toggleSelect = (key, checked) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (checked) next.add(key); else next.delete(key);
      return next;
    });
  };

  // ĐÃ THÊM (theo phản hồi — nút "Xuất Excel" trong menu tài khoản, App.jsx): xuất TOÀN BỘ
  // filteredData (đúng danh sách đang hiển thị trên bảng theo bộ lọc HIỆN TẠI — search,
  // khoảng ngày, ngành, trạng thái..., KHÔNG chỉ riêng trang đang xem/pageRows, vì phân
  // trang chỉ là hiển thị) ra file Excel tải về máy.
  // ĐÃ SỬA (theo phản hồi lần 2):
  //  1) "ĐIỂM TRÚNG TUYỂN" giờ GÁN CỨNG cho MỌI hồ sơ (kể cả chưa đủ điều kiện điểm chuẩn,
  //     miễn có xác định được tổ hợp) và lấy đúng ĐIỂM CUỐI CÙNG — đã cộng Điểm ưu tiên +
  //     Điểm cộng + Điểm phỏng vấn (nếu có) — dùng calculateScores() (đã có sẵn công thức
  //     đúng, dùng chung với modal chi tiết) thay vì getRawScoreNumber() cũ (hàm đó KHÔNG
  //     hề cộng Điểm phỏng vấn, xem getBestScore() ở thamDinhHelpers.js).
  //  2) Thêm cột "TỔ HỢP" (mã tổ hợp + tên 3 môn, VD "D01 (Toán, Ngữ Văn, Tiếng Anh)") ngay
  //     sau cột "ĐIỂM TRÚNG TUYỂN" — dùng chung tenMonToHop() đã có ở modal chi tiết.
  //  3) Bỏ các cột không cần thiết khi xuất báo cáo: "SV_KEY" (định danh nội bộ), "TT" (cột lạ
  //     trùng nghĩa với STT, có sẵn thẳng trên Goc01), "RAW_DIEM_HK" (JSON nội bộ dùng khôi
  //     phục điểm Lớp/Kỳ bên trang Xét tuyển, không phải dữ liệu để đọc/báo cáo) — so khớp
  //     tên cột không phân biệt hoa/thường/khoảng trắng thừa (giữ tên cột GỐC khi xuất,
  //     chỉ dùng bản chuẩn hoá để SO SÁNH loại trừ).
  //  4) ĐÃ THÊM: "RAW_DIEM_KHAC_1"/"RAW_DIEM_KHAC_2" — 2 cột JSON nội bộ mới (cùng vai trò
  //     như RAW_DIEM_HK ở trên, nhưng lưu raw của 2 phương thức xét tuyển KHÔNG đang chọn,
  //     xem chú thích tại chỗ đóng gói trong XetTuyenPage.jsx) — cũng không phải dữ liệu để
  //     đọc/báo cáo, loại khỏi export giống hệt RAW_DIEM_HK.
  const CAC_COT_LOAI_BO_KHI_XUAT = new Set(["SV_KEY", "TT", "RAW_DIEM_HK", "RAW_DIEM_KHAC_1", "RAW_DIEM_KHAC_2"]);
  const handleExportExcel = () => {
    if (filteredData.length === 0) {
      Swal.fire({ icon: 'warning', title: 'Không có dữ liệu', text: 'Không có hồ sơ nào đang hiển thị (đang bị bộ lọc loại hết) để xuất.' });
      return;
    }
    const exportRows = filteredData.map((row, idx) => {
      const rowSach = {};
      Object.keys(row).forEach(k => {
        const kChuan = String(k).trim().toUpperCase();
        if (!CAC_COT_LOAI_BO_KHI_XUAT.has(kChuan)) rowSach[k] = row[k];
      });

      const nganhRow = getVal(row, ["NGÀNH", "NGÀNH ĐÀO TẠO"]);
      const scoreInfo = calculateScores(row, nganhRow);
      const diemTrungTuyenFinal = scoreInfo.type === 'thpt'
        ? (scoreInfo.hasScore ? parseFloat(scoreInfo.finalTotalScore) : 0)
        : getRawScoreNumber(row);
      const toHopText = (scoreInfo.type === 'thpt' && scoreInfo.hasScore && scoreInfo.bestCombo)
        ? `${scoreInfo.bestCombo} (${tenMonToHop(scoreInfo.bestCombo)})`
        : '';

      return {
        "STT": idx + 1,
        ...rowSach,
        "MÃ SINH VIÊN": generateMaSV(row),
        "ĐIỂM TRÚNG TUYỂN": diemTrungTuyenFinal,
        "TỔ HỢP": toHopText,
        "TRẠNG THÁI THẨM ĐỊNH": getEffectiveState(row),
      };
    });
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ThamDinh");
    const hienTai = new Date();
    const tenFile = `ThamDinh_${String(hienTai.getDate()).padStart(2, '0')}-${String(hienTai.getMonth() + 1).padStart(2, '0')}-${hienTai.getFullYear()}.xlsx`;
    XLSX.writeFile(wb, tenFile);
  };

  // ĐÃ THÊM: lắng nghe sự kiện "thamdinh:export-excel" do App.jsx bắn ra khi bấm mục "Xuất
  // Excel" trong menu tài khoản (mục đó chỉ hiện khi đang ở trang này, xem isThamDinhPage
  // bên App.jsx) — App.jsx không có sẵn filteredData nên không tự xuất được, phải nhờ đúng
  // component đang giữ dữ liệu này xử lý. Phụ thuộc filteredData để luôn dùng đúng danh
  // sách MỚI NHẤT tại thời điểm bấm xuất (bộ lọc đổi liên tục).
  useEffect(() => {
    window.addEventListener('thamdinh:export-excel', handleExportExcel);
    return () => window.removeEventListener('thamdinh:export-excel', handleExportExcel);
  }, [filteredData]);

  // ĐÃ THÊM (theo phản hồi — "Xuất DS tuỳ chọn"): giống hệt handleExportExcel ở trên (dùng
  // chung filteredData, cùng bộ cột loại bỏ CAC_COT_LOAI_BO_KHI_XUAT) nhưng cho phép NGƯỜI
  // DÙNG TỰ CHỌN cột nào sẽ xuất, thay vì 1 bộ cột cố định — trong đó có "DANH SÁCH HỒ SƠ
  // THIẾU" (dùng lại đúng getMissingDocs() đã có sẵn, hiển thị trên bảng/modal chi tiết,
  // không viết lại logic xác định thiếu gì).
  // ĐÃ SỬA (theo phản hồi): thêm các cột "sau tính toán" còn thiếu (điểm ưu tiên khu
  // vực/đối tượng, tên+điểm từng môn tổ hợp) — TRƯỚC ĐÓ những mục này không có trong danh
  // sách nên người dùng chỉ chọn được đúng cột GỐC trên Goc01 (thường thô/trống), không lấy
  // được giá trị thật đã qua calculateScores().
  const COT_TINH_TOAN = [
    "MÃ SINH VIÊN", "ĐIỂM TRÚNG TUYỂN", "TỔ HỢP",
    "TÊN MÔN 1", "ĐIỂM MÔN 1", "TÊN MÔN 2", "ĐIỂM MÔN 2", "TÊN MÔN 3", "ĐIỂM MÔN 3",
    "ĐIỂM ƯU TIÊN KHU VỰC", "ĐIỂM ƯU TIÊN ĐỐI TƯỢNG",
    "TRẠNG THÁI THẨM ĐỊNH", "DANH SÁCH HỒ SƠ THIẾU", "SỐ HỒ SƠ THIẾU",
  ];
  const [customExportOpen, setCustomExportOpen] = useState(false);
  const [cotDaChon, setCotDaChon] = useState(new Set());

  // Danh sách cột khả dụng = hợp các cột GỐC xuất hiện trong filteredData (giữ thứ tự xuất
  // hiện đầu tiên, loại các cột đã ẩn) + các cột TÍNH TOÁN cố định ở cuối.
  // ĐÃ SỬA (theo phản hồi — bị hiện 2 ô tick trùng tên, VD "MÃ SINH VIÊN"/"TRẠNG THÁI THẨM
  // ĐỊNH"): Goc01 vốn ĐÃ CÓ SẴN cột trùng tên với cột tính toán tương ứng (giá trị RAW/thô,
  // khác giá trị đã tính) — trước đây cả 2 cùng lọt vào danh sách vì chỉ dedupe bên trong
  // nhóm "goc", không so với nhóm COT_TINH_TOAN. Giờ loại bỏ khỏi "goc" bất kỳ cột nào tên
  // (đã chuẩn hoá) trùng với 1 cột tính toán — CHỈ giữ lại đúng 1 bản, luôn là bản đã tính,
  // để không còn ô tick trùng VÀ để chọn cột đó luôn ra đúng giá trị đã xử lý, không phải
  // giá trị thô.
  const danhSachCotKhaDung = useMemo(() => {
    const tenTinhToanChuan = new Set(COT_TINH_TOAN.map(t => t.trim().toUpperCase()));
    const goc = [];
    const daThay = new Set();
    filteredData.forEach(row => {
      Object.keys(row).forEach(k => {
        const kChuan = String(k).trim().toUpperCase();
        if (CAC_COT_LOAI_BO_KHI_XUAT.has(kChuan) || tenTinhToanChuan.has(kChuan) || daThay.has(k)) return;
        daThay.add(k);
        goc.push(k);
      });
    });
    return [...goc, ...COT_TINH_TOAN];
  }, [filteredData]);

  useEffect(() => {
    const moDialog = () => {
      setCotDaChon(new Set(danhSachCotKhaDung)); // mặc định chọn tất cả, người dùng tự bỏ bớt
      setCustomExportOpen(true);
    };
    window.addEventListener('thamdinh:export-custom', moDialog);
    return () => window.removeEventListener('thamdinh:export-custom', moDialog);
  }, [danhSachCotKhaDung]);

  const toggleCot = (k) => {
    setCotDaChon(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  const handleExportCustom = () => {
    if (filteredData.length === 0) {
      Swal.fire({ icon: 'warning', title: 'Không có dữ liệu', text: 'Không có hồ sơ nào đang hiển thị (đang bị bộ lọc loại hết) để xuất.' });
      return;
    }
    if (cotDaChon.size === 0) {
      Swal.fire({ icon: 'warning', title: 'Chưa chọn cột nào', text: 'Chọn ít nhất 1 cột để xuất.' });
      return;
    }
    const exportRows = filteredData.map((row, idx) => {
      const nganhRow = getVal(row, ["NGÀNH", "NGÀNH ĐÀO TẠO"]);
      const scoreInfo = calculateScores(row, nganhRow);
      const diemTrungTuyenFinal = scoreInfo.type === 'thpt'
        ? (scoreInfo.hasScore ? parseFloat(scoreInfo.finalTotalScore) : 0)
        : getRawScoreNumber(row);
      const toHopText = (scoreInfo.type === 'thpt' && scoreInfo.hasScore && scoreInfo.bestCombo)
        ? `${scoreInfo.bestCombo} (${tenMonToHop(scoreInfo.bestCombo)})`
        : '';

      // ĐÃ THÊM (theo phản hồi — cần dữ liệu SAU TÍNH TOÁN, không phải cột thô trên Goc01):
      // đúng logic đang dùng ở buildGbttPayload (tách riêng thay vì gọi lại hàm đó, để
      // không phụ thuộc hình dạng dữ liệu của tính năng Ký điện tử — 2 nơi tính trùng công
      // thức nhưng độc lập, sửa 1 bên không ảnh hưởng bên kia).
      let mon1Ten = "", mon1Diem = "", mon2Ten = "", mon2Diem = "", mon3Ten = "", mon3Diem = "";
      let diemUuTienKhuVuc = "", diemUuTienDoiTuong = "";
      if (scoreInfo.type === 'thpt' && scoreInfo.hasScore) {
        const monHoc = DICT_TO_HOP[scoreInfo.bestCombo] || [];
        const ketQuaCombo = (scoreInfo.comboResults || []).find(c => c.combo === scoreInfo.bestCombo) || {};
        mon1Ten = monHoc[0] ? SUBJ_MAP[monHoc[0]] : ""; mon1Diem = ketQuaCombo.s1 ?? "";
        mon2Ten = monHoc[1] ? SUBJ_MAP[monHoc[1]] : ""; mon2Diem = ketQuaCombo.s2 ?? "";
        mon3Ten = monHoc[2] ? SUBJ_MAP[monHoc[2]] : ""; mon3Diem = ketQuaCombo.s3 ?? "";
        diemUuTienKhuVuc = scoreInfo.diemUuTienKhuVuc ?? "";
        diemUuTienDoiTuong = scoreInfo.diemUuTienDoiTuong ?? "";
      }

      const dsThieu = getMissingDocs(row);

      const giaTriCot = {
        ...row,
        "MÃ SINH VIÊN": generateMaSV(row),
        "ĐIỂM TRÚNG TUYỂN": diemTrungTuyenFinal,
        "TỔ HỢP": toHopText,
        "TÊN MÔN 1": mon1Ten, "ĐIỂM MÔN 1": mon1Diem,
        "TÊN MÔN 2": mon2Ten, "ĐIỂM MÔN 2": mon2Diem,
        "TÊN MÔN 3": mon3Ten, "ĐIỂM MÔN 3": mon3Diem,
        "ĐIỂM ƯU TIÊN KHU VỰC": diemUuTienKhuVuc,
        "ĐIỂM ƯU TIÊN ĐỐI TƯỢNG": diemUuTienDoiTuong,
        "TRẠNG THÁI THẨM ĐỊNH": getEffectiveState(row),
        // ĐÃ SỬA (theo phản hồi — mỗi loại hồ sơ thiếu xuống 1 hàng riêng TRONG CÙNG 1 Ô,
        // không chỉ cách nhau dấu ";"): nối bằng ký tự xuống dòng "\n" — Excel lưu đúng
        // nhiều dòng trong 1 ô, nhưng thư viện "xlsx" (SheetJS bản cộng đồng) đang dùng ở
        // đây KHÔNG ghi được định dạng ô (không tự bật "Wrap Text") — dữ liệu vẫn đúng
        // nhiều dòng, chỉ cần tự bật Wrap Text (hoặc kéo cao hàng) trong Excel để NHÌN THẤY
        // xuống dòng, không phải lỗi thiếu dòng.
        "DANH SÁCH HỒ SƠ THIẾU": dsThieu.join("\n"),
        "SỐ HỒ SƠ THIẾU": dsThieu.length,
      };

      const hang = { "STT": idx + 1 };
      danhSachCotKhaDung.forEach(k => { if (cotDaChon.has(k)) hang[k] = giaTriCot[k]; });
      return hang;
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DSTuyChon");
    const hienTai = new Date();
    const tenFile = `ThamDinh_TuyChon_${String(hienTai.getDate()).padStart(2, '0')}-${String(hienTai.getMonth() + 1).padStart(2, '0')}-${hienTai.getFullYear()}.xlsx`;
    XLSX.writeFile(wb, tenFile);
    setCustomExportOpen(false);
  };

  // ĐÃ SỬA: bỏ icon emoji đầu chữ trong cột THẨM ĐỊNH của bảng datalist theo yêu cầu
  // (chỉ còn chữ, cột không bị chật thêm bởi icon nữa).
  // ĐÃ THÊM: nếu hồ sơ đã bấm "Lưu vào CSDL" (saved = true, xem getEffectiveSaved) thì
  // ưu tiên hiển thị "Đã lưu" trước mọi trạng thái khác — kiểm tra saved TRƯỚC state.
  // ĐÃ SỬA (theo phản hồi — hồ sơ ĐÃ DUYỆT có cập nhật/bổ sung thêm): nhận thêm tham số
  // "row" (trước đây chỉ có state/saved) để tự đọc RAW "TRẠNG THÁI THẨM ĐỊNH" — backend
  // (Quanlysv.gs/importStudents) giờ có thể ghi "Đã duyệt (Có cập nhật: ...)" thay vì hạ
  // xuống "Mới bổ sung" khi sửa 1 hồ sơ đã duyệt (xem chú thích đầy đủ ở đó). Badge đổi màu
  // cam + thêm dấu * để cán bộ nhận ra ngay hồ sơ này vừa có thay đổi cần xem lại.
  const stateBadge = (row, state, saved) => {
    if (saved) return { text: "Đã lưu", cls: "btn-secondary" };
    // ĐÃ THÊM: hồ sơ Thu hồ sơ trực tiếp (Nhập học) — nhãn riêng, tách rõ khỏi luồng thẩm định.
    if (state === "Đã trúng tuyển") return { text: "Đã trúng tuyển (NH)", cls: "btn-dark" };
    if (state === "Đã duyệt") {
      const rawTrangThai = getVal(row, ["TRẠNG THÁI THẨM ĐỊNH", "TRẠNG THÁI"]);
      if (rawTrangThai.indexOf("Có cập nhật") !== -1) return { text: "Đã duyệt *", cls: "btn-warning text-dark" };
      return { text: "Đã duyệt", cls: "btn-success" };
    }
    if (state === "Đã báo thiếu") return { text: "Đã yêu cầu BS", cls: "btn-warning" };
    if (state === "Mới bổ sung") return { text: "Mới bổ sung", cls: "btn-info" };
    return { text: "Thẩm định", cls: "btn-outline-primary" };
  };

  const approveMutation = useMutation({ mutationFn: duyetTrungTuyen });
  // ĐÃ THÊM (theo phản hồi — "Xác nhận lại" hồ sơ đã duyệt có cập nhật KHÔNG được xuất biên
  // nhận mới): mutation RIÊNG, tách khỏi approveMutation — xem triggerApprove bên dưới.
  const xacNhanCapNhatMutation = useMutation({ mutationFn: xacNhanCapNhatDaDuyet });
  const missingMutation = useMutation({ mutationFn: baoThieuHoSo });
  const saveMutation = useMutation({ mutationFn: luuKetQuaThamDinh });
  const daoTaoMutation = useMutation({ mutationFn: banGiaoDaoTao });
  // ĐÃ THÊM (Ký điện tử Pha 1 — Bước 4): tạo yêu cầu ký GBTT — KHÔNG đổi trạng thái
  // thẩm định của hồ sơ (khác 3 mutation trên), nên không cần newOverrides khi xong.
  const gbttMutation = useMutation({ mutationFn: taoYeuCauKyGBTT });

  // ===================== PHA 5: SCAN BẢNG ĐIỂM AI / ĐỐI SÁNH CTĐT / XUẤT TEMPLATE =====================

  const scanMutation = useMutation({ mutationFn: ({ imageBase64, mimeType }) => scanTranscriptImage(imageBase64, mimeType) });
  const compareMutation = useMutation({ mutationFn: ({ nganh, transcript }) => compareCurriculumAI(nganh, transcript) });
  const exportMutation = useMutation({ mutationFn: exportThamDinhTemplate });

  const updateScanCache = (key, patch) => {
    setScanCache(prev => {
      const next = { ...prev, [key]: { ...prev[key], ...patch } };
      try { sessionStorage.setItem(SCAN_CACHE_KEY, JSON.stringify(next)); } catch (e) { /* vượt quota sessionStorage thì bỏ qua, cache trong state vẫn dùng được trong phiên hiện tại */ }
      return next;
    });
  };

  // Đọc file ảnh/PDF -> base64, ảnh thì resize trước (max chiều rộng 1200px, nén JPEG 80%) để
  // giảm dung lượng gửi lên AI. ĐÃ TÁCH RIÊNG (Nguồn 3, 2026-09-10) khỏi handleScanFile để
  // dùng chung được cho cả quét bảng điểm (Nguồn 1) VÀ quét chứng chỉ (handleUploadChungChi)
  // — hành vi giữ NGUYÊN 100% so với bản cũ trong handleScanFile.
  const docFileThanhBase64 = (file, callback) => {
    if (file.type === 'application/pdf') {
      const reader = new FileReader();
      reader.onloadend = () => callback(reader.result.split(',')[1], 'application/pdf');
      reader.readAsDataURL(file);
    } else {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        let w = img.width; let h = img.height;
        if (w > MAX_WIDTH) { h = Math.round((h * MAX_WIDTH) / w); w = MAX_WIDTH; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        callback(canvas.toDataURL('image/jpeg', 0.8).split(',')[1], 'image/jpeg');
      };
    }
  };

  const handleScanFile = (row, file) => {
    if (!file) return;
    const scanKey = getCandidateScanKey(row);
    updateScanCache(scanKey, { compareResult: null }); // quét bảng điểm mới -> kết quả đối sánh cũ không còn đúng nữa
    docFileThanhBase64(file, async (base64String, mimeType) => {
      try {
        const result = await scanMutation.mutateAsync({ imageBase64: base64String, mimeType });
        updateScanCache(scanKey, { transcriptJSON: result, scanFileName: file.name, compareResult: null });
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Lỗi quét bảng điểm', text: err.message });
      }
    });
  };

  const handleCompare = async (row, targetNganh, transcriptJSON) => {
    if (!targetNganh) { Swal.fire({ icon: 'warning', title: 'Chưa có ngành', text: 'Chưa có dữ liệu ngành đào tạo!' }); return; }
    const scanKey = getCandidateScanKey(row);
    try {
      const result = await compareMutation.mutateAsync({ nganh: targetNganh, transcript: transcriptJSON });
      updateScanCache(scanKey, { compareResult: result });
      // ĐÃ THÊM (theo yêu cầu người dùng, 2026-09-10): nhắc cán bộ nhớ chọn "Miễn theo văn
      // bằng cũ" (Nguồn 2, và sau này cả Nguồn 3) NGAY sau khi đối sánh xong — TRƯỚC khi mở
      // "⚙️ Mở đối sánh chi tiết" xem/lưu kết quả — vì nếu mở chi tiết rồi lưu luôn mà quên
      // tick thì bảng đã lưu sẽ thiếu các dòng miễn theo chính sách. Chỉ là lời nhắc, không
      // chặn thao tác gì cả.
      Swal.fire({
        icon: 'info',
        title: 'Đối sánh xong — nhớ chọn miễn theo văn bằng cũ',
        html: 'Trước khi bấm "⚙️ Mở đối sánh chi tiết" để xem/lưu kết quả, hãy chọn ngay bên dưới xem thí sinh có <b>miễn theo văn bằng cũ</b> (Trung cấp/Cao đẳng/Đại học) hoặc chứng chỉ nào không — chọn sau khi đã lưu sẽ phải Reset và lưu lại.',
        timer: 3200,
        showConfirmButton: true,
        confirmButtonText: 'Đã hiểu',
      });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Lỗi đối sánh', text: err.message });
    }
  };

  // ĐÃ SỬA (Công nhận KQHT & chuyển đổi tín chỉ — Nguồn 3 "miễn theo chứng chỉ", 2026-09-10):
  // trước đây (Nguồn 2) hàm này tự tính lấy mẫu miễn văn bằng cũ rồi ghi đè trực tiếp — giờ
  // GỘP vào 1 hàm dùng CHUNG (tinhLaiVaGhiDe) vì Nguồn 3 (và GDQP, Điều 8) THÊM 2 nguồn tự
  // động nữa cần tính lại CÙNG LÚC với Nguồn 2 mỗi khi có gì đó đổi (tick văn bằng cũ HOẶC
  // thêm/xoá 1 dòng chứng chỉ) — nếu để rời rạc như cũ (mỗi nơi tự tính rồi tự ghi đè) rất dễ
  // 1 nguồn ghi đè mất kết quả của nguồn khác (vd tick văn bằng cũ xong xoá mất dòng GDQP vừa
  // tính từ 1 dòng chứng chỉ khác). Logic hợp nhất nằm ở tinhTatCaCacDongTuDong
  // (thamDinhHelpers.js) — xem chú thích đầy đủ ở đó.
  const tinhLaiVaGhiDe = (scanKey, entry, overrides = {}) => {
    const merged = { ...entry, ...overrides };
    const allChuan = layAllChuanTuCompareResult(merged.compareResult);
    const baselineNguon1 = layNguon1ThuanTuy(merged.ketQuaDoiSanhDaChinh || (merged.compareResult?.matched || []));
    const { rows: dongTuDong, canhBao } = tinhTatCaCacDongTuDong({
      mienVanBangCu: merged.mienVanBangCu,
      dsMienVanBangCu,
      dsChungChiDaQuet: merged.dsChungChiDaQuet,
      dsMienTheoChungChi,
      allChuan,
      transcriptJSON: merged.transcriptJSON,
      baselineNguon1,
    });
    updateScanCache(scanKey, { ...overrides, ketQuaDoiSanhDaChinh: [...baselineNguon1, ...dongTuDong] });
    return canhBao;
  };

  // ĐÃ THÊM (Công nhận KQHT & chuyển đổi tín chỉ — Nguồn 2 "miễn theo văn bằng cũ",
  // 2026-09-09): tick "Trung cấp/Cao đẳng/Đại học" ở khu vực quét bảng điểm -> tự áp mẫu
  // miễn cố định (Điều 6, và từ Nguồn 3: cả dòng GDQP&AN theo Điều 8 nếu bảng điểm cũ có môn
  // này) vào bản NHÁP session (scanCache.ketQuaDoiSanhDaChinh) — dùng ĐÚNG cơ chế draft có
  // sẵn của Nguồn 1, KHÔNG viết cơ chế lưu riêng. Chỉ thay đổi bản nháp, KHÔNG đụng gì tới cột
  // đã LƯU CHÍNH THỨC trên sheet (nếu có) — nếu hồ sơ đã lưu trước đó, cán bộ cần tự mở "⚙️ Mở
  // đối sánh chi tiết" rồi bấm "Đặt lại (Reset)" để đưa mẫu miễn mới vào bản đang chỉnh, rồi
  // Lưu lại (đúng hành vi Reset đã sửa ở DoiSanhModal.jsx — Reset giờ tái áp cả 3 nguồn).
  const handleChonMienVanBangCu = (row, scanKey, giaTri) => {
    const entry = scanCache[scanKey] || {};
    if (!entry.compareResult) {
      Swal.fire({ icon: 'info', title: 'Cần đối sánh CTĐT trước', text: 'Bấm "⚖️ Phân tích & Đối sánh CTĐT" trước khi chọn mẫu miễn theo văn bằng cũ.' });
      return;
    }
    const canhBao = tinhLaiVaGhiDe(scanKey, entry, { mienVanBangCu: giaTri });
    if (canhBao.length > 0) {
      Swal.fire({ icon: 'warning', title: 'Một số điểm cần chú ý', html: canhBao.map(c => `• ${c}`).join('<br/>') + '<br/><br/>Có thể tự bổ sung tay qua "⚙️ Mở đối sánh chi tiết" nếu thật sự cần.' });
    } else if (giaTri) {
      Swal.fire({ icon: 'success', title: `Đã áp mẫu miễn (${giaTri})`, timer: 1400, showConfirmButton: false });
    }
  };

  // ===================== Nguồn 3 — MIỄN THEO CHỨNG CHỈ (Điều 8-11) =====================
  // UI đã chốt qua trao đổi (2026-09-10): mỗi dòng cán bộ CHỌN LOẠI CHỨNG CHỈ trước, rồi mới
  // bấm upload ảnh — OCR xong tự thêm 1 dòng KẾT QUẢ vào danh sách + tự "mọc" thêm 1 dòng
  // trống mới (không cần bấm nút "+"). "Loại đang chọn cho dòng trống" cũng lưu trong
  // scanCache (entry.loaiChungChiDangChon) để không mất khi đổi tab/mở lại modal chi tiết.
  const handleChonLoaiChungChiMoi = (scanKey, giaTri) => {
    updateScanCache(scanKey, { loaiChungChiDangChon: giaTri });
  };

  const handleUploadChungChi = (row, scanKey, loaiChungChiValue, file) => {
    if (!file || !loaiChungChiValue) return;
    const entry = scanCache[scanKey] || {};
    if (!entry.compareResult) {
      Swal.fire({ icon: 'info', title: 'Cần đối sánh CTĐT trước', text: 'Bấm "⚖️ Phân tích & Đối sánh CTĐT" trước khi upload chứng chỉ.' });
      return;
    }
    const dongId = 'cc-' + Date.now() + '-' + Math.round(Math.random() * 1e6);
    const dsHienTai = entry.dsChungChiDaQuet || [];
    const dongDangQuet = { id: dongId, loaiChungChiValue, fileName: file.name, dangQuet: true, loi: null, ocrResult: null };
    updateScanCache(scanKey, { dsChungChiDaQuet: [...dsHienTai, dongDangQuet], loaiChungChiDangChon: '' });

    docFileThanhBase64(file, async (base64String, mimeType) => {
      let canhBaoKetQua = [];
      try {
        const ocrResult = await scanChungChiMutation.mutateAsync({ loaiChungChiValue, imageBase64: base64String, mimeType });
        setScanCache(prev => {
          const e2 = prev[scanKey] || {};
          const ds = (e2.dsChungChiDaQuet || []).map(d => d.id === dongId ? { ...d, dangQuet: false, ocrResult, loi: null } : d);
          const { next, canhBao } = tinhLaiSauKhiDoiDsChungChi(prev, scanKey, e2, ds);
          canhBaoKetQua = canhBao;
          return next;
        });
        if (ocrResult && ocrResult.nhanDienDung === false) {
          Swal.fire({ icon: 'warning', title: 'Ảnh có vẻ không đúng loại đã chọn', text: 'AI đọc được nội dung nhưng nghi ngờ đây KHÔNG phải đúng loại chứng chỉ đã chọn — cán bộ tự kiểm tra lại ảnh trước khi công nhận.' });
        } else if (canhBaoKetQua.length > 0) {
          Swal.fire({ icon: 'warning', title: 'Một số điểm cần chú ý', html: canhBaoKetQua.map(c => `• ${c}`).join('<br/>') });
        }
      } catch (err) {
        setScanCache(prev => {
          const e2 = prev[scanKey] || {};
          const ds = (e2.dsChungChiDaQuet || []).map(d => d.id === dongId ? { ...d, dangQuet: false, loi: err.message } : d);
          return tinhLaiSauKhiDoiDsChungChi(prev, scanKey, e2, ds).next;
        });
        Swal.fire({ icon: 'error', title: 'Lỗi quét chứng chỉ', text: err.message });
      }
    });
  };

  // Cả 2 nhánh (thành công/lỗi) của handleUploadChungChi VÀ handleXoaDongChungChi đều cần
  // "cập nhật dsChungChiDaQuet RỒI tính lại toàn bộ dòng tự động" — gộp thao tác đó vào đây để
  // tránh viết trùng logic setScanCache lồng nhau (setState functional update không đọc được
  // scanCache "mới nhất" từ closure ngoài, phải tự tính next state rồi trả về nguyên khối). Trả
  // thêm "canhBao" (không chỉ "next") để nơi gọi tự quyết định có hiện Swal cảnh báo hay không
  // (vd hết hạn 24 tháng, chưa đủ bộ HSK+HSKK, GDQP "Hỏi TTQP"...).
  const tinhLaiSauKhiDoiDsChungChi = (prevAll, scanKey, entryCu, dsChungChiMoi) => {
    const merged = { ...entryCu, dsChungChiDaQuet: dsChungChiMoi };
    const allChuan = layAllChuanTuCompareResult(merged.compareResult);
    const baselineNguon1 = layNguon1ThuanTuy(merged.ketQuaDoiSanhDaChinh || (merged.compareResult?.matched || []));
    const { rows: dongTuDong, canhBao } = tinhTatCaCacDongTuDong({
      mienVanBangCu: merged.mienVanBangCu,
      dsMienVanBangCu,
      dsChungChiDaQuet: dsChungChiMoi,
      dsMienTheoChungChi,
      allChuan,
      transcriptJSON: merged.transcriptJSON,
      baselineNguon1,
    });
    const entryMoi = { ...entryCu, dsChungChiDaQuet: dsChungChiMoi, ketQuaDoiSanhDaChinh: [...baselineNguon1, ...dongTuDong] };
    const next = { ...prevAll, [scanKey]: entryMoi };
    try { sessionStorage.setItem(SCAN_CACHE_KEY, JSON.stringify(next)); } catch (e) { /* vượt quota thì bỏ qua, cache trong state vẫn dùng được trong phiên hiện tại */ }
    return { next, canhBao };
  };

  const handleXoaDongChungChi = (scanKey, dongId) => {
    const entry = scanCache[scanKey] || {};
    const dsMoi = (entry.dsChungChiDaQuet || []).filter(d => d.id !== dongId);
    setScanCache(prev => tinhLaiSauKhiDoiDsChungChi(prev, scanKey, prev[scanKey] || entry, dsMoi).next);
  };

  const handleExportTemplate = async (row, targetNganh, scanEntry) => {
    const scoreForExport = calculateScores(row, targetNganh);
    const dxt = scoreForExport.type === 'thpt' ? (scoreForExport.hasScore ? scoreForExport.finalTotalScore : '-') : (scoreForExport.dtbVal || '-');
    const thxt = scoreForExport.type === 'thpt' ? (scoreForExport.bestCombo || '-') : '-';
    const hoTen = getVal(row, ["TÊN SINH VIÊN", "HỌ VÀ TÊN"]);
    const cccd = getVal(row, ["CĂN CƯỚC", "CCCD", "SỐ CCCD"]).replace(/^['"]+|['"]+$/g, '');

    const mappingData = {
      "HO_TEN": hoTen, "CCCD": cccd,
      "NGAY_SINH": getVal(row, ["NGÀY SINH", "NGÀNH SINH"]),
      "NGANH_DANG_KY": getVal(row, ["NGÀNH", "NGÀNH ĐÀO TẠO"]),
      "KHOA": getVal(row, ["KHÓA"]),
      "HE_DAO_TAO": getVal(row, ["HỆ ĐÀO TẠO", "Hệ đào tạo"]),
      "HINH_THUC_DAO_TAO": getVal(row, ["HÌNH THỨC ĐÀO TẠO", "Hình thức đào tạo"]),
      "NAM_XET_TUYEN": getVal(row, ["NĂM XÉT TUYỂN"]),
      "DOI_TUONG_DAU_VAO": getVal(row, ["ĐỐI TƯỢNG ĐẦU VÀO", "ĐỐI TƯỢNG"]),
      "LINK_HO_SO": getVal(row, ["LINK HỒ SƠ", "Link hồ sơ"]),
      "KHU_VUC_UU_TIEN": getVal(row, ["KHU VỰC ƯU TIÊN"]),
      "DOI_TUONG_UU_TIEN": getVal(row, ["ĐỐI TƯỢ ƯU TIÊN", "ĐỐI TƯỢNG ƯU TIÊN"]),
      "GIAY_UU_TIEN": getVal(row, ["GIẤY TỜ ƯU TIÊN", "Giấy tờ ưu tiên"]),
      "DIEM_CONG": getVal(row, ["ĐIỂM CỘNG"]),
      "TO_HOP_XET_TUYEN": thxt, "DIEM_XET_TUYEN": dxt,
      "TRANG_THAI_HO_SO": getMissingDocs(row).length > 0 ? "Thiếu hồ sơ" : "Đủ hồ sơ",
      "KET_QUA_SO_TUYEN": getEffectiveState(row),
    };

    try {
      const result = await exportMutation.mutateAsync({
        fileName: `PhieuThamDinh_${hoTen}_${cccd}`,
        mappingData,
        compareMatched: scanEntry?.compareResult?.matched || [],
        compareUnmatched: scanEntry?.compareResult?.unmatched || [],
      });
      const link = document.createElement('a');
      link.href = "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + result.base64;
      link.download = `PhieuThamDinh_${hoTen}_${cccd}.xlsx`;
      link.click();
      Swal.fire({ icon: 'success', title: 'Thành công', text: 'Tải file thành công.' });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Lỗi tạo file', text: err.message });
    }
  };

  // ĐÃ THÊM: xuất "Bảng thông tin sơ bộ (PDF)" — dùng đúng cơ chế html2pdf.js đã có sẵn
  // trong dự án (xem PrintModal.jsx: chụp 1 khung html ẩn ngoài màn hình rồi lưu PDF về
  // máy). Khung html nguồn (#pdf-thamdinh-content) được render ẩn ngay trong modal chi
  // tiết bên dưới, giữ đúng nội dung + tiêu ngữ dạng thô — ông có thể bổ sung con dấu/chữ
  // ký/logo sau nếu cần.
  const handlePdfExport = async (elementId, fileName) => {
    const element = document.getElementById(elementId);
    if (!element) return;
    setPdfExporting(true);
    const opt = {
      margin: [15, 18, 15, 18],
      filename: fileName,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    };
    try {
      await html2pdf().set(opt).from(element).save();
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Lỗi tạo PDF', text: err.message });
    } finally {
      setPdfExporting(false);
    }
  };

  // ĐÃ THÊM: gửi kèm kenhNop (cột KÊNH NỘP) — backend (action trungTuyen/baoThieu) giờ
  // đối chiếu thêm cột này (ngoài CCCD + Ngành) trước khi ghi đè TRẠNG THÁI THẨM ĐỊNH,
  // để không lỡ ghi đè nhầm sang hồ sơ khác kênh trùng CCCD+Ngành.
  const buildTrungTuyenPayload = (row) => ({
    soCCCD: getVal(row, ["CĂN CƯỚC", "CCCD", "SỐ CCCD"]).replace(/^['"]+|['"]+$/g, ''),
    hoTen: getVal(row, ["TÊN SINH VIÊN", "HỌ VÀ TÊN"]),
    nganh: getVal(row, ["NGÀNH", "NGÀNH ĐÀO TẠO"]),
    ngaySinh: getVal(row, ["NGÀNH SINH", "NGÀY SINH"]),
    ngayCapNhat: nowVnDate(),
    kenhNop: getVal(row, ["KÊNH NỘP"]),
  });

  // ĐÃ SỬA (Ký điện tử Pha 1 — Bước 4, theo yêu cầu bổ sung): dựng payload 1 sinh viên
  // gửi cho taoYeuCauKyGBTT — tên field khớp đúng placeholder nội dung trong mẫu Doc
  // GBTT. Trước đây chỉ gửi 1 chuỗi điểm gộp (getBestScore) — giờ chuyển sang
  // calculateScores(row, nganh) để tách được điểm TỪNG MÔN của đúng tổ hợp đạt cao
  // nhất (bestCombo) + điểm ưu tiên khu vực/đối tượng RIÊNG (xem
  // diemUuTienKhuVuc/diemUuTienDoiTuong mới thêm trong thamDinhHelpers.js — đã quy đổi
  // đúng theo tỉ lệ áp dụng thật, cộng lại = đúng phần ưu tiên đã tính vào điểm trúng
  // tuyển). Field maSinhVien/khoa/heDaoTao/hinhThucDaoTao vẫn gửi kèm dù mẫu GBTT hiện
  // tại của ông chưa dùng tới — replaceText() tự bỏ qua placeholder không tồn tại
  // trong Doc, không lỗi gì cả, cứ để sẵn phòng khi mẫu bổ sung sau này.
  const buildGbttPayload = (row) => {
    const nganh = getVal(row, ["NGÀNH", "NGÀNH ĐÀO TẠO"]);
    const diem = calculateScores(row, nganh);

    let diemTrungTuyen = "";
    let mon1Ten = "", mon1Diem = "", mon2Ten = "", mon2Diem = "", mon3Ten = "", mon3Diem = "";
    let diemUuTienKhuVuc = "", diemUuTienDoiTuong = "";
    // ĐÃ THÊM (theo phản hồi — thiếu sót từ trước, quên đưa vào mẫu GBTT): điểm phỏng vấn
    // ĐÃ NHẬP (diemPhongVanRaw — giá trị thô trên cột "ĐIỂM PHỎNG VẤN", KHÁC với
    // diem.diemPhongVan là phần THỰC SỰ được cộng vào điểm, xem chú thích đầy đủ tại chỗ
    // khai báo diemPhongVanRaw trong thamDinhHelpers.js) — in ra GBTT đúng điểm PV thí sinh
    // đã có, không phụ thuộc có đủ điều kiện cộng thưởng hay không. Chỉ tồn tại ở nhánh
    // "Tốt nghiệp THPT" (PV chỉ áp dụng phương thức Học bạ) — rỗng ở nhánh 'other'.
    let diemPhongVan = "";

    if (diem.type === 'thpt' && diem.hasScore) {
      diemTrungTuyen = diem.finalTotalScore;
      const monHoc = DICT_TO_HOP[diem.bestCombo] || [];
      const ketQuaCombo = (diem.comboResults || []).find(c => c.combo === diem.bestCombo) || {};
      mon1Ten = monHoc[0] ? SUBJ_MAP[monHoc[0]] : "";
      mon2Ten = monHoc[1] ? SUBJ_MAP[monHoc[1]] : "";
      mon3Ten = monHoc[2] ? SUBJ_MAP[monHoc[2]] : "";
      mon1Diem = ketQuaCombo.s1 ?? "";
      mon2Diem = ketQuaCombo.s2 ?? "";
      mon3Diem = ketQuaCombo.s3 ?? "";
      diemUuTienKhuVuc = diem.diemUuTienKhuVuc ?? "";
      diemUuTienDoiTuong = diem.diemUuTienDoiTuong ?? "";
      diemPhongVan = diem.diemPhongVanRaw > 0 ? diem.diemPhongVanRaw : "";
    } else if (diem.type === 'other') {
      diemTrungTuyen = diem.dtbVal || "";
    }

    return {
      hoTen: getVal(row, ["TÊN SINH VIÊN", "HỌ VÀ TÊN"]),
      ngaySinh: getVal(row, ["NGÀY SINH", "NGÀNH SINH"]),
      // ĐÃ THÊM (theo yêu cầu — bổ sung placeholder Nơi sinh/Giới tính trong mẫu GBTT):
      // rỗng nếu hồ sơ chưa có dữ liệu (VD nhập trước khi có 2 cột này) — không chặn xuất.
      gioiTinh: getVal(row, ["GIỚI TÍNH"]),
      noiSinh: getVal(row, ["NƠI SINH"]),
      canCuoc: getVal(row, ["CĂN CƯỚC", "CCCD", "SỐ CCCD"]).replace(/^['"]+|['"]+$/g, ''),
      maSinhVien: generateMaSV(row),
      nganh,
      khoa: getVal(row, ["KHÓA"]),
      heDaoTao: getVal(row, ["HỆ ĐÀO TẠO", "Hệ đào tạo"]),
      hinhThucDaoTao: getVal(row, ["HÌNH THỨC ĐÀO TẠO", "Hình thức đào tạo"]),
      diemTrungTuyen,
      mon1Ten, mon1Diem, mon2Ten, mon2Diem, mon3Ten, mon3Diem,
      diemUuTienKhuVuc, diemUuTienDoiTuong,
      diemPhongVan,
    };
  };

  // ĐÃ THÊM: chặn ngay từ đầu nếu lỡ gọi trigger cho hồ sơ kênh "Thu hồ sơ trực tiếp" —
  // hồ sơ này không thuộc luồng thẩm định Xét tuyển (nút bấm cũng đã bị khoá ở UI, đây
  // là lớp phòng vệ thứ 2, phòng khi trigger được gọi từ chỗ khác sau này).
  const isTrucTiepKenh = (row) => getVal(row, ["KÊNH NỘP"]) === KENH_TRUC_TIEP;

  const triggerApprove = async (row) => {
    if (isTrucTiepKenh(row)) {
      Swal.fire({ icon: 'info', title: 'Không thuộc luồng thẩm định', text: 'Hồ sơ này đến từ trang Thu hồ sơ nhập học (đã trúng tuyển sẵn), không cần và không nên duyệt lại ở đây.' });
      return;
    }
    const missingTQ = getMissingTienQuyet(row);
    if (missingTQ.length > 0) {
      Swal.fire({ icon: 'error', title: 'Không được duyệt!', text: `Thí sinh đang nợ HỒ SƠ TIÊN QUYẾT: ${missingTQ.join(', ')}` });
      return;
    }
    const hoTen = getVal(row, ["TÊN SINH VIÊN", "HỌ VÀ TÊN"]);
    // ĐÃ THÊM (theo phản hồi — hồ sơ ĐÃ DUYỆT vừa có cập nhật): đổi hẳn nội dung hộp thoại
    // xác nhận khi đây là lượt "duyệt lại" (không phải duyệt lần đầu) — nhắc rõ những cột đã
    // đổi (đọc thẳng từ rawTrangThai, xem chú thích ở Quanlysv.gs/importStudents) để cán bộ
    // không bấm nhầm khi chưa kịp xem lại phần vừa bổ sung.
    const rawTrangThaiApprove = getVal(row, ["TRẠNG THÁI THẨM ĐỊNH", "TRẠNG THÁI"]);
    const chiTietCapNhatApprove = (rawTrangThaiApprove.match(/Có cập nhật: ([^)]*)\)/) || [])[1] || '';
    // ĐÃ THÊM: đây là lượt "Xác nhận lại" (hồ sơ ĐÃ DUYỆT vừa được sửa/bổ sung) hay lượt
    // "Duyệt trúng tuyển" ĐẦU TIÊN — quyết định gọi mutation nào ngay dưới đây.
    const laXacNhanLai = !!chiTietCapNhatApprove;
    const confirm = await Swal.fire({
      icon: 'question',
      title: laXacNhanLai ? 'Xác nhận LẠI hồ sơ vừa cập nhật?' : 'Duyệt trúng tuyển?',
      text: laXacNhanLai
        ? `Thí sinh ${hoTen} vừa cập nhật: ${chiTietCapNhatApprove}. Xác nhận lại "Đã duyệt" (KHÔNG xuất biên nhận mới)?`
        : `Duyệt trúng tuyển cho thí sinh: ${hoTen}?`,
      showCancelButton: true, confirmButtonText: 'Xác nhận', cancelButtonText: 'Huỷ'
    });
    if (!confirm.isConfirmed) return;

    try {
      // ĐÃ SỬA (theo phản hồi — "Xác nhận lại" không được gửi biên nhận, và nút phải KHOÁ
      // LẠI ngay sau khi bấm, chỉ mở lại khi hồ sơ có cập nhật MỚI): tách hẳn khỏi nhánh
      // Duyệt trúng tuyển đầu tiên — gọi action nhẹ KHÔNG xuất PDF/KHÔNG gửi Google Chat, rồi
      // ghi đè override "coCapNhatSauDuyet: false" để khoá nút NGAY trên UI (không cần đợi
      // tải lại toàn bộ dữ liệu từ server — xem getEffectiveState/coCapNhatSauDuyet bên dưới,
      // override chỉ mất tác dụng khi trang được tải lại, lúc đó nếu hồ sơ CÓ cập nhật mới
      // thật (dữ liệu server đổi khác) sẽ tự nhận lại đúng, không bị "khoá cứng" oan).
      if (laXacNhanLai) {
        const result = await xacNhanCapNhatMutation.mutateAsync([buildTrungTuyenPayload(row)]);
        const loi = (result?.results || []).find(r => r.status === 'error');
        if (loi) throw new Error(loi.message);
        Swal.fire({ icon: 'success', title: 'Đã xác nhận', text: 'Đã xác nhận lại hồ sơ — không xuất biên nhận mới.' });
        setOverride(getRowKey(row), { appState: 'Đã duyệt', coCapNhatSauDuyet: false });
      } else {
        const result = await approveMutation.mutateAsync([buildTrungTuyenPayload(row)]);
        Swal.fire({ icon: 'success', title: 'Thành công', text: 'Duyệt trúng tuyển thành công!' });
        setOverride(getRowKey(row), { appState: 'Đã duyệt' });
        if (result?.pdfUrl) window.open(result.pdfUrl, '_blank');
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Lỗi', text: err.message });
    }
  };

  const triggerMissing = async (row) => {
    if (isTrucTiepKenh(row)) {
      Swal.fire({ icon: 'info', title: 'Không thuộc luồng thẩm định', text: 'Hồ sơ này đến từ trang Thu hồ sơ nhập học (đã trúng tuyển sẵn), không thuộc diện báo thiếu hồ sơ ở đây.' });
      return;
    }
    const hoTen = getVal(row, ["TÊN SINH VIÊN", "HỌ VÀ TÊN"]);
    const missingArray = getMissingDocs(row);
    const defaultText = missingArray.length > 0 ? missingArray.join(', ') : "Bản sao Học bạ THPT";

    const { value: hosoThieu, isConfirmed } = await Swal.fire({
      title: `Thí sinh [${hoTen}] chưa nộp đủ hồ sơ`,
      text: 'Kiểm tra lại thư mục hồ sơ và nhập tên hồ sơ yêu cầu bổ sung:',
      input: 'text', inputValue: defaultText, showCancelButton: true,
      confirmButtonText: 'Gửi yêu cầu', cancelButtonText: 'Huỷ',
    });
    if (!isConfirmed || !hosoThieu) return;

    const payload = {
      soCCCD: getVal(row, ["CĂN CƯỚC", "CCCD", "SỐ CCCD"]).replace(/^['"]+|['"]+$/g, ''),
      hoTen, nganh: getVal(row, ["NGÀNH", "NGÀNH ĐÀO TẠO"]),
      hosoThieu: "Thiếu: " + hosoThieu, ngayCapNhat: nowVnDate(),
      kenhNop: getVal(row, ["KÊNH NỘP"]),
    };
    try {
      await missingMutation.mutateAsync([payload]);
      Swal.fire({ icon: 'success', title: 'Thành công', text: `Đã gửi yêu cầu bổ sung [${hosoThieu}] cho thí sinh ${hoTen}.` });
      setOverride(getRowKey(row), { appState: 'Đã báo thiếu' });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Lỗi', text: err.message });
    }
  };

  const triggerSave = async (row) => {
    const hoTen = getVal(row, ["TÊN SINH VIÊN", "HỌ VÀ TÊN"]);
    const confirm = await Swal.fire({ icon: 'question', title: 'Lưu vào CSDL', text: `Lưu hồ sơ ${hoTen} vào CSDL. Tiếp tục?`, showCancelButton: true, confirmButtonText: 'Lưu', cancelButtonText: 'Huỷ' });
    if (!confirm.isConfirmed) return;

    const payloadData = {
      ...row,
      "MÃ SINH VIÊN": generateMaSV(row),
      "ĐIỂM TRÚNG TUYỂN": getRawScoreNumber(row),
      "KẾT QUẢ ĐIỂM": "Trúng tuyển",
      "NGÀY CẬP NHẬT HỒ SƠ": new Date().toLocaleString('vi-VN'),
    };
    try {
      const result = await saveMutation.mutateAsync([payloadData]);
      if (result?.skipped > 0) Swal.fire({ icon: 'warning', title: 'Đã tồn tại', text: 'Hồ sơ này đã tồn tại từ trước trong CSDL!' });
      else Swal.fire({ icon: 'success', title: 'Lưu thành công', text: 'Lưu thành công vào CSDL!' });
      setOverride(getRowKey(row), { saved: true });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Lỗi', text: err.message });
    }
  };

  const triggerSyncDaoTao = async () => {
    const approvedRows = filteredData.filter(r => getEffectiveState(r) === "Đã duyệt");
    if (approvedRows.length === 0) {
      Swal.fire({ icon: 'warning', title: 'Không có dữ liệu', text: 'Chưa có hồ sơ mới được duyệt!' });
      return;
    }
    const confirm = await Swal.fire({ icon: 'question', title: 'Xác nhận bàn giao', text: `Gửi danh sách ${approvedRows.length} hồ sơ TRÚNG TUYỂN sang Phòng Đào tạo/CTSV. Tiếp tục?`, showCancelButton: true, confirmButtonText: 'Bàn giao', cancelButtonText: 'Huỷ' });
    if (!confirm.isConfirmed) return;

    const payload = approvedRows.map((row, index) => ({
      "TT": index + 1,
      "MÃ SINH VIÊN": generateMaSV(row),
      "CĂN CƯỚC": getVal(row, ["CĂN CƯỚC", "CCCD", "SỐ CCCD"]),
      "TÊN SINH VIÊN": getVal(row, ["TÊN SINH VIÊN", "HỌ VÀ TÊN"]),
      "NGÀY SINH": getVal(row, ["NGÀY SINH"]),
      "NGÀNH": getVal(row, ["NGÀNH", "NGÀNH ĐÀO TẠO"]),
      "KHÓA": getVal(row, ["KHÓA"]),
      "NĂM XÉT TUYỂN": getVal(row, ["NĂM XÉT TUYỂN"]),
      "HỆ ĐÀO TẠO": getVal(row, ["HỆ ĐÀO TẠO"]),
      "HÌNH THỨC ĐÀO TẠO": getVal(row, ["HÌNH THỨC ĐÀO TẠO"]),
      "GIẤY TỜ ƯU TIÊN": getVal(row, ["GIẤY TỜ ƯU TIÊN"]),
      "ĐIỂM TRÚNG TUYỂN": getRawScoreNumber(row),
      "LINK HỒ SƠ": getVal(row, ["LINK HỒ SƠ", "Link hồ sơ"]),
    }));

    try {
      const result = await daoTaoMutation.mutateAsync(payload);
      Swal.fire({ icon: 'success', title: 'Thành công', text: `Bàn giao thành công! Có ${result?.added ?? 0} hồ sơ MỚI đã được gửi đi.` });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Lỗi', text: err.message });
    }
  };

  // ĐÃ THÊM (Ký điện tử Pha 1 — Bước 3, bổ sung theo phản hồi): đường đi cho 1 hồ sơ
  // lẻ — gọi từ nút trong menu "Xuất file" của modal thẩm định chi tiết. Không tái sử
  // dụng openBatchPreview() vì hàm đó luôn lấy nguồn từ selectedKeys (tick chọn ở bảng
  // danh sách); ở đây chỉ có đúng 1 "row" đang mở trong modal chi tiết, không liên quan
  // gì tới các dòng đang được tick chọn ngoài bảng. Dùng lại đúng điều kiện hợp lệ như
  // nhánh 'gbtt' của openBatchPreview để 2 đường đi (hàng loạt / 1 hồ sơ) luôn nhất
  // quán với nhau.
  const openGbttPreviewSingle = (row) => {
    const state = getEffectiveState(row);
    if (isTrucTiepKenh(row)) {
      Swal.fire({ icon: 'warning', title: 'Không thể xuất GBTT', text: 'Hồ sơ Thu hồ sơ trực tiếp không thuộc luồng thẩm định.' });
      return;
    }
    if (state !== "Đã duyệt") {
      Swal.fire({ icon: 'warning', title: 'Không thể xuất GBTT', text: 'Chỉ xuất được Giấy báo trúng tuyển cho hồ sơ ĐÃ DUYỆT trúng tuyển.' });
      return;
    }
    setNguoiKyGBTT([]);
    setCheDoKy('TUAN_TU');
    setBatchPreview({ type: 'gbtt', validRows: [row], excludedNote: '' });
  };

  const openBatchPreview = (type) => {
    const selectedRows = filteredData.filter(r => selectedKeys.has(getRowKey(r)));
    if (selectedRows.length === 0) {
      Swal.fire({ icon: 'warning', title: 'Chú ý', text: 'Chưa chọn hồ sơ nào.' });
      return;
    }

    const validRows = []; const excludedReasons = {};
    selectedRows.forEach(row => {
      let reason = null;
      const state = getEffectiveState(row);
      if (type === 'duyet') {
        if (isTrucTiepKenh(row)) reason = "hồ sơ Thu hồ sơ trực tiếp (không thuộc luồng thẩm định)";
        else if (state === "Đã duyệt") reason = "đã duyệt";
        else if (state === "Đã báo thiếu") reason = "đã báo thiếu";
        else if (getMissingTienQuyet(row).length > 0) reason = "thiếu hồ sơ tiên quyết";
      } else if (type === 'baothieu') {
        if (isTrucTiepKenh(row)) reason = "hồ sơ Thu hồ sơ trực tiếp (không thuộc luồng thẩm định)";
        else if (state === "Đã duyệt") reason = "đã duyệt";
        else if (state === "Đã báo thiếu") reason = "đã báo thiếu";
      } else if (type === 'luucsdl') {
        if (getEffectiveSaved(row)) reason = "đã lưu vào CSDL";
      } else if (type === 'gbtt') {
        // ĐÃ THÊM (Ký điện tử Pha 1 — Bước 3): chỉ hồ sơ ĐÃ DUYỆT trúng tuyển mới được
        // xuất Giấy báo trúng tuyển để gửi ký — khác hẳn 'duyet'/'baothieu' (loại hồ sơ
        // ĐÃ xử lý), ở đây loại hồ sơ CHƯA xử lý.
        if (isTrucTiepKenh(row)) reason = "hồ sơ Thu hồ sơ trực tiếp (không thuộc luồng thẩm định)";
        else if (state !== "Đã duyệt") reason = "chưa duyệt trúng tuyển";
      }
      if (reason) excludedReasons[reason] = (excludedReasons[reason] || 0) + 1;
      else validRows.push(row);
    });

    if (validRows.length === 0) {
      Swal.fire({ icon: 'warning', title: 'Không thể thực hiện', text: 'Không có hồ sơ nào đủ điều kiện để thực hiện thao tác này trong danh sách đã chọn.' });
      return;
    }

    const excludedTotal = selectedRows.length - validRows.length;
    const excludedNote = excludedTotal > 0
      ? `Đã loại ${excludedTotal} hồ sơ khỏi danh sách do: ${Object.keys(excludedReasons).map(r => `${excludedReasons[r]} ${r}`).join(', ')}.`
      : '';

    // ĐÃ THÊM (Bước 3): mở lại bảng chọn người ký từ đầu mỗi lần bấm "Xuất GBTT" —
    // ChonNguoiKyModal sẽ tự seed lại từ cấu hình ChucDanhKy vì nguoiKyGBTT về [].
    if (type === 'gbtt') { setNguoiKyGBTT([]); setCheDoKy('TUAN_TU'); }

    setBatchPreview({ type, validRows, excludedNote });
  };

  const executeBatchAction = async () => {
    if (!batchPreview) return;
    const { type, validRows } = batchPreview;

    // ĐÃ THÊM (Ký điện tử Pha 1 — Bước 4): nhánh GBTT tách hẳn khỏi 3 nhánh
    // duyet/baothieu/luucsdl bên dưới — action taoYeuCauKyGBTT không đổi trạng thái
    // thẩm định (không cần newOverrides) và trả kết quả theo TỪNG SINH VIÊN chứ không
    // khớp lại theo CCCD như approveMutation/missingMutation/saveMutation.
    if (type === 'gbtt') {
      const dsNguoiKyChon = nguoiKyGBTT.filter(nk => nk.chon && nk.email);
      if (dsNguoiKyChon.length === 0) {
        Swal.fire({ icon: 'warning', title: 'Chưa chọn người ký', text: 'Cần chọn ít nhất 1 người ký trước khi xuất GBTT.' });
        return;
      }
      // ĐÃ THÊM: 2 ô mới bắt buộc phải điền trước khi xuất — xem chú thích tại chỗ khai
      // báo state ngayXuatGiayBao/thangNhapHoc (nút "Xác nhận" cũng đã bị khoá theo 2 điều
      // kiện này, đây là lớp kiểm tra thứ 2 phòng khi gọi hàm từ chỗ khác).
      if (!ngayXuatGiayBao) {
        Swal.fire({ icon: 'warning', title: 'Thiếu Ngày xuất giấy báo', text: 'Cần chọn ngày xuất giấy báo trước khi xuất GBTT.' });
        return;
      }
      if (!thangNhapHoc) {
        Swal.fire({ icon: 'warning', title: 'Thiếu Tháng nhập học', text: 'Cần chọn tháng nhập học trước khi xuất GBTT.' });
        return;
      }
      // ĐÃ THÊM (theo yêu cầu — "Số quyết định"): bắt buộc điền + đúng định dạng "xx/năm",
      // cùng lớp kiểm tra thứ 2 giống 2 ô trên (nút "Xác nhận" cũng đã khoá theo điều kiện
      // này, xem disabled ở nút bên dưới).
      if (!SO_QUYET_DINH_REGEX.test(soQuyetDinh.trim())) {
        Swal.fire({ icon: 'warning', title: 'Số quyết định không hợp lệ', text: 'Cần điền đúng định dạng "xx/năm" (VD: 01/2026, 012/2025) trước khi xuất GBTT.' });
        return;
      }
      try {
        const ket = await gbttMutation.mutateAsync({
          sinhVien: validRows.map(buildGbttPayload),
          nguoiKy: dsNguoiKyChon.map(nk => ({ maChucDanh: nk.maChucDanh, email: nk.email, ten: nk.ten })),
          ngayXuatGiayBao,
          thangNhapHoc,
          soQuyetDinh: soQuyetDinh.trim(),
          cheDoKy,
        });
        const results = Array.isArray(ket?.results) ? ket.results : [];
        const soLoi = results.filter(r => r.status === 'error').length;
        setBatchPreview(null);
        Swal.fire({
          icon: soLoi > 0 ? 'warning' : 'success',
          title: soLoi > 0 ? `Hoàn tất với ${soLoi} lỗi` : 'Đã tạo yêu cầu ký thành công',
          html: results.map(r => `${r.status === 'error' ? '❌' : '✅'} <b>${r.hoTen}</b>: ${r.message}`).join('<br/>'),
        });
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Lỗi tạo yêu cầu ký', text: err.message });
      }
      return;
    }

    let mutation, payload;
    if (type === 'duyet') {
      mutation = approveMutation;
      payload = validRows.map(buildTrungTuyenPayload);
    } else if (type === 'baothieu') {
      mutation = missingMutation;
      payload = validRows.map(row => {
        const missingArray = getMissingDocs(row);
        const text = missingArray.length > 0 ? missingArray.join(', ') : "Bản sao Học bạ THPT";
        return {
          soCCCD: getVal(row, ["CĂN CƯỚC", "CCCD", "SỐ CCCD"]).replace(/^['"]+|['"]+$/g, ''),
          hoTen: getVal(row, ["TÊN SINH VIÊN", "HỌ VÀ TÊN"]),
          nganh: getVal(row, ["NGÀNH", "NGÀNH ĐÀO TẠO"]),
          hosoThieu: "Thiếu: " + text, ngayCapNhat: nowVnDate(),
          kenhNop: getVal(row, ["KÊNH NỘP"]),
        };
      });
    } else {
      mutation = saveMutation;
      payload = validRows.map(row => ({
        ...row,
        "MÃ SINH VIÊN": generateMaSV(row),
        "ĐIỂM TRÚNG TUYỂN": getRawScoreNumber(row),
        "KẾT QUẢ ĐIỂM": "Trúng tuyển",
        "NGÀY CẬP NHẬT HỒ SƠ": new Date().toLocaleString('vi-VN'),
      }));
    }

    try {
      const result = await mutation.mutateAsync(payload);
      const results = Array.isArray(result?.results) ? result.results : null;
      const newOverrides = {};
      const newSelected = new Set(selectedKeys);

      if (results) {
        results.forEach(r => {
          const matchRow = validRows.find(row => getVal(row, ["CĂN CƯỚC", "CCCD", "SỐ CCCD"]).replace(/^['"]+|['"]+$/g, '') === r.cccd);
          if (!matchRow) return;
          const key = getRowKey(matchRow);
          let isDone = false;
          if (type === 'duyet' && (r.status === 'success' || r.status === 'warning')) { newOverrides[key] = { appState: 'Đã duyệt' }; isDone = true; }
          else if (type === 'baothieu' && (r.status === 'success' || r.status === 'warning')) { newOverrides[key] = { appState: 'Đã báo thiếu' }; isDone = true; }
          else if (type === 'luucsdl' && ['added', 'updated', 'skipped'].includes(r.status)) { newOverrides[key] = { saved: true }; isDone = true; }
          if (isDone) newSelected.delete(key);
        });
      } else {
        validRows.forEach(row => {
          const key = getRowKey(row);
          if (type === 'duyet') newOverrides[key] = { appState: 'Đã duyệt' };
          else if (type === 'baothieu') newOverrides[key] = { appState: 'Đã báo thiếu' };
          else newOverrides[key] = { saved: true };
          newSelected.delete(key);
        });
      }

      setLocalOverrides(prev => ({ ...prev, ...newOverrides }));
      setSelectedKeys(newSelected);
      setBatchPreview(null);

      const doneText = type === 'duyet' ? "Duyệt trúng tuyển" : type === 'baothieu' ? "Yêu cầu bổ sung hồ sơ" : "Lưu vào CSDL";
      let extra = "";
      if (typeof result?.added === "number" || typeof result?.updated === "number" || typeof result?.skipped === "number") {
        extra = ` (Thêm mới: ${result.added || 0}, Cập nhật: ${result.updated || 0}, Bỏ qua/trùng: ${result.skipped || 0})`;
      }
      Swal.fire({ icon: 'success', title: 'Thành công', text: `${doneText} hàng loạt thành công cho ${validRows.length} hồ sơ!${extra}` });
      if (type === 'duyet' && result?.pdfUrl) window.open(result.pdfUrl, '_blank');
    } catch (err) {
      setBatchPreview(null);
      Swal.fire({ icon: 'error', title: 'Lỗi mạng', text: err.message });
    }
  };

  const batchTitleMap = { duyet: "Xác nhận DUYỆT TRÚNG TUYỂN hàng loạt", baothieu: "Xác nhận YÊU CẦU BỔ SUNG HỒ SƠ hàng loạt", luucsdl: "Xác nhận LƯU VÀO CSDL hàng loạt", gbtt: "Xuất GIẤY BÁO TRÚNG TUYỂN + gửi ký" };

  return (
    <div className="container-fluid py-3 thamdinh-page">
      <div className="row mb-3 align-items-center">
        <div className="col-md-6">
          {/* ĐÃ SỬA: to lên 1 nấc — đổi h4 -> h3, ThamDinh.css đã có sẵn thang cỡ chữ
              riêng cho trang này (.thamdinh-page h3 = 24px, h4 = 18px) nên chỉ cần đổi
              thẻ, không cần set font-size tay. */}
          <h3 className="text-uppercase fw-bold" style={{ color: '#037683' }}>
            <i className="bi bi-clipboard-check me-2"></i>Ban Thẩm định hồ sơ
          </h3>
        </div>
        <div className="col-md-6 text-md-end d-flex justify-content-md-end align-items-center gap-2 flex-wrap">
          <CanXacNhanBadge />
          <span className="small text-muted">
            {isLoading ? '⏳ Đang tải dữ liệu...' : dataUpdatedAt ? `✔ Đồng bộ: ${new Date(dataUpdatedAt).toLocaleTimeString('vi-VN')}` : ''}
          </span>
          <button className="btn btn-sm btn-dark" onClick={triggerSyncDaoTao} disabled={daoTaoMutation.isPending}>
            {daoTaoMutation.isPending ? '⏳ Đang gửi...' : '🚀 Bàn giao Đào tạo'}
          </button>
        </div>
      </div>

      {isError && <div className="alert alert-danger">Lỗi tải dữ liệu: {error?.message}</div>}

      {/* ĐÃ SỬA (đợt 4): khối 4 thẻ thống kê vẫn col-md-6, nửa còn lại bên phải giờ là
          1 khối bộ lọc "ghim" chia 2 HÀNG (thay vì 1 hàng dàn ngang cũ) để 2 bên trông
          cân đối bằng nhau — 4 thẻ cũng được đôn cao thêm 1 chút (py-2 -> py-3) cho
          khớp chiều cao với khối 2 hàng bên phải.
          Hàng 1 (bên phải): Tìm nhanh — Thời gian (giãn hết chỗ còn lại trong hàng) —
          Nhập học trực tiếp (ngoài cùng phải).
          Hàng 2 (bên phải): Trạng thái thẩm định — Sắp xếp — Ngành đào tạo (thu ngắn
          còn ~nửa bề rộng so với 2 ô kia) — Lọc thêm — Bỏ lọc (ngoài cùng phải, có
          chữ). Nhóm "Lọc thêm" xổ dưới giờ chỉ còn Đối tượng đầu vào/Trạng thái hồ sơ
          (Ngành + Nhập học trực tiếp đã chuyển lên hàng ghim ở trên). */}
      <div className="row mb-3 g-2 align-items-stretch">
        <div className="col-md-6 d-flex">
          <div className="row g-2 flex-fill">
            <div className="col-6 col-md-3">
              <div className="card bg-primary text-white border-0 shadow-sm h-100">
                <div className="card-body py-3 px-3">
                  <div className="small opacity-75 fw-bold">📁 Tổng hồ sơ ({today.getFullYear()})</div>
                  <h3 className="mb-0 fw-bold">{kpi.total}</h3>
                </div>
              </div>
            </div>
            <div className="col-6 col-md-3">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-body py-3 px-3">
                  <div className="small text-muted fw-bold">📑 Đủ hồ sơ</div>
                  <h3 className="mb-0 fw-bold" style={{ color: '#2980b9' }}>{kpi.du}</h3>
                </div>
              </div>
            </div>
            <div className="col-6 col-md-3">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-body py-3 px-3">
                  <div className="small text-muted fw-bold">⚠️ Thiếu hồ sơ</div>
                  <h3 className="mb-0 fw-bold" style={{ color: '#c0392b' }}>{kpi.thieu}</h3>
                </div>
              </div>
            </div>
            <div className="col-6 col-md-3">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-body py-3 px-3">
                  <div className="small text-muted fw-bold">✅ Đã duyệt</div>
                  <h3 className="mb-0 fw-bold" style={{ color: '#2e7d32' }}>{kpi.daDuyet}</h3>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="card border-0 shadow-sm h-100 thamdinh-pinned-filters-card">
            <div className="card-body py-2 px-3 d-flex flex-column justify-content-center gap-2 thamdinh-pinned-filters">
              {/* Hàng 1: Tìm nhanh — Thời gian (giãn hết chỗ trống của hàng) — Nhập học
                  trực tiếp (ngoài cùng bên phải hàng 1). */}
              <div className="d-flex align-items-center gap-2 thamdinh-pin-row1">
                <input
                  type="search"
                  className="form-control form-control-sm thamdinh-pin-quick"
                  placeholder="🔎 Mã SV / CCCD / Họ tên..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                />
                <div className="thamdinh-pin-daterange">
                  <DateRangePicker
                    from={dateFrom}
                    to={dateTo}
                    onChange={(lo, hi) => { setDateFrom(lo); setDateTo(hi); setCurrentPage(1); }}
                  />
                </div>
                {/* ĐÃ SỬA: nút "Nhập học trực tiếp" chuyển lên hàng ghim (hàng 1, ngoài
                    cùng bên phải) — trước đây nằm trong nhóm "Lọc thêm" xổ dưới. */}
                <button
                  type="button"
                  className={`btn btn-sm thamdinh-pin-tructiep ${showTrucTiep ? 'btn-info text-white' : 'btn-outline-secondary'}`}
                  onClick={() => { setShowTrucTiep(v => !v); setCurrentPage(1); }}
                  title="Hiện/ẩn hồ sơ từ trang Thu hồ sơ nhập học (kênh Thu hồ sơ trực tiếp)"
                >
                  <i className="bi bi-person-check me-1"></i>Nhập học trực tiếp
                </button>
              </div>
              {/* Hàng 2: Trạng thái thẩm định — Sắp xếp — Ngành đào tạo (thu ngắn còn
                  nửa bề rộng) — Lọc thêm — Bỏ lọc (ngoài cùng bên phải hàng 2). */}
              <div className="d-flex flex-wrap align-items-center gap-2 thamdinh-pin-row2">
                <select
                  className="form-select form-select-sm thamdinh-pin-status"
                  value={filterThamDinh}
                  onChange={e => { setFilterThamDinh(e.target.value); setCurrentPage(1); }}
                  title="Trạng thái thẩm định"
                >
                  <option value="">-- Trạng thái thẩm định --</option>
                  <option value="Đang chờ duyệt">Đang chờ duyệt</option>
                  <option value="Mới bổ sung">Mới bổ sung</option>
                  <option value="Đã báo thiếu">Đã báo thiếu</option>
                  <option value="Đã duyệt">Đã duyệt</option>
                  <option value="Đã trúng tuyển">Đã trúng tuyển (Nhập học)</option>
                </select>
                <select
                  className="form-select form-select-sm thamdinh-pin-sort"
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  title="Sắp xếp"
                >
                  <option value="date_desc">Ngày nộp mới nhất</option>
                  <option value="date_asc">Ngày nộp cũ nhất</option>
                  <option value="score_desc">Điểm cao nhất</option>
                  <option value="status">Theo trạng thái</option>
                </select>
                {/* ĐÃ SỬA: Ngành đào tạo chuyển từ nhóm "Lọc thêm" lên hàng ghim, thu ngắn
                    còn ~nửa bề rộng so với 2 ô Trạng thái thẩm định/Sắp xếp bên cạnh. */}
                <select
                  className="form-select form-select-sm thamdinh-pin-nganh"
                  value={filterNganh}
                  onChange={e => { setFilterNganh(e.target.value); setCurrentPage(1); }}
                  title="Ngành đào tạo"
                >
                  <option value="">-- Ngành --</option>
                  {nganhOptions.map(ng => <option key={ng} value={ng}>{ng}</option>)}
                </select>
                {/* ĐÃ THÊM: nút "Lọc thêm" — bấm vào xổ ra 1 hàng bên dưới chứa Đối tượng
                    đầu vào/Trạng thái hồ sơ. Nổi chấm cam khi nhóm đó đang có lọc áp dụng
                    nhưng hàng đang ĐÓNG (moreFiltersActive) — để không "giấu" mất lọc đang
                    bật mà người dùng không biết. */}
                <button
                  type="button"
                  className={`btn btn-sm position-relative thamdinh-more-filter-btn ${showMoreFilters ? 'btn-info text-white' : 'btn-outline-secondary'}`}
                  onClick={() => setShowMoreFilters(v => !v)}
                  title="Thêm điều kiện lọc (Đối tượng đầu vào, Trạng thái hồ sơ)"
                >
                  <i className="bi bi-funnel me-1"></i>Lọc thêm
                  <i className={`bi bi-chevron-${showMoreFilters ? 'up' : 'down'} ms-1`}></i>
                  {moreFiltersActive && !showMoreFilters && (
                    <span className="thamdinh-more-filter-dot" title="Đang có lọc áp dụng trong nhóm này"></span>
                  )}
                </button>
                {/* ĐÃ SỬA: nút reset đổi tên hiển thị thành "Bỏ lọc" (có chữ, không chỉ
                    icon nữa) và luôn là phần tử NGOÀI CÙNG BÊN PHẢI của hàng 2 — logic đổi
                    màu cam nhạt khi isFilterActive giữ nguyên như trước. */}
                <button
                  type="button"
                  className={`btn btn-sm ms-auto ${isFilterActive ? 'thamdinh-reset-btn-active' : 'thamdinh-reset-btn'}`}
                  onClick={resetFilters}
                  title="Xóa bộ lọc, quay về mặc định"
                >
                  <i className="bi bi-x-circle me-1"></i>Bỏ lọc
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ĐÃ SỬA: nhóm "Lọc thêm" giờ chỉ còn Đối tượng đầu vào/Trạng thái hồ sơ (Ngành
          và Nhập học trực tiếp đã chuyển lên hàng ghim ở trên) — xổ RA HẲN 1 HÀNG RIÊNG
          bên dưới khi bấm nút, không phải dropdown/overlay che nội dung. */}
      {showMoreFilters && (
        <div className="card border-0 shadow-sm mb-3">
          <div className="card-body py-2">
            <div className="row g-2 align-items-end">
              <div className="col-6 col-md-4">
                <label className="form-label small fw-bold mb-1">Đối tượng đầu vào</label>
                <select className="form-select form-select-sm" value={filterDoiTuong} onChange={e => { setFilterDoiTuong(e.target.value); setCurrentPage(1); }}>
                  <option value="">-- Tất cả --</option>
                  {doiTuongOptions.map(dt => <option key={dt} value={dt}>{dt}</option>)}
                </select>
              </div>
              <div className="col-6 col-md-4">
                <label className="form-label small fw-bold mb-1">Trạng thái hồ sơ</label>
                <select className="form-select form-select-sm" value={filterHoSo} onChange={e => { setFilterHoSo(e.target.value); setCurrentPage(1); }}>
                  <option value="">-- Tất cả --</option>
                  <option value="Đủ">Đủ hồ sơ</option>
                  <option value="Thiếu">Thiếu hồ sơ</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedKeys.size > 0 && (
        <div className="card border-0 shadow-sm mb-3 bg-light">
          <div className="card-body py-2 d-flex flex-wrap align-items-center gap-2">
            <span className="fw-bold small">Đã chọn {selectedKeys.size} hồ sơ:</span>
            <button className="btn btn-sm btn-success" onClick={() => openBatchPreview('duyet')}>✅ Duyệt hàng loạt</button>
            <button className="btn btn-sm btn-warning" onClick={() => openBatchPreview('baothieu')}>⚠️ Báo thiếu hàng loạt</button>
            <button className="btn btn-sm btn-primary" onClick={() => openBatchPreview('luucsdl')}>💾 Lưu CSDL hàng loạt</button>
            {/* ĐÃ THÊM (Ký điện tử Pha 1 — Bước 3): nút xuất Giấy báo trúng tuyển +
                gửi yêu cầu ký — hiện chỉ mở bảng xem trước, nút "Xác nhận" tạm khoá
                cho tới Bước 4 (khi action taoYeuCauKyGBTT thật sự tồn tại). */}
            <button className="btn btn-sm btn-info text-white" onClick={() => openBatchPreview('gbtt')}>📄 Xuất GBTT + gửi ký</button>
            {/* ĐÃ XOÁ (theo phản hồi): nút "Bỏ chọn hết" — thay bằng ô tick "chọn tất" ngay
                trong hàng tiêu đề bảng (cạnh STT, xem <thead> bên dưới), bỏ tick ô đó là bỏ
                chọn hết các dòng đang hiện trên trang hiện tại. */}
          </div>
        </div>
      )}

      <div className="card border-0 shadow-sm">
        {/* ĐÃ SỬA: chỉ đổi class thead từ "table-light" mặc định của Bootstrap sang
            "thamdinh-list-thead" riêng (đậm hơn 1 tý, xem CSS) để KHÔNG ảnh hưởng các
            bảng table-light khác trong modal chi tiết (bảng tổ hợp điểm, bảng quét AI...). */}
        {/* ĐÃ SỬA (theo phản hồi — đồng bộ scroll/tiêu đề cố định với bên Xét tuyển): thêm
            class "thamdinh-list-scroll" (xem ThamDinh.css) — bảng tự có thanh cuộn DỌC
            riêng (giới hạn chiều cao, không cuốn theo cả trang), tiêu đề đứng yên khi cuộn
            dọc, chỉ trượt khi cuộn ngang. */}
        <div className="table-responsive thamdinh-list-scroll">
          <table className="table table-hover align-middle mb-0" style={{ fontSize: '12px' }}>
            <thead className="thamdinh-list-thead">
              <tr>
                {/* ĐÃ SỬA (theo phản hồi): ô trống ở đây giờ là ô tick "chọn tất/bỏ chọn tất"
                    — chỉ áp dụng cho các dòng đang hiển thị TRÊN TRANG HIỆN TẠI (pageRows),
                    không đụng tới lựa chọn ở các trang khác (selectedKeys vẫn giữ nguyên khi
                    chuyển trang, xem pageRows/toggleSelect) — tick ô này khi đang xem trang
                    khác không "chọn tất mọi hồ sơ khớp bộ lọc" để tránh duyệt/báo thiếu/lưu
                    hàng loạt nhầm những hồ sơ chưa từng xem qua. */}
                <th style={{ width: 34 }} className="text-center">
                  <input type="checkbox" className="form-check-input"
                    checked={pageRows.length > 0 && pageRows.every(r => selectedKeys.has(getRowKey(r)))}
                    onChange={e => {
                      const checked = e.target.checked;
                      setSelectedKeys(prev => {
                        const next = new Set(prev);
                        pageRows.forEach(r => { const k = getRowKey(r); if (checked) next.add(k); else next.delete(k); });
                        return next;
                      });
                    }}
                    title={pageRows.length > 0 && pageRows.every(r => selectedKeys.has(getRowKey(r))) ? "Bỏ chọn tất cả (trang này)" : "Chọn tất cả (trang này)"} />
                </th>
                <th style={{ width: 40 }} className="text-center">STT</th>
                <th style={{ width: 80 }} className="text-center">NGÀY CN</th>
                <th style={{ width: 90 }}>MÃ SV</th>
                <th style={{ width: 100 }}>CĂN CƯỚC</th>
                <th style={{ width: 160 }}>HỌ VÀ TÊN</th>
                <th style={{ width: 160 }}>NGÀNH ĐÀO TẠO</th>
                <th style={{ width: 145 }}>ĐỐI TƯỢNG</th>
                <th style={{ width: 90 }} className="text-center">ĐIỂM / TỔ HỢP</th>
                <th style={{ width: 150 }}>TRẠNG THÁI HỒ SƠ</th>
                {/* ĐÃ SỬA: 120 -> 140px, đủ chỗ cho "Đã yêu cầu BS" không xuống dòng
                    (bảng đã có white-space: nowrap trên thead lẫn td nút, xem CSS). */}
                <th style={{ width: 140 }} className="text-center">THẨM ĐỊNH</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={11} className="text-center py-4"><div className="spinner-border spinner-border-sm me-2"></div>Đang tải danh sách hồ sơ...</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={11} className="text-center text-muted py-4">❌ Không có hồ sơ nào thỏa điều kiện!</td></tr>
              ) : pageRows.map((row, i) => {
                const index = pageStart + i;
                const key = getRowKey(row);
                const state = getEffectiveState(row);
                const saved = getEffectiveSaved(row);
                const missing = getMissingDocs(row);
                const cccdStr = getVal(row, ["CĂN CƯỚC", "CCCD", "SỐ CCCD"]).replace(/^['"]+|['"]+$/g, '');
                const score = getBestScore(row);
                const badge = stateBadge(row, state, saved);

                return (
                  // ĐÃ THÊM (theo phản hồi): sau khi đã tick ÍT NHẤT 1 dòng bằng cách bấm
                  // đúng ô tick (lần tick đầu tiên vẫn bắt buộc phải bấm đúng ô tick — xem
                  // điều kiện selectedKeys.size > 0 dưới đây), các lần sau chỉ cần bấm vào
                  // BẤT KỲ ĐÂU trên dòng là tự tick/bỏ tick dòng đó, không cần bấm chính xác
                  // vào ô tick nữa — trừ khi bấm đúng vào nút "THẨM ĐỊNH"/ô tick/link trong
                  // dòng (dùng closest('button, input, a') để loại trừ, tránh vừa tick dòng
                  // vừa vô tình mở modal chi tiết hoặc tick đúp do ô tick tự có onChange riêng).
                  <tr key={key || index} className={selectedKeys.has(key) ? 'table-primary' : ''}
                    style={{ cursor: selectedKeys.size > 0 ? 'pointer' : 'default' }}
                    onClick={e => {
                      if (selectedKeys.size === 0) return;
                      if (e.target.closest('button, input, a')) return;
                      toggleSelect(key, !selectedKeys.has(key));
                    }}>
                    <td className="text-center">
                      <input type="checkbox" className="form-check-input" checked={selectedKeys.has(key)}
                        onChange={e => toggleSelect(key, e.target.checked)} />
                    </td>
                    <td className="text-center">{index + 1}</td>
                    {/* ĐÃ VÁ BUG: cột "TIME" lưu theo thứ tự "hh:mm:ss dd/mm/yyyy" (giờ trước
                        ngày) — .split(' ')[0] cũ lấy token đầu tiên nên hiện ra "hh:mm:ss" thay
                        vì ngày. Giờ tìm đúng token có chứa '/' (phần ngày) thay vì giả định vị trí. */}
                    <td className="text-center fw-bold">{getVal(row, ["TIME"]).split(' ').find(p => p.includes('/') || p.includes('-')) || ''}</td>
                    <td style={{ color: '#d84315', fontWeight: 'bold' }}>{generateMaSV(row)}</td>
                    <td className="fw-bold">{cccdStr}</td>
                    <td className="fw-bold">{getVal(row, ["TÊN SINH VIÊN", "HỌ VÀ TÊN"])}</td>
                    <td>{getVal(row, ["NGÀNH", "NGÀNH ĐÀO TẠO"])}</td>
                    <td>{getVal(row, ["ĐỐI TƯỢNG ĐẦU VÀO", "ĐỐI TƯỢNG"])}</td>
                    <td className="text-center">
                      {score.empty ? (
                        <span className="text-muted" style={{ fontSize: 10 }}>{score.message}</span>
                      ) : (
                        <>
                          <b style={{ color: '#d84315' }}>{score.value}</b>{' '}
                          <span style={{ fontSize: 10, color: '#555' }}>({score.combo || score.unit})</span>
                        </>
                      )}
                    </td>
                    <td>
                      {missing.length > 0 ? (
                        <span className="badge bg-warning text-dark" style={{ whiteSpace: 'normal', textAlign: 'left' }}>Thiếu: {missing.map(rutGonTenHoSo).join(', ')}</span>
                      ) : (
                        <span className="badge bg-success">Đủ hồ sơ</span>
                      )}
                    </td>
                    <td className="text-center">
                      <button className={`btn btn-sm ${badge.cls}`} onClick={() => { setViewingIndex(index); setCrossCheckNganh(''); setExportMenuOpen(false); }}>{badge.text}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="card-footer bg-white d-flex flex-wrap justify-content-between align-items-center gap-2 py-2">
          <span className="small text-muted">
            {filteredData.length === 0 ? 'Không có hồ sơ nào.' : `Đang hiển thị ${pageStart + 1}–${Math.min(pageStart + pageSize, filteredData.length)} / ${filteredData.length} hồ sơ`}
          </span>
          <div className="d-flex align-items-center gap-2">
            {/* ĐÃ SỬA (theo phản hồi): thêm mốc "100 / trang", đồng thời nới rộng ô thêm 25%
                (90px -> 113px) vì chữ "trang" đang bị che mất ở các mốc số dài hơn. */}
            <select className="form-select form-select-sm" style={{ width: 113 }} value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}>
              <option value={10}>10 / trang</option>
              <option value={20}>20 / trang</option>
              <option value={50}>50 / trang</option>
              <option value={100}>100 / trang</option>
            </select>
            <button className="btn btn-sm btn-outline-secondary" disabled={safePage <= 1} onClick={() => setCurrentPage(p => p - 1)}>‹</button>
            <span className="small">{safePage}/{totalPages}</span>
            <button className="btn btn-sm btn-outline-secondary" disabled={safePage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>›</button>
          </div>
        </div>
      </div>

      {viewingIndex !== null && filteredData[viewingIndex] && (() => {
        const row = filteredData[viewingIndex];
        const ownNganh = getVal(row, ["NGÀNH", "NGÀNH ĐÀO TẠO"]);
        const targetNganh = crossCheckNganh || ownNganh;
        const isSurveying = crossCheckNganh !== '';
        const state = getEffectiveState(row);
        const saved = getEffectiveSaved(row);
        const isDuyet = state === "Đã duyệt";
        const isBaoThieu = state === "Đã báo thiếu";
        const isTrucTiep = isTrucTiepKenh(row);
        const missingTQ = getMissingTienQuyet(row);
        const missing = getMissingDocs(row);
        // ĐÃ THÊM (theo phản hồi — hồ sơ ĐÃ DUYỆT có cập nhật/bổ sung thêm): đọc RAW "TRẠNG
        // THÁI THẨM ĐỊNH" (khác "state" đã bị chuẩn hoá chỉ còn "Đã duyệt") — khi sửa 1 hồ sơ
        // đã duyệt, backend (Quanlysv.gs/importStudents) ghi thêm hậu tố "(Có cập nhật: <các
        // cột vừa đổi>)" vào NGUYÊN ô này thay vì hạ về "Mới bổ sung". coCapNhatSauDuyet=true
        // thì: nút Duyệt mở khoá LẠI (đổi màu cam, để cán bộ xác nhận lại) thay vì khoá cứng
        // như hồ sơ đã duyệt bình thường; nút Y/C bổ sung cũng mở lại (tới khi hồ sơ đủ).
        const rawTrangThai = getVal(row, ["TRẠNG THÁI THẨM ĐỊNH", "TRẠNG THÁI"]);
        // ĐÃ SỬA (theo phản hồi — bấm "Xác nhận lại" xong vẫn bấm tiếp được, không khoá):
        // dữ liệu "rawTrangThai" ở trên là dữ liệu ĐÃ TẢI SẴN (rawData từ useQuery), KHÔNG tự
        // refetch ngay sau khi xác nhận — nên dù backend đã ghi "Đã duyệt" sạch, hộp thoại vẫn
        // đọc thấy hậu tố "(Có cập nhật: ...)" cũ cho tới khi trang tải lại dữ liệu, khiến nút
        // không khoá lại. Giờ ưu tiên đọc override "coCapNhatSauDuyet" (set = false ngay sau
        // khi triggerApprove xác nhận lại thành công, xem setOverride ở đó) nếu CÓ override
        // cho đúng dòng này — override chỉ tồn tại trong phiên làm việc hiện tại (mất khi tải
        // lại trang), lúc đó nếu hồ sơ THẬT SỰ có cập nhật mới, dữ liệu server mới sẽ tự phản
        // ánh đúng lại, không bị khoá oan.
        const coCapNhatOverride = localOverrides[getRowKey(row)]?.coCapNhatSauDuyet;
        const coCapNhatSauDuyet = coCapNhatOverride !== undefined ? coCapNhatOverride : (isDuyet && rawTrangThai.indexOf("Có cập nhật") !== -1);
        const chiTietCapNhat = (rawTrangThai.match(/Có cập nhật: ([^)]*)\)/) || [])[1] || '';
        // ĐÃ THÊM (theo phản hồi — "trạng thái thẩm định" trong bảng thông tin hiện nguyên cả
        // dòng dài "(Có cập nhật: CỘT A, CỘT B, ...)" trông như 1 dòng tiêu đề dài dòng, thay
        // vì chỉ cần biết NGẮN GỌN là hồ sơ đang cần xác nhận lại — chi tiết ĐẦY ĐỦ cột nào đổi
        // vẫn còn nguyên trong hộp thoại xác nhận (chiTietCapNhat, xem triggerApprove) nên
        // không mất thông tin, chỉ đỡ rối ở dòng hiển thị trạng thái thường trực trong modal.
        const trangThaiHienThi = coCapNhatSauDuyet ? 'Đã duyệt (có cập nhật)' : rawTrangThai;
        const scores = calculateScores(row, targetNganh);
        const scanKey = getCandidateScanKey(row);
        const scanEntry = scanCache[scanKey] || {};
        const hasTranscript = Array.isArray(scanEntry.transcriptJSON) && scanEntry.transcriptJSON.length > 0;
        const hasCompare = !!scanEntry.compareResult;
        const linkHoSo = getVal(row, ["LINK HỒ SƠ", "Link hồ sơ"]);
        const linkOk = isSafeDriveUrl(linkHoSo);

        // ĐÃ THÊM (Pha 5): khi đang "khảo sát ngành khác" (targetNganh != ngành đăng ký
        // thật), khoá cả 3 nút hành động — giống hệt bản cũ (isSurveying trong
        // updateModalActionButtons), tránh lỡ tay duyệt/lưu nhầm theo ngành đang xem thử.
        // ĐÃ SỬA (theo phản hồi): "isDuyet" giờ CHỈ khoá nút Duyệt khi KHÔNG có cập nhật mới
        // (coCapNhatSauDuyet=false) — hồ sơ đã duyệt mà vừa được sửa/bổ sung thì mở lại ĐÚNG
        // nút này (đổi nhãn/màu) để cán bộ xác nhận lại, thay vì khoá cứng như trước (khoá
        // cứng mới là nguyên nhân không có cách nào để "duyệt lại" hồ sơ có cập nhật).
        // ĐÃ SỬA: gộp thêm xacNhanCapNhatMutation.isPending (action "Xác nhận lại" riêng,
        // xem triggerApprove) — thiếu dòng này thì nút vẫn bấm được lia lịa trong lúc request
        // "Xác nhận lại" trước đó còn đang chạy dở, đúng y hệt lỗi báo (không khoá được).
        const btnApproveDisabled = isSurveying || (isDuyet && !coCapNhatSauDuyet) || isBaoThieu || isTrucTiep || missingTQ.length > 0 || approveMutation.isPending || xacNhanCapNhatMutation.isPending;
        const btnApproveText = isSurveying ? '🔒 Tắt Khảo sát để Thao tác'
          : approveMutation.isPending ? '⏳ Đang xuất Biên nhận...'
          : xacNhanCapNhatMutation.isPending ? '⏳ Đang xác nhận...'
          : isTrucTiep ? '— Ngoài luồng thẩm định —'
          : coCapNhatSauDuyet ? '🔁 XÁC NHẬN LẠI (có cập nhật)'
          : isDuyet ? 'Đã duyệt'
          : missingTQ.length > 0 ? '❌ Thiếu HS Tiên Quyết'
          : '✅ DUYỆT TRÚNG TUYỂN';

        // ĐÃ SỬA (theo phản hồi): hồ sơ đã duyệt NHƯNG có cập nhật mới thì nút Y/C bổ sung
        // cũng mở lại — CHỈ khoá lại khi hồ sơ đã ĐỦ giấy tờ (missing.length === 0), đúng ý
        // "chỉ khi nào hồ sơ ĐỦ thì nút Y/C bổ sung mới khóa".
        const btnMissingDisabled = isSurveying || (isDuyet && !coCapNhatSauDuyet) || isBaoThieu || isTrucTiep || (coCapNhatSauDuyet && missing.length === 0) || missingMutation.isPending;
        const btnMissingText = isSurveying ? '🔒 Tắt Khảo sát để Thao tác' : isTrucTiep ? '— Ngoài luồng thẩm định —' : missingMutation.isPending ? '⏳ Đang xử lý...' : isBaoThieu ? 'Đã Y/C bổ sung' : '⚠️ Y/C BỔ SUNG HS';

        const btnSaveDisabled = isSurveying || saved || saveMutation.isPending;
        const btnSaveText = isSurveying ? '🔒 Tắt Khảo sát để Thao tác' : saveMutation.isPending ? '⏳ Đang lưu...' : saved ? 'Đã lưu vào CSDL' : '💾 LƯU VÀO CSDL';

        return (
          <div className="modal show d-block thamdinh-detail-modal" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={(e) => { if (e.target === e.currentTarget) { setViewingIndex(null); setExportMenuOpen(false); } }}>
            <div className="modal-dialog modal-lg modal-dialog-scrollable">
              <div className="modal-content">
                <div className="modal-header">
                  <button className="btn btn-sm btn-outline-secondary me-2" disabled={viewingIndex === 0}
                    onClick={() => { setViewingIndex(i => i - 1); setCrossCheckNganh(''); setExportMenuOpen(false); }}>‹ Trước</button>
                  <h5 className="modal-title fw-bold flex-grow-1 text-center">Hồ sơ: {getVal(row, ["TÊN SINH VIÊN", "HỌ VÀ TÊN"])}</h5>
                  <button className="btn btn-sm btn-outline-secondary ms-2" disabled={viewingIndex >= filteredData.length - 1}
                    onClick={() => { setViewingIndex(i => i + 1); setCrossCheckNganh(''); setExportMenuOpen(false); }}>Sau ›</button>
                  <button type="button" className="btn-close ms-3" onClick={() => { setViewingIndex(null); setExportMenuOpen(false); }}></button>
                </div>
                <div className="modal-body">
                  {/* ĐÃ THÊM: bọc bảng thông tin trong 1 khung riêng (nền xám nhạt + hoạ tiết
                      caro kẻ chéo 45 độ) để tách khối này khỏi phần khảo sát ngành/điểm số
                      bên dưới — hoạ tiết CHỈ áp dụng trong khung này, không lan ra cả modal. */}
                  <div className="thamdinh-info-box">
                    <table className="table table-sm table-borderless mb-0 thamdinh-info-table">
                      <tbody>
                        <tr>
                          <th style={{ width: 230 }}>Mã sinh viên</th>
                          {/* ĐÃ SỬA: thêm class "masv-value" -> in đậm, màu đỏ boóc-đô (xem ThamDinh.css) */}
                          <td className="masv-value">{generateMaSV(row)}</td>
                        </tr>
                        <tr><th>Số CCCD</th><td>{getVal(row, ["CĂN CƯỚC", "CCCD", "SỐ CCCD"]).replace(/^['"]+|['"]+$/g, '')}</td></tr>
                        <tr><th>Hệ / Hình thức đào tạo</th><td>{getVal(row, ["HỆ ĐÀO TẠO"])} / {getVal(row, ["HÌNH THỨC ĐÀO TẠO"])}</td></tr>
                        <tr><th>Đối tượng đầu vào</th><td>{getVal(row, ["ĐỐI TƯỢNG ĐẦU VÀO", "ĐỐI TƯỢNG"])}</td></tr>
                        <tr><th>Khu vực / Đối tượng ưu tiên</th><td>{getVal(row, ["KHU VỰC ƯU TIÊN"])} / {getVal(row, ["ĐỐI TƯỢ ƯU TIÊN", "ĐỐI TƯỢNG ƯU TIÊN"])}</td></tr>
                        {/* ĐÃ CHUYỂN từ khung "Panel điểm chi tiết" phía dưới lên đây, ngay dưới dòng
                            Khu vực/Đối tượng ưu tiên, theo yêu cầu. */}
                        {/* ĐÃ VÁ BUG THẬT (nguyên nhân trắng trang khi mở hồ sơ "chưa đủ điểm"):
                            calculateScores() trả về KHÔNG có field "uuTien" khi hồ sơ THPT
                            không tính được điểm nào (hasScore: false) — biểu thức cũ
                            "(scores.uuTien ?? 0).toFixed ? scores.uuTien.toFixed(2) : ..."
                            chỉ dùng "?? 0" để kiểm tra ĐIỀU KIỆN (0.toFixed luôn tồn tại nên
                            luôn đúng), rồi lại gọi .toFixed(2) trên chính "scores.uuTien" GỐC
                            (vẫn là undefined) ở nhánh true -> "Cannot read properties of
                            undefined (reading 'toFixed')" -> React crash -> trắng trang, y hệt
                            khi bấm vào hoặc điều hướng tới đúng nhóm hồ sơ "Chưa đủ dữ liệu
                            điểm". Sửa: áp "?? 0" trực tiếp trước khi gọi .toFixed(2), không qua
                            kiểm tra vòng vo nữa — luôn ra số, không bao giờ crash. */}
                        <tr><th>Điểm cộng / Điểm ưu tiên</th><td>{scores.diemCong ?? 0}đ / {(scores.uuTien ?? 0).toFixed(2)}đ</td></tr>
                        {/* ĐÃ SỬA (theo phản hồi — cần thấy hồ sơ đã duyệt vừa cập nhật CHỖ NÀO
                            trước khi bấm duyệt lại): hiện nguyên "rawTrangThai" (có thể mang hậu
                            tố "(Có cập nhật: ...)") thay vì "state" đã bị chuẩn hoá rút gọn — chỉ tô
                            cam đậm khi có cập nhật để dễ nhận ra ngay trong bảng thông tin. */}
                        <tr><th>Trạng thái thẩm định</th><td className={coCapNhatSauDuyet ? 'text-warning fw-bold' : ''}>{trangThaiHienThi || state}</td></tr>
                        {/* ĐÃ SỬA theo góp ý: chỉ tô đỏ nhạt ô BÊN PHẢI (ô chứa chữ "Thiếu...") thay
                            vì cả dòng — class "hoso-thieu-cell" đặt trực tiếp trên <td>, không còn
                            đặt trên <tr> nữa. Chữ in đậm, màu đỏ đậm tương phản tốt trên nền đỏ nhạt
                            (dùng lại đúng cặp màu bg/text của Bootstrap alert-danger — đã kiểm chứng
                            đạt chuẩn tương phản WCAG AA). */}
                        <tr>
                          <th>Hồ sơ</th>
                          <td className={missing.length > 0 ? 'hoso-thieu-cell' : 'text-success'}>
                            {missing.length > 0 ? `⚠️ Thiếu: ${missing.join(', ')}` : '✅ Đã nộp đủ hồ sơ hợp lệ'}
                          </td>
                        </tr>
                        {missingTQ.length > 0 && (
                          <tr><th className="text-danger">Thiếu hồ sơ TIÊN QUYẾT</th><td className="hoso-thieu-cell">{missingTQ.join(', ')}</td></tr>
                        )}
                        <tr className="link-row" title={linkOk ? linkHoSo : 'Không có link hợp lệ'}>
                          <th>Link hồ sơ</th>
                          <td>
                            {linkOk ? (
                              <a href={linkHoSo} target="_blank" rel="noopener noreferrer">🔗 Mở hồ sơ Drive</a>
                            ) : (
                              <span className="text-muted">Không có link hồ sơ hợp lệ</span>
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Khảo sát ngành khác — đổi ngành tạm thời để xem điểm, KHÔNG ảnh hưởng dữ liệu thật */}
                  <div className="mb-2">
                    <label className="form-label small mb-1">Khảo sát điểm theo ngành khác (không lưu, chỉ xem thử)</label>
                    <select className="form-select form-select-sm" value={crossCheckNganh} onChange={e => setCrossCheckNganh(e.target.value)}>
                      <option value="">- Dùng đúng ngành đăng ký: {ownNganh} -</option>
                      {Object.keys(DICT_NGANH).filter(ng => ng !== ownNganh).map(ng => <option key={ng} value={ng}>{ng}</option>)}
                    </select>
                  </div>

                  {/* ĐÃ SỬA: gộp khung "Quét bảng điểm AI / Đối sánh CTĐT" (trái, col-8, đưa lên từ
                      dưới) và khung điểm chung (phải, col-4) vào chung 1 hàng theo yêu cầu. Khung
                      "Điểm cộng / Điểm ưu tiên" đã dời lên bảng thông tin phía trên (không lặp lại ở
                      đây nữa); khung "Điểm chuẩn (15đ)"/ĐẠT-TRƯỢT (nhánh THPT) đã bỏ, gộp thành 1
                      dòng phụ "/ 15" ngay dưới điểm trúng tuyển; dòng thông báo "tính năng chưa có"
                      và heading "📑 Quét bảng điểm AI..." cũ cũng đã bỏ vì các tính năng này đã xong. */}
                  <div className="row g-2 mb-2">
                    <div className="col-8">
                      <div className="border rounded p-2 h-100">
                        <div className="d-flex align-items-center gap-2 flex-wrap">
                          <input type="file" accept="image/*,application/pdf" ref={fileInputRef} style={{ display: 'none' }}
                            onChange={e => { const f = e.target.files[0]; e.target.value = ''; handleScanFile(row, f); }} />
                          <button className="btn btn-sm btn-outline-info" disabled={scanMutation.isPending} onClick={() => fileInputRef.current?.click()}>
                            {scanMutation.isPending ? '⏳ Đang trích xuất...' : hasTranscript ? 'Scan other' : 'Scan transcript'}
                          </button>
                          {hasTranscript && (
                            <button className="btn btn-sm btn-outline-primary" disabled={compareMutation.isPending}
                              onClick={() => handleCompare(row, targetNganh, scanEntry.transcriptJSON)}>
                              {compareMutation.isPending ? '⏳ Đang đối sánh...' : '⚖️ Phân tích & Đối sánh CTĐT'}
                            </button>
                          )}
                        </div>
                        {/* ĐÃ THÊM: tên file dài quá thì rút gọn kiểu "đầu...cuối" (xem truncateMiddle) */}
                        {scanEntry.scanFileName && (
                          <div className="small text-muted mt-1" title={scanEntry.scanFileName}>File: {truncateMiddle(scanEntry.scanFileName)}</div>
                        )}
                        {/* ĐÃ THÊM (Công nhận KQHT & chuyển đổi tín chỉ — Nguồn 2 "miễn theo văn bằng
                            cũ", 2026-09-09): tick 1 trong 3 loại văn bằng cũ -> tự áp mẫu miễn cố định
                            (Điều 6) vào bảng đối sánh — xem handleChonMienVanBangCu. Chỉ bật được sau
                            khi đã có compareResult (cần khung CTĐT để so tên học phần). */}
                        <div className="d-flex align-items-center gap-2 flex-wrap mt-2 pt-2" style={{ borderTop: '1px dashed #ccc' }}>
                          <span className="small text-muted">Miễn theo văn bằng cũ:</span>
                          {['', 'Trung cấp', 'Cao đẳng', 'Đại học'].map(opt => (
                            <div className="form-check form-check-inline mb-0" key={opt || 'khong'}>
                              <input
                                className="form-check-input" type="radio"
                                id={`mvb-${scanKey}-${opt || 'khong'}`}
                                name={`mvb-${scanKey}`}
                                disabled={!hasCompare}
                                checked={(scanEntry.mienVanBangCu || '') === opt}
                                onChange={() => handleChonMienVanBangCu(row, scanKey, opt)}
                              />
                              <label className="form-check-label small" htmlFor={`mvb-${scanKey}-${opt || 'khong'}`}>{opt || 'Không'}</label>
                            </div>
                          ))}
                          {!hasCompare && <span className="small text-muted fst-italic">(cần đối sánh CTĐT trước)</span>}
                        </div>
                        {/* ĐÃ THÊM (Công nhận KQHT & chuyển đổi tín chỉ — Nguồn 3 "miễn theo chứng
                            chỉ", 2026-09-10): mỗi dòng chọn "Loại chứng chỉ" TRƯỚC rồi mới upload
                            ảnh — OCR xong tự thêm dòng kết quả + tự "mọc" thêm dòng trống mới (không
                            cần bấm nút "+"). Xem handleUploadChungChi/handleXoaDongChungChi. */}
                        <div className="mt-2 pt-2" style={{ borderTop: '1px dashed #ccc' }}>
                          <div className="small text-muted mb-1">Miễn theo chứng chỉ (Ngoại ngữ / Tin học / LLCT / GDQP&AN):</div>
                          {!hasCompare && <span className="small text-muted fst-italic">(cần đối sánh CTĐT trước)</span>}
                          {hasCompare && (
                            <>
                              {(scanEntry.dsChungChiDaQuet || []).map(dong => (
                                <div key={dong.id} className="d-flex align-items-center gap-2 small mb-1 flex-wrap">
                                  <span className="badge bg-light text-dark border fw-normal" style={{ minWidth: 150 }}>
                                    {DS_LOAI_CHUNG_CHI.find(o => o.value === dong.loaiChungChiValue)?.label || dong.loaiChungChiValue}
                                  </span>
                                  {dong.dangQuet && <span className="text-muted">⏳ Đang quét "{truncateMiddle(dong.fileName)}"...</span>}
                                  {dong.loi && <span className="text-danger">❌ Lỗi: {dong.loi}</span>}
                                  {dong.ocrResult && !dong.loi && (
                                    <span className="text-success">
                                      ✅ {dong.ocrResult.tenChungChi || '(không đọc được tên)'}
                                      {dong.ocrResult.mucDat ? ` — mức đạt: ${dong.ocrResult.mucDat}` : ''}
                                      {dong.ocrResult.ngayCap ? ` — cấp ngày: ${dong.ocrResult.ngayCap}` : ' — (không đọc được ngày cấp)'}
                                    </span>
                                  )}
                                  <button type="button" className="btn btn-sm btn-link text-danger p-0" onClick={() => handleXoaDongChungChi(scanKey, dong.id)}>Xoá</button>
                                </div>
                              ))}
                              <div className="d-flex align-items-center gap-2 flex-wrap">
                                <select
                                  className="form-select form-select-sm" style={{ maxWidth: 340 }}
                                  value={scanEntry.loaiChungChiDangChon || ''}
                                  onChange={e => handleChonLoaiChungChiMoi(scanKey, e.target.value)}
                                >
                                  <option value="">+ Thêm chứng chỉ...</option>
                                  {DS_LOAI_CHUNG_CHI.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                                {scanEntry.loaiChungChiDangChon && (
                                  <>
                                    <input
                                      type="file" accept="image/*,application/pdf" id={`cc-file-${scanKey}`} style={{ display: 'none' }}
                                      onChange={e => { const f = e.target.files[0]; e.target.value = ''; handleUploadChungChi(row, scanKey, scanEntry.loaiChungChiDangChon, f); }}
                                    />
                                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => document.getElementById(`cc-file-${scanKey}`)?.click()}>
                                      📎 Upload ảnh chứng chỉ
                                    </button>
                                  </>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="col-4">
                      {scores.type === 'thpt' ? (
                        <div className="border rounded p-2 text-center h-100" style={{ background: '#e8f5e9', borderColor: '#81c784' }}>
                          <div className="small" style={{ color: '#2e7d32' }}>Điểm trúng tuyển / Tổ hợp / Điểm chuẩn</div>
                          {scores.hasScore ? (
                            <>
                              {/* ĐÃ THÊM: hiện rõ "(+PV: x)" khi điểm xét tuyển có cộng Điểm phỏng
                                  vấn (xem calculateScores() — chỉ cộng khi PT là Điểm học bạ và
                                  tổ hợp+điểm cộng từ 15 đến dưới 16) — để người thẩm định biết
                                  điểm hiển thị đã bao gồm PV, không tưởng nhầm là chỉ có điểm
                                  tổ hợp+ưu tiên+điểm cộng như trước. */}
                              {/* ĐÃ SỬA (theo phản hồi): đưa "/ điểm chuẩn" lên CHUNG 1 hàng với
                                  điểm+tổ hợp (trước đây nằm riêng 1 hàng bên dưới) — hàng bên dưới
                                  giờ dùng để hiện TÊN 3 MÔN của tổ hợp trúng tuyển (VD "Toán, Vật
                                  lí, Tiếng Anh") thay vì lặp lại điểm chuẩn, xem tenMonToHop() ở
                                  đầu file. */}
                              <div className="fw-bold" style={{ color: '#2e7d32' }}>{scores.finalTotalScore} <span className="small text-muted">({scores.bestCombo}{scores.diemPhongVan > 0 ? `, +PV: ${scores.diemPhongVan}` : ''}) / {scores.diemChuanLabel}</span></div>
                              <div className="small text-muted">{tenMonToHop(scores.bestCombo)}</div>
                              {/* ĐÃ THÊM (theo phản hồi — "check được bằng cách nào không?" khi PV
                                  không lên điểm): hồ sơ có nhập PV (cột "ĐIỂM PHỎNG VẤN" > 0) NHƯNG
                                  chưa đủ điều kiện cộng (diemPhongVan === 0) thì tự hiện dòng giải
                                  thích NGAY TẠI ĐÂY — kèm luôn giá trị đang đọc được cho PT/Tổ hợp
                                  +Điểm cộng+Điểm ưu tiên, để đối chiếu trực tiếp mà không cần hỏi
                                  lại/dò code: chỉ cộng PV khi PT = "Điểm học bạ" (không áp dụng
                                  Điểm thi THPT/TBTS 2025) VÀ (Tổ hợp cao nhất + Điểm cộng + Điểm
                                  ưu tiên) BẰNG 15 ĐẾN DƯỚI 16 — ĐÃ SỬA theo phản hồi 2 lần: (1)
                                  trước đây NGHIÊM NGẶT (15, 16), đúng 15.0 bị loại oan, giờ 15.0
                                  vẫn tính, chỉ đúng 16.0 là bị loại; (2) tổng để so ngưỡng trước
                                  đây THIẾU Điểm ưu tiên (scores.uuTien), giờ đã cộng thêm vào. */}
                              {scores.diemPhongVanRaw > 0 && scores.diemPhongVan === 0 && (
                                <div className="small text-danger fst-italic mt-1">
                                  ⚠️ Có nhập PV: {scores.diemPhongVanRaw} nhưng CHƯA được cộng.
                                  PT đang đọc được: <b>{scores.phuongThuc || 'chưa rõ (thiếu cột "PHƯƠNG THỨC XÉT TUYỂN")'}</b> (chỉ cộng PV khi PT = Điểm học bạ).
                                  Tổ hợp + Điểm cộng + Điểm ưu tiên = <b>{(scores.maxScore + scores.diemCong + scores.uuTien).toFixed(2)}</b> (chỉ cộng PV khi từ 15 đến dưới 16 — đúng 16.0 KHÔNG tính).
                                </div>
                              )}
                            </>
                          ) : <div className="small fst-italic text-muted">Chưa đủ dữ liệu điểm</div>}
                        </div>
                      ) : (
                        <div className="border rounded p-2 text-center h-100" style={{ background: '#e8f5e9', borderColor: '#81c784' }}>
                          <div className="small" style={{ color: '#2e7d32' }}>{scores.dtbLabel}</div>
                          <div className="fw-bold" style={{ color: '#2e7d32' }}>{scores.dtbVal}</div>
                          <div className="small text-muted">/ {scores.diemChuanText}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {scores.type === 'thpt' && scores.comboResults?.length > 0 && (
                    <div className="table-responsive mb-2">
                      <table className="table table-sm table-bordered text-center mb-0" style={{ fontSize: 12 }}>
                        <thead className="table-light">
                          <tr><th>Tổ hợp</th><th>Môn 1</th><th>Môn 2</th><th>Môn 3</th><th>Tổng điểm</th></tr>
                        </thead>
                        <tbody>
                          {scores.comboResults.map(c => {
                            const isBest = c.combo === scores.bestCombo;
                            return (
                              <tr key={c.combo} className={isBest ? 'table-warning' : ''}>
                                <td>{c.combo}{isBest ? ' ⭐' : ''}</td>
                                <td>{c.s1}</td><td>{c.s2}</td><td>{c.s3}</td>
                                <td className={isBest ? 'fw-bold text-danger' : ''}>{c.total.toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {hasTranscript && (
                    <div className="table-responsive mb-3" style={{ maxHeight: 220 }}>
                      <table className="table table-sm table-bordered mb-0" style={{ fontSize: 12 }}>
                        <thead className="table-light">
                          <tr><th>STT</th><th>Tên môn học</th><th>TC</th><th>Đ.Chữ</th><th>Hệ 4</th><th>Hệ 10</th></tr>
                        </thead>
                        <tbody>
                          {scanEntry.transcriptJSON.map((item, idx) => (
                            <tr key={idx}>
                              <td>{idx + 1}</td>
                              <td className="text-start fw-bold">{item.monhoc || ''}</td>
                              <td className="fw-bold text-danger">{item.tinchi || ''}</td>
                              <td>{item.diem_chu || ''}</td>
                              <td>{item.diem_he4 || ''}</td>
                              <td className="fw-bold text-success">{item.diem_he10 || ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {hasCompare && (() => {
                    const cmp = scanEntry.compareResult;
                    const matched = cmp.matched || []; const unmatched = cmp.unmatched || [];
                    const tenMonDaDoiSanh = new Set(matched.map(m => String(m.mon_da_hoc || "").trim().toLowerCase()));
                    const monHocKhongDuDieuKien = (scanEntry.transcriptJSON || []).filter(t => !tenMonDaDoiSanh.has(String(t.monhoc || "").trim().toLowerCase()));
                    const tcChuan = matched.reduce((s, m) => s + (parseFloat(m.tin_chi_chuan) || 0), 0);
                    const tcDaHoc = matched.reduce((s, m) => s + (parseFloat(m.tin_chi_da_hoc) || 0), 0);
                    const tcUnmatched = unmatched.reduce((s, u) => s + (parseFloat(u.tin_chi_chuan) || 0), 0);
                    const tcKhongDu = monHocKhongDuDieuKien.reduce((s, t) => s + (parseFloat(t.tinchi) || 0), 0);

                    return (
                      <div className="mb-2">
                        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                          <h6 className="fw-bold mb-0" style={{ color: '#2e7d32' }}>📋 Kết quả đối sánh sơ bộ (ngành: {targetNganh})</h6>
                          {/* ĐÃ THÊM (Công nhận KQHT & chuyển đổi tín chỉ, 2026-09-09): mở cửa sổ
                              riêng (near-fullscreen) để gộp/gỡ tay bảng đối sánh — xem
                              DoiSanhModal.jsx. Bảng bên dưới vẫn giữ nguyên CHỈ ĐỂ XEM NHANH,
                              không đổi hành vi cũ. */}
                          <button type="button" className="btn btn-sm btn-outline-success" onClick={() => setDoiSanhModalOpen(true)}>
                            ⚙️ Mở đối sánh chi tiết
                          </button>
                        </div>
                        <div className="table-responsive mb-2 mt-2" style={{ maxHeight: 200 }}>
                          <table className="table table-sm table-bordered mb-0" style={{ fontSize: 12 }}>
                            <thead style={{ background: '#e8f5e9' }}>
                              <tr><th>Nhóm môn</th><th>Môn CTĐT chuẩn</th><th>TC chuẩn</th><th>Môn SV đã học</th><th>TC đã học</th><th>Kết luận AI</th></tr>
                            </thead>
                            <tbody>
                              {matched.map((m, i) => (
                                <tr key={i}>
                                  <td className="text-start">{m.nhom_mon}</td>
                                  <td className="text-start fw-bold">{m.mon_chuan}</td>
                                  <td>{m.tin_chi_chuan}</td>
                                  <td className="text-start" style={{ color: '#1565c0' }}>{m.mon_da_hoc}</td>
                                  <td>{m.tin_chi_da_hoc}</td>
                                  <td className={m.ket_luan?.includes('Đạt') ? 'text-success fw-bold' : 'text-danger fw-bold'}>{m.ket_luan}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot style={{ background: '#c8e6c9' }}>
                              <tr className="fw-bold">
                                <td colSpan={2} className="text-start">Tổng cộng ({matched.length} môn)</td>
                                <td>{tcChuan}</td><td></td><td>{tcDaHoc}</td><td></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>

                        <div className="row g-2">
                          <div className="col-md-6">
                            <div className="small fw-bold text-danger mb-1">⚠️ Môn SV chưa học / chưa đối sánh được</div>
                            <div className="table-responsive" style={{ maxHeight: 180 }}>
                              <table className="table table-sm table-bordered mb-0" style={{ fontSize: 12 }}>
                                <thead style={{ background: '#ffebee' }}><tr><th>Nhóm môn</th><th>Tên môn chuẩn</th><th>TC yêu cầu</th></tr></thead>
                                <tbody>
                                  {unmatched.map((u, i) => (
                                    <tr key={i}><td className="text-start">{u.nhom_mon}</td><td className="text-start fw-bold">{u.mon_chuan}</td><td className="fw-bold text-danger">{u.tin_chi_chuan}</td></tr>
                                  ))}
                                </tbody>
                                <tfoot style={{ background: '#ffcdd2' }}><tr className="fw-bold"><td colSpan={2} className="text-start">Tổng cộng ({unmatched.length} môn)</td><td>{tcUnmatched}</td></tr></tfoot>
                              </table>
                            </div>
                          </div>
                          <div className="col-md-6">
                            <div className="small fw-bold mb-1" style={{ color: '#6a1b9a' }}>📘 Môn đã học nhưng không đủ điều kiện đối sánh</div>
                            <div className="table-responsive" style={{ maxHeight: 180 }}>
                              <table className="table table-sm table-bordered mb-0" style={{ fontSize: 12 }}>
                                <thead style={{ background: '#f3e5f5' }}><tr><th>Tên môn (đã học)</th><th>Số TC</th><th>Điểm chữ</th><th>Hệ 10</th></tr></thead>
                                <tbody>
                                  {monHocKhongDuDieuKien.length === 0 ? (
                                    <tr><td colSpan={4} className="text-muted fst-italic">Không còn môn nào.</td></tr>
                                  ) : monHocKhongDuDieuKien.map((t, i) => (
                                    <tr key={i}><td className="text-start fw-bold">{t.monhoc || ''}</td><td className="fw-bold" style={{ color: '#6a1b9a' }}>{t.tinchi || ''}</td><td>{t.diem_chu || ''}</td><td>{t.diem_he10 || ''}</td></tr>
                                  ))}
                                </tbody>
                                <tfoot style={{ background: '#e1bee7' }}><tr className="fw-bold"><td className="text-start">Tổng cộng ({monHocKhongDuDieuKien.length} môn)</td><td>{tcKhongDu}</td><td></td><td></td></tr></tfoot>
                              </table>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ĐÃ THÊM (Công nhận KQHT & chuyển đổi tín chỉ, 2026-09-09): modal riêng
                      near-fullscreen để gộp/gỡ tay bảng đối sánh — nằm ở đây (bên trong cùng
                      IIFE của modal chi tiết) để có sẵn row/targetNganh/scanEntry trong closure,
                      không cần truyền qua nhiều lớp props. */}
                  <DoiSanhModal
                    show={doiSanhModalOpen}
                    onClose={() => setDoiSanhModalOpen(false)}
                    row={row}
                    cccd={getVal(row, ["CĂN CƯỚC", "CCCD", "SỐ CCCD"]).replace(/^['"]+|['"]+$/g, '')}
                    targetNganh={targetNganh}
                    scanEntry={scanEntry}
                    scanKey={getCandidateScanKey(row)}
                    onUpdateScanCache={updateScanCache}
                    tranTinChi={appConfig?.TranTinChiCongNhan}
                    dsMienVanBangCu={dsMienVanBangCu}
                    dsMienTheoChungChi={dsMienTheoChungChi}
                  />

                  {/* ĐÃ THÊM: khung nguồn để xuất "Bảng thông tin sơ bộ (PDF)" — đặt ngoài màn
                      hình (position: fixed, left: -9999px) thay vì display:none vì html2canvas
                      (bên trong html2pdf.js) KHÔNG chụp được phần tử display:none. Nội dung tiêu
                      ngữ/chữ ký hiện chỉ là bản nháp — ông/tôi có thể chỉnh lại sau. */}
                  <div style={{ position: 'fixed', top: 0, left: '-9999px', width: '210mm' }}>
                    <div id="pdf-thamdinh-content" style={{ color: '#000', fontFamily: '"Times New Roman", Times, serif', padding: '10mm', background: '#fff' }}>
                      <div className="row text-center mb-4 d-flex flex-nowrap">
                        <div className="col-5">
                          <h6 className="mb-0 fw-normal fs-6">BỘ GIÁO DỤC VÀ ĐÀO TẠO</h6>
                          <h6 className="mb-0 fw-bold fs-6">TRƯỜNG ĐẠI HỌC ....................</h6>
                          <hr className="mt-1 mb-0 mx-auto" style={{ width: '40%', borderTop: '1.5px solid black' }} />
                        </div>
                        <div className="col-7">
                          <h6 className="mb-0 fw-bold fs-6">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</h6>
                          <h6 className="mb-0 fw-bold fs-6">Độc lập - Tự do - Hạnh phúc</h6>
                          <hr className="mt-1 mb-0 mx-auto" style={{ width: '50%', borderTop: '1.5px solid black' }} />
                        </div>
                      </div>

                      <div className="text-center mt-4 mb-4">
                        <h4 className="fw-bold mb-1">BẢNG THÔNG TIN SƠ BỘ THẨM ĐỊNH HỒ SƠ</h4>
                      </div>

                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '1rem' }}>
                        <tbody>
                          <tr><td style={{ padding: '3px 4px', width: '45%' }}>Họ và tên</td><td style={{ padding: '3px 4px', fontWeight: 'bold' }}>{getVal(row, ["TÊN SINH VIÊN", "HỌ VÀ TÊN"])}</td></tr>
                          <tr><td style={{ padding: '3px 4px' }}>Mã sinh viên</td><td style={{ padding: '3px 4px', fontWeight: 'bold' }}>{generateMaSV(row)}</td></tr>
                          <tr><td style={{ padding: '3px 4px' }}>Số CCCD</td><td style={{ padding: '3px 4px' }}>{getVal(row, ["CĂN CƯỚC", "CCCD", "SỐ CCCD"]).replace(/^['"]+|['"]+$/g, '')}</td></tr>
                          <tr><td style={{ padding: '3px 4px' }}>Ngành đào tạo</td><td style={{ padding: '3px 4px' }}>{ownNganh}</td></tr>
                          <tr><td style={{ padding: '3px 4px' }}>Hệ / Hình thức đào tạo</td><td style={{ padding: '3px 4px' }}>{getVal(row, ["HỆ ĐÀO TẠO"])} / {getVal(row, ["HÌNH THỨC ĐÀO TẠO"])}</td></tr>
                          <tr><td style={{ padding: '3px 4px' }}>Đối tượng đầu vào</td><td style={{ padding: '3px 4px' }}>{getVal(row, ["ĐỐI TƯỢNG ĐẦU VÀO", "ĐỐI TƯỢNG"])}</td></tr>
                          <tr><td style={{ padding: '3px 4px' }}>Khu vực / Đối tượng ưu tiên</td><td style={{ padding: '3px 4px' }}>{getVal(row, ["KHU VỰC ƯU TIÊN"])} / {getVal(row, ["ĐỐI TƯỢ ƯU TIÊN", "ĐỐI TƯỢNG ƯU TIÊN"])}</td></tr>
                          {/* Cùng bug/cách sửa với khung "thamdinh-info-box" phía trên — xem chú
                              thích đầy đủ ở đó (ĐÃ VÁ BUG THẬT: crash trắng trang do gọi
                              .toFixed(2) trên "scores.uuTien" gốc, undefined khi hasScore:false). */}
                          <tr><td style={{ padding: '3px 4px' }}>Điểm cộng / Điểm ưu tiên</td><td style={{ padding: '3px 4px' }}>{scores.diemCong ?? 0}đ / {(scores.uuTien ?? 0).toFixed(2)}đ</td></tr>
                          <tr>
                            <td style={{ padding: '3px 4px' }}>{scores.type === 'thpt' ? 'Điểm trúng tuyển / Tổ hợp / Điểm chuẩn' : scores.dtbLabel}</td>
                            <td style={{ padding: '3px 4px', fontWeight: 'bold' }}>
                              {/* Cùng nội dung "+PV: x" với khung điểm phía trên — xem chú thích ở đó. */}
                              {scores.type === 'thpt'
                                ? (scores.hasScore ? `${scores.finalTotalScore} (${scores.bestCombo}${scores.diemPhongVan > 0 ? `, +PV: ${scores.diemPhongVan}` : ''}) / ${scores.diemChuanLabel}` : 'Chưa đủ dữ liệu điểm')
                                : `${scores.dtbVal} / ${scores.diemChuanText}`}
                            </td>
                          </tr>
                          <tr><td style={{ padding: '3px 4px' }}>Trạng thái thẩm định</td><td style={{ padding: '3px 4px' }}>{state}</td></tr>
                          <tr><td style={{ padding: '3px 4px' }}>Hồ sơ</td><td style={{ padding: '3px 4px' }}>{missing.length > 0 ? `Thiếu: ${missing.join(', ')}` : 'Đã nộp đủ hồ sơ hợp lệ'}</td></tr>
                        </tbody>
                      </table>

                      <p className="mt-4" style={{ fontStyle: 'italic' }}>(Tiêu ngữ / chữ ký chính thức sẽ được bổ sung sau)</p>

                      <div className="row mt-5 d-flex flex-nowrap">
                        <div className="col-6"></div>
                        <div className="col-6 text-center">
                          <p className="fst-italic mb-1">......, ngày ..... tháng ..... năm {today.getFullYear()}</p>
                          <h6 className="fw-bold mb-4 pb-4">CÁN BỘ THẨM ĐỊNH</h6>
                          <p className="mt-5 pt-3 fst-italic">(Ký và ghi rõ họ tên)</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-warning" disabled={btnMissingDisabled} onClick={() => triggerMissing(row)}>{btnMissingText}</button>
                  <button className="btn btn-primary" disabled={btnSaveDisabled} onClick={() => triggerSave(row)}>{btnSaveText}</button>
                  {/* ĐÃ SỬA: đổi màu cam khi hồ sơ đã duyệt vừa có cập nhật (coCapNhatSauDuyet)
                      — tái sử dụng ĐÚNG action Duyệt cũ (triggerApprove/action 'trungTuyen'),
                      bấm lại sẽ ghi đè trạng thái về "Đã duyệt" sạch, không cần action/modal
                      con riêng nào khác. */}
                  <button className={`btn ${coCapNhatSauDuyet ? 'btn-warning text-dark' : 'btn-success'}`} disabled={btnApproveDisabled} onClick={() => triggerApprove(row)}>{btnApproveText}</button>
                  {/* ĐÃ THÊM: nút "Xuất file" — tự dựng menu xổ xuống bằng React state (dự án
                      không có Bootstrap JS/react-bootstrap, xem ghi chú exportMenuOpen phía trên).
                      Menu mở LÊN TRÊN (dropup, bottom:100%) vì nút nằm ở footer cuối modal. */}
                  <div className="dropdown position-relative" ref={exportMenuRef}>
                    <button className="btn btn-outline-dark dropdown-toggle" type="button"
                      onClick={() => setExportMenuOpen(o => !o)} disabled={pdfExporting}>
                      {pdfExporting ? '⏳ Đang tạo PDF...' : '📤 Xuất file'}
                    </button>
                    {exportMenuOpen && (
                      <ul className="dropdown-menu show" style={{ position: 'absolute', bottom: '100%', top: 'auto', right: 0, left: 'auto' }}>
                        <li>
                          <button type="button" className="dropdown-item" onClick={() => { setExportMenuOpen(false); handlePdfExport('pdf-thamdinh-content', `PhieuThamDinh_${generateMaSV(row)}.pdf`); }}>
                            Bảng thông tin sơ bộ (PDF)
                          </button>
                        </li>
                        <li>
                          <button type="button" className="dropdown-item" disabled={!hasTranscript || exportMutation.isPending}
                            title={!hasTranscript ? 'Cần quét bảng điểm trước' : ''}
                            onClick={() => { setExportMenuOpen(false); handleExportTemplate(row, targetNganh, scanEntry); }}>
                            {exportMutation.isPending ? '⏳ Đang tạo Excel...' : 'Bảng kết quả và đối sánh (Excel)'}
                          </button>
                        </li>
                        {/* ĐÃ THÊM (Ký điện tử Pha 1 — Bước 3, bổ sung theo phản hồi): mục
                            xuất GBTT cho đúng 1 hồ sơ đang mở trong modal chi tiết — chỉ bật
                            khi hồ sơ đã ở trạng thái "Đã duyệt" (đúng điều kiện chung với nút
                            hàng loạt), tránh nhầm khi chưa duyệt trúng tuyển. */}
                        <li>
                          <button type="button" className="dropdown-item" disabled={state !== "Đã duyệt"}
                            title={state !== "Đã duyệt" ? 'Chỉ xuất được khi hồ sơ đã duyệt trúng tuyển' : ''}
                            onClick={() => { setExportMenuOpen(false); openGbttPreviewSingle(row); }}>
                            📄 Giấy báo trúng tuyển (gửi ký)
                          </button>
                        </li>
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {batchPreview && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={(e) => { if (e.target === e.currentTarget) setBatchPreview(null); }}>
          <div className="modal-dialog modal-lg modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title fw-bold">{batchTitleMap[batchPreview.type]}</h5>
                <button type="button" className="btn-close" onClick={() => setBatchPreview(null)}></button>
              </div>
              <div className="modal-body">
                {batchPreview.excludedNote && (
                  <div className="alert alert-warning small py-2">⚠️ {batchPreview.excludedNote}</div>
                )}
                <div className="small text-muted mb-2">Sẽ thực hiện thao tác cho <b>{batchPreview.validRows.length}</b> hồ sơ sau:</div>
                <div className="table-responsive" style={{ maxHeight: 320 }}>
                  <table className="table table-sm table-bordered mb-0">
                    <thead className="table-light">
                      <tr><th>STT</th><th>Họ tên</th><th className="text-center">Điểm/tổ hợp</th><th>Hồ sơ</th>{batchPreview.type === 'luucsdl' && <th>Trạng thái</th>}</tr>
                    </thead>
                    <tbody>
                      {batchPreview.validRows.map((row, i) => {
                        const missing = getMissingDocs(row);
                        const score = getBestScore(row);
                        return (
                          <tr key={getRowKey(row) || i}>
                            <td className="text-center">{i + 1}</td>
                            <td>{getVal(row, ["TÊN SINH VIÊN", "HỌ VÀ TÊN"])}</td>
                            <td className="text-center">{score.empty ? score.message : `${score.value} (${score.combo || score.unit})`}</td>
                            <td>{missing.length > 0 ? <span className="badge bg-warning text-dark">Thiếu: {missing.join(', ')}</span> : <span className="badge bg-success">Đủ hồ sơ</span>}</td>
                            {batchPreview.type === 'luucsdl' && <td>{getEffectiveState(row)}</td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {batchPreview.type === 'luucsdl' && (
                  <div className="alert alert-danger small mt-3 mb-0 fw-bold">🔎 Vui lòng kiểm tra kỹ lưỡng danh sách trên trước khi lưu vào CSDL — thao tác này sẽ ghi dữ liệu chính thức.</div>
                )}
                {/* ĐÃ THÊM (Ký điện tử Pha 1 — Bước 3, bật thật ở Bước 4): bảng thứ 2
                    "chọn người ký" — KHÔNG dùng wizard nhiều bước, chỉ nhúng thêm 1 bảng
                    ngay dưới bảng sinh viên trong CÙNG modal xác nhận này. */}
                {batchPreview.type === 'gbtt' && (
                  <>
                    {/* ĐÃ THÊM (theo yêu cầu — placeholder "Ngày xuất giấy báo" (in nghiêng)
                        và "Tháng nhập học" trong mẫu GBTT): 2 giá trị CHUNG cho CẢ ĐỢT xuất
                        này (áp dụng như nhau cho mọi sinh viên trong danh sách ở trên), KHÔNG
                        phải nhập riêng từng sinh viên — xem noiDung/NGAY_XUAT_GIAY_BAO/
                        THANG_NHAP_HOC ở action taoYeuCauKyGBTT (Quanlysv.gs). Chữ in nghiêng
                        của "Ngày xuất giấy báo" do định dạng có sẵn của placeholder trong mẫu
                        Doc quyết định (xem chú thích ở Quanlysv.gs), không cần chỉnh gì ở đây. */}
                    <div className="row g-2 mt-3">
                      <div className="col-sm-4">
                        <label className="form-label small fw-bold mb-1">Ngày xuất giấy báo *</label>
                        <input
                          type="date" className="form-control form-control-sm"
                          value={ngayXuatGiayBao}
                          onChange={(e) => setNgayXuatGiayBao(e.target.value)}
                        />
                        <div className="form-text small">
                          In vào mẫu dạng: <i>ngày {String(new Date(ngayXuatGiayBao + 'T00:00:00').getDate()).padStart(2, '0')} tháng {String(new Date(ngayXuatGiayBao + 'T00:00:00').getMonth() + 1).padStart(2, '0')} năm {new Date(ngayXuatGiayBao + 'T00:00:00').getFullYear()}</i>
                        </div>
                      </div>
                      {/* ĐÃ THÊM (theo yêu cầu — placeholder "Số quyết định" trong mẫu GBTT):
                          gõ tự do đúng dạng "xx/năm" (VD "01/2026", "012/2025") — xem
                          SO_QUYET_DINH_REGEX khai báo đầu file + noiDung/SO_QUYET_DINH ở
                          action taoYeuCauKyGBTT (Quanlysv.gs). Viền đỏ + dòng cảnh báo nhỏ khi
                          đã gõ nhưng sai định dạng, để người dùng biết ngay không cần đợi bấm
                          "Xác nhận" mới báo lỗi. */}
                      <div className="col-sm-4">
                        <label className="form-label small fw-bold mb-1">Số quyết định *</label>
                        <input
                          type="text" className={`form-control form-control-sm ${soQuyetDinh && !SO_QUYET_DINH_REGEX.test(soQuyetDinh.trim()) ? 'is-invalid' : ''}`}
                          value={soQuyetDinh}
                          onChange={(e) => setSoQuyetDinh(e.target.value)}
                          placeholder="VD: 01/2026"
                        />
                        {soQuyetDinh && !SO_QUYET_DINH_REGEX.test(soQuyetDinh.trim()) ? (
                          <div className="invalid-feedback">Sai định dạng — cần đúng dạng "xx/năm" (VD: 01/2026, 012/2025).</div>
                        ) : (
                          <div className="form-text small">In vào mẫu dạng: {soQuyetDinh.trim() || '(chưa điền)'}</div>
                        )}
                      </div>
                      <div className="col-sm-4">
                        <label className="form-label small fw-bold mb-1">Tháng nhập học *</label>
                        {/* ĐÃ SỬA (theo phản hồi — bug hiện "tháng NaN năm 9/2026"): trước đây
                            dùng <input type="month">, nhưng Firefox/Safari cũ KHÔNG hỗ trợ input
                            này — trình duyệt tự rớt về Ô NHẬP CHỮ TỰ DO, cho gõ bất kỳ gì (VD
                            "9/2026") thay vì bắt buộc đúng định dạng "YYYY-MM". Đổi hẳn sang 2
                            <select> Tháng/Năm (xem thangNH/namNH ở chỗ khai báo state) để KHÔNG
                            PHỤ THUỘC trình duyệt nào cả. */}
                        <div className="d-flex gap-2">
                          <select
                            className="form-select form-select-sm"
                            value={thangNH}
                            onChange={(e) => setThangNH(e.target.value)}
                          >
                            <option value="">-- Tháng --</option>
                            {/* value ĐỆM SỐ 0 (VD "09") để ghép ra đúng "YYYY-MM" — xem
                                thangNhapHoc = `${namNH}-${thangNH}` ở chỗ khai báo state. */}
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(t => (
                              <option key={t} value={String(t).padStart(2, '0')}>Tháng {t}</option>
                            ))}
                          </select>
                          <select
                            className="form-select form-select-sm"
                            value={namNH}
                            onChange={(e) => setNamNH(e.target.value)}
                          >
                            <option value="">-- Năm --</option>
                            {[namHienTaiNH - 1, namHienTaiNH, namHienTaiNH + 1, namHienTaiNH + 2].map(y => (
                              <option key={y} value={y}>{y}</option>
                            ))}
                          </select>
                        </div>
                        {thangNhapHoc && (
                          <div className="form-text small">
                            In vào mẫu dạng: tháng {parseInt(thangNH, 10)} năm {namNH}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* ĐÃ THÊM (Ký điện tử Pha 2 — Bước 3): chọn chế độ ký cho CẢ ĐỢT xuất này
                        — xem chú thích đầy đủ tại chỗ khai báo state cheDoKy phía trên. */}
                    <div className="mt-3">
                      <label className="form-label small fw-bold mb-1 d-block">Chế độ ký</label>
                      <div className="btn-group" role="group">
                        <input type="radio" className="btn-check" name="cheDoKy" id="cheDoKyTuanTu"
                          checked={cheDoKy === 'TUAN_TU'} onChange={() => setCheDoKy('TUAN_TU')} />
                        <label className="btn btn-outline-primary btn-sm" htmlFor="cheDoKyTuanTu">
                          Tuần tự — đúng thứ tự chức danh
                        </label>
                        <input type="radio" className="btn-check" name="cheDoKy" id="cheDoKySongSong"
                          checked={cheDoKy === 'SONG_SONG'} onChange={() => setCheDoKy('SONG_SONG')} />
                        <label className="btn btn-outline-primary btn-sm" htmlFor="cheDoKySongSong">
                          Song song — ai ký trước cũng được
                        </label>
                      </div>
                      <div className="form-text small">
                        {cheDoKy === 'SONG_SONG'
                          ? 'Mọi người ký cùng lúc nhận được thông báo ngay, ký theo thứ tự bất kỳ — hoàn tất khi người CUỐI CÙNG ký xong.'
                          : 'Mỗi lần chỉ 1 người tới lượt, đúng thứ tự chức danh đã chọn ở bảng dưới — người sau chỉ nhận thông báo khi người trước đã ký.'}
                      </div>
                    </div>
                    <ChonNguoiKyModal loaiTaiLieu="GBTT" giaTri={nguoiKyGBTT} onChange={setNguoiKyGBTT} />
                    <div className="alert alert-info small mt-3 mb-0">
                      ℹ️ Người ký sẽ nhận email thông báo ngay khi tới lượt (xem chế độ ký ở
                      trên) — cũng có thể tự vào menu tài khoản → "Hồ sơ chờ ký" để xem/ký mà
                      không cần đợi email.
                    </div>
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setBatchPreview(null)} disabled={gbttMutation.isPending}>Hủy bỏ</button>
                {/* ĐÃ SỬA: khoá thêm nút "Xác nhận" khi thiếu/sai Ngày xuất giấy báo/Tháng
                    nhập học/Số quyết định (3 ô) — cùng cách làm như điều kiện "chưa chọn
                    người ký" sẵn có. */}
                <button
                  className="btn btn-primary"
                  onClick={executeBatchAction}
                  disabled={
                    approveMutation.isPending || missingMutation.isPending || saveMutation.isPending || gbttMutation.isPending ||
                    (batchPreview.type === 'gbtt' && (
                      nguoiKyGBTT.filter(nk => nk.chon && nk.email).length === 0 ||
                      !ngayXuatGiayBao || !thangNhapHoc || !SO_QUYET_DINH_REGEX.test(soQuyetDinh.trim())
                    ))
                  }
                  title={
                    batchPreview.type === 'gbtt' && nguoiKyGBTT.filter(nk => nk.chon && nk.email).length === 0
                      ? 'Cần chọn ít nhất 1 người ký'
                      : batchPreview.type === 'gbtt' && (!ngayXuatGiayBao || !thangNhapHoc || !SO_QUYET_DINH_REGEX.test(soQuyetDinh.trim()))
                      ? 'Cần điền Ngày xuất giấy báo, Tháng nhập học và Số quyết định đúng định dạng "xx/năm"'
                      : undefined
                  }
                >
                  {gbttMutation.isPending ? '⏳ Đang tạo yêu cầu ký...' : 'Xác nhận'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ĐÃ THÊM — MODAL "Xuất DS tuỳ chọn": mở từ sự kiện "thamdinh:export-custom" (bắn từ
          menu tài khoản, App.jsx). Danh sách cột = danhSachCotKhaDung (cột gốc trong dữ liệu
          + các cột tính toán, trong đó có DANH SÁCH HỒ SƠ THIẾU). */}
      {customExportOpen && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setCustomExportOpen(false); }}>
          <div className="modal-dialog modal-lg modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title fw-bold">📊 Xuất danh sách tuỳ chọn</h5>
                <button type="button" className="btn-close" onClick={() => setCustomExportOpen(false)}></button>
              </div>
              <div className="modal-body">
                <p className="text-muted small">
                  Chọn các cột muốn xuất — áp dụng cho <b>{filteredData.length}</b> hồ sơ đang
                  hiển thị theo bộ lọc hiện tại (giống "Xuất Excel"). Mục <b>"DANH SÁCH HỒ SƠ
                  THIẾU"</b> liệt kê đúng các giấy tờ hệ thống đang xác định là thiếu của từng
                  sinh viên, cách nhau bởi dấu ";".
                </p>
                <div className="d-flex gap-2 mb-3">
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setCotDaChon(new Set(danhSachCotKhaDung))}>
                    Chọn tất cả
                  </button>
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setCotDaChon(new Set())}>
                    Bỏ chọn tất cả
                  </button>
                </div>
                <div className="row">
                  {danhSachCotKhaDung.map((k) => (
                    <div className="col-md-6 mb-2" key={k}>
                      <div className="form-check">
                        <input
                          type="checkbox" className="form-check-input" id={`cotxuat-${k}`}
                          checked={cotDaChon.has(k)}
                          onChange={() => toggleCot(k)}
                        />
                        <label className="form-check-label" htmlFor={`cotxuat-${k}`}>
                          {k}
                          {COT_TINH_TOAN.includes(k) && (
                            <span className="badge bg-info-subtle text-info ms-1" style={{ fontSize: 10 }}>tính toán</span>
                          )}
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-outline-secondary" onClick={() => setCustomExportOpen(false)}>Huỷ</button>
                <button className="btn btn-success fw-bold" onClick={handleExportCustom}>
                  <i className="bi bi-file-earmark-excel me-1"></i>Xuất Excel ({cotDaChon.size} cột)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ThamDinhPage;