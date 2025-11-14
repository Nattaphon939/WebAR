// js/game.js
// Memory Match game — updated: robust mute (mutes all audio elements, stops audio immediately)

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

// accumulators across stages
let totalMovesAccum = 0;
let totalSecondsAccum = 0;

// keep reference to every Audio created so we can mute/unmute globally
const allAudioElements = new Set();

// SFX: try wav then mp3 fallback
function maybeCreateAudioPaths(basePaths) {
  for (const p of basePaths) {
    try {
      const a = new Audio(p);
      a.preload = 'auto';
      // default muted state follows current isMuted
      a.muted = isMuted;
      a.volume = isMuted ? 0 : 1;
      a.addEventListener('error', ()=>{ /* ignore */ });
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

// apply mute/unmute to all tracked audio elements (including ones created later that are added to the Set)
function applyMuteToAll(muted) {
  allAudioElements.forEach(a => {
    try {
      a.muted = muted;
      if (muted) {
        try { a.volume = 0; } catch(e){}
      } else {
        try { a.volume = 1; } catch(e){}
      }
    } catch(e){}
  });
}

// safe play: respects isMuted and audio.muted
function safePlay(audio) {
  if (!audio) return;
  if (isMuted) return;
  try { audio.currentTime = 0; } catch(e){}
  const p = audio.play();
  if (p && p.catch) p.catch(()=>{});
}

// stop current word/meaning audio
function stopCurrentPlaying() {
  if (currentPlayingAudio) {
    try { currentPlayingAudio.pause(); currentPlayingAudio.currentTime = 0; } catch(e){}
    currentPlayingAudio = null;
  }
}

// stop all audio: currentPlaying + all sfx + any tracked audio
function stopAllAudio() {
  stopCurrentPlaying();
  try {
    allAudioElements.forEach(a => {
      if (a) {
        try { a.pause(); a.currentTime = 0; } catch(e){}
      }
    });
  } catch(e){}
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

function pickNItems(n) {
  const copy = (manifest||[]).slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

function buildCardObjectsForStage(stage) {
  const chosen = pickNItems(PAIRS_PER_STAGE);
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

  // prepare audio objects and track them
  if (cardObj.wordAudio) {
    try {
      const wa = new Audio(cardObj.wordAudio);
      wa.preload = 'auto';
      wa.muted = isMuted;
      wa.volume = isMuted ? 0 : 1;
      wa.addEventListener('error', ()=>{});
      el._wordAudio = wa;
      allAudioElements.add(wa);
    } catch(e){ el._wordAudio = null; }
  } else el._wordAudio = null;

  if (cardObj.meaningAudio) {
    try {
      const ma = new Audio(cardObj.meaningAudio);
      ma.preload = 'auto';
      ma.muted = isMuted;
      ma.volume = isMuted ? 0 : 1;
      ma.addEventListener('error', ()=>{});
      el._meaningAudio = ma;
      allAudioElements.add(ma);
    } catch(e){ el._meaningAudio = null; }
  } else el._meaningAudio = null;

  // click handler — robust
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
  // safety guards
  if (lockBoard) return;
  if (el === firstCard) return;
  if (el.classList.contains('flipped')) return; // prevent double-flip bug
  if (el.classList.contains('matched')) return;

  // flip visual
  el.classList.add('flipped');

  // stop previously playing word/meaning
  stopCurrentPlaying();

  safePlay(sfx.flip);

  // play word audio only if not muted and audio exists
  if (el._wordAudio && !isMuted) {
    currentPlayingAudio = el._wordAudio;
    try { currentPlayingAudio.currentTime = 0; } catch(e){}
    const p = currentPlayingAudio.play();
    if (p && p.catch) p.catch(()=>{});
  } else {
    currentPlayingAudio = null;
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
      // add wrong animation
      firstCard.classList.add('wrong');
      secondCard.classList.add('wrong');
      safePlay(sfx.wrong);

      setTimeout(()=>{
        // only unflip if they are not matched
        if (!firstCard.classList.contains('matched')) firstCard.classList.remove('flipped');
        if (!secondCard.classList.contains('matched')) secondCard.classList.remove('flipped');
        firstCard.classList.remove('wrong');
        secondCard.classList.remove('wrong');
        resetSelection();
      }, 420);
    }, 300);
  }
}

function onMatch(a,b){
  safePlay(sfx.match);
  // stop any playing word audio before meaning
  stopCurrentPlaying();

  // ensure both stay flipped and marked matched
  a.classList.add('matched','flipped');
  b.classList.add('matched','flipped');

  // disable further interactions
  a.style.pointerEvents = 'none';
  b.style.pointerEvents = 'none';

  // play meaning audio if exists (and not muted)
  if (a._meaningAudio && !isMuted) {
    currentPlayingAudio = a._meaningAudio;
    try { currentPlayingAudio.currentTime = 0; } catch(e){}
    const p = currentPlayingAudio.play();
    if (p && p.catch) p.catch(()=>{});
  } else {
    currentPlayingAudio = null;
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
    // accumulate
    totalMovesAccum += moves;
    totalSecondsAccum += seconds;

    // stop any playing audio, then play final win and proceed
    stopAllAudio();
    safePlay(sfx.win);

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
  overlay.style.zIndex = '10004';
  overlay.innerHTML = `<div class="win-card">ผ่านด่าน ${currentStage} • Moves: ${moves} • Time: ${seconds}s</div>`;
  document.body.appendChild(overlay);

  setTimeout(()=>{
    try{ overlay.remove(); }catch{}
    currentStage++;
    startNextStage();
  }, 900);
}

function showFinalScoreUI() {
  const totalMinMoves = TOTAL_STAGES * PAIRS_PER_STAGE;
  const totalMoves = Math.max(1, totalMovesAccum);
  let efficiency = totalMinMoves / totalMoves;
  if (efficiency > 1) efficiency = 1;
  if (efficiency < 0) efficiency = 0;
  const score = Math.round(efficiency * 10);

  // persistent score overlay with buttons
  const container = document.createElement('div');
  container.className = 'score-overlay';
  container.id = 'score-overlay';

  const card = document.createElement('div');
  card.className = 'score-card score-pulse';
  card.innerHTML = `
    <h3>สรุปผลการเล่น</h3>
    <div class="score-number" id="score-number">0</div>
    <div style="font-size:13px;margin-top:8px;color:#002226">คะแนนจากความแม่นยำ (เต็ม 10)</div>
    <div style="font-size:12px;margin-top:8px;color:#002226">Moves: ${totalMoves} • Time: ${totalSecondsAccum}s</div>
    <div class="score-controls">
      <button class="score-btn" id="play-again-btn">เล่นอีกครั้ง</button>
      <button class="score-btn" id="back-menu-btn">กลับสู่เมนู</button>
    </div>
  `;
  container.appendChild(card);
  document.body.appendChild(container);

  // animate score
  const display = document.getElementById('score-number');
  let cur = 0;
  const duration = 900;
  const start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    cur = Math.round(t * score);
    display.textContent = cur;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);

  launchConfetti(40);

  // play again
  document.getElementById('play-again-btn').addEventListener('click', ()=> {
    // stop all audio immediately
    stopAllAudio();
    try { document.getElementById('score-overlay').remove(); } catch(e){}
    clearConfetti();
    totalMovesAccum = 0;
    totalSecondsAccum = 0;
    currentStage = 1;
    startNextStage();
  });

  // back to menu
  document.getElementById('back-menu-btn').addEventListener('click', ()=> {
    // stop all audio immediately
    stopAllAudio();
    stopCurrentPlaying();
    try {
      if (camVideo && camVideo.srcObject) {
        const tracks = camVideo.srcObject.getTracks();
        tracks.forEach(t=>t.stop());
        camVideo.srcObject = null;
      }
    } catch(e){ console.warn(e); }
    try { document.getElementById('score-overlay').remove(); } catch(e){}
    clearConfetti();
    try {
      const gameOverlay = document.getElementById('game-overlay');
      if (gameOverlay) gameOverlay.remove();
    } catch(e){}
    // show career menu and career actions, but hide back & return button
    try {
      const careerMenu = document.getElementById('career-menu');
      if (careerMenu) careerMenu.style.display = 'flex';
      const careerActions = document.getElementById('career-actions');
      if (careerActions) careerActions.style.display = 'flex';
      const backBtn = document.getElementById('backBtn');
      if (backBtn) backBtn.style.display = 'none';
      const returnBtn = document.getElementById('return-btn');
      if (returnBtn) returnBtn.style.display = 'none';
      const scanFrame = document.getElementById('scan-frame');
      if (scanFrame) scanFrame.style.display = 'flex';
    } catch(e){}

    stopTimer();
  });
}

// confetti helpers
function launchConfetti(count = 24) {
  const colors = ['#FFEC5C','#FF5C7C','#5CFFB1','#5CC7FF','#C85CFF'];
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'confetti';
    el.style.zIndex = 10005;
    const color = colors[Math.floor(Math.random()*colors.length)];
    el.style.background = color;
    const startX = Math.random() * 100;
    el.style.left = startX + 'vw';
    const tx = (Math.random()*40 - 20) + 'px';
    const sx = (Math.random()*70 - 35) + 'px';
    el.style.setProperty('--tx', tx);
    el.style.setProperty('--sx', sx);
    const delay = Math.random() * 400;
    const fallDuration = 1600 + Math.random()*1400;
    el.style.top = '-6vh';
    el.style.opacity = '0.95';
    el.style.width = (8 + Math.random()*8) + 'px';
    el.style.height = (12 + Math.random()*12) + 'px';
    el.style.borderRadius = (2 + Math.random()*4) + 'px';
    el.style.transform = `rotate(${Math.random()*360}deg)`;
    el.style.animation = `confetti-fall ${fallDuration}ms cubic-bezier(.2,.7,.2,1) ${delay}ms forwards, confetti-sway ${900 + Math.random()*800}ms ease-in-out ${delay}ms infinite`;
    el.setAttribute('data-confetti','1');
    document.body.appendChild(el);
    setTimeout(()=>{ try{ el.remove(); }catch{} }, fallDuration + delay + 4000);
  }
}
function clearConfetti(){
  const nodes = document.querySelectorAll('[data-confetti]');
  nodes.forEach(n=>n.remove());
}

function startNextStage() {
  moves = 0; matches = 0;
  if (movesEl) movesEl.textContent = `Moves: ${moves}`;
  buildCardObjectsForStage(currentStage);
  renderBoard();
  startTimer();
}

async function startGameFlow(initialStage = 1){
  await loadManifest();
  if (!manifest || manifest.length === 0) return;
  currentStage = initialStage;
  totalMovesAccum = 0;
  totalSecondsAccum = 0;
  buildCardObjectsForStage(currentStage);
  renderBoard();
  moves = 0; matches = 0;
  if (movesEl) movesEl.textContent = `Moves: 0`;
  if (msgEl) msgEl.textContent = '';
  startTimer();
}

// RESTART: stop audio as requested, then reset board
btnRestart && btnRestart.addEventListener('click', ()=>{
  // stop all sounds immediately
  stopAllAudio();

  shuffle(cards);
  renderBoard();
  moves = 0; matches = 0;
  if (movesEl) movesEl.textContent = `Moves: 0`;
  if (msgEl) msgEl.textContent = '';
  startTimer();
});

// MUTE/UNMUTE: apply mute to all tracked audio elements and stop sounds when muting
btnMute && btnMute.addEventListener('click', ()=>{
  isMuted = !isMuted;
  applyMuteToAll(isMuted);
  if (isMuted) {
    // if muting, stop any playing audio immediately
    stopAllAudio();
    if (btnMute) btnMute.textContent = '🔇 Muted';
  } else {
    if (btnMute) btnMute.textContent = '🔈 Mute';
  }
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

  // preload sfx (they are already created earlier)
  Object.values(sfx).forEach(a => { try{ a && a.load(); allAudioElements.add(a);} catch{} });

  startGameFlow(1);
}

// Attach start listener robustly
if (startButton) {
  startButton.addEventListener('click', async () => {
    await startCameraAndGame();
    if (startOverlay) startOverlay.style.display = 'none';
  });
} else {
  setTimeout(()=>{ startCameraAndGame(); if (startOverlay) startOverlay.style.display = 'none'; }, 30);
}

// cleanup
window.addEventListener('beforeunload', ()=> {
  stopAllAudio();
  try {
    if (camVideo && camVideo.srcObject) {
      const tracks = camVideo.srcObject.getTracks();
      tracks.forEach(t=>t.stop());
    }
  } catch(e){}
});
