// /WEB/js/main.js
// Final Robust Version: Explicit Camera Check & Detailed Error Reporting

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

  const timeoutMs = 8000;
  const preloadPromise = preloadAll((pct) => { setMainProgress(pct); });
  const timeoutPromise = new Promise(resolve => setTimeout(() => resolve({ timedOut: true }), timeoutMs));
  
  const res = await Promise.race([preloadPromise, timeoutPromise]).catch(e => { return { error: e }; });

  if (res && res.timedOut) {
    if (lastMainPct < 30) setMainProgress(30);
    loadingText.textContent = 'เครือข่ายล่าช้า กรุณารอสักครู่';
    try { preloadRemaining().catch(e=>console.warn(e)); } catch(e){}
  }

  // --- Logic ปุ่ม Start (แก้ใหม่) ---
  if (!startButton) return;
  startButton.addEventListener('click', async () => {
    
    // 1. 🔥 ขอกล้องแบบชัดเจน (Explicit Check) 🔥
    // เพื่อให้ Browser เด้งถาม Permission ทันทีที่กดปุ่ม
    // และเพื่อเช็คว่า User บล็อกกล้องไว้หรือไม่
    try {
        loadingText.textContent = 'กำลังขออนุญาตใช้กล้อง...';
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' } 
        });
        
        // ถ้าผ่าน = อนุญาตแล้ว -> ปิด Stream ทิ้งทันที (เพื่อไม่ให้ชนกับ AR Engine)
        stream.getTracks().forEach(track => track.stop());
        
    } catch(e) {
        // ถ้า Error ตรงนี้ แปลว่า User บล็อกกล้อง หรือ เครื่องไม่มีกล้อง
        console.warn('Camera permission failed', e);
        alert(`❌ ไม่สามารถเปิดกล้องได้: ${e.name}\n(กรุณากดที่รูปกุญแจ 🔒 บนช่องใส่เว็บ เพื่ออนุญาตกล้อง)`);
        loadingText.textContent = 'กรุณาอนุญาตกล้องแล้วกดรีเฟรช';
        return; // จบการทำงาน ไม่ไปต่อ
    }

    // 2. ถ้าผ่านด่านแรกมาได้ -> เริ่มระบบ AR
    loadingScreen.style.display = 'none';
    container.style.display = 'block';
    if (scanFrame) scanFrame.style.display = 'flex';

    try {
      await AR.initAndStart(container);
      initUI(); 
    } catch(e) { 
      console.error('initAndStart err', e);
      
      // แจ้ง Error แบบละเอียด (จะได้รู้ว่าไฟล์ไหนหาย หรือโค้ดพังตรงไหน)
      alert(`⚠️ ระบบ AR เริ่มต้นไม่สำเร็จ: ${e.message}\n(อาจเกิดจากไฟล์ Marker หรือ Model โหลดไม่ได้)`);
      
      // กู้คืนหน้าจอโหลด
      loadingScreen.style.display = 'flex';
      container.style.display = 'none';
      loadingText.textContent = 'เกิดข้อผิดพลาด กรุณารีเฟรช';
    }
  }, { once: true });
}

main().catch(e => console.error(e));