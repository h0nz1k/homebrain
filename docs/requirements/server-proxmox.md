# Server a Proxmox VE

Server čte stavy vestavěné integrace `proxmoxve` v Home Assistantu. Metriky hostitele
a jejich historie pocházejí z Glances.

- Proxmox VE zobrazí VM a kontejnery podle VMID a názvu zařízení. Běžící jsou nahoře.
  Vypnuté stroje jsou ztlumené a neovlivňují verdikt.
- Uzel přidává stav a dobu běhu. Úložiště používají stejné prahy jako disky z Glances.
  Offline uzel je kritický stav, neúspěšná záloha vyvolá upozornění.
- Metriky se zobrazují podle dostupných entit. Síťové senzory Proxmoxu uvádějí celkový
  objem přenesených dat. Karta poslední zálohy se zobrazí, až má některá z jejích
  zapnutých entit stav.
- Bez integrace zůstává odhad VM z Glances. Při výpadku integrace panel zobrazí
  „Proxmox nedostupný“ a dál ukazuje dostupná data z Glances.

Data z Proxmoxu jsou dostupná administrátorům přes `homebrain/server/get`.
