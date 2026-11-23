// Same anatomy as the other Dnes cards (.today-home-tile): small title, primary line, labels.
export const schoolStyles = `
.today-school {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: none;
  min-width: 0;
  margin: 0;
  padding: 14px 20px;
  border-radius: var(--hb-radius-hero, 18px);
  border: 1px solid var(--hb-glass-edge, var(--hb-b1));
  background: var(--hb-glass, var(--hb-s1));
  color: var(--hb-t1);
  font-size: 15px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.today-school-head { display: flex; align-items: baseline; justify-content: space-between; gap: 4px 12px; flex-wrap: wrap; }
.today-school-title { display: inline-flex; align-items: center; gap: 8px; margin: 0; font-size: 15px; font-weight: 600; color: var(--hb-t1); }
.today-school-title .hb-svg-icon { flex: none; color: var(--hb-t2); }
.today-school-loaded { font-size: 13px; color: var(--hb-t2); white-space: nowrap; }
.today-school-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.today-school p, .today-school ul { margin: 0; }
.today-school ul { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.today-school-label { font-weight: 600; color: var(--hb-t2); }
.today-school-lunch { font-size: 17px; }
.today-school-timetable { font-size: 16px; }
.today-school-timetable + * { margin-top: 4px; }
.today-school-lunch strong { font-weight: 500; color: var(--hb-t1); }
.today-school[data-school-kiosk] { font-size: 18px; line-height: 1.3; padding: 12px 22px; }
.today-school[data-school-kiosk] .today-school-title { font-size: 18px; }
.today-school[data-school-kiosk] .today-school-loaded { font-size: 16px; }
.today-school[data-school-kiosk] .today-school-lunch { font-size: 20px; }
/* Landscape wall kiosk: title column on the left like the kiosk home tiles; events in one row. */
.today-kiosk:not(.today-portrait) .today-school[data-school-kiosk] { flex-direction: row; align-items: baseline; gap: 18px; padding: 10px 22px; }
.today-kiosk:not(.today-portrait) .today-school[data-school-kiosk] .today-school-head { flex: none; min-width: 7.5em; flex-direction: column; align-items: flex-start; gap: 2px; }
.today-kiosk:not(.today-portrait) .today-school[data-school-kiosk] .today-school-body { flex: 1; gap: 2px; }
.today-kiosk:not(.today-portrait) .today-school[data-school-kiosk] ul { flex-direction: row; flex-wrap: wrap; gap: 2px 28px; }
`;
