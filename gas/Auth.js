// ============================================================================
// Auth.gs — Đăng nhập/phiên làm việc & bảo mật: tạo/kiểm tra session nội bộ,
// requireAuth (chặn quyền theo action), xác thực Google ID token, phân quyền theo vai
// trò (roles), băm mật khẩu, khởi tạo khoá bảo mật. TÁCH RA từ Quanlysv.gs (2026-09-10),
// hành vi giữ nguyên 100% — xem ghi chú đầu Quanlysv.gs.
// ============================================================================



// ĐÃ THÊM: thời hạn phiên đăng nhập cho tài khoản NỘI BỘ (không có Gmail) — 8 tiếng.
// Dùng PropertiesService thay vì CacheService vì CacheService giới hạn cứng tối đa
// 6 tiếng (21600 giây), không đủ cho yêu cầu 8 tiếng — PropertiesService không tự hết
// hạn nên phải tự canh "exp" và tự xoá khi phát hiện quá hạn (xem validateSession).
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

// Tạo phiên đăng nhập mới cho tài khoản nội bộ, trả về token ngẫu nhiên (UUID) —
// gọi ngay sau khi action 'login' xác thực username/password thành công.
function createSession(email, roles, name) {
  cleanupExpiredSessions(); // dọn rác nhẹ mỗi lần có người đăng nhập, tránh phình PropertiesService theo thời gian
  const token = Utilities.getUuid();
  const props = PropertiesService.getScriptProperties();
  props.setProperty('session_' + token, JSON.stringify({
    email: email, roles: roles, name: name, exp: Date.now() + SESSION_TTL_MS
  }));
  return token;
}

// Kiểm tra 1 sessionToken còn hợp lệ không — dùng cho tài khoản nội bộ thay cho
// verifyGoogleIdToken() (tài khoản nội bộ không có JWT Google để kiểm).
// ĐÃ SỬA: GIA HẠN KIỂU TRƯỢT (sliding session) — mỗi lần gọi (tức mỗi request được
// xác thực thành công) tự dời hạn hết phiên sang "bây giờ + 8 tiếng". Người đang
// thao tác liên tục sẽ không bao giờ bị văng ra giữa chừng; chỉ ai NGỒI KHÔNG đúng
// 8 tiếng liền mới thực sự hết phiên. Không cần cơ chế "xin gia hạn" riêng.
function validateSession(sessionToken) {
  if (!sessionToken) return { valid: false, message: "Thiếu phiên đăng nhập." };
  const props = PropertiesService.getScriptProperties();
  const key = 'session_' + sessionToken;
  const raw = props.getProperty(key);
  if (!raw) return { valid: false, message: "Phiên đăng nhập không tồn tại hoặc đã bị thu hồi." };
  const session = JSON.parse(raw);
  if (Date.now() > session.exp) {
    props.deleteProperty(key);
    return { valid: false, message: "Phiên đăng nhập đã hết hạn do không thao tác quá 8 tiếng, vui lòng đăng nhập lại." };
  }
  // Gia hạn trượt: mỗi lần xác thực thành công, dời hạn hết phiên thêm 8 tiếng kể từ bây giờ.
  session.exp = Date.now() + SESSION_TTL_MS;
  props.setProperty(key, JSON.stringify(session));
  return { valid: true, email: session.email, roles: session.roles, name: session.name };
}

// Dọn các session hết hạn trong PropertiesService — PropertiesService không tự xoá
// như CacheService, nếu không dọn thì key rác cứ tích tụ mãi (giới hạn 500 property/script).
// Chạy nhẹ, chỉ khi có người đăng nhập mới (không chạy trên MỌI request để đỡ tốn thời gian).
function cleanupExpiredSessions() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  const now = Date.now();
  Object.keys(all).forEach(key => {
    if (key.indexOf('session_') !== 0) return;
    try {
      const session = JSON.parse(all[key]);
      if (!session.exp || now > session.exp) props.deleteProperty(key);
    } catch (e) {
      props.deleteProperty(key); // rác không parse được thì xoá luôn
    }
  });
}

// ===============================================
// ĐÃ THÊM: cổng xác thực dùng chung cho MỌI action (GET lẫn POST). Trước bản vá
// này, 11/15 action (toàn bộ CRUD sinh viên/giấy tờ/cấu hình + import) hoàn toàn
// KHÔNG kiểm tra idToken/quyền gì cả — ai có URL Web App (URL này nằm sẵn trong
// studentApi.js, ai mở DevTools cũng thấy) đều gọi thẳng để xem/sửa/xoá dữ liệu
// sinh viên mà không cần đăng nhập. allowedRoles=[] nghĩa là chỉ cần đăng nhập
// hợp lệ (bất kỳ role nào), không giới hạn role cụ thể.
// ĐÃ SỬA: giờ nhận cả object "params" (thay vì chỉ idToken) — thử xác thực Google
// (idToken) trước, nếu không có mới thử phiên đăng nhập nội bộ (sessionToken).
// Nhờ vậy tài khoản nội bộ (username/password) giờ gọi được các action đã khoá.
// ===============================================
// ĐÃ SỬA: đảo thứ tự ưu tiên — kiểm sessionToken nội bộ TRƯỚC idToken Google. Trước
// đây idToken luôn được thử trước, mà frontend luôn gửi kèm idToken (dù rỗng hay đã
// hết hạn) ở MỌI request -> hễ Google JWT hết hạn cứng sau 1 tiếng (không thể tự gia
// hạn phía server, khác hẳn sessionToken nội bộ trượt hạn 8 tiếng) là verifyGoogleIdToken
// thất bại và request bị từ chối NGAY, dù sessionToken vẫn còn hạn ngon lành. Vì vậy
// tài khoản Google phải phụ thuộc hoàn toàn vào cơ chế "One Tap silent renew" ở client
// (App.jsx) để giữ idToken luôn mới — cơ chế này vốn mong manh (cần cookie bên thứ 3
// hoặc FedCM mà không phải trình duyệt nào cũng hỗ trợ đủ, Google tự khoá popup sau khi
// bị từ chối 1 lần...) nên hay bị "gia hạn thất bại" dù đã vá nhiều lần. Giờ action
// 'verifyToken' cấp luôn sessionToken nội bộ cho tài khoản Google (y hệt tài khoản
// thường) — requireAuth() ưu tiên dùng cái này, không còn phụ thuộc Google có chịu gia
// hạn ngầm hay không nữa. Vẫn giữ nhánh idToken làm dự phòng cho user đã đăng nhập từ
// TRƯỚC bản vá này (localStorage cũ chưa có sessionToken) — họ dùng tạm idToken cũ tới
// khi hết hạn tự nhiên (tối đa ~1 tiếng) rồi đăng nhập lại 1 lần là có sessionToken.
function requireAuth(params, allowedRoles) {
  const idToken = params && params.idToken;
  const sessionToken = params && params.sessionToken;

  let userInfo;
  if (sessionToken) {
    const sess = validateSession(sessionToken);
    if (sess.valid) {
      userInfo = { email: sess.email, roles: sess.roles, name: sess.name };
    } else if (idToken) {
      const auth = verifyGoogleIdToken(idToken);
      if (!auth.valid) return { ok: false, resp: responseJSON(401, sess.message, null) };
      userInfo = getUserInfoFromSheet(auth.email);
      if (!userInfo) return { ok: false, resp: responseJSON(403, "Tài khoản " + auth.email + " chưa được cấp quyền truy cập!", null) };
    } else {
      return { ok: false, resp: responseJSON(401, sess.message, null) };
    }
  } else if (idToken) {
    const auth = verifyGoogleIdToken(idToken);
    if (!auth.valid) return { ok: false, resp: responseJSON(401, auth.message, null) };
    userInfo = getUserInfoFromSheet(auth.email);
    if (!userInfo) return { ok: false, resp: responseJSON(403, "Tài khoản " + auth.email + " chưa được cấp quyền truy cập!", null) };
  } else {
    return { ok: false, resp: responseJSON(401, "Vui lòng đăng nhập.", null) };
  }

  if (allowedRoles && allowedRoles.length > 0 && !hasAnyRole(userInfo, allowedRoles)) {
    return { ok: false, resp: responseJSON(403, "Bạn không có quyền sử dụng chức năng này", null) };
  }
  return { ok: true, userInfo };
}

function verifyGoogleIdToken(idToken) {
  if (!idToken) return { valid: false, message: "Thiếu idToken — vui lòng đăng nhập Google." };
  
  const CLIENT_ID = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID');
  try {
    const resp = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken), { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return { valid: false, message: "Phiên đăng nhập đã hết hạn." };
    
    const payload = JSON.parse(resp.getContentText());
    if (payload.aud !== CLIENT_ID) return { valid: false, message: "Token không thuộc hệ thống này." };
    if (!payload.email || payload.email_verified !== "true") return { valid: false, message: "Tài khoản Google chưa xác minh." };
    
    return { valid: true, email: String(payload.email).trim().toLowerCase(), name: payload.name || "User" };
  } catch (err) {
    return { valid: false, message: "Lỗi xác minh: " + err.toString() };
  }
}

// ĐÃ THÊM: tách 1 ô Role (có thể ghi nhiều role cách nhau bằng dấu phẩy, vd
// "TuyenSinh,ThamDinh") thành mảng chữ thường, dùng chung cho mọi nơi cần so quyền.
function parseRoles(rawRoleCell) {
  return String(rawRoleCell || "")
    .split(",")
    .map(r => r.trim().toLowerCase())
    .filter(Boolean);
}

// ĐÃ THÊM: helper so quyền không phân biệt hoa/thường, hỗ trợ multi-role —
// dùng thay cho kiểu cũ `['ThamDinh','Admin'].includes(userInfo.role)` (bug: so
// phân biệt hoa/thường nên "Thamdinh" trong sheet không khớp "ThamDinh" trong code).
function hasAnyRole(userInfo, allowedRoles) {
  if (!userInfo || !userInfo.roles) return false;
  const allowedLower = allowedRoles.map(r => r.toLowerCase());
  return userInfo.roles.some(r => allowedLower.includes(r));
}

// ĐÃ SỬA: trả thêm "roles" (mảng, chữ thường, hỗ trợ multi-role) bên cạnh "role"
// (chuỗi gốc, giữ nguyên hoa/thường để hiển thị tên vai trò cho đẹp trên UI).
function getUserInfoFromSheet(email) {
  const accountSheetId = PropertiesService.getScriptProperties().getProperty('ACCOUNTS_SHEET_ID');
  const ss = SpreadsheetApp.openById(accountSheetId);
  const sheet = ss.getSheetByName("TaiKhoan"); 
  
  if (!sheet) return null;

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const sheetEmail = String(data[i][0] || "").trim().toLowerCase();
    if (sheetEmail === email) {
      return {
        email: email,
        role: String(data[i][1] || "").trim(),
        roles: parseRoles(data[i][1]),
        name: String(data[i][2] || "").trim()
      };
    }
  }
  return null; 
}

// ĐÃ THÊM: băm mật khẩu bằng SHA-256 — dùng cho action 'login' (tài khoản không
// có Gmail). Không lưu mật khẩu dạng chữ thường ở bất kỳ đâu, kể cả trong Sheet.
function hashMatKhau(plainText) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, plainText);
  return digest.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
}

// ===============================================
// CHẠY HÀM NÀY THỦ CÔNG (chọn hàm trong dropdown Apps Script Editor > bấm Run)
// MỖI KHI CẤP MẬT KHẨU MỚI CHO 1 TÀI KHOẢN KHÔNG CÓ GMAIL.
// Đổi matKhauGoc bên dưới thành mật khẩu THẬT bạn muốn cấp cho người dùng,
// bấm Run, mở Execution Log (Ctrl+Enter) để copy chuỗi hash ra,
// dán vào CỘT D (MatKhauHash) của đúng dòng email đó trên Sheet TaiKhoan.
// ===============================================
function taoHashMatKhau() {
  const matKhauGoc = "DoiThanhMatKhauThat123!"; // <-- ĐỔI chỗ này trước khi Run
  Logger.log(hashMatKhau(matKhauGoc));
}

// ===============================================
// CHẠY HÀM NÀY ĐỂ CẬP NHẬT LẠI ID FILE MỚI
// ===============================================
// ĐÃ SỬA (sự cố lộ secret lên GitHub — GitHub Push Protection chặn đúng vào GEMINI_API_KEY
// và key/token nhét trong WEBHOOK_GCHAT bên dưới): các Script Property đã được set THẬT
// trong project Apps Script từ những lần chạy trước — hàm này KHÔNG cần chứa giá trị thật
// nữa để tồn tại trong file (file này bị đồng bộ lên GitHub qua git, nên bất kỳ giá trị
// thật nào gõ ở đây đều coi như ĐÃ CÔNG KHAI, dù sau đó xoá đi commit sau vẫn còn nằm
// trong LỊCH SỬ commit). Chỉ gõ giá trị thật vào các placeholder dưới đây (thay _DAN_...)
// NGAY TRONG Apps Script Editor lúc cần chạy lại (VD khi đổi deployment/tạo project mới),
// rồi XOÁ giá trị thật đi trước khi lưu/đồng bộ file này về máy hoặc lên git — không bao
// giờ commit giá trị thật của GEMINI_API_KEY/WEBHOOK_GCHAT (chứa key+token) vào git.
function setupSecurityKeys() {
  const props = PropertiesService.getScriptProperties();
  props.setProperties({
    'GEMINI_API_KEY': '_DAN_GEMINI_API_KEY_THAT_VAO_DAY_KHI_CHAY_ROI_XOA_TRUOC_KHI_LUU_', // ⚠️ TUYỆT ĐỐI KHÔNG COMMIT GIÁ TRỊ THẬT
    'WEBHOOK_GCHAT': '_DAN_URL_WEBHOOK_GOOGLE_CHAT_THAT_VAO_DAY_KHI_CHAY_ROI_XOA_TRUOC_KHI_LUU_', // ⚠️ URL này chứa cả key lẫn token, TUYỆT ĐỐI KHÔNG COMMIT
    'GOOGLE_CLIENT_ID': '311965248456-01ts8h9g6tuj0slob58n8vrfm091c4u7.apps.googleusercontent.com', // OAuth Client ID vốn công khai (nằm sẵn trong JS frontend), không phải secret
    'ACCOUNTS_SHEET_ID': '10cOj-d63aumv-fyjmo6AATWsk-v8y5P5c5wNvEIgyO4',
    'TEMPLATE_ID': '1axEobEh841uEJeMbMpb-IEUp9gxGW8AOG0K0iEbzlFo',
    // ĐÃ THÊM cho Pha 1 (4 action Thẩm định mới) — port nguyên từ 4 file .gs cũ,
    // chuyển từ hardcode sang PropertiesService theo đúng quyết định đã chốt.
    'TRUNGGIAN_SHEET_ID': '1DBYrAObOLR7jtj74B_jBHVDf2I07UXc8zpgppvbabbs', // Sheet trung gian (từ Biennhantrungtuyen/yeucaubosung/CheckID cũ)
    'KETQUA_SHEET_ID': '1WKAJfyipPxguFaZTppkLbNe6ZoH2G_VBMV6W0ps708I', // Sheet KETQUA (từ LuuvaoCSDL cũ)
    'TRUNGTUYEN_TEMPLATE_DOC_ID': '1MYl5hWkl01E5zhD1HhB0Hb8fRE_H6DwI5JanqVAahMk', // Mẫu Biên nhận Trúng tuyển (Google Docs)
    'TRUNGTUYEN_FOLDER_ID': '1zWMF_H2LD1mKNYk8Gu5A0F_VcYzhfap9', // Folder Drive lưu PDF biên nhận trúng tuyển
    'BAOTHIEU_TEMPLATE_DOC_ID': '1Ob5l9yc3SYOa8QSKf29_8okU3T0RGhXUfEpnRc47q8I', // Mẫu Biên nhận Báo thiếu hồ sơ (Google Docs)
    'BAOTHIEU_FOLDER_ID': '12g2MhNbmatVWY_HFNgxWK-1eDi3FVyfR', // Folder Drive lưu PDF báo thiếu hồ sơ
    // ĐÃ THÊM — KÝ ĐIỆN TỬ PHA 1 (Bước 2): folder Drive lưu ảnh chữ ký cá nhân, PHẢI
    // để private (không setSharing) — xem action luuChuKyCuaToi. Folder "SIGNATURETD".
    'CHUKY_FOLDER_ID': '1oLGnq7FUHYkXHPwOzNi951z3AMcEPI30',
    // ĐÃ THÊM — KÝ ĐIỆN TỬ PHA 1 (Bước 4 trở đi): folder Drive lưu Doc GBTT đang ký +
    // PDF cuối cùng. Folder "GBTTSTORE". Đặt sẵn ở đây từ Bước 2 vì đã có ID, dù chưa
    // dùng tới cho tới khi làm action taoYeuCauKyGBTT (Bước 4).
    'GBTT_FOLDER_ID': '1Q2EjMU2tnFp6iJZq2yYisXu1dIhJX2Ww',
    // ĐÃ THÊM — KÝ ĐIỆN TỬ PHA 1 (Bước 4): ID Google Doc MẪU Giấy báo trúng tuyển —
    // GIÁ TRỊ DƯỚI ĐÂY LÀ CHỖ TRỐNG, ông tự tạo file mẫu theo hướng dẫn rồi thay bằng
    // ID thật của mình (lấy từ URL file Doc), sau đó chạy lại hàm setupSecurityKeys()
    // này 1 lần trong trình soạn thảo Apps Script để lưu vào Script Properties.
    'GBTT_TEMPLATE_DOC_ID': 'DAN_ID_FILE_GOOGLE_DOC_MAU_GBTT_VAO_DAY',
    // ĐÃ THÊM (Ký điện tử Pha 1 — Bước 6): URL FRONTEND đã deploy (KHÔNG PHẢI URL Web
    // App /exec của GAS) — dùng để dựng link "vào ký ngay" trong email thông báo, xem
    // layLinkChoKy_(). Vd 'https://tenmien-cua-ong.com' hoặc link Vercel/Netlify/GitHub
    // Pages đang host bản React build. Để trống ('') vẫn gửi được email, chỉ thiếu nút
    // bấm nhanh (người nhận tự mở trang rồi vào menu tài khoản > Hồ sơ chờ ký).
    'APP_URL': ''
  });
  Logger.log("Đã lưu toàn bộ khóa bảo mật thành công!");
}



function capQuyen() {
  // Hàm này chả làm gì cả, chỉ để gọi tên các dịch vụ ra cho Google nó hỏi xin quyền thôi
  UrlFetchApp.fetch("https://google.com");
  SpreadsheetApp.getActive();
}

// ============================================================================
// ĐÃ THÊM (2026-09-10) — Thân xử lý các action liên quan Đăng nhập/Nhật ký, tách ra từ
// doGet/doPost (Quanlysv.gs) để dispatcher gọn hơn. Tên hàm: hdGet_<action>/hdPost_<action>
// khớp đúng tên action gốc phía frontend — HÀNH VI GIỮ NGUYÊN 100% so với trước khi tách
// (nội dung thân hàm copy y nguyên từ case/if gốc, chỉ đổi chỗ chứa).
// ============================================================================

function hdGet_getLogs(e) {
        const g = requireAuth(e.parameter, []);
        if (!g.ok) return g.resp;
        const username = e.parameter.username;
        // ĐÃ THÊM: chỉ cho xem nhật ký của CHÍNH MÌNH, trừ Admin xem được của bất kỳ ai —
        // trước đây bất kỳ ai đăng nhập cũng có thể đổi param "username" để xem log người khác.
        if (!hasAnyRole(g.userInfo, ['Admin']) && String(username || "").trim().toLowerCase() !== g.userInfo.email) {
          return responseJSON(403, "Bạn chỉ được xem nhật ký của chính mình", null);
        }
        // ĐÃ THÊM: hàm này được dùng ở 2 nơi khác nhau — (1) UserStatsPage.jsx gửi ĐÚNG email
        // của người đang xem để lọc "nhật ký của riêng tôi" (giữ nguyên hành vi so khớp CHÍNH
        // XÁC như cũ, xem vòng lặp bên dưới), và (2) SettingsPage.jsx (trang Cấu hình, chỉ
        // Admin vào được, còn có thêm lớp PIN riêng trước khi bấm "Lịch sử") gửi
        // "username=ALL" với Ý ĐỊNH xem TẤT CẢ — trước đây bug ở chỗ code so khớp CHỮ Y
        // NGUYÊN (dataLog[i][1] == "ALL"), mà cột email không dòng nào bằng đúng "ALL" nên
        // luôn trả về rỗng. Giờ nhận diện đúng ý định "ALL" (không phân biệt hoa/thường,
        // đã trim) và bỏ qua lọc theo email — vẫn AN TOÀN vì đã bị chặn 403 ở trên nếu không
        // phải Admin (so khớp "ALL" !== email của người gọi).
        const laXemTatCa = String(username || "").trim().toUpperCase() === "ALL";
        const sheetLog = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("NhatKy");
        if (!sheetLog) return responseJSON(404, "Chưa tạo Sheet NhatKy", null);

        const dataLog = sheetLog.getDataRange().getValues();
        const logs = [];

        for (let i = dataLog.length - 1; i > 0; i--) {
          if (laXemTatCa || dataLog[i][1] == username) {
            logs.push({
              ThoiGian: dataLog[i][0] instanceof Date ? dataLog[i][0].toISOString() : dataLog[i][0],
              Username: dataLog[i][1],
              HanhDong: dataLog[i][2],
              ChiTiet: dataLog[i][3]
            });
          }
        }
        return responseJSON(200, "Thành công", logs);
      }

// ĐÃ THÊM: helper dùng chung để ghi 1 dòng "lịch sử thao tác" (ai — làm gì — khi nào) vào
// sheet "NhatKy" — sheet DUY NHẤT mà hdGet_getLogs ở trên thực sự đọc. Trước đây
// hdPost_saveConfig/hdPost_saveChiTieu (TuyenSinh.gs) tự ghi thẳng vào 1 sheet TÊN KHÁC
// ("LichSuCauHinh") — lệch tên với "NhatKy" nên mục "Lịch sử" trên trang Cấu hình coi như
// chưa từng hiển thị được dòng log thật nào (ghi vào 1 nơi, đọc ở nơi khác). Từ giờ MỌI chỗ
// cần ghi log (kể cả 2 chỗ cũ lẫn 2 chỗ mới thêm — duyệt trúng tuyển, lưu kết quả thẩm định)
// đều gọi qua ĐÚNG 1 hàm này.
// Cố tình LUÔN mở lại spreadsheet CHÍNH qua SPREADSHEET_ID (không dùng biến "ss" mà từng
// handler đang có sẵn) — vì có handler (hdPost_luuKetQua) thao tác trên 1 SPREADSHEET KHÁC
// (KETQUA_SHEET_ID); nếu ghi log theo "ss" của riêng handler đó, log sẽ nằm lạc trên
// spreadsheet KETQUA thay vì spreadsheet chính mà hdGet_getLogs/trang Cấu hình đang đọc.
// Cố tình "fail-open" (bọc try/catch, không throw): ghi log là việc PHỤ, tuyệt đối không
// được làm hỏng hành động CHÍNH (duyệt trúng tuyển, lưu kết quả...) nếu sheet NhatKy chưa
// được tạo hoặc có lỗi ghi bất kỳ.
function ghiLichSuThaoTac_(email, hanhDong, chiTiet) {
  try {
    const sheetLog = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("NhatKy");
    if (!sheetLog) return;
    const now = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
    sheetLog.appendRow([now, email, hanhDong, chiTiet || ""]);
  } catch (err) {
    // Ghi log thất bại (VD lỗi khoá sheet tạm thời) không được phép ném lỗi ra ngoài.
  }
}

function hdPost_login(e, ss) {
      const loginData = JSON.parse(e.parameter.data);
      const sheet = ss.getSheetByName("TaiKhoan");
      
      if (!sheet) return responseJSON(404, "Chưa tạo Sheet TaiKhoan", null);
      const data = sheet.getDataRange().getValues();

      const hashNhap = hashMatKhau(String(loginData.password || ""));
      const emailNhap = String(loginData.username || "").trim().toLowerCase();

      for (let i = 1; i < data.length; i++) {
        const emailSheet = String(data[i][0] || "").trim().toLowerCase();
        const hashSheet = String(data[i][3] || "").trim(); // Cột D = MatKhauHash

        // Tài khoản Google (chưa từng đặt MatKhauHash) -> hashSheet rỗng -> KHÔNG BAO GIỜ khớp ở đây
        if (hashSheet && emailSheet === emailNhap && hashSheet === hashNhap) {
          const rolesArr = parseRoles(data[i][1]);
          const name = String(data[i][2] || "").trim();
          // ĐÃ THÊM: tạo phiên đăng nhập (session token, sống 8 tiếng) — không có cái
          // này thì tài khoản nội bộ đăng nhập xong không gọi được bất kỳ action nào
          // đã khoá quyền ở trên (những action đó đòi idToken Google, tài khoản nội bộ
          // không có).
          const sessionToken = createSession(emailSheet, rolesArr, name);
          const userInfo = { username: emailSheet, name: name, role: String(data[i][1] || "").trim(), roles: rolesArr, sessionToken: sessionToken };
          return responseJSON(200, "Đăng nhập thành công", userInfo);
        }
      }
      return responseJSON(401, "Sai tên đăng nhập hoặc mật khẩu!", null);
    }

function hdPost_verifyToken(e, ss) {
      const parsedData = JSON.parse(e.parameter.data || "{}");
      const idToken = e.parameter.idToken || parsedData.idToken;
      
      const auth = verifyGoogleIdToken(idToken);
      if (!auth.valid) return responseJSON(401, auth.message, null);

      const userInfo = getUserInfoFromSheet(auth.email);
      if (!userInfo) {
        return responseJSON(403, "Tài khoản " + auth.email + " chưa được cấp quyền truy cập!", null);
      }

      // ĐÃ THÊM: cấp luôn sessionToken nội bộ (trượt hạn 8 tiếng, y hệt tài khoản
      // thường) cho tài khoản Google — xem giải thích đầy đủ ở comment trên requireAuth().
      // Nhờ vậy về sau KHÔNG cần Google tự gia hạn idToken ngầm nữa (cơ chế đó đã bỏ ở
      // App.jsx), tránh hẳn lỗi "gia hạn thất bại" hay gặp trước đây.
      const sessionToken = createSession(auth.email, userInfo.roles, userInfo.name);

      // ĐÃ THÊM "roles" (mảng, chữ thường) bên cạnh "role" (chuỗi gốc để hiển thị) —
      // hỗ trợ 1 tài khoản có nhiều vai trò cùng lúc (cột Role ghi "TuyenSinh,ThamDinh")
      return responseJSON(200, "Thành công", {
        email: userInfo.email, name: userInfo.name, role: userInfo.role, roles: userInfo.roles, sessionToken: sessionToken
      });
    }

function hdPost_requestAccess(e, ss) {
      const idToken = JSON.parse(e.parameter.data).idToken;
      const auth = verifyGoogleIdToken(idToken);
      if (!auth.valid) return responseJSON(401, auth.message, null);
      
      const webhook = PropertiesService.getScriptProperties().getProperty('WEBHOOK_GCHAT');
      const now = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
      const msg = `🔐 *YÊU CẦU CẤP QUYỀN TRUY CẬP*\nTài khoản: *${auth.email}*\nTrang: Hệ thống Tuyển sinh\nThời gian: ${now}\n👉 Thêm email vào Sheet để cấp quyền.`;
      
      UrlFetchApp.fetch(webhook, {
        method: "post", headers: { "Content-Type": "application/json; charset=UTF-8" },
        payload: JSON.stringify({ text: msg }), muteHttpExceptions: true
      });
      return responseJSON(200, "Đã gửi yêu cầu", null);
    }