export type NameplateVisibility = {
  localPlayer: boolean;
  otherPlayers: boolean;
  friendlyNpcs: boolean;
  unfriendlyNpcs: boolean;
};

export type GameSettings = {
  debugPlacementEditor: boolean;
  debugTravelPanel: boolean;
  nameplates: NameplateVisibility;
};

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  debugPlacementEditor: false,
  debugTravelPanel: false,
  nameplates: {
    localPlayer: true,
    otherPlayers: true,
    friendlyNpcs: true,
    unfriendlyNpcs: true,
  },
};

export function normalizeGameSettings(value: unknown): GameSettings {
  if (!value || typeof value !== "object") return DEFAULT_GAME_SETTINGS;
  const candidate = value as Partial<GameSettings> & { nameplates?: Partial<NameplateVisibility> };

  return {
    debugPlacementEditor: Boolean(candidate.debugPlacementEditor),
    debugTravelPanel: Boolean(candidate.debugTravelPanel),
    nameplates: {
      localPlayer: candidate.nameplates?.localPlayer ?? DEFAULT_GAME_SETTINGS.nameplates.localPlayer,
      otherPlayers: candidate.nameplates?.otherPlayers ?? DEFAULT_GAME_SETTINGS.nameplates.otherPlayers,
      friendlyNpcs: candidate.nameplates?.friendlyNpcs ?? DEFAULT_GAME_SETTINGS.nameplates.friendlyNpcs,
      unfriendlyNpcs: candidate.nameplates?.unfriendlyNpcs ?? DEFAULT_GAME_SETTINGS.nameplates.unfriendlyNpcs,
    },
  };
}
