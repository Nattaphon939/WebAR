// js/ui.js
import * as AR from './ar.js';

function makeCareerButtonHTML(label) {
  // structure: label + overlay progress bar
  return `
    <div class="career-btn-inner">
      <span class="career-label">${label}</span>
      <div class="career-progress-wrap" aria-hidden="true">
        <div class="career-progress-bar"></div>
      </div>
    </div>
  `;
}

export function initUI() {
  // replace existing career-list buttons with enhanced structure (if not already)
  document.querySelectorAll('.career-btn').forEach(btn => {
    const career = btn.dataset.career || btn.textContent.trim();
    // only replace inner HTML once
    if (!btn.querySelector('.career-btn-inner')) {
      btn.innerHTML = makeCareerButtonHTML(btn.textContent.trim());
      // make button visually disabled if not ready
      btn.classList.add('career-waiting');
    }
  });

  // helper: update button progress UI (0..100)
  function setCareerProgress(career, pct) {
    const btn = document.querySelector(`.career-btn[data-career="${career}"]`);
    if (!btn) return;
    const bar = btn.querySelector('.career-progress-bar');
    if (bar) {
      bar.style.width = pct + '%';
    }
    if (pct >= 100) {
      btn.classList.remove('career-waiting');
      btn.classList.add('career-ready');
      btn.disabled = false;
    } else {
      btn.classList.add('career-waiting');
      btn.classList.remove('career-ready');
      btn.disabled = true;
    }
  }

  // initialize progress for known assets (check AR.isCareerReady)
  document.querySelectorAll('.career-btn').forEach(btn=>{
    const career = btn.dataset.career;
    try {
      if (AR.isCareerReady && AR.isCareerReady(career)) {
        setCareerProgress(career, 100);
      } else {
        setCareerProgress(career, 0);
      }
    } catch(e) {
      setCareerProgress(career, 0);
    }
  });

  // listen to global career-load-progress event emitted by ar.js
  document.addEventListener('career-load-progress', (ev)=> {
    const { career, pct } = ev.detail || {};
    if (!career) return;
    setCareerProgress(career, Math.max(0, Math.min(100, pct || 0)));
  });

  // wire button clicks
  document.querySelectorAll('.career-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=> {
      const career = btn.dataset.career;
      if (!career) return;
      // if career already ready -> play immediately
      if (AR.isCareerReady && AR.isCareerReady(career)) {
        // hide menu when user selects an explicit career
        const careerMenu = document.getElementById('career-menu');
        if (careerMenu) careerMenu.style.display = 'none';
        AR.playCareer(career);
        return;
      }
      // otherwise start ensureCareerLoaded and update UI until 100 then play
      btn.classList.add('career-loading');
      btn.disabled = true;
      try {
        await AR.ensureCareerLoaded(career, (pct)=>{
          // progress handler (also handled by global event) - we optionally set UI immediately
          const bar = btn.querySelector('.career-progress-bar');
          if (bar) bar.style.width = pct + '%';
        });
        // once ready, close menu and play
        const careerMenu = document.getElementById('career-menu');
        if (careerMenu) careerMenu.style.display = 'none';
        AR.playCareer(career);
      } catch(e) {
        console.warn('failed ensureCareerLoaded', career, e);
        btn.classList.remove('career-loading');
        // leave as waiting so user can try again
      } finally {
        btn.classList.remove('career-loading');
      }
    });
  });

  // backBtn behavior already handled in ar.js; nothing extra here

  // return button: when pressed, call returnToLast() AND hide menu
  const returnBtn = document.getElementById('return-btn');
  if (returnBtn) {
    returnBtn.addEventListener('click', ()=> {
      try { AR.returnToLast(); } catch(e){ console.warn(e); }
      // hide menu when returning
      const careerMenu = document.getElementById('career-menu');
      if (careerMenu) careerMenu.style.display = 'none';
    });
  }

  // game / survey / contact (unchanged behavior)
  const gameBtn = document.getElementById('game-btn');
  const surveyBtn = document.getElementById('survey-btn');
  const contactBtn = document.getElementById('contact-btn');

  if (gameBtn) gameBtn.addEventListener('click', async ()=> {
    try { AR.resetToIdle(); } catch(e){ console.warn('resetToIdle err', e); }
    AR.setNoScan(true);
    const careerMenu = document.getElementById('career-menu');
    if (careerMenu) careerMenu.style.display = 'none';
    const scanFrame = document.getElementById('scan-frame');
    if (scanFrame) scanFrame.style.display = 'none';
    // load overlay game.html into overlay logic from earlier code base
    // (existing logic in main/ui will inject game.html and script)
    // to keep this file compact we assume previous code for game overlay still runs
    const existingHandler = window.openGameOverlay;
    if (typeof existingHandler === 'function') {
      existingHandler();
    } else {
      // fallback: dispatch event so main code can open game overlay
      document.dispatchEvent(new CustomEvent('open-game-overlay'));
    }
  });

  if (surveyBtn) surveyBtn.addEventListener('click', ()=> {
    const careerMenu = document.getElementById('career-menu');
    if (careerMenu) careerMenu.style.display = 'none';
    if (backBtn) try { backBtn().style.display = 'none'; } catch(e){}
    window.open('https://forms.gle/', '_blank');
  });

  if (contactBtn) contactBtn.addEventListener('click', ()=> {
    const careerMenu = document.getElementById('career-menu');
    if (careerMenu) careerMenu.style.display = 'none';
    if (backBtn) try { backBtn().style.display = 'none'; } catch(e){}
    window.open('#', '_blank');
  });
}
