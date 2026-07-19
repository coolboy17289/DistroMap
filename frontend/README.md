# DistroMap Frontend

The interactive radial graph that sits in front of `distros/`.

## Stack

| Layer | Choice |
|---|---|
| Bundler / Dev | Vite 5 |
| Language | TypeScript 5 (strict) |
| UI Framework | React 18 |
| Graph engine | React Flow (`@xyflow/react` v12) |
| Styling | Tailwind CSS 3 |
| Animation | Framer Motion 11 + Tailwind keyframes |
| Data | Static JSON produced by `../.cache/build_distro_files.py` |

## Quick start

```bash
cd frontend
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # tsc -b && vite build → frontend/dist/
npm run preview    # serve the prod bundle
```

## Layout

```
frontend/
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.ts
├── index.html
├── public/
│   └── logo.svg                     (Figma export — 560×130 wordmark)
└── src/
    ├── main.tsx
    ├── App.tsx                      (3-column shell: header · canvas · side panel · footer)
    ├── index.css                    (Tailwind directives + reactive edge keyframes)
    ├── types/
    │   └── index.ts                 (Distro, DistroFlowNode, etc.)
    ├── data/
    │   └── distros.json             (12 distros; rebuilt by .cache/build_distro_files.py)
    ├── lib/
    │   └── layout.ts                (polar coordinate computation for React Flow)
    └── components/
        ├── Header.tsx
        ├── SearchBar.tsx
        ├── ThemeToggle.tsx
        ├── GithubButton.tsx
        ├── GraphCanvas.tsx          (the <ReactFlow> prime component)
        ├── DistroNode.tsx           (custom React Flow node)
        ├── SidePanel.tsx            (Framer Motion slide-in)
        └── Footer.tsx
```

## Data

`src/data/distros.json` is rebuilt from `../.cache/api/all.json` by
`.cache/build_distro_files.py`. The Python pipeline knows the schema
(see `frontend_payload()` in that script) and emits every field the
TypeScript `Distro` type expects.

If you add a new distro manually before the Python script catches up,
either re-run the pipeline or edit the JSON by hand — fields are
documented inline in `src/types/index.ts`.

## Theme

Dark by default. The `ThemeToggle` component reads / writes
`localStorage['distromap-theme']` and respects
`prefers-color-scheme` on first visit. Tailwind's `darkMode: 'class'`
mode is used so flipping the class on `<html>` is enough.

## Keyboard

- `/` focuses the search box
- `Ctrl-K` / `Cmd-K` does the same
- `Esc` while focused on a node clears the selection (handled by
  `ReactFlow`'s default)

## Notes

- React Flow's <Controls> component is themed with `!bg-panel` /
  `!border-panel-border` overrides — see the global style in
  `src/index.css`.
- The animated edges (`stroke-dasharray: 6 6` + the `flow`
  keyframe) all run at the same 1.6 s linear loop; switching a
  parent→child edge into the selected path bumps its colour to cyan.
- The kernel node pulses via `kernel-pulse` keyframe and is the only
  element with a constant glow filter.
