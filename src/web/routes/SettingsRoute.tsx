import { useSearchParams } from 'react-router-dom';
import { SkillsEditor } from '../components/SkillsEditor.js';
import { BinEditor } from '../components/BinEditor.js';
import { PromptsEditor } from '../components/PromptsEditor.js';
import { SectionNav, type SectionItem } from '../components/SectionNav.js';

type Section = 'prompts' | 'skills' | 'bin';

/**
 * Workspace-level configuration. These files live at the workspace root and are
 * shared by every workflow, which is why they have their own route rather than
 * appearing inside a workflow's editor: reaching them should not depend on
 * having picked a workflow, and a fresh workspace has none to pick.
 */
const SECTIONS: ReadonlyArray<SectionItem<Section>> = [
  { key: 'prompts', label: 'Prompts' },
  { key: 'skills', label: '.claude/skills' },
  { key: 'bin', label: '.claude/bin' },
];

export function SettingsRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const section = (searchParams.get('section') as Section | null) ?? 'prompts';

  return (
    <div className="flex h-full">
      <div className="w-52 border-r border-slate-700 flex flex-col shrink-0">
        <SectionNav
          heading="Workspace"
          items={SECTIONS}
          active={section}
          onSelect={(k) => setSearchParams({ section: k })}
        />
        <p className="px-4 py-3 text-[11px] text-slate-500 leading-relaxed">
          Shared by every workflow. The agent&apos;s working directory is the
          workspace root, so one <code>.claude/</code> serves them all.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {section === 'skills' ? <SkillsEditor />
          : section === 'bin' ? <BinEditor />
          : <PromptsEditor />}
      </div>
    </div>
  );
}
