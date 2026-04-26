import { describe, it, expect } from 'vitest';
import {
  StorageError,
  NotFoundError,
  ConflictError,
  InvalidInputError,
  PathSafetyError,
  InvalidLaneError,
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

  it('InvalidLaneError has code INVALID_LANE and a reason', () => {
    const e = new InvalidLaneError('bad lane', 'missing lane.yaml');
    expect(e.code).toBe('INVALID_LANE');
    expect(e.reason).toBe('missing lane.yaml');
  });
});
