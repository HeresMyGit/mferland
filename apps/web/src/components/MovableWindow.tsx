import {
  type CSSProperties,
  type HTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

type MovableWindowPosition = {
  x: number;
  y: number;
};

type MovableWindowProps = HTMLAttributes<HTMLElement> & {
  id: string;
  as?: "div" | "section";
  children: ReactNode;
  allowInteractiveDrag?: boolean;
  disabled?: boolean;
  disablePositionPersistence?: boolean;
};

type PendingWindowDrag = {
  element: HTMLElement;
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  timer: number;
  active: boolean;
};

const MOVABLE_WINDOW_STORAGE_KEY = "mferland:movableWindows:v1";
export const MOVABLE_WINDOW_RESET_EVENT = "mferland:movable-windows-reset";
const MOVABLE_WINDOW_LONG_PRESS_MS = 340;
const MOVABLE_WINDOW_MOVE_TOLERANCE = 6;
const MOVABLE_WINDOW_VIEWPORT_PADDING = 8;
const MOVABLE_WINDOW_MOBILE_BREAKPOINT = 640;
const MOVABLE_WINDOW_MOBILE_RESERVED_TOP = 148;
const MOBILE_TOP_RESERVED_WINDOW_IDS = new Set([
  "hud.quest-tracker",
  "hud.quest-log",
  "hud.loot",
  "hud.crypto-store",
  "hud.world-map",
  "hud.character",
  "hud.referral-info",
  "hud.referral-remove",
  "hud.abilities",
  "hud.traits",
  "hud.swap",
  "hud.potion-shop",
  "hud.trash-vendor",
  "hud.fishing-vendor",
  "hud.respec",
  "hud.quest-offer",
  "hud.quest-turn-in",
  "hud.quest-status",
]);

export function MovableWindow({
  id,
  as: Component = "div",
  className = "",
  style,
  disabled = false,
  disablePositionPersistence = false,
  onPointerDown,
  onClickCapture,
  children,
  allowInteractiveDrag = false,
  ...props
}: MovableWindowProps) {
  const [position, setPosition] = useState<MovableWindowPosition | null>(() => (
    disablePositionPersistence ? null : readMovableWindowPosition(id)
  ));
  const [dragging, setDragging] = useState(false);
  const elementRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<PendingWindowDrag | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    setPosition(disablePositionPersistence ? null : readMovableWindowPosition(id));
  }, [disablePositionPersistence, id]);

  useEffect(() => {
    function handleReset() {
      cancelWindowDrag(dragRef.current);
      dragRef.current = null;
      setDragging(false);
      setPosition(null);
    }

    window.addEventListener(MOVABLE_WINDOW_RESET_EVENT, handleReset);
    return () => window.removeEventListener(MOVABLE_WINDOW_RESET_EVENT, handleReset);
  }, []);

  useEffect(() => {
    if (!position) return;
    const element = elementRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const nextPosition = getClampedMovableWindowPosition(id, rect.left, rect.top, rect.width, rect.height);
    if (nextPosition.x === position.x && nextPosition.y === position.y) return;
    setPosition(nextPosition);
    if (!disablePositionPersistence) writeMovableWindowPosition(id, nextPosition);
  }, [disablePositionPersistence, id, position]);

  useEffect(() => {
    function handleResize() {
      if (disablePositionPersistence) return;
      const element = elementRef.current;
      if (!element) return;
      setPosition((current) => {
        if (!current) return current;
        const rect = element.getBoundingClientRect();
        const nextPosition = getClampedMovableWindowPosition(id, rect.left, rect.top, rect.width, rect.height);
        if (nextPosition.x === current.x && nextPosition.y === current.y) return current;
        writeMovableWindowPosition(id, nextPosition);
        return nextPosition;
      });
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [disablePositionPersistence, id]);

  useEffect(() => {
    function handlePointerMove(event: globalThis.PointerEvent) {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.currentX = event.clientX;
      drag.currentY = event.clientY;

      if (!drag.active) {
        const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
        if (distance > MOVABLE_WINDOW_MOVE_TOLERANCE) {
          cancelWindowDrag(drag);
          dragRef.current = null;
        }
        return;
      }

      event.preventDefault();
      setPosition(getClampedMovableWindowPosition(
        id,
        event.clientX - drag.offsetX,
        event.clientY - drag.offsetY,
        drag.width,
        drag.height,
      ));
    }

    function handlePointerEnd(event: globalThis.PointerEvent) {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;

      window.clearTimeout(drag.timer);
      if (drag.active) {
        const nextPosition = getClampedMovableWindowPosition(
          id,
          drag.currentX - drag.offsetX,
          drag.currentY - drag.offsetY,
          drag.width,
          drag.height,
        );
        setPosition(nextPosition);
        if (!disablePositionPersistence) writeMovableWindowPosition(id, nextPosition);
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      }

      releasePointerCapture(drag.element, drag.pointerId);
      dragRef.current = null;
      setDragging(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [id]);

  const movableStyle: CSSProperties = position
    ? {
        ...style,
        left: position.x,
        top: position.y,
        right: "auto",
        bottom: "auto",
        transform: "none",
      }
    : style ?? {};

  const movableClassName = [
    className,
    "movable-window",
    position ? "movable-window-custom-position" : "",
    dragging ? "movable-window-dragging" : "",
  ].filter(Boolean).join(" ");

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    onPointerDown?.(event);
    if (event.defaultPrevented || disabled || event.button !== 0) return;
    if (isMovableWindowHardIgnoredTarget(event.target)) return;
    if (!allowInteractiveDrag && isMovableWindowSoftIgnoredTarget(event.target)) return;

    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    cancelWindowDrag(dragRef.current);
    setDragging(false);
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best effort; window listeners still handle normal drags.
    }

    const drag: PendingWindowDrag = {
      element,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      timer: 0,
      active: false,
    };
    drag.timer = window.setTimeout(() => {
      if (dragRef.current !== drag) return;
      drag.active = true;
      setDragging(true);
      setPosition(getClampedMovableWindowPosition(
        id,
        drag.currentX - drag.offsetX,
        drag.currentY - drag.offsetY,
        drag.width,
        drag.height,
      ));
    }, MOVABLE_WINDOW_LONG_PRESS_MS);
    dragRef.current = drag;
  }

  function handleClickCapture(event: ReactMouseEvent<HTMLElement>) {
    if (suppressClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onClickCapture?.(event);
  }

  const elementProps = {
    ...props,
    className: movableClassName,
    "data-movable-window-id": id,
    style: movableStyle,
    onPointerDown: handlePointerDown,
    onClickCapture: handleClickCapture,
  };

  if (Component === "section") {
    return (
      <section
        {...elementProps}
        ref={(element) => {
          elementRef.current = element;
        }}
      >
        {children}
      </section>
    );
  }

  return (
    <div
      {...props}
      className={movableClassName}
      data-movable-window-id={id}
      style={movableStyle}
      onPointerDown={handlePointerDown}
      onClickCapture={handleClickCapture}
      ref={(element) => {
        elementRef.current = element;
      }}
    >
      {children}
    </div>
  );
}

export function resetMovableWindows() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(MOVABLE_WINDOW_STORAGE_KEY);
  } catch {
    // Ignore private-mode storage failures.
  }
  window.dispatchEvent(new Event(MOVABLE_WINDOW_RESET_EVENT));
}

function readMovableWindowPosition(id: string): MovableWindowPosition | null {
  if (typeof window === "undefined") return null;
  const positions = readMovableWindowPositions();
  const position = positions[id];
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
  return getClampedMovableWindowPosition(id, position.x, position.y, 80, 60);
}

function writeMovableWindowPosition(id: string, position: MovableWindowPosition) {
  if (typeof window === "undefined") return;
  const positions = readMovableWindowPositions();
  positions[id] = position;
  try {
    window.localStorage.setItem(MOVABLE_WINDOW_STORAGE_KEY, JSON.stringify(positions));
  } catch {
    // Layout customization is optional; ignore storage failures.
  }
}

function readMovableWindowPositions(): Record<string, MovableWindowPosition> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(MOVABLE_WINDOW_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as Record<string, MovableWindowPosition> : {};
  } catch {
    return {};
  }
}

function getClampedMovableWindowPosition(id: string, x: number, y: number, width: number, height: number): MovableWindowPosition {
  if (typeof window === "undefined") return { x, y };
  const minY = getMovableWindowMinY(id);
  const maxX = Math.max(MOVABLE_WINDOW_VIEWPORT_PADDING, window.innerWidth - Math.min(width, window.innerWidth) - MOVABLE_WINDOW_VIEWPORT_PADDING);
  const maxY = Math.max(minY, window.innerHeight - Math.min(height, window.innerHeight) - MOVABLE_WINDOW_VIEWPORT_PADDING);
  return {
    x: Math.round(Math.min(Math.max(MOVABLE_WINDOW_VIEWPORT_PADDING, x), maxX)),
    y: Math.round(Math.min(Math.max(minY, y), maxY)),
  };
}

function getMovableWindowMinY(id: string) {
  if (typeof window === "undefined") return MOVABLE_WINDOW_VIEWPORT_PADDING;
  if (window.innerWidth > MOVABLE_WINDOW_MOBILE_BREAKPOINT || !MOBILE_TOP_RESERVED_WINDOW_IDS.has(id)) {
    return MOVABLE_WINDOW_VIEWPORT_PADDING;
  }
  return Math.max(MOVABLE_WINDOW_VIEWPORT_PADDING, MOVABLE_WINDOW_MOBILE_RESERVED_TOP);
}

function isMovableWindowHardIgnoredTarget(target: EventTarget) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest([
    "button",
    "a",
    "input",
    "textarea",
    "select",
    "label",
    "[contenteditable='true']",
    "[data-no-window-drag]",
  ].join(",")));
}

function isMovableWindowSoftIgnoredTarget(target: EventTarget) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest([
    "[data-map-annotation]",
    ".world-map",
    ".minimap",
    ".inventory-grid",
    ".equipment-grid",
    ".abilities-list",
    ".action-slots",
    ".stream-overlay-player-row",
  ].join(",")));
}

function cancelWindowDrag(drag: PendingWindowDrag | null) {
  if (!drag) return;
  window.clearTimeout(drag.timer);
  releasePointerCapture(drag.element, drag.pointerId);
}

function releasePointerCapture(element: HTMLElement, pointerId: number) {
  try {
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
  } catch {
    // Pointer capture can be lost if the gesture leaves the browser window.
  }
}
