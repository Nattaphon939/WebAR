// /WEB/js/survey.js
import * as AR from './ar.js'; 

const SURVEY_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfMrNoQ1fTfOyq5QtLWTc7sN2aTJFmGRKa6ldeGj4JApYYKfA/viewform?embedded=true';

export function initSurvey() {
  const surveyBtn = document.getElementById('survey-btn');
  if (!surveyBtn) return;

  surveyBtn.addEventListener('click', () => {
    try { AR.resetToIdle(); } catch(e){}
    AR.setNoScan(true); 

    const careerMenu = document.getElementById('career-menu');
    const homeBtn = document.getElementById('homeBtn'); 
    const scanFrame = document.getElementById('scan-frame');

    if (careerMenu) careerMenu.style.display = 'none';
    if (homeBtn) homeBtn.style.display = 'none';
    if (scanFrame) scanFrame.style.display = 'none';

    // สร้าง Overlay แบบสอบถาม
    const overlay = document.createElement('div');
    overlay.id = 'survey-overlay';
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '10000',
      background: '#fff', display: 'flex', flexDirection: 'column'
    });

    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex', justifyContent: 'flex-start', // ย้ายปุ่มมาซ้าย
      padding: '10px', background: '#000'
    });

    // ✅ เปลี่ยนจาก "ปิดแบบสอบถาม" เป็น "เมนูหลัก" และปรับสไตล์
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '🏠 เมนูหลัก';
    Object.assign(closeBtn.style, {
      padding: '8px 12px', borderRadius: '8px', 
      border: '1px solid rgba(255, 255, 255, 0.06)',
      background: 'rgba(0, 0, 0, 0.5)', 
      color: '#00ffff', // Accent color
      cursor: 'pointer', fontWeight: 'bold', fontSize: '14px'
    });

    closeBtn.onclick = () => {
      overlay.remove();
      if (careerMenu) careerMenu.style.display = 'flex';
      AR.setNoScan(true); 
    };

    header.appendChild(closeBtn);
    overlay.appendChild(header);

    const iframe = document.createElement('iframe');
    iframe.src = SURVEY_URL;
    Object.assign(iframe.style, {
      flex: '1', border: 'none', width: '100%', background: '#fff'
    });

    overlay.appendChild(iframe);
    document.body.appendChild(overlay);
  });
}