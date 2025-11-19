// js/ar.js
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

/* helpers */
const tmpObj = new THREE.Object3D();
const tmpQuat = new THREE.Quaternion();
const parentWorldQuat = new THREE.Quaternion();
const targetLocalQuat = new THREE.Quaternion();
const bbox = new THREE.Box3();
const worldMin = new THREE.Vector3();
const worldPos = new THREE.Vector3();
const SMOOTH_FACTOR = 0.12;
// NEW: small temp vector for alignObjectToCamera
const tmpWorldVec = new THREE.Vector3();

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

/* small concurrency runner */
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

/* fetch with progress (streaming) */
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
    onProgress(pct);
  }
  let size = 0;
  for (const c of chunks) size += c.length;
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) { combined.set(c, offset); offset += c.length; }
  return new Blob([combined]);
}

/* ensureCareerLoaded */
export async function ensureCareerLoaded(career, onProgress = ()=>{}) {
  if (!career || !careers.includes(career)) throw new Error('invalid career ' + career);
  const a = assets[career] || {};
  const alreadyModel = !!(a.modelBlobUrl);
  const alreadyVideo = !!(a.videoBlobUrl);
  if (alreadyModel && alreadyVideo) {
    onProgress(100);
    document.dispatchEvent(new CustomEvent('career-load-progress', { detail: { career, pct: 100 } }));
    return assets[career];
  }

  const modelUrl = `${JOB_ROOT}/${career}/${candidates[career].model[0]}`;
  const videoUrl = `${JOB_ROOT}/${career}/${candidates[career].video[0]}`;

  let modelPct = alreadyModel ? 100 : 0;
  let videoPct = alreadyVideo ? 100 : 0;
  function emit() {
    const combined = Math.round((modelPct + videoPct) / 2);
    onProgress(combined);
    document.dispatchEvent(new CustomEvent('career-load-progress', { detail: { career, pct: combined } }));
  }
  emit();

  const tasks = [];
  if (!alreadyModel) {
    tasks.push((async () => {
      try {
        const blob = await fetchWithProgress(modelUrl, (p)=> { modelPct = p; emit(); });
        const url = URL.createObjectURL(blob);
        if (!assets[career]) assets[career] = { modelBlobUrl: null, videoBlobUrl: null };
        assets[career].modelBlobUrl = url;
        modelPct = 100; emit();
        return { ok:true };
      } catch(e) {
        // swallow but mark done
        modelPct = 100; emit();
        return { ok:false, err:e };
      }
    })());
  }
  if (!alreadyVideo) {
    tasks.push((async () => {
      try {
        const blob = await fetchWithProgress(videoUrl, (p)=> { videoPct = p; emit(); });
        const url = URL.createObjectURL(blob);
        if (!assets[career]) assets[career] = { modelBlobUrl: null, videoBlobUrl: null };
        assets[career].videoBlobUrl = url;
        videoPct = 100; emit();
        return { ok:true };
      } catch(e) {
        videoPct = 100; emit();
        return { ok:false, err:e };
      }
    })());
  }

  await Promise.all(tasks);
  emit();
  return assets[career];
}

export function isCareerReady(career) {
  const a = assets[career] || {};
  return !!(a && a.modelBlobUrl && a.videoBlobUrl);
}

/* preloadCritical */
export async function preloadCritical(onProgress = ()=>{}) {
  const secondCareer = careers.find(c=>c !== 'Computer') || 'AI';
  const toFetch = [
    { url: `${JOB_ROOT}/Computer/marker.mind`, phase:'marker' },
    { url: `${JOB_ROOT}/Computer/${candidates.Computer.model[0]}`, phase:'computer', career:'Computer', type:'model' },
    { url: `${JOB_ROOT}/Computer/${candidates.Computer.video[0]}`, phase:'computer', career:'Computer', type:'video' },
    { url: `${JOB_ROOT}/${secondCareer}/${candidates[secondCareer].model[0]}`, phase:'career', career:secondCareer, type:'model' },
    { url: `${JOB_ROOT}/${secondCareer}/${candidates[secondCareer].video[0]}`, phase:'career', career:secondCareer, type:'video' },
  ];

  const seen = new Set();
  const final = [];
  for (const it of toFetch) {
    if (!it.url) continue;
    const u = it.url;
    if (!seen.has(u)) { seen.add(u); final.push(it); }
  }

  const total = final.length;
  let doneCount = 0;
  function report(u, phase, career, done) {
    if (done) doneCount = Math.min(total, doneCount + 1);
    const frac = total > 0 ? (doneCount / total) : 1;
    const pct = Math.round(frac * 100);
    onProgress({ pct, doneCount, totalCount: total, url: u, phase, startReady: frac >= 0.5, done: doneCount >= total });
  }

  const tasks = final.map(item => async () => {
    const u = item.url;
    try {
      const res = await fetch(encodeURI(u));
      if (!res.ok) {
        report(u, item.phase, item.career, true);
        return { url:u, ok:false, status: res.status };
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      if (item.career) {
        if (!assets[item.career]) assets[item.career] = { modelBlobUrl: null, videoBlobUrl: null };
        const low = u.toLowerCase();
        if (low.endsWith('.glb') || low.endsWith('.gltf')) {
          assets[item.career].modelBlobUrl = blobUrl;
          document.dispatchEvent(new CustomEvent('career-load-progress', { detail: { career: item.career, pct: 50 } }));
        } else {
          assets[item.career].videoBlobUrl = blobUrl;
          document.dispatchEvent(new CustomEvent('career-load-progress', { detail: { career: item.career, pct: 100 } }));
        }
      } else {
        gameAssets[u] = blobUrl;
      }

      report(u, item.phase, item.career, true);
      return { url:u, ok:true, blobUrl };
    } catch (err) {
      report(u, item.phase, item.career, true);
      return { url:u, ok:false, err };
    }
  });

  await runQueue(tasks, 6);
  onProgress({ pct:100, doneCount: total, totalCount: total, url: null, phase: 'critical-done', startReady:true, done:true });
  assets.gameAssets = gameAssets;
  return assets;
}

/* preloadRemaining (background) */
export async function preloadRemaining() {
  const urls = [];
  for (const career of careers) {
    if (!assets[career] || (!assets[career].modelBlobUrl || !assets[career].videoBlobUrl)) {
      urls.push(`${JOB_ROOT}/${career}/${candidates[career].model[0]}`);
      urls.push(`${JOB_ROOT}/${career}/${candidates[career].video[0]}`);
    }
  }

  try {
    const mf = await fetch('game_assets/manifest.json');
    if (mf && mf.ok) {
      const manifest = await mf.json();
      for (const item of manifest) {
        if (item.image) urls.push(`game_assets/${item.image}`);
        if (item.audioWord) urls.push(`game_assets/${item.audioWord}`);
        if (item.audioMeaning) urls.push(`game_assets/${item.audioMeaning}`);
      }
    }
  } catch(e){}

  const sfx = ['flip.wav','match.wav','wrong.wav','win.mp3'];
  for (const f of sfx) urls.push(`game_assets/sfx/${f}`);

  const final = [];
  const seen = new Set();
  for (const u of urls) {
    if (!u) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    if (u.startsWith(`${JOB_ROOT}/`)) {
      const parts = u.split('/');
      const career = parts[2];
      const low = u.toLowerCase();
      const isModel = low.endsWith('.glb') || low.endsWith('.gltf');
      if (assets[career]) {
        if (isModel && assets[career].modelBlobUrl) continue;
        if (!isModel && assets[career].videoBlobUrl) continue;
      }
    } else if (u.startsWith('game_assets/')) {
      const key = u.replace('game_assets/','');
      if (gameAssets[key]) continue;
    }
    final.push(u);
  }

  const tasks = final.map(u => async () => {
    try {
      const r = await fetch(encodeURI(u));
      if (!r.ok) { /* ignore missing files quietly */ return; }
      const blob = await r.blob();
      const blobUrl = URL.createObjectURL(blob);
      if (u.startsWith(`${JOB_ROOT}/`)) {
        const parts = u.split('/');
        const career = parts[2];
        if (!assets[career]) assets[career] = { modelBlobUrl: null, videoBlobUrl: null };
        const low = u.toLowerCase();
        if (low.endsWith('.glb') || low.endsWith('.gltf')) {
          assets[career].modelBlobUrl = blobUrl;
          document.dispatchEvent(new CustomEvent('career-load-progress', { detail: { career, pct: 100 } }));
        } else {
          assets[career].videoBlobUrl = blobUrl;
          document.dispatchEvent(new CustomEvent('career-load-progress', { detail: { career, pct: 100 } }));
        }
      } else if (u.startsWith('game_assets/')) {
        const key = u.replace('game_assets/','');
        gameAssets[key] = blobUrl;
      } else {
        gameAssets[u] = blobUrl;
      }
    } catch(e) {
      /* swallow quietly */
    }
  });

  return runQueue(tasks, 4);
}

/* GLTF loader (DRACO-aware) */
function loadGLTF(blobUrl) {
  return new Promise((resolve) => {
    if (!blobUrl) return resolve(null);
    const loader = new GLTFLoader();
    try {
      const dr = ensureDracoInitialized();
      loader.setDRACOLoader(dr);
    } catch(e) { /* continue */ }
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

/* lights */
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
  } catch(e) {}
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
  if (gltfModel) try{ anchor.group.remove(gltfModel); }catch{} gltfModel = null;
  if (videoMesh) try{ anchor.group.remove(videoMesh); }catch{} videoMesh = null;
  if (videoElem) try{ videoElem.pause(); videoElem.src = ''; }catch{} videoElem = null;
  waitingForMarkerPlay = false;
  pausedByTrackingLoss = false;
}

function attachContentToAnchor(gltf, video) {
  if (gltfModel) try{ anchor.group.remove(gltfModel); } catch(e){} gltfModel = null;
  if (videoMesh) try{ anchor.group.remove(videoMesh); } catch(e){} videoMesh = null;
  if (videoElem) try{ videoElem.pause(); } catch(e){} videoElem = null;
  mixer = null;

  if (gltf && gltf.scene) {
    gltfModel = gltf.scene;
    gltfModel.scale.set(0.4,0.4,0.4);
    gltfModel.position.set(-0.25, -0.45, 0.05);
    gltfModel.visible = false;
    anchor.group.add(gltfModel);
    try { gltfModel.rotation.set(0,0,0); gltfModel.quaternion.set(0,0,0,1); gltfModel.updateMatrixWorld(true); } catch(e){}
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
    texture.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.PlaneGeometry(0.6, 0.6 * (16/9));
    const mat = new THREE.MeshBasicMaterial({ map: texture });
    videoMesh = new THREE.Mesh(plane, mat);
    videoMesh.position.set(0, -0.05, 0);
    videoMesh.visible = false;
    anchor.group.add(videoMesh);
    try { videoMesh.rotation.set(0,0,0); videoMesh.quaternion.set(0,0,0,1); videoMesh.updateMatrixWorld(true); } catch(e){}
    videoElem.onloadedmetadata = () => {
      try {
        const asp = videoElem.videoWidth / videoElem.videoHeight || (9/16);
        const width = 0.6;
        const height = width / asp;
        videoMesh.geometry.dispose();
        videoMesh.geometry = new THREE.PlaneGeometry(width, height);
        videoMesh.position.set(0, 0, 0);
        if (gltfModel) {
          gltfModel.updateMatrixWorld(true);
          bbox.setFromObject(gltfModel);
          worldMin.copy(bbox.min);
          anchor.group.worldToLocal(worldMin);
          videoMesh.getWorldPosition(worldPos);
          anchor.group.worldToLocal(worldPos);
          const videoBottomLocalY = worldPos.y - (height / 2);
          const deltaY = videoBottomLocalY - worldMin.y;
          const UP_NUDGE = 0.02;
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
}

/* ============================================================
   NEW helper: alignObjectToCamera
   - makes an object face the camera (works when object has parent)
   - obj: THREE.Object3D (e.g. gltfModel or videoMesh)
   - smooth: 0..1 (1 = snap instantly, <1 = slerp smoothing)
   ============================================================ */
function alignObjectToCamera(obj, smooth = 1.0) {
  if (!obj || !camera) return;
  try {
    // get object's world position
    tmpWorldVec.copy(obj.getWorldPosition(tmpWorldVec));
    tmpObj.position.copy(tmpWorldVec);
    tmpObj.lookAt(camera.position);
    tmpObj.updateMatrixWorld();
    tmpObj.getWorldQuaternion(tmpQuat);

    // convert world quaternion into target local quaternion (relative to object's parent)
    if (obj.parent) {
      obj.parent.getWorldQuaternion(parentWorldQuat);
      parentWorldQuat.invert();
      targetLocalQuat.copy(parentWorldQuat).multiply(tmpQuat);
    } else {
      targetLocalQuat.copy(tmpQuat);
    }

    if (smooth >= 0.999) {
      obj.quaternion.copy(targetLocalQuat);
    } else {
      obj.quaternion.slerp(targetLocalQuat, smooth);
    }
  } catch (e) {
    // fail-safe: ignore
  }
}

/* init/start */
export async function initAndStart(containerElement) {
  mindarThree = new MindARThree({
    container: containerElement,
    imageTargetSrc: `${JOB_ROOT}/Computer/marker.mind`,
    sticky: true,
    filterMinCF: 0.0001,
    filterBeta: 0.005
  });
  ({ renderer, scene, camera } = mindarThree);
  try { renderer.outputColorSpace = THREE.SRGBColorSpace; } catch(e){}
  createLights(scene);
  anchor = mindarThree.addAnchor(0);

  const comp = assets['Computer'] || {};
  const g = await loadGLTF(comp.modelBlobUrl);
  const v = makeVideoElem(comp.videoBlobUrl);
  attachContentToAnchor(g, v);
  playingCareer = 'Computer';
  lastCareer = 'Computer';
  if (careerActions()) careerActions().style.display = 'none';

  anchor.onTargetFound = () => {
    isAnchorTracked = true;
    hideScanFrameThen(() => {
      try { if (gltfModel) gltfModel.visible = true; } catch(e){}
      try { if (videoMesh) videoMesh.visible = true; } catch(e){}
      if (!autoPlayEnabled) return;
      if (pausedByTrackingLoss) {
        if (mixer) try { mixer.timeScale = 1; } catch(e){}
        if (videoElem && videoElem.paused) try { videoElem.play(); } catch(e){}
        pausedByTrackingLoss = false;
        waitingForMarkerPlay = false;
        return;
      }
      const startNow = () => {
        if (mixer) try { mixer.timeScale = 1; } catch(e){}
        if (videoElem) try { videoElem.currentTime = 0; videoElem.play(); } catch(e){}
      };
      if (waitingForMarkerPlay || (videoElem && videoElem.paused && playingCareer)) {
        setTimeout(startNow, 1000);
        waitingForMarkerPlay = false;
        return;
      }
    });
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
  };

  await mindarThree.start();

  // --- Updated animation loop: keep anchor smoothing, but force model & video to face camera ---
  renderer.setAnimationLoop(()=> {
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);

    try {
      // original anchor smoothing (keeps anchor group oriented smoothly)
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

      // Make GLTF model face the camera with a little smoothing (0.98)
      alignObjectToCamera(gltfModel, 0.98);

      // Make video plane face the camera instantly (snap)
      alignObjectToCamera(videoMesh, 1.0);

    } catch(e){}

    renderer.render(scene, camera);
  });
}

/* playCareer: now handles resume-if-paused and hide menu */
export async function playCareer(career) {
  // If this career already loaded & was paused by back -> resume immediately and close menu
  if (playingCareer === career && isPausedByBack && videoElem) {
    if (careerMenu()) careerMenu().style.display = 'none';
    setNoScan(true);
    isPausedByBack = false;
    try { if (videoElem && videoElem.paused) videoElem.play(); } catch(e){}
    if (mixer) try { mixer.timeScale = 1; } catch(e){}
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

  // hide scan visuals immediately (we'll reveal once marker found)
  setNoScan(true);

  const a = assets[career] || {};
  const gltf = await loadGLTF(a.modelBlobUrl);
  const vid = makeVideoElem(a.videoBlobUrl);

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
    }, 1000);
    waitingForMarkerPlay = false;
  } else {
    waitingForMarkerPlay = true;
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
  setNoScan(true);
  waitingForMarkerPlay = false;
  pausedByTrackingLoss = false;
}

export function returnToLast() {
  if (!lastCareer) return;
  setAutoPlayEnabled(true);
  // If we were paused while playing lastCareer -> resume directly and hide menu (single click)
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
