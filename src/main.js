import { initScene, getRefs } from './src/scene.js';
import { animateBalls } from './src/balls.js';
import { initControls } from './src/ui.js';
import { loadPitchData } from './src/data.js';

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
(function loop(){
  requestAnimationFrame(loop);
  const now = clock.getElapsedTime();
  const dt = now - last; last = now;
  if (playing) animateBalls(dt);
})();
