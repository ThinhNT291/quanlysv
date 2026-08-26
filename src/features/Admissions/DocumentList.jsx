import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAdmissions, fetchPayments, savePayment, toggleAdmissionField } from '../../api/studentApi';
import Swal from 'sweetalert2';

// ĐÃ VIẾT LẠI TOÀN BỘ: checklist giờ khớp ĐÚNG các cột thật trên Trung Gian (cùng bộ
// với CHECK_FIELDS trong AddStudentModal.jsx — để ngỏ cửa bổ sung thêm sau này chỉ cần
// sửa 1 chỗ là ADMISSIONS_CHECK_FIELDS bên Quanlysv.gs + 2 file JSX này), thay cho
// REQUIRED_DOCS cũ (7 tên giấy tờ vật lý cứng, không khớp cột nào trên Trung Gian).
// Khung này VẪN tick/sửa tương tác ngay lập tức (không phải chỉ xem) — dùng action
// toggleAdmissionField thay cho toggleDocument cũ, giữ đúng hành vi optimistic update.
const CHECK_FIELDS = [
  'ẢNH THẺ',
  'BẢN SAO BẰNG THPT/GIẤY BÁO ĐIỂM',
  'BẢN SAO HỌC BẠ THPT',
  'BẢN SAO ID',
  'SƠ YẾU LÝ LỊCH',
];
const GIAY_TO_UU_TIEN_FIELD = 'GIẤY TỜ ƯU TIÊN';
const MASV_FIELD = 'MÃ SINH VIÊN';

// ĐÃ THÊM: danh sách khoản thu (khớp đúng LOAI_PHI trong AddStudentModal.jsx).
const LOAI_PHI = ['Đồng phục GDTC', 'Bảo hiểm y tế', 'Khám sức khỏe đầu khóa', 'Đoàn phí', 'Học phí', 'Khác'];

const DocumentList = ({ selectedStudent }) => {
  const queryClient = useQueryClient();
  const maSV = selectedStudent?.[MASV_FIELD];

  // ĐÃ THÊM: đọc lại dòng dữ liệu SỐNG từ cache ['admissions'] (cùng key StudentTable
  // đang dùng — React Query dùng lại cache có sẵn, KHÔNG gọi mạng thêm lần nào) thay vì
  // tin thẳng vào prop selectedStudent — vì selectedStudent là tham chiếu "đóng băng" tại
  // thời điểm bấm chọn dòng, không tự cập nhật khi toggleAdmissionField ghi đè cache optimistic.
  // Nếu không có nhờ vào cache (trường hợp hiếm) thì tạm dùng lại prop cho khỏi trắng màn hình.
  const { data: admissionsList } = useQuery({ queryKey: ['admissions'], queryFn: fetchAdmissions, enabled: !!maSV });
  const currentStudent = (admissionsList && admissionsList.find(sv => sv[MASV_FIELD] === maSV)) || selectedStudent;

  // ---- Khối giấy tờ (checklist) ----
  const [noteUT, setNoteUT] = useState('');
  const lastSavedNote = useRef(''); // Dùng để theo dõi xem ghi chú có THỰC SỰ thay đổi không

  useEffect(() => {
    const raw = String(currentStudent?.[GIAY_TO_UU_TIEN_FIELD] || '').trim();
    const note = raw && raw.toLowerCase() !== 'x' ? raw : '';
    setNoteUT(note);
    lastSavedNote.current = note;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maSV]);

  const toggleMutation = useMutation({
    mutationFn: toggleAdmissionField,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['admissions'] });
      const previous = queryClient.getQueryData(['admissions']);
      queryClient.setQueryData(['admissions'], (old) => {
        return old?.map(sv => sv[MASV_FIELD] === variables.maSV
          ? { ...sv, [variables.field]: variables.isChecked ? (variables.field === GIAY_TO_UU_TIEN_FIELD ? (variables.ghiChu || 'x') : 'x') : '' }
          : sv);
      });
      return { previous };
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['admissions'], context.previous);
      Swal.fire('Lỗi', err.message, 'error');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admissions'] });
    }
  });

  const handleCheckboxChange = (field, isChecked) => {
    toggleMutation.mutate({
      maSV,
      field,
      isChecked,
      ghiChu: field === GIAY_TO_UU_TIEN_FIELD ? noteUT : ''
    });
  };

  const handleNoteBlur = () => {
    const isChecked = !!String(currentStudent?.[GIAY_TO_UU_TIEN_FIELD] || '').trim();
    // Chỉ lưu khi đang được tick VÀ chữ trong ô thực sự có thay đổi
    if (isChecked && noteUT !== lastSavedNote.current) {
      toggleMutation.mutate({ maSV, field: GIAY_TO_UU_TIEN_FIELD, isChecked: true, ghiChu: noteUT });
      lastSavedNote.current = noteUT;
    }
  };

  // ---- Khối Nộp tiền ----
  const { data: payments = [], isLoading: isLoadingPayments } = useQuery({
    queryKey: ['payments', maSV],
    queryFn: () => fetchPayments(maSV),
    enabled: !!maSV,
  });

  const [amountDraft, setAmountDraft] = useState({}); // { [loaiPhi]: soTien } — nháp khi đang gõ
  useEffect(() => { setAmountDraft({}); }, [maSV]); // đổi sinh viên -> xoá nháp số tiền cũ

  const paymentMutation = useMutation({
    mutationFn: savePayment,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['payments', maSV] });
      const previous = queryClient.getQueryData(['payments', maSV]);
      queryClient.setQueryData(['payments', maSV], (old) => {
        const list = old || [];
        if (variables.isChecked) {
          const exists = list.some(p => p.loaiPhi === variables.loaiPhi);
          if (exists) return list.map(p => p.loaiPhi === variables.loaiPhi ? { ...p, soTien: variables.soTien } : p);
          return [...list, { loaiPhi: variables.loaiPhi, soTien: variables.soTien }];
        }
        return list.filter(p => p.loaiPhi !== variables.loaiPhi);
      });
      return { previous };
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['payments', maSV], context.previous);
      Swal.fire('Lỗi', err.message, 'error');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['payments', maSV] });
    }
  });

  const togglePhi = (loai, isChecked) => {
    const soTien = isChecked ? (amountDraft[loai] ?? payments.find(p => p.loaiPhi === loai)?.soTien ?? '') : '';
    paymentMutation.mutate({ maSV, loaiPhi: loai, soTien, isChecked });
  };

  const handleAmountBlur = (loai, soTien) => {
    const isChecked = payments.some(p => p.loaiPhi === loai);
    if (isChecked) paymentMutation.mutate({ maSV, loaiPhi: loai, soTien, isChecked: true });
  };

  if (!selectedStudent) {
    return (
      <div className="card h-100 border-0 shadow-sm">
        <div className="card-header bg-white"><h5 className="card-title mb-0">Hồ sơ trúng tuyển</h5></div>
        <div className="card-body d-flex align-items-center justify-content-center text-muted">
          Vui lòng chọn 1 sinh viên để thao tác hồ sơ.
        </div>
      </div>
    );
  }

  return (
    <div className="card h-100 position-relative border-0 shadow-sm">
      <div className="card-header bg-white d-flex justify-content-between align-items-center">
        <h6 className="card-title mb-0 fw-bold text-primary">Hồ sơ: {currentStudent['TÊN SINH VIÊN']}</h6>
      </div>

      <div className="card-body p-0 table-responsive">
        <table className="table table-hover align-middle mb-0 border-top">
          <tbody>
            {CHECK_FIELDS.map((field, index) => {
              const isChecked = !!String(currentStudent[field] || '').trim();

              return (
                <tr key={index}>
                  <td className="text-center px-3" style={{ width: '50px' }}>
                    <input
                      type="checkbox"
                      className="form-check-input fs-5"
                      style={{cursor: 'pointer'}}
                      checked={isChecked}
                      onChange={(e) => handleCheckboxChange(field, e.target.checked)}
                    />
                  </td>
                  <td className={isChecked ? 'fw-medium text-dark' : 'text-muted'}>{field.charAt(0) + field.slice(1).toLowerCase()}</td>
                </tr>
              );
            })}

            {(() => {
              const isChecked = !!String(currentStudent[GIAY_TO_UU_TIEN_FIELD] || '').trim();
              return (
                <React.Fragment>
                  <tr>
                    <td className="text-center px-3" style={{ width: '50px' }}>
                      <input
                        type="checkbox"
                        className="form-check-input fs-5"
                        style={{cursor: 'pointer'}}
                        checked={isChecked}
                        onChange={(e) => handleCheckboxChange(GIAY_TO_UU_TIEN_FIELD, e.target.checked)}
                      />
                    </td>
                    <td className={isChecked ? 'fw-medium text-dark' : 'text-muted'}>Giấy tờ ưu tiên</td>
                  </tr>
                  {isChecked && (
                    <tr className="bg-light">
                      <td></td>
                      <td className="pe-3 pb-3">
                        <input
                          type="text"
                          className="form-control form-control-sm border-primary"
                          placeholder="Nhập loại giấy tờ ưu tiên (VD: Sổ hộ nghèo...)"
                          value={noteUT}
                          onChange={(e) => setNoteUT(e.target.value)}
                          onBlur={handleNoteBlur}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })()}

            {/* KHỐI NỘP TIỀN — tick từng loại phí, tick cái nào hiện ô nhập số tiền cái đó. */}
            <tr>
              <td colSpan={2} className="bg-light border-top">
                <h6 className="text-muted mb-0 mt-2 px-1 fw-bold small text-uppercase">
                  Nộp tiền {isLoadingPayments && <span className="spinner-border spinner-border-sm ms-2" role="status"></span>}
                </h6>
              </td>
            </tr>
            {LOAI_PHI.map(loai => {
              const paid = payments.find(p => p.loaiPhi === loai);
              const isChecked = !!paid;
              return (
                <React.Fragment key={`${maSV}_${loai}`}>
                  <tr>
                    <td className="text-center px-3">
                      <input
                        type="checkbox"
                        className="form-check-input fs-5"
                        style={{cursor: 'pointer'}}
                        checked={isChecked}
                        onChange={(e) => togglePhi(loai, e.target.checked)}
                      />
                    </td>
                    <td className={isChecked ? 'fw-medium text-dark' : 'text-muted'}>{loai}</td>
                  </tr>
                  {isChecked && (
                    <tr className="bg-light">
                      <td></td>
                      <td className="pe-3 pb-3">
                        <input
                          type="number"
                          min="0"
                          className="form-control form-control-sm border-primary"
                          placeholder="Số tiền"
                          defaultValue={paid.soTien}
                          onChange={(e) => setAmountDraft(prev => ({ ...prev, [loai]: e.target.value }))}
                          onBlur={(e) => handleAmountBlur(loai, e.target.value)}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DocumentList;