// js/ui.js
import * as AR from './ar.js';

export function initUI() {
  // career buttons
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

  // action buttons (open game as inline overlay)
  const gameBtn = document.getElementById('game-btn');
  const surveyBtn = document.getElementById('survey-btn');
  const contactBtn = document.getElementById('contact-btn');

  if (gameBtn) gameBtn.addEventListener('click', async ()=> {
    // pause AR content to avoid conflicts
    try { AR.pauseAndShowMenu(); } catch(e){}

    // hide career menu
    const careerMenu = document.getElementById('career-menu');
    if (careerMenu) careerMenu.style.display = 'none';

    // create overlay container if not exists
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

    // add a strict CSS rule to hide scan-frame completely while overlay exists
    // (this uses !important to override inline styles from AR)
    let hideScanStyle = document.getElementById('hide-scan-style');
    if (!hideScanStyle) {
      hideScanStyle = document.createElement('style');
      hideScanStyle.id = 'hide-scan-style';
      hideScanStyle.textContent = '#scan-frame { display: none !important; }';
      document.head.appendChild(hideScanStyle);
    }

    // fetch game.html
    try {
      const res = await fetch('game.html');
      const htmlText = await res.text();

      // parse fetched HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');

      // copy stylesheet(s) from fetched head to document.head (if not already)
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

      // insert body content into overlay
      overlay.innerHTML = doc.body.innerHTML;

      // add a close button (top-left) to overlay (keep only ✕)
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

      // inject game module script if not present
      if (!document.querySelector('script[data-game-module]')) {
        const s = document.createElement('script');
        s.type = 'module';
        s.src = 'js/game.js';
        s.setAttribute('data-game-module','1');
        document.body.appendChild(s);
      }

      // close handler: stop any camera in overlay and remove overlay
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

        // remove overlay
        try { overlay.remove(); } catch(e){}
        // show career menu and ensure backBtn remains hidden
        if (careerMenu) careerMenu.style.display = 'flex';
        if (backBtn) backBtn.style.display = 'none';

        // remove the style that hid the scan-frame so AR can show it again if needed
        const hideScanStyle2 = document.getElementById('hide-scan-style');
        if (hideScanStyle2) hideScanStyle2.remove();

        // optionally restore scan-frame to flex (AR may manage it later)
        const scanFrame = document.getElementById('scan-frame');
        if (scanFrame) scanFrame.style.display = 'flex';
      });

    } catch (e) {
      console.error('failed loading game.html', e);
      alert('ไม่สามารถโหลดเกมได้ โปรดตรวจสอบว่ามีไฟล์ game.html ในโฟลเดอร์เดียวกับหน้าเว็บ');
      if (careerMenu) careerMenu.style.display = 'flex';
      // remove hide-scan-style if fetch fails
      const hideScanStyle2 = document.getElementById('hide-scan-style');
      if (hideScanStyle2) hideScanStyle2.remove();
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
