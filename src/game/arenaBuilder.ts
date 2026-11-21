import * as THREE from 'three';
import type { LevelConfig } from '../types/game';
import type { ProceduralTextureSet } from './textures';
import { getMovingGateAABB } from './physics';

export interface ArenaHandle {
  group: THREE.Group;
  wallCollidables: THREE.Object3D[];
  update: (elapsedTime: number, parkProgress: number, parkQuality: number) => void;
  dispose: () => void;
}

export function buildLabyrinthArena(
  level: LevelConfig,
  textures: ProceduralTextureSet,
): ArenaHandle {
  const group = new THREE.Group();
  const wallCollidables: THREE.Object3D[] = [];
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const arenaW = level.cols * level.cellSize + 10;
  const arenaD = level.rows * level.cellSize + 10;

  // 1. Main Asphalt Deck (y = 0)
  const deckGeo = track(new THREE.PlaneGeometry(arenaW, arenaD));
  const deckMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.asphaltMap,
      bumpMap: textures.asphaltBump,
      bumpScale: 0.025,
      roughness: 0.82,
      metalness: 0.06,
    }),
  );
  const deckMesh = new THREE.Mesh(deckGeo, deckMat);
  deckMesh.rotation.x = -Math.PI / 2;
  deckMesh.receiveShadow = true;
  group.add(deckMesh);

  // Extended surrounding rooftop apron + perimeter skyline so the arena never floats in an empty void
  const apronGeo = track(new THREE.PlaneGeometry(280, 280));
  const apronMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x161d2b,
      roughness: 0.92,
      metalness: 0.08,
    }),
  );
  const apronMesh = new THREE.Mesh(apronGeo, apronMat);
  apronMesh.rotation.x = -Math.PI / 2;
  apronMesh.position.y = -0.18;
  group.add(apronMesh);

  // Distant city skyline silhouettes around perimeter (InstancedMesh)
  const towerGeo = track(new THREE.BoxGeometry(1, 1, 1));
  const towerMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.72,
      metalness: 0.25,
    }),
  );
  const towerCount = 44;
  const towers = new THREE.InstancedMesh(towerGeo, towerMat, towerCount);
  const dummy = new THREE.Object3D();
  const c = new THREE.Color();
  for (let i = 0; i < towerCount; i++) {
    const angle = (i / towerCount) * Math.PI * 2;
    const radius = 56 + (i % 4) * 14;
    const h = 10 + ((i * 7) % 24);
    const w = 5 + ((i * 3) % 6);
    dummy.position.set(Math.cos(angle) * radius, h * 0.5 - 6, Math.sin(angle) * radius);
    dummy.scale.set(w, h, w);
    dummy.rotation.y = angle;
    dummy.updateMatrix();
    towers.setMatrixAt(i, dummy.matrix);
    c.setHSL(0.6, 0.22, 0.14 + (i % 5) * 0.025);
    towers.setColorAt(i, c);
  }
  towers.instanceMatrix.needsUpdate = true;
  if (towers.instanceColor) towers.instanceColor.needsUpdate = true;
  towers.computeBoundingSphere();
  group.add(towers);

  // 2. Concrete Labyrinth Walls with Hazard Chevron Top Caps
  const wallBaseMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.78,
      metalness: 0.08,
    }),
  );
  const hazardCapMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.hazardStripeMap,
      roughness: 0.55,
      metalness: 0.12,
    }),
  );

  const unitBoxGeo = track(new THREE.BoxGeometry(1, 1, 1));
  const wallHeight = 1.45;

  level.walls.forEach((w) => {
    const wallGroup = new THREE.Group();
    wallGroup.position.set(w.x, 0, w.z);

    // Lower concrete Jersey barrier body
    const body = new THREE.Mesh(unitBoxGeo, wallBaseMat);
    body.scale.set(w.halfW * 2, wallHeight, w.halfD * 2);
    body.position.y = wallHeight * 0.5;
    body.castShadow = true;
    body.receiveShadow = true;
    wallGroup.add(body);
    wallCollidables.push(body);

    // Upper hazard chevron cap with proportional UVs so chevrons never stretch
    const capW = w.halfW * 2 + 0.06;
    const capD = w.halfD * 2 + 0.06;
    const capGeo = track(new THREE.BoxGeometry(capW, 0.22, capD));
    const uvAttr = capGeo.attributes.uv;
    const normAttr = capGeo.attributes.normal;
    for (let i = 0; i < uvAttr.count; i++) {
      const nx = Math.abs(normAttr.getX(i));
      const ny = Math.abs(normAttr.getY(i));
      const nz = Math.abs(normAttr.getZ(i));
      const u = uvAttr.getX(i);
      const v = uvAttr.getY(i);
      if (nx > 0.5) {
        uvAttr.setXY(i, u * (capD / 2.2), v);
      } else if (nz > 0.5) {
        uvAttr.setXY(i, u * (capW / 2.2), v);
      } else if (ny > 0.5) {
        uvAttr.setXY(i, u * (capW / 2.2), v * (capD / 2.2));
      }
    }
    uvAttr.needsUpdate = true;
    const cap = new THREE.Mesh(capGeo, hazardCapMat);
    cap.position.y = wallHeight + 0.11;
    cap.castShadow = true;
    wallGroup.add(cap);

    group.add(wallGroup);
  });

  // 3. Dynamic Moving Barrier Gates with Emissive Warning Beacons
  const gateBodyMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.42,
      metalness: 0.35,
    }),
  );
  const gateBeaconMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xf59e0b,
      emissiveIntensity: 2.0,
      roughness: 0.2,
    }),
  );

  const gateMeshes: Array<{ gate: LevelConfig['movingGates'][number]; mesh: THREE.Group }> = [];
  level.movingGates.forEach((gate) => {
    const g = new THREE.Group();
    const block = new THREE.Mesh(unitBoxGeo, gateBodyMat);
    block.scale.set(gate.halfW * 2, 1.15, gate.halfD * 2);
    block.position.y = 0.575;
    block.castShadow = true;
    g.add(block);

    const stripe = new THREE.Mesh(unitBoxGeo, hazardCapMat);
    stripe.scale.set(gate.halfW * 2 + 0.04, 0.22, gate.halfD * 2 + 0.04);
    stripe.position.y = 1.24;
    g.add(stripe);

    const beacon = new THREE.Mesh(
      track(new THREE.SphereGeometry(0.18, 12, 12)),
      gateBeaconMat,
    );
    beacon.position.y = 1.52;
    g.add(beacon);

    g.position.set(gate.baseX, 0, gate.baseZ);
    group.add(g);
    gateMeshes.push({ gate, mesh: g });
  });

  // 4. Instanced Traffic Cones & Steel Bollards
  const cones = level.props.filter((p) => p.kind === 'cone');
  const bollards = level.props.filter((p) => p.kind === 'bollard');

  if (cones.length > 0) {
    const coneGeo = track(new THREE.ConeGeometry(0.28, 0.72, 14));
    const coneMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xf97316,
        roughness: 0.45,
        metalness: 0.05,
      }),
    );
    const coneInst = new THREE.InstancedMesh(coneGeo, coneMat, cones.length);
    coneInst.castShadow = true;
    cones.forEach((p, idx) => {
      dummy.position.set(p.x, 0.36, p.z);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      coneInst.setMatrixAt(idx, dummy.matrix);
    });
    coneInst.instanceMatrix.needsUpdate = true;
    coneInst.computeBoundingSphere();
    group.add(coneInst);
  }

  if (bollards.length > 0) {
    const bolGeo = track(new THREE.CylinderGeometry(0.22, 0.24, 0.92, 14));
    const bolMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        roughness: 0.32,
        metalness: 0.65,
      }),
    );
    const bolInst = new THREE.InstancedMesh(bolGeo, bolMat, bollards.length);
    bolInst.castShadow = true;
    bollards.forEach((p, idx) => {
      dummy.position.set(p.x, 0.46, p.z);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      bolInst.setMatrixAt(idx, dummy.matrix);
    });
    bolInst.instanceMatrix.needsUpdate = true;
    bolInst.computeBoundingSphere();
    group.add(bolInst);
  }

  // 5. Glowing Target Parking Bay + Corner Pylons + Floating Guide Beacon
  const bayGroup = new THREE.Group();
  bayGroup.position.set(level.parking.x, 0.02, level.parking.z);
  bayGroup.rotation.y = level.parking.yaw;
  group.add(bayGroup);

  const bayPlaneGeo = track(new THREE.PlaneGeometry(level.parking.width, level.parking.length));
  const bayPlaneMat = track(
    new THREE.MeshBasicMaterial({
      map: textures.parkingBayMap,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  const bayPlane = new THREE.Mesh(bayPlaneGeo, bayPlaneMat);
  bayPlane.rotation.x = -Math.PI / 2;
  bayGroup.add(bayPlane);

  const pylonGeo = track(new THREE.CylinderGeometry(0.08, 0.1, 1.35, 10));
  const pylonMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 1.3,
      roughness: 0.25,
    }),
  );
  const hw = level.parking.width * 0.5;
  const hl = level.parking.length * 0.5;
  [
    [-hw, -hl],
    [hw, -hl],
    [-hw, hl],
    [hw, hl],
  ].forEach(([px, pz]) => {
    const pylon = new THREE.Mesh(pylonGeo, pylonMat);
    pylon.position.set(px, 0.675, pz);
    bayGroup.add(pylon);
  });

  // Floating animated diamond beacon + subtle sky column above bay
  const beaconGeo = track(new THREE.OctahedronGeometry(0.65, 0));
  const beaconMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x34d399,
      emissive: 0x10b981,
      emissiveIntensity: 1.8,
      roughness: 0.2,
      metalness: 0.5,
    }),
  );
  const floatingBeacon = new THREE.Mesh(beaconGeo, beaconMat);
  floatingBeacon.position.set(0, 4.1, 0);
  bayGroup.add(floatingBeacon);

  const beamGeo = track(new THREE.CylinderGeometry(0.18, 0.9, 6.5, 16, 1, true));
  const beamMat = track(
    new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  const guideBeam = new THREE.Mesh(beamGeo, beamMat);
  guideBeam.position.set(0, 3.25, 0);
  bayGroup.add(guideBeam);

  // 6. Rooftop Floodlight Poles at Arena Corners
  const poleGeo = track(new THREE.CylinderGeometry(0.12, 0.18, 7.5, 10));
  const poleMat = track(
    new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.35 }),
  );
  const lampHeadMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xfff7ed,
      emissive: 0xfde68a,
      emissiveIntensity: 2.0,
    }),
  );
  const lampHeadGeo = track(new THREE.BoxGeometry(0.9, 0.35, 0.45));
  const cornerX = arenaW * 0.47;
  const cornerZ = arenaD * 0.47;
  [
    [-cornerX, -cornerZ],
    [cornerX, -cornerZ],
    [-cornerX, cornerZ],
    [cornerX, cornerZ],
  ].forEach(([lx, lz]) => {
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(lx, 3.75, lz);
    group.add(pole);

    const head = new THREE.Mesh(lampHeadGeo, lampHeadMat);
    head.position.set(lx, 7.6, lz);
    head.lookAt(0, 0, 0);
    group.add(head);
  });

  const update = (elapsedTime: number, parkProgress: number, parkQuality: number) => {
    for (let i = 0; i < gateMeshes.length; i++) {
      const item = gateMeshes[i];
      const box = getMovingGateAABB(item.gate, elapsedTime);
      item.mesh.position.set(box.x, 0, box.z);
    }

    floatingBeacon.rotation.y = elapsedTime * 1.8;
    floatingBeacon.position.y = 4.1 + Math.sin(elapsedTime * 2.6) * 0.35;

    const pulse = 0.85 + Math.sin(elapsedTime * 4.5) * 0.25;
    if (parkProgress > 0.05) {
      pylonMat.emissive.setHex(0x22d3ee);
      pylonMat.emissiveIntensity = 2.2 + parkProgress * 1.5;
      beaconMat.emissive.setHex(0x22d3ee);
    } else if (parkQuality > 0.65) {
      pylonMat.emissive.setHex(0x34d399);
      pylonMat.emissiveIntensity = 1.6;
      beaconMat.emissive.setHex(0x34d399);
    } else {
      pylonMat.emissive.setHex(0x10b981);
      pylonMat.emissiveIntensity = pulse;
      beaconMat.emissive.setHex(0x10b981);
    }
  };

  return {
    group,
    wallCollidables,
    update,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
