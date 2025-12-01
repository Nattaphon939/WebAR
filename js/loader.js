// /WEB/js/loader.js
// Optimized for Parallel Loading (Turbo Mode)
export const JOB_ROOT = './Job';
export const careers = ['Computer','AI','Cloud','Data_Center','Network'];
export const candidates = {
  Computer: { model: ['Computer-Model.glb','computer-model.glb','Computer-model.glb'], video: ['Computer.mp4','computer.mp4','Computer-Video.mp4'], marker: ['marker.mind'] },
  AI:       { model: ['ai-model.glb','AI-model.glb','ai-model.GLTF','AI-Model.glb'], video: ['AI.mp4','ai.mp4','ai-video.mp4'] },
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
  const timeoutMs = 15000; // Increased timeout for parallel loading
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

  // Parallel loading promises
  const promises = [];

  // 1. Marker
  if (candidates[career].marker && !a.markerBlobUrl) {
    promises.push(tryFind(career, candidates[career].marker).then(m => {
      if (m) a.markerBlobUrl = URL.createObjectURL(m.blob);
    }));
  }

  // 2. Model
  if (!a.modelBlobUrl) {
    promises.push(tryFind(career, candidates[career].model).then(m => {
      if (m) {
        a.modelBlobUrl = URL.createObjectURL(m.blob);
        onProgress(100, `${JOB_ROOT}/${career}/${m.url}`, 'model');
        emit('career-load-progress', { career, pct: 100, type:'model' });
      } else {
        onProgress(0, null, 'model');
        emit('career-load-progress', { career, pct: 0, type:'model', ok:false });
      }
    }));
  } else {
    // Already ready, just emit
    onProgress(100,null,'model');
    emit('career-load-progress', { career, pct: 100, type:'model' });
  }

  // 3. Video
  if (!a.videoBlobUrl) {
    promises.push(tryFind(career, candidates[career].video).then(v => {
      if (v) {
        a.videoBlobUrl = URL.createObjectURL(v.blob);
        onProgress(100, `${JOB_ROOT}/${career}/${v.url}`, 'video');
        emit('career-load-progress', { career, pct: 100, type:'video' });
      } else {
        onProgress(0, null, 'video');
        emit('career-load-progress', { career, pct: 0, type:'video', ok:false });
      }
    }));
  } else {
    // Already ready
    onProgress(100,null,'video');
    emit('career-load-progress', { career, pct: 100, type:'video' });
  }

  // Wait for all fetches for this career to finish
  await Promise.all(promises);

  if (a.modelBlobUrl && a.videoBlobUrl) {
    emit('career-ready', { career, assets: { model: a.modelBlobUrl, video: a.videoBlobUrl } });
  }

  return a;
}

/*
  preloadAll(onMainProgress)
  - Loads Computer assets in PARALLEL (Fastest start)
  - Loads other careers in PARALLEL background
*/
export async function preloadAll(onMainProgress = ()=>{}) {
  console.debug('loader.preloadAll: start (Parallel Mode)');
  for (const c of careers) assets[c] = { modelBlobUrl:null, videoBlobUrl:null, markerBlobUrl:null };
  try { onMainProgress(10); } catch(e){}

  // 1) Computer (Critical Path) - Load all 3 assets in parallel
  try {
    console.debug('loader.preloadAll: computer stage start');
    emit('loader-phase', { phase:'computer-start' });
    
    const pMarker = tryFind('Computer', candidates['Computer'].marker).then(mk => {
        if(mk) {
            assets['Computer'].markerBlobUrl = URL.createObjectURL(mk.blob);
            emit('career-load-progress', { career:'Computer', pct:10, type:'marker' });
        }
    });

    const pModel = tryFind('Computer', candidates['Computer'].model).then(mm => {
        if(mm) {
            assets['Computer'].modelBlobUrl = URL.createObjectURL(mm.blob);
            emit('career-load-progress', { career:'Computer', pct:60, type:'model' });
        }
    });

    const pVideo = tryFind('Computer', candidates['Computer'].video).then(mv => {
        if(mv) {
            assets['Computer'].videoBlobUrl = URL.createObjectURL(mv.blob);
            emit('career-load-progress', { career:'Computer', pct:90, type:'video' });
        }
    });

    // Wait for all Computer assets
    await Promise.all([pMarker, pModel, pVideo]);

    const compReady = !!(assets['Computer'].modelBlobUrl && assets['Computer'].videoBlobUrl);
    if (compReady) {
      try { 
          document.dispatchEvent(new CustomEvent('career-ready', { 
              detail: { career: 'Computer', assets: { model: assets['Computer'].modelBlobUrl, video: assets['Computer'].videoBlobUrl } } 
          })); 
      } catch(e){}
      onMainProgress(60); 
    } else {
      onMainProgress(40);
    }

  } catch(e) {
    console.warn('preloadAll computer err', e);
    onMainProgress(20);
  }

  // 2) Load ALL other careers in parallel (Don't wait one by one)
  const others = careers.filter(x=> x !== 'Computer');
  
  // Fire requests for all other careers simultaneously
  const otherPromises = others.map(c => ensureCareerAssets(c).catch(e => console.warn(e)));
  
  // Optional: We can wait for them, or just let them finish in background.
  // To update progress bar to 100%, we wait for them.
  Promise.all(otherPromises).then(() => {
      onMainProgress(100);
      emit('start-ready', { computer: 'Computer', other: 'All' });
  });

  // 3) Game SFX (Parallel with others)
  try {
    fetch('game_assets/sfx/win.mp3').then(r => {
        if(r.ok) return r.blob();
    }).then(b => {
        if(b) {
            assets.gameAssets = assets.gameAssets || {};
            assets.gameAssets['sfx/win.mp3'] = URL.createObjectURL(b);
        }
    }).catch(()=>{});
  } catch(e){}

  // Check immediately if we can start (Computer is ready)
  if (isCareerReady('Computer')) {
      // Don't wait for others to finish to allow User to click Start
      onMainProgress(90); // Almost done visually
      // Let main.js handle the 100% when it receives 'career-ready'
  }

  emit('preload-done', { assets });
  return assets;
}

/* preloadRemaining (Full Background Load) */
export async function preloadRemaining() {
  const urls = [];
  // ... Collect URLs logic same as before ...
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
  
  // Use Promise.all to fetch EVERYTHING in parallel
  await Promise.all(final.map(async u => {
    try {
      const r = await fetch(encodeURI(u));
      if (!r.ok) return;
      const blob = await r.blob();
      const blobUrl = URL.createObjectURL(blob);
      // ... storage logic same as before ...
      if (u.startsWith(`${JOB_ROOT}/`)) {
        const parts = u.split('/');
        const career = parts[2];
        const low = u.toLowerCase();
        if (low.endsWith('.glb') || low.endsWith('.gltf')) {
          assets[career].modelBlobUrl = assets[career].modelBlobUrl || blobUrl;
          // Emit progress for buttons
          document.dispatchEvent(new CustomEvent('career-load-progress', { detail: { career: career, pct: 100, file: u, type: 'model' } }));
          if (assets[career].modelBlobUrl && assets[career].videoBlobUrl) {
             document.dispatchEvent(new CustomEvent('career-ready', { detail: { career: career } })); 
          }
        } else {
          assets[career].videoBlobUrl = assets[career].videoBlobUrl || blobUrl;
          document.dispatchEvent(new CustomEvent('career-load-progress', { detail: { career: career, pct: 100, file: u, type: 'video' } }));
          if (assets[career].modelBlobUrl && assets[career].videoBlobUrl) {
             document.dispatchEvent(new CustomEvent('career-ready', { detail: { career: career } })); 
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