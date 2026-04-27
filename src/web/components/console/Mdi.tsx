import { useMdiStore } from '../../store/mdi.js';
import { Panel } from './Panel.js';

export function Mdi() {
  const panels = useMdiStore((s) => s.panels);
  return (
    <>
      {Object.keys(panels).map((id) => (<Panel key={id} runtimeId={id} />))}
    </>
  );
}
