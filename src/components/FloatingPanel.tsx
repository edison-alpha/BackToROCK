"use client";

import { useEffect, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from "react";
import { motion, useDragControls, useMotionValue } from "motion/react";
import { Icon } from "@iconify/react";

// Shared across panels so the one you touched last sits on top.
let topZ = 10;
const STEP = 24;

export function FloatingPanel({
  title,
  icon,
  bounds,
  className,
  defaultWidth,
  minWidth = 360,
  headerExtra,
  onClose,
  children,
}: {
  title: string;
  icon: string;
  bounds: RefObject<HTMLElement | null>;
  className?: string;
  defaultWidth: number;
  minWidth?: number;
  headerExtra?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const controls = useDragControls();
  const [z, setZ] = useState(() => ++topZ);
  const [width, setWidth] = useState(defaultWidth);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // After a rotation or resize the old drag offset can leave the panel outside the screen, out of reach. Go back home.
  useEffect(() => {
    const home = () => {
      x.set(0);
      y.set(0);
    };
    window.addEventListener("resize", home);
    return () => window.removeEventListener("resize", home);
  }, [x, y]);

  const maxWidth = () => (bounds.current?.clientWidth ?? 1400) - 24;
  const clamp = (w: number) => Math.min(Math.max(w, minWidth), maxWidth());

  const startResize = (e: PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startW = width;
    const target = e.currentTarget;
    const move = (ev: globalThis.PointerEvent) => setWidth(clamp(startW + ev.clientX - startX));
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

  const keyResize = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowRight") setWidth((w) => clamp(w + STEP));
    if (e.key === "ArrowLeft") setWidth((w) => clamp(w - STEP));
  };

  return (
    <motion.section
      aria-label={title}
      drag
      dragControls={controls}
      dragListener={false}
      dragMomentum={false}
      dragConstraints={bounds}
      dragElastic={0}
      onPointerDown={() => setZ(++topZ)}
      style={{ x, y, zIndex: z, width, maxWidth: "calc(100% - 1.5rem)" }}
      className={`pointer-events-auto absolute rounded-xl border border-white/10 bg-[#202020] p-1.5 shadow-[0_10px_28px_rgba(0,0,0,0.5)] ${className ?? ""}`}
    >
      <div className="mb-1 flex items-center gap-1">
        <div
          onPointerDown={(e) => controls.start(e)}
          className="flex h-8 shrink-0 cursor-grab touch-none select-none items-center gap-2 rounded-lg px-2 text-sm font-medium active:cursor-grabbing"
          title="Drag to move"
        >
          <Icon icon={icon} width={16} />
          {title}
        </div>
        {headerExtra && <div className="thin-scroll min-w-0 overflow-x-auto">{headerExtra}</div>}
        {/* Empty stretch of the header stays draggable. */}
        <div
          onPointerDown={(e) => controls.start(e)}
          className="h-8 min-w-2 flex-1 cursor-grab touch-none active:cursor-grabbing"
          aria-hidden
        />
        <button
          onClick={onClose}
          aria-label={`Close ${title} panel`}
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/10 hover:text-white"
        >
          <Icon icon="solar:close-circle-linear" width={18} />
        </button>
      </div>
      {children}
      <button
        onPointerDown={startResize}
        onKeyDown={keyResize}
        aria-label={`Resize ${title} panel, use the left and right arrow keys`}
        title="Drag to resize"
        className="absolute -bottom-1 -right-1 flex size-6 cursor-nwse-resize touch-none items-end justify-end rounded-br-xl p-1 text-muted-foreground hover:text-white"
      >
        <Icon icon="solar:round-alt-arrow-right-linear" width={14} className="rotate-45" />
      </button>
    </motion.section>
  );
}
