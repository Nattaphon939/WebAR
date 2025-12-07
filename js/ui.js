// /WEB/js/ui.js
import * as AR from './ar.js';
import { initButtons } from './buttons.js';
import { initSurvey } from './survey.js';
import { initContact } from './contact.js';
import { initGameLauncher } from './game-launcher.js'; // Import ตัวใหม่

let isUIInitialized = false;

export function initUI(){
  if (isUIInitialized) return;
  
  // 1. เริ่มต้นปุ่ม Animation
  initButtons();

  // 2. เริ่มต้นโมดูลย่อย (แยกไฟล์กันชัดเจน)
  initSurvey();       // ดูแลเรื่อง Google Form
  initContact();      // ดูแลเรื่อง Video/FB
  initGameLauncher(); // ดูแลเรื่อง Game Overlay

  // 3. ปุ่มควบคุม Global (Back & Return)
  const backBtn = document.getElementById('backBtn');
  if (backBtn) backBtn.addEventListener('click', ()=> {
    AR.pauseAndShowMenu();
    AR.setNoScan(true);
  });

  const returnBtn = document.getElementById('return-btn');
  if (returnBtn) {
    try { returnBtn.style.display = 'none'; } catch(e){}
    returnBtn.addEventListener('click', ()=> { AR.returnToLast(); });
  }

  isUIInitialized = true;
}