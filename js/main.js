// /WEB/js/main.js
console.debug('main.js loaded');
import { preloadAll, preloadRemaining } from './loader.js';
import { initUI } from './ui.js';
import * as AR from './ar.js'; //

const bar = document.getElementById('bar');
const loadingText = document.getElementById('loading-text');
const startButton = document.getElementById('startButton');
const loadingScreen = document.getElementById('loading-screen');
const container = document.getElementById('container');
const scanFrame = document.getElementById('scan-frame');

let lastMainPct = 0;
function setMainProgress(pct) {
  const n = Math.max(lastMainPct || 0, Math.round(pct || 0));
  lastMainPct = n;
  if (bar) bar.style.width = n + '%';
  if (loadingText) loadingText.textContent = `กำลังโหลดทรัพยากร... ${n}%`;
}

async function main(){
  setMainProgress(0);
  
  // เตรียม UI (แต่ยังไม่แสดงผล)
  try { initUI(); } catch(e) { console.warn('initUI early failed', e); }

  // 1. บังคับซ่อนปุ่ม Start ไว้ก่อนเสมอ
  if (startButton) {
    startButton.style.display = 'none';
    startButton.disabled = true;
  }

  // Listener: อัปเดต Progress Bar
  document.addEventListener('career-load-progress', (ev) => {
    try {
      const d = ev.detail || {};
      if (d.career === 'Computer') {
        const pct = d.pct || 0;
        setMainProgress(pct);
        if (pct >= 95) loadingText.textContent = 'เตรียมคอนเท้นด้าน AR เสร็จแล้ว';
      }
    } catch(e){}
  });

  // Listener: เมื่อ Computer พร้อม -> แสดงปุ่ม Start
  document.addEventListener('career-ready', (ev) => {
    try {
      const d = ev.detail || {};
      console.debug('main: career-ready', d);
      if (d.career === 'Computer') {
        if (startButton) {
          startButton.style.display = 'inline-block'; // โชว์ปุ่ม
          startButton.disabled = false;
          startButton.textContent = 'แตะเพื่อเริ่ม AR';
          
          setMainProgress(100);
          loadingText.textContent = 'พร้อมเริ่มต้น — แตะเพื่อเริ่ม';
        }
        try { preloadRemaining().catch(e=>console.warn(e)); } catch(e){}
      }
    } catch(e){}
  });

  // เริ่มกระบวนการ Preload
  console.debug('main: calling preloadAll');
  const timeoutMs = 8000; // 8 วินาที
  
  const preloadPromise = preloadAll((pct) => {
    setMainProgress(pct);
  });
  
  const timeoutPromise = new Promise(resolve => setTimeout(() => resolve({ timedOut: true }), timeoutMs));
  
  const res = await Promise.race([preloadPromise, timeoutPromise]).catch(e => { 
    console.error('preloadAll rejected', e); 
    return { error: e }; 
  });

  if (res && res.timedOut) {
    console.warn('preloadAll timed out');
    if (lastMainPct < 30) setMainProgress(30);
    loadingText.textContent = 'เครือข่ายล่าช้า กรุณารอสักครู่';
    try { preloadRemaining().catch(e=>console.warn(e)); } catch(e){}
  }

  // Logic เมื่อกดปุ่ม Start
  if (!startButton) return;
  startButton.addEventListener('click', async () => {
    // 🔥🔥 ลบส่วน getUserMedia ที่ซ้ำซ้อนออก 🔥🔥
    // ปล่อยให้ AR.initAndStart() เป็นคนขอกล้องเอง เพื่อลดความขัดแย้งบน Android
    
    // ซ่อนหน้าโหลด เปิดหน้า AR
    loadingScreen.style.display = 'none';
    container.style.display = 'block';
    if (scanFrame) scanFrame.style.display = 'flex';

    // เริ่มระบบ AR
    try {
      await AR.initAndStart(container);
      initUI(); // Re-init UI เพื่อความชัวร์
    } catch(e){ 
      console.error('initAndStart err', e); 
      // แจ้งเตือนถ้ามีปัญหา (เช่น ไม่ได้ใช้ HTTPS)
      alert('ไม่สามารถเริ่ม AR ได้ (กรุณาตรวจสอบว่าเปิดผ่าน HTTPS หรือยัง)');
      
      // ถ้า Error ให้แสดงหน้าโหลดกลับมา
      loadingScreen.style.display = 'flex';
      container.style.display = 'none';
    }
  }, { once: true });
}

main().catch(e => console.error(e));