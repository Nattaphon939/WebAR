// js/ui-menu.js
const careerMenu = document.getElementById('career-menu')
const careers = [
{id:'ai', label:'AI'},
{id:'cloud', label:'Cloud'},
{id:'dc', label:'Data Center'},
{id:'network', label:'Network'}
]


export function showCareerMenu(){
careerMenu.innerHTML = ''
careerMenu.classList.remove('hidden')
const grid = document.createElement('div')
grid.className = 'career-grid'
careers.forEach(c=>{
const btn = document.createElement('button')
btn.className = 'career-btn'
btn.textContent = c.label
btn.addEventListener('click', ()=>{
// save chosen career and trigger next phase (to be implemented)
console.log('selected', c.id)
careerMenu.classList.add('hidden')
// here you would call a function to load/play career media
})
grid.appendChild(btn)
})
careerMenu.appendChild(grid)
}


export function hideCareerMenu(){
careerMenu.classList.add('hidden')
}