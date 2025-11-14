// js/game.js (no external sfx files; uses Web Audio API tones)
// Memory Match game — camera background + .wav support + synthesized sfx

const MANIFEST_PATH = './game_assets/manifest.json';

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
let cards = []; // duplicated + shuffled
let firstCard = null;
let secondCard = null;
let lockBoard = false;
let moves = 0;
let matches = 0;
let timer = null;
let seconds = 0;
let isMuted = false;

// -----------------------------
// WebAudio synthesized sfx
// -----------------------------
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
function ensureAudioCtx() {
  if (!audioCtx) {
    audioCtx = new AudioCtx();
    // ensure resume on user gesture
    if (audioCtx.state === 'suspended') {
      const resume = () => {
        audioCtx.resume().catch(()=>{});
        window.removeEventListener('pointerdown', resume);
        window.removeEventListener('keydown', resume);
      };
      window.addEventListener('pointerdown', resume);
      window.addEventListener('keydown', resume);
    }
  }
}

// helper to play simple tone
function playTone({freq = 440, dur = 0.1, type = 'sine', gain = 0.12, detune = 0}) {
  if (isMuted) return;
  try {
    ensureAudioCtx();
    const ctx = audioCtx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    g.gain.value = 0;
    o.connect(g);
    g.connect(ctx.destination);
    const now = ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    o.start(now);
    o.stop(now + dur + 0.02);
  } catch (e) {
    // ignore if audio unavailable
  }
}

// composite sfx
const sfx = {
  flip: ()=> playTone({freq: 1200, dur: 0.06, type: 'sine', gain:0.06}),
  match: ()=> {
    // quick chord
    playTone({freq:880, dur:0.10, type:'sine', gain:0.08});
    setTimeout(()=> playTone({freq:1320, dur:0.09, type:'sine', gain:0.06}), 45);
  },
  wrong: ()=> {
    // low buzz + short
    playTone({freq:200, dur:0.14, type:'sawtooth', gain:0.08});
  },
  win: ()=> {
    // arpeggio
    playTone({freq:800, dur:0.09, type:'sine', gain:0.08});
    setTimeout(()=>playTone({freq:1000, dur:0.09, type:'sine', gain:0.08}), 90);
    setTimeout(()=>playTone({freq:1200, dur:0.12, type:'sine', gain:0.10}), 180);
  }
};

function safePlaySfx(fn) {
  try { if (typeof fn === 'function') fn(); } catch(e) {}
}

// -----------------------------
// Helpers for manifest & assets
// -----------------------------
function maybeCreateAudio(path) {
  try {
    if (!path) return null;
    const a = new Audio(path);
    a.preload = 'auto';
    a.addEventListener('error', ()=>{ /* swallow */ });
    return a;
  } catch(e) { return null; }
}

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

function buildCardObjects(){
  const normalized = manifest.map(item => {
    const id = item.id || item.name || '';
    const imageRaw = item.image || item.img || item.icon || '';
    const wordRaw = item.audioWord || item.wordAudio || item.word || item.audio_word;
    const meaningRaw = item.audioMeaning || item.meaningAudio || item.meaning || item.audio_meaning;
    return {
      id,
      image: resolvePath(imageRaw, 'image'),
      wordAudio: resolvePath(wordRaw, 'audio'),
      meaningAudio: resolvePath(meaningRaw, 'audio')
    };
  });

  const valid = normalized.filter(n => n.id && n.image);
  cards = [];
  valid.forEach(it => {
    const a = {...it, instanceId: it.id + '-a'};
    const b = {...it, instanceId: it.id + '-b'};
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

// -----------------------------
// DOM / game logic
// -----------------------------
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

  // preload audio for card (only word/meaning; these are your provided .wav files)
  el._wordAudio = cardObj.wordAudio ? maybeCreateAudio(cardObj.wordAudio) : null;
  el._meaningAudio = cardObj.meaningAudio ? maybeCreateAudio(cardObj.meaningAudio) : null;

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

  el.classList.add('flipped');
  safePlaySfx(sfx.flip);
  if (el._wordAudio) { try { el._wordAudio.currentTime = 0; el._wordAudio.play().catch(()=>{}); } catch(e){} }

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
      safePlaySfx(sfx.wrong);
      setTimeout(()=>{
        firstCard.classList.remove('flipped','wrong');
        secondCard.classList.remove('flipped','wrong');
        resetSelection();
      }, 420);
    }, 300);
  }
}

function onMatch(a,b){
  // เล่นเสียง match (synthesized) และทำให้การ์ดค้างเปิดตลอด
  safePlaySfx(sfx.match);

  // เพิ่มคลาส matched และ flipped จะทำให้การ์ดค้างเปิด (CSS ใช้ .card.flipped)
  a.classList.add('matched', 'flipped');
  b.classList.add('matched', 'flipped');

  // ปิดการคลิกบนการ์ดที่จับคู่แล้ว
  a.style.pointerEvents = 'none';
  b.style.pointerEvents = 'none';

  // เล่นเสียงความหมาย (ถ้ามีไฟล์ meaning)
  if (a._meaningAudio) {
    try { a._meaningAudio.currentTime = 0; a._meaningAudio.play().catch(()=>{}); } catch(e){}
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
    safePlaySfx(sfx.win);
    if (msgEl) msgEl.innerHTML = `<div class="win-overlay"><div class="win-card">ชนะ! Moves: ${moves} • Time: ${seconds}s</div></div>`;
  }
}

// -----------------------------
// timer / controls
// -----------------------------
function startTimer() {
  clearInterval(timer);
  seconds = 0;
  if (timerEl) timerEl.textContent = `Time: 0s`;
  timer = setInterval(()=>{
    seconds++;
    if (timerEl) timerEl.textContent = `Time: ${seconds}s`;
  },1000);
}
function stopTimer(){ clearInterval(timer); }

async function startGameFlow(){
  await loadManifest();
  if (!manifest || manifest.length === 0) return;
  buildCardObjects();
  renderBoard();
  moves = 0; matches = 0;
  if (movesEl) movesEl.textContent = `Moves: 0`;
  if (msgEl) msgEl.textContent = '';
  startTimer();
}

btnRestart && btnRestart.addEventListener('click', ()=>{
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

// -----------------------------
// camera start logic
// -----------------------------
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

  // ensure AudioContext created after gesture
  ensureAudioCtx();

  // start the game logic
  startGameFlow();
}

// Attach start handler if button exists, otherwise auto-start (overlay click was initial gesture)
if (startButton) {
  startButton.addEventListener('click', async () => {
    await startCameraAndGame();
    if (startOverlay) startOverlay.style.display = 'none';
  });
} else {
  // if no explicit button (e.g., overlay injected differently), auto start shortly
  setTimeout(()=>{ startCameraAndGame(); if (startOverlay) startOverlay.style.display = 'none'; }, 40);
}
