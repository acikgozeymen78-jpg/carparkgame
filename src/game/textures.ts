import * as THREE from 'three';

export interface ProceduralTextureSet {
  asphaltMap: THREE.CanvasTexture;
  asphaltBump: THREE.CanvasTexture;
  hazardStripeMap: THREE.CanvasTexture;
  parkingBayMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  // 1. Asphalt Albedo & Aggregate Bump
  const aspCanvas = document.createElement('canvas');
  aspCanvas.width = 512;
  aspCanvas.height = 512;
  const actx = aspCanvas.getContext('2d')!;
  actx.fillStyle = '#252b36';
  actx.fillRect(0, 0, 512, 512);

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 512;
  bumpCanvas.height = 512;
  const bctx = bumpCanvas.getContext('2d')!;
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, 512, 512);

  // Subtle asphalt mineral speckles
  for (let i = 0; i < 6500; i++) {
    const x = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const y = (Math.sin(i * 78.233) * 19341.123) % 1;
    const px = Math.abs(x) * 512;
    const py = Math.abs(y) * 512;
    const shade = 28 + (i % 34);
    actx.fillStyle = `rgb(${shade}, ${shade + 4}, ${shade + 10})`;
    actx.fillRect(px, py, 2, 2);

    const bVal = 95 + (i % 70);
    bctx.fillStyle = `rgb(${bVal}, ${bVal}, ${bVal})`;
    bctx.fillRect(px, py, 2, 2);
  }

  // Subtle tarmac expansion joint lines
  actx.strokeStyle = 'rgba(15, 19, 27, 0.45)';
  actx.lineWidth = 3;
  actx.beginPath();
  actx.moveTo(0, 256);
  actx.lineTo(512, 256);
  actx.moveTo(256, 0);
  actx.lineTo(256, 512);
  actx.stroke();

  const asphaltMap = new THREE.CanvasTexture(aspCanvas);
  asphaltMap.colorSpace = THREE.SRGBColorSpace;
  asphaltMap.wrapS = THREE.RepeatWrapping;
  asphaltMap.wrapT = THREE.RepeatWrapping;
  asphaltMap.repeat.set(16, 16);
  asphaltMap.anisotropy = maxAnisotropy;

  const asphaltBump = new THREE.CanvasTexture(bumpCanvas);
  asphaltBump.wrapS = THREE.RepeatWrapping;
  asphaltBump.wrapT = THREE.RepeatWrapping;
  asphaltBump.repeat.set(16, 16);
  asphaltBump.anisotropy = maxAnisotropy;

  // 2. Concrete Hazard Chevron Trim Texture
  const hazCanvas = document.createElement('canvas');
  hazCanvas.width = 256;
  hazCanvas.height = 64;
  const hctx = hazCanvas.getContext('2d')!;
  hctx.fillStyle = '#eab308';
  hctx.fillRect(0, 0, 256, 64);
  hctx.fillStyle = '#181c24';
  for (let x = -64; x < 320; x += 48) {
    hctx.beginPath();
    hctx.moveTo(x, 0);
    hctx.lineTo(x + 24, 0);
    hctx.lineTo(x + 48, 64);
    hctx.lineTo(x + 24, 64);
    hctx.closePath();
    hctx.fill();
  }
  const hazardStripeMap = new THREE.CanvasTexture(hazCanvas);
  hazardStripeMap.colorSpace = THREE.SRGBColorSpace;
  hazardStripeMap.wrapS = THREE.RepeatWrapping;
  hazardStripeMap.wrapT = THREE.RepeatWrapping;
  hazardStripeMap.anisotropy = maxAnisotropy;

  // 3. Parking Bay Floor Decal Texture ('P' + Dashed Alignment Box)
  const bayCanvas = document.createElement('canvas');
  bayCanvas.width = 512;
  bayCanvas.height = 768;
  const pctx = bayCanvas.getContext('2d')!;
  pctx.clearRect(0, 0, 512, 768);

  // Subtle translucent fill
  pctx.fillStyle = 'rgba(16, 185, 129, 0.14)';
  pctx.fillRect(24, 24, 464, 720);

  // Crisp glowing emerald border with corner brackets
  pctx.strokeStyle = '#34d399';
  pctx.lineWidth = 18;
  pctx.setLineDash([42, 24]);
  pctx.strokeRect(24, 24, 464, 720);
  pctx.setLineDash([]);

  // Target center cross & "PARK" / P badge
  pctx.fillStyle = '#34d399';
  pctx.beginPath();
  pctx.arc(256, 384, 96, 0, Math.PI * 2);
  pctx.fill();

  pctx.fillStyle = '#0c1524';
  pctx.font = 'bold 124px "Space Grotesk", sans-serif';
  pctx.textAlign = 'center';
  pctx.textBaseline = 'middle';
  pctx.fillText('P', 256, 392);

  // Entry directional chevrons at top and bottom so player knows forward/reverse alignment
  pctx.strokeStyle = '#6ee7b7';
  pctx.lineWidth = 12;
  [140, 628].forEach((cy, idx) => {
    const dir = idx === 0 ? -1 : 1;
    pctx.beginPath();
    pctx.moveTo(196, cy - dir * 18);
    pctx.lineTo(256, cy + dir * 18);
    pctx.lineTo(316, cy - dir * 18);
    pctx.stroke();
  });

  const parkingBayMap = new THREE.CanvasTexture(bayCanvas);
  parkingBayMap.colorSpace = THREE.SRGBColorSpace;
  parkingBayMap.anisotropy = maxAnisotropy;

  // 4. Radial Contact Shadow Disc
  const shCanvas = document.createElement('canvas');
  shCanvas.width = 256;
  shCanvas.height = 256;
  const sctx = shCanvas.getContext('2d')!;
  const grad = sctx.createRadialGradient(128, 128, 22, 128, 128, 124);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.6, 'rgba(0, 0, 0, 0.35)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 256, 256);

  const contactShadowMap = new THREE.CanvasTexture(shCanvas);
  contactShadowMap.colorSpace = THREE.SRGBColorSpace;

  return {
    asphaltMap,
    asphaltBump,
    hazardStripeMap,
    parkingBayMap,
    contactShadowMap,
    dispose: () => {
      asphaltMap.dispose();
      asphaltBump.dispose();
      hazardStripeMap.dispose();
      parkingBayMap.dispose();
      contactShadowMap.dispose();
    },
  };
}
