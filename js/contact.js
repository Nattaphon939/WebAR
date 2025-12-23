// /WEB/js/contact.js
import * as AR from './ar.js'; 

const FACEBOOK_URL = 'https://www.facebook.com/ComputerEngineering.rmutl';
const FACEBOOK_DEEP_LINK = 'fb://facewebmodal/f?href=' + FACEBOOK_URL;

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

    // 1. สร้าง Overlay พื้นหลัง
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '10000',
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '20px'
    });

    // 2. สร้าง Container สำหรับเนื้อหา
    const contentContainer = document.createElement('div');
    Object.assign(contentContainer.style, {
      position: 'relative', // สำคัญสำหรับจัดตำแหน่ง
      width: '100%', maxWidth: '500px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: '20px'
    });

    // 3. Wrapper สำหรับปุ่ม Facebook + มือ
    const fbWrapper = document.createElement('div');
    Object.assign(fbWrapper.style, {
      position: 'relative', // เพื่อให้มืออ้างอิงตำแหน่งได้
      display: 'inline-block',
      marginTop: '40px' // ดันลงมาหน่อยให้อยู่กลางๆ
    });

    // 4. สร้างปุ่ม Facebook
    const fbLink = document.createElement('a');
    fbLink.href = '#'; 
    Object.assign(fbLink.style, {
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
      textDecoration: 'none', cursor: 'pointer',
      padding: '25px 40px', borderRadius: '20px',
      background: 'linear-gradient(135deg, rgba(24, 119, 242, 0.2), rgba(0, 0, 0, 0.6))',
      border: '2px solid #1877F2',
      boxShadow: '0 0 25px rgba(24, 119, 242, 0.4)',
      transition: 'transform 0.2s ease'
    });

    fbLink.onmouseover = () => fbLink.style.transform = 'scale(1.05)';
    fbLink.onmouseout = () => fbLink.style.transform = 'scale(1.0)';

    fbLink.onclick = (e) => {
      e.preventDefault(); 
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile) {
        const start = Date.now();
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = FACEBOOK_DEEP_LINK;
        document.body.appendChild(iframe);
        setTimeout(() => {
          document.body.removeChild(iframe);
          if (Date.now() - start < 2000) window.open(FACEBOOK_URL, '_blank');
        }, 500);
      } else {
        window.open(FACEBOOK_URL, '_blank');
      }
    };

    fbLink.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" style="fill:#1877F2; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
        <path d="M12 0c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm3 8h-1.35c-.538 0-.65.221-.65.778v1.222h2l-.209 2h-1.791v7h-3v-7h-2v-2h2v-2.308c0-1.769.931-2.692 3.029-2.692h1.971v3z"/>
      </svg>
      <span style="color:#fff; font-family: sans-serif; font-size: 18px; font-weight: bold; text-shadow: 0 2px 4px rgba(0,0,0,0.8);">
        ไปที่เพจ Facebook
      </span>
    `;
    
    fbWrapper.appendChild(fbLink);

    // 5. เพิ่มมือชี้ (Hand Gesture)
    const handIcon = document.createElement('div');
    handIcon.innerHTML = `
      <svg viewBox="0 0 24 24" fill="white" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:100%; height:100%; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.5));">
        <path d="M14 9l-6 6"/>
        <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/>
        <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
      </svg>
    `;
    
    // Style ให้มืออยู่ด้านล่างขวาของปุ่ม แล้วชี้ขึ้นไป
    Object.assign(handIcon.style, {
      position: 'absolute',
      width: '70px', height: '70px',
      bottom: '-60px', right: '-30px', // ปรับตำแหน่งให้เห็นชัดๆ
      transform: 'rotate(-30deg)',
      pointerEvents: 'none', // ให้กดทะลุได้
      zIndex: '10'
    });

    // Inject Keyframes Animation สำหรับมือ
    if (!document.getElementById('hand-point-anim')) {
      const styleSheet = document.createElement('style');
      styleSheet.id = 'hand-point-anim';
      styleSheet.innerText = `
        @keyframes hand-point-click {
          0%, 100% { transform: translate(0, 0) rotate(-30deg); }
          50% { transform: translate(-15px, -15px) rotate(-30deg) scale(0.9); }
        }
      `;
      document.head.appendChild(styleSheet);
    }

    handIcon.style.animation = 'hand-point-click 1.5s ease-in-out infinite';
    
    fbWrapper.appendChild(handIcon);
    contentContainer.appendChild(fbWrapper);

    // ✅ บรรทัดสำคัญที่ลืมไป: ใส่ Content ลงใน Overlay
    overlay.appendChild(contentContainer);

    // 6. ปุ่มเมนูหลัก (Home)
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '🏠 เมนูหลัก';
    Object.assign(closeBtn.style, {
      position: 'absolute', top: '20px', left: '20px',
      padding: '10px 16px', borderRadius: '10px',
      border: '1px solid rgba(255, 255, 255, 0.1)', 
      background: 'rgba(0, 0, 0, 0.6)', 
      color: '#00ffff', 
      fontSize: '16px', fontWeight: 'bold', 
      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
      zIndex: '10001'
    });
    
    closeBtn.onclick = () => {
      overlay.remove();
      if (careerMenu) careerMenu.style.display = 'flex';
      AR.setNoScan(true);
    };
    overlay.appendChild(closeBtn);

    document.body.appendChild(overlay);
  });
}