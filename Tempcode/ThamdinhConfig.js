// ĐÃ PORT NGUYÊN từ thamdinh_-_data_config.js (repo Thẩm định vanilla JS cũ) —
// không đổi giá trị, chỉ đổi cú pháp const/export cho khớp module ES.

export const DICT_KHU_VUC = { "KV 01": 0.75, "KV 02-NT": 0.5, "KV 02": 0.25, "KV 03": 0 };
export const DICT_DOI_TUONG = { "Không ưu tiên": 0, "ĐT 01": 2, "ĐT 02": 2, "ĐT 03": 2, "ĐT 04": 2, "ĐT 05": 1, "ĐT 06": 1, "ĐT 07": 1 };

export const DICT_TO_HOP = {
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

export const DICT_NGANH = {
    "CNTT - ĐHKTS": ["A00", "A01", "A02", "C01", "C02", "D01", "X02", "X06", "X10", "X26"],
    "Quản trị kinh doanh": ["A00", "A01", "D01", "D09", "D10", "D45", "D65", "X01", "X25", "X37"],
    "Ngôn ngữ Anh": ["A01", "C03", "C04", "D01", "D09", "D10", "D14", "D15", "X25", "X26"],
    "Ngôn ngữ Trung Quốc": ["A01", "C00", "C03", "C04", "D01", "D04", "D45", "D65", "X01", "X37"],
    "Quản trị dịch vụ du lịch và lữ hành": ["A01", "C00", "C03", "C04", "D01", "D04", "D45", "D65", "X25", "X37"]
};

export const DICT_HO_SO = {
    chung: [
        { id: "doc_syll", name: "Sơ yếu lý lịch" },
        { id: "doc_cccd", name: "Bản sao CCCD" },
        { id: "doc_anhthe", name: "Ảnh thẻ" }
    ],
    tien_quyet: {
        "Tốt nghiệp THPT": [ { id: "doc_phieu_dk", name: "Phiếu đăng ký dự tuyển" }, { id: "doc_bang_thpt", name: "Bản sao Bằng THPT/Giấy báo điểm" }, { id: "doc_hocba_thpt", name: "Bản sao Học bạ THPT" } ],
        "Tốt nghiệp Trung cấp sau 2022": [ { id: "doc_phieu_dk", name: "Phiếu đăng ký dự tuyển" }, { id: "doc_bang_tc", name: "Bản sao Bằng Trung cấp" }, { id: "doc_diem_tc", name: "Bảng điểm Trung cấp" }, { id: "doc_ktvh_thpt", name: "Bằng THPT/GCN đủ KL KTVH THPT" } ],
        "Tốt nghiệp Cao đẳng": [ { id: "doc_phieu_dk", name: "Phiếu đăng ký dự tuyển" }, { id: "doc_bang_cd", name: "Bằng Cao đẳng" }, { id: "doc_diem_cd", name: "Bảng điểm Cao đẳng" } ],
        "Tốt nghiệp Đại học": [ { id: "doc_phieu_dk", name: "Phiếu đăng ký dự tuyển" }, { id: "doc_bang_dh", name: "Bằng Đại học" }, { id: "doc_diem_dh", name: "Bảng điểm Đại học" } ],
        "Tốt nghiệp Trung cấp trước 2022": [ { id: "doc_phieu_dk", name: "Phiếu đăng ký dự tuyển" }, { id: "doc_gcn_gdpt", name: "GCN hoàn thành CT GDPT" }, { id: "doc_bang_tc_truoc", name: "Bản sao Bằng TC trước 2022" }, { id: "doc_diem_tc_truoc", name: "Bảng điểm TC trước 2022" } ],
        "Trung học nghề": [ { id: "doc_phieu_dk", name: "Phiếu đăng ký dự tuyển" }, { id: "doc_gcn_gdpt", name: "GCN hoàn thành CT GDPT" }, { id: "doc_bang_tc_truoc", name: "Bản sao Bằng TC trước 2022" }, { id: "doc_diem_tc_truoc", name: "Bảng điểm TC trước 2022" } ]
    }
};

// Port từ app.js cũ (không phải data_config.js) — dùng cho generateMaSV()/getBestScoreText()
export const SUBJ_MAP = {
    "diem_toan": "TOÁN", "diem_vatli": "VẬT LÍ", "diem_hoahoc": "HÓA HỌC", "diem_sinhhoc": "SINH HỌC",
    "diem_nguvan": "NGỮ VĂN", "diem_lichsu": "LỊCH SỬ", "diem_dialy": "ĐỊA LÝ", "diem_tienganh": "TIẾNG ANH",
    "diem_tiengtrung": "TIẾNG TRUNG", "diem_tinhoc": "TIN HỌC", "diem_gdktpl": "GDKTPL"
};

export const MAP_HE_DAO_TAO = { "Cao đẳng": "01", "Đại học chính quy": "02", "Liên thông ĐH - ĐH (Văn bằng 2)": "03", "Thường xuyên: Phương thức ĐTTX": "04", "Liên thông từ CĐ lên ĐH": "05", "Thường xuyên: Phương thức VLVH": "06", "Thạc sĩ": "07", "Khóa ngắn hạn cấp chứng chỉ": "08" };
export const MAP_HINH_THUC = { "Chính quy đại trà": "1", "Liên thông ĐH - ĐH chính quy (VB 2)": "2", "Thường xuyên: Phương thức ĐTTX": "3", "Thường xuyên: Phương thức VLVH": "4" };

// Whitelist domain link hồ sơ — chỉ mở link nếu thuộc 1 trong các domain này (chống mở
// link độc hại nếu dữ liệu Sheet bị chèn link lạ).
export const ALLOWED_LINK_HOSTS = ["drive.google.com", "docs.google.com"];

// Loại hồ sơ đã bị hủy ở repo Xét tuyển (form nhập liệu không còn thu thập nữa) ->
// KHÔNG kiểm tra/không tính thiếu, kể cả khi DICT_HO_SO còn sót mục này ở đâu đó.
export const DOC_IDS_DA_HUY = ["doc_khaisinh"];
export const DOC_NAMES_DA_HUY = ["bản sao giấy khai sinh", "giấy khai sinh"];
export function isDocDaHuy(doc) {
    if (!doc) return true;
    if (DOC_IDS_DA_HUY.includes(doc.id)) return true;
    const nameLower = String(doc.name || "").toLowerCase().trim();
    return DOC_NAMES_DA_HUY.includes(nameLower);
}