// /WEB/js/game-launcher.js
import * as AR from './ar.js';

export function initGameLauncher() {
  const gameBtn = document.getElementById('game-btn');
  if (!gameBtn) return;

  gameBtn.addEventListener('click', async () => {
    // เตรียม AR
    try { AR.resetToIdle(); } catch(e){}
    AR.setNoScan(true);

    // ซ่อน UI หลัก
    const careerMenu = document.getElementById('career-menu');
    if (careerMenu) careerMenu.style.display = 'none';
    const scanFrame = document.getElementById('scan-frame');
    if (scanFrame) scanFrame.style.display = 'none';

    try {
      // โหลดไฟล์ game.html
      const res = await fetch('game.html');
      if (!res.ok) throw new Error('game not found');
      const htmlText = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');
      
      // สร้าง Overlay
      const overlayId = 'game-overlay';
      let overlay = document.getElementById(overlayId);
      if (!overlay) {
        overlay = document.createElement('div'); overlay.id = overlayId;
        Object.assign(overlay.style, {
          position: 'fixed', inset: '0', zIndex: '9999',
          display: 'flex', alignItems: 'stretch', justifyContent: 'stretch'
        });
        document.body.appendChild(overlay);
      }
      
      // Inject CSS จาก game.html
      const links = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
      links.forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;
        if (!document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) {
          const newLink = document.createElement('link'); newLink.rel='stylesheet'; newLink.href = href; document.head.appendChild(newLink);
        }
      });
      overlay.innerHTML = doc.body.innerHTML;

      // Inject JS Module (game.js)
      const existingScript = document.querySelector('script[data-game-module]');
      if (existingScript) existingScript.remove();
      const s = document.createElement('script');
      s.type = 'module'; s.src = 'js/game.js?ts=' + Date.now(); s.setAttribute('data-game-module','1');
      document.body.appendChild(s);

      // สร้างปุ่มปิด (Close Button) ถ้ายังไม่มีใน HTML
      const closeBtn = overlay.querySelector('#game-close-btn') || (() => {
        const b = document.createElement('button'); b.id='game-close-btn'; b.textContent='✕';
        Object.assign(b.style, { 
            position:'fixed', left:'12px', top:'12px', zIndex:10010, 
            padding:'8px 10px', borderRadius:'8px', border:'none', 
            background:'rgba(0,0,0,0.6)', color:'#00ffff', cursor:'pointer', fontSize:'16px' 
        });
        document.body.appendChild(b);
        return b;
      })();

      // Logic ปุ่มปิดเกม
      closeBtn.addEventListener('click', ()=> {
        // หยุดกล้อง/วิดีโอในเกม
        try {
          const vid = overlay.querySelector('video');
          if (vid && vid.srcObject) {
            const tracks = vid.srcObject.getTracks();
            tracks.forEach(t=>t.stop());
            vid.srcObject = null;
          }
        } catch(e){}
        
        // ลบ Overlay และ Script
        try { overlay.remove(); } catch(e){}
        const scr = document.querySelector('script[data-game-module]');
        if (scr) scr.remove();
        document.querySelectorAll('[data-confetti]').forEach(n=>n.remove());
        
        // รีเซ็ต AR และ UI
        try { AR.resetToIdle(); } catch(e){}
        
        if (careerMenu) careerMenu.style.display = 'flex';
        const careerActions = document.getElementById('career-actions');
        if (careerActions) careerActions.style.display = 'flex';
        
        const backBtn = document.getElementById('backBtn');
        if (backBtn) backBtn.style.display = 'none';
        const returnBtn = document.getElementById('return-btn');
        if (returnBtn) returnBtn.style.display = 'none';
        
        const scanFrame2 = document.getElementById('scan-frame');
        if (scanFrame2) scanFrame2.style.display = 'none';
      });

    } catch(e){
      alert('ไม่สามารถโหลดเกมได้ — ตรวจสอบไฟล์ game.html');
      if (careerMenu) careerMenu.style.display = 'flex';
      const careerActions = document.getElementById('career-actions');
      if (careerActions) careerActions.style.display = 'flex';
      try { AR.resetToIdle(); } catch(e){}
    }
  });
}