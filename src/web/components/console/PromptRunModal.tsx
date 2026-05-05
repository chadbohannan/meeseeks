import { useEffect, useRef } from 'react';
import { useRuntimesStore } from '../../store/runtimes.js';
import { usePromptsStore } from '../../store/prompts.js';
import { useTerminateRuntime } from '../../hooks/queries.js';
import { RuntimeStatusDot } from '../RuntimeStatusDot.js';

export function PromptRunModals() {
  const runtimes = useRuntimesStore((s) => s.byId);
  const modalOpen = usePromptsStore((s) => s.modalOpen);
  return (
    <>
      {Object.values(runtimes)
        .filter(r => r.kind === 'prompt' && modalOpen[r.runtimeId])
        .map(r => (<PromptRunModal key={r.runtimeId} runtimeId={r.runtimeId} />))}
    </>
  );
}

function PromptRunModal({ runtimeId }: { runtimeId: string }) {
  const runtime = useRuntimesStore((s) => s.byId[runtimeId]);
  const output = usePromptsStore((s) => s.outputs[runtimeId] ?? '');
  const closeModal = usePromptsStore((s) => s.closeModal);
  const term = useTerminateRuntime();
  const preRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [output]);

  if (!runtime || runtime.kind !== 'prompt') return null;
  const inactive = runtime.status === 'exited' || runtime.status === 'errored' || runtime.status === 'terminating';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => closeModal(runtimeId)}>
      <div className="flex flex-col w-[720px] max-w-[90vw] h-[520px] max-h-[85vh] rounded-lg border border-slate-700 bg-slate-900 shadow-2xl"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between bg-slate-800 px-3 py-2 rounded-t-lg">
          <div className="flex items-center gap-2">
            <RuntimeStatusDot status={runtime.status} />
            <span className="font-mono text-xs">{runtime.promptRef?.name}</span>
            {runtime.errorMessage && <span className="text-xs text-red-400">{runtime.errorMessage}</span>}
          </div>
          <div className="flex items-center gap-2">
            {!inactive && (
              <button
                className="rounded bg-red-700 px-3 py-1 text-xs hover:bg-red-600"
                onClick={() => term.mutate(runtimeId)}
              >Stop</button>
            )}
            <button
              className="text-xs text-slate-300 hover:text-white"
              onClick={() => closeModal(runtimeId)}
            >Close</button>
          </div>
        </div>
        <pre
          ref={preRef}
          className="flex-1 min-h-0 overflow-auto whitespace-pre-wrap break-words p-4 text-xs text-slate-200 font-mono"
        >{output || (inactive ? '(no output)' : 'Starting…')}</pre>
      </div>
    </div>
  );
}
