import { PANEL_PATHS_BY_MODULE } from '@homebrain/ha-client';
import type { WsHandlers } from './shared.js';

/** Zprávy: recent notification audit; `?messages=empty`. */
export function communicationHandlers(): WsHandlers {
  return {
    'homebrain/communication/recent': {
      messages:
        new URLSearchParams(location.search).get('messages') === 'empty'
          ? []
          : [
              {
                id: 'audit-demo-1',
                notification_id: 'demo-1',
                recipient: 'demo',
                title: 'Připomenutí domácnosti',
                message: 'Zkušební úkol je hotový.',
                priority: 'high',
                at: '2026-11-12T12:00:00Z',
                channel: 'push',
                status: 'acknowledged',
                reason: '',
                ack: true,
              },
              {
                id: 'audit-demo-2',
                notification_id: 'demo-2',
                recipient: 'other',
                title: 'Denní souhrn',
                message: 'Dvě nové informační zprávy.',
                priority: 'info',
                at: '2026-11-12T07:00:00Z',
                channel: 'email',
                status: 'sent',
                reason: 'service_accepted',
                ack: false,
              },
            ],
    },
  };
}

// `?session=adult|child|kiosk|guest`: answer `homebrain/session/get` like the integration does for
// a non-admin HA user with that role (guest = unmapped -> „Nemáte přístup“). Absent = no session.
const DEV_VISIBLE: Record<string, string[]> = {
  // HA admin owner (e.g. „Otevřít zařízení“ in Hlídání domu opens the HA device page).
  owner: Object.keys(PANEL_PATHS_BY_MODULE),
  adult: [
    'kitchen',
    'energy',
    'family',
    'heating',
    'network',
    'recipes',
    'today',
    'waste',
    'weather',
  ],
  child: ['family', 'heating', 'recipes', 'today', 'waste', 'weather'],
  kiosk: ['kitchen', 'energy', 'family', 'recipes', 'today', 'waste', 'weather'],
  guest: ['about'],
};

export function devSessionHandlers(): WsHandlers {
  const devSessionRole = new URLSearchParams(location.search).get('session');
  return devSessionRole && DEV_VISIBLE[devSessionRole]
    ? {
        'homebrain/session/get': {
          role: devSessionRole,
          visible_modules: DEV_VISIBLE[devSessionRole],
          unavailable_modules: [],
          disabled_modules: [],
          is_admin: devSessionRole === 'owner',
          kiosk: devSessionRole === 'kiosk',
        },
      }
    : {};
}
