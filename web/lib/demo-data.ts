import type { ColNode, RowData } from "./table-types";

export const DEMO_COLUMNS: ColNode[] = [
  {
    id: "general",
    name: "General",
    colType: "mixed",
    children: [
      { id: "license", name: "License", colType: "text", children: [] },
      { id: "bundle_kb", name: "Bundle (kb)", colType: "number", children: [] },
    ],
  },
  {
    id: "features",
    name: "Features",
    colType: "mixed",
    children: [
      { id: "devtools", name: "DevTools", colType: "boolean", children: [] },
      {
        id: "typescript",
        name: "TypeScript",
        colType: "mixed",
        children: [
          { id: "ts_inference", name: "Type inference", colType: "boolean", children: [] },
          { id: "ts_generics", name: "Generic types", colType: "boolean", children: [] },
        ],
      },
      { id: "async", name: "Async", colType: "boolean", children: [] },
    ],
  },
  {
    id: "community",
    name: "Community",
    colType: "mixed",
    children: [
      { id: "gh_stars", name: "GH Stars", colType: "number", children: [] },
      { id: "weekly_dl", name: "Weekly DLs (M)", colType: "number", children: [] },
    ],
  },
];

export const DEMO_ROWS: RowData[] = [
  { id: "redux",   name: "Redux",   license: "MIT", bundle_kb: 2.6,  devtools: true,  ts_inference: true,  ts_generics: true,  async: true,  gh_stars: 60800, weekly_dl: 9.2 },
  { id: "zustand", name: "Zustand", license: "MIT", bundle_kb: 1.1,  devtools: true,  ts_inference: true,  ts_generics: true,  async: true,  gh_stars: 46200, weekly_dl: 4.8 },
  { id: "jotai",   name: "Jotai",   license: "MIT", bundle_kb: 3.4,  devtools: true,  ts_inference: true,  ts_generics: true,  async: true,  gh_stars: 18300, weekly_dl: 1.6 },
  { id: "mobx",    name: "MobX",    license: "MIT", bundle_kb: 16.5, devtools: true,  ts_inference: false, ts_generics: true,  async: true,  gh_stars: 27200, weekly_dl: 1.4 },
  { id: "valtio",  name: "Valtio",  license: "MIT", bundle_kb: 2.7,  devtools: true,  ts_inference: true,  ts_generics: false, async: true,  gh_stars: 9100,  weekly_dl: 0.8 },
  { id: "recoil",  name: "Recoil",  license: "MIT", bundle_kb: 21.0, devtools: true,  ts_inference: true,  ts_generics: true,  async: true,  gh_stars: 19600, weekly_dl: 0.5 },
];
