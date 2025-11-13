// js/ui.js
import * as AR from './ar.js';

export function initUI() {
  document.querySelectorAll('.career-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> {
      const c = btn.dataset.career;
      AR.playCareer(c);
    });
  });

  const backBtn = document.getElementById('backBtn');
  if (backBtn) backBtn.addEventListener('click', ()=> {
    AR.pauseAndShowMenu();
  });

  const returnBtn = document.getElementById('return-btn');
  if (returnBtn) returnBtn.addEventListener('click', ()=> {
    AR.returnToLast();
  });

  // action buttons
  const gameBtn = document.getElementById('game-btn');
  const surveyBtn = document.getElementById('survey-btn');
  const contactBtn = document.getElementById('contact-btn');

  if (gameBtn) gameBtn.addEventListener('click', ()=> {
    document.getElementById('career-menu').style.display = 'none';
    document.getElementById('backBtn').style.display = 'inline-block';
    window.open('game.html', '_blank');
  });
  if (surveyBtn) surveyBtn.addEventListener('click', ()=> {
    document.getElementById('career-menu').style.display = 'none';
    document.getElementById('backBtn').style.display = 'inline-block';
    window.open('https://forms.gle/', '_blank');
  });
  if (contactBtn) contactBtn.addEventListener('click', ()=> {
    document.getElementById('career-menu').style.display = 'none';
    document.getElementById('backBtn').style.display = 'inline-block';
    window.open('#', '_blank');
  });
}
