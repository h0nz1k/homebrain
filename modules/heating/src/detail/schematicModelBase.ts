/** Generated from schematic-model.base.json – do not edit by hand. */
export const SCHEMATIC_MODEL_BASE = {
  "architectures": [
    {
      "id": "main-house",
      "kind": "house-silhouette"
    },
    {
      "id": "rybarna",
      "kind": "heated-building",
      "label": "Rybárna",
      "radiator": "fish",
      "supply": "fish-supply",
      "returnPipe": "fish-return",
      "valve": "Ventil rybárny",
      "evidence": [
        "owner-feedback-A",
        "X46",
        "Y43.3"
      ]
    }
  ],
  "circuitLegend": {
    "hot": "Topná / teplá",
    "cold": "Zpátečka / studená",
    "solar": "Solár",
    "ground": "Země",
    "pool": "Bazén",
    "inactiveOpacity": 0.35
  },
  "bounds": {
    "x": -60,
    "y": 60,
    "w": 1225,
    "h": 1140
  },
  "ports": {
    "hp.hot": {
      "x": 121,
      "y": 760,
      "owner": "hp"
    },
    "hp.cold": {
      "x": 186,
      "y": 760,
      "owner": "hp"
    },
    "hp.gout": {
      "x": 155,
      "y": 918.4,
      "owner": "hp"
    },
    "hp.gin": {
      "x": 193,
      "y": 918.4,
      "owner": "hp"
    },
    "tank.in": {
      "x": 430,
      "y": 550,
      "owner": "tank"
    },
    "tank.dhwheat": {
      "x": 430,
      "y": 470,
      "owner": "tank"
    },
    "tank.ret": {
      "x": 430,
      "y": 960,
      "owner": "tank"
    },
    "tank.draw": {
      "x": 540,
      "y": 380,
      "owner": "tank"
    },
    "tank.heat": {
      "x": 649.6,
      "y": 500,
      "owner": "tank"
    },
    "tank.heatret": {
      "x": 649.6,
      "y": 625,
      "owner": "tank"
    },
    "tank.pool": {
      "x": 649.6,
      "y": 718,
      "owner": "tank"
    },
    "tank.poolret": {
      "x": 649.6,
      "y": 754,
      "owner": "tank"
    },
    "tank.solar": {
      "x": 649.6,
      "y": 938,
      "owner": "tank"
    },
    "tank.solarret": {
      "x": 649.6,
      "y": 970,
      "owner": "tank"
    },
    "tank.water": {
      "x": 635,
      "y": 1000,
      "owner": "tank"
    },
    "div.in": {
      "x": 300,
      "y": 550,
      "owner": "div"
    },
    "div.out": {
      "x": 300,
      "y": 550,
      "owner": "div"
    },
    "div.top": {
      "x": 300,
      "y": 550,
      "owner": "div"
    },
    "mix.in": {
      "x": 725,
      "y": 500,
      "owner": "mix"
    },
    "mix.out": {
      "x": 725,
      "y": 500,
      "owner": "mix"
    },
    "mix.bottom": {
      "x": 725,
      "y": 500,
      "owner": "mix"
    },
    "rad.in": {
      "x": 800,
      "y": 512,
      "owner": "radiator"
    },
    "rad.out": {
      "x": 839,
      "y": 587,
      "owner": "radiator"
    },
    "fish.in": {
      "x": 830,
      "y": 932,
      "owner": "fish"
    },
    "fish.out": {
      "x": 869,
      "y": 1007,
      "owner": "fish"
    },
    "fish.branch": {
      "x": 755,
      "y": 500,
      "owner": "junction"
    },
    "fish.return": {
      "x": 785,
      "y": 625,
      "owner": "junction"
    },
    "heat.junction": {
      "x": 725,
      "y": 625,
      "owner": "junction"
    },
    "tap.in": {
      "x": 226.3,
      "y": 354.9,
      "owner": "tap"
    },
    "solar.in": {
      "x": 945.5498422491946,
      "y": 253.61156428949656,
      "owner": "solar"
    },
    "solar.out": {
      "x": 1045.0715503782017,
      "y": 298.5567488044669,
      "owner": "solar"
    },
    "pool.in": {
      "x": 825,
      "y": 718,
      "owner": "pool"
    },
    "pool.out": {
      "x": 825,
      "y": 754,
      "owner": "pool"
    },
    "mains.out": {
      "x": 580,
      "y": 1080,
      "owner": "mains"
    },
    "pool.waterout": {
      "x": 1015,
      "y": 730,
      "owner": "pool"
    },
    "pool.waterin": {
      "x": 1015,
      "y": 754,
      "owner": "pool"
    }
  },
  "pipes": [
    {
      "id": "hp-supply",
      "start": "hp.hot",
      "end": "div.in",
      "points": [
        [
          121,
          760
        ],
        [
          -20,
          760
        ],
        [
          -20,
          550
        ],
        [
          300,
          550
        ]
      ],
      "kind": "hot",
      "states": [
        2,
        3
      ],
      "d": "M121 760L-20 760L-20 550L300 550",
      "bridges": []
    },
    {
      "id": "tank-charge",
      "start": "div.out",
      "end": "tank.in",
      "points": [
        [
          300,
          550
        ],
        [
          430,
          550
        ]
      ],
      "kind": "hot",
      "states": [
        3
      ],
      "d": "M300 550L430 550",
      "bridges": []
    },
    {
      "id": "dhw-charge",
      "start": "div.top",
      "end": "tank.dhwheat",
      "points": [
        [
          300,
          550
        ],
        [
          300,
          470
        ],
        [
          430,
          470
        ]
      ],
      "kind": "hot",
      "states": [
        2
      ],
      "d": "M300 550L300 470L430 470",
      "bridges": []
    },
    {
      "id": "hp-return",
      "start": "tank.ret",
      "end": "hp.cold",
      "points": [
        [
          430,
          960
        ],
        [
          240,
          960
        ],
        [
          240,
          750
        ],
        [
          186,
          750
        ],
        [
          186,
          760
        ]
      ],
      "kind": "cold",
      "states": [
        2,
        3
      ],
      "d": "M430 960L240 960L240 750L186 750L186 760",
      "bridges": []
    },
    {
      "id": "ground-loop",
      "start": "hp.gout",
      "end": "hp.gin",
      "points": [
        [
          155,
          918.4
        ],
        [
          155,
          1140
        ],
        [
          400,
          1140
        ],
        [
          400,
          1170
        ],
        [
          193,
          1170
        ],
        [
          193,
          918.4
        ]
      ],
      "kind": "ground",
      "states": [
        2,
        3
      ],
      "d": "M155 918.4L155 1140L400 1140L400 1170L193 1170L193 918.4",
      "bridges": []
    },
    {
      "id": "dhw-draw",
      "start": "tank.draw",
      "end": "tap.in",
      "points": [
        [
          540,
          380
        ],
        [
          540,
          330
        ],
        [
          226.3,
          330
        ],
        [
          226.3,
          354.9
        ]
      ],
      "kind": "hot",
      "states": [
        1,
        2,
        3,
        4
      ],
      "d": "M540 380L540 330L226.3 330L226.3 354.9",
      "bridges": []
    },
    {
      "id": "heat-in",
      "start": "tank.heat",
      "end": "mix.in",
      "points": [
        [
          649.6,
          500
        ],
        [
          725,
          500
        ]
      ],
      "kind": "hot",
      "states": [
        3
      ],
      "d": "M649.6 500L725 500",
      "bridges": []
    },
    {
      "id": "heat-supply",
      "start": "mix.out",
      "end": "fish.branch",
      "points": [
        [
          725,
          500
        ],
        [
          755,
          500
        ]
      ],
      "kind": "hot",
      "states": [
        3
      ],
      "d": "M725 500L755 500",
      "bridges": []
    },
    {
      "id": "rad-supply",
      "start": "fish.branch",
      "end": "rad.in",
      "points": [
        [
          755,
          500
        ],
        [
          800,
          500
        ],
        [
          800,
          512
        ]
      ],
      "kind": "hot",
      "states": [
        3
      ],
      "d": "M755 500L800 500L800 512",
      "bridges": []
    },
    {
      "id": "heat-return",
      "start": "rad.out",
      "end": "fish.return",
      "points": [
        [
          839,
          587
        ],
        [
          839,
          625
        ],
        [
          785,
          625
        ]
      ],
      "kind": "cold",
      "states": [
        3
      ],
      "d": "M839 587L839 625L785 625",
      "bridges": []
    },
    {
      "id": "return-branch",
      "start": "fish.return",
      "end": "heat.junction",
      "points": [
        [
          785,
          625
        ],
        [
          725,
          625
        ]
      ],
      "kind": "cold",
      "states": [
        3
      ],
      "d": "M785 625L725 625",
      "bridges": []
    },
    {
      "id": "heat-tank-return",
      "start": "heat.junction",
      "end": "tank.heatret",
      "points": [
        [
          725,
          625
        ],
        [
          649.6,
          625
        ]
      ],
      "kind": "cold",
      "states": [
        3
      ],
      "d": "M725 625L649.6 625",
      "bridges": []
    },
    {
      "id": "mix-bypass",
      "start": "heat.junction",
      "end": "mix.bottom",
      "points": [
        [
          725,
          625
        ],
        [
          725,
          500
        ]
      ],
      "kind": "cold",
      "states": [
        3
      ],
      "d": "M725 625L725 500",
      "bridges": []
    },
    {
      "id": "pool-supply",
      "start": "tank.pool",
      "end": "pool.in",
      "points": [
        [
          649.6,
          718
        ],
        [
          825,
          718
        ]
      ],
      "kind": "pool",
      "states": [
        4
      ],
      "d": "M649.6 718L825 718",
      "bridges": []
    },
    {
      "id": "pool-return",
      "start": "pool.out",
      "end": "tank.poolret",
      "points": [
        [
          825,
          754
        ],
        [
          649.6,
          754
        ]
      ],
      "kind": "pool",
      "states": [
        4
      ],
      "d": "M825 754L649.6 754",
      "bridges": []
    },
    {
      "id": "fish-supply",
      "start": "fish.branch",
      "end": "fish.in",
      "points": [
        [
          755,
          500
        ],
        [
          755,
          932
        ],
        [
          830,
          932
        ]
      ],
      "kind": "hot",
      "states": [
        3
      ],
      "d": "M755 500L755 619Q767 625 755 631L755 712Q767 718 755 724L755 748Q767 754 755 760L755 932L830 932",
      "bridges": [
        [
          755,
          625
        ],
        [
          755,
          718
        ],
        [
          755,
          754
        ]
      ]
    },
    {
      "id": "fish-return",
      "start": "fish.out",
      "end": "fish.return",
      "points": [
        [
          869,
          1007
        ],
        [
          785,
          1007
        ],
        [
          785,
          625
        ],
        [
          785,
          625
        ]
      ],
      "kind": "cold",
      "states": [
        3
      ],
      "d": "M869 1007L785 1007L785 938Q797 932 785 926L785 760Q797 754 785 748L785 724Q797 718 785 712L785 625L785 625",
      "bridges": [
        [
          785,
          718
        ],
        [
          785,
          754
        ],
        [
          785,
          932
        ]
      ]
    },
    {
      "id": "solar-supply",
      "start": "solar.in",
      "end": "tank.solar",
      "points": [
        [
          945.5498422491946,
          253.61156428949656
        ],
        [
          945.5498422491946,
          380
        ],
        [
          1100,
          380
        ],
        [
          1100,
          1040
        ],
        [
          690,
          1040
        ],
        [
          690,
          938
        ],
        [
          649.6,
          938
        ]
      ],
      "kind": "solar",
      "states": [
        1
      ],
      "d": "M945.5498422491946 253.61156428949656L945.5498422491946 380L1100 380L1100 1040L690 1040L690 938L649.6 938",
      "bridges": []
    },
    {
      "id": "solar-return",
      "start": "tank.solarret",
      "end": "solar.out",
      "points": [
        [
          649.6,
          970
        ],
        [
          670,
          970
        ],
        [
          670,
          1070
        ],
        [
          1125,
          1070
        ],
        [
          1125,
          360
        ],
        [
          1045.0715503782017,
          360
        ],
        [
          1045.0715503782017,
          298.5567488044669
        ]
      ],
      "kind": "solar",
      "states": [
        1
      ],
      "d": "M649.6 970L670 970L670 1070L1125 1070L1125 360L1045.0715503782017 360L1045.0715503782017 298.5567488044669",
      "bridges": []
    },
    {
      "id": "cold-water",
      "start": "mains.out",
      "end": "tank.water",
      "points": [
        [
          580,
          1080
        ],
        [
          635,
          1080
        ],
        [
          635,
          1000
        ]
      ],
      "kind": "cold",
      "states": [
        1,
        2,
        3,
        4
      ],
      "d": "M580 1080L635 1080L635 1000",
      "bridges": []
    },
    {
      "id": "pool-water",
      "start": "pool.waterout",
      "end": "pool.waterin",
      "points": [
        [
          1015,
          730
        ],
        [
          1055,
          730
        ],
        [
          1055,
          790
        ],
        [
          1035,
          790
        ],
        [
          1035,
          754
        ],
        [
          1015,
          754
        ]
      ],
      "kind": "pool",
      "states": [
        4
      ],
      "d": "M1015 730L1055 730L1055 790L1035 790L1035 754L1015 754"
    }
  ],
  "bodies": [
    {
      "id": "tank",
      "x": 430,
      "y": 380,
      "w": 219.6,
      "h": 620.1
    },
    {
      "id": "hp",
      "x": 110,
      "y": 760,
      "w": 118.8,
      "h": 158.4
    },
    {
      "id": "tap",
      "x": 225,
      "y": 350,
      "w": 72,
      "h": 59
    },
    {
      "id": "radiator",
      "x": 815,
      "y": 500,
      "w": 150,
      "h": 69
    },
    {
      "id": "solar",
      "x": 915,
      "y": 190,
      "w": 210,
      "h": 125,
      "polygon": [
        [
          935.9186552378434,
          186.49941757407416
        ],
        [
          1125.4838135788093,
          272.10929284068436
        ],
        [
          1104.0813447621567,
          319.5005824259258
        ],
        [
          914.5161864211908,
          233.8907071593156
        ]
      ]
    },
    {
      "id": "pool",
      "x": 825,
      "y": 670,
      "w": 190,
      "h": 100
    },
    {
      "id": "fish",
      "x": 845,
      "y": 920,
      "w": 150,
      "h": 69
    },
    {
      "id": "div",
      "x": 285,
      "y": 535,
      "w": 30,
      "h": 30
    },
    {
      "id": "mix",
      "x": 710,
      "y": 485,
      "w": 30,
      "h": 30
    }
  ],
  "devices": [
    {
      "id": "Přepínání TUV / nádrž",
      "x": 300,
      "y": 550,
      "pipe": "hp-supply",
      "kind": "valve",
      "angle": 0
    },
    {
      "id": "Směšování",
      "x": 725,
      "y": 500,
      "pipe": "heat-in",
      "kind": "valve",
      "angle": 180
    },
    {
      "id": "Nabíjení",
      "x": 240,
      "y": 855,
      "pipe": "hp-return",
      "kind": "pump",
      "angle": -90
    },
    {
      "id": "Primární okruh",
      "x": 193,
      "y": 1055,
      "pipe": "ground-loop",
      "kind": "pump",
      "angle": -90
    },
    {
      "id": "Topení",
      "x": 805,
      "y": 625,
      "pipe": "heat-return",
      "kind": "pump",
      "angle": 90
    },
    {
      "id": "Solár",
      "x": 965,
      "y": 1070,
      "pipe": "solar-return",
      "kind": "pump",
      "angle": 0
    },
    {
      "id": "Natápění bazénu",
      "x": 715,
      "y": 718,
      "pipe": "pool-supply",
      "kind": "pump",
      "angle": 0
    },
    {
      "id": "Filtrace",
      "x": 1055,
      "y": 765,
      "pipe": "pool-water",
      "kind": "pump",
      "angle": 90
    },
    {
      "id": "Ventil rybárny",
      "x": 830,
      "y": 932,
      "pipe": "fish-supply",
      "kind": "valve",
      "angle": 0
    }
  ],
  "labels": [
    {
      "id": "outdoor",
      "x": 100,
      "y": 155,
      "caption": "Venku",
      "value": "−2,3 °C",
      "tier": 0,
      "owner": "house",
      "anchor": [
        100,
        190
      ]
    },
    {
      "id": "solar",
      "x": 970,
      "y": 140,
      "caption": "Solární kolektor",
      "value": "72,0 °C",
      "tier": 0,
      "owner": "solar",
      "anchor": [
        1020,
        253
      ]
    },
    {
      "id": "tap",
      "x": 260,
      "y": 265,
      "caption": "Odběr teplé vody",
      "value": "48,0 °C",
      "tier": 0,
      "owner": "tap",
      "anchor": [
        260,
        350
      ]
    },
    {
      "id": "tank-title",
      "x": 540,
      "y": 300,
      "caption": "Akumulační nádrž",
      "value": "",
      "tier": 0,
      "owner": "tank",
      "anchor": [
        540,
        380
      ]
    },
    {
      "id": "dhw",
      "x": 540,
      "y": 540,
      "caption": "Teplá voda",
      "value": "48,0 °C",
      "tier": 0,
      "owner": "tank",
      "anchor": [
        540,
        540
      ]
    },
    {
      "id": "bottom",
      "x": 535,
      "y": 865,
      "caption": "Nádrž dole",
      "value": "39,4 °C",
      "tier": 0,
      "owner": "tank",
      "anchor": [
        535,
        865
      ]
    },
    {
      "id": "hp",
      "x": 170,
      "y": 630,
      "caption": "Tepelné čerpadlo",
      "value": "Stojí · 0 W",
      "tier": 0,
      "owner": "hp",
      "anchor": [
        169,
        760
      ]
    },
    {
      "id": "heat",
      "x": 925,
      "y": 430,
      "caption": "Topení",
      "value": "Netopí se",
      "tier": 0,
      "owner": "radiator",
      "anchor": [
        890,
        500
      ]
    },
    {
      "id": "pool",
      "x": 920,
      "y": 625,
      "caption": "Bazén",
      "value": "28,5 °C",
      "tier": 0,
      "owner": "pool",
      "anchor": [
        920,
        670
      ]
    },
    {
      "id": "fish",
      "x": 915,
      "y": 869,
      "caption": "Rybárna",
      "value": "11,8 °C",
      "tier": 0,
      "owner": "fish",
      "anchor": [
        915,
        920
      ]
    },
    {
      "id": "ground",
      "x": 650,
      "y": 1150,
      "caption": "Zemní kolektor",
      "value": "",
      "tier": 0,
      "owner": "ground",
      "anchor": [
        650,
        1170
      ]
    },
    {
      "id": "cold-water",
      "x": 480,
      "y": 1085,
      "caption": "Studená voda",
      "value": "",
      "tier": 0,
      "owner": "mains",
      "anchor": [
        580,
        1080
      ]
    },
    {
      "id": "div",
      "x": 150,
      "y": 495,
      "caption": "Přepínací ventil",
      "value": "Do nádrže",
      "tier": 1,
      "owner": "div",
      "anchor": [
        300,
        550
      ]
    },
    {
      "id": "tank-top",
      "x": 535,
      "y": 730,
      "caption": "Nádrž nahoře",
      "value": "48,0 °C",
      "tier": 1,
      "owner": "tank",
      "anchor": [
        535,
        730
      ]
    },
    {
      "id": "solar-pump",
      "x": 965,
      "y": 1135,
      "caption": "Solární čerpadlo",
      "value": "80 %",
      "tier": 1,
      "owner": "solar-pump",
      "anchor": [
        965,
        1070
      ]
    },
    {
      "id": "charge",
      "x": 345,
      "y": 905,
      "caption": "Nabíjení",
      "value": "Zapnuto",
      "tier": 1,
      "owner": "charge",
      "anchor": [
        240,
        855
      ]
    },
    {
      "id": "mix",
      "x": 745,
      "y": 430,
      "caption": "Směšování",
      "value": "62 %",
      "tier": 1,
      "owner": "mix",
      "anchor": [
        725,
        500
      ]
    },
    {
      "id": "div-id",
      "x": 150,
      "y": 400,
      "caption": "Y44.0",
      "value": "",
      "tier": 2,
      "owner": "div",
      "anchor": [
        150,
        400
      ]
    },
    {
      "id": "hp-id",
      "x": 330,
      "y": 1025,
      "caption": "Y43.7 · X228 / X240",
      "value": "",
      "tier": 2,
      "owner": "hp",
      "anchor": [
        330,
        1025
      ]
    },
    {
      "id": "top-id",
      "x": 535,
      "y": 630,
      "caption": "X192 · R6543",
      "value": "",
      "tier": 2,
      "owner": "tank",
      "anchor": [
        535,
        630
      ]
    },
    {
      "id": "bottom-id",
      "x": 535,
      "y": 935,
      "caption": "X180 · R6555",
      "value": "",
      "tier": 2,
      "owner": "tank",
      "anchor": [
        535,
        935
      ]
    },
    {
      "id": "solar-id",
      "x": 700,
      "y": 200,
      "caption": "X34 · Y43.0",
      "value": "",
      "tier": 2,
      "owner": "solar",
      "anchor": [
        700,
        200
      ]
    },
    {
      "id": "heat-id",
      "x": 780,
      "y": 245,
      "caption": "X252 · Y43.1",
      "value": "",
      "tier": 2,
      "owner": "radiator",
      "anchor": [
        780,
        245
      ]
    },
    {
      "id": "pool-id",
      "x": 925,
      "y": 800,
      "caption": "X70 · Y44.2",
      "value": "",
      "tier": 2,
      "owner": "pool",
      "anchor": [
        925,
        800
      ]
    },
    {
      "id": "fish-id",
      "x": 960,
      "y": 1015,
      "caption": "X46 · Y43.3",
      "value": "",
      "tier": 2,
      "owner": "fish",
      "anchor": [
        960,
        1015
      ]
    }
  ],
  "regions": {
    "tank": [
      540,
      690
    ],
    "hp": [
      180,
      740
    ],
    "pool": [
      920,
      800
    ]
  }
} as const;
