// js/main.js
import { preloadAll, initAndStart, getAssets } from './ar.js';
import { initUI } from './ui.js';

const bar = document.getElementById('bar');
const loadingText = document.getElementById('loading-text');
const startButton = document.getElementById('startButton');
const loadingScreen = document.getElementById('loading-screen');
const container = document.getElementById('container');
const scanFrame = document.getElementById('scan-frame');

async function main() {
  // 1) preload assets (progress update)
  await preloadAll((pct)=> {
    bar.style.width = pct + '%';
    loadingText.textContent = `กำลังโหลดทรัพยากร... ${pct}%`;
  });
  bar.style.width = '100%';
  loadingText.textContent = 'โหลดเสร็จแล้ว';

  // 2) show start button
  startButton.style.display = 'inline-block';
  startButton.addEventListener('click', async () => {
    // keep original behavior: request camera + mic (as in file you provided)
    try { await navigator.mediaDevices.getUserMedia({video:true,audio:true}); } catch(e){ console.warn('permission',e); }

    loadingScreen.style.display = 'none';
    container.style.display = 'block';
    if (scanFrame) scanFrame.style.display = 'flex';

    // 3) init and start AR
    await initAndStart(container);

    // 4) wire UI
    initUI();
  }, { once: true });
}

main().catch(e=>console.error(e));
