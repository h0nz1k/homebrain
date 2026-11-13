import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Tap, hover and keyboard help; Escape dismisses without moving focus. */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!open || !anchor.current || !tip.current) return;
    const rect = anchor.current.getBoundingClientRect();
    const box = tip.current.getBoundingClientRect();
    const left = Math.max(
      12,
      Math.min(rect.left + rect.width / 2 - box.width / 2, window.innerWidth - box.width - 12),
    );
    const top =
      rect.bottom + box.height <= window.innerHeight - 12
        ? rect.bottom
        : Math.max(12, rect.top - box.height);
    tip.current.style.left = `${left - rect.left}px`;
    tip.current.style.top = `${top - rect.top}px`;
    tip.current.style.right = 'auto';
  }, [open]);
  const pointerFocus = useRef(false);
  return (
    <span
      ref={anchor}
      className="hb-info-tip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`Nápověda: ${label}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onPointerDown={() => {
          pointerFocus.current = true;
        }}
        onFocus={() => {
          if (!pointerFocus.current) setOpen(true);
        }}
        onBlur={() => {
          setOpen(false);
          pointerFocus.current = false;
        }}
        onClick={() => {
          setOpen(!open);
          pointerFocus.current = false;
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
            event.stopPropagation();
          }
        }}
      >
        i
      </button>
      {open && (
        <span ref={tip} id={id} role="tooltip" className="hb-info-tip-body">
          {children}
        </span>
      )}
    </span>
  );
}
