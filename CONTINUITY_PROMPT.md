# APEX Refactoring Continuity Prompt

**Copy and paste this entire block into any new chat session to resume work on the APEX Workout Tracker refactoring plan.**

---

## 🔄 Context: APEX Workout Tracker Refactoring

I am refactoring the **APEX Workout Tracker** PWA located in `/workspace`. The app is currently a stable "Hybrid V1" with a monolithic `src/state-facade.js` (~1,296 lines) and needs to be modularized according to a specific 5-phase plan saved in `/workspace/REFACTOR_PLAN.md`.

**Current Architecture:**
- **Entry:** `index.html` loads `app.js` (legacy bridge) → `src/bootstrap.js`.
- **State:** `src/state-facade.js` (monolithic) wraps `src/storage/apex-storage.js` (IndexedDB).
- **UI:** `src/runtime-shell.js` resolves renderers; tabs live in `src/features/*/renderer.js`.
- **PWA:** `sw.js` handles caching; `src/pwa.js` registers it.

**The Goal:**
Execute the phased plan in `REFACTOR_PLAN.md` to split the state facade, audit renderers, add storage health checks, and finalize the build without breaking the existing functionality.

---

## 📍 Current Status

**We are currently working on: [INSERT PHASE NUMBER HERE, e.g., Phase 1, Phase 2, Phase 3]**

**Immediate Objective for this Phase:**
*(Briefly describe the specific goal of the phase you are starting, e.g., "Split state-facade.js into 6 modular helper files" or "Audit all tab renderers for legacy dependencies")*

**Previous Session Notes (if applicable):**
*(Paste any specific error logs, file names changed, or decisions made in the previous chat session here. If starting fresh, leave blank.)*

---

## 📋 Instructions for the AI Assistant

1.  **Read the Plan First:** Before writing any code, read `/workspace/REFACTOR_PLAN.md` to understand the full roadmap, exit criteria, and safety constraints.
2.  **Verify State:** Check the current file structure in `/workspace/src` to confirm what has already been completed vs. what remains for the current phase.
3.  **Incremental Changes:** Do not attempt to do multiple phases at once. Focus strictly on the current phase's objectives.
4.  **Safety First:** 
    - Ensure `git status` is clean before starting major file moves.
    - If modifying `state-facade.js`, ensure the public API surface remains unchanged so callers don't break.
5.  **Verification:** After making changes, provide the exact commands to:
    - Verify the file structure (`ls -R src`).
    - Run any available linting or syntax checks.
    - Confirm the specific exit criteria for this phase are met.

---

## 🚀 Immediate Next Step

Please start by reading `/workspace/REFACTOR_PLAN.md` and confirming the current state of the repository relative to **[INSERT PHASE NUMBER HERE]**. Then, propose the first concrete file operation or code change required to advance this phase.
