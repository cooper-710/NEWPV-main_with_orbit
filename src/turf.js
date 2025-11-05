import * as THREE from 'three';

export function createTurfMaterial() {
  // Much darker, saturated ballpark green (solid).
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color('#06150E'),
    roughness: 0.92,
    metalness: 0.0
  });
}
