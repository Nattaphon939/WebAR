// /WEB/js/main.js  (replace)
import { preloadAll } from './loader.js';
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

  // listen for loader events - career-level progress shown as small bars via buttons.js
  document.addEventListener('start-ready', (ev) => {
    // show Start button (user can now press to initialize AR)
    if (startButton) {
      startButton.style.display = 'inline-block';
      startButton.disabled = false;
      startButton.textContent = 'แตะเพื่อเริ่ม AR';
      // Phase A complete for UI
      setMainProgress(100);
      loadingText.textContent = 'พร้อมเริ่มต้น — แตะเพื่อเริ่ม';
    }
    // start background Phase B via AR.preloadRemaining if available
    try { if (AR && AR.preloadRemaining) AR.preloadRemaining().then(()=>console.log('Phase B background load finished')).catch(e=>console.warn(e)); } catch(e){}
  });

  // main preload (will emit 'career-load-progress' and 'start-ready' events)
  await preloadAll((pct) => {
    setMainProgress(pct);
    if (pct >= 100) {
      loadingText.textContent = 'โหลดทรัพยากรเสร็จแล้ว';
    }
  });

  // when user clicks start: request camera, init AR, then wire UI
  if (!startButton) return;
  startButton.addEventListener('click', async () => {
    try { await navigator.mediaDevices.getUserMedia({ video:true }); } catch(e){ console.warn('camera permission', e); }
    loadingScreen.style.display = 'none';
    container.style.display = 'block';
    if (scanFrame) scanFrame.style.display = 'flex';

    // init AR + UI
    try {
      await AR.initAndStart(container);
      initUI();
    } catch(e){ console.error('initAndStart err', e); alert('ไม่สามารถเริ่ม AR ได้'); }
  }, { once: true });
}

main().catch(e => console.error(e));
