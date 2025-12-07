// /WEB/js/ui.js
import * as AR from './ar.js';
import { initButtons } from './buttons.js';
import { CONFIG } from './config.js'; 

// ตัวแปรกันทำงานซ้ำ (Fix double overlay bug)
let isUIInitialized = false;

export function initUI(){
  // ถ้าเคย init ไปแล้ว ให้หยุดทันที (ป้องกันปุ่มเบิ้ล)
  if (isUIInitialized) return;
  
  // เริ่มทำงาน
  initButtons();

  // back button
  const backBtn = document.getElementById('backBtn');
  if (backBtn) backBtn.addEventListener('click', ()=> {
    AR.pauseAndShowMenu();
    AR.setNoScan(true);
  });

  // return to last
  const returnBtn = document.getElementById('return-btn');
  if (returnBtn) {
    try { returnBtn.style.display = 'none'; } catch(e){}
    returnBtn.addEventListener('click', ()=> { AR.returnToLast(); });
  }

  const gameBtn = document.getElementById('game-btn');
  const surveyBtn = document.getElementById('survey-btn');
  const contactBtn = document.getElementById('contact-btn');

  // --- GAME BUTTON ---
  if (gameBtn) {
    gameBtn.addEventListener('click', async ()=> {
      try { AR.resetToIdle(); } catch(e){}
      AR.setNoScan(true);
      const careerMenu = document.getElementById('career-menu');
      if (careerMenu) careerMenu.style.display = 'none';
      const scanFrame = document.getElementById('scan-frame');
      if (scanFrame) scanFrame.style.display = 'none';

      try {
        const res = await fetch('game.html');
        if (!res.ok) throw new Error('game not found');
        const htmlText = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        const overlayId = 'game-overlay';
        let overlay = document.getElementById(overlayId);
        if (!overlay) {
          overlay = document.createElement('div'); overlay.id = overlayId;
          overlay.style.position='fixed'; overlay.style.inset='0'; overlay.style.zIndex='9999';
          overlay.style.display='flex'; overlay.style.alignItems='stretch'; overlay.style.justifyContent='stretch';
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

        const closeBtn = overlay.querySelector('#game-close-btn') || (() => {
          const b = document.createElement('button'); b.id='game-close-btn'; b.textContent='✕';
          Object.assign(b.style, { position:'fixed', left:'12px', top:'12px', zIndex:10010, padding:'8px 10px', borderRadius:'8px', border:'none', background:'rgba(0,0,0,0.6)', color:'#00ffff', cursor:'pointer', fontSize:'16px' });
          document.body.appendChild(b);
          return b;
        })();

        closeBtn.addEventListener('click', ()=> {
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
          const careerActions = document.getElementById('career-actions');
          if (careerActions) careerActions.style.display = 'flex';
          if (backBtn) backBtn.style.display = 'none';
          const returnBtn2 = document.getElementById('return-btn');
          if (returnBtn2) returnBtn2.style.display = 'none';
          
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

  // --- SURVEY BUTTON ---
  if (surveyBtn) {
    surveyBtn.addEventListener('click', ()=> {
      const careerMenu = document.getElementById('career-menu');
      if (careerMenu) careerMenu.style.display = 'none';
      if (backBtn) backBtn.style.display = 'none';
      const scanFrame = document.getElementById('scan-frame');
      if (scanFrame) scanFrame.style.display = 'none';

      const overlay = document.createElement('div');
      overlay.id = 'survey-overlay';
      Object.assign(overlay.style, {
        position: 'fixed', inset: '0', zIndex: '10000',
        background: '#fff', display: 'flex', flexDirection: 'column'
      });

      const header = document.createElement('div');
      Object.assign(header.style, {
        display: 'flex', justifyContent: 'flex-end', padding: '10px', background: '#000'
      });

      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✕ ปิดแบบสอบถาม';
      Object.assign(closeBtn.style, {
        padding: '8px 16px', borderRadius: '8px', border: '1px solid #333',
        background: '#1a1a1a', color: '#fff', cursor: 'pointer', fontWeight: 'bold'
      });

      closeBtn.onclick = () => {
        overlay.remove();
        if (careerMenu) careerMenu.style.display = 'flex';
      };

      header.appendChild(closeBtn);
      overlay.appendChild(header);

      const iframe = document.createElement('iframe');
      iframe.src = CONFIG.SURVEY_URL; 
      
      Object.assign(iframe.style, {
        flex: '1', border: 'none', width: '100%', background: '#fff'
      });

      overlay.appendChild(iframe);
      document.body.appendChild(overlay);
    });
  }

  // --- CONTACT BUTTON ---
  if (contactBtn) contactBtn.addEventListener('click', ()=> {
    const careerMenu = document.getElementById('career-menu');
    if (careerMenu) careerMenu.style.display = 'none';
    if (backBtn) backBtn.style.display = 'none';
    window.open('#', '_blank');
  });

  // ทำเครื่องหมายว่า init เสร็จแล้ว
  isUIInitialized = true;
}