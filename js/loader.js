// /WEB/js/loader.js
// Optimized for Mobile 5Mbps + Responsive Button Progress Bars
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
  const timeoutMs = 25000; // ให้เวลาเน็ตมือถือนานหน่อย
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

// ฟังก์ชันโหลดรายอาชีพ (ปรับปรุงให้ส่ง Progress ละเอียดขึ้น)
export async function ensureCareerAssets(career, onProgress = ()=>{}) {
  if (!career || !careers.includes(career)) return null;
  if (!assets[career]) assets[career] = { modelBlobUrl:null, videoBlobUrl:null, markerBlobUrl:null };
  const a = assets[career];

  // 1. นับจำนวนสิ่งที่ต้องโหลดของอาชีพนี้
  let tasks = [];
  if (candidates[career].marker) tasks.push('marker');
  tasks.push('model');
  tasks.push('video');

  const totalTasks = tasks.length;
  let finishedTasks = 0;

  // ตรวจสอบว่ามีอะไรโหลดเสร็จอยู่แล้วบ้าง (Cache check)
  if (a.markerBlobUrl && tasks.includes('marker')) finishedTasks++;
  if (a.modelBlobUrl) finishedTasks++;
  if (a.videoBlobUrl) finishedTasks++;

  // ฟังก์ชันคำนวณและส่ง %
  const updateProgress = () => {
    // คำนวณ % ตามจำนวนไฟล์ที่เสร็จ (เช่น 1/2 = 50%, 2/2 = 100%)
    let pct = Math.floor((finishedTasks / totalTasks) * 100);
    // ส่ง event ไปให้ js/buttons.js อัปเดตความกว้าง Bar
    emit('career-load-progress', { career, pct: pct, type: 'partial' });
  };

  // เริ่มต้น: ถ้ายังไม่ครบ ให้ส่ง 5% เพื่อให้ Bar ขยับนิดนึงว่า "กำลังโหลดนะ"
  if (finishedTasks < totalTasks) {
     emit('career-load-progress', { career, pct: 5, type: 'start' });
  } else {
     updateProgress(); // ถ้าครบแล้วก็ส่ง 100% เลย
  }

  const pList = [];

  // --- MARKER ---
  if (candidates[career].marker && !a.markerBlobUrl) {
    pList.push(tryFind(career, candidates[career].marker).then(m => {
        if(m) {
            a.markerBlobUrl = URL.createObjectURL(m.blob);
            finishedTasks++;
            updateProgress(); // อัปเดต Bar
        }
    }));
  }

  // --- MODEL ---
  if (!a.modelBlobUrl) {
    pList.push(tryFind(career, candidates[career].model).then(m => {
      if (m) {
        a.modelBlobUrl = URL.createObjectURL(m.blob);
        finishedTasks++;
        updateProgress(); // อัปเดต Bar
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
        updateProgress(); // อัปเดต Bar
        onProgress(100, `${JOB_ROOT}/${career}/${v.url}`, 'video');
      }
    }));
  }

  // รอจนทุกอย่างในอาชีพนี้เสร็จ
  await Promise.all(pList);

  if (a.modelBlobUrl && a.videoBlobUrl) {
    // ส่ง event ready (buttons.js จะปรับเป็นสถานะ Active สีเข้ม)
    emit('career-ready', { career, assets: { model: a.modelBlobUrl, video: a.videoBlobUrl } });
  }

  return a;
}

/*
  preloadAll:
  - Computer: โหลดก่อนเพื่อน (Priority สูงสุด)
  - Others: ทยอยโหลดทีละตัว (Sequential) เพื่อไม่ให้เน็ตตัน และ Bar จะวิ่งทีละปุ่ม
*/
export async function preloadAll(onMainProgress = ()=>{}) {
  console.debug('loader.preloadAll: start (Smart Progress)');
  for (const c of careers) assets[c] = { modelBlobUrl:null, videoBlobUrl:null, markerBlobUrl:null };
  try { onMainProgress(5); } catch(e){}

  // --- Phase 1: Computer First ---
  try {
    emit('loader-phase', { phase:'computer-start' });
    await ensureCareerAssets('Computer'); 
    // เมื่อ Computer เสร็จ Main Bar จะขยับไป 60%
    const compReady = isCareerReady('Computer');
    if (compReady) onMainProgress(60);
    else onMainProgress(40);
  } catch(e) {
    console.warn('preloadAll computer err', e);
    onMainProgress(20);
  }

  // --- Phase 2: Lazy Load Others (Sequential) ---
  // โหลดทีละปุ่ม ให้เห็น Bar วิ่งทีละปุ่มจนเต็ม
  const others = careers.filter(x=> x !== 'Computer');
  
  (async () => {
      for (let i = 0; i < others.length; i++) {
          const c = others[i];
          try {
              // ฟังก์ชันนี้จะจัดการส่ง event เพื่อขยับ Bar ของปุ่มนั้นๆ เอง (0->50->100)
              await ensureCareerAssets(c);
              
              // อัปเดต Main Bar รวม (จาก 60% -> 100%)
              const addedProgress = Math.round(40 * ((i + 1) / others.length));
              onMainProgress(60 + addedProgress);
              
          } catch(e) { console.warn('bg load err', c, e); }
      }
      
      onMainProgress(100);
      emit('start-ready', { computer: 'Computer', other: 'All' });
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