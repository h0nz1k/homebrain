# Server a Proxmox VE

Server čte stavy vestavěné integrace `proxmoxve` v Home Assistantu. Metriky hostitele
a jejich historie pocházejí z Glances.

- Proxmox VE zobrazí VM a kontejnery podle VMID a názvu zařízení. Běžící jsou nahoře.
  Vypnuté stroje jsou ztlumené a neovlivňují verdikt.
- Uzel přidává stav a dobu běhu. Úložiště používají stejné prahy jako disky z Glances.
  Offline uzel je kritický stav, neúspěšná záloha vyvolá upozornění.
- Metriky se zobrazují podle dostupných entit. Síťové senzory Proxmoxu uvádějí celkový
  objem přenesených dat.
- Karta poslední zálohy ukazuje stáří relativně („před 395 dny“) i absolutně, trvání a stav.
  Stav zálohy je `binary_sensor` s device_class `problem`: `on` = selhala, `off` = OK.
- Poslední záloha starší než limit (výchozí 8 dní, nastavení integrace → „Server – zálohy“)
  je upozornění „Poslední záloha je stará N dní“, při dvojnásobku limitu kritický stav.
  Karta je pak zvýrazněná. Bez senzoru poslední zálohy se stáří nehlídá a karta uvede
  „Údaje o zálohách nejsou k dispozici“.
- Bez integrace zůstává odhad VM z Glances. Při výpadku integrace panel zobrazí
  „Proxmox nedostupný“ a dál ukazuje dostupná data z Glances.

Data z Proxmoxu jsou dostupná administrátorům přes `homebrain/server/get`.

Syntetická data pro vývoj: `/homebrain-server?server=proxmox-ok`, `proxmox-backup-stale`,
`proxmox-backup-missing`, `proxmox-backup-failed`.
