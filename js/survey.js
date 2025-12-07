// /WEB/js/survey.js
import * as AR from './ar.js'; // ✅ Import AR เพื่อสั่งลบคอนเทนต์

const SURVEY_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfMrNoQ1fTfOyq5QtLWTc7sN2aTJFmGRKa6ldeGj4JApYYKfA/viewform?embedded=true';

export function initSurvey() {
  const surveyBtn = document.getElementById('survey-btn');
  if (!surveyBtn) return;

  surveyBtn.addEventListener('click', () => {
    // ✅ 1. ลบคอนเทนต์ AR เดิมออกทันที (ไม่ต้องพัก)
    try { AR.resetToIdle(); } catch(e){}
    AR.setNoScan(true); // ปิดการสแกนด้วย

    // 2. ซ่อน UI เดิม (Menu, BackBtn, ScanFrame)
    const careerMenu = document.getElementById('career-menu');
    const backBtn = document.getElementById('backBtn');
    const scanFrame = document.getElementById('scan-frame');

    if (careerMenu) careerMenu.style.display = 'none';
    if (backBtn) backBtn.style.display = 'none';
    if (scanFrame) scanFrame.style.display = 'none';

    // 3. สร้าง Overlay แบบสอบถาม
    const overlay = document.createElement('div');
    overlay.id = 'survey-overlay';
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '10000',
      background: '#fff', display: 'flex', flexDirection: 'column'
    });

    // Header (ปุ่มปิด)
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex', justifyContent: 'flex-end', padding: '10px', background: '#000'
    });

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕ ปิดแบบสอบถาม';
    Object.assign(closeBtn.style, {
      padding: '8px 16px', borderRadius: '8px', border: '1px solid #333',
      background: '#1a1a1a', color: '#fff', cursor: 'pointer', fontWeight: 'bold'
    });

    closeBtn.onclick = () => {
      overlay.remove();
      // เมื่อปิดแล้ว ให้กลับมาหน้า Menu หลัก (Idle State)
      if (careerMenu) careerMenu.style.display = 'flex';
      // เปิดการสแกนใหม่เพื่อให้เริ่มเล่นใหม่ได้
      AR.setNoScan(true); 
    };

    header.appendChild(closeBtn);
    overlay.appendChild(header);

    // Iframe
    const iframe = document.createElement('iframe');
    iframe.src = SURVEY_URL;
    Object.assign(iframe.style, {
      flex: '1', border: 'none', width: '100%', background: '#fff'
    });

    overlay.appendChild(iframe);
    document.body.appendChild(overlay);
  });
}