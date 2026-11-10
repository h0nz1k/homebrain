import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ModuleViewProps } from '@homebrain/ha-client';
import { Button, SegmentedControl, toast } from '@homebrain/ui';
import { kitchenApi, openApp } from './api';
import { Artwork, Picker, Settings } from './Settings';
import { Cooking } from './Cooking';
import { batteryChip, batteryLabel } from './state';

function TransportIcon({ playing }: { playing: boolean }) {
  return (
    <svg className="kn-ico" viewBox="0 0 24 24" aria-hidden="true">
      {playing ? (
        <path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor" />
      ) : (
        <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
      )}
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg className="kn-ico" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M11 5 6 9H3v6h3l5 4V5z"
        fill="currentColor"
      />
      <path
        d="M15.5 8.5a4.5 4.5 0 0 1 0 7M18 5.5a7.5 7.5 0 0 1 0 13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BatteryIcon({ charging, level }: { charging: boolean; level: number | null }) {
  const fillW = level === null ? 0 : Math.max(0, Math.min(14, (14 * level) / 100));
  return (
    <svg className="kn-ico" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="7" width="16" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      {fillW > 0 ? (
        <rect
          x="6"
          y="9"
          width={fillW}
          height="6"
          rx="1"
          fill="var(--hb-ok)"
          opacity="0.95"
        />
      ) : null}
      <rect x="20" y="10" width="2" height="4" rx="0.5" fill="currentColor" />
      {charging ? (
        <path d="M12 8.5l-2.5 5h2l-1 4.5 3.5-6h-2.5l2.5-3.5z" fill="currentColor" />
      ) : null}
    </svg>
  );
}
import type { KitchenPerson, KitchenSnapshot, MediaItem } from './types';
import styles from './kitchen.css?inline';

export default function KitchenView(props: ModuleViewProps) {
  const api = useMemo(
    () => (props.connection ? kitchenApi(props.connection) : null),
    [props.connection],
  );
  const [snapshot, setSnapshot] = useState<KitchenSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<'music' | 'cooking'>('music');
  const [settings, setSettings] = useState(false);
  const [picker, setPicker] = useState<KitchenPerson | null>(null);
  const [clock, setClock] = useState(new Date());
  const refresh = useCallback(async () => {
    if (!api) return;
    try {
      setSnapshot(await api.get());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [api]);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const poll = setInterval(() => void refresh(), 5000);
    const tick = setInterval(() => setClock(new Date()), 1000);
    props.connection?.addEventListener?.('ready', refresh);
    return () => {
      clearTimeout(initial);
      clearInterval(poll);
      clearInterval(tick);
      props.connection?.removeEventListener?.('ready', refresh);
    };
  }, [refresh, props.connection]);
  const action = async (job: Promise<unknown>) => {
    try {
      await job;
      await refresh();
    } catch {
      toast.error('Příkaz se nepodařilo provést. Zkontrolujte přehrávač.');
    }
  };
  const ready = Boolean(snapshot?.ma_available && snapshot.player && !failed);
  const play = (item: MediaItem, type: 'radio' | 'playlist') => {
    if (api && ready) void action(api.play(item, type));
  };
  const player = snapshot?.player;
  const volume = Math.max(0, Math.min(1, player?.volume ?? 0));
  const battery = batteryChip(snapshot?.battery.level ?? null, snapshot?.battery.state ?? null);
  return (
    <div className="kn" data-testid="kitchen-view" data-tab={tab}>
      <style>{styles}</style>
      <header className="kn-header">
        <div className="kn-brand">
          <b>⌂ HomeBrain</b>
          <span>Kuchyň</span>
        </div>
        <SegmentedControl
          label="Kuchyň"
          hideLabel
          tone="accent"
          value={tab}
          options={[
            ['music', 'Hudba'],
            ['cooking', 'Vaření'],
          ]}
          onChange={setTab}
        />
        <div className="kn-clock">
          <time>{clock.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}</time>
          <span>
            {clock.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
        </div>
        {snapshot?.is_admin ? (
          <Button
            aria-label="Nastavení kuchyně"
            data-testid="kitchen-settings-open"
            onClick={() => setSettings(true)}
          >
            ⚙
          </Button>
        ) : null}
      </header>
      <div className="kn-content">
        {failed ? (
          <p className="kn-notice" role="alert">
            Kuchyň neodpovídá. <Button onClick={() => void refresh()}>Zkusit znovu</Button>
          </p>
        ) : !snapshot ? (
          <p role="status">Načítám kuchyň…</p>
        ) : null}
        {snapshot && tab === 'music' && !snapshot.ma_available ? (
          <p className="kn-notice" role="status">
            Music Assistant není dostupný. Vaření můžete používat dál.
          </p>
        ) : snapshot && tab === 'music' && !player ? (
          <p className="kn-notice" role="status">
            Vyberte přehrávač
            {snapshot.is_admin ? ' v nastavení kuchyně.' : ' · Požádejte správce o nastavení.'}
          </p>
        ) : null}
        {snapshot && tab === 'music' ? (
          <div className="kn-library">
            <section className="kn-radios">
              <div className="kn-section-head">
                <h1>Rádia</h1>
                <span>Stačí klepnout a hraje</span>
              </div>
              {snapshot.config.radios.length ? (
                <div className="kn-radio-grid">
                  {snapshot.config.radios.map((r, i) => (
                    <button
                      type="button"
                      className="kn-radio"
                      aria-pressed={player?.state === 'playing' && player.title === r.name}
                      key={r.uri}
                      disabled={!ready}
                      onClick={() => play(r, 'radio')}
                    >
                      <span className="kn-radio-cover">
                        <Artwork item={r} index={i} />
                        {player?.state === 'playing' && player.title === r.name ? (
                          <span className="kn-playing-badge" aria-hidden="true">
                            Hraje
                          </span>
                        ) : null}
                      </span>
                      <b>{r.name}</b>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="kn-empty">
                  Zatím žádná rádia. Správce je přidá vyhledáním v nastavení kuchyně.
                </p>
              )}
              {snapshot.config.more_radios.length ? (
                <div className="kn-more">
                  <span>Další rádia</span>
                  {snapshot.config.more_radios.map((r, i) => (
                    <button
                      type="button"
                      key={r.uri}
                      disabled={!ready}
                      onClick={() => play(r, 'radio')}
                    >
                      <Artwork item={r} index={i + 5} />
                      <b>{r.name}</b>
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
            {snapshot.config.persons.map((p, n) => (
              <section className="kn-person" key={n}>
                <div className="kn-person-library">
                  <div className="kn-section-head">
                    <h2>
                      <span className="kn-avatar">{p.name[0]}</span>
                      {p.name} <small>YT Music</small>
                    </h2>
                    <Button size="sm" onClick={() => setPicker(p)}>
                      Vše ›
                    </Button>
                  </div>
                  <div className="kn-playlists">
                    {p.playlists.map((item, i) => (
                      <button
                        type="button"
                        key={item.uri}
                        disabled={!ready}
                        onClick={() => play(item, 'playlist')}
                      >
                        <Artwork item={item} index={i + n * 5} />
                        <b>{item.name}</b>
                      </button>
                    ))}
                  </div>
                  {!p.playlists.length ? <p>Vyberte playlisty v nastavení kuchyně.</p> : null}
                </div>
                <Button
                  className="kn-youtube"
                  onClick={() => openApp(p.youtube_url, 'https://m.youtube.com')}
                >
                  <span className="kn-yt-symbol" aria-hidden="true">
                    ▶
                  </span>
                  <span>
                    <b>YouTube · {p.name}</b>
                    <small>otevře aplikaci ↗</small>
                  </span>
                </Button>
              </section>
            ))}
          </div>
        ) : null}
        {snapshot ? (
          <div hidden={tab !== 'cooking'}>
            <Cooking {...props} config={snapshot.config} />
          </div>
        ) : null}
      </div>
      <footer className="kn-player" aria-label="Přehrávač">
        <div className="kn-playing">
          <Artwork item={{ name: player?.title ?? '', image: player?.image ?? null }} />
          <div>
            <span
              className={
                player?.state === 'playing'
                  ? 'kn-live'
                  : player?.state === 'paused'
                    ? 'kn-paused'
                    : undefined
              }
            >
              {player?.state === 'playing'
                ? 'Právě hraje'
                : player?.state === 'paused'
                  ? 'Pozastaveno'
                  : 'Hudba'}
            </span>
            <b>{player ? player.title : 'Vyberte přehrávač'}</b>
            {player?.artist ? <span>{player.artist}</span> : null}
          </div>
        </div>
        <Button
          className="kn-transport"
          variant="primary"
          disabled={!ready}
          aria-label={player?.state === 'playing' ? 'Pozastavit přehrávání' : 'Spustit přehrávání'}
          onClick={() =>
            api && void action(api.transport(player?.state === 'playing' ? 'pause' : 'play'))
          }
        >
          <TransportIcon playing={player?.state === 'playing'} />
        </Button>
        <div className="kn-volume">
          <Button
            disabled={!ready}
            aria-label="Ztišit"
            onClick={() => api && void action(api.transport('volume', Math.max(0, volume - 0.05)))}
          >
            −
          </Button>
          <label>
            Hlasitost · {Math.round(volume * 100)} %
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              disabled={!ready}
              aria-label="Hlasitost"
              onChange={(e) =>
                setSnapshot((s) =>
                  s?.player
                    ? { ...s, player: { ...s.player, volume: Number(e.target.value) / 100 } }
                    : s,
                )
              }
              onPointerUp={(e) =>
                api && void action(api.transport('volume', Number(e.currentTarget.value) / 100))
              }
              onKeyUp={(e) => {
                if (
                  ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(
                    e.key,
                  ) &&
                  api
                )
                  void action(api.transport('volume', Number(e.currentTarget.value) / 100));
              }}
            />
          </label>
          <Button
            disabled={!ready}
            aria-label="Zesílit"
            onClick={() => api && void action(api.transport('volume', Math.min(1, volume + 0.05)))}
          >
            +
          </Button>
        </div>
        <div className="kn-device">
          <span className="kn-output">
            <SpeakerIcon />
            {player?.name ?? 'Výstup nenastaven'}
          </span>
          <span
            className="kn-battery"
            aria-label={batteryLabel(snapshot?.battery.level ?? null, snapshot?.battery.state ?? null)}
          >
            <BatteryIcon charging={battery.charging} level={battery.pct} />
            <span>
              {battery.pct !== null ? (
                <>
                  <b>{battery.pct} %</b>
                  {battery.hint ? <small>{battery.hint}</small> : null}
                </>
              ) : (
                <b>{battery.hint}</b>
              )}
            </span>
          </span>
        </div>
      </footer>
      {settings && snapshot?.is_admin && api ? (
        <Settings
          api={api}
          snapshot={snapshot}
          onSaved={() => void refresh()}
          onClose={() => setSettings(false)}
        />
      ) : null}
      {picker && api ? (
        <Picker
          api={api}
          provider={picker.provider}
          title={`Playlisty · ${picker.name}`}
          onChoose={(items) => {
            if (items[0]) play(items[0], 'playlist');
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </div>
  );
}
