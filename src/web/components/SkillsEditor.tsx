import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useSkillFiles, useSkillFile, useCreateSkillFile, usePatchSkillFile, useDeleteSkillFile } from '../hooks/queries.js';
import { MarkdownEditor } from './MarkdownEditor.js';

const SKILL_TEMPLATE = `---
name: New Skill
description: Brief description of this skill
---

# Skill Content

Write your skill documentation here in Markdown.
`;

interface SkillsEditorProps {
  boardId: string;
}

interface SkillMeta {
  name: string;
  description: string;
}

function parseSkillMeta(content: string): SkillMeta {
  const match = /^---\s*\nname:\s*(.+?)\s*\ndescription:\s*(.+?)\s*\n---/m.exec(content);
  return match
    ? { name: match[1], description: match[2] }
    : { name: 'Untitled', description: 'No description' };
}

function splitFrontmatter(content: string): { frontmatter: string; body: string } {
  const match = /^(---\s*\n[\s\S]*?\n---)\s*\n?/.exec(content);
  if (!match) return { frontmatter: '', body: content };
  return { frontmatter: match[1], body: content.slice(match[0].length) };
}

function reassemble(frontmatter: string, body: string): string {
  if (!frontmatter) return body;
  return frontmatter + '\n\n' + body;
}

export function SkillsEditor({ boardId }: SkillsEditorProps) {
  const { data: fileList, isLoading, error } = useSkillFiles(boardId);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [fileNameError, setFileNameError] = useState<string | null>(null);
  const createMutation = useCreateSkillFile(boardId);

  const handleCreateClick = () => {
    setIsCreating(true);
    setNewFileName('');
    setFileNameError(null);
  };

  const validateFileName = (name: string): string | null => {
    if (!name.trim()) return 'Filename cannot be empty';
    if (!/^[a-z0-9-]+$/.test(name)) {
      return 'Filename must contain only lowercase letters, numbers, and hyphens';
    }
    if (fileList?.files?.some(f => f.name === `${name}.md`)) {
      return 'A skill with this filename already exists';
    }
    return null;
  };

  const handleCreateSubmit = async () => {
    const error = validateFileName(newFileName);
    if (error) {
      setFileNameError(error);
      return;
    }

    try {
      await createMutation.mutateAsync({ filename: `${newFileName}.md`, content: SKILL_TEMPLATE });
      setSelectedFile(`${newFileName}.md`);
      setIsCreating(false);
      setNewFileName('');
      toast.success('Skill created');
    } catch (err) {
      toast.error(`Failed to create skill: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleCreateCancel = () => {
    setIsCreating(false);
    setNewFileName('');
    setFileNameError(null);
  };

  if (isLoading) {
    return <div className="p-4 text-slate-400">Loading skills...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-400">Error loading skills: {(error as Error).message}</div>;
  }

  const files = (fileList?.files || []).map(f => f.name);

  return (
    <div className="flex h-full bg-slate-900">
      {/* Left Panel - File List */}
      <div className="w-64 border-r border-slate-700 flex flex-col">
        <div className="p-4 border-b border-slate-700">
          <button
            onClick={handleCreateClick}
            disabled={isCreating}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded transition-colors"
          >
            + New Skill
          </button>
        </div>

        {isCreating && (
          <div className="p-4 border-b border-slate-700 bg-slate-800">
            <input
              type="text"
              value={newFileName}
              onChange={(e) => {
                setNewFileName(e.target.value);
                setFileNameError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !createMutation.isPending) handleCreateSubmit();
                if (e.key === 'Escape') handleCreateCancel();
              }}
              placeholder="skill-name"
              className="w-full px-2 py-1 mb-2 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
              autoFocus
            />
            {fileNameError && (
              <div className="text-xs text-red-400 mb-2">{fileNameError}</div>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleCreateSubmit}
                disabled={createMutation.isPending}
                className="flex-1 px-2 py-1 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm rounded"
              >
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </button>
              <button
                onClick={handleCreateCancel}
                className="flex-1 px-2 py-1 bg-slate-600 hover:bg-slate-700 text-white text-sm rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {files.length === 0 && !isCreating && (
            <div className="p-4 text-sm text-slate-500">
              No skills yet. Click &quot;+ New Skill&quot; to create one.
            </div>
          )}
          {files.map(filename => (
            <FileListItem
              key={filename}
              filename={filename}
              boardId={boardId}
              isSelected={selectedFile === filename}
              onClick={() => setSelectedFile(filename)}
            />
          ))}
        </div>
      </div>

      {/* Right Panel - Editor */}
      <div className="flex-1 overflow-hidden">
        {selectedFile ? (
          <FileEditor
            boardId={boardId}
            filename={selectedFile}
            onDeleted={() => setSelectedFile(null)}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-slate-500">
            Select a skill to edit or create a new one
          </div>
        )}
      </div>
    </div>
  );
}

interface FileListItemProps {
  filename: string;
  boardId: string;
  isSelected: boolean;
  onClick: () => void;
}

function FileListItem({ filename, boardId, isSelected, onClick }: FileListItemProps) {
  const { data } = useSkillFile(boardId, filename);
  const content = data?.content;
  const meta = content ? parseSkillMeta(content) : { name: filename, description: '' };

  return (
    <button
      onClick={onClick}
      aria-label={`Edit ${meta.name}`}
      className={`w-full px-4 py-2 text-left text-sm transition-colors ${
        isSelected
          ? 'bg-blue-600 text-white'
          : 'text-slate-300 hover:bg-slate-800'
      }`}
    >
      <div className="font-medium">{meta.name}</div>
      <div className="text-xs opacity-75 truncate">{filename}</div>
    </button>
  );
}

interface FileEditorProps {
  boardId: string;
  filename: string;
  onDeleted: () => void;
}

function FileEditor({ boardId, filename, onDeleted }: FileEditorProps) {
  const { data, isLoading } = useSkillFile(boardId, filename);
  const content = data?.content;
  const patchMutation = usePatchSkillFile(boardId, filename);
  const deleteMutation = useDeleteSkillFile(boardId);
  const [frontmatter, setFrontmatter] = useState('');
  const [body, setBody] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (content && !dirty) {
      const split = splitFrontmatter(content);
      setFrontmatter(split.frontmatter);
      setBody(split.body);
    }
  }, [content, dirty]);

  const handleSave = async () => {
    try {
      await patchMutation.mutateAsync({ content: reassemble(frontmatter, body) });
      setDirty(false);
      toast.success('Skill saved');
    } catch (err) {
      toast.error(`Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete ${filename}?`)) return;
    try {
      await deleteMutation.mutateAsync(filename);
      onDeleted();
      toast.success('Skill deleted');
    } catch (err) {
      toast.error(`Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  if (isLoading) {
    return <div className="p-6 text-slate-400">Loading...</div>;
  }

  if (!content) {
    return <div className="p-6 text-red-400">Failed to load file</div>;
  }

  const meta = parseSkillMeta(reassemble(frontmatter, body) || content);

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">{meta.name}</h3>
          <p className="text-sm text-slate-400">{meta.description}</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={handleSave}
              disabled={patchMutation.isPending}
              className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm rounded transition-colors"
            >
              {patchMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="px-3 py-1 bg-red-600 hover:bg-red-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm rounded transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <MarkdownEditor
          value={body}
          onChange={(md) => { setBody(md); setDirty(true); }}
          className="bg-slate-800 border border-slate-700 rounded"
          placeholder="Write skill content…"
        />
      </div>
    </div>
  );
}
