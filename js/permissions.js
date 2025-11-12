// js/permissions.js
export async function requestCameraPermission(){
try{
await navigator.mediaDevices.getUserMedia({video:true})
return true
}catch(e){
console.warn('Camera permission denied', e)
return false
}
}


export async function requestAudioPermission(){
try{
await navigator.mediaDevices.getUserMedia({audio:true})
return true
}catch(e){
console.warn('Audio permission denied', e)
return false
}
}


export async function requestAllPermissions(){
const cam = await requestCameraPermission()
const mic = await requestAudioPermission()
return cam && mic
}