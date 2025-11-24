// js/main.js
import { initLoader } from './loader.js';
import { initButtons } from './buttons.js';

async function main() {
  try {
    // start loader which will show progress bar and reveal start button
    await initLoader();

    // init UI buttons (idempotent)
    initButtons();

    // note: initAndStart จะถูกเรียกเมื่อผู้ใช้กดปุ่ม start (loader.js)
    console.log('loader initialized, waiting for user to start AR');
  } catch (e) {
    console.error('main init error', e);
  }
}

main();
