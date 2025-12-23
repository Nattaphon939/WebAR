// /WEB/js/game-launcher.js
import * as AR from './ar.js';

export function initGameLauncher() {
  const gameBtn = document.getElementById('game-btn');
  if (!gameBtn) return;

  gameBtn.addEventListener('click', async () => {
    try { AR.resetToIdle(); } catch(e){}
    AR.setNoScan(true);

    const careerMenu = document.getElementById('career-menu');
    if (careerMenu) careerMenu.style.display = 'none';
    const scanFrame = document.getElementById('scan-frame');
    if (scanFrame) scanFrame.style.display = 'none';
    const homeBtn = document.getElementById('homeBtn'); 
    if (homeBtn) homeBtn.style.display = 'none';

    try {
      const res = await fetch('game.html');
      if (!res.ok) throw new Error('game not found');
      const htmlText = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');
      
      const overlayId = 'game-overlay';
      let overlay = document.getElementById(overlayId);
      if (!overlay) {
        overlay = document.createElement('div'); 
        overlay.id = overlayId;
        Object.assign(overlay.style, {
          position: 'fixed', inset: '0', zIndex: '9999',
          display: 'flex', alignItems: 'stretch', justifyContent: 'stretch'
        });
        document.body.appendChild(overlay);
      }
      
      const links = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
      links.forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;
        if (!document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) {
          const newLink = document.createElement('link'); newLink.rel='stylesheet'; newLink.href = href; document.head.appendChild(newLink);
        }
      });
      overlay.innerHTML = doc.body.innerHTML;

      const existingScript = document.querySelector('script[data-game-module]');
      if (existingScript) existingScript.remove();
      const s = document.createElement('script');
      s.type = 'module'; s.src = 'js/game.js?ts=' + Date.now(); s.setAttribute('data-game-module','1');
      document.body.appendChild(s);

      // ✅ สร้างปุ่มเมนูหลัก (Home) แทนปุ่ม X
      const closeBtn = overlay.querySelector('#game-close-btn') || (() => {
        const b = document.createElement('button'); 
        b.id = 'game-close-btn'; 
        b.innerHTML = '🏠 เมนูหลัก'; // เปลี่ยนข้อความ
        Object.assign(b.style, { 
            position: 'fixed', left: '12px', top: '12px', zIndex: 10010, 
            padding: '8px 12px', borderRadius: '8px', 
            border: '1px solid rgba(255, 255, 255, 0.06)', 
            background: 'rgba(0, 0, 0, 0.5)', 
            color: '#00ffff', cursor: 'pointer', 
            fontWeight: 'bold', fontSize: '14px',
            display: 'flex', alignItems: 'center', gap: '6px'
        });
        
        overlay.appendChild(b);
        return b;
      })();

      closeBtn.onclick = () => {
        try {
          const vid = overlay.querySelector('video');
          if (vid && vid.srcObject) {
            const tracks = vid.srcObject.getTracks();
            tracks.forEach(t=>t.stop());
            vid.srcObject = null;
          }
        } catch(e){}
        
        try { overlay.remove(); } catch(e){}
        const scr = document.querySelector('script[data-game-module]');
        if (scr) scr.remove();
        document.querySelectorAll('[data-confetti]').forEach(n=>n.remove());
        
        try { AR.resetToIdle(); } catch(e){}
        
        if (careerMenu) careerMenu.style.display = 'flex';
        // ไม่ต้องสั่ง careerActions เพราะแสดงผลด้วย CSS flex แล้ว
        
        if (homeBtn) homeBtn.style.display = 'none'; 
        const returnBtn = document.getElementById('return-btn');
        if (returnBtn) returnBtn.style.display = 'none';
        
        const scanFrame2 = document.getElementById('scan-frame');
        if (scanFrame2) scanFrame2.style.display = 'none';
      };

    } catch(e){
      console.warn(e);
      alert('ไม่สามารถโหลดเกมได้ — ตรวจสอบไฟล์ game.html');
      
      if (careerMenu) careerMenu.style.display = 'flex';
      try { AR.resetToIdle(); } catch(e){}
    }
  });
}