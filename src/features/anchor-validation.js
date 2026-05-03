(() => {
  'use strict';

  /**
   * PHASE 6: Testing & Validation Module
   * 
   * This module provides scenario testing and validation utilities for the
   * Self-Correcting Hypertrophy Anchor System. It verifies that anchor updates
   * follow the logic defined in 12RM_Concept.md across all edge cases.
   * 
   * Usage:
   *   - Run validateAnchorSystem() to execute all test scenarios
   *   - Check console output for pass/fail results
   *   - Use runSingleScenario() to test specific cases
   */

  // ══════════════════════════════════════════════════════
  // TEST CONSTANTS & CONFIGURATION
  // ══════════════════════════════════════════════════════
  
  const TEST_EXERCISE = 'Test Bench Press';
  const EPSILON = 0.01; // Floating point comparison tolerance
  
  const ANCHOR_CONSTANTS = {
    alpha: 0.3,
    target_RM: 14,
    auto_nudge: 1.25,
    perfect_streak_threshold: 2,
    drop_rep_threshold: 2,
    long_gap_threshold: 14
  };

  // ══════════════════════════════════════════════════════
  // HELPER FUNCTIONS
  // ══════════════════════════════════════════════════════

  /**
   * Compute expected 14RM from weight and reps using Epley-based formula
   */
  function computeExpected14RM(weight, reps) {
    return weight * (1 + reps / 30) / (1 + ANCHOR_CONSTANTS.target_RM / 30);
  }

  /**
   * Compute expected new anchor after EMA blend
   */
  function computeExpectedAnchor(aOld, w14rm, alpha = ANCHOR_CONSTANTS.alpha) {
    return alpha * w14rm + (1 - alpha) * aOld;
  }

  /**
   * Deep equality check with tolerance for floating point
   */
  function deepEqual(actual, expected, fieldPath = '') {
    if (typeof expected === 'number' && typeof actual === 'number') {
      return Math.abs(actual - expected) < EPSILON;
    }
    if (typeof expected === 'boolean' || typeof expected === 'string') {
      return actual === expected;
    }
    if (expected === null || actual === null) {
      return actual === expected;
    }
    if (typeof expected === 'object' && typeof actual === 'object') {
      const keys = Object.keys(expected);
      for (const key of keys) {
        if (!deepEqual(actual[key], expected[key], `${fieldPath}.${key}`)) {
          console.warn(`[Validation] Mismatch at ${fieldPath}.${key}: expected ${expected[key]}, got ${actual[key]}`);
          return false;
        }
      }
      return true;
    }
    return actual === expected;
  }

  /**
   * Reset exercise anchor state for clean test
   */
  function resetExerciseAnchor(exName) {
    const S = window.S || window.ApexState?.get();
    if (!S || !S.exerciseAnchors) return;
    delete S.exerciseAnchors[exName];
    if (window.ApexState?.persistExerciseAnchorsState) {
      window.ApexState.persistExerciseAnchorsState();
    }
  }

  /**
   * Set initial anchor value for testing
   */
  function setInitialAnchor(exName, initialWeight) {
    const S = window.S || window.ApexState?.get();
    if (!S || !S.exerciseAnchors) return;
    S.exerciseAnchors[exName] = {
      anchor: initialWeight,
      perfect_streak_counter: 0,
      anchorHistory: []
    };
    if (window.ApexState?.persistExerciseAnchorsState) {
      window.ApexState.persistExerciseAnchorsState();
    }
  }

  /**
   * Get current anchor state
   */
  function getAnchorState(exName) {
    const S = window.S || window.ApexState?.get();
    return S?.exerciseAnchors?.[exName] || null;
  }

  // ══════════════════════════════════════════════════════
  // TEST SCENARIOS
  // ══════════════════════════════════════════════════════

  /**
   * Scenario 1: First-set failure (R1 < 12)
   * Expected: Anchor decreases based on R1 RM estimate
   */
  async function testCase1_FirstSetFailure() {
    const exName = `${TEST_EXERCISE} - Case 1`;
    const initialAnchor = 100;
    const weightUsed = 100;
    const R1 = 10; // Failed to complete 12 reps
    
    resetExerciseAnchor(exName);
    setInitialAnchor(exName, initialAnchor);
    
    const sessionData = {
      W: weightUsed,
      R1: R1,
      sessionStatus: 'completed'
    };
    
    const result = window.updateExerciseAnchor?.(exName, sessionData);
    const state = getAnchorState(exName);
    
    // Expected calculations
    const expected14RM = computeExpected14RM(weightUsed, R1);
    const expectedNewAnchor = computeExpectedAnchor(initialAnchor, expected14RM);
    
    const passed = result &&
      result.sessionOutcome === 'decreased' &&
      result.change < 0 &&
      state.perfect_streak_counter === 0 &&
      deepEqual(result.newAnchor, expectedNewAnchor);
    
    return {
      name: 'Case 1: First-set Failure (R1 < 12)',
      passed,
      expected: {
        outcome: 'decreased',
        changeNegative: true,
        streakReset: true,
        newAnchorApprox: Math.round(expectedNewAnchor * 100) / 100
      },
      actual: result,
      reason: passed ? '✓ Anchor correctly decreased on first-set failure' : 
        `✗ Expected decrease to ~${Math.round(expectedNewAnchor)}, got ${result?.newAnchor || 'null'}`
    };
  }

  /**
   * Scenario 2: Intentional AMRAP (R3 > 12)
   * Expected: Anchor increases based on R3 RM estimate, streak continues if R1 solid
   */
  async function testCase2_IntentionalAMRAP() {
    const exName = `${TEST_EXERCISE} - Case 2`;
    const initialAnchor = 100;
    const weightUsed = 100;
    const R1 = 12;
    const R2 = 11;
    const R3 = 15; // AMRAP set
    
    resetExerciseAnchor(exName);
    setInitialAnchor(exName, initialAnchor);
    
    const sessionData = {
      W: weightUsed,
      R1: R1,
      R2: R2,
      R3: R3,
      amrapFlagged: true,
      sessionStatus: 'completed'
    };
    
    const result = window.updateExerciseAnchor?.(exName, sessionData);
    const state = getAnchorState(exName);
    
    // Expected calculations
    const expected14RM = computeExpected14RM(weightUsed, R3);
    const expectedNewAnchor = computeExpectedAnchor(initialAnchor, expected14RM);
    
    const passed = result &&
      result.sessionOutcome === 'increased' &&
      result.amrapPerformed === true &&
      state.perfect_streak_counter === 1 && // Streak continues
      deepEqual(result.newAnchor, expectedNewAnchor);
    
    return {
      name: 'Case 2: Intentional AMRAP (R3 > 12)',
      passed,
      expected: {
        outcome: 'increased',
        amrapPerformed: true,
        streakContinues: true,
        newAnchorApprox: Math.round(expectedNewAnchor * 100) / 100
      },
      actual: result,
      reason: passed ? '✓ Anchor correctly increased on AMRAP calibration' : 
        `✗ Expected increase to ~${Math.round(expectedNewAnchor)}, got ${result?.newAnchor || 'null'}`
    };
  }

  /**
   * Scenario 3a: Normal session - solid (no rep drop)
   * Expected: Streak builds, no anchor change until threshold
   */
  async function testCase3a_NormalSolidSession() {
    const exName = `${TEST_EXERCISE} - Case 3a`;
    const initialAnchor = 100;
    const weightUsed = 100;
    const R1 = 12;
    const R2 = 11; // Drop of 1, acceptable
    
    resetExerciseAnchor(exName);
    setInitialAnchor(exName, initialAnchor);
    
    const sessionData = {
      W: weightUsed,
      R1: R1,
      R2: R2,
      sessionStatus: 'completed'
    };
    
    const result = window.updateExerciseAnchor?.(exName, sessionData);
    const state = getAnchorState(exName);
    
    const passed = result &&
      result.sessionOutcome === 'streak-building' &&
      result.change === 0 &&
      state.perfect_streak_counter === 1;
    
    return {
      name: 'Case 3a: Normal Solid Session (drop < 2)',
      passed,
      expected: {
        outcome: 'streak-building',
        changeZero: true,
        streakIncrement: 1
      },
      actual: result,
      reason: passed ? '✓ Streak built correctly without anchor change' : 
        `✗ Expected streak=1, no change; got streak=${state?.perfect_streak_counter}, change=${result?.change}`
    };
  }

  /**
   * Scenario 3b: Normal session - rep drop detected
   * Expected: Streak reset, no anchor change
   */
  async function testCase3b_RepDropDetected() {
    const exName = `${TEST_EXERCISE} - Case 3b`;
    const initialAnchor = 100;
    const weightUsed = 100;
    const R1 = 12;
    const R2 = 9; // Drop of 3, too high
    
    resetExerciseAnchor(exName);
    setInitialAnchor(exName, initialAnchor);
    // Pre-set streak to 1 to verify reset
    const state = getAnchorState(exName);
    state.perfect_streak_counter = 1;
    
    const sessionData = {
      W: weightUsed,
      R1: R1,
      R2: R2,
      sessionStatus: 'completed'
    };
    
    const result = window.updateExerciseAnchor?.(exName, sessionData);
    const updatedState = getAnchorState(exName);
    
    const passed = result &&
      result.sessionOutcome === 'unchanged' &&
      result.change === 0 &&
      updatedState.perfect_streak_counter === 0;
    
    return {
      name: 'Case 3b: Rep Drop Detected (drop >= 2)',
      passed,
      expected: {
        outcome: 'unchanged',
        changeZero: true,
        streakReset: true
      },
      actual: result,
      reason: passed ? '✓ Streak correctly reset on rep drop' : 
        `✗ Expected streak reset, got streak=${updatedState?.perfect_streak_counter}`
    };
  }

  /**
   * Scenario 4: Auto-nudge after perfect streak
   * Expected: Anchor increases by auto_nudge after 2 solid sessions
   */
  async function testCase4_AutoNudge() {
    const exName = `${TEST_EXERCISE} - Case 4`;
    const initialAnchor = 100;
    const weightUsed = 100;
    const R1 = 12;
    const R2 = 12;
    
    resetExerciseAnchor(exName);
    setInitialAnchor(exName, initialAnchor);
    
    // First solid session
    window.updateExerciseAnchor?.(exName, {
      W: weightUsed,
      R1: R1,
      R2: R2,
      sessionStatus: 'completed'
    });
    
    // Second solid session - should trigger auto-nudge
    const result = window.updateExerciseAnchor?.(exName, {
      W: weightUsed,
      R1: R1,
      R2: R2,
      sessionStatus: 'completed'
    });
    
    const expectedNewAnchor = initialAnchor + ANCHOR_CONSTANTS.auto_nudge;
    
    const passed = result &&
      result.sessionOutcome === 'increased' &&
      deepEqual(result.change, ANCHOR_CONSTANTS.auto_nudge) &&
      deepEqual(result.newAnchor, expectedNewAnchor);
    
    return {
      name: 'Case 4: Auto-Nudge After Perfect Streak',
      passed,
      expected: {
        outcome: 'increased',
        changeAmount: ANCHOR_CONSTANTS.auto_nudge,
        newAnchorApprox: expectedNewAnchor
      },
      actual: result,
      reason: passed ? '✓ Auto-nudge applied after 2 solid sessions' : 
        `✗ Expected +${ANCHOR_CONSTANTS.auto_nudge} lbs, got ${result?.change}`
    };
  }

  /**
   * Scenario 5: Incomplete session blocks update
   * Expected: Anchor unchanged, incomplete flag set
   */
  async function testCase5_IncompleteSession() {
    const exName = `${TEST_EXERCISE} - Case 5`;
    const initialAnchor = 100;
    const weightUsed = 100;
    const R1 = 12;
    
    resetExerciseAnchor(exName);
    setInitialAnchor(exName, initialAnchor);
    
    const sessionData = {
      W: weightUsed,
      R1: R1,
      sessionStatus: 'partial'
    };
    
    const result = window.updateExerciseAnchor?.(exName, sessionData);
    
    const passed = result &&
      result.sessionOutcome === 'incomplete' &&
      result.incomplete === true &&
      result.change === 0 &&
      deepEqual(result.newAnchor, initialAnchor);
    
    return {
      name: 'Case 5: Incomplete Session Blocks Update',
      passed,
      expected: {
        outcome: 'incomplete',
        changeZero: true,
        incompleteFlag: true
      },
      actual: result,
      reason: passed ? '✓ Anchor update deferred for incomplete session' : 
        `✗ Expected incomplete session handling, got ${result?.sessionOutcome}`
    };
  }

  /**
   * Scenario 6: User skips anchor update (bad day safeguard)
   * Expected: Anchor unchanged, skipped flag set
   */
  async function testCase6_SkipAnchorUpdate() {
    const exName = `${TEST_EXERCISE} - Case 6`;
    const initialAnchor = 100;
    const weightUsed = 100;
    const R1 = 8; // Would normally trigger decrease
    
    resetExerciseAnchor(exName);
    setInitialAnchor(exName, initialAnchor);
    
    const sessionData = {
      W: weightUsed,
      R1: R1,
      sessionStatus: 'completed',
      skipAnchorUpdate: true
    };
    
    const result = window.updateExerciseAnchor?.(exName, sessionData);
    
    const passed = result &&
      result.sessionOutcome === 'skipped' &&
      result.skipped === true &&
      result.change === 0 &&
      deepEqual(result.newAnchor, initialAnchor);
    
    return {
      name: 'Case 6: User Skips Anchor Update (Bad Day)',
      passed,
      expected: {
        outcome: 'skipped',
        changeZero: true,
        skippedFlag: true
      },
      actual: result,
      reason: passed ? '✓ Anchor preserved when user flagged bad day' : 
        `✗ Expected skip handling, got ${result?.sessionOutcome}`
    };
  }

  /**
   * Scenario 7: Long gap resets streak
   * Expected: Streak reset if >14 days since last session
   */
  async function testCase7_LongGapResetsStreak() {
    const exName = `${TEST_EXERCISE} - Case 7`;
    const initialAnchor = 100;
    const weightUsed = 100;
    const R1 = 12;
    const R2 = 12;
    
    resetExerciseAnchor(exName);
    setInitialAnchor(exName, initialAnchor);
    
    // Build streak to 1
    window.updateExerciseAnchor?.(exName, {
      W: weightUsed,
      R1: R1,
      R2: R2,
      sessionStatus: 'completed'
    });
    
    // Simulate long gap (15 days)
    const result = window.updateExerciseAnchor?.(exName, {
      W: weightUsed,
      R1: R1,
      R2: R2,
      sessionStatus: 'completed',
      daysSinceLast: 15
    });
    
    const state = getAnchorState(exName);
    
    // Streak should be reset to 0, then incremented to 1 (not to 2)
    const passed = result &&
      state.perfect_streak_counter === 1; // Was reset, then incremented
    
    return {
      name: 'Case 7: Long Gap (>14 days) Resets Streak',
      passed,
      expected: {
        streakAfterLongGap: 1
      },
      actual: { streakCounter: state?.perfect_streak_counter },
      reason: passed ? '✓ Streak correctly reset after long gap' : 
        `✗ Expected streak=1 after reset+increment, got ${state?.perfect_streak_counter}`
    };
  }

  /**
   * Scenario 8: AMRAP with fatigue noted (R1 solid, but large drop to R2)
   * Expected: Anchor increases from AMRAP, but streak does NOT increment
   */
  async function testCase8_AMRAPWithFatigue() {
    const exName = `${TEST_EXERCISE} - Case 8`;
    const initialAnchor = 100;
    const weightUsed = 100;
    const R1 = 12;
    const R2 = 9; // Large drop
    const R3 = 14; // AMRAP
    
    resetExerciseAnchor(exName);
    setInitialAnchor(exName, initialAnchor);
    
    const sessionData = {
      W: weightUsed,
      R1: R1,
      R2: R2,
      R3: R3,
      amrapFlagged: true,
      sessionStatus: 'completed'
    };
    
    const result = window.updateExerciseAnchor?.(exName, sessionData);
    const state = getAnchorState(exName);
    
    // AMRAP should still update anchor, but fatigue is noted
    const passed = result &&
      result.sessionOutcome === 'increased' &&
      result.amrapPerformed === true &&
      result.adjustmentReason?.includes('fatigue noted');
    
    return {
      name: 'Case 8: AMRAP with Fatigue Noted',
      passed,
      expected: {
        outcome: 'increased',
        amrapPerformed: true,
        fatigueNoted: true
      },
      actual: result,
      reason: passed ? '✓ AMRAP processed with fatigue warning' : 
        `✗ Expected AMRAP with fatigue note, got ${result?.adjustmentReason}`
    };
  }

  // ══════════════════════════════════════════════════════
  // MAIN VALIDATION RUNNER
  // ══════════════════════════════════════════════════════

  /**
   * Run all test scenarios and report results
   */
  async function validateAnchorSystem() {
    console.groupCollapsed('🧪 PHASE 6: Anchor System Validation');
    console.log('Running comprehensive test scenarios...\n');
    
    const scenarios = [
      testCase1_FirstSetFailure,
      testCase2_IntentionalAMRAP,
      testCase3a_NormalSolidSession,
      testCase3b_RepDropDetected,
      testCase4_AutoNudge,
      testCase5_IncompleteSession,
      testCase6_SkipAnchorUpdate,
      testCase7_LongGapResetsStreak,
      testCase8_AMRAPWithFatigue
    ];
    
    const results = [];
    let passedCount = 0;
    let failedCount = 0;
    
    for (const scenario of scenarios) {
      try {
        const result = await scenario();
        results.push(result);
        
        if (result.passed) {
          passedCount++;
          console.log(`✅ PASS: ${result.name}`);
          console.log(`   ${result.reason}`);
        } else {
          failedCount++;
          console.error(`❌ FAIL: ${result.name}`);
          console.error(`   ${result.reason}`);
          console.error(`   Expected:`, result.expected);
          console.error(`   Actual:`, result.actual);
        }
        console.log('');
      } catch (error) {
        failedCount++;
        console.error(`💥 ERROR: ${scenario.name}`);
        console.error(`   ${error.message}`);
        console.error(`   Stack:`, error.stack);
        console.log('');
      }
    }
    
    console.log('─'.repeat(60));
    console.log(`📊 SUMMARY: ${passedCount}/${scenarios.length} tests passed`);
    
    if (failedCount === 0) {
      console.log('🎉 All validation scenarios passed! Anchor system is working correctly.');
    } else {
      console.warn(`⚠️  ${failedCount} scenario(s) failed. Review the details above.`);
    }
    
    console.groupEnd();
    
    return {
      total: scenarios.length,
      passed: passedCount,
      failed: failedCount,
      results,
      allPassed: failedCount === 0
    };
  }

  /**
   * Run a single scenario by index or name
   */
  async function runSingleScenario(scenarioIndexOrName) {
    const scenarios = [
      { name: 'case1', fn: testCase1_FirstSetFailure },
      { name: 'case2', fn: testCase2_IntentionalAMRAP },
      { name: 'case3a', fn: testCase3a_NormalSolidSession },
      { name: 'case3b', fn: testCase3b_RepDropDetected },
      { name: 'case4', fn: testCase4_AutoNudge },
      { name: 'case5', fn: testCase5_IncompleteSession },
      { name: 'case6', fn: testCase6_SkipAnchorUpdate },
      { name: 'case7', fn: testCase7_LongGapResetsStreak },
      { name: 'case8', fn: testCase8_AMRAPWithFatigue }
    ];
    
    let scenario;
    if (typeof scenarioIndexOrName === 'number') {
      scenario = scenarios[scenarioIndexOrName];
    } else {
      scenario = scenarios.find(s => s.name === scenarioIndexOrName);
    }
    
    if (!scenario) {
      console.error(`Unknown scenario: ${scenarioIndexOrName}`);
      return null;
    }
    
    console.log(`\n🔬 Running single scenario: ${scenario.name}`);
    const result = await scenario.fn();
    console.log(result.passed ? '✅ PASS' : '❌ FAIL', '-', result.reason);
    return result;
  }

  /**
   * Generate a visual report of anchor history for an exercise
   */
  function generateAnchorHistoryReport(exName) {
    const state = getAnchorState(exName);
    if (!state || !state.anchorHistory || state.anchorHistory.length === 0) {
      console.log(`No anchor history found for "${exName}"`);
      return null;
    }
    
    console.group(`📈 Anchor History: ${exName}`);
    console.log(`Current Anchor: ${state.anchor} lbs`);
    console.log(`Current Streak: ${state.perfect_streak_counter}`);
    console.log('\nRecent Updates:');
    
    state.anchorHistory.slice(-10).forEach((entry, idx) => {
      const date = new Date(entry.timestamp).toLocaleDateString();
      const changeSymbol = entry.change > 0 ? '+' : '';
      console.log(`  ${idx + 1}. ${date}: ${changeSymbol}${entry.change.toFixed(2)} lbs (${entry.sessionOutcome})`);
      console.log(`     Reason: ${entry.adjustmentReason}`);
    });
    
    console.groupEnd();
    return state.anchorHistory;
  }

  /**
   * Export validation results for documentation
   */
  function exportValidationResults(results) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: results.total,
        passed: results.passed,
        failed: results.failed,
        successRate: `${Math.round(results.passed / results.total * 100)}%`
      },
      scenarios: results.results.map(r => ({
        name: r.name,
        passed: r.passed,
        expected: r.expected,
        actual: r.actual,
        reason: r.reason
      }))
    };
    
    console.log('\n📋 Validation Report (JSON):');
    console.log(JSON.stringify(report, null, 2));
    
    return report;
  }

  // ══════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════

  window.ApexAnchorValidation = {
    validateAnchorSystem,
    runSingleScenario,
    generateAnchorHistoryReport,
    exportValidationResults,
    // Expose helpers for advanced testing
    _helpers: {
      resetExerciseAnchor,
      setInitialAnchor,
      getAnchorState,
      computeExpected14RM,
      computeExpectedAnchor
    }
  };

  console.log('[APEX] Anchor Validation Module loaded. Run window.ApexAnchorValidation.validateAnchorSystem() to test.');

})();

