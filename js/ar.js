// /WEB/js/ar.js (Updated: Bigger Model Scale 0.7)
import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { ensureCareerAssets, getAssets as getLoaderAssets } from './loader.js';

const JOB_ROOT = './Job';
const careers = ['Computer','AI','Cloud','Data_Center','Network'];
const candidates = {
  Computer: { model: ['Computer-Model.glb','computer-model.glb','Computer-model.glb'], video: ['Computer.mp4','computer.mp4','Computer-Video.mp4'] },
  AI:       { model: ['ai-model.glb','AI-model.glb','ai-model.GLTF','AI-Model.glb'], video: ['AI.mp4','ai.mp4','ai-video.mp4'] },
  Cloud:    { model: ['cloud-model.glb','Cloud-model.glb','cloud-model.GLTF'], video: ['video-cloud.mp4','cloud.mp4','cloud-video.mp4'] },
  Data_Center: { model: ['Data_Center-model.glb','Data_Center-model.glb','Data_ Center-model.glb','Data_Center-model.GLTF'], video: ['Data_Center-Video.mp4','data_center.mp4','data-center.mp4'] },
  Network:  { model: ['network-model.glb','Network-model.glb','network-model.GLTF'], video: ['video-network.mp4','network.mp4','network-video.mp4'] },
};

const assets = getLoaderAssets();
const gameAssets = assets.gameAssets = assets.gameAssets || {};

const scanFrame = () => document.getElementById('scan-frame');
const careerMenu = () => document.getElementById('career-menu');
const careerActions = () => document.getElementById('career-actions');
const backBtn = () => document.getElementById('backBtn');

let mindarThree, renderer, scene, camera;
let anchor;
let contentGroup = null; 
let gltfModel = null;
let videoElem = null;
let videoMesh = null;
let mixer = null;
let clock = new THREE.Clock();
let playingCareer = null;
let lastCareer = null;
let isPausedByBack = false;

// Flags for Synchronization
let isVideoFinished = false;
let isModelFinished = false;

let autoPlayEnabled = true;
export function setAutoPlayEnabled(flag) { autoPlayEnabled = !!flag; }

let isAnchorTracked = false;
let waitingForMarkerPlay = false;
let pausedByTrackingLoss = false;

let noScanMode = false;
export function setNoScan(flag) {
  noScanMode = !!flag;
  const sf = scanFrame();
  if (!sf) return;
  if (noScanMode) {
    sf.style.display = 'none';
    Array.from(sf.querySelectorAll('*')).forEach(n=> n.style.display = 'none');
    document.body.classList.add('no-scan');
  } else {
    document.body.classList.remove('no-scan');
    sf.style.display = 'flex';
    Array.from(sf.querySelectorAll('*')).forEach(n=> { n.style.display = ''; });
  }
}

/* Helper: Dispose Deep */
function disposeDeep(object) {
  if (!object) return;
  object.traverse((child) => {
    if (child.isMesh) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        } else {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      }
    }
  });
}

/* Helper: Force Sync Model to Video Time */
function syncModelToVideo() {
  if (!videoElem || !mixer || !gltfModel) return;
  const t = videoElem.currentTime;
  
  if (gltfModel.userData && Array.isArray(gltfModel.userData._actions)) {
    gltfModel.userData._actions.forEach(action => {
      if(action) {
        action.time = t;
        action.paused = false;
        action.setEffectiveTimeScale(1);
      }
    });
  }
  mixer.timeScale = 1;
}

/* Helper: Pre-Sync Pose Only (No Play) */
function preSyncPose(timeVal) {
  if (!mixer || !gltfModel) return;
  if (gltfModel.userData && Array.isArray(gltfModel.userData._actions)) {
    gltfModel.userData._actions.forEach(action => {
      if(action) action.time = timeVal;
    });
  }
  try { mixer.update(0); } catch(e){}
}

/* DRACO */
let dracoLoaderInstance = null;
function ensureDracoInitialized() {
  if (dracoLoaderInstance) return dracoLoaderInstance;
  try {
    dracoLoaderInstance = new DRACOLoader();
    dracoLoaderInstance.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
  } catch(e) {
    console.warn('DRACO init failed', e);
    dracoLoaderInstance = null;
  }
  return dracoLoaderInstance;
}

const tmpObj = new THREE.Object3D();
const tmpQuat = new THREE.Quaternion();
const parentWorldQuat = new THREE.Quaternion();
const targetLocalQuat = new THREE.Quaternion();
const SMOOTH_FACTOR = 0.12;

async function fetchFirstAvailable(career, list) {
  for (const name of list) {
    const url = `${JOB_ROOT}/${career}/${name}`;
    try {
      const res = await fetch(encodeURI(url));
      if (!res.ok) continue;
      const b = await res.blob();
      if (!b || b.size === 0) continue;
      return URL.createObjectURL(b);
    } catch(e){}
  }
  return null;
}

function loadGLTF(blobUrl) {
  return new Promise((resolve) => {
    if (!blobUrl) return resolve(null);
    const loader = new GLTFLoader();
    try {
      const dr = ensureDracoInitialized();
      if (dr) loader.setDRACOLoader(dr);
    } catch(e){}
    loader.load(blobUrl, (gltf) => {
      try {
        if (gltf && gltf.scene) {
          gltf.scene.userData = gltf.scene.userData || {};
          gltf.scene.userData._clips = gltf.animations || [];
        }
      } catch(e){}
      resolve(gltf);
    }, undefined, (err)=>{ console.warn('GLTF load err',err); resolve(null); });
  });
}

function makeVideoElem(blobUrl) {
  if (!blobUrl) return null;
  const v = document.createElement('video');
  v.src = blobUrl;
  v.crossOrigin = 'anonymous';
  v.playsInline = true;
  v.muted = false;
  v.loop = false; 
  v.preload = 'auto';
  return v;
}

function makeModelRenderPriority(model) {
  try {
    model.traverse(node => {
      if (node.isMesh) {
        node.renderOrder = 20;
        try {
          node.material.depthTest = true;
          node.material.depthWrite = true;
          node.material.transparent = node.material.transparent || false;
          node.material.needsUpdate = true;
        } catch(e){}
        node.frustumCulled = false;
      }
    });
  } catch(e){}
}
function makeVideoLayer(vm) {
  try {
    if (!vm) return;
    vm.renderOrder = 1;
    if (vm.material) {
      try {
        vm.material.depthWrite = false;
        vm.material.depthTest = true;
        vm.material.transparent = true;
        vm.material.needsUpdate = true;
      } catch(e){}
    }
    vm.frustumCulled = false;
  } catch(e){}
}

function ensureAttachedAndVisible() {
  try {
    if (!anchor || !anchor.group) return;
    
    // Create group if missing
    if (!contentGroup) {
      contentGroup = new THREE.Group();
      anchor.group.add(contentGroup);
    }
    // Attach group to anchor if detached
    if (contentGroup.parent !== anchor.group) {
      anchor.group.add(contentGroup);
    }

    // Attach items to group
    if (gltfModel) {
      if (gltfModel.parent !== contentGroup) {
        contentGroup.add(gltfModel);
      }
      gltfModel.visible = true;
      makeModelRenderPriority(gltfModel);
    }
    if (videoMesh) {
      if (videoMesh.parent !== contentGroup) {
        contentGroup.add(videoMesh);
      }
      videoMesh.visible = true;
      makeVideoLayer(videoMesh);
    }
  } catch(e){ console.warn('ensureAttachedAndVisible err', e); }
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
    while(contentGroup.children.length > 0){ 
      contentGroup.remove(contentGroup.children[0]); 
    }
  }

  if (gltfModel) { 
    disposeDeep(gltfModel);
  }
  gltfModel = null;

  if (videoMesh) {
    disposeDeep(videoMesh);
  }
  videoMesh = null;

  if (mixer) try { mixer.stopAllAction(); mixer.uncacheRoot(mixer.getRoot()); } catch(e){} 
  mixer = null;

  if (videoElem) {
    try{ 
      videoElem.pause(); 
      videoElem.onended = null; 
      videoElem.src = ""; 
      videoElem.load(); 
    }catch{} 
  }
  videoElem = null;

  waitingForMarkerPlay = false;
  pausedByTrackingLoss = false;
  isVideoFinished = false;
  isModelFinished = false;
}

function checkBothFinished() {
  if (videoElem && !isVideoFinished) return;
  if (mixer && !isModelFinished) return;
  finishCareerSequence();
}

function finishCareerSequence() {
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

  try {
    for (const c of careers) {
      const a = assets[c] || {};
      const pct = (a.modelBlobUrl && a.videoBlobUrl) ? 100 : 0;
      document.dispatchEvent(new CustomEvent('career-load-progress', { detail: { career: c, pct, file: null, type: pct===100 ? 'all' : 'none' } }));
      if (pct === 100) document.dispatchEvent(new CustomEvent('career-ready', { detail: { career: c } }));
    }
  } catch(e){}
}

function attachContentToAnchor(gltf, video) {
  if (contentGroup) {
     while(contentGroup.children.length > 0) contentGroup.remove(contentGroup.children[0]);
  }
  gltfModel = null;
  videoMesh = null;
  videoElem = null;
  mixer = null;
  isVideoFinished = false;
  isModelFinished = false;

  // --- Setup Model ---
  if (gltf && gltf.scene) {
    const sceneObj = gltf.scene;
    gltfModel = sceneObj;
    try { gltfModel.userData = gltfModel.userData || {}; gltfModel.userData.sourceCareer = playingCareer || 'unknown'; } catch(e){}
    
    // *** UPDATED SCALE HERE (0.7) ***
    gltfModel.scale.set(0.7, 0.7, 0.7);
    gltfModel.position.set(-0.25, -0.45, 0.05);
    gltfModel.visible = false;
    
    if (contentGroup) contentGroup.add(gltfModel);

    try { gltfModel.rotation.set(0,0,0); gltfModel.quaternion.set(0,0,0,1); gltfModel.updateMatrixWorld(true); } catch(e){}

    const animations = (gltf.animations && gltf.animations.length > 0) ? gltf.animations : (sceneObj.userData && Array.isArray(sceneObj.userData._clips) ? sceneObj.userData._clips : null);
    if (animations && animations.length > 0) {
      mixer = new THREE.AnimationMixer(gltfModel);
      const actions = [];
      animations.forEach(c => {
        try {
          const action = mixer.clipAction(c);
          action.reset();
          action.loop = THREE.LoopOnce;
          action.clampWhenFinished = true;
          action.play(); 
          action.paused = true;
          actions.push(action);
        } catch(e) { console.warn('action setup err', e); }
      });
      try { gltfModel.userData._actions = actions; } catch(e){}
      
      mixer.addEventListener('finished', () => {
         isModelFinished = true;
         checkBothFinished();
      });
    } else {
       isModelFinished = true;
    }
    try { makeModelRenderPriority(gltfModel); } catch(e){}
  } else {
     isModelFinished = true; 
  }

  // --- Setup Video ---
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

    try { videoMesh.rotation.set(0,0,0); videoMesh.quaternion.set(0,0,0,1); videoMesh.updateMatrixWorld(true); } catch(e){}
    makeVideoLayer(videoMesh);

    videoElem.onloadedmetadata = () => {
      try {
        const asp = (videoElem.videoWidth / videoElem.videoHeight) || (9/16);
        const width = 0.6;
        const height = width / asp;
        
        if (videoMesh.geometry) videoMesh.geometry.dispose();
        videoMesh.geometry = new THREE.PlaneGeometry(width, height);
        videoMesh.position.set(0, 0, 0);

        if (gltfModel) {
            gltfModel.visible = true;
            // *** UPDATED SCALE HERE AS WELL (0.7) ***
            gltfModel.scale.set(0.7, 0.7, 0.7);
            gltfModel.rotation.set(0, 0, 0);
            gltfModel.quaternion.set(0, 0, 0, 1);
            gltfModel.updateMatrixWorld(true);
            
            const targetX = -0.35; 
            const videoBottom = -height / 2;

            gltfModel.position.set(0, 0, 0);
            gltfModel.updateMatrixWorld(true);
            
            const box = new THREE.Box3().setFromObject(gltfModel);
            const feetOffset = box.min.y; 

            if (isFinite(feetOffset) && Math.abs(feetOffset) < 10) {
                 const targetY = videoBottom - feetOffset;
                 gltfModel.position.set(targetX, targetY, 0.05);
            } else {
                 const safeY = videoBottom; 
                 gltfModel.position.set(targetX, safeY, 0.05);
            }
            gltfModel.updateMatrixWorld(true);
        }
      } catch(e){ console.warn('align err', e); }
    };

    videoElem.onended = () => {
      try { videoElem.pause(); } catch(e){}
      isVideoFinished = true;
      checkBothFinished();
    };
  } else {
     isVideoFinished = true; 
  }
}

export async function preloadCritical(onProgress = ()=>{}) {
  try { onProgress({ phase:'phaseA-start', pct:0 }); } catch(e){}
  try {
    await ensureCareerAssets('Computer', (pct, file, type) => {
      try { onProgress({ phase:'phaseA-career', career:'Computer', pct, file, type, startReady:false }); } catch(e){}
    });
  } catch(e) { try { onProgress({ phase:'phaseA-error', pct: 10 }); } catch(e){} }

  const order = [...careers].filter(c => c !== 'Computer');
  for (let ci=0; ci<order.length; ci++) {
    const career = order[ci];
    try {
      await ensureCareerAssets(career, (pct, file, type) => {
        const doneCareers = ci + (pct/100);
        const overall = Math.round((doneCareers / order.length) * 100);
        try { onProgress({ phase:'phaseB-career', career, pct, file, type, overall }); } catch(e){}
      });
    } catch(e) { try { onProgress({ phase:'phaseB-career-error', career, pct:100 }); } catch(e){} }
    try {
      const compReady = isCareerReady('Computer');
      const readyCount = careers.reduce((acc,c)=> acc + (isCareerReady(c) ? 1 : 0), 0);
      const startOk = compReady && readyCount >= 2;
      onProgress({ phase:'check-start', startReady: startOk, pct: 0 });
    } catch(e){}
  }

  try {
    onProgress({ phase:'phaseC-start', pct:0 });
    const mfRes = await fetch(encodeURI('game_assets/manifest.json'));
    if (mfRes && mfRes.ok) {
      const mf = await mfRes.json();
      const list = [];
      for (const item of mf) {
        if (item.image) list.push(`game_assets/cards/${item.image}`);
        if (item.audioWord) list.push(`game_assets/audio/${item.audioWord}`);
        if (item.audioMeaning) list.push(`game_assets/audio/${item.audioMeaning}`);
      }
      list.push('game_assets/sfx/flip.wav','game_assets/sfx/match.wav','game_assets/sfx/wrong.wav','game_assets/sfx/win.mp3');
      let done = 0;
      await Promise.all(list.map(async u => {
        try {
          const r = await fetch(encodeURI(u));
          if (!r.ok) { done++; onProgress({ phase:'phaseC', pct: Math.round((done/list.length)*100) }); return; }
          const b = await r.blob();
          gameAssets[u.replace('game_assets/','')] = URL.createObjectURL(b);
          done++;
          onProgress({ phase:'phaseC', pct: Math.round((done/list.length)*100) });
        } catch(e) { done++; onProgress({ phase:'phaseC', pct: Math.round((done/list.length)*100) }); }
      }));
    } else {
      onProgress({ phase:'phaseC', pct: 50 });
    }
  } catch(e) { onProgress({ phase:'phaseC-error', pct: 50 }); }

  assets.gameAssets = gameAssets;
  onProgress({ phase:'critical-done', pct: 100, startReady: (isCareerReady('Computer') && careers.some(c=> c !== 'Computer' && isCareerReady(c))) });
  return assets;
}

export function isCareerReady(career) {
  const a = assets[career] || {};
  return !!(a && a.modelBlobUrl && a.videoBlobUrl);
}

export async function preloadRemaining() {
  const urls = [];
  for (const career of careers) {
    if (!assets[career]) assets[career] = { modelBlobUrl: null, videoBlobUrl: null };
    const a = assets[career];
    if (!a.modelBlobUrl) urls.push(`${JOB_ROOT}/${career}/${candidates[career].model[0]}`);
    if (!a.videoBlobUrl) urls.push(`${JOB_ROOT}/${career}/${candidates[career].video[0]}`);
  }
  try {
    const mf = await fetch('game_assets/manifest.json');
    if (mf && mf.ok) {
      const manifest = await mf.json();
      for (const item of manifest) {
        if (item.image) urls.push(`game_assets/cards/${item.image}`);
        if (item.audioWord) urls.push(`game_assets/audio/${item.audioWord}`);
        if (item.audioMeaning) urls.push(`game_assets/audio/${item.audioMeaning}`);
      }
    }
  } catch(e){}
  const sfx = ['flip.wav','match.wav','wrong.wav','win.mp3'];
  for (const f of sfx) urls.push(`game_assets/sfx/${f}`);
  const final = Array.from(new Set(urls));
  await Promise.all(final.map(async u => {
    try {
      const r = await fetch(encodeURI(u));
      if (!r.ok) return;
      const blob = await r.blob();
      const blobUrl = URL.createObjectURL(blob);
      if (u.startsWith(`${JOB_ROOT}/`)) {
        const parts = u.split('/');
        const career = parts[2];
        const low = u.toLowerCase();
        if (low.endsWith('.glb') || low.endsWith('.gltf')) {
          assets[career].modelBlobUrl = assets[career].modelBlobUrl || blobUrl;
          document.dispatchEvent(new CustomEvent('career-load-progress', { detail: { career: career, pct: 100, file: u, type: 'model' } }));
        } else {
          assets[career].videoBlobUrl = assets[career].videoBlobUrl || blobUrl;
          document.dispatchEvent(new CustomEvent('career-load-progress', { detail: { career: career, pct: 100, file: u, type: 'video' } }));
        }
      } else if (u.startsWith('game_assets/')) {
        gameAssets[u.replace('game_assets/','')] = blobUrl;
      }
    } catch(e){}
  }));
  return;
}

async function ensureContentForCareer(career) {
  if (!career) return;
  if (!assets[career]) assets[career] = { modelBlobUrl: null, videoBlobUrl: null };
  const a = assets[career];

  if (!a.modelBlobUrl) {
    try {
      const fb = await fetchFirstAvailable(career, candidates[career].model);
      if (fb) {
        a.modelBlobUrl = fb;
        document.dispatchEvent(new CustomEvent('career-load-progress', { detail: { career, pct: 100, file: 'fallback-model', type: 'model' } }));
      }
    } catch(e){}
  }

  if (!a.videoBlobUrl) {
    try {
      const fv = await fetchFirstAvailable(career, candidates[career].video);
      if (fv) {
        a.videoBlobUrl = fv;
        document.dispatchEvent(new CustomEvent('career-load-progress', { detail: { career, pct: 100, file: 'fallback-video', type: 'video' } }));
      }
    } catch(e){}
  }

  if (!gltfModel && a.modelBlobUrl) {
    const g = await loadGLTF(a.modelBlobUrl);
    if (g) {
      attachContentToAnchor(g, null);
      if (isAnchorTracked && gltfModel) {
        try { gltfModel.visible = true; if (mixer) mixer.timeScale = 1; } catch(e){}
      }
    }
  }

  if (!videoMesh && a.videoBlobUrl) {
    const v = makeVideoElem(a.videoBlobUrl);
    if (v) {
      attachContentToAnchor(gltfModel ? { scene: gltfModel } : null, v);
      if (isAnchorTracked && videoElem) {
        try { videoMesh.visible = true; } catch(e){}
      }
    }
  }
}

function createLights(scene) {
  try {
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
    hemi.position.set(0, 1, 0);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(0.5, 1, 0.5);
    scene.add(dir);
    const amb = new THREE.AmbientLight(0x202020, 0.6);
    scene.add(amb);
  } catch(e){}
}

export async function initAndStart(containerElement) {
  const markerSrc = (assets['Computer'] && assets['Computer'].markerBlobUrl) ? assets['Computer'].markerBlobUrl : `${JOB_ROOT}/Computer/marker.mind`;
  mindarThree = new MindARThree({
    container: containerElement,
    imageTargetSrc: markerSrc,
    sticky: true,
    filterMinCF: 0.0001,
    filterBeta: 0.005,
    uiScanning: "no",
    uiLoading: "no"
  });
  ({ renderer, scene, camera } = mindarThree);
  try {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const w = (containerElement && containerElement.clientWidth) ? containerElement.clientWidth : window.innerWidth;
    const h = (containerElement && containerElement.clientHeight) ? containerElement.clientHeight : window.innerHeight;
    renderer.setSize(w, h, false);
    if (renderer.domElement) renderer.domElement.style.display = 'block';
  } catch(e) { console.warn('renderer sizing failed', e); }
  try { renderer.outputColorSpace = THREE.SRGBColorSpace; } catch(e){}
  createLights(scene);
  anchor = mindarThree.addAnchor(0);
  
  // Init Group
  contentGroup = new THREE.Group();
  anchor.group.add(contentGroup);

  try { setNoScan(false); } catch(e){}

  await ensureContentForCareer('Computer');

  playingCareer = 'Computer';
  lastCareer = 'Computer';
  if (careerActions()) careerActions().style.display = 'none';

  anchor.onTargetFound = async () => {
    isAnchorTracked = true;
    hideScanFrameThen(async () => {
      try { await ensureContentForCareer(playingCareer); } catch(e){}
      try { ensureAttachedAndVisible(); } catch(e){}
      try { if (gltfModel) gltfModel.visible = true; } catch(e){}
      try { if (videoMesh) videoMesh.visible = true; } catch(e){}

      if (videoElem && videoElem.videoWidth) {
         try { videoElem.dispatchEvent(new Event('loadedmetadata')); } catch(e){}
      }

      if (!autoPlayEnabled) return;

      if (pausedByTrackingLoss) {
        setTimeout(async () => {
            if (videoElem && videoElem.paused) {
              const onPlayingResume = () => {
                  syncModelToVideo(); 
                  videoElem.removeEventListener('playing', onPlayingResume);
              };
              videoElem.addEventListener('playing', onPlayingResume);
              try { await videoElem.play(); } catch(err){
                try { videoElem.muted = true; await videoElem.play(); } catch(e){}
              }
            }
        }, 500);

        pausedByTrackingLoss = false;
        waitingForMarkerPlay = false;
        return;
      }

      const startNow = async () => {
        try {
          try {
            const a = assets[playingCareer] || {};
            if (!mixer && a.modelBlobUrl) {
              try {
                const reGltf = await loadGLTF(a.modelBlobUrl);
                if (reGltf && reGltf.scene) {
                  attachContentToAnchor(reGltf, videoElem);
                  try { ensureAttachedAndVisible(); } catch(e){}
                  if (videoElem && videoElem.videoWidth) {
                      try { videoElem.dispatchEvent(new Event('loadedmetadata')); } catch(e){}
                  }
                }
              } catch(e) { console.warn('reload gltf fallback err', e); }
            }
          } catch(e){}
          
          if (gltfModel && gltfModel.userData && Array.isArray(gltfModel.userData._actions) && gltfModel.userData._actions.length) {
            gltfModel.userData._actions.forEach(a => {
              try { 
                  a.play(); 
                  a.paused = true; 
                  a.enabled = true; 
                  a.setEffectiveWeight && a.setEffectiveWeight(1); 
              } catch(e){}
            });
          }
        } catch(e) {}

        if (videoElem) try { videoElem.currentTime = 0; } catch(e){}
        preSyncPose(0);
        try { renderer && renderer.render && renderer.render(scene, camera); } catch(e){}

        setTimeout(async () => {
            if (videoElem) {
               const onVideoStart = () => {
                   syncModelToVideo(); 
                   videoElem.removeEventListener('playing', onVideoStart);
               };
               videoElem.addEventListener('playing', onVideoStart);

               try { 
                   videoElem.currentTime = 0; 
                   await videoElem.play(); 
               } catch(e){ 
                   try { videoElem.muted=true; await videoElem.play(); } catch(ee){} 
                   if(mixer) mixer.timeScale = 1;
               }
            } else {
                if (mixer) {
                    try { mixer.timeScale = 1; } catch(e){}
                    try { mixer.update(0); } catch(e){}
                }
            }
        }, 500); 
      };

      if (waitingForMarkerPlay || (videoElem && videoElem.paused && playingCareer)) {
        startNow();
        waitingForMarkerPlay = false;
        return;
      }
    });
  };

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
        if (isMenuOpen) {
            sf.style.display = 'none';
        } else {
            sf.style.display = 'flex';
            Array.from(sf.querySelectorAll('*')).forEach(n => n.style.display = '');
            document.body.classList.remove('no-scan');
        }
    }

    if (!autoPlayEnabled) return;
    if (videoElem && !videoElem.paused) {
      try { 
        videoElem.pause(); 
        videoElem.currentTime = Math.max(0, videoElem.currentTime - 0.4); 
        pausedByTrackingLoss = true; 
      } catch(e){}
    }
    if (mixer) {
      try { mixer.timeScale = 0; } catch(e){}
    }
  };

  await mindarThree.start();

  renderer.setAnimationLoop(()=> {
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);
    
    // --- Group Billboard (Rotate the whole group to face camera) ---
    if (isAnchorTracked && camera && contentGroup) {
        const camPos = camera.position;
        const worldPos = new THREE.Vector3();
        contentGroup.getWorldPosition(worldPos);
        const target = new THREE.Vector3(camPos.x, worldPos.y, camPos.z);
        contentGroup.lookAt(target);
    }

    try {
      if (anchor && anchor.group && camera) {
        // ...
      }
    } catch(e){}
    renderer.render(scene, camera);
  });
}

function hideScanFrameThen(callback) {
  const sf = scanFrame();
  if (!sf) { if (callback) callback(); return; }
  if (noScanMode) {
    sf.style.display = 'none';
    Array.from(sf.querySelectorAll('*')).forEach(n=> n.style.display = 'none');
    if (callback) callback();
    return;
  }
  const cm = careerMenu();
  try {
    const cmStyle = cm ? window.getComputedStyle(cm) : null;
    if (cm && cmStyle && cmStyle.display !== 'none' && cmStyle.visibility !== 'hidden' && cmStyle.opacity !== '0') {
      sf.style.display = 'none';
      Array.from(sf.querySelectorAll('*')).forEach(n=> n.style.display = 'none');
      if (callback) callback();
      return;
    }
  } catch(e){}
  const curDisplay = window.getComputedStyle(sf).display;
  if (curDisplay === 'none' || sf.style.display === 'none') { if (callback) callback(); return; }
  sf.style.transition = 'opacity 200ms ease';
  sf.style.opacity = '1';
  sf.offsetHeight;
  sf.style.opacity = '0';
  setTimeout(()=> {
    try {
      sf.style.display = 'none';
      sf.style.transition = '';
      sf.style.opacity = '1';
      Array.from(sf.querySelectorAll('*')).forEach(n=> n.style.display = 'none');
    } catch(e){}
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

  if (isAnchorTracked) {
    const sf = scanFrame();
    if(sf) sf.style.display = 'none';
  }

  if (playingCareer === career) {
    console.log('Resuming career:', career);
    isPausedByBack = false;
    if (isAnchorTracked) {
       ensureAttachedAndVisible();
        if(videoElem) preSyncPose(videoElem.currentTime);
        try { renderer && renderer.render && renderer.render(scene, camera); } catch(e){}

        setTimeout(async() => {
           if (videoElem) {
               const onResume = () => {
                   syncModelToVideo(); 
                   videoElem.removeEventListener('playing', onResume);
               };
               videoElem.addEventListener('playing', onResume);
               videoElem.play().catch(()=>{}); 
           } else {
               if (mixer) mixer.timeScale = 1;
           }
        }, 500);
    } else {
       waitingForMarkerPlay = true;
    }
    return;
  }

  if (playingCareer && playingCareer !== career) {
    clearAnchorContent(false);
    playingCareer = null;
    isPausedByBack = false;
    waitingForMarkerPlay = false;
    pausedByTrackingLoss = false;
  }

  if (!assets[career]) assets[career] = { modelBlobUrl: null, videoBlobUrl: null };
  try { await ensureCareerAssets(career, ()=>{}); } catch(e){}
  try { await ensureContentForCareer(career); } catch(e){}

  const a = assets[career] || {};
  if (gltfModel && gltfModel.userData && gltfModel.userData.sourceCareer !== career) {
    clearAnchorContent(false);
  }

  if (!gltfModel && a.modelBlobUrl) {
    try {
      const g = await loadGLTF(a.modelBlobUrl);
      attachContentToAnchor(g, null);
    } catch(e){ console.warn('playCareer attach gltf err', e); }
  }

  if (!videoElem && a.videoBlobUrl) {
    try {
      const v = makeVideoElem(a.videoBlobUrl);
      attachContentToAnchor(gltfModel ? { scene: gltfModel } : null, v);
    } catch(e){ console.warn('playCareer attach video err', e); }
  }

  playingCareer = career;
  lastCareer = career;
  isPausedByBack = false;

  if (isAnchorTracked && autoPlayEnabled) {
    try { ensureAttachedAndVisible(); } catch(e){}
    try { if (gltfModel) gltfModel.visible = true; } catch(e){}
    try { if (videoMesh) videoMesh.visible = true; } catch(e){}
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => requestAnimationFrame(r));

    if (videoElem && videoElem.videoWidth) {
       try { videoElem.dispatchEvent(new Event('loadedmetadata')); } catch(e){}
    }

    if (videoElem) try { videoElem.currentTime = 0; } catch(e){}
    preSyncPose(0);
    try { renderer && renderer.render && renderer.render(scene, camera); } catch(e){}

    setTimeout(async () => {
        if (videoElem) {
            const onPlayNew = () => {
                syncModelToVideo();
                videoElem.removeEventListener('playing', onPlayNew);
            };
            videoElem.addEventListener('playing', onPlayNew);

            try { 
                videoElem.currentTime = 0; 
                await videoElem.play(); 
            } catch(e){ 
                try { videoElem.muted = true; await videoElem.play(); } catch(ee){}
                if(mixer) mixer.timeScale = 1;
            }
        } else {
            if(mixer) mixer.timeScale = 1;
        }
    }, 500);

    waitingForMarkerPlay = false;
  } else {
    if (videoElem) try { videoElem.currentTime = 0; } catch(e){}
    waitingForMarkerPlay = true;
  }
}

export function pauseAndShowMenu() {
  if (videoElem) try { 
    videoElem.pause();
    videoElem.currentTime = Math.max(0, videoElem.currentTime - 0.4);
  } catch(e){}
  if (mixer) try { mixer.timeScale = 0; } catch(e){}
  isPausedByBack = true;
  setAutoPlayEnabled(false);
  if (careerActions()) careerActions().style.display = (playingCareer && playingCareer !== 'Computer') ? 'flex' : 'none';
  if (careerMenu()) careerMenu().style.display = 'flex';
  if (backBtn()) backBtn().style.display = 'none';
  try { const rb = document.getElementById('return-btn'); if (rb) rb.style.display = 'inline-block'; } catch(e){}
  setNoScan(true);
  waitingForMarkerPlay = false;
  pausedByTrackingLoss = false;
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
  waitingForMarkerPlay = false;
  pausedByTrackingLoss = false;
}

export function resetToIdle() {
  try { clearAnchorContent(false); } catch(e){}
  playingCareer = null;
  lastCareer = null;
  isPausedByBack = false;
  waitingForMarkerPlay = false;
  pausedByTrackingLoss = false;
  setAutoPlayEnabled(false);
  try { const rb = document.getElementById('return-btn'); if (rb) rb.style.display = 'none'; } catch(e){}
  setNoScan(true);
}

export function getAssets() { return assets; }