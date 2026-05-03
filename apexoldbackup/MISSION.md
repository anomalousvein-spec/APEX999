# APEX Workout Tracker - Mission & Continuity Document

**Last Updated:** April 04, 2026 (QOL Enhancements Update)

## Core Purpose
This is my **personal** workout tracking Progressive Web App (PWA).
It is built for daily strength training use, primarily accessed from my iPhone home screen through Safari "Add to Home Screen".

The app helps me:
- Plan and log structured workouts with blocks, weeks, and deload weeks
- Track sets with weights, reps, and completion status
- Maintain long-term exercise history for PR tracking, volume, and analytics
- Record body metrics and trend data over time
- Keep everything offline-first with easy import/export backups

**Philosophy:** Keep it simple, fast, and reliable for real gym use. No accounts, no cloud sync, no unnecessary features.

## Intended Use
- **Primary device:** iPhone PWA
- **Secondary:** Desktop/PC for editing exercises, reviewing history, or making bigger changes
- The app should open fast, log fast, and get out of the way
- Data must feel safe: partial workouts should not be lost easily, and history should stay consistent even when exercises are renamed, deleted, or reorganized

## Release Status
**Current Status:** Stable Hybrid V1

This means:
- The current build is considered stable enough for daily use
- The modular runtime is active and working
- IndexedDB-backed storage is integrated and active
- Legacy monolith/localStorage behavior is still retained as a fallback safety net
- Future work is now optional phase-two architecture work, not emergency stabilization

## Current Architecture State
APEX now runs as a **standardized hybrid modular architecture**.

### Active Runtime Layers
- Shell/bootstrap/PWA logic lives in `src/bootstrap.js`, `src/pwa.js`, `src/shell-ui.js`, `src/shell-lifecycle.js`, `src/shell-feedback.js`, `src/shell-header.js`, and `src/shell-rest-timer.js`
- Feature behavior is split into modular files under `src/features/`.
- All features use the **Facade-First** pattern via `window.ApexState`.
- Shared runtime/state coordination lives in `src/runtime-shell.js` and `src/state-facade.js`
- IndexedDB-backed storage support lives in `src/storage/apex-storage.js`

### Legacy Safety Layer
- `app.js` is now a minimal legacy bridge (~70 lines) that delegates to the modular shell while maintaining global compatibility.
- Legacy `safePersist()` still exists as a safety fallback
- `backupsource/` remains the original monolithic rollback point

### Storage State
- IndexedDB is **adapted and active**
- IndexedDB is **not yet the sole source of truth**
- APEX currently uses a **hybrid persistence strategy**:
  - modular facade/storage layers handle startup recovery, diagnostics, selected boot reads, and selected live writes
  - legacy localStorage persistence remains underneath as fallback for safety

## What Is Already Done
These major goals have already been achieved:
- Restored a known-good baseline after the first broken modularization attempt
- Reintroduced modularization safely in small phases
- Extracted shell/runtime layers out of `app.js`
- Standardized modular architecture by removing "-live" suffixes and enforcing Facade-First async mutations across all features
- Implemented QOL Pass 1-3: Live PR detection, interactive heatmap drill-down, volume distribution charts, inline note editing, manual exercise swap, duplicate set helper, last session visibility, and enhanced body trend charts
- Added an explicit runtime facade, state facade, and legacy bridge
- Added IndexedDB-backed storage infrastructure
- Added boot diagnostics, drift reporting, and malformed-state recovery
- Moved selected low-risk writes to facade-first storage handling

## Facade-First State Ownership So Far
The modular/state facade now actively participates in these areas:
- `notes` (Preferred Read at boot + Active Mutations)
- `restTimes` (Preferred Read at boot + Active Mutations)
- `pins` (Preferred Read at boot + Active Mutations)
- `locks` (Preferred Read at boot + Active Mutations)
- `prefill` (Preferred Read at boot + Active Mutations)
- `recentEx` (Preferred Read at boot + Active Mutations)
- `bodyMetrics` (Preferred Read at boot + Active Mutations)
- `exHist` (Preferred Read at boot + Active Mutations)
- `sessions` (Preferred Read at boot + Active Mutations)
- `workouts` (Preferred Read at boot + Active Mutations)
- `pools` (exercise management)
- `DP` / `CAT_LABELS` (core data schema)
- block/week/day selection state

These critical data slices have now successfully transitioned to a Storage-First (IndexedDB-primary) authority model.

## What Still Remains Optional
The app is stable now, so the remaining work is optional and should be treated carefully.

The biggest remaining architecture choices are:
- whether to migrate `sessions` to stronger storage ownership
- whether to migrate `workouts` to stronger storage ownership
- whether to reduce `app.js` further or leave it as a long-term fallback shell
- whether to fully retire legacy localStorage persistence in the future

None of those are required for the app to be considered stable today.

## Development Guidelines
- **Safety First:** Never break the working app. Every change must keep the PWA functional.
- Test locally by opening `index.html`, then test on Netlify, and hard refresh or reinstall the iPhone PWA when shell/cache behavior changes.
- Keep changes incremental and reversible.
- Preserve fallback paths unless there is a strong reason to remove them.
- Update this file and `updatelog.txt` after meaningful changes.
- Maintain `CONTEXT.txt` for full conversation history.

## Stable V1 Checkpoint
This is the current recommended stopping point if no further work is urgently needed.

The definition of success at this checkpoint is:
- daily-use reliable
- modular enough to be maintainable
- storage-modern enough to support future migration
- conservative enough to keep legacy recovery paths in place

If the app continues to behave well in real-world use, this checkpoint should be treated as a successful stable release, not an unfinished failure state.

## Future Roadmap
If development resumes later, use this priority order.

### Phase A: Stability And Observation
- keep using the app normally
- monitor real-world PWA behavior on iPhone
- continue export backups before larger changes
- note any persistence oddities before deeper migrations

### Phase B: Small, High-Value Improvements
- improve diagnostics and storage visibility if needed
- clean up encoding artifacts in old files only when safe
- continue small facade-first migrations only if the value is clear

### Phase C: Heavyweight Decisions
Only do these if there is a strong reason:
- migrate `sessions` to stronger storage ownership
- migrate `workouts` to stronger storage ownership
- reduce `app.js` further
- make IndexedDB the clear primary persistence authority

### Recommended Order If Heavy Migration Resumes
1. `sessions`
2. `workouts`

This order is recommended because session history is easier to validate than live in-progress workout state.

## Do Not Rush List
- Do not remove legacy fallback paths casually
- Do not attempt a one-step IndexedDB cutover
- Do not aggressively rewrite `app.js` just because it is large
- Do not trade daily-use reliability for architectural neatness

## Testing Checklist
When making future changes, prefer this quick checklist:
- Open `index.html` locally
- Test tab switching
- Test workout notes and rest buttons
- Test pin/unpin and reroll behavior
- Complete a workout and confirm next-session continuity
- Test the Body tab if body-related code changed
- Test Netlify with a hard refresh
- Reopen the iPhone PWA if service worker or shell files changed

## Evolution & Updating This Document
This mission document is **living and fluid**.

It should evolve when:
- training priorities change
- the architecture meaningfully changes
- a new stable checkpoint is reached
- a risky migration is completed or intentionally abandoned

**How to update it:**
- Keep the "Last Updated" date current
- Update the release status whenever the project meaningfully changes state
- Add or revise roadmap guidance when the next recommended path becomes clearer
- Prefer clarity over completeness; this file should help the next session start fast and safely

## Related Files
- `updatelog.txt` - chronological record of all changes
- `CONTEXT.txt` - full conversation and development history
- `backupsource/` - safe original monolithic version
- `app.js` - legacy fallback runtime
- `src/state-facade.js` - current modular state/persistence bridge
- `src/storage/apex-storage.js` - current IndexedDB-backed storage layer

---

**This document belongs to me (JZN).**
It serves as the single source of truth for what APEX is, why it exists, what state it is currently in, and how it should evolve without losing reliability.
