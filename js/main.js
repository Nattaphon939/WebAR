// /WEB/js/main.js
// Final: Robust + Mobile Timeout Friendly

console.debug('main.js loaded');
import { preloadAll, preloadRemaining } from './loader.js';
import { initUI } from './ui.js';
import * as AR from './ar.js';

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
  try { initUI(); } catch(e) { console.warn('initUI early failed', e); }

  if (startButton) {
    startButton.style.display = 'none';
    startButton.disabled = true;
  }

  document.addEventListener('career-load-progress', (ev) => {
    try {
      const d = ev.detail || {};
      if (d.career === 'Computer') {
        setMainProgress(d.pct || 0);
        if ((d.pct || 0) >= 95) loadingText.textContent = 'เตรียมคอนเท้นด้าน AR เสร็จแล้ว';
      }
    } catch(e){}
  });

  document.addEventListener('career-ready', (ev) => {
    try {
      const d = ev.detail || {};
      if (d.career === 'Computer') {
        if (startButton) {
          startButton.style.display = 'inline-block';
          startButton.disabled = false;
          startButton.textContent = 'แตะเพื่อเริ่ม AR';
          setMainProgress(100);
          loadingText.textContent = 'พร้อมเริ่มต้น — แตะเพื่อเริ่ม';
        }
        try { preloadRemaining().catch(e=>console.warn(e)); } catch(e){}
      }
    } catch(e){}
  });

  // 🔥🔥 เพิ่มเวลา Timeout เป็น 25 วินาที (สำหรับเน็ตมือถือ) 🔥🔥
  const timeoutMs = 25000; 
  
  const preloadPromise = preloadAll((pct) => { setMainProgress(pct); });
  const timeoutPromise = new Promise(resolve => setTimeout(() => resolve({ timedOut: true }), timeoutMs));
  
  const res = await Promise.race([preloadPromise, timeoutPromise]).catch(e => { return { error: e }; });

  if (res && res.timedOut) {
    if (lastMainPct < 30) setMainProgress(30);
    // เปลี่ยนข้อความให้อุ่นใจขึ้น
    loadingText.textContent = 'กำลังดาวน์โหลดไฟล์ขนาดใหญ่... กรุณารอสักครู่';
    try { preloadRemaining().catch(e=>console.warn(e)); } catch(e){}
  }

  // --- Logic ปุ่ม Start ---
  if (!startButton) return;
  startButton.addEventListener('click', async () => {
    try {
        loadingText.textContent = 'กำลังขออนุญาตใช้กล้อง...';
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' } 
        });
        stream.getTracks().forEach(track => track.stop());
    } catch(e) {
        console.warn('Camera permission failed', e);
        alert(`❌ ไม่สามารถเปิดกล้องได้: ${e.name}\n(กรุณากดที่รูปกุญแจ 🔒 เพื่ออนุญาตกล้อง)`);
        loadingText.textContent = 'กรุณาอนุญาตกล้องแล้วกดรีเฟรช';
        return; 
    }

    loadingScreen.style.display = 'none';
    container.style.display = 'block';
    if (scanFrame) scanFrame.style.display = 'flex';

    try {
      await AR.initAndStart(container);
      initUI(); 
    } catch(e) { 
      console.error('initAndStart err', e);
      alert(`⚠️ ระบบ AR เริ่มต้นไม่สำเร็จ: ${e.message}`);
      loadingScreen.style.display = 'flex';
      container.style.display = 'none';
      loadingText.textContent = 'เกิดข้อผิดพลาด กรุณารีเฟรช';
    }
  }, { once: true });
}

main().catch(e => console.error(e));