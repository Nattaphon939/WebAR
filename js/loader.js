// /WEB/js/loader.js
// Optimized for 5Mbps Mobile Data (Hybrid: Fast Start + Gentle Background)
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
  // timeout นานขึ้นสำหรับเน็ตช้า
  const timeoutMs = 20000; 
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

// โหลด assets ของอาชีพเดียว
export async function ensureCareerAssets(career, onProgress = ()=>{}) {
  if (!career || !careers.includes(career)) return null;
  if (!assets[career]) assets[career] = { modelBlobUrl:null, videoBlobUrl:null, markerBlobUrl:null };
  const a = assets[career];

  // โหลด Model + Video + Marker ของอาชีพนี้ "พร้อมกัน" (Parallel within career)
  // เพื่อให้จบอาชีพนี้ไวที่สุด
  const pList = [];

  // Marker (เฉพาะ Computer)
  if (candidates[career].marker && !a.markerBlobUrl) {
    pList.push(tryFind(career, candidates[career].marker).then(m => {
        if(m) a.markerBlobUrl = URL.createObjectURL(m.blob);
    }));
  }

  // Model
  if (!a.modelBlobUrl) {
    pList.push(tryFind(career, candidates[career].model).then(m => {
      if (m) {
        a.modelBlobUrl = URL.createObjectURL(m.blob);
        onProgress(100, `${JOB_ROOT}/${career}/${m.url}`, 'model');
        emit('career-load-progress', { career, pct: 100, type:'model' });
      } else {
        onProgress(0, null, 'model');
      }
    }));
  } else {
    onProgress(100,null,'model');
    emit('career-load-progress', { career, pct: 100, type:'model' });
  }

  // Video
  if (!a.videoBlobUrl) {
    pList.push(tryFind(career, candidates[career].video).then(v => {
      if (v) {
        a.videoBlobUrl = URL.createObjectURL(v.blob);
        onProgress(100, `${JOB_ROOT}/${career}/${v.url}`, 'video');
        emit('career-load-progress', { career, pct: 100, type:'video' });
      } else {
        onProgress(0, null, 'video');
      }
    }));
  } else {
    onProgress(100,null,'video');
    emit('career-load-progress', { career, pct: 100, type:'video' });
  }

  // รอจนครบทุกไฟล์ของอาชีพนี้
  await Promise.all(pList);

  if (a.modelBlobUrl && a.videoBlobUrl) {
    emit('career-ready', { career, assets: { model: a.modelBlobUrl, video: a.videoBlobUrl } });
  }

  return a;
}

/*
  preloadAll:
  1. ทุ่มเน็ตโหลด 'Computer' ให้เสร็จก่อนเพื่อน (Priority สูงสุด)
  2. พอ Computer เสร็จ ค่อยโหลดที่เหลือ "ทีละตัว" (Sequential) เพื่อไม่ให้เน็ตอืด
*/
export async function preloadAll(onMainProgress = ()=>{}) {
  console.debug('loader.preloadAll: start (Mobile Optimized)');
  for (const c of careers) assets[c] = { modelBlobUrl:null, videoBlobUrl:null, markerBlobUrl:null };
  try { onMainProgress(5); } catch(e){}

  // --- Phase 1: Computer First (Critical Path) ---
  // โหลด Marker, Model, Video ของ Computer พร้อมกัน (3 connections พอไหวสำหรับ 5mb)
  try {
    console.debug('loader: Loading Computer...');
    emit('loader-phase', { phase:'computer-start' });
    
    await ensureCareerAssets('Computer', (pct, file, type) => {
        // อัปเดต UI เฉพาะของ Computer
    });

    const compReady = isCareerReady('Computer');
    if (compReady) {
      // แจ้ง main.js ว่าพร้อมเริ่มแล้ว
      try { 
          document.dispatchEvent(new CustomEvent('career-ready', { 
              detail: { career: 'Computer', assets: { model: assets['Computer'].modelBlobUrl, video: assets['Computer'].videoBlobUrl } } 
          })); 
      } catch(e){}
      onMainProgress(60); // Computer เสร็จ = 60% ของความรู้สึก
    } else {
      onMainProgress(40);
    }

  } catch(e) {
    console.warn('preloadAll computer err', e);
    onMainProgress(20);
  }

  // --- Phase 2: Lazy Load Others (Sequential) ---
  // โหลดทีละอาชีพ (AI -> Cloud -> ...) เพื่อไม่ให้เน็ตตัน ถ้าผู้ใช้กดเล่น Computer อยู่
  const others = careers.filter(x=> x !== 'Computer');
  
  // ใช้ loop async เพื่อโหลดทีละตัว (Sequential)
  (async () => {
      for (let i = 0; i < others.length; i++) {
          const c = others[i];
          try {
              // โหลดอาชีพนี้ให้เสร็จก่อนค่อยไปตัวถัดไป
              await ensureCareerAssets(c);
              
              // อัปเดต Progress รวม (จาก 60% -> 100%)
              const addedProgress = Math.round(40 * ((i + 1) / others.length));
              onMainProgress(60 + addedProgress);
              
          } catch(e) { console.warn('bg load err', c, e); }
      }
      
      // เมื่อเสร็จหมด
      onMainProgress(100);
      emit('start-ready', { computer: 'Computer', other: 'All' });
      emit('preload-done', { assets });
  })();

  // 3) Game SFX (โหลดเงียบๆ ไม่ซีเรียส)
  try {
    fetch('game_assets/sfx/win.mp3').then(r=>r.blob()).then(b=>{
       assets.gameAssets = assets.gameAssets || {};
       assets.gameAssets['sfx/win.mp3'] = URL.createObjectURL(b);
    }).catch(()=>{});
  } catch(e){}

  return assets;
}

/* preloadRemaining (Full Background Load - ใช้ Logic เดียวกัน) */
export async function preloadRemaining() {
  // ฟังก์ชันนี้อาจไม่จำเป็นต้องใช้แล้วเพราะเราทำ Phase 2 ใน preloadAll แล้ว
  // แต่คงไว้กันเหนียว เผื่อมีการเรียกใช้จากจุดอื่น
  return;
}