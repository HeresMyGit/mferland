export type CanvasDpr = [number, number];

export type RenderPerformanceProfile = {
  isCompactTouch: boolean;
  antialias: boolean;
  powerPreference: WebGLPowerPreference;
  previewDpr: CanvasDpr;
  gameDpr: CanvasDpr;
  loaderDpr: CanvasDpr;
  portraitDpr: CanvasDpr;
  actorRenderRadius: number;
  heavyActorRenderRadius: number;
  actorRenderBudget: number;
  textureAnisotropy: number;
  proceduralTextureScale: number;
};

let cachedProfile: RenderPerformanceProfile | null = null;

export function getClientRenderPerformanceProfile(): RenderPerformanceProfile {
  if (cachedProfile) return cachedProfile;

  const compactTouch = isCompactTouchViewport();
  const lowMemory = hasLowReportedDeviceMemory();
  const constrained = compactTouch || lowMemory;

  cachedProfile = constrained
    ? {
        isCompactTouch: compactTouch,
        antialias: false,
        powerPreference: "low-power",
        previewDpr: [1, 1.1],
        gameDpr: [1, 1.1],
        loaderDpr: [1, 1.15],
        portraitDpr: [1, 1.1],
        actorRenderRadius: 58,
        heavyActorRenderRadius: 58,
        actorRenderBudget: 24,
        textureAnisotropy: 1,
        proceduralTextureScale: 0.5,
      }
    : {
        isCompactTouch: false,
        antialias: true,
        powerPreference: "high-performance",
        previewDpr: [1, 1.35],
        gameDpr: [1, 1.5],
        loaderDpr: [1, 2],
        portraitDpr: [1, 1.5],
        actorRenderRadius: 96,
        heavyActorRenderRadius: 96,
        actorRenderBudget: 80,
        textureAnisotropy: 4,
        proceduralTextureScale: 1,
      };

  return cachedProfile;
}

function isCompactTouchViewport() {
  if (typeof window === "undefined") return false;
  const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const phoneUserAgent = isPhoneUserAgent();
  const hasTouch = (navigator.maxTouchPoints ?? 0) > 0;
  const narrowViewport = Math.min(window.innerWidth, window.innerHeight) <= 480;
  return narrowViewport && (coarsePointer || phoneUserAgent || hasTouch);
}

function hasLowReportedDeviceMemory() {
  if (typeof navigator === "undefined") return false;
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof deviceMemory === "number" && deviceMemory <= 4;
}

function isPhoneUserAgent() {
  if (typeof navigator === "undefined") return false;
  return /\b(iPhone|iPod)\b|Android.+Mobile|Mobile.+Firefox/i.test(navigator.userAgent);
}
