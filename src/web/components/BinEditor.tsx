import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useBinFiles, useBinFile, useCreateBinFile, usePatchBinFile, useDeleteBinFile } from '../hooks/queries.js';

const BIN_TEMPLATE = `#!/usr/bin/env bash
set -euo pipefail

`;

interface BinEditorProps {
  boardId: string;
}

export function BinEditor({ boardId }: BinEditorProps) {
  const { data: fileList, isLoading, error } = useBinFiles(boardId);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [fileNameError, setFileNameError] = useState<string | null>(null);
  const createMutation = useCreateBinFile(boardId);

  const handleCreateClick = () => {
    setIsCreating(true);
    setNewFileName('');
    setFileNameError(null);
  };

  const validateFileName = (name: string): string | null => {
    if (!name.trim()) return 'Filename cannot be empty';
    if (!/^[a-z0-9._-]+$/.test(name)) {
      return 'Filename must contain only lowercase letters, numbers, dots, underscores, and hyphens';
    }
    if (fileList?.files?.some(f => f.name === name)) {
      return 'A file with this name already exists';
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
      await createMutation.mutateAsync({ filename: newFileName, content: BIN_TEMPLATE });
      setSelectedFile(newFileName);
      setIsCreating(false);
      setNewFileName('');
      toast.success('Script created');
    } catch (err) {
      toast.error(`Failed to create script: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleCreateCancel = () => {
    setIsCreating(false);
    setNewFileName('');
    setFileNameError(null);
  };

  if (isLoading) {
    return <div className="p-4 text-slate-400">Loading scripts...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-400">Error loading scripts: {(error as Error).message}</div>;
  }

  const files = (fileList?.files || []).map(f => f.name);

  return (
    <div className="flex h-full bg-slate-900">
      <div className="w-44 border-r border-slate-700 flex flex-col">
        <div className="p-4 border-b border-slate-700">
          <button
            onClick={handleCreateClick}
            disabled={isCreating}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded transition-colors"
          >
            + New Script
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
              placeholder="script-name.sh"
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
              No scripts yet. Click &quot;+ New Script&quot; to create one.
            </div>
          )}
          {files.map(filename => (
            <button
              key={filename}
              onClick={() => setSelectedFile(filename)}
              aria-label={`Edit ${filename}`}
              className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                selectedFile === filename
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <div className="font-medium font-mono">{filename}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {selectedFile ? (
          <BinFileEditor
            boardId={boardId}
            filename={selectedFile}
            onDeleted={() => setSelectedFile(null)}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-slate-500">
            Select a script to edit or create a new one
          </div>
        )}
      </div>
    </div>
  );
}

interface BinFileEditorProps {
  boardId: string;
  filename: string;
  onDeleted: () => void;
}

function BinFileEditor({ boardId, filename, onDeleted }: BinFileEditorProps) {
  const { data, isLoading } = useBinFile(boardId, filename);
  const content = data?.content;
  const patchMutation = usePatchBinFile(boardId, filename);
  const deleteMutation = useDeleteBinFile(boardId);
  const [editContent, setEditContent] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (content !== undefined) {
      setEditContent(content);
      setDirty(false);
    }
  }, [content]);

  const handleSave = async () => {
    try {
      await patchMutation.mutateAsync({ content: editContent });
      setDirty(false);
      toast.success('Script saved');
    } catch (err) {
      toast.error(`Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete ${filename}?`)) return;
    try {
      await deleteMutation.mutateAsync(filename);
      onDeleted();
      toast.success('Script deleted');
    } catch (err) {
      toast.error(`Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  if (isLoading) {
    return <div className="p-6 text-slate-400">Loading...</div>;
  }

  if (content === undefined) {
    return <div className="p-6 text-red-400">Failed to load file</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-white font-mono">{filename}</h3>
          {dirty && <span className="text-xs text-amber-400">unsaved</span>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={!dirty || patchMutation.isPending}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm rounded transition-colors"
          >
            {patchMutation.isPending ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="px-3 py-1 bg-red-600 hover:bg-red-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm rounded transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-hidden">
        <textarea
          value={editContent}
          onChange={(e) => { setEditContent(e.target.value); setDirty(true); }}
          onKeyDown={(e) => {
            if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              if (dirty) handleSave();
            }
          }}
          className="w-full h-full p-4 bg-slate-800 border border-slate-700 rounded text-white font-mono text-sm resize-none focus:outline-none focus:border-blue-500"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
