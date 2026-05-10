import { getClientRenderPerformanceProfile, type RenderPerformanceProfile } from "./performance";

export function getPerformanceModelUrl(modelUrl: string, profile: RenderPerformanceProfile = getClientRenderPerformanceProfile()) {
  if (!profile.useOptimizedModelAssets || !modelUrl.startsWith("/models/")) return modelUrl;

  const fileName = modelUrl.slice("/models/".length);
  return `/models/mobile/${fileName}`;
}
