// /WEB/js/loading.js
window.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 Preloading Computer assets...");

  const modelUrl = "./Job/Computer/Computer-Model.glb";
  const videoUrl = "./Job/Computer/Computer.mp4";

  const loadingScreen = document.getElementById("loading-screen");
  const startScreen = document.getElementById("start-screen");
  const startButton = document.getElementById("startButton");
  const container = document.getElementById("container");

  try {
    await Promise.all([
      fetch(modelUrl).then(res => {
        if (!res.ok) throw new Error("Model not found: " + modelUrl);
        return res.blob();
      }),
      fetch(videoUrl).then(res => {
        if (!res.ok) throw new Error("Video not found: " + videoUrl);
        return res.blob();
      })
    ]);
    console.log("✅ Computer assets loaded successfully.");
  } catch (err) {
    console.warn("⚠️ Asset preload warning:", err.message);
  }

  // แสดงปุ่มเริ่มหลังโหลดเสร็จ
  loadingScreen.style.display = "none";
  startScreen.style.display = "flex";
  startButton.style.display = "block";

  // รอให้ผู้ใช้แตะปุ่มก่อนเริ่ม AR
  startButton.addEventListener("click", async () => {
    try {
      console.log("🎥 Requesting camera + audio permissions...");
      await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      console.log("✅ Permissions granted. Starting AR...");

      startScreen.style.display = "none";
      container.style.display = "block";

      // ใช้ path ชัดเจน (GitHub Pages-friendly)
      const module = await import("./js/mindar-setup.js");
      module.startAR();

    } catch (err) {
      alert("กรุณาอนุญาตให้เข้าถึงกล้องและไมค์เพื่อเริ่มใช้งาน AR");
      console.error("❌ Permission error:", err);
    }
  });
});
