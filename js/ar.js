// js/ar.js
import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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

// NEW: control whether AR should auto-play content when target found
let autoPlayEnabled = true;
export function setAutoPlayEnabled(flag) {
  autoPlayEnabled = !!flag;
}

const tmpObj = new THREE.Object3D();
const tmpQuat = new THREE.Quaternion();
const parentWorldQuat = new THREE.Quaternion();
const targetLocalQuat = new THREE.Quaternion();
const bbox = new THREE.Box3();
const worldMin = new THREE.Vector3();
const worldPos = new THREE.Vector3();
const SMOOTH_FACTOR = 0.12;

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
  function tick() {
    done++;
    const pct = Math.round((done / total) * 100);
    onProgress(pct);
  }

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
    if (videoElem) {
      try { videoElem.pause(); } catch(e){}
    }
    if (mixer) {
      try { mixer.timeScale = 0; } catch(e){}
    }
    isPausedByBack = true;
    return;
  }

  if (mixer) {
    try { mixer.stopAllAction(); } catch(e){ }
    mixer = null;
  }
  if (gltfModel) { try{ anchor.group.remove(gltfModel); }catch{} gltfModel = null; }
  if (videoMesh) { try{ anchor.group.remove(videoMesh); }catch{} videoMesh = null; }
  if (videoElem) { try{ videoElem.pause(); videoElem.src = ''; videoElem = null; }catch{} videoElem = null; }
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
    anchor.group.add(gltfModel);
    try {
      gltfModel.rotation.set(0,0,0);
      gltfModel.quaternion.set(0,0,0,1);
      gltfModel.updateMatrixWorld(true);
    } catch(e){}
    if (gltf.animations && gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(gltfModel);
      gltf.animations.forEach(c => mixer.clipAction(c).play());
      mixer.timeScale = 1;
    }
  }

  if (video) {
    videoElem = video;
    const texture = new THREE.VideoTexture(videoElem);
    texture.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.PlaneGeometry(0.6, 0.6 * (16/9));
    const mat = new THREE.MeshBasicMaterial({ map: texture });
    videoMesh = new THREE.Mesh(plane, mat);
    videoMesh.position.set(0, -0.05, 0);
    anchor.group.add(videoMesh);
    try {
      videoMesh.rotation.set(0,0,0);
      videoMesh.quaternion.set(0,0,0,1);
      videoMesh.updateMatrixWorld(true);
    } catch(e){}

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
      if (careerActions()) careerActions().style.display = 'none';
      if (careerMenu()) careerMenu().style.display = 'flex';
      if (backBtn()) backBtn().style.display = 'none';
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

  const comp = assets['Computer'] || {};
  const g = await loadGLTF(comp.modelBlobUrl);
  const v = makeVideoElem(comp.videoBlobUrl);
  attachContentToAnchor(g, v);
  playingCareer = 'Computer';
  lastCareer = 'Computer';
  if (careerActions()) careerActions().style.display = 'none';

  // events
  anchor.onTargetFound = () => {
    // hide scan overlay always
    if (scanFrame()) scanFrame().style.display = 'none';

    // If autoPlay disabled (e.g., game overlay open), do not auto-play content or resume mixer.
    if (!autoPlayEnabled) {
      return;
    }

    if (videoElem && videoElem.paused) {
      try { videoElem.currentTime = 0; } catch(e){}
      const p = videoElem.play();
      if (p && p.catch) p.catch(e=>console.warn('play prevented',e));
    }
    if (mixer && isPausedByBack) {
      try { mixer.timeScale = 1; } catch(e){}
    }
    isPausedByBack = false;
  };

  anchor.onTargetLost = () => {
    if (scanFrame()) scanFrame().style.display = 'none';
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
  if (career !== 'Computer') {
    if (careerActions()) careerActions().style.display = 'flex';
  } else {
    if (careerActions()) careerActions().style.display = 'none';
  }
  if (careerMenu()) careerMenu().style.display = 'none';

  // re-enable auto-play when user explicitly requests a career content
  setAutoPlayEnabled(true);

  if (playingCareer === career && isPausedByBack && videoElem) {
    isPausedByBack = false;
    try { videoElem.play(); } catch(e){ console.warn(e); }
    if (mixer) try { mixer.timeScale = 1; } catch(e){}
    return;
  }

  if (playingCareer && playingCareer !== career) {
    clearAnchorContent(false);
    playingCareer = null;
    isPausedByBack = false;
  }

  const a = assets[career] || {};
  const gltf = await loadGLTF(a.modelBlobUrl);
  const vid = makeVideoElem(a.videoBlobUrl);

  attachContentToAnchor(gltf, vid);

  playingCareer = career;
  lastCareer = career;
  isPausedByBack = false;

  try {
    if (videoElem) {
      try{ videoElem.currentTime = 0; }catch{}
      const p = videoElem.play();
      if (p && p.catch) p.catch(e=>console.warn('play blocked',e));
    }
    if (mixer) try { mixer.timeScale = 1; } catch(e){}
  } catch(e){}
}

export function pauseAndShowMenu() {
  if (videoElem) {
    try { videoElem.pause(); } catch(e){ console.warn(e); }
  }
  if (mixer) {
    try { mixer.timeScale = 0; } catch(e){ console.warn(e); }
  }
  isPausedByBack = true;
  // also disable auto-play so external overlays (like game) don't trigger audio
  setAutoPlayEnabled(false);
  if (careerActions()) careerActions().style.display = (playingCareer && playingCareer !== 'Computer') ? 'flex' : 'none';
  if (careerMenu()) careerMenu().style.display = 'flex';
  if (backBtn()) backBtn().style.display = 'none';
}

export function returnToLast() {
  if (!lastCareer) return;
  // re-enable autoplay when user intentionally returns
  setAutoPlayEnabled(true);

  if (playingCareer === lastCareer && isPausedByBack && videoElem) {
    if (careerMenu()) careerMenu().style.display = 'flex';
    if (backBtn()) backBtn().style.display = 'inline-block';
    isPausedByBack = false;
    try { videoElem.play(); } catch(e){ console.warn(e); }
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
  // when removing content, re-enable autoplay to allow normal AR behaviour
  setAutoPlayEnabled(true);
  if (careerActions()) careerActions().style.display = 'none';
  if (careerMenu()) careerMenu().style.display = 'flex';
  if (backBtn()) backBtn().style.display = 'none';
}

export function getAssets() { return assets; }
