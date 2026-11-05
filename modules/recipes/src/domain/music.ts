/**
 * Music bar model. Music = YouTube Music APP on the kitchen tablet, controlled through
 * HA Companion notification commands (server side, `homebrain/recipes/music`):
 * https://companion.home-assistant.io/docs/notifications/notification-commands/
 * Now playing = Companion media session sensor:
 * https://companion.home-assistant.io/docs/core/sensors/#media-session-sensor
 */
import type { RecipesConfig } from '../types.js';

export const YT_MUSIC_PACKAGE = 'com.google.android.apps.youtube.music';

interface StateLike {
  state: string;
  attributes: Record<string, unknown>;
}
export interface MusicBarModel {
  visible: boolean;
  /** `full` capsule, or the content-width pill while a recipe video plays. */
  mode: 'full' | 'ducked';
  playing: boolean;
  title: string | null;
  artist: string | null;
}

function attr(state: StateLike | undefined, name: string): string | null {
  if (!state) return null;
  const value = state.attributes[`${name}_${YT_MUSIC_PACKAGE}`] ?? state.attributes[name];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function musicBarModel(
  config: RecipesConfig | null,
  session: StateLike | undefined,
  videoPlaying: boolean,
  optimisticPlaying: boolean | null = null,
): MusicBarModel {
  const visible = Boolean(config?.music.configured);
  const playback = (attr(session, 'playback_state') ?? session?.state ?? '').toLowerCase();
  const playing = optimisticPlaying ?? playback === 'playing';
  return {
    visible,
    mode: videoPlaying ? 'ducked' : 'full',
    playing: videoPlaying ? false : playing,
    title: attr(session, 'title'),
    artist: attr(session, 'artist'),
  };
}

/**
 * Video ↔ music hand-off: pause music when the recipe video starts, resume afterwards –
 * but only if WE paused it (never start music the cook had stopped).
 */
export function createVideoMusicCoordinator(send: (cmd: 'play' | 'pause') => Promise<unknown>) {
  let pausedByVideo = false;
  return {
    async videoPlaying(musicPlaying: boolean) {
      if (musicPlaying && !pausedByVideo) {
        pausedByVideo = true;
        await send('pause');
      }
    },
    async videoStopped() {
      if (pausedByVideo) {
        pausedByVideo = false;
        await send('play');
      }
    },
    get pausedByVideo() {
      return pausedByVideo;
    },
  };
}
