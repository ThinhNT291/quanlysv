import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchConfig, saveConfig, fetchChiTieu, saveChiTieu } from '../../api/studentApi';
import Swal from 'sweetalert2';
import './Settings.css';

// Khai báo link GAS để fetch Lịch sử (Thay đúng link của ông vào đây)
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzkp4Nqb3kP3DjEGBucxLKPDgQamDMO8mQOOCg71_a_iHqnmuGWjU54e-QvxNGzELN9/exec";

// ĐÃ SỬA (phát hiện khi test Ký điện tử Pha 2 — lỗi "Maximum update depth exceeded" tại
// dòng setChiTieuLocal bên dưới): hằng số module-level, KHÔNG khai báo `[]` trực tiếp làm
// giá trị mặc định ngay tại chỗ destructuring `const { data: chiTieuData = [] } = useQuery`
// — mỗi lần `data` còn undefined (đang tải/đang refetch), JS tạo MỘT MẢNG RỖNG MỚI (tham
// chiếu khác) cho giá trị mặc định đó ở MỖI LẦN RENDER, dù nội dung luôn rỗng như nhau.
// useEffect bên dưới có `chiTieuData` trong mảng dependency — React so sánh dependency
// bằng tham chiếu (Object.is), thấy "khác" mỗi lần render nên chạy lại effect mỗi lần,
// gọi setChiTieuLocal(...) mỗi lần, gây re-render, lại tạo `[]` mới, lại chạy effect...
// vòng lặp vô hạn cho tới khi query thật sự có dữ liệu (tham chiếu ổn định). Query càng
// chậm trả lời (GAS đang bận, nhiều người dùng cùng lúc...) thì vòng lặp này càng chạy
// lâu, browser càng "treo" rõ rệt — dùng CHUNG 1 tham chiếu cố định ở đây để defaut value
// luôn là ĐÚNG 1 mảng duy nhất, không đổi giữa các lần render.
const CHI_TIEU_RONG = [];

const SettingsPage = () => {
  const queryClient = useQueryClient();
  const [localConfig, setLocalConfig] = useState(null);
  // ĐÃ THÊM (theo yêu cầu — nút "Lưu" mặc định disable cho tới khi có thay đổi): lưu lại
  // đúng "ảnh chụp" localConfig tại thời điểm vừa tải/vừa lưu xong (baseline) — so sánh
  // JSON.stringify với localConfig hiện tại để biết có đang "dirty" hay không (mọi thao tác
  // thêm/sửa/xoá/KÉO-THẢ đổi thứ tự đều đi qua setLocalConfig nên tự động phát hiện được).
  const [savedConfigSnapshot, setSavedConfigSnapshot] = useState(null);

  const [newItems, setNewItems] = useState({
      Nganh: '', KhoaNhapHoc: '', DoiTuongUT: '', KhuVucUT: '', NamXetTuyen: '',
      DoiTuongDauVao: '', HeDaoTao: '', HinhThucDaoTao: '', GioiTinh: ''
  });

  // STATE ĐỂ XỬ LÝ DOUBLE-CLICK SỬA TRỰC TIẾP
  const [editingItem, setEditingItem] = useState({ category: null, index: null, value: '' });

  // State quản lý Lịch sử & PIN
  const [showPinModal, setShowPinModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [pinCode, setPinCode] = useState('');
  const [historyLogs, setHistoryLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Xử lý phím ESC
  useEffect(() => {
    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            setShowPinModal(false);
            setShowHistoryModal(false);
            setPinCode('');
            // Hủy chế độ Edit nếu đang bật
            if (editingItem.category !== null) {
                setEditingItem({ category: null, index: null, value: '' });
            }
        }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [editingItem]);

  const { data: configData, isLoading } = useQuery({
    queryKey: ['systemConfig'],
    queryFn: fetchConfig,
  });

  useEffect(() => {
    if (configData) {
      const safeConfig = {
          Nganh: configData.Nganh || [], KhoaNhapHoc: configData.KhoaNhapHoc || [],
          DoiTuongUT: configData.DoiTuongUT || [], KhuVucUT: configData.KhuVucUT || [],
          NamXetTuyen: configData.NamXetTuyen || [], DoiTuongDauVao: configData.DoiTuongDauVao || [],
          HeDaoTao: configData.HeDaoTao || [], HinhThucDaoTao: configData.HinhThucDaoTao || [],
          GioiTinh: configData.GioiTinh || []
      };
      setLocalConfig(JSON.parse(JSON.stringify(safeConfig)));
      // ĐÃ THÊM: baseline dirty-check — cùng nội dung, tách bản clone RIÊNG (không share
      // tham chiếu với localConfig) để sau này localConfig đổi thì baseline không tự đổi theo.
      setSavedConfigSnapshot(JSON.parse(JSON.stringify(safeConfig)));
    }
  }, [configData]);

  // ĐÃ THÊM: true khi localConfig khác baseline đã lưu — dùng để mặc định disable nút "Lưu".
  const isConfigDirty = useMemo(() => {
    if (!localConfig || !savedConfigSnapshot) return false;
    return JSON.stringify(localConfig) !== JSON.stringify(savedConfigSnapshot);
  }, [localConfig, savedConfigSnapshot]);

  const saveMutation = useMutation({
    mutationFn: saveConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['systemConfig'] });
      Swal.fire('Thành công', 'Đã lưu cấu hình hệ thống!', 'success');
    },
    onError: (err) => Swal.fire('Lỗi', err.message, 'error')
  });

  // ĐÃ THÊM (theo yêu cầu — kéo-thả đổi thứ tự các mục trong 1 danh mục): dùng HTML5 Drag
  // and Drop API có sẵn của trình duyệt (không cần thêm thư viện ngoài — đỡ phải npm install
  // thêm gói mới). dragItemRef nhớ tạm {category, index} của mục đang kéo — dùng useRef (chứ
  // không phải useState) vì giá trị này chỉ cần đọc lại lúc thả (drop), không cần re-render
  // theo nó. Chỉ cho thả HOÁN VỊ trong CÙNG 1 danh mục (kéo từ "Ngành" thả sang "Khóa nhập
  // học" sẽ bị bỏ qua) — mỗi danh mục là 1 mảng độc lập, không có ý nghĩa gì khi trộn lẫn.
  const dragItemRef = useRef({ category: null, index: null });

  const handleDragStartItem = (category, index) => {
    dragItemRef.current = { category, index };
  };

  const handleDragOverItem = (e) => {
    e.preventDefault(); // bắt buộc phải preventDefault ở dragover thì onDrop mới được gọi
  };

  const handleDropItem = (category, dropIndex) => {
    const { category: fromCategory, index: fromIndex } = dragItemRef.current;
    dragItemRef.current = { category: null, index: null };
    if (fromCategory !== category || fromIndex === null || fromIndex === dropIndex) return;
    setLocalConfig(prev => {
      const arr = [...(prev[category] || [])];
      const [moved] = arr.splice(fromIndex, 1);
      arr.splice(dropIndex, 0, moved);
      return { ...prev, [category]: arr };
    });
  };

  const handleAddItem = (key) => {
    const item = newItems[key]?.trim();
    if (!item) return;
    
    const currentArray = localConfig[key] || [];
    if (currentArray.includes(item)) { Swal.fire('Cảnh báo', 'Mục này đã tồn tại!', 'warning'); return; }
    
    setLocalConfig(prev => ({ ...prev, [key]: [...currentArray, item] }));
    setNewItems(prev => ({ ...prev, [key]: '' })); 
  };

  const handleRemoveItem = (key, index) => {
    setLocalConfig(prev => {
      const updatedArray = [...(prev[key] || [])];
      updatedArray.splice(index, 1);
      return { ...prev, [key]: updatedArray };
    });
  };

  // Logic Double Click bật ô Input
  const handleDoubleClick = (category, index, currentValue) => {
      setEditingItem({ category, index, value: currentValue });
  };

  // Logic Lưu lại sau khi gõ xong
  const handleSaveEdit = () => {
      if (editingItem.category === null) return;
      const { category, index, value } = editingItem;
      const cleanValue = value.trim();
      
      if (cleanValue) {
          setLocalConfig(prev => {
              const updatedArray = [...(prev[category] || [])];
              updatedArray[index] = cleanValue;
              return { ...prev, [category]: updatedArray };
          });
      }
      setEditingItem({ category: null, index: null, value: '' });
  };

  const handleSaveAll = () => saveMutation.mutate(localConfig);

  // ĐÃ THÊM: Chỉ tiêu tuyển sinh theo năm/ngành — dùng cho trang "Kho tra cứu sinh
  // viên" sau này tính % đạt chỉ tiêu (theo từng ngành + theo tổng). Tách sheet/API
  // riêng (ChiTieuTuyenSinh, action getChiTieu/saveChiTieu) vì bản chất khác CauHinh:
  // đây là số liệu GẮN VỚI TỪNG NĂM, tích luỹ qua nhiều năm chứ không phải danh mục
  // "hiện có gì" duy nhất như Ngành/Khóa/Hệ đào tạo ở trên.
  const { data: chiTieuData = CHI_TIEU_RONG } = useQuery({
    queryKey: ['chiTieuTuyenSinh'],
    queryFn: fetchChiTieu,
  });
  const [chiTieuNam, setChiTieuNam] = useState(String(new Date().getFullYear()));
  const [chiTieuLocal, setChiTieuLocal] = useState({}); // { [nganh]: chỉ tiêu (số) } — CHỈ của năm đang chọn

  // Các năm đã từng lưu chỉ tiêu — hiện thành nút bấm nhanh, mới nhất trước.
  const cacNamDaCo = useMemo(() => {
    const s = new Set(chiTieuData.map(it => it.nam));
    return [...s].sort((a, b) => b.localeCompare(a));
  }, [chiTieuData]);

  // Đổi năm (hoặc dữ liệu chỉ tiêu tải xong) -> nạp lại đúng các ô nhập của năm đó.
  useEffect(() => {
    const map = {};
    chiTieuData.filter(it => it.nam === chiTieuNam).forEach(it => { map[it.nganh] = it.chiTieu; });
    setChiTieuLocal(map);
  }, [chiTieuData, chiTieuNam]);

  const saveChiTieuMutation = useMutation({
    mutationFn: () => saveChiTieu(
      chiTieuNam,
      Object.entries(chiTieuLocal).map(([nganh, chiTieu]) => ({ nganh, chiTieu: Number(chiTieu) || 0 }))
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chiTieuTuyenSinh'] });
      Swal.fire('Thành công', `Đã lưu chỉ tiêu tuyển sinh năm ${chiTieuNam}!`, 'success');
    },
    onError: (err) => Swal.fire('Lỗi', err.message, 'error'),
  });

  const tongChiTieuNam = Object.values(chiTieuLocal).reduce((s, v) => s + (Number(v) || 0), 0);

  const handleCheckPin = async () => {
    if (pinCode === '291') {
        setShowPinModal(false); setPinCode(''); setShowHistoryModal(true); setIsLoadingLogs(true);
        try {
            const res = await fetch(`${WEB_APP_URL}?action=getLogs&username=ALL`);
            const data = await res.json();
            if (data.code === 200) setHistoryLogs(data.data); else setHistoryLogs([]);
        } catch (e) { setHistoryLogs([]); }
        setIsLoadingLogs(false);
    } else {
        Swal.fire('Thất bại', 'Mật mã không chính xác!', 'error'); setPinCode('');
    }
  };

  // ĐÃ THÊM 'GioiTinh' (theo yêu cầu — bổ sung Giới tính/Nơi sinh): danh mục Giới tính cho
  // dropdown ở trang Xét tuyển/Thu hồ sơ trực tiếp — LƯU Ý khi thêm/sửa giá trị ở đây: cột
  // "Giấy chuyển NVQS (với nam)" (isDocApplicable, XetTuyenPage.jsx) so khớp CHÍNH XÁC với
  // chuỗi "Nam" (viết hoa chữ N) để tự ẩn/hiện đúng giới tính — nếu đổi tên giá trị này
  // khác đi, phải sửa lại genderOnly ở DICT_HO_SO.chung cho khớp.
  const CONFIG_MAPPINGS = [
    { key: 'Nganh', title: 'Danh mục Ngành học' }, { key: 'NamXetTuyen', title: 'Năm xét tuyển' },
    { key: 'KhoaNhapHoc', title: 'Khóa nhập học' }, { key: 'DoiTuongDauVao', title: 'Đối tượng đầu vào' },
    { key: 'HeDaoTao', title: 'Hệ đào tạo' }, { key: 'HinhThucDaoTao', title: 'Hình thức đào tạo' },
    { key: 'DoiTuongUT', title: 'Đối tượng ưu tiên' }, { key: 'KhuVucUT', title: 'Khu vực ưu tiên' },
    { key: 'GioiTinh', title: 'Giới tính' }
  ];

  if (isLoading || !localConfig) {
    return <div className="text-center mt-5"><div className="spinner-border text-primary"></div><p className="mt-2 fw-bold">Đang tải cấu hình...</p></div>;
  }

  return (
    <div className="container-fluid py-3 position-relative settings-page">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="text-uppercase fw-bold mb-0" style={{ color: '#037683' }}>CẤU HÌNH HỆ THỐNG</h4>
        <div className="d-flex gap-2">
            <button className="btn btn-secondary px-3 fw-bold" onClick={() => setShowPinModal(true)}>
                <i className="bi bi-clock-history me-2"></i>Lịch sử
            </button>
            <button className="btn btn-success px-4 fw-bold shadow-sm" onClick={handleSaveAll} disabled={saveMutation.isPending || !isConfigDirty}>
                {saveMutation.isPending ? 'Đang lưu...' : <><i className="bi bi-save me-2"></i>Lưu</>}
            </button>
        </div>
      </div>

      {/* ĐÃ SỬA (yêu cầu — chia 3-4 cột, dồn block lên, đưa khối Chỉ tiêu vào chung lưới):
          trước đây tối đa 3 cột (col-lg-4) và khối "Chỉ tiêu tuyển sinh" nằm RIÊNG 1 hàng
          full-width phía trên (dạng bảng) — giờ 2 cột ở màn hẹp, 3 cột ở md, 4 cột ở lg trở
          lên (đã compact chữ/padding nên 4 cột vẫn đọc rõ), và "Chỉ tiêu tuyển sinh" giờ là
          1 thẻ NGAY TRONG cùng lưới này (cùng kích thước/khung với 9 thẻ danh mục bên dưới —
          mỗi Ngành 1 dòng có khung trong list-group, y hệt kiểu các thẻ danh mục khác) thay
          vì bảng full-width như trước. */}
      <div className="row g-3 mt-0">
        {/* ĐÃ THÊM: thẻ "Chỉ tiêu tuyển sinh" — nhập theo từng năm, mỗi năm 1 số cho mỗi
            ngành. Chọn/gõ năm + các nút chọn nhanh năm đã có nằm trong card-header (xếp dọc
            vì thẻ giờ hẹp hơn nhiều so với bản full-width cũ), danh sách Ngành bên dưới tự
            cuộn dọc khi dài (giống hệt các thẻ danh mục khác). */}
        <div className="col-6 col-md-4 col-lg-3">
          <div className="card h-100 border-0 shadow-sm settings-quota-card">
            <div className="card-header bg-white fw-bold text-secondary">
              <div><i className="bi bi-bullseye me-2"></i>Chỉ tiêu tuyển sinh</div>
              <div className="d-flex align-items-center gap-2 flex-wrap mt-2">
                <label className="small text-muted mb-0">Năm:</label>
                <input
                  type="number"
                  className="form-control form-control-sm"
                  style={{ width: 80 }}
                  value={chiTieuNam}
                  onChange={(e) => setChiTieuNam(e.target.value.trim())}
                />
              </div>
              {cacNamDaCo.length > 0 && (
                <div className="d-flex gap-1 flex-wrap mt-2">
                  {cacNamDaCo.map((nam) => (
                    <button
                      key={nam}
                      type="button"
                      className={`btn btn-sm ${nam === chiTieuNam ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => setChiTieuNam(nam)}
                    >
                      {nam}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="card-body bg-light">
              {(localConfig.Nganh || []).length === 0 ? (
                <div className="text-muted small fst-italic">
                  Chưa có danh mục Ngành — thêm ở thẻ "Danh mục Ngành học" bên cạnh trước khi nhập chỉ tiêu.
                </div>
              ) : (
                <>
                  <div style={{ maxHeight: '210px', overflowY: 'auto' }}>
                    <ul className="list-group list-group-flush rounded shadow-sm">
                      {localConfig.Nganh.map((nganh) => (
                        <li key={nganh} className="list-group-item d-flex justify-content-between align-items-center py-1 px-2 gap-2 border-bottom border-light">
                          <span className="small text-truncate flex-grow-1" title={nganh} style={{ minWidth: 0 }}>{nganh}</span>
                          <input
                            type="number"
                            min="0"
                            className="form-control form-control-sm"
                            style={{ width: 64 }}
                            value={chiTieuLocal[nganh] ?? ''}
                            onChange={(e) => setChiTieuLocal(prev => ({ ...prev, [nganh]: e.target.value }))}
                            placeholder="0"
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="d-flex justify-content-between align-items-center small fw-bold mt-2 px-1">
                    <span>Tổng năm {chiTieuNam || '—'}</span>
                    <span>{tongChiTieuNam}</span>
                  </div>
                  <button
                    className="btn btn-success btn-sm fw-bold mt-2 w-100"
                    onClick={() => saveChiTieuMutation.mutate()}
                    disabled={saveChiTieuMutation.isPending || !chiTieuNam}
                  >
                    {saveChiTieuMutation.isPending ? 'Đang lưu...' : <><i className="bi bi-save me-2"></i>Lưu chỉ tiêu</>}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {CONFIG_MAPPINGS.map((configObj) => {
          const listItems = localConfig[configObj.key] || [];

          return (
            <div className="col-6 col-md-4 col-lg-3" key={configObj.key}>
              <div className="card h-100 border-0 shadow-sm">
                <div className="card-header bg-white fw-bold text-secondary d-flex justify-content-between align-items-center">
                  <span>{configObj.title}</span> 
                  <span className="badge bg-light text-dark border ms-1">{listItems.length}</span>
                </div>
                <div className="card-body bg-light">
                  
                  <div className="input-group input-group-sm mb-3 shadow-sm">
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="Nhập mục mới..." 
                      value={newItems[configObj.key] || ''}
                      onChange={(e) => setNewItems(prev => ({ ...prev, [configObj.key]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddItem(configObj.key)}
                    />
                    <button className="btn btn-primary fw-bold" onClick={() => handleAddItem(configObj.key)}>Thêm</button>
                  </div>

                  <div style={{ maxHeight: '210px', overflowY: 'auto' }}>
                    <ul className="list-group list-group-flush rounded shadow-sm">
                      {listItems.length === 0 ? (
                        <li className="list-group-item text-center text-muted small fst-italic">Chưa có dữ liệu</li>
                      ) : (
                        listItems.map((item, idx) => {
                          const isEditing = editingItem.category === configObj.key && editingItem.index === idx;

                          return (
                            <li key={idx} className="list-group-item d-flex justify-content-between align-items-center py-1 px-2 border-bottom border-light"
                                style={{ minHeight: '42px', transition: '0.2s background-color' }}
                                draggable={!isEditing}
                                onDragStart={() => handleDragStartItem(configObj.key, idx)}
                                onDragOver={handleDragOverItem}
                                onDrop={() => handleDropItem(configObj.key, idx)}>

                              {isEditing ? (
                                  // CHẾ ĐỘ ĐANG SỬA (CÓ NÚT LƯU + NÚT XÓA)
                                  <div className="d-flex w-100 align-items-center gap-2">
                                      <input 
                                         type="text" 
                                         className="form-control form-control-sm border-primary shadow-none" 
                                         value={editingItem.value}
                                         onChange={(e) => setEditingItem({ ...editingItem, value: e.target.value })}
                                         onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                                         autoFocus
                                      />
                                      <button className="btn btn-sm btn-success px-3 fw-bold" onClick={handleSaveEdit} title="Lưu lại">
                                          Lưu
                                      </button>
                                      <button className="btn btn-sm text-danger px-2 settings-del-btn" onClick={() => {
                                          handleRemoveItem(configObj.key, idx);
                                          setEditingItem({ category: null, index: null, value: '' });
                                      }} title="Xóa luôn mục này">
                                          <i className="bi bi-trash-fill"></i>Xóa
                                      </button>
                                  </div>
                              ) : (
                                  // CHẾ ĐỘ XEM BÌNH THƯỜNG
                                  <>
                                      <span className="d-flex align-items-center flex-grow-1" style={{ minWidth: 0 }}>
                                          {/* ĐÃ THÊM: tay cầm kéo-thả (yêu cầu — kéo thả đổi thứ tự thay vì nút
                                              up/down khó bấm trong 1 dòng hẹp). Kéo được ngay từ bất kỳ đâu trên
                                              cả dòng (draggable đặt ở <li>, xem phía trên) — icon này chỉ là gợi ý
                                              trực quan + đổi con trỏ thành "grab" (xem Settings.css). */}
                                          <i className="bi bi-grip-vertical text-muted me-1 settings-drag-handle" title="Kéo để đổi thứ tự"></i>
                                          <span
                                              className="small text-truncate"
                                              onDoubleClick={() => handleDoubleClick(configObj.key, idx, item)}
                                              title="Nhấp đúp chuột để sửa"
                                              style={{ cursor: 'pointer', userSelect: 'none' }}
                                          >
                                              {item}
                                          </span>
                                      </span>

                                      <button className="btn btn-sm text-danger px-2 py-0 ms-2 settings-del-btn" onClick={() => handleRemoveItem(configObj.key, idx)} title="Xóa">
                                          <i className="bi bi-trash-fill"></i>Xóa
                                      </button>
                                  </>
                              )}

                            </li>
                          );
                        })
                      )}
                    </ul>
                  </div>

                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showPinModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1050 }} 
             onClick={(e) => { if(e.target.className.includes('modal')) { setShowPinModal(false); setPinCode(''); }}}>
            <div className="modal-dialog modal-sm modal-dialog-centered">
                <div className="modal-content shadow-lg border-0">
                    <div className="modal-body p-4 text-center">
                        <i className="bi bi-shield-lock-fill text-warning" style={{ fontSize: '3rem' }}></i>
                        <h6 className="fw-bold mt-2 mb-3">Xác thực Quản trị viên</h6>
                        <input type="password" className="form-control text-center fw-bold letter-spacing-2 mb-3" placeholder="Nhập PIN..." 
                            value={pinCode} onChange={e => setPinCode(e.target.value)} 
                            onKeyDown={e => e.key === 'Enter' && handleCheckPin()} autoFocus
                        />
                        <button className="btn btn-primary w-100 fw-bold" onClick={handleCheckPin}>Mở khóa</button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {showHistoryModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1050 }} 
             onClick={(e) => { if(e.target.className.includes('modal')) setShowHistoryModal(false); }}>
            <div className="modal-dialog modal-lg modal-dialog-centered">
                <div className="modal-content shadow-lg border-0">
                    <div className="modal-header bg-dark text-white py-3">
                        <h5 className="modal-title fw-bold mb-0"><i className="bi bi-clock-history me-2"></i>LỊCH SỬ CẤU HÌNH</h5>
                        <button type="button" className="btn-close btn-close-white" onClick={() => setShowHistoryModal(false)}></button>
                    </div>
                    <div className="modal-body p-0">
                        {isLoadingLogs ? (
                            <div className="text-center py-5"><div className="spinner-border text-primary"></div></div>
                        ) : (
                            <div className="table-responsive" style={{ maxHeight: '400px' }}>
                                <table className="table table-hover mb-0 align-middle">
                                    <thead className="table-light sticky-top">
                                        <tr>
                                            <th className="ps-4">Thời gian</th>
                                            <th>Tài khoản</th>
                                            <th>Hành động</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {historyLogs.length === 0 ? (
                                            <tr><td colSpan="3" className="text-center py-4 text-muted">Chưa có lịch sử thay đổi cấu hình nào.</td></tr>
                                        ) : (
                                            historyLogs.map((log, index) => (
                                                <tr key={index}>
                                                    <td className="ps-4 text-muted small">{log.ThoiGian}</td>
                                                    <td className="fw-bold text-primary">{log.Username}</td>
                                                    <td>{log.HanhDong} <span className="text-muted small d-block">{log.ChiTiet}</span></td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};

export default SettingsPage;