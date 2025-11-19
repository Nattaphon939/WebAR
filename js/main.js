// js/main.js
import { preloadCritical, preloadRemaining, initAndStart, getAssets } from './ar.js';
import { initUI } from './ui.js';

const bar = document.getElementById('bar');
const loadingText = document.getElementById('loading-text');
const startButton = document.getElementById('startButton');
const loadingScreen = document.getElementById('loading-screen');
const container = document.getElementById('container');
const scanFrame = document.getElementById('scan-frame');

let startShown = false;

function showStartButton() {
  if (startShown) return;
  startShown = true;
  startButton.style.display = 'inline-block';
  loadingText.textContent = 'พร้อมแล้ว — แตะเพื่อเริ่ม AR';
  bar.style.width = '100%';
}

async function main() {
  try {
    const criticalPromise = preloadCritical((info) => {
      try {
        const pct = info && info.pct ? info.pct : 0;
        bar.style.width = pct + '%';
        loadingText.textContent = `กำลังเตรียมทรัพยากร... ${pct}%`;
      } catch(e){}
      try {
        const assets = getAssets();
        if (!startShown && assets && assets.Computer && assets.Computer.modelBlobUrl && assets.Computer.videoBlobUrl) {
          showStartButton();
        } else if (!startShown && info && info.startReady) {
          showStartButton();
        }
      } catch(e){}
    });

    criticalPromise.then(() => {
      try {
        const a = getAssets();
        if (a && a.Computer && a.Computer.modelBlobUrl && a.Computer.videoBlobUrl) {
          showStartButton();
          loadingText.textContent = 'คอนเท้นต์ Computer พร้อม — แตะเพื่อเริ่ม';
        }
      } catch(e){}
      // start background preloading (silent)
      preloadRemaining().catch(()=>{ /* ignore */ });
    }).catch(() => {
      showStartButton();
      preloadRemaining().catch(()=>{});
    });

  } catch (e) {
    showStartButton();
    preloadRemaining().catch(()=>{});
  }

  startButton.addEventListener('click', async () => {
    startButton.disabled = true;
    try {
      // ขอเฉพาะกล้อง (video) — ถ้ากล้องถูกใช้งาน จะจับข้อผิดพลาดแล้วให้ผู้ใช้แก้ไข
      await navigator.mediaDevices.getUserMedia({ video:true });
    } catch(e) {
      console.warn('permission', e);
      // user-friendly handling for device busy (NotReadableError / TrackStartError)
      if (e && (e.name === 'NotReadableError' || e.name === 'TrackStartError' || e.name === 'NotAllowedError')) {
        alert('ไม่สามารถเข้าถึงกล้องได้ (อาจถูกใช้งานโดยแอปอื่น หรือถูกบล็อก)\nโปรดปิดแอปอื่นที่ใช้กล้องแล้วลองอีกครั้ง');
        startButton.disabled = false;
        startButton.style.display = 'inline-block';
        return;
      }
      // ถ้าข้อผิดพลาดอื่น ๆ ให้พยายามต่อ (best-effort)
    }

    loadingScreen.style.display = 'none';
    container.style.display = 'block';
    if (scanFrame) scanFrame.style.display = 'flex';

    try {
      await initAndStart(container);
      initUI();
    } catch (e) {
      console.error('initAndStart failed', e);
      alert('ไม่สามารถเริ่ม AR ได้ โปรดตรวจสอบสิทธิ์กล้อง/เชื่อมต่อแล้วลองอีกครั้ง');
      // คืนปุ่มเริ่มให้ผู้ใช้ลองใหม่
      loadingScreen.style.display = 'block';
      container.style.display = 'none';
      startButton.disabled = false;
      startButton.style.display = 'inline-block';
    }
  }, { once: true });
}

main().catch(e=>console.error(e));
