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
    // --- สถานะพร้อม (Active): สีสดใส ---
    btn.disabled = false;
    btn.style.filter = ''; // เอาฟิลเตอร์ออก (สีสดปกติ)
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
    btn.classList.add('career-ready');
    
    // ปุ่ม Action (Game, Survey, Contact) ให้เป็นสีเขียว
    if (btn.classList.contains('action-btn')) {
      btn.classList.add('action-ready');
    }
    
    // เพิ่มมิติ (Shadow) กลับมา
    btn.style.boxShadow = '0 6px 18px rgba(0, 188, 212, 0.2)';
    btn.style.transform = 'translateY(0)';

  } else {
    // --- สถานะยังไม่พร้อม (Loading/Disabled): สีเทาด้าน ---
    btn.disabled = true;
    
    // แก้ไขตรงนี้: ปรับเป็นขาวดำ 100% และลดความสว่างลงเพื่อให้ดูจมๆ
    btn.style.filter = 'grayscale(100%) brightness(0.6) contrast(0.8)'; 
    btn.style.opacity = '0.6'; 
    btn.style.cursor = 'not-allowed';
    
    btn.classList.remove('career-ready');
    if (btn.classList.contains('action-btn')) {
      btn.classList.remove('action-ready');
    }
    
    // เอาเงาออกเพื่อให้ดูแบนราบ
    btn.style.boxShadow = 'none';
    btn.style.transform = 'none';
  }
}

export function initButtons(){
  // 1. Init Career Buttons
  const careerBtns = Array.from(document.querySelectorAll('.career-btn'));
  const map = {}; // Store references

  if (careerBtns.length > 0) {
    careerBtns.forEach(btn => {
      // บังคับให้เป็น Relative เพื่อให้บาร์โหลดแสดงถูกตำแหน่ง
      btn.style.position = 'relative';
      
      const career = btn.dataset.career;
      const { wrap, inner } = createButtonBarElement();
      btn.appendChild(wrap);
      
      // ตั้งค่าเริ่มต้นเป็น Disabled (สีเทา)
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
      btn.style.position = 'relative';
      const { wrap, inner } = createButtonBarElement();
      btn.appendChild(wrap);
      
      // ตั้งค่าเริ่มต้นเป็น Disabled (สีเทา)
      setButtonState(btn, false); 
      
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

  // Action Button Progress
  document.addEventListener('action-progress', (ev) => {
    const d = ev.detail || {};
    const id = d.id;
    if (id && actionMap[id]) {
      try { 
        actionMap[id].inner.style.width = (d.pct || 0) + '%'; 
        if (d.pct >= 100) {
           setButtonState(actionMap[id].btn, true);
        }
      } catch(e){}
    }
  });

  // Auto-ready Survey button (Fake delay for UX)
  if (actionMap['survey-btn']) {
    // ให้ปุ่ม Survey เริ่มโหลด (สีเทา -> ฟ้าวิ่ง -> เขียว)
    setTimeout(() => {
        // จำลองการโหลด
        let p = 0;
        const intv = setInterval(() => {
            p += 10;
            if(actionMap['survey-btn'].inner) actionMap['survey-btn'].inner.style.width = p + '%';
            if(p >= 100) {
                clearInterval(intv);
                setButtonState(actionMap['survey-btn'].btn, true);
            }
        }, 100);
    }, 500);
  }

  // Check already loaded assets (Re-apply state for cached items)
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