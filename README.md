# Factory Builder — MVP

A playable, top-down factory automation game inspired by Factorio, built in plain
HTML5/JavaScript (Canvas). No build step, no dependencies — open `index.html`
directly in a browser or serve it with any static file server.

## Getting started

```bash
# Option A: open the file directly
open index.html

# Option B: static server (recommended)
python3 -m http.server 8080   # then open http://localhost:8080
npx serve .                   # alternative
```

## World

- Exactly **52 × 52 chunks**, 16 × 16 tiles per chunk → **832 × 832 tiles**
- Procedural, deterministic world from a seed: grass, forests, rock formations,
  and scattered iron/copper/coal/stone deposits; a cleared starting area with
  guaranteed deposits nearby
- Viewport culling: only visible tiles and objects are rendered

## Controls

- **WASD / Arrow keys** — move the player
- **Mouse wheel** — zoom in/out
- **Middle mouse drag** — pan the camera (camera smoothly follows the player)
- **Left click** — place a building / select a machine / gather resources
- **Right click** — cancel placement or remove a selected building
- **1–9** — select hotbar slot
- **E** — open/close inventory
- **R** — rotate the selected building or placement ghost
- **Esc** — cancel the current action

## Buildings

Conveyor Belt, Mining Drill, Furnace, Assembler, Chest, Electric Pole, Inserter.
Drills extract ore, belts carry visible items, inserters move items between
machines/chests/belts, furnaces smelt ore with coal into plates, assemblers
craft iron gear wheels and electronic circuits, chests store items.

## Simulation

Every machine maintains type, position, rotation, input/output inventories,
progress and status (working / idle / blocked). Items never disappear when an
output is blocked; machines stop when starved or blocked.

## Save / load

Game state (player position/inventory, buildings, belt contents, deposit
changes, technologies) is stored in browser `localStorage` via the Save / Load /
New Game buttons.

## Known limitations

- Power network is cosmetic (poles are placeable and draw wires; machines run without power)
- Trees/rocks are permanent obstacles (cannot be mined in this MVP)
- Technology panel includes 4 speed upgrades; no full research tree
- No sound effects
- Single save slot
