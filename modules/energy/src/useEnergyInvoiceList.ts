import { useCallback, useEffect, useState } from 'react';
import type { ConnectionLike } from '@homebrain/ha-client';
import { fetchInvoices, type InvoiceList } from './invoices.js';

/** Shared Energie invoice list for Faktury + srovnání (one WS fetch). */
export function useEnergyInvoiceList(connection: ConnectionLike | undefined, kiosk: boolean) {
  const [list, setList] = useState<InvoiceList | null>(null);
  useEffect(() => {
    // Kiosk never shows invoices; the returned list is masked below instead of reset here.
    if (kiosk) return;
    let alive = true;
    void fetchInvoices(connection).then((next) => alive && setList(next));
    return () => {
      alive = false;
    };
  }, [connection, kiosk]);
  const reload = useCallback(async () => {
    const next = await fetchInvoices(connection);
    setList(next);
    return next;
  }, [connection]);
  return { list: kiosk ? null : list, setList, reload };
}
