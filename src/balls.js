import * as THREE from 'three';
import { createHalfColorMaterial, getSpinAxisVector } from './materials.js';
import { pitchColorMap } from './constants.js';
import { getRefs } from './scene.js';
import { Bus } from './data.js';
import { pitchVelocityMph } from './velocity.js';

let balls = [];
let showTrail = false;

export function getBalls() {
  return balls;
}

export function hasBallOfType(pitchType) {
  return balls.some(ball => ball.userData.type === pitchType);
}

export function clearBalls() {
  const { scene } = getRefs();
  for (const b of balls) {
    if (b.userData.trail) {
      scene.remove(b.userData.trail);
      b.userData.trail.geometry.dispose();
      b.userData.trail.material.dispose();
    }
    if (b.userData.trailTube) {
      scene.remove(b.userData.trailTube);
      b.userData.trailTube.geometry.dispose();
      b.userData.trailTube.material.dispose();
    }
    scene.remove(b);
  }
  balls = [];
}

export function clearTrails() {
  const { scene } = getRefs();
  for (const b of balls) {
    if (b.userData.trail) {
      scene.remove(b.userData.trail);
      b.userData.trail.geometry.dispose();
      b.userData.trail.material.dispose();
      b.userData.trail = null;
    }
    if (b.userData.trailTube) {
      scene.remove(b.userData.trailTube);
      b.userData.trailTube.geometry.dispose();
      b.userData.trailTube.material.dispose();
      b.userData.trailTube = null;
    }
    b.userData.trailPoints = [];
  }
}

export function setTrailVisible(on) {
  showTrail = !!on;
  if (!showTrail) {
    clearTrails();
  } else {
    // Initialize trails for existing balls
    for (const b of balls) {
      if (!b.userData.trail) {
        initTrail(b);
      }
    }
  }
}

export function initTrail(ball) {
  const { scene } = getRefs();
  // Always use pitch type color for trails (TrackMan color map)
  let pitchBaseType;
  const typeStr = ball.userData.type || '';
  // Handle comparison mode format: "player1-CH 6" (fullId format)
  // Or normal format: "CH 6"
  if (typeStr.includes('-') && typeStr.match(/^player\d+-/)) {
    // Comparison mode: "player1-CH 6" -> extract "CH 6" -> "CH"
    const afterPlayerId = typeStr.replace(/^player\d+-/, '');
    pitchBaseType = afterPlayerId.split(' ')[0];
  } else {
    // Normal format: "CH 6" -> "CH"
    pitchBaseType = typeStr.split(' ')[0];
  }
  const color = pitchColorMap[pitchBaseType] || 0x888888;

  const geometry = new THREE.BufferGeometry();
  const material = new THREE.LineBasicMaterial({
    color: color,
    linewidth: 6,
    transparent: true,
    opacity: 0.9
  });

  const line = new THREE.Line(geometry, material);
  ball.userData.trail = line;
  ball.userData.trailPoints = [];
  ball.userData.trailTube = null; // For thick tube version
  scene.add(line);
}

function updateTrailGeometry(ball, trailPoints) {
  if (trailPoints.length < 2) return;

  // Always use pitch type color for trails (TrackMan color map)
  let pitchBaseType;
  const typeStr = ball.userData.type || '';
  // Handle comparison mode format: "player1-CH 6" (fullId format)
  // Or normal format: "CH 6"
  if (typeStr.includes('-') && typeStr.match(/^player\d+-/)) {
    // Comparison mode: "player1-CH 6" -> extract "CH 6" -> "CH"
    const afterPlayerId = typeStr.replace(/^player\d+-/, '');
    pitchBaseType = afterPlayerId.split(' ')[0];
  } else {
    // Normal format: "CH 6" -> "CH"
    pitchBaseType = typeStr.split(' ')[0];
  }
  const color = pitchColorMap[pitchBaseType] || 0x888888;

  // Create a curve from the points
  const curve = new THREE.CatmullRomCurve3(trailPoints, false, 'catmullrom');
  
  // Remove old tube if it exists
  if (ball.userData.trailTube) {
    const { scene } = getRefs();
    scene.remove(ball.userData.trailTube);
    ball.userData.trailTube.geometry.dispose();
    ball.userData.trailTube.material.dispose();
  }

  // Create thick tube geometry
  const tubeGeometry = new THREE.TubeGeometry(curve, trailPoints.length * 2, 0.08, 8, false);
  const tubeMaterial = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.9,
    emissive: color,
    emissiveIntensity: 0.3
  });
  
  const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
  ball.userData.trailTube = tube;
  
  const { scene } = getRefs();
  scene.add(tube);
  
  // Hide the thin line and use the tube instead
  if (ball.userData.trail) {
    ball.userData.trail.visible = false;
  }
}

export function addBall(pitch, pitchType, playerColor = null) {
  const { scene, clock } = getRefs();

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.145, 32, 32),
    createHalfColorMaterial(pitchType)
  );
  ball.castShadow = true;

  const mphDisplay = pitchVelocityMph(pitch) || 0;

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
    trail: null,
    trailPoints: [],
    finishedAt: null,  // Time when ball reached the plate
    playerColor: playerColor || null  // Set player color if provided (for comparison mode)
  };

  ball.position.set(ball.userData.release.x, ball.userData.release.y, ball.userData.release.z);
  balls.push(ball);
  scene.add(ball);
  
  if (showTrail) {
    initTrail(ball);
  }
}

export function removeBallByType(pitchType) {
  const { scene } = getRefs();
  balls = balls.filter(ball => {
    if (ball.userData.type === pitchType) {
      if (ball.userData.trail) {
        scene.remove(ball.userData.trail);
        ball.userData.trail.geometry.dispose();
        ball.userData.trail.material.dispose();
      }
      if (ball.userData.trailTube) {
        scene.remove(ball.userData.trailTube);
        ball.userData.trailTube.geometry.dispose();
        ball.userData.trailTube.material.dispose();
      }
      scene.remove(ball);
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
    b.userData.finishedAt = null;
    b.position.set(b.userData.release.x, b.userData.release.y, b.userData.release.z);
    // Reinitialize trails if trail toggle is on
    if (showTrail && !b.userData.trail) {
      initTrail(b);
    }
  }
}

export function animateBalls(delta) {
  const { scene, renderer, camera, clock, controls } = getRefs();
  const now = clock.getElapsedTime();
  const Z_PLATE = -60.5;

  function solveTimeAtZ({ releaseZ, vZ, aZ, zTarget }) {
    // Solve: releaseZ + vZ*t + 0.5*aZ*t^2 = zTarget
    // => (0.5*aZ)*t^2 + vZ*t + (releaseZ - zTarget) = 0
    const a = 0.5 * aZ;
    const b = vZ;
    const c = releaseZ - zTarget;

    // Near-linear case
    if (Math.abs(a) < 1e-8) {
      if (Math.abs(b) < 1e-8) return null;
      const t = -c / b;
      return Number.isFinite(t) ? t : null;
    }

    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);

    const t1 = (-b - s) / (2 * a);
    const t2 = (-b + s) / (2 * a);

    let best = null;
    if (t1 > 0 && Number.isFinite(t1)) best = t1;
    if (t2 > 0 && Number.isFinite(t2)) best = best === null ? t2 : Math.min(best, t2);
    return best;
  }

  // Remove balls and their trails 3 seconds after they reach the plate
  balls = balls.filter(ball => {
    // If ball finished animation and 3 seconds have passed, remove it
    if (ball.userData.finishedAt !== null && (now - ball.userData.finishedAt) >= 3.0) {
      // Remove trail when ball reaches plate
      if (ball.userData.trail) {
        scene.remove(ball.userData.trail);
        ball.userData.trail.geometry.dispose();
        ball.userData.trail.material.dispose();
      }
      if (ball.userData.trailTube) {
        scene.remove(ball.userData.trailTube);
        ball.userData.trailTube.geometry.dispose();
        ball.userData.trailTube.material.dispose();
      }
      scene.remove(ball);
      return false;
    }
    return true;
  });

  for (const ball of balls) {
    const { t0, release, velocity, accel, spinRate, spinAxis, finishedAt } = ball.userData;
    const t = now - t0;

    // Check if ball has reached the plate
    const z = release.z + velocity.z * t + 0.5 * accel.z * t * t;
    
    if (z <= Z_PLATE && finishedAt === null) {
      // Ball just reached the plate - compute the exact crossing time so the final step
      // doesn't "snap" based on variable dt.
      const tPlate = solveTimeAtZ({
        releaseZ: release.z,
        vZ: velocity.z,
        aZ: accel.z,
        zTarget: Z_PLATE
      });

      const tf = (tPlate !== null && tPlate <= t) ? tPlate : t;

      // Mark the finish time at the exact crossing (not the current frame time).
      ball.userData.finishedAt = t0 + tf;

      // Set final position at the plate using the same tf so x/y/z are consistent.
      const finalX = release.x + velocity.x * tf + 0.5 * accel.x * tf * tf;
      const finalY = release.y + velocity.y * tf + 0.5 * accel.y * tf * tf;
      ball.position.set(finalX, finalY, Z_PLATE);
      
      // Finalize the trail - make sure it goes to the plate
      if (showTrail && ball.userData.trailPoints.length > 0) {
        const finalPos = ball.position.clone();
        const lastPoint = ball.userData.trailPoints[ball.userData.trailPoints.length - 1];
        if (finalPos.distanceTo(lastPoint) > 0.01) {
          ball.userData.trailPoints.push(finalPos);
        }
        // Update trail geometry one final time
        if (ball.userData.trailPoints.length > 1) {
          updateTrailGeometry(ball, ball.userData.trailPoints);
        }
      }
    } else if (finishedAt === null) {
      // Ball is still animating - update position
      ball.position.x = release.x + velocity.x * t + 0.5 * accel.x * t * t;
      ball.position.y = release.y + velocity.y * t + 0.5 * accel.y * t * t;
      ball.position.z = z;

      // Update trail if enabled and ball is still animating
      if (showTrail && ball.userData.trail) {
        const trailPoints = ball.userData.trailPoints;
        const currentPos = ball.position.clone();
        
        // Add point if it's far enough from last point (or first point)
        if (trailPoints.length === 0 || 
            currentPos.distanceTo(trailPoints[trailPoints.length - 1]) > 0.1) {
          trailPoints.push(currentPos.clone());
          
          // Remove old points (keep last 9.5 seconds worth)
          const maxAge = 9.5;
          while (trailPoints.length > 0 && (now - t0) - (trailPoints.length * delta) > maxAge) {
            trailPoints.shift();
          }
          
          // Update trail geometry (thick tube)
          if (trailPoints.length > 1) {
            updateTrailGeometry(ball, trailPoints);
          }
        } else {
          // Update last point to current position for smoother line
          if (trailPoints.length > 0) {
            trailPoints[trailPoints.length - 1].copy(currentPos);
            // Update trail geometry
            if (trailPoints.length > 1) {
              updateTrailGeometry(ball, trailPoints);
            }
          }
        }
      }
    }

    // Only spin the ball if it's still moving (hasn't reached the plate)
    if (spinRate > 0 && finishedAt === null) {
      const radPerSec = (spinRate / 60) * 2 * Math.PI;
      ball.rotateOnAxis(spinAxis.clone().normalize(), radPerSec * delta);
    }
  }

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
