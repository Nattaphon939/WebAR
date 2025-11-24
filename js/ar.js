// js/ar.js (fixed: DRACO enabled for GLTFLoader)
// Only changed: added DRACOLoader import + ensureDracoInitialized + use it in loadGLTF.
// Keep the rest of your original logic intact. This file preserves your previous behavior
// (attachContentToAnchor, playCareer, initAndStart, etc.) but ensures DRACO-compressed glTFs load.

import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const JOB_ROOT = './Job';
const careers = ['Computer','AI','Cloud','Data_Center','Network'];
const candidates = {
  Computer: { model: ['Computer-Model.glb','computer-model.glb','Computer-model.glb'], video: ['Computer.mp4','computer.mp4','Computer-Video.mp4'] },
  AI:       { model: ['ai-model.glb','AI-model.glb','ai-model.GLTF','AI-Model.glb'], video: ['Al.mp4','AI.mp4','ai.mp4','ai-video.mp4'] },
  Cloud:    { model: ['cloud-model.glb','Cloud-model.glb','cloud-model.GLTF'], video: ['video-cloud.mp4','cloud.mp4','cloud-video.mp4'] },
  Data_Center: { model: ['Data_Center-model.glb','Data_Center-model.glb','Data_ Center-model.glb','Data_Center-model.GLTF'], video: ['Data_Center-Video.mp4','data_center.mp4','data-center.mp4'] },
  Network:  { model: ['network-model.glb','Network-model.glb','network-model.GLTF'], video: ['video-network.mp4','network.mp4','network-video.mp4'] },
};

const assets = {};

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

// control whether AR should auto-play content when target found (false when game/menu overlay open)
let autoPlayEnabled = true;
export function setAutoPlayEnabled(flag) { autoPlayEnabled = !!flag; }

// flags for tracking/play state
let isAnchorTracked = false;
let waitingForMarkerPlay = false;
let pausedByTrackingLoss = false;

// control to hide scan visuals when menu up
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

// helper: fade out scan-frame, then call callback
function hideScanFrameThen(callback) {
  const sf = scanFrame();
  if (!sf) {
    if (callback) callback();
    return;
  }

  // if noScanMode or career menu visible -> ensure hidden, then callback
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

  sf.style.transition = 'opacity 260ms ease';
  sf.style.opacity = '1';
  // trigger reflow
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
  }, 300);
}

// helper: show scan frame (immediate) but keep it hidden when menu is visible or noScanMode
function showScanFrame() {
  const sf = scanFrame();
  if (!sf) return;
  if (noScanMode) {
    sf.style.display = 'none';
    Array.from(sf.querySelectorAll('*')).forEach(n=> n.style.display = 'none');
    return;
  }
  const cm = careerMenu();
  try {
    const cmStyle = cm ? window.getComputedStyle(cm) : null;
    if (cm && cmStyle && cmStyle.display !== 'none' && cmStyle.visibility !== 'hidden' && cmStyle.opacity !== '1') {
      sf.style.display = 'none';
      Array.from(sf.querySelectorAll('*')).forEach(n=> n.style.display = 'none');
      return;
    }
  } catch(e){}
  sf.style.transition = '';
  sf.style.opacity = '1';
  sf.style.display = 'flex';
  Array.from(sf.querySelectorAll('*')).forEach(n=> n.style.display = '');
}

// helpers (fetch assets)
async function findAndFetch(career, list) {
  for (const name of list) {
    const url = `${JOB_ROOT}/${career}/${name}`;
    try {
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) continue;
      const blob = await res.blob();
      return { blob, url };
    } catch (e) { /* try next */ }
  }
  return null;
}

export async function preloadAll(onProgress = ()=>{}) {
  let total = careers.length * 2;
  let done = 0;
  function tick() { done++; const pct = Math.round((done / total) * 100); onProgress(pct); }

  for (const career of careers) {
    assets[career] = { modelBlobUrl: null, videoBlobUrl: null };
    const m = await findAndFetch(career, candidates[career].model);
    if (m && m.blob && m.blob.size>0) assets[career].modelBlobUrl = URL.createObjectURL(m.blob);
    else console.warn(`ไม่พบ model สำหรับ ${career} -> ตรวจสอบชื่อไฟล์ใน ${JOB_ROOT}/${career}`);
    tick();

    const v = await findAndFetch(career, candidates[career].video);
    if (v && v.blob && v.blob.size>0) assets[career].videoBlobUrl = URL.createObjectURL(v.blob);
    else console.warn(`ไม่พบ video สำหรับ ${career} -> ตรวจสอบชื่อไฟล์ใน ${JOB_ROOT}/${career}`);
    tick();
  }
  onProgress(100);
  return assets;
}

// --- DRACO support ---
let dracoLoaderInstance = null;
function ensureDracoInitialized() {
  if (dracoLoaderInstance) return dracoLoaderInstance;
  try {
    dracoLoaderInstance = new DRACOLoader();
    // use CDN decoder (works in most dev setups). If you prefer local files, host decoder under /draco/ and set that path.
    dracoLoaderInstance.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
  } catch(e) {
    console.warn('Failed to init DRACOLoader', e);
    dracoLoaderInstance = null;
  }
  return dracoLoaderInstance;
}

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
    try {
      const dr = ensureDracoInitialized();
      if (dr) loader.setDRACOLoader(dr);
    } catch(e) { console.warn('setDRACOLoader failed', e); }
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
    // tag source for debugging
    try { gltfModel.userData = gltfModel.userData || {}; gltfModel.userData.sourceCareer = playingCareer || 'unknown'; } catch(e){}
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
    // increase render priority
    try { gltfModel.traverse(n=>{ if (n.isMesh) { n.renderOrder = 2; if (n.material) { n.material.depthTest = true; n.material.depthWrite = true; } } }); } catch(e){}
    console.log('AR: model attached for', gltfModel.userData.sourceCareer);
  }

  if (video) {
    videoElem = video;
    try { videoElem.pause(); } catch(e){}
    const texture = new THREE.VideoTexture(videoElem);
    try { texture.colorSpace = THREE.SRGBColorSpace; } catch(e){}
    const plane = new THREE.PlaneGeometry(0.6, 0.6 * (16/9));
    const mat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
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
  try { renderer.outputColorSpace = THREE.SRGBColorSpace; } catch(e){}
  createLights(scene);
  anchor = mindarThree.addAnchor(0);

  // initial attach (hidden + paused)
  const comp = assets['Computer'] || {};
  const g = await loadGLTF(comp.modelBlobUrl);
  const v = makeVideoElem(comp.videoBlobUrl);
  attachContentToAnchor(g, v);
  playingCareer = 'Computer';
  lastCareer = 'Computer';
  if (careerActions()) careerActions().style.display = 'none';

  anchor.onTargetFound = () => {
    isAnchorTracked = true;

    // hide scan-frame first, then reveal and possibly play (with 1s delay before play)
    hideScanFrameThen(() => {
      // reveal model & video meshes first (visible true)
      try { if (gltfModel) gltfModel.visible = true; } catch(e){}
      try { if (videoMesh) videoMesh.visible = true; } catch(e){}

      // if autoplay disabled (menu/game open) do nothing further
      if (!autoPlayEnabled) {
        return;
      }

      // resume after tracking-loss if needed
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
    // keep scan frame hidden
    if (scanFrame()) scanFrame().style.display = 'none';

    if (!autoPlayEnabled) return;

    // pause playing and mark pausedByTrackingLoss
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

// exported UI actions
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

  // IMPORTANT: hide scan visuals immediately when user requests play (we will reveal & delay onTargetFound)
  setNoScan(true);

  const a = assets[career] || {};
  const gltf = await loadGLTF(a.modelBlobUrl);
  const vid = makeVideoElem(a.videoBlobUrl);

  attachContentToAnchor(gltf, vid);

  playingCareer = career;
  lastCareer = career;
  isPausedByBack = false;

  // If anchor currently tracked & autoplay enabled -> reveal then start after 1s
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

  // when showing menu, hide scan visuals
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

  // ensure scan visuals hidden when menu shown
  setNoScan(true);

  waitingForMarkerPlay = false;
  pausedByTrackingLoss = false;
}

// reset to idle (remove content, disable autoplay)
export function resetToIdle() {
  try { clearAnchorContent(false); } catch(e){ console.warn('resetToIdle clear err', e); }
  playingCareer = null;
  lastCareer = null;
  isPausedByBack = false;
  waitingForMarkerPlay = false;
  pausedByTrackingLoss = false;
  setAutoPlayEnabled(false);
  // hide scan visuals when we go idle (menu or overlay)
  setNoScan(true);
}

export function getAssets() { return assets; }
