import { toast } from '@homebrain/ui';

/** Sekce „Oznámení naživo“: spouští skutečný toast do <Toaster /> katalogu. */
export function ToastLive() {
  return (
    <section className="cat-section" id="toast-live" aria-labelledby="toast-live-h">
      <h2 id="toast-live-h">Oznámení naživo</h2>
      <p className="cat-summary">
        Spouští skutečný <code>toast</code> → <code>&lt;Toaster /&gt;</code> (max 3, pauza při
        najetí myší, Esc/Tab dosáhne na akce).
      </p>
      <div className="cat-row">
        <button type="button" className="cat-btn" onClick={() => toast.success('Uloženo')}>
          toast.success
        </button>
        <button
          type="button"
          className="cat-btn"
          onClick={() =>
            toast.error('Nepodařilo se uložit', {
              action: { label: 'Zkusit znovu', onAction: () => toast.success('Uloženo') },
            })
          }
        >
          toast.error
        </button>
        <button
          type="button"
          className="cat-btn"
          onClick={() => toast.info('Import dokončen', { description: 'Přidáno 12 vín' })}
        >
          toast.info
        </button>
        <button
          type="button"
          className="cat-btn"
          onClick={() =>
            toast.undo('Lahev odepsána', () => toast.info('Odpis vrácen'), { id: 'undo' })
          }
        >
          toast.undo
        </button>
        <button
          type="button"
          className="cat-btn"
          data-testid="cat-toast-stack"
          onClick={() => {
            toast.success('Hodnocení uloženo: 4 z 5', { id: 'a' });
            toast.undo('Lahev odepsána', () => undefined, { id: 'b' });
            toast.error('Nepodařilo se uložit', {
              id: 'c',
              description: 'Spojení s Home Assistantem se přerušilo',
              action: { label: 'Zkusit znovu', onAction: () => undefined },
            });
          }}
        >
          Ukázat sadu
        </button>
      </div>
    </section>
  );
}
