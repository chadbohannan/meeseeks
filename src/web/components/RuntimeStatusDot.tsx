import type { RuntimeStatus } from '@shared/runtime.js';

const COLORS: Record<RuntimeStatus, string> = {
  starting: 'bg-yellow-500',
  running: 'bg-green-500 animate-pulse',
  idle: 'bg-blue-500',
  terminating: 'bg-orange-500',
  exited: 'bg-gray-500',
  errored: 'bg-red-600',
};

export function RuntimeStatusDot({ status, className = '' }: { status: RuntimeStatus; className?: string }) {
  return (
    <span
      title={status}
      className={`inline-block h-2 w-2 rounded-full ${COLORS[status]} ${className}`}
    />
  );
}
