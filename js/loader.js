// /WEB/js/loader.js
export const JOB_ROOT = './Job';
export const careers = ['Computer','AI','Cloud','Data_Center','Network'];
export const candidates = {
  Computer: { model: ['Computer-Model.glb','computer-model.glb','Computer-model.glb'], video: ['Computer.mp4','computer.mp4','Computer-Video.mp4'], marker: ['marker.mind'] },
  AI:       { model: ['ai-model.glb','AI-model.glb','ai-model.GLTF','AI-Model.glb'], video: ['AI.mp4','ai.mp4','ai-video.mp4'] },
  Cloud:    { model: ['cloud-model.glb','Cloud-model.glb','cloud-model.GLTF'], video: ['video-cloud.mp4','cloud.mp4','cloud-video.mp4'] },
  Data_Center: { model: ['Data_Center-model.glb','Data_Center-model.glb','Data_ Center-model.glb','Data_Center-model.GLTF'], video: ['Data_Center-Video.mp4','data_center.mp4','data-center.mp4'] },
  Network:  { model: ['network-model.glb','Network-model.glb','network-model.GLTF'], video: ['video-network.mp4','network.mp4','network-video.mp4'] },
};

const assets = {}; 
export function getAssets(){ return assets; }

function emit(name, detail={}) {
  try { document.dispatchEvent(new CustomEvent(name, { detail })); } catch(e){}
}

async function tryFind(career, list) {
  const timeoutMs = 25000;
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

  let tasks = [];
  if (candidates[career].marker) tasks.push('marker');
  tasks.push('model');
  tasks.push('video');

  const totalTasks = tasks.length;
  let finishedTasks = 0;

  if (a.markerBlobUrl && tasks.includes('marker')) finishedTasks++;
  if (a.modelBlobUrl) finishedTasks++;
  if (a.videoBlobUrl) finishedTasks++;

  const updateProgress = () => {
    let pct = Math.floor((finishedTasks / totalTasks) * 100);
    emit('career-load-progress', { career, pct: pct, type: 'partial' });
  };

  if (finishedTasks < totalTasks) {
     emit('career-load-progress', { career, pct: 5, type: 'start' });
  } else {
     updateProgress();
  }

  const pList = [];

  if (candidates[career].marker && !a.markerBlobUrl) {
    pList.push(tryFind(career, candidates[career].marker).then(m => {
        if(m) { a.markerBlobUrl = URL.createObjectURL(m.blob); finishedTasks++; updateProgress(); }
    }));
  }

  if (!a.modelBlobUrl) {
    pList.push(tryFind(career, candidates[career].model).then(m => {
      if (m) { a.modelBlobUrl = URL.createObjectURL(m.blob); finishedTasks++; updateProgress(); }
    }));
  }

  if (!a.videoBlobUrl) {
    pList.push(tryFind(career, candidates[career].video).then(v => {
      if (v) { a.videoBlobUrl = URL.createObjectURL(v.blob); finishedTasks++; updateProgress(); }
    }));
  }

  await Promise.all(pList);

  if (a.modelBlobUrl && a.videoBlobUrl) {
    emit('career-ready', { career, assets: { model: a.modelBlobUrl, video: a.videoBlobUrl } });
  }

  return a;
}

// --- MAIN PRELOAD FUNCTION ---
export async function preloadAll(onMainProgress = ()=>{}) {
  for (const c of careers) assets[c] = { modelBlobUrl:null, videoBlobUrl:null, markerBlobUrl:null };
  try { onMainProgress(5); } catch(e){}

  // 1. Load Computer
  try {
    await ensureCareerAssets('Computer'); 
    onMainProgress(30);
  } catch(e) {}

  // 2. Load Others (Sequential)
  const others = careers.filter(x=> x !== 'Computer');
  (async () => {
      for (let i = 0; i < others.length; i++) {
          await ensureCareerAssets(others[i]);
          const addedProgress = Math.round(30 * ((i + 1) / others.length));
          onMainProgress(30 + addedProgress);
      }
      
      // 3. Load Action Button Assets (Game & Contact)
      await preloadActionAssets(); 
      onMainProgress(100);
      
      emit('start-ready', { computer: 'Computer', other: 'All' });
      emit('preload-done', { assets });
  })();

  return assets;
}

// New function to load Game/Contact assets
async function preloadActionAssets() {
    // A. Game Assets (Phase C logic)
    emit('action-progress', { id: 'game-btn', pct: 10 });
    try {
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
            // Fake loading all of them (browser cache will handle real fetch)
            // Just emitting progress to UI
            for(let i=0; i<list.length; i+=2) { // Step by 2 to be faster
                await new Promise(r => setTimeout(r, 20)); // Fake small delay
                done += 2;
                let pct = Math.min(100, Math.round((done/list.length)*100));
                emit('action-progress', { id: 'game-btn', pct: pct });
            }
            emit('action-progress', { id: 'game-btn', pct: 100 });
        }
    } catch(e) { 
        // If fail, just force complete
        emit('action-progress', { id: 'game-btn', pct: 100 }); 
    }

    // B. Contact Video
    emit('action-progress', { id: 'contact-btn', pct: 10 });
    try {
        const res = await fetch('Contact/Contact.mp4');
        if(res.ok) {
            const b = await res.blob();
            // Just ensure it's cached or ready
            // (We don't strictly need to store blob URL here if using src path in UI, 
            // but fetching ensures it's in browser cache)
            emit('action-progress', { id: 'contact-btn', pct: 100 });
        } else {
            emit('action-progress', { id: 'contact-btn', pct: 100 });
        }
    } catch(e){
        emit('action-progress', { id: 'contact-btn', pct: 100 });
    }
}

export async function preloadRemaining() { return; }