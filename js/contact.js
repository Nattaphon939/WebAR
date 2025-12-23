// /WEB/js/contact.js
import * as AR from './ar.js'; 

const FACEBOOK_URL = 'https://www.facebook.com/ComputerEngineering.rmutl';
const CONTACT_VIDEO_PATH = 'Contact/Contact.mp4';

export function initContact() {
  const contactBtn = document.getElementById('contact-btn');
  if (!contactBtn) return;

  contactBtn.addEventListener('click', () => {
    try { AR.resetToIdle(); } catch(e){}
    AR.setNoScan(true);

    const careerMenu = document.getElementById('career-menu');
    if (careerMenu) careerMenu.style.display = 'none';
    const homeBtn = document.getElementById('homeBtn');
    if (homeBtn) homeBtn.style.display = 'none';

    // Overlay พื้นหลัง
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '10000',
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '20px'
    });

    const contentContainer = document.createElement('div');
    Object.assign(contentContainer.style, {
      width: '100%', maxWidth: '500px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px'
    });

    // Video
    const videoContainer = document.createElement('div');
    videoContainer.innerHTML = `
      <div style="width: 100%; border-radius: 16px; overflow: hidden; border: 2px solid #00ffff; box-shadow: 0 0 20px rgba(0,255,255,0.4); background:#000;">
        <video src="${CONTACT_VIDEO_PATH}" controls autoplay playsinline style="width: 100%; display: block;"></video>
      </div>
    `;
    contentContainer.appendChild(videoContainer);

    // Facebook Button
    const fbLink = document.createElement('a');
    fbLink.href = FACEBOOK_URL;
    fbLink.target = '_blank';
    Object.assign(fbLink.style, {
      display: 'inline-block', textDecoration: 'none',
      transition: 'transform 0.2s ease'
    });

    fbLink.onmouseover = () => fbLink.style.transform = 'scale(1.1)';
    fbLink.onmouseout = () => fbLink.style.transform = 'scale(1.0)';

    fbLink.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
        <svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 24 24" style="fill:#1877F2; filter: drop-shadow(0 4px 8px rgba(24,119,242,0.5));">
          <path d="M12 0c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm3 8h-1.35c-.538 0-.65.221-.65.778v1.222h2l-.209 2h-1.791v7h-3v-7h-2v-2h2v-2.308c0-1.769.931-2.692 3.029-2.692h1.971v3z"/>
        </svg>
        <span style="color:#fff; font-family:sans-serif; font-size:14px; opacity:0.8;">ไปที่เพจ Facebook</span>
      </div>
    `;
    contentContainer.appendChild(fbLink);
    overlay.appendChild(contentContainer);

    // ✅ เปลี่ยนจากปุ่ม X เป็นปุ่ม Home (เมนูหลัก)
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '🏠 เมนูหลัก';
    Object.assign(closeBtn.style, {
      position: 'absolute', top: '12px', left: '12px', // ย้ายมาซ้ายบน
      padding: '8px 12px', borderRadius: '8px',
      border: '1px solid rgba(255, 255, 255, 0.06)', 
      background: 'rgba(0, 0, 0, 0.5)', 
      color: '#00ffff', // Accent color
      fontSize: '14px', fontWeight: 'bold', 
      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
    });
    
    closeBtn.onclick = () => {
      overlay.remove();
      // กลับสู่หน้า Menu
      if (careerMenu) careerMenu.style.display = 'flex';
      AR.setNoScan(true);
    };
    overlay.appendChild(closeBtn);

    document.body.appendChild(overlay);
  });
}