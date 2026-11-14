import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons.js';

/** Below this width the help opens as a bottom sheet with equal margins and a close button. */
const SHEET_QUERY = '(max-width: 599px)';
const EDGE = 12;
const GAP = 8;

function wantsSheet() {
  return typeof window.matchMedia === 'function' && window.matchMedia(SHEET_QUERY).matches;
}

/**
 * Tap, hover and keyboard help; Escape dismisses without moving focus.
 * Desktop: elevated popover with an arrow pointing at the (i). Phone: bottom sheet.
 */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  // Sheet host: the nearest themed ancestor, so tokens still apply outside the card.
  const [sheet, setSheet] = useState<HTMLElement | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const pointerFocus = useRef(false);
  const lastPointer = useRef('');
  // The click that follows a hover keeps the popover open instead of toggling it shut.
  const hoverOpen = useRef(false);
  const show = () => {
    setSheet(
      wantsSheet() ? (anchor.current?.closest<HTMLElement>('[data-theme]') ?? document.body) : null,
    );
    setOpen(true);
  };
  useLayoutEffect(() => {
    if (!open || sheet || !anchor.current || !tip.current) return;
    const rect = anchor.current.getBoundingClientRect();
    const box = tip.current.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const left = Math.max(
      EDGE,
      Math.min(center - box.width / 2, window.innerWidth - box.width - EDGE),
    );
    const below = rect.bottom + GAP + box.height <= window.innerHeight - EDGE;
    const top = below ? rect.bottom + GAP : Math.max(EDGE, rect.top - GAP - box.height);
    const el = tip.current;
    el.style.left = `${left - rect.left}px`;
    el.style.top = `${top - rect.top}px`;
    el.dataset.placement = below ? 'bottom' : 'top';
    el.style.setProperty('--hb-tip-arrow-x', `${center - left}px`);
  }, [open, sheet]);
  useEffect(() => {
    if (!open || !sheet) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, sheet]);
  const close = () => {
    setOpen(false);
    // Return focus without the focus handler reopening the help.
    pointerFocus.current = true;
    trigger.current?.focus({ preventScroll: true });
  };
  return (
    <span
      ref={anchor}
      className="hb-info-tip"
      onMouseEnter={() => {
        // Touch taps emulate mouseenter before click; only a real mouse hovers, never a sheet.
        if (lastPointer.current === 'touch' || wantsSheet() || open) return;
        hoverOpen.current = true;
        show();
      }}
      onMouseLeave={() => {
        hoverOpen.current = false;
        if (!sheet) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={`Nápověda: ${label}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onPointerDown={(event) => {
          pointerFocus.current = true;
          lastPointer.current = event.pointerType;
        }}
        onFocus={() => {
          if (!pointerFocus.current) show();
        }}
        onBlur={() => {
          if (!sheet) setOpen(false);
          pointerFocus.current = false;
        }}
        onClick={() => {
          if (open && !hoverOpen.current) setOpen(false);
          else show();
          hoverOpen.current = false;
          pointerFocus.current = false;
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            setOpen(false);
            event.stopPropagation();
          }
        }}
      >
        <Icon name="info" size={20} />
      </button>
      {open && !sheet && (
        <span ref={tip} id={id} role="tooltip" className="hb-info-tip-body">
          {children}
        </span>
      )}
      {open &&
        sheet &&
        createPortal(
          <div className="hb-info-sheet-scrim" onClick={close}>
            <div className="hb-info-sheet" onClick={(event) => event.stopPropagation()}>
              <div className="hb-info-sheet-head">
                <strong>{label}</strong>
                <button type="button" aria-label="Zavřít nápovědu" onClick={close}>
                  <Icon name="close" size={20} />
                </button>
              </div>
              <div id={id} role="tooltip" className="hb-info-sheet-body">
                {children}
              </div>
            </div>
          </div>,
          sheet,
        )}
    </span>
  );
}
