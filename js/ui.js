// js/ui.js
import * as AR from './ar.js';

/*
  UI init
  - สร้าง progress bar ภายในปุ่มอาชีพ
  - ฟังเหตุการณ์ 'career-load-progress' เพื่ออัปเดต bar
  - เมื่อกดปุ่มอาชีพ: เรียก AR.ensureCareerLoaded(...) ให้โหลดก่อน แล้วค่อย AR.playCareer(...)
  - แก้ปุ่ม back ให้แน่นอน
*/

function makeProgressInsideButton(btn) {
  if (btn.querySelector('.progress-wrap')) return;
  const wrap = document.createElement('div');
  wrap.className = 'progress-wrap';
  const fill = document.createElement('div');
  fill.className = 'progress-fill';
  wrap.appendChild(fill);
  const pct = document.createElement('div');
  pct.className = 'pct-label';
  pct.style.display = 'none'; // ซ่อนเริ่มต้น (ถ้าต้องการโชว์เปอเซนต์เปลี่ยนเป็น '')
  pct.textContent = '0%';
  btn.appendChild(wrap);
  btn.appendChild(pct);
}

function setButtonProgress(btn, pct) {
  const fill = btn.querySelector('.progress-fill');
  const pctLabel = btn.querySelector('.pct-label');
  if (fill) fill.style.width = Math.max(0, Math.min(100, Math.round(pct))) + '%';
  if (pctLabel) {
    pctLabel.textContent = Math.round(pct) + '%';
    // show small label when loading, hide when ready
    pctLabel.style.display = (pct < 100) ? 'block' : 'none';
  }
  if (pct >= 100) {
    btn.classList.remove('disabled');
    btn.disabled = false;
    // restore original gradient (in case it was gray)
    btn.style.background = '';
    btn.style.pointerEvents = '';
  } else {
    btn.classList.add('disabled');
    btn.disabled = true;
    // soften look while loading
    btn.style.background = 'rgba(255,255,255,0.04)';
  }
}

export function initUI() {
  // career buttons
  document.querySelectorAll('.career-btn').forEach(btn=> {
    const career = btn.dataset.career;
    // add progress bar to each button (if not present)
    makeProgressInsideButton(btn);

    // initial state from AR (if available)
    try {
      if (AR.isCareerReady && AR.isCareerReady(career)) {
        setButtonProgress(btn, 100);
      } else {
        setButtonProgress(btn, 0);
      }
    } catch(e){ setButtonProgress(btn, 0); }

    // click handler: ensure loaded then play
    btn.addEventListener('click', async ()=> {
      // If already ready -> play immediately
      try {
        if (AR.isCareerReady && AR.isCareerReady(career)) {
          // hide menu and play (playCareer will handle scan/no-scan)
          if (document.getElementById('career-menu')) document.getElementById('career-menu').style.display = 'none';
          AR.playCareer(career);
          return;
        }
      } catch(e){}

      // otherwise show loading UI for this button and start ensureCareerLoaded
      btn.classList.add('loading');
      setButtonProgress(btn, 0);
      try {
        // ensureCareerLoaded should dispatch 'career-load-progress' events too (ar.js) - we also provide a callback
        if (AR.ensureCareerLoaded) {
          await AR.ensureCareerLoaded(career, (pct) => {
            setButtonProgress(btn, pct);
          });
        } else {
          // fallback: try calling playCareer after a short delay
          await new Promise(r => setTimeout(r, 300));
        }
        // ready -> hide menu and play
        setButtonProgress(btn, 100);
        if (document.getElementById('career-menu')) document.getElementById('career-menu').style.display = 'none';
        AR.playCareer(career);
      } catch (e) {
        console.warn('ensureCareerLoaded failed', e);
        setButtonProgress(btn, 0);
        alert('โหลดคอนเท้นต์ไม่สำเร็จ ลองเช็คไฟล์/เน็ตอีกครั้ง');
      } finally {
        btn.classList.remove('loading');
      }
    });
  });

  // global listener: update any button progress when ar.js dispatches career-load-progress
  document.addEventListener('career-load-progress', (ev) => {
    try {
      const { career, pct } = ev.detail || {};
      if (!career) return;
      const btn = document.querySelector(`.career-btn[data-career="${career}"]`);
      if (!btn) return;
      setButtonProgress(btn, pct);
    } catch (e) { console.warn(e); }
  });

  // back button (top-left) - make it robust
  const backBtn = document.getElementById('backBtn');
  if (backBtn) {
    backBtn.addEventListener('click', ()=> {
      try {
        // pause content and show menu
        if (AR.pauseAndShowMenu) AR.pauseAndShowMenu();
        // ensure no-scan when menu visible
        if (AR.setNoScan) AR.setNoScan(true);
        // explicitly show full menu
        const cm = document.getElementById('career-menu');
        if (cm) cm.style.display = 'flex';
        // show action buttons
        const ca = document.getElementById('career-actions');
        if (ca) ca.style.display = 'flex';
        // hide back button itself while in menu
        backBtn.style.display = 'none';
      } catch(e) {
        console.warn('backBtn click err', e);
      }
    });
  }

  // return-to-last button (กลับไปเล่นคอนเท้นเดิม) - close menu when pressed
  const returnBtn = document.getElementById('return-btn');
  if (returnBtn) {
    returnBtn.addEventListener('click', ()=> {
      try {
        // hide menu immediately
        const cm = document.getElementById('career-menu');
        if (cm) cm.style.display = 'none';
        // allow scan visuals again (user will need to show marker)
        if (AR.setNoScan) AR.setNoScan(false);
        // attempt to return/resume
        if (AR.returnToLast) AR.returnToLast();
      } catch(e){ console.warn('return-btn err', e); }
    });
  }

  // action buttons (game / survey / contact) keep original behavior, but ensure they re-show menu when overlay closed
  const gameBtn = document.getElementById('game-btn');
  const surveyBtn = document.getElementById('survey-btn');
  const contactBtn = document.getElementById('contact-btn');

  if (gameBtn) gameBtn.addEventListener('click', async ()=> {
    try { AR.resetToIdle(); } catch(e){ console.warn('resetToIdle err', e); }
    if (AR.setNoScan) AR.setNoScan(true);

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

        try { AR.resetToIdle(); } catch(e){ console.warn('resetToIdle err', e); }

        // restore full menu/buttons
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
      alert('ไม่สามารถโหลดเกมได้ โปรดตรวจสอบว่ามีไฟล์ game.html ในโฟลเดอร์เดียวกับหน้าเว็บ');
      if (careerMenu) careerMenu.style.display = 'flex';
      const careerActions = document.getElementById('career-actions');
      if (careerActions) careerActions.style.display = 'flex';
      try { AR.resetToIdle(); } catch(e){}
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
