// /WEB/js/loader.js
// Optimized: Parallel Loading for Faster Startup

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
  // ลด Timeout ต่อไฟล์ลงเหลือ 15s (เผื่อเน็ตช้าแต่ไม่รอนานเกินไป)
  const timeoutMs = 15000; 
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

  // 1. Load Computer First (Priority)
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

  // 2. Load Others (PARALLEL - เร็วขึ้นมาก)
  const others = careers.filter(x=> x !== 'Computer');
  
  // ใช้ Promise.all เพื่อโหลดทุกตัวพร้อมกัน ไม่ต้องรอคิว
  (async () => {
      const promises = others.map((c, i) => {
          return ensureCareerAssets(c).then(() => {
              // คำนวณ Progress แบบรวม
              // (Computer=60) + (Others=40)
              // แต่ละตัวที่เสร็จจะเพิ่ม % ให้หลอด
          }).catch(e => console.warn('bg load err', c, e));
      });

      // รอให้ทุกตัวเสร็จ (หรือถ้าอยากให้หลอดวิ่งเลย ก็ไม่ต้อง await ตรงนี้ก็ได้ แต่เพื่อให้จบสวยๆ เราจะรอ)
      // แต่เราจะอัปเดตหลอดโหลดเทียมๆ ระหว่างรอ
      let completed = 0;
      others.forEach(c => {
         ensureCareerAssets(c).then(()=>{
             completed++;
             const addedProgress = Math.round(30 * (completed / others.length));
             onMainProgress(60 + addedProgress);
         });
      });

      await Promise.all(promises);
      
      // 3. Load Action Button Assets (Game & Contact)
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

// --- ฟังก์ชันโหลดปุ่ม Game/Contact ---
async function preloadActionAssets() {
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
            
            // โหลดจริงจังแบบ Parallel
            const loadFile = (url) => fetch(url).catch(()=>{});
            await Promise.all(list.map(loadFile));
            
            emit('action-progress', { id: 'game-btn', pct: 100 });
        }
    } catch(e) { 
        emit('action-progress', { id: 'game-btn', pct: 100 }); 
    }

    emit('action-progress', { id: 'contact-btn', pct: 10 });
    try {
        await fetch('Contact/Contact.mp4').catch(()=>{});
        emit('action-progress', { id: 'contact-btn', pct: 100 });
    } catch(e){
        emit('action-progress', { id: 'contact-btn', pct: 100 });
    }
}

export async function preloadRemaining() { return; }