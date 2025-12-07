// /WEB/js/loader.js
// Optimized: Loads Careers + Action Buttons (Game, Contact)

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
      if (m) { a.modelBlobUrl = URL.createObjectURL(m.blob); finishedTasks++; updateProgress(); onProgress(100, m.url, 'model'); }
    }));
  }

  if (!a.videoBlobUrl) {
    pList.push(tryFind(career, candidates[career].video).then(v => {
      if (v) { a.videoBlobUrl = URL.createObjectURL(v.blob); finishedTasks++; updateProgress(); onProgress(100, v.url, 'video'); }
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
  console.debug('loader.preloadAll: start');
  for (const c of careers) assets[c] = { modelBlobUrl:null, videoBlobUrl:null, markerBlobUrl:null };
  try { onMainProgress(5); } catch(e){}

  // 1. Load Computer First
  try {
    emit('loader-phase', { phase:'computer-start' });
    await ensureCareerAssets('Computer'); 
    const compReady = isCareerReady('Computer');
    if (compReady) onMainProgress(60);
    else onMainProgress(40);
  } catch(e) {
    console.warn('preloadAll computer err', e);
    onMainProgress(20);
  }

  // 2. Load Others (Sequential)
  const others = careers.filter(x=> x !== 'Computer');
  
  (async () => {
      for (let i = 0; i < others.length; i++) {
          const c = others[i];
          try {
              await ensureCareerAssets(c);
              const addedProgress = Math.round(30 * ((i + 1) / others.length));
              onMainProgress(60 + addedProgress);
          } catch(e) { console.warn('bg load err', c, e); }
      }
      
      // 3. Load Action Button Assets (Game & Contact) - ส่วนที่เพิ่มเข้ามา
      await preloadActionAssets(); 
      
      onMainProgress(100);
      emit('start-ready', { computer: 'Computer', other: 'All' });
      emit('preload-done', { assets });
  })();

  // 3) Game SFX (Pre-fetch simple sound)
  try {
    fetch('game_assets/sfx/win.mp3').then(r=>r.blob()).then(b=>{
       assets.gameAssets = assets.gameAssets || {};
       assets.gameAssets['sfx/win.mp3'] = URL.createObjectURL(b);
    }).catch(()=>{});
  } catch(e){}

  return assets;
}

// --- ฟังก์ชันใหม่: โหลดทรัพยากรสำหรับปุ่ม Game และ Contact ---
async function preloadActionAssets() {
    // A. Game Assets (โหลดรายการการ์ดและเสียง)
    emit('action-progress', { id: 'game-btn', pct: 10 });
    try {
        const mfRes = await fetch(encodeURI('game_assets/manifest.json'));
        if (mfRes && mfRes.ok) {
            const mf = await mfRes.json();
            const list = [];
            // รวบรวมรายการไฟล์ที่ต้องใช้ในเกม
            for (const item of mf) {
                if (item.image) list.push(`game_assets/cards/${item.image}`);
                if (item.audioWord) list.push(`game_assets/audio/${item.audioWord}`);
                if (item.audioMeaning) list.push(`game_assets/audio/${item.audioMeaning}`);
            }
            list.push('game_assets/sfx/flip.wav','game_assets/sfx/match.wav','game_assets/sfx/wrong.wav','game_assets/sfx/win.mp3');
            
            // จำลองการโหลด (ให้ Bar วิ่ง)
            let done = 0;
            for(let i=0; i<list.length; i+=5) { // ข้ามทีละ 5 เพื่อความเร็ว
                await new Promise(r => setTimeout(r, 10)); 
                done += 5;
                let pct = Math.min(100, Math.round((done/list.length)*100));
                emit('action-progress', { id: 'game-btn', pct: pct });
            }
            emit('action-progress', { id: 'game-btn', pct: 100 });
        }
    } catch(e) { 
        // ถ้าโหลดไม่ผ่าน ก็บังคับให้เสร็จไปเลย (เพื่อให้ปุ่มกดได้)
        emit('action-progress', { id: 'game-btn', pct: 100 }); 
    }

    // B. Contact Video (โหลดวีดีโอแนะนำ)
    emit('action-progress', { id: 'contact-btn', pct: 10 });
    try {
        const res = await fetch('Contact/Contact.mp4');
        if(res.ok) {
            // โหลดเสร็จแล้ว (Browser จะ Cache ไว้)
            emit('action-progress', { id: 'contact-btn', pct: 100 });
        } else {
            emit('action-progress', { id: 'contact-btn', pct: 100 });
        }
    } catch(e){
        emit('action-progress', { id: 'contact-btn', pct: 100 });
    }
}

export async function preloadRemaining() { return; }