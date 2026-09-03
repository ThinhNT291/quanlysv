// Thay bằng ID file Google Sheets "quanlysv" thực tế của ông
const SPREADSHEET_ID = "10cOj-d63aumv-fyjmo6AATWsk-v8y5P5c5wNvEIgyO4";

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

// ===============================================
// HÀM XỬ LÝ REQUEST GET (Lấy dữ liệu)
// ===============================================
function doGet(e) {
  if (!e || !e.parameter || !e.parameter.action) {
    return responseJSON(400, "Thiếu tham số action. Tuy nhiên Web App vẫn đang chạy bình thường!", null);
  }
  
  const action = e.parameter.action;
  
  try {
    switch(action) {
      case 'getStudents': {
        const g = requireAuth(e.parameter, ['CanBo', 'Admin']);
        if (!g.ok) return g.resp;
        return responseJSON(200, "Thành công", getStudentsData());
      }

      // ==========================================================
      // ĐÃ THÊM: TRANG "THU HỒ SƠ NHẬP HỌC" — GIỜ ĐỌC/GHI THẲNG SHEET TRUNG GIAN (không
      // còn dùng sheet "SinhVien" nữa) để dữ liệu luôn đồng nhất với Xét tuyển/Thẩm định,
      // và không cần bước "nối" 2 sheet lại với nhau nữa. Chỉ lấy đúng hồ sơ do trang này
      // tạo ra, nhờ cột KÊNH NỘP = "Thu hồ sơ trực tiếp" (xem hằng số ADMISSIONS_* và các
      // hàm dùng chung ngay phía trên hàm doPost bên dưới).
      // ==========================================================
      case 'getAdmissionsData': {
        const g = requireAuth(e.parameter, ['CanBo', 'Admin']);
        if (!g.ok) return g.resp;
        return responseJSON(200, "Thành công", getAdmissionsDataFromTrunggian());
      }

      // Trả về đúng danh sách cột dùng cho modal/file mẫu "Thêm hồ sơ" — KHÔNG phải
      // toàn bộ header thật của Trung Gian (sheet đó còn nhiều cột hệ thống khác như
      // TIME/NGÀY CẬP NHẬT/TÀI KHOẢN NHẬP LIỆU/KÊNH NỘP không cần người dùng điền tay).
      // Khai báo TẠI 1 NƠI DUY NHẤT (ADMISSIONS_DATA_FIELDS/ADMISSIONS_CHECK_FIELDS) để
      // modal thêm hồ sơ, file mẫu Excel, và action nhập Excel luôn khớp nhau tuyệt đối.
      case 'getAdmissionsHeaders': {
        const g = requireAuth(e.parameter, ['CanBo', 'Admin']);
        if (!g.ok) return g.resp;
        return responseJSON(200, "Thành công", {
          dataFields: ADMISSIONS_DATA_FIELDS,
          checkFields: ADMISSIONS_CHECK_FIELDS,
          statusField: ADMISSIONS_STATUS_FIELD,
          statusValue: ADMISSIONS_STATUS_VALUE
        });
      }

      // ĐÃ THÊM (rà soát đồng bộ file mẫu 2 trang): trả về đúng danh sách cột file mẫu
      // Excel bên trang Xét tuyển — CHUYỂN từ mảng hardcode trong XetTuyenPage.jsx
      // (hàm handleDownloadTemplate cũ) sang đây làm NGUỒN DUY NHẤT, cùng triết lý với
      // getAdmissionsHeaders ở trên, để sau này thêm/sửa/xoá cột chỉ cần sửa 1 chỗ
      // (XETTUYEN_TEMPLATE_HEADERS) thay vì phải nhớ sửa cả GAS lẫn JSX. LƯU Ý: mảng
      // này CHỈ dùng để hiển thị cột trong file mẫu — action 'importStudents' đọc file
      // Excel theo alias độc lập (hàm getField trong executeImport), không phụ thuộc
      // mảng này, nên đổi ở đây không ảnh hưởng logic đọc/parse file đã nhập.
      case 'getXetTuyenHeaders': {
        const g = requireAuth(e.parameter, ['TuyenSinh', 'ThamDinh', 'Admin']);
        if (!g.ok) return g.resp;
        return responseJSON(200, "Thành công", XETTUYEN_TEMPLATE_HEADERS);
      }

      // Danh sách các khoản đã nộp của 1 hồ sơ — dùng cho khối "Nộp tiền" bên phải trang Thu hồ sơ.
      case 'getPayments': {
        const g = requireAuth(e.parameter, ['CanBo', 'Admin']);
        if (!g.ok) return g.resp;
        const maSVTarget = String(e.parameter.MaSV || "").trim();
        const sheetNT = layHoacTaoSheetNopTien();
        const dataNT = sheetNT.getDataRange().getValues();
        const ketQuaNT = [];
        for (let i = 1; i < dataNT.length; i++) {
          if (String(dataNT[i][0] || "").trim() === maSVTarget) {
            ketQuaNT.push({
              loaiPhi: dataNT[i][1],
              soTien: dataNT[i][2],
              nguoiThu: dataNT[i][3],
              thoiGian: dataNT[i][4] instanceof Date ? Utilities.formatDate(dataNT[i][4], "GMT+7", "dd/MM/yyyy HH:mm:ss") : dataNT[i][4]
            });
          }
        }
        return responseJSON(200, "Thành công", ketQuaNT);
      }

      // ĐÃ THÊM (Pha 3 roadmap): trả TOÀN BỘ hồ sơ trong sheet TrungGian cho trang
      // Thẩm định — khác với 'searchOldRecord' (chỉ tìm theo từ khoá). Giữ nguyên
      // format trả về y hệt CheckID.gs cũ (key = tên cột gốc trên Sheet, viết hoa,
      // Date object tự format dd/mm/yyyy, CCCD tự bỏ dấu nháy đơn) để phía React tái
      // dùng đúng logic tính toán (getVal/generateMaSV/getBestScoreText...) đã có
      // sẵn từ bản vanilla JS cũ, không phải viết lại từ đầu.
      case 'getThamDinhData': {
        const g = requireAuth(e.parameter, ['ThamDinh', 'Admin']);
        if (!g.ok) return g.resp;

        const TRUNGGIAN_SHEET_ID = PropertiesService.getScriptProperties().getProperty('TRUNGGIAN_SHEET_ID');
        const ssTD = SpreadsheetApp.openById(TRUNGGIAN_SHEET_ID);
        // ĐÃ VÁ BUG: trước đây ưu tiên tìm tab TÊN "Sheet1" trước, chỉ dùng tab đầu
        // tiên (theo vị trí) nếu không có tab tên "Sheet1". Nếu spreadsheet có sẵn 1
        // tab rác/leftover đặt tên đúng "Sheet1" (VD: tab mặc định Google tự tạo lúc
        // khởi tạo file, gần như rỗng) thì hàm này ĐỌC NHẦM SANG TAB RÁC ĐÓ thay vì
        // tab thật chứa dữ liệu — trong khi searchOldRecord/checkDuplicatesXetTuyen/
        // importStudents (cùng file TRUNGGIAN) đều dùng thẳng .getSheets()[0] (tab đầu
        // tiên theo vị trí), không tìm theo tên -> đọc đúng tab thật. Giờ đồng bộ lại,
        // luôn lấy tab đầu tiên theo vị trí giống 3 action kia, không tìm theo tên nữa.
        const sheetTD = ssTD.getSheets()[0];
        if (!sheetTD) return responseJSON(404, "Không tìm thấy sheet dữ liệu Trung gian", null);

        const values = sheetTD.getDataRange().getValues();
        if (values.length <= 1) return responseJSON(200, "Thành công", []);

        const headers = values[0];
        const cleanHeaders = headers.map(h => String(h).toUpperCase().trim().replace(/\s+/g, ' '));
        const linkColIndex = cleanHeaders.indexOf("LINK HỒ SƠ");

        // ĐÃ SỬA (rà soát Trunggian.gs): lấy rich-text + công thức TOÀN BỘ vùng dữ liệu
        // 1 lần duy nhất (đỡ gọi API nhiều lần trong vòng lặp) — chỉ khi thật sự có cột
        // "LINK HỒ SƠ" trên sheet.
        const richTextValues = linkColIndex !== -1 ? sheetTD.getDataRange().getRichTextValues() : null;
        const formulaValues = linkColIndex !== -1 ? sheetTD.getDataRange().getFormulas() : null;

        const results = [];
        for (let i = 1; i < values.length; i++) {
          const rowObj = {};
          for (let c = 0; c < cleanHeaders.length; c++) {
            const key = cleanHeaders[c];
            let val = values[i][c];
            if (val instanceof Date) {
              const dd = String(val.getDate()).padStart(2, '0');
              const mm = String(val.getMonth() + 1).padStart(2, '0');
              const yyyy = val.getFullYear();
              val = dd + '/' + mm + '/' + yyyy;
            } else if (key === "CĂN CƯỚC" || key === "SỐ CCCD" || key === "CCCD") {
              val = String(val).replace(/^['"]+|['"]+$/g, '');
            } else if (c === linkColIndex) {
              val = extractSafeLinkFromCell(richTextValues[i][c], formulaValues[i][c], val);
            }
            rowObj[key] = val;
          }
          results.push(rowObj);
        }
        return responseJSON(200, "Thành công", results);
      }

      case 'getDocuments': {
        const g = requireAuth(e.parameter, ['CanBo', 'Admin']);
        if (!g.ok) return g.resp;
        const maSVDoc = e.parameter.MaSV;
        const sheetDoc = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("GiayTo");
        if (!sheetDoc) return responseJSON(404, "Lỗi: Chưa tạo Sheet 'GiayTo'", null);
        
        const dataDoc = sheetDoc.getDataRange().getValues();
        const submittedDocs = [];
        
        for(let i = 1; i < dataDoc.length; i++) {
          if(dataDoc[i][0] == maSVDoc) {
            submittedDocs.push({
              tenGiayTo: dataDoc[i][1],
              ghiChu: dataDoc[i][2] || "" 
            }); 
          }
        }
        return responseJSON(200, "Thành công", submittedDocs);
      }
      
      case 'getConfig': {
        // Cấu hình dropdown (Ngành, Hệ, KV...) dùng ở nhiều trang khác nhau -> chỉ cần
        // đăng nhập hợp lệ (bất kỳ role nào), không giới hạn role cụ thể.
        const g = requireAuth(e.parameter, []);
        if (!g.ok) return g.resp;
        const sheetConfig = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("CauHinh");
        if (!sheetConfig) {
          return responseJSON(404, "Vui lòng tạo Sheet có tên chính xác là 'CauHinh'", null);
        }
        
        const dataConfig = sheetConfig.getDataRange().getValues();
        const config = { 
            Nganh: [], KhoaNhapHoc: [], DoiTuongUT: [], KhuVucUT: [], 
            NamXetTuyen: [], DoiTuongDauVao: [], HeDaoTao: [], HinhThucDaoTao: [] 
        };
        
        if (dataConfig.length > 1) {
          const headers = dataConfig[0];
          // Dò tìm vị trí cột tự động chống lệch cột
          const idxNganh = headers.indexOf("Nganh");
          const idxKhoa = headers.indexOf("KhoaNhapHoc");
          const idxDtUT = headers.indexOf("DoiTuongUT");
          const idxKvUT = headers.indexOf("KhuVucUT");
          const idxNam = headers.indexOf("NamXetTuyen");
          const idxDtDauVao = headers.indexOf("DoiTuongDauVao");
          const idxHeDT = headers.indexOf("HeDaoTao");
          const idxHinhThuc = headers.indexOf("HinhThucDaoTao");

          for (let i = 1; i < dataConfig.length; i++) {
            if (idxNganh !== -1 && dataConfig[i][idxNganh]) config.Nganh.push(dataConfig[i][idxNganh].toString());
            if (idxKhoa !== -1 && dataConfig[i][idxKhoa]) config.KhoaNhapHoc.push(dataConfig[i][idxKhoa].toString());
            if (idxDtUT !== -1 && dataConfig[i][idxDtUT]) config.DoiTuongUT.push(dataConfig[i][idxDtUT].toString());
            if (idxKvUT !== -1 && dataConfig[i][idxKvUT]) config.KhuVucUT.push(dataConfig[i][idxKvUT].toString());
            if (idxNam !== -1 && dataConfig[i][idxNam]) config.NamXetTuyen.push(dataConfig[i][idxNam].toString());
            if (idxDtDauVao !== -1 && dataConfig[i][idxDtDauVao]) config.DoiTuongDauVao.push(dataConfig[i][idxDtDauVao].toString());
            if (idxHeDT !== -1 && dataConfig[i][idxHeDT]) config.HeDaoTao.push(dataConfig[i][idxHeDT].toString());
            if (idxHinhThuc !== -1 && dataConfig[i][idxHinhThuc]) config.HinhThucDaoTao.push(dataConfig[i][idxHinhThuc].toString());
          }
        }
        return responseJSON(200, "Thành công", config);
      }
      case 'getLogs': {
        const g = requireAuth(e.parameter, []);
        if (!g.ok) return g.resp;
        const username = e.parameter.username;
        // ĐÃ THÊM: chỉ cho xem nhật ký của CHÍNH MÌNH, trừ Admin xem được của bất kỳ ai —
        // trước đây bất kỳ ai đăng nhập cũng có thể đổi param "username" để xem log người khác.
        if (!hasAnyRole(g.userInfo, ['Admin']) && String(username || "").trim().toLowerCase() !== g.userInfo.email) {
          return responseJSON(403, "Bạn chỉ được xem nhật ký của chính mình", null);
        }
        const sheetLog = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("NhatKy");
        if (!sheetLog) return responseJSON(404, "Chưa tạo Sheet NhatKy", null);
        
        const dataLog = sheetLog.getDataRange().getValues();
        const logs = [];
        
        for (let i = dataLog.length - 1; i > 0; i--) {
          if (dataLog[i][1] == username) {
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
      default: {
        return responseJSON(400, "Action GET không hợp lệ", null);
      }
    }
  } catch (error) {
    return responseJSON(500, "Lỗi Server: " + error.toString(), null);
  }
}

// Logic lấy danh sách sinh viên
function getStudentsData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName("SinhVien");
  if (!sheet) throw new Error("Chưa tạo Sheet 'SinhVien'");
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0]; 
  const students = [];
  
  for (let i = 1; i < data.length; i++) {
    let row = data[i];
    let student = {};
    for (let j = 0; j < headers.length; j++) {
      if (row[j] instanceof Date) {
         // ĐÃ SỬA: sheet "SinhVien" không có cột giờ (không như TIME bên TrungGian),
         // cột duy nhất Google Sheets có thể tự nhận dạng thành kiểu Date là NGÀY SINH
         // (do form nhập gửi lên chuỗi yyyy-mm-dd, Sheets tự convert thành Date).
         // row[j].toISOString() cũ quy đổi sang UTC -> lùi mất 1 ngày so với ngày sinh
         // thật (GMT+7), rồi frontend new Date(...).toISOString().split('T')[0] lúc
         // sửa hồ sơ lại lấy đúng phần ngày UTC bị lệch đó, lưu đè NGÀY SINH sai vĩnh
         // viễn mỗi lần chỉnh sửa. Format cứng theo giờ GMT+7 thành yyyy-MM-dd để khớp
         // thẳng với input type="date" của frontend, không còn quy đổi UTC nào nữa.
         student[headers[j]] = Utilities.formatDate(row[j], "GMT+7", "yyyy-MM-dd");
      } else {
         student[headers[j]] = row[j];
      }
    }
    students.push(student);
  }
  return students;
}

// Hàm Helper format JSON
function responseJSON(statusCode, message, data) {
  const response = {
    code: statusCode,
    message: message,
    data: data
  };
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===============================================
// ĐÃ THÊM: NHÓM HẰNG SỐ + HÀM DÙNG CHUNG CHO TRANG "THU HỒ SƠ NHẬP HỌC" (đọc/ghi thẳng
// sheet Trung Gian). ÔNG CẦN TỰ THÊM 1 CỘT MỚI TÊN ĐÚNG "KÊNH NỘP" (không dấu ngoặc,
// không dấu chấm) vào hàng tiêu đề của sheet Trung Gian TRƯỚC khi dùng các action bên
// dưới — cột này dùng để tách hồ sơ do trang Thu hồ sơ tạo ra khỏi hồ sơ bên Xét tuyển,
// value = "Thu hồ sơ trực tiếp". Bên Xét tuyển không cần sửa gì, cứ để trống cột đó.
// ===============================================
const ADMISSIONS_KENH_NOP = "Thu hồ sơ trực tiếp";
const ADMISSIONS_KENH_FIELD = "KÊNH NỘP";
// Các trường dữ liệu (text/dropdown) hiện trong modal "Thêm hồ sơ" — tên phải khớp
// TUYỆT ĐỐI (sau khi .toUpperCase()) với tiêu đề thật trên sheet Trung Gian.
const ADMISSIONS_DATA_FIELDS = ["TÊN SINH VIÊN", "NGÀY SINH", "CĂN CƯỚC", "NGÀNH", "KHÓA", "HỆ ĐÀO TẠO", "HÌNH THỨC ĐÀO TẠO", "ĐỐI TƯỢNG ƯU TIÊN", "LINK HỒ SƠ"];
// Các cột kiểu "đã có/chưa có" (ghi "x" khi tick, để trống khi bỏ tick) — riêng GIẤY TỜ
// ƯU TIÊN ghi thẳng nội dung ghi chú thay vì "x" (giữ đúng hành vi ô ghi chú cũ).
const ADMISSIONS_CHECK_FIELDS = ["ẢNH THẺ", "BẢN SAO BẰNG THPT/GIẤY BÁO ĐIỂM", "BẢN SAO HỌC BẠ THPT", "BẢN SAO ID", "SƠ YẾU LÝ LỊCH", "GIẤY TỜ ƯU TIÊN"];
const ADMISSIONS_STATUS_FIELD = "TRẠNG THÁI THẨM ĐỊNH";
const ADMISSIONS_STATUS_VALUE = "Đã trúng tuyển"; // riêng của luồng Thu hồ sơ — bên Xét tuyển/Thẩm định dùng "Đã duyệt"/"Đã báo thiếu", không đụng hàng
const ADMISSIONS_MASV_NAMES = ["MÃ SINH VIÊN", "MÃ SỐ NGƯỜI HỌC", "MASV", "MÃ SV"];

// ĐÃ THÊM (rà soát đồng bộ file mẫu 2 trang): danh sách cột file mẫu Excel bên trang
// Xét tuyển — COPY NGUYÊN VĂN từ mảng "headers" cũ trong XetTuyenPage.jsx (hàm
// handleDownloadTemplate), chuyển sang đây làm nguồn duy nhất. Dùng cho action GET
// 'getXetTuyenHeaders'.
const XETTUYEN_TEMPLATE_HEADERS = [
  "STT", "CĂN CƯỚC", "TÊN SINH VIÊN", "NGÀY SINH", "NGÀNH", "KHÓA",
  "ĐỐI TƯỢNG ƯU TIÊN", "KHU VỰC ƯU TIÊN", "ĐỐI TƯỢNG ĐẦU VÀO", "NĂM XÉT TUYỂN",
  "HỆ ĐÀO TẠO", "HÌNH THỨC ĐÀO TẠO", "PHIẾU ĐĂNG KÝ DỰ TUYỂN", "SƠ YẾU LÝ LỊCH",
  "BẢN SAO ID", "ẢNH THẺ", "GIẤY CHUYỂN NVQS (VỚI NAM)", "BẢN SAO BẰNG THPT/GIẤY BÁO ĐIỂM", "BẢN SAO HỌC BẠ THPT",
  "BẢN SAO BẰNG TRUNG CẤP", "BẢNG ĐIỂM TRUNG CẤP", "BẰNG THPT/GCN ĐỦ KL KTVH THPT",
  "BẢN SAO BẰNG TRUNG CẤP TRƯỚC 2022", "BẢNG ĐIỂM TRUNG CẤP TRƯỚC 2022", "GCN HOÀN THÀNH CT GDPT",
  "BẰNG CAO ĐẲNG", "BẢNG ĐIỂM CAO ĐẲNG", "BẰNG ĐẠI HỌC", "BẢNG ĐIỂM ĐẠI HỌC", "GIẤY TỜ ƯU TIÊN",
  "PHƯƠNG THỨC XÉT TUYỂN",
  "TOÁN", "VẬT LÍ", "HÓA HỌC", "SINH HỌC", "NGỮ VĂN", "LỊCH SỬ", "ĐỊA LÝ",
  "TIẾNG ANH", "TIẾNG TRUNG", "TIN HỌC", "GDKTPL",
  "ĐIỂM TB HỆ 4", "ĐIỂM TB HỆ 10", "ĐIỂM CỘNG", "ĐIỂM CHUẨN", "LINK HỒ SƠ"
];

// Mở tab đầu tiên (theo VỊ TRÍ, không theo tên) của sheet Trung Gian — đồng bộ với mọi
// action khác trong file này (searchOldRecord/importStudents/getThamDinhData...).
function moTrunggianSheet() {
  const id = PropertiesService.getScriptProperties().getProperty('TRUNGGIAN_SHEET_ID');
  return SpreadsheetApp.openById(id).getSheets()[0];
}

// Đọc header (gốc + đã chuẩn hoá hoa/gọn khoảng trắng) và toàn bộ dữ liệu Trung Gian —
// dùng chung cho mọi action đọc/ghi của trang Thu hồ sơ, tránh lặp code đọc sheet.
function docTrunggianRaw() {
  const sheet = moTrunggianSheet();
  const values = sheet.getDataRange().getValues();
  const headers = values.length > 0 ? values[0] : [];
  const cleanHeaders = headers.map(h => String(h).toUpperCase().trim().replace(/\s+/g, ' '));
  return { sheet, headers, cleanHeaders, values };
}

// Tìm vị trí 1 cột theo nhiều tên khả dĩ (không phân biệt hoa/thường/khoảng trắng thừa) —
// dùng khi 1 khái niệm có thể được đặt tên khác nhau (VD cột Mã sinh viên).
function timCotTheoTen(cleanHeaders) {
  const tenKhaDi = Array.prototype.slice.call(arguments, 1);
  for (let k = 0; k < tenKhaDi.length; k++) {
    const idx = cleanHeaders.indexOf(String(tenKhaDi[k]).toUpperCase().trim());
    if (idx !== -1) return idx;
  }
  return -1;
}

// Lọc + đóng gói dữ liệu Trung Gian CHỈ của kênh "Thu hồ sơ trực tiếp" — nếu sheet chưa
// có cột KÊNH NỘP (chưa kịp thêm tay), tạm thời trả về TOÀN BỘ để không chặn thao tác,
// nhưng đây là tình huống cần ông bổ sung cột sớm, không nên để lâu (sẽ lẫn hồ sơ Xét tuyển).
function getAdmissionsDataFromTrunggian() {
  const { cleanHeaders, values } = docTrunggianRaw();
  if (values.length <= 1) return [];
  const idxKenh = timCotTheoTen(cleanHeaders, ADMISSIONS_KENH_FIELD);
  const results = [];
  for (let i = 1; i < values.length; i++) {
    if (idxKenh !== -1 && String(values[i][idxKenh] || "").trim() !== ADMISSIONS_KENH_NOP) continue;
    const rowObj = {};
    for (let c = 0; c < cleanHeaders.length; c++) {
      let val = values[i][c];
      if (val instanceof Date) {
        val = Utilities.formatDate(val, "GMT+7", "dd/MM/yyyy");
      } else if (cleanHeaders[c] === "CĂN CƯỚC" || cleanHeaders[c] === "CCCD") {
        val = String(val).replace(/^['"]+|['"]+$/g, '');
      } else if (ADMISSIONS_MASV_NAMES.indexOf(cleanHeaders[c]) !== -1) {
        val = String(val).replace(/^['"]+|['"]+$/g, '');
      }
      rowObj[cleanHeaders[c]] = val;
    }
    results.push(rowObj);
  }
  return results;
}

// Sinh Mã sinh viên — CỐ TÌNH COPY nguyên logic từ generateMaSV() bên trong action
// 'importStudents' (hàm đó khai báo cục bộ trong 1 khối if, không gọi được từ ngoài)
// thay vì refactor dùng chung, để không đụng vào action Xét tuyển đang chạy ổn định.
// Cùng 1 công thức: NĂM(2 số) + HỆ ĐÀO TẠO(1 số) + HÌNH THỨC ĐÀO TẠO(1 số) + 6 số cuối CCCD.
function generateMaSVTuChung(namXT, heDT, hinhThuc, cccdStr) {
  const DICT_HE_DT = {
    "Cao đẳng": "01", "Đại học chính quy": "02", "Liên thông ĐH - ĐH (Văn bằng 2)": "03",
    "Thường xuyên: Phương thức ĐTTX": "04", "Liên thông từ CĐ lên ĐH": "05",
    "Thường xuyên: Phương thức VLVH": "06", "Thạc sĩ": "07", "Khóa ngắn hạn cấp chứng chỉ": "08"
  };
  const DICT_HINH_THUC = {
    "Chính quy đại trà": "1", "Liên thông ĐH - ĐH chính quy (VB 2)": "2",
    "Thường xuyên: Phương thức ĐTTX": "3", "Thường xuyên: Phương thức VLVH": "4"
  };
  const aa = String(namXT || "").slice(-2);
  const cleanHeDT = String(heDT || "").trim().toLowerCase();
  const cleanHinhThuc = String(hinhThuc || "").trim().toLowerCase();

  let bb = "00";
  for (let key in DICT_HE_DT) { if (key.toLowerCase() === cleanHeDT) { bb = DICT_HE_DT[key]; break; } }
  if (bb === "00") {
    if (cleanHeDT.includes("cao đẳng")) bb = "01";
    else if (cleanHeDT.includes("đại học") || cleanHeDT.includes("đh chính quy")) bb = "02";
    else if (cleanHeDT.includes("văn bằng 2") || cleanHeDT.includes("vb2") || cleanHeDT.includes("vb 2")) bb = "03";
    else if (cleanHeDT.includes("đttx") || cleanHeDT.includes("từ xa")) bb = "04";
    else if (cleanHeDT.includes("lên đh") || cleanHeDT.includes("lên đại học")) bb = "05";
    else if (cleanHeDT.includes("vlvh") || cleanHeDT.includes("vừa làm vừa học")) bb = "06";
    else if (cleanHeDT.includes("thạc sĩ")) bb = "07";
    else if (cleanHeDT.includes("chứng chỉ") || cleanHeDT.includes("ngắn hạn")) bb = "08";
  }

  let s = "0";
  for (let key in DICT_HINH_THUC) { if (key.toLowerCase() === cleanHinhThuc) { s = DICT_HINH_THUC[key]; break; } }
  if (s === "0") {
    if (cleanHinhThuc.includes("đại trà")) s = "1";
    else if (cleanHinhThuc.includes("văn bằng 2") || cleanHinhThuc.includes("vb 2") || cleanHinhThuc.includes("vb2")) s = "2";
    else if (cleanHinhThuc.includes("đttx") || cleanHinhThuc.includes("từ xa")) s = "3";
    else if (cleanHinhThuc.includes("vlvh") || cleanHinhThuc.includes("vừa làm vừa học")) s = "4";
  }

  if (!aa || aa.length !== 2) return "";
  const cccdClean = String(cccdStr || "").replace(/\D/g, '');
  const xxxxxx = cccdClean.slice(-6).padStart(6, '0');
  return "'" + (aa + bb + s + xxxxxx);
}

// Lấy (hoặc tạo mới nếu chưa có) tab "NopTien" trong CHÍNH file Trung Gian — đặt cạnh
// dữ liệu hồ sơ để tự động đi theo trigger sao lưu hàng ngày (autoBackupDaily) đang có
// sẵn, không cần dựng cơ chế backup riêng cho khoản thu.
function layHoacTaoSheetNopTien() {
  const id = PropertiesService.getScriptProperties().getProperty('TRUNGGIAN_SHEET_ID');
  const ss = SpreadsheetApp.openById(id);
  let sheet = ss.getSheetByName("NopTien");
  if (!sheet) {
    sheet = ss.insertSheet("NopTien");
    sheet.appendRow(["MaSV", "LoaiPhi", "SoTien", "NguoiThu", "ThoiGian"]);
    sheet.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#e0f2f1");
  }
  return sheet;
}

// ===============================================
// HÀM XỬ LÝ REQUEST POST
// ===============================================
function doPost(e) {
  if (!e || !e.parameter || !e.parameter.action) {
    return responseJSON(400, "Thiếu tham số action", null);
  }
  
  try {
    const action = e.parameter.action;
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // [CÁC ACTION CŨ 1 -> 8 GIỮ NGUYÊN]
    if (action === 'addStudent') {
      const g = requireAuth(e.parameter, ['CanBo', 'Admin']);
      if (!g.ok) return g.resp;
      const studentData = JSON.parse(e.parameter.data);
      const sheet = ss.getSheetByName("SinhVien");
      sheet.appendRow([
        studentData.MaSV, studentData.HoTen, studentData.NgaySinh, studentData.CCCD, 
        studentData.Nganh, studentData.KhoaNhapHoc, studentData.DoiTuongUT, studentData.KhuVucUT, 
        studentData.DoiTuongDauVao, studentData.NamXetTuyen, studentData.HinhThucDT, 
        studentData.PhuongThucDT, studentData.HeDT, studentData.LinkHoSo, studentData.TrangThai,
        studentData.GiayTo || ""
      ]);
      return responseJSON(200, "Thêm sinh viên thành công", null);
    }
    
    if (action === 'deleteStudent') {
      const g = requireAuth(e.parameter, ['CanBo', 'Admin']);
      if (!g.ok) return g.resp;
      const maSV = e.parameter.MaSV; 
      const sheet = ss.getSheetByName("SinhVien");
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] == maSV) { 
          sheet.deleteRow(i + 1); 
          return responseJSON(200, "Xóa sinh viên thành công", null);
        }
      }
      return responseJSON(404, "Không tìm thấy Mã SV này", null);
    }

    if (action === 'editStudent') {
      const g = requireAuth(e.parameter, ['CanBo', 'Admin']);
      if (!g.ok) return g.resp;
      const studentData = JSON.parse(e.parameter.data);
      const sheet = ss.getSheetByName("SinhVien");
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] == studentData.MaSV) {
          const rowIndex = i + 1;
          sheet.getRange(rowIndex, 1, 1, 16).setValues([[
            studentData.MaSV, studentData.HoTen, studentData.NgaySinh, studentData.CCCD, 
            studentData.Nganh, studentData.KhoaNhapHoc, studentData.DoiTuongUT, studentData.KhuVucUT, 
            studentData.DoiTuongDauVao, studentData.NamXetTuyen, studentData.HinhThucDT, 
            studentData.PhuongThucDT, studentData.HeDT, studentData.LinkHoSo, studentData.TrangThai,
            studentData.GiayTo || ""
          ]]);
          return responseJSON(200, "Cập nhật thành công", null);
        }
      }
      return responseJSON(404, "Không tìm thấy Mã SV này", null);
    }
    
    if (action === 'toggleDocument') {
      const g = requireAuth(e.parameter, ['CanBo', 'Admin']);
      if (!g.ok) return g.resp;
      const maSV = e.parameter.MaSV;
      const tenGiayTo = e.parameter.TenGiayTo;
      const isChecked = e.parameter.IsChecked === 'true';
      const ghiChu = e.parameter.GhiChu || ''; 

      const sheet = ss.getSheetByName("GiayTo");
      const data = sheet.getDataRange().getValues();
      let foundRow = -1;
      
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] == maSV && data[i][1] == tenGiayTo) {
          foundRow = i + 1; break;
        }
      }

      if (isChecked && foundRow === -1) {
        sheet.appendRow([maSV, tenGiayTo, ghiChu]);
      } else if (!isChecked && foundRow !== -1) {
        sheet.deleteRow(foundRow);
      } else if (isChecked && foundRow !== -1) {
        sheet.getRange(foundRow, 3).setValue(ghiChu);
      }
      return responseJSON(200, "Cập nhật giấy tờ thành công", null);
    }
    
    if (action === 'toggleStatus') {
      const g = requireAuth(e.parameter, ['CanBo', 'Admin']);
      if (!g.ok) return g.resp;
      const maSV = e.parameter.MaSV;
      const status = e.parameter.Status === 'true'; 
      const sheet = ss.getSheetByName("SinhVien");
      const data = sheet.getDataRange().getValues();
      
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] == maSV) {
          sheet.getRange(i + 1, 15).setValue(status ? 1 : 0); 
          return responseJSON(200, "Đổi trạng thái thành công", null);
        }
      }
      return responseJSON(404, "Không tìm thấy Mã SV này", null);
    }


    
   // 7. LƯU CẤU HÌNH HỆ THỐNG VÀ GHI LỊCH SỬ
    if (action === 'saveConfig') {
      const g = requireAuth(e.parameter, ['Admin']);
      if (!g.ok) return g.resp;
      const parsedData = JSON.parse(e.parameter.data);
      const sheet = ss.getSheetByName("CauHinh");
      if (!sheet) return responseJSON(404, "Chưa tạo Sheet CauHinh", null);
      
      sheet.clearContents();
      const headers = ["Nganh", "KhoaNhapHoc", "DoiTuongUT", "KhuVucUT", "NamXetTuyen", "DoiTuongDauVao", "HeDaoTao", "HinhThucDaoTao"];
      sheet.appendRow(headers);
      
      // FIX LỖI: Nhận dạng linh hoạt bất kể studentApi.js đẩy lên cục data như thế nào
      const config = parsedData.Nganh ? parsedData : parsedData.config;
      if (!config) return responseJSON(400, "Dữ liệu cấu hình không hợp lệ", null);

      let maxRows = 0;
      headers.forEach(h => { 
        if (config[h] && config[h].length > maxRows) maxRows = config[h].length; 
      });
      
      if (maxRows > 0) {
        const rows = [];
        for (let i = 0; i < maxRows; i++) {
          rows.push(headers.map(h => config[h][i] || ""));
        }
        sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
      }

      // GHI LOG LỊCH SỬ CẤU HÌNH VÀO SHEET
      const logSheet = ss.getSheetByName("LichSuCauHinh");
      if (logSheet) {
          const now = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
          // ĐÃ SỬA: dùng email đã xác thực server-side (g.userInfo.email) thay vì tin
          // "userEmail" do client tự khai — trước đây client có thể tự xưng bất kỳ tên nào vào log.
          const user = g.userInfo.email;
          logSheet.appendRow([now, user, "Đã cập nhật cấu hình hệ thống"]);
      }
      
      return responseJSON(200, "Lưu cấu hình thành công", null);
    }
    
    // =====================================
    // ĐĂNG NHẬP TÀI KHOẢN NỘI BỘ (KHÔNG CÓ GMAIL)
    // ĐÃ SỬA (bug bảo mật nghiêm trọng): bản cũ so username với cột Email và
    // password với cột Role — vì Role chỉ có 4 giá trị cố định (Admin/TuyenSinh/
    // CanBo/Thamdinh) nên ai biết email 1 tài khoản là đăng nhập được ngay,
    // bỏ qua hoàn toàn xác thực. Giờ dùng CỘT D (MatKhauHash) riêng, lưu bản băm
    // SHA-256 chứ không lưu chữ thường — xem hàm taoHashMatKhau() cuối file để
    // tự tạo hash khi cấp tài khoản mới. Tài khoản đăng nhập Google để trống cột
    // này thì action 'login' sẽ luôn không khớp — không xung đột với luồng Google.
    // =====================================
    if (action === 'login') {
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

    // =====================================
    // 9. KIỂM TRA ĐĂNG NHẬP BẰNG GOOGLE TOKEN (PHÂN QUYỀN MỚI)
    // =====================================
    if (action === 'verifyToken') {
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

    // =====================================
    // 10. YÊU CẦU CẤP QUYỀN (GỬI VỀ GOOGLE CHAT)
    // =====================================
    if (action === 'requestAccess') {
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
// =====================================
    // 11. TÌM KIẾM HỒ SƠ CŨ (TỪ FILE TRUNG GIAN)
    // =====================================
    if (action === 'searchOldRecord') {
      const parsedData = JSON.parse(e.parameter.data);
      
      // ĐÃ SỬA: dùng requireAuth() thay cho verifyGoogleIdToken() tự viết riêng — hỗ trợ
      // luôn sessionToken (tài khoản nội bộ), trước đây chỉ nhận Google idToken.
      // requireAuth() đọc thẳng params.idToken/params.sessionToken, "parsedData" đã có
      // đúng 2 field này (frontend gửi kèm cả 2, xem postAiAction() ở studentApi.js).
      const g = requireAuth(parsedData, ['TuyenSinh', 'ThamDinh', 'Admin']);
      if (!g.ok) return g.resp;
      
      const kw = String(parsedData.keyword).trim().toLowerCase();
      if (!kw) return responseJSON(400, "Thiếu từ khóa", null);

      const TRUNGGIAN_ID = "1DBYrAObOLR7jtj74B_jBHVDf2I07UXc8zpgppvbabbs";
      const ssTrungGian = SpreadsheetApp.openById(TRUNGGIAN_ID);
      const sheet = ssTrungGian.getSheets()[0]; 
      
      const values = sheet.getDataRange().getValues();
      const rawHeaders = values[0];
      // Chuẩn hóa tiêu đề: Viết hoa, xóa dấu cách thừa để dò cho chuẩn
      const cleanHeaders = rawHeaders.map(h => String(h).trim().toUpperCase().replace(/\s+/g, ' '));
      
      let results = [];
      for (let i = 1; i < values.length; i++) {
        // Dò linh hoạt: Dù ông đặt tên là CĂN CƯỚC hay CCCD đều tìm được
        const idxCccd = cleanHeaders.indexOf("CĂN CƯỚC") !== -1 ? cleanHeaders.indexOf("CĂN CƯỚC") : cleanHeaders.indexOf("CCCD");
        const idxName = cleanHeaders.indexOf("TÊN SINH VIÊN") !== -1 ? cleanHeaders.indexOf("TÊN SINH VIÊN") : cleanHeaders.indexOf("HỌ VÀ TÊN");
        const idxNganh = cleanHeaders.indexOf("NGÀNH");
        const idxStatus = cleanHeaders.indexOf("TRẠNG THÁI THẨM ĐỊNH");

        const cccd = idxCccd !== -1 ? String(values[i][idxCccd] || "").replace(/\D/g, '') : "";
        const hoTen = idxName !== -1 ? String(values[i][idxName] || "").toLowerCase() : "";
        
        if (cccd.includes(kw) || hoTen.includes(kw)) {
           let rowData = {};
           // Đóng gói data bằng tên tiêu đề GỐC để nhả về React Form cho khớp
           rawHeaders.forEach((h, idx) => { rowData[h] = values[i][idx]; });
           
           results.push({
              hoTen: idxName !== -1 ? values[i][idxName] : "Unknown",
              cccd: cccd,
              nganh: idxNganh !== -1 ? values[i][idxNganh] : "Unknown",
              trangThai: idxStatus !== -1 ? values[i][idxStatus] : "Chưa rõ",
              fullData: rowData
           });
        }
      }
      return results.length > 0 ? responseJSON(200, "Tìm thấy", results) : responseJSON(404, "Không tìm thấy hồ sơ nào", null);
    }

   // =====================================
    // ĐÃ THÊM: NHẬP EXCEL RIÊNG CHO TRANG THU HỒ SƠ NHẬP HỌC (AdmissionsPage)
    // Trước đây nút "Nhập Excel" ở trang này gọi NHẦM sang action 'importStudents'
    // bên dưới — action đó ghi vào sheet TRUNG GIAN (dùng cho luồng Xét tuyển), khác
    // hẳn file Sheet "SinhVien" mà trang này đọc/hiển thị (SPREADSHEET_ID) — nên dữ
    // liệu import xong không bao giờ hiện ra trong bảng. Action mới này ghi ĐÚNG vào
    // sheet "SinhVien", đúng thứ tự cột như addStudent, có chống trùng theo MaSV
    // (import lại file cũ sẽ tự bỏ qua dòng đã có, không tạo dòng đúp).
    // =====================================
    if (action === 'importStudentsAdmissions') {
      const g = requireAuth(e.parameter, ['CanBo', 'Admin']);
      if (!g.ok) return g.resp;

      const rows = JSON.parse(e.parameter.data);
      if (!rows || rows.length === 0) return responseJSON(200, "Không có dữ liệu", { added: 0, skipped: 0 });

      const sheet = ss.getSheetByName("SinhVien");
      if (!sheet) return responseJSON(404, "Chưa tạo Sheet SinhVien", null);

      const lastRow = sheet.getLastRow();
      const existingMaSV = {};
      if (lastRow > 1) {
        const existingData = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        existingData.forEach(r => { if (r[0]) existingMaSV[String(r[0]).trim()] = true; });
      }

      const newRows = [];
      let skipped = 0;
      rows.forEach(sv => {
        const maSV = String(sv.MaSV || "").trim();
        if (!maSV || existingMaSV[maSV]) { skipped++; return; }
        existingMaSV[maSV] = true;
        newRows.push([
          maSV, sv.HoTen || "", sv.NgaySinh || "", sv.CCCD || "",
          sv.Nganh || "", sv.KhoaNhapHoc || "", sv.DoiTuongUT || "", sv.KhuVucUT || "",
          sv.DoiTuongDauVao || "", sv.NamXetTuyen || "", sv.HinhThucDT || "",
          sv.PhuongThucDT || "", sv.HeDT || "", sv.LinkHoSo || "", sv.TrangThai || 0,
          sv.GiayTo || ""
        ]);
      });

      if (newRows.length > 0) {
        sheet.getRange(lastRow + 1, 1, newRows.length, 16).setValues(newRows);
      }
      return responseJSON(200, "Nhập Excel thành công", { added: newRows.length, skipped: skipped });
    }

    // =====================================
    // ĐÃ THÊM: TRANG "THU HỒ SƠ NHẬP HỌC" — 6 ACTION MỚI, ĐỌC/GHI THẲNG SHEET TRUNG GIAN
    // (xem hằng số + hàm dùng chung ADMISSIONS_*/docTrunggianRaw()/generateMaSVTuChung()
    // ngay phía trên hàm doPost). Thay thế hoàn toàn addStudent/editStudent/deleteStudent/
    // toggleDocument/toggleStatus/importStudentsAdmissions cho trang này — 5 action cũ đó
    // vẫn còn nguyên ở trên (chưa xoá) phòng khi ông còn cần đối chiếu, có thể dọn sau.
    // =====================================

    // THÊM HỒ SƠ MỚI (modal "Thêm hồ sơ")
    if (action === 'addAdmission') {
      const g = requireAuth(e.parameter, ['CanBo', 'Admin']);
      if (!g.ok) return g.resp;
      const payload = JSON.parse(e.parameter.data);
      const trunggian = docTrunggianRaw();

      const namHienTai = String(new Date().getFullYear());
      const maSV = generateMaSVTuChung(namHienTai, payload["HỆ ĐÀO TẠO"], payload["HÌNH THỨC ĐÀO TẠO"], payload["CĂN CƯỚC"]);
      if (!maSV) return responseJSON(400, "Thiếu Hệ đào tạo/Hình thức đào tạo/Căn cước — không sinh được Mã sinh viên", null);

      const rowMap = {};
      ADMISSIONS_DATA_FIELDS.forEach(f => { rowMap[f] = payload[f] || ""; });
      ADMISSIONS_CHECK_FIELDS.forEach(f => {
        rowMap[f] = f === "GIẤY TỜ ƯU TIÊN" ? String(payload[f] || "").trim() : (payload[f] ? "x" : "");
      });
      rowMap[ADMISSIONS_STATUS_FIELD] = payload["XN_NHAP_HOC"] ? ADMISSIONS_STATUS_VALUE : "";
      rowMap["NĂM XÉT TUYỂN"] = namHienTai;
      rowMap["TIME"] = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
      rowMap["TÀI KHOẢN NHẬP LIỆU"] = g.userInfo.email;
      rowMap[ADMISSIONS_KENH_FIELD] = ADMISSIONS_KENH_NOP;
      ADMISSIONS_MASV_NAMES.forEach(n => { rowMap[n] = maSV; }); // ghi vào đúng biến thể tên cột đang thật sự tồn tại trên sheet
      if (payload["CĂN CƯỚC"]) rowMap["CĂN CƯỚC"] = "'" + String(payload["CĂN CƯỚC"]).replace(/'/g, '');

      const newRow = trunggian.cleanHeaders.map(h => rowMap[h] !== undefined ? rowMap[h] : "");
      trunggian.sheet.appendRow(newRow);

      // ĐÃ THÊM: cho phép modal "Thêm hồ sơ" gửi kèm luôn danh sách khoản đã tick ở
      // khối Nộp tiền ngay lúc tạo mới (payload["_noptien"] = [{loaiPhi, soTien}, ...])
      // — vì lúc submit modal chưa có Mã SV để gọi savePayment() riêng, nên gộp chung
      // vào action này, ghi bằng đúng Mã SV vừa sinh ra ở trên.
      const dsNopTien = payload["_noptien"];
      if (Array.isArray(dsNopTien) && dsNopTien.length > 0) {
        const sheetNT = layHoacTaoSheetNopTien();
        const nowNT = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
        const maSVClean = maSV.replace(/^'/, '');
        dsNopTien.forEach(kt => {
          if (!kt || !kt.loaiPhi) return;
          sheetNT.appendRow([maSVClean, kt.loaiPhi, kt.soTien || "", g.userInfo.email, nowNT]);
        });
      }

      return responseJSON(200, "Thêm hồ sơ thành công", { maSV: maSV.replace(/^'/, '') });
    }

    // SỬA HỒ SƠ (chỉ sửa hồ sơ thuộc đúng kênh "Thu hồ sơ trực tiếp")
    if (action === 'updateAdmission') {
      const g = requireAuth(e.parameter, ['CanBo', 'Admin']);
      if (!g.ok) return g.resp;
      const payload = JSON.parse(e.parameter.data);
      const { sheet, cleanHeaders, values } = docTrunggianRaw();
      const idxMaSV = timCotTheoTen.apply(null, [cleanHeaders].concat(ADMISSIONS_MASV_NAMES));
      const idxKenh = timCotTheoTen(cleanHeaders, ADMISSIONS_KENH_FIELD);
      if (idxMaSV === -1) return responseJSON(404, "Không tìm thấy cột Mã sinh viên trên Trung Gian", null);

      const maSVTarget = String(payload["MÃ SINH VIÊN"] || "").replace(/^'/, '').trim();
      let rowIndex = -1;
      for (let i = 1; i < values.length; i++) {
        const cellMaSV = String(values[i][idxMaSV] || "").replace(/^'/, '').trim();
        if (cellMaSV === maSVTarget && (idxKenh === -1 || String(values[i][idxKenh] || "").trim() === ADMISSIONS_KENH_NOP)) { rowIndex = i + 1; break; }
      }
      if (rowIndex === -1) return responseJSON(404, "Không tìm thấy hồ sơ này (hoặc không thuộc kênh Thu hồ sơ trực tiếp)", null);

      const rowMap = {};
      ADMISSIONS_DATA_FIELDS.forEach(f => { if (payload[f] !== undefined) rowMap[f] = payload[f]; });
      ADMISSIONS_CHECK_FIELDS.forEach(f => {
        if (payload[f] === undefined) return;
        rowMap[f] = f === "GIẤY TỜ ƯU TIÊN" ? String(payload[f] || "").trim() : (payload[f] ? "x" : "");
      });
      if (payload["XN_NHAP_HOC"] !== undefined) rowMap[ADMISSIONS_STATUS_FIELD] = payload["XN_NHAP_HOC"] ? ADMISSIONS_STATUS_VALUE : "";
      rowMap["NGÀY CẬP NHẬT HỒ SƠ"] = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
      rowMap["TÀI KHOẢN NHẬP LIỆU"] = g.userInfo.email;
      if (payload["CĂN CƯỚC"]) rowMap["CĂN CƯỚC"] = "'" + String(payload["CĂN CƯỚC"]).replace(/'/g, '');

      cleanHeaders.forEach((h, colIndex) => {
        if (rowMap[h] !== undefined) sheet.getRange(rowIndex, colIndex + 1).setValue(rowMap[h]);
      });
      return responseJSON(200, "Cập nhật thành công", null);
    }

    // XÓA HỒ SƠ (chỉ xóa hồ sơ thuộc đúng kênh "Thu hồ sơ trực tiếp")
    if (action === 'deleteAdmission') {
      const g = requireAuth(e.parameter, ['CanBo', 'Admin']);
      if (!g.ok) return g.resp;
      const maSVTarget = String(e.parameter.MaSV || "").replace(/^'/, '').trim();
      const { sheet, cleanHeaders, values } = docTrunggianRaw();
      const idxMaSV = timCotTheoTen.apply(null, [cleanHeaders].concat(ADMISSIONS_MASV_NAMES));
      const idxKenh = timCotTheoTen(cleanHeaders, ADMISSIONS_KENH_FIELD);
      if (idxMaSV === -1) return responseJSON(404, "Không tìm thấy cột Mã sinh viên trên Trung Gian", null);
      for (let i = 1; i < values.length; i++) {
        const cellMaSV = String(values[i][idxMaSV] || "").replace(/^'/, '').trim();
        if (cellMaSV === maSVTarget && (idxKenh === -1 || String(values[i][idxKenh] || "").trim() === ADMISSIONS_KENH_NOP)) {
          sheet.deleteRow(i + 1);
          return responseJSON(200, "Xóa hồ sơ thành công", null);
        }
      }
      return responseJSON(404, "Không tìm thấy hồ sơ này (hoặc không thuộc kênh Thu hồ sơ trực tiếp)", null);
    }

    // TICK/SỬA 1 Ô GIẤY TỜ HOẶC "XN NHẬP HỌC" — thay cho toggleDocument cũ. Field truyền
    // lên là TÊN CỘT TRUNG GIAN thật (VD "ẢNH THẺ", "GIẤY TỜ ƯU TIÊN", hoặc chính
    // ADMISSIONS_STATUS_FIELD khi tick/bỏ tick "XN nhập học" ở khung bên phải).
    if (action === 'toggleAdmissionField') {
      const g = requireAuth(e.parameter, ['CanBo', 'Admin']);
      if (!g.ok) return g.resp;
      const maSVTarget = String(e.parameter.MaSV || "").replace(/^'/, '').trim();
      const fieldName = String(e.parameter.Field || "").toUpperCase().trim();
      const isChecked = e.parameter.IsChecked === 'true';
      const ghiChu = e.parameter.GhiChu || '';

      const { sheet, cleanHeaders, values } = docTrunggianRaw();
      const idxMaSV = timCotTheoTen.apply(null, [cleanHeaders].concat(ADMISSIONS_MASV_NAMES));
      const idxField = cleanHeaders.indexOf(fieldName);
      if (idxMaSV === -1 || idxField === -1) return responseJSON(404, "Không tìm thấy cột cần cập nhật trên Trung Gian: " + fieldName, null);

      for (let i = 1; i < values.length; i++) {
        const cellMaSV = String(values[i][idxMaSV] || "").replace(/^'/, '').trim();
        if (cellMaSV === maSVTarget) {
          let giaTri = "";
          if (isChecked) {
            giaTri = fieldName === ADMISSIONS_STATUS_FIELD ? ADMISSIONS_STATUS_VALUE
                   : fieldName === "GIẤY TỜ ƯU TIÊN" ? (ghiChu || "x")
                   : "x";
          }
          sheet.getRange(i + 1, idxField + 1).setValue(giaTri);
          return responseJSON(200, "Cập nhật thành công", null);
        }
      }
      return responseJSON(404, "Không tìm thấy hồ sơ này", null);
    }

    // NHẬP EXCEL — ghi thẳng vào Trung Gian, dùng đúng bộ cột ADMISSIONS_* (đồng nhất
    // với modal thêm tay). File mẫu do action 'getAdmissionsHeaders' sinh ra ở trên khớp
    // đúng các cột được đọc ở đây — đổi 1 trong 2 chỗ thì nhớ đổi luôn chỗ còn lại.
    if (action === 'importAdmissions') {
      const g = requireAuth(e.parameter, ['CanBo', 'Admin']);
      if (!g.ok) return g.resp;
      const rows = JSON.parse(e.parameter.data);
      if (!rows || rows.length === 0) return responseJSON(200, "Không có dữ liệu", { added: 0, skipped: 0 });

      const { sheet, cleanHeaders, values } = docTrunggianRaw();
      const idxMaSV = timCotTheoTen.apply(null, [cleanHeaders].concat(ADMISSIONS_MASV_NAMES));
      const existingMaSV = {};
      for (let i = 1; i < values.length; i++) {
        if (idxMaSV !== -1) {
          const v = String(values[i][idxMaSV] || "").replace(/^'/, '').trim();
          if (v) existingMaSV[v] = true;
        }
      }

      const namHienTai = String(new Date().getFullYear());
      const newRows = [];
      let skipped = 0;

      rows.forEach(raw => {
        const cleanRow = {};
        for (const key in raw) cleanRow[String(key).toUpperCase().trim().replace(/\s+/g, ' ')] = raw[key];

        const maSV = generateMaSVTuChung(namHienTai, cleanRow["HỆ ĐÀO TẠO"], cleanRow["HÌNH THỨC ĐÀO TẠO"], cleanRow["CĂN CƯỚC"]);
        const maSVClean = maSV.replace(/^'/, '');
        if (!maSVClean || existingMaSV[maSVClean]) { skipped++; return; }
        existingMaSV[maSVClean] = true;

        const rowMap = {};
        ADMISSIONS_DATA_FIELDS.forEach(f => { rowMap[f] = cleanRow[f] || ""; });
        ADMISSIONS_CHECK_FIELDS.forEach(f => { rowMap[f] = cleanRow[f] || ""; }); // file mẫu: điền "x" thẳng trong ô Excel
        rowMap[ADMISSIONS_STATUS_FIELD] = String(cleanRow[ADMISSIONS_STATUS_FIELD] || "").trim() === ADMISSIONS_STATUS_VALUE ? ADMISSIONS_STATUS_VALUE : "";
        rowMap["NĂM XÉT TUYỂN"] = namHienTai;
        rowMap["TIME"] = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
        rowMap["TÀI KHOẢN NHẬP LIỆU"] = g.userInfo.email;
        rowMap[ADMISSIONS_KENH_FIELD] = ADMISSIONS_KENH_NOP;
        ADMISSIONS_MASV_NAMES.forEach(n => { rowMap[n] = maSV; });
        if (cleanRow["CĂN CƯỚC"]) rowMap["CĂN CƯỚC"] = "'" + String(cleanRow["CĂN CƯỚC"]).replace(/'/g, '');

        newRows.push(cleanHeaders.map(h => rowMap[h] !== undefined ? rowMap[h] : ""));
      });

      if (newRows.length > 0) {
        sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, cleanHeaders.length).setValues(newRows);
      }
      return responseJSON(200, "Nhập Excel thành công", { added: newRows.length, skipped: skipped });
    }

    // LƯU 1 KHOẢN NỘP TIỀN (tick loại phí -> ghi/xoá 1 dòng trong tab NopTien)
    if (action === 'savePayment') {
      const g = requireAuth(e.parameter, ['CanBo', 'Admin']);
      if (!g.ok) return g.resp;
      const maSVTarget = String(e.parameter.MaSV || "").trim();
      const loaiPhi = String(e.parameter.LoaiPhi || "").trim();
      const soTien = e.parameter.SoTien;
      const isChecked = e.parameter.IsChecked === 'true';

      const sheetNT = layHoacTaoSheetNopTien();
      const dataNT = sheetNT.getDataRange().getValues();
      let foundRow = -1;
      for (let i = 1; i < dataNT.length; i++) {
        if (String(dataNT[i][0] || "").trim() === maSVTarget && String(dataNT[i][1] || "").trim() === loaiPhi) { foundRow = i + 1; break; }
      }
      const now = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
      if (isChecked) {
        if (foundRow === -1) sheetNT.appendRow([maSVTarget, loaiPhi, soTien, g.userInfo.email, now]);
        else sheetNT.getRange(foundRow, 3, 1, 3).setValues([[soTien, g.userInfo.email, now]]);
      } else if (foundRow !== -1) {
        sheetNT.deleteRow(foundRow);
      }
      return responseJSON(200, "Cập nhật thành công", null);
    }

    // =====================================
    // ĐÃ THÊM (rà soát Trunggian.gs): CHECK TRÙNG CHO IMPORT EXCEL BÊN XÉT TUYỂN — gọi
    // 1 LẦN DUY NHẤT cho cả loạt (không phải hỏi từng dòng) ngay lúc bấm "Nhập" trong
    // modal import, TRƯỚC khi đẩy hẳn vào dataList hiển thị trên trang. Không dùng cho
    // nhánh nhập tay (nhập tay chỉ so với dataList cục bộ, không gọi server, để không
    // làm chậm thao tác gõ liên tục — đã thống nhất với người dùng).
    // =====================================
    if (action === 'checkDuplicatesXetTuyen') {
      const g = requireAuth(e.parameter, ['TuyenSinh', 'ThamDinh', 'Admin']);
      if (!g.ok) return g.resp;

      const keysToCheck = JSON.parse(e.parameter.data); // mảng [{cccd, nganh}, ...]
      const TRUNGGIAN_ID_DUP = "1DBYrAObOLR7jtj74B_jBHVDf2I07UXc8zpgppvbabbs";
      const ssDup = SpreadsheetApp.openById(TRUNGGIAN_ID_DUP);
      const sheetDup = ssDup.getSheets()[0];
      const dataDup = sheetDup.getDataRange().getValues();
      const headersDup = dataDup[0].map(h => String(h).trim().toUpperCase().replace(/\s+/g, ' '));

      const cccdColDup = headersDup.indexOf("CĂN CƯỚC") !== -1 ? headersDup.indexOf("CĂN CƯỚC") : headersDup.indexOf("CCCD");
      const nganhColDup = headersDup.indexOf("NGÀNH");
      const tenColDup = headersDup.indexOf("TÊN SINH VIÊN");
      const statusColDup = headersDup.indexOf("TRẠNG THÁI ĐẨY");

      const seenInBatch = {};
      const results = keysToCheck.map((k, idx) => {
        const cleanCccd = String(k.cccd || "").replace(/\D/g, '');
        const cleanNganh = String(k.nganh || "").trim().toLowerCase();
        const batchKey = cleanCccd + "|" + cleanNganh;

        if (cccdColDup !== -1 && nganhColDup !== -1 && cleanCccd) {
          for (let i = 1; i < dataDup.length; i++) {
            const sheetCccd = String(dataDup[i][cccdColDup]).replace(/\D/g, '');
            const sheetNganh = String(dataDup[i][nganhColDup]).trim().toLowerCase();
            if (sheetCccd === cleanCccd && sheetNganh === cleanNganh) {
              return {
                cccd: k.cccd, nganh: k.nganh, exists: true, duplicateInBatch: false,
                ten: tenColDup !== -1 ? String(dataDup[i][tenColDup] || "") : "",
                trangThai: statusColDup !== -1 ? String(dataDup[i][statusColDup] || "") : "",
              };
            }
          }
        }

        if (cleanCccd && Object.prototype.hasOwnProperty.call(seenInBatch, batchKey)) {
          return { cccd: k.cccd, nganh: k.nganh, exists: false, duplicateInBatch: true, duplicateWithRow: seenInBatch[batchKey] };
        }
        if (cleanCccd) seenInBatch[batchKey] = idx;
        return { cccd: k.cccd, nganh: k.nganh, exists: false, duplicateInBatch: false };
      });

      return responseJSON(200, "Thành công", { results });
    }

   // =====================================
    // 6. NHẬP EXCEL & ĐẨY DỮ LIỆU (MÃ SV = NĂM + HỆ + HT + 6 SỐ CUỐI CCCD)
    // (Dùng cho luồng XÉT TUYỂN, ghi vào sheet TRUNG GIAN — KHÔNG phải sheet này)
    // =====================================
    if (action === 'importStudents') {
      // Đoán theo quyền route "/xet-tuyen" trong App.jsx (['TuyenSinh','ThamDinh']) —
      // bạn xác nhận lại nếu ý đồ thực tế khác (vd chỉ TuyenSinh mới được import).
      const g = requireAuth(e.parameter, ['TuyenSinh', 'ThamDinh', 'Admin']);
      if (!g.ok) return g.resp;
      const studentsArray = JSON.parse(e.parameter.data);
      const TRUNGGIAN_ID = "1DBYrAObOLR7jtj74B_jBHVDf2I07UXc8zpgppvbabbs";
      const ssTrungGian = SpreadsheetApp.openById(TRUNGGIAN_ID);
      const sheet = ssTrungGian.getSheets()[0];
      
      const data = sheet.getDataRange().getValues();
      const rawHeaders = data[0]; 
      const cleanHeaders = rawHeaders.map(h => String(h).trim().toUpperCase().replace(/\s+/g, ' '));
      
      const idxCccd = cleanHeaders.indexOf("CĂN CƯỚC") !== -1 ? cleanHeaders.indexOf("CĂN CƯỚC") : cleanHeaders.indexOf("CCCD");
      const idxNganh = cleanHeaders.indexOf("NGÀNH");
      const idxMaSV = cleanHeaders.findIndex(h => h === "MÃ SINH VIÊN" || h === "MÃ SỐ NGƯỜI HỌC" || h === "MASV" || h === "MÃ SV");
      // ĐÃ THÊM (rà soát an toàn 2 luồng chung 1 sheet): mọi hồ sơ do action này ghi (dùng
      // riêng cho luồng Xét tuyển — nhập tay hoặc import Excel, đều đẩy qua đây khi bấm
      // "Đẩy dữ liệu lên hệ thống") giờ được gắn KÊNH NỘP = "TS Online", song song với
      // "Thu hồ sơ trực tiếp" bên trang Nhập học — để phân biệt 2 luồng ngay trên sheet,
      // và để action trungTuyen/baoThieu đối chiếu thêm cột này khi ghi trạng thái.
      const idxKenh = cleanHeaders.indexOf("KÊNH NỘP");
      const KENH_TS_ONLINE = "TS Online";
      const KENH_TRUC_TIEP_GUARD = "Thu hồ sơ trực tiếp";

      // TỪ ĐIỂN MÃ HÓA
      const DICT_HE_DT = {
        "Cao đẳng": "01", "Đại học chính quy": "02", "Liên thông ĐH - ĐH (Văn bằng 2)": "03",
        "Thường xuyên: Phương thức ĐTTX": "04", "Liên thông từ CĐ lên ĐH": "05",
        "Thường xuyên: Phương thức VLVH": "06", "Thạc sĩ": "07", "Khóa ngắn hạn cấp chứng chỉ": "08"
      };
      
      const DICT_HINH_THUC = {
        "Chính quy đại trà": "1", "Liên thông ĐH - ĐH chính quy (VB 2)": "2",
        "Thường xuyên: Phương thức ĐTTX": "3", "Thường xuyên: Phương thức VLVH": "4"
      };

      const existingMap = {};
      for (let i = 1; i < data.length; i++) {
         const cccdRow = idxCccd !== -1 ? String(data[i][idxCccd] || "").replace(/\D/g, '') : "";
         const nganhRow = idxNganh !== -1 ? String(data[i][idxNganh] || "").trim().toLowerCase() : "";
         if (cccdRow && nganhRow) existingMap[`${cccdRow}_${nganhRow}`] = i + 1;
      }

      let inserted = 0; let updated = 0; let failedList = [];
      // ĐÃ THÊM (rà soát Trunggian.gs — port sang đây, giữ đúng hành vi an toàn cũ):
      // hồ sơ SỬA (_Action=UPDATE) nhưng KHÔNG khớp được dòng nào theo CCCD+Ngành hiện
      // có trên sheet -> KHÔNG được âm thầm rớt xuống appendRow tạo dòng MỚI (bug cũ ở
      // đây trước khi sửa) — phải báo lỗi rõ ràng, gom vào failedUpdates.
      const failedUpdates = [];
      const insertedDetails = []; const updatedDetails = [];

      // Lấy/tạo tab "Backup" — backup dòng cũ TRƯỚC khi ghi đè, y hệt Trunggian.gs cũ.
      let backupSheet = ssTrungGian.getSheetByName("Backup");
      if (!backupSheet) backupSheet = ssTrungGian.insertSheet("Backup");

      // 🌟 HÀM SINH MÃ TỰ ĐỘNG THÔNG MINH (Bất tử với việc gõ sai chữ hoa/thường)
      const generateMaSV = (namXT, heDT, hinhThuc, cccdStr) => {
          const aa = String(namXT || "").slice(-2); 
          
          const cleanHeDT = String(heDT || "").trim().toLowerCase();
          const cleanHinhThuc = String(hinhThuc || "").trim().toLowerCase();
          
          let bb = "00";
          for (let key in DICT_HE_DT) {
              if (key.toLowerCase() === cleanHeDT) { bb = DICT_HE_DT[key]; break; }
          }
          // Bọc giáp: Quét từ khóa lỡ người dùng sửa tên Hệ Đào Tạo quá tay
          if (bb === "00") {
              if (cleanHeDT.includes("cao đẳng")) bb = "01";
              else if (cleanHeDT.includes("đại học") || cleanHeDT.includes("đh chính quy")) bb = "02";
              else if (cleanHeDT.includes("văn bằng 2") || cleanHeDT.includes("vb2") || cleanHeDT.includes("vb 2")) bb = "03";
              else if (cleanHeDT.includes("đttx") || cleanHeDT.includes("từ xa")) bb = "04";
              else if (cleanHeDT.includes("lên đh") || cleanHeDT.includes("lên đại học")) bb = "05";
              else if (cleanHeDT.includes("vlvh") || cleanHeDT.includes("vừa làm vừa học")) bb = "06";
              else if (cleanHeDT.includes("thạc sĩ")) bb = "07";
              else if (cleanHeDT.includes("chứng chỉ") || cleanHeDT.includes("ngắn hạn")) bb = "08";
          }
          
          let s = "0";
          for (let key in DICT_HINH_THUC) {
              if (key.toLowerCase() === cleanHinhThuc) { s = DICT_HINH_THUC[key]; break; }
          }
          // Bọc giáp: Quét từ khóa lỡ người dùng sửa tên Hình Thức quá tay
          if (s === "0") {
              if (cleanHinhThuc.includes("đại trà")) s = "1";
              else if (cleanHinhThuc.includes("văn bằng 2") || cleanHinhThuc.includes("vb 2") || cleanHinhThuc.includes("vb2")) s = "2";
              else if (cleanHinhThuc.includes("đttx") || cleanHinhThuc.includes("từ xa")) s = "3";
              else if (cleanHinhThuc.includes("vlvh") || cleanHinhThuc.includes("vừa làm vừa học")) s = "4";
          }
          
          if (!aa || aa.length !== 2) return ""; 
          
          const cccdClean = String(cccdStr || "").replace(/\D/g, '');
          const xxxxxx = cccdClean.slice(-6).padStart(6, '0');
          
          const finalCode = `${aa}${bb}${s}${xxxxxx}`;
          return "'" + finalCode; 
      };

      studentsArray.forEach(s => {
        const cleanS = {};
        for (let key in s) {
            cleanS[String(key).trim().toUpperCase().replace(/\s+/g, ' ')] = s[key];
        }

        const cccdTarget = String(cleanS["CĂN CƯỚC"] || cleanS["CCCD"] || "").replace(/\D/g, '');
        const nganhTarget = String(cleanS["NGÀNH"] || cleanS["NGANH"] || "").trim().toLowerCase();
        const keyMap = `${cccdTarget}_${nganhTarget}`;
        const rowIndex = existingMap[keyMap];

        if (cleanS["CĂN CƯỚC"]) cleanS["CĂN CƯỚC"] = "'" + String(cleanS["CĂN CƯỚC"]).replace(/'/g, '');
        if (cleanS["CCCD"]) cleanS["CCCD"] = "'" + String(cleanS["CCCD"]).replace(/'/g, '');

        const newMaSV = generateMaSV(cleanS["NĂM XÉT TUYỂN"], cleanS["HỆ ĐÀO TẠO"], cleanS["HÌNH THỨC ĐÀO TẠO"], cccdTarget);
        const targetMaSVCol = idxMaSV !== -1 ? cleanHeaders[idxMaSV] : null;

        if (cleanS["_ACTION"] === 'UPDATE') {
          if (rowIndex) {
            // Backup dòng cũ TRƯỚC khi ghi đè, giống hệt Trunggian.gs cũ.
            const oldRowData = sheet.getRange(rowIndex, 1, 1, cleanHeaders.length).getValues()[0];
            if (backupSheet.getLastRow() === 0) {
              const backupHeaders = cleanHeaders.slice();
              backupHeaders.push("BACKUP DATE");
              backupSheet.appendRow(backupHeaders);
              backupSheet.getRange(1, 1, 1, backupHeaders.length).setFontWeight("bold").setBackground("#e0f2f1");
            }
            const rowToBackup = oldRowData.slice();
            rowToBackup.push(Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss"));
            backupSheet.appendRow(rowToBackup);

            // ĐÃ THÊM: tự gắn "TS Online" cho hồ sơ Xét tuyển đang sửa nếu KÊNH NỘP đang
            // trống — CHỈ khi chưa phải "Thu hồ sơ trực tiếp" (phòng trường hợp hiếm: sửa
            // nhầm 1 hồ sơ Nhập học trùng CCCD+Ngành — tuyệt đối không ghi đè kênh của nó).
            if (idxKenh !== -1 && cleanS["KÊNH NỘP"] === undefined) {
              const existingKenh = String(oldRowData[idxKenh] || "").trim();
              if (existingKenh !== KENH_TRUC_TIEP_GUARD) cleanS["KÊNH NỘP"] = KENH_TS_ONLINE;
            }

            const changeLines = [];
            cleanHeaders.forEach((h, colIndex) => {
              if (cleanS[h] !== undefined) {
                  if (colIndex === idxMaSV) {
                      const oldData = String(data[rowIndex - 1][colIndex] || "").trim();
                      if (!oldData && cleanS[h]) sheet.getRange(rowIndex, colIndex + 1).setValue(cleanS[h]);
                  } else {
                      const oldValStr = String(oldRowData[colIndex] === null || oldRowData[colIndex] === undefined ? "" : oldRowData[colIndex]).trim();
                      const newValStr = String(cleanS[h]).trim();
                      if (oldValStr !== newValStr) {
                        changeLines.push(h + ": \"" + truncateForChat(oldValStr) + "\" → \"" + truncateForChat(newValStr) + "\"");
                      }
                      sheet.getRange(rowIndex, colIndex + 1).setValue(cleanS[h]);
                  }
              }
            });
            updated++;
            updatedDetails.push({ ten: cleanS["TÊN SINH VIÊN"] || "", nganh: cleanS["NGÀNH"] || cleanS["NGANH"] || "", changes: changeLines });
          } else {
             // ĐÃ SỬA: trước đây rớt xuống appendRow tạo dòng MỚI khi không khớp được hồ sơ
             // gốc cần sửa — nguy cơ tạo hồ sơ trùng do CCCD/Ngành gửi lên lệch với dòng gốc.
             // Giờ CHỈ báo lỗi rõ ràng, không ghi gì cả.
             failedUpdates.push({ cccd: cccdTarget, nganh: cleanS["NGÀNH"] || cleanS["NGANH"] || "", ten: cleanS["TÊN SINH VIÊN"] || "" });
          }
        } else {
          if (rowIndex) {
             failedList.push({ cccd: cccdTarget, nganh: cleanS["NGÀNH"] || cleanS["NGANH"] || "" });
          } else {
             if (targetMaSVCol && !cleanS[targetMaSVCol] && newMaSV) cleanS[targetMaSVCol] = newMaSV;
             // ĐÃ THÊM: hồ sơ MỚI từ luồng Xét tuyển -> gắn KÊNH NỘP = "TS Online" mặc định
             // (không có gì để "ghi đè nhầm" ở nhánh này vì đây là dòng hoàn toàn mới).
             if (idxKenh !== -1 && !cleanS["KÊNH NỘP"]) cleanS["KÊNH NỘP"] = KENH_TS_ONLINE;
             const newRow = cleanHeaders.map(h => cleanS[h] !== undefined ? cleanS[h] : "");
             sheet.appendRow(newRow);
             inserted++;
             existingMap[keyMap] = sheet.getLastRow();
             insertedDetails.push({ ten: cleanS["TÊN SINH VIÊN"] || "", nganh: cleanS["NGÀNH"] || cleanS["NGANH"] || "" });
          }
        }
      });

      // ĐÃ THÊM (rà soát Trunggian.gs): thông báo Google Chat chi tiết từng hồ sơ mới/
      // sửa/trùng/lỗi — y hệt bản cũ, kèm giới hạn độ dài an toàn cho webhook Chat.
      if (inserted > 0 || updated > 0 || failedList.length > 0 || failedUpdates.length > 0) {
        let msg = "🔔 *THÔNG BÁO CẬP NHẬT DỮ LIỆU TỪ TUYỂN SINH*\n";
        if (inserted > 0) {
          msg += "\n➕ *" + inserted + " hồ sơ MỚI:*\n";
          insertedDetails.forEach(d => { msg += "• " + (d.ten || "(chưa rõ tên)") + " — Ngành: " + (d.nganh || "(chưa rõ)") + "\n"; });
        }
        if (updated > 0) {
          msg += "\n🔄 *" + updated + " hồ sơ BỔ SUNG:*\n";
          updatedDetails.forEach(d => {
            msg += "• " + (d.ten || "(chưa rõ tên)") + " — Ngành: " + (d.nganh || "(chưa rõ)") + "\n";
            if (d.changes.length > 0) d.changes.forEach(c => { msg += "    ↳ " + c + "\n"; });
            else msg += "    ↳ (không có trường nào thay đổi giá trị)\n";
          });
        }
        if (failedList.length > 0) {
          msg += "\n⚠️ *" + failedList.length + " hồ sơ TRÙNG* (cùng Căn cước + Ngành đã tồn tại) bị bỏ qua, không ghi đè:\n";
          failedList.forEach(d => { msg += "• Ngành: " + (d.nganh || "(chưa rõ)") + " — CCCD: " + (d.cccd || "") + "\n"; });
        }
        if (failedUpdates.length > 0) {
          msg += "\n🚫 *" + failedUpdates.length + " hồ sơ SỬA THẤT BẠI* (không khớp được hồ sơ gốc theo CCCD+Ngành) — CẦN KIỂM TRA:\n";
          failedUpdates.forEach(d => { msg += "• " + (d.ten || "(chưa rõ tên)") + " — Ngành: " + (d.nganh || "(chưa rõ)") + " — CCCD: " + (d.cccd || "") + "\n"; });
        }
        msg += "\n👤 Người thực hiện: " + g.userInfo.email;

        const CHAT_MSG_SAFE_LIMIT = 3800;
        if (msg.length > CHAT_MSG_SAFE_LIMIT) msg = msg.substring(0, CHAT_MSG_SAFE_LIMIT) + "\n\n… (tin nhắn quá dài, đã rút gọn — xem đầy đủ trên hệ thống)";

        const webhookImport = PropertiesService.getScriptProperties().getProperty('WEBHOOK_GCHAT');
        try { guiTinNhanGoogleChat(webhookImport, msg); } catch (chatErr) { /* lỗi gửi Chat không ảnh hưởng dữ liệu đã ghi thành công */ }
      }

      let message = `Đã đẩy thành công lên hệ thống:\n- Thêm mới: ${inserted} hồ sơ\n- Cập nhật (Sửa): ${updated} hồ sơ`;
      if (failedList.length > 0) {
         message += `\n\n⚠️ TỪ CHỐI ${failedList.length} hồ sơ do TRÙNG LẶP dữ liệu cũ! Vui lòng dùng chức năng "Tìm hồ sơ cũ" để Sửa.`;
      }
      if (failedUpdates.length > 0) {
         message += `\n\n🚫 ${failedUpdates.length} hồ sơ SỬA THẤT BẠI do không khớp được hồ sơ gốc!`;
      }
      
      return responseJSON(200, message, { inserted, updated, failedList, failedUpdates });
    }

    // =====================================
    // ĐÃ THÊM (PHA 1 ROADMAP): 4 ACTION CÒN THIẾU CỦA BAN THẨM ĐỊNH — port nguyên
    // logic nghiệp vụ từ 4 file .gs cũ (Biennhantrungtuyen/yeucaubosung/LuuvaoCSDL/
    // Capnhatchodaotao), chuyển ID hardcode sang PropertiesService (xem
    // setupSecurityKeys() cuối file), và dùng chung requireAuth() thay vì tự viết
    // lại xác thực riêng như bản cũ.
    // =====================================

    // 16. DUYỆT TRÚNG TUYỂN -> XUẤT PDF BIÊN NHẬN (port từ Biennhantrungtuyen.gs)
    if (action === 'trungTuyen') {
      const g = requireAuth(e.parameter, ['ThamDinh', 'Admin']);
      if (!g.ok) return g.resp;

      const rawData = JSON.parse(e.parameter.data);
      if (!rawData || rawData.length === 0) return responseJSON(400, "Không có dữ liệu", null);

      const props = PropertiesService.getScriptProperties();
      const TEMPLATE_DOC_ID = props.getProperty('TRUNGTUYEN_TEMPLATE_DOC_ID');
      const FOLDER_ID = props.getProperty('TRUNGTUYEN_FOLDER_ID');
      const WEBHOOK_GCHAT = props.getProperty('WEBHOOK_GCHAT');
      const TRUNGGIAN_SHEET_ID = props.getProperty('TRUNGGIAN_SHEET_ID');

      // Kết quả từng bản ghi — mặc định "success" vì tất cả sẽ có mặt trong biên nhận PDF
      // chung; hạ xuống "warning" nếu bước ghi trạng thái riêng của từng người bị lỗi.
      const results = rawData.map(sv => ({
        cccd: String(sv.soCCCD || "").trim(), hoTen: String(sv.hoTen || "").trim(),
        nganh: String(sv.nganh || "").trim().toLowerCase(), status: "success",
        message: "Đã đưa vào biên nhận trúng tuyển."
      }));

      try {
        const folder = DriveApp.getFolderById(FOLDER_ID);
        const templateDoc = DriveApp.getFileById(TEMPLATE_DOC_ID);
        const tempDocFile = templateDoc.makeCopy("Nhap_TrungTuyen_" + new Date().getTime(), folder);
        const doc = DocumentApp.openById(tempDocFile.getId());
        const body = doc.getBody();

        const ngayChuan = rawData[0].ngayCapNhat || Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy");
        body.replaceText("{{NGAY}}", ngayChuan);

        const tableData = [["STT", "Họ và tên", "Ngày sinh", "Số CCCD", "Ngành", "Trạng thái"]];
        rawData.forEach((sv, index) => {
          try {
            tableData.push([(index + 1).toString(), String(sv.hoTen || "").trim(), String(sv.ngaySinh || "").trim(), String(sv.soCCCD || "").trim(), String(sv.nganh || "").trim(), "Trúng tuyển - Đủ hồ sơ"]);
          } catch (rowErr) {
            tableData.push([(index + 1).toString(), String(sv.hoTen || "(lỗi dữ liệu)"), "", String(sv.soCCCD || ""), String(sv.nganh || ""), "Trúng tuyển - Đủ hồ sơ"]);
            results[index].status = "warning";
            results[index].message = "Dữ liệu dòng có lỗi khi dựng bảng: " + rowErr.toString();
          }
        });

        const searchResult = body.findText("{{BANG_DANH_SACH}}");
        if (searchResult) {
          const element = searchResult.getElement();
          const parentParagraph = element.getParent();
          const insertIndex = body.getChildIndex(parentParagraph);
          body.removeChild(parentParagraph);
          const table = body.insertTable(insertIndex, tableData);

          const tableStyle = {};
          tableStyle[DocumentApp.Attribute.HORIZONTAL_ALIGNMENT] = DocumentApp.HorizontalAlignment.CENTER;
          table.setAttributes(tableStyle);

          const colWidths = [35, 135, 80, 100, 210, 140];
          for (let c = 0; c < colWidths.length; c++) { table.setColumnWidth(c, colWidths[c]); }

          for (let r = 0; r < table.getNumRows(); r++) {
            const row = table.getRow(r);
            for (let cellIdx = 0; cellIdx < row.getNumCells(); cellIdx++) {
              const cell = row.getCell(cellIdx);
              const par = cell.getChild(0).asParagraph();
              const text = par.editAsText();
              text.setFontSize(13); par.setLineSpacing(1.15);
              cell.setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER);
              if (r === 0) {
                cell.setBackgroundColor("#e3f2fd"); par.setAlignment(DocumentApp.HorizontalAlignment.CENTER); text.setBold(true);
              } else {
                if (cellIdx === 0 || cellIdx === 2 || cellIdx === 3 || cellIdx === 5) par.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
                else par.setAlignment(DocumentApp.HorizontalAlignment.LEFT);
              }
            }
          }
        }
        doc.saveAndClose();

        const dateString = Utilities.formatDate(new Date(), "GMT+7", "dd_MM_yyyy");
        const pdfBlob = tempDocFile.getAs(MimeType.PDF);
        pdfBlob.setName("Bien_nhan_Trung_Tuyen_" + dateString + ".pdf");
        const pdfFile = folder.createFile(pdfBlob);
        pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        const pdfUrl = pdfFile.getUrl();
        tempDocFile.setTrashed(true);

        try {
          UrlFetchApp.fetch(WEBHOOK_GCHAT, {
            method: "post", headers: { "Content-Type": "application/json; charset=UTF-8" },
            payload: JSON.stringify({ text: "🎉 *THÔNG BÁO TRÚNG TUYỂN*\nHiện tại có *" + rawData.length + " thí sinh* Trúng tuyển và Đủ hồ sơ (Ngày: " + ngayChuan + ").\n\n👉 *Click để tải/in danh sách:* " + pdfUrl }),
            muteHttpExceptions: true
          });
        } catch (notifyErr) { /* Lỗi gửi thông báo Chat không ảnh hưởng tới PDF đã tạo thành công */ }

        // Ghi trạng thái "Đã duyệt" vào sheet TrungGian dựa theo header
        try {
          const ss2 = SpreadsheetApp.openById(TRUNGGIAN_SHEET_ID);
          // ĐÃ VÁ BUG (đồng bộ với getThamDinhData): bỏ tìm theo tên "Sheet1", luôn lấy
          // tab đầu tiên theo vị trí -> ghi đúng tab thật, không lệch sang tab rác trùng tên.
          const sheet2 = ss2.getSheets()[0];
          if (sheet2) {
            const values = sheet2.getDataRange().getValues();
            const headers = values[0];
            // ĐÃ THÊM (rà soát an toàn 2 luồng chung 1 sheet): dò thêm cột KÊNH NỘP —
            // trước đây chỉ khớp theo CCCD+NGÀNH, nên nếu 1 hồ sơ "Thu hồ sơ trực tiếp"
            // (trang Nhập học, đã có trạng thái "Đã trúng tuyển") trùng CCCD+Ngành với 1
            // hồ sơ Xét tuyển đang được duyệt ở đây, sẽ bị GHI ĐÈ NHẦM sang "Đã duyệt".
            // Giờ bắt buộc khớp thêm KÊNH NỘP (nếu sheet có cột này) trước khi ghi.
            let cccdCol = -1, nganhCol = -1, statusCol = -1, kenhCol = -1;
            for (let h = 0; h < headers.length; h++) {
              const hName = String(headers[h]).toUpperCase().trim().replace(/\s+/g, ' ');
              if (hName === "CĂN CƯỚC" || hName === "SỐ CCCD" || hName === "CCCD") cccdCol = h;
              if (hName === "NGÀNH ĐÀO TẠO" || hName === "NGÀNH") nganhCol = h;
              if (hName.indexOf("TRẠNG THÁI") !== -1) statusCol = h;
              if (hName === "KÊNH NỘP") kenhCol = h;
            }
            if (cccdCol !== -1 && nganhCol !== -1 && statusCol !== -1) {
              rawData.forEach((sv, idx) => {
                try {
                  const payloadCccd = String(sv.soCCCD).replace(/\D/g, '');
                  const payloadNganh = String(sv.nganh).trim().toLowerCase();
                  const payloadKenh = String(sv.kenhNop || "").trim();
                  let found = false;
                  for (let i = 1; i < values.length; i++) {
                    const sheetCccd = String(values[i][cccdCol]).replace(/\D/g, '');
                    const sheetNganh = String(values[i][nganhCol]).trim().toLowerCase();
                    const sheetKenh = kenhCol !== -1 ? String(values[i][kenhCol] || "").trim() : "";
                    if (sheetCccd === payloadCccd && sheetNganh === payloadNganh && (kenhCol === -1 || sheetKenh === payloadKenh)) {
                      sheet2.getRange(i + 1, statusCol + 1).setValue("Đã duyệt");
                      found = true; break;
                    }
                  }
                  if (!found) {
                    results[idx].status = "warning";
                    results[idx].message = "Đã có trong biên nhận PDF, nhưng không tìm thấy dòng tương ứng để cập nhật trạng thái.";
                  }
                } catch (recErr) {
                  results[idx].status = "warning";
                  results[idx].message = "Đã có trong biên nhận PDF, nhưng lỗi khi cập nhật trạng thái: " + recErr.toString();
                }
              });
              SpreadsheetApp.flush();
            }
          }
        } catch (e2) { /* Lỗi tổng khi ghi trạng thái không làm hỏng kết quả PDF đã tạo thành công */ }

        return responseJSON(200, "success", { pdfUrl: pdfUrl, results: results });
      } catch (error) {
        return responseJSON(500, error.toString(), null);
      }
    }

    // 17. BÁO THIẾU HỒ SƠ -> XUẤT PDF (port từ yeucaubosung.gs)
    if (action === 'baoThieu') {
      const g = requireAuth(e.parameter, ['ThamDinh', 'Admin']);
      if (!g.ok) return g.resp;

      const rawData = JSON.parse(e.parameter.data);
      const data = (rawData || []).filter(sv => sv.hosoThieu && sv.hosoThieu.toLowerCase().indexOf("thiếu") !== -1);
      if (data.length === 0) return responseJSON(400, "Không có hồ sơ thiếu", null);

      const props = PropertiesService.getScriptProperties();
      const TEMPLATE_DOC_ID = props.getProperty('BAOTHIEU_TEMPLATE_DOC_ID');
      const FOLDER_ID = props.getProperty('BAOTHIEU_FOLDER_ID');
      const WEBHOOK_GCHAT = props.getProperty('WEBHOOK_GCHAT');
      const TRUNGGIAN_SHEET_ID = props.getProperty('TRUNGGIAN_SHEET_ID');

      const results = data.map(sv => ({
        cccd: String(sv.soCCCD || "").trim(), hoTen: String(sv.hoTen || "").trim(),
        nganh: String(sv.nganh || "").trim().toLowerCase(), status: "success",
        message: "Đã đưa vào biên nhận báo thiếu hồ sơ."
      }));

      try {
        const folder = DriveApp.getFolderById(FOLDER_ID);
        const templateDoc = DriveApp.getFileById(TEMPLATE_DOC_ID);
        const tempDocFile = templateDoc.makeCopy("Nhap_" + new Date().getTime(), folder);
        const doc = DocumentApp.openById(tempDocFile.getId());
        const body = doc.getBody();

        const ngayChuan = data[0].ngayCapNhat || Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy");
        body.replaceText("{{NGAY}}", ngayChuan);

        const tableData = [["STT", "Họ và tên", "Số CCCD", "Hồ sơ còn thiếu", "Ngày cập nhật hồ sơ"]];
        data.forEach((sv, index) => {
          try {
            tableData.push([(index + 1).toString(), String(sv.hoTen || "").trim(), String(sv.soCCCD || "").trim(), String(sv.hosoThieu || "").trim(), String(sv.ngayCapNhat || "").trim()]);
          } catch (rowErr) {
            tableData.push([(index + 1).toString(), String(sv.hoTen || "(lỗi dữ liệu)"), String(sv.soCCCD || ""), String(sv.hosoThieu || ""), ""]);
            results[index].status = "warning";
            results[index].message = "Dữ liệu dòng có lỗi khi dựng bảng: " + rowErr.toString();
          }
        });

        const searchResult = body.findText("{{BANG_DANH_SACH}}");
        if (searchResult) {
          const element = searchResult.getElement();
          const parentParagraph = element.getParent();
          const insertIndex = body.getChildIndex(parentParagraph);
          body.removeChild(parentParagraph);
          const table = body.insertTable(insertIndex, tableData);

          const tableStyle = {};
          tableStyle[DocumentApp.Attribute.HORIZONTAL_ALIGNMENT] = DocumentApp.HorizontalAlignment.CENTER;
          table.setAttributes(tableStyle);

          const colWidths = [40, 190, 110, 270, 90];
          for (let c = 0; c < colWidths.length; c++) { table.setColumnWidth(c, colWidths[c]); }

          for (let r = 0; r < table.getNumRows(); r++) {
            const row = table.getRow(r);
            for (let cellIdx = 0; cellIdx < row.getNumCells(); cellIdx++) {
              const cell = row.getCell(cellIdx);
              const par = cell.getChild(0).asParagraph();
              const text = par.editAsText();
              text.setFontSize(13); par.setLineSpacing(1.15);
              if (cellIdx === 0 || cellIdx === 2 || cellIdx === 4) par.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
              else par.setAlignment(DocumentApp.HorizontalAlignment.LEFT);
              if (r === 0) {
                cell.setBackgroundColor("#e8f5e9"); par.setAlignment(DocumentApp.HorizontalAlignment.CENTER); text.setBold(true);
              }
            }
          }
        }
        doc.saveAndClose();

        const pdfBlob = tempDocFile.getAs(MimeType.PDF);
        const dateString = Utilities.formatDate(new Date(), "GMT+7", "dd_MM_yyyy");
        pdfBlob.setName("Bien_nhan_ho_so_" + dateString + ".pdf");
        const pdfFile = folder.createFile(pdfBlob);
        pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        const pdfUrl = pdfFile.getUrl();
        tempDocFile.setTrashed(true);

        try {
          UrlFetchApp.fetch(WEBHOOK_GCHAT, {
            method: "post", headers: { "Content-Type": "application/json; charset=UTF-8" },
            payload: JSON.stringify({ text: "🎯 *BAN THẨM ĐỊNH HỒ SƠ*\nHiện tại *" + data.length + " thí sinh* còn thiếu hồ sơ (Ngày: " + ngayChuan + ").\n\n👉 *Click để tải/in biên nhận:* " + pdfUrl }),
            muteHttpExceptions: true
          });
        } catch (notifyErr) { /* Lỗi gửi thông báo Chat không ảnh hưởng tới PDF đã tạo thành công */ }

        try {
          const ss2 = SpreadsheetApp.openById(TRUNGGIAN_SHEET_ID);
          // ĐÃ VÁ BUG (đồng bộ với getThamDinhData): bỏ tìm theo tên "Sheet1", luôn lấy
          // tab đầu tiên theo vị trí -> ghi đúng tab thật, không lệch sang tab rác trùng tên.
          const sheet2 = ss2.getSheets()[0];
          if (sheet2) {
            const values = sheet2.getDataRange().getValues();
            const headers = values[0];
            // ĐÃ THÊM (rà soát an toàn 2 luồng chung 1 sheet): dò thêm cột KÊNH NỘP, cùng
            // lý do đã sửa ở action 'trungTuyen' — tránh ghi đè nhầm trạng thái "Đã trúng
            // tuyển" (Thu hồ sơ trực tiếp) thành "Đã báo thiếu" khi trùng CCCD+Ngành.
            let cccdCol = -1, nganhCol = -1, statusCol = -1, kenhCol = -1;
            for (let h = 0; h < headers.length; h++) {
              const hName = String(headers[h]).toUpperCase().trim().replace(/\s+/g, ' ');
              if (hName === "CĂN CƯỚC" || hName === "SỐ CCCD" || hName === "CCCD") cccdCol = h;
              if (hName === "NGÀNH ĐÀO TẠO" || hName === "NGÀNH") nganhCol = h;
              if (hName.indexOf("TRẠNG THÁI") !== -1) statusCol = h;
              if (hName === "KÊNH NỘP") kenhCol = h;
            }
            if (cccdCol !== -1 && nganhCol !== -1 && statusCol !== -1) {
              data.forEach((sv, idx) => {
                try {
                  const payloadCccd = String(sv.soCCCD).replace(/\D/g, '');
                  const payloadNganh = String(sv.nganh).trim().toLowerCase();
                  const payloadKenh = String(sv.kenhNop || "").trim();
                  let found = false;
                  for (let i = 1; i < values.length; i++) {
                    const sheetCccd = String(values[i][cccdCol]).replace(/\D/g, '');
                    const sheetNganh = String(values[i][nganhCol]).trim().toLowerCase();
                    const sheetKenh = kenhCol !== -1 ? String(values[i][kenhCol] || "").trim() : "";
                    if (sheetCccd === payloadCccd && sheetNganh === payloadNganh && (kenhCol === -1 || sheetKenh === payloadKenh)) {
                      sheet2.getRange(i + 1, statusCol + 1).setValue("Đã báo thiếu");
                      found = true; break;
                    }
                  }
                  if (!found) {
                    results[idx].status = "warning";
                    results[idx].message = "Đã có trong biên nhận PDF, nhưng không tìm thấy dòng tương ứng để cập nhật trạng thái.";
                  }
                } catch (recErr) {
                  results[idx].status = "warning";
                  results[idx].message = "Đã có trong biên nhận PDF, nhưng lỗi khi cập nhật trạng thái: " + recErr.toString();
                }
              });
              SpreadsheetApp.flush();
            }
          }
        } catch (e2) { /* Lỗi tổng khi ghi trạng thái không làm hỏng kết quả PDF đã tạo thành công */ }

        return responseJSON(200, "success", { pdfUrl: pdfUrl, results: results });
      } catch (error) {
        return responseJSON(500, error.toString(), null);
      }
    }

    // 18. LƯU KẾT QUẢ VÀO SHEET KETQUA (port từ LuuvaoCSDL.gs, giữ nguyên upsert 2 lớp)
    if (action === 'luuKetQua') {
      const g = requireAuth(e.parameter, ['ThamDinh', 'Admin']);
      if (!g.ok) return g.resp;

      const KETQUA_SHEET_ID = PropertiesService.getScriptProperties().getProperty('KETQUA_SHEET_ID');
      const ssKQ = SpreadsheetApp.openById(KETQUA_SHEET_ID);
      const sheetKQ = ssKQ.getSheetByName("KETQUA");
      if (!sheetKQ) return responseJSON(404, "Không tìm thấy sheet KETQUA!", null);

      const incomingData = JSON.parse(e.parameter.data);
      if (!incomingData || incomingData.length === 0) return responseJSON(200, "Không có dữ liệu mới.", { results: [] });

      const lastRow = sheetKQ.getLastRow();
      const lastCol = sheetKQ.getLastColumn();
      const headers = sheetKQ.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim().toUpperCase().replace(/\s+/g, ' '));

      let cccdColIndex = headers.findIndex(h => h === "CĂN CƯỚC" || h === "SỐ CCCD" || h === "CCCD");
      let nganhColIndex = headers.findIndex(h => h === "NGÀNH ĐÀO TẠO" || h === "NGÀNH");
      const updateColIndex = headers.findIndex(h => h === "NGÀY CẬP NHẬT HỒ SƠ" || h === "NGÀY CẬP NHẬT");
      if (cccdColIndex === -1) cccdColIndex = 2;
      if (nganhColIndex === -1) nganhColIndex = 5;

      const existingRecords = {};
      if (lastRow > 1) {
        const existingData = sheetKQ.getRange(2, 1, lastRow - 1, lastCol).getValues();
        for (let i = 0; i < existingData.length; i++) {
          const cccdKey = String(existingData[i][cccdColIndex]).replace(/^['"]+|['"]+$/g, '').trim();
          const nganhKey = String(existingData[i][nganhColIndex]).trim().toLowerCase();
          if (cccdKey !== "") existingRecords[cccdKey + "_" + nganhKey] = { rowIndex: i + 2, data: existingData[i] };
        }
      }

      const newRows = []; const newRowsResultIndex = [];
      let skipCount = 0; let updateCount = 0; const results = [];

      for (let k = 0; k < incomingData.length; k++) {
        const obj = incomingData[k];
        let rowCccd = "", rowHoTen = "", rowNganh = "";
        try {
          const cleanObj = {};
          for (const key in obj) { cleanObj[key.trim().toUpperCase().replace(/\s+/g, ' ')] = obj[key]; }
          rowCccd = String(cleanObj["CĂN CƯỚC"] || cleanObj["SỐ CCCD"] || cleanObj["CCCD"] || "").replace(/^['"]+|['"]+$/g, '').trim();
          rowHoTen = String(cleanObj["HỌ VÀ TÊN"] || cleanObj["HỌ TÊN"] || "").trim();
          rowNganh = String(cleanObj["NGÀNH ĐÀO TẠO"] || cleanObj["NGÀNH"] || "").trim().toLowerCase();
          const rowCombinedKey = rowCccd + "_" + rowNganh;

          if (rowCccd === "") {
            results.push({ cccd: rowCccd, hoTen: rowHoTen, nganh: rowNganh, status: "error", message: "Thiếu số CCCD, đã bỏ qua bản ghi này." });
            continue;
          }

          const rowArray = new Array(lastCol).fill("");
          for (let col = 0; col < headers.length; col++) {
            const headerName = headers[col];
            let val = "";
            if (cleanObj[headerName] !== undefined) val = cleanObj[headerName];
            else if (headerName === "CĂN CƯỚC" || headerName === "SỐ CCCD") val = cleanObj["CĂN CƯỚC"] || cleanObj["SỐ CCCD"] || cleanObj["CCCD"];
            else if (headerName === "BẢN SAO ID" || headerName === "BẢN SAO CCCD" || headerName === "BẢN SAO CĂN CƯỚC") val = cleanObj["BẢN SAO ID"] || cleanObj["BẢN SAO CCCD"];
            else if (headerName === "PHIẾU ĐĂNG KÝ DỰ TUYỂN" || headerName === "PHIẾU ĐK") val = cleanObj["PHIẾU ĐĂNG KÝ DỰ TUYỂN"] || cleanObj["PHIẾU ĐK"];

            if ((headerName === "CĂN CƯỚC" || headerName === "SỐ CCCD" || headerName === "MÃ SINH VIÊN" || headerName === "MÃ SV") && val) {
              rowArray[col] = "'" + String(val).replace(/^['"]+|['"]+$/g, '');
            } else {
              rowArray[col] = val || "";
            }
          }

          if (existingRecords[rowCombinedKey]) {
            let isDifferent = false;
            const oldData = existingRecords[rowCombinedKey].data;
            for (let c = 0; c < headers.length; c++) {
              if (c === updateColIndex) continue;
              const oldValStr = String(oldData[c] || "").trim();
              const newValStr = String(rowArray[c] || "").replace(/^'/, '').trim();
              if (oldValStr !== newValStr) { isDifferent = true; break; }
            }
            if (isDifferent) {
              sheetKQ.getRange(existingRecords[rowCombinedKey].rowIndex, 1, 1, lastCol).setValues([rowArray]);
              existingRecords[rowCombinedKey].data = rowArray;
              updateCount++;
              results.push({ cccd: rowCccd, hoTen: rowHoTen, nganh: rowNganh, status: "updated", message: "Đã cập nhật (ghi đè) hồ sơ cũ." });
            } else {
              skipCount++;
              results.push({ cccd: rowCccd, hoTen: rowHoTen, nganh: rowNganh, status: "skipped", message: "Dữ liệu không đổi, đã bỏ qua." });
            }
          } else {
            results.push({ cccd: rowCccd, hoTen: rowHoTen, nganh: rowNganh, status: "added", message: "Đã thêm mới." });
            newRowsResultIndex.push(results.length - 1);
            newRows.push(rowArray);
            existingRecords[rowCombinedKey] = { rowIndex: -1, data: rowArray };
          }
        } catch (recErr) {
          results.push({ cccd: rowCccd, hoTen: rowHoTen, nganh: rowNganh, status: "error", message: recErr.toString() });
        }
      }

      if (newRows.length > 0) {
        try {
          sheetKQ.getRange(lastRow + 1, 1, newRows.length, lastCol).setValues(newRows);
        } catch (bulkErr) {
          for (let m = 0; m < newRowsResultIndex.length; m++) {
            results[newRowsResultIndex[m]].status = "error";
            results[newRowsResultIndex[m]].message = "Lỗi khi ghi vào Sheet: " + bulkErr.toString();
          }
        }
      }

      return responseJSON(200, "success", { added: newRows.length, updated: updateCount, skipped: skipCount, results: results });
    }

    // 19. BÀN GIAO ĐÀO TẠO (port từ Capnhatchodaotao.gs — ĐÃ SỬA: dùng openById() thay
    // vì getActiveSpreadsheet(), vì Quanlysv.gs là standalone script, không gắn liền
    // vào 1 file Sheet cụ thể nào để "active")
    if (action === 'capNhatDaoTao') {
      const g = requireAuth(e.parameter, ['ThamDinh', 'Admin']);
      if (!g.ok) return g.resp;

      const KETQUA_SHEET_ID = PropertiesService.getScriptProperties().getProperty('KETQUA_SHEET_ID');
      const WEBHOOK_GCHAT = PropertiesService.getScriptProperties().getProperty('WEBHOOK_GCHAT');
      const ssDT = SpreadsheetApp.openById(KETQUA_SHEET_ID);
      const sheetDT = ssDT.getSheets()[0];

      const incomingData = JSON.parse(e.parameter.data);
      if (!incomingData || incomingData.length === 0) return responseJSON(400, "Không có dữ liệu", null);

      const lastRow = sheetDT.getLastRow();
      const lastCol = Math.max(sheetDT.getLastColumn(), 13);
      const headers = sheetDT.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim().toUpperCase().replace(/\s+/g, ' '));

      let cccdIndex = -1, nganhIndex = -1;
      for (let c = 0; c < headers.length; c++) {
        if (headers[c] === "CĂN CƯỚC" || headers[c] === "SỐ CCCD" || headers[c] === "CCCD") cccdIndex = c;
        if (headers[c] === "NGÀNH" || headers[c] === "NGÀNH ĐÀO TẠO") nganhIndex = c;
      }

      const existingKeys = {};
      if (lastRow > 1 && cccdIndex !== -1 && nganhIndex !== -1) {
        const existingData = sheetDT.getRange(2, 1, lastRow - 1, lastCol).getValues();
        for (let i = 0; i < existingData.length; i++) {
          const cKey = String(existingData[i][cccdIndex] || "").replace(/^['"]+|['"]+$/g, '').trim();
          const nKey = String(existingData[i][nganhIndex] || "").trim().toLowerCase();
          if (cKey !== "") existingKeys[cKey + "_" + nKey] = true;
        }
      }

      const newRows = [];
      const todayStr = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");

      for (let k = 0; k < incomingData.length; k++) {
        const obj = incomingData[k];
        const cleanObj = {};
        for (const key in obj) cleanObj[key.trim().toUpperCase().replace(/\s+/g, ' ')] = obj[key];

        const rCccd = String(cleanObj["CĂN CƯỚC"] || cleanObj["CCCD"] || "").replace(/^['"]+|['"]+$/g, '').trim();
        const rNganh = String(cleanObj["NGÀNH"] || cleanObj["NGÀNH ĐÀO TẠO"] || "").trim().toLowerCase();
        const rKey = rCccd + "_" + rNganh;

        if (rCccd !== "" && !existingKeys[rKey]) {
          const rowArray = new Array(lastCol).fill("");
          for (let col = 0; col < headers.length; col++) {
            const hName = headers[col];
            let val = cleanObj[hName] || "";
            if (hName === "NGÀY CẬP NHẬT HỒ SƠ" || hName === "NGÀY CẬP NHẬT") val = todayStr;
            if ((hName === "CĂN CƯỚC" || hName === "CCCD") && val) val = "'" + String(val).replace(/^['"]+|['"]+$/g, '');
            rowArray[col] = val;
          }
          newRows.push(rowArray);
          existingKeys[rKey] = true;
        }
      }

      if (newRows.length > 0) {
        sheetDT.getRange(lastRow + 1, 1, newRows.length, lastCol).setValues(newRows);
        const SHEET_URL = ssDT.getUrl();
        try {
          UrlFetchApp.fetch(WEBHOOK_GCHAT, {
            method: "post", headers: { "Content-Type": "application/json; charset=UTF-8" },
            payload: JSON.stringify({ text: "🚀 *BAN THẨM ĐỊNH BÀN GIAO*\nĐã cập nhật *" + newRows.length + " hồ sơ trúng tuyển* sang cho Đào tạo/CTSV.\n👉 Danh sách tại đây: " + SHEET_URL }),
            muteHttpExceptions: true
          });
        } catch (notifyErr) { /* Lỗi gửi thông báo Chat không ảnh hưởng tới việc bàn giao đã thành công */ }
      }

      return responseJSON(200, "success", { added: newRows.length });
    }

    // =====================================
    // 12. QUÉT CCCD BẰNG AI GEMINI
    // =====================================
    if (action === 'scanDocument') {
      const parsedData = JSON.parse(e.parameter.data);
      
      const g = requireAuth(parsedData, ['TuyenSinh', 'ThamDinh', 'Admin']);
      if (!g.ok) return g.resp;
      
      const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
      if (!apiKey) return responseJSON(500, "Hệ thống chưa cấu hình Khóa Gemini API", null);
      
      const promptText = "Bạn là chuyên gia đọc giấy tờ tùy thân Việt Nam. Ảnh đưa vào có thể là Căn cước công dân (CCCD) HOẶC Hộ chiếu (Passport) — hãy tự xác định đúng loại giấy tờ dựa trên tiêu đề in trên ảnh.\n\n" +
          "QUY TẮC TRÍCH XUẤT:\n" +
          "- Nếu là CCCD: lấy số CCCD (12 số), họ tên, ngày sinh, và ngày hết hạn => field ngay_het_han. (ngay_cap để rỗng).\n" +
          "- Nếu là Hộ chiếu: lấy số hộ chiếu, họ tên, ngày sinh, và ngày cấp => field ngay_cap. (ngay_het_han để rỗng).\n" +
          "- Mọi ngày tháng trả về theo định dạng YYYY-MM-DD. Không đọc rõ thì để rỗng \"\".\n\n" +
          "Trả về DUY NHẤT một chuỗi JSON hợp lệ (Không bọc bằng markdown), đúng cấu trúc sau:\n" +
          "{\"loai_giay_to\": \"cccd hoặc hochieu\", \"so_giay_to\": \"số CCCD hoặc số hộ chiếu\", \"hoten\": \"HỌ TÊN IN HOA\", \"ngaysinh\": \"YYYY-MM-DD\", \"ngay_het_han\": \"YYYY-MM-DD hoặc rỗng\", \"ngay_cap\": \"YYYY-MM-DD hoặc rỗng\"}";

      const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=" + apiKey.trim();
      const payload = {
        "contents": [{
          "parts": [
            { "text": promptText },
            { "inline_data": { "mime_type": parsedData.mimeType, "data": parsedData.imageBase64 } }
          ]
        }]
      };

      try {
        const response = UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true });
        const jsonGemini = JSON.parse(response.getContentText());
        
        if (jsonGemini.candidates && jsonGemini.candidates[0].content.parts[0].text) {
           let rawText = jsonGemini.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
           return responseJSON(200, "Quét thành công", JSON.parse(rawText));
        } else {
           return responseJSON(500, "Ảnh quá mờ hoặc AI không nhận diện được", jsonGemini);
        }
      } catch (err) { return responseJSON(500, "Lỗi gọi AI: " + err.toString(), null); }
    }

    // =====================================
    // 13. QUÉT BẢNG ĐIỂM
    // =====================================
    if (action === 'scanTranscript') {
      const parsedData = JSON.parse(e.parameter.data);
      
      // Bảng điểm / Đối sánh / Xuất file -> Chỉ ThamDinh và Admin mới được dùng
      const g = requireAuth(parsedData, ['ThamDinh', 'Admin']);
      if (!g.ok) return g.resp;
      
      const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
      const promptText = "Bạn là chuyên gia số hóa dữ liệu. Trích xuất ĐẦY ĐỦ, tuyệt đối không được bỏ sót bất kỳ môn học nào có trong ảnh. Trả về DUY NHẤT một mảng JSON hợp lệ chứa các đối tượng (Tuyệt đối không bọc bằng ký hiệu markdown ```json), mỗi đối tượng gồm 5 trường: {\"monhoc\": \"Tên môn học\", \"tinchi\": \"Số tín chỉ (nếu không thấy để 0)\", \"diem_chu\": \"Điểm chữ (A, B, C... nếu không có để rỗng)\", \"diem_he4\": \"Điểm hệ 4 (nếu không có để rỗng)\", \"diem_he10\": \"Điểm hệ 10 (nếu không có để rỗng)\"}";

      const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=" + apiKey.trim();
      const payload = {
        "contents": [{ "parts": [ { "text": promptText }, { "inline_data": { "mime_type": parsedData.mimeType, "data": parsedData.imageBase64 } } ] }]
      };

      try {
        const response = UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true });
        const jsonGemini = JSON.parse(response.getContentText());
        
        if (jsonGemini.candidates && jsonGemini.candidates[0].content.parts[0].text) {
           let rawText = jsonGemini.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
           return responseJSON(200, "Quét thành công", JSON.parse(rawText));
        } else { return responseJSON(500, "Không nhận diện được bảng điểm", jsonGemini); }
      } catch (err) { return responseJSON(500, "Lỗi AI: " + err.toString(), null); }
    }

    // =====================================
    // 14. ĐỐI SÁNH KHUNG CTĐT
    // =====================================
    if (action === 'compareCurriculum') {
      const parsedData = JSON.parse(e.parameter.data);
      const g = requireAuth(parsedData, ['ThamDinh', 'Admin']);
      if (!g.ok) return g.resp;
      
      const SHEET_CTDT_ID = "1Kscs9TxM59T-Xt5F0nBLko6XL90BwZbXH95vZhv3a0w"; 
      const ssCTDT = SpreadsheetApp.openById(SHEET_CTDT_ID);
      const sheetCTDT = ssCTDT.getSheetByName(parsedData.nganh);
      if (!sheetCTDT) return responseJSON(404, "Không tìm thấy Sheet CTĐT của ngành: " + parsedData.nganh, null);
      
      const values = sheetCTDT.getDataRange().getValues();
      let ctdtData = [];
      for (let i = 1; i < values.length; i++) {
        ctdtData.push({ "nhom_mon": values[i][1], "ten_mon": values[i][2], "tin_chi": values[i][3], "mon_tuong_duong": values[i][4] || "" });
      }
      
      const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
      const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=" + apiKey.trim();
      const promptText = "Bạn là Trưởng phòng Đào tạo. Đối sánh Bảng điểm (JSON 1) với Khung CTĐT chuẩn (JSON 2).\n1. MATCH nếu tên môn học trùng ý nghĩa hoặc nằm trong 'mon_tuong_duong'.\n2. Số tín chỉ môn đã học phải >= tín chỉ môn chuẩn thì 'Đạt', nhỏ hơn thì 'Học bổ sung'.\n3. Bỏ qua 'Thực tập tốt nghiệp', 'Thực tập doanh nghiệp'.\n4. KHÔNG bỏ sót môn chuẩn nào.\n\nJSON 1: " + JSON.stringify(parsedData.transcript) + "\nJSON 2: " + JSON.stringify(ctdtData) + "\n\nTrả về DUY NHẤT JSON:\n{\"matched\": [{\"nhom_mon\": \"...\", \"mon_chuan\": \"...\", \"tin_chi_chuan\": \"...\", \"mon_da_hoc\": \"...\", \"tin_chi_da_hoc\": \"...\", \"ket_luan\": \"Đạt / Học bổ sung\"}], \"unmatched\": [{\"nhom_mon\": \"...\", \"mon_chuan\": \"...\", \"tin_chi_chuan\": \"...\"}]}";

      try {
        const response = UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", payload: JSON.stringify({ "contents": [{"parts": [{ "text": promptText }]}] }), muteHttpExceptions: true });
        const jsonDoisanh = JSON.parse(response.getContentText());
        
        if (jsonDoisanh.candidates && jsonDoisanh.candidates[0].content.parts[0].text) {
          let rawText = jsonDoisanh.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
          let ketQua = JSON.parse(rawText);
          ketQua.matched = ketQua.matched || [];
          ketQua.unmatched = ketQua.unmatched || [];

          const chuanHoaTen = (s) => String(s || "").trim().toLowerCase();
          let boTenDaMatched = {}; let boTenDaUnmatched = {};
          ketQua.matched.forEach(m => boTenDaMatched[chuanHoaTen(m.mon_chuan)] = true);
          ketQua.unmatched = ketQua.unmatched.filter(u => !boTenDaMatched[chuanHoaTen(u.mon_chuan)]);
          ketQua.unmatched.forEach(u => boTenDaUnmatched[chuanHoaTen(u.mon_chuan)] = true);

          ctdtData.forEach(c => {
            const key = chuanHoaTen(c.ten_mon);
            if (!boTenDaMatched[key] && !boTenDaUnmatched[key]) {
              ketQua.unmatched.push({ "nhom_mon": c.nhom_mon, "mon_chuan": c.ten_mon, "tin_chi_chuan": c.tin_chi });
              boTenDaUnmatched[key] = true;
            }
          });
          return responseJSON(200, "Đối sánh hoàn tất", ketQua);
        }
        return responseJSON(500, "Lỗi phân tích AI", null);
      } catch (err) { return responseJSON(500, "Lỗi đối sánh: " + err.toString(), null); }
    }

    // =====================================
    // 15. XUẤT TEMPLATE EXCEL
    // =====================================
    if (action === 'exportTemplate') {
      const parsedData = JSON.parse(e.parameter.data);
      const g = requireAuth(parsedData, ['ThamDinh', 'Admin']);
      if (!g.ok) return g.resp;

      const TEMPLATE_ID = PropertiesService.getScriptProperties().getProperty('TEMPLATE_ID');
      const folderId = "1HO9VaKvfb2pPaIViBGjc-OjgscaOjHP-"; 
      const folder = DriveApp.getFolderById(folderId);
      
      try {
        const tempFile = DriveApp.getFileById(TEMPLATE_ID.trim()).makeCopy(parsedData.fileName || "PhieuThamDinh_AI");
        const tempId = tempFile.getId();
        const ssTemp = SpreadsheetApp.openById(tempId);
        const sheetTemp = ssTemp.getSheets()[0];
        
        for (let key in parsedData.mappingData) {
          sheetTemp.createTextFinder("{{" + key + "}}").replaceAllWith(String(parsedData.mappingData[key] || ""));
        }
        
        let tableData = []; let stt = 1;
        (parsedData.compareMatched || []).forEach(m => tableData.push([stt++, m.nhom_mon, m.mon_chuan, m.tin_chi_chuan, m.mon_da_hoc, m.tin_chi_da_hoc, m.ket_luan]));
        (parsedData.compareUnmatched || []).forEach(u => tableData.push([stt++, u.nhom_mon, u.mon_chuan, u.tin_chi_chuan, "", "", "Chưa học"]));
        
        if (tableData.length > 0) {
          const range = sheetTemp.getRange(sheetTemp.getLastRow() + 1, 1, tableData.length, tableData[0].length);
          range.setValues(tableData);
          range.setBorder(true, true, true, true, true, true, "black", SpreadsheetApp.BorderStyle.SOLID);
        }
        
        SpreadsheetApp.flush(); 
        
        const urlExport = "https://docs.google.com/spreadsheets/d/" + tempId + "/export?exportFormat=xlsx&format=xlsx";
        const responseExcel = UrlFetchApp.fetch(urlExport, { method: "get", headers: { 'Authorization': 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
        
        if (responseExcel.getResponseCode() !== 200) throw new Error("Lỗi Export API");
        
        const blob = responseExcel.getBlob().setName((parsedData.fileName || "PhieuThamDinh") + ".xlsx");
        folder.createFile(blob);
        tempFile.setTrashed(true); 
        
        return responseJSON(200, "Xuất Excel thành công", { base64: Utilities.base64Encode(blob.getBytes()) });
      } catch (err) {
        return responseJSON(500, "Lỗi tạo file Excel: " + err.message, null);
      }
    }

    // =====================================
    // ĐÃ THÊM: GỬI PHẢN HỒI LỖI QUA GOOGLE CHAT — port từ GoiAPI.gs cũ, giữ nguyên
    // nguyên tắc quan trọng: lấy TÊN TÀI KHOẢN từ email đã được requireAuth() xác thực
    // thật (g.userInfo.email), KHÔNG dùng field client tự gửi lên, tránh giả mạo tên
    // người gửi phản hồi. Không giới hạn role — ai đăng nhập hợp lệ cũng gửi được.
    // =====================================
    if (action === 'feedback') {
      const parsedData = JSON.parse(e.parameter.data);
      const g = requireAuth(parsedData, []);
      if (!g.ok) return g.resp;

      const noiDung = String(parsedData.noiDung || "").trim();
      if (!noiDung) return responseJSON(400, "Nội dung phản hồi đang trống.", null);

      const webhookFeedback = PropertiesService.getScriptProperties().getProperty('WEBHOOK_GCHAT');
      const thoiGian = Utilities.formatDate(new Date(), "GMT+7", "HH:mm dd/MM/yyyy");
      const chatText = "📩 *PHẢN HỒI LỖI MỚI TỪ WEB QUẢN LÝ SINH VIÊN*\n" +
                        "👤 Tài khoản: " + g.userInfo.email + "\n" +
                        "🕐 Thời gian: " + thoiGian + "\n" +
                        "📝 Nội dung:\n" + noiDung;

      try {
        guiTinNhanGoogleChat(webhookFeedback, chatText);
        return responseJSON(200, "Đã gửi phản hồi thành công", null);
      } catch (feedbackErr) {
        return responseJSON(500, "Gửi thất bại: " + feedbackErr.toString(), null);
      }
    }

    return responseJSON(400, "Action POST không hợp lệ", null);
    
  } catch (error) {
    return responseJSON(500, "Lỗi Server: " + error.toString(), null);
  }
}

// ===============================================
// CORE: XÁC THỰC TOKEN GOOGLE VÀ KIỂM TRA QUYỀN
// ===============================================
// ĐÃ THÊM (rà soát Trunggian.gs — port sang đây): trích xuất URL thật từ ô "LINK HỒ
// SƠ" trên sheet TrungGian. getValues() thường chỉ trả về CHỮ HIỂN THỊ của ô, không
// phải URL thật, nếu ô đó là rich-text link (Chèn > Liên kết) hoặc công thức
// =HYPERLINK("url","nhãn"). Ưu tiên: rich-text link -> công thức HYPERLINK -> text
// thô. Chỉ trả về nếu khớp whitelist domain Drive/Docs, mọi thứ khác (javascript:,
// domain lạ, rác do gõ nhầm) -> trả về rỗng, không bao giờ đưa thẳng cho frontend mở.
var ALLOWED_LINK_HOSTS_GAS = ["drive.google.com", "docs.google.com"];

function isSafeDriveUrlGas(url) {
  if (!url) return false;
  var s = String(url).trim();
  if (!/^https:\/\//i.test(s)) return false;
  var hostMatch = s.match(/^https:\/\/([^/]+)/i);
  if (!hostMatch) return false;
  var host = hostMatch[1].toLowerCase();
  return ALLOWED_LINK_HOSTS_GAS.some(function(h) { return host === h || host.endsWith("." + h); });
}

function extractSafeLinkFromCell(richTextCell, formulaText, plainVal) {
  var candidate = "";
  if (richTextCell) {
    var richUrl = richTextCell.getLinkUrl();
    if (richUrl) candidate = richUrl;
  }
  if (!candidate && formulaText) {
    var m = String(formulaText).match(/HYPERLINK\(\s*"([^"]+)"/i);
    if (m) candidate = m[1];
  }
  if (!candidate) candidate = String(plainVal || "");
  return isSafeDriveUrlGas(candidate) ? candidate : "";
}

// Gửi 1 dòng thông báo lên Google Chat — dùng chung cho checkDuplicates/importStudents/autoBackupDaily.
function guiTinNhanGoogleChat(webhookUrl, text) {
  UrlFetchApp.fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    payload: JSON.stringify({ text: text }),
    muteHttpExceptions: true
  });
}

// Cắt ngắn giá trị trước khi đưa vào tin Chat — phòng giá trị là link dài/nội dung dài.
function truncateForChat(s, maxLen) {
  var str = String(s || "");
  var limit = maxLen || 60;
  if (str.length <= limit) return str || "(trống)";
  return str.substring(0, limit) + "...";
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
function setupSecurityKeys() {
  const props = PropertiesService.getScriptProperties();
  props.setProperties({
    'GEMINI_API_KEY': 'AQ.Ab8RN6Kkv8xwgM9rD-B85xjvgonZWJFh-uY_FVOMluO7ey6t-A', // ⚠️ TUYỆT ĐỐI KHÔNG GỬI KEY LÊN CHAT
    'WEBHOOK_GCHAT': 'https://chat.googleapis.com/v1/spaces/AAQAPFdUsdM/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=eBKDSZxJYO8t_vsF0ilcSC8NPs4Quwsz20ln0kquLE0',
    'GOOGLE_CLIENT_ID': '311965248456-01ts8h9g6tuj0slob58n8vrfm091c4u7.apps.googleusercontent.com',
    'ACCOUNTS_SHEET_ID': '10cOj-d63aumv-fyjmo6AATWsk-v8y5P5c5wNvEIgyO4', // ĐÃ CẬP NHẬT SANG ID FILE MỚI CỦA ÔNG!
    'TEMPLATE_ID': '1axEobEh841uEJeMbMpb-IEUp9gxGW8AOG0K0iEbzlFo',
    // ĐÃ THÊM cho Pha 1 (4 action Thẩm định mới) — port nguyên từ 4 file .gs cũ,
    // chuyển từ hardcode sang PropertiesService theo đúng quyết định đã chốt.
    'TRUNGGIAN_SHEET_ID': '1DBYrAObOLR7jtj74B_jBHVDf2I07UXc8zpgppvbabbs', // Sheet trung gian (từ Biennhantrungtuyen/yeucaubosung/CheckID cũ)
    'KETQUA_SHEET_ID': '1WKAJfyipPxguFaZTppkLbNe6ZoH2G_VBMV6W0ps708I', // Sheet KETQUA (từ LuuvaoCSDL cũ)
    'TRUNGTUYEN_TEMPLATE_DOC_ID': '1MYl5hWkl01E5zhD1HhB0Hb8fRE_H6DwI5JanqVAahMk', // Mẫu Biên nhận Trúng tuyển (Google Docs)
    'TRUNGTUYEN_FOLDER_ID': '1zWMF_H2LD1mKNYk8Gu5A0F_VcYzhfap9', // Folder Drive lưu PDF biên nhận trúng tuyển
    'BAOTHIEU_TEMPLATE_DOC_ID': '1Ob5l9yc3SYOa8QSKf29_8okU3T0RGhXUfEpnRc47q8I', // Mẫu Biên nhận Báo thiếu hồ sơ (Google Docs)
    'BAOTHIEU_FOLDER_ID': '12g2MhNbmatVWY_HFNgxWK-1eDi3FVyfR' // Folder Drive lưu PDF báo thiếu hồ sơ
  });
  Logger.log("Đã lưu toàn bộ khóa bảo mật thành công!");
}



function capQuyen() {
  // Hàm này chả làm gì cả, chỉ để gọi tên các dịch vụ ra cho Google nó hỏi xin quyền thôi
  UrlFetchApp.fetch("https://google.com");
  SpreadsheetApp.getActive();
}

// ===============================================
// ĐÃ THÊM (rà soát Trunggian.gs — port sang đây): TỰ ĐỘNG SAO LƯU SHEET TRUNG GIAN
// HÀNG NGÀY. Hàm này KHÔNG chạy qua web (không có action gọi tới) — chỉ chạy khi có
// Trigger hẹn giờ. TỰ THIẾT LẬP TRIGGER (không làm được bằng code, phải làm tay 1 lần):
// Apps Script Editor > menu Triggers (icon đồng hồ bên trái) > Add Trigger > chọn hàm
// "autoBackupDaily" > loại "Time-driven" > "Day timer" > khung giờ nửa đêm-1h sáng.
// ===============================================
function autoBackupDaily() {
  const TRUNGGIAN_SHEET_ID = PropertiesService.getScriptProperties().getProperty('TRUNGGIAN_SHEET_ID');
  const ss = SpreadsheetApp.openById(TRUNGGIAN_SHEET_ID);
  const dateStr = Utilities.formatDate(new Date(), "GMT+7", "dd_MM_yyyy");

  const backupFile = DriveApp.getFileById(ss.getId()).makeCopy("Backup_TrungGian_" + dateStr);

  const webhook = PropertiesService.getScriptProperties().getProperty('WEBHOOK_GCHAT');
  try {
    guiTinNhanGoogleChat(webhook, "✅ *AUTO BACKUP*\nĐã tự động sao lưu dữ liệu ngày " + dateStr + " thành công!\nLink file backup: " + backupFile.getUrl());
  } catch (e) { /* lỗi báo Chat không ảnh hưởng việc backup đã thành công */ }
}