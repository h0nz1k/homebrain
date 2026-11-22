import { useRef, useState } from 'react';
import { Icon } from '@homebrain/ui';
import { localKey } from '../format.js';

const minutes = ['00', '15', '30', '45'];

export function ChorePicker({
  type,
  value,
  min,
  onPick,
}: {
  type: 'date' | 'time';
  value: string;
  min?: string;
  onPick: (value: string) => void;
}) {
  const label = type === 'date' ? 'Vybrat datum' : 'Vybrat čas';
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date());
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12);
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
          try {
            if (typeof input.current?.showPicker === 'function') {
              input.current.showPicker();
              return;
            }
          } catch {
            // The HA frame or WebView can block the native picker.
          }
          if (type === 'date') setMonth(new Date(`${value || min}T12:00:00`));
          setOpen(true);
        }}
      >
        <Icon name={type === 'date' ? 'calendar' : 'clock'} size={20} />
      </button>
      {open && (
        <div
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
            <select
              aria-label="Čas po čtvrthodinách"
              size={6}
              value={value}
              onChange={(event) => select(event.currentTarget.value)}
            >
              {Array.from({ length: 24 }, (_, hour) =>
                minutes.map((minute) => {
                  const time = `${String(hour).padStart(2, '0')}:${minute}`;
                  return (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  );
                }),
              )}
            </select>
          )}
        </div>
      )}
    </>
  );
}
