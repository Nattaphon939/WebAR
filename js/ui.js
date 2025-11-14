// js/ui.js
import * as AR from './ar.js';

export function initUI() {
  document.querySelectorAll('.career-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> {
      const c = btn.dataset.career;
      AR.playCareer(c);
    });
  });

  const backBtn = document.getElementById('backBtn');
  if (backBtn) backBtn.addEventListener('click', ()=> {
    AR.pauseAndShowMenu();
  });

  const returnBtn = document.getElementById('return-btn');
  if (returnBtn) returnBtn.addEventListener('click', ()=> {
    AR.returnToLast();
  });

  const gameBtn = document.getElementById('game-btn');
  const surveyBtn = document.getElementById('survey-btn');
  const contactBtn = document.getElementById('contact-btn');

  if (gameBtn) gameBtn.addEventListener('click', async ()=> {
    // Pause AR content & disable auto-play to prevent any audio/model start while in-game
    try { AR.pauseAndShowMenu(); } catch(e) {}
    try { AR.setAutoPlayEnabled(false); } catch(e){}

    const careerMenu = document.getElementById('career-menu');
    if (careerMenu) careerMenu.style.display = 'none';

    const scanFrame = document.getElementById('scan-frame');
    if (scanFrame) scanFrame.style.display = 'none';

    let overlay = document.getElementById('game-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'game-overlay';
      overlay.style.position = 'fixed';
      overlay.style.inset = '0';
      overlay.style.zIndex = '9999';
      overlay.style.background = 'transparent';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'stretch';
      overlay.style.justifyContent = 'stretch';
      document.body.appendChild(overlay);
    }

    try {
      const res = await fetch('game.html');
      if (!res.ok) throw new Error('game.html not found');
      const htmlText = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');

      const links = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
      links.forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;
        if (!document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) {
          const newLink = document.createElement('link');
          newLink.rel = 'stylesheet';
          newLink.href = href;
          document.head.appendChild(newLink);
        }
      });

      overlay.innerHTML = doc.body.innerHTML;

      let closeBtn = overlay.querySelector('#game-close-btn');
      if (!closeBtn) {
        closeBtn = document.createElement('button');
        closeBtn.id = 'game-close-btn';
        closeBtn.textContent = '✕';
        Object.assign(closeBtn.style, {
          position: 'fixed',
          left: '12px',
          top: '12px',
          zIndex: '10010',
          padding: '8px 10px',
          borderRadius: '8px',
          border: 'none',
          background: 'rgba(0,0,0,0.6)',
          color: '#00ffff',
          cursor: 'pointer',
          fontSize: '16px'
        });
        overlay.appendChild(closeBtn);
      }

      const existingScript = document.querySelector('script[data-game-module]');
      if (existingScript) {
        try { existingScript.remove(); } catch(e){}
      }

      const s = document.createElement('script');
      s.type = 'module';
      s.src = 'js/game.js?ts=' + Date.now();
      s.setAttribute('data-game-module','1');
      document.body.appendChild(s);

      closeBtn.addEventListener('click', ()=> {
        try {
          const vid = overlay.querySelector('video');
          if (vid && vid.srcObject) {
            try {
              const tracks = vid.srcObject.getTracks();
              tracks.forEach(t=>t.stop());
            } catch(e){ console.warn('stop tracks err', e); }
            try { vid.srcObject = null; } catch(e){}
          }
        } catch(e){ console.warn(e); }

        try { overlay.remove(); } catch(e){}

        const scr = document.querySelector('script[data-game-module]');
        if (scr) try { scr.remove(); } catch(e){}

        const scoreOv = document.getElementById('score-overlay');
        if (scoreOv) try { scoreOv.remove(); } catch(e){}
        document.querySelectorAll('[data-confetti]').forEach(n=>n.remove());

        // re-enable AR autoplay (so markers again can start content) and show UI
        try { AR.setAutoPlayEnabled(true); } catch(e){}
        if (careerMenu) careerMenu.style.display = 'flex';
        const careerActions = document.getElementById('career-actions');
        if (careerActions) careerActions.style.display = 'flex';

        // hide back & return buttons
        if (backBtn) backBtn.style.display = 'none';
        const returnBtn2 = document.getElementById('return-btn');
        if (returnBtn2) returnBtn2.style.display = 'none';

        const scanFrame2 = document.getElementById('scan-frame');
        if (scanFrame2) scanFrame2.style.display = 'flex';
      });

    } catch (e) {
      console.error('failed loading game.html', e);
      alert('ไม่สามารถโหลดเกมได้ โปรดตรวจสอบว่ามีไฟล์ game.html ในโฟลเดอร์เดียวกับหน้าเว็บ');
      if (careerMenu) careerMenu.style.display = 'flex';
      const careerActions = document.getElementById('career-actions');
      if (careerActions) careerActions.style.display = 'flex';
      // ensure autoplay re-enabled on error
      try { AR.setAutoPlayEnabled(true); } catch(e){}
    }
  });

  if (surveyBtn) surveyBtn.addEventListener('click', ()=> {
    const careerMenu = document.getElementById('career-menu');
    if (careerMenu) careerMenu.style.display = 'none';
    if (backBtn) backBtn.style.display = 'none';
    window.open('https://forms.gle/', '_blank');
  });

  if (contactBtn) contactBtn.addEventListener('click', ()=> {
    const careerMenu = document.getElementById('career-menu');
    if (careerMenu) careerMenu.style.display = 'none';
    if (backBtn) backBtn.style.display = 'none';
    window.open('#', '_blank');
  });
}
