// ĐÃ THÊM (Ký điện tử Pha 2 — Bước 6): trang "Tạo yêu cầu ký số" — route /ho-so-ky-so, chỉ
// ThamDinh/Admin vào được (khớp đúng requireAuth(['ThamDinh','Admin']) của action
// taoYeuCauKyTuFile bên GAS — xem App.jsx). Đây là trang FRONTEND cuối cùng của Bước 6, đi
// theo đúng ý tưởng người dùng mô tả: 1 trang dạng tab — "Người ký" / "Tài liệu" / "Xem
// trước & đặt chữ ký" — thay cho việc phải tự dán script vào Console để test tay như trước.
//
// PHẠM VI PHIÊN BẢN NÀY (cố ý thu hẹp, xem thêm chú thích tại action taoYeuCauKyTuFile):
//   - CHỈ hỗ trợ luồng "tải file PDF lên ký ngay, không cần mẫu" (taoYeuCauKyTuFile) — CHƯA
//     làm nhánh "chọn loại văn bản đã cấu hình sẵn" (taoYeuCauKy, Bước 5) trong trang này;
//     có thể thêm sau dưới dạng 1 nút chuyển chế độ ở đầu trang, không ảnh hưởng cấu trúc
//     3 tab hiện tại.
//   - CHỈ nhận file PDF cho tài liệu ĐỂ KÝ (không nhận ảnh/Word — xem lý do async/doPost tại
//     action backend). Tài liệu THAM KHẢO (không ký) thì không giới hạn định dạng — xem mục
//     "tài liệu tham khảo/minh chứng" trong tab "Tài liệu", ĐÃ LÀM (2026-09-09) — cột mới
//     TAI_LIEU_THAM_KHAO_JSON trên YeuCauKy (CẦN TỰ THÊM tay cột này trên Sheet).
//
// Vị trí ký (VI_TRI_KY_JSON) dùng ĐÚNG quy ước đã chốt trong kế hoạch: xTyLe/yTyLe đánh dấu
// GÓC TRÊN-TRÁI của khung ký theo hệ toạ độ CANVAS (gốc trên-trái, y tăng dần xuống) — khớp
// tự nhiên với việc bắt toạ độ click ở đây; việc đảo trục Y sang toạ độ PDF thật (gốc dưới-
// trái) làm hoàn toàn ở BACKEND (dongDauChuKyVaoPdf_/Quanlysv.gs), trang này không đụng gì.
// Khung ký vẽ ở đây (LOAI_O_INFO, đơn vị px màn hình) chỉ mang tính MINH HOẠ vị trí/tỉ lệ —
// kích thước khung THẬT lúc đóng dấu lấy từ Script Property KHUNG_CHU_KY_DAY_DU_WH/
// KHUNG_CHU_KY_NHAY_WH bên backend (đơn vị point PDF), không nhất thiết khớp pixel-for-pixel
// với minh hoạ này — ảnh chữ ký luôn được co giữ tỉ lệ vừa khung thật lúc ký, xem
// dongDauChuKyVaoPdf_.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import Swal from 'sweetalert2';
import * as pdfjsLib from 'pdfjs-dist';
import { layCauHinhChucDanhKy, taoYeuCauKyTuFile } from '../../api/studentApi';

// ĐÃ SỬA (lỗi Vite khi test: "Failed to resolve import 'pdfjs-dist/build/pdf.worker.min.mjs
// ?url'"): bản trước cố import THẲNG file worker nội bộ của gói pdfjs-dist qua Vite — lỗi vì
// đường dẫn nội bộ chính xác (có/không có ".min", đuôi ".mjs"/".js") KHÔNG ổn định giữa các
// phiên bản pdfjs-dist, và các bản mới còn giới hạn hẳn qua "exports" trong package.json nên
// Vite không resolve được nếu đường dẫn đoán sai. pdf.js BẮT BUỘC phải chạy việc giải mã PDF
// trong 1 Worker riêng (không chặn luồng chính trình duyệt) — giờ lấy thẳng file worker từ
// CDN cdnjs THEO ĐÚNG SỐ PHIÊN BẢN đã cài (pdfjsLib.version, do chính thư viện tự báo, luôn
// khớp bản đang chạy) — không cần biết cấu trúc file nội bộ của gói npm nữa, và không phụ
// thuộc Vite resolve subpath nào cả. Cần máy người dùng ra được Internet tới cdnjs.cloudflare.
// com (bình thường luôn có, khác hẳn sandbox phát triển không ra được mạng ngoài).
pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// Kích thước MINH HOẠ (px) của 2 loại khung ký trên bản xem trước — xem chú thích đầu file.
const LOAI_O_INFO = {
  DAY_DU: { nhan: 'Chữ ký đầy đủ', rongPx: 140, caoPx: 62 },
  NHAY: { nhan: 'Chữ ký nháy', rongPx: 74, caoPx: 36 },
};

let demMaChucDanh = 0;
const maChucDanhMoi = () => 'KY' + Date.now().toString(36).toUpperCase() + '_' + (++demMaChucDanh);

const TaoYeuCauKySoPage = () => {
  const navigate = useNavigate();

  const [tieuDe, setTieuDe] = useState('');
  const [cheDoKy, setCheDoKy] = useState('TUAN_TU');
  const [tab, setTab] = useState('nguoiky'); // 'nguoiky' | 'tailieu' | 'xemtruoc'

  const [dsNguoiKy, setDsNguoiKy] = useState([{ maChucDanh: maChucDanhMoi(), tenChucDanh: '', email: '', ten: '' }]);

  const [file, setFile] = useState(null);
  const [fileBase64, setFileBase64] = useState('');

  // ĐÃ THÊM (Ký điện tử Pha 2 — Bước 6, phần "tài liệu tham khảo/minh chứng" — mục còn
  // thiếu đã ghi trong kế hoạch): danh sách file ĐÍNH KÈM CHỈ ĐỂ XEM, KHÔNG ký lên (VD hồ sơ
  // gốc/minh chứng liên quan) — [{tenFile, fileBase64, mimeType}, ...]. Hoàn toàn TUỲ CHỌN
  // (có thể để trống), không đi qua bước ký/pdf-lib nào — chỉ lưu Drive + chia sẻ link xem,
  // hiện trong email "đến lượt ký" và modal xem trước ở "Hồ sơ chờ ký" (xem taoYeuCauKyTuFile
  // /xemTruocYeuCauKy, Quanlysv.gs). Không giới hạn định dạng như file để ký (không bắt buộc
  // PDF) vì các file này không cần đóng dấu chữ ký gì cả.
  const [dsTaiLieuThamKhao, setDsTaiLieuThamKhao] = useState([]);

  const [soTrang, setSoTrang] = useState(0);
  const [trangHienTai, setTrangHienTai] = useState(1);
  const [loaiODangDat, setLoaiODangDat] = useState('DAY_DU');
  const [dsViTri, setDsViTri] = useState([]); // [{id, maChucDanh, trang, xTyLe, yTyLe, loaiO}]

  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const pdfDocRef = useRef(null);
  const [dangTaiPdf, setDangTaiPdf] = useState(false);
  const [loiPdf, setLoiPdf] = useState('');

  // ĐÃ THÊM: tận dụng lại action layCauHinhChucDanhKy CHỈ để lấy trường danhSachTaiKhoan
  // (đọc toàn bộ sheet TaiKhoan, không lọc theo loại) — action này vốn đã trả kèm trường
  // đó cho đúng mục đích "dựng dropdown chọn người ký mà không cần gọi thêm API riêng" (xem
  // chú thích tại nơi khai báo, Quanlysv.gs) — loaiTaiLieu truyền vào ('GBTT') không quan
  // trọng, chỉ cần 1 loại luôn có cấu hình sẵn để tránh lỗi 404 "chưa cấu hình chức danh".
  const { data: dataTK } = useQuery({
    queryKey: ['cauHinhChucDanhKy', 'GBTT'],
    queryFn: () => layCauHinhChucDanhKy('GBTT'),
  });
  const danhSachTaiKhoan = dataTK?.danhSachTaiKhoan || [];

  // ===================== TAB "NGƯỜI KÝ" =====================
  // ĐÃ SỬA (theo phản hồi — 2 vấn đề cùng 1 gốc): (1) bug con trỏ bị bật ra ngoài ô "Mã
  // chức danh" mỗi lần gõ 1 ký tự — nguyên nhân: <tr key={nk.maChucDanh}> dùng CHÍNH giá
  // trị đang gõ làm key, nên mỗi ký tự gõ vào đổi luôn key của cả dòng -> React coi là 1
  // dòng HOÀN TOÀN MỚI, xoá input cũ tạo input mới -> mất focus/con trỏ mỗi lần gõ. (2)
  // câu hỏi "mã này có ý nghĩa gì, có cần khớp mã đã đặt trong ChucDanhKy không" — CÂU TRẢ
  // LỜI: mã này KHÔNG liên quan gì tới sheet ChucDanhKy cả (khác hẳn luồng GBTT/taoYeuCauKy
  // Bước 5, có đối chiếu ChucDanhKy thật qua xacThucNguoiKy_) — luồng tải file tự do này
  // dùng xacThucNguoiKyTuDo_ ở backend, không đọc/ghi gì vào ChucDanhKy hết. Mã chỉ là 1
  // KHOÁ NỘI BỘ, sống trong đúng 1 yêu cầu ký này thôi, để nối "người ký" ở tab này với "ô
  // ký" ở tab Xem trước — không cần và không nên đặt trùng/khớp với bất kỳ mã có sẵn nào.
  // Sửa bằng cách BỎ HẲN việc cho người dùng gõ tay mã này — tự sinh 1 LẦN lúc thêm dòng rồi
  // giữ NGUYÊN suốt vòng đời dòng đó (không còn ô nhập nào cho nó nữa, không hiện lên UI) —
  // vừa hết bug (key không đổi nữa), vừa hết luôn câu hỏi (người dùng chỉ thấy đúng 1 việc
  // cần làm: đặt "Tên chức danh" hiển thị + chọn tài khoản).
  const themNguoiKy = () => setDsNguoiKy((ds) => [...ds, { maChucDanh: maChucDanhMoi(), tenChucDanh: '', email: '', ten: '' }]);

  const xoaNguoiKy = (maChucDanh) => {
    setDsNguoiKy((ds) => ds.filter((nk) => nk.maChucDanh !== maChucDanh));
    // Bỏ gán mọi ô đã đặt cho người vừa xoá — tránh còn ô "ma" trỏ tới người không còn nữa.
    setDsViTri((ds) => ds.map((b) => (b.maChucDanh === maChucDanh ? { ...b, maChucDanh: '' } : b)));
  };

  // maChucDanh giờ BẤT BIẾN sau khi tạo dòng (xem chú thích ở themNguoiKy) — hàm này chỉ
  // còn dùng để sửa tenChucDanh/email/ten, không còn nhánh "đổi mã" nào nữa.
  const suaNguoiKy = (maChucDanh, thayDoi) => {
    setDsNguoiKy((ds) => ds.map((nk) => (nk.maChucDanh === maChucDanh ? { ...nk, ...thayDoi } : nk)));
  };

  const chonEmail = (maChucDanh, email) => {
    const tk = danhSachTaiKhoan.find((t) => t.email === email);
    suaNguoiKy(maChucDanh, { email, ten: tk ? tk.ten : '' });
  };

  // ===================== TAB "TÀI LIỆU" =====================
  const handleChonFile = (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.type !== 'application/pdf') {
      Swal.fire({
        icon: 'error', title: 'Chỉ nhận file PDF',
        text: 'Nếu là file Word/Excel/ảnh, hãy lưu (Save As/Export/In) sang PDF trước khi tải lên.',
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setFile(f);
      setFileBase64(reader.result.split(',')[1]);
      setDsViTri([]); // đổi file mới thì các vị trí đã đặt theo file cũ không còn ý nghĩa
      setTrangHienTai(1);
    };
    reader.onerror = () => Swal.fire({ icon: 'error', title: 'Không đọc được file', text: 'Vui lòng chọn lại file khác.' });
    reader.readAsDataURL(f);
  };

  // ĐÃ THÊM: đọc 1 HOẶC NHIỀU file tham khảo cùng lúc (khác handleChonFile — không giới hạn
  // định dạng, không thay thế lẫn nhau mà CỘNG DỒN vào danh sách). Đọc tuần tự bằng
  // Promise.all + FileReader (giữ nguyên khuôn FileReader như handleChonFile, chỉ khác đọc
  // nhiều file 1 lượt).
  const handleChonTaiLieuThamKhao = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    Promise.all(files.map((f) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ tenFile: f.name, mimeType: f.type || 'application/octet-stream', fileBase64: reader.result.split(',')[1] });
      reader.onerror = () => reject(new Error('Không đọc được file "' + f.name + '"'));
      reader.readAsDataURL(f);
    }))).then((moi) => {
      setDsTaiLieuThamKhao((ds) => [...ds, ...moi]);
    }).catch((err) => Swal.fire({ icon: 'error', title: 'Lỗi đọc file tham khảo', text: err.message }));
  };

  const xoaTaiLieuThamKhao = (idx) => setDsTaiLieuThamKhao((ds) => ds.filter((_, i) => i !== idx));

  // ===================== TAB "XEM TRƯỚC & ĐẶT CHỮ KÝ" =====================
  // Nạp PDF bằng pdf.js khi có file mới VÀ đang ở đúng tab này (không nạp ngầm khi chưa
  // cần, PDF có thể vài MB — không đáng phí nếu người dùng chưa từng mở tab xem trước).
  useEffect(() => {
    if (!fileBase64 || tab !== 'xemtruoc') return;
    let huy = false;
    setDangTaiPdf(true);
    setLoiPdf('');
    let bytes;
    try {
      const binStr = atob(fileBase64);
      bytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
    } catch (err) {
      setLoiPdf('File PDF bị lỗi (không decode được base64)');
      setDangTaiPdf(false);
      return;
    }
    pdfjsLib.getDocument({ data: bytes }).promise
      .then((pdf) => {
        if (huy) return;
        pdfDocRef.current = pdf;
        setSoTrang(pdf.numPages);
        setTrangHienTai((tr) => Math.min(tr, pdf.numPages) || 1);
      })
      .catch((err) => { if (!huy) setLoiPdf('Không đọc được file PDF: ' + (err?.message || err)); })
      .finally(() => { if (!huy) setDangTaiPdf(false); });
    return () => { huy = true; };
  }, [fileBase64, tab]);

  const renderTrang = useCallback(async () => {
    if (!pdfDocRef.current || !canvasRef.current || !trangHienTai) return;
    try {
      const page = await pdfDocRef.current.getPage(trangHienTai);
      const scale = 1.3;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      if (overlayRef.current) {
        overlayRef.current.style.width = viewport.width + 'px';
        overlayRef.current.style.height = viewport.height + 'px';
      }
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
    } catch (err) {
      setLoiPdf('Không vẽ được trang PDF: ' + (err?.message || err));
    }
  }, [trangHienTai]);

  useEffect(() => { renderTrang(); }, [renderTrang, soTrang]);

  // Click lên bản xem trước = đặt 1 ô ký MỚI tại đúng điểm click (góc TRÊN-TRÁI của ô) —
  // xTyLe/yTyLe tính theo % kích thước canvas đang hiển thị, không phụ thuộc scale render.
  const handleClickOverlay = (e) => {
    if (!overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const xTyLe = (e.clientX - rect.left) / rect.width;
    const yTyLe = (e.clientY - rect.top) / rect.height;
    if (xTyLe < 0 || xTyLe > 1 || yTyLe < 0 || yTyLe > 1) return;
    const id = 'box_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    setDsViTri((ds) => [...ds, { id, maChucDanh: '', trang: trangHienTai, xTyLe, yTyLe, loaiO: loaiODangDat }]);
    // Mở ngay hộp thoại gán người ký cho ô vừa đặt, đỡ phải bấm thêm 1 lần vào ô.
    setTimeout(() => moGanNguoiKy(id, { maChucDanh: '', trang: trangHienTai, xTyLe, yTyLe, loaiO: loaiODangDat }), 0);
  };

  // Mở hộp thoại (SweetAlert2 — nhất quán với toàn bộ phần còn lại của trang) để gán/đổi
  // người ký cho 1 ô, hoặc xoá hẳn ô đó. `boxTamThoi` dùng khi gọi ngay sau khi vừa tạo ô
  // (state dsViTri có thể chưa kịp cập nhật tại thời điểm gọi do setTimeout ở trên).
  const moGanNguoiKy = (id, boxTamThoi) => {
    const box = boxTamThoi || dsViTri.find((b) => b.id === id);
    if (!box) return;
    const nguoiKyHopLe = dsNguoiKy.filter((nk) => nk.maChucDanh.trim() && nk.email.trim());
    if (nguoiKyHopLe.length === 0) {
      setDsViTri((ds) => ds.filter((b) => b.id !== id)); // ô vừa đặt vô nghĩa nếu chưa có ai để gán
      Swal.fire({ icon: 'warning', title: 'Chưa có người ký nào', text: 'Vào tab "Người ký" thêm ít nhất 1 người (đủ email) trước khi đặt vị trí ký.' });
      return;
    }
    const options = {};
    nguoiKyHopLe.forEach((nk) => { options[nk.maChucDanh] = (nk.tenChucDanh || nk.maChucDanh) + ' — ' + (nk.ten || nk.email); });
    Swal.fire({
      title: 'Gán người ký cho ô này',
      input: 'select',
      inputOptions: options,
      inputPlaceholder: '-- Chọn người ký --',
      inputValue: box.maChucDanh,
      showCancelButton: true,
      showDenyButton: true,
      confirmButtonText: 'Gán',
      denyButtonText: 'Xoá ô này',
      cancelButtonText: box.maChucDanh ? 'Đóng' : 'Huỷ (bỏ ô)',
      denyButtonColor: '#dc3545',
    }).then((r) => {
      if (r.isConfirmed && r.value) {
        setDsViTri((ds) => {
          const daCo = ds.some((b) => b.id === id);
          const boCu = daCo ? ds : [...ds, box];
          return boCu.map((b) => (b.id === id ? { ...b, maChucDanh: r.value } : b));
        });
      } else if (r.isDenied) {
        setDsViTri((ds) => ds.filter((b) => b.id !== id));
      } else if (!box.maChucDanh) {
        // Bấm Huỷ ngay sau khi vừa tạo, chưa từng gán ai — bỏ luôn ô vô nghĩa này.
        setDsViTri((ds) => ds.filter((b) => b.id !== id));
      }
    });
  };

  // ===================== GỬI YÊU CẦU =====================
  const submitMutation = useMutation({
    mutationFn: taoYeuCauKyTuFile,
    onSuccess: (ket) => {
      Swal.fire({
        icon: 'success', title: 'Đã tạo yêu cầu ký',
        html: (ket?.message || '') + (ket?.maYeuCau ? `<br/><span class="text-muted small">Mã yêu cầu: ${ket.maYeuCau}</span>` : ''),
        confirmButtonText: 'Xem trong "Đã ký / Lịch sử"',
      }).then(() => navigate('/ho-so-cho-ky'));
    },
    onError: (err) => Swal.fire({ icon: 'error', title: 'Lỗi tạo yêu cầu ký', text: err.message }),
  });

  const kiemTraTruocKhiGui = () => {
    if (!tieuDe.trim()) return 'Thiếu tiêu đề văn bản.';
    if (!file || !fileBase64) return 'Chưa chọn file PDF để ký (tab "Tài liệu").';
    // maChucDanh giờ tự sinh 1 lần/dòng và bất biến (xem maChucDanhMoi) nên không còn khả năng
    // trùng nhau như trước — bỏ luôn bước kiểm tra trùng mã (không còn ý nghĩa với người dùng).
    const nguoiKyHopLe = dsNguoiKy.filter((nk) => nk.maChucDanh.trim() && nk.email.trim());
    if (nguoiKyHopLe.length === 0) return 'Chưa thêm người ký nào (tab "Người ký").';
    const boxChuaGan = dsViTri.filter((b) => !b.maChucDanh.trim());
    if (boxChuaGan.length > 0) return `Còn ${boxChuaGan.length} ô ký chưa gán người ký (tab "Xem trước & đặt chữ ký").`;
    const thieuViTri = nguoiKyHopLe.filter((nk) => !dsViTri.some((b) => b.maChucDanh === nk.maChucDanh));
    if (thieuViTri.length > 0) return 'Chưa đặt vị trí ký cho: ' + thieuViTri.map((nk) => nk.tenChucDanh || nk.maChucDanh).join(', ') + ' (tab "Xem trước & đặt chữ ký").';
    return '';
  };

  const handleGui = () => {
    const loi = kiemTraTruocKhiGui();
    if (loi) { Swal.fire({ icon: 'warning', title: 'Chưa thể gửi', text: loi }); return; }
    const nguoiKyHopLe = dsNguoiKy.filter((nk) => nk.maChucDanh.trim() && nk.email.trim());
    Swal.fire({
      icon: 'question', title: 'Gửi yêu cầu ký này?',
      html: `Văn bản <b>${tieuDe}</b> sẽ được gửi cho ${nguoiKyHopLe.length} người ký` + (cheDoKy === 'SONG_SONG' ? ' (song song).' : ', theo thứ tự đã thêm.'),
      showCancelButton: true, confirmButtonText: 'Gửi ngay', cancelButtonText: 'Xem lại', confirmButtonColor: '#198754',
    }).then((r) => {
      if (!r.isConfirmed) return;
      submitMutation.mutate({
        tieuDe: tieuDe.trim(),
        fileBase64,
        mimeType: 'application/pdf',
        tenFile: file.name,
        nguoiKy: nguoiKyHopLe.map((nk) => ({ maChucDanh: nk.maChucDanh, tenChucDanh: nk.tenChucDanh || nk.maChucDanh, email: nk.email, ten: nk.ten })),
        viTriKyJson: dsViTri.map(({ id, ...rest }) => rest),
        cheDoKy,
        taiLieuThamKhao: dsTaiLieuThamKhao,
      });
    });
  };

  // ===================== RENDER =====================
  return (
    <div className="container-fluid py-4" style={{ maxWidth: 1000 }}>
      <h4 className="fw-bold mb-4" style={{ color: '#037683' }}>
        <i className="bi bi-file-earmark-check me-2"></i>TẠO YÊU CẦU KÝ SỐ (TỪ FILE TẢI LÊN)
      </h4>

      {/* Khối luôn hiện, không thuộc tab nào — tiêu đề + chế độ ký, cần cho mọi bước sau. */}
      <div className="card shadow-sm mb-3">
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-8">
              <label className="form-label fw-bold small">Tiêu đề văn bản</label>
              <input
                type="text" className="form-control"
                placeholder='VD: "Quyết định công nhận tốt nghiệp — Nguyễn Văn A"'
                value={tieuDe} onChange={(e) => setTieuDe(e.target.value)}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label fw-bold small">Chế độ ký</label>
              <div className="d-flex gap-3 pt-2">
                <div className="form-check">
                  <input className="form-check-input" type="radio" id="cdk-tt" checked={cheDoKy === 'TUAN_TU'} onChange={() => setCheDoKy('TUAN_TU')} />
                  <label className="form-check-label" htmlFor="cdk-tt">Tuần tự</label>
                </div>
                <div className="form-check">
                  <input className="form-check-input" type="radio" id="cdk-ss" checked={cheDoKy === 'SONG_SONG'} onChange={() => setCheDoKy('SONG_SONG')} />
                  <label className="form-check-label" htmlFor="cdk-ss">Song song</label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button className={`nav-link ${tab === 'nguoiky' ? 'active' : ''}`} onClick={() => setTab('nguoiky')}>
            <i className="bi bi-people me-1"></i>Người ký {dsNguoiKy.filter((nk) => nk.maChucDanh && nk.email).length > 0 && (
              <span className="badge bg-secondary ms-1">{dsNguoiKy.filter((nk) => nk.maChucDanh && nk.email).length}</span>
            )}
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${tab === 'tailieu' ? 'active' : ''}`} onClick={() => setTab('tailieu')}>
            <i className="bi bi-file-earmark-pdf me-1"></i>Tài liệu {file && <i className="bi bi-check-circle-fill text-success ms-1"></i>}
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${tab === 'xemtruoc' ? 'active' : ''}`} onClick={() => setTab('xemtruoc')}>
            <i className="bi bi-eye me-1"></i>Xem trước &amp; đặt chữ ký {dsViTri.length > 0 && <span className="badge bg-secondary ms-1">{dsViTri.length}</span>}
          </button>
        </li>
      </ul>

      {/* ===== TAB NGƯỜI KÝ ===== */}
      {tab === 'nguoiky' && (
        <div className="card shadow-sm">
          <div className="card-body">
            <p className="text-muted small">
              Đặt 1 tên chức danh hiển thị và chọn 1 tài khoản (email) đã đăng ký trong hệ thống cho mỗi người ký.
              Danh sách này chỉ dùng riêng cho yêu cầu ký này — <b>không liên quan gì tới cấu hình chức danh ký (ChucDanhKy)</b> đang dùng cho Giấy báo trúng tuyển, nên không cần đặt/khớp mã gì cả và cũng không tạo thêm dòng nào trong đó.
            </p>
            <div className="table-responsive">
              <table className="table table-sm table-bordered align-middle mb-2">
                <thead className="table-light">
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>Tên chức danh</th>
                    <th>Tài khoản (email)</th>
                    <th style={{ width: 140 }}>Chữ ký</th>
                    <th style={{ width: 50 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {dsNguoiKy.map((nk, idx) => {
                    const tk = danhSachTaiKhoan.find((t) => t.email === nk.email);
                    return (
                      <tr key={nk.maChucDanh}>
                        <td>{idx + 1}</td>
                        <td>
                          <input
                            type="text" className="form-control form-control-sm"
                            placeholder="VD: Trưởng khoa"
                            value={nk.tenChucDanh}
                            onChange={(e) => suaNguoiKy(nk.maChucDanh, { tenChucDanh: e.target.value })}
                          />
                        </td>
                        <td>
                          <select className="form-select form-select-sm" value={nk.email} onChange={(e) => chonEmail(nk.maChucDanh, e.target.value)}>
                            <option value="">-- Chưa chọn --</option>
                            {danhSachTaiKhoan.map((t) => (
                              <option key={t.email} value={t.email}>{t.ten} ({t.email})</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          {!nk.email ? (
                            <span className="badge bg-secondary">Chưa chọn</span>
                          ) : tk?.coChuKy ? (
                            <span className="badge bg-success">Đã có chữ ký</span>
                          ) : (
                            <span className="badge bg-danger">Chưa có chữ ký</span>
                          )}
                        </td>
                        <td>
                          <button className="btn btn-sm btn-outline-danger" onClick={() => xoaNguoiKy(nk.maChucDanh)} disabled={dsNguoiKy.length <= 1}>
                            <i className="bi bi-trash"></i>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button className="btn btn-sm btn-outline-primary" onClick={themNguoiKy}>
              <i className="bi bi-plus-lg me-1"></i>Thêm người ký
            </button>
          </div>
        </div>
      )}

      {/* ===== TAB TÀI LIỆU ===== */}
      {tab === 'tailieu' && (
        <div className="card shadow-sm">
          <div className="card-body">
            <p className="text-muted small">
              Tài liệu ĐỂ KÝ — hiện chỉ nhận file PDF sẵn (chưa hỗ trợ ảnh/Word ở bước tạo yêu cầu — xem ghi chú kỹ thuật ở đầu file mã nguồn). Nếu là file Word/Excel, hãy lưu (Save As/Export) sang PDF trước.
            </p>
            <input type="file" accept="application/pdf" className="form-control" onChange={handleChonFile} />
            {file && (
              <div className="alert alert-success mt-3 mb-0 py-2 small d-flex align-items-center gap-2">
                <i className="bi bi-file-earmark-pdf-fill fs-5"></i>
                <div>
                  <div className="fw-bold">{file.name}</div>
                  <div className="text-muted">{(file.size / 1024).toFixed(0)} KB — sang tab "Xem trước &amp; đặt chữ ký" để đặt vị trí ký.</div>
                </div>
              </div>
            )}

            <hr className="my-4" />

            {/* ĐÃ THÊM: tài liệu tham khảo/minh chứng — KHÔNG ký lên, chỉ đính kèm để người
                ký xem thêm (VD hồ sơ gốc). Hoàn toàn tuỳ chọn. */}
            <p className="text-muted small mb-2">
              <b>Tài liệu tham khảo/minh chứng</b> (tuỳ chọn) — đính kèm để người ký xem thêm, KHÔNG bị ký lên. Có thể chọn bất kỳ định dạng nào, nhiều file cùng lúc.
            </p>
            <input type="file" multiple className="form-control" onChange={handleChonTaiLieuThamKhao} />
            {dsTaiLieuThamKhao.length > 0 && (
              <ul className="list-group mt-2">
                {dsTaiLieuThamKhao.map((tl, idx) => (
                  <li key={idx} className="list-group-item d-flex justify-content-between align-items-center py-1 small">
                    <span><i className="bi bi-paperclip me-1"></i>{tl.tenFile}</span>
                    <button className="btn btn-sm btn-outline-danger" onClick={() => xoaTaiLieuThamKhao(idx)}>
                      <i className="bi bi-trash"></i>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ===== TAB XEM TRƯỚC & ĐẶT CHỮ KÝ ===== */}
      {tab === 'xemtruoc' && (
        <div className="card shadow-sm">
          <div className="card-body">
            {!file && (
              <div className="alert alert-warning mb-0">Chưa có tài liệu — sang tab "Tài liệu" chọn file PDF trước.</div>
            )}
            {file && loiPdf && <div className="alert alert-danger">{loiPdf}</div>}
            {file && !loiPdf && (
              <>
                <div className="d-flex flex-wrap align-items-center gap-3 mb-3">
                  <div>
                    <label className="form-label small fw-bold mb-1 d-block">Loại ô sắp đặt</label>
                    <div className="btn-group btn-group-sm">
                      {Object.entries(LOAI_O_INFO).map(([key, info]) => (
                        <button
                          key={key}
                          className={`btn ${loaiODangDat === key ? 'btn-primary' : 'btn-outline-primary'}`}
                          onClick={() => setLoaiODangDat(key)}
                        >
                          {info.nhan}
                        </button>
                      ))}
                    </div>
                  </div>
                  {soTrang > 1 && (
                    <div>
                      <label className="form-label small fw-bold mb-1 d-block">Trang</label>
                      <div className="btn-group btn-group-sm">
                        <button className="btn btn-outline-secondary" disabled={trangHienTai <= 1} onClick={() => setTrangHienTai((t) => t - 1)}>
                          <i className="bi bi-chevron-left"></i>
                        </button>
                        <span className="btn btn-outline-secondary disabled">{trangHienTai}/{soTrang}</span>
                        <button className="btn btn-outline-secondary" disabled={trangHienTai >= soTrang} onClick={() => setTrangHienTai((t) => t + 1)}>
                          <i className="bi bi-chevron-right"></i>
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="text-muted small flex-grow-1">
                    <i className="bi bi-info-circle me-1"></i>Bấm vào bản xem trước để đặt 1 ô ký mới (góc ô nằm đúng tại điểm bấm). Bấm lại vào 1 ô đã đặt để đổi người ký hoặc xoá ô đó.
                  </div>
                </div>

                {dangTaiPdf && <div className="text-muted">Đang tải bản xem trước...</div>}

                <div style={{ overflow: 'auto', maxHeight: '70vh', border: '1px solid #dee2e6', display: 'inline-block' }}>
                  <div style={{ position: 'relative' }}>
                    <canvas ref={canvasRef} style={{ display: 'block' }} />
                    <div
                      ref={overlayRef}
                      onClick={handleClickOverlay}
                      style={{ position: 'absolute', top: 0, left: 0, cursor: 'crosshair' }}
                    >
                      {dsViTri.filter((b) => b.trang === trangHienTai).map((b) => {
                        const info = LOAI_O_INFO[b.loaiO] || LOAI_O_INFO.DAY_DU;
                        const nk = dsNguoiKy.find((n) => n.maChucDanh === b.maChucDanh);
                        return (
                          <div
                            key={b.id}
                            onClick={(e) => { e.stopPropagation(); moGanNguoiKy(b.id); }}
                            title="Bấm để đổi người ký / xoá ô này"
                            style={{
                              position: 'absolute',
                              left: `${b.xTyLe * 100}%`,
                              top: `${b.yTyLe * 100}%`,
                              width: info.rongPx, height: info.caoPx,
                              border: nk ? '2px solid #198754' : '2px dashed #dc3545',
                              background: nk ? 'rgba(25,135,84,0.15)' : 'rgba(220,53,69,0.15)',
                              cursor: 'pointer', fontSize: 11, padding: 3, overflow: 'hidden', lineHeight: 1.2,
                            }}
                          >
                            {nk ? <><b>{nk.tenChucDanh || nk.maChucDanh}</b><br />{nk.ten || nk.email}</> : 'Chưa gán — bấm để chọn'}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="d-flex justify-content-end mt-3">
        <button className="btn btn-success" onClick={handleGui} disabled={submitMutation.isPending}>
          {submitMutation.isPending ? (
            <><span className="spinner-border spinner-border-sm me-2"></span>Đang gửi...</>
          ) : (
            <><i className="bi bi-send-check me-1"></i>Gửi yêu cầu ký</>
          )}
        </button>
      </div>
    </div>
  );
};

export default TaoYeuCauKySoPage;