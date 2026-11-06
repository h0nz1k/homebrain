import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressRing } from './progress-ring.js';
import { HeroSignal } from './signals.js';

describe('ProgressRing', () => {
  it('clamps the value and draws no arc at 0', () => {
    const { container, rerender } = render(<ProgressRing value={1.7} data-testid="r" />);
    expect(screen.getByTestId('r').dataset.value).toBe('1.000');
    expect(container.querySelector('.hb-ring-arc')).not.toBeNull();
    rerender(<ProgressRing value={0} data-testid="r" />);
    expect(container.querySelector('.hb-ring-arc')).toBeNull();
  });
  it('is decorative without a label and marks held/tone', () => {
    render(
      <ProgressRing value={0.5} tone="ok" held label="Hotovo z poloviny" data-testid="r">
        8:42
      </ProgressRing>,
    );
    const ring = screen.getByRole('img', { name: 'Hotovo z poloviny' });
    expect(ring.dataset.tone).toBe('ok');
    expect(ring.dataset.held).toBe('true');
    expect(ring.textContent).toBe('8:42');
  });
  it('renders a held countdown ring in the signal value', () => {
    render(
      <HeroSignal
        id="x"
        severity="warning"
        title="Protřepejte jídlo"
        variant="mobile"
        value={{ v: '8:42', label: 'stojí', progress: 0.5, held: true }}
      />,
    );
    const value = screen.getByTestId('hero-signal').querySelector('.hb-signal-value')!;
    expect(value.hasAttribute('data-held')).toBe(true);
    expect(screen.getByTestId('signal-ring').dataset.tone).toBe('warn');
  });
});
