// /WEB/js/ar.js
// Optimized: Performance Tuning for Android (Pixel Ratio = 1)

import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { ensureCareerAssets, getAssets, JOB_ROOT } from './loader.js';
import * as Utils from './ar-utils.js';

// --- Global State ---
const assets = getAssets();
let mindarThree, renderer, scene, camera; 
let activeCamera = null; 
let worldCamera = null;  
let headLight = null;    

let anchor, contentGroup = null; 
let gltfModel = null, videoElem = null, videoMesh = null;
let mixer = null, clock = new THREE.Clock();
let controls = null;

let playingCareer = null;
let lastCareer = null;
let isPausedByBack = false;

let isVideoFinished = false;
let isModelFinished = false;
let autoPlayEnabled = true;

let isWorldMode = false;     
let isAnchorTracked = false; 

// --- DOM References ---
const scanFrame = () => document.getElementById('scan-frame');
const careerMenu = () => document.getElementById('career-menu');
const careerActions = () => document.getElementById('career-actions');
const backBtn = () => document.getElementById('backBtn');

// --- Exported Functions ---
export function setAutoPlayEnabled(flag) { autoPlayEnabled = !!flag; }

export function setNoScan(flag) {
  if (flag) {
    document.body.classList.add('no-scan');
    const sf = scanFrame();
    if (sf) sf.style.display = 'none';
  } else {
    document.body.classList.remove('no-scan');
    if (!isWorldMode) {
        const sf = scanFrame();
        if (sf) sf.style.display = 'flex';
    }
  }
}
export function getAssetsReference() { return assets; }

// --- Core Logic ---
function checkBothFinished() {
  if (videoElem && !isVideoFinished) return;
  if (mixer && !isModelFinished) return;
  
  lastCareer = playingCareer;
  clearAnchorContent(false);
  playingCareer = null;
  isPausedByBack = false;
  
  if (lastCareer && ['AI','Cloud','Data_Center','Network'].includes(lastCareer)) {
    if (careerActions()) careerActions().style.display = 'flex';
  }
  if (careerMenu()) careerMenu().style.display = 'flex';
  if (backBtn()) backBtn().style.display = 'none';
  
  try { document.dispatchEvent(new CustomEvent('career-ready', { detail: { career: lastCareer } })); } catch(e){}
}

function clearAnchorContent(keep=false) {
  if (keep) {
    if (videoElem) try { videoElem.pause(); } catch(e){}
    if (mixer) try { mixer.timeScale = 0; } catch(e){}
    isPausedByBack = true;
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
    try { 
        if(videoElem.parentNode) videoElem.parentNode.removeChild(videoElem);
        videoElem.pause(); 
        videoElem.onended = null; 
        videoElem.src = ""; 
        videoElem.load(); 
    } catch(e){} 
  }
  videoElem = null;
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
    
    gltfModel.scale.set(0.5, 0.5, 0.5);
    gltfModel.position.set(-0.25, -0.45, 0.1); 
    gltfModel.visible = true; 
    if (contentGroup) contentGroup.add(gltfModel);
    try { gltfModel.rotation.set(0, 0.15, 0); gltfModel.updateMatrixWorld(true); } catch(e){}

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
    
    // 🔥 Optimize: ลด Segments ของ Plane ลงเพื่อประหยัด Vertex
    const plane = new THREE.PlaneGeometry(0.6, 0.6 * (16/9), 1, 1); 
    const mat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.DoubleSide });
    videoMesh = new THREE.Mesh(plane, mat);
    videoMesh.visible = true; 
    if (contentGroup) contentGroup.add(videoMesh);
    Utils.makeVideoLayer(videoMesh);

    videoElem.onloadedmetadata = () => {
      try {
        const asp = (videoElem.videoWidth / videoElem.videoHeight) || (9/16);
        const width = 0.6; const height = width / asp;
        if (videoMesh.geometry) videoMesh.geometry.dispose();
        videoMesh.geometry = new THREE.PlaneGeometry(width, height, 1, 1);
        videoMesh.position.set(0, 0, 0);

        if (gltfModel) {
            gltfModel.scale.set(0.5, 0.5, 0.5);
            gltfModel.rotation.set(0, 0.15, 0); 
            gltfModel.updateMatrixWorld(true);
            
            const targetX = -0.35; 
            const videoBottom = -height / 2;
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
  await ensureCareerAssets(career);
  const a = assets[career] || {};
  if (gltfModel && gltfModel.userData.sourceCareer !== career) clearAnchorContent(false);
  if (!gltfModel && a.modelBlobUrl) {
    const g = await Utils.loadGLTF(a.modelBlobUrl);
    if (g) attachContentToAnchor(g, null);
  }
  if (!videoMesh && a.videoBlobUrl) {
    const v = Utils.makeVideoElem(a.videoBlobUrl);
    if (v) attachContentToAnchor(gltfModel ? { scene: gltfModel } : null, v);
  }
}

// --- Main Init ---

export async function initAndStart(containerElement) {
  const markerSrc = (assets['Computer'] && assets['Computer'].markerBlobUrl) ? assets['Computer'].markerBlobUrl : `${JOB_ROOT}/Computer/marker.mind`;
  
  mindarThree = new MindARThree({
    container: containerElement,
    imageTargetSrc: markerSrc,
    sticky: false,
    filterMinCF: 0.0001, filterBeta: 0.005,
    uiScanning: "no", uiLoading: "no"
  });
  
  ({ renderer, scene, camera } = mindarThree);
  activeCamera = camera;
  
  try {
    // 🔥🔥 OPTIMIZATION START 🔥🔥
    // 1. บังคับ Pixel Ratio เป็น 1 เท่านั้น (ช่วยเรื่อง FPS มากที่สุดบน Android)
    renderer.setPixelRatio(1); 
    
    const w = (containerElement?.clientWidth) || window.innerWidth;
    const h = (containerElement?.clientHeight) || window.innerHeight;
    renderer.setSize(w, h, false);

    if (renderer.domElement) {
        renderer.domElement.style.display = 'block';
        renderer.domElement.style.pointerEvents = 'auto'; 
        renderer.domElement.style.zIndex = '10'; 
        renderer.domElement.style.position = 'absolute';
        renderer.domElement.style.top = '0';
        renderer.domElement.style.left = '0';
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    
    // 2. ปิด Auto Clear ถ้าไม่จำเป็น (แต่ในที่นี้เปิดไว้ปลอดภัยกว่า)
    // renderer.autoClear = false; 

    // 🔥🔥 OPTIMIZATION END 🔥🔥

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
    
    if (!isWorldMode) {
        console.log("🎯 First Scan! Switching to World Camera...");
        isWorldMode = true;

        const sf = scanFrame();
        if(sf) sf.style.display = 'none';

        const w = window.innerWidth;
        const h = window.innerHeight;
        worldCamera = new THREE.PerspectiveCamera(70, w / h, 0.1, 1000);
        worldCamera.position.set(0, 0, 2); 
        worldCamera.lookAt(0, 0, 0);

        headLight = new THREE.DirectionalLight(0xffffff, 1.0);
        worldCamera.add(headLight); 
        scene.add(worldCamera);     

        activeCamera = worldCamera;

        scene.add(contentGroup);
        contentGroup.position.set(0, 0, 0);
        contentGroup.rotation.set(0, 0, 0);
        contentGroup.scale.set(1, 1, 1);

        if (controls) controls.dispose();
        controls = new OrbitControls(activeCamera, renderer.domElement);
        
        // 🔥 ปรับจูน Controls ให้ลื่นขึ้น
        controls.enableDamping = true;
        controls.dampingFactor = 0.08; // เพิ่มความหนืดนิดหน่อยให้รู้สึกนุ่มนวล
        controls.rotateSpeed = 0.8;    // ลดความไวนิดนึงให้คุมง่าย
        
        controls.enableZoom = true;
        controls.enablePan = false; 
        controls.enableRotate = true;
        
        controls.target.set(0, 0, 0);
        controls.update();

        window.addEventListener('resize', () => {
             if(activeCamera === worldCamera) {
                 const newW = window.innerWidth;
                 const newH = window.innerHeight;
                 worldCamera.aspect = newW / newH;
                 worldCamera.updateProjectionMatrix();
                 renderer.setSize(newW, newH);
                 renderer.setPixelRatio(1); // ย้ำ Pixel Ratio อีกทีตอนหมุนจอ
             }
        });

        startPlaybackSequence();
    }
  };

  await mindarThree.start();
  
  renderer.setAnimationLoop(()=> {
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);
    if (controls) controls.update();
    if (activeCamera) renderer.render(scene, activeCamera);
  });
}

async function startPlaybackSequence() {
    if (!autoPlayEnabled) return;
    try { if (gltfModel) gltfModel.visible = true; } catch(e){}
    try { if (videoMesh) videoMesh.visible = true; } catch(e){}
    
    if (videoElem) {
        try { videoElem.currentTime = 0; } catch(e){}
        Utils.preSyncPose(0, mixer, gltfModel);

        setTimeout(async () => {
            const onPlayNew = () => { Utils.syncModelToVideo(videoElem, mixer, gltfModel); videoElem.removeEventListener('playing', onPlayNew); };
            videoElem.addEventListener('playing', onPlayNew);
            try { await videoElem.play(); } 
            catch(e){ try { videoElem.muted = true; await videoElem.play(); } catch(ee){} if(mixer) mixer.timeScale = 1; }
        }, 500);
    } else if (mixer) {
        mixer.timeScale = 1;
    }
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
  
  if (playingCareer === career) {
    isPausedByBack = false;
    if (isWorldMode) {
        if(videoElem) videoElem.play().catch(()=>{});
        if(mixer) mixer.timeScale = 1;
    } 
    return;
  }

  clearAnchorContent(false); 
  playingCareer = career; 
  lastCareer = career; 
  isPausedByBack = false;

  await ensureContentForCareer(career);

  if (isWorldMode) {
      if (contentGroup) {
          contentGroup.visible = true;
          contentGroup.rotation.set(0, 0, 0);
          contentGroup.position.set(0, 0, 0); 
          if(controls) {
              controls.reset();
              activeCamera.position.set(0, 0, 2);
              activeCamera.lookAt(0, 0, 0);
          }
      }
      startPlaybackSequence();
  } else {
      setNoScan(false);
  }
}

export function pauseAndShowMenu() {
  if (videoElem) try { videoElem.pause(); } catch(e){}
  if (mixer) try { mixer.timeScale = 0; } catch(e){}
  isPausedByBack = true;
  setAutoPlayEnabled(false);
  if (careerActions()) careerActions().style.display = (playingCareer && playingCareer !== 'Computer') ? 'flex' : 'none';
  if (careerMenu()) careerMenu().style.display = 'flex';
  if (backBtn()) backBtn().style.display = 'none';
  try { const rb = document.getElementById('return-btn'); if (rb) rb.style.display = 'inline-block'; } catch(e){}
}

export function returnToLast() {
  if (!lastCareer) return;
  playCareer(lastCareer);
}

export function removeCurrentAndShowMenu() {
  clearAnchorContent(false);
  playingCareer = null; 
  isPausedByBack = false; 
  setAutoPlayEnabled(true);
  if (careerActions()) careerActions().style.display = 'none';
  if (careerMenu()) careerMenu().style.display = 'flex';
  if (backBtn()) backBtn().style.display = 'none';
  try { const rb = document.getElementById('return-btn'); if (rb) rb.style.display = 'none'; } catch(e){}
  setNoScan(true);
}

export function resetToIdle() {
  try { clearAnchorContent(false); } catch(e){}
  playingCareer = null; 
  lastCareer = null; 
  isPausedByBack = false; 
  setAutoPlayEnabled(false);
  try { const rb = document.getElementById('return-btn'); if (rb) rb.style.display = 'none'; } catch(e){}
  setNoScan(true);
}