import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchConfig, saveConfig } from '../../api/studentApi'; // Điều chỉnh lại đường dẫn cho đúng nhé
import Swal from 'sweetalert2';

const SettingsPage = () => {
  const queryClient = useQueryClient();
  const [localConfig, setLocalConfig] = useState(null);
  const [newItems, setNewItems] = useState({ Nganh: '', KhoaNhapHoc: '', DoiTuongUT: '', KhuVucUT: '', NamXetTuyen: '' });

  // Tải dữ liệu từ Sheet
  const { data: configData, isLoading } = useQuery({
    queryKey: ['systemConfig'],
    queryFn: fetchConfig,
  });

  // Đổ dữ liệu vào state cục bộ để dễ sửa chữa trên giao diện
  useEffect(() => {
    if (configData) {
      setLocalConfig(JSON.parse(JSON.stringify(configData))); // Deep copy
    }
  }, [configData]);

  // Mutation lưu xuống Sheet
  const saveMutation = useMutation({
    mutationFn: saveConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['systemConfig'] });
      Swal.fire('Thành công', 'Đã lưu cấu hình hệ thống!', 'success');
    },
    onError: (err) => Swal.fire('Lỗi', err.message, 'error')
  });

  const handleAddItem = (key) => {
    const item = newItems[key].trim();
    if (!item) return;
    if (localConfig[key].includes(item)) {
      Swal.fire('Cảnh báo', 'Mục này đã tồn tại!', 'warning');
      return;
    }
    
    setLocalConfig(prev => ({
      ...prev,
      [key]: [...prev[key], item]
    }));
    
    setNewItems(prev => ({ ...prev, [key]: '' })); // Reset ô nhập
  };

  const handleRemoveItem = (key, index) => {
    setLocalConfig(prev => {
      const updatedArray = [...prev[key]];
      updatedArray.splice(index, 1);
      return { ...prev, [key]: updatedArray };
    });
  };

  const handleSaveAll = () => {
    saveMutation.mutate(localConfig);
  };

  const CONFIG_MAPPINGS = [
    { key: 'Nganh', title: 'Danh mục Ngành học' },
    { key: 'NamXetTuyen', title: 'Năm xét tuyển' },
    { key: 'KhoaNhapHoc', title: 'Khóa nhập học' },
    { key: 'DoiTuongUT', title: 'Đối tượng ưu tiên' },
    { key: 'KhuVucUT', title: 'Khu vực ưu tiên' }
  ];

  if (isLoading || !localConfig) {
    return <div className="text-center mt-5"><div className="spinner-border text-primary"></div><p>Đang tải cấu hình...</p></div>;
  }

  return (
    <div className="container-fluid py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="text-uppercase fw-bold" style={{ color: '#037683' }}>CẤU HÌNH HỆ THỐNG</h4>
        <button className="btn btn-success px-4" onClick={handleSaveAll} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Đang lưu...' : <><i className="bi bi-save me-2"></i>Lưu tất cả thay đổi</>}
        </button>
      </div>

      <div className="alert alert-info border-0 shadow-sm">
        <i className="bi bi-info-circle-fill me-2"></i>
        Thêm hoặc xóa các danh mục tại đây. Đừng quên bấm <strong>Lưu tất cả thay đổi</strong> để đồng bộ xuống Google Sheets. Các biểu mẫu nhập liệu sẽ tự động lấy dữ liệu từ đây.
      </div>

      <div className="row g-4 mt-1">
        {CONFIG_MAPPINGS.map((configObj) => (
          <div className="col-md-6 col-lg-4" key={configObj.key}>
            <div className="card h-100 border-0 shadow-sm">
              <div className="card-header bg-white fw-bold text-secondary">
                {configObj.title} <span className="badge bg-light text-dark border ms-1">{localConfig[configObj.key].length}</span>
              </div>
              <div className="card-body">
                
                {/* Khu vực nhập thêm */}
                <div className="input-group input-group-sm mb-3">
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="Nhập mục mới..." 
                    value={newItems[configObj.key]}
                    onChange={(e) => setNewItems(prev => ({ ...prev, [configObj.key]: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddItem(configObj.key)}
                  />
                  <button className="btn btn-outline-primary" onClick={() => handleAddItem(configObj.key)}>Thêm</button>
                </div>

                {/* Danh sách các mục */}
                <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                  <ul className="list-group list-group-flush">
                    {localConfig[configObj.key].length === 0 ? (
                      <li className="list-group-item text-center text-muted small fst-italic">Chưa có dữ liệu</li>
                    ) : (
                      localConfig[configObj.key].map((item, idx) => (
                        <li key={idx} className="list-group-item d-flex justify-content-between align-items-center py-1 px-2 border-0 bg-light mb-1 rounded">
                          <span className="small">{item}</span>
                          <button className="btn btn-sm text-danger p-0 m-0" onClick={() => handleRemoveItem(configObj.key, idx)}>
                            <i className="bi bi-x-circle-fill"></i>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>

              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SettingsPage;