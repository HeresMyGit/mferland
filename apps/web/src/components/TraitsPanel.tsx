import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Check, Clock, RefreshCw, Shuffle, X } from "lucide-react";
import {
  MFER_APPEARANCE_TRAIT_CATEGORIES,
  hasExplicitMferAppearanceTraits,
  normalizeMferAppearanceTraits,
  sanitizePlayerName,
  type ClientUpdateTraits,
  type MferAppearanceTraits,
  type NpcSnapshot,
  type PlayerSnapshot,
  type TraitUpdateResult,
} from "@mferland/shared";
import { resolveMferTraitsForPlayer } from "../game/mferTraits";
import { MferAvatar } from "./MferAvatar";
import { MferPortrait } from "./MferPortrait";

type TraitsPanelProps = {
  npc: NpcSnapshot;
  player: PlayerSnapshot;
  result: TraitUpdateResult | null;
  onClose: () => void;
  onUpdateTraits: (message: ClientUpdateTraits) => void;
};

const TRAIT_CHANGE_COMING_SOON = "trait changes after your first set are coming soon";

export function TraitsPanel({ npc, player, result, onClose, onUpdateTraits }: TraitsPanelProps) {
  const [draft, setDraft] = useState<MferAppearanceTraits>(() => makeInitialDraft(player));
  const [draftName, setDraftName] = useState(() => player.name || "mfer");
  const draftNameRef = useRef(draftName);
  const [status, setStatus] = useState("");
  const [busyToken, setBusyToken] = useState<"free" | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState(MFER_APPEARANCE_TRAIT_CATEGORIES[0]?.id ?? "");
  const firstSetFree = !hasExplicitMferAppearanceTraits(player.appearanceTraits);
  const canUseWalletPayment = player.identityType === "wallet" && Boolean(player.walletAddress);
  const savedTraitsKey = JSON.stringify(player.appearanceTraits ?? {});
  const previewPlayer = useMemo(() => makePreviewPlayer(player, draft, draftName), [draft, draftName, player]);

  useEffect(() => {
    setDraft(makeInitialDraft(player));
    const nextName = player.name || "mfer";
    draftNameRef.current = nextName;
    setDraftName(nextName);
    setStatus("");
  }, [player.avatarSeed, player.name, savedTraitsKey]);

  useEffect(() => {
    if (!result) return;
    setStatus(result.ok ? formatTraitUpdateSuccessStatus(result) : result.error ?? "save failed");
    if (result.ok && result.name) {
      draftNameRef.current = result.name;
      setDraftName(result.name);
    }
    if (result.ok) setBusyToken(null);
  }, [result]);

  function updateTrait(categoryId: string, value: string) {
    setDraft((current) => normalizeMferAppearanceTraits({
      ...current,
      [categoryId]: value,
    }, current));
    setStatus("");
  }

  function clearTrait(categoryId: string) {
    setDraft((current) => {
      const next = { ...current };
      delete next[categoryId];
      return normalizeMferAppearanceTraits(next, current);
    });
    setStatus("");
  }

  function randomize() {
    setDraft(resolveMferTraitsForPlayer(Date.now() + Math.floor(Math.random() * 1_000_000)));
    setStatus("");
  }

  function updateName(value: string) {
    draftNameRef.current = value;
    setDraftName(value);
    setStatus("");
  }

  function getSavePayload(): ClientUpdateTraits {
    return {
      traits: draft,
      name: sanitizePlayerName(draftNameRef.current, player.name || "mfer"),
    };
  }

  async function saveFree() {
    if (!firstSetFree) {
      setStatus(TRAIT_CHANGE_COMING_SOON);
      return;
    }
    setBusyToken("free");
    setStatus("saving");
    onUpdateTraits(getSavePayload());
    window.setTimeout(() => setBusyToken((current) => current === "free" ? null : current), 3500);
  }

  return (
    <div className="traits-panel">
      <div className="world-map-header">
        <div className="traits-title-lockup">
          <div className="traits-title-portrait">
            <MferPortrait traits={draft} variant="full" title="selected traits portrait" />
          </div>
          <div>
            <strong>{npc.name}</strong>
            <span>{firstSetFree ? "first set free" : "coming soon"}</span>
          </div>
        </div>
        <button type="button" title="Close traits" aria-label="Close traits" onClick={onClose}>
          <X size={22} />
        </button>
      </div>

      <div className="traits-layout">
        <section className="traits-preview">
          <Canvas camera={{ position: [0, 1.55, 5.2], fov: 38, near: 0.1, far: 20 }}>
            <ambientLight intensity={1.05} />
            <hemisphereLight args={["#fff8df", "#6d7351", 0.72]} />
            <directionalLight position={[3, 6, 4]} intensity={1.45} color="#fff0c2" />
            <Suspense fallback={null}>
              <MferAvatar player={previewPlayer} isLocal actorScale={1.16} showNameplate={false} />
            </Suspense>
            <OrbitControls
              enablePan={false}
              enableZoom={false}
              minPolarAngle={Math.PI * 0.34}
              maxPolarAngle={Math.PI * 0.54}
              target={[0, 1.35, 0]}
            />
          </Canvas>
          <label className="traits-name-field">
            <span>name</span>
            <input
              aria-label="character name"
              value={draftName}
              maxLength={18}
              disabled={busyToken !== null}
              onChange={(event) => updateName(event.target.value)}
            />
          </label>
          <button className="traits-random-btn" type="button" disabled={busyToken !== null} onClick={randomize}>
            <Shuffle size={16} />
            random
          </button>
        </section>

        <section className="traits-selector" aria-label="trait selector">
          {MFER_APPEARANCE_TRAIT_CATEGORIES.map((category) => {
            const active = activeCategoryId === category.id;
            return (
              <section key={category.id} className={active ? "trait-category open" : "trait-category"}>
                <button
                  type="button"
                  className="trait-category-summary"
                  aria-expanded={active}
                  onClick={() => setActiveCategoryId(category.id)}
                >
                  <span>{category.name}</span>
                  <strong>{getTraitLabel(category.id, draft[category.id])}</strong>
                </button>
                {active && (
                  <div className="trait-options">
                    {!category.required && (
                      <button
                        type="button"
                        className={!draft[category.id] ? "selected" : undefined}
                        disabled={busyToken !== null}
                        onClick={() => clearTrait(category.id)}
                      >
                        none
                      </button>
                    )}
                    {category.options.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={draft[category.id] === option.id ? "selected" : undefined}
                        disabled={busyToken !== null}
                        onClick={() => updateTrait(category.id, option.id)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </section>
      </div>

      <div className="traits-actions">
        {firstSetFree ? (
          <button className="primary-btn" type="button" disabled={busyToken !== null} onClick={() => void saveFree()}>
            {busyToken === "free" ? <RefreshCw size={17} /> : <Check size={17} />}
            {canUseWalletPayment ? "save free set" : "save session"}
          </button>
        ) : (
          <button
            className="secondary-btn"
            type="button"
            aria-label="trait changes coming soon"
            data-tooltip={TRAIT_CHANGE_COMING_SOON}
            disabled
          >
            <Clock size={17} />
            coming soon
          </button>
        )}
      </div>
      <p className="traits-status">{status || (!firstSetFree ? TRAIT_CHANGE_COMING_SOON : "")}</p>
    </div>
  );
}

function makeInitialDraft(player: PlayerSnapshot) {
  return resolveMferTraitsForPlayer(player.avatarSeed, player.appearanceTraits);
}

function makePreviewPlayer(player: PlayerSnapshot, appearanceTraits: MferAppearanceTraits, name: string): PlayerSnapshot {
  return {
    ...player,
    sessionId: "traits-preview",
    name: sanitizePlayerName(name, player.name || "mfer"),
    appearanceTraits,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    animation: "idle",
    emote: "",
    emoteStartedAt: 0,
    emoteEndsAt: 0,
    health: player.maxHealth,
  };
}

function getTraitLabel(categoryId: string, value: string | undefined) {
  if (!value) return "none";
  const category = MFER_APPEARANCE_TRAIT_CATEGORIES.find((entry) => entry.id === categoryId);
  return category?.options.find((option) => option.id === value)?.label ?? value;
}

function formatTraitUpdateSuccessStatus(result: TraitUpdateResult) {
  const action = result.free ? "saved free set" : "saved set";
  return result.name ? `${action} as ${result.name}` : action;
}
