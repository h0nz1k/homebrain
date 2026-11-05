import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { createEntityStore, useEntity } from './index';
afterEach(cleanup);
it('does not render A when B changes', () => {
  const store = createEntityStore();
  let renders = 0;
  const a = {
    entity_id: 'sensor.demo_a',
    state: '1',
    attributes: {},
    last_updated: '2026-10-31T10:00:00Z',
  };
  const b = { ...a, entity_id: 'sensor.demo_b' };
  store.update({ [a.entity_id]: a, [b.entity_id]: b });
  function Widget() {
    renders++;
    const entity = useEntity(store, a.entity_id);
    return <p>{entity?.state}</p>;
  }
  render(<Widget />);
  const before = renders;
  act(() => store.update({ [a.entity_id]: a, [b.entity_id]: { ...b, state: '2' } }));
  expect(renders).toBe(before);
  act(() => store.update({ [a.entity_id]: { ...a, state: '3' }, [b.entity_id]: b }));
  expect(screen.getByText('3')).toBeDefined();
  expect(renders).toBe(before + 1);
});
