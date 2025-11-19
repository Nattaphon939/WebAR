// js/main.js
import { preloadCritical, preloadRemaining, initAndStart, getAssets, ensureCareerLoaded } from './ar.js';
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

/** Helper: ตรวจว่า Computer + อีก 1 career อย่างน้อยพร้อมทั้ง model+video */
function canShowStartBasedOnAssets(assets) {
  if (!assets || !assets.Computer) return false;
  if (!assets.Computer.modelBlobUrl || !assets.Computer.videoBlobUrl) return false;
  for (const k of Object.keys(assets)) {
    if (k === 'Computer' || k === 'gameAssets') continue;
    const a = assets[k];
    if (a && a.modelBlobUrl && a.videoBlobUrl) return true;
  }
  return false;
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
        // แสดงปุ่มเฉพาะเมื่อ Computer+another career พร้อม
        if (!startShown && canShowStartBasedOnAssets(assets)) {
          showStartButton();
        } else if (!startShown && assets && assets.Computer && assets.Computer.modelBlobUrl && assets.Computer.videoBlobUrl && info && info.startReady) {
          // fallback: ถ้า info.startReady มาเป็นสัญญาณก็ยังพิจารณา (แต่แรกพยายามให้ต้องมีอีก career ด้วย)
          showStartButton();
        }
      } catch(e){}
    });

    criticalPromise.then(() => {
      try {
        const a = getAssets();
        if (canShowStartBasedOnAssets(a)) {
          showStartButton();
          loadingText.textContent = 'คอนเท้นต์พร้อม — แตะเพื่อเริ่ม';
        } else if (a && a.Computer && a.Computer.modelBlobUrl && a.Computer.videoBlobUrl) {
          // ถ้า Computer เต็มแต่ยังไม่มีอื่น ๆ แสดงข้อความเตรียม พร้อมแต่ไม่บังคับ
          showStartButton();
          loadingText.textContent = 'คอนเท้นต์ Computer พร้อม — กำลังเตรียมคอนเท้นต์อื่นๆ';
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
      // ขอเฉพาะกล้อง (video)
      await navigator.mediaDevices.getUserMedia({ video:true });
    } catch(e) {
      console.warn('permission', e);
      if (e && (e.name === 'NotReadableError' || e.name === 'TrackStartError' || e.name === 'NotAllowedError')) {
        alert('ไม่สามารถเข้าถึงกล้องได้ (อาจถูกใช้งานโดยแอปอื่น หรือถูกบล็อก)\nโปรดปิดแอปอื่นที่ใช้กล้องแล้วลองอีกครั้ง');
        startButton.disabled = false;
        startButton.style.display = 'inline-block';
        return;
      }
    }

    // *** เพิ่มการรับประกัน: ถ้า Computer ยังไม่ดาวน์โหลดครบ (model+video) ให้รอโหลดให้ครบก่อน ***
    try {
      await ensureCareerLoaded('Computer', (pct) => {
        // อัปเดต progress บางส่วนบน loading UI (ถ้าต้องการ)
        try { bar.style.width = pct + '%'; loadingText.textContent = `กำลังเตรียมคอนเท้นต์ Computer... ${pct}%`; } catch(e){}
      });
    } catch(e){
      console.warn('ensureCareerLoaded fallback failed', e);
      // best-effort — ถ้า fail ก็จะพยายามเริ่ม (เดิม)
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
      loadingScreen.style.display = 'block';
      container.style.display = 'none';
      startButton.disabled = false;
      startButton.style.display = 'inline-block';
    }
  }, { once: true });
}

main().catch(e=>console.error(e));
