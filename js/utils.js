// js/utils.js
export function preloadAsset(url){
return new Promise((resolve, reject)=>{
// choose strategy by extension
if(url.match(/\.(mp4|webm|ogg)$/i)){
const v = document.createElement('video')
v.src = url
v.preload = 'auto'
v.muted = true
v.playsInline = true
v.addEventListener('canplaythrough', ()=>resolve(url), {once:true})
v.addEventListener('error', (e)=>reject(e), {once:true})
}else if(url.match(/\.mind$/i)){
fetch(url).then(r=>r.ok?resolve(url):reject('bad')).catch(reject)
}else if(url.match(/\.glb$/i)){
// quick HEAD check
fetch(url, {method:'HEAD'}).then(r=>r.ok?resolve(url):reject('bad')).catch(reject)
}else{
fetch(url).then(r=>r.ok?resolve(url):reject('bad')).catch(reject)
}
})
}