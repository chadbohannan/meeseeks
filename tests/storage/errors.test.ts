import { describe, it, expect } from 'vitest';
import {
  StorageError,
  NotFoundError,
  ConflictError,
  InvalidInputError,
  PathSafetyError,
  InvalidWorkflowError,
} from '../../src/storage/errors.js';

describe('storage errors', () => {
  it('NotFoundError has code NOT_FOUND', () => {
    const e = new NotFoundError('thing missing');
    expect(e).toBeInstanceOf(StorageError);
    expect(e.code).toBe('NOT_FOUND');
    expect(e.message).toBe('thing missing');
  });

  it('ConflictError has code CONFLICT', () => {
    expect(new ConflictError('x').code).toBe('CONFLICT');
  });

  it('InvalidInputError has code INVALID_INPUT', () => {
    expect(new InvalidInputError('x').code).toBe('INVALID_INPUT');
  });

  it('PathSafetyError has code PATH_UNSAFE', () => {
    expect(new PathSafetyError('x').code).toBe('PATH_UNSAFE');
  });

  it('InvalidWorkflowError has code INVALID_WORKFLOW and a reason', () => {
    const e = new InvalidWorkflowError('bad workflow', 'missing workflow.yaml');
    expect(e.code).toBe('INVALID_WORKFLOW');
    expect(e.reason).toBe('missing workflow.yaml');
  });
});
