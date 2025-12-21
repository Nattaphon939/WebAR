// js/game.js
// Memory Match game — 4 Stages, Symmetrical Layouts, Lenient Scoring

import { getAssets } from './loader.js';

const MANIFEST_PATH = './game_assets/manifest.json';
const TOTAL_STAGES = 4; // ✅ มี 4 ด่านตามที่ต้องการ

const loadedAssets = getAssets().gameAssets || {};

const boardEl = document.getElementById('board');
const movesEl = document.getElementById('moves');
const timerEl = document.getElementById('timer');
const startOverlay = document.getElementById('start-overlay');
const startButton = document.getElementById('start-button');
const camVideo = document.getElementById('cam-video');
const btnRestart = document.getElementById('btn-restart');
const btnMute = document.getElementById('btn-mute');

let manifest = [];
let cards = [];
let firstCard = null;
let secondCard = null;
let lockBoard = false;
let moves = 0;
let matches = 0;
let timer = null;
let seconds = 0;
let isMuted = false;
let currentStage = 1;
let currentPlayingAudio = null;
let totalMovesAccum = 0;
let totalSecondsAccum = 0;

const allAudioElements = new Set();

// --- Config จำนวนคู่ในแต่ละด่าน ---
function getPairsForStage(stage) {
  switch(stage) {
    case 1: return 3; // 6 ใบ (3x2)
    case 2: return 4; // 8 ใบ (3x3 เจาะรูตรงกลาง)
    case 3: return 5; // 10 ใบ (3x4 เจาะ 2 รูตรงกลาง)
    case 4: return 6; // 12 ใบ (3x4 เต็ม) ✅ ด่าน 4 กลับมาแล้ว
    default: return 6; 
  }
}

function getAssetUrl(path) {
    if (!path) return null;
    const key = path.replace('game_assets/', '').replace('./game_assets/', '');
    if (loadedAssets[key]) return loadedAssets[key];
    return path;
}

function maybeCreateAudioPaths(basePaths) {
  for (const p of basePaths) {
    try {
      const finalPath = getAssetUrl(p);
      const a = new Audio(finalPath);
      a.preload = 'auto';
      a.muted = isMuted;
      a.volume = isMuted ? 0 : 1;
      allAudioElements.add(a);
      return a;
    } catch(e){}
  }
  return null;
}

const sfx = {
  flip: maybeCreateAudioPaths(['game_assets/sfx/flip.wav','game_assets/sfx/flip.mp3']),
  match: maybeCreateAudioPaths(['game_assets/sfx/match.wav','game_assets/sfx/match.mp3']),
  wrong: maybeCreateAudioPaths(['game_assets/sfx/wrong.wav','game_assets/sfx/wrong.mp3']),
  win: maybeCreateAudioPaths(['game_assets/sfx/win.mp3','game_assets/sfx/win.wav'])
};

function applyMuteToAll(muted) {
  allAudioElements.forEach(a => {
    try { a.muted = muted; a.volume = muted ? 0 : 1; } catch(e){}
  });
}

function safePlay(audio) {
  if (!audio || isMuted) return;
  try { audio.currentTime = 0; audio.play().catch(()=>{}); } catch(e){}
}

function stopCurrentPlaying() {
  if (currentPlayingAudio) {
    try { currentPlayingAudio.pause(); currentPlayingAudio.currentTime = 0; } catch(e){}
    currentPlayingAudio = null;
  }
}

function stopAllAudio() {
  stopCurrentPlaying();
  allAudioElements.forEach(a => { try { a.pause(); a.currentTime = 0; } catch(e){} });
}

function startTimer() {
  clearInterval(timer);
  seconds = 0;
  if(timerEl) timerEl.textContent = `Time: 0s`;
  timer = setInterval(()=>{
    seconds++;
    if(timerEl) timerEl.textContent = `Time: ${seconds}s`;
  },1000);
}
function stopTimer(){ clearInterval(timer); }

async function loadManifest(){
  try{
    const res = await fetch(MANIFEST_PATH);
    manifest = await res.json();
  }catch(e){ console.error('manifest load err',e); }
}

function resolvePath(val, type){
  if (!val) return null;
  let rawPath = val;
  if (!val.includes('/') && !val.startsWith('./')) {
      if (type === 'image') rawPath = `game_assets/cards/${val}`;
      if (type === 'audio') rawPath = `game_assets/audio/${val}`;
  }
  return getAssetUrl(rawPath);
}

function pickNItems(n) {
  const copy = (manifest||[]).slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

function shuffle(arr){
  for(let i = arr.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]] = [arr[j],arr[i]];
  }
}

// --- Logic สร้างการ์ดและเจาะรู ---
function buildCardObjectsForStage(stage) {
  const pairsNeeded = getPairsForStage(stage);
  const chosen = pickNItems(pairsNeeded);
  
  cards = [];
  chosen.forEach(it => {
    const id = it.id;
    const card = {
      id,
      image: resolvePath(it.image,'image'),
      wordAudio: resolvePath(it.audioWord,'audio'),
      meaningAudio: resolvePath(it.audioMeaning,'audio')
    };
    cards.push({...card, instanceId: id + '-a-' + Math.random()});
    cards.push({...card, instanceId: id + '-b-' + Math.random()});
  });
  
  shuffle(cards);

  // --- แทรกช่องว่าง (Dummy) ---
  if (stage === 2) {
    // 8 ใบ (3x3) -> แทรกตรงกลาง index 4
    cards.splice(4, 0, { id: 'DUMMY' });
  } 
  else if (stage === 3) {
    // 10 ใบ (3x4) -> แทรกตรงกลางแถว 2 และ 3 (index 4 และ 7)
    cards.splice(4, 0, { id: 'DUMMY' });
    cards.splice(7, 0, { id: 'DUMMY' });
  }
  // ด่าน 1 และ 4 ไม่ต้องแทรก (เต็มช่องพอดี)
}

function createCardElement(cardObj){
  const el = document.createElement('div');
  
  // Handle Dummy
  if (cardObj.id === 'DUMMY') {
    el.className = 'card hidden-slot'; 
    return el;
  }

  el.className = 'card';
  el.dataset.id = cardObj.id;
  el.dataset.instance = cardObj.instanceId;

  const inner = document.createElement('div');
  inner.className = 'card-inner';

  const back = document.createElement('div');
  back.className = 'card-back';
  back.innerHTML = '<div style="font-weight:800;color:var(--accent)">?</div>';

  const front = document.createElement('div');
  front.className = 'card-front';
  const img = document.createElement('img');
  img.src = cardObj.image;
  img.alt = cardObj.id;
  front.appendChild(img);

  inner.appendChild(back);
  inner.appendChild(front);
  el.appendChild(inner);

  if (cardObj.wordAudio) {
    try { const wa = new Audio(cardObj.wordAudio); wa.muted = isMuted; allAudioElements.add(wa); el._wordAudio = wa; } catch(e){}
  }
  if (cardObj.meaningAudio) {
    try { const ma = new Audio(cardObj.meaningAudio); ma.muted = isMuted; allAudioElements.add(ma); el._meaningAudio = ma; } catch(e){}
  }

  el.addEventListener('click', ()=> onCardClick(el));
  return el;
}

function renderBoard(){
  if (!boardEl) return;
  boardEl.innerHTML = '';
  cards.forEach(c => boardEl.appendChild(createCardElement(c)));
}

function onCardClick(el){
  if (lockBoard || el === firstCard || el.classList.contains('flipped') || el.classList.contains('matched')) return;

  el.classList.add('flipped');
  stopCurrentPlaying();
  safePlay(sfx.flip);

  if (el._wordAudio && !isMuted) {
    currentPlayingAudio = el._wordAudio;
    try { currentPlayingAudio.currentTime = 0; currentPlayingAudio.play().catch(()=>{}); } catch(e){}
  }

  if (!firstCard){ firstCard = el; return; }

  secondCard = el;
  lockBoard = true;
  moves++;
  if (movesEl) movesEl.textContent = `Moves: ${moves}`;

  if (firstCard.dataset.id === secondCard.dataset.id){
    setTimeout(()=> onMatch(firstCard, secondCard), 350);
  } else {
    setTimeout(()=>{
      firstCard.classList.add('wrong'); secondCard.classList.add('wrong'); safePlay(sfx.wrong);
      setTimeout(()=>{
        if (!firstCard.classList.contains('matched')) firstCard.classList.remove('flipped');
        if (!secondCard.classList.contains('matched')) secondCard.classList.remove('flipped');
        firstCard.classList.remove('wrong'); secondCard.classList.remove('wrong');
        resetSelection();
      }, 420);
    }, 500);
  }
}

function onMatch(a,b){
  safePlay(sfx.match);
  stopCurrentPlaying();

  a.classList.add('matched','flipped');
  b.classList.add('matched','flipped');
  
  if (a._meaningAudio && !isMuted) {
    setTimeout(() => {
        currentPlayingAudio = a._meaningAudio;
        try { currentPlayingAudio.currentTime = 0; currentPlayingAudio.play().catch(()=>{}); } catch(e){}
    }, 200);
  }

  matches++;
  resetSelection();
  checkWin();
}

function resetSelection(){
  firstCard = null; secondCard = null; lockBoard = false;
}

function checkWin(){
  const realCardsCount = cards.filter(c => c.id !== 'DUMMY').length;
  if (matches * 2 === realCardsCount){
    stopTimer();
    totalMovesAccum += moves;
    totalSecondsAccum += seconds;
    stopAllAudio();
    
    setTimeout(() => { safePlay(sfx.win); }, 1000);

    if (currentStage < TOTAL_STAGES) {
      showStageWinUIAndAdvance();
    } else {
      showFinalScoreUI();
    }
  }
}

function showStageWinUIAndAdvance() {
  const overlay = document.createElement('div');
  overlay.className = 'win-overlay';
  overlay.innerHTML = `<div class="win-card">🎉 ผ่านด่าน ${currentStage} แล้ว!</div>`;
  document.body.appendChild(overlay);
  setTimeout(()=>{ try{ overlay.remove(); }catch{} currentStage++; startNextStage(); }, 2000);
}

function showFinalScoreUI() {
  let totalMinMoves = 0;
  for (let i = 1; i <= TOTAL_STAGES; i++) {
    totalMinMoves += getPairsForStage(i);
  }
  const totalMoves = Math.max(1, totalMovesAccum);
  let efficiency = totalMinMoves / totalMoves;
  
  // ✅ สูตรคะแนนแบบใจดี (x13)
  const score = Math.min(10, Math.round(efficiency * 13)); 

  const container = document.createElement('div');
  container.className = 'score-overlay';
  container.id = 'score-overlay';
  container.innerHTML = `
    <div class="score-card score-pulse">
      <h3>🏆 ยินดีด้วย! คุณเก่งมาก 🏆</h3>
      <div class="score-number">${score}/10</div>
      <div style="font-size:12px; margin-top:10px;">เวลาทั้งหมด: ${totalSecondsAccum} วินาที</div>
      <div class="score-controls">
        <button class="score-btn" id="play-again-btn">เล่นอีกครั้ง</button>
        <button class="score-btn" id="back-menu-btn">กลับเมนูหลัก</button>
      </div>
    </div>
  `;
  document.body.appendChild(container);
  launchConfetti();

  document.getElementById('play-again-btn').onclick = () => {
    stopAllAudio(); container.remove(); clearConfetti(); startGameFlow(1);
  };
  document.getElementById('back-menu-btn').onclick = () => {
    stopAllAudio(); container.remove(); clearConfetti(); closeGame();
  };
}

function launchConfetti(count = 30) {
    const colors = ['#f00','#0f0','#00f','#ff0','#0ff'];
    for(let i=0; i<count; i++){
        const el = document.createElement('div');
        el.className = 'confetti';
        el.style.left = Math.random()*100 + 'vw';
        el.style.background = colors[Math.floor(Math.random()*colors.length)];
        el.style.animation = `confetti-fall ${2+Math.random()}s linear`;
        el.setAttribute('data-confetti','1');
        document.body.appendChild(el);
    }
}
function clearConfetti(){ document.querySelectorAll('[data-confetti]').forEach(n=>n.remove()); }

function startNextStage() {
  moves = 0; matches = 0;
  if (movesEl) movesEl.textContent = `Moves: 0`;
  buildCardObjectsForStage(currentStage);
  renderBoard();
  startTimer();
  
  const toast = document.createElement('div');
  Object.assign(toast.style, {
      position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
      background: 'rgba(0,0,0,0.8)', color: '#00ffff', padding: '15px 30px',
      borderRadius: '10px', fontSize: '24px', fontWeight: 'bold', zIndex: '10008', pointerEvents: 'none'
  });
  toast.innerText = `ด่านที่ ${currentStage}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 1500);
}

async function startGameFlow(initialStage = 1){
  await loadManifest();
  if (!manifest || manifest.length === 0) return;
  currentStage = initialStage;
  totalMovesAccum = 0;
  totalSecondsAccum = 0;
  startNextStage(); 
}

function closeGame() {
    try { stopAllAudio(); } catch(e){}
    try { if (camVideo && camVideo.srcObject) camVideo.srcObject.getTracks().forEach(t=>t.stop()); } catch(e){}
    const gameOverlay = document.getElementById('game-overlay');
    if (gameOverlay) gameOverlay.remove();
    const careerMenu = document.getElementById('career-menu');
    if (careerMenu) careerMenu.style.display = 'flex';
    const scanFrame = document.getElementById('scan-frame');
    if (scanFrame) scanFrame.style.display = 'flex';
}

if (startButton) {
  startButton.addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }});
        if (camVideo) camVideo.srcObject = stream;
    } catch(e) { console.warn(e); }
    startGameFlow(1);
    if (startOverlay) startOverlay.style.display = 'none';
  });
} else {
    startGameFlow(1);
}

btnRestart && btnRestart.addEventListener('click', ()=>{ stopAllAudio(); startNextStage(); });
btnMute && btnMute.addEventListener('click', ()=>{ isMuted = !isMuted; applyMuteToAll(isMuted); btnMute.textContent = isMuted ? '🔇 Muted' : '🔈 Mute'; });