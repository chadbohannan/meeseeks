import type { RuntimeStatus } from '@shared/runtime.js';

const COLORS: Record<Exclude<RuntimeStatus, 'awaiting-user'>, string> = {
  starting: 'bg-yellow-500',
  running: 'bg-green-500 animate-pulse',
  idle: 'bg-blue-500',
  terminating: 'bg-orange-500',
  exited: 'bg-gray-500',
  errored: 'bg-red-600',
};

export function RuntimeStatusDot({ status, className = '' }: { status: RuntimeStatus; className?: string }) {
  if (status === 'awaiting-user') {
    return (
      <svg
        title="awaiting-user"
        viewBox="0 0 10 9"
        className={`inline-block h-3 w-3 animate-pulse ${className}`}
        aria-label="awaiting-user"
      >
        <polygon points="5,8.5 0.5,0.5 9.5,0.5" fill="none" stroke="#f59e0b" strokeWidth="1.2" />
      </svg>
    );
  }
  return (
    <span
      title={status}
      className={`inline-block h-2 w-2 rounded-full ${COLORS[status] ?? 'bg-gray-400'} ${className}`}
    />
  );
}
