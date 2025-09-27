import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createTurfMaterial } from './turf.js';

let scene, camera, renderer, controls;
const clock = new THREE.Clock();

export function initScene() {
  const canvas = document.getElementById('three-canvas');

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
    controls && controls.update();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x141517);
  scene.fog = new THREE.Fog(0x141517, 85, 170);

  // IBL
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.12).texture;

  // Camera
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 2.6, -65);
  camera.lookAt(0, 2.5, 0);
  scene.add(camera);

  // Lighting
  const key = new THREE.DirectionalLight(0xffe3c6, 1.8);
  key.position.set(6, 12, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1; key.shadow.camera.far = 120;
  scene.add(key);

  const fill = new THREE.HemisphereLight(0x9fc2ff, 0x2a1d0d, 0.55);
  scene.add(fill);

  const plateLight = new THREE.PointLight(0xffffff, 0.75, 120);
  plateLight.position.set(0, 3.0, -60.5);
  scene.add(plateLight);

  // Ground — solid, darker turf
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(240, 240, 1, 1),
    createTurfMaterial()
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Mound (kept as-is; adjust if you want even more saturation)
  const mound = new THREE.Mesh(
    new THREE.CylinderGeometry(2.0, 9, 2.0, 64),
    new THREE.MeshStandardMaterial({ color: 0x3B2415, roughness: 0.95, metalness: 0.0 })
  );
  mound.position.y = 0.0;
  mound.receiveShadow = true;
  scene.add(mound);

  // Rubber
  const rubber = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.05, 0.18),
    new THREE.MeshPhysicalMaterial({ color: 0xf0f0f0, roughness: 0.55, clearcoat: 0.12 })
  );
  rubber.position.set(0, 1.05, 0);
  rubber.castShadow = true; rubber.receiveShadow = true;
  scene.add(rubber);

  // Strike zone
  const zone = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.42, 2.0)),
    new THREE.LineBasicMaterial({ color: 0xf2f2f2, transparent:true, opacity:0.9 })
  );
  zone.position.set(0, 2.35, -60.5);
  scene.add(zone);

  // Plate
  const shape = new THREE.Shape();
  shape.moveTo(-0.85,0); shape.lineTo(0.85,0); shape.lineTo(0.85,0.5);
  shape.lineTo(0,1.0);   shape.lineTo(-0.85,0.5); shape.lineTo(-0.85,0);
  const plate = new THREE.Mesh(new THREE.ShapeGeometry(shape),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.6, clearcoat: 0.2 })
  );
  plate.rotation.x = -Math.PI / 2;
  plate.position.set(0, 0.011, -60.5);
  plate.receiveShadow = true;
  scene.add(plate);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    controls && controls.update();
  });

  return { scene, camera, renderer, clock };
}

export function setCameraView(view) {
  let tgt = new THREE.Vector3(0, 2.5, 0);
  switch(view) {
    case 'catcher':  camera.position.set(0, 2.6, -65); tgt.set(0, 2.5, 0); break;
    case 'pitcher':  camera.position.set(0, 6.2, 5.5); tgt.set(0, 2.2, -60.5); break;
    case 'rhh':      camera.position.set(1.2, 4.1, -65); tgt.set(0, 1.5, 0); break;
    case 'lhh':      camera.position.set(-1.2, 4.1, -65); tgt.set(0, 1.5, 0); break;
    case '1b':       camera.position.set(50, 4.8, -30); tgt.set(0, 5, -30); break;
    case '3b':       camera.position.set(-50, 4.8, -30); tgt.set(0, 5, -30); break;
  }
  if (controls) { controls.target.copy(tgt); controls.update(); } else { camera.lookAt(tgt); }
}

export function getRefs(){ return { scene, camera, renderer, controls, clock }; }
