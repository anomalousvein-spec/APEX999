# APEX Developer Guide

## Architecture Overview

APEX follows a modular Vanilla JS architecture designed for performance and PWA capabilities.

### 1. State Management (`src/state-facade.js` & `src/state-modules/`)
The state is centralized in a singleton `S`. The `ApexState` facade provides a unified API for mutations, but logic is delegated to domain-specific modules:
- **workout-state.js**: Handles exercise and set logging.
- **body-state.js**: Manages body metrics and trends.
- **review-state.js**: Handles session completion and history.
- **edit-state.js**: Manages exercise pools and global settings.
- **shared-utils.js**: Common validation and state helpers.

### 2. Storage (`src/storage/apex-storage.js`)
A hybrid approach using **LocalStorage** for immediate, synchronous caching and **IndexedDB** for durable, asynchronous persistence.

### 3. Rendering (`src/runtime-shell.js`)
Tabs are managed via a lifecycle system:
- `initTabName()`: Called when switching to a tab.
- `cleanupTabName()`: Called when switching away.
- Renderers are decoupled from state logic.

### 4. Progress Logic (`src/core-utils.js`)
Contains the **14RM Anchor System** logic:
- Uses Epley formula for rep estimations.
- Implements EMA (Exponential Moving Average) smoothing for weights.
- Handles auto-nudging and fatigue detection.

## Adding a New Feature

1. **State**: Add necessary fields to the initial `S` object in `state-facade.js`.
2. **Logic**: Add mutation functions in the appropriate `state-modules/` file.
3. **Facade**: Export the new functions via `window.ApexState`.
4. **UI**: Update the relevant feature file (e.g., `src/features/workout.js`) to render the new state.
5. **Styles**: Add CSS to `styles.css`.

## Debugging

- Use `ApexRuntime.getRuntimeStatus()` in the console to check renderer and storage health.
- `window.S` is globally accessible for inspecting the current raw state.
- Check the **Edit** tab for Storage Health metrics and drift reports.
