// Imported relatively rather than through the `@shared/*` alias so the server
// tsconfig — which does not define that path — can pull this module into
// `tests/`. The selection rules below are pure on purpose: they are the part
// worth testing, and the repository has no DOM test harness.
import type { ModelOption } from '../../shared/types.js';

/**
 * Marks a model the workspace does not offer. A workflow may legitimately pin
 * a value outside the list — a gateway-specific id, say — so an unlisted value
 * is shown and labelled rather than silently replaced with a listed one.
 */
export const UNLISTED_LABEL_SUFFIX = ' — not in workspace models';

export function isListed(models: ModelOption[], value: string): boolean {
  return models.some(m => m.value === value);
}

/**
 * The workspace's models, plus `defaultModel` when it is not among them.
 *
 * Appending rather than dropping is what makes a stale pin visible: a workflow
 * pinned to a model that no longer exists shows that model, labelled, instead
 * of quietly resolving to whatever happens to be first in the list.
 */
export function buildModelOptions(
  models: ModelOption[],
  defaultModel?: string,
): ModelOption[] {
  if (!defaultModel || isListed(models, defaultModel)) return models;
  return [...models, { value: defaultModel, label: `${defaultModel}${UNLISTED_LABEL_SUFFIX}` }];
}

export interface NextModelInput {
  options: ModelOption[];
  /** The value currently selected. */
  current: string;
  /** The workflow's resolved runtime model, if it has one. */
  defaultModel?: string;
  /**
   * True when `defaultModel` has settled and has not yet been applied. Seeding
   * is keyed on the default *changing* rather than on first mount: the workflow
   * query resolves after the models list does, and in the prompts editor the
   * user can switch workflows mid-session.
   */
  seed: boolean;
}

/**
 * The value that should be selected, or `current` when nothing needs to change.
 *
 * Seeding and the not-offered fallback are one function rather than two effects
 * because they race: run separately against the same render, the fallback reads
 * a `current` that the seed has already superseded and overwrites it.
 */
export function nextModel({ options, current, defaultModel, seed }: NextModelInput): string {
  if (options.length === 0) return current;
  const first = options[0]!.value;
  if (seed) {
    return defaultModel && isListed(options, defaultModel) ? defaultModel : first;
  }
  return isListed(options, current) ? current : first;
}
