import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Swal from 'sweetalert2';
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
import './ThamDinh.css';

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

  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(fmtDateInput(sevenDaysAgo));
  const [dateTo, setDateTo] = useState(fmtDateInput(today));
  const [filterNganh, setFilterNganh] = useState('');
  const [filterDoiTuong, setFilterDoiTuong] = useState('');
  const [filterHoSo, setFilterHoSo] = useState('');
  const [sortBy, setSortBy] = useState('date_desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [viewingIndex, setViewingIndex] = useState(null); // ĐÃ SỬA (Pha 5): lưu vị trí trong filteredData thay vì row trực tiếp, để làm nút Trước/Sau
  const [crossCheckNganh, setCrossCheckNganh] = useState(''); // "khảo sát ngành khác" — rỗng = dùng đúng ngành đăng ký thật
  const [scanCache, setScanCache] = useState(loadScanCache); // { [scanKey]: { transcriptJSON, compareResult, scanFileName } }
  const fileInputRef = useRef(null);
  const [batchPreview, setBatchPreview] = useState(null);

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
      if (filterNganh && getVal(row, ["NGÀNH", "NGÀNH ĐÀO TẠO"]) !== filterNganh) return false;
      if (filterDoiTuong && getVal(row, ["ĐỐI TƯỢNG ĐẦU VÀO", "ĐỐI TƯỢNG"]) !== filterDoiTuong) return false;
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
      const statusRank = { "Đang chờ duyệt": 1, "Mới bổ sung": 2, "Đã báo thiếu": 3, "Đã duyệt": 4 };
      result.sort((a, b) => (statusRank[getEffectiveState(a)] || 5) - (statusRank[getEffectiveState(b)] || 5));
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawData, dateFrom, dateTo, filterNganh, filterDoiTuong, filterHoSo, search, sortBy, localOverrides]);

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
    setSearch(''); setDateFrom(''); setDateTo(''); setFilterNganh(''); setFilterDoiTuong('');
    setFilterHoSo(''); setSortBy('date_desc'); setCurrentPage(1);
  };

  const toggleSelect = (key, checked) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (checked) next.add(key); else next.delete(key);
      return next;
    });
  };

  const stateBadge = (state) => {
    if (state === "Đã duyệt") return { text: "✅ Đã duyệt", cls: "btn-success" };
    if (state === "Đã báo thiếu") return { text: "⚠️ Đã yêu cầu BS", cls: "btn-warning" };
    if (state === "Mới bổ sung") return { text: "🔄 Mới bổ sung", cls: "btn-info" };
    return { text: "🔍 Thẩm định", cls: "btn-outline-primary" };
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

  const buildTrungTuyenPayload = (row) => ({
    soCCCD: getVal(row, ["CĂN CƯỚC", "CCCD", "SỐ CCCD"]).replace(/^['"]+|['"]+$/g, ''),
    hoTen: getVal(row, ["TÊN SINH VIÊN", "HỌ VÀ TÊN"]),
    nganh: getVal(row, ["NGÀNH", "NGÀNH ĐÀO TẠO"]),
    ngaySinh: getVal(row, ["NGÀNH SINH", "NGÀY SINH"]),
    ngayCapNhat: nowVnDate(),
  });

  const triggerApprove = async (row) => {
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
        if (state === "Đã duyệt") reason = "đã duyệt";
        else if (state === "Đã báo thiếu") reason = "đã báo thiếu";
        else if (getMissingTienQuyet(row).length > 0) reason = "thiếu hồ sơ tiên quyết";
      } else if (type === 'baothieu') {
        if (state === "Đã duyệt") reason = "đã duyệt";
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
          <h4 className="text-uppercase fw-bold" style={{ color: '#037683' }}>
            <i className="bi bi-clipboard-check me-2"></i>Ban Thẩm định hồ sơ
          </h4>
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

      <div className="row mb-3 g-2">
        <div className="col-6 col-md-3">
          <div className="card bg-primary text-white border-0 shadow-sm h-100">
            <div className="card-body py-2 px-3">
              <div className="small opacity-75">📁 Tổng hồ sơ ({today.getFullYear()})</div>
              <h3 className="mb-0">{kpi.total}</h3>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body py-2 px-3">
              <div className="small text-muted">📑 Đủ hồ sơ</div>
              <h3 className="mb-0" style={{ color: '#2980b9' }}>{kpi.du}</h3>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body py-2 px-3">
              <div className="small text-muted">⚠️ Thiếu hồ sơ</div>
              <h3 className="mb-0" style={{ color: '#c0392b' }}>{kpi.thieu}</h3>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body py-2 px-3">
              <div className="small text-muted">✅ Đã duyệt</div>
              <h3 className="mb-0" style={{ color: '#2e7d32' }}>{kpi.daDuyet}</h3>
            </div>
          </div>
        </div>
      </div>

      <div className="card border-0 shadow-sm mb-3">
        <div className="card-body py-2">
          <div className="row g-2 align-items-end">
            <div className="col-md-3 col-xl-2">
              <label className="form-label small mb-1">Tìm nhanh</label>
              <input type="search" className="form-control form-control-sm" placeholder="🔎 Mã SV / Căn cước / Họ và tên..."
                value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} />
            </div>
            <div className="col-6 col-md-2 col-xl-1">
              <label className="form-label small mb-1">Từ ngày</label>
              <input type="date" className="form-control form-control-sm" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setCurrentPage(1); }} />
            </div>
            <div className="col-6 col-md-2 col-xl-1">
              <label className="form-label small mb-1">Đến ngày</label>
              <input type="date" className="form-control form-control-sm" value={dateTo} onChange={e => { setDateTo(e.target.value); setCurrentPage(1); }} />
            </div>
            <div className="col-6 col-md-2 col-xl-2">
              <label className="form-label small mb-1">Ngành đào tạo</label>
              <select className="form-select form-select-sm" value={filterNganh} onChange={e => { setFilterNganh(e.target.value); setCurrentPage(1); }}>
                <option value="">-- Tất cả ngành --</option>
                {nganhOptions.map(ng => <option key={ng} value={ng}>{ng}</option>)}
              </select>
            </div>
            <div className="col-6 col-md-2 col-xl-2">
              <label className="form-label small mb-1">Đối tượng đầu vào</label>
              <select className="form-select form-select-sm" value={filterDoiTuong} onChange={e => { setFilterDoiTuong(e.target.value); setCurrentPage(1); }}>
                <option value="">-- Tất cả --</option>
                {doiTuongOptions.map(dt => <option key={dt} value={dt}>{dt}</option>)}
              </select>
            </div>
            <div className="col-6 col-md-1 col-xl-1">
              <button className="btn btn-sm btn-outline-secondary w-100" onClick={resetFilters} title="Xoá bộ lọc">
                <i className="bi bi-x-circle"></i>
              </button>
            </div>
            <div className="col-6 col-md-3 col-xl-2">
              <label className="form-label small mb-1">Trạng thái hồ sơ</label>
              <select className="form-select form-select-sm" value={filterHoSo} onChange={e => { setFilterHoSo(e.target.value); setCurrentPage(1); }}>
                <option value="">-- Tất cả --</option>
                <option value="Đủ">Đủ hồ sơ</option>
                <option value="Thiếu">Thiếu hồ sơ</option>
              </select>
            </div>
            <div className="col-6 col-md-3 col-xl-1">
              <label className="form-label small mb-1">Sắp xếp</label>
              <select className="form-select form-select-sm" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                <option value="date_desc">Ngày nộp mới nhất</option>
                <option value="date_asc">Ngày nộp cũ nhất</option>
                <option value="score_desc">Điểm cao nhất</option>
                <option value="status">Theo trạng thái</option>
              </select>
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
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0" style={{ fontSize: '12px' }}>
            <thead className="table-light">
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
                <th>TRẠNG THÁI HỒ SƠ</th>
                <th style={{ width: 120 }} className="text-center">THẨM ĐỊNH</th>
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
                const missing = getMissingDocs(row);
                const cccdStr = getVal(row, ["CĂN CƯỚC", "CCCD", "SỐ CCCD"]).replace(/^['"]+|['"]+$/g, '');
                const score = getBestScore(row);
                const badge = stateBadge(state);

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
                      <button className={`btn btn-sm ${badge.cls}`} onClick={() => { setViewingIndex(index); setCrossCheckNganh(''); }}>{badge.text}</button>
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
        const btnApproveDisabled = isSurveying || isDuyet || isBaoThieu || missingTQ.length > 0 || approveMutation.isPending;
        const btnApproveText = isSurveying ? '🔒 Tắt Khảo sát để Thao tác'
          : approveMutation.isPending ? '⏳ Đang xuất Biên nhận...'
          : isDuyet ? '✅ Hồ sơ đã duyệt'
          : missingTQ.length > 0 ? '❌ Thiếu HS Tiên Quyết'
          : '✅ DUYỆT TRÚNG TUYỂN';

        const btnMissingDisabled = isSurveying || isDuyet || isBaoThieu || missingMutation.isPending;
        const btnMissingText = isSurveying ? '🔒 Tắt Khảo sát để Thao tác' : missingMutation.isPending ? '⏳ Đang xử lý...' : isBaoThieu ? '⚠️ Đã yêu cầu bổ sung HS' : '⚠️ Y/C BỔ SUNG HS';

        const btnSaveDisabled = isSurveying || saved || saveMutation.isPending;
        const btnSaveText = isSurveying ? '🔒 Tắt Khảo sát để Thao tác' : saveMutation.isPending ? '⏳ Đang lưu...' : saved ? '💾 Đã lưu hồ sơ vào CSDL' : '💾 LƯU VÀO CSDL';

        return (
          <div className="modal show d-block thamdinh-detail-modal" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={(e) => { if (e.target === e.currentTarget) setViewingIndex(null); }}>
            <div className="modal-dialog modal-lg modal-dialog-scrollable">
              <div className="modal-content">
                <div className="modal-header">
                  <button className="btn btn-sm btn-outline-secondary me-2" disabled={viewingIndex === 0}
                    onClick={() => { setViewingIndex(i => i - 1); setCrossCheckNganh(''); }}>‹ Trước</button>
                  <h5 className="modal-title fw-bold flex-grow-1 text-center">Hồ sơ: {getVal(row, ["TÊN SINH VIÊN", "HỌ VÀ TÊN"])}</h5>
                  <button className="btn btn-sm btn-outline-secondary ms-2" disabled={viewingIndex >= filteredData.length - 1}
                    onClick={() => { setViewingIndex(i => i + 1); setCrossCheckNganh(''); }}>Sau ›</button>
                  <button type="button" className="btn-close ms-3" onClick={() => setViewingIndex(null)}></button>
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

                  {/* Panel điểm chi tiết — port từ calculateAndRenderScores() */}
                  <div className="row g-2 mb-2">
                    <div className="col-4">
                      <div className="border rounded p-2 text-center h-100">
                        <div className="small text-muted">Điểm cộng / Điểm ưu tiên</div>
                        <div className="fw-bold">{scores.diemCong ?? 0}đ / {(scores.uuTien ?? 0).toFixed ? scores.uuTien.toFixed(2) : scores.uuTien}đ</div>
                      </div>
                    </div>
                    {scores.type === 'thpt' ? (
                      <>
                        <div className="col-4">
                          <div className="border rounded p-2 text-center h-100" style={{ background: '#e8f5e9', borderColor: '#81c784' }}>
                            <div className="small" style={{ color: '#2e7d32' }}>ĐIỂM TRÚNG TUYỂN / TỔ HỢP</div>
                            {scores.hasScore ? (
                              <div className="fw-bold" style={{ color: '#2e7d32' }}>{scores.finalTotalScore} <span className="small text-muted">({scores.bestCombo})</span></div>
                            ) : <div className="small fst-italic text-muted">Chưa đủ dữ liệu điểm</div>}
                          </div>
                        </div>
                        <div className="col-4">
                          <div className="border rounded p-2 text-center h-100">
                            <div className="small text-muted">Điểm chuẩn (15đ)</div>
                            {scores.hasScore ? (
                              <div className={`fw-bold ${scores.dat ? 'text-success' : 'text-danger'}`}>{scores.dat ? 'ĐẠT' : 'TRƯỢT'}</div>
                            ) : <div className="text-muted">-</div>}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="col-4">
                          <div className="border rounded p-2 text-center h-100">
                            <div className="small text-muted">{scores.dtbLabel}</div>
                            <div className="fw-bold">{scores.dtbVal}</div>
                          </div>
                        </div>
                        <div className="col-4">
                          <div className="border rounded p-2 text-center h-100" style={{ background: '#e8f5e9', borderColor: '#81c784' }}>
                            <div className="small" style={{ color: '#2e7d32' }}>Điểm chuẩn</div>
                            <div className="fw-bold" style={{ color: '#2e7d32' }}>{scores.diemChuanText}</div>
                          </div>
                        </div>
                      </>
                    )}
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

                  <div className="alert alert-secondary small mb-0">
                    Tính năng quét bảng điểm AI / đối sánh CTĐT / xuất template chưa có ở bước này.
                  </div>

                  <hr className="my-3" />
                  <h6 className="fw-bold text-primary">📑 Quét bảng điểm AI / Đối sánh CTĐT</h6>

                  <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
                    <input type="file" accept="image/*,application/pdf" ref={fileInputRef} style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files[0]; e.target.value = ''; handleScanFile(row, f); }} />
                    <button className="btn btn-sm btn-outline-info" disabled={scanMutation.isPending} onClick={() => fileInputRef.current?.click()}>
                      {scanMutation.isPending ? '⏳ Đang trích xuất...' : hasTranscript ? '🔄 Quét lại bảng điểm' : '📷 Quét bảng điểm (ảnh/PDF)'}
                    </button>
                    {scanEntry.scanFileName && <span className="small text-muted">File: {scanEntry.scanFileName}</span>}
                    {hasTranscript && (
                      <button className="btn btn-sm btn-outline-primary" disabled={compareMutation.isPending}
                        onClick={() => handleCompare(row, targetNganh, scanEntry.transcriptJSON)}>
                        {compareMutation.isPending ? '⏳ Đang đối sánh...' : '⚖️ Phân tích & Đối sánh CTĐT'}
                      </button>
                    )}
                    {hasTranscript && (
                      <button className="btn btn-sm btn-outline-success" disabled={exportMutation.isPending}
                        onClick={() => handleExportTemplate(row, targetNganh, scanEntry)}>
                        {exportMutation.isPending ? '⏳ Đang tạo Excel...' : '📥 Xuất Template Excel'}
                      </button>
                    )}
                  </div>

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
                </div>
                <div className="modal-footer">
                  <button className="btn btn-warning" disabled={btnMissingDisabled} onClick={() => triggerMissing(row)}>{btnMissingText}</button>
                  <button className="btn btn-primary" disabled={btnSaveDisabled} onClick={() => triggerSave(row)}>{btnSaveText}</button>
                  <button className="btn btn-success" disabled={btnApproveDisabled} onClick={() => triggerApprove(row)}>{btnApproveText}</button>
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