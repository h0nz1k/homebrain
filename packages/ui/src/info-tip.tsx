import { useId, useRef, useState, type ReactNode } from 'react';

/** Tap, hover and keyboard help; Escape dismisses without moving focus. */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const pointerFocus = useRef(false);
  return (
    <span
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
        <span id={id} role="tooltip" className="hb-info-tip-body">
          {children}
        </span>
      )}
    </span>
  );
}
