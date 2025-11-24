// js/buttons.js
import * as AR from './ar.js';

let inited = false;

function ensureSingle(fn) {
  return (...args) => { try { fn(...args); } catch(e){ console.warn(e); } };
}

function setCareerButtonState(btn, enabled) {
  try {
    btn.disabled = !enabled;
    if (enabled) {
      btn.style.opacity = '1';
      btn.style.pointerEvents = '';
    } else {
      btn.style.opacity = '0.5';
      btn.style.pointerEvents = 'none';
    }
  } catch(e){}
}

function isCareerReady(career) {
  try {
    const a = AR.getAssets();
    if (!a || !a[career]) return false;
    return !!(a[career].modelBlobUrl && a[career].videoBlobUrl);
  } catch(e){ return false; }
}

export function initButtons() {
  if (inited) return;
  inited = true;

  // career buttons
  const careerBtns = Array.from(document.querySelectorAll('.career-btn'));
  careerBtns.forEach(btn => {
    const career = btn.dataset.career;
    // initial state: enabled only if both model+video ready
    setCareerButtonState(btn, isCareerReady(career));

    btn.addEventListener('click', ensureSingle(() => {
      AR.setNoScan(true);
      AR.playCareer(career);
    }));
  });

  // listen career-load-progress events to toggle career buttons when both model+video ready
  document.addEventListener('career-load-progress', (ev) => {
    try {
      const detail = ev && ev.detail;
      if (!detail || !detail.career) return;
      const career = detail.career;
      const ready = isCareerReady(career);
      const btn = document.querySelector(`.career-btn[data-career="${career}"]`);
      if (btn) setCareerButtonState(btn, ready);
    } catch(e) {}
  });

  // back button
  const backBtn = document.getElementById('backBtn');
  if (backBtn) backBtn.addEventListener('click', ensureSingle(() => {
    AR.pauseAndShowMenu();
    AR.setNoScan(true);
  }));

  // return button
  const returnBtn = document.getElementById('return-btn');
  if (returnBtn) returnBtn.addEventListener('click', ensureSingle(() => {
    AR.returnToLast();
  }));

  // game button (loads game.html overlay)
  const gameBtn = document.getElementById('game-btn');
  if (gameBtn) gameBtn.addEventListener('click', ensureSingle(async () => {
    try {
      AR.resetToIdle();
      AR.setNoScan(true);
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

      const res = await fetch('game.html');
      if (!res.ok) throw new Error('game.html not found');
      const htmlText = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');

      // copy CSS links if missing
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

      // inject game script module (fresh)
      const existingScript = document.querySelector('script[data-game-module]');
      if (existingScript) try { existingScript.remove(); } catch(e){}
      const s = document.createElement('script');
      s.type = 'module';
      s.src = 'js/game.js?ts=' + Date.now();
      s.setAttribute('data-game-module','1');
      document.body.appendChild(s);

      // close handler
      closeBtn.addEventListener('click', () => {
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

    } catch (e) {
      console.error('failed loading game.html', e);
      alert('ไม่สามารถโหลดเกมได้ — ตรวจสอบไฟล์ game.html และ js/game.js');
      const careerMenu = document.getElementById('career-menu');
      if (careerMenu) careerMenu.style.display = 'flex';
      const careerActions = document.getElementById('career-actions');
      if (careerActions) careerActions.style.display = 'flex';
      try { AR.resetToIdle(); } catch(e){}
    }
  }));
}
