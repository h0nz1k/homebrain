import type { ReactNode } from 'react';
import { Icon, type IconName } from './icons.js';

/** Inline notice inside a card: tinted surface, icon, one or two sentences, optional action. */
export function Callout({
  tone = 'info',
  title,
  children,
  action,
  icon,
}: {
  tone?: 'info' | 'warn';
  title?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className="hb-callout" data-tone={tone === 'warn' ? 'warn' : 'accent'} role="note">
      <span className="hb-callout-icon">
        <Icon name={icon ?? (tone === 'warn' ? 'alert' : 'info')} size={20} />
      </span>
      <div className="hb-callout-body">
        {title && <strong>{title}</strong>}
        <span>{children}</span>
        {action && <div className="hb-callout-action">{action}</div>}
      </div>
    </div>
  );
}
