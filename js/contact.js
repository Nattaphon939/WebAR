// /WEB/js/contact.js
import * as AR from './ar.js'; 
import * as THREE from 'three';
import * as Utils from './ar-utils.js';

const FACEBOOK_URL = 'https://www.facebook.com/ComputerEngineering.rmutl';
const FACEBOOK_DEEP_LINK = 'fb://facewebmodal/f?href=' + FACEBOOK_URL;
const VIDEO_BG_PATH = './Contact/Contact.mp4'; 
const MODEL_PATH = './Contact/Contact.glb'; 
const AUDIO_PATH = './Contact/Contact.wav';

// 🔥 Global Variables
let isLoaded = false;
let overlay = null;
let bgVideo = null;
let sound = null;
let mixer = null;
let renderer = null;
let scene = null;
let homeBtn = null;
let clock = new THREE.Clock();
let rafId = null; 
let careerMenu = null;
let initTimeout = null;

export function initContact() {
  const contactBtn = document.getElementById('contact-btn');
  careerMenu = document.getElementById('career-menu');
  if (!contactBtn) return;

  // -----------------------------------------------------------
  // 🧹 ฟังก์ชันทำลายตัวเอง (Destroy)
  // -----------------------------------------------------------
  const destroyContact = () => {
      console.log("💥 Contact destroyed because other content selected.");
      
      if(initTimeout) clearTimeout(initTimeout);
      if (overlay) overlay.remove();
      if (renderer) { renderer.dispose(); renderer.forceContextLoss(); }
      if (sound) { sound.pause(); sound = null; }
      if (rafId) cancelAnimationFrame(rafId);
      
      overlay = null;
      bgVideo = null;
      mixer = null;
      isLoaded = false;
      
      // เอาตัวดักฟังออกด้วย (เพื่อไม่ให้ทำงานซ้ำซ้อน)
      if(careerMenu) {
          careerMenu.style.zIndex = ''; 
          careerMenu.removeEventListener('click', menuClickListener);
      }
  };

  // -----------------------------------------------------------
  // 👂 ตัวดักฟัง: ถ้ากดปุ่มอื่นในเมนู -> ลบ Contact ทิ้ง
  // -----------------------------------------------------------
  const menuClickListener = (e) => {
      // เช็คว่าสิ่งที่กด คือปุ่ม Contact หรือเปล่า?
      const clickedContact = e.target.closest('#contact-btn');
      
      if (clickedContact) {
          // ถ้ากด Contact (ตัวเอง) -> ไม่ต้องทำลาย (เพราะจะ Resume)
          return;
      }

      // ถ้ากดสิ่งอื่นใดในเมนู (เช่น AI, Cloud, หรือพื้นที่ว่างๆ ที่เป็นปุ่ม)
      // ให้ถือว่าเปลี่ยนเรื่อง -> ระเบิดตัวเองทิ้งเลย
      destroyContact();
  };

  // =========================================================
  // 🟢 CLICK EVENT (Main Logic)
  // =========================================================
  contactBtn.addEventListener('click', () => {
    try { AR.resetToIdle(); } catch(e){}
    AR.setNoScan(true); 

    if(careerMenu) {
        careerMenu.style.display = 'none';
        // เอา Listener ออกก่อน (กันพลาด) เดี๋ยวจะใส่กลับตอนกด Home
        careerMenu.removeEventListener('click', menuClickListener);
    }
    if(document.getElementById('homeBtn')) document.getElementById('homeBtn').style.display = 'none';

    // -------------------------------------------------------
    // 🔁 CASE 1: RESUME (กดรอบที่ 2)
    // -------------------------------------------------------
    if (isLoaded && overlay) {
        if(homeBtn) homeBtn.style.display = 'flex';
        
        // 1. Reset & Sync Logic
        if(sound) sound.pause();
        if(bgVideo) bgVideo.pause();
        if(mixer) mixer.timeScale = 0;

        if(sound) sound.currentTime = 0;
        if(bgVideo) bgVideo.currentTime = 0;

        if(mixer) {
             mixer.stopAllAction();
             mixer._actions.forEach(action => {
                 action.reset();
                 action.play();
                 action.paused = true; 
             });
        }

        // 2. Play with Audio-First
        if (sound) {
            sound.play().then(() => {
                if(bgVideo) bgVideo.play().catch(()=>{});
                if(mixer) {
                    mixer.timeScale = 1;
                    mixer._actions.forEach(a => a.paused = false);
                }
            }).catch(()=>{ 
                if(bgVideo) bgVideo.play();
                if(mixer) { mixer.timeScale = 1; mixer._actions.forEach(a => a.paused = false); }
            });
        }

        // 3. Start Loop
        const animateResume = () => {
            if (!overlay) return; 
            rafId = requestAnimationFrame(animateResume);
            const delta = clock.getDelta();
            if (mixer) mixer.update(delta);
            if (renderer && scene) renderer.render(scene, scene.userData.camera);
        };
        animateResume();
        return; 
    }

    // -------------------------------------------------------
    // 🆕 CASE 2: INIT (สร้างครั้งแรก)
    // -------------------------------------------------------
    isLoaded = true;

    // Overlay
    overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '10000',
      background: 'rgba(0,0,0,0.6)', 
      backdropFilter: 'blur(3px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'flex-end', 
      padding: '20px 20px 250px 20px', 
      overflow: 'hidden'
    });
    document.body.appendChild(overlay);

    // Video
    bgVideo = document.createElement('video');
    bgVideo.src = VIDEO_BG_PATH;
    bgVideo.loop = true; 
    bgVideo.muted = true; 
    bgVideo.playsInline = true;
    bgVideo.autoplay = false; 
    Object.assign(bgVideo.style, {
      position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
      objectFit: 'cover', opacity: '0.8', zIndex: '0'
    });
    overlay.appendChild(bgVideo);

    // 3D Layer
    const modelLayer = document.createElement('div');
    Object.assign(modelLayer.style, {
        position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: '1' 
    });
    overlay.appendChild(modelLayer);

    scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.2, 4); 
    camera.lookAt(0, 1.0, 0);
    scene.userData = { camera: camera }; 

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputEncoding = THREE.sRGBEncoding; 
    modelLayer.appendChild(renderer.domElement);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5); 
    scene.add(hemiLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0); 
    dirLight.position.set(2, 5, 5);
    scene.add(dirLight);

    // Load Model
    Utils.loadGLTF(MODEL_PATH).then((gltf) => {
        if (!gltf) { alert("โหลดโมเดลไม่สำเร็จ"); return; }
        const model = gltf.scene;
        
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        model.position.x -= center.x;
        model.position.z -= center.z; 
        model.position.y -= box.min.y; 

        const targetHeight = 0.5; 
        const scaleFactor = targetHeight / size.y;
        if (size.y > 0) model.scale.multiplyScalar(scaleFactor);
        
        model.position.x -= 0.7;   
        model.position.y -= 1.05;  
        model.rotation.y = 0.25; 

        model.traverse((node) => {
            if (node.isMesh) {
                node.frustumCulled = false; 
                if (node.material) {
                    node.material.side = THREE.DoubleSide;
                    if (node.material.transparent) {
                        node.material.alphaTest = 0.5; node.material.depthWrite = true; 
                    }
                }
            }
        });

        if (gltf.animations && gltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(model);
            gltf.animations.forEach((clip) => {
                const action = mixer.clipAction(clip);
                action.setLoop(THREE.LoopOnce); 
                action.clampWhenFinished = true; 
                action.play();
                action.paused = true; 
            });
            mixer.update(0);
        }

        scene.add(model);

        // Sync Start (First Load)
        initTimeout = setTimeout(() => {
            if (!overlay) return; 
            try { 
                sound = new Audio(AUDIO_PATH);
                sound.volume = 1.0;
                sound.play().then(() => {
                    if(bgVideo) {
                        bgVideo.currentTime = 0; 
                        bgVideo.play().catch(()=>{});
                    }
                    if(mixer) {
                         mixer.timeScale = 1; 
                         mixer._actions.forEach(action => action.paused = false);
                    }
                }).catch(() => {
                    if(bgVideo) bgVideo.play();
                    if(mixer) { mixer.timeScale = 1; mixer._actions.forEach(action => action.paused = false); }
                });
            } catch(e){}
        }, 2000); 
    });

    const animate = () => {
        if (!overlay) return;
        rafId = requestAnimationFrame(animate);
        const delta = clock.getDelta();
        if (mixer) mixer.update(delta);
        renderer.render(scene, camera);
    };
    animate();

    window.addEventListener('resize', () => {
        if (!overlay) return;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    setupUI(overlay);
  });
}

function setupUI(overlay) {
    const contentContainer = document.createElement('div');
    Object.assign(contentContainer.style, {
      position: 'relative', width: '100%', maxWidth: '500px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: '20px', zIndex: '2'
    });

    const fbWrapper = document.createElement('div');
    Object.assign(fbWrapper.style, { position: 'relative', display: 'inline-block' });

    const fbLink = document.createElement('a');
    fbLink.href = '#'; 
    Object.assign(fbLink.style, {
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
      textDecoration: 'none', cursor: 'pointer',
      padding: '25px 40px', borderRadius: '20px',
      background: 'linear-gradient(135deg, rgba(24, 119, 242, 0.9), rgba(0, 0, 0, 0.8))',
      border: '2px solid #1877F2',
      boxShadow: '0 0 25px rgba(24, 119, 242, 0.6)',
      transition: 'transform 0.2s ease'
    });
    fbLink.onclick = (e) => {
      e.preventDefault(); 
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile) {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none'; iframe.src = FACEBOOK_DEEP_LINK;
        document.body.appendChild(iframe);
        setTimeout(() => {
          document.body.removeChild(iframe);
          window.open(FACEBOOK_URL, '_blank');
        }, 500);
      } else { window.open(FACEBOOK_URL, '_blank'); }
    };
    fbLink.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" style="fill:#1877F2; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
        <path d="M12 0c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm3 8h-1.35c-.538 0-.65.221-.65.778v1.222h2l-.209 2h-1.791v7h-3v-7h-2v-2h2v-2.308c0-1.769.931-2.692 3.029-2.692h1.971v3z"/>
      </svg>
      <span style="color:#fff; font-family: sans-serif; font-size: 18px; font-weight: bold; text-shadow: 0 2px 4px rgba(0,0,0,0.8);">ไปที่เพจ Facebook</span>
    `;
    fbWrapper.appendChild(fbLink);

    const handIcon = document.createElement('div');
    handIcon.innerHTML = `
      <svg viewBox="0 0 24 24" fill="white" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:100%; height:100%; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.5));">
        <path d="M14 9l-6 6"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
      </svg>
    `;
    Object.assign(handIcon.style, {
      position: 'absolute', width: '70px', height: '70px',
      bottom: '-60px', right: '-30px', transform: 'rotate(-30deg)', pointerEvents: 'none', zIndex: '10'
    });
    if (!document.getElementById('hand-point-anim')) {
      const s = document.createElement('style'); s.id = 'hand-point-anim';
      s.innerText = `@keyframes hand-point-click { 0%, 100% { transform: translate(0, 0) rotate(-30deg); } 50% { transform: translate(-15px, -15px) rotate(-30deg) scale(0.9); } }`;
      document.head.appendChild(s);
    }
    handIcon.style.animation = 'hand-point-click 1.5s ease-in-out infinite';
    fbWrapper.appendChild(handIcon);
    contentContainer.appendChild(fbWrapper);
    overlay.appendChild(contentContainer);

    // =========================================================
    // 🏠 ปุ่มเมนูหลัก (PAUSE & HIDE -> Wait for Destroy trigger)
    // =========================================================
    homeBtn = document.createElement('button');
    homeBtn.innerHTML = '🏠 เมนูหลัก';
    Object.assign(homeBtn.style, {
      position: 'absolute', top: '20px', left: '20px',
      padding: '10px 16px', borderRadius: '10px',
      border: '1px solid rgba(255, 255, 255, 0.1)', 
      background: 'rgba(0, 0, 0, 0.6)', color: '#00ffff', 
      fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', zIndex: '10001', display: 'flex', alignItems: 'center', gap: '8px'
    });
    
    homeBtn.onclick = () => {
      // 1. Pause
      if (sound) sound.pause();
      if (bgVideo) bgVideo.pause();
      if (mixer) mixer.timeScale = 0; 
      if (rafId) cancelAnimationFrame(rafId); 

      // 2. Hide Self
      homeBtn.style.display = 'none';

      // 3. Show Career Menu
      if (careerMenu) {
          careerMenu.style.display = 'flex';
          careerMenu.style.zIndex = '20000'; 
          
          // 🔥 ฝังกับระเบิด: กดปุ่มอื่นในเมนูเมื่อไหร่ -> ระเบิด Contact ทิ้งทันที
          careerMenu.addEventListener('click', (e) => {
              // (เรียกฟังก์ชันข้างบนไม่ได้โดยตรง ต้องใช้ Logic เดียวกัน)
              if (e.target.closest('#contact-btn')) return; // ถ้ากด Contact ไม่ต้องระเบิด (เดี๋ยว Resume)
              
              if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                  // COPY LOGIC DESTROY มาใส่ตรงนี้เพื่อให้ทำงานได้
                  if(initTimeout) clearTimeout(initTimeout);
                  if (overlay) overlay.remove();
                  if (renderer) { renderer.dispose(); renderer.forceContextLoss(); }
                  if (sound) { sound.pause(); sound = null; }
                  if (rafId) cancelAnimationFrame(rafId);
                  overlay = null; bgVideo = null; mixer = null; isLoaded = false;
                  careerMenu.style.zIndex = ''; 
              }
          });
      }
      AR.setNoScan(true); 
    };
    overlay.appendChild(homeBtn);
}