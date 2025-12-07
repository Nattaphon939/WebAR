// /WEB/js/ar-utils.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// --- DRACO Loader (Singleton) ---
let dracoLoaderInstance = null;
export function ensureDracoInitialized() {
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

// --- Loaders & Elements ---

export function loadGLTF(blobUrl) {
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

export function makeVideoElem(blobUrl) {
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

// --- Scene Management ---

export function disposeDeep(object) {
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

export function makeModelRenderPriority(model) {
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

export function makeVideoLayer(vm) {
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

export function createLights(scene) {
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

// --- Sync Logic ---

export function syncModelToVideo(videoElem, mixer, gltfModel) {
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

export function preSyncPose(timeVal, mixer, gltfModel) {
  if (!mixer || !gltfModel) return;
  if (gltfModel.userData && Array.isArray(gltfModel.userData._actions)) {
    gltfModel.userData._actions.forEach(action => {
      if(action) action.time = timeVal;
    });
  }
  try { mixer.update(0); } catch(e){}
}

// --- UI Helpers ---

export function setNoScanUI(flag, scanFrameElem) {
  if (!scanFrameElem) return;
  if (flag) {
    scanFrameElem.style.display = 'none';
    Array.from(scanFrameElem.querySelectorAll('*')).forEach(n=> n.style.display = 'none');
    document.body.classList.add('no-scan');
  } else {
    document.body.classList.remove('no-scan');
    scanFrameElem.style.display = 'flex';
    Array.from(scanFrameElem.querySelectorAll('*')).forEach(n=> { n.style.display = ''; });
  }
}