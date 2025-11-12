// ar-scene.js
import 'https://cdn.jsdelivr.net/npm/mind-ar@1.1.5/dist/mindar-image.prod.js';
import 'https://cdn.jsdelivr.net/npm/mind-ar@1.1.5/dist/mindar-image-three.prod.js';

window.startAR = async function() {
  const mindar = document.querySelector("#mindar");
  const video = document.querySelector("#video");
  const model = document.querySelector("#model");

  mindar.addEventListener("targetFound", () => {
    console.log("Marker found!");
    model.setAttribute("visible", "true");
    video.play();
  });

  mindar.addEventListener("targetLost", () => {
    console.log("Marker lost!");
    model.setAttribute("visible", "false");
    video.pause();
  });

  mindar.start();
};
