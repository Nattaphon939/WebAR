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
let criticalLoaded = false;

async function main() {
  startButton.style.display = 'none';
  loadingText.textContent = 'เตรียมทรัพยากรสำคัญ... 0%';
  bar.style.width = '0%';

  // preload critical assets only (marker + Computer + 1 career)
  preloadCritical((state) => {
    const pct = state && state.pct ? state.pct : 0;
    bar.style.width = pct + '%';
    if (state && state.phase) {
      loadingText.textContent = `${state.phase} — ${pct}%`;
    } else {
      loadingText.textContent = `เตรียมทรัพยากร... ${pct}%`;
    }

    // show start when critical at 100% (or when startReady flagged)
    if (!startShown && state && state.startReady) {
      startShown = true;
      // if pct < 100 but startReady true (we flagged at >=50%), prefer show only when done or you can show earlier
      // here show only when pct >= 100 to be safe for playing computer (per your request)
      if (state.pct >= 100) {
        criticalLoaded = true;
        startButton.style.display = 'inline-block';
        loadingText.textContent = 'พร้อมเริ่ม — แตะเพื่อเริ่ม AR';
        bar.style.width = '100%';
      }
    }

    if (state && state.done) {
      criticalLoaded = true;
      startButton.style.display = 'inline-block';
      loadingText.textContent = 'พร้อมเริ่ม — แตะเพื่อเริ่ม AR';
      bar.style.width = '100%';
    }
  }).catch(e => {
    console.warn('preloadCritical failed', e);
    // allow start anyway
    startButton.style.display = 'inline-block';
    loadingText.textContent = 'เตรียมทรัพยากรสำคัญ: เกิดข้อผิดพลาด — คุณยังคงสามารถเริ่มได้';
  });

  // startButton click
  startButton.addEventListener('click', async () => {
    // request video only
    try { await navigator.mediaDevices.getUserMedia({ video: true }); } catch(e) { console.warn('permission', e); }

    // hide loading UI and show container
    loadingScreen.style.display = 'none';
    container.style.display = 'block';
    if (scanFrame) scanFrame.style.display = 'flex';

    // init AR (uses assets populated by preloadCritical)
    await initAndStart(container);

    // wire UI handlers
    initUI();

    // silently start background preload of remaining assets
    try { preloadRemaining().then(()=>{ console.log('background preload remaining finished'); }); } catch(e){ console.warn('preloadRemaining err', e); }
  }, { once: true });
}

main().catch(e=>console.error(e));
