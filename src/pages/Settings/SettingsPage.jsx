import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchConfig, saveConfig, fetchChiTieu, saveChiTieu } from '../../api/studentApi';
import Swal from 'sweetalert2';

// Khai báo link GAS để fetch Lịch sử (Thay đúng link của ông vào đây)
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzkp4Nqb3kP3DjEGBucxLKPDgQamDMO8mQOOCg71_a_iHqnmuGWjU54e-QvxNGzELN9/exec";

const SettingsPage = () => {
  const queryClient = useQueryClient();
  const [localConfig, setLocalConfig] = useState(null);
  
  const [newItems, setNewItems] = useState({ 
      Nganh: '', KhoaNhapHoc: '', DoiTuongUT: '', KhuVucUT: '', NamXetTuyen: '',
      DoiTuongDauVao: '', HeDaoTao: '', HinhThucDaoTao: ''
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
          HeDaoTao: configData.HeDaoTao || [], HinhThucDaoTao: configData.HinhThucDaoTao || []
      };
      setLocalConfig(JSON.parse(JSON.stringify(safeConfig))); 
    }
  }, [configData]);

  const saveMutation = useMutation({
    mutationFn: saveConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['systemConfig'] });
      Swal.fire('Thành công', 'Đã lưu cấu hình hệ thống!', 'success');
    },
    onError: (err) => Swal.fire('Lỗi', err.message, 'error')
  });

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
  const { data: chiTieuData = [] } = useQuery({
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

  const CONFIG_MAPPINGS = [
    { key: 'Nganh', title: 'Danh mục Ngành học' }, { key: 'NamXetTuyen', title: 'Năm xét tuyển' },
    { key: 'KhoaNhapHoc', title: 'Khóa nhập học' }, { key: 'DoiTuongDauVao', title: 'Đối tượng đầu vào' },
    { key: 'HeDaoTao', title: 'Hệ đào tạo' }, { key: 'HinhThucDaoTao', title: 'Hình thức đào tạo' },
    { key: 'DoiTuongUT', title: 'Đối tượng ưu tiên' }, { key: 'KhuVucUT', title: 'Khu vực ưu tiên' }
  ];

  if (isLoading || !localConfig) {
    return <div className="text-center mt-5"><div className="spinner-border text-primary"></div><p className="mt-2 fw-bold">Đang tải cấu hình...</p></div>;
  }

  return (
    <div className="container-fluid py-4 position-relative">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="text-uppercase fw-bold" style={{ color: '#037683' }}>CẤU HÌNH HỆ THỐNG</h4>
        <div className="d-flex gap-2">
            <button className="btn btn-secondary px-3 fw-bold" onClick={() => setShowPinModal(true)}>
                <i className="bi bi-clock-history me-2"></i>Lịch sử
            </button>
            <button className="btn btn-success px-4 fw-bold shadow-sm" onClick={handleSaveAll} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Đang lưu...' : <><i className="bi bi-save me-2"></i>Lưu tất cả thay đổi</>}
            </button>
        </div>
      </div>

      <div className="alert alert-info border-0 shadow-sm">
        <i className="bi bi-info-circle-fill me-2"></i>
        Nhập thêm ở ô trống. <strong>Nhấp đúp chuột</strong> (Double-click) vào chữ để sửa đổi, hoặc bấm dấu <strong className="text-danger">X</strong> để xóa.
      </div>

      {/* ĐÃ THÊM: Chỉ tiêu tuyển sinh — nhập theo từng năm, mỗi năm 1 số cho mỗi ngành.
          Chọn/gõ năm ở góc phải card, bảng bên dưới tự nạp lại đúng số của năm đó. */}
      <div className="card border-0 shadow-sm mb-2">
        <div className="card-header bg-white fw-bold text-secondary d-flex justify-content-between align-items-center flex-wrap gap-2">
          <span><i className="bi bi-bullseye me-2"></i>Chỉ tiêu tuyển sinh</span>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <label className="small text-muted mb-0">Năm:</label>
            <input
              type="number"
              className="form-control form-control-sm"
              style={{ width: 100 }}
              value={chiTieuNam}
              onChange={(e) => setChiTieuNam(e.target.value.trim())}
            />
            {cacNamDaCo.length > 0 && (
              <div className="d-flex gap-1 flex-wrap">
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
        </div>
        <div className="card-body">
          {(localConfig.Nganh || []).length === 0 ? (
            <div className="text-muted small fst-italic">
              Chưa có danh mục Ngành — thêm ở khối "Danh mục Ngành học" bên dưới trước khi nhập chỉ tiêu.
            </div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="table table-sm align-middle mb-2">
                  <thead>
                    <tr>
                      <th>Ngành</th>
                      <th style={{ width: 160 }}>Chỉ tiêu năm {chiTieuNam || '—'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {localConfig.Nganh.map((nganh) => (
                      <tr key={nganh}>
                        <td>{nganh}</td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            className="form-control form-control-sm"
                            value={chiTieuLocal[nganh] ?? ''}
                            onChange={(e) => setChiTieuLocal(prev => ({ ...prev, [nganh]: e.target.value }))}
                            placeholder="0"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="fw-bold table-light">
                      <td>Tổng chỉ tiêu năm {chiTieuNam || '—'}</td>
                      <td>{tongChiTieuNam}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <button
                className="btn btn-success btn-sm fw-bold"
                onClick={() => saveChiTieuMutation.mutate()}
                disabled={saveChiTieuMutation.isPending || !chiTieuNam}
              >
                {saveChiTieuMutation.isPending ? 'Đang lưu...' : <><i className="bi bi-save me-2"></i>Lưu chỉ tiêu năm {chiTieuNam}</>}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="row g-4 mt-1">
        {CONFIG_MAPPINGS.map((configObj) => {
          const listItems = localConfig[configObj.key] || [];

          return (
            <div className="col-md-6 col-lg-4" key={configObj.key}>
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

                  <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                    <ul className="list-group list-group-flush rounded shadow-sm">
                      {listItems.length === 0 ? (
                        <li className="list-group-item text-center text-muted small fst-italic">Chưa có dữ liệu</li>
                      ) : (
                        listItems.map((item, idx) => {
                          const isEditing = editingItem.category === configObj.key && editingItem.index === idx;

                          return (
                            <li key={idx} className="list-group-item d-flex justify-content-between align-items-center py-1 px-2 border-bottom border-light" 
                                style={{ minHeight: '42px', transition: '0.2s background-color' }}>
                              
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
                                      <button className="btn btn-sm text-danger px-2" onClick={() => {
                                          handleRemoveItem(configObj.key, idx);
                                          setEditingItem({ category: null, index: null, value: '' });
                                      }} title="Xóa luôn mục này">
                                          <i className="bi bi-trash-fill fs-5"></i>
                                      </button>
                                  </div>
                              ) : (
                                  // CHẾ ĐỘ XEM BÌNH THƯỜNG
                                  <>
                                      <span 
                                          className="small flex-grow-1" 
                                          onDoubleClick={() => handleDoubleClick(configObj.key, idx, item)}
                                          title="Nhấp đúp chuột để sửa"
                                          style={{ cursor: 'pointer', userSelect: 'none' }}
                                      >
                                          {item}
                                      </span>
                                      
                                      <button className="btn btn-sm text-danger p-0 m-0 ms-2" onClick={() => handleRemoveItem(configObj.key, idx)} title="Xóa">
                                          <i className="bi bi-trash-fill fs-6"></i>
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