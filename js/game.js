// js/game.js
// Memory Match game — 2 stages (each 6 pairs = 12 cards), stop previous audio when playing new
// Assumes game_assets/manifest.json exists and contains at least 6 items.

const MANIFEST_PATH = './game_assets/manifest.json';
const TOTAL_STAGES = 2;
const PAIRS_PER_STAGE = 6; // 6 pairs = 12 cards per stage

const boardEl = document.getElementById('board');
const movesEl = document.getElementById('moves');
const timerEl = document.getElementById('timer');
const msgEl = document.getElementById('msg');
const btnRestart = document.getElementById('btn-restart');
const btnMute = document.getElementById('btn-mute');

const startOverlay = document.getElementById('start-overlay');
const startButton = document.getElementById('start-button');
const camVideo = document.getElementById('cam-video');

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
let currentPlayingAudio = null; // for stopping previous audio

// SFX: try multiple extensions (wav then mp3) and fallback to null
function maybeCreateAudioPaths(basePaths) {
  // basePaths: array of possible paths
  for (const p of basePaths) {
    try {
      const a = new Audio(p);
      a.preload = 'auto';
      a.addEventListener('error', ()=>{ /* ignore */ });
      return a;
    } catch(e){}
  }
  return null;
}
const sfx = {
  flip: maybeCreateAudioPaths(['game_assets/sfx/flip.wav','game_assets/sfx/flip.mp3']),
  match: maybeCreateAudioPaths(['game_assets/sfx/match.wav','game_assets/sfx/match.mp3']),
  wrong: maybeCreateAudioPaths(['game_assets/sfx/wrong.wav','game_assets/sfx/wrong.mp3']),
  win: maybeCreateAudioPaths(['game_assets/sfx/win.wav','game_assets/sfx/win.mp3'])
};

function safePlay(audio) {
  if (!audio || isMuted) return;
  try { audio.currentTime = 0; } catch(e){}
  const p = audio.play();
  if (p && p.catch) p.catch(()=>{});
}

function stopCurrentPlaying() {
  if (currentPlayingAudio) {
    try { currentPlayingAudio.pause(); currentPlayingAudio.currentTime = 0; } catch(e){}
    currentPlayingAudio = null;
  }
}

function startTimer() {
  clearInterval(timer);
  seconds = 0;
  timerEl.textContent = `Time: 0s`;
  timer = setInterval(()=>{
    seconds++;
    timerEl.textContent = `Time: ${seconds}s`;
  },1000);
}
function stopTimer(){ clearInterval(timer); }

async function loadManifest(){
  try{
    const res = await fetch(MANIFEST_PATH);
    manifest = await res.json();
  }catch(e){
    console.error('manifest load err',e);
    if (msgEl) msgEl.textContent = 'ไม่พบ manifest.json — วางไฟล์ manifest ที่ game_assets/manifest.json';
  }
}

function resolvePath(val, type){
  if (!val) return null;
  if (val.includes('/') || val.startsWith('./')) return val;
  if (type === 'image') return `game_assets/cards/${val}`;
  if (type === 'audio') return `game_assets/audio/${val}`;
  return val;
}

// pick N unique items from manifest (shuffle then take first N)
function pickNItems(n) {
  const copy = (manifest||[]).slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

function buildCardObjectsForStage(stage) {
  // choose PAIRS_PER_STAGE different items
  const chosen = pickNItems(PAIRS_PER_STAGE);
  // normalize and create pairs
  cards = [];
  chosen.forEach(it => {
    const id = it.id || it.name || '';
    const imgRaw = it.image || it.img || it.icon || '';
    const wordRaw = it.audioWord || it.wordAudio || it.word || it.audio_word;
    const meaningRaw = it.audioMeaning || it.meaningAudio || it.meaning || it.audio_meaning;
    const card = {
      id,
      image: resolvePath(imgRaw,'image'),
      wordAudio: resolvePath(wordRaw,'audio'),
      meaningAudio: resolvePath(meaningRaw,'audio')
    };
    const a = {...card, instanceId: id + '-a-' + Math.random().toString(36).slice(2,7)};
    const b = {...card, instanceId: id + '-b-' + Math.random().toString(36).slice(2,7)};
    cards.push(a,b);
  });
  // ensure even number
  if (cards.length % 2 !== 0) cards.pop();
  shuffle(cards);
}

function shuffle(arr){
  for(let i = arr.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]] = [arr[j],arr[i]];
  }
}

function createCardElement(cardObj){
  const el = document.createElement('div');
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

  // prepare audio objects but DO NOT autoplay
  el._wordAudio = cardObj.wordAudio ? maybeCreateAudioPaths([cardObj.wordAudio, cardObj.wordAudio.replace('.wav','.mp3')]) : null;
  el._meaningAudio = cardObj.meaningAudio ? maybeCreateAudioPaths([cardObj.meaningAudio, cardObj.meaningAudio.replace('.wav','.mp3')]) : null;

  el.addEventListener('click', ()=> onCardClick(el, cardObj));
  return el;
}

function renderBoard(){
  if (!boardEl) return;
  boardEl.innerHTML = '';
  cards.forEach(c=>{
    const cardObj = { id: c.id, image: c.image, wordAudio: c.wordAudio, meaningAudio: c.meaningAudio, instanceId: c.instanceId };
    const el = createCardElement(cardObj);
    boardEl.appendChild(el);
  });
}

function onCardClick(el, cardObj){
  if (lockBoard) return;
  if (el === firstCard) return;
  if (el.classList.contains('matched')) return;

  // flip visual
  el.classList.add('flipped');

  // stop any playing word/meaning audio first
  stopCurrentPlaying();

  // play flip sfx then word audio
  safePlay(sfx.flip);

  if (el._wordAudio) {
    currentPlayingAudio = el._wordAudio;
    try { currentPlayingAudio.currentTime = 0; } catch(e){}
    const p = currentPlayingAudio.play();
    if (p && p.catch) p.catch(()=>{});
  }

  if (!firstCard){
    firstCard = el;
    return;
  }

  secondCard = el;
  lockBoard = true;
  moves++;
  if (movesEl) movesEl.textContent = `Moves: ${moves}`;

  const idA = firstCard.dataset.id;
  const idB = secondCard.dataset.id;
  if (idA === idB){
    setTimeout(()=> onMatch(firstCard, secondCard), 350);
  } else {
    setTimeout(()=>{
      firstCard.classList.add('wrong');
      secondCard.classList.add('wrong');
      safePlay(sfx.wrong);
      setTimeout(()=>{
        firstCard.classList.remove('flipped','wrong');
        secondCard.classList.remove('flipped','wrong');
        resetSelection();
      }, 420);
    }, 300);
  }
}

function onMatch(a,b){
  safePlay(sfx.match);
  // stop any playing word audio before playing meaning
  stopCurrentPlaying();

  a.classList.add('matched'); b.classList.add('matched');
  a.style.pointerEvents = 'none'; b.style.pointerEvents = 'none';

  // play meaning audio (if exists) and set as currentPlayingAudio
  if (a._meaningAudio) {
    currentPlayingAudio = a._meaningAudio;
    try { currentPlayingAudio.currentTime = 0; } catch(e){}
    const p = currentPlayingAudio.play();
    if (p && p.catch) p.catch(()=>{});
  }

  matches++;
  resetSelection();
  checkWin();
}

function resetSelection(){
  firstCard = null;
  secondCard = null;
  lockBoard = false;
}

function checkWin(){
  if (matches * 2 === cards.length){
    stopTimer();
    safePlay(sfx.win);
    // show win overlay with stage info
    showStageWinUI(currentStage);
  }
}

function showStageWinUI(stage) {
  // small overlay
  const overlay = document.createElement('div');
  overlay.className = 'win-overlay';
  overlay.innerHTML = `<div class="win-card">ผ่านด่าน ${stage} • Moves: ${moves} • Time: ${seconds}s</div>`;
  document.body.appendChild(overlay);

  // auto advance after short delay if not last stage
  const delay = 1200;
  if (stage < TOTAL_STAGES) {
    setTimeout(()=>{
      overlay.remove();
      currentStage++;
      startNextStage();
    }, delay);
  } else {
    // final stage: leave overlay for a bit
    setTimeout(()=>{ try{ overlay.remove(); }catch{} }, 2500);
  }
}

function startNextStage() {
  // reset counters and select new cards
  moves = 0; matches = 0;
  if (movesEl) movesEl.textContent = `Moves: ${moves}`;
  // choose new set for this stage
  buildCardObjectsForStage(currentStage);
  renderBoard();
  startTimer();
}

async function startGameFlow(initialStage = 1){
  await loadManifest();
  if (!manifest || manifest.length === 0) return;
  currentStage = initialStage;
  // build and render stage
  buildCardObjectsForStage(currentStage);
  renderBoard();
  moves = 0; matches = 0;
  if (movesEl) movesEl.textContent = `Moves: 0`;
  if (msgEl) msgEl.textContent = '';
  startTimer();
}

btnRestart && btnRestart.addEventListener('click', ()=>{
  // restart current stage
  shuffle(cards);
  renderBoard();
  moves = 0; matches = 0;
  if (movesEl) movesEl.textContent = `Moves: 0`;
  if (msgEl) msgEl.textContent = '';
  startTimer();
});

btnMute && btnMute.addEventListener('click', ()=>{
  isMuted = !isMuted;
  if (btnMute) btnMute.textContent = isMuted ? '🔇 Muted' : '🔈 Mute';
});

// camera start helper
async function startCameraAndGame() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }});
    if (camVideo) {
      camVideo.srcObject = stream;
      try { await camVideo.play(); } catch(e){}
    }
  } catch (e) {
    console.warn('camera permission error', e);
    alert('ไม่สามารถเปิดกล้องได้ — กรุณาตรวจสอบการอนุญาตกล้อง');
    return;
  }

  // preload sfx once user has interacted
  Object.values(sfx).forEach(a => { try{ a && a.load(); } catch{} });

  // start the game logic at stage 1
  startGameFlow(1);
}

// Attach start listener robustly
if (startButton) {
  startButton.addEventListener('click', async () => {
    await startCameraAndGame();
    if (startOverlay) startOverlay.style.display = 'none';
  });
} else {
  // If start-button not present, auto-start (e.g., injected overlay already had a click)
  setTimeout(()=>{ startCameraAndGame(); if (startOverlay) startOverlay.style.display = 'none'; }, 30);
}

// ensure when overlay closed externally we stop audio/camera
window.addEventListener('beforeunload', ()=> {
  // stop current audio and camera tracks
  stopCurrentPlaying();
  try {
    if (camVideo && camVideo.srcObject) {
      const tracks = camVideo.srcObject.getTracks();
      tracks.forEach(t=>t.stop());
    }
  } catch(e){}
});
