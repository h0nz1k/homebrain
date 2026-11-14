// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Callout, CellTag, ListCell, Quantity, RangeStepper, Sheet } from './index';

afterEach(cleanup);

describe('ListCell', () => {
  it('is a named button with a chevron when clickable', () => {
    const onClick = vi.fn();
    render(
      <ListCell
        label="Rezerva"
        value="10 %"
        trailing="chevron"
        aria-label="Rezerva: 10 %"
        onClick={onClick}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Rezerva: 10 %' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it('renders a lock chip in the same trailing slot and no button without onClick', () => {
    const { container } = render(
      <ListCell
        label="Režim"
        value="Obecný"
        trailing="lock"
        lockLabel="Mění se v SolarGo."
        lockText="ze střídače"
      />,
    );
    expect(screen.getByRole('img', { name: 'Mění se v SolarGo.' })).toBeTruthy();
    const source = container.querySelector('.hb-cell-tag[data-kind="source"]');
    expect(source?.textContent).toBe('ze střídače');
    expect(screen.queryByRole('button')).toBeNull();
    expect(
      container
        .querySelector('.hb-cell-trail[data-kind="lock"] .hb-cell-lock')
        ?.getAttribute('title'),
    ).toBe('Mění se v SolarGo.');
  });
});

describe('CellTag', () => {
  it('gives sources and estimates one shape, only the ink differs', () => {
    const { container } = render(
      <>
        <CellTag kind="source">ze střídače</CellTag>
        <CellTag tone="info" icon="info">
          odhad
        </CellTag>
      </>,
    );
    const tags = container.querySelectorAll('.hb-cell-tag');
    expect(tags).toHaveLength(2);
    expect(tags[1]!.getAttribute('data-tone')).toBe('info');
    expect(tags[1]!.querySelector('svg')).toBeTruthy();
  });
});

describe('Quantity', () => {
  it('splits number and unit with a non-breaking space', () => {
    const { container } = render(<Quantity value={8.5} unit="kWp" />);
    expect(container.textContent).toBe('8,5 kWp');
    expect(container.querySelector('small')?.textContent).toBe(' kWp');
  });
});

describe('Quantity units', () => {
  it('glues angles and shows power under 1 kW in watts', () => {
    const { container } = render(
      <>
        <Quantity value={35} unit="°" />
        <Quantity value={0.08} unit="kW" />
        <Quantity value={5000} unit="W" />
      </>,
    );
    expect(container.textContent).toBe('35°80\u00a0W5\u00a0kW');
  });
});

describe('Callout', () => {
  it('is a note with its action', () => {
    render(
      <Callout tone="warn" title="Pozor" action={<button type="button">Použít</button>}>
        Text
      </Callout>,
    );
    expect(screen.getByRole('note').textContent).toContain('Pozor');
    expect(screen.getByRole('button', { name: 'Použít' })).toBeTruthy();
  });
});

describe('RangeStepper', () => {
  it('steps within bounds and snaps to the step', () => {
    const onChange = vi.fn();
    render(
      <RangeStepper
        label="Rezerva"
        value={45}
        onChange={onChange}
        min={10}
        max={50}
        step={5}
        unit="%"
        band={[10, 30]}
        current={20}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Zvýšit: Rezerva' }));
    expect(onChange).toHaveBeenLastCalledWith(50);
    fireEvent.click(screen.getByRole('button', { name: 'Snížit: Rezerva' }));
    expect(onChange).toHaveBeenLastCalledWith(40);
    expect(screen.getByRole('slider', { name: 'Rezerva: posuvník' })).toBeTruthy();
    expect(screen.getByText(/doporučeno 10–30\s%/)).toBeTruthy();
    // Saved value is marked on the slider; band and tick are their own layers.
    expect(screen.getByText(/^teď 20\s%$/)).toBeTruthy();
    expect(document.querySelector('.hb-range-band')).toBeTruthy();
    expect(document.querySelector('.hb-range-tick')).toBeTruthy();
    expect(document.querySelector('.hb-range-scale [data-covered]')).toBeNull();
  });
  it('hides the end label the current-value marker already names', () => {
    render(
      <RangeStepper
        label="Rezerva"
        value={20}
        onChange={() => {}}
        min={10}
        max={50}
        step={5}
        unit="%"
        current={10}
      />,
    );
    const covered = document.querySelectorAll('.hb-range-scale [data-covered]');
    expect(covered).toHaveLength(1);
    expect(covered[0]!.textContent).toMatch(/^10\s%$/);
    expect(screen.getByText(/^teď 10\s%$/)).toBeTruthy();
  });
  it('drops the slider for fine-grained ranges and disables + at max', () => {
    render(
      <RangeStepper label="Cena" value={20} onChange={() => {}} min={0} max={20} step={0.01} />,
    );
    expect(screen.queryByRole('slider')).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Zvýšit: Cena' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe('Sheet raised', () => {
  it('has a light scrim, side placement and a 44 px close button', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Sheet
        title="Detail"
        appearance="raised"
        placement="side"
        closeLabel="Zavřít"
        onClose={onClose}
      >
        Obsah
      </Sheet>,
    );
    const scrim = container.querySelector('.hb-scrim') as HTMLElement;
    expect(scrim.dataset.appearance).toBe('raised');
    expect(scrim.dataset.placement).toBe('side');
    expect(container.querySelector('.hb-sheet-handle')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Zavřít' }));
    expect(onClose).toHaveBeenCalled();
  });
});
