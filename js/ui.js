// /WEB/js/ui.js
import * as AR from './ar.js';
import { initButtons } from './buttons.js';

export function initUI(){
  // init career buttons with small bars and ready/disabled states
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
    // hide by default; only show when user pressed back (AR.pauseAndShowMenu will reveal it)
    try { returnBtn.style.display = 'none'; } catch(e){}
    returnBtn.addEventListener('click', ()=> { AR.returnToLast(); });
  }

  // game / survey / contact buttons same as before
  const gameBtn = document.getElementById('game-btn');
  const surveyBtn = document.getElementById('survey-btn');
  const contactBtn = document.getElementById('contact-btn');

  if (gameBtn) {
    gameBtn.addEventListener('click', async ()=> {
      try { AR.resetToIdle(); } catch(e){}
      AR.setNoScan(true);
      const careerMenu = document.getElementById('career-menu');
      if (careerMenu) careerMenu.style.display = 'none';
      const scanFrame = document.getElementById('scan-frame');
      if (scanFrame) scanFrame.style.display = 'none';

      // load game overlay as your previous code (keeps same behavior)
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
        // copy styles + body
        const links = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
        links.forEach(link => {
          const href = link.getAttribute('href');
          if (!href) return;
          if (!document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) {
            const newLink = document.createElement('link'); newLink.rel='stylesheet'; newLink.href = href; document.head.appendChild(newLink);
          }
        });
        overlay.innerHTML = doc.body.innerHTML;

        // add script loader for game.js
        const existingScript = document.querySelector('script[data-game-module]');
        if (existingScript) existingScript.remove();
        const s = document.createElement('script');
        s.type = 'module'; s.src = 'js/game.js?ts=' + Date.now(); s.setAttribute('data-game-module','1');
        document.body.appendChild(s);

        // add close button handling (similar to your previous design)
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
          AR.setNoScan(true);
          const scanFrame2 = document.getElementById('scan-frame');
          if (scanFrame2) scanFrame2.style.display = 'none';
        });

      } catch(e){
        alert('ไม่สามารถโหลดเกมได้ — ตรวจสอบไฟล์ game.html');
        const careerMenu = document.getElementById('career-menu');
        if (careerMenu) careerMenu.style.display = 'flex';
        const careerActions = document.getElementById('career-actions');
        if (careerActions) careerActions.style.display = 'flex';
        try { AR.resetToIdle(); } catch(e){}
      }
    });
  }

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
