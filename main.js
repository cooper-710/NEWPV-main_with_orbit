import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.148.0/build/three.module.js';
import { initScene, getRefs } from './src/scene.js';
import { animateBalls } from './src/balls.js';
import { initControls } from './src/ui.js';
import { loadPitchData } from './src/data.js';

// one-line UI style injection (kept from original)
const style = document.createElement('style');
style.innerHTML = `
  #pitchCheckboxes{display:block;margin-top:16px;max-height:350px;overflow-y:auto}
  .pitch-type-group{display:block;background:rgba(255,255,255,0.05);border-radius:8px;padding:10px;margin-bottom:16px}
  .pitch-type-title{font-size:15px;font-weight:700;margin-bottom:8px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:4px}
  .checkbox-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;justify-items:center}
  .checkbox-group{display:flex;flex-direction:column-reverse;align-items:center;font-size:13px;gap:4px}
  .checkbox-group input[type="checkbox"]{transform:scale(1.2)}
`; document.head.appendChild(style);

let playing = true;
function setPlaying(updateFnOrBool) {
  if (typeof updateFnOrBool === 'function') playing = !!updateFnOrBool(playing);
  else playing = !!updateFnOrBool;
  return playing;
}

initScene();
const data = await loadPitchData();
initControls(data, setPlaying);

// render loop
const { clock } = getRefs();
let last = clock.getElapsedTime();

function loop() {
  requestAnimationFrame(loop);
  const now = clock.getElapsedTime();
  const dt = now - last; last = now;
  if (playing) animateBalls(dt);
}
loop();
