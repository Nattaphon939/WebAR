// js/ui.js
import * as AR from './ar.js';

function makeProgressInsideButton(btn) {
  if (btn.querySelector('.progress-wrap')) return;
  const wrap = document.createElement('div');
  wrap.className = 'progress-wrap';
  const fill = document.createElement('div');
  fill.className = 'progress-fill';
  wrap.appendChild(fill);
  const pct = document.createElement('div');
  pct.className = 'pct-label';
  pct.style.display = 'none';
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
    pctLabel.style.display = (pct < 100) ? 'block' : 'none';
  }
  if (pct >= 100) {
    btn.classList.remove('disabled');
    btn.disabled = false;
    btn.style.background = '';
    btn.style.pointerEvents = '';
  } else {
    btn.classList.add('disabled');
    btn.disabled = true;
    btn.style.background = 'rgba(255,255,255,0.04)';
  }
}

export function initUI() {
  document.querySelectorAll('.career-btn').forEach(btn=> {
    const career = btn.dataset.career;
    makeProgressInsideButton(btn);
    try {
      if (AR.isCareerReady && AR.isCareerReady(career)) {
        setButtonProgress(btn, 100);
      } else {
        setButtonProgress(btn, 0);
      }
    } catch(e){ setButtonProgress(btn, 0); }

    btn.addEventListener('click', async ()=> {
      try {
        if (AR.isCareerReady && AR.isCareerReady(career)) {
          if (document.getElementById('career-menu')) document.getElementById('career-menu').style.display = 'none';
          AR.playCareer(career);
          return;
        }
      } catch(e){}

      btn.classList.add('loading');
      setButtonProgress(btn, 0);
      try {
        if (AR.ensureCareerLoaded) {
          await AR.ensureCareerLoaded(career, (pct) => {
            setButtonProgress(btn, pct);
          });
        } else {
          await new Promise(r => setTimeout(r, 300));
        }
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

  document.addEventListener('career-load-progress', (ev) => {
    try {
      const { career, pct } = ev.detail || {};
      if (!career) return;
      const btn = document.querySelector(`.career-btn[data-career="${career}"]`);
      if (!btn) return;
      setButtonProgress(btn, pct);
    } catch (e) { console.warn(e); }
  });

  const backBtnEl = document.getElementById('backBtn');
  if (backBtnEl) {
    backBtnEl.addEventListener('click', ()=> {
      try {
        if (AR.pauseAndShowMenu) AR.pauseAndShowMenu();
        if (AR.setNoScan) AR.setNoScan(true);
        const cm = document.getElementById('career-menu');
        if (cm) cm.style.display = 'flex';
        const ca = document.getElementById('career-actions');
        if (ca) ca.style.display = 'flex';
        backBtnEl.style.display = 'none';
      } catch(e) { console.warn('backBtn click err', e); }
    });
  }

  const returnBtn = document.getElementById('return-btn');
  if (returnBtn) {
    returnBtn.addEventListener('click', ()=> {
      try {
        const cm = document.getElementById('career-menu');
        if (cm) cm.style.display = 'none';   // ปิดเมนูทันที (แก้ปัญหาต้องกดสองรอบ)
        if (AR.setNoScan) AR.setNoScan(false); // ให้สามารถเล่นได้ (ถ้าเจอมาร์คเกอร์)
        if (AR.returnToLast) AR.returnToLast();
      } catch(e){ console.warn('return-btn err', e); }
    });
  }

  // game/survey/contact (unchanged)
  const gameBtn = document.getElementById('game-btn');
  const surveyBtn = document.getElementById('survey-btn');
  const contactBtn = document.getElementById('contact-btn');

  if (gameBtn) gameBtn.addEventListener('click', async ()=> {
    try { AR.resetToIdle(); } catch(e){}
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
            } catch(e){}
            try { vid.srcObject = null; } catch(e){}
          }
        } catch(e){}
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
