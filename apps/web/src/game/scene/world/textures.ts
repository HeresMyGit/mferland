import * as THREE from "three";
import { noise01 } from "./shared";

export function createSkyTexture() {
  const texture = createCanvasTexture(2048, 1024, (context, width, height) => {
    const skyGradient = context.createLinearGradient(0, 0, 0, height);
    skyGradient.addColorStop(0, "#2b79c8");
    skyGradient.addColorStop(0.2, "#5aa8e3");
    skyGradient.addColorStop(0.48, "#a7d6f2");
    skyGradient.addColorStop(0.66, "#f0d7ab");
    skyGradient.addColorStop(0.8, "#d4c79f");
    skyGradient.addColorStop(1, "#8ca376");
    context.fillStyle = skyGradient;
    context.fillRect(0, 0, width, height);

    const sunX = width * 0.27;
    const sunY = height * 0.34;
    const sunGlow = context.createRadialGradient(sunX, sunY, 12, sunX, sunY, width * 0.32);
    sunGlow.addColorStop(0, "rgba(255, 252, 223, 0.92)");
    sunGlow.addColorStop(0.08, "rgba(255, 229, 162, 0.58)");
    sunGlow.addColorStop(0.33, "rgba(255, 202, 133, 0.18)");
    sunGlow.addColorStop(1, "rgba(255, 202, 133, 0)");
    context.fillStyle = sunGlow;
    context.fillRect(0, 0, width, height);

    const horizonGlow = context.createLinearGradient(0, height * 0.48, 0, height * 0.9);
    horizonGlow.addColorStop(0, "rgba(255, 255, 255, 0)");
    horizonGlow.addColorStop(0.45, "rgba(255, 247, 219, 0.34)");
    horizonGlow.addColorStop(1, "rgba(162, 199, 179, 0.12)");
    context.fillStyle = horizonGlow;
    context.fillRect(0, height * 0.48, width, height * 0.46);

    paintCumulusBand(context, width, height, 0.11, 0.18, 26);
    paintCumulusBand(context, width, height, 0.22, 0.24, 34);
    paintCumulusBand(context, width, height, 0.32, 0.34, 38);
    paintCumulusBand(context, width, height, 0.48, 0.24, 52);
    paintWisps(context, width, height, 52, 0.03, 0.28, 0.44);
    paintWisps(context, width, height, 44, 0.1, 0.58, 0.32);
    paintWisps(context, width, height, 36, 0.34, 0.72, 0.36);
    paintHorizonClouds(context, width, height);

    const vignette = context.createRadialGradient(width / 2, height * 0.45, height * 0.08, width / 2, height * 0.45, width * 0.72);
    vignette.addColorStop(0, "rgba(255, 255, 255, 0)");
    vignette.addColorStop(0.72, "rgba(53, 116, 163, 0)");
    vignette.addColorStop(1, "rgba(42, 89, 122, 0.22)");
    context.fillStyle = vignette;
    context.fillRect(0, 0, width, height);
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export function createCloudTexture() {
  const texture = createCanvasTexture(768, 256, (context, width, height) => {
    for (let layer = 0; layer < 4; layer += 1) {
      for (let i = 0; i < 80; i += 1) {
        const seed = i + layer * 91.7;
        const x = noise01(seed * 5.7) * width;
        const y = height * (0.35 + noise01(seed * 2.3) * 0.25);
        const radiusX = width * (0.03 + noise01(seed * 9.1) * 0.09);
        const radiusY = height * (0.08 + noise01(seed * 4.4) * 0.2);
        const alpha = 0.055 + noise01(seed * 8.8) * 0.14;
        const gradient = context.createRadialGradient(x, y, 0, x, y, radiusX);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
        gradient.addColorStop(0.58, `rgba(255, 249, 232, ${alpha * 0.72})`);
        gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
        context.fillStyle = gradient;
        context.beginPath();
        context.ellipse(x, y, radiusX, radiusY, noise01(seed) * Math.PI, 0, Math.PI * 2);
        context.fill();
      }
    }

    const shade = context.createLinearGradient(0, height * 0.48, 0, height);
    shade.addColorStop(0, "rgba(255, 255, 255, 0)");
    shade.addColorStop(1, "rgba(140, 176, 194, 0.24)");
    context.globalCompositeOperation = "source-atop";
    context.fillStyle = shade;
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = "source-over";
  });
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export function createSunGlowTexture() {
  const texture = createCanvasTexture(512, 512, (context, width, height) => {
    const center = width / 2;
    const glow = context.createRadialGradient(center, center, 0, center, center, width / 2);
    glow.addColorStop(0, "rgba(255, 255, 236, 1)");
    glow.addColorStop(0.08, "rgba(255, 243, 191, 0.96)");
    glow.addColorStop(0.2, "rgba(255, 220, 136, 0.38)");
    glow.addColorStop(0.52, "rgba(255, 197, 117, 0.12)");
    glow.addColorStop(1, "rgba(255, 197, 117, 0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);

    context.strokeStyle = "rgba(255, 249, 215, 0.22)";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(center, center, width * 0.095, 0, Math.PI * 2);
    context.stroke();
  });
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function paintWisps(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  count: number,
  minY: number,
  maxY: number,
  opacity: number,
) {
  context.save();
  context.globalCompositeOperation = "screen";
  for (let i = 0; i < count; i += 1) {
    const x = noise01(i * 12.77 + minY * 300) * width;
    const y = height * (minY + noise01(i * 4.21 + maxY * 80) * (maxY - minY));
    const length = width * (0.06 + noise01(i * 8.43) * 0.2);
    const thickness = height * (0.006 + noise01(i * 2.91) * 0.018);
    const rotation = -0.08 + noise01(i * 6.17) * 0.2;
    const gradient = context.createLinearGradient(x - length, y, x + length, y);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
    gradient.addColorStop(0.5, `rgba(255, 255, 255, ${opacity * (0.45 + noise01(i * 3.2) * 0.55)})`);
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

    context.translate(x, y);
    context.rotate(rotation);
    context.fillStyle = gradient;
    context.beginPath();
    context.ellipse(0, 0, length, thickness, 0, 0, Math.PI * 2);
    context.fill();
    context.setTransform(1, 0, 0, 1, 0, 0);
  }
  context.restore();
}

function paintCumulusBand(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  yRatio: number,
  opacity: number,
  count: number,
) {
  context.save();
  context.globalCompositeOperation = "screen";
  for (let i = 0; i < count; i += 1) {
    const seed = i * 17.91 + yRatio * 1000;
    const x = (i / count) * width + (noise01(seed * 1.7) - 0.5) * width * 0.08;
    const y = height * (yRatio + (noise01(seed * 3.2) - 0.5) * 0.09);
    const radiusX = width * (0.03 + noise01(seed * 4.6) * 0.07);
    const radiusY = height * (0.012 + noise01(seed * 5.4) * 0.045);
    const alpha = opacity * (0.45 + noise01(seed * 2.8) * 0.55);
    const highlight = context.createRadialGradient(x, y - radiusY * 0.4, 0, x, y, radiusX);
    highlight.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
    highlight.addColorStop(0.48, `rgba(255, 248, 226, ${alpha * 0.7})`);
    highlight.addColorStop(1, "rgba(255, 255, 255, 0)");
    context.fillStyle = highlight;
    context.beginPath();
    context.ellipse(x, y, radiusX, radiusY, noise01(seed) * 0.18 - 0.09, 0, Math.PI * 2);
    context.fill();

    const shade = context.createRadialGradient(x, y + radiusY * 0.45, 0, x, y + radiusY * 0.45, radiusX * 1.08);
    shade.addColorStop(0, `rgba(135, 176, 202, ${alpha * 0.2})`);
    shade.addColorStop(0.72, `rgba(135, 176, 202, ${alpha * 0.09})`);
    shade.addColorStop(1, "rgba(135, 176, 202, 0)");
    context.globalCompositeOperation = "source-over";
    context.fillStyle = shade;
    context.beginPath();
    context.ellipse(x, y + radiusY * 0.35, radiusX * 0.92, radiusY * 0.72, 0, 0, Math.PI * 2);
    context.fill();
    context.globalCompositeOperation = "screen";
  }
  context.restore();
}

function paintHorizonClouds(context: CanvasRenderingContext2D, width: number, height: number) {
  context.save();
  for (let i = 0; i < 64; i += 1) {
    const x = noise01(i * 18.13) * width;
    const y = height * (0.56 + noise01(i * 4.31) * 0.17);
    const radiusX = width * (0.025 + noise01(i * 8.9) * 0.09);
    const radiusY = height * (0.012 + noise01(i * 3.8) * 0.04);
    const gradient = context.createRadialGradient(x, y, 0, x, y, radiusX);
    gradient.addColorStop(0, "rgba(255, 246, 219, 0.28)");
    gradient.addColorStop(0.62, "rgba(237, 242, 234, 0.15)");
    gradient.addColorStop(1, "rgba(237, 242, 234, 0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

export function configureTile(texture: THREE.Texture, repeatX: number, repeatY: number) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
}

export function createBarkTexture() {
  return createCanvasTexture(128, 256, (context, width, height) => {
    const gradient = context.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, "#5a311c");
    gradient.addColorStop(0.5, "#8b5938");
    gradient.addColorStop(1, "#4b2a18");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    for (let i = 0; i < 95; i += 1) {
      const x = noise01(i * 13.17) * width;
      const lineWidth = 1 + noise01(i * 7.81) * 3.5;
      const light = 48 + Math.floor(noise01(i * 5.43) * 80);
      context.strokeStyle = `rgba(${light + 28}, ${Math.max(24, light - 5)}, ${Math.max(14, light - 22)}, 0.42)`;
      context.lineWidth = lineWidth;
      context.beginPath();
      context.moveTo(x, 0);
      for (let y = 0; y <= height; y += 18) {
        context.lineTo(x + Math.sin(y * 0.045 + i) * (2 + noise01(i) * 4), y);
      }
      context.stroke();
    }

    for (let i = 0; i < 34; i += 1) {
      const y = noise01(i * 19.9) * height;
      context.fillStyle = "rgba(32, 19, 12, 0.38)";
      context.fillRect(0, y, width, 1 + noise01(i * 3.1) * 3);
    }
  }, 1.4, 2.6);
}

export function createLeafTexture() {
  return createCanvasTexture(128, 128, (context, width, height) => {
    context.fillStyle = "#5a953e";
    context.fillRect(0, 0, width, height);

    for (let i = 0; i < 260; i += 1) {
      const x = noise01(i * 4.17) * width;
      const y = noise01(i * 9.41) * height;
      const size = 1.2 + noise01(i * 2.07) * 4.5;
      const bright = noise01(i * 6.19) > 0.52;
      context.fillStyle = bright ? "rgba(166, 204, 99, 0.34)" : "rgba(31, 77, 35, 0.28)";
      context.beginPath();
      context.ellipse(x, y, size * 1.25, size, noise01(i) * Math.PI, 0, Math.PI * 2);
      context.fill();
    }

    for (let i = 0; i < 26; i += 1) {
      const y = noise01(i * 8.29) * height;
      context.strokeStyle = "rgba(238, 246, 179, 0.13)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y + Math.sin(i) * 12);
      context.stroke();
    }
  }, 2.1, 2.1);
}

export function createGrassTuftTexture() {
  return createCanvasTexture(64, 64, (context, width, height) => {
    context.clearRect(0, 0, width, height);

    const blades = [
      [30, 60, 22, 12, 7],
      [32, 60, 31, 6, 8],
      [34, 60, 42, 14, 6],
      [28, 60, 14, 25, 5],
      [36, 60, 50, 25, 5],
    ] as const;

    for (const [baseX, baseY, tipX, tipY, lineWidth] of blades) {
      const gradient = context.createLinearGradient(baseX, baseY, tipX, tipY);
      gradient.addColorStop(0, "rgba(255, 255, 255, 0.9)");
      gradient.addColorStop(0.58, "rgba(255, 255, 255, 0.78)");
      gradient.addColorStop(1, "rgba(255, 255, 255, 0.32)");
      context.strokeStyle = gradient;
      context.lineWidth = lineWidth;
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(baseX, baseY);
      context.quadraticCurveTo((baseX + tipX) / 2, tipY + 12, tipX, tipY);
      context.stroke();
    }

    context.fillStyle = "rgba(255, 255, 255, 0.24)";
    context.beginPath();
    context.ellipse(width / 2, 59, 18, 5, 0, 0, Math.PI * 2);
    context.fill();
  });
}

export function createDirtPathTexture() {
  return createCanvasTexture(512, 512, (context, width, height) => {
    const base = context.createLinearGradient(0, 0, width, height);
    base.addColorStop(0, "#6f5334");
    base.addColorStop(0.42, "#8a6840");
    base.addColorStop(0.68, "#735638");
    base.addColorStop(1, "#5f452d");
    context.fillStyle = base;
    context.fillRect(0, 0, width, height);

    for (let i = 0; i < 950; i += 1) {
      const seed = i * 7.31;
      const x = noise01(seed) * width;
      const y = noise01(seed * 2.7) * height;
      const radius = 0.6 + noise01(seed * 5.2) * 2.4;
      const alpha = 0.08 + noise01(seed * 4.4) * 0.18;
      const light = noise01(seed * 9.1) > 0.55;
      context.fillStyle = light
        ? `rgba(183, 145, 91, ${alpha})`
        : `rgba(56, 38, 23, ${alpha})`;
      context.beginPath();
      context.ellipse(x, y, radius * (1.2 + noise01(seed * 3.8)), radius, noise01(seed * 6.4) * Math.PI, 0, Math.PI * 2);
      context.fill();
    }

    context.globalAlpha = 0.3;
    for (let i = 0; i < 18; i += 1) {
      const y = noise01(i * 11.7) * height;
      const wobble = 12 + noise01(i * 3.9) * 28;
      context.strokeStyle = i % 3 === 0 ? "#3f2b1a" : "#a9824f";
      context.lineWidth = 1.4 + noise01(i * 8.6) * 4.2;
      context.beginPath();
      for (let x = -16; x <= width + 16; x += 18) {
        const nextY = y + Math.sin(x * 0.024 + i * 1.37) * wobble;
        if (x === -16) context.moveTo(x, nextY);
        else context.lineTo(x, nextY);
      }
      context.stroke();
    }
    context.globalAlpha = 1;

    const vignette = context.createRadialGradient(width / 2, height / 2, width * 0.12, width / 2, height / 2, width * 0.68);
    vignette.addColorStop(0, "rgba(255, 229, 160, 0.1)");
    vignette.addColorStop(0.62, "rgba(82, 54, 31, 0)");
    vignette.addColorStop(1, "rgba(46, 31, 19, 0.26)");
    context.fillStyle = vignette;
    context.fillRect(0, 0, width, height);
  }, 2, 2);
}

export function createWaterTexture() {
  return createCanvasTexture(256, 256, (context, width, height) => {
    const gradient = context.createRadialGradient(width / 2, height / 2, 8, width / 2, height / 2, width / 2);
    gradient.addColorStop(0, "#bdf8ff");
    gradient.addColorStop(0.42, "#5bd4ed");
    gradient.addColorStop(1, "#1f8eb1");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    for (let i = 0; i < 42; i += 1) {
      const y = noise01(i * 11.3) * height;
      const amplitude = 3 + noise01(i * 2.1) * 12;
      context.strokeStyle = i % 3 === 0 ? "rgba(255, 255, 255, 0.34)" : "rgba(103, 239, 255, 0.28)";
      context.lineWidth = 1 + noise01(i * 5.7) * 2.5;
      context.beginPath();
      for (let x = -12; x <= width + 12; x += 12) {
        const waveY = y + Math.sin(x * 0.045 + i * 1.7) * amplitude;
        if (x === -12) context.moveTo(x, waveY);
        else context.lineTo(x, waveY);
      }
      context.stroke();
    }

    for (let i = 0; i < 90; i += 1) {
      const x = noise01(i * 8.83) * width;
      const y = noise01(i * 3.61) * height;
      const size = 1 + noise01(i * 12.7) * 2.6;
      context.fillStyle = "rgba(255, 255, 255, 0.38)";
      context.beginPath();
      context.arc(x, y, size, 0, Math.PI * 2);
      context.fill();
    }
  }, 1.5, 1.5);
}

function createCanvasTexture(
  width: number,
  height: number,
  paint: (context: CanvasRenderingContext2D, width: number, height: number) => void,
  repeatX = 1,
  repeatY = 1,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas textures require a 2D context.");
  paint(context, width, height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.center.set(0.5, 0.5);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}
