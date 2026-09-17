import React, { useState, useEffect } from 'react';
import './VanBan.css';
// ĐÃ THÊM: fetchBangTinMoiNhat CHƯA có sẵn trong api/studentApi.js — cần thêm 1 hàm
// mới theo ĐÚNG pattern các hàm fetch* khác trong file đó (VD fetchHoatDong24h), gọi
// action GAS "layBangTinMoiNhat" (đã đăng ký ở quanlysv.gs, thân hàm tại VanBan.gs) và
// trả thẳng mảng "data" của response. Gửi studentApi.js để tôi thêm đúng chỗ nếu dòng
// import này báo lỗi "not exported".
import { fetchBangTinMoiNhat } from '../../api/studentApi';

// ĐÃ THÊM: 2 mục lớn của trang, lọc theo đúng giá trị cột "Loại" trên sheet BangTin
// (xem BANGTIN_TEN_COT/hdGet_layBangTinMoiNhat, VanBan.gs) — sai chính tả/dấu ở đây thì
// đổi đúng lại "loai" bên dưới cho khớp giá trị thật ông nhập trên Sheet.
const TABS = [
  { key: 'tintuc', label: 'Tin tức', loai: 'Tin tức' },
  { key: 'vanban', label: 'Văn bản hành chính', loai: 'Văn bản hành chính' },
];

const QuanLyVanBanPage = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState('tintuc');
  // ĐÃ THÊM: item đang mở preview (null = không mở) — "mở preview trực tiếp trên tab"
  // theo yêu cầu: bấm "Xem" hiện ngay khung xem trước (iframe nhúng Drive) đè lên
  // trang, không cần rời khỏi tab/tải file về mới xem được.
  const [previewItem, setPreviewItem] = useState(null);

  useEffect(() => {
    let daHuy = false;
    fetchBangTinMoiNhat()
      .then(list => { if (!daHuy) setItems(Array.isArray(list) ? list : []); })
      .catch(err => {
        if (daHuy) return;
        console.error('[QuanLyVanBanPage] fetchBangTinMoiNhat lỗi:', err);
        setError(true);
      })
      .finally(() => { if (!daHuy) setLoading(false); });
    return () => { daHuy = true; };
  }, []);

  // Đóng preview bằng phím Esc — tiện dùng bàn phím, giống các modal khác trong app
  // (menu tài khoản/bảng thông báo ở App.jsx cũng có cơ chế Esc tương tự).
  useEffect(() => {
    if (!previewItem) return;
    const onEsc = (e) => { if (e.key === 'Escape') setPreviewItem(null); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [previewItem]);

  const activeTab = TABS.find(t => t.key === tab) || TABS[0];
  const filtered = items.filter(it => it.loai === activeTab.loai);

  return (
    <div className="vanban-wrapper">
      <h4 className="fw-bold mb-3">Quản lý văn bản</h4>

      <ul className="nav nav-tabs mb-3">
        {TABS.map(t => (
          <li className="nav-item" key={t.key}>
            <button
              type="button"
              className={`nav-link ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          </li>
        ))}
      </ul>

      {loading ? (
        <div className="text-muted small">Đang tải...</div>
      ) : error ? (
        <div className="text-danger small">Không tải được dữ liệu — mở Console (F12) xem chi tiết lỗi.</div>
      ) : filtered.length === 0 ? (
        <div className="text-muted small">Chưa có {activeTab.label.toLowerCase()} nào.</div>
      ) : (
        <div className="vanban-list">
          {filtered.map((it, idx) => (
            <div className="vanban-item" key={idx}>
              <div className="vanban-item-main">
                <div className="vanban-item-title">{it.tieuDe || '(Chưa có tiêu đề)'}</div>
                {it.tomTat && <div className="vanban-item-desc">{it.tomTat}</div>}
                <div className="vanban-item-meta">
                  {it.nguon && <span>{it.nguon}</span>}
                  {it.ngayDang && <span>{it.ngayDang}</span>}
                  {it.nguoiDang && <span>{it.nguoiDang}</span>}
                </div>
              </div>
              {/* ĐÃ THÊM: 2 nút Xem/Tải chỉ hiện khi tin có đính kèm file (linkXem/linkTaiVe
                  đều rỗng nếu ô "Link Drive" trống hoặc không tách được fileId — xem
                  layFileIdTuLinkDrive_, VanBan.gs) — tin tức thuần chữ không cần 2 nút này. */}
              {it.linkXem && (
                <div className="vanban-item-actions">
                  <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setPreviewItem(it)}>
                    👁️ Xem
                  </button>
                  <a href={it.linkTaiVe} className="btn btn-sm btn-outline-secondary" target="_blank" rel="noreferrer">
                    ⬇️ Tải về
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {previewItem && (
        <div className="vanban-preview-overlay" onClick={() => setPreviewItem(null)}>
          <div className="vanban-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vanban-preview-header">
              <span className="fw-bold text-truncate">{previewItem.tieuDe}</span>
              <button type="button" className="btn-close" onClick={() => setPreviewItem(null)} aria-label="Đóng"></button>
            </div>
            <iframe src={previewItem.linkXem} title={previewItem.tieuDe} className="vanban-preview-iframe" />
            <div className="vanban-preview-footer">
              <a href={previewItem.linkTaiVe} className="btn btn-sm btn-primary" target="_blank" rel="noreferrer">
                ⬇️ Tải về
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuanLyVanBanPage;