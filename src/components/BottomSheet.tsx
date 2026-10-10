"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import { Icon } from "@iconify/react";

const CLOSE_DISTANCE = 110;
const CLOSE_VELOCITY = 500;

// Mobile-style modal: rises from the bottom, close with the button, Esc, a tap outside, or by dragging it down.
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const controls = useDragControls();
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    sheetRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[150]">
          <motion.button
            aria-label="Tutup pengaturan"
            className="absolute inset-0 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            className="absolute inset-x-0 bottom-0 mx-auto max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-b-0 border-white/10 bg-[#1f1f1f] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] outline-none"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", duration: 0.45, bounce: 0.05 }}
            drag="y"
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > CLOSE_DISTANCE || info.velocity.y > CLOSE_VELOCITY) onClose();
            }}
          >
            {/* Only the grabber and title start a drag, so sliders inside keep working. */}
            <div onPointerDown={(e) => controls.start(e)} className="-mx-5 cursor-grab touch-none px-5 pb-2 pt-3 active:cursor-grabbing">
              <div className="mx-auto h-1.5 w-11 rounded-full bg-white/25" aria-hidden />
              <div className="mt-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">{title}</h2>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={onClose}
                  aria-label="Tutup pengaturan"
                  className="flex size-11 items-center justify-center rounded-full text-white/80 hover:bg-white/10"
                >
                  <Icon icon="solar:close-circle-linear" width={22} />
                </button>
              </div>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
