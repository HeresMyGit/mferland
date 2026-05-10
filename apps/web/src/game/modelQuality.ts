import { getClientRenderPerformanceProfile } from "./performance";

export function getPerformanceModelUrl(modelUrl: string) {
  const profile = getClientRenderPerformanceProfile();
  if (profile.loadedTextureScale >= 1 || !modelUrl.startsWith("/models/")) return modelUrl;

  const fileName = modelUrl.slice("/models/".length);
  return `/models/mobile/${fileName}`;
}
