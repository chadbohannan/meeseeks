import { describe, it, expect } from 'vitest';
import {
  buildModelOptions, nextModel, isListed, UNLISTED_LABEL_SUFFIX,
} from '../../src/web/lib/model-options.js';
import type { ModelOption } from '../../src/shared/types.js';

const MODELS: ModelOption[] = [
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' },
];

describe('buildModelOptions', () => {
  it('returns the workspace list unchanged when there is no default', () => {
    expect(buildModelOptions(MODELS, undefined)).toBe(MODELS);
  });

  it('returns the workspace list unchanged when the default is already listed', () => {
    expect(buildModelOptions(MODELS, 'sonnet')).toBe(MODELS);
  });

  it('appends and labels a default the workspace does not offer', () => {
    // The case that motivated this: a workflow pinned to a model that no
    // longer exists must be visible, not silently swapped for the first entry.
    const options = buildModelOptions(MODELS, 'claude-opus-4-7');
    expect(options).toHaveLength(4);
    expect(options[3]).toEqual({
      value: 'claude-opus-4-7',
      label: `claude-opus-4-7${UNLISTED_LABEL_SUFFIX}`,
    });
    expect(isListed(MODELS, 'claude-opus-4-7')).toBe(false);
  });
});

describe('nextModel', () => {
  it('seeds from the workflow default rather than the first model', () => {
    expect(nextModel({
      options: MODELS, current: 'opus', defaultModel: 'haiku', seed: true,
    })).toBe('haiku');
  });

  it('seeds an unlisted default once it has been added to the options', () => {
    const options = buildModelOptions(MODELS, 'claude-opus-4-7');
    expect(nextModel({
      options, current: 'opus', defaultModel: 'claude-opus-4-7', seed: true,
    })).toBe('claude-opus-4-7');
  });

  it('falls back to the first model when there is no default to seed from', () => {
    expect(nextModel({
      options: MODELS, current: '', defaultModel: undefined, seed: true,
    })).toBe('opus');
  });

  it('leaves a user choice alone once seeding has happened', () => {
    // The default is a starting point, not a lock — the per-run picker still
    // overrides it, which is the behavior the workflow editor advertises.
    expect(nextModel({
      options: MODELS, current: 'sonnet', defaultModel: 'haiku', seed: false,
    })).toBe('sonnet');
  });

  it('replaces a selection the workspace no longer offers', () => {
    expect(nextModel({
      options: MODELS, current: 'retired-model', defaultModel: 'haiku', seed: false,
    })).toBe('opus');
  });

  it('holds the current value when no models have loaded yet', () => {
    expect(nextModel({ options: [], current: '', defaultModel: 'haiku', seed: true })).toBe('');
  });

  it('seeding wins over the not-offered fallback in the same pass', () => {
    // These two rules live in one function precisely because they race: run as
    // separate effects, the fallback reads the pre-seed `current` and
    // overwrites the value the seed just chose.
    const options = buildModelOptions(MODELS, 'claude-opus-4-7');
    expect(nextModel({
      options, current: '', defaultModel: 'claude-opus-4-7', seed: true,
    })).toBe('claude-opus-4-7');
  });
});

describe('the sequence a ticket view actually goes through', () => {
  it('lands on the workflow default after the workflow query resolves', () => {
    // 1. Models load; the workflow query has not resolved, so nothing is seeded.
    let options = buildModelOptions(MODELS, undefined);
    let model = nextModel({ options, current: '', defaultModel: undefined, seed: false });
    expect(model).toBe('opus');

    // 2. The workflow resolves with a pinned model. Seeding is keyed on the
    //    default changing, so this applies even though 'opus' was already valid.
    options = buildModelOptions(MODELS, 'claude-opus-4-7');
    model = nextModel({ options, current: model, defaultModel: 'claude-opus-4-7', seed: true });
    expect(model).toBe('claude-opus-4-7');

    // 3. Steady state: no further changes.
    expect(nextModel({
      options, current: model, defaultModel: 'claude-opus-4-7', seed: false,
    })).toBe(model);
  });

  it('follows the workflow when the prompts editor switches to another one', () => {
    const options = buildModelOptions(MODELS, 'haiku');
    expect(nextModel({
      options, current: 'opus', defaultModel: 'haiku', seed: true,
    })).toBe('haiku');
  });
});
