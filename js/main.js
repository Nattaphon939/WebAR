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
  // 1) preload critical (marker + Computer + one more career)
  try {
    const criticalPromise = preloadCritical((info) => {
      // info: { pct, doneCount, totalCount, url, phase, startReady, done }
      try {
        const pct = info && info.pct ? info.pct : 0;
        bar.style.width = pct + '%';
        loadingText.textContent = `กำลังเตรียมทรัพยากร... ${pct}%`;
      } catch(e){}
      // if Computer ready in getAssets -> show start button immediately
      try {
        const assets = getAssets();
        if (!startShown && assets && assets.Computer && assets.Computer.modelBlobUrl && assets.Computer.videoBlobUrl) {
          showStartButton();
        } else if (!startShown && info && info.startReady) {
          // fallback: if startReady flagged by preloadCritical
          showStartButton();
        }
      } catch(e){}
    });

    // even if callback didn't show start, wait until the first bits are done (we also check assets)
    criticalPromise.then((assets) => {
      // ensure computer marked ready event for UI if necessary
      try {
        const a = getAssets();
        if (a && a.Computer && a.Computer.modelBlobUrl && a.Computer.videoBlobUrl) {
          showStartButton();
          // update text
          loadingText.textContent = 'คอนเท้นต์พร้อม ใช้ได้ — แตะเพื่อเริ่ม AR';
        }
      } catch(e){}
      // start background preloadRemaining (do not await here)
      preloadRemaining().catch(e=>console.warn('preloadRemaining err', e));
    }).catch(err => {
      console.warn('preloadCritical promise err', err);
      // still allow start button (best-effort)
      showStartButton();
      preloadRemaining().catch(e=>console.warn('preloadRemaining err', e));
    });

  } catch (e) {
    console.warn('preloadCritical sync err', e);
    // fallback: show start
    showStartButton();
    preloadRemaining().catch(e=>console.warn('preloadRemaining err', e));
  }

  // show start button when user clicks (we added display in showStartButton)
  startButton.addEventListener('click', async () => {
    // request only camera (no mic)
    try { await navigator.mediaDevices.getUserMedia({ video:true }); } catch(e){ console.warn('permission', e); }

    loadingScreen.style.display = 'none';
    container.style.display = 'block';
    if (scanFrame) scanFrame.style.display = 'flex';

    // init AR
    await initAndStart(container);

    // wire UI
    initUI();
  }, { once: true });
}

main().catch(e=>console.error(e));
