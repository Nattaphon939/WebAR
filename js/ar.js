// /WEB/js/ar.js (Fixed: Rotation Direction)
import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';

// 1. นำเข้า Loader และ Data
import { ensureCareerAssets, getAssets, JOB_ROOT, careers } from './loader.js';

// 2. นำเข้า Utils
import * as Utils from './ar-utils.js';

// --- Global State ---
const assets = getAssets();
let mindarThree, renderer, scene, camera;
let anchor, contentGroup = null; 
let gltfModel = null, videoElem = null, videoMesh = null;
let mixer = null, clock = new THREE.Clock();

let playingCareer = null;
let lastCareer = null;
let isPausedByBack = false;

let isVideoFinished = false;
let isModelFinished = false;
let autoPlayEnabled = true;

let isAnchorTracked = false;
let waitingForMarkerPlay = false;
let pausedByTrackingLoss = false;
let noScanMode = false;

// --- DOM References ---
const scanFrame = () => document.getElementById('scan-frame');
const careerMenu = () => document.getElementById('career-menu');
const careerActions = () => document.getElementById('career-actions');
const backBtn = () => document.getElementById('backBtn');

// --- Exported Functions ---

export function setAutoPlayEnabled(flag) { autoPlayEnabled = !!flag; }

export function setNoScan(flag) {
  noScanMode = !!flag;
  Utils.setNoScanUI(flag, scanFrame());
}

export function getAssetsReference() { return assets; }

// --- Core Logic ---

function checkBothFinished() {
  if (videoElem && !isVideoFinished) return;
  if (mixer && !isModelFinished) return;
  
  // Finish Sequence
  lastCareer = playingCareer;
  clearAnchorContent(false);
  playingCareer = null;
  isPausedByBack = false;
  
  if (lastCareer && ['AI','Cloud','Data_Center','Network'].includes(lastCareer)) {
    if (careerActions()) careerActions().style.display = 'flex';
  }
  if (careerMenu()) careerMenu().style.display = 'flex';
  if (backBtn()) backBtn().style.display = 'none';
  if (scanFrame()) scanFrame().style.display = 'none';

  try { document.dispatchEvent(new CustomEvent('career-ready', { detail: { career: lastCareer } })); } catch(e){}
}

function clearAnchorContent(keep=false) {
  if (keep) {
    if (videoElem) try { videoElem.pause(); } catch(e){}
    if (mixer) try { mixer.timeScale = 0; } catch(e){}
    isPausedByBack = true;
    waitingForMarkerPlay = false;
    pausedByTrackingLoss = false;
    return;
  }
  
  if (contentGroup) {
    while(contentGroup.children.length > 0) contentGroup.remove(contentGroup.children[0]);
  }

  Utils.disposeDeep(gltfModel); gltfModel = null;
  Utils.disposeDeep(videoMesh); videoMesh = null;

  if (mixer) try { mixer.stopAllAction(); mixer.uncacheRoot(mixer.getRoot()); } catch(e){} 
  mixer = null;

  if (videoElem) {
    try{ videoElem.pause(); videoElem.onended = null; videoElem.src = ""; videoElem.load(); }catch{} 
  }
  videoElem = null;

  waitingForMarkerPlay = false; pausedByTrackingLoss = false;
  isVideoFinished = false; isModelFinished = false;
}

function attachContentToAnchor(gltf, video) {
  if (contentGroup) {
     while(contentGroup.children.length > 0) contentGroup.remove(contentGroup.children[0]);
  }
  gltfModel = null; videoMesh = null; videoElem = null; mixer = null;
  isVideoFinished = false; isModelFinished = false;

  // --- 1. Model ---
  if (gltf && gltf.scene) {
    gltfModel = gltf.scene;
    try { gltfModel.userData = gltfModel.userData || {}; gltfModel.userData.sourceCareer = playingCareer || 'unknown'; } catch(e){}
    
    // Config Scale/Position
    gltfModel.scale.set(0.5, 0.5, 0.5);
    gltfModel.position.set(-0.25, -0.45, 0.1);
    gltfModel.visible = false;
    
    if (contentGroup) contentGroup.add(gltfModel);
    
    // ✅ แก้ไขจุดที่ 1: เปลี่ยนจาก -0.4 เป็น 0.4 (หมุนกลับด้าน)
    try { 
        gltfModel.rotation.set(0, 0.15, 0); 
        gltfModel.updateMatrixWorld(true); 
    } catch(e){}

    // Animation
    const animations = (gltf.animations && gltf.animations.length > 0) ? gltf.animations : (gltfModel.userData && Array.isArray(gltfModel.userData._clips) ? gltfModel.userData._clips : null);
    if (animations && animations.length > 0) {
      mixer = new THREE.AnimationMixer(gltfModel);
      const actions = [];
      animations.forEach(c => {
        try {
          const action = mixer.clipAction(c);
          action.reset(); action.loop = THREE.LoopOnce; action.clampWhenFinished = true;
          action.play(); action.paused = true;
          actions.push(action);
        } catch(e){}
      });
      try { gltfModel.userData._actions = actions; } catch(e){}
      mixer.addEventListener('finished', () => { isModelFinished = true; checkBothFinished(); });
    } else { isModelFinished = true; }
    Utils.makeModelRenderPriority(gltfModel);
  } else { isModelFinished = true; }

  // --- 2. Video ---
  if (video) {
    videoElem = video;
    try { videoElem.pause(); } catch(e){}
    const texture = new THREE.VideoTexture(videoElem);
    try { texture.colorSpace = THREE.SRGBColorSpace; } catch(e){}
    
    const plane = new THREE.PlaneGeometry(0.6, 0.6 * (16/9));
    const mat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    videoMesh = new THREE.Mesh(plane, mat);
    videoMesh.visible = false;
    if (contentGroup) contentGroup.add(videoMesh);
    Utils.makeVideoLayer(videoMesh);

    // Align Video & Model
    videoElem.onloadedmetadata = () => {
      try {
        const asp = (videoElem.videoWidth / videoElem.videoHeight) || (9/16);
        const width = 0.6; const height = width / asp;
        
        if (videoMesh.geometry) videoMesh.geometry.dispose();
        videoMesh.geometry = new THREE.PlaneGeometry(width, height);
        videoMesh.position.set(0, 0, 0);

        if (gltfModel) {
            gltfModel.visible = true;
            gltfModel.scale.set(0.5, 0.5, 0.5);
            
            // ✅ แก้ไขจุดที่ 2: เปลี่ยนจาก -0.4 เป็น 0.4 เช่นกัน
            gltfModel.rotation.set(0, 0.15, 0); 
            
            gltfModel.updateMatrixWorld(true);
            
            const targetX = -0.35; 
            const videoBottom = -height / 2;
            
            // Auto align feet
            gltfModel.position.set(0, 0, 0); gltfModel.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(gltfModel);
            const feetOffset = box.min.y; 
            if (isFinite(feetOffset) && Math.abs(feetOffset) < 10) {
                 gltfModel.position.set(targetX, videoBottom - feetOffset, 0.1);
            } else {
                 gltfModel.position.set(targetX, videoBottom, 0.1);
            }
            gltfModel.updateMatrixWorld(true);
        }
      } catch(e){}
    };
    videoElem.onended = () => { isVideoFinished = true; checkBothFinished(); };
  } else { isVideoFinished = true; }
}

async function ensureContentForCareer(career) {
  if (!career) return;
  // ใช้ Loader โหลดของให้ (ไม่ต้องเขียน Fetch เอง)
  await ensureCareerAssets(career);

  const a = assets[career] || {};
  if (!gltfModel && a.modelBlobUrl) {
    const g = await Utils.loadGLTF(a.modelBlobUrl);
    if (g) {
      attachContentToAnchor(g, null);
      if (isAnchorTracked && gltfModel) {
        try { gltfModel.visible = true; if (mixer) mixer.timeScale = 1; } catch(e){}
      }
    }
  }
  if (!videoMesh && a.videoBlobUrl) {
    const v = Utils.makeVideoElem(a.videoBlobUrl);
    if (v) {
      attachContentToAnchor(gltfModel ? { scene: gltfModel } : null, v);
      if (isAnchorTracked && videoElem) {
        try { videoMesh.visible = true; } catch(e){}
      }
    }
  }
}

// --- Main Init ---

export async function initAndStart(containerElement) {
  const markerSrc = (assets['Computer'] && assets['Computer'].markerBlobUrl) ? assets['Computer'].markerBlobUrl : `${JOB_ROOT}/Computer/marker.mind`;
  
  mindarThree = new MindARThree({
    container: containerElement,
    imageTargetSrc: markerSrc,
    sticky: true,
    filterMinCF: 0.0001, filterBeta: 0.005,
    uiScanning: "no", uiLoading: "no"
  });
  
  ({ renderer, scene, camera } = mindarThree);
  
  // Renderer Setup
  try {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const w = (containerElement?.clientWidth) || window.innerWidth;
    const h = (containerElement?.clientHeight) || window.innerHeight;
    renderer.setSize(w, h, false);
    if (renderer.domElement) renderer.domElement.style.display = 'block';
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  } catch(e) {}
  
  Utils.createLights(scene);
  
  anchor = mindarThree.addAnchor(0);
  contentGroup = new THREE.Group();
  anchor.group.add(contentGroup);

  try { setNoScan(false); } catch(e){}

  await ensureContentForCareer('Computer');
  playingCareer = 'Computer';
  lastCareer = 'Computer';
  if (careerActions()) careerActions().style.display = 'none';

  // --- Event: Target Found ---
  anchor.onTargetFound = async () => {
    isAnchorTracked = true;
    hideScanFrameThen(async () => {
      try { await ensureContentForCareer(playingCareer); } catch(e){}
      try { if(contentGroup) {
          if (!contentGroup.parent) anchor.group.add(contentGroup);
          contentGroup.visible = true;
      }} catch(e){}
      try { if (gltfModel) gltfModel.visible = true; } catch(e){}
      try { if (videoMesh) videoMesh.visible = true; } catch(e){}

      if (videoElem && videoElem.videoWidth) { try { videoElem.dispatchEvent(new Event('loadedmetadata')); } catch(e){} }
      if (!autoPlayEnabled) return;

      if (pausedByTrackingLoss) {
        // Resume logic
        setTimeout(async () => {
            if (videoElem && videoElem.paused) {
              const onPlayingResume = () => { Utils.syncModelToVideo(videoElem, mixer, gltfModel); videoElem.removeEventListener('playing', onPlayingResume); };
              videoElem.addEventListener('playing', onPlayingResume);
              try { await videoElem.play(); } catch(err){ try { videoElem.muted=true; await videoElem.play(); } catch(e){} }
            }
        }, 500);
        pausedByTrackingLoss = false; waitingForMarkerPlay = false;
        return;
      }

      // Start New
      const startNow = async () => {
        // Reload Fallback
        try {
            const a = assets[playingCareer] || {};
            if (!mixer && a.modelBlobUrl) {
              const reGltf = await Utils.loadGLTF(a.modelBlobUrl);
              if (reGltf && reGltf.scene) attachContentToAnchor(reGltf, videoElem);
            }
        } catch(e){}

        if (gltfModel?.userData?._actions) {
             gltfModel.userData._actions.forEach(a => { try{ a.play(); a.paused=true; a.enabled=true; }catch(e){} });
        }
        
        if (videoElem) try { videoElem.currentTime = 0; } catch(e){}
        Utils.preSyncPose(0, mixer, gltfModel);
        
        setTimeout(async () => {
            if (videoElem) {
               const onVideoStart = () => { Utils.syncModelToVideo(videoElem, mixer, gltfModel); videoElem.removeEventListener('playing', onVideoStart); };
               videoElem.addEventListener('playing', onVideoStart);
               try { videoElem.currentTime = 0; await videoElem.play(); } 
               catch(e){ try{ videoElem.muted=true; await videoElem.play(); }catch(ee){} if(mixer) mixer.timeScale=1; }
            } else {
                if (mixer) { try { mixer.timeScale = 1; mixer.update(0); } catch(e){} }
            }
        }, 500); 
      };

      if (waitingForMarkerPlay || (videoElem && videoElem.paused && playingCareer)) {
        startNow();
        waitingForMarkerPlay = false;
      }
    });
  };

  // --- Event: Target Lost ---
  anchor.onTargetLost = () => {
    isAnchorTracked = false;
    const cm = careerMenu();
    let isMenuOpen = false;
    if (cm) {
        const st = window.getComputedStyle(cm);
        isMenuOpen = (st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0');
    }

    const sf = scanFrame();
    if (sf) {
        if (isMenuOpen) sf.style.display = 'none';
        else {
            sf.style.display = 'flex'; Array.from(sf.querySelectorAll('*')).forEach(n => n.style.display = '');
            document.body.classList.remove('no-scan');
        }
    }

    if (!autoPlayEnabled) return;
    if (videoElem && !videoElem.paused) {
      try { videoElem.pause(); videoElem.currentTime = Math.max(0, videoElem.currentTime - 0.4); pausedByTrackingLoss = true; } catch(e){}
    }
    if (mixer) try { mixer.timeScale = 0; } catch(e){}
  };

  await mindarThree.start();
  renderer.setAnimationLoop(()=> {
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);
    if (isAnchorTracked && camera && contentGroup) {
        const camPos = camera.position;
        const worldPos = new THREE.Vector3();
        contentGroup.getWorldPosition(worldPos);
        contentGroup.lookAt(new THREE.Vector3(camPos.x, worldPos.y, camPos.z));
    }
    renderer.render(scene, camera);
  });
}

// --- Controls ---

function hideScanFrameThen(callback) {
  const sf = scanFrame();
  if (!sf || noScanMode) { if(callback) callback(); return; }
  
  const cm = careerMenu();
  try {
    const cmStyle = cm ? window.getComputedStyle(cm) : null;
    if (cm && cmStyle && cmStyle.display !== 'none' && cmStyle.visibility !== 'hidden' && cmStyle.opacity !== '0') {
      sf.style.display = 'none'; if(callback) callback(); return;
    }
  } catch(e){}

  const curDisplay = window.getComputedStyle(sf).display;
  if (curDisplay === 'none') { if (callback) callback(); return; }
  
  sf.style.transition = 'opacity 200ms ease'; sf.style.opacity = '1'; sf.offsetHeight; sf.style.opacity = '0';
  setTimeout(()=> {
    try { sf.style.display = 'none'; sf.style.transition = ''; sf.style.opacity = '1'; } catch(e){}
    if (callback) callback();
  }, 220);
}

export async function playCareer(career) {
  if (backBtn()) backBtn().style.display = 'inline-block';
  if (careerMenu()) careerMenu().style.display = 'none';
  if (career !== 'Computer') {
    if (careerActions()) careerActions().style.display = 'flex';
  } else {
    if (careerActions()) careerActions().style.display = 'none';
  }

  setAutoPlayEnabled(true);
  setNoScan(false);

  if (isAnchorTracked) { const sf = scanFrame(); if(sf) sf.style.display = 'none'; }

  // Resume Case
  if (playingCareer === career) {
    isPausedByBack = false;
    if (isAnchorTracked) {
        try { if(contentGroup) { if(!contentGroup.parent) anchor.group.add(contentGroup); contentGroup.visible = true; } } catch(e){}
        Utils.ensureDracoInitialized(); // just in case
        if(videoElem) Utils.preSyncPose(videoElem.currentTime, mixer, gltfModel);
        
        setTimeout(async() => {
           if (videoElem) {
               const onResume = () => { Utils.syncModelToVideo(videoElem, mixer, gltfModel); videoElem.removeEventListener('playing', onResume); };
               videoElem.addEventListener('playing', onResume);
               videoElem.play().catch(()=>{}); 
           } else if (mixer) mixer.timeScale = 1;
       }, 500);
    } else { waitingForMarkerPlay = true; }
    return;
  }

  // Change Career
  if (playingCareer && playingCareer !== career) {
    clearAnchorContent(false);
    playingCareer = null; isPausedByBack = false; waitingForMarkerPlay = false; pausedByTrackingLoss = false;
  }

  // Load via Loader
  await ensureCareerAssets(career); // Wait for loader
  try { await ensureContentForCareer(career); } catch(e){}

  // Setup if loaded
  const a = assets[career] || {};
  if (gltfModel && gltfModel.userData && gltfModel.userData.sourceCareer !== career) clearAnchorContent(false);

  if (!gltfModel && a.modelBlobUrl) {
    try { const g = await Utils.loadGLTF(a.modelBlobUrl); attachContentToAnchor(g, null); } catch(e){}
  }
  if (!videoElem && a.videoBlobUrl) {
    try { const v = Utils.makeVideoElem(a.videoBlobUrl); attachContentToAnchor(gltfModel ? { scene: gltfModel } : null, v); } catch(e){}
  }

  playingCareer = career; lastCareer = career; isPausedByBack = false;

  if (isAnchorTracked && autoPlayEnabled) {
    try { if (gltfModel) gltfModel.visible = true; } catch(e){}
    try { if (videoMesh) videoMesh.visible = true; } catch(e){}
    await new Promise(r => requestAnimationFrame(r));
    
    if (videoElem && videoElem.videoWidth) { try { videoElem.dispatchEvent(new Event('loadedmetadata')); } catch(e){} }
    if (videoElem) try { videoElem.currentTime = 0; } catch(e){}
    Utils.preSyncPose(0, mixer, gltfModel);

    setTimeout(async () => {
        if (videoElem) {
            const onPlayNew = () => { Utils.syncModelToVideo(videoElem, mixer, gltfModel); videoElem.removeEventListener('playing', onPlayNew); };
            videoElem.addEventListener('playing', onPlayNew);
            try { videoElem.currentTime = 0; await videoElem.play(); } 
            catch(e){ try { videoElem.muted = true; await videoElem.play(); } catch(ee){} if(mixer) mixer.timeScale = 1; }
        } else if(mixer) mixer.timeScale = 1;
    }, 500);

    waitingForMarkerPlay = false;
  } else {
    if (videoElem) try { videoElem.currentTime = 0; } catch(e){}
    waitingForMarkerPlay = true;
  }
}

export function pauseAndShowMenu() {
  if (videoElem) try { videoElem.pause(); videoElem.currentTime = Math.max(0, videoElem.currentTime - 0.4); } catch(e){}
  if (mixer) try { mixer.timeScale = 0; } catch(e){}
  isPausedByBack = true;
  setAutoPlayEnabled(false);
  if (careerActions()) careerActions().style.display = (playingCareer && playingCareer !== 'Computer') ? 'flex' : 'none';
  if (careerMenu()) careerMenu().style.display = 'flex';
  if (backBtn()) backBtn().style.display = 'none';
  try { const rb = document.getElementById('return-btn'); if (rb) rb.style.display = 'inline-block'; } catch(e){}
  setNoScan(true); waitingForMarkerPlay = false; pausedByTrackingLoss = false;
}

export function returnToLast() {
  if (!lastCareer) return;
  playCareer(lastCareer);
}

export function removeCurrentAndShowMenu() {
  clearAnchorContent(false);
  playingCareer = null; isPausedByBack = false; setAutoPlayEnabled(true);
  if (careerActions()) careerActions().style.display = 'none';
  if (careerMenu()) careerMenu().style.display = 'flex';
  if (backBtn()) backBtn().style.display = 'none';
  try { const rb = document.getElementById('return-btn'); if (rb) rb.style.display = 'none'; } catch(e){}
  setNoScan(true); waitingForMarkerPlay = false; pausedByTrackingLoss = false;
}

export function resetToIdle() {
  try { clearAnchorContent(false); } catch(e){}
  playingCareer = null; lastCareer = null; isPausedByBack = false; waitingForMarkerPlay = false; pausedByTrackingLoss = false; setAutoPlayEnabled(false);
  try { const rb = document.getElementById('return-btn'); if (rb) rb.style.display = 'none'; } catch(e){}
  setNoScan(true);
}