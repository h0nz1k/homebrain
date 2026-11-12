import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createEntityStore,
  type CommunicationMessage,
  type ConnectionLike,
} from '@homebrain/ha-client';
import CommunicationView from './CommunicationView';

afterEach(() => vi.useRealTimers());
const row: CommunicationMessage = {
  id: 'audit-demo',
  notification_id: 'message-demo',
  recipient: 'demo',
  title: 'Zkušební zpráva',
  message: '<script>ukázka</script>',
  at: '2026-11-12T12:00:00Z',
  channel: 'push',
  status: 'acknowledged',
  priority: 'high',
  reason: '',
  ack: true,
};
const connection = (send: ReturnType<typeof vi.fn>) =>
  ({ sendMessagePromise: send }) as unknown as ConnectionLike;
const props = { store: createEntityStore(), bindings: {} };

it('shows Czech audit details, confirmation and escaped message text', async () => {
  const send = vi.fn().mockResolvedValue({ messages: [row] });
  render(<CommunicationView {...props} connection={connection(send)} />);
  expect(await screen.findByText('Potvrzeno – odpověď „Beru“')).toBeDefined();
  expect(screen.getByText('<script>ukázka</script>')).toBeDefined();
  expect(document.querySelector('script')).toBeNull();
  expect(screen.getByText('Důležitá')).toBeDefined();
  expect(screen.getByText('Telefon')).toBeDefined();
  expect(send).toHaveBeenCalledWith({ type: 'homebrain/communication/recent' });
});

it('shows loading and an honest empty state without synthetic production messages', async () => {
  const send = vi.fn().mockResolvedValue({ messages: [] });
  render(<CommunicationView {...props} connection={connection(send)} />);
  expect(screen.getByRole('status').textContent).toContain('Načítání');
  expect(await screen.findByText('Zatím žádné zprávy')).toBeDefined();
});

it('recovers from a failed request using Obnovit', async () => {
  const send = vi
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ messages: [row] });
  render(<CommunicationView {...props} connection={connection(send)} />);
  expect(await screen.findByRole('alert')).toBeDefined();
  act(() => screen.getByRole('button', { name: 'Obnovit' }).click());
  expect(await screen.findByText('Zkušební zpráva')).toBeDefined();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('polls for updates and stops polling after unmount', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const send = vi.fn().mockResolvedValue({ messages: [] });
  const { unmount } = render(<CommunicationView {...props} connection={connection(send)} />);
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  await act(async () => {
    vi.advanceTimersByTime(30_000);
  });
  expect(send).toHaveBeenCalledTimes(2);
  unmount();
  await act(async () => {
    vi.advanceTimersByTime(30_000);
  });
  expect(send).toHaveBeenCalledTimes(2);
});

it('ignores stale requests when connection changes', async () => {
  let resolveOld!: (value: { messages: CommunicationMessage[] }) => void;
  const old = connection(
    vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
    ),
  );
  const { rerender } = render(<CommunicationView {...props} connection={old} />);
  rerender(
    <CommunicationView
      {...props}
      connection={connection(vi.fn().mockResolvedValue({ messages: [] }))}
    />,
  );
  expect(await screen.findByText('Zatím žádné zprávy')).toBeDefined();
  await act(async () => {
    resolveOld({ messages: [row] });
  });
  expect(screen.queryByText('Zkušební zpráva')).toBeNull();
});

it('hides unknown routing keys and uses semantic priority and delivery tones', async () => {
  const send = vi.fn().mockResolvedValue({
    messages: [
      {
        ...row,
        recipient: 'private_key',
        channel: 'unknown_channel',
        priority: 'critical',
        status: 'failed',
        ack: false,
      },
      { ...row, id: 'pending', status: 'sent', pending_ack: true, ack: false },
    ],
  });
  render(<CommunicationView {...props} connection={connection(send)} />);
  expect(await screen.findByText('Selhalo')).toBeDefined();
  expect(screen.queryByText('private_key')).toBeNull();
  expect(screen.queryByText('unknown_channel')).toBeNull();
  expect(screen.getByText('Kritická').getAttribute('data-tone')).toBe('crit');
  expect(screen.getByText('Selhalo').getAttribute('data-tone')).toBe('crit');
  expect(screen.getByText('Čeká na potvrzení').getAttribute('data-tone')).toBe('warn');
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Zprávy');
  expect(screen.getByRole('button', { name: 'Obnovit' }).textContent).toContain('↻');
});

it('formats Czech dates with minutes and colours acknowledged delivery green', async () => {
  const send = vi.fn().mockResolvedValue({ messages: [{ ...row, at: '2026-11-12T08:00:00' }] });
  render(<CommunicationView {...props} connection={connection(send)} />);
  const status = await screen.findByText('Potvrzeno – odpověď „Beru“');
  expect(status.getAttribute('data-tone')).toBe('ok');
  expect(document.querySelector('time')?.textContent).toBe('12. 11. 2026 08:00');
  expect(screen.queryByText('demo')).toBeNull();
});

it('shows messages delivered in a daily digest with a green Czech status', async () => {
  const send = vi.fn().mockResolvedValue({
    messages: [{ ...row, status: 'digested', channel: 'router', priority: 'info', ack: false }],
  });
  render(<CommunicationView {...props} connection={connection(send)} />);
  expect((await screen.findByText('V denním souhrnu')).getAttribute('data-tone')).toBe('ok');
  expect(screen.queryByText('Čeká na odeslání')).toBeNull();
});
