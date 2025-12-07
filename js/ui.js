// /WEB/js/ui.js
import * as AR from './ar.js';
import { initButtons } from './buttons.js';
import { CONFIG } from './config.js'; // ดึงลิงก์จากไฟล์ config

// ตัวแปรกันทำงานซ้ำ
let isUIInitialized = false;

export function initUI(){
  if (isUIInitialized) return;
  
  initButtons();

  // Back Button
  const backBtn = document.getElementById('backBtn');
  if (backBtn) backBtn.addEventListener('click', ()=> {
    AR.pauseAndShowMenu();
    AR.setNoScan(true);
  });

  // Return to Last Button
  const returnBtn = document.getElementById('return-btn');
  if (returnBtn) {
    try { returnBtn.style.display = 'none'; } catch(e){}
    returnBtn.addEventListener('click', ()=> { AR.returnToLast(); });
  }

  const gameBtn = document.getElementById('game-btn');
  const surveyBtn = document.getElementById('survey-btn');
  const contactBtn = document.getElementById('contact-btn');

  // --- 1. GAME BUTTON ---
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

  // --- 2. SURVEY BUTTON ---
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

  // --- 3. CONTACT BUTTON (Video + FB) ---
  if (contactBtn) contactBtn.addEventListener('click', ()=> {
    const careerMenu = document.getElementById('career-menu');
    if (careerMenu) careerMenu.style.display = 'none'; 

    // Overlay พื้นหลัง
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '10000',
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection:'column', alignItems: 'center', justifyContent: 'center',
      padding: '20px'
    });

    const contentContainer = document.createElement('div');
    Object.assign(contentContainer.style, {
      width: '100%', maxWidth: '500px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px'
    });

    // 3.1 ส่วนวีดีโอ (แก้ไข Path เป็น Contact/Contact.mp4)
    const videoContainer = document.createElement('div');
    videoContainer.innerHTML = `
      <div style="width: 100%; border-radius: 16px; overflow: hidden; border: 2px solid #00ffff; box-shadow: 0 0 20px rgba(0,255,255,0.4); background:#000;">
        <video src="Contact/Contact.mp4" controls autoplay playsinline style="width: 100%; display: block;"></video>
      </div>
    `;
    contentContainer.appendChild(videoContainer);

    // 3.2 ปุ่ม Facebook Logo
    const fbLink = document.createElement('a');
    fbLink.href = CONFIG.FACEBOOK_URL; 
    fbLink.target = '_blank'; 
    Object.assign(fbLink.style, {
      display: 'inline-block', textDecoration: 'none',
      transition: 'transform 0.2s ease'
    });
    
    fbLink.onmouseover = () => fbLink.style.transform = 'scale(1.1)';
    fbLink.onmouseout = () => fbLink.style.transform = 'scale(1.0)';

    fbLink.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
        <svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 24 24" style="fill:#1877F2; filter: drop-shadow(0 4px 8px rgba(24,119,242,0.5));">
          <path d="M12 0c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm3 8h-1.35c-.538 0-.65.221-.65.778v1.222h2l-.209 2h-1.791v7h-3v-7h-2v-2h2v-2.308c0-1.769.931-2.692 3.029-2.692h1.971v3z"/>
        </svg>
        <span style="color:#fff; font-family:sans-serif; font-size:14px; opacity:0.8;">ไปที่เพจ Facebook</span>
      </div>
    `;
    contentContainer.appendChild(fbLink);

    overlay.appendChild(contentContainer);

    // ปุ่มปิด (X)
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    Object.assign(closeBtn.style, {
      position: 'absolute', top: '20px', right: '20px',
      width: '40px', height: '40px', borderRadius: '50%',
      border: 'none', background: 'rgba(255,255,255,0.2)', color: '#fff',
      fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
    });
    closeBtn.onclick = () => {
      overlay.remove();
      if (careerMenu) careerMenu.style.display = 'flex'; 
    };
    overlay.appendChild(closeBtn);

    document.body.appendChild(overlay);
  });

  isUIInitialized = true;
}