// js/ar.js  (fast direct preload: no HEAD, no variant probe)
import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const JOB_ROOT = './Job';
const careers = ['Computer','AI','Cloud','Data_Center','Network'];
const candidates = {
  Computer: { model: ['Computer-Model.glb','computer-model.glb','Computer-model.glb'], video: ['Computer.mp4','computer.mp4','Computer-Video.mp4'] },
  AI:       { model: ['ai-model.glb','AI-model.glb','ai-model.GLTF','AI-Model.glb'], video: ['AI.mp4','ai.mp4','ai-video.mp4'] },
  Cloud:    { model: ['cloud-model.glb','Cloud-model.glb','cloud-model.GLTF'], video: ['video-cloud.mp4','cloud.mp4','cloud-video.mp4'] },
  Data_Center: { model: ['Data_Center-model.glb','Data_Center-model.glb','Data_ Center-model.glb','Data_Center-model.GLTF'], video: ['Data_Center-Video.mp4','data_center.mp4','data-center.mp4'] },
  Network:  { model: ['network-model.glb','Network-model.glb','network-model.GLTF'], video: ['video-network.mp4','network.mp4','network-video.mp4'] },
};

// store loaded asset blobURLs here (by career)
const assets = {};
const gameAssets = {}; // store game blobs keyed by filename (e.g. "Computer.png")

// DOM helpers
const scanFrame = () => document.getElementById('scan-frame');
const careerMenu = () => document.getElementById('career-menu');
const careerActions = () => document.getElementById('career-actions');
const backBtn = () => document.getElementById('backBtn');

// AR state
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

const tmpObj = new THREE.Object3D();
const tmpQuat = new THREE.Quaternion();
const parentWorldQuat = new THREE.Quaternion();
const targetLocalQuat = new THREE.Quaternion();
const bbox = new THREE.Box3();
const worldMin = new THREE.Vector3();
const worldPos = new THREE.Vector3();
const SMOOTH_FACTOR = 0.12;

/* ---- simple hideScanFrameThen (used by AR flow) ---- */
function hideScanFrameThen(callback) {
  const sf = scanFrame();
  if (!sf) {
    if (callback) callback();
    return;
  }
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
  if (curDisplay === 'none' || sf.style.display === 'none') {
    if (callback) callback();
    return;
  }
  sf.style.transition = 'opacity 180ms ease';
  sf.style.opacity = '1';
  // trigger reflow
  // eslint-disable-next-line no-unused-expressions
  sf.offsetHeight;
  sf.style.opacity = '0';
  const tid = setTimeout(() => {
    try {
      sf.style.display = 'none';
      sf.style.transition = '';
      sf.style.opacity = '1';
      Array.from(sf.querySelectorAll('*')).forEach(n=> n.style.display = 'none');
    } catch (e) {}
    clearTimeout(tid);
    if (callback) callback();
  }, 200);
}

/* ---- very simple concurrency runner ---- */
async function runQueue(tasks, concurrency) {
  const results = new Array(tasks.length);
  let idx = 0;
  let running = 0;
  return new Promise((resolve) => {
    function next() {
      if (idx >= tasks.length && running === 0) {
        resolve(results);
        return;
      }
      while (running < concurrency && idx < tasks.length) {
        const i = idx++;
        running++;
        tasks[i]().then(res => {
          running--;
          results[i] = { ok: true, value: res };
          next();
        }).catch(err => {
          running--;
          results[i] = { ok: false, err };
          next();
        });
      }
    }
    next();
  });
}

/**
 * preloadAll(onProgress)
 * - NO HEAD, NO CHECKS. Load directly.
 * - concurrency: default 6 (fast but not insane).
 * - onProgress receives { pct, doneCount, totalCount, url, phase, startReady, done }
 */
export async function preloadAll(onProgress = ()=>{}) {
  // Build URL list (straight, no probing)
  const groups = [
    { name: 'marker', urls: [`${JOB_ROOT}/Computer/marker.mind`] },
    { name: 'computer', urls: [] },
    { name: 'careers', urls: [] },
    { name: 'game', urls: [] }
  ];

  // use first candidate filename (no checking)
  groups[1].urls.push(`${JOB_ROOT}/Computer/${candidates.Computer.model[0]}`);
  groups[1].urls.push(`${JOB_ROOT}/Computer/${candidates.Computer.video[0]}`);

  for (const career of careers) {
    if (career === 'Computer') continue;
    groups[2].urls.push(`${JOB_ROOT}/${career}/${candidates[career].model[0]}`);
    groups[2].urls.push(`${JOB_ROOT}/${career}/${candidates[career].video[0]}`);
  }

  // read manifest.json quickly (if exists) to include game assets (no probes)
  try {
    const mf = await fetch('game_assets/manifest.json');
    if (mf && mf.ok) {
      const manifest = await mf.json();
      for (const item of manifest) {
        if (item.image) groups[3].urls.push(`game_assets/${item.image}`);
        if (item.audioWord) groups[3].urls.push(`game_assets/${item.audioWord}`);
        if (item.audioMeaning) groups[3].urls.push(`game_assets/${item.audioMeaning}`);
      }
      // also include sfx list (common)
      const sfx = ['flip.wav','match.wav','wrong.wav','win.mp3'];
      for (const f of sfx) groups[3].urls.push(`game_assets/sfx/${f}`);
    }
  } catch(e){
    // manifest not present or fetch failed -> skip game group
  }

  // flatten & dedupe preserving order
  const seen = new Set();
  const urls = [];
  for (const g of groups) {
    for (const u of g.urls) {
      if (!u) continue;
      if (!seen.has(u)) { seen.add(u); urls.push({ url: u, phase: g.name }); }
    }
  }

  const total = urls.length;
  let doneCount = 0;
  function report(url, phase) {
    doneCount++;
    const frac = total > 0 ? (doneCount / total) : 1;
    const pct = Math.round(frac * 100);
    onProgress({ pct, doneCount, totalCount: total, url, phase, startReady: frac >= 0.5, done: doneCount >= total });
  }

  // create tasks
  const tasks = urls.map(item => async () => {
    const u = item.url;
    const phase = item.phase;
    try {
      const r = await fetch(encodeURI(u));
      if (!r.ok) {
        console.warn('preload failed', u, r.status);
        report(u, phase);
        return { url: u, ok: false, status: r.status };
      }
      const blob = await r.blob();
      const blobUrl = URL.createObjectURL(blob);

      // store mapping
      if (u.startsWith(`${JOB_ROOT}/`)) {
        // ./Job/CAREER/file
        const parts = u.split('/');
        const career = parts[2];
        if (!assets[career]) assets[career] = { modelBlobUrl: null, videoBlobUrl: null };
        const low = u.toLowerCase();
        if (low.endsWith('.glb') || low.endsWith('.gltf')) assets[career].modelBlobUrl = blobUrl;
        else assets[career].videoBlobUrl = blobUrl;
      } else if (u.startsWith('game_assets/')) {
        const key = u.replace('game_assets/','');
        gameAssets[key] = blobUrl;
      } else {
        gameAssets[u] = blobUrl;
      }

      report(u, phase);
      return { url: u, ok: true, blobUrl };
    } catch (err) {
      console.warn('preload error', u, err);
      report(u, phase);
      return { url: u, ok: false, err };
    }
  });

  const concurrency = 6; // tuned for speed; reduce if your server throttles
  await runQueue(tasks, concurrency);

  // final
  onProgress({ pct: 100, doneCount: total, totalCount: total, url: null, phase: 'done', startReady: true, done: true });

  // expose game assets on assets.gameAssets
  assets.gameAssets = gameAssets;
  return assets;
}

/* ---- Remaining AR logic (unchanged) ---- */

function createLights(scene) {
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
  hemi.position.set(0,1,0);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff,1);
  dir.position.set(0,1,1);
  scene.add(dir);
}

function loadGLTF(blobUrl) {
  return new Promise((resolve) => {
    if (!blobUrl) return resolve(null);
    const loader = new GLTFLoader();
    loader.load(blobUrl, (gltf) => resolve(gltf), undefined, (err)=>{ console.warn('GLTF load err',err); resolve(null); });
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

function clearAnchorContent(keep=false) {
  if (keep) {
    if (videoElem) { try { videoElem.pause(); } catch(e){} }
    if (mixer) { try { mixer.timeScale = 0; } catch(e){} }
    isPausedByBack = true;
    waitingForMarkerPlay = false;
    pausedByTrackingLoss = false;
    return;
  }

  if (mixer) { try { mixer.stopAllAction(); } catch(e){} mixer = null; }
  if (gltfModel) { try{ anchor.group.remove(gltfModel); }catch{} gltfModel = null; }
  if (videoMesh) { try{ anchor.group.remove(videoMesh); }catch{} videoMesh = null; }
  if (videoElem) { try{ videoElem.pause(); videoElem.src = ''; }catch{} videoElem = null; }
  waitingForMarkerPlay = false;
  pausedByTrackingLoss = false;
}

function attachContentToAnchor(gltf, video) {
  if (gltfModel) { try{ anchor.group.remove(gltfModel); } catch(e){} gltfModel = null; }
  if (videoMesh) { try{ anchor.group.remove(videoMesh); } catch(e){} videoMesh = null; }
  if (videoElem) { try{ videoElem.pause(); } catch(e){} videoElem = null; }
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
          try { gltfModel.rotation.set(0,0,0); gltfModel.quaternion.set(0,0,0,1); } catch(e){}
        }
      } catch(e){ console.warn('onloadedmetadata align err', e); }
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

export async function initAndStart(containerElement) {
  mindarThree = new MindARThree({
    container: containerElement,
    imageTargetSrc: `${JOB_ROOT}/Computer/marker.mind`,
    sticky: true,
    filterMinCF: 0.0001,
    filterBeta: 0.005
  });
  ({ renderer, scene, camera } = mindarThree);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  createLights(scene);
  anchor = mindarThree.addAnchor(0);

  // initial attach (hidden + paused) - use preloaded assets if available
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
        if (videoElem) {
          try { videoElem.currentTime = 0; videoElem.play(); } catch(e){}
        }
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
    } catch(e) { /* non-fatal */ }
    renderer.render(scene, camera);
  });
}

// exported UI actions (unchanged)
export async function playCareer(career) {
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
  if (videoElem) { try { videoElem.pause(); } catch(e){ console.warn(e); } }
  if (mixer) { try { mixer.timeScale = 0; } catch(e){ console.warn(e); } }
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
    if (careerMenu()) careerMenu().style.display = 'flex';
    if (backBtn()) backBtn().style.display = 'inline-block';
    isPausedByBack = false;
    try { if (gltfModel) gltfModel.visible = true; if (videoMesh) videoMesh.visible = true; videoElem.play(); } catch(e){ console.warn(e); }
    if (mixer) try { mixer.timeScale = 1; } catch(e){}
    if (lastCareer !== 'Computer' && careerActions()) careerActions().style.display = 'flex';
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
  try { clearAnchorContent(false); } catch(e){ console.warn('resetToIdle clear err', e); }
  playingCareer = null;
  lastCareer = null;
  isPausedByBack = false;
  waitingForMarkerPlay = false;
  pausedByTrackingLoss = false;
  setAutoPlayEnabled(false);
  setNoScan(true);
}

export function getAssets() { return assets; }
