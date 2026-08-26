import React, { useState, useRef, useEffect, useMemo } from 'react';

// ĐÃ THÊM: bộ chọn khoảng thời gian tự viết (không phụ thuộc thư viện ngoài, dự án
// hiện chưa cài date-picker nào) — thay cho 2 ô "Từ ngày"/"Đến ngày" tách rời cũ.
// Hành vi: bấm mở lịch tháng, bấm ngày đầu tiên = mốc bắt đầu, bấm ngày thứ 2 = mốc kết
// thúc — KHÔNG bắt buộc đúng thứ tự thời gian, tự sắp xếp lại nhỏ→lớn khi trả kết quả —
// giống kiểu chọn ngày quen thuộc của các trang đặt phòng khách sạn.
const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const pad2 = (n) => String(n).padStart(2, '0');
const toISO = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
const fmtVN = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const DateRangePicker = ({ from, to, onChange }) => {
  const [open, setOpen] = useState(false);
  const [pendingStart, setPendingStart] = useState(null); // mốc đầu đã chọn trong lượt đang mở, chưa chốt mốc 2
  const [hoverDate, setHoverDate] = useState(null); // để xem trước khoảng đang rê chuột (chỉ có ý nghĩa khi đã có pendingStart)
  const [viewDate, setViewDate] = useState(() => (from ? new Date(from) : new Date()));
  const wrapRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setPendingStart(null);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const openPicker = () => {
    const base = from ? new Date(from) : new Date();
    setViewDate(new Date(base.getFullYear(), base.getMonth(), 1));
    setPendingStart(null);
    setOpen((o) => !o);
  };

  const changeMonth = (delta) => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));

  const cells = useMemo(() => {
    const y = viewDate.getFullYear();
    const m = viewDate.getMonth();
    const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // quy về Thứ 2 = 0
    const totalDays = new Date(y, m + 1, 0).getDate();
    const arr = [];
    for (let i = 0; i < firstDow; i++) arr.push(null);
    for (let d = 1; d <= totalDays; d++) arr.push(d);
    return arr;
  }, [viewDate]);

  const handlePick = (d) => {
    const iso = toISO(viewDate.getFullYear(), viewDate.getMonth(), d);
    if (!pendingStart) {
      setPendingStart(iso);
    } else {
      const lo = pendingStart <= iso ? pendingStart : iso;
      const hi = pendingStart <= iso ? iso : pendingStart;
      onChange(lo, hi);
      setPendingStart(null);
      setHoverDate(null);
      setOpen(false);
    }
  };

  // Khoảng đang hiển thị highlight: nếu đang giữa lượt chọn (đã có pendingStart) thì xem
  // trước theo hoverDate; nếu chưa bấm gì trong lượt này thì hiện lại khoảng from/to đã chốt trước đó.
  const previewLo = pendingStart ? (hoverDate ? (pendingStart <= hoverDate ? pendingStart : hoverDate) : pendingStart) : from;
  const previewHi = pendingStart ? (hoverDate ? (pendingStart <= hoverDate ? hoverDate : pendingStart) : pendingStart) : to;

  return (
    <div className="position-relative" ref={wrapRef}>
      <button type="button" className="form-control form-control-sm text-start thamdinh-daterange-trigger" onClick={openPicker}>
        {from && to ? `${fmtVN(from)} - ${fmtVN(to)}` : 'Chọn khoảng thời gian'}
      </button>

      {open && (
        <div className="thamdinh-daterange-popup shadow" onMouseLeave={() => setHoverDate(null)}>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <button type="button" className="btn btn-sm btn-light py-0 px-2" onClick={() => changeMonth(-1)}>‹</button>
            <span className="fw-bold small">Tháng {viewDate.getMonth() + 1}/{viewDate.getFullYear()}</span>
            <button type="button" className="btn btn-sm btn-light py-0 px-2" onClick={() => changeMonth(1)}>›</button>
          </div>
          <div className="thamdinh-daterange-grid">
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} className="thamdinh-daterange-weekday">{w}</div>
            ))}
            {cells.map((d, idx) => {
              if (d === null) return <div key={idx} />;
              const iso = toISO(viewDate.getFullYear(), viewDate.getMonth(), d);
              const isInRange = previewLo && previewHi && iso >= previewLo && iso <= previewHi;
              const isEdge = iso === previewLo || iso === previewHi;
              const cls = ['thamdinh-daterange-day'];
              if (isInRange) cls.push('in-range');
              if (isEdge) cls.push('edge');
              return (
                <button
                  key={idx}
                  type="button"
                  className={cls.join(' ')}
                  onMouseEnter={() => setHoverDate(iso)}
                  onClick={() => handlePick(d)}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <div className="small text-muted mt-2 mb-0">
            {pendingStart ? `Đã chọn ${fmtVN(pendingStart)} — bấm ngày thứ 2 để hoàn tất` : 'Bấm 1 ngày để bắt đầu chọn khoảng'}
          </div>
        </div>
      )}
    </div>
  );
};

export default DateRangePicker;