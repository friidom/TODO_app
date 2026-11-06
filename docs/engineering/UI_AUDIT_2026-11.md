# UI audit tracker, 2026-11-06

The A1 audit of the UI quality pass, on the local branch `feature/ui-quality-pass-2026-11`
(base `1b6e53f`, which production runs). Nothing is pushed or deployed. The summary of the whole
pass is at the end of `AUTONOMOUS_ENGINEERING_PROGRESS.md`.

## How it was audited

- The interaction code of each surface was read first: drag-and-drop sensors and overlays,
  sticky and fixed layers, popovers and portals, Escape handling.
- A sweep in headless Chrome at 1280 × 800 and 390 × 844 covered 18 routes: For You, the six board
  views, two filters, Manage boards, the three Board settings tabs, Space settings, Profile,
  Admin, Admin users and a 404. On each route it recorded horizontal page overflow, fixed or
  sticky elements outside the viewport, controls without an accessible name, broken images,
  console errors and skeletons left on screen.
- Every finding was reproduced in the browser before its fix and checked again after it, with a
  mouse and with touch emulation.
- Data came from a seeded scratch database, with the working-tree API and Vite. Production was
  not touched.

The sweep found no horizontal page overflow, no unnamed control, no broken image, no console
error and no stuck skeleton on any of the 36 route and viewport pairs. What it did flag is listed
under "Checked, not a defect".

Severity: **High** means a core task is blocked, or the main content cannot be read, on a
supported screen. **Medium** means the UI shows a wrong or stuck state, or input reaches the
wrong control, and a workaround exists. **Low** means cosmetic or an edge case.

## Fixed

| ID | Finding | Severity | Root cause | Fix | Verification | Commit |
|---|---|---|---|---|---|---|
| U-01 | Board: after a drop, the "+" create control and its line lit up in the gap where the drop indicator had been, and stayed until the pointer moved. | Medium | Ending a drag re-mounted every gap's hover-revealed control while the pointer still rested on the gap it had dropped into, so that gap was hovered the moment it appeared. | The board's drag state is one pure reducer (`hooks/boardDrag.ts`). Ending a drag, dropped or cancelled, clears every indicator and starts a settling phase in which hover does not reveal the control until the pointer has moved 4 px. Keyboard focus still reveals it. | `boardDrag.test.ts` (7 cases). In the browser on the final tree: nothing lit after a drop with the pointer resting on the gap, after 1–2 px of jitter, or after Escape; moving onto a gap brings the line and badge back; keyboard focus reveals the badge. | ebf7c8f |
| U-02 | Board: the "+" button took clicks aimed at the neighbouring cards' corners. | Medium | The button was 24 px tall inside a 10 px gap, so it overhung both cards and kept the gap hovered. | Its hit box is now the gap band (24 × 10 px). The badge it draws still overhangs, with no pointer events. | 4 px into the next card, the card gets the pointer and the badge hides. A click on the band opens the create form with the title focused. | ebf7c8f |
| U-03 | Board: only the main row followed the Flexible setting. Swimlanes stayed 264 px, the loading skeleton was always Fixed, so a Flexible board jumped as it loaded, and the column drag ghost was 264 px whatever the column. | Medium | Three places each defined a column's width, and only one of them read the setting. | `FLEX_COLUMN` in `columnChrome.ts` is the one definition, used by the main row, every swimlane row and the skeleton. The column ghost takes the box dnd-kit measured for the grabbed column. | 2–8 columns at 1920, 1440 and 1024 px, browser zoom of 125–200 % and a phone (see A2 in the progress file): Fixed stays 264 px and scrolls; Flexible fills the row with equal widths and scrolls only at its 240 px floor, swimlanes included. The ghost matches the column (359 px for 359 px), and a lifted card's ghost matches the card (222 px for 222 px). | 9334fdf |
| U-04 | Backlog and Calendar on a phone: a swipe that started on a row or a chip dragged it instead of scrolling. Every backlog row is a drag source, so the backlog could not be scrolled by touch at all. | High | Both views used a `PointerSensor` with `touch-action: none` on what they drag, which is the setup the board had before F-17. | Both now use the board's F-17 fix (9756abc): a `MouseSensor` (8 px, unchanged on desktop) and a `TouchSensor` that starts a drag after a 250 ms press (5 px tolerance), with `touch-action: manipulation` on the draggables. | At 390 px with touch emulation, before the fix a swipe dragged and scrolled 0 px. After it, a swipe scrolls without dragging (the backlog 411 px, the no-due-date panel up to 408 px) and a long press drags. At 1280 px a mouse drag still lifts a row and a chip, Escape cancels it, and a click on a title opens the task. Tapping a row's status, points, assignee or sprint opens its menu, on screen. | b101a50 |
| U-05 | Backlog at narrow widths: the title shrank to 0 px and the type icon was drawn over the status pill. | High | A row is a six-column grid. Its fixed columns take 516 px before the title, `minmax(0, 1fr)`, gets any. On a phone that is the whole row, and at a 900 px window with the sidebar open the title had about 80 px. | The scroll area is a CSS container. Below 42rem the row wraps: key and title on the first line, the controls under them. A container query, not a viewport breakpoint, because the sidebar decides how wide the backlog is. | 390 px: title 236 px (was 0), no overlap. 900 px: title 482 px. 1100 and 1280 px: unchanged, one line 44 px high. | 5b9481d |
| U-06 | Calendar on a phone: the 224 px no-due-date panel always started open and left the month grid 112 px, 16 px a day. | High | The panel's open state defaulted to open whatever the screen width. | On a phone it starts folded to its count. The toggle opens it, and once someone has toggled it their choice holds. Wider screens start open as before. | 390 px: grid 290 px (was 112). 1280 px: panel open, grid 738 px, as before. | bc83eb5 |

## Found, not changed

| ID | Finding | Severity | Why it was left |
|---|---|---|---|
| U-07 | The List's column picker closes when Escape cancels a column drag inside it. | Low | The drag is cancelled correctly; the popover closes as well. Its hook, `useCardPopover`, does not check `defaultPrevented`, which is how `Modal` and the sidebar now ignore the Escape that a drag claims (b5dd3de). Changing it touches the nested-popover handling of every popover built on it, so it is better done when that hook is next worked on. |
| U-08 | `ConfigureColumnsModal`'s `DragWatch` guard has been redundant since b5dd3de, because `ReorderContext` now claims an Escape that cancels a drag. | Low | Harmless duplication. Removing it is a cleanup, not a fix. |
| U-09 | A long sprint section in the backlog scrolls inside itself (`max-h: min(60vh, 36rem)`). On a phone, a swipe that starts inside it scrolls that section, and only the next swipe, once the section has reached its end, scrolls the page. | Low | Standard nested scrolling, and the section's own scroll is a deliberate desktop choice. Whether long sections should scroll inside themselves on a phone is a product decision. |

## Checked, not a defect

- The sweep reported sticky elements outside the viewport: the List's header row and first
  columns, the Timeline's header, the backlog's section headers and the For You side panel. Each
  sits inside its own scroll container, which clips it. The page itself never overflows.
- The round button in the bottom-right corner of every screenshot is Agentation, a
  development-only overlay. `main.tsx` loads it only in development, and production builds do
  not include it.
- On a phone, the admin tables scroll sideways inside their card (`AdminGrid`: `overflow-x-auto`
  with a minimum width), which is how they are meant to work.
- On a phone, Manage boards, Board settings, Space settings, Profile and the 404 page show no
  sidebar trigger. Each has its own Back header instead.

## Not covered

- Real devices. Touch was checked with Chrome's touch emulation, not on iOS Safari or Android.
  iOS Safari is the browser most likely to differ, in long-press callouts and nested scrolling.
- Browsers other than Chromium.
- The dark theme. The sweep ran in the default light theme.
- Screen readers. Accessible names were checked, but there was no screen-reader walkthrough.
- The screenshots the brief mentions did not reach this session, so the audit could not start
  from them.
