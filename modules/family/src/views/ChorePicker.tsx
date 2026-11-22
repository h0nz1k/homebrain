import { useEffect, useRef, useState } from 'react';
import { Icon } from '@homebrain/ui';
import { localKey } from '../format.js';

const times = Array.from(
  { length: 96 },
  (_, index) =>
    `${String(Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`,
);

export function ChorePicker({
  type,
  value,
  min,
  now = new Date(),
  onPick,
}: {
  type: 'date' | 'time';
  value: string;
  min?: string;
  now?: Date;
  onPick: (value: string) => void;
}) {
  const label = type === 'date' ? 'Vybrat datum' : 'Vybrat čas';
  const input = useRef<HTMLInputElement>(null);
  const timeList = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date());
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12);
  const nextIndex = Math.floor((now.getHours() * 60 + now.getMinutes()) / 15) + 1;
  const nextTime = times[nextIndex];
  useEffect(() => {
    if (!open) return;
    const list = timeList.current;
    const next = list?.querySelector<HTMLElement>('[data-next="true"]');
    if (list) {
      list.scrollTop = next ? Math.max(0, next.offsetTop - 44) : list.scrollHeight;
      (next ?? list.querySelector<HTMLElement>('button:last-child'))?.focus({
        preventScroll: true,
      });
    }
  }, [open, nextTime]);
  useEffect(() => {
    // Keep the whole popover above the sticky sheet footer on small screens.
    if (open) popover.current?.scrollIntoView?.({ block: 'nearest' });
  }, [open]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const select = (next: string) => {
    if (!next || (min && next < min)) return;
    onPick(next);
    if (open) close();
  };
  return (
    <>
      {type === 'date' && (
        <input
          ref={input}
          className="fam-native-picker"
          data-testid={`family-native-${type}`}
          type={type}
          value={value}
          min={min}
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => select(event.currentTarget.value)}
        />
      )}
      <button
        ref={trigger}
        type="button"
        className="fam-picker-button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => {
          if (open) {
            close();
            return;
          }
          if (type === 'date') {
            try {
              if (typeof input.current?.showPicker === 'function') {
                input.current.showPicker();
                return;
              }
            } catch {
              // The HA frame or WebView can block the native picker.
            }
            setMonth(new Date(`${value || min || localKey(now)}T12:00:00`));
          }
          setOpen(true);
        }}
      >
        <Icon name={type === 'date' ? 'calendar' : 'clock'} size={20} />
      </button>
      {open && (
        <div
          ref={popover}
          className="fam-picker-popover"
          data-type={type}
          role="group"
          aria-label={label}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              close();
            }
          }}
        >
          {type === 'date' ? (
            <>
              <div className="fam-picker-month">
                <button
                  type="button"
                  aria-label="Předchozí měsíc"
                  disabled={!!min && localKey(first).slice(0, 7) <= min.slice(0, 7)}
                  onClick={() => setMonth(new Date(first.getFullYear(), first.getMonth() - 1, 1))}
                >
                  ‹
                </button>
                <strong>
                  {first.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' })}
                </strong>
                <button
                  type="button"
                  aria-label="Další měsíc"
                  onClick={() => setMonth(new Date(first.getFullYear(), first.getMonth() + 1, 1))}
                >
                  ›
                </button>
              </div>
              <div className="fam-picker-days">
                {['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'].map((day) => (
                  <span key={day}>{day}</span>
                ))}
                {Array.from({ length: last.getDate() }, (_, index) => {
                  const date = new Date(first.getFullYear(), first.getMonth(), index + 1, 12);
                  const key = localKey(date);
                  return (
                    <button
                      key={key}
                      type="button"
                      style={
                        index === 0
                          ? { gridColumnStart: ((first.getDay() + 6) % 7) + 1 }
                          : undefined
                      }
                      disabled={!!min && key < min}
                      aria-pressed={key === value}
                      aria-current={key === min ? 'date' : undefined}
                      aria-label={date.toLocaleDateString('cs-CZ')}
                      onClick={() => select(key)}
                    >
                      {index + 1}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="fam-picker-times" ref={timeList} aria-label="Čas po čtvrthodinách">
              {times.map((time) => (
                <button
                  key={time}
                  type="button"
                  aria-pressed={time === value}
                  data-next={time === nextTime || undefined}
                  aria-label={time === nextTime ? `${time} Nejbližší čas` : undefined}
                  onClick={() => select(time)}
                >
                  {time}
                  {time === nextTime && <small>Nejbližší čas</small>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
