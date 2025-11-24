// js/loader.js
import { preloadAll, initAndStart } from './ar.js';

const BAR_ID = 'bar';
const LOADING_TEXT_ID = 'loading-text';
const START_BUTTON_ID = 'startButton';
const LOADING_SCREEN_ID = 'loading-screen';
const CONTAINER_ID = 'container';
const SCAN_FRAME_ID = 'scan-frame';

let started = false;

function $id(id) { return document.getElementById(id); }

function connectUiProgress() {
  const bar = $id(BAR_ID);
  const txt = $id(LOADING_TEXT_ID);
  return (pct) => {
    try {
      const n = Math.max(0, Math.min(100, Math.round(pct)));
      if (bar) bar.style.width = n + '%';
      if (txt) txt.textContent = `กำลังโหลดทรัพยากร... ${n}%`;
    } catch(e){}
  };
}

export async function initLoader() {
  if (started) return;
  started = true;

  const barUpdater = connectUiProgress();
  try {
    // preloadAll ของ ar.js จะเรียก callback ด้วย pct 0..100
    await preloadAll((pct) => {
      // ปรับการแสดงผลแบบ monotonic โดย preloadAll ของคุณควรให้ pct ไม่ย้อน
      barUpdater(pct);
    });
  } catch (e) {
    console.warn('preloadAll failed (ignored):', e);
    // หาก preloadAll ล้มเหลว เราก็ยังพยายามให้ผู้ใช้เริ่มได้ (บาง asset อาจ missing)
  }

  // finalize UI
  try {
    const bar = $id(BAR_ID);
    const txt = $id(LOADING_TEXT_ID);
    if (bar) bar.style.width = '100%';
    if (txt) txt.textContent = 'โหลดเสร็จแล้ว';
  } catch(e){}

  // show start button
  const startBtn = $id(START_BUTTON_ID);
  if (startBtn) {
    startBtn.style.display = 'inline-block';
    // attach click once
    startBtn.addEventListener('click', async () => {
      // request only camera (ตามความต้องการของคุณ)
      try { await navigator.mediaDevices.getUserMedia({ video: true }); } catch(e){ console.warn('camera permission denied/ignored', e); }

      // hide loading screen, show container and scanframe
      const loadingScreen = $id(LOADING_SCREEN_ID);
      const container = $id(CONTAINER_ID);
      const scanFrame = $id(SCAN_FRAME_ID);
      if (loadingScreen) loadingScreen.style.display = 'none';
      if (container) container.style.display = 'block';
      if (scanFrame) scanFrame.style.display = 'flex';

      // start AR
      try {
        if (container) {
          await initAndStart(container);
        } else {
          console.warn('container element not found for AR start');
        }
      } catch (e) {
        console.error('initAndStart failed', e);
        alert('เริ่ม AR ไม่ได้ — ดู console เพื่อเช็คข้อผิดพลาด');
      }
    }, { once: true });
  }
}
