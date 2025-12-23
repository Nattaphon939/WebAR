// /WEB/js/ui.js
import * as AR from './ar.js';
import { initButtons } from './buttons.js';
import { initSurvey } from './survey.js';
import { initContact } from './contact.js';
import { initGameLauncher } from './game-launcher.js';

let isUIInitialized = false;

export function initUI(){
  if (isUIInitialized) return;
  
  // 1. เริ่มต้นปุ่ม Animation
  initButtons();

  // 2. เริ่มต้นโมดูลย่อย
  initSurvey();       
  initContact();      
  initGameLauncher(); 

  // ✅ เปลี่ยนจาก backBtn เป็น homeBtn และสั่งให้ Pause & Show Menu
  const homeBtn = document.getElementById('homeBtn');
  if (homeBtn) homeBtn.addEventListener('click', ()=> {
    AR.pauseAndShowMenu();
    AR.setNoScan(true);
  });

  // ปุ่มในเมนู "กลับไปเล่นคอนเทนต์เดิม"
  const returnBtn = document.getElementById('return-btn');
  if (returnBtn) {
    try { returnBtn.style.display = 'none'; } catch(e){}
    returnBtn.addEventListener('click', ()=> { AR.returnToLast(); });
  }

  isUIInitialized = true;
}