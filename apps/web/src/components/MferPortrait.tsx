import { useEffect, useMemo, useState } from "react";
import type { MferTraits } from "../game/mferTraits";

type MferPortraitProps = {
  traits: MferTraits;
  background?: OriginalMferBackground;
  variant?: "clear" | "full";
  className?: string;
  title?: string;
};

type OriginalMferBackground = "blue" | "graveyard" | "green" | "orange" | "red" | "space" | "tree" | "yellow";
type OriginalMferMetadata = {
  i: number;
  traits: Record<string, string>;
  image: string;
};
type OriginalMferPortraitMatch = {
  tokenId: number;
  imageCid: string;
};
type MferLayer = {
  folder: string;
  value: string;
  required?: boolean;
};

const MFER_METADATA_URL = "https://raw.githubusercontent.com/m4r-sh/mfers/main/data/mfers.json";
const MFER_CLEAR_URL = (tokenId: number) => `https://clear.mfers.dev/${tokenId}.png`;
const IPFS_IMAGE_GATEWAY = "https://ipfs.io/ipfs/";
const MFER_LAYER_ROOTS = ["/mfer-layers/og", "/mfer-layers/extended", "https://mfers.dev/layers/full"];
const PLAIN_BACKGROUNDS: OriginalMferBackground[] = ["blue", "green", "orange", "red", "yellow"];
const LAYER_ORDER = [
  "background",
  "type",
  "shirt",
  "chain",
  "mouth",
  "beard",
  "eyes",
  "short hair",
  "long hair",
  "hat under headphones",
  "headphones",
  "hat over headphones",
  "smoke",
  "4_20 watch",
] as const;
const OFFICIAL_OPTIONAL_TRAITS = [
  "4:20 watch",
  "beard",
  "chain",
  "hat over headphones",
  "hat under headphones",
  "long hair",
  "shirt",
  "short hair",
  "smoke",
] as const;
const portraitCache = new Map<string, OriginalMferPortraitMatch | null>();
const composedPortraitCache = new Map<string, Promise<string | null>>();
const layerImageCache = new Map<string, Promise<HTMLImageElement | null>>();
let metadataPromise: Promise<OriginalMferMetadata[]> | null = null;

export function MferPortrait({
  traits,
  background,
  variant = "full",
  className = "mfer-portrait-art",
  title = "mfer portrait",
}: MferPortraitProps) {
  const query = useMemo(() => makeOriginalMferQuery(traits, background), [background, traits]);
  const [composedSrc, setComposedSrc] = useState<string | null>(null);
  const [compositionDone, setCompositionDone] = useState(false);
  const [match, setMatch] = useState<OriginalMferPortraitMatch | null>(() => portraitCache.get(query.cacheKey) ?? null);
  const [failed, setFailed] = useState(false);
  const artClassName = `${className} mfer-portrait-${variant}`;

  useEffect(() => {
    let cancelled = false;
    setComposedSrc(null);
    setCompositionDone(false);

    void getComposedMferPortrait(query, variant)
      .then((src) => {
        if (cancelled) return;
        setComposedSrc(src);
        setCompositionDone(true);
      })
      .catch(() => {
        if (!cancelled) setCompositionDone(true);
      });

    return () => {
      cancelled = true;
    };
  }, [query, variant]);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    const cached = portraitCache.get(query.cacheKey);
    if (cached !== undefined) {
      setMatch(cached);
      return () => {
        cancelled = true;
      };
    }

    setMatch(null);
    void getOriginalMferMetadata()
      .then((metadata) => {
        if (cancelled) return;
        const nextMatch = findBestOriginalMferPortrait(metadata, query);
        portraitCache.set(query.cacheKey, nextMatch);
        setMatch(nextMatch);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

  if (composedSrc) {
    return (
      <img
        className={artClassName}
        src={composedSrc}
        alt={`${title} from original mfer trait layers`}
        draggable={false}
        decoding="async"
      />
    );
  }

  if (!compositionDone || !match) {
    return <span className={`${artClassName} mfer-portrait-loading`} role="img" aria-label={failed ? `${title} unavailable` : `${title} loading`} />;
  }

  return (
    <img
      className={artClassName}
      src={getOriginalMferImageUrl(match, variant)}
      alt={`${title} from mfer #${match.tokenId}`}
      draggable={false}
      decoding="async"
    />
  );
}

function getOriginalMferImageUrl(match: OriginalMferPortraitMatch, variant: NonNullable<MferPortraitProps["variant"]>) {
  if (variant === "clear") return MFER_CLEAR_URL(match.tokenId);
  return `${IPFS_IMAGE_GATEWAY}${match.imageCid}`;
}

function getOriginalMferMetadata() {
  metadataPromise ??= fetch(MFER_METADATA_URL)
    .then((response) => {
      if (!response.ok) throw new Error(`Unable to load original mfers metadata: ${response.status}`);
      return response.json() as Promise<OriginalMferMetadata[]>;
    });
  return metadataPromise;
}

function findBestOriginalMferPortrait(metadata: OriginalMferMetadata[], query: ReturnType<typeof makeOriginalMferQuery>) {
  let best: { mfer: OriginalMferMetadata; score: number; tieBreak: number } | null = null;
  for (const mfer of metadata) {
    const score = scoreOriginalMfer(mfer.traits, query.officialTraits);
    const tieBreak = deterministicTieBreak(query.cacheKey, mfer.i);
    if (!best || score > best.score || (score === best.score && tieBreak > best.tieBreak)) {
      best = { mfer, score, tieBreak };
    }
  }

  if (!best) return null;
  return { tokenId: best.mfer.i, imageCid: best.mfer.image };
}

function scoreOriginalMfer(candidate: Record<string, string>, desired: Record<string, string>) {
  let score = 0;

  for (const [category, value] of Object.entries(desired)) {
    const candidateValue = candidate[category];
    const isCore = category === "background" || category === "type" || category === "eyes" || category === "mouth" || category === "headphones";
    if (candidateValue === value) score += isCore ? 20 : 12;
    else if (!candidateValue) score -= isCore ? 18 : 8;
    else score -= isCore ? 36 : 14;
  }

  for (const category of OFFICIAL_OPTIONAL_TRAITS) {
    if (!desired[category] && candidate[category]) score -= getUnwantedOptionalTraitPenalty(category);
  }

  return score;
}

function getUnwantedOptionalTraitPenalty(category: typeof OFFICIAL_OPTIONAL_TRAITS[number]) {
  if (category === "hat over headphones" || category === "hat under headphones") return 12;
  if (category === "shirt" || category === "beard" || category === "short hair" || category === "long hair") return 10;
  return 4;
}

function makeOriginalMferQuery(traits: MferTraits, requestedBackground?: OriginalMferBackground) {
  const officialTraits: Record<string, string> = {
    background: requestedBackground ?? getOriginalMferBackground(traits),
    type: mapTypeForMetadata(traits.type),
    eyes: mapEyesForMetadata(traits.eyes, traits.type),
    mouth: traits.mouth === "smile" ? "smile" : "flat",
    headphones: mapHeadphonesForMetadata(traits.headphones),
  };

  assignIfPresent(officialTraits, "hat over headphones", mapHatOverHeadphonesForMetadata(traits.hat_over_headphones));
  assignIfPresent(officialTraits, "hat under headphones", mapHatUnderHeadphonesForMetadata(traits.hat_under_headphones));
  assignIfPresent(officialTraits, "short hair", mapShortHairForMetadata(traits.short_hair));
  assignIfPresent(officialTraits, "long hair", mapLongHairForMetadata(traits.long_hair));
  assignIfPresent(officialTraits, "shirt", mapShirtForMetadata(traits.shirt));
  assignIfPresent(officialTraits, "4:20 watch", mapWatchForMetadata(traits.watch));
  assignIfPresent(officialTraits, "chain", mapChainForMetadata(traits.chain));
  assignIfPresent(officialTraits, "beard", mapBeardForMetadata(traits.beard));
  assignIfPresent(officialTraits, "smoke", mapSmokeForMetadata(traits.smoke));

  const layerTraits = makeLayerTraits(traits, officialTraits);

  return {
    officialTraits,
    layerTraits,
    cacheKey: JSON.stringify({
      official: Object.entries(officialTraits).sort(([a], [b]) => a.localeCompare(b)),
      layers: Object.entries(layerTraits).sort(([a], [b]) => a.localeCompare(b)),
    }),
  };
}

function assignIfPresent(target: Record<string, string>, category: string, value: string | null) {
  if (value) target[category] = value;
}

function makeLayerTraits(traits: MferTraits, officialTraits: Record<string, string>) {
  const layerTraits: Record<string, string> = {
    background: officialTraits.background,
    type: mapTypeForLayer(traits.type),
    eyes: mapEyesForLayer(traits.eyes, traits.type),
    mouth: officialTraits.mouth,
    headphones: mapHeadphonesForLayer(traits.headphones),
  };

  assignIfPresent(layerTraits, "hat over headphones", mapHatOverHeadphonesForLayer(traits.hat_over_headphones));
  assignIfPresent(layerTraits, "hat under headphones", mapHatUnderHeadphonesForLayer(traits.hat_under_headphones));
  assignIfPresent(layerTraits, "short hair", mapShortHairForLayer(traits.short_hair));
  assignIfPresent(layerTraits, "long hair", mapLongHairForLayer(traits.long_hair));
  assignIfPresent(layerTraits, "shirt", mapShirtForMetadata(traits.shirt));
  assignIfPresent(layerTraits, "4_20 watch", mapWatchForLayer(traits.watch));
  assignIfPresent(layerTraits, "chain", mapChainForLayer(traits.chain));
  assignIfPresent(layerTraits, "beard", mapBeardForLayer(traits.beard));
  assignIfPresent(layerTraits, "smoke", mapSmokeForLayer(traits.smoke));

  return layerTraits;
}

function getOriginalMferBackground(traits: MferTraits): OriginalMferBackground {
  if (isOriginalMferBackground(traits.background)) return traits.background;
  if (traits.type === "alien") return "space";
  if (traits.type === "ape") return "tree";
  if (traits.type === "zombie") return "graveyard";
  return PLAIN_BACKGROUNDS[Math.abs(hashString(JSON.stringify(traits))) % PLAIN_BACKGROUNDS.length];
}

function isOriginalMferBackground(value: string | undefined): value is OriginalMferBackground {
  return value === "blue"
    || value === "graveyard"
    || value === "green"
    || value === "orange"
    || value === "red"
    || value === "space"
    || value === "tree"
    || value === "yellow";
}

function mapTypeForMetadata(value: string | undefined) {
  if (value === "alien") return "alien mfer";
  if (value === "ape") return "ape mfer";
  if (value === "charcoal" || value === "metal") return "charcoal mfer";
  if (value === "zombie") return "zombie mfer";
  return "plain mfer";
}

function mapTypeForLayer(value: string | undefined) {
  if (value === "metal") return "robot mfer";
  return mapTypeForMetadata(value);
}

function mapEyesForMetadata(value: string | undefined, type: string | undefined) {
  if (type === "alien") return "alien eyes";
  if (type === "zombie") return "zombie eyes";
  if (value === "vr") return "vr";
  if (value === "shades" || value === "trippy" || value === "matrix") return "shades";
  if (value === "purple_shades") return "purple shades";
  if (value === "nerd") return "nerd glasses";
  if (value === "3d") return "3D glasses";
  if (value === "eye_mask") return "eye mask";
  if (value === "eyepatch") return "eye patch";
  return "regular eyes";
}

function mapEyesForLayer(value: string | undefined, type: string | undefined) {
  if (value === "matrix") return "mcxshades";
  if (value === "metal" || value === "mfercoin" || value === "red") return "regular eyes";
  return mapEyesForMetadata(value, type);
}

function mapHeadphonesForMetadata(value: string | undefined) {
  if (value === "white") return "white headphones";
  if (value === "red") return "red headphones";
  if (value === "green") return "green headphones";
  if (value === "pink") return "pink headphones";
  if (value === "gold" || value === "gold_square") return "gold headphones";
  if (value === "blue" || value === "blue_square") return "blue headphones";
  if (value === "lined") return "lined headphones";
  return "black headphones";
}

function mapHeadphonesForLayer(value: string | undefined) {
  if (value === "black_square") return "black headphones";
  return mapHeadphonesForMetadata(value);
}

function mapHatOverHeadphonesForMetadata(value: string | undefined) {
  if (value === "cowboy") return "cowboy hat";
  if (value === "top") return "top hat";
  if (value === "pilot") return "pilot helmet";
  if (value?.startsWith("hoodie_")) return "hoodie";
  return null;
}

function mapHatOverHeadphonesForLayer(value: string | undefined) {
  if (value === "cowboy" || value === "top" || value === "pilot") return mapHatOverHeadphonesForMetadata(value);
  if (value === "hoodie_gray") return "hoodie";
  if (value === "hoodie_blue") return "hoodie blue og";
  if (value === "hoodie_green") return "hoodie green og";
  if (value === "hoodie_pink") return "hoodie pink";
  if (value === "hoodie_red") return "hoodie red";
  if (value === "hoodie_white") return "hoodie";
  return null;
}

function mapHatUnderHeadphonesForMetadata(value: string | undefined) {
  if (value === "bandana_dark_gray") return "bandana dark gray";
  if (value === "bandana_red") return "bandana red";
  if (value === "bandana_blue") return "bandana blue";
  if (value === "knit_kc") return "knit kc";
  if (value === "knit_las_vegas") return "knit las vegas";
  if (value === "knit_new_york") return "knit new york";
  if (value === "knit_san_fran") return "knit san fran";
  if (value === "knit_miami") return "knit miami";
  if (value === "knit_chicago") return "knit chicago";
  if (value === "knit_atlanta") return "knit atlanta";
  if (value === "knit_cleveland") return "knit cleveland";
  if (value === "knit_dallas") return "knit dallas";
  if (value === "knit_baltimore") return "knit baltimore";
  if (value === "knit_buffalo") return "knit buffalo";
  if (value === "knit_pittsburgh") return "knit pittsburgh";
  if (value === "cap_monochrome") return "cap monochrome";
  if (value === "cap_purple") return "cap purple";
  if (value === "beanie_monochrome") return "beanie monochrome";
  if (value === "beanie") return "beanie";
  if (value === "headband_blue_green") return "headband blue/green";
  if (value === "headband_green_white") return "headband green/white";
  if (value === "headband_blue_red") return "headband blue/red";
  if (value === "headband_pink_white") return "headband pink/white";
  if (value === "headband_blue_white") return "headband blue/white";
  return null;
}

function mapHatUnderHeadphonesForLayer(value: string | undefined) {
  if (value === "cap_based_blue") return "cap based blue";
  return mapHatUnderHeadphonesForMetadata(value);
}

function mapShortHairForMetadata(value: string | undefined) {
  if (value === "mohawk_purple") return "mohawk purple";
  if (value === "mohawk_red") return "mohawk red";
  if (value === "mohawk_pink") return "mohawk pink";
  if (value === "mohawk_black") return "mohawk black";
  if (value === "mohawk_yellow") return "mohawk yellow";
  if (value === "mohawk_green") return "mohawk green";
  if (value === "mohawk_blue") return "mohawk blue";
  if (value === "messy_black" || value === "messy_black_ape") return "messy black";
  if (value === "messy_yellow" || value === "messy_yellow_ape") return "messy yellow";
  if (value === "messy_red" || value === "messy_red_ape") return "messy red";
  if (value === "messy_purple" || value === "messy_purple_ape") return "messy purple";
  return null;
}

function mapShortHairForLayer(value: string | undefined) {
  return mapShortHairForMetadata(value);
}

function mapLongHairForMetadata(value: string | undefined) {
  if (value === "long_yellow") return "long hair yellow";
  if (value === "long_black" || value === "long_curly") return "long hair black";
  return null;
}

function mapLongHairForLayer(value: string | undefined) {
  if (value === "long_curly") return "curly 1";
  return mapLongHairForMetadata(value);
}

function mapShirtForMetadata(value: string | undefined) {
  if (value === "collared_pink") return "collared shirt pink";
  if (value === "collared_green") return "collared shirt green";
  if (value === "collared_yellow") return "collared shirt yellow";
  if (value === "collared_white") return "collared shirt white";
  if (value === "collared_turquoise") return "collared shirt turquoise";
  if (value === "collared_blue") return "collared shirt blue";
  if (value === "hoodie_down_red") return "hoodie down red";
  if (value === "hoodie_down_pink") return "hoodie down pink";
  if (value === "hoodie_down_white") return "hoodie down white";
  if (value === "hoodie_down_green") return "hoodie down green";
  if (value === "hoodie_down_gray") return "hoodie down gray";
  if (value === "hoodie_down_blue") return "hoodie down blue";
  return null;
}

function mapWatchForMetadata(value: string | undefined) {
  if (value === "sub_blue") return "sub blue";
  if (value === "sub_lantern_green") return "sub lantern (green)";
  if (value === "sub_cola") return "sub cola (blue/red)";
  if (value === "sub_turquoise") return "sub turquoise";
  if (value === "sub_bat") return "sub bat (blue/black)";
  if (value === "sub_black") return "sub black";
  if (value === "sub_rose") return "sub rose";
  if (value === "sub_red") return "sub red";
  if (value === "oyster_silver") return "oyster silver";
  if (value === "oyster_gold") return "oyster gold";
  if (value === "argo_white") return "argo white";
  if (value === "argo_black") return "argo black";
  return null;
}

function mapWatchForLayer(value: string | undefined) {
  return mapWatchForMetadata(value);
}

function mapChainForMetadata(value: string | undefined) {
  if (value === "silver") return "silver chain";
  if (value === "gold" || value === "onchain") return "gold chain";
  return null;
}

function mapChainForLayer(value: string | undefined) {
  if (value === "onchain") return null;
  return mapChainForMetadata(value);
}

function mapBeardForMetadata(value: string | undefined) {
  if (value === "full" || value === "flat") return "full beard";
  return null;
}

function mapBeardForLayer(value: string | undefined) {
  if (value === "flat") return "shadow beard";
  return mapBeardForMetadata(value);
}

function mapSmokeForMetadata(value: string | undefined) {
  if (value === "pipe" || value === "pipe_brown") return "pipe";
  if (value === "cig_white") return "cig white";
  if (value === "cig_black") return "cig black";
  return null;
}

function mapSmokeForLayer(value: string | undefined) {
  if (value === "pipe_brown") return "brown pipe";
  return mapSmokeForMetadata(value);
}

function getComposedMferPortrait(query: ReturnType<typeof makeOriginalMferQuery>, variant: NonNullable<MferPortraitProps["variant"]>) {
  const cacheKey = `${variant}:${query.cacheKey}`;
  let cached = composedPortraitCache.get(cacheKey);
  if (!cached) {
    cached = composeMferPortrait(query, variant);
    composedPortraitCache.set(cacheKey, cached);
  }
  return cached;
}

async function composeMferPortrait(query: ReturnType<typeof makeOriginalMferQuery>, variant: NonNullable<MferPortraitProps["variant"]>) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 1000;
  canvas.height = 1000;
  const context = canvas.getContext("2d");
  if (!context) return null;

  let drewBody = false;
  for (const layer of getPortraitLayers(query.layerTraits, variant)) {
    const image = await loadFirstLayerImage(getLayerUrls(layer));
    if (!image) {
      if (layer.required) return null;
      continue;
    }
    context.drawImage(image, 0, 0, 1000, 1000);
    if (layer.folder === "type") drewBody = true;
  }

  if (!drewBody) return null;
  return canvas.toDataURL("image/png");
}

function getPortraitLayers(layerTraits: Record<string, string>, variant: NonNullable<MferPortraitProps["variant"]>) {
  const layers: MferLayer[] = [];
  for (const folder of LAYER_ORDER) {
    if (variant === "clear" && folder === "background") continue;
    const value = layerTraits[folder];
    if (!value) continue;
    layers.push({ folder, value, required: folder === "type" });
  }
  return layers;
}

function getLayerUrls(layer: MferLayer) {
  const filenames = getLayerFilenames(layer.folder, layer.value);
  const urls: string[] = [];
  for (const root of MFER_LAYER_ROOTS) {
    for (const filename of filenames) {
      urls.push(`${root}/${encodeURIComponent(layer.folder)}/${encodeURIComponent(filename)}`);
    }
  }
  return urls;
}

function getLayerFilenames(folder: string, value: string) {
  const filenames = new Set<string>();
  const clean = value.trim();
  const slashSafe = clean.replace(/\//g, "_");
  const doubleDashSlashSafe = clean.replace(/\//g, "--");
  const spaceSafe = slashSafe.replace(/\s+/g, "_");
  const compact = slashSafe.replace(/[\s()]/g, "").replace(/__/g, "_");

  filenames.add(`${clean}.png`);
  filenames.add(`${slashSafe}.png`);
  filenames.add(`${doubleDashSlashSafe}.png`);
  filenames.add(`${spaceSafe}.png`);
  filenames.add(`${compact}.png`);

  if (folder === "4_20 watch") {
    filenames.add(`${slashSafe.replace("blue_red", "bluered").replace("blue_black", "blueblack")}.png`);
  }
  if (folder === "hat over headphones" && clean.startsWith("hoodie ")) {
    filenames.add("hoodie.png");
  }
  if (folder === "hat under headphones" && clean.startsWith("headband ")) {
    filenames.add(`${slashSafe.replace(/^headband /, "headband")}.png`);
    filenames.add(`${doubleDashSlashSafe}.png`);
  }
  if (folder === "long hair" && clean === "curly 1") {
    filenames.add("prettycoolhair.png");
  }
  if (folder === "beard" && clean === "shadow beard") {
    filenames.add("beard_flat.png");
  }

  return [...filenames];
}

async function loadFirstLayerImage(urls: string[]) {
  for (const url of urls) {
    const image = await loadLayerImage(url);
    if (image) return image;
  }
  return null;
}

function loadLayerImage(url: string) {
  let cached = layerImageCache.get(url);
  if (!cached) {
    cached = new Promise((resolve) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = url;
    });
    layerImageCache.set(url, cached);
  }
  return cached;
}

function deterministicTieBreak(cacheKey: string, tokenId: number) {
  return hashString(`${cacheKey}:${tokenId}`);
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
