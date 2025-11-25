// /WEB/js/buttons.js  (REPLACE FULL)
import * as AR from './ar.js';
import { getAssets as getLoaderAssets } from './loader.js';

/* create wide progress bar at bottom-center inside button */
function createButtonBarElement() {
  const wrap = document.createElement('div');
  wrap.className = 'btn-bottom-bar';
  wrap.style.position = 'absolute';
  wrap.style.left = '6px';
  wrap.style.right = '6px';
  wrap.style.bottom = '6px';
  wrap.style.width = 'auto';
  wrap.style.height = '8px';
  wrap.style.borderRadius = '8px';
  wrap.style.background = 'rgba(255,255,255,0.06)';
  wrap.style.overflow = 'hidden';
  wrap.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,0.06)';
  wrap.style.pointerEvents = 'none';

  const inner = document.createElement('div');
  inner.className = 'btn-bottom-inner';
  inner.style.height = '100%';
  inner.style.width = '0%';
  inner.style.transition = 'width .28s ease';
  inner.style.background = 'linear-gradient(90deg,#00e5ff,#0077ff)';
  wrap.appendChild(inner);
  return { wrap, inner };
}

function setButtonState(btn, ready) {
  if (ready) {
    btn.disabled = false;
    btn.style.filter = '';
    btn.style.opacity = '1';
    btn.classList.add('career-ready');
    // visual highlight
    btn.style.boxShadow = '0 10px 28px rgba(0,183,255,0.18)';
    btn.style.transform = 'translateY(-2px)';
  } else {
    btn.disabled = true;
    btn.style.filter = 'grayscale(24%) brightness(0.72)';
    btn.style.opacity = '0.9';
    btn.classList.remove('career-ready');
    btn.style.boxShadow = '';
    btn.style.transform = '';
  }
}

export function initButtons(){
  const btns = Array.from(document.querySelectorAll('.career-btn'));
  if (!btns || btns.length === 0) return;

  const map = {};
  btns.forEach(btn => {
    // ensure relative for absolute bar
    btn.style.position = 'relative';
    const career = btn.dataset.career;
    const { wrap, inner } = createButtonBarElement();
    wrap.setAttribute('data-bar-for', career);
    btn.appendChild(wrap);
    setButtonState(btn, false);
    map[career] = { btn, inner, wrap };

    // click -> AR.playCareer only if ready
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const isReady = btn.classList.contains('career-ready');
      if (!isReady) return;
      AR.playCareer(career);
    });
  });

  // listen loader events (career-load-progress)
  document.addEventListener('career-load-progress', (ev) => {
    const d = ev.detail || {};
    const career = d.career;
    if (!career || !map[career]) return;
    // ensure numeric pct if provided
    const pct = Math.max(0, Math.min(100, d.pct || 0));
    try { map[career].inner.style.width = pct + '%'; } catch(e){}
  });

  document.addEventListener('career-ready', (ev) => {
    const career = ev.detail && ev.detail.career;
    if (!career || !map[career]) return;
    try { map[career].inner.style.width = '100%'; } catch(e){}
    setButtonState(map[career].btn, true);
  });

  // reflect already loaded assets (if AR.getAssets present)
  try {
    const loaded = (typeof getLoaderAssets === 'function') ? getLoaderAssets() : (AR.getAssets ? AR.getAssets() : null);
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
