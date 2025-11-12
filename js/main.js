window.addEventListener("DOMContentLoaded", () => {
  const startButton = document.querySelector("#startButton");
  const scanFrame = document.querySelector("#scan-frame");
  const sceneEl = document.querySelector("a-scene");
  const videoEl = document.querySelector("#videoSource");

  startButton.addEventListener("click", async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true });
      scanFrame.style.display = "block";
      startButton.style.display = "none";
      sceneEl.components["mindar-image"].start();
    } catch (err) {
      alert("❗ กรุณาอนุญาตให้เข้าถึงกล้องเพื่อใช้งาน AR");
    }
  });

  const targetEntity = document.querySelector("[mindar-image-target]");
  targetEntity.addEventListener("targetFound", () => {
    scanFrame.style.display = "none";
    videoEl.play();
  });
  targetEntity.addEventListener("targetLost", () => {
    // Sticky mode เปิดอยู่ → โมเดลค้างไว้
    // เราไม่ pause video
  });
});
