# Third-party notices

## Waste bin renders (module Odpady)

Waste bin renders: generated with Google Gemini image model on Vertex AI (Generated Output; per Google Cloud Service Specific Terms §Generative AI Services, Google asserts no ownership; images carry SynthID invisible watermark), recoloured/matted locally by the project; released under the repository MIT licence.

The eight fractions share the approved master wheelie bin in closed and open
poses. Local OKLab recolouring, handle-gap masks and alpha-only matting were
applied before WebP exports at 96/192 px (cards) and 220/440 px (hero).
The timeline uses an independent geometric front-view glyph; no Pinhead-derived
geometry remains.

## Vatra (anomaly-watch spike, #128)

Design principles of the anomaly-watch prototype (`scripts/anomaly_watch_spike/`) – per-hour
baselines, silence relative to an entity's own report rate, p95-based dwell limits, outage history
for "flaky" entities, summary instead of many alerts – and the default `MIN_SPREAD` / `MIN_DWELL`
threshold tables follow [Vatra](https://github.com/RazvanR1/Vatra) by Razvan (RazvanR1). No source
code was copied; the implementation is independent.

Vatra is licensed under the MIT License, Copyright (c) 2026 Razvan (RazvanR1):

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
> associated documentation files (the "Software"), to deal in the Software without restriction,
> including without limitation the rights to use, copy, modify, merge, publish, distribute,
> sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions: The above copyright notice and this
> permission notice shall be included in all copies or substantial portions of the Software.
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
