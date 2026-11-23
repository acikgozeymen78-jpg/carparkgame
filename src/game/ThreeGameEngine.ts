import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type {
  ArenaTheme,
  ApproachingTrafficLightState,
  CameraMode,
  CarState,
  CourseArchetype,
  GamePhase,
  LevelConfig,
  NearestWallHit,
  OverlayScreen,
  PlayerPose,
  TrafficAlertBanner,
  TrafficPenaltyRecord,
  UltrasonicSensors,
  VehicleCustomization,
  VehicleModelId,
} from '../types/game';
import { createProceduralTextures } from './textures';
import { buildProceduralCar, type CarRig } from './carBuilder';
import { buildLabyrinthArena, type ArenaHandle } from './arenaBuilder';
import {
  computeUltrasonicSensors,
  createInitialCarState,
  stepCarPhysics,
  type CarInput,
} from './physics';
import { detectNearestWalls } from './minimap';
import { MAX_PENALTY_POINTS, resolveApproachingTrafficLight } from './trafficLights';
import { VEHICLE_SPECS, resolveVehicleModel } from './vehicles';
import type { SoundEngine } from './audio';

export interface HudTelemetry {
  speedKmh: number;
  elapsedTime: number;
  timeLimit: number;
  collisions: number;
  maxCollisions: number;
  parkProgress: number;
  parkQuality: number;
  distanceToBay: number;
  gear: 'P' | 'R' | 'N' | 'D';
  turboEnergy: number;
  turboActive: boolean;
  boostPadActive: boolean;
  isDrifting: boolean;
  comboCount: number;
  checkpointsPassed: number;
  totalCheckpoints: number;
  passedCheckpointIds: string[];
  gridSizeLabel: string;
  headlightsOn: boolean;
  tokensCollected: number;
  totalTokens: number;
  bonusScore: number;
  bonusTimeSec: number;
  steerAngle: number;
  ultrasonic: UltrasonicSensors;
  playerPose: PlayerPose;
  nearestWalls: NearestWallHit[];
  collectedTokenIds: string[];
  archetype?: CourseArchetype;
  penaltyScore: number;
  penaltyTimeSec: number;
  penaltyPoints: number;
  maxPenaltyPoints: number;
  violationCount: number;
  approachingSignal: ApproachingTrafficLightState | null;
  activeTrafficAlert: TrafficAlertBanner | null;
  edsFlashActive: boolean;
  vehicleModel: VehicleModelId;
  hoverY: number;
  hoverEnergy: number;
  hoverActive: boolean;
}

export interface RearCameraRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface EngineCallbacks {
  onTelemetry: (t: HudTelemetry) => void;
  onFinish: (outcome: {
    victory: boolean;
    reason: 'parked' | 'wrecked' | 'timeout' | 'penalty_limit';
    elapsedTime: number;
    collisions: number;
    reverseParked: boolean;
    tokensCollected: number;
    totalTokens: number;
    bonusScore: number;
    penaltyScore: number;
    penaltyTimeSec: number;
    penaltyPoints: number;
    violationCount: number;
    penalties: TrafficPenaltyRecord[];
  }) => void;
}

interface ParticleSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
  isSpark: boolean;
}

const PARTICLE_COUNT = 96;
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _vec3C = new THREE.Vector3();
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export class ThreeGameEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private rearCamera: THREE.PerspectiveCamera;
  private rearCamRect: RearCameraRect | null = null;
  private isSoftwareGl: boolean;
  private textures: ReturnType<typeof createProceduralTextures>;
  private carRig: CarRig;
  private arena: ArenaHandle | null = null;
  private hemiLight: THREE.HemisphereLight;
  private keyLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private arenaTheme: ArenaTheme = 'night';

  private particleMesh: THREE.InstancedMesh;
  private particles: ParticleSlot[] = [];
  private particleCursor = 0;

  private raycaster = new THREE.Raycaster();
  private callbacks: EngineCallbacks;
  private sound: SoundEngine;

  private phase: GamePhase = 'title';
  private overlay: OverlayScreen = 'none';
  private cameraMode: CameraMode = 'chase';
  private vehicleModel: VehicleModelId = 'sport_gt';
  private level: LevelConfig;
  private carState: CarState;
  private elapsedTime = 0;
  private simClockTime = 0;
  private hitstopTimer = 0;
  private trauma = 0;
  private finishTriggered = false;
  private lastHudEmit = 0;
  private tireSmokeAccum = 0;
  private headlightsOn = true;

  // Camera damping state
  private camPos = new THREE.Vector3(0, 6, -10);
  private camLook = new THREE.Vector3(0, 0.8, 0);

  // Input state
  private keysPressed = new Set<string>();
  private touchInput: CarInput = {
    throttle: false,
    brake: false,
    left: false,
    right: false,
    handbrake: false,
    turbo: false,
    hover: false,
  };

  private frameId = 0;
  private lastFrameMs = 0;
  private disposed = false;

  constructor(
    container: HTMLElement,
    initialLevel: LevelConfig,
    initialCustom: VehicleCustomization,
    sound: SoundEngine,
    callbacks: EngineCallbacks,
  ) {
    this.container = container;
    this.level = initialLevel;
    this.sound = sound;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareGl();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(container.clientWidth || 1280, container.clientHeight || 720);

    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x162033);
    this.scene.fog = new THREE.FogExp2(0x162033, 0.0072);

    const aspect = (container.clientWidth || 1280) / Math.max(1, container.clientHeight || 720);
    this.camera = new THREE.PerspectiveCamera(58, aspect, 0.2, 260);
    this.rearCamera = new THREE.PerspectiveCamera(80, 16 / 10, 0.2, 130);

    // Mandatory studio environment map via RoomEnvironment
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Warm/cool 3-point lighting rig
    this.hemiLight = new THREE.HemisphereLight(0x8bb8e8, 0x262c3a, 0.9);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xfff0d4, 2.2);
    this.keyLight.position.set(28, 40, 24);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 2;
    this.keyLight.shadow.camera.far = 135;
    this.keyLight.shadow.camera.left = -62;
    this.keyLight.shadow.camera.right = 62;
    this.keyLight.shadow.camera.top = 62;
    this.keyLight.shadow.camera.bottom = -62;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.65);
    this.rimLight.position.set(-22, 16, -24);
    this.scene.add(this.rimLight);

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso);

    // Build Car with detailed interior cockpit
    this.vehicleModel = resolveVehicleModel(initialCustom.model);
    this.carRig = buildProceduralCar(
      initialCustom,
      this.textures.contactShadowMap,
      maxAniso,
    );
    this.scene.add(this.carRig.root);

    // Zero-GC particle pool
    const pGeo = new THREE.IcosahedronGeometry(0.18, 0);
    const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.particleMesh = new THREE.InstancedMesh(pGeo, pMat, PARTICLE_COUNT);
    this.particleMesh.frustumCulled = false;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        scale: 0,
        isSpark: false,
      });
      _dummy.position.set(0, -50, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
      this.particleMesh.setColorAt(i, _color.setHex(0xffffff));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.particleMesh);

    this.carState = createInitialCarState(initialLevel);
    this.loadLevel(initialLevel);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.renderer.render(this.scene, this.camera);
    this.lastFrameMs = performance.now();
    this.scheduleNextFrame();
  }

  public setCallbacks(callbacks: EngineCallbacks): void {
    this.callbacks = callbacks;
  }

  public setCustomization(custom: VehicleCustomization): void {
    this.vehicleModel = resolveVehicleModel(custom.model);
    this.carRig.applyCustomization(custom);
    this.emitHud(true);
  }

  public setPhase(phase: GamePhase, overlay: OverlayScreen = 'none'): void {
    this.phase = phase;
    this.overlay = overlay;
    if (phase !== 'playing') {
      this.keysPressed.clear();
      this.resetTouchInput();
      this.sound.stopEngineLoop();
    } else {
      this.sound.startEngineLoop();
    }
    this.syncCockpitVisibility();
  }

  public setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
    this.syncCockpitVisibility();
  }

  private syncCockpitVisibility(): void {
    const active =
      this.phase === 'playing' &&
      this.overlay === 'none' &&
      this.cameraMode === 'cockpit';
    this.carRig.setCockpitViewActive(active);
  }

  public setRearCameraRect(rect: RearCameraRect | null): void {
    this.rearCamRect = rect;
  }

  public setTheme(theme: ArenaTheme): void {
    this.arenaTheme = theme;
    if (theme === 'sunset') {
      this.scene.background = new THREE.Color(0x2a1b30);
      this.scene.fog = new THREE.FogExp2(0x2a1b30, 0.0068);
      this.hemiLight.color.setHex(0xfdba74);
      this.hemiLight.groundColor.setHex(0x2d1f36);
      this.hemiLight.intensity = 1.05;
      this.keyLight.color.setHex(0xffb86c);
      this.keyLight.intensity = 2.4;
      this.rimLight.color.setHex(0xf472b6);
    } else if (theme === 'twilight') {
      this.scene.background = new THREE.Color(0x132a3a);
      this.scene.fog = new THREE.FogExp2(0x132a3a, 0.0065);
      this.hemiLight.color.setHex(0xbae6fd);
      this.hemiLight.groundColor.setHex(0x1e293b);
      this.hemiLight.intensity = 1.15;
      this.keyLight.color.setHex(0xe0f2fe);
      this.keyLight.intensity = 2.35;
      this.rimLight.color.setHex(0x34d399);
    } else {
      this.scene.background = new THREE.Color(0x162033);
      this.scene.fog = new THREE.FogExp2(0x162033, 0.0072);
      this.hemiLight.color.setHex(0x8bb8e8);
      this.hemiLight.groundColor.setHex(0x262c3a);
      this.hemiLight.intensity = 0.9;
      this.keyLight.color.setHex(0xfff0d4);
      this.keyLight.intensity = 2.2;
      this.rimLight.color.setHex(0x7dd3fc);
    }
  }

  public cycleTheme(): ArenaTheme {
    const order: ArenaTheme[] = ['night', 'sunset', 'twilight'];
    const next = order[(order.indexOf(this.arenaTheme) + 1) % order.length];
    this.setTheme(next);
    return next;
  }

  public cycleCameraMode(): CameraMode {
    const order: CameraMode[] = ['chase', 'cockpit', 'top', 'hood'];
    const idx = order.indexOf(this.cameraMode);
    this.cameraMode = order[(idx + 1) % order.length];
    this.syncCockpitVisibility();
    return this.cameraMode;
  }

  public toggleCockpitMode(): CameraMode {
    this.cameraMode = this.cameraMode === 'cockpit' ? 'chase' : 'cockpit';
    this.syncCockpitVisibility();
    return this.cameraMode;
  }

  public toggleHeadlights(): boolean {
    this.headlightsOn = !this.headlightsOn;
    this.carRig.setHeadlightsEnabled(this.headlightsOn);
    this.emitHud(true);
    return this.headlightsOn;
  }

  public setTouchControl(key: keyof CarInput, pressed: boolean): void {
    this.touchInput[key] = pressed;
  }

  public resetTouchInput(): void {
    this.touchInput.throttle = false;
    this.touchInput.brake = false;
    this.touchInput.left = false;
    this.touchInput.right = false;
    this.touchInput.handbrake = false;
    this.touchInput.turbo = false;
    this.touchInput.hover = false;
  }

  public loadLevel(level: LevelConfig): void {
    this.level = level;
    if (this.arena) {
      this.scene.remove(this.arena.group);
      this.arena.dispose();
    }
    this.arena = buildLabyrinthArena(level, this.textures);
    this.scene.add(this.arena.group);

    // Adjust directional shadow camera bounds to cover larger maps cleanly
    const halfSpan = Math.max(48, Math.max(level.cols, level.rows) * level.cellSize * 0.58);
    this.keyLight.shadow.camera.left = -halfSpan;
    this.keyLight.shadow.camera.right = halfSpan;
    this.keyLight.shadow.camera.top = halfSpan;
    this.keyLight.shadow.camera.bottom = -halfSpan;
    this.keyLight.shadow.camera.far = halfSpan * 2.5;
    this.keyLight.shadow.camera.updateProjectionMatrix();

    // Reset particle pool so no sparks/smoke persist across restarts or level changes
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.particles[i].active = false;
      _dummy.position.set(0, -50, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    this.tireSmokeAccum = 0;

    this.carState = createInitialCarState(level);
    this.elapsedTime = 0;
    this.hitstopTimer = 0;
    this.trauma = 0;
    this.finishTriggered = false;
    this.keysPressed.clear();
    this.resetTouchInput();

    this.syncCarTransform();
    this.syncCockpitVisibility();
    this.snapCameraToGameplay();
    this.emitHud(true);
  }

  private syncCarTransform(): void {
    this.carRig.root.position.set(this.carState.x, 0, this.carState.z);
    this.carRig.root.rotation.y = this.carState.yaw;
    this.carRig.setWheelKinematics(
      this.carState.steerAngle,
      this.carState.wheelSpin,
      this.carState.speed,
    );
    this.carRig.setHoverKinematics(
      this.carState.hoverY,
      this.carState.hoverActive,
      this.simClockTime,
    );
    this.carRig.setAeroActive(
      this.carState.turboActive || this.carState.boostPadTimer > 0,
    );
  }

  private snapCameraToGameplay(): void {
    const sinY = Math.sin(this.carState.yaw);
    const cosY = Math.cos(this.carState.yaw);
    this.camPos.set(
      this.carState.x - sinY * 7.8,
      4.4,
      this.carState.z - cosY * 7.8,
    );
    this.camLook.set(
      this.carState.x + sinY * 2.5,
      0.9,
      this.carState.z + cosY * 2.5,
    );
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  private spawnParticle(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    maxLife: number,
    scale: number,
    isSpark: boolean,
  ): void {
    const p = this.particles[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % PARTICLE_COUNT;
    p.active = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.life = 0;
    p.maxLife = maxLife;
    p.scale = scale;
    p.isSpark = isSpark;
  }

  private spawnImpactBurst(x: number, z: number, count: number, baseY = 0): void {
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const spd = 2.5 + Math.random() * 5.5;
      this.spawnParticle(
        x,
        baseY + 0.55,
        z,
        Math.cos(ang) * spd,
        2.0 + Math.random() * 3.5,
        Math.sin(ang) * spd,
        0.38 + Math.random() * 0.25,
        0.55 + Math.random() * 0.45,
        true,
      );
    }
  }

  private updateParticles(dt: number): void {
    let anyChanged = false;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      anyChanged = true;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        _dummy.position.set(0, -50, 0);
        _dummy.scale.setScalar(0.001);
        _dummy.updateMatrix();
        this.particleMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      if (p.isSpark) {
        p.vy -= 12.0 * dt;
      } else {
        p.vy += 0.6 * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      const t = p.life / p.maxLife;
      const s = p.isSpark ? p.scale * (1 - t) : p.scale * (0.6 + t * 1.4) * (1 - t * 0.7);
      _dummy.position.set(p.x, Math.max(0.05, p.y), p.z);
      _dummy.scale.setScalar(Math.max(0.01, s));
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);

      if (p.isSpark) {
        _color.setHex(t < 0.4 ? 0xfef08a : 0xf97316);
      } else {
        _color.setRGB(0.62, 0.68, 0.78);
      }
      this.particleMesh.setColorAt(i, _color);
    }

    if (anyChanged) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    }
  }

  private readInput(): CarInput {
    const k = this.keysPressed;
    return {
      throttle:
        k.has('KeyW') || k.has('ArrowUp') || this.touchInput.throttle,
      brake:
        k.has('KeyS') || k.has('ArrowDown') || this.touchInput.brake,
      left:
        k.has('KeyA') || k.has('ArrowLeft') || this.touchInput.left,
      right:
        k.has('KeyD') || k.has('ArrowRight') || this.touchInput.right,
      handbrake: k.has('Space') || this.touchInput.handbrake,
      turbo:
        k.has('ShiftLeft') || k.has('ShiftRight') || Boolean(this.touchInput.turbo),
      hover: k.has('KeyE') || Boolean(this.touchInput.hover),
    };
  }

  private emitHud(force = false, precomputedSensors?: UltrasonicSensors): void {
    const now = performance.now();
    if (!force && now - this.lastHudEmit < 95) return;
    this.lastHudEmit = now;

    const spd = this.carState.speed;
    const gear: HudTelemetry['gear'] =
      this.carState.parkProgress > 0.85
        ? 'P'
        : spd < -0.2
          ? 'R'
          : Math.abs(spd) < 0.15
            ? 'N'
            : 'D';

    const ultrasonic =
      precomputedSensors ??
      computeUltrasonicSensors(this.carState, this.level, this.elapsedTime);

    const nearestWalls = detectNearestWalls(
      this.carState.x,
      this.carState.z,
      this.level.walls,
      11.5,
      5,
    );

    this.callbacks.onTelemetry({
      speedKmh: Math.round(Math.abs(spd) * 3.6),
      elapsedTime: this.elapsedTime,
      timeLimit: this.level.timeLimit,
      collisions: this.carState.collisions,
      maxCollisions: this.level.maxCollisions,
      parkProgress: this.carState.parkProgress,
      parkQuality: this.carState.parkQuality,
      distanceToBay: Math.round(this.carState.distanceToBay),
      gear,
      turboEnergy: Math.round(this.carState.turboEnergy),
      turboActive: this.carState.turboActive,
      boostPadActive: this.carState.boostPadTimer > 0,
      isDrifting: this.carState.isDrifting,
      comboCount: this.carState.comboCount,
      checkpointsPassed: this.carState.passedCheckpointIds.length,
      totalCheckpoints: this.level.checkpoints?.length ?? 0,
      passedCheckpointIds: [...this.carState.passedCheckpointIds],
      gridSizeLabel: `${this.level.cols}×${this.level.rows}`,
      headlightsOn: this.headlightsOn,
      tokensCollected: this.carState.collectedTokenIds.length,
      totalTokens: this.level.tokens?.length ?? 0,
      bonusScore: this.carState.bonusScore,
      bonusTimeSec: this.carState.bonusTimeSec,
      steerAngle: this.carState.steerAngle,
      ultrasonic,
      playerPose: {
        x: this.carState.x,
        z: this.carState.z,
        yaw: this.carState.yaw,
      },
      nearestWalls,
      collectedTokenIds: [...this.carState.collectedTokenIds],
      archetype: this.level.archetype,
      penaltyScore: this.carState.penaltyScore,
      penaltyTimeSec: this.carState.penaltyTimeSec,
      penaltyPoints: this.carState.penaltyPoints,
      maxPenaltyPoints: MAX_PENALTY_POINTS,
      violationCount: this.carState.violationCount,
      approachingSignal: resolveApproachingTrafficLight(
        this.carState,
        this.level,
        this.elapsedTime,
      ),
      activeTrafficAlert: this.carState.activeTrafficAlert
        ? { ...this.carState.activeTrafficAlert }
        : null,
      edsFlashActive: this.carState.edsFlashTimer > 0.25,
      vehicleModel: this.vehicleModel,
      hoverY: Number(this.carState.hoverY.toFixed(2)),
      hoverEnergy: Math.round(this.carState.hoverEnergy),
      hoverActive: this.carState.hoverActive,
    });
  }

  private tick = (): void => {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = (now - this.lastFrameMs) / 1000;
    this.lastFrameMs = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    this.simClockTime += dt;

    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
    }

    if (this.phase === 'playing' && !this.finishTriggered) {
      if (this.hitstopTimer <= 0) {
        this.elapsedTime += dt;
        const input = this.readInput();
        const res = stepCarPhysics(
          this.carState,
          input,
          this.level,
          dt,
          this.elapsedTime,
          this.vehicleModel,
        );

        this.carRig.setLightsState(
          input.brake || input.handbrake,
          this.carState.speed < -0.25,
          this.carState.damageFlash,
        );

        const activeGear: HudTelemetry['gear'] =
          this.carState.parkProgress > 0.85
            ? 'P'
            : this.carState.speed < -0.2
              ? 'R'
              : Math.abs(this.carState.speed) < 0.15
                ? 'N'
                : 'D';

        this.carRig.setCockpitTelemetry(
          {
            steerAngle: this.carState.steerAngle,
            speed: this.carState.speed,
            turboActive: this.carState.turboActive,
            throttle: input.throttle,
            brake: input.brake || input.handbrake,
            gear: activeGear,
          },
          dt,
        );
        this.sound.updateEngine(
          Math.abs(this.carState.speed),
          input.throttle,
          true,
          this.carState.turboActive,
        );
        const sensors = computeUltrasonicSensors(
          this.carState,
          this.level,
          this.elapsedTime,
        );
        const insideBay =
          this.carState.parkQuality > 0.72 && this.carState.distanceToBay < 3.4;
        this.sound.playParkingSensor(
          insideBay ? Math.min(sensors.minDistance, this.carState.distanceToBay) : sensors.minDistance,
          insideBay,
          Math.abs(this.carState.speed) > 0.25,
        );

        if (res.pickedToken) {
          this.sound.playTokenPickup(res.pickedToken.kind);
          this.spawnImpactBurst(res.pickedToken.x, res.pickedToken.z, 14);
          this.emitHud(true, sensors);
        }

        if (res.triggeredBoostPad) {
          this.sound.playBoostPad();
          this.spawnImpactBurst(res.triggeredBoostPad.x, res.triggeredBoostPad.z, 12);
          this.emitHud(true, sensors);
        }

        if (res.passedCheckpoint) {
          this.sound.playCheckpoint(this.carState.comboCount);
          this.spawnImpactBurst(res.passedCheckpoint.x, res.passedCheckpoint.z, 12);
          this.emitHud(true, sensors);
        }

        const isBoosting = this.carState.turboActive || this.carState.boostPadTimer > 0;
        const smokeDisabled = VEHICLE_SPECS[this.vehicleModel].disableSmokeParticles;

        // Tire/exhaust smoke & turbo/drift sparks (strictly disabled on clean-thruster Tesla Hover Roadster)
        if (
          !smokeDisabled &&
          (isBoosting ||
            this.carState.isDrifting ||
            (Math.abs(this.carState.speed) > 1.2 && (input.throttle || input.handbrake)))
        ) {
          this.tireSmokeAccum += dt;
          if (this.tireSmokeAccum >= (isBoosting ? 0.032 : 0.06)) {
            this.tireSmokeAccum = 0;
            const sinY = Math.sin(this.carState.yaw);
            const cosY = Math.cos(this.carState.yaw);
            this.spawnParticle(
              this.carState.x - sinY * 2.1 + (Math.random() - 0.5) * 0.5,
              0.26,
              this.carState.z - cosY * 2.1 + (Math.random() - 0.5) * 0.5,
              -sinY * (isBoosting ? 3.5 : 0.8) + (Math.random() - 0.5) * 0.6,
              0.35 + Math.random() * 0.35,
              -cosY * (isBoosting ? 3.5 : 0.8) + (Math.random() - 0.5) * 0.6,
              isBoosting ? 0.26 : 0.42,
              isBoosting ? 0.48 : input.handbrake || this.carState.isDrifting ? 0.54 : 0.3,
              isBoosting || this.carState.isDrifting,
            );
          }
        }

        if (res.collided) {
          this.hitstopTimer = 0.045;
          this.trauma = Math.min(1, this.trauma + 0.5 + res.impactIntensity * 0.5);
          this.spawnImpactBurst(res.impactX, res.impactZ, 16);
          this.sound.playCollision(res.impactIntensity);
        }

        if (res.triggeredPenalty) {
          this.sound.playTrafficViolation(res.triggeredPenalty.severity);
          if (res.edsTriggered) {
            this.trauma = Math.min(1, this.trauma + 0.35);
          }
          this.emitHud(true, sensors);
        } else if (res.awardedTrafficBonus) {
          this.sound.playTrafficBonus();
          this.emitHud(true, sensors);
        }

        const effectiveLimit =
          this.level.timeLimit + this.carState.bonusTimeSec - this.carState.penaltyTimeSec;
        const totalTokens = this.level.tokens?.length ?? 0;

        // Check win / loss conditions
        if (res.parked) {
          this.finishTriggered = true;
          this.sound.stopEngineLoop();
          this.sound.playVictory();
          this.emitHud(true, sensors);
          this.callbacks.onFinish({
            victory: true,
            reason: 'parked',
            elapsedTime: this.elapsedTime,
            collisions: this.carState.collisions,
            reverseParked: res.reverseParked,
            tokensCollected: this.carState.collectedTokenIds.length,
            totalTokens,
            bonusScore: this.carState.bonusScore,
            penaltyScore: this.carState.penaltyScore,
            penaltyTimeSec: this.carState.penaltyTimeSec,
            penaltyPoints: this.carState.penaltyPoints,
            violationCount: this.carState.violationCount,
            penalties: [...this.carState.penalties],
          });
        } else if (this.carState.penaltyPoints >= MAX_PENALTY_POINTS) {
          this.finishTriggered = true;
          this.sound.stopEngineLoop();
          this.sound.playDefeat();
          this.emitHud(true, sensors);
          this.callbacks.onFinish({
            victory: false,
            reason: 'penalty_limit',
            elapsedTime: this.elapsedTime,
            collisions: this.carState.collisions,
            reverseParked: false,
            tokensCollected: this.carState.collectedTokenIds.length,
            totalTokens,
            bonusScore: this.carState.bonusScore,
            penaltyScore: this.carState.penaltyScore,
            penaltyTimeSec: this.carState.penaltyTimeSec,
            penaltyPoints: this.carState.penaltyPoints,
            violationCount: this.carState.violationCount,
            penalties: [...this.carState.penalties],
          });
        } else if (this.carState.collisions >= this.level.maxCollisions) {
          this.finishTriggered = true;
          this.sound.stopEngineLoop();
          this.sound.playDefeat();
          this.emitHud(true, sensors);
          this.callbacks.onFinish({
            victory: false,
            reason: 'wrecked',
            elapsedTime: this.elapsedTime,
            collisions: this.carState.collisions,
            reverseParked: false,
            tokensCollected: this.carState.collectedTokenIds.length,
            totalTokens,
            bonusScore: this.carState.bonusScore,
            penaltyScore: this.carState.penaltyScore,
            penaltyTimeSec: this.carState.penaltyTimeSec,
            penaltyPoints: this.carState.penaltyPoints,
            violationCount: this.carState.violationCount,
            penalties: [...this.carState.penalties],
          });
        } else if (this.elapsedTime >= effectiveLimit) {
          this.finishTriggered = true;
          this.sound.stopEngineLoop();
          this.sound.playDefeat();
          this.emitHud(true, sensors);
          this.callbacks.onFinish({
            victory: false,
            reason: 'timeout',
            elapsedTime: this.elapsedTime,
            collisions: this.carState.collisions,
            reverseParked: false,
            tokensCollected: this.carState.collectedTokenIds.length,
            totalTokens,
            bonusScore: this.carState.bonusScore,
            penaltyScore: this.carState.penaltyScore,
            penaltyTimeSec: this.carState.penaltyTimeSec,
            penaltyPoints: this.carState.penaltyPoints,
            violationCount: this.carState.violationCount,
            penalties: [...this.carState.penalties],
          });
        }

        this.emitHud(false, sensors);
      }

      this.syncCarTransform();
    } else {
      // Subtle idle headlights/taillights & showcase hover preview in garage/title
      this.carRig.setLightsState(false, false, 0);
      if (this.vehicleModel === 'hover_thruster' && (this.overlay === 'garage' || this.phase === 'title')) {
        this.carRig.setHoverKinematics(
          0.34 + Math.sin(this.simClockTime * 2.4) * 0.05,
          true,
          this.simClockTime,
        );
      } else {
        this.carRig.setHoverKinematics(0, false, this.simClockTime);
      }
    }

    if (this.arena) {
      const arenaTime = this.phase === 'playing' ? this.elapsedTime : this.simClockTime * 0.5;
      this.arena.update(
        arenaTime,
        this.carState.parkProgress,
        this.carState.parkQuality,
        this.carState.collectedTokenIds,
        this.carState.passedCheckpointIds,
        this.carState.edsFlashTimer,
      );
    }

    this.updateParticles(dt);
    this.updateCamera(dt);

    const canvasW = this.container.clientWidth || window.innerWidth || 1280;
    const canvasH = Math.max(1, this.container.clientHeight || window.innerHeight || 720);

    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, canvasW, canvasH);
    this.renderer.render(this.scene, this.camera);

    // Rear-view backup camera PiP pass in dedicated corner HUD frame
    if (
      this.phase === 'playing' &&
      this.overlay === 'none' &&
      this.rearCamRect &&
      this.rearCamRect.width > 20 &&
      this.rearCamRect.height > 20
    ) {
      const { left, top, width, height } = this.rearCamRect;
      const vx = Math.max(0, Math.round(left));
      const vy = Math.max(0, Math.round(canvasH - (top + height)));
      const vw = Math.min(canvasW - vx, Math.round(width));
      const vh = Math.min(canvasH - vy, Math.round(height));

      if (vw > 12 && vh > 12) {
        this.rearCamera.aspect = vw / vh;
        this.rearCamera.updateProjectionMatrix();
        this.renderer.autoClear = false;
        this.renderer.setScissorTest(true);
        this.renderer.setViewport(vx, vy, vw, vh);
        this.renderer.setScissor(vx, vy, vw, vh);
        this.renderer.clear(true, true, false);
        this.renderer.render(this.scene, this.rearCamera);
        this.renderer.setScissorTest(false);
        this.renderer.setViewport(0, 0, canvasW, canvasH);
        this.renderer.autoClear = true;
      }
    }

    this.scheduleNextFrame();
  };

  private updateCamera(dt: number): void {
    const dampAlpha = 1 - Math.exp(-7.5 * dt);

    if (this.overlay === 'garage') {
      // Smooth 3/4 turntable showcase framing the full car above the bottom dock
      const angle = this.simClockTime * 0.42 + 0.6;
      const dist = 6.9;
      _vec3A.set(
        this.carState.x + Math.sin(angle) * dist,
        1.75,
        this.carState.z + Math.cos(angle) * dist,
      );
      _vec3B.set(this.carState.x, 0.25, this.carState.z);
      this.camPos.lerp(_vec3A, dampAlpha);
      this.camLook.lerp(_vec3B, dampAlpha);
      this.camera.fov += (44 - this.camera.fov) * dampAlpha;
      this.camera.updateProjectionMatrix();
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);
      return;
    }

    if (this.phase === 'title') {
      // Live world camera tour sweeping gracefully around the hero car & labyrinth vista
      const angle = this.simClockTime * 0.22 + this.carState.yaw + 0.65;
      const dist = 8.4;
      _vec3A.set(
        this.carState.x + Math.sin(angle) * dist,
        3.5 + Math.sin(this.simClockTime * 0.35) * 0.6,
        this.carState.z + Math.cos(angle) * dist,
      );
      _vec3B.set(this.carState.x, 0.9, this.carState.z);
      this.camPos.lerp(_vec3A, dampAlpha);
      this.camLook.lerp(_vec3B, dampAlpha);
      this.camera.fov += (54 - this.camera.fov) * dampAlpha;
      this.camera.updateProjectionMatrix();
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);
      return;
    }

    // Gameplay camera modes + Rear-view bumper camera sync
    const sinY = Math.sin(this.carState.yaw);
    const cosY = Math.cos(this.carState.yaw);

    // Position rear backup camera right at rear bumper looking backward + slightly downward
    const hoverLift = this.carState.hoverY;
    this.rearCamera.position.set(
      this.carState.x - sinY * 2.12,
      1.12 + hoverLift,
      this.carState.z - cosY * 2.12,
    );
    this.rearCamera.lookAt(
      this.carState.x - sinY * 14.0,
      0.22 + hoverLift * 0.7,
      this.carState.z - cosY * 14.0,
    );

    if (this.cameraMode === 'cockpit') {
      // Rigid chassis-mounted driver eye view (left-hand drive +X = +0.34)
      this.carRig.root.updateMatrixWorld(true);
      _vec3A.set(0.34, 1.13, -0.32);
      this.carRig.chassisGroup.localToWorld(_vec3A);

      // Subtle look-into-turn yaw anticipation when steering
      _vec3B.set(0.30 + this.carState.steerAngle * 0.72, 0.54, 6.5);
      this.carRig.chassisGroup.localToWorld(_vec3B);

      const targetNear = 0.11;
      if (Math.abs(this.camera.near - targetNear) > 0.005) {
        this.camera.near = targetNear;
      }
      const cockpitFov =
        (this.carState.turboActive ? 75 : 71) +
        Math.min(4, Math.abs(this.carState.speed) * 0.22);
      this.camera.fov += (cockpitFov - this.camera.fov) * dampAlpha;
      this.camera.updateProjectionMatrix();

      this.camPos.copy(_vec3A);
      this.camLook.copy(_vec3B);
      this.camera.position.copy(this.camPos);
    } else {
      if (Math.abs(this.camera.near - 0.2) > 0.005) {
        this.camera.near = 0.2;
      }

      if (this.cameraMode === 'top') {
        _vec3A.set(this.carState.x - sinY * 3.0, 26.0 + hoverLift, this.carState.z - cosY * 3.0);
        _vec3B.set(this.carState.x + sinY * 2.2, 0.2 + hoverLift * 0.5, this.carState.z + cosY * 2.2);
        this.camera.fov += (52 - this.camera.fov) * dampAlpha;
      } else if (this.cameraMode === 'hood') {
        _vec3A.set(this.carState.x + sinY * 0.45, 1.48 + hoverLift, this.carState.z + cosY * 0.45);
        _vec3B.set(
          this.carState.x + sinY * 10.0,
          1.15 + hoverLift,
          this.carState.z + cosY * 10.0,
        );
        this.camera.fov += (65 - this.camera.fov) * dampAlpha;
      } else {
        // Chase camera with wall-occlusion raycast pull-in
        const desiredDist = 7.6;
        const desiredHeight = 4.1 + hoverLift * 0.95;
        _vec3B.set(
          this.carState.x + sinY * 2.4,
          1.0 + hoverLift * 0.95,
          this.carState.z + cosY * 2.4,
        );
        _vec3A.set(
          this.carState.x - sinY * desiredDist,
          desiredHeight,
          this.carState.z - cosY * desiredDist,
        );

        if (this.arena && this.arena.wallCollidables.length > 0) {
          _vec3C.copy(_vec3A).sub(_vec3B);
          const rayDist = _vec3C.length();
          if (rayDist > 0.1) {
            _vec3C.normalize();
            this.raycaster.set(_vec3B, _vec3C);
            this.raycaster.far = rayDist;
            const hits = this.raycaster.intersectObjects(this.arena.wallCollidables, false);
            if (hits.length > 0 && hits[0].distance < rayDist) {
              const safeDist = Math.max(2.6, hits[0].distance - 0.55);
              _vec3A.copy(_vec3B).addScaledVector(_vec3C, safeDist);
              _vec3A.y = Math.max(_vec3A.y, 3.2);
            }
          }
        }

        const speedFov =
          (this.carState.turboActive ? 67 : 58) +
          Math.min(9, Math.abs(this.carState.speed) * 0.5);
        this.camera.fov += (speedFov - this.camera.fov) * dampAlpha;
      }

      this.camera.updateProjectionMatrix();
      this.camPos.lerp(_vec3A, dampAlpha);
      this.camLook.lerp(_vec3B, dampAlpha);

      this.camera.position.copy(this.camPos);
    }

    // Trauma^2 camera shake decay
    if (this.trauma > 0.001) {
      const shake = this.trauma * this.trauma;
      this.camera.position.x += (Math.random() - 0.5) * shake * 0.45;
      this.camera.position.y += (Math.random() - 0.5) * shake * 0.32;
      this.trauma = Math.max(0, this.trauma - dt * 2.4);
    }

    this.camera.lookAt(this.camLook);
  }

  private scheduleNextFrame(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (
      e.code === 'ArrowUp' ||
      e.code === 'ArrowDown' ||
      e.code === 'ArrowLeft' ||
      e.code === 'ArrowRight' ||
      e.code === 'Space'
    ) {
      const activeTag = document.activeElement?.tagName;
      if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
        e.preventDefault();
      }
    }
    this.keysPressed.add(e.code);
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.keysPressed.delete(e.code);
  };

  private handleBlur = () => {
    this.keysPressed.clear();
    this.resetTouchInput();
  };

  private handleVisibility = () => {
    if (document.hidden) {
      this.keysPressed.clear();
      this.resetTouchInput();
    }
  };

  private handleResize = () => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private bindEvents(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('visibilitychange', this.handleVisibility);
    window.addEventListener('resize', this.handleResize);
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    window.removeEventListener('resize', this.handleResize);

    if (this.arena) this.arena.dispose();
    this.carRig.dispose();
    this.textures.dispose();
    this.particleMesh.geometry.dispose();
    (this.particleMesh.material as THREE.Material).dispose();
    if (this.scene.environment) this.scene.environment.dispose();

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
