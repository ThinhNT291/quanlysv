import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import './XetTuyen.css';
// ĐÃ THÊM: dùng chung đúng 1 hàm fetchConfig() với studentApi.js (AdmissionsPage/
// SettingsPage đang dùng, đã chạy ổn) — thay vì tự viết lại 1 bản riêng ở đây. Cả 2
// nơi giờ gọi CÙNG 1 chỗ, cùng 1 cách xác thực (GET + idToken/sessionToken).
import { fetchConfig, fetchXetTuyenHeaders } from '../../api/studentApi';
import CanXacNhanBadge from '../../components/DinhDanh/CanXacNhanBadge'; // ĐÃ THÊM (Pha 1·D1)
import { chuanHoaNgaySinhImport } from '../../utils/ngaySinh';
import { taiFileMauExcel } from '../../Utils/ExcelTemplate';

const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzkp4Nqb3kP3DjEGBucxLKPDgQamDMO8mQOOCg71_a_iHqnmuGWjU54e-QvxNGzELN9/exec";

const DICT_KHU_VUC = { "KV 01": 0.75, "KV 02-NT": 0.5, "KV 02": 0.25, "KV 03": 0 };
const DICT_DOI_TUONG = { "Không ưu tiên": 0, "ĐT 01": 2, "ĐT 02": 2, "ĐT 03": 2, "ĐT 04": 2, "ĐT 05": 1, "ĐT 06": 1, "ĐT 07": 1 };

const DICT_TO_HOP = {
    "A00": ["diem_toan", "diem_vatli", "diem_hoahoc"], "A01": ["diem_toan", "diem_vatli", "diem_tienganh"],
    "A02": ["diem_toan", "diem_vatli", "diem_sinhhoc"], "C00": ["diem_nguvan", "diem_lichsu", "diem_dialy"],
    "C01": ["diem_nguvan", "diem_toan", "diem_vatli"], "C02": ["diem_nguvan", "diem_toan", "diem_hoahoc"],
    "C03": ["diem_nguvan", "diem_toan", "diem_lichsu"], "C04": ["diem_nguvan", "diem_toan", "diem_dialy"],
    "D01": ["diem_toan", "diem_nguvan", "diem_tienganh"], "D04": ["diem_nguvan", "diem_toan", "diem_tiengtrung"],
    "D09": ["diem_toan", "diem_lichsu", "diem_tienganh"], "D10": ["diem_toan", "diem_dialy", "diem_tienganh"],
    "D14": ["diem_nguvan", "diem_lichsu", "diem_tienganh"], "D15": ["diem_nguvan", "diem_dialy", "diem_tienganh"],
    "D45": ["diem_nguvan", "diem_dialy", "diem_tiengtrung"], "D65": ["diem_nguvan", "diem_lichsu", "diem_tiengtrung"],
    "X01": ["diem_nguvan", "diem_toan", "diem_gdktpl"], "X02": ["diem_toan", "diem_nguvan", "diem_tinhoc"],
    "X06": ["diem_toan", "diem_vatli", "diem_tinhoc"], "X10": ["diem_toan", "diem_hoahoc", "diem_tinhoc"],
    "X25": ["diem_toan", "diem_tienganh", "diem_gdktpl"], "X26": ["diem_toan", "diem_tienganh", "diem_tinhoc"],
    "X37": ["diem_toan", "diem_gdktpl", "diem_tiengtrung"]
};

const DICT_NGANH = {
    "CNTT - ĐHKTS": ["A00", "A01", "A02", "C01", "C02", "D01", "X02", "X06", "X10", "X26"],
    "Quản trị kinh doanh": ["A00", "A01", "D01", "D09", "D10", "D45", "D65", "X01", "X25", "X37"],
    "Ngôn ngữ Anh": ["A01", "C03", "C04", "D01", "D09", "D10", "D14", "D15", "X25", "X26"],
    "Ngôn ngữ Trung Quốc": ["A01", "C00", "C03", "C04", "D01", "D04", "D45", "D65", "X01", "X37"],
    "Quản trị dịch vụ du lịch và lữ hành": ["A01", "C00", "C03", "C04", "D01", "D04", "D45", "D65", "X25", "X37"]
};

const SUBJECTS_UI = [
    { id: 'toan', label: 'TOÁN' }, { id: 'vatli', label: 'VẬT LÍ' }, { id: 'hoahoc', label: 'HÓA HỌC' },
    { id: 'sinhhoc', label: 'SINH HỌC' }, { id: 'nguvan', label: 'NGỮ VĂN' }, { id: 'lichsu', label: 'LỊCH SỬ' },
    { id: 'dialy', label: 'ĐỊA LÝ' }, { id: 'tienganh', label: 'TIẾNG ANH' }, { id: 'tiengtrung', label: 'TIẾNG TRUNG' },
    { id: 'tinhoc', label: 'TIN HỌC' }, { id: 'gdktpl', label: 'GDKTPL' }
];

const HK_FIELDS = SUBJECTS_UI.reduce((acc, subj) => {
    acc[`diem_${subj.id}_hk1_11`] = '';
    acc[`diem_${subj.id}_hk1_12`] = '';
    acc[`diem_${subj.id}_hk2_12`] = '';
    return acc;
}, {});

const DICT_HO_SO = {
    chung: [
        { id: "doc_syll", name: "Sơ yếu lý lịch", short: "SƠ YẾU LÝ LỊCH", optional: false },
        { id: "doc_cccd", name: "Bản sao ID", short: "BẢN SAO CCCD", optional: false },
        { id: "doc_anhthe", name: "Ảnh thẻ", short: "ẢNH THẺ", optional: false },
        // ĐÃ THÊM "genderOnly" — cờ dùng để sau này TỰ ẨN/HIỆN giấy tờ này theo giới tính
        // 1 khi cột "Giới tính" được bổ sung vào form/Goc01 (hiện CHƯA có cột này ở đâu
        // cả, nên isDocApplicable() bên dưới coi cờ này là VÔ HIỆU/bỏ qua khi chưa có dữ
        // liệu giới tính — hành vi y hệt như trước giờ, luôn hiện + luôn tính vào phần
        // "không bắt buộc" cho MỌI hồ sơ). Khi thêm cột giới tính thật, chỉ cần gán giá
        // trị vào formData.gioitinh (đúng 2 giá trị "Nam"/"Nữ", khớp genderOnly bên
        // dưới) là cơ chế ẩn/hiện sẽ tự chạy đúng, không cần sửa gì thêm ở đây.
        { id: "doc_nvqs", name: "Giấy chuyển NVQS (với nam)", short: "GIẤY NVQS", optional: true, genderOnly: "Nam" }
    ],
    tien_quyet: {
        "Tốt nghiệp THPT": [ { id: "doc_phieu_dk", name: "Phiếu đăng ký dự tuyển", short: "PHIẾU ĐĂNG KÝ" }, { id: "doc_bang_thpt", name: "Bản sao Bằng THPT/Giấy báo điểm", short: "BẰNG THPT" }, { id: "doc_hocba_thpt", name: "Bản sao Học bạ THPT", short: "HỌC BẠ THPT" } ],
        // ĐÃ SỬA (rà soát đồng bộ 2 bản sao DICT_HO_SO — bản này và bản trong
        // thamDinhConfig.js PHẢI đổi tên cùng lúc, vì cùng phải khớp tên cột thật trên
        // Goc01): "Bản sao Bằng Trung cấp"/"Bảng điểm Trung cấp" -> thêm hậu tố "(sau
        // 2022)" để phân biệt rõ với bộ hồ sơ "trước 2022" (vốn đã có tên riêng). Giữ
        // nguyên "short" (chỉ dùng hiển thị gọn + đối chiếu import, không phải tên cột
        // thật ghi vào Goc01).
        "Tốt nghiệp Trung cấp sau 2022": [ { id: "doc_phieu_dk", name: "Phiếu đăng ký dự tuyển", short: "PHIẾU ĐĂNG KÝ" }, { id: "doc_bang_tc", name: "Bản sao bằng trung cấp (sau 2022)", short: "BẰNG TC" }, { id: "doc_diem_tc", name: "Bảng điểm trung cấp (sau 2022)", short: "ĐIỂM TC" }, { id: "doc_ktvh_thpt", name: "Bằng THPT/GCN đủ KL KTVH THPT", short: "GCN KTVH" } ],
        "Tốt nghiệp Cao đẳng": [ { id: "doc_phieu_dk", name: "Phiếu đăng ký dự tuyển", short: "PHIẾU ĐĂNG KÝ" }, { id: "doc_bang_cd", name: "Bằng Cao đẳng", short: "BẰNG CĐ" }, { id: "doc_diem_cd", name: "Bảng điểm Cao đẳng", short: "ĐIỂM CĐ" } ],
        "Tốt nghiệp Đại học": [ { id: "doc_phieu_dk", name: "Phiếu đăng ký dự tuyển", short: "PHIẾU ĐĂNG KÝ" }, { id: "doc_bang_dh", name: "Bằng Đại học", short: "BẰNG ĐH" }, { id: "doc_diem_dh", name: "Bảng điểm Đại học", short: "ĐIỂM ĐH" } ],
        "Tốt nghiệp Trung cấp trước 2022": [ { id: "doc_phieu_dk", name: "Phiếu đăng ký dự tuyển", short: "PHIẾU ĐĂNG KÝ" }, { id: "doc_gcn_gdpt", name: "GCN hoàn thành CT GDPT", short: "GCN GDPT" }, { id: "doc_bang_tc_truoc", name: "Bản sao Bằng Trung cấp trước 2022", short: "BẰNG TC (<2022)" }, { id: "doc_diem_tc_truoc", name: "Bảng điểm Trung cấp trước 2022", short: "ĐIỂM TC (<2022)" } ],
        "Trung học nghề": [ { id: "doc_phieu_dk", name: "Phiếu đăng ký dự tuyển", short: "PHIẾU ĐĂNG KÝ" }, { id: "doc_gcn_gdpt", name: "GCN hoàn thành CT GDPT", short: "GCN GDPT" }, { id: "doc_bang_tc_truoc", name: "Bản sao Bằng Trung cấp trước 2022", short: "BẰNG TC (<2022)" }, { id: "doc_diem_tc_truoc", name: "Bảng điểm Trung cấp trước 2022", short: "ĐIỂM TC (<2022)" } ]
    }
};

const ALL_HO_SO_DOCS = [...DICT_HO_SO.chung, ...Object.values(DICT_HO_SO.tien_quyet).flat()]
    .filter((doc, i, arr) => arr.findIndex(d => d.id === doc.id) === i);

// ĐÃ THÊM: cổng ẩn/hiện + không bắt buộc theo giới tính cho các giấy tờ có cờ "genderOnly"
// (hiện chỉ có "Giấy chuyển NVQS (với nam)") — dựng SẴN cho ngày thêm cột "Giới tính" vào
// form/Goc01 (xem chú thích tại DICT_HO_SO.chung). Miễn `data.gioitinh` còn rỗng/chưa có
// (đúng thực trạng hiện tại), hàm này LUÔN trả về true — tức mọi giấy tờ vẫn hiện/tính như
// trước giờ, không đổi hành vi gì cả cho tới khi cột Giới tính thật sự tồn tại và có dữ
// liệu.
const isDocApplicable = (doc, data) => {
    if (!doc.genderOnly) return true;
    if (!data || !data.gioitinh) return true;
    return data.gioitinh === doc.genderOnly;
};

// ĐÃ THÊM: điểm chuẩn nhánh "Tốt nghiệp THPT" khác nhau theo Phương thức xét tuyển
// (Điểm thi THPT = 15, Điểm học bạ = 16, Điểm học bạ (TBTS 2025) = 15) — dùng cho bảng
// xem trước lúc nhập tay. GIỮ ĐỒNG BỘ với DIEM_CHUAN_THPT bên thamDinhHelpers.js (dùng
// cho chấm điểm chính thức ở Thẩm định) — đổi mức điểm chuẩn thì phải đổi ở CẢ 2 nơi.
const DIEM_CHUAN_THPT = { THI_THPT: 15, HOC_BA: 16, HOC_BA_2025: 15 };

const initialFormState = {
  hoten: '', cccd: '', ngaysinh: '', khoa: '', nganh: '', khuvucuutien: '', doituonguutien: '', 
  doituongdauvao: '', namtt: '', hedaotao: '', htdaotao: '', link_folder: '', 
  has_giay_uutien: false, giay_uutien: '', 
  loai_diem: '', time_goc: '', 
  diem_toan: '', diem_vatli: '', diem_hoahoc: '', diem_sinhhoc: '', diem_nguvan: '', diem_lichsu: '', 
  diem_dialy: '', diem_tienganh: '', diem_tiengtrung: '', diem_tinhoc: '', diem_gdktpl: '', 
  ...HK_FIELDS, 
  diem_tb_he4: '', diem_tb_he10: '', diem_cong: '', diem_chuan: '', 
  ...ALL_HO_SO_DOCS.reduce((acc, doc) => ({ ...acc, [doc.id]: false }), {})
};

const getSubjectAverage = (subjId, data) => {
    if (data.loai_diem === 'HOC_BA_2025') {
        const v1 = parseFloat(data[`diem_${subjId}_hk1_11`]);
        const v2 = parseFloat(data[`diem_${subjId}_hk1_12`]);
        const v3 = parseFloat(data[`diem_${subjId}_hk2_12`]);
        if (!isNaN(v1) && !isNaN(v2) && !isNaN(v3)) {
            return Math.round(((v1 + v2 + v3) / 3) * 100) / 100;
        }
        return 0; 
    }
    return parseFloat(data[`diem_${subjId}`]) || 0;
};

const compareIsoDates = (a, b) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return NaN;
    return a.localeCompare(b);
};
const todayIsoDate = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const addYearsIso = (isoDate, years) => {
    const [y, m, d] = isoDate.split('-').map(Number);
    const dt = new Date(y + years, m - 1, d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const getToken = () => {
    const user = JSON.parse(localStorage.getItem('tuyensinh_user'));
    // ĐÃ VÁ BUG: thiếu "|| ''" ở cuối -> khi tài khoản nội bộ (không có token Google
    // nào cả) gọi hàm này, kết quả là `null` (JS). Object null này khi đưa vào
    // `URLSearchParams.append('idToken', null)` (dùng ở handlePushToCloud và đoạn
    // check trùng import) bị TỰ ĐỘNG CHUYỂN THÀNH CHUỖI "null" (có nội dung, không
    // rỗng) — backend nhận idToken="null", tưởng có token Google thật nên cố xác
    // minh qua Google -> luôn thất bại -> báo "Phiên đăng nhập đã hết hạn." dù
    // sessionToken tài khoản nội bộ vẫn hợp lệ và được gửi kèm ngay sau đó.
    return user?.token || user?.credential || user?.idToken || localStorage.getItem('gg_id_token') || '';
};

// ĐÃ THÊM: lấy phiên đăng nhập tài khoản nội bộ (sessionToken) — trước đây trang này
// chỉ gửi idToken (Google) lên các action AI/tra cứu, tài khoản nội bộ không dùng
// được scanDocument/searchOldRecord. Backend giờ nhận cả 2, gửi kèm cho chắc.
const getSessionToken = () => {
    const user = JSON.parse(localStorage.getItem('tuyensinh_user'));
    return user?.sessionToken || '';
};

const getUserEmail = () => {
    const user = JSON.parse(localStorage.getItem('tuyensinh_user'));
    return user?.username || user?.email || "Unknown";
}

const loadSession = (key, defaultVal) => {
    const stored = sessionStorage.getItem(key);
    if (stored) { try { return JSON.parse(stored); } catch(e) { return defaultVal; } }
    return defaultVal;
};

const XetTuyenPage = () => {
  const [formData, setFormData] = useState(() => loadSession('xt_form', initialFormState));
  const [dataList, setDataList] = useState(() => loadSession('xt_list', [])); 
  const [isEditMode, setIsEditMode] = useState(() => loadSession('xt_isEdit', false));

  useEffect(() => { sessionStorage.setItem('xt_form', JSON.stringify(formData)); }, [formData]);
  useEffect(() => { sessionStorage.setItem('xt_list', JSON.stringify(dataList)); }, [dataList]);
  useEffect(() => { sessionStorage.setItem('xt_isEdit', JSON.stringify(isEditMode)); }, [isEditMode]);

  const [admissionResult, setAdmissionResult] = useState(null);
  const [isPushing, setIsPushing] = useState(false);

  const [sysConfig, setSysConfig] = useState({
      Nganh: [], KhoaNhapHoc: [], DoiTuongUT: [], KhuVucUT: [],
      NamXetTuyen: [], DoiTuongDauVao: [], HeDaoTao: [], HinhThucDaoTao: []
  });

  const fileInputRef = useRef(null);
  const importFileRef = useRef(null);
  const [scanStatus, setScanStatus] = useState("");

  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importStatus, setImportStatus] = useState("");

  const closeSearchModal = () => {
      setIsSearchModalOpen(false);
      setSearchKeyword("");
      setSearchResults([]);
  };

  useEffect(() => {
    const loadConfig = async () => {
        try {
            // Gọi thẳng fetchConfig() dùng chung với studentApi.js — thay cho việc tự viết
            // riêng 1 bản fetch ở đây (trước đó có 2 bản khác nhau: 1 GET tôi đề xuất chưa
            // test, 1 POST bạn tự thêm để tránh bug thiếu idToken — giờ hợp nhất về 1 nơi).
            const data = await fetchConfig();
            if (data) {
                setSysConfig({
                    Nganh: data.Nganh?.length ? data.Nganh : Object.keys(DICT_NGANH),
                    KhoaNhapHoc: data.KhoaNhapHoc?.length ? data.KhoaNhapHoc : ["01", "02"],
                    DoiTuongUT: data.DoiTuongUT?.length ? data.DoiTuongUT : Object.keys(DICT_DOI_TUONG),
                    KhuVucUT: data.KhuVucUT?.length ? data.KhuVucUT : Object.keys(DICT_KHU_VUC),
                    NamXetTuyen: data.NamXetTuyen?.length ? data.NamXetTuyen : ["2026", "2027"],
                    DoiTuongDauVao: data.DoiTuongDauVao?.length ? data.DoiTuongDauVao : Object.keys(DICT_HO_SO.tien_quyet),
                    HeDaoTao: data.HeDaoTao?.length ? data.HeDaoTao : ["Đại học chính quy", "Cao đẳng"],
                    HinhThucDaoTao: data.HinhThucDaoTao?.length ? data.HinhThucDaoTao : ["Chính quy đại trà"]
                });
            }
        } catch (e) { console.error("Lỗi tải cấu hình:", e); }
    };
    loadConfig();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            if (isImportModalOpen) { setIsImportModalOpen(false); setImportFile(null); setImportStatus(""); } 
            else if (isSearchModalOpen) { closeSearchModal(); }
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isImportModalOpen, isSearchModalOpen]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    let finalValue = type === 'checkbox' ? checked : value;
    
    if (name === 'has_giay_uutien') {
        setFormData(prev => ({...prev, has_giay_uutien: checked, giay_uutien: checked ? prev.giay_uutien : ''}));
        return;
    }

    // Logic tick chọn 1 trong 3 dạng mượt mà (Toggle qua lại)
    if (name === 'check_thi_thpt') { setFormData(prev => ({...prev, loai_diem: checked ? 'THI_THPT' : ''})); return; }
    if (name === 'check_hoc_ba') { setFormData(prev => ({...prev, loai_diem: checked ? 'HOC_BA' : ''})); return; }
    if (name === 'check_hoc_ba_2025') { setFormData(prev => ({...prev, loai_diem: checked ? 'HOC_BA_2025' : ''})); return; }

    if (name.startsWith('diem_') && type === 'text') {
        finalValue = finalValue.replace(',', '.');
        if (finalValue !== '') {
            const num = Number(finalValue);
            if (isNaN(num) || num < 0) return; 
            if (name === 'diem_tb_he4' && num > 4) return; 
            if (name !== 'diem_tb_he4' && num > 10) return;
        }
    }
    
    if (name === 'diem_tb_he4' && finalValue.trim() !== '') setFormData(prev => ({...prev, diem_tb_he10: ''}));
    if (name === 'diem_tb_he10' && finalValue.trim() !== '') setFormData(prev => ({...prev, diem_tb_he4: ''}));

    setFormData(prev => ({
      ...prev, [name]: finalValue,
      ...(name === 'doituongdauvao' ? Object.values(DICT_HO_SO.tien_quyet).flat().reduce((acc, doc) => ({...acc, [doc.id]: false}), {}) : {})
    }));
  };

  const handleClearHK2025 = () => {
      setFormData(prev => {
          const newState = { ...prev };
          SUBJECTS_UI.forEach(subj => {
              newState[`diem_${subj.id}_hk1_11`] = '';
              newState[`diem_${subj.id}_hk1_12`] = '';
              newState[`diem_${subj.id}_hk2_12`] = '';
          });
          return newState;
      });
  };

  const handleSelectAllCommon = () => {
    setFormData(prev => {
        const allRequiredDocs = DICT_HO_SO.chung.filter(doc => !doc.optional && isDocApplicable(doc, prev));
        const isAllSelected = allRequiredDocs.every(doc => prev[doc.id]);
        const newState = { ...prev };
        allRequiredDocs.forEach(doc => newState[doc.id] = !isAllSelected);
        return newState;
    });
  };

  useEffect(() => {
    const { nganh, doituongdauvao, khuvucuutien, doituonguutien } = formData;
    if (!nganh || !doituongdauvao) { setAdmissionResult(null); return; }

    let missingChung = []; let missingTienQuyet = [];
    
    DICT_HO_SO.chung.forEach(doc => {
        if (!doc.optional && isDocApplicable(doc, formData) && !formData[doc.id]) missingChung.push(doc.name);
    });
    const dsTienQuyet = DICT_HO_SO.tien_quyet[doituongdauvao] || [];
    dsTienQuyet.forEach(doc => { if (!formData[doc.id]) missingTienQuyet.push(doc.name); });

    let hsStatus = "OK", hsColor = "#155724", hsMsg = "✔️ Trạng thái hồ sơ: Đầy đủ.";
    if (missingTienQuyet.length > 0) { hsStatus = "FAIL"; hsColor = "#721c24"; hsMsg = `❌ Bắt buộc bổ sung: ${missingTienQuyet.join(', ')}.`; } 
    else if (missingChung.length > 0) { hsStatus = "WARN"; hsColor = "#856404"; hsMsg = `⚠️ Yêu cầu bổ sung: ${missingChung.join(', ')}.`; }

    let diemStatus = "FAIL", diemMsg = "";
    let diemCong = parseFloat(formData.diem_cong) || 0;

    if (doituongdauvao === "Tốt nghiệp THPT") {
        if (!formData.loai_diem) {
            diemMsg = `Vui lòng tick chọn Phương thức xét điểm.`;
        } else {
            let maxScore = 0, bestCombo = "";
            (DICT_NGANH[nganh] || []).forEach(maToHop => {
                let subjects = DICT_TO_HOP[maToHop];
                if(subjects) {
                    let s1_id = subjects[0].replace('diem_', '');
                    let s2_id = subjects[1].replace('diem_', '');
                    let s3_id = subjects[2].replace('diem_', '');

                    let v1 = getSubjectAverage(s1_id, formData);
                    let v2 = getSubjectAverage(s2_id, formData);
                    let v3 = getSubjectAverage(s3_id, formData);
                    
                    let total = v1 + v2 + v3;
                    if (total > maxScore && v1 > 0 && v2 > 0 && v3 > 0) { 
                        maxScore = total; bestCombo = maToHop; 
                    }
                }
            });

            if (maxScore === 0) diemMsg = `Chưa nhập đủ điểm để xét tổ hợp.`;
            else {
                let uTienBanDau = (DICT_KHU_VUC[khuvucuutien] || 0) + (DICT_DOI_TUONG[doituonguutien] || 0);
                let uTienChinhThuc = uTienBanDau;
                
                if (formData.loai_diem === 'THI_THPT' && maxScore >= 22.5) {
                    uTienChinhThuc = ((30 - maxScore) / 7.5) * uTienBanDau;
                }

                let finalScore = Math.round((maxScore + uTienChinhThuc + diemCong) * 100) / 100;
                // ĐÃ SỬA: điểm chuẩn giờ tra theo Phương thức xét tuyển thay vì hardcode
                // 15.0 chung cho cả 3 phương thức — GIỮ ĐỒNG BỘ với DIEM_CHUAN_THPT bên
                // thamDinhHelpers.js (đổi mức điểm chuẩn thì phải đổi ở CẢ 2 nơi).
                const diemChuanThpt = DIEM_CHUAN_THPT[formData.loai_diem] ?? 15;

                if (finalScore >= diemChuanThpt) {
                    diemStatus = "PASS";
                    diemMsg = `Tổng: <strong>${finalScore}đ</strong> (Tổ hợp: ${maxScore.toFixed(2)} + ƯT: ${uTienChinhThuc.toFixed(2)}${diemCong > 0 ? ` + Cộng: ${diemCong}` : ''}). Chuẩn: ${diemChuanThpt.toFixed(1)}đ.`;
                } else {
                    diemMsg = `Tổng điểm: ${finalScore}đ. Thiếu ${(diemChuanThpt - finalScore).toFixed(2)}đ (chuẩn ${diemChuanThpt.toFixed(1)}đ).`;
                }
            }
        }
    } else {
        let he4 = parseFloat(formData.diem_tb_he4); let he10 = parseFloat(formData.diem_tb_he10);
        if (he4 >= 2.0 || he10 >= 5.0) { 
            diemStatus = "PASS"; 
            diemMsg = `Đạt chuẩn điểm hệ CĐ/ĐH/TC. ${diemCong > 0 ? `(Điểm cộng: ${diemCong})` : ''}`; 
        } else { diemMsg = `Không đạt chuẩn điểm.`; }
    }

    let boxBg = '#d4edda', boxBorder = '#c3e6cb', icon = '🟢', title = "ĐỦ ĐIỀU KIỆN SƠ TUYỂN", titleColor = '#155724';
    if (hsStatus === "FAIL" || diemStatus === "FAIL") { boxBg = '#f8d7da'; boxBorder = '#f5c6cb'; icon = '🔴'; titleColor = '#721c24'; title = hsStatus === "FAIL" ? "KHÔNG ĐỦ ĐIỀU KIỆN HS" : "KHÔNG ĐẠT ĐIỂM CHUẨN"; } 
    else if (hsStatus === "WARN") { boxBg = '#fff3cd'; boxBorder = '#ffeeba'; icon = '🟡'; title = "ĐẠT SƠ TUYỂN (NỢ HỒ SƠ)"; titleColor = '#856404'; }

    setAdmissionResult({ hsStatus, hsColor, hsMsg, diemStatus, diemMsg, boxBg, boxBorder, icon, title, titleColor });
  }, [formData]);

  const handleAddRow = () => {
    const requiredFields = ['hoten', 'cccd', 'ngaysinh', 'nganh', 'khoa', 'khuvucuutien', 'doituonguutien', 'doituongdauvao', 'namtt', 'hedaotao', 'htdaotao'];
    for (let field of requiredFields) {
        if (!formData[field]) { alert(`Vui lòng điền đầy đủ các mục có dấu (*)`); return; }
    }

    if (formData.doituongdauvao === 'Tốt nghiệp THPT' && !formData.loai_diem) {
        alert("Vui lòng tick chọn Phương thức xét điểm (Thi THPT, Học bạ thường, hoặc Học bạ TBTS 2025)!");
        return;
    }

    let validHasGiayUuTien = formData.has_giay_uutien;
    let validGiayUuTien = formData.giay_uutien;
    if (validHasGiayUuTien && !validGiayUuTien.trim()) {
        validHasGiayUuTien = false;
        validGiayUuTien = '';
    }

    const cccdClean = formData.cccd.trim().replace(/\D/g, '');
    const nganhClean = formData.nganh.trim().toLowerCase();
    
    if (!isEditMode) {
        const isDup = dataList.some(r => String(r["CĂN CƯỚC"]).replace(/\D/g, '') === cccdClean && String(r["NGÀNH"]).trim().toLowerCase() === nganhClean);
        if (isDup) { alert("Hồ sơ này ĐÃ CÓ trong danh sách chờ bên dưới!\n\n💡 Nếu cần sửa hồ sơ đã tồn tại, dùng nút \"🔍 Tìm hồ sơ cũ\" thay vì thêm mới."); return; }
    }

    const currentTimestamp = new Date().toLocaleString('vi-VN');

    let packedDiemHK = "";
    if (formData.loai_diem === 'HOC_BA_2025') {
        const rawObj = {};
        SUBJECTS_UI.forEach(subj => {
            rawObj[`${subj.id}_hk1_11`] = formData[`diem_${subj.id}_hk1_11`] || "";
            rawObj[`${subj.id}_hk1_12`] = formData[`diem_${subj.id}_hk1_12`] || "";
            rawObj[`${subj.id}_hk2_12`] = formData[`diem_${subj.id}_hk2_12`] || "";
        });
        packedDiemHK = JSON.stringify(rawObj);
    }

    const newRow = {
        "STT": dataList.length + 1, "TRẠNG THÁI ĐẨY": "Waiting", 
        "_Action": isEditMode ? "UPDATE" : "INSERT", 
        "KẾT QUẢ SƠ TUYỂN": admissionResult ? admissionResult.title : "",
        "CĂN CƯỚC": formData.cccd.trim(), "TÊN SINH VIÊN": formData.hoten.trim(), "NGÀY SINH": formData.ngaysinh,
        "NGÀNH": formData.nganh, "KHÓA": formData.khoa, "ĐỐI TƯỢNG ƯU TIÊN": formData.doituonguutien,
        "KHU VỰC ƯU TIÊN": formData.khuvucuutien, "ĐỐI TƯỢNG ĐẦU VÀO": formData.doituongdauvao,
        "NĂM XÉT TUYỂN": formData.namtt, "HỆ ĐÀO TẠO": formData.hedaotao, "HÌNH THỨC ĐÀO TẠO": formData.htdaotao,
        "LINK HỒ SƠ": formData.link_folder, 
        "GIẤY TỜ ƯU TIÊN": validHasGiayUuTien ? validGiayUuTien : "", 
        
        "TOÁN": getSubjectAverage('toan', formData) || "", 
        "VẬT LÍ": getSubjectAverage('vatli', formData) || "", 
        "HÓA HỌC": getSubjectAverage('hoahoc', formData) || "", 
        "SINH HỌC": getSubjectAverage('sinhhoc', formData) || "",
        "NGỮ VĂN": getSubjectAverage('nguvan', formData) || "", 
        "LỊCH SỬ": getSubjectAverage('lichsu', formData) || "", 
        "ĐỊA LÝ": getSubjectAverage('dialy', formData) || "", 
        "TIẾNG ANH": getSubjectAverage('tienganh', formData) || "",
        "TIẾNG TRUNG": getSubjectAverage('tiengtrung', formData) || "", 
        "TIN HỌC": getSubjectAverage('tinhoc', formData) || "", 
        "GDKTPL": getSubjectAverage('gdktpl', formData) || "",
        
        // ĐÃ VÁ BUG THẬT (không chỉ đổi tên): tên cột thật trên Goc01 là "ĐIỂM TB TOÀN
        // KHÓA HỆ 4"/"...HỆ 10" — trước đây ghi nhầm bằng tên rút gọn "ĐIỂM TB HỆ 4/10"
        // (không khớp cột thật nào) nên MỌI hồ sơ xét theo Học bạ nhập tay từ trước tới
        // giờ đều bị ghi TRỐNG 2 cột điểm này vào Goc01. Hồ sơ cũ đã đẩy lên (nếu có,
        // dùng Học bạ) cần rà soát/bổ sung lại tay — hệ thống không tự khôi phục được dữ
        // liệu đã mất do bug này trước đây.
        "ĐIỂM TB TOÀN KHÓA HỆ 4": formData.diem_tb_he4, "ĐIỂM TB TOÀN KHÓA HỆ 10": formData.diem_tb_he10, "ĐIỂM CỘNG": formData.diem_cong,
        "ĐIỂM CHUẨN": formData.diem_chuan, 
        
        "PHƯƠNG THỨC XÉT TUYỂN": formData.loai_diem === 'THI_THPT' ? 'Điểm thi THPT' : (formData.loai_diem === 'HOC_BA' ? 'Điểm học bạ' : (formData.loai_diem === 'HOC_BA_2025' ? 'Điểm học bạ (TBTS 2025)' : '')),
        "TRẠNG THÁI THẨM ĐỊNH": isEditMode ? "Mới bổ sung" : "Chưa thẩm định",
        
        "TIME": isEditMode ? (formData.time_goc || currentTimestamp) : currentTimestamp,
        "NGÀY CẬP NHẬT HỒ SƠ": isEditMode ? currentTimestamp : "",
        "TÀI KHOẢN NHẬP LIỆU": getUserEmail(),
        
        "RAW_DIEM_HK": packedDiemHK
    };

    ALL_HO_SO_DOCS.forEach(doc => { newRow[doc.name.toUpperCase()] = formData[doc.id] ? "TRUE" : "FALSE"; });
    
    if (isEditMode) {
        const updatedList = [...dataList];
        const existingIdx = updatedList.findIndex(r => String(r["CĂN CƯỚC"]).replace(/\D/g, '') === cccdClean && String(r["NGÀNH"]).trim().toLowerCase() === nganhClean);
        if (existingIdx !== -1) updatedList[existingIdx] = newRow;
        else updatedList.push(newRow);
        setDataList(updatedList);
    } else {
        setDataList([...dataList, newRow]);
    }

    setFormData(initialFormState); 
    setIsEditMode(false); 
  };

  const handleCancelEdit = () => {
      if (window.confirm("Bạn có chắc chắn muốn Hủy chỉnh sửa? Các thay đổi sẽ không được lưu.")) {
          setFormData(initialFormState);
          setIsEditMode(false);
      }
  };

  const handleEditRowLocal = (index) => {
    const row = dataList[index];
    if(!window.confirm(`Bạn có muốn tải hồ sơ của [${row["TÊN SINH VIÊN"]}] lên Form để chỉnh sửa lại không?`)) return;

    let phuongThuc = "";
    if (row["PHƯƠNG THỨC XÉT TUYỂN"] === 'Điểm thi THPT') phuongThuc = "THI_THPT";
    if (row["PHƯƠNG THỨC XÉT TUYỂN"] === 'Điểm học bạ') phuongThuc = "HOC_BA";
    if (row["PHƯƠNG THỨC XÉT TUYỂN"] === 'Điểm học bạ (TBTS 2025)') phuongThuc = "HOC_BA_2025";

    let rawObj = {};
    if (row["RAW_DIEM_HK"]) {
        try { rawObj = JSON.parse(row["RAW_DIEM_HK"]); } catch(e) {}
    }

    setFormData(prev => ({
        ...prev,
        hoten: row["TÊN SINH VIÊN"] || "",
        cccd: String(row["CĂN CƯỚC"] || "").replace(/'/g, ''),
        nganh: row["NGÀNH"] || "",
        ngaysinh: row["NGÀY SINH"] || "",
        khoa: row["KHÓA"] || "",
        khuvucuutien: row["KHU VỰC ƯU TIÊN"] || "",
        doituonguutien: row["ĐỐI TƯỢNG ƯU TIÊN"] || "",
        doituongdauvao: row["ĐỐI TƯỢNG ĐẦU VÀO"] || "",
        namtt: row["NĂM XÉT TUYỂN"] || "",
        hedaotao: row["HỆ ĐÀO TẠO"] || "",
        htdaotao: row["HÌNH THỨC ĐÀO TẠO"] || "",
        link_folder: row["LINK HỒ SƠ"] || "",
        
        diem_toan: row["TOÁN"] || "",
        diem_vatli: row["VẬT LÍ"] || row["VẬT LÝ"] || "",
        diem_hoahoc: row["HÓA HỌC"] || "",
        diem_sinhhoc: row["SINH HỌC"] || "",
        diem_nguvan: row["NGỮ VĂN"] || "",
        diem_lichsu: row["LỊCH SỬ"] || "",
        diem_dialy: row["ĐỊA LÝ"] || row["ĐỊA LÍ"] || "",
        diem_tienganh: row["TIẾNG ANH"] || "",
        diem_tiengtrung: row["TIẾNG TRUNG"] || "",
        diem_tinhoc: row["TIN HỌC"] || "",
        diem_gdktpl: row["GDKTPL"] || "",
        
        ...SUBJECTS_UI.reduce((acc, subj) => {
            acc[`diem_${subj.id}_hk1_11`] = rawObj[`${subj.id}_hk1_11`] || "";
            acc[`diem_${subj.id}_hk1_12`] = rawObj[`${subj.id}_hk1_12`] || "";
            acc[`diem_${subj.id}_hk2_12`] = rawObj[`${subj.id}_hk2_12`] || "";
            return acc;
        }, {}),

        diem_tb_he4: row["ĐIỂM TB HỆ 4"] || row["ĐIỂM TB TOÀN KHÓA HỆ 4"] || "",
        diem_tb_he10: row["ĐIỂM TB HỆ 10"] || row["ĐIỂM TB TOÀN KHÓA HỆ 10"] || "",
        diem_cong: row["ĐIỂM CỘNG"] || "",
        diem_chuan: row["ĐIỂM CHUẨN"] || "",
        has_giay_uutien: !!row["GIẤY TỜ ƯU TIÊN"],
        giay_uutien: row["GIẤY TỜ ƯU TIÊN"] || "",
        loai_diem: phuongThuc,
        time_goc: row["TIME"] || "",
        ...ALL_HO_SO_DOCS.reduce((acc, doc) => ({
            ...acc,
            [doc.id]: row[doc.name.toUpperCase()] === "TRUE"
        }), {})
    }));

    setIsEditMode(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteRow = (index) => {
    if(window.confirm("Bạn có chắc chắn muốn XÓA hồ sơ này khỏi danh sách không?")) {
        const newList = [...dataList];
        newList.splice(index, 1);
        newList.forEach((r, i) => r["STT"] = i + 1);
        setDataList(newList);
    }
  };

  const handlePushToCloud = async () => {
    const pendingList = dataList.filter(row => row["TRẠNG THÁI ĐẨY"] === "Waiting" || row["TRẠNG THÁI ĐẨY"].includes("Lỗi"));
    if (pendingList.length === 0) { alert("Không có hồ sơ mới nào để đẩy lên hệ thống!"); return; }

    setIsPushing(true);
    try {
        const payloadParams = new URLSearchParams();
        payloadParams.append('action', 'importStudents');
        // ĐÃ VÁ BUG: trước đây KHÔNG gửi idToken/sessionToken ở đây — action "importStudents"
        // phía backend đọc quyền qua requireAuth(e.parameter,...), cần idToken/sessionToken là
        // field RIÊNG ngang hàng với "action", không phải lồng trong "data". Thiếu thì mọi lần
        // bấm "Đẩy dữ liệu lên hệ thống" đều bị chặn 401 — cần bạn test lại kỹ chỗ này.
        payloadParams.append('idToken', getToken());
        payloadParams.append('sessionToken', getSessionToken());
        payloadParams.append('data', JSON.stringify(pendingList.map(row => {
            const copyRow = { ...row };
            if (copyRow["CĂN CƯỚC"]) copyRow["CĂN CƯỚC"] = "'" + copyRow["CĂN CƯỚC"];
            delete copyRow["TRẠNG THÁI ĐẨY"];
            return copyRow;
        })));

        const response = await fetch(WEB_APP_URL, { method: "POST", body: payloadParams });
        const result = await response.json();
        
        if (result.code === 200) {
            const failedItems = result.data?.failedList || [];
            // ĐÃ THÊM: backend giờ trả thêm failedUpdates (hồ sơ _Action=UPDATE nhưng không khớp
            // được hồ sơ gốc — trước đây bug âm thầm chèn thành dòng mới, giờ báo lỗi rõ ràng).
            const failedUpdateItems = result.data?.failedUpdates || [];
            // ĐÃ THÊM: backend giờ trả thêm invalidRows (hồ sơ bị chặn vì NGÀNH/HỆ ĐÀO TẠO/...
            // không khớp danh sách hợp lệ ở CauHinh — xem kiemTraHopLeCauHinh_ bên Quanlysv.gs).
            const invalidItems = result.data?.invalidRows || [];
            setDataList(prev => prev.map(r => {
                if (r["TRẠNG THÁI ĐẨY"] === "Waiting" || r["TRẠNG THÁI ĐẨY"].includes("Lỗi")) {
                    const rCccd = String(r["CĂN CƯỚC"]).replace(/\D/g, '');
                    const rNganh = String(r["NGÀNH"]).trim().toLowerCase();
                    const isFailed = failedItems.some(f => f.cccd === rCccd && f.nganh.toLowerCase() === rNganh);
                    const isFailedUpdate = failedUpdateItems.some(f => String(f.cccd).replace(/\D/g, '') === rCccd && String(f.nganh).toLowerCase() === rNganh);
                    const invalidItem = invalidItems.find(f => String(f.cccd).replace(/\D/g, '') === rCccd && String(f.nganh).toLowerCase() === rNganh);

                    if (isFailed) return {...r, "TRẠNG THÁI ĐẨY": "Lỗi: Trùng hồ sơ"};
                    if (isFailedUpdate) return {...r, "TRẠNG THÁI ĐẨY": "Lỗi: Không khớp hồ sơ gốc để sửa"};
                    if (invalidItem) return {...r, "TRẠNG THÁI ĐẨY": "Lỗi: " + invalidItem.loi};
                    else return {...r, "TRẠNG THÁI ĐẨY": "Uploaded"};
                }
                return r;
            }));
            alert(result.message);
        } else { alert(`Lỗi Server: ${result.message}`); }
    } catch (error) { alert(`Lỗi kết nối mạng: ${error.message}`); } 
    finally { setIsPushing(false); }
  };

  const processCCCDImage = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // ĐÃ VÁ BUG: điều kiện cũ chỉ check getToken() (token Google) -> tài khoản nội bộ
      // (canbo/tuyensinh, đăng nhập bằng sessionToken chứ không có idToken Google) luôn
      // bị chặn ngay từ đây dù backend đã hỗ trợ sessionToken cho action "scanDocument".
      // Giờ chỉ chặn khi CẢ HAI đều rỗng (chưa đăng nhập bằng cách nào cả).
      const token = getToken();
      const sessTok = getSessionToken();
      if (!token && !sessTok) { alert("Lỗi xác thực: Vui lòng đăng nhập lại để sử dụng AI!"); e.target.value = ""; return; }

      setScanStatus("⏳ Đang phân tích bằng AI...");
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = async () => {
          const canvas = document.createElement('canvas');
          let width = img.width, height = img.height;
          if (width > 1200) { height = Math.round((height * 1200) / width); width = 1200; }
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          const base64String = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

          try {
              const payloadParams = new URLSearchParams();
              payloadParams.append('action', 'scanDocument');
              payloadParams.append('data', JSON.stringify({ idToken: token, sessionToken: getSessionToken(), imageBase64: base64String, mimeType: 'image/jpeg' }));

              const response = await fetch(WEB_APP_URL, { method: 'POST', body: payloadParams });
              const result = await response.json();

              if (result.code === 200 && result.data) {
                  const extracted = result.data;
                  const loaiGiayTo = String(extracted.loai_giay_to || "").trim().toLowerCase();
                  const today = todayIsoDate();
                  let hetHan = false, hanSuDung = "";
                  
                  if (loaiGiayTo === "hochieu" && extracted.ngay_cap) {
                      hanSuDung = addYearsIso(extracted.ngay_cap, 10);
                      if (compareIsoDates(today, hanSuDung) > 0) hetHan = true;
                  } else if (extracted.ngay_het_han) {
                      hanSuDung = extracted.ngay_het_han;
                      if (compareIsoDates(today, hanSuDung) > 0) hetHan = true;
                  }

                  if (hetHan) { alert(`${loaiGiayTo === "hochieu" ? "Hộ chiếu" : "CCCD"} đã HẾT HIỆU LỰC (${hanSuDung}).`); setScanStatus(`❌ Hết hạn (${hanSuDung})`); return; }

                  setFormData(prev => ({
                      ...prev, cccd: extracted.so_giay_to || extracted.cccd || prev.cccd,
                      hoten: extracted.hoten || prev.hoten, ngaysinh: extracted.ngaysinh || prev.ngaysinh
                  }));
                  setScanStatus(`✅ Thành công (${loaiGiayTo === "hochieu" ? "Hộ chiếu" : "CCCD"})`);
              } else { setScanStatus("❌ " + (result.message || "Không thể nhận diện")); }
          } catch (err) { setScanStatus("❌ Lỗi kết nối AI"); }
          e.target.value = ""; 
      };
  };

  const executeSearchCandidate = async () => {
      if (!searchKeyword.trim()) return;
      setIsSearching(true);
      // ĐÃ VÁ BUG (giống processCCCDImage): chỉ chặn khi thiếu CẢ idToken lẫn sessionToken.
      const token = getToken();
      const sessTok = getSessionToken();
      if (!token && !sessTok) { alert("Lỗi xác thực: Vui lòng đăng nhập lại!"); setIsSearching(false); return; }

      try {
          const payloadParams = new URLSearchParams();
          payloadParams.append('action', 'searchOldRecord');
          payloadParams.append('data', JSON.stringify({ idToken: token, sessionToken: getSessionToken(), keyword: searchKeyword }));

          const response = await fetch(WEB_APP_URL, { method: 'POST', body: payloadParams });
          const result = await response.json();
          if (result.code === 200) { setSearchResults(result.data); } else { setSearchResults([]); alert(result.message); }
      } catch(e) { alert("Lỗi hệ thống."); } finally { setIsSearching(false); }
  };

  const loadOldCandidate = (record) => {
      if(!window.confirm(`⚠️ CHÚ Ý: Việc chỉnh sửa sẽ ghi đè lên dữ liệu cũ của thí sinh [${record.hoTen}]. Bạn có chắc chắn muốn Tải lên Form?`)) return;
      
      const rawData = record.fullData || {};
      const normData = {};
      for (let key in rawData) {
          const cleanKey = String(key).trim().toUpperCase().replace(/\s+/g, ' ');
          normData[cleanKey] = rawData[key];
      }

      let phuongThuc = "";
      const rawPhuongThuc = normData["PHƯƠNG THỨC XÉT TUYỂN"] || normData["LOẠI ĐIỂM"] || "";
      if (rawPhuongThuc === 'Điểm thi THPT' || rawPhuongThuc === 'THI_THPT') phuongThuc = "THI_THPT";
      if (rawPhuongThuc === 'Điểm học bạ' || rawPhuongThuc === 'HOC_BA') phuongThuc = "HOC_BA";
      if (rawPhuongThuc === 'Điểm học bạ (TBTS 2025)' || rawPhuongThuc === 'HOC_BA_2025') phuongThuc = "HOC_BA_2025";

      let rawObj = {};
      if (normData["RAW_DIEM_HK"]) {
          try { rawObj = JSON.parse(normData["RAW_DIEM_HK"]); } catch(e) {}
      }

      // ĐÃ SỬA: bổ sung "1" và "X" vào danh sách giá trị được coi là ĐÃ CÓ giấy tờ — trước
      // đây thiếu 2 giá trị này, trong khi getMissingDocs (thamDinhHelpers.js, bên trang
      // Thẩm định) đã chấp nhận cả TRUE/1/V/X/CÓ từ lâu — khiến 1 hồ sơ Thẩm định coi là ĐÃ
      // ĐỦ giấy tờ (vì cột ghi "x" hoặc "1", ví dụ đến từ luồng Thu hồ sơ trực tiếp) nhưng
      // khi tải lại để sửa bên trang Xét tuyển lại hiện thành CHƯA tick — giờ đồng bộ đúng 1
      // danh sách với getMissingDocs.
      const getDocVal = (doc) => {
          const val = normData[doc.name.toUpperCase()] || normData[doc.short.toUpperCase()];
          if (val === true || val === 1) return true;
          const strVal = String(val).toUpperCase().trim();
          return strVal === "TRUE" || strVal === "1" || strVal === "CÓ" || strVal === "V" || strVal === "X";
      };

      setFormData(prev => ({
          ...prev, 
          hoten: normData["TÊN SINH VIÊN"] || normData["HỌ VÀ TÊN"] || "",
          cccd: String(normData["CĂN CƯỚC"] || normData["CCCD"] || "").replace(/'/g, ''), 
          nganh: normData["NGÀNH"] || "",
          ngaysinh: normData["NGÀY SINH"] || "",
          khoa: normData["KHÓA"] || "", 
          khuvucuutien: normData["KHU VỰC ƯU TIÊN"] || normData["KHU VỰC"] || "",
          doituonguutien: normData["ĐỐI TƯỢNG ƯU TIÊN"] || "", 
          doituongdauvao: normData["ĐỐI TƯỢNG ĐẦU VÀO"] || "",
          namtt: normData["NĂM XÉT TUYỂN"] || normData["NĂM TRÚNG TUYỂN"] || "", 
          hedaotao: normData["HỆ ĐÀO TẠO"] || "", 
          htdaotao: normData["HÌNH THỨC ĐÀO TẠO"] || "", 
          link_folder: normData["LINK HỒ SƠ"] || "",
          has_giay_uutien: !!normData["GIẤY TỜ ƯU TIÊN"] || !!normData["GIẤY ƯU TIÊN"],
          giay_uutien: normData["GIẤY TỜ ƯU TIÊN"] || normData["GIẤY ƯU TIÊN"] || "",
          loai_diem: phuongThuc,
          time_goc: normData["TIME"] || "",
          
          diem_toan: normData["TOÁN"] || "",
          diem_vatli: normData["VẬT LÍ"] || normData["VẬT LÝ"] || "",
          diem_hoahoc: normData["HÓA HỌC"] || "",
          diem_sinhhoc: normData["SINH HỌC"] || "",
          diem_nguvan: normData["NGỮ VĂN"] || "",
          diem_lichsu: normData["LỊCH SỬ"] || "",
          diem_dialy: normData["ĐỊA LÝ"] || normData["ĐỊA LÍ"] || "",
          diem_tienganh: normData["TIẾNG ANH"] || "",
          diem_tiengtrung: normData["TIẾNG TRUNG"] || "",
          diem_tinhoc: normData["TIN HỌC"] || "",
          diem_gdktpl: normData["GDKTPL"] || normData["GIÁO DỤC KINH TẾ"] || "",
          
          ...SUBJECTS_UI.reduce((acc, subj) => {
              acc[`diem_${subj.id}_hk1_11`] = rawObj[`${subj.id}_hk1_11`] || "";
              acc[`diem_${subj.id}_hk1_12`] = rawObj[`${subj.id}_hk1_12`] || "";
              acc[`diem_${subj.id}_hk2_12`] = rawObj[`${subj.id}_hk2_12`] || "";
              return acc;
          }, {}),

          // ĐÃ SỬA: thêm fallback đọc đúng tên cột thật "ĐIỂM TB TOÀN KHÓA HỆ 4/10" (xem
          // chú thích bug tại chỗ ghi "ĐIỂM TB TOÀN KHÓA HỆ 4/10" phía trên) — thiếu dòng
          // này thì hồ sơ có điểm hợp lệ trên Goc01 vẫn hiện trống khi mở lại để sửa.
          diem_tb_he4: normData["ĐIỂM TB TOÀN KHÓA HỆ 4"] || normData["ĐIỂM TB HỆ 4"] || normData["HỆ 4"] || "",
          diem_tb_he10: normData["ĐIỂM TB TOÀN KHÓA HỆ 10"] || normData["ĐIỂM TB HỆ 10"] || normData["HỆ 10"] || "",
          diem_cong: normData["ĐIỂM CỘNG"] || "",
          diem_chuan: normData["ĐIỂM CHUẨN"] || "",

          ...ALL_HO_SO_DOCS.reduce((acc, doc) => ({
              ...acc,
              [doc.id]: getDocVal(doc)
          }), {})
      }));
      setIsEditMode(true);
      closeSearchModal();
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleImportFileChange = (e) => { const file = e.target.files[0]; if (file) setImportFile(file); };

  // ĐÃ SỬA (rà soát đồng bộ file mẫu 2 trang): danh sách cột giờ LẤY TỪ SERVER (action
  // getXetTuyenHeaders, nguồn duy nhất XETTUYEN_TEMPLATE_HEADERS trong Quanlysv.gs) thay
  // vì mảng "headers" hardcode ngay trong file này — cùng cách làm với file mẫu bên
  // trang Thu hồ sơ (getAdmissionsHeaders), tránh lệch cột khi có thêm/sửa/xoá sau này
  // vì chỉ còn 1 nơi cần sửa. executeImport() đọc file theo alias độc lập, không phụ
  // thuộc mảng này, nên đổi nguồn ở đây không ảnh hưởng logic nhập Excel đã có.
  // ĐÃ VIẾT LẠI: dùng helper taiFileMauExcel (utils/excelTemplate.js, chạy bằng exceljs)
  // thay cho thao tác trực tiếp bằng xlsx như trước — lý do đổi: xlsx (bản miễn phí) không
  // ghi được Data Validation (dropdown thật) vào file .xlsx xuất ra, chỉ có ở bản trả phí.
  // Giờ ngoài việc khoá định dạng Text cho CĂN CƯỚC (và NGÀY SINH, thêm mới — cùng lý do
  // như ImportModal.jsx, tránh Excel tự đổi kiểu ô), file mẫu còn có dropdown thật cho các
  // cột có danh sách giá trị cố định, lấy đúng 1 nguồn dữ liệu với sheet CauHinh (qua
  // fetchConfig — cùng nguồn dropdown đang dùng ở form nhập tay ngay trên trang này) — giảm
  // hẳn nguy cơ gõ sai/thừa khoảng trắng khiến dữ liệu không khớp được các trường giá trị
  // cố định (backend cũng đã chặn thêm 1 lớp nữa khi đẩy lên hệ thống, xem importStudents).
  // ĐÃ VIẾT LẠI (rà soát cột file mẫu): thay "guideRowText" (1 câu duy nhất, chỉ nằm ở cột
  // A) bằng "descRow" — mô tả RIÊNG CHO TỪNG CỘT, dựng động từ chính DICT_HO_SO/dropdown
  // đang dùng ở trang này (không hardcode trùng lặp, đổi 1 nơi là đổi theo hết). Thêm
  // "headerColorGroups" — tô màu dòng tiêu đề (dòng 1) riêng theo TỪNG NHÓM đối tượng đầu
  // vào (giấy tờ chung 1 màu, giấy tờ riêng của mỗi loại "Tốt nghiệp..." 1 màu khác) — chỉ
  // để dễ nhìn khi cuộn ngang, KHÔNG ảnh hưởng gì tới việc đọc file lúc import.
  const handleDownloadTemplate = async () => {
      setImportStatus("⏳ Đang tạo file mẫu...");
      try {
          const headers = await fetchXetTuyenHeaders();
          // Lấy danh sách hợp lệ từ CauHinh — nếu gọi lỗi thì vẫn tạo được file mẫu bình
          // thường, chỉ là không có dropdown, không chặn hẳn việc tải file mẫu.
          let config = {};
          try { config = await fetchConfig(); } catch (err) { /* bỏ qua, tạo file mẫu không dropdown */ }

          const dropdownColumns = {
            'NGÀNH': config.Nganh,
            'KHÓA': config.KhoaNhapHoc,
            'ĐỐI TƯỢNG ƯU TIÊN': config.DoiTuongUT,
            'KHU VỰC ƯU TIÊN': config.KhuVucUT,
            'ĐỐI TƯỢNG ĐẦU VÀO': config.DoiTuongDauVao,
            'NĂM XÉT TUYỂN': config.NamXetTuyen,
            'HỆ ĐÀO TẠO': config.HeDaoTao,
            'HÌNH THỨC ĐÀO TẠO': config.HinhThucDaoTao,
          };

          // Dòng mô tả (dòng 2) — đúng nội dung đã chốt cho từng cột/nhóm cột.
          const descRow = { 'STT': '0', 'CĂN CƯỚC': 'Số CCCD', 'NGÀY SINH': 'dd/mm/yyyy' };
          Object.keys(dropdownColumns).forEach((c) => { descRow[c] = 'chọn dropdown'; });
          ALL_HO_SO_DOCS.forEach((doc) => { descRow[doc.name.toUpperCase()] = 'ghi x hoặc "true"'; });
          descRow['ĐIỂM TB TOÀN KHÓA HỆ 4'] = 'Điền 1 trong 2 hệ';
          descRow['ĐIỂM TB TOÀN KHÓA HỆ 10'] = 'Điền 1 trong 2 hệ';
          // "PHƯƠNG THỨC XÉT TUYỂN" được GIỮ LẠI trong file mẫu (xác nhận có chức năng
          // thật — xem chú thích tại chỗ ghi "PHƯƠNG THỨC XÉT TUYỂN" ở handleAddRow) —
          // thêm mô tả ngắn để người nhập liệu hiểu ô này không bắt buộc lúc import.
          descRow['PHƯƠNG THỨC XÉT TUYỂN'] = 'Điểm thi THPT / Điểm học bạ / Điểm học bạ (TBTS 2025) — có thể để trống';

          // Tô màu nhóm cho dòng tiêu đề: "chung" (luôn áp dụng, gồm cả "Phiếu đăng ký dự
          // tuyển" vì cột này lặp lại y hệt ở MỌI nhóm tiên quyết) + 1 màu riêng cho từng
          // nhóm "Đối tượng đầu vào" còn lại.
          const MAU_NHOM_HEADER = {
            chung: 'FFDDEBF7', 'Tốt nghiệp THPT': 'FFE2EFDA',
            'Tốt nghiệp Trung cấp sau 2022': 'FFFFF2CC',
            'Tốt nghiệp Trung cấp trước 2022': 'FFF4CCCC', 'Trung học nghề': 'FFF4CCCC',
            'Tốt nghiệp Cao đẳng': 'FFD9D2E9', 'Tốt nghiệp Đại học': 'FFD0E0E3',
          };
          const headerColorGroups = {};
          DICT_HO_SO.chung.forEach((doc) => { headerColorGroups[doc.name.toUpperCase()] = MAU_NHOM_HEADER.chung; });
          Object.entries(DICT_HO_SO.tien_quyet).forEach(([nhom, docs]) => {
            docs.forEach((doc) => {
              const ten = doc.name.toUpperCase();
              if (doc.id === 'doc_phieu_dk') { headerColorGroups[ten] = MAU_NHOM_HEADER.chung; return; }
              if (headerColorGroups[ten]) return;
              headerColorGroups[ten] = MAU_NHOM_HEADER[nhom];
            });
          });

          await taiFileMauExcel({
            headers,
            descRow,
            textLockColumns: ['CĂN CƯỚC', 'NGÀY SINH'],
            dropdownColumns,
            headerColorGroups,
            sheetName: 'Mau_Nhap_Lieu',
            fileName: 'FileMau_NhapLieu_TuyenSinh.xlsx',
          });
          setImportStatus("");
      } catch (e) { setImportStatus("❌ Lỗi tạo file: " + e.message); }
  };

  const executeImport = () => {
      if (!importFile) return;
      setImportStatus("⏳ Đang đọc file...");

      const reader = new FileReader();
      reader.onload = async (e) => {
          try {
              const data = new Uint8Array(e.target.result);
              const workbook = XLSX.read(data, { type: 'array' });
              const sheet = workbook.Sheets[workbook.SheetNames[0]];
              const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

              if (rows.length < 3) { alert("File không hợp lệ hoặc rỗng."); setImportStatus(""); return; }

              // ĐÃ THÊM: đọc thêm 1 bản song song với raw:false — CHỈ dùng để lấy đúng cột
              // CĂN CƯỚC theo chuỗi ĐÃ ĐỊNH DẠNG (giữ được số 0 ở đầu nếu ô bị Excel coi là
              // Number có định dạng đệm số 0, VD "000000000000"). KHÔNG dùng raw:false cho
              // `rows` ở trên (để đọc mọi cột khác, đặc biệt NGÀY SINH) vì nó đổi cách đọc ô
              // Date sang chuỗi ĐÃ ĐỊNH DẠNG theo number-format của chính file nguồn (có thể
              // không phải dd/MM/yyyy tuỳ file) — trong khi cách đọc mặc định (raw:true) trả
              // về SỐ SERIAL THÔ, được chuanHoaNgaySinhImport (utils/ngaySinh.js) giải mã
              // luôn đúng dd/MM/yyyy bất kể định dạng/locale hiển thị của file gốc.
              const rowsFormatted = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });

              const headers = rows[0].map(h => String(h).trim().toUpperCase().replace(/\s+/g, ' '));
              const dataRows = rows.slice(2);
              const dataRowsFormatted = rowsFormatted.slice(2);

              const getField = (rowArr, aliasArray) => {
                  for (let alias of aliasArray) {
                      const aliasClean = alias.trim().toUpperCase().replace(/\s+/g, ' ');
                      const idx = headers.findIndex(h => h === aliasClean || h.includes(aliasClean));
                      if (idx !== -1) return String(rowArr[idx] || "").trim();
                  }
                  return "";
              };

              // ĐÃ THÊM: validate điểm lúc import Excel — trước đây chỉ chặn điểm âm/vượt 10
              // + chuẩn hoá dấu phẩy/chấm lúc NHẬP TAY (xem handleChange), import Excel hoàn
              // toàn chưa có lớp chặn nào, dữ liệu rác (chữ, số âm, số >10) từng lọt thẳng lên
              // hệ thống. `max` truyền theo thang điểm riêng từng cột (10 cho các môn + Hệ 10,
              // 4 cho Hệ 4). Ô để trống luôn hợp lệ (val: null) — các môn ngoài tổ hợp xét
              // tuyển vốn không bắt buộc điền hết.
              const validateDiem = (raw, max) => {
                  if (!raw || !raw.trim()) return { ok: true, val: null };
                  const num = Number(raw.trim().replace(',', '.'));
                  if (isNaN(num)) return { ok: false, err: `"${raw}" không phải số hợp lệ` };
                  if (num < 0) return { ok: false, err: `${raw} là số âm (không hợp lệ)` };
                  if (num > max) return { ok: false, err: `${raw} vượt quá ${max}` };
                  return { ok: true, val: num };
              };
              const SCORE_FIELDS = [
                  { ten: 'TOÁN', aliases: ['TOÁN'] }, { ten: 'VẬT LÍ', aliases: ['VẬT LÍ', 'VẬT LÝ'] },
                  { ten: 'HÓA HỌC', aliases: ['HÓA HỌC'] }, { ten: 'SINH HỌC', aliases: ['SINH HỌC'] },
                  { ten: 'NGỮ VĂN', aliases: ['NGỮ VĂN'] }, { ten: 'LỊCH SỬ', aliases: ['LỊCH SỬ'] },
                  { ten: 'ĐỊA LÝ', aliases: ['ĐỊA LÝ', 'ĐỊA LÍ'] }, { ten: 'TIẾNG ANH', aliases: ['TIẾNG ANH'] },
                  { ten: 'TIẾNG TRUNG', aliases: ['TIẾNG TRUNG'] }, { ten: 'TIN HỌC', aliases: ['TIN HỌC'] },
                  { ten: 'GDKTPL', aliases: ['GDKTPL', 'GIÁO DỤC KINH TẾ'] },
              ];

              let importedCount = 0; let dupCount = 0; let dupInFileCount = 0; let dupOnSheetCount = 0;
              const newItems = [];
              // ĐÃ THÊM: hồ sơ bị LOẠI do điểm không hợp lệ (rejectedRows, xem SCORE_FIELDS ở
              // trên) + hồ sơ điền CẢ Hệ 4 lẫn Hệ 10 nên bị tự chọn 1 trong 2 (rowWarnings) —
              // cả 2 đều được báo cáo chi tiết trong alert tổng kết cuối hàm.
              const rejectedRows = [];
              const rowWarnings = [];
              // ĐÃ THÊM (rà soát Trunggian.gs): dò trùng NGAY TRONG CHÍNH FILE ĐANG CHỌN — trước đây
              // chỉ so với dataList hiện có trên trang, nên 2 dòng trùng CCCD+Ngành nhau NGAY TRONG
              // CÙNG 1 FILE (mà cả 2 đều chưa từng có trên dataList) sẽ lọt qua hết, cả 2 đều được
              // thêm vào — dùng Set này để tự chặn trùng nội bộ file.
              const seenInThisFile = new Set();
              const sttBase = dataList.length;

              dataRows.forEach((rowArr, rowIdx) => {
                  if (rowArr.every(cell => String(cell || "").trim() === "")) return;

                  // ĐÃ SỬA: lấy CĂN CƯỚC từ bản đọc raw:false (dataRowsFormatted, cùng chỉ số
                  // dòng rowIdx) thay vì rowArr mặc định — giữ số 0 ở đầu dãy nếu ô bị Excel
                  // coi là kiểu Number (xem chú thích ở khai báo rowsFormatted phía trên).
                  const cccdVal = getField(dataRowsFormatted[rowIdx] || rowArr, ["CĂN CƯỚC", "CCCD", "SỐ CCCD"]);
                  const nganhVal = getField(rowArr, ["NGÀNH"]);
                  const cccdClean = cccdVal.replace(/\D/g, '');
                  const nganhClean = nganhVal.trim().toLowerCase();
                  const fileKey = cccdClean + "|" + nganhClean;

                  const isDupOnList = dataList.some(r => String(r["CĂN CƯỚC"]).replace(/\D/g, '') === cccdClean && String(r["NGÀNH"]).trim().toLowerCase() === nganhClean);
                  const isDupInFile = cccdClean && seenInThisFile.has(fileKey);

                  if (isDupOnList || isDupInFile) {
                      dupCount++;
                      if (isDupInFile) dupInFileCount++;
                      return;
                  }

                  // ĐÃ THÊM: validate NGAY TRƯỚC KHI ghi nhận dòng này vào seenInThisFile/newItems
                  // — hồ sơ lỗi bị LOẠI HOÀN TOÀN (không nạp vào danh sách chờ đẩy), người dùng sửa
                  // lại đúng dòng lỗi trên chính file Excel rồi chọn lại NGUYÊN FILE để import lại;
                  // các hồ sơ đã nạp thành công lần trước tự bị loại vì trùng CCCD+Ngành (isDupOnList
                  // ở trên), không bị nạp đúp — không cần tự tay xoá bớt file trước khi import lại.
                  const rowErrors = [];
                  SCORE_FIELDS.forEach(({ ten, aliases }) => {
                      const kq = validateDiem(getField(rowArr, aliases), 10);
                      if (!kq.ok) rowErrors.push(`${ten}: ${kq.err}`);
                  });

                  const he4Raw = getField(rowArr, ["HỆ 4", "ĐIỂM TB TOÀN KHÓA HỆ 4"]);
                  const he10Raw = getField(rowArr, ["HỆ 10", "ĐIỂM TB TOÀN KHÓA HỆ 10"]);
                  const he4Kq = validateDiem(he4Raw, 4);
                  const he10Kq = validateDiem(he10Raw, 10);
                  if (!he4Kq.ok) rowErrors.push(`Điểm TB hệ 4: ${he4Kq.err}`);
                  if (!he10Kq.ok) rowErrors.push(`Điểm TB hệ 10: ${he10Kq.err}`);

                  if (rowErrors.length > 0) {
                      rejectedRows.push({
                          dong: rowIdx + 3, // dòng thật trong file: 1=tiêu đề, 2=mô tả, dữ liệu từ dòng 3
                          ten: getField(rowArr, ["TÊN SINH VIÊN", "HỌ VÀ TÊN"]) || "(chưa rõ tên)",
                          cccd: cccdVal || "(chưa rõ CCCD)",
                          loi: rowErrors,
                      });
                      return;
                  }

                  // ĐÃ THÊM: điền cả 2 cột Hệ 4 và Hệ 10 trong CÙNG 1 dòng (lẽ ra chỉ điền 1 trong
                  // 2 — xem mô tả dòng 2 file mẫu "Điền 1 trong 2 hệ") -> tự lấy điểm ở cột có TỈ LỆ
                  // % SO VỚI THANG ĐIỂM cao hơn (VD 2/4 = 50% so với 6/10 = 60% -> lấy 6/10), bỏ
                  // trống cột còn lại, kèm cảnh báo rõ đã lấy cột nào — tránh người thẩm định bất
                  // ngờ khi thấy 1 cột đột nhiên trống dù file gốc có điền. Bằng % nhau -> giữ Hệ 10.
                  let he4Final = he4Raw, he10Final = he10Raw;
                  if (he4Kq.val != null && he10Kq.val != null) {
                      const pct4 = (he4Kq.val / 4) * 100;
                      const pct10 = (he10Kq.val / 10) * 100;
                      const tenHienThi = getField(rowArr, ["TÊN SINH VIÊN", "HỌ VÀ TÊN"]) || `dòng ${rowIdx + 3}`;
                      if (pct10 >= pct4) {
                          he4Final = "";
                          rowWarnings.push(`${tenHienThi}: điền cả Hệ 4 (${he4Raw} = ${pct4.toFixed(1)}%) và Hệ 10 (${he10Raw} = ${pct10.toFixed(1)}%) — đã lấy điểm Hệ 10 (tỉ lệ % cao hơn hoặc bằng).`);
                      } else {
                          he10Final = "";
                          rowWarnings.push(`${tenHienThi}: điền cả Hệ 4 (${he4Raw} = ${pct4.toFixed(1)}%) và Hệ 10 (${he10Raw} = ${pct10.toFixed(1)}%) — đã lấy điểm Hệ 4 (tỉ lệ % cao hơn).`);
                      }
                  }

                  if (cccdClean) seenInThisFile.add(fileKey);

                  {
                      const currentTimestamp = new Date().toLocaleString('vi-VN');
                      const newRow = {
                          "STT": sttBase + importedCount + 1, "TRẠNG THÁI ĐẨY": "Waiting", "_Action": "INSERT",
                          "KẾT QUẢ SƠ TUYỂN": getField(rowArr, ["KẾT QUẢ SƠ TUYỂN", "KẾT QUẢ"]),
                          "CĂN CƯỚC": cccdVal, "TÊN SINH VIÊN": getField(rowArr, ["TÊN SINH VIÊN", "HỌ VÀ TÊN"]),
                          // ĐÃ SỬA: chuẩn hoá về ISO (yyyy-MM-dd) ngay khi đọc file — cùng quy
                          // ước dd/MM/yyyy với ImportModal.jsx và backend (xem
                          // chuanHoaNgaySinhImport, utils/ngaySinh.js) — để "NGÀY SINH" hiện
                          // trong danh sách xem trước giống hệt như khi nhập tay qua form.
                          "NGÀY SINH": chuanHoaNgaySinhImport(getField(rowArr, ["NGÀY SINH"])), "NGÀNH": nganhVal,
                          "KHÓA": getField(rowArr, ["KHÓA"]), "ĐỐI TƯỢNG ƯU TIÊN": getField(rowArr, ["ĐỐI TƯỢNG ƯU TIÊN"]),
                          "KHU VỰC ƯU TIÊN": getField(rowArr, ["KHU VỰC ƯU TIÊN", "KHU VỰC"]), "ĐỐI TƯỢNG ĐẦU VÀO": getField(rowArr, ["ĐỐI TƯỢNG ĐẦU VÀO", "ĐẦU VÀO"]),
                          "NĂM XÉT TUYỂN": getField(rowArr, ["NĂM XÉT TUYỂN", "NĂM TRÚNG TUYỂN"]), "HỆ ĐÀO TẠO": getField(rowArr, ["HỆ ĐÀO TẠO", "HỆ"]),
                          "HÌNH THỨC ĐÀO TẠO": getField(rowArr, ["HÌNH THỨC ĐÀO TẠO", "HÌNH THỨC"]), "LINK HỒ SƠ": getField(rowArr, ["LINK HỒ SƠ"]),
                          "GIẤY TỜ ƯU TIÊN": getField(rowArr, ["GIẤY TỜ ƯU TIÊN", "GIẤY ƯU TIÊN"]),
                          
                          "PHƯƠNG THỨC XÉT TUYỂN": getField(rowArr, ["PHƯƠNG THỨC XÉT TUYỂN", "LOẠI ĐIỂM"]),
                          "TOÁN": getField(rowArr, ["TOÁN"]), "VẬT LÍ": getField(rowArr, ["VẬT LÍ", "VẬT LÝ"]), "HÓA HỌC": getField(rowArr, ["HÓA HỌC"]), 
                          "SINH HỌC": getField(rowArr, ["SINH HỌC"]), "NGỮ VĂN": getField(rowArr, ["NGỮ VĂN"]), "LỊCH SỬ": getField(rowArr, ["LỊCH SỬ"]), 
                          "ĐỊA LÝ": getField(rowArr, ["ĐỊA LÝ", "ĐỊA LÍ"]), "TIẾNG ANH": getField(rowArr, ["TIẾNG ANH"]), "TIẾNG TRUNG": getField(rowArr, ["TIẾNG TRUNG"]), 
                          "TIN HỌC": getField(rowArr, ["TIN HỌC"]), "GDKTPL": getField(rowArr, ["GDKTPL", "GIÁO DỤC KINH TẾ"]),
                          // ĐÃ VÁ BUG THẬT (cùng nguyên nhân với chỗ nhập tay — xem chú thích tại
                          // handleAddRow phía trên): ghi vào ĐÚNG tên cột thật "ĐIỂM TB TOÀN KHÓA
                          // HỆ 4/10" thay vì tên rút gọn cũ, để dữ liệu import Excel không còn bị
                          // ghi trống 2 cột này vào Goc01 nữa. Vế đọc (getField) đã tự nhận cả 2
                          // cách đặt tên cột phía FILE MẪU người dùng gõ (ưu tiên "HỆ 4"/"HỆ 10" —
                          // đúng mô tả dòng 2 "Điền 1 trong 2 hệ", vẫn nhận cả tên đầy đủ nếu ai đó
                          // tự đổi lại) — không đổi.
                          "ĐIỂM TB TOÀN KHÓA HỆ 4": he4Final, "ĐIỂM TB TOÀN KHÓA HỆ 10": he10Final, "ĐIỂM CỘNG": getField(rowArr, ["ĐIỂM CỘNG"]),
                          
                          "TRẠNG THÁI THẨM ĐỊNH": "Chưa thẩm định",
                          "TIME": currentTimestamp,
                          "NGÀY CẬP NHẬT HỒ SƠ": "",
                          "TÀI KHOẢN NHẬP LIỆU": getUserEmail(),
                          "RAW_DIEM_HK": ""
                      };
                      
                      ALL_HO_SO_DOCS.forEach(doc => {
                          const val = getField(rowArr, [doc.name.toUpperCase(), doc.short]);
                          // ĐÃ SỬA: "TRUE" trước đây so khớp CHÍNH XÁC hoa/thường (val === "TRUE")
                          // — gõ "True"/"true" trong Excel không được nhận, và "x"/"X" (cách gõ
                          // quen thuộc nhất cho ô tick) hoàn toàn chưa có trong danh sách chấp
                          // nhận, dù getMissingDocs (thamDinhHelpers.js, trang Thẩm định) đã coi
                          // "X" là hợp lệ từ trước — 1 dòng import ghi "x" bị âm thầm quy thành
                          // "FALSE" (mất tick) ngay từ bước này, trước khi kịp tới Thẩm định. Giờ
                          // so khớp không phân biệt hoa/thường (toUpperCase trước), đúng 1 danh
                          // sách với getMissingDocs: TRUE/1/V/X/CÓ.
                          const valUpper = val.toUpperCase();
                          newRow[doc.name.toUpperCase()] = (valUpper === "TRUE" || valUpper === "1" || valUpper === "CÓ" || valUpper === "V" || valUpper === "X") ? "TRUE" : "FALSE";
                      });

                      newItems.push(newRow);
                      importedCount++;
                  }
              });

              // ĐÃ THÊM (rà soát Trunggian.gs): hỏi server 1 LẦN DUY NHẤT cho cả loạt còn lại sau
              // 2 vòng lọc cục bộ trên — bắt các hồ sơ đã được người khác/phiên khác đẩy lên Sheet
              // thật rồi mà máy này chưa biết. Chỉ tốn 1 lượt chờ mạng cho cả trăm dòng, không lặp
              // lại theo từng dòng nên không đáng kể so với thời gian đã chờ đọc/xử lý file.
              let finalItems = newItems;
              if (newItems.length > 0) {
                  setImportStatus("⏳ Đang kiểm tra trùng với hệ thống...");
                  try {
                      const token = getToken();
                      const payloadParams = new URLSearchParams();
                      payloadParams.append('action', 'checkDuplicatesXetTuyen');
                      // ĐÃ VÁ BUG: idToken/sessionToken phải là field RIÊNG (action
                      // "checkDuplicatesXetTuyen" cũng dùng requireAuth(e.parameter,...) như
                      // "importStudents" ở trên) — trước đây lồng nhầm trong "data", khiến lệnh
                      // hỏi trùng này luôn bị chặn 401 âm thầm (chỉ bị bỏ qua, không chặn import,
                      // nên không ai để ý — nhưng lớp bảo vệ "hỏi trước server" thực chất chưa
                      // từng chạy được lần nào).
                      payloadParams.append('idToken', token);
                      payloadParams.append('sessionToken', getSessionToken());
                      // "data" phải là MẢNG THẲNG [{cccd,nganh},...] — khớp đúng cách backend đọc
                      // (JSON.parse(e.parameter.data) rồi gọi .map thẳng lên đó).
                      payloadParams.append('data', JSON.stringify(
                          newItems.map(r => ({ cccd: r["CĂN CƯỚC"], nganh: r["NGÀNH"] }))
                      ));
                      const dupResp = await fetch(WEB_APP_URL, { method: 'POST', body: payloadParams });
                      const dupResult = await dupResp.json();
                      if (dupResult.code === 200 && Array.isArray(dupResult.data?.results)) {
                          const existsSet = new Set(
                              dupResult.data.results
                                  .filter(r => r.exists)
                                  .map(r => String(r.cccd).replace(/\D/g, '') + "|" + String(r.nganh).trim().toLowerCase())
                          );
                          finalItems = newItems.filter(r => {
                              const key = String(r["CĂN CƯỚC"]).replace(/\D/g, '') + "|" + String(r["NGÀNH"]).trim().toLowerCase();
                              if (existsSet.has(key)) { dupOnSheetCount++; return false; }
                              return true;
                          });
                      }
                      // Nếu server lỗi/không phản hồi đúng định dạng: không chặn người dùng, cứ để
                      // finalItems = newItems như cũ — lớp chặn cuối ở bước "Đẩy lên hệ thống" vẫn
                      // còn đó để bắt trùng thật nếu có.
                  } catch (dupErr) { /* lỗi mạng lúc hỏi trùng -> bỏ qua, không chặn import */ }
              }

              if (finalItems.length > 0) setDataList(prev => [...prev, ...finalItems]);
              
              setImportStatus(""); setIsImportModalOpen(false); setImportFile(null);
              let msg = `Đã nạp ${finalItems.length} hồ sơ từ file Excel.`;
              if (dupInFileCount > 0) msg += `\n⚠️ Bỏ qua ${dupInFileCount} hồ sơ trùng CCCD + Ngành NGAY TRONG file vừa chọn.`;
              if (dupCount - dupInFileCount > 0) msg += `\n⚠️ Bỏ qua ${dupCount - dupInFileCount} hồ sơ trùng với danh sách đang chờ đẩy.`;
              if (dupOnSheetCount > 0) msg += `\n⚠️ Bỏ qua ${dupOnSheetCount} hồ sơ đã có sẵn trên hệ thống (người khác đã nhập trước).`;
              // ĐÃ THÊM: báo chi tiết 2 loại — cảnh báo (đã tự xử lý, hồ sơ vẫn được nạp) và
              // lỗi (hồ sơ bị loại hoàn toàn, chưa được nạp) — xem rowWarnings/rejectedRows.
              if (rowWarnings.length > 0) {
                  msg += `\n\n⚠️ ${rowWarnings.length} hồ sơ điền cả Hệ 4 và Hệ 10 (đã tự lấy điểm có tỉ lệ % cao hơn):\n` + rowWarnings.map(w => `- ${w}`).join('\n');
              }
              if (rejectedRows.length > 0) {
                  msg += `\n\n❌ ${rejectedRows.length} hồ sơ bị LOẠI do điểm không hợp lệ (CHƯA được nạp) — sửa lại đúng các dòng sau trên file Excel rồi chọn lại NGUYÊN FILE đó để import lại (hồ sơ đã nạp thành công ở trên sẽ tự bị bỏ qua vì trùng, không lo nạp đúp):\n`
                      + rejectedRows.map(r => `- Dòng ${r.dong} (${r.ten} - CCCD ${r.cccd}): ${r.loi.join('; ')}`).join('\n');
              }
              alert(msg);

          } catch(err) { alert("Lỗi đọc file: " + err.message); setImportStatus(""); }
      };
      reader.readAsArrayBuffer(importFile);
  };

  const renderDocs = (docsList) => (
    <div className="checkbox-grid">
      {docsList.map(doc => (
        <label className="checkbox-item" key={doc.id}>
          <input type="checkbox" name={doc.id} checked={!!formData[doc.id]} onChange={handleChange} />
          <span className={doc.id === 'doc_phieu_dk' ? 'text-danger fw-bold' : ''}>{doc.short} {doc.optional && <small className="text-muted fw-normal">(Không bắt buộc)</small>}</span>
        </label>
      ))}
    </div>
  );

  // ĐÃ THÊM: render nửa bảng điểm TBTS 2025 (dùng chung cho 2 khối trái/phải,
  // yêu cầu #3 — chia đôi danh sách môn thành 2 bảng nằm cạnh nhau).
  const renderHK2025TableHalf = (subjList) => (
    <div className="table-responsive border rounded">
      <table className="table table-bordered table-sm align-middle text-center mb-0">
        <thead className="table-light">
          <tr>
            <th style={{width: '110px'}} className="text-primary">MÔN</th>
            <th>HK1-11</th>
            <th>HK1-12</th>
            <th>HK2-12</th>
            <th className="text-danger" style={{width: '90px'}}>TB</th>
          </tr>
        </thead>
        <tbody>
          {subjList.map(subj => {
            const avg = getSubjectAverage(subj.id, formData);
            return (
              <tr key={subj.id}>
                <td className="fw-bold text-primary">{subj.label}</td>
                <td><input type="text" className="form-control form-control-sm text-center fw-bold text-dark" name={`diem_${subj.id}_hk1_11`} value={formData[`diem_${subj.id}_hk1_11`]} onChange={handleChange} placeholder="-" /></td>
                <td><input type="text" className="form-control form-control-sm text-center fw-bold text-dark" name={`diem_${subj.id}_hk1_12`} value={formData[`diem_${subj.id}_hk1_12`]} onChange={handleChange} placeholder="-" /></td>
                <td><input type="text" className="form-control form-control-sm text-center fw-bold text-dark" name={`diem_${subj.id}_hk2_12`} value={formData[`diem_${subj.id}_hk2_12`]} onChange={handleChange} placeholder="-" /></td>
                <td className="fw-bold text-danger bg-light">{avg > 0 ? avg : '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="xettuyen-wrapper">
      <div className="container-fluid xettuyen-main-card p-4 position-relative">
        <div className="d-flex justify-content-between align-items-center mb-4 border-bottom pb-3">
          <h3 className="fw-bold" style={{ color: '#008080' }}>
            <i className="bi bi-journal-text me-2"></i>{isEditMode ? "SỬA HỒ SƠ (UPDATE)" : "NHẬP LIỆU HỒ SƠ"}
          </h3>
          <div className="d-none d-md-flex gap-2">
              {!isEditMode && (
                  <button className="btn btn-sm btn-outline-purple fw-bold" style={{color: '#7b1fa2', borderColor: '#7b1fa2'}} onClick={() => setIsImportModalOpen(true)}>
                      <i className="bi bi-file-earmark-excel me-1"></i> Import Excel
                  </button>
              )}
              <button className="btn btn-sm btn-warning fw-bold text-dark" onClick={() => setIsSearchModalOpen(true)}>
                  <i className="bi bi-search me-1"></i> Tìm hồ sơ cũ
              </button>
              <button className="btn btn-sm btn-success fw-bold" onClick={() => fileInputRef.current.click()}>
                  <i className="bi bi-camera me-1"></i> Quét CCCD/Hộ chiếu
              </button>
              <input type="file" ref={fileInputRef} onChange={processCCCDImage} accept="image/*" style={{ display: 'none' }} />
          </div>
        </div>

        {/* ĐÃ THÊM (Pha 1·D1): bong bóng thông báo hồ sơ chờ Admin xác nhận định danh — chỉ
            hiện khi có, không chiếm chỗ lúc không cần thiết. */}
        <div className="mb-3">
          <CanXacNhanBadge />
        </div>

        {/* Bản sao 3 nút thao tác nhanh — CHỈ hiện trên di động/màn hình nhỏ (< md), nằm
            ngay dưới header "NHẬP LIỆU HỒ SƠ". Bản gốc trên header đã đổi sang
            d-none d-md-flex để tự ẩn ở mobile, tránh 2 bộ nút cùng hiện 1 lúc. */}
        <div className="d-flex d-md-none flex-wrap gap-2 mb-3">
            {!isEditMode && (
                <button type="button" className="btn btn-sm btn-outline-purple fw-bold" style={{color: '#7b1fa2', borderColor: '#7b1fa2'}} onClick={() => setIsImportModalOpen(true)}>
                    <i className="bi bi-file-earmark-excel me-1"></i> Import Excel
                </button>
            )}
            <button type="button" className="btn btn-sm btn-warning fw-bold text-dark" onClick={() => setIsSearchModalOpen(true)}>
                <i className="bi bi-search me-1"></i> Tìm hồ sơ cũ
            </button>
            <button type="button" className="btn btn-sm btn-success fw-bold" onClick={() => fileInputRef.current.click()}>
                <i className="bi bi-camera me-1"></i> Quét CCCD/Hộ chiếu
            </button>
        </div>

        <form>
          <h5 className="fw-bold text-teal mb-3" style={{ color: '#006666', borderLeft: '4px solid #008080', paddingLeft: '10px' }}>I. THÔNG TIN CHUNG</h5>
          <div className="row g-3 mb-4">
            <div className="col-md-3"><label className="form-label fw-bold small mb-1">Họ và tên <span className="text-danger">*</span></label><input type="text" className="form-control" name="hoten" value={formData.hoten} onChange={handleChange} required /></div>
            <div className="col-md-3">
                <div className="d-flex justify-content-between align-items-end">
                    <label className="form-label fw-bold small mb-1">Số CCCD/Hộ chiếu <span className="text-danger">*</span></label>
                    <span className="small fst-italic fw-bold" style={{color: scanStatus.includes('❌') ? '#d32f2f' : '#0288d1'}}>{scanStatus}</span>
                </div>
                <input type="text" className="form-control" name="cccd" value={formData.cccd} onChange={handleChange} required disabled={isEditMode} />
            </div>
            <div className="col-md-3"><label className="form-label fw-bold small mb-1">Ngày sinh <span className="text-danger">*</span></label><input type="date" className="form-control" name="ngaysinh" value={formData.ngaysinh} onChange={handleChange} required /></div>
            <div className="col-md-3">
                <label className="form-label fw-bold small mb-1">Ngành xét tuyển <span className="text-danger">*</span></label>
                <select className="form-select" name="nganh" value={formData.nganh} onChange={handleChange} required disabled={isEditMode}>
                    <option value="">-- Chọn ngành --</option>
                    {sysConfig.Nganh.map(ng => <option key={ng} value={ng}>{ng}</option>)}
                </select>
            </div>
            
            <div className="col-md-3">
                <label className="form-label fw-bold small mb-1">Đối tượng đầu vào <span className="text-danger">*</span></label>
                <select className="form-select" name="doituongdauvao" value={formData.doituongdauvao} onChange={handleChange} required>
                    <option value="">-- Chọn --</option>
                    {sysConfig.DoiTuongDauVao.map(dt => <option key={dt} value={dt}>{dt}</option>)}
                </select>
            </div>
            <div className="col-md-3">
                <label className="form-label fw-bold small mb-1">Hệ đào tạo <span className="text-danger">*</span></label>
                <select className="form-select" name="hedaotao" value={formData.hedaotao} onChange={handleChange} required>
                    <option value="">-- Chọn hệ --</option>
                    {sysConfig.HeDaoTao.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
            </div>
            <div className="col-md-3">
                <label className="form-label fw-bold small mb-1">Hình thức ĐT <span className="text-danger">*</span></label>
                <select className="form-select" name="htdaotao" value={formData.htdaotao} onChange={handleChange} required>
                    <option value="">-- Chọn HT --</option>
                    {sysConfig.HinhThucDaoTao.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
            </div>
            <div className="col-md-3">
                <label className="form-label fw-bold small mb-1">Khóa <span className="text-danger">*</span></label>
                <select className="form-select" name="khoa" value={formData.khoa} onChange={handleChange} required>
                    <option value="">-- Chọn --</option>
                    {sysConfig.KhoaNhapHoc.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
            </div>

            <div className="col-md-3">
                <label className="form-label fw-bold small mb-1">Năm xét tuyển <span className="text-danger">*</span></label>
                <select className="form-select" name="namtt" value={formData.namtt} onChange={handleChange} required>
                    <option value="">-- Chọn --</option>
                    {sysConfig.NamXetTuyen.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
            </div>
            <div className="col-md-3">
                <label className="form-label fw-bold small mb-1">Đối tượng ƯT <span className="text-danger">*</span></label>
                <select className="form-select" name="doituonguutien" value={formData.doituonguutien} onChange={handleChange} required>
                    <option value="">-- Chọn --</option>
                    {sysConfig.DoiTuongUT.map(dt => <option key={dt} value={dt}>{dt}</option>)}
                </select>
            </div>
            <div className="col-md-3">
                <label className="form-label fw-bold small mb-1">Khu vực ưu tiên <span className="text-danger">*</span></label>
                <select className="form-select" name="khuvucuutien" value={formData.khuvucuutien} onChange={handleChange} required>
                    <option value="">-- Chọn --</option>
                    {sysConfig.KhuVucUT.map(kv => <option key={kv} value={kv}>{kv}</option>)}
                </select>
            </div>
            <div className="col-md-3"><label className="form-label fw-bold small mb-1 text-primary">🔗 Link Folder hồ sơ:</label><input type="text" className="form-control border-primary" name="link_folder" value={formData.link_folder} onChange={handleChange} placeholder="Link Google Drive..." /></div>
          </div>

          <div className="row mt-5 g-4">
              <div className="col-md-6">
                  <div className="p-3 border rounded shadow-sm bg-light h-100">
                      <div className="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2">
                          <h6 className="mb-0 fw-bold text-teal">📁 HỒ SƠ CHUNG</h6>
                          <button type="button" className="btn btn-sm btn-warning fw-bold py-0" onClick={handleSelectAllCommon}>⚡ Chọn/Bỏ Chọn</button>
                      </div>
                      {renderDocs(DICT_HO_SO.chung.filter(doc => isDocApplicable(doc, formData)))}
                      
                      <div className="mt-3 d-flex align-items-center gap-2">
                          <label className="checkbox-item mb-0">
                              <input type="checkbox" name="has_giay_uutien" checked={formData.has_giay_uutien} onChange={handleChange} />
                              <span className="fw-bold text-primary">GIẤY TỜ ƯU TIÊN</span>
                          </label>
                          {formData.has_giay_uutien && (
                              <input type="text" className="form-control form-control-sm border-primary" name="giay_uutien" value={formData.giay_uutien} onChange={handleChange} placeholder="Nhập loại giấy..." style={{ width: '180px' }} />
                          )}
                      </div>
                  </div>
              </div>

              <div className="col-md-6">
                  <div className="p-3 border rounded shadow-sm bg-light h-100">
                      <div className="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2">
                          <h6 className="mb-0 fw-bold text-teal">📁 HỒ SƠ TIÊN QUYẾT</h6>
                      </div>
                      {!formData.doituongdauvao ? <div className="text-muted small fst-italic mt-2">👈 Vui lòng chọn "Đối tượng đầu vào" trước</div> : 
                          renderDocs(DICT_HO_SO.tien_quyet[formData.doituongdauvao] || [])
                      }
                  </div>
              </div>
          </div>

          <h5 className="fw-bold text-teal mb-3 mt-5" style={{ color: '#006666', borderLeft: '4px solid #008080', paddingLeft: '10px' }}>III. THÔNG TIN ĐIỂM SỐ</h5>
          <div className="score-container">
              {formData.doituongdauvao === 'Tốt nghiệp THPT' ? (
                  <div className="score-group border-primary pb-2">
                      <div className="d-flex flex-column flex-md-row align-items-start align-items-md-center gap-2 gap-md-4 mb-3 border-bottom pb-2">
                          <h6 className="mb-0 text-primary fw-bold">📊 Phương thức xét điểm:</h6>
                          <div className="d-flex flex-wrap align-items-center gap-2 gap-md-3">
                              <label className="checkbox-item mb-0">
                                  <input type="checkbox" name="check_thi_thpt"
                                         checked={formData.loai_diem === 'THI_THPT'}
                                         onChange={handleChange} />
                                  <span className="fw-bold">Điểm thi THPT</span>
                              </label>
                              <label className="checkbox-item mb-0">
                                  <input type="checkbox" name="check_hoc_ba"
                                         checked={formData.loai_diem === 'HOC_BA'}
                                         onChange={handleChange} />
                                  <span className="fw-bold">Điểm học bạ</span>
                              </label>
                              <label className="checkbox-item mb-0">
                                  <input type="checkbox" name="check_hoc_ba_2025"
                                         checked={formData.loai_diem === 'HOC_BA_2025'}
                                         onChange={handleChange} />
                                  <span className="fw-bold text-danger">TBTS 2025 (3 HK)</span>
                              </label>
                          </div>
                      </div>

                      {formData.loai_diem === 'HOC_BA_2025' ? (
                          <div className="mt-3 position-relative">
                              {/* ĐÃ SỬA (yêu cầu #3): chia danh sách môn làm 2 nửa, mỗi nửa 1 bảng,
                                  đặt cạnh nhau bằng col-md-6 — Bootstrap tự dồn xuống 1 cột trên
                                  màn hình nhỏ (< md) mà không cần thêm media query. */}
                              <div className="row g-3">
                                  <div className="col-md-6">
                                      {renderHK2025TableHalf(SUBJECTS_UI.slice(0, 6))}
                                  </div>
                                  <div className="col-md-6">
                                      {renderHK2025TableHalf(SUBJECTS_UI.slice(6))}
                                  </div>
                              </div>
                              <div className="d-flex justify-content-between align-items-center px-1 py-2 mt-2 bg-white border rounded border-danger border-opacity-25">
                                  <button type="button" className="btn btn-sm btn-outline-danger fw-bold shadow-sm" onClick={handleClearHK2025}>
                                      <i className="bi bi-trash"></i> Xóa hết điểm 3 HK
                                  </button>
                                  <div className="d-flex align-items-center gap-2">
                                      <label className="form-label small fw-bold mb-0 text-danger">ĐIỂM CỘNG:</label>
                                      <input type="text" className="form-control form-control-sm border-danger" style={{width: '80px'}} name="diem_cong" value={formData.diem_cong} onChange={handleChange} placeholder="0.0" />
                                  </div>
                              </div>
                          </div>
                      ) : (
                          <div className="score-grid mt-3">
                              {SUBJECTS_UI.map(subj => (
                                  <div key={subj.id}>
                                      <label className="form-label small fw-bold mb-1 text-primary">{subj.label}:</label>
                                      <input type="text" className="form-control form-control-sm" name={`diem_${subj.id}`} value={formData[`diem_${subj.id}`]} onChange={handleChange} placeholder="0.0" />
                                  </div>
                              ))}
                              <div>
                                  <label className="form-label small fw-bold mb-1 text-danger">ĐIỂM CỘNG:</label>
                                  <input type="text" className="form-control form-control-sm border-danger" name="diem_cong" value={formData.diem_cong} onChange={handleChange} placeholder="0.0" />
                              </div>
                          </div>
                      )}
                  </div>
              ) : formData.doituongdauvao ? (
                  <div className="score-group">
                      <h6 className="fw-bold">📊 Điểm trung bình toàn khóa:</h6>
                      <div className="row g-3 mt-1">
                          <div className="col-md-4">
                              <label className="form-label small fw-bold text-primary">ĐIỂM TB HỆ 4:</label>
                              <input type="text" className="form-control" name="diem_tb_he4" value={formData.diem_tb_he4} onChange={handleChange} placeholder="0.0" disabled={formData.diem_tb_he10.trim() !== ''} />
                          </div>
                          <div className="col-md-4">
                              <label className="form-label small fw-bold text-primary">ĐIỂM TB HỆ 10:</label>
                              <input type="text" className="form-control" name="diem_tb_he10" value={formData.diem_tb_he10} onChange={handleChange} placeholder="0.0" disabled={formData.diem_tb_he4.trim() !== ''} />
                          </div>
                          <div className="col-md-4">
                              <label className="form-label small fw-bold text-danger">ĐIỂM CỘNG:</label>
                              <input type="text" className="form-control border-danger" name="diem_cong" value={formData.diem_cong} onChange={handleChange} placeholder="0.0" />
                          </div>
                      </div>
                  </div>
              ) : null}
          </div>

          <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3 mt-4 mb-4">
              <div className="flex-grow-1 order-2 order-md-1">
                  {admissionResult && formData.nganh && formData.doituongdauvao && (
                      <div className="d-flex align-items-center gap-2 p-2 px-3 rounded shadow-sm" style={{ backgroundColor: admissionResult.boxBg, border: `1px solid ${admissionResult.boxBorder}`, maxWidth: '400px'}}>
                          <div className="fs-3 lh-1">{admissionResult.icon}</div>
                          <div>
                              <h6 className="mb-0 fw-bold text-uppercase" style={{color: admissionResult.titleColor, fontSize: '12px'}}>{admissionResult.title}</h6>
                              <div className="fw-bold mt-1" style={{fontSize: '10px', color: admissionResult.hsColor}} dangerouslySetInnerHTML={{__html: admissionResult.hsMsg}}></div>
                              <div className="fw-bold mt-1" style={{fontSize: '10px', color: '#444'}}>📊 <span dangerouslySetInnerHTML={{__html: admissionResult.diemMsg}}></span></div>
                          </div>
                      </div>
                  )}
              </div>
              
              <div className="flex-shrink-0 order-1 order-md-2 d-flex gap-2">
                  {isEditMode && (
                      <button type="button" className="btn btn-secondary px-4 py-2 fw-bold shadow-sm" onClick={handleCancelEdit}>
                          <i className="bi bi-x-circle me-2"></i> Hủy
                      </button>
                  )}
                  <button type="button" className={`btn ${isEditMode ? 'btn-warning text-dark' : 'btn-primary'} px-4 py-2 fw-bold shadow-sm`} onClick={handleAddRow}>
                      <i className={`bi ${isEditMode ? 'bi-pencil-square' : 'bi-plus-circle'} me-2`}></i>
                      {isEditMode ? "Lưu cập nhật vào danh sách" : "Thêm vào danh sách"}
                  </button>
              </div>
          </div>
        </form>

        {/* CHỈ HIỆN BẢNG KHI CÓ DỮ LIỆU */}
        {dataList.length > 0 && (
            <>
              <h5 className="fw-bold text-primary mb-3 mt-5 border-bottom pb-2">📋 DANH SÁCH CHỜ ĐỒNG BỘ ({dataList.filter(r => r["TRẠNG THÁI ĐẨY"] === "Waiting" || r["TRẠNG THÁI ĐẨY"].includes("Lỗi")).length} hồ sơ)</h5>
              <div className="table-responsive border rounded mb-3">
                  <table className="table table-bordered table-hover table-striped mb-0 align-middle" style={{ minWidth: 'max-content', fontSize: '11px', whiteSpace: 'nowrap', borderColor: '#dee2e6' }}>
                      <thead className="table-light sticky-top">
                          <tr>
                              <th className="text-center">STT</th>
                              <th className="text-center">TRẠNG THÁI</th>
                              <th className="text-center">KẾT QUẢ SƠ TUYỂN</th>
                              <th className="text-center">SỐ CCCD</th>
                              <th>TÊN SINH VIÊN</th>
                              <th>NGÀY SINH</th>
                              <th>NGÀNH</th>
                              <th className="text-center">KHÓA</th>
                              <th className="text-center">ĐỐI TƯỢNG ƯU TIÊN</th>
                              <th className="text-center">KHU VỰC ƯU TIÊN</th>
                              <th className="text-center">ĐỐI TƯỢNG ĐẦU VÀO</th>
                              <th className="text-center">NĂM XÉT TUYỂN</th>
                              <th className="text-center">HỆ ĐÀO TẠO</th>
                              <th className="text-center">HÌNH THỨC ĐÀO TẠO</th>
                              <th>LINK HỒ SƠ</th>
                              {ALL_HO_SO_DOCS.map(doc => <th key={doc.id} className="text-center">{doc.short}</th>)}
                              <th className="text-center">GIẤY ƯU TIÊN</th>
                              <th className="text-center">PHƯƠNG THỨC XÉT TUYỂN</th>
                              <th className="text-center">TOÁN</th>
                              <th className="text-center">VẬT LÍ</th>
                              <th className="text-center">HÓA HỌC</th>
                              <th className="text-center">SINH HỌC</th>
                              <th className="text-center">NGỮ VĂN</th>
                              <th className="text-center">LỊCH SỬ</th>
                              <th className="text-center">ĐỊA LÝ</th>
                              <th className="text-center">TIẾNG ANH</th>
                              <th className="text-center">TIẾNG TRUNG</th>
                              <th className="text-center">TIN HỌC</th>
                              <th className="text-center">GDKTPL</th>
                              <th className="text-center">ĐIỂM TB HỆ 4</th>
                              <th className="text-center">ĐIỂM TB HỆ 10</th>
                              <th className="text-center text-danger">ĐIỂM CỘNG</th>
                              <th className="text-center" style={{width: '90px'}}>THAO TÁC</th>
                          </tr>
                      </thead>
                      <tbody>
                          {dataList.map((row, idx) => {
                              const isUp = row["TRẠNG THÁI ĐẨY"] === "Uploaded";
                              return (
                                  <tr key={idx} className={isUp ? 'table-secondary text-muted' : ''}>
                                      <td className="text-center fw-bold">{row["STT"]}</td>
                                      <td className="text-center">
                                          <span className={`badge ${row["_Action"] === 'UPDATE' ? 'bg-info text-dark' : 'bg-success'} me-1`}>{row["_Action"]}</span>
                                          <span className={`badge ${isUp ? 'bg-success' : row["TRẠNG THÁI ĐẨY"].includes("Lỗi") ? 'bg-danger' : 'bg-warning text-dark'}`}>{row["TRẠNG THÁI ĐẨY"]}</span>
                                      </td>
                                      <td className="text-center fw-bold text-success">{row["KẾT QUẢ SƠ TUYỂN"]}</td>
                                      <td className="text-center fw-bold text-primary">{row["CĂN CƯỚC"]}</td>
                                      <td className="fw-bold">{row["TÊN SINH VIÊN"]}</td>
                                      <td>{row["NGÀY SINH"]}</td>
                                      <td>{row["NGÀNH"]}</td>
                                      <td className="text-center">{row["KHÓA"]}</td>
                                      <td className="text-center">{row["ĐỐI TƯỢNG ƯU TIÊN"]}</td>
                                      <td className="text-center">{row["KHU VỰC ƯU TIÊN"]}</td>
                                      <td className="text-center">{row["ĐỐI TƯỢNG ĐẦU VÀO"]}</td>
                                      <td className="text-center">{row["NĂM XÉT TUYỂN"]}</td>
                                      <td className="text-center">{row["HỆ ĐÀO TẠO"]}</td>
                                      <td className="text-center">{row["HÌNH THỨC ĐÀO TẠO"]}</td>
                                      <td>{row["LINK HỒ SƠ"]}</td>
                                      {ALL_HO_SO_DOCS.map(doc => <td key={doc.id} className="text-center fw-bold fs-6">{row[doc.name.toUpperCase()] === "TRUE" ? <span className="text-success">✔</span> : <span className="text-danger">✘</span>}</td>)}
                                      <td className="text-center fw-bold text-primary">{row["GIẤY TỜ ƯU TIÊN"]}</td>
                                      <td className="text-center fw-bold text-info">{row["PHƯƠNG THỨC XÉT TUYỂN"]}</td>
                                      <td className="text-center">{row["TOÁN"]}</td>
                                      <td className="text-center">{row["VẬT LÍ"] || row["VẬT LÝ"]}</td>
                                      <td className="text-center">{row["HÓA HỌC"]}</td>
                                      <td className="text-center">{row["SINH HỌC"]}</td>
                                      <td className="text-center">{row["NGỮ VĂN"]}</td>
                                      <td className="text-center">{row["LỊCH SỬ"]}</td>
                                      <td className="text-center">{row["ĐỊA LÝ"] || row["ĐỊA LÍ"]}</td>
                                      <td className="text-center">{row["TIẾNG ANH"]}</td>
                                      <td className="text-center">{row["TIẾNG TRUNG"]}</td>
                                      <td className="text-center">{row["TIN HỌC"]}</td>
                                      <td className="text-center">{row["GDKTPL"]}</td>
                                      <td className="text-center">{row["ĐIỂM TB HỆ 4"] || row["ĐIỂM TB TOÀN KHÓA HỆ 4"]}</td>
                                      <td className="text-center">{row["ĐIỂM TB HỆ 10"] || row["ĐIỂM TB TOÀN KHÓA HỆ 10"]}</td>
                                      <td className="text-center fw-bold text-danger">{row["ĐIỂM CỘNG"]}</td>
                                      <td className="text-center">
                                          {!isUp && (
                                              <div className="d-flex justify-content-center gap-1">
                                                  <button className="btn btn-sm btn-outline-primary" onClick={() => handleEditRowLocal(idx)} title="Sửa hồ sơ">✏️</button>
                                                  <button className="btn btn-sm btn-outline-danger" onClick={() => handleDeleteRow(idx)} title="Xóa hồ sơ">🗑️</button>
                                              </div>
                                          )}
                                      </td>
                                  </tr>
                              );
                          })}
                      </tbody>
                  </table>
              </div>

              <div className="d-flex justify-content-end gap-3 mt-4">
                  <button className="btn btn-secondary fw-bold" onClick={() => { if(window.confirm("Xóa toàn bộ danh sách?")) setDataList([]); }}>🗑️ Xóa hết</button>
                  <button className="btn btn-success fw-bold px-4" onClick={handlePushToCloud} disabled={isPushing}>{isPushing ? '⏳ Đang đồng bộ...' : '☁️ Đẩy dữ liệu lên hệ thống'}</button>
              </div>
            </>
        )}

        {/* MODAL IMPORT EXCEL */}
        {isImportModalOpen && (
          <div className="modal show d-block" id="import-modal-backdrop" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={(e) => { if(e.target.id === 'import-modal-backdrop') { setIsImportModalOpen(false); setImportFile(null); setImportStatus(""); }}}>
              <div className="modal-dialog modal-dialog-centered">
                  <div className="modal-content shadow-lg">
                      <div className="modal-header bg-info text-white">
                          <h5 className="modal-title fw-bold">📂 IMPORT DỮ LIỆU TỪ EXCEL</h5>
                          <button type="button" className="btn-close btn-close-white" onClick={() => {setIsImportModalOpen(false); setImportFile(null); setImportStatus("");}}></button>
                      </div>
                      <div className="modal-body p-4">
                          <button className="btn btn-outline-primary w-100 mb-3 fw-bold" onClick={handleDownloadTemplate}>⬇️ Tải file mẫu</button>
                          <div className="d-flex align-items-center gap-2 p-2 border rounded bg-light mb-3">
                              <div className="flex-grow-1 text-truncate text-muted small">{importFile ? importFile.name : "Chọn file dữ liệu..."}</div>
                              <button className="btn btn-primary btn-sm fw-bold" onClick={() => importFileRef.current.click()}>📁 Chọn file</button>
                          </div>
                          <input type="file" ref={importFileRef} accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImportFileChange} />
                          <div className="alert alert-secondary small mb-0">Chấp nhận file Excel (.xlsx, .xls) hoặc CSV chuẩn. Dòng 2 là hướng dẫn sẽ tự bỏ qua.</div>
                      </div>
                      <div className="modal-footer bg-light">
                          <span className="text-primary fw-bold me-auto small">{importStatus}</span>
                          <button type="button" className="btn btn-secondary" onClick={() => {setIsImportModalOpen(false); setImportFile(null); setImportStatus("");}}>Hủy</button>
                          <button type="button" className="btn btn-success fw-bold" onClick={executeImport} disabled={!importFile || !!importStatus}>⬆️ Upload</button>
                      </div>
                  </div>
              </div>
          </div>
        )}

        {/* MODAL TÌM KIẾM HỒ SƠ CŨ */}
        {isSearchModalOpen && (
          <div className="modal show d-block" id="search-modal-backdrop" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={(e) => { if(e.target.id === 'search-modal-backdrop') closeSearchModal(); }}>
              <div className="modal-dialog modal-lg modal-dialog-centered">
                  <div className="modal-content shadow-lg">
                      <div className="modal-header bg-info text-white">
                          <h5 className="modal-title fw-bold">🔍 TÌM HỒ SƠ CŨ (TỪ FILE TRUNG GIAN)</h5>
                          <button type="button" className="btn-close btn-close-white" onClick={closeSearchModal}></button>
                      </div>
                      <div className="modal-body p-4">
                          <div className="d-flex gap-2 mb-4">
                              <input type="text" className="form-control" placeholder="Nhập Họ tên hoặc vài số CCCD..." 
                                     value={searchKeyword} onChange={e => setSearchKeyword(e.target.value)} 
                                     onKeyDown={e => e.key === 'Enter' && executeSearchCandidate()} />
                              <button className="btn btn-warning fw-bold text-dark px-4" onClick={executeSearchCandidate} disabled={isSearching}>{isSearching ? '⏳...' : 'Tìm kiếm'}</button>
                          </div>
                          
                          <div className="table-responsive border rounded" style={{ maxHeight: '300px' }}>
                              <table className="table table-hover mb-0 align-middle" style={{fontSize: '12px'}}>
                                  <thead className="table-light"><tr><th>STT</th><th>HỌ TÊN</th><th className="text-center">CĂN CƯỚC</th><th>NGÀNH</th><th className="text-center">TRẠNG THÁI</th><th className="text-center">THAO TÁC</th></tr></thead>
                                  <tbody>
                                      {searchResults.length === 0 ? (<tr><td colSpan={6} className="text-center py-3 text-muted">Nhập từ khóa và bấm Tìm kiếm...</td></tr>) : (
                                          searchResults.map((item, index) => (
                                              <tr key={index}>
                                                  <td className="text-center">{index + 1}</td><td className="fw-bold">{item.hoTen}</td><td className="text-center fw-bold text-danger">{item.cccd}</td><td>{item.nganh}</td><td className="text-center"><span className={`badge ${item.trangThai.includes('bổ sung') ? 'bg-warning text-dark' : 'bg-secondary'}`}>{item.trangThai}</span></td>
                                                  <td className="text-center"><button className="btn btn-sm btn-outline-primary fw-bold" onClick={() => loadOldCandidate(item)}>✏️ Sửa</button></td>
                                              </tr>
                                          ))
                                      )}
                                  </tbody>
                              </table>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default XetTuyenPage;