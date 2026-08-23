import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import type {
  CreateWorkflowRequest, PatchWorkflowRequest, DeleteWorkflowRequest,
  CreateTicketRequest, PatchTicketRequest,
  ListFilesResponse,
  CreateProjectRequest, PatchProjectRequest,
} from '@shared/api.js';

export const useWorkspace = () => useQuery({ queryKey: ['workspace'], queryFn: () => api.workspace() });
export const useModels = () => useQuery({ queryKey: ['models'], queryFn: () => api.listModels(), staleTime: Infinity });
export const useWorkflows = () => useQuery({ queryKey: ['workflows'], queryFn: () => api.listWorkflows() });

export const useProjects = () => useQuery({ queryKey: ['projects'], queryFn: () => api.listProjects() });
export const useProject = (projectId: string | undefined) => useQuery({
  queryKey: ['project', projectId],
  queryFn: () => api.getProject(projectId!),
  enabled: !!projectId,
});
export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateProjectRequest) => api.createProject(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['workspace'] });
    },
  });
}
/**
 * Detection is a mutation only in the react-query sense — it writes nothing.
 * It is not a query because it is triggered by the user asking for it, against
 * a root they may still be typing, and must be re-runnable on demand.
 */
export function useDetectProject() {
  return useMutation({ mutationFn: (root: string) => api.detectProject(root) });
}
export function usePatchProject(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: PatchProjectRequest) => api.patchProject(projectId, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });
}
export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => api.deleteProject(projectId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['workspace'] });
    },
  });
}

/** What a spawn would actually use. Served by the same resolver the supervisor calls. */
export const useTicketPermissions = (
  workflowName: string | undefined,
  filename: string | undefined,
  enabled = true,
) => useQuery({
  queryKey: ['ticket-permissions', workflowName, filename],
  queryFn: () => api.ticketPermissions(workflowName!, filename!),
  enabled: enabled && !!workflowName && !!filename,
});
export const useWorkflow = (workflowName: string | undefined) => useQuery({
  queryKey: ['workflow', workflowName],
  queryFn: () => api.getWorkflow(workflowName!),
  enabled: !!workflowName,
});
export const useTickets = (workflowName: string | undefined) => useQuery({
  queryKey: ['tickets', workflowName],
  queryFn: () => api.listTickets(workflowName!),
  enabled: !!workflowName,
});
export const useTicket = (workflowName: string | undefined, filename: string | undefined) => useQuery({
  queryKey: ['ticket', workflowName, filename],
  queryFn: () => api.getTicket(workflowName!, filename!),
  enabled: !!workflowName && !!filename,
});

export function useCreateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateWorkflowRequest) => api.createWorkflow(req),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workflows'] }); },
  });
}
export function usePatchWorkflow(workflowName: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: PatchWorkflowRequest) => api.patchWorkflow(workflowName, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflows'] });
      qc.invalidateQueries({ queryKey: ['workflow', workflowName] });
    },
  });
}
export function useDeleteWorkflow(workflowName: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: DeleteWorkflowRequest) => api.deleteWorkflow(workflowName, req),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workflows'] }); },
  });
}
export function useCreateTicket(workflowName: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateTicketRequest) => api.createTicket(workflowName, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets', workflowName] });
      qc.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}
export function useMoveTicket(workflowName: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filename, state }: { filename: string; state: string }) =>
      api.patchTicket(workflowName, filename, { state }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets', workflowName] });
      qc.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}
export function useDeleteTicket(workflowName: string, filename: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.deleteTicket(workflowName, filename),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets', workflowName] });
      qc.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}

export const useSkillFiles = () => useQuery({
  queryKey: ['files', 'skills'],
  queryFn: () => api.listFiles('skills'),
});

export const useSkillFile = (filename: string | undefined) => useQuery({
  queryKey: ['file', 'skills', filename],
  queryFn: () => api.readFile('skills', filename!),
  enabled: !!filename,
});

export function useCreateSkillFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filename, content }: { filename: string; content: string }) =>
      api.createFile('skills', filename, { content }),
    onSuccess: (res, { filename, content }) => {
      qc.setQueryData<ListFilesResponse>(['files', 'skills'], (old) =>
        old ? { files: [...old.files, { name: filename, isDirectory: false }] } : old
      );
      qc.setQueryData(['file', 'skills', filename], { content, path: res.path });
    },
  });
}

export function usePatchSkillFile(filename: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ content }: { content: string }) =>
      api.patchFile('skills', filename, { content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['files', 'skills'] });
      qc.invalidateQueries({ queryKey: ['file', 'skills', filename] });
    },
  });
}

export function useDeleteSkillFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filename: string) => api.deleteFile('skills', filename),
    onSuccess: (_, filename) => {
      qc.setQueryData<ListFilesResponse>(['files', 'skills'], (old) =>
        old ? { files: old.files.filter(f => f.name !== filename) } : old
      );
      qc.removeQueries({ queryKey: ['file', 'skills', filename] });
    },
  });
}

export const useBinFiles = () => useQuery({
  queryKey: ['files', 'bin'],
  queryFn: () => api.listFiles('bin'),
});

export const useBinFile = (filename: string | undefined) => useQuery({
  queryKey: ['file', 'bin', filename],
  queryFn: () => api.readFile('bin', filename!),
  enabled: !!filename,
});

export function useCreateBinFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filename, content }: { filename: string; content: string }) =>
      api.createFile('bin', filename, { content }),
    onSuccess: (res, { filename, content }) => {
      qc.setQueryData<ListFilesResponse>(['files', 'bin'], (old) =>
        old ? { files: [...old.files, { name: filename, isDirectory: false }] } : old
      );
      qc.setQueryData(['file', 'bin', filename], { content, path: res.path });
    },
  });
}

export function usePatchBinFile(filename: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ content }: { content: string }) =>
      api.patchFile('bin', filename, { content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['files', 'bin'] });
      qc.invalidateQueries({ queryKey: ['file', 'bin', filename] });
    },
  });
}

export function useDeleteBinFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filename: string) => api.deleteFile('bin', filename),
    onSuccess: (_, filename) => {
      qc.setQueryData<ListFilesResponse>(['files', 'bin'], (old) =>
        old ? { files: old.files.filter(f => f.name !== filename) } : old
      );
      qc.removeQueries({ queryKey: ['file', 'bin', filename] });
    },
  });
}

export function useRuntimes() {
  return useQuery({ queryKey: ["runtimes"], queryFn: api.listRuntimes });
}
export function useSpawnRuntime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { workflowName: string; filename: string; model?: string }) =>
      api.spawnRuntime(vars.workflowName, vars.filename, vars.model),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["runtimes"] }); },
  });
}
export function useTerminateRuntime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.terminateRuntime(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["runtimes"] }); },
  });
}

export const usePrompts = () => useQuery({
  queryKey: ['prompts'],
  queryFn: () => api.listPrompts(),
});
export const usePrompt = (name: string | undefined) => useQuery({
  queryKey: ['prompt', name],
  queryFn: () => api.getPrompt(name!),
  enabled: !!name,
});
export function usePutPrompt(name: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.putPrompt(name, { body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prompts'] });
      // Don't invalidate ['prompt', name] — we just wrote it, and a refetch
      // races with setDirty(false) causing the editor body to reset mid-typing.
    },
  });
}
export function useDeletePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.deletePrompt(name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prompts'] }); },
  });
}
export function useRunPrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      { name, model, projectId, workflowName }:
      { name: string; model?: string; projectId?: string; workflowName?: string },
    ) => api.runPrompt(name, { model, projectId, workflowName }),
    onSuccess: (_, { name }) => {
      qc.invalidateQueries({ queryKey: ['runtimes'] });
      qc.invalidateQueries({ queryKey: ['prompt-logs', name] });
    },
  });
}
export const usePromptLogs = (name: string | undefined) => useQuery({
  queryKey: ['prompt-logs', name],
  queryFn: () => api.getPromptLogs(name!),
  enabled: !!name,
});
