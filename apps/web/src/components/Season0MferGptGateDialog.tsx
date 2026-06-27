import { ArrowDownUp, ShieldAlert, X } from "lucide-react";
import type { Season0MferGptGateSnapshot } from "@mferland/shared";

export function Season0MferGptGateDialog({
  gate,
  itemLabel,
  onDismiss,
  onSwap,
}: {
  gate: Season0MferGptGateSnapshot;
  itemLabel: string;
  onDismiss: () => void;
  onSwap: () => void;
}) {
  return (
    <div className="vendor-gate-backdrop" role="presentation">
      <section className="vendor-gate-dialog" role="alertdialog" aria-modal="true" aria-labelledby="vendor-gate-title">
        <header>
          <span className="vendor-gate-icon" aria-hidden="true">
            <ShieldAlert size={20} />
          </span>
          <div>
            <strong id="vendor-gate-title">25M MFERGPT needed</strong>
            <em>Season 0 point gate</em>
          </div>
          <button type="button" title="Keep haul" aria-label="Keep haul" onClick={onDismiss}>
            <X size={17} />
          </button>
        </header>

        <p>
          Selling {itemLabel} for Season 0 points needs {gate.requiredLabel} on Base.
          This wallet has {gate.balanceLabel}. Your items stayed in stash.
        </p>

        <div className="vendor-gate-meter">
          <span>current</span>
          <strong>{gate.balanceLabel}</strong>
          <span>needed</span>
          <strong>{gate.requiredLabel}</strong>
        </div>

        <div className="vendor-gate-actions">
          <button type="button" onClick={onDismiss}>
            keep haul
          </button>
          <button type="button" className="primary" onClick={onSwap}>
            <ArrowDownUp size={15} />
            swap now
          </button>
        </div>
      </section>
    </div>
  );
}
