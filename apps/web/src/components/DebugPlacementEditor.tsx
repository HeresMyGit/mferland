import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { Copy, RotateCcw, Save, Trash2, X } from "lucide-react";
import {
  type DebugPlacementOverrides,
  type DebugPlacementTarget,
  type DebugPlacementValue,
  getDebugPlacementValue,
} from "../game/debugPlacement";

type DebugPlacementEditorProps = {
  targets: DebugPlacementTarget[];
  overrides: DebugPlacementOverrides;
  selectedId: string | null;
  onSelect: (targetId: string | null) => void;
  onChange: (target: DebugPlacementTarget, value: DebugPlacementValue, commit: boolean) => void;
  onClear: (targetId: string) => void;
  onClearAll: () => void;
  onSaveDefaults: () => void;
  saveStatus: {
    state: "idle" | "saving" | "saved" | "error";
    message: string;
  };
  onClose: () => void;
};

export function DebugPlacementEditor({
  targets,
  overrides,
  selectedId,
  onSelect,
  onChange,
  onClear,
  onClearAll,
  onSaveDefaults,
  saveStatus,
  onClose,
}: DebugPlacementEditorProps) {
  const [copied, setCopied] = useState(false);
  const targetMap = useMemo(() => new Map(targets.map((target) => [target.id, target])), [targets]);
  const selectedTarget = selectedId ? targetMap.get(selectedId) ?? null : null;
  const selectedValue = selectedTarget ? getDebugPlacementValue(selectedTarget, overrides) : null;

  useEffect(() => {
    if (!selectedId || targetMap.has(selectedId)) return;
    onSelect(null);
  }, [onSelect, selectedId, targetMap]);

  function handleSelectChange(event: ChangeEvent<HTMLSelectElement>) {
    onSelect(event.target.value || null);
  }

  function updateSelected(partial: Partial<DebugPlacementValue>, commit = true) {
    if (!selectedTarget || !selectedValue) return;
    onChange(selectedTarget, { ...selectedValue, ...partial }, commit);
  }

  function updateNumber(field: keyof DebugPlacementValue, rawValue: string) {
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;
    updateSelected({ [field]: field === "rotation" ? degreesToRadians(value) : value }, true);
  }

  function nudgeRotation(deltaDegrees: number) {
    if (!selectedValue) return;
    updateSelected({ rotation: selectedValue.rotation + degreesToRadians(deltaDegrees) }, true);
  }

  async function copySelectedValue() {
    if (!selectedTarget || !selectedValue) return;
    const payload = {
      id: selectedTarget.id,
      kind: selectedTarget.kind,
      label: selectedTarget.label,
      x: roundPlacement(selectedValue.x),
      z: roundPlacement(selectedValue.z),
      rotation: roundRotation(selectedValue.rotation),
      rotationDegrees: roundRotation(radiansToDegrees(selectedValue.rotation)),
      source: selectedTarget.source,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1000);
    } catch {
      setCopied(false);
    }
  }

  const selectedRotationDegrees = selectedValue ? roundRotation(radiansToDegrees(wrapRadians(selectedValue.rotation))) : 0;

  return (
    <section className="debug-placement-editor" aria-label="Debug placement editor">
      <div className="debug-placement-header">
        <div>
          <strong>Placement</strong>
          <span>{targets.length} targets</span>
        </div>
        <button type="button" title="Close placement editor" aria-label="Close placement editor" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <select className="debug-placement-select" value={selectedId ?? ""} onChange={handleSelectChange}>
        <option value="">Select target</option>
        {targets.map((target) => (
          <option key={target.id} value={target.id}>
            {target.kind.toUpperCase()} - {target.label}
          </option>
        ))}
      </select>

      {selectedTarget && selectedValue ? (
        <div className="debug-placement-controls">
          <div className="debug-placement-target-title">
            <strong>{selectedTarget.label}</strong>
            <span>{selectedTarget.kind} - {selectedTarget.source}</span>
          </div>
          <div className="debug-placement-fields">
            <label>
              <span>X</span>
              <input type="number" step="0.1" value={roundPlacement(selectedValue.x)} onChange={(event) => updateNumber("x", event.target.value)} />
            </label>
            <label>
              <span>Z</span>
              <input type="number" step="0.1" value={roundPlacement(selectedValue.z)} onChange={(event) => updateNumber("z", event.target.value)} />
            </label>
            <label>
              <span>Rot</span>
              <input type="number" step="1" value={selectedRotationDegrees} onChange={(event) => updateNumber("rotation", event.target.value)} />
            </label>
          </div>
          <div className="debug-placement-rotation-row">
            <button type="button" title="Rotate left 15 degrees" aria-label="Rotate left 15 degrees" onClick={() => nudgeRotation(-15)}>
              -15
            </button>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={selectedRotationDegrees}
              onChange={(event) => updateNumber("rotation", event.target.value)}
            />
            <button type="button" title="Rotate right 15 degrees" aria-label="Rotate right 15 degrees" onClick={() => nudgeRotation(15)}>
              +15
            </button>
          </div>
          <div className="debug-placement-actions">
            <button type="button" onClick={() => onClear(selectedTarget.id)}>
              <RotateCcw size={14} />
              <span>Reset</span>
            </button>
            <button type="button" onClick={copySelectedValue}>
              <Copy size={14} />
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
        </div>
      ) : null}

      <div className="debug-placement-save">
        <button type="button" disabled={saveStatus.state === "saving"} onClick={onSaveDefaults}>
          <Save size={14} />
          <span>{saveStatus.state === "saving" ? "Saving map..." : "Save map defaults"}</span>
        </button>
        {saveStatus.message ? <span>{saveStatus.message}</span> : null}
      </div>

      <div className="debug-placement-danger">
        <button type="button" title="Clear all placement overrides" aria-label="Clear all placement overrides" onClick={onClearAll}>
          <Trash2 size={14} />
          <span>Clear all overrides</span>
        </button>
      </div>
    </section>
  );
}

function roundPlacement(value: number) {
  return Math.round(value * 10) / 10;
}

function roundRotation(value: number) {
  return Math.round(value * 10) / 10;
}

function radiansToDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

function wrapRadians(value: number) {
  const full = Math.PI * 2;
  return ((((value + Math.PI) % full) + full) % full) - Math.PI;
}
