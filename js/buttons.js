// /WEB/js/buttons.js
import * as AR from './ar.js';
import { getAssets as getLoaderAssets } from './loader.js';

/* create wide progress bar at bottom of button */
function createButtonBarElement() {
  const wrap = document.createElement('div');
  wrap.className = 'btn-bottom-bar';
  
  const inner = document.createElement('div');
  inner.className = 'btn-bottom-inner';
  
  wrap.appendChild(inner);
  return { wrap, inner };
}

function setButtonState(btn, ready) {
  if (ready) {
    btn.classList.add('career-ready');
    // For action buttons, adding class triggers green style
    if (btn.classList.contains('action-btn')) {
      btn.classList.add('action-ready');
      btn.disabled = false;
    }
  } else {
    btn.classList.remove('career-ready');
    if (btn.classList.contains('action-btn')) {
      btn.classList.remove('action-ready');
      btn.disabled = true;
    }
  }
}

export function initButtons(){
  // 1. Init Career Buttons
  const careerBtns = Array.from(document.querySelectorAll('.career-btn'));
  const map = {}; // Store references

  if (careerBtns.length > 0) {
    careerBtns.forEach(btn => {
      const career = btn.dataset.career;
      const { wrap, inner } = createButtonBarElement();
      btn.appendChild(wrap);
      setButtonState(btn, false);
      map[career] = { btn, inner };

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (btn.classList.contains('career-ready')) {
          AR.playCareer(career);
        }
      });
    });
  }

  // 2. Init Action Buttons (Game, Survey, Contact)
  const actionIds = ['game-btn', 'survey-btn', 'contact-btn'];
  const actionMap = {};

  actionIds.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      const { wrap, inner } = createButtonBarElement();
      btn.appendChild(wrap);
      setButtonState(btn, false); // Start disabled
      actionMap[id] = { btn, inner };
    }
  });

  // --- LISTENERS ---

  // Career Progress
  document.addEventListener('career-load-progress', (ev) => {
    const d = ev.detail || {};
    const career = d.career;
    if (career && map[career]) {
      try { map[career].inner.style.width = (d.pct || 0) + '%'; } catch(e){}
    }
  });

  document.addEventListener('career-ready', (ev) => {
    const career = ev.detail && ev.detail.career;
    if (career && map[career]) {
      try { map[career].inner.style.width = '100%'; } catch(e){}
      setButtonState(map[career].btn, true);
    }
  });

  // Action Button Progress (Game, Contact, Survey)
  document.addEventListener('action-progress', (ev) => {
    const d = ev.detail || {};
    const id = d.id; // 'game-btn' or 'contact-btn'
    if (id && actionMap[id]) {
      try { 
        actionMap[id].inner.style.width = (d.pct || 0) + '%'; 
        if (d.pct >= 100) {
           setButtonState(actionMap[id].btn, true);
        }
      } catch(e){}
    }
  });

  // Auto-ready Survey button (because it's just a link)
  if (actionMap['survey-btn']) {
    setTimeout(() => {
        actionMap['survey-btn'].inner.style.width = '100%';
        setButtonState(actionMap['survey-btn'].btn, true);
    }, 1500); // Fake delay for effect
  }

  // Check already loaded assets
  try {
    const loaded = (typeof getLoaderAssets === 'function') ? getLoaderAssets() : null;
    if (loaded) {
      Object.keys(loaded).forEach(c => {
        const a = loaded[c] || {};
        if (a.modelBlobUrl && a.videoBlobUrl && map[c]) {
          setButtonState(map[c].btn, true);
          map[c].inner.style.width = '100%';
        }
      });
    }
  } catch(e){}
}