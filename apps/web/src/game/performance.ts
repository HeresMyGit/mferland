import { type GraphicsQuality } from "./settings";

export type CanvasDpr = [number, number];
type ResolvedGraphicsQuality = Exclude<GraphicsQuality, "auto">;

export type RenderPerformanceProfile = {
  graphicsQuality: ResolvedGraphicsQuality;
  requestedGraphicsQuality: GraphicsQuality;
  cacheKey: string;
  isCompactTouch: boolean;
  isLowMemoryDevice: boolean;
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
  loadedTextureScale: number;
  loadedTextureMaxSize: number;
  useOptimizedModelAssets: boolean;
  proceduralTextureScale: number;
};

type RenderEnvironment = {
  compactTouch: boolean;
  lowMemory: boolean;
};

type QualityProfileValues = Omit<
  RenderPerformanceProfile,
  "graphicsQuality" | "requestedGraphicsQuality" | "cacheKey" | "isCompactTouch" | "isLowMemoryDevice"
>;

const QUALITY_PROFILES: Record<ResolvedGraphicsQuality, QualityProfileValues> = {
  low: {
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
    loadedTextureScale: 0.5,
    loadedTextureMaxSize: 512,
    useOptimizedModelAssets: true,
    proceduralTextureScale: 0.5,
  },
  medium: {
    antialias: true,
    powerPreference: "high-performance",
    previewDpr: [1, 1.2],
    gameDpr: [1, 1.25],
    loaderDpr: [1, 1.5],
    portraitDpr: [1, 1.25],
    actorRenderRadius: 78,
    heavyActorRenderRadius: 72,
    actorRenderBudget: 48,
    textureAnisotropy: 2,
    loadedTextureScale: 0.75,
    loadedTextureMaxSize: 1024,
    useOptimizedModelAssets: false,
    proceduralTextureScale: 0.75,
  },
  high: {
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
    loadedTextureScale: 1,
    loadedTextureMaxSize: Number.POSITIVE_INFINITY,
    useOptimizedModelAssets: false,
    proceduralTextureScale: 1,
  },
};

const profileCache = new Map<string, RenderPerformanceProfile>();

export function getClientRenderPerformanceProfile(graphicsQuality: GraphicsQuality = "auto"): RenderPerformanceProfile {
  const environment = getRenderEnvironment();
  const resolvedQuality = resolveGraphicsQuality(graphicsQuality, environment);
  const cacheKey = [
    graphicsQuality,
    resolvedQuality,
    environment.compactTouch ? "compact-touch" : "wide",
    environment.lowMemory ? "low-memory" : "memory-ok",
  ].join(":");
  const cachedProfile = profileCache.get(cacheKey);
  if (cachedProfile) return cachedProfile;

  const profile = {
    graphicsQuality: resolvedQuality,
    requestedGraphicsQuality: graphicsQuality,
    cacheKey,
    isCompactTouch: environment.compactTouch,
    isLowMemoryDevice: environment.lowMemory,
    ...QUALITY_PROFILES[resolvedQuality],
  };
  profileCache.set(cacheKey, profile);

  return profile;
}

function getRenderEnvironment(): RenderEnvironment {
  return {
    compactTouch: isCompactTouchViewport(),
    lowMemory: hasLowReportedDeviceMemory(),
  };
}

function resolveGraphicsQuality(
  graphicsQuality: GraphicsQuality,
  environment: RenderEnvironment,
): ResolvedGraphicsQuality {
  if (graphicsQuality !== "auto") return graphicsQuality;
  if (environment.compactTouch) return "low";
  if (environment.lowMemory) return "medium";
  return "high";
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
