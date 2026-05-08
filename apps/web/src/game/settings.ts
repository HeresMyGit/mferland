import { DEFAULT_AUDIO_SETTINGS, normalizeAudioSettings, type AudioSettings } from "./audio";

export type NameplateVisibility = {
  localPlayer: boolean;
  otherPlayers: boolean;
  friendlyNpcs: boolean;
  unfriendlyNpcs: boolean;
  healthBars: boolean;
};

export type MinimapVisibility = {
  friendlyNpcs: boolean;
};

export type GameSettings = {
  audio: AudioSettings;
  debugPlacementEditor: boolean;
  debugTravelPanel: boolean;
  debugUnlockAllMoves: boolean;
  minimap: MinimapVisibility;
  nameplates: NameplateVisibility;
};

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  audio: DEFAULT_AUDIO_SETTINGS,
  debugPlacementEditor: false,
  debugTravelPanel: false,
  debugUnlockAllMoves: false,
  minimap: {
    friendlyNpcs: false,
  },
  nameplates: {
    localPlayer: false,
    otherPlayers: true,
    friendlyNpcs: false,
    unfriendlyNpcs: false,
    healthBars: false,
  },
};
const LEGACY_ALL_ON_NAMEPLATE_DEFAULTS: NameplateVisibility = {
  localPlayer: true,
  otherPlayers: true,
  friendlyNpcs: true,
  unfriendlyNpcs: true,
  healthBars: true,
};

export function normalizeGameSettings(value: unknown): GameSettings {
  if (!value || typeof value !== "object") return DEFAULT_GAME_SETTINGS;
  const candidate = value as Partial<GameSettings> & {
    minimap?: Partial<MinimapVisibility>;
    nameplates?: Partial<NameplateVisibility>;
  };
  const nameplates = isLegacyAllOnNameplateDefaults(candidate.nameplates)
    ? DEFAULT_GAME_SETTINGS.nameplates
    : {
        localPlayer: candidate.nameplates?.localPlayer ?? DEFAULT_GAME_SETTINGS.nameplates.localPlayer,
        otherPlayers: candidate.nameplates?.otherPlayers ?? DEFAULT_GAME_SETTINGS.nameplates.otherPlayers,
        friendlyNpcs: candidate.nameplates?.friendlyNpcs ?? DEFAULT_GAME_SETTINGS.nameplates.friendlyNpcs,
        unfriendlyNpcs: candidate.nameplates?.unfriendlyNpcs ?? DEFAULT_GAME_SETTINGS.nameplates.unfriendlyNpcs,
        healthBars: candidate.nameplates?.healthBars ?? DEFAULT_GAME_SETTINGS.nameplates.healthBars,
      };

  return {
    audio: normalizeAudioSettings(candidate.audio),
    debugPlacementEditor: Boolean(candidate.debugPlacementEditor),
    debugTravelPanel: Boolean(candidate.debugTravelPanel),
    debugUnlockAllMoves: Boolean(candidate.debugUnlockAllMoves),
    minimap: {
      friendlyNpcs: candidate.minimap?.friendlyNpcs ?? DEFAULT_GAME_SETTINGS.minimap.friendlyNpcs,
    },
    nameplates,
  };
}

function isLegacyAllOnNameplateDefaults(value: Partial<NameplateVisibility> | undefined) {
  if (!value) return false;
  return value.localPlayer === LEGACY_ALL_ON_NAMEPLATE_DEFAULTS.localPlayer
    && value.otherPlayers === LEGACY_ALL_ON_NAMEPLATE_DEFAULTS.otherPlayers
    && value.friendlyNpcs === LEGACY_ALL_ON_NAMEPLATE_DEFAULTS.friendlyNpcs
    && value.unfriendlyNpcs === LEGACY_ALL_ON_NAMEPLATE_DEFAULTS.unfriendlyNpcs
    && value.healthBars === LEGACY_ALL_ON_NAMEPLATE_DEFAULTS.healthBars;
}
