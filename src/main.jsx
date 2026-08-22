import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GoogleOAuthProvider } from '@react-oauth/google'; // Import Google Auth
import App from './App.jsx';

const queryClient = new QueryClient();
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