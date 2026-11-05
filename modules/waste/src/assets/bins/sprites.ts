import mixedclosed96 from './bin-smesny-96.webp?no-inline';
import mixedclosed192 from './bin-smesny-192.webp?no-inline';
import mixedclosed220 from './bin-smesny-220.webp?no-inline';
import mixedclosed440 from './bin-smesny-440.webp?no-inline';
import mixedopen96 from './bin-smesny-open-96.webp?no-inline';
import mixedopen192 from './bin-smesny-open-192.webp?no-inline';
import mixedopen220 from './bin-smesny-open-220.webp?no-inline';
import mixedopen440 from './bin-smesny-open-440.webp?no-inline';
import plasticclosed96 from './bin-plast-96.webp?no-inline';
import plasticclosed192 from './bin-plast-192.webp?no-inline';
import plasticclosed220 from './bin-plast-220.webp?no-inline';
import plasticclosed440 from './bin-plast-440.webp?no-inline';
import plasticopen96 from './bin-plast-open-96.webp?no-inline';
import plasticopen192 from './bin-plast-open-192.webp?no-inline';
import plasticopen220 from './bin-plast-open-220.webp?no-inline';
import plasticopen440 from './bin-plast-open-440.webp?no-inline';
import paperclosed96 from './bin-papir-96.webp?no-inline';
import paperclosed192 from './bin-papir-192.webp?no-inline';
import paperclosed220 from './bin-papir-220.webp?no-inline';
import paperclosed440 from './bin-papir-440.webp?no-inline';
import paperopen96 from './bin-papir-open-96.webp?no-inline';
import paperopen192 from './bin-papir-open-192.webp?no-inline';
import paperopen220 from './bin-papir-open-220.webp?no-inline';
import paperopen440 from './bin-papir-open-440.webp?no-inline';
import bioclosed96 from './bin-bio-96.webp?no-inline';
import bioclosed192 from './bin-bio-192.webp?no-inline';
import bioclosed220 from './bin-bio-220.webp?no-inline';
import bioclosed440 from './bin-bio-440.webp?no-inline';
import bioopen96 from './bin-bio-open-96.webp?no-inline';
import bioopen192 from './bin-bio-open-192.webp?no-inline';
import bioopen220 from './bin-bio-open-220.webp?no-inline';
import bioopen440 from './bin-bio-open-440.webp?no-inline';
import glassclosed96 from './bin-sklo-96.webp?no-inline';
import glassclosed192 from './bin-sklo-192.webp?no-inline';
import glassclosed220 from './bin-sklo-220.webp?no-inline';
import glassclosed440 from './bin-sklo-440.webp?no-inline';
import glassopen96 from './bin-sklo-open-96.webp?no-inline';
import glassopen192 from './bin-sklo-open-192.webp?no-inline';
import glassopen220 from './bin-sklo-open-220.webp?no-inline';
import glassopen440 from './bin-sklo-open-440.webp?no-inline';
import electroclosed96 from './bin-elektro-96.webp?no-inline';
import electroclosed192 from './bin-elektro-192.webp?no-inline';
import electroclosed220 from './bin-elektro-220.webp?no-inline';
import electroclosed440 from './bin-elektro-440.webp?no-inline';
import electroopen96 from './bin-elektro-open-96.webp?no-inline';
import electroopen192 from './bin-elektro-open-192.webp?no-inline';
import electroopen220 from './bin-elektro-open-220.webp?no-inline';
import electroopen440 from './bin-elektro-open-440.webp?no-inline';
import bulkyclosed96 from './bin-objemny-96.webp?no-inline';
import bulkyclosed192 from './bin-objemny-192.webp?no-inline';
import bulkyclosed220 from './bin-objemny-220.webp?no-inline';
import bulkyclosed440 from './bin-objemny-440.webp?no-inline';
import bulkyopen96 from './bin-objemny-open-96.webp?no-inline';
import bulkyopen192 from './bin-objemny-open-192.webp?no-inline';
import bulkyopen220 from './bin-objemny-open-220.webp?no-inline';
import bulkyopen440 from './bin-objemny-open-440.webp?no-inline';
import hazardousclosed96 from './bin-nebezpecny-96.webp?no-inline';
import hazardousclosed192 from './bin-nebezpecny-192.webp?no-inline';
import hazardousclosed220 from './bin-nebezpecny-220.webp?no-inline';
import hazardousclosed440 from './bin-nebezpecny-440.webp?no-inline';
import hazardousopen96 from './bin-nebezpecny-open-96.webp?no-inline';
import hazardousopen192 from './bin-nebezpecny-open-192.webp?no-inline';
import hazardousopen220 from './bin-nebezpecny-open-220.webp?no-inline';
import hazardousopen440 from './bin-nebezpecny-open-440.webp?no-inline';

const mixed = {
  closed: { card: [mixedclosed96, mixedclosed192], hero: [mixedclosed220, mixedclosed440] },
  open: { card: [mixedopen96, mixedopen192], hero: [mixedopen220, mixedopen440] },
} as const;
const plastic = {
  closed: { card: [plasticclosed96, plasticclosed192], hero: [plasticclosed220, plasticclosed440] },
  open: { card: [plasticopen96, plasticopen192], hero: [plasticopen220, plasticopen440] },
} as const;
const paper = {
  closed: { card: [paperclosed96, paperclosed192], hero: [paperclosed220, paperclosed440] },
  open: { card: [paperopen96, paperopen192], hero: [paperopen220, paperopen440] },
} as const;
const bio = {
  closed: { card: [bioclosed96, bioclosed192], hero: [bioclosed220, bioclosed440] },
  open: { card: [bioopen96, bioopen192], hero: [bioopen220, bioopen440] },
} as const;
const glass = {
  closed: { card: [glassclosed96, glassclosed192], hero: [glassclosed220, glassclosed440] },
  open: { card: [glassopen96, glassopen192], hero: [glassopen220, glassopen440] },
} as const;
const electro = {
  closed: { card: [electroclosed96, electroclosed192], hero: [electroclosed220, electroclosed440] },
  open: { card: [electroopen96, electroopen192], hero: [electroopen220, electroopen440] },
} as const;
const bulky = {
  closed: { card: [bulkyclosed96, bulkyclosed192], hero: [bulkyclosed220, bulkyclosed440] },
  open: { card: [bulkyopen96, bulkyopen192], hero: [bulkyopen220, bulkyopen440] },
} as const;
const hazardous = {
  closed: {
    card: [hazardousclosed96, hazardousclosed192],
    hero: [hazardousclosed220, hazardousclosed440],
  },
  open: { card: [hazardousopen96, hazardousopen192], hero: [hazardousopen220, hazardousopen440] },
} as const;

export const binSprites = {
  mixed,
  plastic,
  paper,
  bio,
  glass,
  electro,
  bulky,
  hazardous,
  other: mixed,
};
