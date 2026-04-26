export type StorageErrorCode =
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_INPUT'
  | 'PATH_UNSAFE'
  | 'INVALID_LANE'
  | 'PROJECT_NOT_OPEN';

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  constructor(code: StorageErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends StorageError {
  constructor(message: string) { super('NOT_FOUND', message); }
}

export class ConflictError extends StorageError {
  constructor(message: string) { super('CONFLICT', message); }
}

export class InvalidInputError extends StorageError {
  constructor(message: string) { super('INVALID_INPUT', message); }
}

export class PathSafetyError extends StorageError {
  constructor(message: string) { super('PATH_UNSAFE', message); }
}

export class InvalidLaneError extends StorageError {
  readonly reason: string;
  constructor(message: string, reason: string) {
    super('INVALID_LANE', message);
    this.reason = reason;
  }
}

export class ProjectNotOpenError extends StorageError {
  constructor() { super('PROJECT_NOT_OPEN', 'no project is currently open'); }
}
