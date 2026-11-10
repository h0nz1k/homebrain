import { Button, Sheet, type SheetProps } from '@homebrain/ui';

/** Shared Sheet with an explicit, tablet-sized dismiss control. */
export function KitchenSheet(props: SheetProps) {
  return (
    <div className="kn-sheet">
      <Sheet
        stickyFooter
        {...props}
        aside={
          <Button aria-label="Zavřít" onClick={props.onClose}>
            ×
          </Button>
        }
      />
    </div>
  );
}
