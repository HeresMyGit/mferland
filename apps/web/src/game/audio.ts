import {
  type CombatActionId,
  type CombatEvent,
  type ExperienceEvent,
  type PlayerSnapshot,
} from "@mferland/shared";

const KENNEY_INTERFACE_AUDIO = "/audio/kenney/interface-sounds/Audio";
const KENNEY_RPG_AUDIO = "/audio/kenney/rpg-audio/Audio";
const MAX_DISTANCE = 48;
const FULL_VOLUME_DISTANCE = 7;

export type AudioSettings = {
  enabled: boolean;
  volume: number;
};

export type AudioCue =
  | "uiClick"
  | "uiOpen"
  | "uiClose"
  | "uiConfirm"
  | "uiError"
  | "uiToggle"
  | "targetSelect"
  | "interact"
  | "inventoryLoot"
  | "inventoryEquip"
  | "itemUse"
  | "questNotice"
  | "questComplete"
  | "chatSend"
  | "respawn"
  | "attackSwing"
  | "attackImpact"
  | "rangedRelease"
  | "rangedImpact"
  | "spellCast"
  | "spellImpact"
  | "heal"
  | "taunt"
  | "whirlwind"
  | "frostNova"
  | "defeat"
  | "xpGain";

type AudioClip = {
  src: string;
  volume?: number;
  cooldownMs?: number;
  playbackRate?: readonly [number, number];
};

type PlayOptions = {
  volume?: number;
  playbackRate?: number;
};

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  enabled: true,
  volume: 0.65,
};

const CUE_LIBRARY: Record<AudioCue, readonly AudioClip[]> = {
  uiClick: [
    clip(`${KENNEY_INTERFACE_AUDIO}/select_001.ogg`, 0.3, 35, [0.98, 1.04]),
    clip(`${KENNEY_INTERFACE_AUDIO}/select_002.ogg`, 0.28, 35, [0.98, 1.04]),
    clip(`${KENNEY_INTERFACE_AUDIO}/click_002.ogg`, 0.24, 35, [0.98, 1.04]),
  ],
  uiOpen: [
    clip(`${KENNEY_INTERFACE_AUDIO}/open_001.ogg`, 0.38, 80),
    clip(`${KENNEY_INTERFACE_AUDIO}/open_002.ogg`, 0.36, 80),
  ],
  uiClose: [
    clip(`${KENNEY_INTERFACE_AUDIO}/close_001.ogg`, 0.34, 80),
    clip(`${KENNEY_INTERFACE_AUDIO}/close_002.ogg`, 0.34, 80),
  ],
  uiConfirm: [
    clip(`${KENNEY_INTERFACE_AUDIO}/confirmation_001.ogg`, 0.42, 80),
    clip(`${KENNEY_INTERFACE_AUDIO}/confirmation_003.ogg`, 0.4, 80),
  ],
  uiError: [
    clip(`${KENNEY_INTERFACE_AUDIO}/error_001.ogg`, 0.42, 160),
    clip(`${KENNEY_INTERFACE_AUDIO}/error_004.ogg`, 0.36, 160),
  ],
  uiToggle: [
    clip(`${KENNEY_INTERFACE_AUDIO}/toggle_001.ogg`, 0.36, 80),
    clip(`${KENNEY_INTERFACE_AUDIO}/switch_001.ogg`, 0.32, 80),
  ],
  targetSelect: [
    clip(`${KENNEY_INTERFACE_AUDIO}/pluck_001.ogg`, 0.36, 90, [0.96, 1.05]),
    clip(`${KENNEY_INTERFACE_AUDIO}/click_004.ogg`, 0.28, 90, [0.98, 1.04]),
  ],
  interact: [
    clip(`${KENNEY_RPG_AUDIO}/bookFlip1.ogg`, 0.34, 130, [0.96, 1.04]),
    clip(`${KENNEY_RPG_AUDIO}/doorOpen_1.ogg`, 0.26, 130, [0.96, 1.04]),
  ],
  inventoryLoot: [
    clip(`${KENNEY_RPG_AUDIO}/handleCoins.ogg`, 0.5, 90, [0.96, 1.05]),
    clip(`${KENNEY_RPG_AUDIO}/handleCoins2.ogg`, 0.46, 90, [0.96, 1.05]),
  ],
  inventoryEquip: [
    clip(`${KENNEY_RPG_AUDIO}/clothBelt.ogg`, 0.38, 100, [0.96, 1.03]),
    clip(`${KENNEY_RPG_AUDIO}/metalClick.ogg`, 0.36, 100, [0.97, 1.04]),
  ],
  itemUse: [
    clip(`${KENNEY_RPG_AUDIO}/dropLeather.ogg`, 0.38, 110, [0.95, 1.04]),
    clip(`${KENNEY_RPG_AUDIO}/handleSmallLeather.ogg`, 0.36, 110, [0.95, 1.04]),
  ],
  questNotice: [
    clip(`${KENNEY_RPG_AUDIO}/bookOpen.ogg`, 0.42, 160),
    clip(`${KENNEY_RPG_AUDIO}/bookFlip3.ogg`, 0.36, 160),
  ],
  questComplete: [
    clip(`${KENNEY_INTERFACE_AUDIO}/confirmation_002.ogg`, 0.42, 150),
    clip(`${KENNEY_RPG_AUDIO}/handleCoins2.ogg`, 0.38, 150),
  ],
  chatSend: [
    clip(`${KENNEY_INTERFACE_AUDIO}/click_001.ogg`, 0.2, 80),
  ],
  respawn: [
    clip(`${KENNEY_INTERFACE_AUDIO}/confirmation_004.ogg`, 0.42, 220),
  ],
  attackSwing: [
    clip(`${KENNEY_RPG_AUDIO}/knifeSlice.ogg`, 0.42, 110, [0.92, 1.08]),
    clip(`${KENNEY_RPG_AUDIO}/knifeSlice2.ogg`, 0.4, 110, [0.92, 1.08]),
    clip(`${KENNEY_RPG_AUDIO}/drawKnife1.ogg`, 0.34, 110, [0.94, 1.06]),
  ],
  attackImpact: [
    clip(`${KENNEY_RPG_AUDIO}/chop.ogg`, 0.48, 90, [0.9, 1.05]),
    clip(`${KENNEY_RPG_AUDIO}/metalPot1.ogg`, 0.34, 90, [0.92, 1.04]),
  ],
  rangedRelease: [
    clip(`${KENNEY_RPG_AUDIO}/beltHandle1.ogg`, 0.34, 100, [0.92, 1.05]),
    clip(`${KENNEY_RPG_AUDIO}/beltHandle2.ogg`, 0.32, 100, [0.92, 1.05]),
  ],
  rangedImpact: [
    clip(`${KENNEY_RPG_AUDIO}/chop.ogg`, 0.36, 90, [1.05, 1.18]),
    clip(`${KENNEY_RPG_AUDIO}/metalLatch.ogg`, 0.3, 90, [0.96, 1.08]),
  ],
  spellCast: [
    clip(`${KENNEY_INTERFACE_AUDIO}/glitch_001.ogg`, 0.32, 120, [0.85, 1.03]),
    clip(`${KENNEY_INTERFACE_AUDIO}/bong_001.ogg`, 0.32, 120, [0.9, 1.05]),
  ],
  spellImpact: [
    clip(`${KENNEY_INTERFACE_AUDIO}/glass_004.ogg`, 0.4, 100, [0.9, 1.08]),
    clip(`${KENNEY_INTERFACE_AUDIO}/glass_006.ogg`, 0.38, 100, [0.9, 1.08]),
  ],
  heal: [
    clip(`${KENNEY_INTERFACE_AUDIO}/confirmation_003.ogg`, 0.38, 180, [0.96, 1.04]),
    clip(`${KENNEY_INTERFACE_AUDIO}/pluck_002.ogg`, 0.34, 180, [0.96, 1.04]),
  ],
  taunt: [
    clip(`${KENNEY_INTERFACE_AUDIO}/bong_001.ogg`, 0.46, 220, [0.7, 0.88]),
  ],
  whirlwind: [
    clip(`${KENNEY_RPG_AUDIO}/clothBelt2.ogg`, 0.42, 180, [0.92, 1.08]),
    clip(`${KENNEY_RPG_AUDIO}/knifeSlice2.ogg`, 0.36, 180, [0.78, 0.92]),
  ],
  frostNova: [
    clip(`${KENNEY_INTERFACE_AUDIO}/glass_005.ogg`, 0.4, 180, [0.82, 0.96]),
    clip(`${KENNEY_INTERFACE_AUDIO}/glass_006.ogg`, 0.42, 180, [0.78, 0.94]),
  ],
  defeat: [
    clip(`${KENNEY_RPG_AUDIO}/metalPot2.ogg`, 0.34, 220, [0.72, 0.88]),
    clip(`${KENNEY_INTERFACE_AUDIO}/drop_004.ogg`, 0.36, 220, [0.78, 0.94]),
  ],
  xpGain: [
    clip(`${KENNEY_INTERFACE_AUDIO}/confirmation_001.ogg`, 0.28, 180, [1.05, 1.14]),
  ],
};

export class GameAudio {
  private enabled = DEFAULT_AUDIO_SETTINGS.enabled;
  private volume = DEFAULT_AUDIO_SETTINGS.volume;
  private readonly pools = new Map<string, HTMLAudioElement[]>();
  private readonly poolIndex = new Map<string, number>();
  private readonly lastPlayedAt = new Map<AudioCue, number>();

  configure(settings: AudioSettings) {
    this.enabled = settings.enabled;
    this.volume = clamp01(settings.volume);
  }

  play(cue: AudioCue, options: PlayOptions = {}) {
    if (!this.enabled || this.volume <= 0) return;

    const variants = CUE_LIBRARY[cue];
    const selected = variants[Math.floor(Math.random() * variants.length)];
    const now = performance.now();
    const lastPlayedAt = this.lastPlayedAt.get(cue) ?? 0;
    if (selected.cooldownMs && now - lastPlayedAt < selected.cooldownMs) return;
    this.lastPlayedAt.set(cue, now);

    const audio = this.getNextElement(selected.src);
    audio.pause();
    audio.currentTime = 0;
    audio.volume = clamp01(this.volume * (selected.volume ?? 1) * (options.volume ?? 1));
    audio.playbackRate = options.playbackRate ?? getPlaybackRate(selected.playbackRate);
    void audio.play().catch(() => {
      // Browsers can block audio before the first user gesture.
    });
  }

  preload(cues: readonly AudioCue[]) {
    for (const cue of cues) {
      for (const variant of CUE_LIBRARY[cue]) {
        this.getNextElement(variant.src);
      }
    }
  }

  dispose() {
    for (const pool of this.pools.values()) {
      for (const audio of pool) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
    }
    this.pools.clear();
    this.poolIndex.clear();
    this.lastPlayedAt.clear();
  }

  private getNextElement(src: string) {
    const pool = this.getPool(src);
    const index = this.poolIndex.get(src) ?? 0;
    this.poolIndex.set(src, (index + 1) % pool.length);
    return pool[index];
  }

  private getPool(src: string) {
    const existing = this.pools.get(src);
    if (existing) return existing;

    const pool = Array.from({ length: 3 }, () => {
      const audio = new Audio(src);
      audio.preload = "auto";
      return audio;
    });
    this.pools.set(src, pool);
    return pool;
  }
}

export function normalizeAudioSettings(value: unknown): AudioSettings {
  if (!value || typeof value !== "object") return DEFAULT_AUDIO_SETTINGS;
  const candidate = value as Partial<AudioSettings>;
  return {
    enabled: candidate.enabled ?? DEFAULT_AUDIO_SETTINGS.enabled,
    volume: typeof candidate.volume === "number" && Number.isFinite(candidate.volume)
      ? clamp01(candidate.volume)
      : DEFAULT_AUDIO_SETTINGS.volume,
  };
}

export function getCombatStartCue(actionId: CombatActionId, amount: number): AudioCue | null {
  if (actionId === "attack") return "attackSwing";
  if (actionId === "shoot" || actionId === "signalShot" || actionId === "multishot") return "rangedRelease";
  if (actionId === "fireblast" || actionId === "iceBlast") return "spellCast";
  if (actionId === "frostNova") return amount <= 0 ? "frostNova" : "spellCast";
  if (actionId === "heal") return "spellCast";
  if (actionId === "taunt") return "taunt";
  if (actionId === "whirlwind") return "whirlwind";
  return null;
}

export function getCombatImpactCue(event: CombatEvent): AudioCue | null {
  if (event.actionId === "heal") return "heal";
  if (event.actionId === "taunt") return null;
  if (event.amount <= 0 && event.actionId === "frostNova") return null;
  if (event.actionId === "attack" || event.actionId === "whirlwind") return "attackImpact";
  if (event.actionId === "shoot" || event.actionId === "multishot") return "rangedImpact";
  if (event.actionId === "signalShot" || event.actionId === "fireblast" || event.actionId === "iceBlast" || event.actionId === "frostNova") {
    return "spellImpact";
  }
  return null;
}

export function getCombatSpatialVolume(event: CombatEvent, listener: PlayerSnapshot | null) {
  if (!listener) return 0.7;
  const sourceDistance = Math.hypot(listener.x - event.sourceX, listener.z - event.sourceZ);
  const targetDistance = Math.hypot(listener.x - event.targetX, listener.z - event.targetZ);
  return getDistanceVolume(Math.min(sourceDistance, targetDistance));
}

export function getExperienceSpatialVolume(event: ExperienceEvent, listener: PlayerSnapshot | null) {
  if (!listener) return 0.6;
  return getDistanceVolume(Math.hypot(listener.x - event.x, listener.z - event.z));
}

function clip(src: string, volume = 1, cooldownMs = 0, playbackRate?: readonly [number, number]): AudioClip {
  return { src, volume, cooldownMs, playbackRate };
}

function getPlaybackRate(range: readonly [number, number] | undefined) {
  if (!range) return 1;
  return range[0] + Math.random() * (range[1] - range[0]);
}

function getDistanceVolume(distance: number) {
  if (distance <= FULL_VOLUME_DISTANCE) return 1;
  if (distance >= MAX_DISTANCE) return 0.14;
  const falloff = (distance - FULL_VOLUME_DISTANCE) / (MAX_DISTANCE - FULL_VOLUME_DISTANCE);
  return 1 - falloff * 0.86;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
