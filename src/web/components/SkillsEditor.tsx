import React, { useState } from 'react';
import { Skill } from '../../shared/types';
import { useSkills } from '../hooks/useSkills';
import { toast } from 'react-hot-toast';

const SKILL_TEMPLATE = `---
name: New Skill
description: Brief description of this skill
---

# Skill Content

Write your skill documentation here in Markdown.
`;

interface SkillsEditorProps {
  projectPath: string;
}

export function SkillsEditor({ projectPath }: SkillsEditorProps) {
  const { skills, isLoading, error, createSkill, updateSkill, deleteSkill } = useSkills(projectPath);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [fileNameError, setFileNameError] = useState<string | null>(null);

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
    if (skills.some(s => s.filename === `${name}.md`)) {
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
      await createSkill(`${newFileName}.md`, SKILL_TEMPLATE);
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
    return <div className="p-4 text-gray-400">Loading skills...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-400">Error loading skills: {error.message}</div>;
  }

  const selectedSkill = skills.find(s => s.filename === selectedFile);

  return (
    <div className="flex h-full bg-gray-900">
      {/* Left Panel - File List */}
      <div className="w-64 border-r border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <button
            onClick={handleCreateClick}
            disabled={isCreating}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded transition-colors"
          >
            + New Skill
          </button>
        </div>

        {isCreating && (
          <div className="p-4 border-b border-gray-700 bg-gray-800">
            <input
              type="text"
              value={newFileName}
              onChange={(e) => {
                setNewFileName(e.target.value);
                setFileNameError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateSubmit();
                if (e.key === 'Escape') handleCreateCancel();
              }}
              placeholder="skill-name"
              className="w-full px-2 py-1 mb-2 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
              autoFocus
            />
            {fileNameError && (
              <div className="text-xs text-red-400 mb-2">{fileNameError}</div>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleCreateSubmit}
                className="flex-1 px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded"
              >
                Create
              </button>
              <button
                onClick={handleCreateCancel}
                className="flex-1 px-2 py-1 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {skills.length === 0 && !isCreating && (
            <div className="p-4 text-sm text-gray-500">
              No skills yet. Click &quot;+ New Skill&quot; to create one.
            </div>
          )}
          {skills.map(skill => (
            <button
              key={skill.filename}
              onClick={() => setSelectedFile(skill.filename)}
              className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                selectedFile === skill.filename
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              <div className="font-medium">{skill.name}</div>
              <div className="text-xs opacity-75 truncate">{skill.filename}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Right Panel - Editor */}
      <div className="flex-1 overflow-hidden">
        {selectedSkill ? (
          <FileEditor
            skill={selectedSkill}
            onSave={async (content) => {
              try {
                await updateSkill(selectedSkill.filename, content);
                toast.success('Skill saved');
              } catch (err) {
                toast.error(`Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}`);
              }
            }}
            onDelete={async () => {
              if (confirm(`Delete ${selectedSkill.filename}?`)) {
                try {
                  await deleteSkill(selectedSkill.filename);
                  setSelectedFile(null);
                  toast.success('Skill deleted');
                } catch (err) {
                  toast.error(`Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`);
                }
              }
            }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500">
            Select a skill to edit or create a new one
          </div>
        )}
      </div>
    </div>
  );
}

interface FileEditorProps {
  skill: Skill;
  onSave: (content: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

function FileEditor({ skill, onSave, onDelete }: FileEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(skill.content);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(editContent);
      setIsEditing(false);
    } catch (err) {
      // Error already toasted by parent
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditContent(skill.content);
    setIsEditing(false);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">{skill.name}</h3>
          <p className="text-sm text-gray-400">{skill.description}</p>
        </div>
        <button
          onClick={onDelete}
          className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
        >
          Delete
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isEditing ? (
          <div className="h-full flex flex-col">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="flex-1 p-4 bg-gray-800 border border-gray-700 rounded text-white font-mono text-sm resize-none focus:outline-none focus:border-blue-500"
              autoFocus
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded transition-colors"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={handleCancel}
                disabled={isSaving}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => setIsEditing(true)}
            className="cursor-pointer p-4 bg-gray-800 border border-gray-700 rounded hover:border-blue-500 transition-colors"
          >
            <pre className="text-white font-mono text-sm whitespace-pre-wrap">{skill.content}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
