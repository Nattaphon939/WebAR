// /WEB/js/ar.js  (fix: auto-fetch fallback + ensure content on rescan + robust play)
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

// use loader's shared assets object to avoid duplicate downloads
const assets = getLoaderAssets();      // per-career { modelBlobUrl, videoBlobUrl, markerBlobUrl }
const gameAssets = assets.gameAssets = assets.gameAssets || {};

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

/* temporaries */
const tmpObj = new THREE.Object3D();
const tmpQuat = new THREE.Quaternion();
const parentWorldQuat = new THREE.Quaternion();
const targetLocalQuat = new THREE.Quaternion();
const bbox = new THREE.Box3();
const worldMin = new THREE.Vector3();
const worldPos = new THREE.Vector3();
const SMOOTH_FACTOR = 0.12;

/* basic fetch helper (no progress) - returns blobUrl or null */
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

/* fetchWithProgress (kept for other flows) */
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

/* GLTF loader + DRACO */
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

/* rendering priorities */
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

/* ensure attached and visible */
function ensureAttachedAndVisible() {
  try {
    if (!anchor || !anchor.group) return;
    if (gltfModel) {
      if (gltfModel.parent !== anchor.group) {
        try { anchor.group.add(gltfModel); } catch(e){ console.warn('attach gltfModel err', e); }
      }
      gltfModel.visible = true;
      makeModelRenderPriority(gltfModel);
      gltfModel.traverse(node => {
        if (node.isMesh) {
          node.visible = true;
          node.frustumCulled = false;
        }
      });
    }
    if (videoMesh) {
      if (videoMesh.parent !== anchor.group) {
        try { anchor.group.add(videoMesh); } catch(e){ console.warn('attach videoMesh err', e); }
      }
      videoMesh.visible = true;
      makeVideoLayer(videoMesh);
    }
  } catch(e){ console.warn('ensureAttachedAndVisible err', e); }
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

/* attachContentToAnchor */
function attachContentToAnchor(gltf, video) {
  // remove previous references (keep object URLs alive, but remove from scene)
  if (gltfModel) try{ if (gltfModel.parent) gltfModel.parent.remove(gltfModel); }catch{} gltfModel = null;
  if (videoMesh) try{ if (videoMesh.parent) videoMesh.parent.remove(videoMesh); }catch{} videoMesh = null;
  if (videoElem) try{ videoElem.pause(); } catch(e){} videoElem = null;
  mixer = null;

  if (gltf && gltf.scene) {
    const sceneObj = gltf.scene;
    gltfModel = sceneObj;
    try { gltfModel.userData = gltfModel.userData || {}; gltfModel.userData.sourceCareer = playingCareer || 'unknown'; } catch(e){}
    gltfModel.scale.set(0.4,0.4,0.4);
    gltfModel.position.set(-0.25, -0.45, 0.05);
    gltfModel.visible = false;
    try { anchor && anchor.group && anchor.group.add(gltfModel); } catch(e){}
    try { gltfModel.rotation.set(0,0,0); gltfModel.quaternion.set(0,0,0,1); gltfModel.updateMatrixWorld(true); } catch(e){}

    // animations: prefer explicit gltf.animations, fallback to preserved clips on the scene
    const animations = (gltf.animations && gltf.animations.length > 0) ? gltf.animations : (sceneObj.userData && Array.isArray(sceneObj.userData._clips) ? sceneObj.userData._clips : null);
    if (animations && animations.length > 0) {
      mixer = new THREE.AnimationMixer(gltfModel);
      const actions = [];
      animations.forEach(c => {
        try {
          const action = mixer.clipAction(c);
          action.reset();
          action.play();
          action.enabled = true;
          actions.push(action);
        } catch(e) { console.warn('action setup err', e); }
      });
      try { gltfModel.userData = gltfModel.userData || {}; gltfModel.userData._actions = actions; } catch(e){}
      // paused until explicitly resumed
      mixer.timeScale = 0;
      try { mixer.update(0); } catch(e){}
      try { console.debug('attachContentToAnchor: actions prepared', { career: playingCareer, actions: gltfModel.userData._actions ? gltfModel.userData._actions.length : 0, hasMixer: !!mixer }); } catch(e){}
    }
    try { makeModelRenderPriority(gltfModel); } catch(e){}
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
    try { anchor && anchor.group && anchor.group.add(videoMesh); } catch(e){}
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

      // ensure UI buttons reflect current asset readiness and progress
      try {
        for (const c of careers) {
          const a = assets[c] || {};
          const pct = (a.modelBlobUrl && a.videoBlobUrl) ? 100 : 0;
          document.dispatchEvent(new CustomEvent('career-load-progress', { detail: { career: c, pct, file: null, type: pct===100 ? 'all' : 'none' } }));
          if (pct === 100) document.dispatchEvent(new CustomEvent('career-ready', { detail: { career: c } }));
        }
      } catch(e){}
    };
  }

  // emit career-ready events if both assets available
  try {
    for (const c of careers) {
      const a = assets[c] || {};
      if (a.modelBlobUrl && a.videoBlobUrl) {
        try { document.dispatchEvent(new CustomEvent('career-ready', { detail: { career: c } })); } catch(e){}
      }
    }
  } catch(e){}
}

/* Use loader's ensureCareerAssets to load career folders (keeps single source of truth) */

/* preloadCritical simplified wrapper (keeps API) */
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

  // background: try load common game assets quietly
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

/* preloadRemaining (background) */
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

/* Ensure content exist for the current career: if missing, try fallback fetch then attach */
async function ensureContentForCareer(career) {
  if (!career) return;
  if (!assets[career]) assets[career] = { modelBlobUrl: null, videoBlobUrl: null };

  const a = assets[career];

  // model: if not available, try to fetch candidate file directly
  if (!a.modelBlobUrl) {
    try {
      const fb = await fetchFirstAvailable(career, candidates[career].model);
      if (fb) {
        a.modelBlobUrl = fb;
        document.dispatchEvent(new CustomEvent('career-load-progress', { detail: { career, pct: 100, file: 'fallback-model', type: 'model' } }));
      }
    } catch(e){}
  }

  // video: same
  if (!a.videoBlobUrl) {
    try {
      const fv = await fetchFirstAvailable(career, candidates[career].video);
      if (fv) {
        a.videoBlobUrl = fv;
        document.dispatchEvent(new CustomEvent('career-load-progress', { detail: { career, pct: 100, file: 'fallback-video', type: 'video' } }));
      }
    } catch(e){}
  }

  // attach model if missing in scene
  if (!gltfModel && a.modelBlobUrl) {
    const g = await loadGLTF(a.modelBlobUrl);
    if (g) {
      attachContentToAnchor(g, null);
      if (isAnchorTracked && gltfModel) {
        try { gltfModel.visible = true; if (mixer) mixer.timeScale = 1; } catch(e){}
      }
    }
  }

  // attach video if missing in scene
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

/* MindAR init + attach/resume logic */
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
    filterBeta: 0.005
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
  // Always hide the visual scan-frame (application requested)
  try { setNoScan(true); } catch(e){}

  // try ensure Computer content (will fallback-fetch if not preloaded)
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

      if (!autoPlayEnabled) return;

      if (pausedByTrackingLoss) {
        if (mixer) try { mixer.timeScale = 1; } catch(e){}
        if (videoElem && videoElem.paused) {
          try { await videoElem.play(); } catch(err){
            // try muted fallback (some mobile browsers require muted to autoplay)
            try { videoElem.muted = true; await videoElem.play(); } catch(e){}
          }
        }
        pausedByTrackingLoss = false;
        waitingForMarkerPlay = false;
        return;
      }

      const startNow = async () => {
        try {
          // If mixer is missing, try to reload GLTF for the playing career to ensure clips exist
          try {
            const a = assets[playingCareer] || {};
            if (!mixer && a.modelBlobUrl) {
              try {
                const reGltf = await loadGLTF(a.modelBlobUrl);
                if (reGltf && reGltf.scene) {
                  // re-attach model while preserving current videoElem
                  attachContentToAnchor(reGltf, videoElem);
                  try { ensureAttachedAndVisible(); } catch(e){}
                }
              } catch(e) { console.warn('reload gltf fallback err', e); }
            }
          } catch(e){}
          try { console.debug('startNow entry', { career: playingCareer, hasGltf: !!gltfModel, hasMixer: !!mixer, actions: (gltfModel && gltfModel.userData && gltfModel.userData._actions) ? gltfModel.userData._actions.length : 0, videoPaused: videoElem ? videoElem.paused : null }); } catch(e){}
          // if actions already prepared, reset/play them
          if (gltfModel && gltfModel.userData && Array.isArray(gltfModel.userData._actions) && gltfModel.userData._actions.length) {
            gltfModel.userData._actions.forEach(a => {
              try { a.reset(); a.play(); a.enabled = true; a.setEffectiveWeight && a.setEffectiveWeight(1); } catch(e){}
            });
          } else {
            // sometimes the model was attached earlier but mixer wasn't recreated — attempt to (re)create from preserved clips
            try {
              if (!mixer && gltfModel && gltfModel.userData && Array.isArray(gltfModel.userData._clips) && gltfModel.userData._clips.length) {
                mixer = new THREE.AnimationMixer(gltfModel);
                const actions = [];
                gltfModel.userData._clips.forEach(c => {
                  try {
                    const action = mixer.clipAction(c);
                    action.reset();
                    action.play();
                    action.enabled = true;
                    actions.push(action);
                  } catch(e) { console.warn('recreate action err', e); }
                });
                try { gltfModel.userData._actions = actions; } catch(e){}
                mixer.timeScale = 0;
                try { mixer.update(0); } catch(e){}
              }
            } catch(e) { console.warn('startNow recreate err', e); }
          }
        } catch(e) { console.warn('startNow actions err', e); }

        if (mixer) {
          try { mixer.timeScale = 1; } catch(e){}
          try { mixer.update(0); } catch(e){}
          try { console.debug('startNow before RAF: mixer updated', { career: playingCareer }); } catch(e){}
        }

        // ensure at least one RAF happens so three.js can bind skins/skeletons
        await new Promise(r => requestAnimationFrame(r));

        try { renderer && renderer.render && renderer.render(scene, camera); } catch(e){}

        if (videoElem) {
          try {
            if (waitingForMarkerPlay) try{ videoElem.currentTime = 0; }catch(e){}
            await videoElem.play().catch(()=>{ videoElem.muted = true; videoElem.play().catch(()=>{}); });
            try { console.debug('startNow video.play invoked', { career: playingCareer, muted: videoElem.muted, paused: videoElem.paused }); } catch(e){}
          } catch(err){
            try { videoElem.muted = true; await videoElem.play(); } catch(e){}
          }
        }
      };

      if (waitingForMarkerPlay || (videoElem && videoElem.paused && playingCareer)) {
        // give a short delay (one RAF) before starting to ensure renderer has processed attachments
        requestAnimationFrame(()=> { startNow(); });
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
    } catch(e){}
    renderer.render(scene, camera);
  });
}

/* hideScanFrameThen (kept simple) */
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

/* Play career */
export async function playCareer(career) {
  if (backBtn()) backBtn().style.display = 'inline-block';
  if (careerMenu()) careerMenu().style.display = 'none';
  if (career !== 'Computer') {
    if (careerActions()) careerActions().style.display = 'flex';
  } else {
    if (careerActions()) careerActions().style.display = 'none';
  }

  setAutoPlayEnabled(true);
  // If same career and paused by back -> resume from current position
  if (playingCareer === career && isPausedByBack) {
    isPausedByBack = false;
    setAutoPlayEnabled(true);
    setNoScan(true);
    if (isAnchorTracked) {
      try { ensureAttachedAndVisible(); } catch(e){}
      try { if (gltfModel) { gltfModel.visible = true; if (mixer) mixer.timeScale = 1; } } catch(e){}
      try { if (videoMesh) videoMesh.visible = true; } catch(e){}
      try { if (videoElem && videoElem.paused) videoElem.play().catch(()=>{ videoElem.muted=true; videoElem.play().catch(()=>{}); }); } catch(e){}
      waitingForMarkerPlay = false;
    } else {
      waitingForMarkerPlay = true;
    }
    return;
  }

  // switching to new career: clear previous and attach new
  if (playingCareer && playingCareer !== career) {
    clearAnchorContent(false);
    playingCareer = null;
    isPausedByBack = false;
    waitingForMarkerPlay = false;
    pausedByTrackingLoss = false;
  }

  setNoScan(true);

  // ensure assets exist (fallback-fetch if needed) then attach
  if (!assets[career]) assets[career] = { modelBlobUrl: null, videoBlobUrl: null };
  try { await ensureCareerAssets(career, ()=>{}); } catch(e){}
  try { await ensureContentForCareer(career); } catch(e){}

  const a = assets[career] || {};
  // reuse already-attached model/video when possible to avoid duplicate fetches
  let shouldAttach = false;
  // if current attached model belongs to another career, clear it first
  if (gltfModel && gltfModel.userData && gltfModel.userData.sourceCareer !== career) {
    clearAnchorContent(false);
  }

  // if we don't have a model attached for this career, try to attach from assets
  if (!gltfModel && a.modelBlobUrl) {
    try {
      const g = await loadGLTF(a.modelBlobUrl);
      attachContentToAnchor(g, null);
      shouldAttach = true;
    } catch(e){ console.warn('playCareer attach gltf err', e); }
  }

  // video: reuse existing videoElem if same src, otherwise create
  if (!videoElem && a.videoBlobUrl) {
    try {
      const v = makeVideoElem(a.videoBlobUrl);
      attachContentToAnchor(gltfModel ? { scene: gltfModel } : null, v);
      shouldAttach = true;
    } catch(e){ console.warn('playCareer attach video err', e); }
  }

  playingCareer = career;
  lastCareer = career;
  isPausedByBack = false;

  if (isAnchorTracked && autoPlayEnabled) {
    try { ensureAttachedAndVisible(); } catch(e){}
    try { if (gltfModel) gltfModel.visible = true; } catch(e){}
    try { if (videoMesh) videoMesh.visible = true; } catch(e){}
    // wait a couple of frames so Three.js can bind skeletons and apply initial transforms
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => requestAnimationFrame(r));
    if (mixer) try { mixer.timeScale = 1; } catch(e){}
    if (videoElem) try { videoElem.currentTime = 0; await videoElem.play().catch(()=>{ videoElem.muted = true; videoElem.play().catch(()=>{}); }); } catch(err){}
    waitingForMarkerPlay = false;
  } else {
    waitingForMarkerPlay = true;
  }
}

/* UI helpers (unchanged semantics) */
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
