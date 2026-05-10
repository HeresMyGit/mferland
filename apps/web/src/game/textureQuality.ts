import * as THREE from "three";
import { getClientRenderPerformanceProfile, type RenderPerformanceProfile } from "./performance";

const MIN_LOADED_TEXTURE_SIZE = 64;
const performanceSizedImages = new WeakSet<object>();
const downscaledImageCache = new WeakMap<object, Map<string, CanvasImageSource>>();
const originalTextureStates = new WeakMap<THREE.Texture, TexturePerformanceState>();
const originalTextureSourceStates = new WeakMap<object, TexturePerformanceState>();

type TextureImageSize = {
  width: number;
  height: number;
};

type TexturePerformanceState = {
  image: unknown;
  generateMipmaps: boolean;
  minFilter: THREE.Texture["minFilter"];
};

export function markTextureImageAsPerformanceSized(image: unknown) {
  if (isObject(image)) performanceSizedImages.add(image);
}

export function optimizeTextureForPerformance(
  texture: THREE.Texture | null | undefined,
  profile: RenderPerformanceProfile = getClientRenderPerformanceProfile(),
) {
  if (!texture) return texture;

  let changed = false;

  if (texture.anisotropy !== profile.textureAnisotropy) {
    texture.anisotropy = profile.textureAnisotropy;
    changed = true;
  }

  if (profile.loadedTextureScale < 1) {
    const originalState = getOriginalTextureState(texture);

    if (texture.generateMipmaps) {
      texture.generateMipmaps = false;
      changed = true;
    }
    if (texture.minFilter !== THREE.LinearFilter) {
      texture.minFilter = THREE.LinearFilter;
      changed = true;
    }

    const nextImage = getDownscaledTextureImage(
      originalState.image,
      profile.loadedTextureScale,
      profile.loadedTextureMaxSize,
    );
    if (nextImage && nextImage !== texture.image) {
      texture.image = nextImage;
      changed = true;
    }
  } else {
    changed = restoreOriginalTextureState(texture) || changed;
  }

  if (changed) texture.needsUpdate = true;
  return texture;
}

function getOriginalTextureState(texture: THREE.Texture) {
  const stored = originalTextureStates.get(texture);
  if (stored) return stored;

  const source = getTextureSource(texture);
  const storedSource = source ? originalTextureSourceStates.get(source) : undefined;
  if (storedSource) {
    originalTextureStates.set(texture, storedSource);
    return storedSource;
  }

  const state = {
    image: texture.image,
    generateMipmaps: texture.generateMipmaps,
    minFilter: texture.minFilter,
  };
  originalTextureStates.set(texture, state);
  if (source) originalTextureSourceStates.set(source, state);
  return state;
}

function restoreOriginalTextureState(texture: THREE.Texture) {
  const source = getTextureSource(texture);
  const state = originalTextureStates.get(texture) ?? (source ? originalTextureSourceStates.get(source) : undefined);
  if (!state) return false;

  let changed = false;
  if (texture.image !== state.image) {
    texture.image = state.image as typeof texture.image;
    changed = true;
  }
  if (texture.generateMipmaps !== state.generateMipmaps) {
    texture.generateMipmaps = state.generateMipmaps;
    changed = true;
  }
  if (texture.minFilter !== state.minFilter) {
    texture.minFilter = state.minFilter;
    changed = true;
  }
  return changed;
}

function getTextureSource(texture: THREE.Texture): object | null {
  const source = texture.source;
  return isObject(source) ? source : null;
}

function getDownscaledTextureImage(
  image: unknown,
  textureScale: number,
  maxTextureSize: number,
): CanvasImageSource | null {
  if (typeof document === "undefined") return null;
  if (!isObject(image) || performanceSizedImages.has(image)) return null;
  if (!isDrawableTextureImage(image)) return null;

  const cacheKey = `${textureScale}:${maxTextureSize}`;
  const cached = downscaledImageCache.get(image)?.get(cacheKey);
  if (cached) return cached;

  const size = getTextureImageSize(image);
  if (!size) return null;

  const targetSize = getTargetTextureSize(size, textureScale, maxTextureSize);
  if (!targetSize) return null;

  const canvas = document.createElement("canvas");
  canvas.width = targetSize.width;
  canvas.height = targetSize.height;

  const context = canvas.getContext("2d");
  if (!context) return null;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "medium";

  try {
    context.drawImage(image, 0, 0, targetSize.width, targetSize.height);
  } catch {
    return null;
  }

  markTextureImageAsPerformanceSized(canvas);
  const cachedSizes = downscaledImageCache.get(image) ?? new Map<string, CanvasImageSource>();
  cachedSizes.set(cacheKey, canvas);
  downscaledImageCache.set(image, cachedSizes);
  return canvas;
}

function getTargetTextureSize(
  size: TextureImageSize,
  textureScale: number,
  maxTextureSize: number,
): TextureImageSize | null {
  const largestDimension = Math.max(size.width, size.height);
  const maxSizeScale = Number.isFinite(maxTextureSize)
    ? maxTextureSize / largestDimension
    : 1;
  const scale = Math.min(textureScale, maxSizeScale);

  if (!Number.isFinite(scale) || scale >= 0.999) return null;

  const width = Math.min(size.width, Math.max(MIN_LOADED_TEXTURE_SIZE, Math.round(size.width * scale)));
  const height = Math.min(size.height, Math.max(MIN_LOADED_TEXTURE_SIZE, Math.round(size.height * scale)));
  if (width === size.width && height === size.height) return null;
  return { width, height };
}

function getTextureImageSize(image: CanvasImageSource): TextureImageSize | null {
  const videoWidth = getNumericProperty(image, "videoWidth");
  const videoHeight = getNumericProperty(image, "videoHeight");
  if (videoWidth > 0 && videoHeight > 0) return { width: videoWidth, height: videoHeight };

  const naturalWidth = getNumericProperty(image, "naturalWidth");
  const naturalHeight = getNumericProperty(image, "naturalHeight");
  if (naturalWidth > 0 && naturalHeight > 0) return { width: naturalWidth, height: naturalHeight };

  const width = getNumericProperty(image, "width");
  const height = getNumericProperty(image, "height");
  if (width > 0 && height > 0) return { width, height };

  return null;
}

function getNumericProperty(value: unknown, key: string) {
  if (!isObject(value)) return 0;
  const property = value[key as keyof typeof value];
  return typeof property === "number" && Number.isFinite(property) ? property : 0;
}

function isDrawableTextureImage(image: object): image is CanvasImageSource {
  return (
    (typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement)
    || (typeof SVGImageElement !== "undefined" && image instanceof SVGImageElement)
    || (typeof HTMLCanvasElement !== "undefined" && image instanceof HTMLCanvasElement)
    || (typeof HTMLVideoElement !== "undefined" && image instanceof HTMLVideoElement)
    || (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap)
    || (typeof OffscreenCanvas !== "undefined" && image instanceof OffscreenCanvas)
  );
}

function isObject(value: unknown): value is object {
  return (typeof value === "object" || typeof value === "function") && value !== null;
}
