// js/game.js
// Memory Match game — camera background + .wav support + sfx
// Place this file as js/game.js and ensure game_assets/manifest.json exists

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

// SFX files (expect WAV in game_assets/sfx/)
const sfx = {
  flip: new Audio('game_assets/sfx/flip.wav'),
  match: new Audio('game_assets/sfx/match.wav'),
  wrong: new Audio('game_assets/sfx/wrong.wav'),
  win: new Audio('game_assets/sfx/win.wav')
};

// ensure sfx preload
Object.values(sfx).forEach(a => { try{ a.preload = 'auto'; }catch{} });

function safePlay(audio) {
  if (!audio || isMuted) return;
  try { audio.currentTime = 0; } catch(e){}
  const p = audio.play();
  if (p && p.catch) p.catch(()=>{});
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
    // manifest expected format: array of objects with keys:
    // id, image (path or filename), audioWord / wordAudio / word, audioMeaning / meaningAudio / meaning
  }catch(e){
    console.error('manifest load err',e);
    msgEl.textContent = 'ไม่พบ manifest.json — วางไฟล์ manifest ที่ game_assets/manifest.json';
  }
}

// helper: build full path for image/audio based on value
function resolvePath(val, type){
  if (!val) return null;
  if (val.includes('/') || val.startsWith('./')) return val;
  // if filename only, prefix typical folders
  if (type === 'image') return `game_assets/cards/${val}`;
  if (type === 'audio') return `game_assets/audio/${val}`;
  return val;
}

function buildCardObjects(){
  // normalize manifest entries to {id, image, wordAudio, meaningAudio}
  const normalized = manifest.map(item => {
    const id = item.id || item.name || '';
    // support multiple possible key names
    const imageRaw = item.image || item.img || item.icon || '';
    const wordRaw = item.audioWord || item.wordAudio || item.word || item.audio_word || item.word_audio || item.audioWord;
    const meaningRaw = item.audioMeaning || item.meaningAudio || item.meaning || item.audio_meaning || item.meaning_audio;
    return {
      id,
      image: resolvePath(imageRaw, 'image'),
      wordAudio: resolvePath(wordRaw, 'audio'),
      meaningAudio: resolvePath(meaningRaw, 'audio')
    };
  });

  // remove invalid entries
  const valid = normalized.filter(n => n.id && n.image);

  // duplicate each to form pairs
  cards = [];
  valid.forEach(it => {
    const a = {...it, instanceId: it.id + '-a'};
    const b = {...it, instanceId: it.id + '-b'};
    cards.push(a,b);
  });

  // if odd number (shouldn't happen) ensure even count by dropping last pair
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

  // preload audio for card (Audio objects)
  el._wordAudio = cardObj.wordAudio ? new Audio(cardObj.wordAudio) : null;
  el._meaningAudio = cardObj.meaningAudio ? new Audio(cardObj.meaningAudio) : null;
  try { if (el._wordAudio) el._wordAudio.preload = 'auto'; if (el._meaningAudio) el._meaningAudio.preload = 'auto'; } catch(e){}

  el.addEventListener('click', ()=> onCardClick(el, cardObj));
  return el;
}

function renderBoard(){
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

  // flip visually
  el.classList.add('flipped');
  safePlay(sfx.flip);

  // play the word audio (name) if exists
  if (el._wordAudio) safePlay(el._wordAudio);

  if (!firstCard){
    firstCard = el;
    return;
  }

  secondCard = el;
  lockBoard = true;
  moves++;
  movesEl.textContent = `Moves: ${moves}`;

  const idA = firstCard.dataset.id;
  const idB = secondCard.dataset.id;
  if (idA === idB){
    // match
    setTimeout(()=>{
      onMatch(firstCard, secondCard);
    }, 350);
  } else {
    // not match
    setTimeout(()=>{
      // small wrong animation
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
  // mark matched visually and disable pointer
  a.classList.add('matched');
  b.classList.add('matched');
  a.style.pointerEvents = 'none';
  b.style.pointerEvents = 'none';

  // play meaning audio (use _meaningAudio from one of them)
  if (a._meaningAudio) {
    // chain: play sfx.match shortly then meaning
    try { a._meaningAudio.currentTime = 0; } catch(e){}
    const p = a._meaningAudio.play();
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
    msgEl.innerHTML = `<div class="win-overlay"><div class="win-card">ชนะ! Moves: ${moves} • Time: ${seconds}s</div></div>`;
  }
}

async function startGameFlow(){
  // called after camera started & user gesture
  await loadManifest();
  if (!manifest || manifest.length === 0) return;
  buildCardObjects();
  renderBoard();
  moves = 0; matches = 0; movesEl.textContent = `Moves: 0`; msgEl.textContent = '';
  startTimer();
}

btnRestart.addEventListener('click', ()=>{
  shuffle(cards);
  renderBoard();
  moves = 0; matches = 0; movesEl.textContent = `Moves: 0`; msgEl.textContent = '';
  startTimer();
});

btnMute.addEventListener('click', ()=>{
  isMuted = !isMuted;
  btnMute.textContent = isMuted ? '🔇 Muted' : '🔈 Mute';
});

// Start / camera logic (user must press start)
startButton.addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }});
    camVideo.srcObject = stream;
    try { await camVideo.play(); } catch(e){}
  } catch (e) {
    console.warn('camera permission error', e);
    alert('ไม่สามารถเปิดกล้องได้ — กรุณาตรวจสอบการอนุญาตกล้อง');
    return;
  }

  startOverlay.style.display = 'none';

  // preload sfx once user has interacted
  Object.values(sfx).forEach(a => { try{ a.load(); } catch{} });

  // start the game
  startGameFlow();
});
