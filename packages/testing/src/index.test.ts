import { expect, it } from 'vitest';
import { getBindings, createServiceClient } from '@homebrain/ha-client';
import { createMockConnection, createFakeHass } from './index';
it('returns canned bindings and records services', async () => {
  const connection = createMockConnection();
  expect(await getBindings(connection)).toEqual({
    waste: {
      waste_dataset: 'sensor.demo_waste_dataset',
      waste_next: 'sensor.demo_waste_next',
    },
    wine: {
      wine_cellar_temperature: 'sensor.demo_wine_cellar_temperature',
      wine_cellar_humidity: 'sensor.demo_wine_cellar_humidity',
      wine_zone_1_temperature: 'sensor.demo_wine_zone_1_temperature',
      wine_zone_1_target: 'sensor.demo_wine_zone_1_target',
      wine_zone_2_temperature: 'sensor.demo_wine_zone_2_temperature',
      wine_zone_2_target: 'sensor.demo_wine_zone_2_target',
    },
  });
  await createServiceClient(connection, ['demo.run']).callService('demo', 'run');
  expect(connection.serviceCalls).toEqual([{ domain: 'demo', service: 'run', data: undefined }]);
  expect(createFakeHass().language).toBe('cs');
});
