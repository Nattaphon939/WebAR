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
  // try fetching with a short timeout to avoid hanging the whole preload
  const timeoutMs = 7000;
  for (const name of list || []) {
    if (!name) continue;
    const url = `${JOB_ROOT}/${career}/${name}`;
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      const r = await fetch(encodeURI(url), { signal: controller.signal });
      clearTimeout(id);
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
  console.debug('loader.preloadAll: start');
  // initialize
  for (const c of careers) assets[c] = { modelBlobUrl:null, videoBlobUrl:null, markerBlobUrl:null };
  try { onMainProgress(5); } catch(e){}

  // 1) Computer
  try {
    onMainProgress(0);
    console.debug('loader.preloadAll: computer stage start');
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
    // Emit career-ready for Computer so UI can react (main now shows Start on career-ready)
    if (compReady) {
      try { document.dispatchEvent(new CustomEvent('career-ready', { detail: { career: 'Computer', assets: { model: assets['Computer'].modelBlobUrl, video: assets['Computer'].videoBlobUrl } } })); } catch(e){}
    }
    // update main progress after Computer stage (base)
    if (compReady) onMainProgress(60);
    else onMainProgress(40);
  } catch(e) {
    console.warn('preloadAll computer err', e);
    try { document.dispatchEvent(new CustomEvent('loader-error', { detail: { stage: 'computer', error: String(e) } })); } catch(e){}
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
    } catch(e) { console.warn('preloadAll career load err', e); try { document.dispatchEvent(new CustomEvent('loader-error', { detail: { stage: c, error: String(e) } })); } catch(e){} }

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
  console.debug('loader.preloadAll: done');
  emit('preload-done', { assets });
  onMainProgress(100);
  return assets;
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
          // if both model+video now present, emit career-ready so UI can react
          if (assets[career].modelBlobUrl && assets[career].videoBlobUrl) {
            try { document.dispatchEvent(new CustomEvent('career-ready', { detail: { career: career, assets: { model: assets[career].modelBlobUrl, video: assets[career].videoBlobUrl } } })); } catch(e){}
          }
        } else {
          assets[career].videoBlobUrl = assets[career].videoBlobUrl || blobUrl;
          document.dispatchEvent(new CustomEvent('career-load-progress', { detail: { career: career, pct: 100, file: u, type: 'video' } }));
          // if both model+video now present, emit career-ready so UI can react
          if (assets[career].modelBlobUrl && assets[career].videoBlobUrl) {
            try { document.dispatchEvent(new CustomEvent('career-ready', { detail: { career: career, assets: { model: assets[career].modelBlobUrl, video: assets[career].videoBlobUrl } } })); } catch(e){}
          }
        }
      } else if (u.startsWith('game_assets/')) {
        assets.gameAssets = assets.gameAssets || {};
        assets.gameAssets[u.replace('game_assets/','')] = blobUrl;
      }
    } catch(e){}
  }));
  return;
}
