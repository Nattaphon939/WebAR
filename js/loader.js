// /WEB/js/loader.js
// Optimized: Priority Load (Computer + AI Video) -> Then Background
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

// ฟังก์ชันโหลดรายอาชีพ (ฉลาดขึ้น: เช็คของที่มีอยู่แล้วด้วย)
export async function ensureCareerAssets(career, onProgress = ()=>{}) {
  if (!career || !careers.includes(career)) return null;
  if (!assets[career]) assets[career] = { modelBlobUrl:null, videoBlobUrl:null, markerBlobUrl:null };
  const a = assets[career];

  // 1. นับจำนวนสิ่งที่ต้องโหลด
  let tasks = [];
  if (candidates[career].marker) tasks.push('marker');
  tasks.push('model');
  tasks.push('video');

  const totalTasks = tasks.length;
  let finishedTasks = 0;

  // เช็คว่ามีอะไรเสร็จแล้วบ้าง (เช่น AI Video ที่โหลดไปก่อนแล้ว)
  if (a.markerBlobUrl && tasks.includes('marker')) finishedTasks++;
  if (a.modelBlobUrl) finishedTasks++;
  if (a.videoBlobUrl) finishedTasks++;

  const updateProgress = () => {
    let pct = Math.floor((finishedTasks / totalTasks) * 100);
    emit('career-load-progress', { career, pct: pct, type: 'partial' });
  };

  // เริ่มต้น: ถ้ายังไม่เสร็จ ส่ง 5% หรือค่าปัจจุบัน
  if (finishedTasks < totalTasks) {
     const startPct = Math.max(5, Math.floor((finishedTasks / totalTasks) * 100));
     emit('career-load-progress', { career, pct: startPct, type: 'start' });
  } else {
     updateProgress(); // ครบแล้ว
  }

  const pList = [];

  // --- MARKER ---
  if (candidates[career].marker && !a.markerBlobUrl) {
    pList.push(tryFind(career, candidates[career].marker).then(m => {
        if(m) {
            a.markerBlobUrl = URL.createObjectURL(m.blob);
            finishedTasks++;
            updateProgress();
        }
    }));
  }

  // --- MODEL ---
  if (!a.modelBlobUrl) {
    pList.push(tryFind(career, candidates[career].model).then(m => {
      if (m) {
        a.modelBlobUrl = URL.createObjectURL(m.blob);
        finishedTasks++;
        updateProgress();
        onProgress(100, `${JOB_ROOT}/${career}/${m.url}`, 'model');
      }
    }));
  }

  // --- VIDEO ---
  if (!a.videoBlobUrl) {
    pList.push(tryFind(career, candidates[career].video).then(v => {
      if (v) {
        a.videoBlobUrl = URL.createObjectURL(v.blob);
        finishedTasks++;
        updateProgress();
        onProgress(100, `${JOB_ROOT}/${career}/${v.url}`, 'video');
      }
    }));
  }

  await Promise.all(pList);

  if (a.modelBlobUrl && a.videoBlobUrl) {
    emit('career-ready', { career, assets: { model: a.modelBlobUrl, video: a.videoBlobUrl } });
  }

  return a;
}

/*
  preloadAll:
  Phase 1: โหลด Computer (ครบ) + AI (เฉพาะวิดีโอ) พร้อมกัน
  Phase 2: โหลดที่เหลือต่อ
*/
export async function preloadAll(onMainProgress = ()=>{}) {
  console.debug('loader: start (Priority: Comp + AI-Video)');
  for (const c of careers) {
      if(!assets[c]) assets[c] = { modelBlobUrl:null, videoBlobUrl:null, markerBlobUrl:null };
  }
  try { onMainProgress(5); } catch(e){}

  // --- Phase 1: Critical Batch ---
  try {
    emit('loader-phase', { phase:'critical-start' });
    
    // 1. สั่งโหลด Computer ให้ครบ (Marker, Model, Video)
    const pComputer = ensureCareerAssets('Computer', (pct) => {
        // อัปเดต Main Bar ช่วง 0-70% ตาม Computer
        if(pct > 0) onMainProgress(5 + (pct * 0.6)); 
    });

    // 2. สั่งโหลด "AI Video" ล่วงหน้า (Manual Fetch)
    // (เพื่อให้ปุ่ม AI ขึ้นโหลดมาครึ่งหลอดรอไว้เลย)
    const pAiVideo = tryFind('AI', candidates['AI'].video).then(v => {
        if(v) {
            assets['AI'].videoBlobUrl = URL.createObjectURL(v.blob);
            // ส่ง event ให้ปุ่ม AI ขยับไป 50% (เพราะวิดีโอเสร็จแล้ว 1 จาก 2 อย่าง)
            emit('career-load-progress', { career: 'AI', pct: 50, type: 'video' });
        }
    });

    // รอทั้งคู่เสร็จ (Computer Ready + AI Video Ready)
    await Promise.all([pComputer, pAiVideo]);

    const compReady = isCareerReady('Computer');
    if (compReady) {
        onMainProgress(80); // เสร็จ Phase 1
        emit('start-ready', { computer: 'Computer' }); // ปุ่ม Start ทำงานได้เลย
    }

  } catch(e) {
    console.warn('critical load err', e);
    onMainProgress(50);
  }

  // --- Phase 2: Lazy Load Others (Sequential) ---
  const others = careers.filter(x=> x !== 'Computer');
  
  (async () => {
      for (let i = 0; i < others.length; i++) {
          const c = others[i];
          try {
              // เรียก ensureCareerAssets ซ้ำ
              // - ถ้าเป็น AI: มันจะเห็นว่า Video มีแล้ว จะโหลดแค่ Model (เร็วขึ้น) -> ปุ่มจะวิ่งจาก 50% ไป 100%
              // - ถ้าเป็นอาชีพอื่น: โหลดใหม่หมด -> ปุ่มจะวิ่งจาก 0% ไป 100%
              await ensureCareerAssets(c);
              
              // อัปเดต Main Bar ส่วนที่เหลือ (80% -> 100%)
              const addedProgress = Math.round(20 * ((i + 1) / others.length));
              onMainProgress(80 + addedProgress);
              
          } catch(e) { console.warn('bg load err', c, e); }
      }
      
      onMainProgress(100);
      emit('preload-done', { assets });
  })();

  // 3) Game SFX
  try {
    fetch('game_assets/sfx/win.mp3').then(r=>r.blob()).then(b=>{
       assets.gameAssets = assets.gameAssets || {};
       assets.gameAssets['sfx/win.mp3'] = URL.createObjectURL(b);
    }).catch(()=>{});
  } catch(e){}

  return assets;
}

export async function preloadRemaining() { return; }