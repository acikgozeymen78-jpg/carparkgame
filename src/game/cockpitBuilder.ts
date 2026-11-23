import * as THREE from 'three';
import type { DecalStyleId } from '../types/game';

export interface CockpitTelemetryInput {
  steerAngle: number; // radians (+ left, - right)
  speed: number; // m/s (forward positive, reverse negative)
  turboActive: boolean;
  throttle: boolean;
  brake: boolean;
  gear: 'P' | 'R' | 'N' | 'D';
}

export interface CockpitTelemetryAngles {
  steeringWheelZ: number; // rotation around local Z (turns top toward +X = left when steerAngle > 0)
  speedNeedleZ: number; // -2.35 (0 km/h) -> +2.35 (150 km/h)
  rpmNeedleZ: number; // -2.35 (idle) -> +2.35 (redline)
  rpmNorm: number; // 0..1
  shiftLedCount: number; // 0..7
  kmh: number;
}

const NEEDLE_MIN_RAD = -2.35;
const NEEDLE_SPAN_RAD = 4.7;
const STEER_WHEEL_RATIO = 6.2; // ~220 deg each side at MAX_STEER_RAD = 0.62

/**
 * Pure kinematics mapping from vehicle physics telemetry to interior steering wheel,
 * speedometer/tachometer needles, and LED shift-light strip.
 */
export function computeCockpitTelemetryAngles(
  input: CockpitTelemetryInput,
): CockpitTelemetryAngles {
  const kmh = Math.abs(input.speed) * 3.6;
  const speedRatio = Math.max(0, Math.min(1, kmh / 150));

  // Simulated 5-speed sporty gearbox sawtooth so tachometer needle sweeps dynamically
  let rpmNorm = 0.14;
  if (input.gear === 'P' || input.gear === 'N') {
    rpmNorm = input.throttle ? 0.42 : 0.14;
  } else if (input.gear === 'R') {
    rpmNorm = Math.min(0.82, 0.22 + (kmh / 36) * 0.58);
  } else {
    const band = 23;
    const gearIndex = Math.min(4, Math.floor(kmh / band));
    const inBand = (kmh - gearIndex * band) / band;
    const baseRpm = gearIndex === 0 ? 0.18 + inBand * 0.66 : 0.42 + inBand * 0.48;
    const loadBoost = input.turboActive ? 0.16 : input.throttle ? 0.08 : -0.06;
    rpmNorm = Math.max(0.15, Math.min(0.98, baseRpm + loadBoost));
  }

  return {
    // In car coords (+Z forward, +Y up, +X left): negative Z rotation sends top (0, +r) to +X (left)
    steeringWheelZ:
      input.steerAngle === 0 ? 0 : -input.steerAngle * STEER_WHEEL_RATIO,
    speedNeedleZ: NEEDLE_MIN_RAD + speedRatio * NEEDLE_SPAN_RAD,
    rpmNeedleZ: NEEDLE_MIN_RAD + rpmNorm * NEEDLE_SPAN_RAD,
    rpmNorm,
    shiftLedCount: Math.max(0, Math.min(7, Math.round(rpmNorm * 7))),
    kmh: Math.round(kmh),
  };
}

function createPerforatedLeatherTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#181c24';
  ctx.fillRect(0, 0, 256, 256);

  for (let y = 4; y < 256; y += 8) {
    for (let x = 4; x < 256; x += 8) {
      const jitter = ((x * 17 + y * 31) % 7) - 3;
      ctx.fillStyle = 'rgba(7, 9, 13, 0.72)';
      ctx.beginPath();
      ctx.arc(x + (y % 16 === 4 ? 0 : 4), y, 1.3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgb(${26 + jitter}, ${30 + jitter}, ${38 + jitter})`;
      ctx.fillRect(x, y + 2, 2, 1);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createCarbonWeaveTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0f131b';
  ctx.fillRect(0, 0, 128, 128);

  const cell = 8;
  for (let y = 0; y < 128; y += cell) {
    for (let x = 0; x < 128; x += cell) {
      const diag = (x / cell + y / cell) % 2 === 0;
      ctx.fillStyle = diag ? '#222b3d' : '#121722';
      ctx.fillRect(x, y, cell - 1, cell - 1);
      ctx.fillStyle = diag ? 'rgba(148, 163, 184, 0.14)' : 'rgba(15, 23, 42, 0.2)';
      ctx.fillRect(x + 1, y + 1, cell - 3, 2);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 4);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createClusterDialTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 420;
  const ctx = canvas.getContext('2d')!;

  const bgGrad = ctx.createLinearGradient(0, 0, 0, 420);
  bgGrad.addColorStop(0, '#070b14');
  bgGrad.addColorStop(1, '#0b1220');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1024, 420);

  const drawGauge = (
    cx: number,
    cy: number,
    radius: number,
    steps: number,
    labels: string[],
    unit: string,
    accent: string,
    redlineStartFrac: number | null,
  ) => {
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 8, 0, Math.PI * 2);
    ctx.stroke();

    const radGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, radius);
    radGrad.addColorStop(0, 'rgba(30, 41, 59, 0.42)');
    radGrad.addColorStop(1, 'rgba(6, 10, 18, 0.94)');
    ctx.fillStyle = radGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
    ctx.fill();

    const startAng = Math.PI * 0.75;
    const totalSpan = Math.PI * 1.5;

    ctx.strokeStyle = accent;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(
      cx,
      cy,
      radius - 8,
      startAng,
      startAng + totalSpan * (redlineStartFrac ?? 1),
    );
    ctx.stroke();

    if (redlineStartFrac !== null) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(
        cx,
        cy,
        radius - 8,
        startAng + totalSpan * redlineStartFrac,
        startAng + totalSpan,
      );
      ctx.stroke();
    }

    const subTicks = steps * 4;
    for (let i = 0; i <= subTicks; i++) {
      const frac = i / subTicks;
      const ang = startAng + frac * totalSpan;
      const isMajor = i % 4 === 0;
      const inRed = redlineStartFrac !== null && frac >= redlineStartFrac;

      const rOuter = radius - 16;
      const rInner = isMajor ? radius - 38 : radius - 26;
      ctx.strokeStyle = inRed ? '#f43f5e' : isMajor ? '#f8fafc' : '#64748b';
      ctx.lineWidth = isMajor ? 4.5 : 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * rInner, cy + Math.sin(ang) * rInner);
      ctx.lineTo(cx + Math.cos(ang) * rOuter, cy + Math.sin(ang) * rOuter);
      ctx.stroke();

      if (isMajor) {
        const labelIdx = i / 4;
        const labelText = labels[labelIdx] ?? '';
        const rText = radius - 60;
        ctx.fillStyle = inRed ? '#fb7185' : '#f1f5f9';
        ctx.font = 'bold 28px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, cx + Math.cos(ang) * rText, cy + Math.sin(ang) * rText);
      }
    }

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 18px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(unit, cx, cy + 56);
  };

  drawGauge(
    238,
    210,
    172,
    8,
    ['0', '1', '2', '3', '4', '5', '6', '7', '8'],
    'x1000 DEVİR',
    '#22d3ee',
    0.78,
  );

  drawGauge(
    786,
    210,
    172,
    6,
    ['0', '25', '50', '75', '100', '125', '150'],
    'KM / S',
    '#34d399',
    null,
  );

  ctx.fillStyle = '#111b2e';
  ctx.strokeStyle = '#1e3a5f';
  ctx.lineWidth = 3;
  ctx.fillRect(436, 108, 152, 200);
  ctx.strokeRect(436, 108, 152, 200);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 17px "Space Grotesk", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('GT KOKPİT', 512, 146);

  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 26px "JetBrains Mono", monospace';
  ctx.fillText('SPOR', 512, 194);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px "JetBrains Mono", monospace';
  ctx.fillText('ABS  ESP  NOS', 512, 236);

  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(462, 262, 100, 10);
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 13px "Space Grotesk", sans-serif';
  ctx.fillText('AKTİF SÜRÜŞ', 512, 290);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createInfotainmentTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 300;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#09101d';
  ctx.fillRect(0, 0, 512, 300);

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 512; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 300);
    ctx.stroke();
  }
  for (let y = 0; y <= 300; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }

  ctx.fillStyle = '#132038';
  ctx.fillRect(0, 0, 512, 48);
  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 20px "Space Grotesk", sans-serif';
  ctx.fillText('LABİRENT TELEMETRİ', 20, 31);
  ctx.fillStyle = '#38bdf8';
  ctx.textAlign = 'right';
  ctx.font = 'bold 18px "JetBrains Mono", monospace';
  ctx.fillText('4X RADAR', 492, 31);

  ctx.textAlign = 'center';
  ctx.strokeStyle = '#34d399';
  ctx.lineWidth = 3;
  ctx.strokeRect(216, 112, 80, 128);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(222, 118, 68, 116);

  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 3;
  [18, 32, 46].forEach((offset) => {
    ctx.beginPath();
    ctx.arc(256, 110, offset + 24, Math.PI * 1.25, Math.PI * 1.75);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(256, 242, offset + 24, Math.PI * 0.25, Math.PI * 0.75);
    ctx.stroke();
  });

  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'bold 16px "Space Grotesk", sans-serif';
  ctx.fillText('PARK ASİSTANI AKTİF', 256, 282);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export interface CockpitHandle {
  group: THREE.Group;
  update: (input: CockpitTelemetryInput, dt: number) => void;
  setVisible: (visible: boolean) => void;
  setDecalStyle: (decal: DecalStyleId) => void;
  dispose: () => void;
}

export function buildCockpitInterior(params: {
  maxAnisotropy: number;
  bodyMat: THREE.MeshPhysicalMaterial;
  carbonMat: THREE.MeshStandardMaterial;
  chromeMat: THREE.MeshStandardMaterial;
  decalMat: THREE.MeshStandardMaterial;
}): CockpitHandle {
  const { maxAnisotropy, bodyMat, carbonMat, chromeMat, decalMat } = params;
  const group = new THREE.Group();
  group.visible = false;

  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  // Textures
  const leatherTex = track(createPerforatedLeatherTexture(maxAnisotropy));
  const carbonTex = track(createCarbonWeaveTexture(maxAnisotropy));
  const clusterTex = track(createClusterDialTexture(maxAnisotropy));
  const screenTex = track(createInfotainmentTexture(maxAnisotropy));

  // Interior PBR Materials
  const softDashMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x1d222e,
      map: leatherTex,
      roughness: 0.76,
      metalness: 0.08,
    }),
  );

  const alcantaraMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x131720,
      roughness: 0.92,
      metalness: 0.02,
    }),
  );

  const carbonTrimMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: carbonTex,
      roughness: 0.3,
      metalness: 0.28,
    }),
  );

  const brushedMetalMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      metalness: 0.88,
      roughness: 0.22,
    }),
  );

  const darkMetalMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x2b3344,
      metalness: 0.78,
      roughness: 0.34,
    }),
  );

  const crimsonAccentMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.32,
      metalness: 0.16,
      emissive: 0x7f1d1d,
      emissiveIntensity: 0.4,
    }),
  );

  const clusterMat = track(
    new THREE.MeshBasicMaterial({
      map: clusterTex,
    }),
  );

  const screenMat = track(
    new THREE.MeshBasicMaterial({
      map: screenTex,
    }),
  );

  const needleMat = track(
    new THREE.MeshBasicMaterial({
      color: 0xff3b3b,
    }),
  );

  const cockpitGlassMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0x93c5fd,
      transparent: true,
      opacity: 0.05,
      roughness: 0.05,
      metalness: 0.15,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );

  const mirrorGlassMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x1e3a5f,
      metalness: 0.94,
      roughness: 0.08,
    }),
  );

  // Subtle dedicated cockpit studio fill light (active ONLY when cockpit view is visible)
  const interiorLight = new THREE.PointLight(0xe0f2fe, 0, 3.4, 1.35);
  interiorLight.position.set(0.16, 1.18, -0.08);
  group.add(interiorLight);

  // =========================================================================
  // 1. Exterior Front Hood & Fenders (matches bodyMat & hood stripes seen out windshield)
  // =========================================================================
  const hoodShape = new THREE.Shape();
  hoodShape.moveTo(0.62, 0.28);
  hoodShape.lineTo(1.94, 0.24);
  hoodShape.lineTo(2.04, 0.42);
  hoodShape.lineTo(1.98, 0.64);
  hoodShape.lineTo(1.22, 0.80);
  hoodShape.lineTo(0.64, 0.86);
  hoodShape.lineTo(0.62, 0.28);

  const hoodGeo = track(
    new THREE.ExtrudeGeometry(hoodShape, {
      depth: 1.66,
      bevelEnabled: true,
      bevelThickness: 0.11,
      bevelSize: 0.08,
      bevelSegments: 3,
    }),
  );
  hoodGeo.translate(0, 0, -0.83);
  hoodGeo.rotateY(-Math.PI / 2);
  const hoodMesh = new THREE.Mesh(hoodGeo, bodyMat);
  hoodMesh.receiveShadow = true;
  group.add(hoodMesh);

  const powerDome = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.56, 0.035, 1.06)),
    bodyMat,
  );
  powerDome.position.set(0, 0.865, 1.29);
  powerDome.rotation.x = 0.185;
  group.add(powerDome);

  const cockpitHoodStripes = new THREE.Group();
  [-0.18, 0.18].forEach((x) => {
    const s = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.14, 0.025, 1.08)),
      decalMat,
    );
    s.position.set(x, 0.885, 1.28);
    s.rotation.x = 0.19;
    cockpitHoodStripes.add(s);
  });
  group.add(cockpitHoodStripes);

  [-0.24, 0.26].forEach((x) => {
    const wiper = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.58, 0.02, 0.03)),
      carbonMat,
    );
    wiper.position.set(x, 0.945, 0.72);
    wiper.rotation.y = 0.14;
    group.add(wiper);
  });

  // =========================================================================
  // 2. Sculpted Multi-Tier Dashboard, Red Stitch Trim & Louvered Air Vents
  // =========================================================================
  const dashUpper = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.56, 0.10, 0.44)),
    softDashMat,
  );
  dashUpper.position.set(0, 0.84, 0.56);
  dashUpper.rotation.x = 0.12;
  group.add(dashUpper);

  // Subtle crimson leather stitch accent along dash cowl edge
  const dashStitch = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.48, 0.008, 0.012)),
    crimsonAccentMat,
  );
  dashStitch.position.set(0, 0.868, 0.345);
  group.add(dashStitch);

  const dashLower = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.54, 0.28, 0.34)),
    alcantaraMat,
  );
  dashLower.position.set(0, 0.66, 0.53);
  group.add(dashLower);

  const dashCarbonInlay = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.48, 0.085, 0.04)),
    carbonTrimMat,
  );
  dashCarbonInlay.position.set(0, 0.815, 0.34);
  group.add(dashCarbonInlay);

  const dashAluStrip = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.48, 0.012, 0.045)),
    brushedMetalMat,
  );
  dashAluStrip.position.set(0, 0.77, 0.34);
  group.add(dashAluStrip);

  // Sculpted Louvered AC Vents (dark metallic frame + 3 horizontal fins)
  [0.64, 0.06, -0.10, -0.60].forEach((vx) => {
    const bezel = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.115, 0.056, 0.045)),
      darkMetalMat,
    );
    bezel.position.set(vx, 0.815, 0.335);
    group.add(bezel);

    const cavity = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.098, 0.04, 0.048)),
      alcantaraMat,
    );
    cavity.position.set(vx, 0.815, 0.332);
    group.add(cavity);

    [-0.01, 0, 0.01].forEach((ly) => {
      const louver = new THREE.Mesh(
        track(new THREE.BoxGeometry(0.092, 0.004, 0.052)),
        brushedMetalMat,
      );
      louver.position.set(vx, 0.815 + ly, 0.328);
      group.add(louver);
    });
  });

  // Recessed Anti-Glare Instrument Binnacle positioned cleanly inside upper wheel sightline
  // Sightline from eye (0.34, 1.13, -0.32) through steering wheel upper window (y=0.94..1.04 at z=0.16)
  // lands cleanly around y=0.87..0.97 at z=0.43
  const visorTop = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.32, 0.024, 0.16)),
    softDashMat,
  );
  visorTop.position.set(0.34, 0.995, 0.43);
  visorTop.rotation.x = 0.08;
  group.add(visorTop);

  [-0.155, 0.155].forEach((dx) => {
    const sideWall = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.022, 0.135, 0.15)),
      softDashMat,
    );
    sideWall.position.set(0.34 + dx, 0.925, 0.43);
    group.add(sideWall);
  });

  const clusterPlane = new THREE.Mesh(
    track(new THREE.PlaneGeometry(0.295, 0.125)),
    clusterMat,
  );
  clusterPlane.position.set(0.34, 0.922, 0.445);
  clusterPlane.rotation.y = Math.PI;
  clusterPlane.rotation.x = 0.08;
  group.add(clusterPlane);

  const clusterGlass = new THREE.Mesh(
    track(new THREE.PlaneGeometry(0.296, 0.126)),
    cockpitGlassMat,
  );
  clusterGlass.position.set(0.34, 0.922, 0.438);
  clusterGlass.rotation.y = Math.PI;
  clusterGlass.rotation.x = 0.08;
  group.add(clusterGlass);

  // 3D Tachometer & Speedometer Needles
  const buildNeedlePivot = (offsetX: number): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(0.34 + offsetX, 0.922, 0.441);
    const blade = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.0045, 0.037, 0.004)),
      needleMat,
    );
    blade.position.y = 0.015;
    pivot.add(blade);

    const cap = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.0085, 0.0085, 0.006, 12)),
      brushedMetalMat,
    );
    cap.rotation.x = Math.PI / 2;
    pivot.add(cap);

    group.add(pivot);
    return pivot;
  };

  const rpmNeedlePivot = buildNeedlePivot(+0.078);
  const speedNeedlePivot = buildNeedlePivot(-0.078);

  // =========================================================================
  // 3. Center Console, Floating Infotainment Display & GT Gear Shifter
  // =========================================================================
  const infotainmentGroup = new THREE.Group();
  infotainmentGroup.position.set(-0.04, 0.905, 0.41);
  infotainmentGroup.rotation.y = -0.24; // angled toward driver (+X)
  group.add(infotainmentGroup);

  const screenHousing = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.28, 0.165, 0.022)),
    darkMetalMat,
  );
  infotainmentGroup.add(screenHousing);

  const screenTrim = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.285, 0.17, 0.012)),
    brushedMetalMat,
  );
  screenTrim.position.z = -0.002;
  infotainmentGroup.add(screenTrim);

  const screenFace = new THREE.Mesh(
    track(new THREE.PlaneGeometry(0.264, 0.15)),
    screenMat,
  );
  screenFace.position.z = -0.013;
  screenFace.rotation.y = Math.PI;
  infotainmentGroup.add(screenFace);

  const centerTunnel = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.28, 0.34, 1.05)),
    alcantaraMat,
  );
  centerTunnel.position.set(0, 0.56, 0.04);
  group.add(centerTunnel);

  const consoleTop = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.25, 0.03, 0.88)),
    carbonTrimMat,
  );
  consoleTop.position.set(0, 0.74, 0.08);
  group.add(consoleTop);

  const shifterBase = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.044, 0.052, 0.022, 16)),
    darkMetalMat,
  );
  shifterBase.position.set(0, 0.76, 0.14);
  group.add(shifterBase);

  const shifterStalk = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.011, 0.014, 0.085, 12)),
    chromeMat,
  );
  shifterStalk.position.set(0, 0.798, 0.14);
  group.add(shifterStalk);

  const shifterKnob = new THREE.Mesh(
    track(new THREE.SphereGeometry(0.027, 14, 12)),
    softDashMat,
  );
  shifterKnob.position.set(0, 0.845, 0.14);
  group.add(shifterKnob);

  const startBtn = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.017, 0.017, 0.012, 16)),
    crimsonAccentMat,
  );
  startBtn.position.set(0.072, 0.76, 0.28);
  group.add(startBtn);

  // =========================================================================
  // 4. Seamless A-Pillars, Side Wing Mirrors, Roof Rails & Overhead Cabin Mirror
  // =========================================================================
  [-0.78, 0.78].forEach((dx) => {
    const doorCard = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.09, 0.42, 1.35)),
      softDashMat,
    );
    doorCard.position.set(dx, 0.68, 0.02);
    group.add(doorCard);

    const doorCarbonTrim = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.098, 0.048, 1.12)),
      carbonTrimMat,
    );
    doorCarbonTrim.position.set(dx, 0.82, 0.04);
    group.add(doorCarbonTrim);
  });

  // Aerodynamic Side Mirrors mounted cleanly on slim stalks outside door sill
  [-1, 1].forEach((side) => {
    const stalk = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.09, 0.028, 0.04)),
      darkMetalMat,
    );
    stalk.position.set(side * 0.82, 0.90, 0.50);
    group.add(stalk);

    const mShell = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.18, 0.085, 0.11)),
      bodyMat,
    );
    mShell.position.set(side * 0.90, 0.935, 0.49);
    mShell.rotation.y = side * -0.18;
    group.add(mShell);

    const mGlass = new THREE.Mesh(
      track(new THREE.PlaneGeometry(0.145, 0.064)),
      mirrorGlassMat,
    );
    mGlass.position.set(side * 0.90, 0.935, 0.433);
    mGlass.rotation.y = Math.PI + side * -0.18;
    group.add(mGlass);
  });

  // Seamless Full-Length A-Pillars connecting lower dash cowl (z=+0.72,y=0.86) -> roof header rail (z=+0.18,y=1.28)
  [-1, 1].forEach((side) => {
    const pillar = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.055, 0.055, 0.74)),
      alcantaraMat,
    );
    pillar.position.set(side * 0.69, 1.07, 0.45);
    pillar.rotation.x = 0.72; // +Z end slopes DOWN to cowl, -Z end slopes UP to roof header
    pillar.rotation.y = side * 0.14;
    group.add(pillar);

    // Side roof header rails so A-pillar meets headliner cleanly without gaps
    const roofRail = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.09, 0.055, 0.85)),
      alcantaraMat,
    );
    roofRail.position.set(side * 0.65, 1.275, -0.14);
    group.add(roofRail);
  });

  const roofHeader = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.36, 0.055, 0.74)),
    alcantaraMat,
  );
  roofHeader.position.set(0, 1.28, -0.10);
  group.add(roofHeader);

  const cabMirrorStem = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.011, 0.011, 0.065, 10)),
    carbonMat,
  );
  cabMirrorStem.position.set(0, 1.235, 0.25);
  group.add(cabMirrorStem);

  const cabMirrorFrame = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.20, 0.054, 0.022)),
    darkMetalMat,
  );
  cabMirrorFrame.position.set(0, 1.195, 0.235);
  cabMirrorFrame.rotation.y = -0.08;
  group.add(cabMirrorFrame);

  const cabMirrorGlass = new THREE.Mesh(
    track(new THREE.PlaneGeometry(0.182, 0.04)),
    mirrorGlassMat,
  );
  cabMirrorGlass.position.set(0, 1.195, 0.222);
  cabMirrorGlass.rotation.y = Math.PI - 0.08;
  group.add(cabMirrorGlass);

  const windshieldPane = new THREE.Mesh(
    track(new THREE.PlaneGeometry(1.38, 0.58)),
    cockpitGlassMat,
  );
  windshieldPane.position.set(0, 1.07, 0.45);
  windshieldPane.rotation.x = -0.82;
  group.add(windshieldPane);

  // =========================================================================
  // 5. Compact Steering Column + Animated D-Shaped Sport Steering Wheel
  // =========================================================================
  const steeringColumnGroup = new THREE.Group();
  steeringColumnGroup.position.set(0.34, 0.905, 0.16);
  steeringColumnGroup.rotation.x = -0.22; // sleek low-occlusion tilt
  group.add(steeringColumnGroup);

  // Compact steering column shroud tucked cleanly below hub so gauges stay 100% open
  const colShroud = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.026, 0.032, 0.14, 16)),
    darkMetalMat,
  );
  colShroud.rotation.x = Math.PI / 2 + 0.16;
  colShroud.position.set(0, -0.014, 0.085);
  steeringColumnGroup.add(colShroud);

  [-1, 1].forEach((side) => {
    const stalk = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.088, 0.011, 0.013)),
      carbonMat,
    );
    stalk.position.set(side * 0.068, 0.008, 0.055);
    stalk.rotation.z = side * 0.15;
    steeringColumnGroup.add(stalk);
  });

  // Animated Rotating Steering Wheel Pivot!
  const steeringWheelPivot = new THREE.Group();
  steeringColumnGroup.add(steeringWheelPivot);

  const wheelRadius = 0.146;
  const rimTube = 0.0185;

  const rimArcGeo = track(
    new THREE.TorusGeometry(wheelRadius, rimTube, 16, 42, Math.PI * 1.56),
  );
  const rimArcMesh = new THREE.Mesh(rimArcGeo, softDashMat);
  rimArcMesh.rotation.z = -Math.PI * 0.28;
  steeringWheelPivot.add(rimArcMesh);

  const flatBottomBar = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.175, 0.032, 0.034)),
    carbonTrimMat,
  );
  flatBottomBar.position.set(0, -0.126, 0);
  steeringWheelPivot.add(flatBottomBar);

  [-0.142, 0.142].forEach((bx) => {
    const bolster = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.022, 0.022, 0.068, 12)),
      carbonTrimMat,
    );
    bolster.position.set(bx, 0.02, 0);
    steeringWheelPivot.add(bolster);
  });

  // Crimson 12 o'clock centering stripe (top of steering wheel)
  const topCenterRing = new THREE.Mesh(
    track(new THREE.TorusGeometry(wheelRadius, rimTube + 0.0022, 14, 10, 0.14)),
    crimsonAccentMat,
  );
  topCenterRing.rotation.z = Math.PI / 2 - 0.07;
  steeringWheelPivot.add(topCenterRing);

  // Sequential 7-LED F1/GT Shift-Light Strip embedded on front brow of upper rim (-Z facing driver)
  const shiftLedMats: THREE.MeshBasicMaterial[] = [];
  const shiftLedGeo = track(new THREE.BoxGeometry(0.0085, 0.0065, 0.006));
  for (let i = 0; i < 7; i++) {
    const ledMat = track(new THREE.MeshBasicMaterial({ color: 0x1e293b }));
    shiftLedMats.push(ledMat);
    const led = new THREE.Mesh(shiftLedGeo, ledMat);
    const ang = ((i - 3) / 3) * 0.25;
    const rLed = wheelRadius + 0.002;
    led.position.set(
      Math.sin(ang) * rLed,
      Math.cos(ang) * rLed,
      -0.0195,
    );
    led.rotation.z = -ang;
    steeringWheelPivot.add(led);
  }

  // 3 Sculpted Brushed-Aluminum Spokes + Rotary Pods + Metallic Paddle Shifters
  [-1, 1].forEach((side) => {
    const hSpoke = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.11, 0.031, 0.015)),
      brushedMetalMat,
    );
    hSpoke.position.set(side * 0.084, -0.006, 0.005);
    hSpoke.rotation.z = side * -0.08;
    steeringWheelPivot.add(hSpoke);

    const pod = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.0105, 0.0105, 0.01, 12)),
      side > 0 ? crimsonAccentMat : chromeMat,
    );
    pod.rotation.x = Math.PI / 2;
    pod.position.set(side * 0.092, -0.006, -0.004);
    steeringWheelPivot.add(pod);

    const paddle = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.026, 0.078, 0.007)),
      brushedMetalMat,
    );
    paddle.position.set(side * 0.104, 0.024, 0.025);
    paddle.rotation.z = side * -0.14;
    steeringWheelPivot.add(paddle);
  });

  [-0.017, 0.017].forEach((sx) => {
    const vSpoke = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.016, 0.11, 0.015)),
      brushedMetalMat,
    );
    vSpoke.position.set(sx, -0.074, 0.005);
    steeringWheelPivot.add(vSpoke);
  });

  // Sleek Low-Profile Central Airbag Hub + Metallic Ring + Hexagon Crest Badge
  const hubPad = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.048, 0.053, 0.022, 20)),
    softDashMat,
  );
  hubPad.rotation.x = Math.PI / 2;
  hubPad.position.z = -0.002;
  steeringWheelPivot.add(hubPad);

  const hubRing = new THREE.Mesh(
    track(new THREE.TorusGeometry(0.031, 0.0028, 10, 20)),
    chromeMat,
  );
  hubRing.position.z = -0.014;
  steeringWheelPivot.add(hubRing);

  const hubBadge = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.015, 0.015, 0.004, 6)),
    crimsonAccentMat,
  );
  hubBadge.rotation.x = Math.PI / 2;
  hubBadge.position.z = -0.015;
  steeringWheelPivot.add(hubBadge);

  let smoothWheelZ = 0;
  let smoothSpeedZ = NEEDLE_MIN_RAD;
  let smoothRpmZ = NEEDLE_MIN_RAD;

  const update = (input: CockpitTelemetryInput, dt: number) => {
    const target = computeCockpitTelemetryAngles(input);
    const steerLerp = 1 - Math.exp(-16 * dt);
    const needleLerp = 1 - Math.exp(-10 * dt);

    smoothWheelZ += (target.steeringWheelZ - smoothWheelZ) * steerLerp;
    smoothSpeedZ += (target.speedNeedleZ - smoothSpeedZ) * needleLerp;
    smoothRpmZ += (target.rpmNeedleZ - smoothRpmZ) * needleLerp;

    steeringWheelPivot.rotation.z = smoothWheelZ;
    speedNeedlePivot.rotation.z = smoothSpeedZ;
    rpmNeedlePivot.rotation.z = smoothRpmZ;

    for (let i = 0; i < 7; i++) {
      const lit = i < target.shiftLedCount || (input.turboActive && i < 6);
      if (!lit) {
        shiftLedMats[i].color.setHex(0x1e293b);
      } else if (input.turboActive) {
        shiftLedMats[i].color.setHex(0x22d3ee);
      } else if (i < 3) {
        shiftLedMats[i].color.setHex(0x34d399);
      } else if (i < 5) {
        shiftLedMats[i].color.setHex(0xfbbf24);
      } else {
        shiftLedMats[i].color.setHex(0xf43f5e);
      }
    }
  };

  return {
    group,
    update,
    setVisible: (visible: boolean) => {
      group.visible = visible;
      interiorLight.intensity = visible ? 1.5 : 0;
    },
    setDecalStyle: (decal: DecalStyleId) => {
      cockpitHoodStripes.visible = decal === 'dualStripe';
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
