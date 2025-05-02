import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import "swiper/swiper-bundle.css";
import "simplebar-react/dist/simplebar.min.css";
import App from './App.tsx';
import { AppWrapper } from "./components/common/PageMeta.tsx";
import { ThemeProvider } from "./context/ThemeContext.tsx";
import { initMessaging } from './firebase/firebase';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/firebase-messaging-sw.js');
}

initMessaging();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AppWrapper>
        <App />
      </AppWrapper>
    </ThemeProvider>
  </StrictMode>,
)
