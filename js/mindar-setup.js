// mindar-setup.js
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MindARThree } from "mindar-image-three";

export async function startAR() {
  console.log("Starting AR scene...");

  const mindarThree = new MindARThree({
    container: document.querySelector("#container"),
    imageTargetSrc: "./Computer/marker.mind"
  });

  const { renderer, scene, camera } = mindarThree;
  renderer.outputColorSpace = THREE.SRGBColorSpace; // replace deprecated outputEncoding

  const anchor = mindarThree.addAnchor(0);

  // Load model
  const loader = new GLTFLoader();
  const model = await new Promise((resolve, reject) => {
    loader.load("./Computer/Computer-Model.glb", resolve, undefined, reject);
  });
  model.scene.scale.set(0.4, 0.4, 0.4);
  model.scene.position.set(0, 0, 0);
  anchor.group.add(model.scene);

  // Create video texture
  const video = document.createElement("video");
  video.src = "./Computer/Computer.mp4";
  video.crossOrigin = "anonymous";
  video.loop = false;
  video.muted = false;
  video.playsInline = true;

  const texture = new THREE.VideoTexture(video);
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 0.6),
    new THREE.MeshBasicMaterial({ map: texture })
  );
  plane.position.set(0, 0.3, 0);
  anchor.group.add(plane);

  anchor.onTargetFound = () => {
    console.log("✅ Marker found");
    video.play();
  };
  anchor.onTargetLost = () => {
    console.log("❌ Marker lost");
    video.pause();
  };

  await mindarThree.start();
  renderer.setAnimationLoop(() => {
    renderer.render(scene, camera);
  });
}
