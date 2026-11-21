import * as THREE from 'three';
import type {
  DecalStyleId,
  PaintFinishId,
  RimStyleId,
  SpoilerStyleId,
  UnderglowColorId,
  VehicleCustomization,
} from '../types/game';

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
  setWheelKinematics: (steerAngle: number, spinAngle: number, speed: number) => void;
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
): CarRig {
  const root = new THREE.Group();
  const chassisGroup = new THREE.Group();
  root.add(chassisGroup);

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

  // 3. Carbon Front Splitter, Side Skirts & Rear Diffuser
  const splitterGeo = track(new THREE.BoxGeometry(1.86, 0.07, 0.42));
  const splitter = new THREE.Mesh(splitterGeo, carbonMat);
  splitter.position.set(0, 0.22, 1.94);
  chassisGroup.add(splitter);

  const skirtGeo = track(new THREE.BoxGeometry(1.86, 0.09, 2.25));
  const skirt = new THREE.Mesh(skirtGeo, carbonMat);
  skirt.position.set(0, 0.22, 0.02);
  chassisGroup.add(skirt);

  const diffuserGeo = track(new THREE.BoxGeometry(1.76, 0.14, 0.24));
  const diffuser = new THREE.Mesh(diffuserGeo, carbonMat);
  diffuser.position.set(0, 0.27, -1.96);
  chassisGroup.add(diffuser);

  // Front grille
  const grilleGeo = track(new THREE.BoxGeometry(1.1, 0.2, 0.08));
  const grille = new THREE.Mesh(grilleGeo, carbonMat);
  grille.position.set(0, 0.41, 2.09);
  chassisGroup.add(grille);

  // 4. Headlights & Rear Taillight Bar + Reverse Lamps
  const hlGeo = track(new THREE.BoxGeometry(0.36, 0.11, 0.12));
  [-0.64, 0.64].forEach((x) => {
    const hl = new THREE.Mesh(hlGeo, headlightMat);
    hl.position.set(x, 0.56, 2.04);
    hl.rotation.y = x > 0 ? -0.14 : 0.14;
    chassisGroup.add(hl);
  });

  const tlBarGeo = track(new THREE.BoxGeometry(1.58, 0.09, 0.08));
  const tlBar = new THREE.Mesh(tlBarGeo, brakeLightMat);
  tlBar.position.set(0, 0.72, -2.07);
  chassisGroup.add(tlBar);

  const revGeo = track(new THREE.BoxGeometry(0.24, 0.06, 0.09));
  [-0.48, 0.48].forEach((x) => {
    const rev = new THREE.Mesh(revGeo, reverseLightMat);
    rev.position.set(x, 0.61, -2.07);
    chassisGroup.add(rev);
  });

  // 5. Side Wing Mirrors & Exhaust Tips
  const mirrorGeo = track(new THREE.BoxGeometry(0.22, 0.09, 0.14));
  [-0.86, 0.86].forEach((x) => {
    const mirror = new THREE.Mesh(mirrorGeo, bodyMat);
    mirror.position.set(x, 0.92, 0.52);
    chassisGroup.add(mirror);
  });

  const exhaustGeo = track(new THREE.CylinderGeometry(0.065, 0.065, 0.22, 14));
  exhaustGeo.rotateX(Math.PI / 2);
  [-0.45, 0.45].forEach((x) => {
    const pipe = new THREE.Mesh(exhaustGeo, chromeMat);
    pipe.position.set(x, 0.25, -2.07);
    chassisGroup.add(pipe);
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
  const wheelSpinGroups: THREE.Group[] = [];
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
    root.add(steerPivot);
    if (wp.isFront) frontSteerPivots.push(steerPivot);

    const spinGroup = new THREE.Group();
    steerPivot.add(spinGroup);
    wheelSpinGroups.push(spinGroup);

    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    spinGroup.add(tire);

    const rotor = new THREE.Mesh(rotorGeo, rotorMat);
    spinGroup.add(rotor);

    const sideSign = wp.x > 0 ? 1 : -1;
    const caliper = new THREE.Mesh(caliperGeo, caliperMat);
    caliper.position.set(sideSign * 0.11, 0.12, -0.09);
    steerPivot.add(caliper);

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

  const applyCustomization = (custom: VehicleCustomization) => {
    const p = PAINT_PRESETS[custom.paint];
    bodyMat.color.setHex(p.hex);
    bodyMat.metalness = p.metalness;
    bodyMat.roughness = p.roughness;
    decalMat.color.setHex(custom.paint === 'alpine' ? 0x111827 : 0xf8fafc);

    lipMesh.visible = custom.spoiler === 'lip';
    gtWingGroup.visible = custom.spoiler === 'gtWing';

    dualStripeGroup.visible = custom.decal === 'dualStripe';
    sideNumGroup.visible = custom.decal === 'sideNumber';

    const glow = UNDERGLOW_PRESETS[custom.underglow];
    underglowMesh.visible = custom.underglow !== 'off';
    underglowMat.color.setHex(glow.hex);

    rimMeshesByWheel.forEach((rimMap) => {
      (Object.keys(rimMap) as RimStyleId[]).forEach((key) => {
        rimMap[key].visible = key === custom.rim;
      });
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

  const setWheelKinematics = (steerAngle: number, spinAngle: number, speed: number) => {
    for (let i = 0; i < frontSteerPivots.length; i++) {
      frontSteerPivots[i].rotation.y = steerAngle;
    }
    for (let i = 0; i < wheelSpinGroups.length; i++) {
      wheelSpinGroups[i].rotation.x = spinAngle;
    }
    // Subtle suspension pitch on acceleration/braking
    const targetPitch = -Math.max(-0.035, Math.min(0.035, speed * 0.0022));
    chassisGroup.rotation.x += (targetPitch - chassisGroup.rotation.x) * 0.15;
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
    setWheelKinematics,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
