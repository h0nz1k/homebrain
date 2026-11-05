import { act, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import { createFakeHass } from '@homebrain/testing';
import { defineHomebrainPanel, HomebrainPanel } from './index';
it('defines the host once and pushes each hass update into its store', async () => {
  defineHomebrainPanel();
  defineHomebrainPanel();
  const panel = document.createElement('homebrain-panel') as HomebrainPanel;
  const hass = createFakeHass({
    'sensor.demo_waste_dataset': {
      entity_id: 'sensor.demo_waste_dataset',
      state: 'ready',
      last_updated: new Date().toISOString(),
      attributes: {
        waste_dashboard: {
          schema_version: 1,
          generated_at: new Date().toISOString(),
          source_status: 'available',
          source_updated_at: null,
          events: [],
          notices: [],
        },
      },
    },
    'sensor.demo_waste_next': {
      entity_id: 'sensor.demo_waste_next',
      state: '2026-11-02',
      last_updated: new Date().toISOString(),
      attributes: {},
    },
  });
  panel.hass = hass;
  panel.panel = { config: { module: 'waste' } };
  panel.route = { path: '' };
  panel.narrow = true;
  await act(async () => {
    document.body.append(panel);
  });
  expect(await screen.findByText('Každá nádoba má svůj den', {}, { timeout: 10000 })).toBeDefined();
  await waitFor(() => expect(screen.getByText('Aktuální')).toBeDefined());
  await act(async () => {
    panel.hass = {
      ...hass,
      states: {
        'sensor.demo_waste_next': {
          ...hass.states['sensor.demo_waste_next']!,
          state: 'unavailable',
        },
      },
    };
  });
  expect(panel.entityStore.getSnapshot('sensor.demo_waste_next')?.state).toBe('unavailable');
  expect(screen.getByText('Nedostupné')).toBeDefined();
  await act(async () => {
    panel.remove();
  });
}, 15000);
