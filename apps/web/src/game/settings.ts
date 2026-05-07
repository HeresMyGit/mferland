import { DEFAULT_AUDIO_SETTINGS, normalizeAudioSettings, type AudioSettings } from "./audio";

export type NameplateVisibility = {
  localPlayer: boolean;
  otherPlayers: boolean;
  friendlyNpcs: boolean;
  unfriendlyNpcs: boolean;
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
    localPlayer: true,
    otherPlayers: true,
    friendlyNpcs: true,
    unfriendlyNpcs: true,
  },
};

export function normalizeGameSettings(value: unknown): GameSettings {
  if (!value || typeof value !== "object") return DEFAULT_GAME_SETTINGS;
  const candidate = value as Partial<GameSettings> & {
    minimap?: Partial<MinimapVisibility>;
    nameplates?: Partial<NameplateVisibility>;
  };

  return {
    audio: normalizeAudioSettings(candidate.audio),
    debugPlacementEditor: Boolean(candidate.debugPlacementEditor),
    debugTravelPanel: Boolean(candidate.debugTravelPanel),
    debugUnlockAllMoves: Boolean(candidate.debugUnlockAllMoves),
    minimap: {
      friendlyNpcs: candidate.minimap?.friendlyNpcs ?? DEFAULT_GAME_SETTINGS.minimap.friendlyNpcs,
    },
    nameplates: {
      localPlayer: candidate.nameplates?.localPlayer ?? DEFAULT_GAME_SETTINGS.nameplates.localPlayer,
      otherPlayers: candidate.nameplates?.otherPlayers ?? DEFAULT_GAME_SETTINGS.nameplates.otherPlayers,
      friendlyNpcs: candidate.nameplates?.friendlyNpcs ?? DEFAULT_GAME_SETTINGS.nameplates.friendlyNpcs,
      unfriendlyNpcs: candidate.nameplates?.unfriendlyNpcs ?? DEFAULT_GAME_SETTINGS.nameplates.unfriendlyNpcs,
    },
  };
}
