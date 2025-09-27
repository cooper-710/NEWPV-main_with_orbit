import * as THREE from 'three';
import { createHalfColorMaterial, getSpinAxisVector } from './materials.js';
import { pitchColorMap } from './constants.js';
import { getRefs } from './scene.js';
import { Bus } from './data.js';

let balls = [];
let trailDots = [];
let showTrail = false;

export function clearBalls() {
  const { scene } = getRefs();
  for (const d of trailDots) scene.remove(d.mesh);
  trailDots = [];
  for (const b of balls) scene.remove(b);
  balls = [];
}

// NEW: explicit trail clearer (doesn't touch toggle)
export function clearTrails() {
  const { scene } = getRefs();
  for (const d of trailDots) scene.remove(d.mesh);
  trailDots = [];
}

export function setTrailVisible(on) {
  showTrail = !!on;
  if (!showTrail) {
    clearTrails(); // use the central clearer
  }
}

export function addBall(pitch, pitchType) {
  const { scene, clock } = getRefs();

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.145, 32, 32),
    createHalfColorMaterial(pitchType)
  );
  ball.castShadow = true;

  const FT_PER_S_TO_MPH = 0.681818;

  let mphDisplay;
  if (typeof pitch.release_speed === 'number' && isFinite(pitch.release_speed)) {
    mphDisplay = pitch.release_speed * FT_PER_S_TO_MPH;
  } else if (typeof pitch.release_speed_mph === 'number' && isFinite(pitch.release_speed_mph)) {
    mphDisplay = pitch.release_speed_mph;
  } else {
    const v3dFtPerS = Math.hypot(pitch.vx0 || 0, pitch.vy0 || 0, pitch.vz0 || 0);
    mphDisplay = v3dFtPerS * FT_PER_S_TO_MPH;
  }

  const t0 = clock.getElapsedTime();
  ball.userData = {
    type: pitchType,
    t0,
    mphDisplay,
    spinRate: pitch.spin || pitch.rpm || pitch.release_spin_rate || 0,
    spinAxis: getSpinAxisVector(pitch) || new THREE.Vector3(0, 0, 1),
    vx0: pitch.vx0 || 0,
    vy0: pitch.vy0 || 0,
    vz0: pitch.vz0 || 0,
    ax: pitch.ax || 0,
    ay: pitch.ay || 0,
    az: pitch.az || 0,
  };

  scene.add(ball);
  balls.push(ball);
}

export function removeBallByType(type) {
  const { scene } = getRefs();
  balls = balls.filter(b => {
    if (b.userData.type === type) {
      scene.remove(b);
      return false;
    }
    return true;
  });
}

export function setTrailVisible(on) {
  showTrail = !!on;
  if (!showTrail) clearTrails();
}

export function animateBalls(delta) {
  const { scene, camera, renderer, clock, controls } = getRefs();
  const now = clock.getElapsedTime();

  for (const ball of balls) {
    const { t0, vx0, vy0, vz0, ax, ay, az, spinRate, spinAxis } = ball.userData;
    const t = now - t0;

    ball.position.set(
      vx0 * t + 0.5 * ax * t * t,
      1.05 + vy0 * t + 0.5 * ay * t * t,
      vz0 * t + 0.5 * az * t * t
    );

    if (showTrail) {
      const baseType = (ball.userData.type || '').split(' ')[0];
      const color = pitchColorMap[baseType] || 0x888888;
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 8, 8),
        new THREE.MeshBasicMaterial({ color })
      );
      dot.position.copy(ball.position);
      dot.userData = { type: ball.userData.type };
      scene.add(dot);
      trailDots.push({ mesh: dot, t0: now });
    }

    if (spinRate > 0) {
      const radPerSec = (spinRate / 60) * 2 * Math.PI;
      ball.rotateOnAxis(spinAxis.clone().normalize(), radPerSec * delta);
    }
  }

  // Cull trail dots older than ~10s
  trailDots = trailDots.filter(d => {
    if (now - d.t0 > 9.5) { scene.remove(d.mesh); return false; }
    return true;
  });

  // Telemetry to metrics panel (uses precomputed average mph)
  const last = balls[balls.length - 1];
  if (last) {
    Bus.emit('frameStats', {
      nBalls: balls.length,
      last: {
        mph: +last.userData.mphDisplay.toFixed(1),
        spin: Math.round(last.userData.spinRate || 0)
      }
    });
  }

  // ✅ Safe OrbitControls update
  if (controls && typeof controls.update === 'function') controls.update();

  renderer.render(scene, camera);
}

// Optional: also respond to a bus event if you emit it from the UI
Bus.on?.('clearTrails', clearTrails);
