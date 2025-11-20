// js/ar.js  (FULL updated — replace your existing file)
// - fixes: hideScanFrameThen restored
// - preloadCritical: monotonic progress 0..100 covering Computer + first other career
// - preloadRemaining: sequential per-folder loading
// - dispatch 'career-load-progress' and 'game-assets-ready'
// - robust attach/play of model + video so model reappears after marker regain
// - defensive guards and logging for easier debugging

import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const JOB_ROOT = './Job';
const careers = ['Computer','AI','Cloud','Data_Center','Network'];
const candidates = {
  Computer: { model: ['Computer-Model.glb','computer-model.glb','Computer-model.glb'], video: ['Computer.mp4','computer.mp4','Computer-Video.mp4'] },
  AI:       { model: ['ai-model.glb','AI-model.glb','ai-model.GLTF','AI-Model.glb'], video: ['AI.mp4','ai.mp4','ai-video.mp4'] },
  Cloud:    { model: ['cloud-model.glb','Cloud-model.glb','cloud-model.GLTF'], video: ['video-cloud.mp4','cloud.mp4','cloud-video.mp4'] },
  Data_Center: { model: ['Data_Center-model.glb','Data_Center-model.glb','Data_ Center-model.glb','Data_Center-model.GLTF'], video: ['Data_Center-Video.mp4','data_center.mp4','data-center.mp4'] },
  Network:  { model: ['network-model.glb','Network-model.glb','network-model.GLTF'], video: ['video-network.mp4','network.mp4','network-video.mp4'] },
};

const assets = {};      // per-career { modelBlobUrl, videoBlobUrl, markerBlobUrl }
const gameAssets = {};  // game assets loaded last

const scanFrame = () => document.getElementById('scan-frame');
const careerMenu = () => document.getElementById('career-menu');
const careerActions = () => document.getElementById('career-actions');
const backBtn = () => document.getElementById('backBtn');

let mindarThree, renderer, scene, camera;
let anchor;
let gltfModel = null;
let videoElem = null;
let videoMesh = null;
let mixer = null;
let mixerActions = [];
let clock = new THREE.Clock();
let playingCareer = null;
let lastCareer = null;
let isPausedByBack = false;

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

/* DRACO loader (lazy) */
let dracoLoader = null;
function ensureDracoInitialized() {
  if (dracoLoader) return dracoLoader;
  dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
  return dracoLoader;
}

/* temp objects for quaternion math */
const tmpObj = new THREE.Object3D();
const tmpQuat = new THREE.Quaternion();
const parentWorldQuat = new THREE.Quaternion();
const targetLocalQuat = new THREE.Quaternion();
const bbox = new THREE.Box3();
const worldMin = new THREE.Vector3();
const worldPos = new THREE.Vector3();
const SMOOTH_FACTOR = 0.12;

/* --------- Utility: hideScanFrameThen (restored) --------- */
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
  try {
    const curDisplay = window.getComputedStyle(sf).display;
    if (curDisplay === 'none' || sf.style.display === 'none') { if (callback) callback(); return; }
    sf.style.transition = 'opacity 180ms ease';
    sf.style.opacity = '1';
    // force layout
    sf.offsetHeight;
    sf.style.opacity = '0';
    setTimeout(() => {
      try {
        sf.style.display = 'none';
        sf.style.transition = '';
        sf.style.opacity = '1';
        Array.from(sf.querySelectorAll('*')).forEach(n=> n.style.display = 'none');
      } catch (e) {}
      if (callback) callback();
    }, 200);
  } catch(e){
    try { sf.style.display = 'none'; } catch(e){}
    if (callback) callback();
  }
}

/* --------- fetch with progress (stream reader) --------- */
async function fetchWithProgress(url, onProgress = ()=>{}) {
  const resp = await fetch(encodeURI(url));
  if (!resp.ok) throw new Error(`fetch failed ${url} ${resp.status}`);
  const contentLength = resp.headers.get('Content-Length');
  if (!resp.body || !contentLength) {
    const blob = await resp.blob();
    onProgress(100);
    return blob;
  }
  const total = parseInt(contentLength, 10);
  const reader = resp.body.getReader();
  let received = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    const pct = Math.round((received / total) * 100);
    try { onProgress(pct); } catch(e){}
  }
  let size = 0;
  for (const c of chunks) size += c.length;
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) { combined.set(c, offset); offset += c.length; }
  return new Blob([combined]);
}

/* simple queue runner */
async function runQueue(tasks, concurrency = 4) {
  const results = new Array(tasks.length);
  let idx = 0;
  let running = 0;
  return new Promise((resolve) => {
    function next() {
      if (idx >= tasks.length && running === 0) { resolve(results); return; }
      while (running < concurrency && idx < tasks.length) {
        const i = idx++;
        running++;
        tasks[i]().then(res => { running--; results[i] = { ok:true, value: res }; next(); })
                 .catch(err => { running--; results[i] = { ok:false, err }; next(); });
      }
    }
    next();
  });
}

/* --------- ensureCareerLoaded: sequential per-career files --------- */
export async function ensureCareerLoaded(career, onProgress = ()=>{}) {
  if (!career || !careers.includes(career)) throw new Error('invalid career ' + career);
  if (!assets[career]) assets[career] = { modelBlobUrl: null, videoBlobUrl: null, markerBlobUrl: null };

  const a = assets[career];
  const alreadyModel = !!(a.modelBlobUrl);
  const alreadyVideo = !!(a.videoBlobUrl);
  const alreadyMarker = !!(a.markerBlobUrl);

  if (alreadyModel && alreadyVideo) {
    try { onProgress(100, null, null); } catch(e){}
    document.dispatchEvent(new CustomEvent('career-load-progress', { detail: { career, pct: 100, file: null, type: 'all' } }));
    return assets[career];
  }

  const files = [];
  if (career === 'Computer') {
    files.push({ url: `${JOB_ROOT}/Computer/marker.mind`, type: 'marker', key: 'markerBlobUrl' });
  }
  // prefer first candidate name (keeps logic simple)
  files.push({ url: `${JOB_ROOT}/${career}/${candidates[career].model[0]}`, type: 'model', key: 'modelBlobUrl' });
  files.push({ url: `${JOB_ROOT}/${career}/${candidates[career].video[0]}`, type: 'video', key: 'videoBlobUrl' });

  const totalFiles = files.length;
  for (let i=0;i<files.length;i++){
    const it = files[i];
    if (assets[career][it.key]) {
      const pctOverall = Math.round(((i+1) / totalFiles) * 100);
      try { onProgress(pctOverall, it.url, it.type); } catch(e){}
      document.dispatchEvent(new CustomEvent('career-load-progress', { detail: { career, pct: pctOverall, file: it.url, type: it.type } }));
      continue;
    }
    try {
      const blob = await fetchWithProgress(it.url, (p)=> {
        const base = (i) / totalFiles * 100;
        const overall = Math.round(base + (p/totalFiles));
        try { onProgress(overall, it.url, it.type); } catch(e){}
        document.dispatchEvent(new CustomEvent('career-load-progress', { detail: { career, pct: overall, file: it.url, type: it.type } }));
      });
      const blobUrl = URL.createObjectURL(blob);
      assets[career][it.key] = blobUrl;
      const pctOverall = Math.round(((i+1) / totalFiles) * 100);
      try { onProgress(pctOverall, it.url, it.type); } catch(e){}
      document.dispatchEvent(new CustomEvent('career-load-progress', { detail: { career, pct: pctOverall, file: it.url, type: it.type } }));
    } catch (e) {
      assets[career][it.key] = null;
      const pctOverall = Math.round(((i+1) / totalFiles) * 100);
      try { onProgress(pctOverall, it.url, it.type); } catch(e){}
      document.dispatchEvent(new CustomEvent('career-load-progress', { detail: { career, pct: pctOverall, file: it.url, type: it.type, ok:false } }));
    }
  }
  return assets[career];
}

export function isCareerReady(career) {
  const a = assets[career] || {};
  return !!(a && a.modelBlobUrl && a.videoBlobUrl);
}

/* --------- preloadCritical: Computer then first other career; monotonic progress --------- */
export async function preloadCritical(onProgress = ()=>{}) {
  let lastPct = 0;
  const safeOn = (obj) => {
    try {
      const rawPct = (obj && typeof obj.pct === 'number') ? obj.pct : (obj && typeof obj.overall === 'number' ? obj.overall : 0);
      let pct = Math.max(0, Math.min(100, Math.round(rawPct)));
      if (pct < lastPct) pct = lastPct;
      lastPct = pct;
      const out = Object.assign({}, obj, { pct });
      try { onProgress(out); } catch(e){}
    } catch(e){}
  };

  try {
    safeOn({ phase:'phaseA-start', pct: 0 });
    await ensureCareerLoaded('Computer', (pct, file, type) => {
      // map Computer 0..100 -> overall 0..50
      const overall = Math.round((pct * 0.5));
      safeOn({ phase:'phaseA-career', career:'Computer', pct: overall, file, type, startReady: false });
    });
  } catch(e) {
    safeOn({ phase:'phaseA-error', pct: 10 });
  }

  // other careers sequentially; show only first non-Computer as second half of bar
  const order = [...careers].filter(c => c !== 'Computer');
  let firstOther = null;
  for (let i=0;i<order.length;i++) {
    const career = order[i];
    try {
      await ensureCareerLoaded(career, (pct, file, type) => {
        if (!firstOther) {
          // map to 50..100
          const overall = 50 + Math.round(pct * 0.5);
          safeOn({ phase:'phaseB-career', career, pct: overall, file, type });
        }
      });
      if (!firstOther && isCareerReady(career)) firstOther = career;
    } catch(e) {
      // ignore per career failures
    }
    const compReady = isCareerReady('Computer');
    const startOk = compReady && !!firstOther;
    if (startOk) {
      safeOn({ phase:'check-start', pct: 100, startReady: true });
      break;
    }
  }

  // Phase C: load game assets quietly (do not decrease main progress)
  try {
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
      await runQueue(list.map(u=> async () => {
        try {
          const r = await fetch(encodeURI(u));
          if (!r.ok) return;
          const b = await r.blob();
          const url = URL.createObjectURL(b);
          gameAssets[u.replace('game_assets/','')] = url;
        } catch(e){}
      }), 6);
    }
  } catch(e){
    // ignore
  }

  assets.gameAssets = gameAssets;
  // notify UI that game assets exist (so game button can enable)
  try { document.dispatchEvent(new CustomEvent('game-assets-ready',{ detail:{} })); } catch(e){}

  safeOn({ phase:'critical-done', pct: 100, startReady: (isCareerReady('Computer') && careers.some(c=> c !== 'Computer' && isCareerReady(c))) });
  return assets;
}

/* --------- preloadRemaining: per-folder sequential loading (less parallel pressure) --------- */
export async function preloadRemaining() {
  for (const career of careers) {
    try {
      const a = assets[career] || {};
      // model then video sequentially
      if (!a.modelBlobUrl) {
        try {
          const modelUrl = `${JOB_ROOT}/${career}/${candidates[career].model[0]}`;
          const r = await fetch(encodeURI(modelUrl));
          if (r && r.ok) {
            const b = await r.blob();
            const blobUrl = URL.createObjectURL(b);
            if (!assets[career]) assets[career] = { modelBlobUrl: null, videoBlobUrl: null };
            assets[career].modelBlobUrl = blobUrl;
            document.dispatchEvent(new CustomEvent('career-load-progress', { detail: { career, pct: 100, file: modelUrl, type:'model' } }));
          }
        } catch(e){}
      }
      if (!assets[career].videoBlobUrl) {
        try {
          const videoUrl = `${JOB_ROOT}/${career}/${candidates[career].video[0]}`;
          const r2 = await fetch(encodeURI(videoUrl));
          if (r2 && r2.ok) {
            const b2 = await r2.blob();
            const blobUrl2 = URL.createObjectURL(b2);
            assets[career].videoBlobUrl = blobUrl2;
            document.dispatchEvent(new CustomEvent('career-load-progress', { detail: { career, pct: 100, file: videoUrl, type:'video' } }));
          }
        } catch(e){}
      }
    } catch(e){}
  }

  // then quiet load game assets (if not already)
  try {
    const mf = await fetch('game_assets/manifest.json');
    if (mf && mf.ok) {
      const manifest = await mf.json();
      const list = [];
      for (const item of manifest) {
        if (item.image) list.push(`game_assets/cards/${item.image}`);
        if (item.audioWord) list.push(`game_assets/audio/${item.audioWord}`);
        if (item.audioMeaning) list.push(`game_assets/audio/${item.audioMeaning}`);
      }
      const sfx = ['game_assets/sfx/flip.wav','game_assets/sfx/match.wav','game_assets/sfx/win.mp3','game_assets/sfx/wrong.wav'];
      for (const u of [...list, ...sfx]) {
        try {
          if (gameAssets[u.replace('game_assets/','')]) continue;
          const r = await fetch(encodeURI(u));
          if (!r.ok) continue;
          const b = await r.blob();
          const url = URL.createObjectURL(b);
          gameAssets[u.replace('game_assets/','')] = url;
        } catch(e){}
      }
    }
  } catch(e){}
  // notify UI if game assets now exist
  try { if (Object.keys(gameAssets).length > 0) document.dispatchEvent(new CustomEvent('game-assets-ready',{ detail:{} })); } catch(e){}
  return true;
}

/* --------- GLTF loader + video creation --------- */
function loadGLTF(blobUrl) {
  return new Promise((resolve) => {
    if (!blobUrl) return resolve(null);
    const loader = new GLTFLoader();
    try {
      const dr = ensureDracoInitialized();
      loader.setDRACOLoader(dr);
    } catch(e) {}
    loader.load(blobUrl, (gltf) => resolve(gltf), undefined, (err)=>{ console.warn('gltf load err', err); resolve(null); });
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

/* --------- helpers for render order and material safety --------- */
function makeModelRenderPriority(model) {
  try {
    model.traverse(node => {
      if (node.isMesh) {
        node.renderOrder = 2;
        if (node.material) {
          node.material.depthTest = true;
          node.material.depthWrite = true;
        }
      }
    });
  } catch(e){}
}
function makeVideoLayer(videoMeshLocal) {
  try {
    if (!videoMeshLocal) return;
    videoMeshLocal.renderOrder = 1;
    if (videoMeshLocal.material) {
      videoMeshLocal.material.depthWrite = false;
      videoMeshLocal.material.depthTest = true;
    }
  } catch(e){}
}

/* --------- robust show/play helpers --------- */
function forceShowModel() {
  try {
    if (!anchor || !anchor.group) return;
    anchor.group.visible = true;
    if (gltfModel) {
      if (gltfModel.parent !== anchor.group) {
        try { anchor.group.add(gltfModel); } catch(e){ }
      }
      gltfModel.visible = true;
      gltfModel.traverse(node => {
        if (node.isMesh) {
          node.visible = true;
          node.frustumCulled = false;
          node.renderOrder = 3;
          if (node.material) {
            try {
              node.material.depthTest = true;
              node.material.depthWrite = true;
              if (typeof node.material.opacity !== 'undefined') node.material.opacity = 1;
              node.material.transparent = false;
              node.material.needsUpdate = true;
            } catch(e){}
          }
        }
      });
    }
    if (videoMesh && videoMesh.material) {
      try {
        videoMesh.renderOrder = 1;
        videoMesh.material.depthWrite = false;
        videoMesh.material.depthTest = true;
        videoMesh.material.transparent = true;
        videoMesh.material.opacity = 1;
        videoMesh.material.needsUpdate = true;
      } catch(e){}
    }
  } catch(e){ console.warn('forceShowModel err', e); }
}

function playModelAndVideo() {
  try {
    if (!anchor || !anchor.group) return;
    if (gltfModel) {
      if (gltfModel.parent !== anchor.group) try { anchor.group.add(gltfModel); } catch(e){}
      gltfModel.visible = true;
      gltfModel.traverse(node => {
        if (node.isMesh) {
          node.visible = true;
          node.frustumCulled = false;
          node.renderOrder = 3;
          if (node.material) {
            try {
              node.material.transparent = false;
              node.material.opacity = 1;
              node.material.depthTest = true;
              node.material.depthWrite = true;
              node.material.needsUpdate = true;
            } catch(e){}
          }
        }
      });
      if (mixer) {
        try { mixer.timeScale = 1; } catch(e){}
        mixerActions.forEach(a => { try { a.play(); } catch(e){} });
      }
    }
    if (videoMesh) {
      if (videoMesh.parent !== anchor.group) try { anchor.group.add(videoMesh); } catch(e){}
      videoMesh.visible = true;
    }
    if (videoElem) {
      try {
        const p = videoElem.play();
        if (p && p.catch) {
          p.catch(err => {
            console.warn('video.play rejected - trying muted fallback', err);
            try { videoElem.muted = true; const p2 = videoElem.play(); if (p2 && p2.catch) p2.catch(()=>{}); } catch(e){ console.warn('muted fallback err', e); }
          });
        }
      } catch(e){ console.warn('video.play sync err', e); }
    }
  } catch(e) { console.warn('playModelAndVideo err', e); }
}

/* --------- clear or pause anchor content --------- */
function clearAnchorContent(keep=false) {
  if (keep) {
    if (videoElem) try { videoElem.pause(); } catch(e){}
    if (mixer) try { mixer.timeScale = 0; } catch(e){}
    isPausedByBack = true;
    waitingForMarkerPlay = false;
    pausedByTrackingLoss = false;
    return;
  }
  if (mixer) try { mixer.stopAllAction(); } catch(e){} mixer = null;
  mixerActions = [];
  if (gltfModel) try{ if (gltfModel.parent) gltfModel.parent.remove(gltfModel); }catch{} gltfModel = null;
  if (videoMesh) try{ if (videoMesh.parent) videoMesh.parent.remove(videoMesh); }catch{} videoMesh = null;
  if (videoElem) try{ videoElem.pause(); videoElem.src = ''; }catch{} videoElem = null;
  waitingForMarkerPlay = false;
  pausedByTrackingLoss = false;
}

/* --------- attach content to anchor (model & video) --------- */
function attachContentToAnchor(gltf, video) {
  // remove previous
  if (gltfModel) try{ if (gltfModel.parent) gltfModel.parent.remove(gltfModel); }catch(e){} gltfModel = null;
  if (videoMesh) try{ if (videoMesh.parent) videoMesh.parent.remove(videoMesh); }catch(e){} videoMesh = null;
  if (videoElem) try{ videoElem.pause(); } catch(e){} videoElem = null;
  mixer = null;
  mixerActions = [];

  if (gltf && gltf.scene) {
    gltfModel = gltf.scene;
    gltfModel.scale.set(0.4,0.4,0.4);
    gltfModel.position.set(-0.25, -0.45, 0.05);
    gltfModel.visible = false;
    try { anchor.group.add(gltfModel); } catch(e){}
    try { gltfModel.rotation.set(0,0,0); gltfModel.quaternion.set(0,0,0,1); gltfModel.updateMatrixWorld(true); } catch(e){}
    makeModelRenderPriority(gltfModel);
    if (gltf.animations && gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(gltfModel);
      gltf.animations.forEach(c => {
        try {
          const action = mixer.clipAction(c);
          action.play();
          mixerActions.push(action);
        } catch(e){}
      });
      mixer.timeScale = 0;
    }
  }

  if (video) {
    videoElem = video;
    try { videoElem.pause(); } catch(e){}
    const texture = new THREE.VideoTexture(videoElem);
    try { texture.colorSpace = THREE.SRGBColorSpace; } catch(e){}
    const plane = new THREE.PlaneGeometry(0.6, 0.6 * (16/9));
    const mat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    videoMesh = new THREE.Mesh(plane, mat);
    videoMesh.position.set(0, -0.05, -0.05);
    videoMesh.visible = false;
    try { anchor.group.add(videoMesh); } catch(e){}
    try { videoMesh.rotation.set(0,0,0); videoMesh.quaternion.set(0,0,0,1); videoMesh.updateMatrixWorld(true); } catch(e){}
    makeVideoLayer(videoMesh);

    // on metadata, resize plane and nudge model up
    videoElem.onloadedmetadata = () => {
      try {
        const asp = (videoElem.videoWidth / videoElem.videoHeight) || (9/16);
        const width = 0.6;
        const height = width / asp;
        videoMesh.geometry.dispose();
        videoMesh.geometry = new THREE.PlaneGeometry(width, height);
        videoMesh.position.set(0, 0, -0.05);
        if (gltfModel) {
          gltfModel.updateMatrixWorld(true);
          bbox.setFromObject(gltfModel);
          worldMin.copy(bbox.min);
          anchor.group.worldToLocal(worldMin);
          videoMesh.getWorldPosition(worldPos);
          anchor.group.worldToLocal(worldPos);
          const videoBottomLocalY = worldPos.y - (height / 2);
          const deltaY = videoBottomLocalY - worldMin.y;
          const UP_NUDGE = 0.03;
          gltfModel.position.y += deltaY + UP_NUDGE;
        }
      } catch(e){}
    };

    videoElem.onended = () => {
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
    };
  }

  // ensure visible to avoid race conditions
  try { forceShowModel(); } catch(e){}
}

/* --------- ensureContentForCareer: load/generate elements if missing --------- */
async function ensureContentForCareer(career) {
  if (!career) return;
  const a = assets[career] || {};
  // model if missing
  if (!gltfModel && a.modelBlobUrl) {
    const g = await loadGLTF(a.modelBlobUrl);
    if (g) {
      try { anchor.group.add(g.scene); } catch(e){}
      attachContentToAnchor(g, null);
      if (isAnchorTracked && gltfModel) {
        try { gltfModel.visible = true; if (mixer) mixer.timeScale = 1; } catch(e){}
      }
    }
  }
  // video if missing
  if (!videoMesh && a.videoBlobUrl) {
    const v = makeVideoElem(a.videoBlobUrl);
    if (v) {
      const dummy = gltfModel ? { scene: gltfModel } : null;
      attachContentToAnchor(dummy, v);
      if (isAnchorTracked && videoElem) {
        try { videoMesh.visible = true; } catch(e){}
      }
    }
  }
}

/* --------- yaw math for sync --------- */
function computeAnchorCameraYaw() {
  if (!anchor || !anchor.group || !camera) return null;
  const anchorWorldPos = anchor.group.getWorldPosition(new THREE.Vector3());
  const dir = new THREE.Vector3().copy(camera.position).sub(anchorWorldPos);
  const angle = Math.atan2(dir.x, dir.z);
  return angle;
}
function applyYawToObject(obj, angle, smooth=1.0) {
  if (!obj || angle === null) return;
  try {
    const targetWorldQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0));
    if (obj.parent) {
      obj.parent.getWorldQuaternion(parentWorldQuat);
      parentWorldQuat.invert();
      targetLocalQuat.copy(parentWorldQuat).multiply(targetWorldQuat);
    } else {
      targetLocalQuat.copy(targetWorldQuat);
    }
    if (smooth >= 0.999) {
      obj.quaternion.copy(targetLocalQuat);
    } else {
      obj.quaternion.slerp(targetLocalQuat, smooth);
    }
  } catch(e){}
}

/* --------- initAndStart: create MindAR and attach Computer content if present --------- */
export async function initAndStart(containerElement) {
  const markerSrc = (assets['Computer'] && assets['Computer'].markerBlobUrl) ? assets['Computer'].markerBlobUrl : `${JOB_ROOT}/Computer/marker.mind`;
  mindarThree = new MindARThree({
    container: containerElement,
    imageTargetSrc: markerSrc,
    sticky: true,
    filterMinCF: 0.0001,
    filterBeta: 0.005
  });
  ({ renderer, scene, camera } = mindarThree);
  try { renderer.outputColorSpace = THREE.SRGBColorSpace; } catch(e){}
  createLights(scene);
  anchor = mindarThree.addAnchor(0);

  // Attach Computer content if already loaded
  const comp = assets['Computer'] || {};
  const g = comp.modelBlobUrl ? await loadGLTF(comp.modelBlobUrl) : null;
  const v = comp.videoBlobUrl ? makeVideoElem(comp.videoBlobUrl) : null;
  attachContentToAnchor(g, v);
  playingCareer = 'Computer';
  lastCareer = 'Computer';
  if (careerActions()) careerActions().style.display = 'none';
  /* Ensure attached and visible (re-attach if necessary)
   — วางไว้หลัง applyYawToObject() แต่ก่อน initAndStart / anchor.onTargetFound */
function ensureAttachedAndVisible() {
  try {
    if (!anchor || !anchor.group) return;

    // ensure model is attached and visible
    if (gltfModel) {
      if (gltfModel.parent !== anchor.group) {
        try { anchor.group.add(gltfModel); } catch(e){ console.warn('attach gltfModel err', e); }
      }
      gltfModel.visible = true;
      gltfModel.traverse(node => {
        if (node.isMesh) {
          node.visible = true;
          // ปิด frustum culling บางกรณี mesh ถูกซ่อนโดยไม่ตั้งใจ
          node.frustumCulled = false;
          // higher render order to be in front of video
          node.renderOrder = 3;
          if (node.material) {
            try {
              node.material.depthTest = true;
              node.material.depthWrite = true;
              // restore opacity/transparent flags in case they were toggled
              if (typeof node.material.opacity !== 'undefined') node.material.opacity = 1;
              node.material.transparent = false;
              node.material.needsUpdate = true;
            } catch(e){}
          }
        }
      });
    }

    // ensure video mesh attached and visible
    if (videoMesh) {
      if (videoMesh.parent !== anchor.group) {
        try { anchor.group.add(videoMesh); } catch(e){ console.warn('attach videoMesh err', e); }
      }
      videoMesh.visible = true;
      try {
        // keep video behind model
        videoMesh.renderOrder = 1;
        if (videoMesh.material) {
          videoMesh.material.depthWrite = false;
          videoMesh.material.depthTest = true;
          videoMesh.material.transparent = true;
          videoMesh.material.opacity = 1;
          videoMesh.material.needsUpdate = true;
        }
      } catch(e){}
    }

  } catch (e) {
    console.warn('ensureAttachedAndVisible err', e);
  }
}

  anchor.onTargetFound = () => {
    isAnchorTracked = true;
    (async () => {
      hideScanFrameThen(() => {});
      try { await ensureContentForCareer(playingCareer); } catch(e){}
      ensureAttachedAndVisible();
      try { forceShowModel(); } catch(e){}
      if (!autoPlayEnabled) return;
      if (pausedByTrackingLoss) {
        if (mixer) try { mixer.timeScale = 1; } catch(e){}
        if (videoElem && videoElem.paused) try { videoElem.play(); } catch(e){}
        pausedByTrackingLoss = false;
        waitingForMarkerPlay = false;
        return;
      }
      const startNow = () => {
        if (gltfModel) try { gltfModel.visible = true; } catch(e){}
        if (mixer) try { mixer.timeScale = 1; } catch(e){}
        if (videoElem) try { videoElem.currentTime = 0; videoElem.play(); } catch(e){}
      };
      if (waitingForMarkerPlay || (videoElem && videoElem.paused && playingCareer)) {
        setTimeout(startNow, 300);
        waitingForMarkerPlay = false;
        return;
      }
    })();
  };

  anchor.onTargetLost = () => {
    isAnchorTracked = false;
    if (scanFrame()) scanFrame().style.display = 'none';
    if (!autoPlayEnabled) return;
    if (videoElem && !videoElem.paused) {
      try { videoElem.pause(); pausedByTrackingLoss = true; } catch(e){}
    }
    if (mixer) {
      try { mixer.timeScale = 0; } catch(e){}
    }
    // keep children attached for quick resume
  };

  await mindarThree.start();

  renderer.setAnimationLoop(()=> {
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);

    try {
      if (anchor && anchor.group && camera) {
        tmpObj.position.copy(anchor.group.getWorldPosition(new THREE.Vector3()));
        tmpObj.lookAt(camera.position);
        tmpObj.updateMatrixWorld();
        tmpObj.getWorldQuaternion(tmpQuat);
        if (anchor.group.parent) {
          anchor.group.parent.getWorldQuaternion(parentWorldQuat);
          parentWorldQuat.invert();
          targetLocalQuat.copy(parentWorldQuat).multiply(tmpQuat);
        } else {
          targetLocalQuat.copy(tmpQuat);
        }
        anchor.group.quaternion.slerp(targetLocalQuat, SMOOTH_FACTOR);
      }

      const yaw = computeAnchorCameraYaw();
      applyYawToObject(gltfModel, yaw, 0.92);
      applyYawToObject(videoMesh, yaw, 1.0);

    } catch(e){}

    renderer.render(scene, camera);
  });
}

/* --------- playCareer: attach & play chosen career content --------- */
export async function playCareer(career) {
  if (playingCareer === career && isPausedByBack && videoElem) {
    if (careerMenu()) careerMenu().style.display = 'none';
    setNoScan(true);
    isPausedByBack = false;
    try { if (videoElem && videoElem.paused) videoElem.play(); } catch(e){}
    if (mixer) try { mixer.timeScale = 1; } catch(e){}
    if (gltfModel) try { gltfModel.visible = true; } catch(e){}
    try { forceShowModel(); } catch(e){}
    try { playModelAndVideo(); } catch(e){}
    return;
  }

  if (backBtn()) backBtn().style.display = 'inline-block';
  if (careerMenu()) careerMenu().style.display = 'none';
  if (career !== 'Computer') {
    if (careerActions()) careerActions().style.display = 'flex';
  } else {
    if (careerActions()) careerActions().style.display = 'none';
  }

  setAutoPlayEnabled(true);

  if (playingCareer && playingCareer !== career) {
    clearAnchorContent(false);
    playingCareer = null;
    isPausedByBack = false;
    waitingForMarkerPlay = false;
    pausedByTrackingLoss = false;
  }

  setNoScan(true);

  const a = assets[career] || {};
  const gltf = a.modelBlobUrl ? await loadGLTF(a.modelBlobUrl) : null;
  const vid = a.videoBlobUrl ? makeVideoElem(a.videoBlobUrl) : null;

  attachContentToAnchor(gltf, vid);

  playingCareer = career;
  lastCareer = career;
  isPausedByBack = false;

  if (isAnchorTracked && autoPlayEnabled) {
    try { if (gltfModel) gltfModel.visible = true; } catch(e){}
    try { if (videoMesh) videoMesh.visible = true; } catch(e){}
    try { forceShowModel(); } catch(e){}
    setTimeout(()=> {
      if (mixer) try { mixer.timeScale = 1; } catch(e){}
      if (videoElem) {
        try {
          const p = videoElem.play();
          if (p && p.catch) p.catch(err => console.warn('[AR] playCareer video.play rejected', err));
        } catch(e){ console.warn('[AR] playCareer video.play sync err', e); }
      }
      if (mixerActions && mixerActions.length) {
        mixerActions.forEach(a => { try { a.play(); } catch(e){} });
      }
    }, 500);
    waitingForMarkerPlay = false;
  } else {
    waitingForMarkerPlay = true;
  }
}

/* --------- menu control functions --------- */
export function pauseAndShowMenu() {
  if (videoElem) try { videoElem.pause(); } catch(e){}
  if (mixer) try { mixer.timeScale = 0; } catch(e){}
  isPausedByBack = true;
  setAutoPlayEnabled(false);
  if (careerActions()) careerActions().style.display = (playingCareer && playingCareer !== 'Computer') ? 'flex' : 'none';
  if (careerMenu()) careerMenu().style.display = 'flex';
  if (backBtn()) backBtn().style.display = 'none';
  setNoScan(true);
  waitingForMarkerPlay = false;
  pausedByTrackingLoss = false;
}

export function returnToLast() {
  if (!lastCareer) return;
  setAutoPlayEnabled(true);
  if (playingCareer === lastCareer && isPausedByBack && videoElem) {
    if (careerMenu()) careerMenu().style.display = 'none';
    if (backBtn()) backBtn().style.display = 'inline-block';
    isPausedByBack = false;
    try { if (gltfModel) gltfModel.visible = true; if (videoMesh) videoMesh.visible = true; if (videoElem && videoElem.paused) videoElem.play(); } catch(e){}
    if (mixer) try { mixer.timeScale = 1; } catch(e){}
    if (lastCareer !== 'Computer' && careerActions()) careerActions().style.display = 'flex';
    setNoScan(true);
    try { forceShowModel(); } catch(e){}
    try { playModelAndVideo(); } catch(e){}
    return;
  }
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
  setNoScan(true);
}

export function getAssets() { return assets; }

/* --------- simple lights helper --------- */
function createLights(sceneLocal) {
  try {
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
    hemi.position.set(0, 1, 0);
    sceneLocal.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(0.5, 1, 0.5);
    sceneLocal.add(dir);
    const amb = new THREE.AmbientLight(0x202020, 0.6);
    sceneLocal.add(amb);
  } catch(e){}
}
