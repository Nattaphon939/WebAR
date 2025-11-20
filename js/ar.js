// js/ar.js
// Full, consolidated AR runtime for your project.
// Exports used elsewhere: preloadCritical, preloadRemaining, ensureCareerLoaded, isCareerReady,
// initAndStart, playCareer, pauseAndShowMenu, returnToLast, removeCurrentAndShowMenu, resetToIdle,
// getAssets, setNoScan, setAutoPlayEnabled

import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const JOB_ROOT = './Job';
const careers = ['Computer','AI','Cloud','Data_Center','Network'];
const candidates = {
  Computer: { model: ['Computer-Model.glb','computer-model.glb','Computer-model.glb'], video: ['Computer.mp4','computer.mp4','Computer-Video.mp4'] },
  AI:       { model: ['ai-model.glb','AI-model.glb','ai-model.GLTF','AI-Model.glb'], video: ['AI.mp4','ai.mp4','ai-video.mp4','Al.mp4'] },
  Cloud:    { model: ['cloud-model.glb','Cloud-model.glb','cloud-model.GLTF'], video: ['video-cloud.mp4','cloud.mp4','cloud-video.mp4'] },
  Data_Center: { model: ['Data_Center-model.glb','Data_Center-model.glb','Data_ Center-model.glb','Data_Center-model.GLTF'], video: ['Data_Center-Video.mp4','data_center.mp4','data-center.mp4'] },
  Network:  { model: ['network-model.glb','Network-model.glb','network-model.GLTF'], video: ['video-network.mp4','network.mp4','network-video.mp4'] },
};

// assets store (per career): { markerBlobUrl?, modelBlobUrl?, videoBlobUrl? }
const assets = {};
const gameAssets = {};

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

/* DRACO setup */
let dracoLoader = null;
function ensureDracoInitialized() {
  if (dracoLoader) return dracoLoader;
  dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
  return dracoLoader;
}

/* temps */
const tmpObj = new THREE.Object3D();
const tmpQuat = new THREE.Quaternion();
const parentWorldQuat = new THREE.Quaternion();
const targetLocalQuat = new THREE.Quaternion();
const bbox = new THREE.Box3();
const worldMin = new THREE.Vector3();
const worldPos = new THREE.Vector3();
const SMOOTH_FACTOR = 0.12;

/* hideScanFrameThen */
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
  sf.style.transition = 'opacity 180ms ease';
  sf.style.opacity = '1';
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
}

/* fetchWithProgress */
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

/* runQueue */
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

/* ensureCareerLoaded: sequential per-folder (marker/model/video) + emits progress with file/type */
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
      // mark null but continue (UI will show partial)
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

/* preloadCritical: Computer first (including marker), then other careers one-by-one (use first other to fill bar 50..100),
   then load small set of game assets quietly. Emits progress objects; the caller should inspect `startReady` boolean
   to enable the "แตะเพื่อเริ่ม AR" button when Computer + at least one other career ready.
*/
export async function preloadCritical(onProgress = ()=>{}) {
  // monotonic wrapper for pct (never decrease)
  let lastPct = 0;
  function safeOn(obj) {
    try {
      const raw = (typeof obj.pct === 'number') ? obj.pct : (obj && obj.overall) ? obj.overall : 0;
      let pct = Math.max(0, Math.min(100, Math.round(raw)));
      if (pct < lastPct) pct = lastPct;
      lastPct = pct;
      const out = Object.assign({}, obj, { pct });
      try { onProgress(out); } catch(e){}
    } catch(e){}
  }

  // Phase A: Computer
  safeOn({ phase:'phaseA-start', pct:0, startReady:false });
  try {
    await ensureCareerLoaded('Computer', (pct, file, type) => {
      // map 0..100 -> 0..50
      const overall = Math.round(pct * 0.5);
      safeOn({ phase:'phaseA-career', career:'Computer', pct: overall, file, type, startReady:false });
    });
  } catch(e) {
    safeOn({ phase:'phaseA-error', pct: 10, startReady:false });
  }

  // Phase B: other careers sequentially; first non-Computer will map to 50..100 for progress bar
  const order = [...careers].filter(c => c !== 'Computer');
  let firstOther = null;
  for (let ci=0; ci<order.length; ci++) {
    const career = order[ci];
    try {
      await ensureCareerLoaded(career, (pct, file, type) => {
        if (!firstOther) {
          const overall = 50 + Math.round(pct * 0.5);
          safeOn({ phase:'phaseB-career', career, pct: overall, file, type, startReady: overall >= 100 });
        } else {
          // For subsequent careers don't move main bar but still emit progress for their button
          safeOn({ phase:'phaseB-career-background', career, pct, file, type });
        }
      });
      if (!firstOther && isCareerReady(career)) firstOther = career;
    } catch(e) {
      // ignore errors for individual careers
    }

    // After finishing each career, check if we have Computer + at least one other ready
    try {
      const compReady = isCareerReady('Computer');
      const startOk = compReady && !!firstOther;
      if (startOk) {
        safeOn({ phase:'check-start', startReady: true, pct: 100 });
        break; // we have enough to start; we still load remaining careers below in preloadRemaining
      }
    } catch(e){}
  }

  // Phase C: small game asset set (quiet); do not reduce main bar
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
      // only include files you likely have; avoid flip/match/wrong if absent
      list.push('game_assets/sfx/win.mp3');
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
  } catch(e) {}

  assets.gameAssets = gameAssets;
  safeOn({ phase:'critical-done', pct: 100, startReady: (isCareerReady('Computer') && careers.some(c=> c !== 'Computer' && isCareerReady(c))) });
  return assets;
}

/* preloadRemaining: quiet background loader (per-folder sequential) */
export async function preloadRemaining() {
  for (const career of careers) {
    try {
      const a = assets[career] || {};
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

  // small game assets quietly
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
      const sfx = ['game_assets/sfx/win.mp3'];
      for (const u of [...list, ...sfx]) {
        try {
          const r = await fetch(encodeURI(u));
          if (!r.ok) continue;
          const b = await r.blob();
          const url = URL.createObjectURL(b);
          gameAssets[u.replace('game_assets/','')] = url;
        } catch(e){}
      }
    }
  } catch(e){}
  return true;
}

/* loaders */
function loadGLTF(blobUrl) {
  return new Promise((resolve) => {
    if (!blobUrl) return resolve(null);
    const loader = new GLTFLoader();
    try {
      const dr = ensureDracoInitialized();
      loader.setDRACOLoader(dr);
    } catch(e) {}
    loader.load(blobUrl, (gltf) => resolve(gltf), undefined, (err)=>{ resolve(null); });
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

/* material/render order helpers */
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
function makeVideoLayer(videoMesh) {
  try {
    if (!videoMesh) return;
    videoMesh.renderOrder = 1;
    if (videoMesh.material) {
      videoMesh.material.depthWrite = false;
      videoMesh.material.depthTest = true;
    }
  } catch(e){}
}

/* clear/attach */
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
  if (gltfModel) try{ if (gltfModel.parent) gltfModel.parent.remove(gltfModel); }catch{} gltfModel = null;
  if (videoMesh) try{ if (videoMesh.parent) videoMesh.parent.remove(videoMesh); }catch{} videoMesh = null;
  if (videoElem) try{ videoElem.pause(); videoElem.src = ''; }catch{} videoElem = null;
  waitingForMarkerPlay = false;
  pausedByTrackingLoss = false;
}

/* attachContentToAnchor - remove previous children, add new ones, set z-ordering */
function attachContentToAnchor(gltf, video) {
  if (gltfModel) try{ if (gltfModel.parent) gltfModel.parent.remove(gltfModel); }catch(e){} gltfModel = null;
  if (videoMesh) try{ if (videoMesh.parent) videoMesh.parent.remove(videoMesh); }catch(e){} videoMesh = null;
  if (videoElem) try{ videoElem.pause(); } catch(e){} videoElem = null;
  mixer = null;

  if (gltf && gltf.scene) {
    gltfModel = gltf.scene;
    gltfModel.scale.set(0.4,0.4,0.4);
    // place model slightly in front (z positive)
    gltfModel.position.set(-0.25, -0.45, 0.02);
    gltfModel.visible = false;
    try { anchor.group.add(gltfModel); } catch(e){}
    try { gltfModel.rotation.set(0,0,0); gltfModel.quaternion.set(0,0,0,1); gltfModel.updateMatrixWorld(true); } catch(e){}
    makeModelRenderPriority(gltfModel);
    if (gltf.animations && gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(gltfModel);
      gltf.animations.forEach(c => { const action = mixer.clipAction(c); action.play(); });
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
    // keep video slightly behind (z negative)
    videoMesh.position.set(0, -0.05, -0.01);
    videoMesh.visible = false;
    try { anchor.group.add(videoMesh); } catch(e){}
    try { videoMesh.rotation.set(0,0,0); videoMesh.quaternion.set(0,0,0,1); videoMesh.updateMatrixWorld(true); } catch(e){}
    makeVideoLayer(videoMesh);

    videoElem.onloadedmetadata = () => {
      try {
        const asp = (videoElem.videoWidth / videoElem.videoHeight) || (9/16);
        const width = 0.6;
        const height = width / asp;
        videoMesh.geometry.dispose();
        videoMesh.geometry = new THREE.PlaneGeometry(width, height);
        // ensure z offset behind model
        videoMesh.position.set(0, 0, -0.01);
        if (gltfModel) {
          gltfModel.updateMatrixWorld(true);
          bbox.setFromObject(gltfModel);
          worldMin.copy(bbox.min);
          anchor.group.worldToLocal(worldMin);
          videoMesh.getWorldPosition(worldPos);
          anchor.group.worldToLocal(worldPos);
          const videoBottomLocalY = worldPos.y - (height / 2);
          const deltaY = videoBottomLocalY - worldMin.y;
          const UP_NUDGE = 0.03; // slightly larger to reduce overlaps
          gltfModel.position.y += deltaY + UP_NUDGE;
        }
      } catch(e){}
    };

    videoElem.onended = () => {
      lastCareer = playingCareer;
      // stop playback and clear content (consistent UX)
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
}

/* ensureContentForCareer: attach from assets if exist (used when pressing career before marker found) */
async function ensureContentForCareer(career) {
  if (!career) return;
  const a = assets[career] || {};
  // load model if missing
  if (!gltfModel && a.modelBlobUrl) {
    const g = await loadGLTF(a.modelBlobUrl);
    if (g) {
      try { anchor.group.add(g.scene); } catch(e){}
      attachContentToAnchor(g, null); // will re-add model (and preserve existing video if any)
      // If anchor currently tracked, make model visible now
      if (isAnchorTracked && gltfModel) {
        try { gltfModel.visible = true; if (mixer) mixer.timeScale = 1; } catch(e){}
      }
    }
  }
  // load video if missing
  if (!videoMesh && a.videoBlobUrl) {
    const v = makeVideoElem(a.videoBlobUrl);
    if (v) {
      const dummyGltf = gltfModel ? { scene: gltfModel } : null;
      attachContentToAnchor(dummyGltf, v);
      if (isAnchorTracked && videoElem) {
        try { videoMesh.visible = true; } catch(e){}
      }
    }
  }
}

/* compute single yaw angle for anchor->camera (used to sync both model+video) */
function computeAnchorCameraYaw() {
  if (!anchor || !anchor.group || !camera) return null;
  const anchorWorldPos = anchor.group.getWorldPosition(new THREE.Vector3());
  const dir = new THREE.Vector3().copy(camera.position).sub(anchorWorldPos);
  const angle = Math.atan2(dir.x, dir.z);
  return angle;
}

/* apply yaw to object (relative to parent) with smoothing */
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

/* ensure attached & visible (re-attach if needed) */
function ensureAttachedAndVisible() {
  try {
    if (!anchor || !anchor.group) return;
    if (gltfModel) {
      if (gltfModel.parent !== anchor.group) {
        try { anchor.group.add(gltfModel); } catch(e){}
      }
      gltfModel.visible = true;
    }
    if (videoMesh) {
      if (videoMesh.parent !== anchor.group) {
        try { anchor.group.add(videoMesh); } catch(e){}
      }
      videoMesh.visible = true;
    }
  } catch(e){}
}

/* initAndStart */
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

  // Attach Computer content if already loaded in assets
  const comp = assets['Computer'] || {};
  const g = comp.modelBlobUrl ? await loadGLTF(comp.modelBlobUrl) : null;
  const v = comp.videoBlobUrl ? makeVideoElem(comp.videoBlobUrl) : null;
  attachContentToAnchor(g, v);
  playingCareer = 'Computer';
  lastCareer = 'Computer';
  if (careerActions()) careerActions().style.display = 'none';

  anchor.onTargetFound = () => {
    isAnchorTracked = true;
    (async () => {
      hideScanFrameThen(() => {});
      try { await ensureContentForCareer(playingCareer); } catch(e){}
      ensureAttachedAndVisible();
      // resume if paused by tracking loss
      if (!autoPlayEnabled) return;
      if (pausedByTrackingLoss) {
        if (mixer) try { mixer.timeScale = 1; } catch(e){}
        if (videoElem && videoElem.paused) try { videoElem.play(); } catch(e){}
        pausedByTrackingLoss = false;
        waitingForMarkerPlay = false;
        return;
      }
      // start both model + video when anchor found and waitingForMarkerPlay flag set (or video paused)
      const startNow = () => {
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
    // DON'T remove children: keep them attached so re-scan reuses them
  };

  await mindarThree.start();

  renderer.setAnimationLoop(()=> {
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);

    try {
      // keep anchor group smoothing
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

      // compute single yaw and apply to both
      const yaw = computeAnchorCameraYaw();
      applyYawToObject(gltfModel, yaw, 0.92);
      applyYawToObject(videoMesh, yaw, 1.0);

    } catch(e){}

    renderer.render(scene, camera);
  });
}

/* playCareer */
export async function playCareer(career) {
  if (playingCareer === career && isPausedByBack && videoElem) {
    if (careerMenu()) careerMenu().style.display = 'none';
    setNoScan(true);
    isPausedByBack = false;
    try { if (videoElem && videoElem.paused) videoElem.play(); } catch(e){}
    if (mixer) try { mixer.timeScale = 1; } catch(e){}
    if (gltfModel) try { gltfModel.visible = true; } catch(e){}
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
    setTimeout(()=> {
      if (mixer) try { mixer.timeScale = 1; } catch(e){}
      if (videoElem) try { videoElem.currentTime = 0; videoElem.play(); } catch(e){}
    }, 500);
    waitingForMarkerPlay = false;
  } else {
    waitingForMarkerPlay = true;
  }
}

/* pauseAndShowMenu, returnToLast, removeCurrentAndShowMenu, resetToIdle */
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

/* create lights helper */
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
