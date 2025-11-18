// js/main.js
import { preloadAll, initAndStart, getAssets } from './ar.js';
import { initUI } from './ui.js';

const bar = document.getElementById('bar');
const loadingText = document.getElementById('loading-text');
const startButton = document.getElementById('startButton');
const loadingScreen = document.getElementById('loading-screen');
const container = document.getElementById('container');
const scanFrame = document.getElementById('scan-frame');

let startShown = false;

async function main() {
  // start hidden
  startButton.style.display = 'none';
  loadingText.textContent = 'เริ่มดาวน์โหลดทรัพยากร... 0%';
  bar.style.width = '0%';

  // call preloadAll with progress callback
  // preloadAll will return when all assets loaded, but will call onProgress frequently
  const preloadPromise = preloadAll((state) => {
    // state: { pct, bytesLoaded, estimatedTotal, url, phase, startReady, done }
    const pct = state && state.pct ? state.pct : 0;
    bar.style.width = pct + '%';
    if (state && state.phase) {
      loadingText.textContent = `${state.phase} — กำลังโหลด ${pct}%`;
    } else {
      loadingText.textContent = `กำลังโหลดทรัพยากร... ${pct}%`;
    }

    // show start button early when ~50% reached
    if (!startShown && state && state.startReady) {
      startShown = true;
      startButton.style.display = 'inline-block';
      loadingText.textContent = `พร้อมเริ่ม (ยังโหลดเบื้องหลัง ${pct}%)`;
    }

    // final done
    if (state && state.done) {
      bar.style.width = '100%';
      loadingText.textContent = 'โหลดทรัพยากรครบแล้ว';
      if (!startShown) {
        startShown = true;
        startButton.style.display = 'inline-block';
      }
    }
  });

  // wait full preload to finish (assets available)
  try {
    await preloadPromise;
  } catch (e) {
    console.warn('preloadAll failed', e);
    // still allow start so user can try
    startButton.style.display = 'inline-block';
    loadingText.textContent = 'โหลดบางส่วนไม่สำเร็จ — คุณสามารถเริ่มได้';
  }

  // add click handler (only once)
  startButton.addEventListener('click', async () => {
    try {
      await navigator.mediaDevices.getUserMedia({video:true});
    } catch(e){ console.warn('permission',e); }

    loadingScreen.style.display = 'none';
    container.style.display = 'block';
    if (scanFrame) scanFrame.style.display = 'flex';

    // initialize AR (uses assets populated in ar.js)
    await initAndStart(container);

    // wire UI
    initUI();
  }, { once: true });
}

main().catch(e=>console.error(e));
