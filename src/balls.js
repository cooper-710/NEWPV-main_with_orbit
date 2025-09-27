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

export function clearTrails() {
  const { scene } = getRefs();
  for (const d of trailDots) scene.remove(d.mesh);
  trailDots = [];
}

export function setTrailVisible(on) {
  showTrail = !!on;
  if (!showTrail) clearTrails();
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
    release:  { x: -pitch.release_pos_x, y: pitch.release_pos_z, z: -pitch.release_extension },
    velocity: { x: -pitch.vx0, y: pitch.vz0, z: pitch.vy0 },
    accel:    { x: -pitch.ax,  y: pitch.az,  z: pitch.ay  },
    spinRate: pitch.release_spin_rate || 0,
    spinAxis: getSpinAxisVector(pitch.spin_axis || 0),
  };

  ball.position.set(ball.userData.release.x, ball.userData.release.y, ball.userData.release.z);
  balls.push(ball);
  scene.add(ball);
}

export function removeBallByType(pitchType) {
  const { scene } = getRefs();
  balls = balls.filter(ball => {
    if (ball.userData.type === pitchType) {
      scene.remove(ball);
      trailDots = trailDots.filter(d => {
        const keep = d.mesh.userData?.type !== pitchType;
        if (!keep) scene.remove(d.mesh);
        return keep;
      });
      return false;
    }
    return true;
  });
}

export function replayAll() {
  const { clock } = getRefs();
  const now = clock.getElapsedTime();
  clearTrails();
  for (const b of balls) {
    b.userData.t0 = now;
    b.position.set(b.userData.release.x, b.userData.release.y, b.userData.release.z);
  }
}

export function animateBalls(delta) {
  const { scene, renderer, camera, clock, controls } = getRefs();
  const now = clock.getElapsedTime();

  for (const ball of balls) {
    const { t0, release, velocity, accel, spinRate, spinAxis } = ball.userData;
    const t = now - t0;

    const z = release.z + velocity.z * t + 0.5 * accel.z * t * t;
    if (z <= -60.5) continue;

    ball.position.x = release.x + velocity.x * t + 0.5 * accel.x * t * t;
    ball.position.y = release.y + velocity.y * t + 0.5 * accel.y * t * t;
    ball.position.z = z;

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

  trailDots = trailDots.filter(d => {
    if (now - d.t0 > 9.5) { scene.remove(d.mesh); return false; }
    return true;
  });

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

  if (controls && typeof controls.update === 'function') controls.update();
  renderer.render(scene, camera);
}

Bus.on?.('clearTrails', clearTrails);
