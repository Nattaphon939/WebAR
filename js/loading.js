// loading.js
window.addEventListener("DOMContentLoaded", async () => {
  console.log("Preloading Computer assets...");

  const modelUrl = "./Computer/Computer-Model.glb";
  const videoUrl = "./Computer/Computer.mp4";

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
  } catch (err) {
    console.warn("⚠️ Asset preload warning:", err.message);
  }

  document.getElementById("loading-screen").style.display = "none";
  document.getElementById("start-screen").style.display = "flex";

  document.getElementById("startButton").addEventListener("click", async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      document.getElementById("start-screen").style.display = "none";
      document.getElementById("container").style.display = "block";

      import("./mindar-setup.js").then(module => module.startAR());
    } catch (err) {
      alert("Please allow camera and microphone access.");
      console.error(err);
    }
  });
});
