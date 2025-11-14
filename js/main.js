// js/main.js
import { preloadAll, initAndStart, getAssets } from './ar.js';
import { initUI } from './ui.js';

const bar = document.getElementById('bar');
const loadingText = document.getElementById('loading-text');
const versionLabel = document.getElementById('version');
const startButton = document.getElementById('startButton');
const loadingScreen = document.getElementById('loading-screen');
const container = document.getElementById('container');
const scanFrame = document.getElementById('scan-frame');

const VERSION = 'v1.0.1';

async function main() {
  // show version on loading screen
  if (versionLabel) versionLabel.textContent = VERSION;

  // 1) preload assets (progress update)
  await preloadAll((pct)=> {
    if (bar) bar.style.width = pct + '%';
    if (loadingText) loadingText.textContent = `กำลังโหลดทรัพยากร... ${pct}%`;
  });
  if (bar) bar.style.width = '100%';
  if (loadingText) loadingText.textContent = 'โหลดเสร็จแล้ว';

  // 2) show start button
  if (startButton) {
    startButton.style.display = 'inline-block';
    startButton.addEventListener('click', async () => {
      // request camera ONLY (remove microphone)
      try { await navigator.mediaDevices.getUserMedia({ video: true }); } catch(e){ console.warn('permission',e); }

      if (loadingScreen) loadingScreen.style.display = 'none';
      if (container) container.style.display = 'block';
      if (scanFrame) scanFrame.style.display = 'flex';

      // 3) init and start AR
      await initAndStart(container);

      // 4) wire UI
      initUI();
    }, { once: true });
  }
}

main().catch(e=>console.error(e));
