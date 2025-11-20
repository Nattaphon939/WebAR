// js/ui.js (fixed & more defensive)
// - single, named handler for career-load-progress (no undefined removeEventListener)
// - safe calls to AR.* with try/catch
// - game button guarded until game-assets-ready
// - clearer logging for debugging

import * as AR from './ar.js';

function makeProgressInsideButton(btn) {
  if (!btn) return;
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
  if (!btn) return;
  const fill = btn.querySelector('.progress-fill');
  const pctLabel = btn.querySelector('.pct-label');
  const num = Math.max(0, Math.min(100, Math.round(pct || 0)));
  if (fill) fill.style.width = num + '%';
  if (pctLabel) {
    pctLabel.textContent = num + '%';
    pctLabel.style.display = (num < 100) ? 'block' : 'none';
  }
  if (num >= 100) {
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

function enableCareerButtonIfReady(btn, career) {
  if (!btn) return;
  try {
    if (AR.isCareerReady && AR.isCareerReady(career)) {
      setButtonProgress(btn, 100);
      btn.classList.remove('disabled');
      btn.disabled = false;
      btn.style.background = '';
    } else {
      // keep progress at whatever it is, but make sure disabled if not ready
      const currentPct = btn.querySelector('.progress-fill') ? parseInt(btn.querySelector('.progress-fill').style.width || '0') : 0;
      setButtonProgress(btn, currentPct || 0);
      btn.classList.add('disabled');
      btn.disabled = true;
      btn.style.background = 'rgba(255,255,255,0.04)';
    }
  } catch (e) {
    console.warn('enableCareerButtonIfReady err', e);
    setButtonProgress(btn, 0);
    btn.classList.add('disabled');
    btn.disabled = true;
  }
}

// single named handler so we can avoid accidental remove of undefined fn
function onCareerLoadProgress(ev) {
  try {
    const detail = ev && ev.detail ? ev.detail : {};
    const career = detail.career;
    let pct = detail.pct;
    if (!career) return;
    const btn = document.querySelector(`.career-btn[data-career="${career}"]`);
    if (!btn) return;
    // if pct is object (from wrapped calls), try extract number
    if (typeof pct !== 'number' && detail.overall) pct = detail.overall;
    pct = (typeof pct === 'number') ? pct : 0;
    // update visual progress (pct expected 0..100)
    setButtonProgress(btn, pct);

    // if AR confirms readiness, ensure fully enabled
    try {
      if (AR.isCareerReady && AR.isCareerReady(career)) {
        setButtonProgress(btn, 100);
        btn.classList.remove('disabled');
        btn.disabled = false;
        btn.style.background = '';
      }
    } catch(e){}
  } catch (e) {
    console.warn('onCareerLoadProgress err', e);
  }
}

export function initUI() {
  // create progress bars for career buttons and set initial enabled/disabled state
  const careerBtns = Array.from(document.querySelectorAll('.career-btn'));
  careerBtns.forEach(btn => {
    const career = btn.dataset.career;
    makeProgressInsideButton(btn);
    // initial enable/disable based on AR if available
    enableCareerButtonIfReady(btn, career);

    btn.addEventListener('click', async () => {
      if (btn.disabled) {
        try { alert('ยังไม่พร้อม — รอโหลดโมเดลและวิดีโอให้เรียบร้อยก่อน (ดูแถบโหลดใต้ปุ่ม)'); } catch(e){}
        return;
      }
      try {
        if (document.getElementById('career-menu')) document.getElementById('career-menu').style.display = 'none';
        AR.playCareer(btn.dataset.career);
      } catch (e) {
        console.warn('career button click err', e);
      }
    });
  });

  // attach the single named handler (no removeEventListener to undefined)
  document.removeEventListener('career-load-progress', onCareerLoadProgress);
  document.addEventListener('career-load-progress', onCareerLoadProgress);

  // back button
  const backBtnEl = document.getElementById('backBtn');
  if (backBtnEl) {
    backBtnEl.addEventListener('click', () => {
      try {
        if (AR.pauseAndShowMenu) AR.pauseAndShowMenu();
        if (AR.setNoScan) AR.setNoScan(true);
        const cm = document.getElementById('career-menu');
        if (cm) cm.style.display = 'flex';
        const ca = document.getElementById('career-actions');
        if (ca) ca.style.display = 'flex';
        backBtnEl.style.display = 'none';
      } catch (e) { console.warn('backBtn click err', e); }
    });
  }

  // return button
  const returnBtn = document.getElementById('return-btn');
  if (returnBtn) {
    returnBtn.addEventListener('click', () => {
      try {
        const cm = document.getElementById('career-menu');
        if (cm) cm.style.display = 'none';
        if (AR.setNoScan) AR.setNoScan(false);
        if (AR.returnToLast) AR.returnToLast();
      } catch (e) { console.warn('return-btn err', e); }
    });
  }

  // GAME / SURVEY / CONTACT
  const gameBtn = document.getElementById('game-btn');
  const surveyBtn = document.getElementById('survey-btn');
  const contactBtn = document.getElementById('contact-btn');

  if (gameBtn) {
    makeProgressInsideButton(gameBtn);
    setButtonProgress(gameBtn, 0);
    gameBtn.classList.add('disabled');
    gameBtn.disabled = true;

    gameBtn.addEventListener('click', async () => {
      if (gameBtn.disabled) {
        try { alert('เกมยังไม่โหลดเสร็จ รอสักครู่แล้วลองใหม่'); } catch(e){}
        return;
      }
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
        closeBtn.addEventListener('click', () => {
          try {
            const vid = overlay.querySelector('video');
            if (vid && vid.srcObject) {
              try {
                const tracks = vid.srcObject.getTracks();
                tracks.forEach(t => t.stop());
              } catch(e){}
              try { vid.srcObject = null; } catch(e){}
            }
          } catch(e){}
          try { overlay.remove(); } catch(e){}
          const scr = document.querySelector('script[data-game-module]');
          if (scr) try { scr.remove(); } catch(e){}
          const scoreOv = document.getElementById('score-overlay');
          if (scoreOv) try { scoreOv.remove(); } catch(e){}
          document.querySelectorAll('[data-confetti]').forEach(n => n.remove());
          try { AR.resetToIdle(); } catch(e){}
          if (careerMenu) careerMenu.style.display = 'flex';
          const careerActions = document.getElementById('career-actions');
          if (careerActions) careerActions.style.display = 'flex';
          const backBtnEl = document.getElementById('backBtn');
          if (backBtnEl) backBtnEl.style.display = 'none';
          const returnBtn2 = document.getElementById('return-btn');
          if (returnBtn2) returnBtn2.style.display = 'none';
          AR.setNoScan(true);
          const scanFrame2 = document.getElementById('scan-frame');
          if (scanFrame2) scanFrame2.style.display = 'none';
        });
      } catch (e) {
        console.error('failed loading game.html', e);
        try { alert('ไม่สามารถโหลดเกมได้ โปรดตรวจสอบว่ามีไฟล์ game.html ในโฟลเดอร์เดียวกับหน้าเว็บ'); } catch(e){}
        if (careerMenu) careerMenu.style.display = 'flex';
        const careerActions = document.getElementById('career-actions');
        if (careerActions) careerActions.style.display = 'flex';
        try { AR.resetToIdle(); } catch(e){}
      }
    });
  }

  if (surveyBtn) {
    surveyBtn.addEventListener('click', () => {
      try {
        const careerMenu = document.getElementById('career-menu');
        if (careerMenu) careerMenu.style.display = 'none';
        if (backBtnEl) backBtnEl.style.display = 'none';
        window.open('https://forms.gle/', '_blank');
      } catch(e){ console.warn(e); }
    });
  }

  if (contactBtn) {
    contactBtn.addEventListener('click', () => {
      try {
        const careerMenu = document.getElementById('career-menu');
        if (careerMenu) careerMenu.style.display = 'none';
        if (backBtnEl) backBtnEl.style.display = 'none';
        window.open('#', '_blank');
      } catch(e){ console.warn(e); }
    });
  }

  // enable game button if AR reports gameAssets already present
  try {
    const as = AR.getAssets && AR.getAssets();
    if (as && as.gameAssets && Object.keys(as.gameAssets).length > 0) {
      const gb = document.getElementById('game-btn');
      if (gb) {
        setButtonProgress(gb, 100);
        gb.classList.remove('disabled');
        gb.disabled = false;
        gb.style.background = '';
      }
    }
  } catch (e) { console.warn('initial game assets check err', e); }

  // listen for event from ar.js when game assets are ready
  document.addEventListener('game-assets-ready', () => {
    try {
      const gb = document.getElementById('game-btn');
      if (gb) {
        setButtonProgress(gb, 100);
        gb.classList.remove('disabled');
        gb.disabled = false;
        gb.style.background = '';
      }
    } catch(e){ console.warn(e); }
  });

  console.log('[UI] initUI done');
}
