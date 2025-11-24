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
      // Load each career folder sequentially (model then video) to avoid many parallel requests.
      for (const career of careers) {
        if (!assets[career]) assets[career] = { modelBlobUrl: null, videoBlobUrl: null };
        const a = assets[career];
        try {
          // model
          if (!a.modelBlobUrl) {
            const mm = await tryFind(career, candidates[career].model);
            if (mm) {
              a.modelBlobUrl = URL.createObjectURL(mm.blob);
              document.dispatchEvent(new CustomEvent('career-load-progress', { detail: { career, pct: 50, file: `${JOB_ROOT}/${career}/${mm.url}`, type: 'model' } }));
            } else {
              document.dispatchEvent(new CustomEvent('career-load-progress', { detail: { career, pct: 0, file: null, type: 'model', ok:false } }));
            }
          }

          // video
          if (!a.videoBlobUrl) {
            const mv = await tryFind(career, candidates[career].video);
            if (mv) {
              a.videoBlobUrl = URL.createObjectURL(mv.blob);
              document.dispatchEvent(new CustomEvent('career-load-progress', { detail: { career, pct: 100, file: `${JOB_ROOT}/${career}/${mv.url}`, type: 'video' } }));
            } else {
              document.dispatchEvent(new CustomEvent('career-load-progress', { detail: { career, pct: a.modelBlobUrl ? 50 : 0, file: null, type: 'video', ok:false } }));
            }
          }

          if (a.modelBlobUrl && a.videoBlobUrl) {
            document.dispatchEvent(new CustomEvent('career-ready', { detail: { career } }));
          }
        } catch(e) {
          // continue to next career on error
        }
      }

      // Load game assets sequentially (manifest then listed assets)
      try {
        const mfRes = await fetch('game_assets/manifest.json');
        if (mfRes && mfRes.ok) {
          const mf = await mfRes.json();
          for (const item of mf) {
            if (item.image) {
              try {
                const r = await fetch(encodeURI(`game_assets/cards/${item.image}`));
                if (r && r.ok) { const b = await r.blob(); gameAssets[`cards/${item.image}`] = URL.createObjectURL(b); }
              } catch(e){}
            }
            if (item.audioWord) {
              try {
                const r = await fetch(encodeURI(`game_assets/audio/${item.audioWord}`));
                if (r && r.ok) { const b = await r.blob(); gameAssets[`audio/${item.audioWord}`] = URL.createObjectURL(b); }
              } catch(e){}
            }
            if (item.audioMeaning) {
              try {
                const r = await fetch(encodeURI(`game_assets/audio/${item.audioMeaning}`));
                if (r && r.ok) { const b = await r.blob(); gameAssets[`audio/${item.audioMeaning}`] = URL.createObjectURL(b); }
              } catch(e){}
            }
          }
        }
      } catch(e){}

      // simple sfx list sequential
      try {
        const sfx = ['flip.wav','match.wav','wrong.wav','win.mp3'];
        for (const f of sfx) {
          try {
            const r = await fetch(encodeURI(`game_assets/sfx/${f}`));
            if (!r || !r.ok) continue;
            const b = await r.blob();
            gameAssets[`sfx/${f}`] = URL.createObjectURL(b);
          } catch(e){}
        }
      } catch(e){}

      assets.gameAssets = gameAssets;
      return;
      // try load model+video quietly
      const mm = await tryFind(c, candidates[c].model);
      if (mm) assets[c].modelBlobUrl = URL.createObjectURL(mm.blob);
      const mv = await tryFind(c, candidates[c].video);
      if (mv) assets[c].videoBlobUrl = URL.createObjectURL(mv.blob);

      const ready = !!(assets[c].modelBlobUrl && assets[c].videoBlobUrl);
      emit('career-load-progress', { career:c, pct: ready ? 100 : 0, type:'all' });
      if (ready && !otherReady) {
        otherReady = c;
        emit('career-ready', { career:c });
      }
    } catch(e) {}
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
