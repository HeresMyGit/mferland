import { type CSSProperties, type PointerEvent, useEffect, useRef, useState } from "react";
import { type MobileMoveInput } from "../game/TownScene";

const STICK_DEADZONE = 0.16;
const STICK_RANGE_SCALE = 0.36;

type MobileControlsProps = {
  disabled?: boolean;
  inputRef: {
    current: MobileMoveInput;
  };
};

type StickVisualState = {
  active: boolean;
  x: number;
  y: number;
};

const CENTERED_STICK: StickVisualState = { active: false, x: 0, y: 0 };

export function MobileControls({ disabled = false, inputRef }: MobileControlsProps) {
  const activePointerId = useRef<number | null>(null);
  const [stick, setStick] = useState<StickVisualState>(CENTERED_STICK);
  const [isMobileTouchDevice, setIsMobileTouchDevice] = useState(false);

  useEffect(() => {
    setIsMobileTouchDevice(detectMobileTouchDevice());
  }, []);

  useEffect(() => {
    if (!disabled) return;
    resetStick();
  }, [disabled]);

  useEffect(() => () => {
    activePointerId.current = null;
    clearInput();
  }, []);

  function resetStick() {
    activePointerId.current = null;
    clearInput();
    setStick(CENTERED_STICK);
  }

  function clearInput() {
    inputRef.current.active = false;
    inputRef.current.forward = 0;
    inputRef.current.right = 0;
    inputRef.current.sprint = false;
  }

  function beginStick(event: PointerEvent<HTMLButtonElement>) {
    if (disabled || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    event.stopPropagation();
    activePointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateStick(event);
  }

  function moveStick(event: PointerEvent<HTMLButtonElement>) {
    if (activePointerId.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    updateStick(event);
  }

  function endStick(event: PointerEvent<HTMLButtonElement>) {
    if (activePointerId.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released when the OS cancels a gesture.
    }
    resetStick();
  }

  function updateStick(event: PointerEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const range = Math.max(1, Math.min(rect.width, rect.height) * STICK_RANGE_SCALE);
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(dx, dy);
    const clampScale = distance > range ? range / distance : 1;
    const knobX = dx * clampScale;
    const knobY = dy * clampScale;
    const normalizedDistance = Math.min(distance / range, 1);

    if (normalizedDistance < STICK_DEADZONE) {
      inputRef.current.active = false;
      inputRef.current.forward = 0;
      inputRef.current.right = 0;
      inputRef.current.sprint = false;
    } else {
      const directionScale = distance > 0 ? 1 / distance : 0;
      const analogStrength = (normalizedDistance - STICK_DEADZONE) / (1 - STICK_DEADZONE);
      inputRef.current.active = true;
      inputRef.current.forward = -dy * directionScale * analogStrength;
      inputRef.current.right = dx * directionScale * analogStrength;
      inputRef.current.sprint = true;
    }

    setStick({ active: normalizedDistance >= STICK_DEADZONE, x: knobX, y: knobY });
  }

  if (disabled || !isMobileTouchDevice) return null;

  return (
    <div className="mobile-controls" aria-hidden={disabled}>
      <button
        className={stick.active ? "mobile-touch-stick active" : "mobile-touch-stick"}
        type="button"
        aria-label="Move"
        onPointerDown={beginStick}
        onPointerMove={moveStick}
        onPointerUp={endStick}
        onPointerCancel={endStick}
        style={{
          "--stick-x": `${stick.x}px`,
          "--stick-y": `${stick.y}px`,
        } as CSSProperties}
      >
        <span className="mobile-touch-stick-knob" />
      </button>
    </div>
  );
}

function detectMobileTouchDevice() {
  const userAgent = navigator.userAgent;
  const isMobileUserAgent = /Android|iPhone|iPod|iPad|Mobile|Tablet|Kindle|Silk/i.test(userAgent);
  const isDesktopModeIpad = navigator.maxTouchPoints > 1 && /Macintosh/i.test(userAgent);
  return navigator.maxTouchPoints > 0 && (isMobileUserAgent || isDesktopModeIpad);
}
