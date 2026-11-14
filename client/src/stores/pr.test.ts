/**
 * PR store tests
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { createPRStore, type PRStore } from './pr';

describe('createPRStore', () => {
  let store: PRStore;

  beforeEach(() => {
    store = createPRStore();
  });

  describe('initial state', () => {
    test('has null current PR status', () => {
      expect(store.currentPRStatus).toBeNull();
    });

    test('has null selected prompt ID', () => {
      expect(store.selectedPromptId).toBeNull();
    });

    test('has default base branch as main', () => {
      expect(store.baseBranch).toBe('main');
    });

    test('has empty custom variables', () => {
      expect(store.customVariables).toEqual({});
    });

    test('is not loading', () => {
      expect(store.isLoading).toBe(false);
    });

    test('has null error', () => {
      expect(store.error).toBeNull();
    });

    test('has null result', () => {
      expect(store.result).toBeNull();
    });
  });

  describe('selectPrompt', () => {
    test('sets selected prompt ID', () => {
      store.selectPrompt('pr-standard');
      expect(store.selectedPromptId).toBe('pr-standard');
    });

    test('clears error when selecting prompt', () => {
      // First trigger an error by trying to create PR without prompt selected
      void store.createPR('ctx-test', {
        promptTemplateId: 'test',
        baseBranch: 'main',
      });
      expect(store.error).toBe('No prompt template selected');

      // Then select prompt and verify error is cleared
      store.selectPrompt('pr-standard');
      expect(store.error).toBeNull();
    });

    test('can change selected prompt', () => {
      store.selectPrompt('pr-standard');
      store.selectPrompt('pr-detailed');
      expect(store.selectedPromptId).toBe('pr-detailed');
    });
  });

  describe('selectBaseBranch', () => {
    test('sets selected base branch', () => {
      store.selectBaseBranch('develop');
      expect(store.baseBranch).toBe('develop');
    });

    test('clears error when selecting base branch', () => {
      // First trigger an error
      void store.createPR('ctx-test', {
        promptTemplateId: 'test',
        baseBranch: 'main',
      });
      expect(store.error).toBe('No prompt template selected');

      // Then select base branch and verify error is cleared
      store.selectBaseBranch('develop');
      expect(store.error).toBeNull();
    });

    test('can change base branch', () => {
      store.selectBaseBranch('develop');
      store.selectBaseBranch('staging');
      expect(store.baseBranch).toBe('staging');
    });
  });

  describe('setCustomVariable', () => {
    test('sets custom variable', () => {
      store.setCustomVariable('key1', 'value1');
      expect(store.customVariables).toEqual({ key1: 'value1' });
    });

    test('can set multiple variables', () => {
      store.setCustomVariable('key1', 'value1');
      store.setCustomVariable('key2', 'value2');
      expect(store.customVariables).toEqual({
        key1: 'value1',
        key2: 'value2',
      });
    });

    test('overwrites existing variable', () => {
      store.setCustomVariable('key1', 'value1');
      store.setCustomVariable('key1', 'value2');
      expect(store.customVariables).toEqual({ key1: 'value2' });
    });

    test('preserves other variables when setting new one', () => {
      store.setCustomVariable('key1', 'value1');
      store.setCustomVariable('key2', 'value2');
      store.setCustomVariable('key3', 'value3');
      expect(store.customVariables).toEqual({
        key1: 'value1',
        key2: 'value2',
        key3: 'value3',
      });
    });
  });

  describe('clearCustomVariable', () => {
    test('removes custom variable', () => {
      store.setCustomVariable('key1', 'value1');
      store.clearCustomVariable('key1');
      expect(store.customVariables).toEqual({});
    });

    test('preserves other variables when clearing one', () => {
      store.setCustomVariable('key1', 'value1');
      store.setCustomVariable('key2', 'value2');
      store.clearCustomVariable('key1');
      expect(store.customVariables).toEqual({ key2: 'value2' });
    });

    test('handles clearing non-existent variable', () => {
      store.setCustomVariable('key1', 'value1');
      store.clearCustomVariable('key2');
      expect(store.customVariables).toEqual({ key1: 'value1' });
    });

    test('handles clearing from empty variables', () => {
      store.clearCustomVariable('key1');
      expect(store.customVariables).toEqual({});
    });
  });

  describe('clearError', () => {
    test('clears error message', () => {
      // Trigger an error
      void store.createPR('ctx-test', {
        promptTemplateId: 'test',
        baseBranch: 'main',
      });
      expect(store.error).toBe('No prompt template selected');

      // Clear error
      store.clearError();
      expect(store.error).toBeNull();
    });

    test('does nothing if no error exists', () => {
      store.clearError();
      expect(store.error).toBeNull();
    });
  });

  describe('reset', () => {
    test('resets all state to initial values', () => {
      // Modify state
      store.selectPrompt('pr-standard');
      store.selectBaseBranch('develop');
      store.setCustomVariable('key1', 'value1');

      // Reset
      store.reset();

      // Verify all state is reset
      expect(store.currentPRStatus).toBeNull();
      expect(store.selectedPromptId).toBeNull();
      expect(store.baseBranch).toBe('main');
      expect(store.customVariables).toEqual({});
      expect(store.isLoading).toBe(false);
      expect(store.error).toBeNull();
      expect(store.result).toBeNull();
    });
  });

  describe('createPR validation', () => {
    test('fails if no prompt selected', async () => {
      await store.createPR('ctx-test', {
        promptTemplateId: 'test',
        baseBranch: 'main',
      });

      expect(store.error).toBe('No prompt template selected');
      expect(store.isLoading).toBe(false);
    });

    test('fails if PR status not loaded', async () => {
      store.selectPrompt('pr-standard');

      await store.createPR('ctx-test', {
        promptTemplateId: 'pr-standard',
        baseBranch: 'main',
      });

      expect(store.error).toBe('PR status not loaded');
      expect(store.isLoading).toBe(false);
    });
  });

  describe('updatePR validation', () => {
    test('fails if no prompt selected', async () => {
      await store.updatePR('ctx-test', 123, {
        promptTemplateId: 'test',
        baseBranch: 'main',
      });

      expect(store.error).toBe('No prompt template selected');
      expect(store.isLoading).toBe(false);
    });

    test('fails if no existing PR', async () => {
      store.selectPrompt('pr-standard');

      await store.updatePR('ctx-test', 123, {
        promptTemplateId: 'pr-standard',
        baseBranch: 'main',
      });

      expect(store.error).toBe('No existing PR to update');
      expect(store.isLoading).toBe(false);
    });
  });

  describe('state immutability', () => {
    test('selectPrompt does not mutate state', () => {
      const initialPrompt = store.selectedPromptId;
      store.selectPrompt('pr-standard');
      // State should have changed
      expect(store.selectedPromptId).not.toBe(initialPrompt);
    });

    test('setCustomVariable does not mutate state', () => {
      const initialVars = store.customVariables;
      store.setCustomVariable('key1', 'value1');
      // New object reference
      expect(store.customVariables).not.toBe(initialVars);
      // But original is unchanged
      expect(initialVars).toEqual({});
    });

    test('clearCustomVariable creates new object', () => {
      store.setCustomVariable('key1', 'value1');
      const varsAfterSet = store.customVariables;
      store.clearCustomVariable('key1');
      const varsAfterClear = store.customVariables;
      // Different object references
      expect(varsAfterClear).not.toBe(varsAfterSet);
    });
  });

  describe('error handling', () => {
    test('createPR checks if PR can be created from status', () => {
      // This test verifies the validation logic
      store.selectPrompt('pr-standard');

      // Without loading status, createPR should fail
      void store.createPR('ctx-test', {
        promptTemplateId: 'pr-standard',
        baseBranch: 'main',
      });

      expect(store.error).toBe('PR status not loaded');
    });
  });

  describe('complex workflows', () => {
    test('can configure PR creation request', () => {
      store.selectPrompt('pr-standard');
      store.selectBaseBranch('develop');
      store.setCustomVariable('ticket', 'JIRA-123');
      store.setCustomVariable('reviewer', 'alice');

      expect(store.selectedPromptId).toBe('pr-standard');
      expect(store.baseBranch).toBe('develop');
      expect(store.customVariables).toEqual({
        ticket: 'JIRA-123',
        reviewer: 'alice',
      });
    });

    test('can modify configuration before creating PR', () => {
      store.selectPrompt('pr-standard');
      store.selectBaseBranch('develop');
      store.setCustomVariable('ticket', 'JIRA-123');

      // Change mind about base branch
      store.selectBaseBranch('staging');

      // Update variable
      store.setCustomVariable('ticket', 'JIRA-456');

      expect(store.baseBranch).toBe('staging');
      expect(store.customVariables).toEqual({ ticket: 'JIRA-456' });
    });

    test('can reset and reconfigure', () => {
      store.selectPrompt('pr-standard');
      store.selectBaseBranch('develop');
      store.setCustomVariable('ticket', 'JIRA-123');

      store.reset();

      store.selectPrompt('pr-detailed');
      store.selectBaseBranch('main');
      store.setCustomVariable('priority', 'high');

      expect(store.selectedPromptId).toBe('pr-detailed');
      expect(store.baseBranch).toBe('main');
      expect(store.customVariables).toEqual({ priority: 'high' });
    });
  });

  describe('edge cases', () => {
    test('handles empty string values in custom variables', () => {
      store.setCustomVariable('key1', '');
      expect(store.customVariables).toEqual({ key1: '' });
    });

    test('handles special characters in custom variable keys', () => {
      store.setCustomVariable('key-with-dash', 'value');
      store.setCustomVariable('key_with_underscore', 'value');
      store.setCustomVariable('key.with.dot', 'value');
      expect(store.customVariables).toEqual({
        'key-with-dash': 'value',
        'key_with_underscore': 'value',
        'key.with.dot': 'value',
      });
    });

    test('handles special characters in custom variable values', () => {
      store.setCustomVariable('key1', 'value with spaces');
      store.setCustomVariable('key2', 'value-with-dashes');
      store.setCustomVariable('key3', 'value/with/slashes');
      expect(store.customVariables).toEqual({
        key1: 'value with spaces',
        key2: 'value-with-dashes',
        key3: 'value/with/slashes',
      });
    });
  });
});
