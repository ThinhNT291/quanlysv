import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import './XetTuyen.css';

// ==========================================
// 1. TỪ ĐIỂN DỮ LIỆU & CẤU HÌNH API
// ==========================================
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

const DICT_HO_SO = {
    chung: [
        { id: "doc_syll", name: "Sơ yếu lý lịch", short: "SƠ YẾU LÝ LỊCH", optional: false },
        { id: "doc_cccd", name: "Bản sao ID", short: "BẢN SAO CCCD", optional: false },
        { id: "doc_anhthe", name: "Ảnh thẻ", short: "ẢNH THẺ", optional: false },
        { id: "doc_nvqs", name: "Giấy chuyển NVQS (với nam)", short: "GIẤY NVQS", optional: true }
    ],
    tien_quyet: {
        "Tốt nghiệp THPT": [ { id: "doc_phieu_dk", name: "Phiếu đăng ký dự tuyển", short: "PHIẾU ĐĂNG KÝ" }, { id: "doc_bang_thpt", name: "Bản sao Bằng THPT/Giấy báo điểm", short: "BẰNG THPT" }, { id: "doc_hocba_thpt", name: "Bản sao Học bạ THPT", short: "HỌC BẠ THPT" } ],
        "Tốt nghiệp Trung cấp sau 2022": [ { id: "doc_phieu_dk", name: "Phiếu đăng ký dự tuyển", short: "PHIẾU ĐĂNG KÝ" }, { id: "doc_bang_tc", name: "Bản sao Bằng Trung cấp", short: "BẰNG TC" }, { id: "doc_diem_tc", name: "Bảng điểm Trung cấp", short: "ĐIỂM TC" }, { id: "doc_ktvh_thpt", name: "Bằng THPT/GCN đủ KL KTVH THPT", short: "GCN KTVH" } ],
        "Tốt nghiệp Cao đẳng": [ { id: "doc_phieu_dk", name: "Phiếu đăng ký dự tuyển", short: "PHIẾU ĐĂNG KÝ" }, { id: "doc_bang_cd", name: "Bằng Cao đẳng", short: "BẰNG CĐ" }, { id: "doc_diem_cd", name: "Bảng điểm Cao đẳng", short: "ĐIỂM CĐ" } ],
        "Tốt nghiệp Đại học": [ { id: "doc_phieu_dk", name: "Phiếu đăng ký dự tuyển", short: "PHIẾU ĐĂNG KÝ" }, { id: "doc_bang_dh", name: "Bằng Đại học", short: "BẰNG ĐH" }, { id: "doc_diem_dh", name: "Bảng điểm Đại học", short: "ĐIỂM ĐH" } ],
        "Tốt nghiệp Trung cấp trước 2022": [ { id: "doc_phieu_dk", name: "Phiếu đăng ký dự tuyển", short: "PHIẾU ĐĂNG KÝ" }, { id: "doc_gcn_gdpt", name: "GCN hoàn thành CT GDPT", short: "GCN GDPT" }, { id: "doc_bang_tc_truoc", name: "Bản sao Bằng Trung cấp trước 2022", short: "BẰNG TC (<2022)" }, { id: "doc_diem_tc_truoc", name: "Bảng điểm Trung cấp trước 2022", short: "ĐIỂM TC (<2022)" } ],
        "Trung học nghề": [ { id: "doc_phieu_dk", name: "Phiếu đăng ký dự tuyển", short: "PHIẾU ĐĂNG KÝ" }, { id: "doc_gcn_gdpt", name: "GCN hoàn thành CT GDPT", short: "GCN GDPT" }, { id: "doc_bang_tc_truoc", name: "Bản sao Bằng Trung cấp trước 2022", short: "BẰNG TC (<2022)" }, { id: "doc_diem_tc_truoc", name: "Bảng điểm Trung cấp trước 2022", short: "ĐIỂM TC (<2022)" } ]
    }
};

const ALL_HO_SO_DOCS = [...DICT_HO_SO.chung, ...Object.values(DICT_HO_SO.tien_quyet).flat()]
    .filter((doc, i, arr) => arr.findIndex(d => d.id === doc.id) === i);

const initialFormState = {
  hoten: '', cccd: '', ngaysinh: '', khoa: '', nganh: '', khuvucuutien: '', doituonguutien: '', 
  doituongdauvao: '', namtt: '', hedaotao: '', htdaotao: '', link_folder: '', 
  has_giay_uutien: false, giay_uutien: '', 
  diem_toan: '', diem_vatli: '', diem_hoahoc: '', diem_sinhhoc: '', diem_nguvan: '', diem_lichsu: '', 
  diem_dialy: '', diem_tienganh: '', diem_tiengtrung: '', diem_tinhoc: '', diem_gdktpl: '', 
  diem_tb_he4: '', diem_tb_he10: '', diem_cong: '', diem_chuan: '', 
  ...ALL_HO_SO_DOCS.reduce((acc, doc) => ({ ...acc, [doc.id]: false }), {})
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
    return user?.token || user?.credential || user?.idToken || localStorage.getItem('gg_id_token');
};

const getUserEmail = () => {
    const user = JSON.parse(localStorage.getItem('tuyensinh_user'));
    return user?.username || user?.email || "Unknown";
}

const XetTuyenPage = () => {
  const [formData, setFormData] = useState(initialFormState);
  const [dataList, setDataList] = useState([]); 
  const [admissionResult, setAdmissionResult] = useState(null);
  const [isPushing, setIsPushing] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  // ==========================================
  // STATE LƯU CẤU HÌNH TỪ BACKEND
  // ==========================================
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

  // ==========================================
  // TẢI CẤU HÌNH TỪ BACKEND KHI MỞ TRANG
  // ==========================================
  useEffect(() => {
    const fetchConfig = async () => {
        try {
            const res = await fetch(`${WEB_APP_URL}?action=getConfig`);
            const result = await res.json();
            if (result.code === 200 && result.data) {
                // Nếu Backend có dữ liệu thì lấy, nếu trống thì rớt về từ điển mặc định
                setSysConfig({
                    Nganh: result.data.Nganh?.length ? result.data.Nganh : Object.keys(DICT_NGANH),
                    KhoaNhapHoc: result.data.KhoaNhapHoc?.length ? result.data.KhoaNhapHoc : ["01", "02"],
                    DoiTuongUT: result.data.DoiTuongUT?.length ? result.data.DoiTuongUT : Object.keys(DICT_DOI_TUONG),
                    KhuVucUT: result.data.KhuVucUT?.length ? result.data.KhuVucUT : Object.keys(DICT_KHU_VUC),
                    NamXetTuyen: result.data.NamXetTuyen?.length ? result.data.NamXetTuyen : ["2026", "2027"],
                    DoiTuongDauVao: result.data.DoiTuongDauVao?.length ? result.data.DoiTuongDauVao : Object.keys(DICT_HO_SO.tien_quyet),
                    HeDaoTao: result.data.HeDaoTao?.length ? result.data.HeDaoTao : ["Đại học chính quy", "Cao đẳng"],
                    HinhThucDaoTao: result.data.HinhThucDaoTao?.length ? result.data.HinhThucDaoTao : ["Chính quy đại trà"]
                });
            }
        } catch (e) { console.error("Lỗi tải cấu hình:", e); }
    };
    fetchConfig();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            if (isImportModalOpen) { setIsImportModalOpen(false); setImportFile(null); setImportStatus(""); } 
            else if (isSearchModalOpen) { setIsSearchModalOpen(false); }
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

    if (name.startsWith('diem_') && type === 'text') finalValue = finalValue.replace(',', '.');
    
    if (name === 'diem_tb_he4' && finalValue.trim() !== '') setFormData(prev => ({...prev, diem_tb_he10: ''}));
    if (name === 'diem_tb_he10' && finalValue.trim() !== '') setFormData(prev => ({...prev, diem_tb_he4: ''}));

    setFormData(prev => ({
      ...prev, [name]: finalValue,
      ...(name === 'doituongdauvao' ? Object.values(DICT_HO_SO.tien_quyet).flat().reduce((acc, doc) => ({...acc, [doc.id]: false}), {}) : {})
    }));
  };

  const handleSelectAllCommon = () => {
    setFormData(prev => {
        const allRequiredDocs = DICT_HO_SO.chung.filter(doc => !doc.optional);
        const isAllSelected = allRequiredDocs.every(doc => prev[doc.id]);
        
        const newState = { ...prev };
        DICT_HO_SO.chung.forEach(doc => newState[doc.id] = !isAllSelected);
        return newState;
    });
  };

  useEffect(() => {
    const { nganh, doituongdauvao, khuvucuutien, doituonguutien } = formData;
    if (!nganh || !doituongdauvao) { setAdmissionResult(null); return; }

    let missingChung = []; let missingTienQuyet = [];
    
    DICT_HO_SO.chung.forEach(doc => { 
        if (!doc.optional && !formData[doc.id]) missingChung.push(doc.name); 
    });
    
    const dsTienQuyet = DICT_HO_SO.tien_quyet[doituongdauvao] || [];
    dsTienQuyet.forEach(doc => { if (!formData[doc.id]) missingTienQuyet.push(doc.name); });

    let hsStatus = "OK", hsColor = "#155724", hsMsg = "✔️ Trạng thái hồ sơ: Đầy đủ.";
    if (missingTienQuyet.length > 0) { hsStatus = "FAIL"; hsColor = "#721c24"; hsMsg = `❌ Bắt buộc bổ sung: ${missingTienQuyet.join(', ')}.`; } 
    else if (missingChung.length > 0) { hsStatus = "WARN"; hsColor = "#856404"; hsMsg = `⚠️ Yêu cầu bổ sung: ${missingChung.join(', ')}.`; }

    let diemStatus = "FAIL", diemMsg = "";
    if (doituongdauvao === "Tốt nghiệp THPT") {
        let maxScore = 0, bestCombo = "";
        (DICT_NGANH[nganh] || []).forEach(maToHop => {
            let subjects = DICT_TO_HOP[maToHop];
            if(subjects) {
                let total = (parseFloat(formData[subjects[0]]) || 0) + (parseFloat(formData[subjects[1]]) || 0) + (parseFloat(formData[subjects[2]]) || 0);
                if (total > maxScore && (parseFloat(formData[subjects[0]]) > 0 && parseFloat(formData[subjects[1]]) > 0 && parseFloat(formData[subjects[2]]) > 0)) { 
                    maxScore = total; bestCombo = maToHop; 
                }
            }
        });

        if (maxScore === 0) diemMsg = `Chưa nhập đủ điểm để xét tổ hợp.`;
        else {
            let uTienBanDau = (DICT_KHU_VUC[khuvucuutien] || 0) + (DICT_DOI_TUONG[doituonguutien] || 0);
            let uTienChinhThuc = maxScore >= 22.5 ? ((30 - maxScore) / 7.5) * uTienBanDau : uTienBanDau;
            let finalScore = Math.round((maxScore + uTienChinhThuc) * 100) / 100;
            if (finalScore >= 15.0) { diemStatus = "PASS"; diemMsg = `Tổng điểm: ${finalScore}đ (Tổ hợp: ${bestCombo} = ${maxScore}đ). Chuẩn: 15.0đ.`; } 
            else { diemMsg = `Tổng điểm: ${finalScore}đ. Thiếu ${(15.0 - finalScore).toFixed(2)}đ.`; }
        }
    } else {
        let he4 = parseFloat(formData.diem_tb_he4); let he10 = parseFloat(formData.diem_tb_he10);
        if (he4 >= 2.0 || he10 >= 5.0) { diemStatus = "PASS"; diemMsg = `Đạt chuẩn điểm hệ CĐ/ĐH/TC.`; } 
        else { diemMsg = `Không đạt chuẩn điểm.`; }
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
        if (isDup) { alert("Hồ sơ này ĐÃ CÓ trong danh sách chờ bên dưới!"); return; }
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
        "TOÁN": formData.diem_toan, "VẬT LÍ": formData.diem_vatli, "HÓA HỌC": formData.diem_hoahoc, "SINH HỌC": formData.diem_sinhhoc,
        "NGỮ VĂN": formData.diem_nguvan, "LỊCH SỬ": formData.diem_lichsu, "ĐỊA LÝ": formData.diem_dialy, "TIẾNG ANH": formData.diem_tienganh,
        "TIẾNG TRUNG": formData.diem_tiengtrung, "TIN HỌC": formData.diem_tinhoc, "GDKTPL": formData.diem_gdktpl,
        "ĐIỂM TB HỆ 4": formData.diem_tb_he4, "ĐIỂM TB HỆ 10": formData.diem_tb_he10, "ĐIỂM CỘNG": formData.diem_cong,
        "ĐIỂM CHUẨN": formData.diem_chuan, 
        
        "TRẠNG THÁI THẨM ĐỊNH": isEditMode ? "Mới bổ sung" : "Chưa thẩm định",
        "NGÀY CẬP NHẬT HỒ SƠ": new Date().toLocaleString('vi-VN'),
        "TÀI KHOẢN NHẬP LIỆU": getUserEmail()
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

  const handleEditRowLocal = (index) => {
    const row = dataList[index];
    if(!window.confirm(`Bạn có muốn tải hồ sơ của [${row["TÊN SINH VIÊN"]}] lên Form để chỉnh sửa lại không?`)) return;

    setFormData(prev => ({
        ...prev,
        hoten: row["TÊN SINH VIÊN"] || "",
        cccd: row["CĂN CƯỚC"] || "",
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
        diem_tb_he4: row["ĐIỂM TB HỆ 4"] || row["ĐIỂM TB TOÀN KHÓA HỆ 4"] || "",
        diem_tb_he10: row["ĐIỂM TB HỆ 10"] || row["ĐIỂM TB TOÀN KHÓA HỆ 10"] || "",
        diem_cong: row["ĐIỂM CỘNG"] || "",
        diem_chuan: row["ĐIỂM CHUẨN"] || "",
        has_giay_uutien: !!row["GIẤY TỜ ƯU TIÊN"],
        giay_uutien: row["GIẤY TỜ ƯU TIÊN"] || "",
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
        payloadParams.append('data', JSON.stringify(pendingList.map(row => {
            const copyRow = { ...row };
            if (copyRow["CĂN CƯỚC"]) {
                copyRow["CĂN CƯỚC"] = "'" + copyRow["CĂN CƯỚC"];
            }
            delete copyRow["TRẠNG THÁI ĐẨY"];
            return copyRow;
        })));

        const response = await fetch(WEB_APP_URL, { method: "POST", body: payloadParams });
        const result = await response.json();
        
        if (result.code === 200) {
            const failedItems = result.data?.failedList || [];
            
            setDataList(prev => prev.map(r => {
                if (r["TRẠNG THÁI ĐẨY"] === "Waiting" || r["TRẠNG THÁI ĐẨY"].includes("Lỗi")) {
                    const rCccd = String(r["CĂN CƯỚC"]).replace(/\D/g, '');
                    const rNganh = String(r["NGÀNH"]).trim().toLowerCase();
                    const isFailed = failedItems.some(f => f.cccd === rCccd && f.nganh.toLowerCase() === rNganh);
                    
                    if (isFailed) {
                        return {...r, "TRẠNG THÁI ĐẨY": "Lỗi: Trùng hồ sơ"};
                    } else {
                        return {...r, "TRẠNG THÁI ĐẨY": "Uploaded"};
                    }
                }
                return r;
            }));
            alert(result.message);
        } else {
            alert(`Lỗi Server: ${result.message}`);
        }
    } catch (error) { alert(`Lỗi kết nối mạng: ${error.message}`); } 
    finally { setIsPushing(false); }
  };

  const processCCCDImage = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const token = getToken();
      if (!token) { 
          alert("Lỗi xác thực: Vui lòng đăng nhập lại Google để sử dụng AI!"); 
          e.target.value = ""; return; 
      }

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
              payloadParams.append('data', JSON.stringify({ idToken: token, imageBase64: base64String, mimeType: 'image/jpeg' }));

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

                  if (hetHan) {
                      alert(`${loaiGiayTo === "hochieu" ? "Hộ chiếu" : "CCCD"} đã HẾT HIỆU LỰC (${hanSuDung}).`);
                      setScanStatus(`❌ Hết hạn (${hanSuDung})`);
                      return;
                  }

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
      const token = getToken();
      if (!token) { alert("Lỗi xác thực: Vui lòng đăng nhập lại Google!"); setIsSearching(false); return; }

      try {
          const payloadParams = new URLSearchParams();
          payloadParams.append('action', 'searchOldRecord');
          payloadParams.append('data', JSON.stringify({ idToken: token, keyword: searchKeyword }));

          const response = await fetch(WEB_APP_URL, { method: 'POST', body: payloadParams });
          const result = await response.json();
          if (result.code === 200) { setSearchResults(result.data); } else { setSearchResults([]); alert(result.message); }
      } catch(e) { alert("Lỗi hệ thống."); } finally { setIsSearching(false); }
  };

  const loadOldCandidate = (record) => {
      if(!window.confirm(`⚠️ CHÚ Ý: Việc chỉnh sửa sẽ ghi đè lên dữ liệu cũ của thí sinh [${record.hoTen}]. Bạn có chắc chắn muốn Tải lên Form?`)) return;
      const normData = record.fullData;
      setFormData(prev => ({
          ...prev, 
          hoten: normData["TÊN SINH VIÊN"] || normData["HoTen"] || "",
          cccd: normData["CĂN CƯỚC"] || normData["CCCD"] || "", 
          nganh: normData["NGÀNH"] || normData["Nganh"] || "",
          ngaysinh: normData["NGÀY SINH"] || "",
          khoa: normData["KHÓA"] || "", khuvucuutien: normData["KHU VỰC ƯU TIÊN"] || "",
          doituonguutien: normData["ĐỐI TƯỢNG ƯU TIÊN"] || "", doituongdauvao: normData["ĐỐI TƯỢNG ĐẦU VÀO"] || "",
          namtt: normData["NĂM XÉT TUYỂN"] || "", hedaotao: normData["HỆ ĐÀO TẠO"] || "", 
          htdaotao: normData["HÌNH THỨC ĐÀO TẠO"] || "", link_folder: normData["LINK HỒ SƠ"] || "",
          has_giay_uutien: !!normData["GIẤY TỜ ƯU TIÊN"],
          giay_uutien: normData["GIẤY TỜ ƯU TIÊN"] || ""
      }));
      setIsEditMode(true);
      setIsSearchModalOpen(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleImportFileChange = (e) => {
      const file = e.target.files[0];
      if (file) setImportFile(file);
  };

  const handleDownloadTemplate = () => {
      setImportStatus("⏳ Đang tạo file mẫu...");
      try {
          const headers = [
              "TT", "CĂN CƯỚC", "TÊN SINH VIÊN", "NGÀY SINH", "NGÀNH", "KHÓA",
              "ĐỐI TƯỢNG ƯU TIÊN", "KHU VỰC ƯU TIÊN", "ĐỐI TƯỢNG ĐẦU VÀO", "NĂM XÉT TUYỂN",
              "HỆ ĐÀO TẠO", "HÌNH THỨC ĐÀO TẠO", "PHIẾU ĐĂNG KÝ DỰ TUYỂN", "SƠ YẾU LÝ LỊCH",
              "BẢN SAO ID", "ẢNH THẺ", "GIẤY CHUYỂN NVQS (VỚI NAM)", "BẢN SAO BẰNG THPT/GIẤY BÁO ĐIỂM", "BẢN SAO HỌC BẠ THPT",
              "BẢN SAO BẰNG TRUNG CẤP", "BẢNG ĐIỂM TRUNG CẤP", "BẰNG THPT/GCN ĐỦ KL KTVH THPT",
              "BẢN SAO BẰNG TRUNG CẤP TRƯỚC 2022", "BẢNG ĐIỂM TRUNG CẤP TRƯỚC 2022", "GCN HOÀN THÀNH CT GDPT",
              "BẰNG CAO ĐẲNG", "BẢNG ĐIỂM CAO ĐẲNG", "BẰNG ĐẠI HỌC", "BẢNG ĐIỂM ĐẠI HỌC", "GIẤY TỜ ƯU TIÊN",
              "TOÁN", "VẬT LÍ", "HÓA HỌC", "SINH HỌC", "NGỮ VĂN", "LỊCH SỬ", "ĐỊA LÝ",
              "TIẾNG ANH", "TIẾNG TRUNG", "TIN HỌC", "GDKTPL",
              "ĐIỂM TB HỆ 4", "ĐIỂM TB HỆ 10", "ĐIỂM CỘNG", "ĐIỂM CHUẨN", "LINK HỒ SƠ"
          ];
          const ws = XLSX.utils.aoa_to_sheet([headers, ["(Dòng hướng dẫn) Nhập dữ liệu từ dòng số 3..."]]);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "Mau_Nhap_Lieu");
          XLSX.writeFile(wb, "FileMau_NhapLieu_TuyenSinh.xlsx");
          setImportStatus("");
      } catch (e) { setImportStatus("❌ Lỗi tạo file"); }
  };

  const executeImport = () => {
      if (!importFile) return;
      setImportStatus("⏳ Đang đọc file...");

      const reader = new FileReader();
      reader.onload = (e) => {
          try {
              const data = new Uint8Array(e.target.result);
              const workbook = XLSX.read(data, { type: 'array' });
              const sheet = workbook.Sheets[workbook.SheetNames[0]];
              const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

              if (rows.length < 3) { alert("File không hợp lệ hoặc rỗng."); setImportStatus(""); return; }

              const headers = rows[0].map(h => String(h).trim().toUpperCase().replace(/\s+/g, ' '));
              const dataRows = rows.slice(2);
              
              const getField = (rowArr, aliasArray) => {
                  for (let alias of aliasArray) {
                      const aliasClean = alias.trim().toUpperCase().replace(/\s+/g, ' ');
                      const idx = headers.findIndex(h => h === aliasClean || h.includes(aliasClean));
                      if (idx !== -1) return String(rowArr[idx] || "").trim();
                  }
                  return "";
              };

              let importedCount = 0; let dupCount = 0; const newItems = [];
              const sttBase = dataList.length;

              dataRows.forEach((rowArr) => {
                  if (rowArr.every(cell => String(cell || "").trim() === "")) return;

                  const cccdVal = getField(rowArr, ["CĂN CƯỚC", "CCCD", "SỐ CCCD"]);
                  const nganhVal = getField(rowArr, ["NGÀNH"]);
                  
                  const isDup = dataList.some(r => String(r["CĂN CƯỚC"]).replace(/\D/g, '') === cccdVal.replace(/\D/g, '') && String(r["NGÀNH"]).trim().toLowerCase() === nganhVal.toLowerCase());
                  
                  if (isDup) { dupCount++; } else {
                      const newRow = {
                          "STT": sttBase + importedCount + 1, "TRẠNG THÁI ĐẨY": "Waiting", "_Action": "INSERT",
                          "KẾT QUẢ SƠ TUYỂN": getField(rowArr, ["KẾT QUẢ SƠ TUYỂN", "KẾT QUẢ"]),
                          "CĂN CƯỚC": cccdVal, "TÊN SINH VIÊN": getField(rowArr, ["TÊN SINH VIÊN", "HỌ VÀ TÊN"]),
                          "NGÀY SINH": getField(rowArr, ["NGÀY SINH"]), "NGÀNH": nganhVal,
                          "KHÓA": getField(rowArr, ["KHÓA"]), "ĐỐI TƯỢNG ƯU TIÊN": getField(rowArr, ["ĐỐI TƯỢNG ƯU TIÊN"]),
                          "KHU VỰC ƯU TIÊN": getField(rowArr, ["KHU VỰC ƯU TIÊN", "KHU VỰC"]), "ĐỐI TƯỢNG ĐẦU VÀO": getField(rowArr, ["ĐỐI TƯỢNG ĐẦU VÀO", "ĐẦU VÀO"]),
                          "NĂM XÉT TUYỂN": getField(rowArr, ["NĂM XÉT TUYỂN", "NĂM TRÚNG TUYỂN"]), "HỆ ĐÀO TẠO": getField(rowArr, ["HỆ ĐÀO TẠO", "HỆ"]),
                          "HÌNH THỨC ĐÀO TẠO": getField(rowArr, ["HÌNH THỨC ĐÀO TẠO", "HÌNH THỨC"]), "LINK HỒ SƠ": getField(rowArr, ["LINK HỒ SƠ"]),
                          "GIẤY TỜ ƯU TIÊN": getField(rowArr, ["GIẤY TỜ ƯU TIÊN", "GIẤY ƯU TIÊN"]),
                          
                          "TOÁN": getField(rowArr, ["TOÁN"]), "VẬT LÍ": getField(rowArr, ["VẬT LÍ", "VẬT LÝ"]), "HÓA HỌC": getField(rowArr, ["HÓA HỌC"]), 
                          "SINH HỌC": getField(rowArr, ["SINH HỌC"]), "NGỮ VĂN": getField(rowArr, ["NGỮ VĂN"]), "LỊCH SỬ": getField(rowArr, ["LỊCH SỬ"]), 
                          "ĐỊA LÝ": getField(rowArr, ["ĐỊA LÝ", "ĐỊA LÍ"]), "TIẾNG ANH": getField(rowArr, ["TIẾNG ANH"]), "TIẾNG TRUNG": getField(rowArr, ["TIẾNG TRUNG"]), 
                          "TIN HỌC": getField(rowArr, ["TIN HỌC"]), "GDKTPL": getField(rowArr, ["GDKTPL", "GIÁO DỤC KINH TẾ"]),
                          "ĐIỂM TB HỆ 4": getField(rowArr, ["HỆ 4", "ĐIỂM TB TOÀN KHÓA HỆ 4"]), "ĐIỂM TB HỆ 10": getField(rowArr, ["HỆ 10", "ĐIỂM TB TOÀN KHÓA HỆ 10"]), "ĐIỂM CỘNG": getField(rowArr, ["ĐIỂM CỘNG"]),
                          "ĐIỂM CHUẨN": getField(rowArr, ["ĐIỂM CHUẨN"]), 
                          
                          "TRẠNG THÁI THẨM ĐỊNH": "Chưa thẩm định",
                          "NGÀY CẬP NHẬT HỒ SƠ": new Date().toLocaleString('vi-VN'),
                          "TÀI KHOẢN NHẬP LIỆU": getUserEmail()
                      };
                      
                      ALL_HO_SO_DOCS.forEach(doc => {
                          const val = getField(rowArr, [doc.name.toUpperCase(), doc.short]);
                          newRow[doc.name.toUpperCase()] = (val === "TRUE" || val === "1" || val.toUpperCase() === "CÓ" || val.toUpperCase() === "V") ? "TRUE" : "FALSE";
                      });

                      newItems.push(newRow);
                      importedCount++;
                  }
              });

              if (newItems.length > 0) setDataList(prev => [...prev, ...newItems]);
              
              setImportStatus(""); setIsImportModalOpen(false); setImportFile(null);
              let msg = `Đã nạp ${importedCount} hồ sơ từ file Excel.`;
              if (dupCount > 0) msg += `\n⚠️ Bỏ qua ${dupCount} hồ sơ trùng CCCD + Ngành.`;
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

  return (
    <div className="container-fluid bg-white p-4 rounded shadow-sm position-relative">
      <div className="d-flex justify-content-between align-items-center mb-4 border-bottom pb-3">
        <h3 className="fw-bold" style={{ color: '#008080' }}>
          <i className="bi bi-journal-text me-2"></i>{isEditMode ? "SỬA HỒ SƠ (UPDATE)" : "NHẬP LIỆU HỒ SƠ"}
        </h3>
        <div className="d-flex gap-2">
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

      <form>
        {isEditMode && <div className="alert alert-warning fw-bold small"><i className="bi bi-exclamation-triangle-fill me-2"></i>Chế độ Chỉnh sửa: KHÔNG THỂ thay đổi CCCD và Ngành đào tạo.</div>}

        <h5 className="fw-bold text-teal mb-3" style={{ color: '#006666', borderLeft: '4px solid #008080', paddingLeft: '10px' }}>I. THÔNG TIN CHUNG</h5>
        <div className="row g-3 mb-4">
          {/* Hàng 1: NỐI ỐNG NƯỚC DROPDOWN */}
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
          
          {/* Hàng 2 */}
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

          {/* Hàng 3 */}
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

        {/* PHẦN II: CHECKLIST CHIA 2 CỘT */}
        <div className="row mt-5 g-4">
            <div className="col-md-6">
                <div className="p-3 border rounded shadow-sm bg-light h-100">
                    <div className="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2">
                        <h6 className="mb-0 fw-bold text-teal">📁 HỒ SƠ CHUNG</h6>
                        <button type="button" className="btn btn-sm btn-warning fw-bold py-0" onClick={handleSelectAllCommon}>⚡ Chọn/Bỏ Chọn</button>
                    </div>
                    {renderDocs(DICT_HO_SO.chung)} 
                    
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
                <div className="score-group">
                    <h4>📊 Điểm kỳ thi THPT:</h4>
                    <div className="score-grid">
                        {['toan', 'vatli', 'hoahoc', 'sinhhoc', 'nguvan', 'lichsu', 'dialy', 'tienganh', 'tiengtrung', 'tinhoc', 'gdktpl'].map(subject => (
                            <div key={subject}><label className="form-label small fw-bold mb-1 text-uppercase">{subject}:</label><input type="text" className="form-control form-control-sm" name={`diem_${subject}`} value={formData[`diem_${subject}`]} onChange={handleChange} placeholder="0.0" /></div>
                        ))}
                    </div>
                </div>
            ) : formData.doituongdauvao ? (
                <div className="score-group">
                    <h4>📊 Điểm trung bình toàn khóa:</h4>
                    <div className="row g-3">
                        <div className="col-md-4"><label className="form-label small fw-bold">ĐIỂM TB HỆ 4:</label><input type="text" className="form-control" name="diem_tb_he4" value={formData.diem_tb_he4} onChange={handleChange} placeholder="0.0" disabled={formData.diem_tb_he10.trim() !== ''} /></div>
                        <div className="col-md-4"><label className="form-label small fw-bold">ĐIỂM TB HỆ 10:</label><input type="text" className="form-control" name="diem_tb_he10" value={formData.diem_tb_he10} onChange={handleChange} placeholder="0.0" disabled={formData.diem_tb_he4.trim() !== ''} /></div>
                        <div className="col-md-4"><label className="form-label small fw-bold text-danger">ĐIỂM CỘNG (Nếu có):</label><input type="text" className="form-control border-danger" name="diem_cong" value={formData.diem_cong} onChange={handleChange} placeholder="0.0" /></div>
                    </div>
                </div>
            ) : null}
        </div>

        <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3 mt-4 mb-4">
            <div className="flex-grow-1 order-2 order-md-1">
                {admissionResult && formData.nganh && formData.doituongdauvao && (
                    <div className="d-flex align-items-center gap-3 p-3 rounded shadow-sm" style={{ backgroundColor: admissionResult.boxBg, border: `2px solid ${admissionResult.boxBorder}`, maxWidth: '600px'}}>
                        <div className="display-4 lh-1">{admissionResult.icon}</div>
                        <div>
                            <h5 className="mb-1 fw-bold text-uppercase" style={{color: admissionResult.titleColor}}>{admissionResult.title}</h5>
                            <div className="fw-bold" style={{fontSize: '14px', color: admissionResult.hsColor}} dangerouslySetInnerHTML={{__html: admissionResult.hsMsg}}></div>
                            <div className="fw-bold mt-1" style={{fontSize: '14px', color: '#444'}}>📊 Kết quả: <span dangerouslySetInnerHTML={{__html: admissionResult.diemMsg}}></span></div>
                        </div>
                    </div>
                )}
            </div>
            
            <div className="flex-shrink-0 order-1 order-md-2">
                <button type="button" className={`btn ${isEditMode ? 'btn-warning text-dark' : 'btn-primary'} px-4 py-3 fw-bold shadow-sm`} onClick={handleAddRow}>
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
                <table className="table table-bordered table-hover table-striped mb-0 align-middle" style={{ minWidth: 'max-content', fontSize: '12px', whiteSpace: 'nowrap', borderColor: '#dee2e6' }}>
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
        <div className="modal show d-block" id="search-modal-backdrop" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={(e) => { if(e.target.id === 'search-modal-backdrop') setIsSearchModalOpen(false); }}>
            <div className="modal-dialog modal-lg modal-dialog-centered">
                <div className="modal-content shadow-lg">
                    <div className="modal-header bg-info text-white">
                        <h5 className="modal-title fw-bold">🔍 TÌM HỒ SƠ CŨ (TỪ FILE TRUNG GIAN)</h5>
                        <button type="button" className="btn-close btn-close-white" onClick={() => setIsSearchModalOpen(false)}></button>
                    </div>
                    <div className="modal-body p-4">
                        <div className="d-flex gap-2 mb-4">
                            <input type="text" className="form-control" placeholder="Nhập Họ tên hoặc vài số CCCD..." 
                                   value={searchKeyword} onChange={e => setSearchKeyword(e.target.value)} 
                                   onKeyDown={e => e.key === 'Enter' && executeSearchCandidate()} />
                            <button className="btn btn-warning fw-bold text-dark px-4" onClick={executeSearchCandidate} disabled={isSearching}>{isSearching ? '⏳...' : 'Tìm kiếm'}</button>
                        </div>
                        
                        <div className="table-responsive border rounded" style={{ maxHeight: '300px' }}>
                            <table className="table table-hover mb-0 align-middle">
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
  );
};

export default XetTuyenPage;