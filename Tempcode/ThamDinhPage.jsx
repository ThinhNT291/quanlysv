import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Swal from 'sweetalert2';
import html2pdf from 'html2pdf.js';
import {
  fetchThamDinhData, duyetTrungTuyen, baoThieuHoSo, luuKetQuaThamDinh, banGiaoDaoTao,
  scanTranscriptImage, compareCurriculumAI, exportThamDinhTemplate
} from '../../api/studentApi';
import {
  getVal, normalizeText, getRowKey, generateMaSV, getBestScore,
  getRawScoreNumber, getRawDateNumber, getMissingDocs, getMissingTienQuyet, getAppState,
  calculateScores, isSafeDriveUrl, getCandidateScanKey
} from './thamDinhHelpers';
import { DICT_NGANH } from './thamDinhConfig';
import DateRangePicker from './DateRangePicker';
import './ThamDinh.css';

// ĐÃ THÊM: hồ sơ đến từ trang "Thu hồ sơ nhập học" (kênh "Thu hồ sơ trực tiếp") đã trúng
// tuyển sẵn khi tạo, KHÔNG đi qua luồng thẩm định/duyệt của Xét tuyển — dùng để (1) ẩn/hiện
// mặc định trong bảng, (2) khoá các nút Duyệt/Báo thiếu để không ai lỡ tay ghi đè trạng
// thái "Đã trúng tuyển" của hồ sơ này thành "Đã duyệt"/"Đã báo thiếu".
const KENH_TRUC_TIEP = "Thu hồ sơ trực tiếp";

// ===================================================================
// TRANG BAN THẨM ĐỊNH — Pha 3 (KPI/bộ lọc/bảng, chỉ đọc) + Pha 4 (Duyệt trúng
// tuyển, Báo thiếu hồ sơ, Lưu CSDL, Bàn giao Đào tạo, thao tác hàng loạt) + Pha 5
// (quét bảng điểm AI, đối sánh CTĐT, xuất template Excel) — port từ
// thamdinh_-_app.js (vanilla JS cũ), giữ nguyên toàn bộ luật nghiệp vụ.
// ===================================================================

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
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [viewingIndex, setViewingIndex] = useState(null); // ĐÃ SỬA (Pha 5): lưu vị trí trong filteredData thay vì row trực tiếp, để làm nút Trước/Sau
  const [crossCheckNganh, setCrossCheckNganh] = useState(''); // "khảo sát ngành khác" — rỗng = dùng đúng ngành đăng ký thật
  const [scanCache, setScanCache] = useState(loadScanCache); // { [scanKey]: { transcriptJSON, compareResult, scanFileName } }
  const fileInputRef = useRef(null);
  const [batchPreview, setBatchPreview] = useState(null);
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

  const toggleSelect = (key, checked) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (checked) next.add(key); else next.delete(key);
      return next;
    });
  };

  // ĐÃ SỬA: bỏ icon emoji đầu chữ trong cột THẨM ĐỊNH của bảng datalist theo yêu cầu
  // (chỉ còn chữ, cột không bị chật thêm bởi icon nữa).
  // ĐÃ THÊM: nếu hồ sơ đã bấm "Lưu vào CSDL" (saved = true, xem getEffectiveSaved) thì
  // ưu tiên hiển thị "Đã lưu" trước mọi trạng thái khác — kiểm tra saved TRƯỚC state.
  const stateBadge = (state, saved) => {
    if (saved) return { text: "Đã lưu", cls: "btn-secondary" };
    // ĐÃ THÊM: hồ sơ Thu hồ sơ trực tiếp (Nhập học) — nhãn riêng, tách rõ khỏi luồng thẩm định.
    if (state === "Đã trúng tuyển") return { text: "Đã trúng tuyển (NH)", cls: "btn-dark" };
    if (state === "Đã duyệt") return { text: "Đã duyệt", cls: "btn-success" };
    if (state === "Đã báo thiếu") return { text: "Đã yêu cầu BS", cls: "btn-warning" };
    if (state === "Mới bổ sung") return { text: "Mới bổ sung", cls: "btn-info" };
    return { text: "Thẩm định", cls: "btn-outline-primary" };
  };

  const approveMutation = useMutation({ mutationFn: duyetTrungTuyen });
  const missingMutation = useMutation({ mutationFn: baoThieuHoSo });
  const saveMutation = useMutation({ mutationFn: luuKetQuaThamDinh });
  const daoTaoMutation = useMutation({ mutationFn: banGiaoDaoTao });

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

  // Đọc file ảnh/PDF -> base64, ảnh thì resize trước (giống hệt bản cũ: max chiều
  // rộng 1200px, nén JPEG 80%) để giảm dung lượng gửi lên AI.
  const handleScanFile = (row, file) => {
    if (!file) return;
    const scanKey = getCandidateScanKey(row);
    updateScanCache(scanKey, { compareResult: null }); // quét bảng điểm mới -> kết quả đối sánh cũ không còn đúng nữa

    const send = async (base64String, mimeType) => {
      try {
        const result = await scanMutation.mutateAsync({ imageBase64: base64String, mimeType });
        updateScanCache(scanKey, { transcriptJSON: result, scanFileName: file.name, compareResult: null });
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Lỗi quét bảng điểm', text: err.message });
      }
    };

    if (file.type === 'application/pdf') {
      const reader = new FileReader();
      reader.onloadend = () => send(reader.result.split(',')[1], 'application/pdf');
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
        send(canvas.toDataURL('image/jpeg', 0.8).split(',')[1], 'image/jpeg');
      };
    }
  };

  const handleCompare = async (row, targetNganh, transcriptJSON) => {
    if (!targetNganh) { Swal.fire({ icon: 'warning', title: 'Chưa có ngành', text: 'Chưa có dữ liệu ngành đào tạo!' }); return; }
    const scanKey = getCandidateScanKey(row);
    try {
      const result = await compareMutation.mutateAsync({ nganh: targetNganh, transcript: transcriptJSON });
      updateScanCache(scanKey, { compareResult: result });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Lỗi đối sánh', text: err.message });
    }
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
    const confirm = await Swal.fire({ icon: 'question', title: 'Duyệt trúng tuyển?', text: `Duyệt trúng tuyển cho thí sinh: ${hoTen}?`, showCancelButton: true, confirmButtonText: 'Xác nhận', cancelButtonText: 'Huỷ' });
    if (!confirm.isConfirmed) return;

    try {
      const result = await approveMutation.mutateAsync([buildTrungTuyenPayload(row)]);
      Swal.fire({ icon: 'success', title: 'Thành công', text: 'Duyệt trúng tuyển thành công!' });
      setOverride(getRowKey(row), { appState: 'Đã duyệt' });
      if (result?.pdfUrl) window.open(result.pdfUrl, '_blank');
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

    setBatchPreview({ type, validRows, excludedNote });
  };

  const executeBatchAction = async () => {
    if (!batchPreview) return;
    const { type, validRows } = batchPreview;

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

  const batchTitleMap = { duyet: "Xác nhận DUYỆT TRÚNG TUYỂN hàng loạt", baothieu: "Xác nhận YÊU CẦU BỔ SUNG HỒ SƠ hàng loạt", luucsdl: "Xác nhận LƯU VÀO CSDL hàng loạt" };

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
          <span className="small text-muted">
            {isLoading ? '⏳ Đang tải dữ liệu...' : dataUpdatedAt ? `✔ Đồng bộ: ${new Date(dataUpdatedAt).toLocaleTimeString('vi-VN')}` : ''}
          </span>
          <button className="btn btn-sm btn-dark" onClick={triggerSyncDaoTao} disabled={daoTaoMutation.isPending}>
            {daoTaoMutation.isPending ? '⏳ Đang gửi...' : '🚀 Bàn giao Đào tạo'}
          </button>
        </div>
      </div>

      {isError && <div className="alert alert-danger">Lỗi tải dữ liệu: {error?.message}</div>}

      {/* ĐÃ SỬA: cả khối 4 thẻ thống kê giờ chỉ chiếm nửa bề ngang trang (col-md-6),
          nửa còn lại để trống bên phải theo yêu cầu (đang để dành, chưa quyết định
          đặt gì vào). 4 thẻ bên trong vẫn giữ đúng tỉ lệ 1/4 NHƯNG tính theo nửa
          trang đó — nên bề ngang thực tế mỗi thẻ co lại còn một nửa so với trước.
          Chữ trong từng thẻ (nhãn + số) đều in đậm thêm (fw-bold). */}
      <div className="row mb-3 g-2">
        <div className="col-md-6">
          <div className="row g-2">
            <div className="col-6 col-md-3">
              <div className="card bg-primary text-white border-0 shadow-sm h-100">
                <div className="card-body py-2 px-3">
                  <div className="small opacity-75 fw-bold">📁 Tổng hồ sơ ({today.getFullYear()})</div>
                  <h3 className="mb-0 fw-bold">{kpi.total}</h3>
                </div>
              </div>
            </div>
            <div className="col-6 col-md-3">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-body py-2 px-3">
                  <div className="small text-muted fw-bold">📑 Đủ hồ sơ</div>
                  <h3 className="mb-0 fw-bold" style={{ color: '#2980b9' }}>{kpi.du}</h3>
                </div>
              </div>
            </div>
            <div className="col-6 col-md-3">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-body py-2 px-3">
                  <div className="small text-muted fw-bold">⚠️ Thiếu hồ sơ</div>
                  <h3 className="mb-0 fw-bold" style={{ color: '#c0392b' }}>{kpi.thieu}</h3>
                </div>
              </div>
            </div>
            <div className="col-6 col-md-3">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-body py-2 px-3">
                  <div className="small text-muted fw-bold">✅ Đã duyệt</div>
                  <h3 className="mb-0 fw-bold" style={{ color: '#2e7d32' }}>{kpi.daDuyet}</h3>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* col-md-6 còn lại cố ý để trống — chờ nội dung sau */}
      </div>

      <div className="card border-0 shadow-sm mb-3">
        <div className="card-body py-2">
          {/* ĐÃ SỬA: bề rộng từng ô giờ dùng class riêng (td-col-*, định nghĩa trong
              ThamDinh.css) thay vì col-md-N/col-xl-N của Bootstrap — vì các tỉ lệ yêu
              cầu (2/3, x1.2, x0.5, x1.5) không khớp số nguyên cột 12 phần của Bootstrap
              nên tính % trực tiếp cho đúng tỉ lệ. Ở màn hẹp (< md) vẫn dùng col-6 của
              Bootstrap để xếp 2 ô/hàng như cũ. Nhãn (label) mỗi ô được in đậm thêm. */}
          <div className="row g-2 align-items-end thamdinh-filter-row">
            <div className="col-6 td-col-quick">
              <label className="form-label small fw-bold mb-1">Tìm nhanh</label>
              <input type="search" className="form-control form-control-sm" placeholder="🔎 Mã SV / CCCD / Họ tên..."
                value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} />
            </div>
            {/* ĐÃ SỬA: gộp "Từ ngày"/"Đến ngày" thành 1 ô "Thời gian" — bấm mở lịch tháng,
                bấm 2 lần chọn 2 mốc của khoảng (không cần đúng thứ tự), kiểu chọn ngày
                quen thuộc của các trang đặt phòng khách sạn. Xem DateRangePicker.jsx. */}
            <div className="col-6 td-col-thoigian">
              <label className="form-label small fw-bold mb-1">Thời gian</label>
              <DateRangePicker
                from={dateFrom}
                to={dateTo}
                onChange={(lo, hi) => { setDateFrom(lo); setDateTo(hi); setCurrentPage(1); }}
              />
            </div>
            <div className="col-6 td-col-nganh">
              <label className="form-label small fw-bold mb-1">Ngành đào tạo</label>
              <select className="form-select form-select-sm" value={filterNganh} onChange={e => { setFilterNganh(e.target.value); setCurrentPage(1); }}>
                <option value="">-- Tất cả ngành --</option>
                {nganhOptions.map(ng => <option key={ng} value={ng}>{ng}</option>)}
              </select>
            </div>
            <div className="col-6 td-col-doituong">
              <label className="form-label small fw-bold mb-1">Đối tượng đầu vào</label>
              <select className="form-select form-select-sm" value={filterDoiTuong} onChange={e => { setFilterDoiTuong(e.target.value); setCurrentPage(1); }}>
                <option value="">-- Tất cả --</option>
                {doiTuongOptions.map(dt => <option key={dt} value={dt}>{dt}</option>)}
              </select>
            </div>
            {/* ĐÃ SỬA: nút "Xoá bộ lọc" trước đây chỉ có icon (bi-x-circle) -> trên máy
                không tải được font icon thì trông như 1 ô trắng trống trơn. Giờ luôn có
                chữ "Xóa lọc" rõ ràng; màu mặc định trung tính (không nổi bật), tự động
                chuyển cam nhạt khi isFilterActive = true (đang có ít nhất 1 điều kiện lọc
                khác mặc định) — xem 2 class .thamdinh-reset-btn/-active trong CSS. */}

            <div className="col-6 td-col-hoso-status">
              <label className="form-label small fw-bold mb-1">Trạng thái hồ sơ</label>
              <select className="form-select form-select-sm" value={filterHoSo} onChange={e => { setFilterHoSo(e.target.value); setCurrentPage(1); }}>
                <option value="">-- Tất cả --</option>
                <option value="Đủ">Đủ hồ sơ</option>
                <option value="Thiếu">Thiếu hồ sơ</option>
              </select>
            </div>
            {/* ĐÃ SỬA: lọc theo Trạng thái thẩm định — không còn bằng bề rộng ô Trạng thái hồ
                sơ nữa (2 tỉ lệ khác nhau ở đợt sửa này), nên tách thành class riêng
                td-col-thamdinh-status (trước đây dùng chung td-col-status). */}
            <div className="col-6 td-col-thamdinh-status">
              <label className="form-label small fw-bold mb-1">Trạng thái thẩm định</label>
              <select className="form-select form-select-sm" value={filterThamDinh} onChange={e => { setFilterThamDinh(e.target.value); setCurrentPage(1); }}>
                <option value="">-- Tất cả --</option>
                <option value="Đang chờ duyệt">Đang chờ duyệt</option>
                <option value="Mới bổ sung">Mới bổ sung</option>
                <option value="Đã báo thiếu">Đã báo thiếu</option>
                <option value="Đã duyệt">Đã duyệt</option>
                <option value="Đã trúng tuyển">Đã trúng tuyển (NHTT)</option>
              </select>
            </div>
            <div className="col-6 td-col-sort">
              <label className="form-label small fw-bold mb-1">Sắp xếp</label>
              <select className="form-select form-select-sm" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                <option value="date_desc">Ngày nộp mới nhất</option>
                <option value="date_asc">Ngày nộp cũ nhất</option>
                <option value="score_desc">Điểm cao nhất</option>
                <option value="status">Theo trạng thái</option>
              </select>
            </div>
            {/* ĐÃ THÊM: nút hiện/ẩn hồ sơ kênh "Thu hồ sơ trực tiếp" (trang Nhập học) —
                mặc định TẮT (ẩn), bấm vào để hiện thêm. Chỉ lọc lại filteredData (đã tải
                sẵn trong rawData) nên bảng cập nhật ngay, không cần gọi lại server. */}
            <div className="col-6 td-col-tructiep">
              <label className="form-label small fw-bold mb-1 d-block">&nbsp;</label>
              <button
                type="button"
                className={`btn btn-sm w-100 ${showTrucTiep ? 'btn-info text-white' : 'btn-outline-secondary'}`}
                onClick={() => { setShowTrucTiep(v => !v); setCurrentPage(1); }}
                title="Hiện/ẩn hồ sơ thu trực tiếp (đã trúng tuyển)"
              >
                <i className="bi bi-person-check me-1"></i>NHTT
              </button>
            </div>
                        <div className="col-6 td-col-reset">
              <button
                className={`btn btn-sm w-100 ${isFilterActive ? 'thamdinh-reset-btn-active' : 'thamdinh-reset-btn'}`}
                onClick={resetFilters}
                title="Xóa bộ lọc, quay về mặc định"
              >
                <i className="bi bi-x-circle me-1"></i>Xóa lọc
              </button>
            </div>
          </div>
        </div>
      </div>

      {selectedKeys.size > 0 && (
        <div className="card border-0 shadow-sm mb-3 bg-light">
          <div className="card-body py-2 d-flex flex-wrap align-items-center gap-2">
            <span className="fw-bold small">Đã chọn {selectedKeys.size} hồ sơ:</span>
            <button className="btn btn-sm btn-success" onClick={() => openBatchPreview('duyet')}>✅ Duyệt hàng loạt</button>
            <button className="btn btn-sm btn-warning" onClick={() => openBatchPreview('baothieu')}>⚠️ Báo thiếu hàng loạt</button>
            <button className="btn btn-sm btn-primary" onClick={() => openBatchPreview('luucsdl')}>💾 Lưu CSDL hàng loạt</button>
            <button className="btn btn-sm btn-outline-secondary ms-auto" onClick={() => setSelectedKeys(new Set())}>Bỏ chọn hết</button>
          </div>
        </div>
      )}

      <div className="card border-0 shadow-sm">
        {/* ĐÃ SỬA: chỉ đổi class thead từ "table-light" mặc định của Bootstrap sang
            "thamdinh-list-thead" riêng (đậm hơn 1 tý, xem CSS) để KHÔNG ảnh hưởng các
            bảng table-light khác trong modal chi tiết (bảng tổ hợp điểm, bảng quét AI...). */}
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0" style={{ fontSize: '12px' }}>
            <thead className="thamdinh-list-thead">
              <tr>
                <th style={{ width: 34 }}></th>
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
                const badge = stateBadge(state, saved);

                return (
                  <tr key={key || index} className={selectedKeys.has(key) ? 'table-primary' : ''}>
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
                        <span className="badge bg-warning text-dark" style={{ whiteSpace: 'normal', textAlign: 'left' }}>Thiếu: {missing.join(', ')}</span>
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
            <select className="form-select form-select-sm" style={{ width: 90 }} value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}>
              <option value={10}>10 / trang</option>
              <option value={20}>20 / trang</option>
              <option value={50}>50 / trang</option>
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
        const btnApproveDisabled = isSurveying || isDuyet || isBaoThieu || isTrucTiep || missingTQ.length > 0 || approveMutation.isPending;
        const btnApproveText = isSurveying ? '🔒 Tắt Khảo sát để Thao tác'
          : approveMutation.isPending ? '⏳ Đang xuất Biên nhận...'
          : isTrucTiep ? '— Ngoài luồng thẩm định —'
          : isDuyet ? 'Đã duyệt'
          : missingTQ.length > 0 ? '❌ Thiếu HS Tiên Quyết'
          : '✅ DUYỆT TRÚNG TUYỂN';

        const btnMissingDisabled = isSurveying || isDuyet || isBaoThieu || isTrucTiep || missingMutation.isPending;
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
                          <th style={{ width: 230 }}>Mã SV (tự sinh)</th>
                          {/* ĐÃ SỬA: thêm class "masv-value" -> in đậm, màu đỏ boóc-đô (xem ThamDinh.css) */}
                          <td className="masv-value">{generateMaSV(row)}</td>
                        </tr>
                        <tr><th>Số CCCD</th><td>{getVal(row, ["CĂN CƯỚC", "CCCD", "SỐ CCCD"]).replace(/^['"]+|['"]+$/g, '')}</td></tr>
                        <tr><th>Hệ / Hình thức đào tạo</th><td>{getVal(row, ["HỆ ĐÀO TẠO"])} / {getVal(row, ["HÌNH THỨC ĐÀO TẠO"])}</td></tr>
                        <tr><th>Đối tượng đầu vào</th><td>{getVal(row, ["ĐỐI TƯỢNG ĐẦU VÀO", "ĐỐI TƯỢNG"])}</td></tr>
                        <tr><th>Khu vực / Đối tượng ưu tiên</th><td>{getVal(row, ["KHU VỰC ƯU TIÊN"])} / {getVal(row, ["ĐỐI TƯỢ ƯU TIÊN", "ĐỐI TƯỢNG ƯU TIÊN"])}</td></tr>
                        {/* ĐÃ CHUYỂN từ khung "Panel điểm chi tiết" phía dưới lên đây, ngay dưới dòng
                            Khu vực/Đối tượng ưu tiên, theo yêu cầu. */}
                        <tr><th>Điểm cộng / Điểm ưu tiên</th><td>{scores.diemCong ?? 0}đ / {(scores.uuTien ?? 0).toFixed ? scores.uuTien.toFixed(2) : scores.uuTien}đ</td></tr>
                        <tr><th>Trạng thái thẩm định</th><td>{state}</td></tr>
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
                              <a href={linkHoSo} target="_blank" rel="noopener noreferrer">📎 Mở hồ sơ Drive</a>
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
                      </div>
                    </div>
                    <div className="col-4">
                      {scores.type === 'thpt' ? (
                        <div className="border rounded p-2 text-center h-100" style={{ background: '#e8f5e9', borderColor: '#81c784' }}>
                          <div className="small" style={{ color: '#2e7d32' }}>Điểm TT / Tổ hợp / Điểm chuẩn</div>
                          {scores.hasScore ? (
                            <>
                          <div className="fw-bold" style={{ color: '#2e7d32' }}>
                              {scores.finalTotalScore} <span className="small text-muted">({scores.bestCombo})</span>
                              <span className="small text-muted"> / 15</span>
                          </div>

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
                        <h6 className="fw-bold" style={{ color: '#2e7d32' }}>📋 Kết quả đối sánh sơ bộ (ngành: {targetNganh})</h6>
                        <div className="table-responsive mb-2" style={{ maxHeight: 200 }}>
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
                          <tr><td style={{ padding: '3px 4px' }}>Mã SV (tự sinh)</td><td style={{ padding: '3px 4px', fontWeight: 'bold' }}>{generateMaSV(row)}</td></tr>
                          <tr><td style={{ padding: '3px 4px' }}>Số CCCD</td><td style={{ padding: '3px 4px' }}>{getVal(row, ["CĂN CƯỚC", "CCCD", "SỐ CCCD"]).replace(/^['"]+|['"]+$/g, '')}</td></tr>
                          <tr><td style={{ padding: '3px 4px' }}>Ngành đào tạo</td><td style={{ padding: '3px 4px' }}>{ownNganh}</td></tr>
                          <tr><td style={{ padding: '3px 4px' }}>Hệ / Hình thức đào tạo</td><td style={{ padding: '3px 4px' }}>{getVal(row, ["HỆ ĐÀO TẠO"])} / {getVal(row, ["HÌNH THỨC ĐÀO TẠO"])}</td></tr>
                          <tr><td style={{ padding: '3px 4px' }}>Đối tượng đầu vào</td><td style={{ padding: '3px 4px' }}>{getVal(row, ["ĐỐI TƯỢNG ĐẦU VÀO", "ĐỐI TƯỢNG"])}</td></tr>
                          <tr><td style={{ padding: '3px 4px' }}>Khu vực / Đối tượng ưu tiên</td><td style={{ padding: '3px 4px' }}>{getVal(row, ["KHU VỰC ƯU TIÊN"])} / {getVal(row, ["ĐỐI TƯỢ ƯU TIÊN", "ĐỐI TƯỢNG ƯU TIÊN"])}</td></tr>
                          <tr><td style={{ padding: '3px 4px' }}>Điểm cộng / Điểm ưu tiên</td><td style={{ padding: '3px 4px' }}>{scores.diemCong ?? 0}đ / {(scores.uuTien ?? 0).toFixed ? scores.uuTien.toFixed(2) : scores.uuTien}đ</td></tr>
                          <tr>
                            <td style={{ padding: '3px 4px' }}>{scores.type === 'thpt' ? 'Điểm trúng tuyển / Tổ hợp / Điểm chuẩn' : scores.dtbLabel}</td>
                            <td style={{ padding: '3px 4px', fontWeight: 'bold' }}>
                              {scores.type === 'thpt'
                                ? (scores.hasScore ? `${scores.finalTotalScore} (${scores.bestCombo}) / 15` : 'Chưa đủ dữ liệu điểm')
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
                  <button className="btn btn-success" disabled={btnApproveDisabled} onClick={() => triggerApprove(row)}>{btnApproveText}</button>
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
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setBatchPreview(null)}>Hủy bỏ</button>
                <button className="btn btn-primary" onClick={executeBatchAction} disabled={approveMutation.isPending || missingMutation.isPending || saveMutation.isPending}>Xác nhận</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ThamDinhPage;