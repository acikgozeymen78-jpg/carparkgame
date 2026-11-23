import * as THREE from 'three';
import type { LevelConfig } from '../types/game';
import {
  EXTERIOR_BASE_GROUND_Y,
  generateExteriorSceneryPlan,
  getExteriorGroundY,
  getPlayableZoneMetrics,
  type FireflyOrigin,
} from './exteriorScenery';

export interface ExteriorSceneryHandle {
  update: (elapsedTime: number) => void;
}

function createForestMeadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Rich forest meadow green base
  ctx.fillStyle = '#245938';
  ctx.fillRect(0, 0, 512, 512);

  // Soft mossy patches & natural turf variation
  for (let i = 0; i < 160; i++) {
    const px = Math.abs((Math.sin(i * 19.31 + 1.7) * 43758.5453) % 1) * 512;
    const py = Math.abs((Math.sin(i * 67.13 + 3.1) * 19341.123) % 1) * 512;
    const rad = 14 + (i % 28);
    ctx.fillStyle =
      i % 3 === 0
        ? 'rgba(46, 125, 72, 0.26)'
        : i % 3 === 1
          ? 'rgba(24, 72, 46, 0.28)'
          : 'rgba(68, 148, 86, 0.18)';
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fine grass blades & clover/petal speckles
  for (let i = 0; i < 5200; i++) {
    const px = Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1) * 512;
    const py = Math.abs((Math.sin(i * 78.233) * 19341.123) % 1) * 512;
    if (i % 47 === 0) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(250, 204, 21, 0.45)' : 'rgba(244, 114, 182, 0.4)';
      ctx.fillRect(px, py, 2, 2);
    } else {
      const g = 78 + (i % 46);
      ctx.fillStyle = `rgb(${Math.round(g * 0.44)}, ${g + 22}, ${Math.round(g * 0.56)})`;
      ctx.fillRect(px, py, 2, 3);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(44, 44);
  return tex;
}

export function buildExteriorForest(
  level: LevelConfig,
  parentGroup: THREE.Group,
  track: <T extends { dispose: () => void }>(item: T) => T,
): ExteriorSceneryHandle {
  const forestGroup = new THREE.Group();
  parentGroup.add(forestGroup);

  const plan = generateExteriorSceneryPlan(level);
  const metrics = getPlayableZoneMetrics(level);
  const arenaW = metrics.halfArenaW * 2;
  const arenaD = metrics.halfArenaD * 2;

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  // 1. Lush Textured Forest Floor beneath the arena (y = -0.18 -> zero Z-fighting with y=0 deck)
  const meadowTex = track(createForestMeadowTexture());
  const groundSize = Math.max(360, plan.outerSpan * 2.8);
  const groundGeo = track(new THREE.PlaneGeometry(groundSize, groundSize));
  const groundMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: meadowTex,
      roughness: 0.92,
      metalness: 0.0,
      emissive: 0x091c11,
      emissiveIntensity: 0.16,
    }),
  );
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.y = EXTERIOR_BASE_GROUND_Y;
  groundMesh.receiveShadow = true;
  forestGroup.add(groundMesh);

  // 2. Architectural Stone Retaining Foundation + Gravel Shoulder around Playable Deck & Highway
  const plinthMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.85,
      metalness: 0.08,
    }),
  );
  const gravelMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x57534e,
      roughness: 0.95,
      metalness: 0.02,
      emissive: 0x0c0a09,
      emissiveIntensity: 0.12,
    }),
  );

  const mainPlinth = new THREE.Mesh(
    track(new THREE.BoxGeometry(arenaW + 0.7, 0.172, arenaD + 0.7)),
    plinthMat,
  );
  mainPlinth.position.set(0, -0.094, 0);
  mainPlinth.receiveShadow = true;
  forestGroup.add(mainPlinth);

  const mainShoulder = new THREE.Mesh(
    track(new THREE.BoxGeometry(arenaW + 3.4, 0.03, arenaD + 3.4)),
    gravelMat,
  );
  mainShoulder.position.set(0, EXTERIOR_BASE_GROUND_Y + 0.015, 0);
  mainShoulder.receiveShadow = true;
  forestGroup.add(mainShoulder);

  if (
    level.highwayExit &&
    metrics.hwMinX !== null &&
    metrics.hwMaxX !== null &&
    metrics.hwMinZ !== null &&
    metrics.hwMaxZ !== null
  ) {
    const hwW = metrics.hwMaxX - metrics.hwMinX;
    const hwD = metrics.hwMaxZ - metrics.hwMinZ;
    const hwCx = (metrics.hwMinX + metrics.hwMaxX) * 0.5;
    const hwCz = (metrics.hwMinZ + metrics.hwMaxZ) * 0.5;

    const hwPlinth = new THREE.Mesh(
      track(new THREE.BoxGeometry(hwW + 0.4, 0.172, hwD + 0.4)),
      plinthMat,
    );
    hwPlinth.position.set(hwCx, -0.094, hwCz);
    hwPlinth.receiveShadow = true;
    forestGroup.add(hwPlinth);

    const hwShoulder = new THREE.Mesh(
      track(new THREE.BoxGeometry(hwW + 2.8, 0.03, hwD + 2.8)),
      gravelMat,
    );
    hwShoulder.position.set(hwCx, EXTERIOR_BASE_GROUND_Y + 0.015, hwCz);
    hwShoulder.receiveShadow = true;
    forestGroup.add(hwShoulder);
  }

  // 3. Rolling Forest Hills & Distant Horizon Ridges (InstancedMesh)
  const hillGeo = track(
    new THREE.SphereGeometry(1, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.5),
  );
  const hillMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.0,
      emissive: 0x0b2115,
      emissiveIntensity: 0.18,
    }),
  );

  const allMounds = [...plan.hills, ...plan.ridges];
  if (allMounds.length > 0) {
    const hillInst = new THREE.InstancedMesh(hillGeo, hillMat, allMounds.length);
    hillInst.receiveShadow = true;
    allMounds.forEach((h, i) => {
      dummy.position.set(h.x, EXTERIOR_BASE_GROUND_Y - 0.04, h.z);
      dummy.rotation.set(0, (i * 0.9) % (Math.PI * 2), 0);
      dummy.scale.set(h.radius, h.height, h.radius);
      dummy.updateMatrix();
      hillInst.setMatrixAt(i, dummy.matrix);
      hillInst.setColorAt(i, color.setHex(h.colorHex));
    });
    hillInst.instanceMatrix.needsUpdate = true;
    if (hillInst.instanceColor) hillInst.instanceColor.needsUpdate = true;
    hillInst.computeBoundingSphere();
    forestGroup.add(hillInst);
  }

  // 4. Multi-Part Pine / Conifer Forests (4 synchronized InstancedMeshes)
  if (plan.pineTrees.length > 0) {
    const pineCount = plan.pineTrees.length;
    const barkMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.92,
        metalness: 0.02,
      }),
    );
    const pineNeedleMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.68,
        metalness: 0.04,
        emissive: 0x0a2617,
        emissiveIntensity: 0.22,
      }),
    );

    const pineTrunkGeo = track(new THREE.CylinderGeometry(0.16, 0.3, 2.35, 7));
    const pineTier1Geo = track(new THREE.ConeGeometry(1.7, 2.45, 7));
    const pineTier2Geo = track(new THREE.ConeGeometry(1.34, 2.15, 7));
    const pineTier3Geo = track(new THREE.ConeGeometry(0.88, 1.85, 7));

    const trunkInst = new THREE.InstancedMesh(pineTrunkGeo, barkMat, pineCount);
    const tier1Inst = new THREE.InstancedMesh(pineTier1Geo, pineNeedleMat, pineCount);
    const tier2Inst = new THREE.InstancedMesh(pineTier2Geo, pineNeedleMat, pineCount);
    const tier3Inst = new THREE.InstancedMesh(pineTier3Geo, pineNeedleMat, pineCount);

    trunkInst.castShadow = true;
    tier1Inst.castShadow = true;
    tier2Inst.castShadow = true;
    tier1Inst.receiveShadow = true;
    tier2Inst.receiveShadow = true;

    plan.pineTrees.forEach((t, i) => {
      const gy = getExteriorGroundY(t.x, t.z, plan.hills);
      const s = t.scale;

      dummy.position.set(t.x, gy + 1.12 * s, t.z);
      dummy.rotation.set(0, t.yaw, 0);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(i, dummy.matrix);
      trunkInst.setColorAt(i, color.setHex(t.trunkColorHex));

      dummy.position.set(t.x, gy + 2.82 * s, t.z);
      dummy.rotation.set(0, t.yaw, 0);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      tier1Inst.setMatrixAt(i, dummy.matrix);
      tier1Inst.setColorAt(i, color.setHex(t.crownColorHex));

      dummy.position.set(t.x, gy + 4.02 * s, t.z);
      dummy.rotation.set(0, t.yaw + 0.45, 0);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      tier2Inst.setMatrixAt(i, dummy.matrix);
      tier2Inst.setColorAt(i, color.setHex(t.crownColorHex).offsetHSL(0.01, 0.03, 0.03));

      dummy.position.set(t.x, gy + 5.15 * s, t.z);
      dummy.rotation.set(0, t.yaw - 0.42, 0);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      tier3Inst.setMatrixAt(i, dummy.matrix);
      tier3Inst.setColorAt(i, color.setHex(t.crownColorHex).offsetHSL(0.015, 0.05, 0.06));
    });

    [trunkInst, tier1Inst, tier2Inst, tier3Inst].forEach((inst) => {
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.computeBoundingSphere();
      forestGroup.add(inst);
    });
  }

  // 5. Multi-Part Colorful Broadleaf / Autumn / Blossom Trees (4 synchronized InstancedMeshes)
  if (plan.broadleafTrees.length > 0) {
    const bCount = plan.broadleafTrees.length;
    const broadBarkMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.9,
        metalness: 0.02,
      }),
    );
    const broadLeafMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.62,
        metalness: 0.04,
        emissive: 0x161412,
        emissiveIntensity: 0.22,
      }),
    );

    const bTrunkGeo = track(new THREE.CylinderGeometry(0.18, 0.34, 2.55, 7));
    const bCrownGeo = track(new THREE.DodecahedronGeometry(1.55, 1));
    const bSubAGeo = track(new THREE.DodecahedronGeometry(1.06, 1));
    const bSubBGeo = track(new THREE.DodecahedronGeometry(0.92, 1));

    const bTrunkInst = new THREE.InstancedMesh(bTrunkGeo, broadBarkMat, bCount);
    const bCrownInst = new THREE.InstancedMesh(bCrownGeo, broadLeafMat, bCount);
    const bSubAInst = new THREE.InstancedMesh(bSubAGeo, broadLeafMat, bCount);
    const bSubBInst = new THREE.InstancedMesh(bSubBGeo, broadLeafMat, bCount);

    bTrunkInst.castShadow = true;
    bCrownInst.castShadow = true;
    bCrownInst.receiveShadow = true;
    bSubAInst.castShadow = true;

    plan.broadleafTrees.forEach((t, i) => {
      const gy = getExteriorGroundY(t.x, t.z, plan.hills);
      const s = t.scale;
      const cosY = Math.cos(t.yaw);
      const sinY = Math.sin(t.yaw);

      dummy.position.set(t.x, gy + 1.22 * s, t.z);
      dummy.rotation.set(0, t.yaw, 0);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      bTrunkInst.setMatrixAt(i, dummy.matrix);
      bTrunkInst.setColorAt(i, color.setHex(t.trunkColorHex));

      dummy.position.set(t.x, gy + 3.45 * s, t.z);
      dummy.rotation.set(0.08, t.yaw, -0.06);
      dummy.scale.set(s * 1.12, s * 0.96, s * 1.04);
      dummy.updateMatrix();
      bCrownInst.setMatrixAt(i, dummy.matrix);
      bCrownInst.setColorAt(i, color.setHex(t.canopyColorHex));

      dummy.position.set(t.x + cosY * 0.92 * s, gy + 3.75 * s, t.z + sinY * 0.92 * s);
      dummy.rotation.set(-0.1, t.yaw + 0.9, 0.12);
      dummy.scale.set(s, s * 0.9, s);
      dummy.updateMatrix();
      bSubAInst.setMatrixAt(i, dummy.matrix);
      bSubAInst.setColorAt(i, color.setHex(t.canopyColorHex).offsetHSL(0.015, 0.04, 0.04));

      dummy.position.set(t.x - cosY * 0.85 * s, gy + 3.05 * s, t.z - sinY * 0.85 * s);
      dummy.rotation.set(0.14, t.yaw - 0.7, 0.08);
      dummy.scale.set(s, s * 0.88, s);
      dummy.updateMatrix();
      bSubBInst.setMatrixAt(i, dummy.matrix);
      bSubBInst.setColorAt(i, color.setHex(t.accentColorHex));
    });

    [bTrunkInst, bCrownInst, bSubAInst, bSubBInst].forEach((inst) => {
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.computeBoundingSphere();
      forestGroup.add(inst);
    });
  }

  // 6. Flowering Shrubs & Berry Bushes (3 synchronized InstancedMeshes)
  if (plan.shrubs.length > 0) {
    const sCount = plan.shrubs.length;
    const shrubLeafMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.76,
        emissive: 0x0c2416,
        emissiveIntensity: 0.18,
      }),
    );
    const blossomMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.45,
        emissive: 0x241422,
        emissiveIntensity: 0.35,
      }),
    );

    const sBaseGeo = track(new THREE.DodecahedronGeometry(0.78, 1));
    const sSideGeo = track(new THREE.DodecahedronGeometry(0.54, 1));
    const sBlossomGeo = track(new THREE.IcosahedronGeometry(0.24, 0));

    const sBaseInst = new THREE.InstancedMesh(sBaseGeo, shrubLeafMat, sCount);
    const sSideInst = new THREE.InstancedMesh(sSideGeo, shrubLeafMat, sCount);
    const sBlossomInst = new THREE.InstancedMesh(sBlossomGeo, blossomMat, sCount);

    plan.shrubs.forEach((sh, i) => {
      const gy = getExteriorGroundY(sh.x, sh.z, plan.hills);
      const s = sh.scale;
      const cx = Math.cos(sh.yaw);
      const sz = Math.sin(sh.yaw);

      dummy.position.set(sh.x, gy + 0.42 * s, sh.z);
      dummy.rotation.set(0, sh.yaw, 0);
      dummy.scale.set(s * 1.12, s * 0.74, s);
      dummy.updateMatrix();
      sBaseInst.setMatrixAt(i, dummy.matrix);
      sBaseInst.setColorAt(i, color.setHex(sh.leafColorHex));

      dummy.position.set(sh.x + cx * 0.56 * s, gy + 0.32 * s, sh.z + sz * 0.56 * s);
      dummy.rotation.set(0.15, sh.yaw + 0.7, 0);
      dummy.scale.set(s, s * 0.78, s);
      dummy.updateMatrix();
      sSideInst.setMatrixAt(i, dummy.matrix);
      sSideInst.setColorAt(i, color.setHex(sh.leafColorHex).offsetHSL(0.02, 0.04, 0.04));

      dummy.position.set(sh.x + cx * 0.14 * s, gy + 0.86 * s, sh.z + sz * 0.14 * s);
      dummy.rotation.set(0, sh.yaw, 0);
      dummy.scale.set(s * 1.25, s * 0.7, s * 1.25);
      dummy.updateMatrix();
      sBlossomInst.setMatrixAt(i, dummy.matrix);
      sBlossomInst.setColorAt(i, color.setHex(sh.blossomColorHex));
    });

    [sBaseInst, sSideInst, sBlossomInst].forEach((inst) => {
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.computeBoundingSphere();
      forestGroup.add(inst);
    });
  }

  // 7. Colorful Wildflower Patches (2 synchronized InstancedMeshes)
  if (plan.wildflowers.length > 0) {
    const fCount = plan.wildflowers.length;
    const stemMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x2f855a,
        roughness: 0.8,
        emissive: 0x0a2216,
        emissiveIntensity: 0.18,
      }),
    );
    const petalMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.4,
        emissive: 0x261d14,
        emissiveIntensity: 0.42,
      }),
    );

    const stemGeo = track(new THREE.ConeGeometry(0.28, 0.24, 5));
    const petalGeo = track(new THREE.IcosahedronGeometry(0.22, 0));

    const stemInst = new THREE.InstancedMesh(stemGeo, stemMat, fCount);
    const petalInst = new THREE.InstancedMesh(petalGeo, petalMat, fCount);

    plan.wildflowers.forEach((wf, i) => {
      const gy = getExteriorGroundY(wf.x, wf.z, plan.hills);
      const s = wf.scale;

      dummy.position.set(wf.x, gy + 0.1 * s, wf.z);
      dummy.rotation.set(0, wf.yaw, 0);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      stemInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(wf.x, gy + 0.24 * s, wf.z);
      dummy.rotation.set(0, wf.yaw + 0.3, 0);
      dummy.scale.set(s * 1.35, s * 0.55, s * 1.35);
      dummy.updateMatrix();
      petalInst.setMatrixAt(i, dummy.matrix);
      petalInst.setColorAt(i, color.setHex(wf.flowerColorHex));
    });

    [stemInst, petalInst].forEach((inst) => {
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.computeBoundingSphere();
      forestGroup.add(inst);
    });
  }

  // 8. Mossy Granite Boulder Clusters (2 synchronized InstancedMeshes)
  if (plan.rocks.length > 0) {
    const rCount = plan.rocks.length;
    const rockMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.88,
        metalness: 0.08,
      }),
    );
    const mainRockGeo = track(new THREE.DodecahedronGeometry(0.95, 0));
    const subRockGeo = track(new THREE.DodecahedronGeometry(0.6, 0));

    const rockInst = new THREE.InstancedMesh(mainRockGeo, rockMat, rCount);
    const subRockInst = new THREE.InstancedMesh(subRockGeo, rockMat, rCount);
    rockInst.castShadow = true;
    rockInst.receiveShadow = true;

    plan.rocks.forEach((rk, i) => {
      const gy = getExteriorGroundY(rk.x, rk.z, plan.hills);
      dummy.position.set(rk.x, gy + rk.sy * 0.36, rk.z);
      dummy.rotation.set(0.18, rk.yaw, -0.12);
      dummy.scale.set(rk.sx, rk.sy, rk.sz);
      dummy.updateMatrix();
      rockInst.setMatrixAt(i, dummy.matrix);
      rockInst.setColorAt(i, color.setHex(rk.colorHex));

      const ox = Math.cos(rk.yaw + 0.8) * rk.sx * 0.85;
      const oz = Math.sin(rk.yaw + 0.8) * rk.sz * 0.85;
      dummy.position.set(rk.x + ox, gy + rk.sy * 0.22, rk.z + oz);
      dummy.rotation.set(-0.2, rk.yaw * 1.4, 0.22);
      dummy.scale.set(rk.sx * 0.72, rk.sy * 0.68, rk.sz * 0.72);
      dummy.updateMatrix();
      subRockInst.setMatrixAt(i, dummy.matrix);
      subRockInst.setColorAt(i, color.setHex(rk.colorHex).offsetHSL(0.06, 0.04, -0.04));
    });

    [rockInst, subRockInst].forEach((inst) => {
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.computeBoundingSphere();
      forestGroup.add(inst);
    });
  }

  // 9. Rustic Timber Trail Posts & Warm Amber Lanterns ringing the forest perimeter
  if (plan.trailPosts.length > 0) {
    const pCount = plan.trailPosts.length;
    const timberMat = track(
      new THREE.MeshStandardMaterial({ color: 0x6b442a, roughness: 0.86, metalness: 0.04 }),
    );
    const lanternCapMat = track(
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.55 }),
    );
    const lanternGlowMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xffedd5,
        emissive: 0xf59e0b,
        emissiveIntensity: 2.0,
        roughness: 0.22,
      }),
    );

    const postGeo = track(new THREE.CylinderGeometry(0.11, 0.14, 1.45, 7));
    const capGeo = track(new THREE.ConeGeometry(0.24, 0.18, 6));
    const globeGeo = track(new THREE.SphereGeometry(0.15, 8, 6));

    const postInst = new THREE.InstancedMesh(postGeo, timberMat, pCount);
    const lanternCount = plan.trailPosts.filter((p) => p.hasLantern).length;
    const capInst =
      lanternCount > 0 ? new THREE.InstancedMesh(capGeo, lanternCapMat, lanternCount) : null;
    const globeInst =
      lanternCount > 0 ? new THREE.InstancedMesh(globeGeo, lanternGlowMat, lanternCount) : null;

    let lIdx = 0;
    plan.trailPosts.forEach((tp, i) => {
      const baseH = tp.hasLantern ? 1.35 : 0.72;
      dummy.position.set(tp.x, EXTERIOR_BASE_GROUND_Y + baseH * 0.5, tp.z);
      dummy.rotation.set(0, tp.yaw, 0);
      dummy.scale.set(1, tp.hasLantern ? 1.25 : 0.65, 1);
      dummy.updateMatrix();
      postInst.setMatrixAt(i, dummy.matrix);

      if (tp.hasLantern && capInst && globeInst) {
        dummy.position.set(tp.x, EXTERIOR_BASE_GROUND_Y + 1.66, tp.z);
        dummy.rotation.set(0, tp.yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        globeInst.setMatrixAt(lIdx, dummy.matrix);

        dummy.position.set(tp.x, EXTERIOR_BASE_GROUND_Y + 1.84, tp.z);
        dummy.updateMatrix();
        capInst.setMatrixAt(lIdx, dummy.matrix);
        lIdx++;
      }
    });

    postInst.instanceMatrix.needsUpdate = true;
    postInst.computeBoundingSphere();
    forestGroup.add(postInst);

    if (capInst && globeInst) {
      capInst.instanceMatrix.needsUpdate = true;
      capInst.computeBoundingSphere();
      globeInst.instanceMatrix.needsUpdate = true;
      globeInst.computeBoundingSphere();
      forestGroup.add(globeInst);
      forestGroup.add(capInst);
    }

    // Wooden fence rails connecting neighboring trail posts
    const railTransforms: Array<{ x: number; z: number; yaw: number; len: number }> = [];
    for (let i = 0; i < plan.trailPosts.length; i++) {
      const a = plan.trailPosts[i];
      for (let j = i + 1; j < plan.trailPosts.length; j++) {
        const b = plan.trailPosts[j];
        const dist = Math.hypot(b.x - a.x, b.z - a.z);
        if (dist > 3.0 && dist < 11.2) {
          const midX = (a.x + b.x) * 0.5;
          const midZ = (a.z + b.z) * 0.5;
          // Ensure rail midpoint is strictly clear of playable zones
          const minDx = Math.max(0, Math.abs(midX) - metrics.halfArenaW);
          const minDz = Math.max(0, Math.abs(midZ) - metrics.halfArenaD);
          if (Math.hypot(minDx, minDz) >= 2.0) {
            railTransforms.push({
              x: midX,
              z: midZ,
              yaw: Math.atan2(b.x - a.x, b.z - a.z),
              len: dist,
            });
          }
        }
      }
    }
    if (railTransforms.length > 0) {
      const railGeo = track(new THREE.BoxGeometry(0.1, 0.1, 1));
      const railInst = new THREE.InstancedMesh(railGeo, timberMat, railTransforms.length);
      railTransforms.forEach((rt, idx) => {
        dummy.position.set(rt.x, EXTERIOR_BASE_GROUND_Y + 0.65, rt.z);
        dummy.rotation.set(0, rt.yaw, 0);
        dummy.scale.set(1, 1, rt.len);
        dummy.updateMatrix();
        railInst.setMatrixAt(idx, dummy.matrix);
      });
      railInst.instanceMatrix.needsUpdate = true;
      railInst.computeBoundingSphere();
      forestGroup.add(railInst);
    }
  }

  // 10. Scenic Forest Pond with Stone Bank, Lily Pads & Cattail Reeds
  let pondWaterMat: THREE.MeshStandardMaterial | null = null;
  if (plan.pond) {
    const p = plan.pond;
    const pondGroup = new THREE.Group();
    pondGroup.position.set(p.x, EXTERIOR_BASE_GROUND_Y, p.z);
    pondGroup.rotation.y = p.yaw;

    const bankGeo = track(new THREE.CylinderGeometry(1.06, 1.15, 0.08, 24));
    const bankMat = track(new THREE.MeshStandardMaterial({ color: 0x6b675e, roughness: 0.92 }));
    const bankMesh = new THREE.Mesh(bankGeo, bankMat);
    bankMesh.scale.set(p.radiusX, 1, p.radiusZ);
    bankMesh.position.y = 0.03;
    pondGroup.add(bankMesh);

    const waterGeo = track(new THREE.CircleGeometry(1, 24));
    pondWaterMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x1d70a8,
        roughness: 0.12,
        metalness: 0.22,
        emissive: 0x0b3454,
        emissiveIntensity: 0.35,
      }),
    );
    const waterMesh = new THREE.Mesh(waterGeo, pondWaterMat);
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.scale.set(p.radiusX * 0.96, p.radiusZ * 0.96, 1);
    waterMesh.position.y = 0.075;
    pondGroup.add(waterMesh);

    // Shoreline pebbles + lily pads
    const pebbleGeo = track(new THREE.DodecahedronGeometry(0.45, 0));
    const pebbleMat = track(new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.85 }));
    for (let k = 0; k < 14; k++) {
      const ang = (k / 14) * Math.PI * 2;
      const peb = new THREE.Mesh(pebbleGeo, pebbleMat);
      peb.position.set(
        Math.cos(ang) * p.radiusX * 1.03,
        0.14,
        Math.sin(ang) * p.radiusZ * 1.03,
      );
      peb.scale.set(0.9 + (k % 3) * 0.3, 0.55, 0.8 + ((k + 1) % 3) * 0.25);
      peb.rotation.y = ang;
      pondGroup.add(peb);
    }

    const lilyGeo = track(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 10));
    const lilyMat = track(
      new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.5, emissive: 0x0b2d18, emissiveIntensity: 0.2 }),
    );
    for (let k = 0; k < 5; k++) {
      const ang = k * 1.25 + 0.4;
      const dist = 0.38 + (k % 2) * 0.22;
      const lily = new THREE.Mesh(lilyGeo, lilyMat);
      lily.position.set(
        Math.cos(ang) * p.radiusX * dist,
        0.095,
        Math.sin(ang) * p.radiusZ * dist,
      );
      pondGroup.add(lily);
    }

    forestGroup.add(pondGroup);
  }

  // 11. Cozy Multi-Part Timber Forest Cabins & Watchtowers
  if (plan.cabins.length > 0) {
    const stoneBaseMat = track(new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9 }));
    const timberWallMat = track(new THREE.MeshStandardMaterial({ color: 0x855331, roughness: 0.84 }));
    const trimWoodMat = track(new THREE.MeshStandardMaterial({ color: 0x4a2f1d, roughness: 0.88 }));
    const warmWindowMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xfef3c7,
        emissive: 0xf59e0b,
        emissiveIntensity: 1.75,
        roughness: 0.2,
      }),
    );

    plan.cabins.forEach((cb) => {
      const cg = new THREE.Group();
      cg.position.set(cb.x, EXTERIOR_BASE_GROUND_Y, cb.z);
      cg.rotation.y = cb.yaw;

      const roofMat = track(
        new THREE.MeshStandardMaterial({ color: cb.roofColorHex, roughness: 0.65, metalness: 0.1 }),
      );

      if (cb.variant === 'watchtower') {
        // Elevated Timber Forest Ranger Watchtower (8+ distinct parts)
        const base = new THREE.Mesh(track(new THREE.BoxGeometry(3.8, 0.45, 3.8)), stoneBaseMat);
        base.position.y = 0.225;
        cg.add(base);

        const legGeo = track(new THREE.BoxGeometry(0.32, 3.6, 0.32));
        [
          [-1.35, -1.35],
          [1.35, -1.35],
          [-1.35, 1.35],
          [1.35, 1.35],
        ].forEach(([lx, lz]) => {
          const leg = new THREE.Mesh(legGeo, trimWoodMat);
          leg.position.set(lx, 2.2, lz);
          leg.castShadow = true;
          cg.add(leg);
        });

        const deck = new THREE.Mesh(track(new THREE.BoxGeometry(4.1, 0.28, 4.1)), timberWallMat);
        deck.position.y = 3.95;
        cg.add(deck);

        const room = new THREE.Mesh(track(new THREE.BoxGeometry(2.8, 2.1, 2.8)), timberWallMat);
        room.position.y = 5.1;
        room.castShadow = true;
        cg.add(room);

        // Wrap-around glowing lookout windows
        const win = new THREE.Mesh(track(new THREE.BoxGeometry(2.88, 0.85, 2.88)), warmWindowMat);
        win.position.y = 5.25;
        cg.add(win);

        const roof = new THREE.Mesh(track(new THREE.ConeGeometry(2.85, 1.75, 4)), roofMat);
        roof.position.y = 7.0;
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        cg.add(roof);
      } else {
        // Cozy Timber Woodland Cabin (9+ distinct parts)
        const foundation = new THREE.Mesh(track(new THREE.BoxGeometry(5.2, 0.42, 4.2)), stoneBaseMat);
        foundation.position.y = 0.21;
        cg.add(foundation);

        const body = new THREE.Mesh(track(new THREE.BoxGeometry(4.4, 2.4, 3.4)), timberWallMat);
        body.position.y = 1.6;
        body.castShadow = true;
        body.receiveShadow = true;
        cg.add(body);

        const roof = new THREE.Mesh(track(new THREE.ConeGeometry(3.85, 1.85, 4)), roofMat);
        roof.position.y = 3.7;
        roof.rotation.y = Math.PI / 4;
        roof.scale.set(1.18, 1, 0.94);
        roof.castShadow = true;
        cg.add(roof);

        const chimney = new THREE.Mesh(track(new THREE.BoxGeometry(0.55, 1.8, 0.55)), stoneBaseMat);
        chimney.position.set(1.3, 3.85, -0.7);
        cg.add(chimney);

        const door = new THREE.Mesh(track(new THREE.BoxGeometry(0.95, 1.75, 0.14)), trimWoodMat);
        door.position.set(0, 1.3, 1.72);
        cg.add(door);

        const winGeo = track(new THREE.BoxGeometry(0.82, 0.78, 0.14));
        [
          [-1.35, 1.75, 1.72],
          [1.35, 1.75, 1.72],
        ].forEach(([wx, wy, wz]) => {
          const w = new THREE.Mesh(winGeo, warmWindowMat);
          w.position.set(wx, wy, wz);
          cg.add(w);
        });

        const sideWinGeo = track(new THREE.BoxGeometry(0.14, 0.78, 0.92));
        [-2.22, 2.22].forEach((sx) => {
          const sw = new THREE.Mesh(sideWinGeo, warmWindowMat);
          sw.position.set(sx, 1.75, 0);
          cg.add(sw);
        });
      }

      forestGroup.add(cg);
    });
  }

  // 12. Subtle Animated Forest Fireflies drifting gently near perimeter trees
  let fireflyInst: THREE.InstancedMesh | null = null;
  const fireflyOrigins: FireflyOrigin[] = plan.fireflies;
  if (fireflyOrigins.length > 0) {
    const ffGeo = track(new THREE.IcosahedronGeometry(0.13, 0));
    const ffMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    fireflyInst = new THREE.InstancedMesh(ffGeo, ffMat, fireflyOrigins.length);
    fireflyInst.frustumCulled = false;
    fireflyOrigins.forEach((f, i) => {
      dummy.position.set(f.x, f.y, f.z);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      fireflyInst!.setMatrixAt(i, dummy.matrix);
      fireflyInst!.setColorAt(i, color.setHex(f.colorHex));
    });
    fireflyInst.instanceMatrix.needsUpdate = true;
    if (fireflyInst.instanceColor) fireflyInst.instanceColor.needsUpdate = true;
    fireflyInst.computeBoundingSphere();
    forestGroup.add(fireflyInst);
  }

  const update = (elapsedTime: number) => {
    if (fireflyInst) {
      for (let i = 0; i < fireflyOrigins.length; i++) {
        const f = fireflyOrigins[i];
        const t = elapsedTime * 1.4 + f.phase;
        dummy.position.set(
          f.x + Math.sin(t) * 0.85,
          f.y + Math.sin(t * 1.6) * 0.35,
          f.z + Math.cos(t * 0.9) * 0.85,
        );
        const pulse = 0.65 + 0.55 * Math.sin(t * 2.4);
        dummy.scale.setScalar(pulse);
        dummy.updateMatrix();
        fireflyInst.setMatrixAt(i, dummy.matrix);
      }
      fireflyInst.instanceMatrix.needsUpdate = true;
    }
    if (pondWaterMat) {
      pondWaterMat.emissiveIntensity = 0.32 + Math.sin(elapsedTime * 1.8) * 0.06;
    }
  };

  return { update };
}
