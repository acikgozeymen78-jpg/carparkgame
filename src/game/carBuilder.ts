import * as THREE from 'three';
import type {
  DecalStyleId,
  PaintFinishId,
  RimStyleId,
  SpoilerStyleId,
  UnderglowColorId,
  VehicleCustomization,
  VehicleModelId,
} from '../types/game';
import { resolveVehicleModel } from './vehicles';
import {
  buildCockpitInterior,
  type CockpitTelemetryInput,
} from './cockpitBuilder';

export const PAINT_PRESETS: Record<
  PaintFinishId,
  { name: string; hex: number; css: string; metalness: number; roughness: number }
> = {
  crimson: {
    name: 'Kızıl Metalik',
    hex: 0xd61f3a,
    css: '#d61f3a',
    metalness: 0.72,
    roughness: 0.22,
  },
  alpine: {
    name: 'Alp Beyazı',
    hex: 0xeef2f7,
    css: '#eef2f7',
    metalness: 0.35,
    roughness: 0.18,
  },
  cobalt: {
    name: 'Kobalt Mavi',
    hex: 0x1e64e8,
    css: '#1e64e8',
    metalness: 0.76,
    roughness: 0.2,
  },
  obsidian: {
    name: 'Mat Karbon',
    hex: 0x222731,
    css: '#222731',
    metalness: 0.45,
    roughness: 0.56,
  },
  amber: {
    name: 'Güneş Sarısı',
    hex: 0xf59e0b,
    css: '#f59e0b',
    metalness: 0.65,
    roughness: 0.22,
  },
  emerald: {
    name: 'Yarış Yeşili',
    hex: 0x0d9468,
    css: '#0d9468',
    metalness: 0.72,
    roughness: 0.22,
  },
};

export const RIM_LABELS: Record<RimStyleId, string> = {
  sport5: '5 Kollu Spor',
  turbine: 'Türbin Aero',
  forgedGold: 'Altın Dövme',
  deepDish: 'Derin Ofset',
};

export const SPOILER_LABELS: Record<SpoilerStyleId, string> = {
  none: 'Yok',
  lip: 'İnce Lip',
  gtWing: 'GT Kanat',
};

export const UNDERGLOW_PRESETS: Record<
  UnderglowColorId,
  { name: string; hex: number; css: string }
> = {
  off: { name: 'Kapalı', hex: 0x000000, css: '#334155' },
  cyan: { name: 'Buz Mavisi', hex: 0x22d3ee, css: '#22d3ee' },
  amber: { name: 'Kehribar', hex: 0xfbbf24, css: '#fbbf24' },
  magenta: { name: 'Fuşya', hex: 0xe879f9, css: '#e879f9' },
  emerald: { name: 'Zümrüt', hex: 0x34d399, css: '#34d399' },
};

export const DECAL_LABELS: Record<DecalStyleId, string> = {
  none: 'Sade',
  dualStripe: 'Çift Şerit',
  sideNumber: 'Yarış #01',
};

export interface CarRig {
  root: THREE.Group;
  chassisGroup: THREE.Group;
  frontSteerPivots: THREE.Group[];
  wheelSpinGroups: THREE.Group[];
  brakeLightMat: THREE.MeshStandardMaterial;
  reverseLightMat: THREE.MeshStandardMaterial;
  underglowMesh: THREE.Mesh;
  underglowMat: THREE.MeshBasicMaterial;
  bodyMat: THREE.MeshPhysicalMaterial;
  applyCustomization: (custom: VehicleCustomization) => void;
  setLightsState: (braking: boolean, reversing: boolean, damageFlash: number) => void;
  setHeadlightsEnabled: (enabled: boolean) => void;
  setWheelKinematics: (steerAngle: number, spinAngle: number, speed: number) => void;
  setHoverKinematics: (hoverY: number, hoverActive: boolean, timeSec: number) => void;
  setAeroActive: (active: boolean) => void;
  setCockpitViewActive: (active: boolean) => void;
  setCockpitTelemetry: (input: CockpitTelemetryInput, dt: number) => void;
  dispose: () => void;
}

function createSideNumberTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 58px "Space Grotesk", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('01', 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildProceduralCar(
  initialCustom: VehicleCustomization,
  contactShadowMap: THREE.Texture,
  maxAnisotropy = 4,
): CarRig {
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const carLiftGroup = new THREE.Group();
  root.add(carLiftGroup);
  const chassisGroup = new THREE.Group();
  carLiftGroup.add(chassisGroup);

  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  // Grounding radial contact shadow plane at y = 0.015
  const contactShadowGeo = track(new THREE.PlaneGeometry(2.6, 4.9));
  const contactShadowMat = track(
    new THREE.MeshBasicMaterial({
      map: contactShadowMap,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
  const contactShadowMesh = new THREE.Mesh(contactShadowGeo, contactShadowMat);
  contactShadowMesh.rotation.x = -Math.PI / 2;
  contactShadowMesh.position.y = 0.016;
  root.add(contactShadowMesh);

  // Underglow halo plane beneath chassis
  const underglowGeo = track(new THREE.PlaneGeometry(2.35, 4.4));
  const underglowMat = track(
    new THREE.MeshBasicMaterial({
      map: contactShadowMap,
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const underglowMesh = new THREE.Mesh(underglowGeo, underglowMat);
  underglowMesh.rotation.x = -Math.PI / 2;
  underglowMesh.position.y = 0.025;
  root.add(underglowMesh);

  // Materials
  const bodyMat = track(
    new THREE.MeshPhysicalMaterial({
      color: PAINT_PRESETS[initialCustom.paint].hex,
      metalness: PAINT_PRESETS[initialCustom.paint].metalness,
      roughness: PAINT_PRESETS[initialCustom.paint].roughness,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
    }),
  );

  const carbonMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x161920,
      roughness: 0.58,
      metalness: 0.22,
    }),
  );

  const glassMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0x101926,
      roughness: 0.08,
      metalness: 0.25,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
    }),
  );

  const chromeMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xdce3ec,
      metalness: 0.92,
      roughness: 0.16,
    }),
  );

  const headlightMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xe0f2fe,
      emissiveIntensity: 2.2,
      roughness: 0.15,
    }),
  );

  const brakeLightMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x991b1b,
      emissive: 0xef4444,
      emissiveIntensity: 1.2,
      roughness: 0.2,
    }),
  );

  const reverseLightMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      emissive: 0xffffff,
      emissiveIntensity: 0,
      roughness: 0.2,
    }),
  );

  // 1. Primary Silhouette: Sculpted Beveled Sports Coupe Body (ExtrudeGeometry)
  // Shape in (xLength, yHeight): x = -2.02 (rear) -> +2.02 (front)
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-1.98, 0.26);
  bodyShape.lineTo(1.94, 0.24);
  bodyShape.lineTo(2.04, 0.42);
  bodyShape.lineTo(1.98, 0.64);
  bodyShape.lineTo(1.22, 0.80);
  bodyShape.lineTo(0.66, 0.86);
  bodyShape.lineTo(-1.26, 0.88);
  bodyShape.lineTo(-1.96, 0.84);
  bodyShape.lineTo(-2.03, 0.56);
  bodyShape.lineTo(-1.98, 0.26);

  const bodyGeo = track(
    new THREE.ExtrudeGeometry(bodyShape, {
      depth: 1.66,
      bevelEnabled: true,
      bevelThickness: 0.11,
      bevelSize: 0.08,
      bevelSegments: 3,
      steps: 1,
    }),
  );
  bodyGeo.translate(0, 0, -0.83);
  bodyGeo.rotateY(-Math.PI / 2);

  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  chassisGroup.add(bodyMesh);

  // 2. Secondary Read: Sculpted Aerodynamic Cabin Canopy (ExtrudeGeometry)
  const cabinShape = new THREE.Shape();
  cabinShape.moveTo(-1.22, 0.84);
  cabinShape.lineTo(0.68, 0.84);
  cabinShape.lineTo(0.24, 1.24);
  cabinShape.lineTo(-0.74, 1.25);
  cabinShape.lineTo(-1.22, 0.84);

  const cabinGeo = track(
    new THREE.ExtrudeGeometry(cabinShape, {
      depth: 1.28,
      bevelEnabled: true,
      bevelThickness: 0.09,
      bevelSize: 0.06,
      bevelSegments: 3,
    }),
  );
  cabinGeo.translate(0, 0, -0.64);
  cabinGeo.rotateY(-Math.PI / 2);

  const cabinMesh = new THREE.Mesh(cabinGeo, glassMat);
  cabinMesh.castShadow = true;
  chassisGroup.add(cabinMesh);

  // Roof painted cap panel for crisp two-tone contrast
  const roofCapGeo = track(new THREE.BoxGeometry(1.16, 0.05, 0.86));
  const roofCap = new THREE.Mesh(roofCapGeo, bodyMat);
  roofCap.position.set(0, 1.29, -0.25);
  roofCap.castShadow = true;
  chassisGroup.add(roofCap);

  // Standard GT Trim & Lights Group (used by sport_gt & drift_pro)
  const standardTrimGroup = new THREE.Group();
  chassisGroup.add(standardTrimGroup);

  // 3. Carbon Front Splitter, Side Skirts & Rear Diffuser
  const splitterGeo = track(new THREE.BoxGeometry(1.86, 0.07, 0.42));
  const splitter = new THREE.Mesh(splitterGeo, carbonMat);
  splitter.position.set(0, 0.22, 1.94);
  standardTrimGroup.add(splitter);

  const skirtGeo = track(new THREE.BoxGeometry(1.86, 0.09, 2.25));
  const skirt = new THREE.Mesh(skirtGeo, carbonMat);
  skirt.position.set(0, 0.22, 0.02);
  standardTrimGroup.add(skirt);

  const diffuserGeo = track(new THREE.BoxGeometry(1.76, 0.14, 0.24));
  const diffuser = new THREE.Mesh(diffuserGeo, carbonMat);
  diffuser.position.set(0, 0.27, -1.96);
  standardTrimGroup.add(diffuser);

  // Front grille
  const grilleGeo = track(new THREE.BoxGeometry(1.1, 0.2, 0.08));
  const grille = new THREE.Mesh(grilleGeo, carbonMat);
  grille.position.set(0, 0.41, 2.09);
  standardTrimGroup.add(grille);

  // 4. Headlights & Volumetric Forward LED Beam Cones + Rear Taillight Bar + Reverse Lamps
  const hlGeo = track(new THREE.BoxGeometry(0.36, 0.11, 0.12));
  const beamConeGeo = track(new THREE.ConeGeometry(1.35, 6.8, 16, 1, true));
  beamConeGeo.translate(0, -3.4, 0);
  beamConeGeo.rotateX(-Math.PI / 2);
  const beamConeMat = track(
    new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.085,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  const headlightBeamGroup = new THREE.Group();
  chassisGroup.add(headlightBeamGroup);

  [-0.64, 0.64].forEach((x) => {
    const hl = new THREE.Mesh(hlGeo, headlightMat);
    hl.position.set(x, 0.56, 2.04);
    hl.rotation.y = x > 0 ? -0.14 : 0.14;
    standardTrimGroup.add(hl);

    const beam = new THREE.Mesh(beamConeGeo, beamConeMat);
    beam.position.set(x, 0.52, 2.08);
    beam.rotation.set(0.05, x > 0 ? -0.04 : 0.04, 0);
    headlightBeamGroup.add(beam);
  });

  const tlBarGeo = track(new THREE.BoxGeometry(1.58, 0.09, 0.08));
  const tlBar = new THREE.Mesh(tlBarGeo, brakeLightMat);
  tlBar.position.set(0, 0.72, -2.07);
  standardTrimGroup.add(tlBar);

  const revGeo = track(new THREE.BoxGeometry(0.24, 0.06, 0.09));
  [-0.48, 0.48].forEach((x) => {
    const rev = new THREE.Mesh(revGeo, reverseLightMat);
    rev.position.set(x, 0.61, -2.07);
    standardTrimGroup.add(rev);
  });

  // 5. Side Wing Mirrors & Exhaust Tips
  const mirrorGeo = track(new THREE.BoxGeometry(0.22, 0.09, 0.14));
  const exteriorMirrors: THREE.Mesh[] = [];
  [-0.86, 0.86].forEach((x) => {
    const mirror = new THREE.Mesh(mirrorGeo, bodyMat);
    mirror.position.set(x, 0.92, 0.52);
    chassisGroup.add(mirror);
    exteriorMirrors.push(mirror);
  });

  const exhaustGeo = track(new THREE.CylinderGeometry(0.065, 0.065, 0.22, 14));
  exhaustGeo.rotateX(Math.PI / 2);
  [-0.45, 0.45].forEach((x) => {
    const pipe = new THREE.Mesh(exhaustGeo, chromeMat);
    pipe.position.set(x, 0.25, -2.07);
    standardTrimGroup.add(pipe);
  });

  // 5B. DRIFT PRO Widebody Kit Group (flares, canards, hood scoop, ducktail & angled shotgun pipes)
  const driftKitGroup = new THREE.Group();
  chassisGroup.add(driftKitGroup);

  const fenderFlareGeo = track(new THREE.BoxGeometry(0.14, 0.24, 0.86));
  [
    { x: -0.96, z: 1.32 },
    { x: 0.96, z: 1.32 },
    { x: -0.98, z: -1.32 },
    { x: 0.98, z: -1.32 },
  ].forEach((pos) => {
    const flare = new THREE.Mesh(fenderFlareGeo, carbonMat);
    flare.position.set(pos.x, 0.48, pos.z);
    flare.castShadow = true;
    driftKitGroup.add(flare);
  });

  // Extended track front splitter + corner dive-plane canards
  const driftLip = new THREE.Mesh(
    track(new THREE.BoxGeometry(2.04, 0.06, 0.54)),
    carbonMat,
  );
  driftLip.position.set(0, 0.19, 2.02);
  driftKitGroup.add(driftLip);

  const canardGeo = track(new THREE.BoxGeometry(0.14, 0.04, 0.3));
  [-0.95, 0.95].forEach((x) => {
    const canard = new THREE.Mesh(canardGeo, bodyMat);
    canard.position.set(x, 0.34, 1.98);
    canard.rotation.z = x > 0 ? 0.24 : -0.24;
    driftKitGroup.add(canard);
  });

  // Twin side hood extraction louvers flanking center stripes cleanly
  const hoodVentGeo = track(new THREE.BoxGeometry(0.24, 0.04, 0.4));
  [-0.46, 0.46].forEach((x) => {
    const hoodVent = new THREE.Mesh(hoodVentGeo, carbonMat);
    hoodVent.position.set(x, 0.85, 1.24);
    hoodVent.rotation.x = 0.16;
    driftKitGroup.add(hoodVent);
  });

  // Extended rear side skirts & ducktail drift blade
  [-0.96, 0.96].forEach((x) => {
    const aeroSkirt = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.12, 0.08, 2.0)),
      carbonMat,
    );
    aeroSkirt.position.set(x, 0.21, 0);
    driftKitGroup.add(aeroSkirt);
  });

  const ducktail = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.66, 0.14, 0.22)),
    bodyMat,
  );
  ducktail.position.set(0, 0.92, -1.96);
  ducktail.rotation.x = -0.42;
  driftKitGroup.add(ducktail);

  // Twin angled shotgun exhaust tips
  const shotgunGeo = track(new THREE.CylinderGeometry(0.055, 0.055, 0.38, 12));
  shotgunGeo.rotateX(Math.PI / 2 - 0.14);
  [-0.56, -0.42, 0.42, 0.56].forEach((x) => {
    const tip = new THREE.Mesh(shotgunGeo, chromeMat);
    tip.position.set(x, 0.27, -2.14);
    tip.rotation.y = x > 0 ? 0.08 : -0.08;
    driftKitGroup.add(tip);
  });

  // 5C. TESLA HOVER ROADSTER Body + Under-Chassis Rocket Thruster Pods (NOT an airplane!)
  const hoverCarGroup = new THREE.Group();
  chassisGroup.add(hoverCarGroup);

  const hoverBodyShape = new THREE.Shape();
  hoverBodyShape.moveTo(-2.0, 0.24);
  hoverBodyShape.lineTo(1.96, 0.22);
  hoverBodyShape.lineTo(2.14, 0.38);
  hoverBodyShape.lineTo(1.92, 0.58);
  hoverBodyShape.lineTo(1.14, 0.74);
  hoverBodyShape.lineTo(0.44, 0.80);
  hoverBodyShape.lineTo(-1.12, 0.84);
  hoverBodyShape.lineTo(-1.94, 0.88);
  hoverBodyShape.lineTo(-2.08, 0.62);
  hoverBodyShape.lineTo(-2.0, 0.24);

  const hoverBodyGeo = track(
    new THREE.ExtrudeGeometry(hoverBodyShape, {
      depth: 1.72,
      bevelEnabled: true,
      bevelThickness: 0.12,
      bevelSize: 0.09,
      bevelSegments: 4,
      steps: 1,
    }),
  );
  hoverBodyGeo.translate(0, 0, -0.86);
  hoverBodyGeo.rotateY(-Math.PI / 2);

  const hoverBodyMesh = new THREE.Mesh(hoverBodyGeo, bodyMat);
  hoverBodyMesh.castShadow = true;
  hoverBodyMesh.receiveShadow = true;
  hoverCarGroup.add(hoverBodyMesh);

  // Teardrop panoramic glass canopy (Roadster / Cyber silhouette)
  const hoverCabinShape = new THREE.Shape();
  hoverCabinShape.moveTo(-1.34, 0.80);
  hoverCabinShape.lineTo(0.76, 0.76);
  hoverCabinShape.lineTo(0.18, 1.18);
  hoverCabinShape.lineTo(-0.76, 1.19);
  hoverCabinShape.lineTo(-1.34, 0.80);

  const hoverCabinGeo = track(
    new THREE.ExtrudeGeometry(hoverCabinShape, {
      depth: 1.32,
      bevelEnabled: true,
      bevelThickness: 0.09,
      bevelSize: 0.06,
      bevelSegments: 3,
    }),
  );
  hoverCabinGeo.translate(0, 0, -0.66);
  hoverCabinGeo.rotateY(-Math.PI / 2);

  const hoverCabinMesh = new THREE.Mesh(hoverCabinGeo, glassMat);
  hoverCabinMesh.castShadow = true;
  hoverCarGroup.add(hoverCabinMesh);

  // Underbody carbon battery/thruster floor tray
  const hoverTray = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.88, 0.08, 3.88)),
    carbonMat,
  );
  hoverTray.position.set(0, 0.19, 0.0);
  hoverCarGroup.add(hoverTray);

  // Razor-thin Tesla/Cyber full-width front LED light bar (EV zero-grille face)
  const evLedMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      emissive: 0x38bdf8,
      emissiveIntensity: 2.6,
      roughness: 0.1,
    }),
  );
  const frontLightBar = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.66, 0.055, 0.09)),
    evLedMat,
  );
  frontLightBar.position.set(0, 0.48, 2.13);
  hoverCarGroup.add(frontLightBar);

  // Full-width crimson rear Tesla light blade + reverse LED strip
  const rearLightBlade = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.74, 0.075, 0.09)),
    brakeLightMat,
  );
  rearLightBlade.position.set(0, 0.74, -2.11);
  hoverCarGroup.add(rearLightBlade);

  const evReverseStrip = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.66, 0.045, 0.08)),
    reverseLightMat,
  );
  evReverseStrip.position.set(0, 0.62, -2.11);
  hoverCarGroup.add(evReverseStrip);

  // Sculpted side air curtain trim
  [-0.95, 0.95].forEach((x) => {
    const blade = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.05, 0.12, 2.1)),
      carbonMat,
    );
    blade.position.set(x, 0.4, -0.05);
    hoverCarGroup.add(blade);
  });

  // 4 Under-Chassis SpaceX/Tesla Downward Rocket Thruster Pods (clean plasma glow cones, NO smoke!)
  const thrusterPodMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.85,
      roughness: 0.28,
    }),
  );
  const thrusterGlowMat = track(
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const thrusterCoreMat = track(
    new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  const podRingGeo = track(new THREE.CylinderGeometry(0.18, 0.23, 0.12, 18));
  const plasmaConeGeo = track(new THREE.ConeGeometry(0.21, 0.82, 16, 1, true));
  plasmaConeGeo.translate(0, -0.41, 0);
  const plasmaCoreGeo = track(new THREE.ConeGeometry(0.1, 0.56, 12));
  plasmaCoreGeo.translate(0, -0.28, 0);

  const thrusterCones: THREE.Group[] = [];
  [
    { x: -0.62, z: 1.18 },
    { x: 0.62, z: 1.18 },
    { x: -0.64, z: -1.18 },
    { x: 0.64, z: -1.18 },
  ].forEach((tp) => {
    const pod = new THREE.Mesh(podRingGeo, thrusterPodMat);
    pod.position.set(tp.x, 0.14, tp.z);
    hoverCarGroup.add(pod);

    const flameGroup = new THREE.Group();
    flameGroup.position.set(tp.x, 0.1, tp.z);
    const outerCone = new THREE.Mesh(plasmaConeGeo, thrusterGlowMat);
    const innerCore = new THREE.Mesh(plasmaCoreGeo, thrusterCoreMat);
    flameGroup.add(outerCone, innerCore);
    flameGroup.visible = false;
    hoverCarGroup.add(flameGroup);
    thrusterCones.push(flameGroup);
  });

  // 5D. APEX F1 HIPER — Formula / Le Mans Hypercar with Exposed Wishbones, Halo & Active DRS Wing
  const apexCarGroup = new THREE.Group();
  chassisGroup.add(apexCarGroup);

  // Sculpted Formula needle-nose central monocoque tub
  const apexHullShape = new THREE.Shape();
  apexHullShape.moveTo(-2.02, 0.24);
  apexHullShape.lineTo(1.65, 0.22);
  apexHullShape.lineTo(2.16, 0.30);
  apexHullShape.lineTo(2.14, 0.44);
  apexHullShape.lineTo(1.22, 0.68);
  apexHullShape.lineTo(0.45, 0.78);
  apexHullShape.lineTo(-0.55, 0.88);
  apexHullShape.lineTo(-1.82, 0.76);
  apexHullShape.lineTo(-2.04, 0.50);
  apexHullShape.lineTo(-2.02, 0.24);

  const apexHullGeo = track(
    new THREE.ExtrudeGeometry(apexHullShape, {
      depth: 0.78,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.06,
      bevelSegments: 3,
    }),
  );
  apexHullGeo.translate(0, 0, -0.39);
  apexHullGeo.rotateY(-Math.PI / 2);
  const apexHullMesh = new THREE.Mesh(apexHullGeo, bodyMat);
  apexHullMesh.castShadow = true;
  apexHullMesh.receiveShadow = true;
  apexCarGroup.add(apexHullMesh);

  // Tapered Aero Sidepods + Carbon Intake Ducts
  [-0.58, 0.58].forEach((sx) => {
    const pod = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.46, 0.36, 1.85)),
      bodyMat,
    );
    pod.position.set(sx, 0.42, -0.22);
    pod.castShadow = true;
    apexCarGroup.add(pod);

    const intake = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.38, 0.26, 0.12)),
      carbonMat,
    );
    intake.position.set(sx, 0.43, 0.72);
    apexCarGroup.add(intake);

    const floorEdge = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.42, 0.05, 2.35)),
      carbonMat,
    );
    floorEdge.position.set(sx * 1.15, 0.19, -0.2);
    apexCarGroup.add(floorEdge);
  });

  // Low Fighter Canopy Glass + F1 Safety Halo Arch
  const apexCanopyShape = new THREE.Shape();
  apexCanopyShape.moveTo(-0.92, 0.78);
  apexCanopyShape.lineTo(0.48, 0.76);
  apexCanopyShape.lineTo(-0.08, 1.12);
  apexCanopyShape.lineTo(-0.68, 1.12);
  apexCanopyShape.lineTo(-0.92, 0.78);
  const apexCanopyGeo = track(
    new THREE.ExtrudeGeometry(apexCanopyShape, {
      depth: 0.62,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.04,
      bevelSegments: 2,
    }),
  );
  apexCanopyGeo.translate(0, 0, -0.31);
  apexCanopyGeo.rotateY(-Math.PI / 2);
  const apexCanopyMesh = new THREE.Mesh(apexCanopyGeo, glassMat);
  apexCarGroup.add(apexCanopyMesh);

  const haloBar = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.08, 0.08, 0.68)),
    carbonMat,
  );
  haloBar.position.set(0, 1.06, 0.28);
  haloBar.rotation.x = 0.24;
  apexCarGroup.add(haloBar);

  // Dorsal Shark Fin Airbox Spine
  const sharkFin = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.06, 0.42, 1.15)),
    bodyMat,
  );
  sharkFin.position.set(0, 1.06, -1.08);
  sharkFin.castShadow = true;
  apexCarGroup.add(sharkFin);

  // Multi-Tier Formula Front Aero Wing + Endplates + Nose LED Blades
  const f1FrontMain = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.96, 0.05, 0.44)),
    carbonMat,
  );
  f1FrontMain.position.set(0, 0.2, 2.02);
  f1FrontMain.castShadow = true;
  apexCarGroup.add(f1FrontMain);

  const f1FrontFlap = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.84, 0.04, 0.22)),
    bodyMat,
  );
  f1FrontFlap.position.set(0, 0.27, 1.94);
  f1FrontFlap.rotation.x = 0.2;
  apexCarGroup.add(f1FrontFlap);

  [-0.98, 0.98].forEach((ex) => {
    const endPlate = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.05, 0.22, 0.52)),
      bodyMat,
    );
    endPlate.position.set(ex, 0.28, 2.0);
    apexCarGroup.add(endPlate);
  });

  [-0.28, 0.28].forEach((hx) => {
    const f1Headlight = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.18, 0.055, 0.14)),
      headlightMat,
    );
    f1Headlight.position.set(hx, 0.42, 1.92);
    apexCarGroup.add(f1Headlight);
  });

  // Exposed Carbon Double-Wishbone Suspension Arms linking tub to all 4 wheels
  const wishboneGeo = track(new THREE.BoxGeometry(0.56, 0.04, 0.1));
  [
    { x: -0.58, z: 1.32, y: 0.42 },
    { x: 0.58, z: 1.32, y: 0.42 },
    { x: -0.58, z: -1.32, y: 0.42 },
    { x: 0.58, z: -1.32, y: 0.42 },
  ].forEach((wb) => {
    const upper = new THREE.Mesh(wishboneGeo, carbonMat);
    upper.position.set(wb.x, wb.y, wb.z + 0.08);
    upper.rotation.y = wb.x > 0 ? -0.22 : 0.22;
    const lower = new THREE.Mesh(wishboneGeo, carbonMat);
    lower.position.set(wb.x, wb.y - 0.11, wb.z - 0.08);
    lower.rotation.y = wb.x > 0 ? 0.18 : -0.18;
    apexCarGroup.add(upper, lower);
  });

  // Active DRS Dual-Element Formula Rear Wing
  const f1RearLower = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.88, 0.05, 0.32)),
    carbonMat,
  );
  f1RearLower.position.set(0, 1.18, -1.94);
  f1RearLower.rotation.x = -0.14;
  f1RearLower.castShadow = true;
  apexCarGroup.add(f1RearLower);

  const drsFlapGroup = new THREE.Group();
  drsFlapGroup.position.set(0, 1.31, -1.98);
  const drsBlade = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.84, 0.045, 0.24)),
    bodyMat,
  );
  drsBlade.castShadow = true;
  drsFlapGroup.add(drsBlade);
  drsFlapGroup.rotation.x = 0.24;
  apexCarGroup.add(drsFlapGroup);

  [-0.36, 0.36].forEach((px) => {
    const swanPylon = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.06, 0.52, 0.22)),
      carbonMat,
    );
    swanPylon.position.set(px, 0.98, -1.88);
    apexCarGroup.add(swanPylon);
  });
  [-0.94, 0.94].forEach((ex) => {
    const rearPlate = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.05, 0.36, 0.44)),
      bodyMat,
    );
    rearPlate.position.set(ex, 1.24, -1.95);
    apexCarGroup.add(rearPlate);
  });

  // Rear F1 Rain/Brake LED + Twin Titanium Exhausts + Diffuser Strakes
  const f1RainLight = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.24, 0.14, 0.08)),
    brakeLightMat,
  );
  f1RainLight.position.set(0, 0.38, -2.08);
  apexCarGroup.add(f1RainLight);

  [-0.58, 0.58].forEach((tx) => {
    const tailLed = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.28, 0.06, 0.08)),
      brakeLightMat,
    );
    tailLed.position.set(tx, 0.66, -2.02);
    apexCarGroup.add(tailLed);
  });

  const f1ReverseLed = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.32, 0.05, 0.08)),
    reverseLightMat,
  );
  f1ReverseLed.position.set(0, 0.54, -2.06);
  apexCarGroup.add(f1ReverseLed);

  [-0.14, 0.14].forEach((ex) => {
    const f1Pipe = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.055, 0.055, 0.24, 12)),
      chromeMat,
    );
    f1Pipe.rotation.x = Math.PI / 2;
    f1Pipe.position.set(ex, 0.56, -2.02);
    apexCarGroup.add(f1Pipe);
  });

  // 6. Spoiler Group (None / Lip / GT Wing)
  const spoilerGroup = new THREE.Group();
  chassisGroup.add(spoilerGroup);

  const lipMesh = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.52, 0.07, 0.22)),
    carbonMat,
  );
  lipMesh.position.set(0, 0.94, -1.94);
  lipMesh.rotation.x = -0.15;
  lipMesh.castShadow = true;

  const gtWingGroup = new THREE.Group();
  const wingBlade = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.82, 0.06, 0.34)),
    carbonMat,
  );
  wingBlade.position.set(0, 1.24, -1.92);
  wingBlade.rotation.x = -0.1;
  wingBlade.castShadow = true;
  gtWingGroup.add(wingBlade);

  const strutGeo = track(new THREE.BoxGeometry(0.06, 0.34, 0.16));
  [-0.52, 0.52].forEach((x) => {
    const strut = new THREE.Mesh(strutGeo, chromeMat);
    strut.position.set(x, 1.07, -1.88);
    gtWingGroup.add(strut);
  });

  const endPlateGeo = track(new THREE.BoxGeometry(0.04, 0.18, 0.38));
  [-0.91, 0.91].forEach((x) => {
    const ep = new THREE.Mesh(endPlateGeo, bodyMat);
    ep.position.set(x, 1.24, -1.92);
    gtWingGroup.add(ep);
  });

  spoilerGroup.add(lipMesh, gtWingGroup);

  // 7. Decal Group (Dual Racing Stripes / Side Number)
  const decalMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.28,
      metalness: 0.1,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  const dualStripeGroup = new THREE.Group();
  [-0.18, 0.18].forEach((x) => {
    const hoodStripe = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.14, 0.025, 1.08)),
      decalMat,
    );
    hoodStripe.position.set(x, 0.855, 1.28);
    hoodStripe.rotation.x = 0.19;
    const roofStripe = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.14, 0.025, 0.88)),
      decalMat,
    );
    roofStripe.position.set(x, 1.33, -0.25);
  const trunkStripe = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.14, 0.025, 0.68)),
      decalMat,
    );
    trunkStripe.position.set(x, 0.96, -1.62);
    dualStripeGroup.add(hoodStripe, roofStripe, trunkStripe);
  });
  chassisGroup.add(dualStripeGroup);

  const hoverDualStripeGroup = new THREE.Group();
  [-0.18, 0.18].forEach((x) => {
    const hHood = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.14, 0.024, 1.04)),
      decalMat,
    );
    hHood.position.set(x, 0.78, 1.28);
    hHood.rotation.x = 0.2;
    const hRoof = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.14, 0.024, 0.78)),
      decalMat,
    );
    hRoof.position.set(x, 1.26, -0.3);
    const hDeck = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.14, 0.024, 0.62)),
      decalMat,
    );
    hDeck.position.set(x, 0.92, -1.58);
    hoverDualStripeGroup.add(hHood, hRoof, hDeck);
  });
  chassisGroup.add(hoverDualStripeGroup);

  const apexDualStripeGroup = new THREE.Group();
  [-0.11, 0.11].forEach((x) => {
    const aNose = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.09, 0.024, 1.35)),
      decalMat,
    );
    aNose.position.set(x, 0.54, 1.32);
    aNose.rotation.x = 0.22;
    const aSpine = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.09, 0.024, 0.9)),
      decalMat,
    );
    aSpine.position.set(x, 0.87, -1.35);
    apexDualStripeGroup.add(aNose, aSpine);
  });
  chassisGroup.add(apexDualStripeGroup);

  const sideNumTex = track(createSideNumberTexture());
  const sideNumMat = track(
    new THREE.MeshBasicMaterial({
      map: sideNumTex,
      transparent: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  const sideNumGeo = track(new THREE.PlaneGeometry(0.46, 0.46));
  const sideNumGroup = new THREE.Group();
  [-0.935, 0.935].forEach((x) => {
    const badge = new THREE.Mesh(sideNumGeo, sideNumMat);
    badge.position.set(x, 0.57, -0.05);
    badge.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2;
    sideNumGroup.add(badge);
  });
  chassisGroup.add(sideNumGroup);

  // 8. 4 Articulated Wheel Assemblies
  const frontSteerPivots: THREE.Group[] = [];
  const rearSteerPivots: THREE.Group[] = [];
  const wheelSpinGroups: THREE.Group[] = [];
  const wheelTiltGroups: Array<{ group: THREE.Group; sideSign: number; isRear: boolean }> = [];
  const rimMeshesByWheel: Array<Record<RimStyleId, THREE.Group>> = [];

  const tireGeo = track(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 22));
  tireGeo.rotateZ(Math.PI / 2);
  const tireMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x15181f,
      roughness: 0.88,
      metalness: 0.05,
    }),
  );

  const rotorGeo = track(new THREE.CylinderGeometry(0.23, 0.23, 0.27, 16));
  rotorGeo.rotateZ(Math.PI / 2);
  const rotorMat = track(
    new THREE.MeshStandardMaterial({ color: 0x262d3b, metalness: 0.65, roughness: 0.45 }),
  );
  const caliperGeo = track(new THREE.BoxGeometry(0.08, 0.13, 0.1));
  const caliperMat = track(
    new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.35, metalness: 0.3 }),
  );

  const alloyMat = track(
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.16 }),
  );
  const goldMat = track(
    new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.9, roughness: 0.2 }),
  );
  const darkRimMat = track(
    new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.82, roughness: 0.26 }),
  );

  const wheelPositions: Array<{ x: number; z: number; isFront: boolean }> = [
    { x: -0.88, z: 1.32, isFront: true },
    { x: 0.88, z: 1.32, isFront: true },
    { x: -0.88, z: -1.32, isFront: false },
    { x: 0.88, z: -1.32, isFront: false },
  ];

  const spokeGeo = track(new THREE.BoxGeometry(0.035, 0.44, 0.055));
  const hubGeo = track(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 12));
  hubGeo.rotateZ(Math.PI / 2);
  const lipRingGeo = track(new THREE.TorusGeometry(0.24, 0.03, 8, 22));
  lipRingGeo.rotateY(Math.PI / 2);

  wheelPositions.forEach((wp) => {
    const steerPivot = new THREE.Group();
    steerPivot.position.set(wp.x, 0.36, wp.z);
    carLiftGroup.add(steerPivot);
    if (wp.isFront) frontSteerPivots.push(steerPivot);
    else rearSteerPivots.push(steerPivot);

    const sideSign = wp.x > 0 ? 1 : -1;
    const tiltGroup = new THREE.Group();
    steerPivot.add(tiltGroup);
    wheelTiltGroups.push({ group: tiltGroup, sideSign, isRear: !wp.isFront });

    const spinGroup = new THREE.Group();
    tiltGroup.add(spinGroup);
    wheelSpinGroups.push(spinGroup);

    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    spinGroup.add(tire);

    const rotor = new THREE.Mesh(rotorGeo, rotorMat);
    spinGroup.add(rotor);

    const caliper = new THREE.Mesh(caliperGeo, caliperMat);
    caliper.position.set(sideSign * 0.11, 0.12, -0.09);
    tiltGroup.add(caliper);

    const rimOffsetX = sideSign * 0.145;

    const buildRim = (style: RimStyleId): THREE.Group => {
      const g = new THREE.Group();
      const mat =
        style === 'forgedGold' ? goldMat : style === 'deepDish' ? darkRimMat : alloyMat;
      const spokeCount = style === 'turbine' ? 8 : style === 'sport5' ? 5 : 6;
      for (let i = 0; i < spokeCount; i++) {
        const sp = new THREE.Mesh(spokeGeo, mat);
        sp.position.x = rimOffsetX;
        sp.rotation.x = (i / spokeCount) * Math.PI;
        if (style === 'turbine') sp.rotation.z = 0.18 * sideSign;
        g.add(sp);
      }
      const hub = new THREE.Mesh(hubGeo, mat);
      hub.position.x = rimOffsetX + sideSign * 0.01;
      g.add(hub);

      const outerLip = new THREE.Mesh(
        lipRingGeo,
        style === 'deepDish' ? alloyMat : mat,
      );
      outerLip.position.x = rimOffsetX + sideSign * 0.012;
      g.add(outerLip);

      spinGroup.add(g);
      return g;
    };

    rimMeshesByWheel.push({
      sport5: buildRim('sport5'),
      turbine: buildRim('turbine'),
      forgedGold: buildRim('forgedGold'),
      deepDish: buildRim('deepDish'),
    });
  });

  // 9. Interior Cockpit Assembly (mounted inside chassisGroup for matching pitch)
  const cockpit = buildCockpitInterior({
    maxAnisotropy,
    bodyMat,
    carbonMat,
    chromeMat,
    decalMat,
  });
  chassisGroup.add(cockpit.group);
  disposables.push(cockpit);

  let activeCustom = initialCustom;
  let activeModel: VehicleModelId = resolveVehicleModel(initialCustom.model);
  let cockpitViewActive = false;

  const syncExteriorVsCockpitVisibility = () => {
    const showExteriorCabin = !cockpitViewActive;
    const isHoverModel = activeModel === 'hover_thruster';
    const isDriftModel = activeModel === 'drift_pro';
    const isApexModel = activeModel === 'apex_hyper';
    const isStandardCoupe = !isHoverModel && !isApexModel;

    bodyMesh.visible = showExteriorCabin && isStandardCoupe;
    cabinMesh.visible = showExteriorCabin && isStandardCoupe;
    roofCap.visible = showExteriorCabin && isStandardCoupe;
    standardTrimGroup.visible = showExteriorCabin && isStandardCoupe;
    driftKitGroup.visible = showExteriorCabin && isDriftModel;

    hoverBodyMesh.visible = showExteriorCabin && isHoverModel;
    hoverCabinMesh.visible = showExteriorCabin && isHoverModel;
    hoverCarGroup.visible = isHoverModel;

    apexCarGroup.visible = showExteriorCabin && isApexModel;

    exteriorMirrors.forEach((m) => {
      m.visible = showExteriorCabin && isStandardCoupe;
    });
    dualStripeGroup.visible =
      showExteriorCabin && isStandardCoupe && activeCustom.decal === 'dualStripe';
    hoverDualStripeGroup.visible =
      showExteriorCabin && isHoverModel && activeCustom.decal === 'dualStripe';
    apexDualStripeGroup.visible =
      showExteriorCabin && isApexModel && activeCustom.decal === 'dualStripe';
    sideNumGroup.visible =
      showExteriorCabin && isStandardCoupe && activeCustom.decal === 'sideNumber';
    cockpit.setVisible(cockpitViewActive);
  };

  const applyCustomization = (custom: VehicleCustomization) => {
    activeCustom = custom;
    activeModel = resolveVehicleModel(custom.model);
    const p = PAINT_PRESETS[custom.paint];
    bodyMat.color.setHex(p.hex);
    bodyMat.metalness = p.metalness;
    bodyMat.roughness = p.roughness;
    decalMat.color.setHex(custom.paint === 'alpine' ? 0x111827 : 0xf8fafc);

    lipMesh.visible =
      custom.spoiler === 'lip' &&
      activeModel !== 'hover_thruster' &&
      activeModel !== 'apex_hyper';
    gtWingGroup.visible = custom.spoiler === 'gtWing' && activeModel !== 'apex_hyper';

    cockpit.setDecalStyle(custom.decal);
    syncExteriorVsCockpitVisibility();

    const glow = UNDERGLOW_PRESETS[custom.underglow];
    underglowMesh.visible = custom.underglow !== 'off' || activeModel === 'hover_thruster';
    underglowMat.color.setHex(
      custom.underglow === 'off' && activeModel === 'hover_thruster' ? 0x38bdf8 : glow.hex,
    );

    rimMeshesByWheel.forEach((rimMap) => {
      (Object.keys(rimMap) as RimStyleId[]).forEach((key) => {
        rimMap[key].visible = key === custom.rim;
      });
    });

    // Apply negative drift camber on rear wheels for Drift Pro & reset hover tuck
    wheelTiltGroups.forEach((wt) => {
      wt.group.position.set(0, 0, 0);
      wt.group.rotation.z =
        activeModel === 'drift_pro' && wt.isRear ? wt.sideSign * 0.085 : 0;
    });
  };

  applyCustomization(initialCustom);

  const setLightsState = (braking: boolean, reversing: boolean, damageFlash: number) => {
    brakeLightMat.emissiveIntensity = braking ? 3.5 : 1.1;
    reverseLightMat.emissiveIntensity = reversing ? 2.8 : 0.0;
    if (damageFlash > 0.01) {
      bodyMat.emissive.setHex(0xef4444);
      bodyMat.emissiveIntensity = damageFlash * 0.55;
    } else {
      bodyMat.emissiveIntensity = 0;
    }
  };

  const setHeadlightsEnabled = (enabled: boolean) => {
    headlightBeamGroup.visible = enabled;
    headlightMat.emissiveIntensity = enabled ? 2.6 : 0.4;
    evLedMat.emissiveIntensity = enabled ? 2.8 : 0.55;
  };

  const setWheelKinematics = (steerAngle: number, spinAngle: number, speed: number) => {
    for (let i = 0; i < frontSteerPivots.length; i++) {
      frontSteerPivots[i].rotation.y = steerAngle;
    }
    const rearSteer = activeModel === 'apex_hyper' ? -steerAngle * 0.34 : 0;
    for (let i = 0; i < rearSteerPivots.length; i++) {
      rearSteerPivots[i].rotation.y = rearSteer;
    }
    for (let i = 0; i < wheelSpinGroups.length; i++) {
      wheelSpinGroups[i].rotation.x = spinAngle;
    }
    // Subtle suspension pitch on acceleration/braking
    const targetPitch = -Math.max(-0.035, Math.min(0.035, speed * 0.0022));
    chassisGroup.rotation.x += (targetPitch - chassisGroup.rotation.x) * 0.15;
  };

  const setAeroActive = (active: boolean) => {
    if (activeModel !== 'apex_hyper') return;
    const targetAngle = active ? -0.36 : 0.24;
    drsFlapGroup.rotation.x += (targetAngle - drsFlapGroup.rotation.x) * 0.22;
  };

  const setHoverKinematics = (hoverY: number, hoverActive: boolean, timeSec: number) => {
    carLiftGroup.position.y = hoverY;

    // Grounding shadow softens slightly with altitude so height above walls reads cleanly
    const altNorm = Math.min(1, hoverY / 2.25);
    contactShadowMat.opacity = 0.55 - altNorm * 0.25;
    contactShadowMesh.scale.setScalar(1 + altNorm * 0.22);

    const isHoverModel = activeModel === 'hover_thruster';
    if (!isHoverModel) {
      for (let i = 0; i < thrusterCones.length; i++) thrusterCones[i].visible = false;
      return;
    }

    // Smoothly fold wheels flat beneath chassis tray when airborne without clipping hood
    const wheelFold = Math.min(1, hoverY / 0.85);
    for (let i = 0; i < wheelTiltGroups.length; i++) {
      const wt = wheelTiltGroups[i];
      wt.group.rotation.z = -wt.sideSign * wheelFold * 1.32;
      wt.group.position.set(
        -wt.sideSign * wheelFold * 0.14,
        -wheelFold * 0.06,
        0,
      );
    }

    // Under-chassis cold-gas rocket thruster cones (no smoke!)
    const showThrusters = hoverActive || hoverY > 0.06;
    const pulse = 0.9 + Math.sin(timeSec * 36) * 0.12;
    const thrustScaleY = (hoverActive ? 1.15 : 0.58) * pulse;
    const thrustScaleXZ = hoverActive ? 1.0 : 0.72;
    for (let i = 0; i < thrusterCones.length; i++) {
      const cone = thrusterCones[i];
      cone.visible = showThrusters;
      if (showThrusters) {
        cone.scale.set(thrustScaleXZ, thrustScaleY, thrustScaleXZ);
      }
    }
    thrusterGlowMat.opacity = hoverActive ? 0.88 : 0.5;
  };

  const setCockpitViewActive = (active: boolean) => {
    if (cockpitViewActive === active) return;
    cockpitViewActive = active;
    syncExteriorVsCockpitVisibility();
  };

  const setCockpitTelemetry = (input: CockpitTelemetryInput, dt: number) => {
    cockpit.update(input, dt);
  };

  return {
    root,
    chassisGroup,
    frontSteerPivots,
    wheelSpinGroups,
    brakeLightMat,
    reverseLightMat,
    underglowMesh,
    underglowMat,
    bodyMat,
    applyCustomization,
    setLightsState,
    setHeadlightsEnabled,
    setWheelKinematics,
    setHoverKinematics,
    setAeroActive,
    setCockpitViewActive,
    setCockpitTelemetry,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
