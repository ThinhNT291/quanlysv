import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchDocuments, toggleDocument } from '../../api/studentApi';
import Swal from 'sweetalert2';

const REQUIRED_DOCS = [
  "Phiếu đăng ký dự tuyển",
  "Sơ yếu lý lịch",
  "CCCD (bản sao)",
  "Ảnh thẻ",
  "Giấy tờ ưu tiên"
];

const DocumentList = ({ selectedStudent }) => {
  const queryClient = useQueryClient();

  const { data: submittedDocs = [], isLoading } = useQuery({
    queryKey: ['documents', selectedStudent?.MaSV],
    queryFn: () => fetchDocuments(selectedStudent.MaSV),
    enabled: !!selectedStudent,
  });

  const [noteUT, setNoteUT] = useState('');
  const lastSavedNote = useRef(''); // Dùng để theo dõi xem ghi chú có THỰC SỰ thay đổi không

  useEffect(() => {
    const docUT = submittedDocs.find(d => d.tenGiayTo === 'Giấy tờ ưu tiên');
    const currentNote = docUT ? docUT.ghiChu : '';
    setNoteUT(currentNote);
    lastSavedNote.current = currentNote;
  }, [submittedDocs, selectedStudent]);

  const toggleMutation = useMutation({
    mutationFn: toggleDocument,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['documents', selectedStudent.MaSV] });
      const previousDocs = queryClient.getQueryData(['documents', selectedStudent.MaSV]);

      queryClient.setQueryData(['documents', selectedStudent.MaSV], (old) => {
        const oldDocs = old || [];
        if (variables.isChecked) {
          const exists = oldDocs.some(d => d.tenGiayTo === variables.tenGiayTo);
          if (exists) {
            return oldDocs.map(d => d.tenGiayTo === variables.tenGiayTo ? { ...d, ghiChu: variables.ghiChu } : d);
          } else {
            return [...oldDocs, { tenGiayTo: variables.tenGiayTo, ghiChu: variables.ghiChu }];
          }
        } else {
          return oldDocs.filter(d => d.tenGiayTo !== variables.tenGiayTo);
        }
      });
      return { previousDocs };
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['documents', selectedStudent.MaSV], context.previousDocs);
      Swal.fire('Lỗi', err.message, 'error');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', selectedStudent.MaSV] });
    }
  });

  const handleCheckboxChange = (tenGiayTo, isChecked) => {
    toggleMutation.mutate({
      maSV: selectedStudent.MaSV,
      tenGiayTo: tenGiayTo,
      isChecked: isChecked,
      ghiChu: tenGiayTo === 'Giấy tờ ưu tiên' ? noteUT : ''
    });
  };

  const handleNoteBlur = () => {
    const isChecked = submittedDocs.some(d => d.tenGiayTo === 'Giấy tờ ưu tiên');
    // FIX BUG: Chỉ lưu khi đang được tick VÀ chữ trong ô thực sự có thay đổi
    if (isChecked && noteUT !== lastSavedNote.current) {
      toggleMutation.mutate({
        maSV: selectedStudent.MaSV,
        tenGiayTo: 'Giấy tờ ưu tiên',
        isChecked: true,
        ghiChu: noteUT
      });
      lastSavedNote.current = noteUT;
    }
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
        <h6 className="card-title mb-0 fw-bold text-primary">Hồ sơ: {selectedStudent.HoTen}</h6>
      </div>
      
      <div className="card-body p-0 table-responsive">
        {isLoading && (
          <div className="position-absolute w-100 h-100 d-flex justify-content-center align-items-center" style={{backgroundColor: 'rgba(255,255,255,0.7)', zIndex: 10}}>
             <div className="spinner-border text-primary" role="status"></div>
          </div>
        )}

        <table className="table table-hover align-middle mb-0 border-top">
          <tbody>
            {REQUIRED_DOCS.map((docName, index) => {
              const isChecked = submittedDocs.some(d => d.tenGiayTo === docName);

              return (
                <React.Fragment key={index}>
                  <tr>
                    <td className="text-center px-3" style={{ width: '50px' }}>
                      <input 
                        type="checkbox" 
                        className="form-check-input fs-5" 
                        style={{cursor: 'pointer'}}
                        checked={isChecked} 
                        onChange={(e) => handleCheckboxChange(docName, e.target.checked)}
                      />
                    </td>
                    <td className={isChecked ? 'fw-medium text-dark' : 'text-muted'}>{docName}</td>
                  </tr>
                  
                  {docName === 'Giấy tờ ưu tiên' && isChecked && (
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
                          autoFocus
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DocumentList;