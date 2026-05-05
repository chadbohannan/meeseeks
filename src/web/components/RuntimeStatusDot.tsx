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
  if (status === 'running') {
    return (
      <svg
        title="running"
        viewBox="0 0 14 6"
        className={`inline-block h-3 w-4 ${className}`}
        aria-label="running"
      >
        <circle cx="2" cy="3" r="1.8" fill="#ffffff">
          <animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite" />
        </circle>
        <circle cx="7" cy="3" r="1.8" fill="#ffffff">
          <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite" />
        </circle>
        <circle cx="12" cy="3" r="1.8" fill="#ffffff">
          <animate attributeName="opacity" values="1;0.3;1" dur="1.9s" repeatCount="indefinite" />
        </circle>
      </svg>
    );
  }
  if (status === 'awaiting-user' || status === 'idle') {
    return (
      <svg
        title={status}
        viewBox="0 0 10 9"
        className={`inline-block h-3 w-3 animate-pulse ${className}`}
        aria-label={status}
      >
        <polygon
          points="5,8.5 0.5,0.5 9.5,0.5"
          fill="none"
          stroke={status === 'idle' ? '#3b82f6' : '#f59e0b'}
          strokeWidth="2"
        />
      </svg>
    );
  }
  if (status === 'exited') {
    return (
      <span
        title="exited"
        className={`inline-block h-3.5 w-3.5 bg-gray-500 ${className}`}
      />
    );
  }
  return (
    <span
      title={status}
      className={`inline-block h-2 w-2 rounded-full ${COLORS[status] ?? 'bg-gray-400'} ${className}`}
    />
  );
}
