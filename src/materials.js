import * as THREE from 'three';

/**
 * Baseball material with true figure-8 seams (single continuous curve on the sphere)
 * and thinner stitches. Textures are generated procedurally for crisp results.
 */

const TEX_W = 4096, TEX_H = 2048;

// Leather & seam colors
const LEATHER_RGB = [242, 242, 242];
const SEAM_COLOR_RGB = [201, 31, 36]; // classic red

// --- seam controls (thinner + accurate figure-8 path) ---
const FIG8_S_PARAM       = 0.38;  // controls “waist” of the figure-8 (0.30–0.45 looks authentic)
const SEAM_WIDTH_SDF     = 0.2; // seam half-width in implicit-space (thinner than before)
const SEAM_SOFT_SDF      = 0.010; // anti-alias feather in implicit-space
const SEAM_EMBOSS_HEIGHT = 22;    // bump strength along seam
const PORE_JITTER        = 18;    // random leather pores

// spherical helpers
function uvToAngles(u, v) {
  const theta = (u * 2.0 - 1.0) * Math.PI; // [-π, π]
  const phi   = v * Math.PI;               // [0, π]
  return { theta, phi };
}

/**
 * Implicit figure-8 seam on a sphere.
 * Level set f(theta, phi) = 0 traces the seam. Band |f| < width draws the seam area.
 * f = sin(phi)*sin(2θ) - s*cos(phi)
 */
function fig8F(theta, phi, s = FIG8_S_PARAM) {
  return Math.sin(phi) * Math.sin(2.0 * theta) - s * Math.cos(phi);
}

function bandMaskImplicit(f, w, soft) {
  const af = Math.abs(f);
  const a = w - soft;
  const b = w + soft;
  if (af <= a) return 1.0;
  if (af >= b) return 0.0;
  const t = (af - a) / (b - a);
  return 1.0 - (t * t * (3.0 - 2.0 * t));
}

function buildAlbedoTexture(w = TEX_W, h = TEX_H) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(w, h);

  const [lr, lg, lb] = LEATHER_RGB;
  const [sr, sg, sb] = SEAM_COLOR_RGB;

  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      const { theta, phi } = uvToAngles(u, v);

      // true baseball figure-8 (draw both lobes; implicit already gives both)
      const f = fig8F(theta, phi);
      const m = bandMaskImplicit(f, SEAM_WIDTH_SDF, SEAM_SOFT_SDF);

      // slight vignette to prevent flat read
      const vign = 1.0 - 0.05 * Math.pow(2.0 * Math.abs(v - 0.5), 2.0);

      let r = lr * vign, g = lg * vign, b = lb * vign;
      if (m > 0.0) {
        r = r * (1 - m) + sr * m;
        g = g * (1 - m) + sg * m;
        b = b * (1 - m) + sb * m;
      }

      const i = (y * w + x) << 2;
      img.data[i]     = r | 0;
      img.data[i + 1] = g | 0;
      img.data[i + 2] = b | 0;
      img.data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 16;
  return tex;
}

function buildBumpTexture(w = TEX_W, h = TEX_H) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(w, h);

  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      const { theta, phi } = uvToAngles(u, v);

      const f = fig8F(theta, phi);
      const m = bandMaskImplicit(f, SEAM_WIDTH_SDF, SEAM_SOFT_SDF);

      // leather base around mid-gray with pores
      let val = 128 + (Math.random() * (PORE_JITTER * 2) - PORE_JITTER);

      // embossed ridge along seam
      val = Math.min(255, val + m * SEAM_EMBOSS_HEIGHT);

      const i = (y * w + x) << 2;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = val | 0;
      img.data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 16;
  return tex;
}

export function createHalfColorMaterial(pitchType) {
  const base = (pitchType || '').split(' ')[0];
  const accent = {
    FF:'#ff3b30', SL:'#0a84ff', CH:'#30d158', KC:'#5e5ce6',
    SI:'#ff9f0a', CU:'#bf5af2', FC:'#8e8e93', ST:'#64d2ff',
    FS:'#64d2ff', EP:'#ff375f', KN:'#a1a1a6', SC:'#6e6e73',
    SV:'#ffffff', CS:'#ac8e68', FO:'#ffd60a'
  }[base] || '#ff3b30';

  const map  = buildAlbedoTexture();
  const bump = buildBumpTexture();

  return new THREE.MeshPhysicalMaterial({
    map,
    bumpMap: bump,
    bumpScale: 0.040,
    color: new THREE.Color('#ffffff'),
    roughness: 0.48,
    metalness: 0.0,
    sheen: 0.5,
    sheenColor: new THREE.Color('#ffffff'),
    clearcoat: 0.25,
    clearcoatRoughness: 0.5,
    reflectivity: 0.34,
    emissive: new THREE.Color(accent),
    emissiveIntensity: 0.012
  });
}

export function getSpinAxisVector(degrees) {
  const r = THREE.MathUtils.degToRad(degrees || 0);
  return new THREE.Vector3(Math.cos(r), 0, Math.sin(r)).normalize();
}
