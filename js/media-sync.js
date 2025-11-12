// js/media-sync.js
export async function playMedia(model, videoEl){
// ensure ready
try{
videoEl.currentTime = 0
await videoEl.play()
// if model has mixer/animations, start them here (pseudo)
if(model && model.animations && model.animations.length){
// implement THREE.AnimationMixer here if needed
}
}catch(e){
console.warn('playMedia error', e)
}
}


export function stopMedia(){
// stop/pause all media — in skeleton we'll pause any video tags on page
document.querySelectorAll('video').forEach(v=>{try{v.pause(); v.currentTime=0}catch(e){}})
}