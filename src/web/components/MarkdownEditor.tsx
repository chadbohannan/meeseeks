import { useRef, useEffect, useCallback } from 'react';
import { Crepe, CrepeFeature } from '@milkdown/crepe';
import { replaceAll } from '@milkdown/kit/utils';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/nord-dark.css';

interface MarkdownEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  className?: string;
  placeholder?: string;
}

export function MarkdownEditor({ value, onChange, className = '', placeholder }: MarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const readyRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const suppressRef = useRef(false);
  const lastEmittedRef = useRef(value);

  onChangeRef.current = onChange;
  valueRef.current = value;

  const initEditor = useCallback(async () => {
    const el = containerRef.current;
    if (!el || crepeRef.current) return;

    const crepe = new Crepe({
      root: el,
      defaultValue: valueRef.current,
      features: {
        [CrepeFeature.Latex]: false,
        [CrepeFeature.ImageBlock]: false,
        [CrepeFeature.BlockEdit]: false,
        [CrepeFeature.Toolbar]: true,
        [CrepeFeature.LinkTooltip]: true,
        [CrepeFeature.TopBar]: false,
      },
      featureConfigs: {
        [CrepeFeature.Placeholder]: { text: placeholder ?? 'Start writing…' },
      },
    });

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown, prevMarkdown) => {
        if (markdown !== prevMarkdown && !suppressRef.current) {
          lastEmittedRef.current = markdown;
          onChangeRef.current(markdown);
        }
      });
    });

    crepeRef.current = crepe;
    await crepe.create();
    readyRef.current = true;
  }, [placeholder]);

  useEffect(() => {
    initEditor();
    return () => {
      readyRef.current = false;
      crepeRef.current?.destroy();
      crepeRef.current = null;
    };
  }, [initEditor]);

  useEffect(() => {
    const crepe = crepeRef.current;
    if (!crepe || !readyRef.current) return;
    // Skip echo: if value came from the editor itself, the editor already has this state.
    // Calling replaceAll would reset cursor position and cause focus jitter.
    if (value === lastEmittedRef.current) return;
    const current = crepe.getMarkdown();
    if (value !== current) {
      suppressRef.current = true;
      crepe.editor.action(replaceAll(value));
      suppressRef.current = false;
      lastEmittedRef.current = value;
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className={`milkdown-editor-wrapper ${className}`}
    />
  );
}
