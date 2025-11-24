// /WEB/js/loader.js
// responsible for sequential loading + per-career progress events
export const JOB_ROOT = './Job';
export const careers = ['Computer','AI','Cloud','Data_Center','Network'];
export const candidates = {
  Computer: { model: ['Computer-Model.glb','computer-model.glb','Computer-model.glb'], video: ['Computer.mp4','computer.mp4','Computer-Video.mp4'], marker: ['marker.mind'] },
  AI:       { model: ['ai-model.glb','AI-model.glb','ai-model.GLTF','AI-Model.glb'], video: ['AI.mp4','Al.mp4','ai.mp4','ai-video.mp4'] },
  Cloud:    { model: ['cloud-model.glb','Cloud-model.glb','cloud-model.GLTF'], video: ['video-cloud.mp4','cloud.mp4','cloud-video.mp4'] },
  Data_Center: { model: ['Data_Center-model.glb','Data_Center-model.glb','Data_ Center-model.glb','Data_Center-model.GLTF'], video: ['Data_Center-Video.mp4','data_center.mp4','data-center.mp4'] },
  Network:  { model: ['network-model.glb','Network-model.glb','network-model.GLTF'], video: ['video-network.mp4','network.mp4','network-video.mp4'] },
};

const assets = {}; // career -> { modelBlobUrl, videoBlobUrl, markerBlobUrl }
export function getAssets(){ return assets; }

function emit(name, detail={}) {
  try { document.dispatchEvent(new CustomEvent(name, { detail })); } catch(e){}
}

async function tryFind(career, list) {
  for (const name of list || []) {
    if (!name) continue;
    const url = `${JOB_ROOT}/${career}/${name}`;
    try {
      const r = await fetch(encodeURI(url));
      if (!r || !r.ok) continue;
      const b = await r.blob();
      if (!b || b.size === 0) continue;
      return { blob: b, url };
    } catch(e){ /* try next */ }
  }
  return null;
}

export function isCareerReady(career){
  const a = assets[career] || {};
  return !!(a.modelBlobUrl && a.videoBlobUrl);
}

export async function ensureCareerAssets(career, onProgress = ()=>{}) {
  if (!career || !careers.includes(career)) return null;
  if (!assets[career]) assets[career] = { modelBlobUrl:null, videoBlobUrl:null, markerBlobUrl:null };
  const a = assets[career];

  // marker (only Computer usually)
  if (candidates[career].marker && !a.markerBlobUrl) {
    const m = await tryFind(career, candidates[career].marker);
    if (m) a.markerBlobUrl = URL.createObjectURL(m.blob);
  }

  // model
  if (!a.modelBlobUrl) {
    const m = await tryFind(career, candidates[career].model);
    if (m) {
      a.modelBlobUrl = URL.createObjectURL(m.blob);
      onProgress(100, `${JOB_ROOT}/${career}/${m.url}`, 'model');
      emit('career-load-progress', { career, pct: 100, type:'model' });
    } else {
      onProgress(0, null, 'model');
      emit('career-load-progress', { career, pct: 0, type:'model', ok:false });
    }
  } else {
    onProgress(100,null,'model');
    emit('career-load-progress', { career, pct: 100, type:'model' });
  }

  // video
  if (!a.videoBlobUrl) {
    const v = await tryFind(career, candidates[career].video);
    if (v) {
      a.videoBlobUrl = URL.createObjectURL(v.blob);
      onProgress(100, `${JOB_ROOT}/${career}/${v.url}`, 'video');
      emit('career-load-progress', { career, pct: 100, type:'video' });
    } else {
      onProgress(0, null, 'video');
      emit('career-load-progress', { career, pct: 0, type:'video', ok:false });
    }
  } else {
    onProgress(100,null,'video');
    emit('career-load-progress', { career, pct: 100, type:'video' });
  }

  if (a.modelBlobUrl && a.videoBlobUrl) {
    emit('career-ready', { career, assets: { model: a.modelBlobUrl, video: a.videoBlobUrl } });
  }

  return a;
}

/*
  preloadAll(onMainProgress)
  - loads Computer first (marker, model, video)
  - then sequentially tries other careers until at least one other career is ready (model+video)
  - emits 'career-load-progress' events for UI and 'start-ready' when Computer + another ready
*/
export async function preloadAll(onMainProgress = ()=>{}) {
  // initialize
  for (const c of careers) assets[c] = { modelBlobUrl:null, videoBlobUrl:null, markerBlobUrl:null };

  // 1) Computer
  try {
    onMainProgress(0);
    emit('loader-phase', { phase:'computer-start' });
    // marker
    const mk = await tryFind('Computer', candidates['Computer'].marker);
    if (mk) {
      assets['Computer'].markerBlobUrl = URL.createObjectURL(mk.blob);
      emit('career-load-progress', { career:'Computer', pct:5, type:'marker' });
    } else {
      emit('career-load-progress', { career:'Computer', pct:5, type:'marker', ok:false });
    }

    // model
    const mm = await tryFind('Computer', candidates['Computer'].model);
    if (mm) {
      assets['Computer'].modelBlobUrl = URL.createObjectURL(mm.blob);
      emit('career-load-progress', { career:'Computer', pct:50, type:'model' });
    } else {
      emit('career-load-progress', { career:'Computer', pct:50, type:'model', ok:false });
    }
    onMainProgress(50);

    // video
    const mv = await tryFind('Computer', candidates['Computer'].video);
    if (mv) {
      assets['Computer'].videoBlobUrl = URL.createObjectURL(mv.blob);
      emit('career-load-progress', { career:'Computer', pct:95, type:'video' });
    } else {
      emit('career-load-progress', { career:'Computer', pct:95, type:'video', ok:false });
    }

    const compReady = !!(assets['Computer'].modelBlobUrl && assets['Computer'].videoBlobUrl);
    // update main progress after Computer stage (base)
    if (compReady) onMainProgress(60);
    else onMainProgress(40);
  } catch(e) {
    console.warn('preloadAll computer err', e);
    onMainProgress(20);
  }

  // 2) other careers sequentially until at least one is ready
  let otherReady = null;
  const others = careers.filter(x=> x !== 'Computer');
  const steps = others.length;
  // distribute progress from 60 -> 95 across other careers
  for (let idx=0; idx<others.length; idx++) {
    const c = others[idx];
    try {
      // load the entire folder (marker/model/video) for this career sequentially
      const res = await ensureCareerAssets(c, (pct, file, type) => {
        // forward per-career progress events (ensureCareerAssets already emits career-load-progress)
      });
      const ready = !!(res && res.modelBlobUrl && res.videoBlobUrl);
      if (ready && !otherReady) {
        otherReady = c;
      }
    } catch(e) { console.warn('preloadAll career load err', e); }

    // update main progress monotonic: map idx to 60..95 range
    try {
      const base = 60;
      const max = 95;
      const step = (max - base) / Math.max(1, steps);
      const computed = Math.round(base + step * (idx+1));
      onMainProgress(computed);
    } catch(e){}

    // if Computer ready and we have at least one other ready, we can signal start-ready
    if (isCareerReady('Computer') && otherReady) {
      // mark final main progress for Phase A
      onMainProgress(100);
      emit('start-ready', { computer: 'Computer', other: otherReady });
      break;
    }
  }

  // If loop completed without finding another ready career, still allow start if Computer is ready
  try {
    if (!otherReady && isCareerReady('Computer')) {
      // allow user to start with Computer alone (background will continue)
      onMainProgress(100);
      emit('start-ready', { computer: 'Computer', other: null });
    }
  } catch(e){}

  // 3) game sfx (only win.mp3 for your repo)
  try {
    const s = 'game_assets/sfx/win.mp3';
    const r = await fetch(encodeURI(s));
    if (r && r.ok) {
      const b = await r.blob();
      assets.gameAssets = assets.gameAssets || {};
      assets.gameAssets['sfx/win.mp3'] = URL.createObjectURL(b);
    }
  } catch(e){}

  // final emit
  emit('preload-done', { assets });
  onMainProgress(100);
  return assets;
}
