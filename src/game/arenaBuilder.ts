import * as THREE from 'three';
import type { LevelConfig } from '../types/game';
import type { ProceduralTextureSet } from './textures';
import { getMovingGateAABB } from './physics';
import { evaluateTrafficLightState } from './trafficLights';
import { buildExteriorForest } from './exteriorSceneryBuilder';

export interface ArenaHandle {
  group: THREE.Group;
  wallCollidables: THREE.Object3D[];
  update: (
    elapsedTime: number,
    parkProgress: number,
    parkQuality: number,
    collectedTokenIds?: string[],
    passedCheckpointIds?: string[],
    edsFlashTimer?: number,
  ) => void;
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

  const perimeterThickness = level.realWorld ? 1.35 : 1.65;
  const arenaW = level.cols * level.cellSize + perimeterThickness;
  const arenaD = level.rows * level.cellSize + perimeterThickness;

  // Dynamically scale asphalt texture tiling to match exact enclosed labyrinth dimensions
  textures.asphaltMap.repeat.set(Math.max(4, arenaW / 6), Math.max(4, arenaD / 6));
  textures.asphaltBump.repeat.set(Math.max(4, arenaW / 6), Math.max(4, arenaD / 6));

  const dummy = new THREE.Object3D();

  // 1. Tightly Bounded Asphalt Deck (y = 0) — zero outer ground or surrounding environment
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

  if (level.realWorld && (level.roadTiles?.length ?? 0) > 0) {
    const tiles = level.roadTiles!;
    const tileFloorGeo = track(
      new THREE.PlaneGeometry(
        level.cellSize + perimeterThickness,
        level.cellSize + perimeterThickness,
      ),
    );
    const tileInst = new THREE.InstancedMesh(tileFloorGeo, deckMat, tiles.length);
    tileInst.receiveShadow = true;
    tiles.forEach((tile, idx) => {
      dummy.position.set(tile.x, 0, tile.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      tileInst.setMatrixAt(idx, dummy.matrix);
    });
    tileInst.instanceMatrix.needsUpdate = true;
    tileInst.computeBoundingSphere();
    group.add(tileInst);
  } else {
    const deckGeo = track(new THREE.PlaneGeometry(arenaW, arenaD));
    const deckMesh = new THREE.Mesh(deckGeo, deckMat);
    deckMesh.rotation.x = -Math.PI / 2;
    deckMesh.receiveShadow = true;
    group.add(deckMesh);
  }

  // 1.5. Richly Detailed Exterior Forest World (strictly outside enclosed walls & exit highway)
  const exteriorForest = buildExteriorForest(level, group, track);

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

    // Concrete barrier body
    const body = new THREE.Mesh(unitBoxGeo, wallBaseMat);
    body.scale.set(w.halfW * 2, wallHeight, w.halfD * 2);
    body.position.y = wallHeight * 0.5;
    body.castShadow = true;
    body.receiveShadow = true;
    wallGroup.add(body);
    wallCollidables.push(body);

    // Upper hazard chevron cap with proportional UVs
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

  // 2.35. Every-5th-Level Exit Highway Expressway Floor, Lane Stripes & Gantry Arches
  if (level.highwayExit) {
    const hwExit = level.highwayExit;
    const hwWidth = hwExit.endX - hwExit.startX + perimeterThickness;
    const hwDepth = hwExit.halfWidth * 2 + perimeterThickness;
    const hwCenterX = hwExit.startX - perimeterThickness * 0.25 + hwWidth * 0.5;

    const hwFloor = new THREE.Mesh(
      track(new THREE.PlaneGeometry(hwWidth, hwDepth)),
      deckMat,
    );
    hwFloor.rotation.x = -Math.PI / 2;
    hwFloor.position.set(hwCenterX, 0.002, hwExit.exitZ);
    hwFloor.receiveShadow = true;
    group.add(hwFloor);

    const hwCenterStripeMat = track(
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      }),
    );
    const hwEdgeMat = track(
      new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      }),
    );

    const dashGeo = track(new THREE.PlaneGeometry(2.6, 0.24));
    for (let dx = hwExit.startX + 2.5; dx < hwExit.endX - 9.5; dx += 5.0) {
      const dash = new THREE.Mesh(dashGeo, hwCenterStripeMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(dx, 0.016, hwExit.exitZ);
      group.add(dash);
    }

    const edgeGeo = track(new THREE.PlaneGeometry(hwWidth - 1.5, 0.14));
    [-hwExit.halfWidth + 0.45, hwExit.halfWidth - 0.45].forEach((ezOff) => {
      const edge = new THREE.Mesh(edgeGeo, hwEdgeMat);
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(hwCenterX, 0.016, hwExit.exitZ + ezOff);
      group.add(edge);
    });

    // 3 High-Speed Illuminated Highway Gantry Arches
    const gantryDarkMat = track(
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.65, roughness: 0.3 }),
    );
    const gantryGlowMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x34d399,
        emissive: 0x10b981,
        emissiveIntensity: 1.85,
        roughness: 0.2,
      }),
    );
    const spanZ = hwExit.halfWidth * 2 + 0.5;
    [hwExit.startX + 5, hwExit.startX + 21, hwExit.startX + 37].forEach((gx) => {
      const gg = new THREE.Group();
      gg.position.set(gx, 0, hwExit.exitZ);
      [-spanZ * 0.5, spanZ * 0.5].forEach((pz) => {
        const col = new THREE.Mesh(track(new THREE.BoxGeometry(0.32, 3.8, 0.32)), gantryDarkMat);
        col.position.set(0, 1.9, pz);
        col.castShadow = true;
        gg.add(col);
      });
      const beam = new THREE.Mesh(track(new THREE.BoxGeometry(0.42, 0.38, spanZ + 0.4)), gantryDarkMat);
      beam.position.set(0, 3.8, 0);
      gg.add(beam);
      const sign = new THREE.Mesh(track(new THREE.BoxGeometry(0.46, 0.18, spanZ * 0.62)), gantryGlowMat);
      sign.position.set(0, 3.8, 0);
      gg.add(sign);
      group.add(gg);
    });
  }

  // 2.5. Straightaway Road Stripes, Intersection Crosswalks & Roundabout Islands
  const roadTiles = level.roadTiles ?? [];
  if (roadTiles.length > 0) {
    const halfCell = level.cellSize * 0.5;
    const whiteMarkTransforms: Array<{ x: number; z: number; sx: number; sz: number }> = [];
    const amberMarkTransforms: Array<{ x: number; z: number; sx: number; sz: number; ry?: number }> = [];

    for (const tile of roadTiles) {
      if (tile.kind === 'straightZ') {
        // Long North-South straightaway: twin dashed center stripes + subtle edge guide rails
        whiteMarkTransforms.push(
          { x: tile.x, z: tile.z - halfCell * 0.55, sx: 0.22, sz: 1.85 },
          { x: tile.x, z: tile.z + halfCell * 0.55, sx: 0.22, sz: 1.85 },
        );
        amberMarkTransforms.push(
          { x: tile.x - halfCell * 0.68, z: tile.z, sx: 0.1, sz: level.cellSize * 0.92 },
          { x: tile.x + halfCell * 0.68, z: tile.z, sx: 0.1, sz: level.cellSize * 0.92 },
        );
      } else if (tile.kind === 'straightX') {
        // Long East-West straightaway
        whiteMarkTransforms.push(
          { x: tile.x - halfCell * 0.55, z: tile.z, sx: 1.85, sz: 0.22 },
          { x: tile.x + halfCell * 0.55, z: tile.z, sx: 1.85, sz: 0.22 },
        );
        amberMarkTransforms.push(
          { x: tile.x, z: tile.z - halfCell * 0.68, sx: level.cellSize * 0.92, sz: 0.1 },
          { x: tile.x, z: tile.z + halfCell * 0.68, sx: level.cellSize * 0.92, sz: 0.1 },
        );
      } else if (tile.kind === 'cross' || tile.kind === 'tJunction') {
        // Intersection Zebra Crosswalks on every open leg
        const crossDist = halfCell * 0.72;
        const stripeOffsets = [-1.45, -0.5, 0.5, 1.45];
        if (tile.openN) {
          for (const off of stripeOffsets) {
            whiteMarkTransforms.push({ x: tile.x + off, z: tile.z - crossDist, sx: 0.42, sz: 1.25 });
          }
        }
        if (tile.openS) {
          for (const off of stripeOffsets) {
            whiteMarkTransforms.push({ x: tile.x + off, z: tile.z + crossDist, sx: 0.42, sz: 1.25 });
          }
        }
        if (tile.openW) {
          for (const off of stripeOffsets) {
            whiteMarkTransforms.push({ x: tile.x - crossDist, z: tile.z + off, sx: 1.25, sz: 0.42 });
          }
        }
        if (tile.openE) {
          for (const off of stripeOffsets) {
            whiteMarkTransforms.push({ x: tile.x + crossDist, z: tile.z + off, sx: 1.25, sz: 0.42 });
          }
        }

        // Amber Junction Box diagonals at center of 4-way & T-intersections
        amberMarkTransforms.push(
          { x: tile.x, z: tile.z, sx: 2.8, sz: 0.18, ry: Math.PI / 4 },
          { x: tile.x, z: tile.z, sx: 2.8, sz: 0.18, ry: -Math.PI / 4 },
        );
      } else if (tile.kind === 'corner') {
        // Subtle corner centerline stubs
        if (tile.openN) whiteMarkTransforms.push({ x: tile.x, z: tile.z - halfCell * 0.55, sx: 0.2, sz: 1.4 });
        if (tile.openS) whiteMarkTransforms.push({ x: tile.x, z: tile.z + halfCell * 0.55, sx: 0.2, sz: 1.4 });
        if (tile.openE) whiteMarkTransforms.push({ x: tile.x + halfCell * 0.55, z: tile.z, sx: 1.4, sz: 0.2 });
        if (tile.openW) whiteMarkTransforms.push({ x: tile.x - halfCell * 0.55, z: tile.z, sx: 1.4, sz: 0.2 });
      }
    }

    const markGeo = track(new THREE.PlaneGeometry(1, 1));
    if (whiteMarkTransforms.length > 0) {
      const whiteMat = track(
        new THREE.MeshBasicMaterial({
          color: 0xe2e8f0,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
        }),
      );
      const whiteInst = new THREE.InstancedMesh(markGeo, whiteMat, whiteMarkTransforms.length);
      whiteMarkTransforms.forEach((m, idx) => {
        dummy.position.set(m.x, 0.014, m.z);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(m.sx, m.sz, 1);
        dummy.updateMatrix();
        whiteInst.setMatrixAt(idx, dummy.matrix);
      });
      whiteInst.instanceMatrix.needsUpdate = true;
      whiteInst.computeBoundingSphere();
      group.add(whiteInst);
    }

    if (amberMarkTransforms.length > 0) {
      const amberMat = track(
        new THREE.MeshBasicMaterial({
          color: 0xf59e0b,
          transparent: true,
          opacity: 0.52,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
        }),
      );
      const amberInst = new THREE.InstancedMesh(markGeo, amberMat, amberMarkTransforms.length);
      amberMarkTransforms.forEach((m, idx) => {
        dummy.position.set(m.x, 0.016, m.z);
        dummy.rotation.set(-Math.PI / 2, 0, m.ry ?? 0);
        dummy.scale.set(m.sx, m.sz, 1);
        dummy.updateMatrix();
        amberInst.setMatrixAt(idx, dummy.matrix);
      });
      amberInst.instanceMatrix.needsUpdate = true;
      amberInst.computeBoundingSphere();
      group.add(amberInst);
    }
  }

  // Roundabout Central Islands (Döner Kavşak Adaları)
  const roundabouts = level.roundabouts ?? [];
  if (roundabouts.length > 0) {
    const islandCurbMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x475569,
        roughness: 0.7,
        metalness: 0.15,
      }),
    );
    const islandCapMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: textures.hazardStripeMap,
        roughness: 0.5,
      }),
    );
    const islandSignMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0ea5e9,
        emissiveIntensity: 1.5,
        roughness: 0.25,
      }),
    );
    const laneRingMat = track(
      new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );

    roundabouts.forEach((rb) => {
      const rg = new THREE.Group();
      rg.position.set(rb.x, 0, rb.z);

      const base = new THREE.Mesh(
        track(new THREE.CylinderGeometry(rb.radius, rb.radius * 1.04, 0.55, 24)),
        islandCurbMat,
      );
      base.position.y = 0.275;
      base.castShadow = true;
      base.receiveShadow = true;
      rg.add(base);
      wallCollidables.push(base);

      const trim = new THREE.Mesh(
        track(new THREE.CylinderGeometry(rb.radius * 0.94, rb.radius * 0.98, 0.18, 24)),
        islandCapMat,
      );
      trim.position.y = 0.64;
      rg.add(trim);

      const pole = new THREE.Mesh(
        track(new THREE.CylinderGeometry(0.08, 0.1, 1.9, 10)),
        islandCurbMat,
      );
      pole.position.y = 1.45;
      rg.add(pole);

      const signDisc = new THREE.Mesh(
        track(new THREE.TorusGeometry(0.45, 0.09, 10, 22)),
        islandSignMat,
      );
      signDisc.position.y = 2.45;
      rg.add(signDisc);

      const outerLaneRing = new THREE.Mesh(
        track(new THREE.RingGeometry(rb.radius + 2.4, rb.radius + 2.65, 36)),
        laneRingMat,
      );
      outerLaneRing.rotation.x = -Math.PI / 2;
      outerLaneRing.position.y = 0.016;
      rg.add(outerLaneRing);

      group.add(rg);
    });
  }

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

  // 4. Instanced Traffic Cones, Steel Bollards, Roadwork Barricades & Chicane Tire Stacks
  const cones = level.props.filter((p) => p.kind === 'cone');
  const bollards = level.props.filter((p) => p.kind === 'bollard');
  const barricades = level.props.filter((p) => p.kind === 'barricade');
  const tireStacks = level.props.filter((p) => p.kind === 'tire_stack');

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

  if (barricades.length > 0) {
    const railGeo = track(new THREE.BoxGeometry(1.15, 0.34, 0.16));
    const railMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: textures.hazardStripeMap,
        roughness: 0.48,
        metalness: 0.12,
      }),
    );
    const legGeo = track(new THREE.BoxGeometry(0.1, 0.84, 0.42));
    const legMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xea580c,
        roughness: 0.52,
        metalness: 0.25,
      }),
    );
    const railInst = new THREE.InstancedMesh(railGeo, railMat, barricades.length);
    const legInst = new THREE.InstancedMesh(legGeo, legMat, barricades.length * 2);
    railInst.castShadow = true;
    legInst.castShadow = true;

    barricades.forEach((p, idx) => {
      const yaw = p.yaw ?? 0;
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);

      dummy.position.set(p.x, 0.72, p.z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      railInst.setMatrixAt(idx, dummy.matrix);

      [-0.44, 0.44].forEach((lx, legSide) => {
        dummy.position.set(p.x + lx * cosY, 0.42, p.z - lx * sinY);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        legInst.setMatrixAt(idx * 2 + legSide, dummy.matrix);
      });
    });
    railInst.instanceMatrix.needsUpdate = true;
    legInst.instanceMatrix.needsUpdate = true;
    railInst.computeBoundingSphere();
    legInst.computeBoundingSphere();
    group.add(railInst);
    group.add(legInst);
  }

  if (tireStacks.length > 0) {
    const tireGeo = track(new THREE.TorusGeometry(0.32, 0.14, 10, 18));
    const tireMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.85,
        metalness: 0.08,
      }),
    );
    const apexRingMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xef4444,
        roughness: 0.55,
        metalness: 0.1,
      }),
    );
    const tireBaseInst = new THREE.InstancedMesh(tireGeo, tireMat, tireStacks.length * 2);
    const tireTopInst = new THREE.InstancedMesh(tireGeo, apexRingMat, tireStacks.length);
    tireBaseInst.castShadow = true;
    tireTopInst.castShadow = true;

    tireStacks.forEach((p, idx) => {
      [0.14, 0.4].forEach((ty, layerIdx) => {
        dummy.position.set(p.x, ty, p.z);
        dummy.rotation.set(Math.PI / 2, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        tireBaseInst.setMatrixAt(idx * 2 + layerIdx, dummy.matrix);
      });

      dummy.position.set(p.x, 0.66, p.z);
      dummy.rotation.set(Math.PI / 2, 0, 0);
      dummy.scale.set(0.95, 0.95, 0.95);
      dummy.updateMatrix();
      tireTopInst.setMatrixAt(idx, dummy.matrix);
    });
    tireBaseInst.instanceMatrix.needsUpdate = true;
    tireTopInst.instanceMatrix.needsUpdate = true;
    tireBaseInst.computeBoundingSphere();
    tireTopInst.computeBoundingSphere();
    group.add(tireBaseInst);
    group.add(tireTopInst);
  }

  // 4b. Collectible Bonus Stars & Time Crystals
  const tokenMeshes: Array<{ id: string; mesh: THREE.Group }> = [];
  const tokens = level.tokens ?? [];
  if (tokens.length > 0) {
    const starGeo = track(new THREE.OctahedronGeometry(0.62, 0));
    const starMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xf59e0b,
        emissiveIntensity: 1.5,
        metalness: 0.75,
        roughness: 0.2,
      }),
    );
    const timeGeo = track(new THREE.TorusGeometry(0.48, 0.14, 10, 22));
    const timeMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x06b6d4,
        emissiveIntensity: 1.6,
        metalness: 0.6,
        roughness: 0.2,
      }),
    );
    const ringGeo = track(new THREE.RingGeometry(0.7, 0.95, 24));
    const ringMat = track(
      new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );

    tokens.forEach((tok) => {
      const g = new THREE.Group();
      const core = new THREE.Mesh(
        tok.kind === 'star' ? starGeo : timeGeo,
        tok.kind === 'star' ? starMat : timeMat,
      );
      core.position.y = 1.15;
      core.castShadow = true;
      g.add(core);

      const pad = new THREE.Mesh(ringGeo, ringMat);
      pad.rotation.x = -Math.PI / 2;
      pad.position.y = 0.04;
      g.add(pad);

      g.position.set(tok.x, 0, tok.z);
      group.add(g);
      tokenMeshes.push({ id: tok.id, mesh: g });
    });
  }

  // 4c. Boost Pad Chevron Strips (Turbo Hızlanma Şeritleri)
  const boostPads = level.boostPads ?? [];
  const boostBarMats: THREE.MeshBasicMaterial[] = [];
  if (boostPads.length > 0) {
    const padBaseGeo = track(new THREE.PlaneGeometry(2.35, 3.4));
    const padBaseMat = track(
      new THREE.MeshBasicMaterial({
        color: 0x0f172a,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    );
    const chevBarGeo = track(new THREE.BoxGeometry(0.92, 0.02, 0.22));

    boostPads.forEach((bp) => {
      const bg = new THREE.Group();
      bg.position.set(bp.x, 0.02, bp.z);
      bg.rotation.y = bp.yaw;

      const basePlane = new THREE.Mesh(padBaseGeo, padBaseMat);
      basePlane.rotation.x = -Math.PI / 2;
      bg.add(basePlane);

      [-0.95, 0, 0.95].forEach((cz, idx) => {
        const barMat = track(
          new THREE.MeshBasicMaterial({
            color: idx % 2 === 0 ? 0x22d3ee : 0x34d399,
            transparent: true,
            opacity: 0.88,
          }),
        );
        boostBarMats.push(barMat);

        const leftWing = new THREE.Mesh(chevBarGeo, barMat);
        leftWing.position.set(-0.36, 0.015, cz - 0.16);
        leftWing.rotation.y = 0.55;
        bg.add(leftWing);

        const rightWing = new THREE.Mesh(chevBarGeo, barMat);
        rightWing.position.set(0.36, 0.015, cz - 0.16);
        rightWing.rotation.y = -0.55;
        bg.add(rightWing);
      });

      group.add(bg);
    });
  }

  // 4d. Checkpoint Laser / LED Arches (Kontrol Kapıları)
  const checkpoints = level.checkpoints ?? [];
  const checkpointRigs: Array<{
    id: string;
    pillarMat: THREE.MeshStandardMaterial;
    stripMat: THREE.MeshBasicMaterial;
  }> = [];
  if (checkpoints.length > 0) {
    const postGeo = track(new THREE.CylinderGeometry(0.11, 0.14, 2.75, 10));
    const postDarkMat = track(
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.6, roughness: 0.35 }),
    );
    const stripGeo = track(new THREE.PlaneGeometry(0.45, 0.32));

    checkpoints.forEach((cp) => {
      const cg = new THREE.Group();
      cg.position.set(cp.x, 0, cp.z);
      cg.rotation.y = cp.yaw;

      const pillarMat = track(
        new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          emissive: 0xf59e0b,
          emissiveIntensity: 1.5,
          roughness: 0.25,
        }),
      );
      const stripMat = track(
        new THREE.MeshBasicMaterial({
          color: 0xfbbf24,
          transparent: true,
          opacity: 0.32,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );

      const halfSpan = cp.width * 0.5;
      [-halfSpan, halfSpan].forEach((px) => {
        const post = new THREE.Mesh(postGeo, postDarkMat);
        post.position.set(px, 1.375, 0);
        post.castShadow = true;
        cg.add(post);

        const beacon = new THREE.Mesh(
          track(new THREE.BoxGeometry(0.28, 0.45, 0.28)),
          pillarMat,
        );
        beacon.position.set(px, 2.65, 0);
        cg.add(beacon);
      });

      const archBeam = new THREE.Mesh(
        track(new THREE.BoxGeometry(cp.width + 0.3, 0.18, 0.22)),
        pillarMat,
      );
      archBeam.position.set(0, 2.85, 0);
      cg.add(archBeam);

      const floorGate = new THREE.Mesh(stripGeo, stripMat);
      floorGate.scale.set(cp.width / 0.45, 1.6, 1);
      floorGate.rotation.x = -Math.PI / 2;
      floorGate.position.y = 0.02;
      cg.add(floorGate);

      group.add(cg);
      checkpointRigs.push({ id: cp.id, pillarMat, stripMat });
    });
  }

  // 4e. Realistic Cantilever Traffic Lights + Hooded 3-Aspect Lenses + EDS Pod + Asphalt Stop-Line LEDs
  interface TrafficRig {
    spec: NonNullable<LevelConfig['trafficLights']>[number];
    nsRedMat: THREE.MeshStandardMaterial;
    nsYellowMat: THREE.MeshStandardMaterial;
    nsGreenMat: THREE.MeshStandardMaterial;
    ewRedMat: THREE.MeshStandardMaterial;
    ewYellowMat: THREE.MeshStandardMaterial;
    ewGreenMat: THREE.MeshStandardMaterial;
    nsStopMat: THREE.MeshBasicMaterial;
    ewStopMat: THREE.MeshBasicMaterial;
    edsLensMat: THREE.MeshStandardMaterial;
  }
  const trafficRigs: TrafficRig[] = [];
  const trafficLights = level.trafficLights ?? [];
  if (trafficLights.length > 0) {
    const tlPoleMat = track(
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.72, roughness: 0.28 }),
    );
    const tlStripeMat = track(
      new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4, metalness: 0.2 }),
    );
    const tlHousingMat = track(
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.52, metalness: 0.35 }),
    );
    const tlPoleGeo = track(new THREE.CylinderGeometry(0.085, 0.115, 3.65, 10));
    const tlCollarGeo = track(new THREE.CylinderGeometry(0.14, 0.15, 0.42, 10));
    const tlArmGeo = track(new THREE.BoxGeometry(2.8, 0.12, 0.12));
    const tlBoxGeo = track(new THREE.BoxGeometry(0.48, 1.24, 0.42));
    const tlLensGeo = track(new THREE.CylinderGeometry(0.135, 0.135, 0.07, 16));
    const tlHoodGeo = track(
      new THREE.CylinderGeometry(0.155, 0.155, 0.18, 12, 1, true, -Math.PI / 2, Math.PI),
    );
    const tlHoodMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.55,
        metalness: 0.35,
        side: THREE.DoubleSide,
      }),
    );
    const tlStopGeo = track(new THREE.PlaneGeometry(3.15, 0.26));
    const edsBodyGeo = track(new THREE.BoxGeometry(0.28, 0.22, 0.34));
    const edsLensGeo = track(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 12));

    const makeLensMat = (hex: number) =>
      track(
        new THREE.MeshStandardMaterial({
          color: 0x0f172a,
          emissive: hex,
          emissiveIntensity: 0.02,
          roughness: 0.16,
          metalness: 0.08,
        }),
      );

    trafficLights.forEach((tl) => {
      const tg = new THREE.Group();
      tg.position.set(tl.x, 0, tl.z);

      const cornerOff = Math.min(3.55, tl.cellSize * 0.365);
      const stopDist = Math.min(4.45, tl.cellSize * 0.44);
      const initState = evaluateTrafficLightState(tl, 0);

      const nsRedMat = makeLensMat(0xff2a3c);
      const nsYellowMat = makeLensMat(0xffb703);
      const nsGreenMat = makeLensMat(0x10e58a);
      const ewRedMat = makeLensMat(0xff2a3c);
      const ewYellowMat = makeLensMat(0xffb703);
      const ewGreenMat = makeLensMat(0x10e58a);

      nsRedMat.emissiveIntensity = initState.ns === 'red' ? 3.8 : 0.02;
      nsYellowMat.emissiveIntensity = initState.ns === 'yellow' ? 3.8 : 0.02;
      nsGreenMat.emissiveIntensity = initState.ns === 'green' ? 3.8 : 0.02;
      ewRedMat.emissiveIntensity = initState.ew === 'red' ? 3.8 : 0.02;
      ewYellowMat.emissiveIntensity = initState.ew === 'yellow' ? 3.8 : 0.02;
      ewGreenMat.emissiveIntensity = initState.ew === 'green' ? 3.8 : 0.02;

      const edsLensMat = track(
        new THREE.MeshStandardMaterial({
          color: 0xe2e8f0,
          emissive: 0x38bdf8,
          emissiveIntensity: 0.25,
          roughness: 0.2,
        }),
      );

      const buildSignalHead = (
        redMat: THREE.MeshStandardMaterial,
        yellowMat: THREE.MeshStandardMaterial,
        greenMat: THREE.MeshStandardMaterial,
      ) => {
        const head = new THREE.Group();
        const box = new THREE.Mesh(tlBoxGeo, tlHousingMat);
        box.castShadow = true;
        head.add(box);

        const levels: Array<{ y: number; mat: THREE.MeshStandardMaterial }> = [
          { y: 0.36, mat: redMat },
          { y: 0, mat: yellowMat },
          { y: -0.36, mat: greenMat },
        ];
        levels.forEach(({ y, mat }) => {
          [-0.22, 0.22].forEach((zFace) => {
            const lens = new THREE.Mesh(tlLensGeo, mat);
            lens.rotation.x = Math.PI / 2;
            lens.position.set(0, y, zFace);
            head.add(lens);

            const hood = new THREE.Mesh(tlHoodGeo, tlHoodMat);
            hood.rotation.x = -Math.PI / 2;
            hood.position.set(0, y + 0.02, zFace + (zFace > 0 ? 0.09 : -0.09));
            head.add(hood);
          });
        });
        return head;
      };

      // Corner 1 (+X, +Z): Cantilever N/S Signal + EDS Enforcement Pod
      const p1 = new THREE.Group();
      p1.position.set(cornerOff, 0, cornerOff);
      const pole1 = new THREE.Mesh(tlPoleGeo, tlPoleMat);
      pole1.position.y = 1.825;
      pole1.castShadow = true;
      p1.add(pole1);
      const col1 = new THREE.Mesh(tlCollarGeo, tlStripeMat);
      col1.position.y = 0.21;
      p1.add(col1);

      const arm1 = new THREE.Mesh(tlArmGeo, tlPoleMat);
      arm1.position.set(-1.32, 3.55, 0);
      arm1.castShadow = true;
      p1.add(arm1);

      const nsHead = buildSignalHead(nsRedMat, nsYellowMat, nsGreenMat);
      nsHead.position.set(-2.3, 3.32, 0);
      p1.add(nsHead);

      // EDS Radar / Camera Pod on mast arm
      const edsBody = new THREE.Mesh(edsBodyGeo, tlHousingMat);
      edsBody.position.set(-1.25, 3.74, 0);
      p1.add(edsBody);
      const edsLens = new THREE.Mesh(edsLensGeo, edsLensMat);
      edsLens.rotation.x = Math.PI / 2;
      edsLens.position.set(-1.25, 3.74, -0.18);
      p1.add(edsLens);

      tg.add(p1);

      // Corner 2 (-X, -Z): Cantilever E/W Signal
      const p2 = new THREE.Group();
      p2.position.set(-cornerOff, 0, -cornerOff);
      const pole2 = new THREE.Mesh(tlPoleGeo, tlPoleMat);
      pole2.position.y = 1.825;
      pole2.castShadow = true;
      p2.add(pole2);
      const col2 = new THREE.Mesh(tlCollarGeo, tlStripeMat);
      col2.position.y = 0.21;
      p2.add(col2);

      const arm2 = new THREE.Mesh(tlArmGeo, tlPoleMat);
      arm2.rotation.y = Math.PI / 2;
      arm2.position.set(0, 3.55, 1.32);
      arm2.castShadow = true;
      p2.add(arm2);

      const ewHead = buildSignalHead(ewRedMat, ewYellowMat, ewGreenMat);
      ewHead.rotation.y = Math.PI / 2;
      ewHead.position.set(0, 3.32, 2.3);
      p2.add(ewHead);

      tg.add(p2);

      // Glowing Asphalt Stop-Line LED Strips on open approach legs (placed cleanly before crosswalk)
      const nsStopMat = track(
        new THREE.MeshBasicMaterial({
          color:
            initState.ns === 'red'
              ? 0xef4444
              : initState.ns === 'yellow'
                ? 0xf59e0b
                : 0x10b981,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
        }),
      );
      const ewStopMat = track(
        new THREE.MeshBasicMaterial({
          color:
            initState.ew === 'red'
              ? 0xef4444
              : initState.ew === 'yellow'
                ? 0xf59e0b
                : 0x10b981,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
        }),
      );

      if (tl.openN) {
        const sN = new THREE.Mesh(tlStopGeo, nsStopMat);
        sN.rotation.x = -Math.PI / 2;
        sN.position.set(0, 0.022, -stopDist);
        tg.add(sN);
      }
      if (tl.openS) {
        const sS = new THREE.Mesh(tlStopGeo, nsStopMat);
        sS.rotation.x = -Math.PI / 2;
        sS.position.set(0, 0.022, stopDist);
        tg.add(sS);
      }
      if (tl.openW) {
        const sW = new THREE.Mesh(tlStopGeo, ewStopMat);
        sW.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
        sW.position.set(-stopDist, 0.022, 0);
        tg.add(sW);
      }
      if (tl.openE) {
        const sE = new THREE.Mesh(tlStopGeo, ewStopMat);
        sE.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
        sE.position.set(stopDist, 0.022, 0);
        tg.add(sE);
      }

      group.add(tg);
      trafficRigs.push({
        spec: tl,
        nsRedMat,
        nsYellowMat,
        nsGreenMat,
        ewRedMat,
        ewYellowMat,
        ewGreenMat,
        nsStopMat,
        ewStopMat,
        edsLensMat,
      });
    });
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

  // 6. Compact Floodlight Beacons mounted flush ON Perimeter Wall Corners (nothing outside walls)
  if (!level.realWorld) {
    const poleGeo = track(new THREE.CylinderGeometry(0.09, 0.12, 1.85, 10));
    const poleMat = track(
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.35 }),
    );
    const lampHeadMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xfff7ed,
        emissive: 0xfde68a,
        emissiveIntensity: 1.8,
      }),
    );
    const lampHeadGeo = track(new THREE.BoxGeometry(0.55, 0.24, 0.35));
    const cornerX = (level.cols * level.cellSize) * 0.5;
    const cornerZ = (level.rows * level.cellSize) * 0.5;
    [
      [-cornerX, -cornerZ],
      [cornerX, -cornerZ],
      [-cornerX, cornerZ],
      [cornerX, cornerZ],
    ].forEach(([lx, lz]) => {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(lx, wallHeight + 0.22 + 0.92, lz);
      group.add(pole);

      const head = new THREE.Mesh(lampHeadGeo, lampHeadMat);
      head.position.set(lx, wallHeight + 0.22 + 1.85, lz);
      head.lookAt(0, 0, 0);
      group.add(head);
    });
  }

  // 6B. Special All-Vehicles Grand Prix Arena Showcase Architecture
  if (level.archetype === 'grand_prix_arena') {
    // Checkered Start Line Canvas Texture across Pit Straightaway
    const chkCanvas = document.createElement('canvas');
    chkCanvas.width = 128;
    chkCanvas.height = 512;
    const cctx = chkCanvas.getContext('2d')!;
    for (let row = 0; row < 16; row++) {
      for (let col = 0; col < 4; col++) {
        cctx.fillStyle = (row + col) % 2 === 0 ? '#f8fafc' : '#0f172a';
        cctx.fillRect(col * 32, row * 32, 32, 32);
      }
    }
    const chkTex = track(new THREE.CanvasTexture(chkCanvas));
    chkTex.colorSpace = THREE.SRGBColorSpace;
    const startLineMesh = new THREE.Mesh(
      track(new THREE.PlaneGeometry(1.5, level.cellSize - 2.6)),
      track(
        new THREE.MeshBasicMaterial({
          map: chkTex,
          polygonOffset: true,
          polygonOffsetFactor: -1,
        }),
      ),
    );
    startLineMesh.rotation.x = -Math.PI / 2;
    startLineMesh.position.set(level.spawn.x + 2.6, 0.017, level.spawn.z);
    group.add(startLineMesh);

    // Grand Prix Pit Start Gantry Arch
    const gpPylonMat = track(
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.72, roughness: 0.28 }),
    );
    const gpSignMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xf59e0b,
        emissiveIntensity: 1.85,
        roughness: 0.2,
      }),
    );
    const gpSpan = Math.min(6.8, level.cellSize - 2.2);
    const gantryGroup = new THREE.Group();
    gantryGroup.position.set(level.spawn.x + 4.4, 0, level.spawn.z);
    [-gpSpan * 0.5, gpSpan * 0.5].forEach((pz) => {
      const col = new THREE.Mesh(track(new THREE.BoxGeometry(0.32, 3.85, 0.32)), gpPylonMat);
      col.position.set(0, 1.925, pz);
      col.castShadow = true;
      gantryGroup.add(col);
    });
    const gpBeam = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.45, 0.42, gpSpan + 0.4)),
      gpPylonMat,
    );
    gpBeam.position.set(0, 3.85, 0);
    const gpLed = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.5, 0.2, gpSpan * 0.65)),
      gpSignMat,
    );
    gpLed.position.set(0, 3.85, 0);
    gantryGroup.add(gpBeam, gpLed);
    group.add(gantryGroup);

    // Red-White FIA Apex Curbs around Roundabout Islands & Pit Straightaway
    const curbTransforms: Array<{ x: number; z: number; yaw: number; red: boolean }> = [];
    (level.roundabouts ?? []).forEach((rb) => {
      const segs = 16;
      const ringR = rb.radius + 0.22;
      for (let s = 0; s < segs; s++) {
        const ang = (s / segs) * Math.PI * 2;
        curbTransforms.push({
          x: rb.x + Math.cos(ang) * ringR,
          z: rb.z + Math.sin(ang) * ringR,
          yaw: -ang,
          red: s % 2 === 0,
        });
      }

      // Golden Apex Monument Spire inside Roundabout Island
      const spire = new THREE.Mesh(
        track(new THREE.OctahedronGeometry(0.42, 0)),
        gpSignMat,
      );
      spire.position.set(rb.x, 1.35, rb.z);
      group.add(spire);
    });

    if (curbTransforms.length > 0) {
      const curbGeo = track(new THREE.BoxGeometry(0.28, 0.08, 0.68));
      const curbMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65 }));
      const curbInst = new THREE.InstancedMesh(curbGeo, curbMat, curbTransforms.length);
      const curbColor = new THREE.Color();
      curbTransforms.forEach((ct, i) => {
        dummy.position.set(ct.x, 0.04, ct.z);
        dummy.rotation.set(0, ct.yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        curbInst.setMatrixAt(i, dummy.matrix);
        curbInst.setColorAt(i, curbColor.setHex(ct.red ? 0xef4444 : 0xf8fafc));
      });
      curbInst.instanceMatrix.needsUpdate = true;
      if (curbInst.instanceColor) curbInst.instanceColor.needsUpdate = true;
      curbInst.computeBoundingSphere();
      group.add(curbInst);
    }
  }

  const update = (
    elapsedTime: number,
    parkProgress: number,
    parkQuality: number,
    collectedTokenIds: string[] = [],
    passedCheckpointIds: string[] = [],
    edsFlashTimer = 0,
  ) => {
    for (let i = 0; i < gateMeshes.length; i++) {
      const item = gateMeshes[i];
      const box = getMovingGateAABB(item.gate, elapsedTime);
      item.mesh.position.set(box.x, 0, box.z);
    }

    for (let i = 0; i < tokenMeshes.length; i++) {
      const tm = tokenMeshes[i];
      const collected = collectedTokenIds.includes(tm.id);
      tm.mesh.visible = !collected;
      if (!collected) {
        const core = tm.mesh.children[0];
        if (core) {
          core.rotation.y = elapsedTime * 2.4 + i;
          core.position.y = 1.15 + Math.sin(elapsedTime * 3.2 + i) * 0.22;
        }
      }
    }

    for (let i = 0; i < boostBarMats.length; i++) {
      const phase = (elapsedTime * 6.0 - (i % 3) * 0.9) % (Math.PI * 2);
      boostBarMats[i].opacity = 0.48 + 0.48 * Math.max(0, Math.sin(phase));
    }

    for (let i = 0; i < checkpointRigs.length; i++) {
      const rig = checkpointRigs[i];
      const passed = passedCheckpointIds.includes(rig.id);
      if (passed) {
        rig.pillarMat.color.setHex(0x10b981);
        rig.pillarMat.emissive.setHex(0x10b981);
        rig.pillarMat.emissiveIntensity = 1.9;
        rig.stripMat.color.setHex(0x34d399);
        rig.stripMat.opacity = 0.22;
      } else {
        rig.pillarMat.color.setHex(0xf59e0b);
        rig.pillarMat.emissive.setHex(0xf59e0b);
        rig.pillarMat.emissiveIntensity = 1.4 + Math.sin(elapsedTime * 4.0) * 0.35;
        rig.stripMat.color.setHex(0xfbbf24);
        rig.stripMat.opacity = 0.34;
      }
    }

    for (let i = 0; i < trafficRigs.length; i++) {
      const rig = trafficRigs[i];
      const st = evaluateTrafficLightState(rig.spec, elapsedTime);

      rig.nsRedMat.emissiveIntensity = st.ns === 'red' ? 3.8 : 0.02;
      rig.nsYellowMat.emissiveIntensity = st.ns === 'yellow' ? 3.8 : 0.02;
      rig.nsGreenMat.emissiveIntensity = st.ns === 'green' ? 3.8 : 0.02;
      rig.nsStopMat.color.setHex(
        st.ns === 'red' ? 0xef4444 : st.ns === 'yellow' ? 0xf59e0b : 0x10b981,
      );

      rig.ewRedMat.emissiveIntensity = st.ew === 'red' ? 3.8 : 0.02;
      rig.ewYellowMat.emissiveIntensity = st.ew === 'yellow' ? 3.8 : 0.02;
      rig.ewGreenMat.emissiveIntensity = st.ew === 'green' ? 3.8 : 0.02;
      rig.ewStopMat.color.setHex(
        st.ew === 'red' ? 0xef4444 : st.ew === 'yellow' ? 0xf59e0b : 0x10b981,
      );

      rig.edsLensMat.emissiveIntensity = edsFlashTimer > 0.02 ? 6.5 : 0.25;
      rig.edsLensMat.emissive.setHex(edsFlashTimer > 0.02 ? 0xffffff : 0x38bdf8);
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

    exteriorForest.update(elapsedTime);
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
