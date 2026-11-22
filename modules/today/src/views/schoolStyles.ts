export const schoolStyles = `
.today-school {
  min-width: 0;
  padding: 8px 14px;
  border-radius: var(--hb-radius-lg, 14px);
  border: 1px solid var(--hb-glass-edge, var(--hb-b1));
  background: var(--hb-glass, var(--hb-s1));
  color: var(--hb-t1);
  overflow-wrap: anywhere;
}
.today-school p { margin: 0; }
.today-school p + p { margin-top: 3px; }
.today-school small { display: block; margin-top: 4px; color: var(--hb-t2); }
.today-school[data-school-kiosk] {
  font-size: clamp(18px, 2vw, 25px);
  line-height: 1.2;
  max-height: clamp(150px, 28dvh, 300px);
  overflow: auto;
}
.today-school[data-school-kiosk] small { font-size: 16px; }
`;
