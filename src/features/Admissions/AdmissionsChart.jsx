import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const AdmissionsChart = ({ students }) => {
  // 1. CHUẨN BỊ DATA CHO BIỂU ĐỒ TRÒN (Tỉ lệ nhập học)
  const statusData = useMemo(() => {
    if (!students || students.length === 0) return [];
    let daNhap = 0;
    let chuaNhap = 0;
    
    students.forEach(sv => {
      if (String(sv['TRẠNG THÁI THẨM ĐỊNH'] || '').trim() === 'Đã trúng tuyển') {
        daNhap++;
      } else {
        chuaNhap++;
      }
    });

    return [
      { name: 'Đã xác nhận', value: daNhap, color: '#198754' }, // Xanh lá
      { name: 'Chưa xác nhận', value: chuaNhap, color: '#dee2e6' } // Xám nhạt
    ];
  }, [students]);

  // 2. CHUẨN BỊ DATA CHO BIỂU ĐỒ CỘT (Top Ngành học)
  const majorData = useMemo(() => {
    if (!students || students.length === 0) return [];
    const counts = {};
    
    students.forEach(sv => {
      const nganh = sv['NGÀNH'] || 'Chưa phân ngành';
      counts[nganh] = (counts[nganh] || 0) + 1;
    });

    // Gom thành mảng, sắp xếp giảm dần và chỉ lấy Top 4 ngành đông nhất cho đỡ chật
    return Object.keys(counts)
      .map(key => ({ name: key, total: counts[key] }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 4);
  }, [students]);

  return (
    <div className="row w-100 h-100 m-0 align-items-center">
      {/* KHU VỰC BIỂU ĐỒ TRÒN */}
      <div className="col-4 h-100 p-0 border-end position-relative">
        <ResponsiveContainer width="100%" height={100}>
          <PieChart>
            <Pie data={statusData} innerRadius="60%" outerRadius="90%" paddingAngle={2} dataKey="value" stroke="none">
              {statusData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
        {/* Nhãn nhỏ ở giữa biểu đồ tròn */}
        <div className="position-absolute top-50 start-50 translate-middle text-center" style={{ pointerEvents: 'none' }}>
          <span className="d-block fw-bold fs-6 text-success">{statusData[0]?.value || 0}</span>
        </div>
      </div>
      
      {/* KHU VỰC BIỂU ĐỒ CỘT */}
      <div className="col-8 h-100 p-0 ps-3">
        <ResponsiveContainer width="100%" height={100}>
          <BarChart data={majorData} layout="vertical" margin={{ top: 0, right: 15, left: -20, bottom: 0 }}>
            <XAxis type="number" hide />
            <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 10, fill: '#6c757d' }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{fill: '#f8f9fa'}} contentStyle={{fontSize: '12px', padding: '5px'}}/>
            <Bar dataKey="total" fill="#0dcaf0" radius={[0, 4, 4, 0]} barSize={12} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default AdmissionsChart;