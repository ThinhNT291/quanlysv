import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GoogleOAuthProvider } from '@react-oauth/google'; // Import Google Auth
import App from './App.jsx';

// ĐÃ SỬA (phát hiện khi test Ký điện tử Pha 2 — Bước 3, ký song song): mặc định gốc của
// React Query (không truyền defaultOptions gì) là staleTime=0 + refetchOnWindowFocus=true
// + retry=3. Nghĩa là MỖI LẦN chuyển tab/focus lại cửa sổ, MỌI query đang mount trên trang
// đều bắn lại request ngay lập tức (kể cả dữ liệu vừa tải xong 1 giây trước) — cộng thêm
// query nào lỡ timeout/lỗi sẽ tự thử lại tới 3 lần nữa. Google Apps Script Web App vốn đã
// chậm hơn API bình thường nhiều (mỗi request đi qua 1 vòng redirect script.google.com ->
// script.googleusercontent.com, vài giây là chuyện thường, có lúc GAS tự xếp hàng nếu
// script đang bận xử lý request khác) — bấm F5 + đổi qua đổi lại tab liên tục trong lúc
// các request cũ CHƯA XONG sẽ khiến request chồng lên nhau ngày càng nhiều, tới lúc GAS/
// trình duyệt begin từ chối bớt (hiện tượng "Blocked"/"CORS Failed" thấy trong Network tab
// — không phải lỗi logic ký song song, mà là hệ quả của việc dồn quá nhiều request cùng
// lúc vào 1 Web App vốn xử lý khá chậm). Giảm nhẹ 3 mặc định này áp dụng CHUNG cho CẢ APP
// (không chỉ trang Ký điện tử) để tránh lặp lại kiểu sự cố này ở bất kỳ trang nào khác.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30s — dữ liệu vừa tải trong 30s gần nhất không tự refetch lại khi mount/focus lại
      refetchOnWindowFocus: false, // KHÔNG tự bắn lại request mỗi lần đổi tab/focus cửa sổ — nguyên nhân chính của sự cố dồn request
      retry: 1, // hết hạn/lỗi thì thử lại ĐÚNG 1 lần (thay vì 3 lần mặc định), đỡ chồng thêm request khi GAS đang chậm sẵn
    },
  },
});
// THAY BẰNG CLIENT ID THẬT CỦA ÔNG VÀO ĐÂY NHÉ
const GOOGLE_CLIENT_ID = "311965248456-01ts8h9g6tuj0slob58n8vrfm091c4u7.apps.googleusercontent.com"; 

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </GoogleOAuthProvider>
  </React.StrictMode>,
);