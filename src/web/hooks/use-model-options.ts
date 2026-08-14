import { useEffect, useMemo, useRef, useState } from 'react';
import { useModels } from './queries.js';
import { buildModelOptions, isListed, nextModel } from '../lib/model-options.js';
import type { ModelOption } from '@shared/types.js';

/** Distinguishes "never seeded" from "seeded from a workflow with no runtime". */
const UNSEEDED = Symbol('unseeded');

export interface ModelSelection {
  options: ModelOption[];
  model: string;
  setModel: (value: string) => void;
  /** True when the selection is a value the workspace does not offer. */
  unlisted: boolean;
}

/**
 * The model picker's state, seeded from a workflow's runtime default.
 *
 * Before this existed the picker always initialised to the first model in the
 * workspace list and always sent it, so `runtime.model` was shadowed on every
 * spawn from the UI — which is how a workflow pinned to a model that no longer
 * exists went unnoticed for months. Seeding here makes the field mean what both
 * call sites already claim it means: the workflow editor labels it "Default
 * model for tickets in this workflow", and the prompts editor's workflow picker
 * promises the run adopts that workflow's runtime.
 *
 * `ready` gates seeding until the caller's default has settled, so an
 * asynchronously-resolved default is not lost to the fallback.
 */
export function useModelOptions(defaultModel: string | undefined, ready: boolean): ModelSelection {
  const { data } = useModels();
  const models = useMemo(() => data?.models ?? [], [data]);
  const [model, setModel] = useState('');

  const options = useMemo(() => buildModelOptions(models, defaultModel), [models, defaultModel]);

  const seededFor = useRef<string | undefined | typeof UNSEEDED>(UNSEEDED);
  useEffect(() => {
    const seed = ready && seededFor.current !== defaultModel;
    const next = nextModel({ options, current: model, defaultModel, seed });
    if (seed) seededFor.current = defaultModel;
    if (next !== model) setModel(next);
  }, [ready, options, defaultModel, model]);

  return {
    options,
    model,
    setModel,
    unlisted: model !== '' && !isListed(models, model),
  };
}
