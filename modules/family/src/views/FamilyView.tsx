import { Card, EmptyState } from '@homebrain/ui';
export default function FamilyView() {
  return (
    <Card className="hb-section">
      <h1 className="hb-section-title">Rodina</h1>
      <EmptyState title="Modul Rodina se připravuje.">
        Brzy tu nastavíte členy domácnosti, jejich role a co kdo uvidí na panelu.
      </EmptyState>
    </Card>
  );
}
