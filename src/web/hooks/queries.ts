import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import type {
  CreateBoardRequest, PatchBoardRequest, DeleteBoardRequest,
  CreateLaneRequest, PatchLaneRequest, DeleteLaneRequest,
  CreateTicketRequest, PatchTicketRequest,
  ListFilesResponse,
} from '@shared/api.js';

export const useCurrentProject = () => useQuery({ queryKey: ['current'], queryFn: () => api.current() });
export const useBoards = () => useQuery({ queryKey: ['boards'], queryFn: () => api.listBoards() });
export const useBoard = (boardId: string | undefined) => useQuery({
  queryKey: ['board', boardId],
  queryFn: () => api.getBoard(boardId!),
  enabled: !!boardId,
});
export const useLane = (boardId: string | undefined, laneName: string | undefined) => useQuery({
  queryKey: ['lane', boardId, laneName],
  queryFn: () => api.getLane(boardId!, laneName!),
  enabled: !!boardId && !!laneName,
});
export const useTickets = (boardId: string | undefined, laneName: string | undefined) => useQuery({
  queryKey: ['tickets', boardId, laneName],
  queryFn: () => api.listTickets(boardId!, laneName!),
  enabled: !!boardId && !!laneName,
});
export const useTicket = (boardId: string | undefined, laneName: string | undefined, filename: string | undefined) => useQuery({
  queryKey: ['ticket', boardId, laneName, filename],
  queryFn: () => api.getTicket(boardId!, laneName!, filename!),
  enabled: !!boardId && !!laneName && !!filename,
});

export function useCreateBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateBoardRequest) => api.createBoard(req),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['boards'] }); },
  });
}
export function usePatchBoard(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: PatchBoardRequest) => api.patchBoard(boardId, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['boards'] });
      qc.invalidateQueries({ queryKey: ['board', boardId] });
    },
  });
}
export function useDeleteBoard(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: DeleteBoardRequest) => api.deleteBoard(boardId, req),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['boards'] }); },
  });
}
export function useCreateLane(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateLaneRequest) => api.createLane(boardId, req),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['board', boardId] }); },
  });
}
export function usePatchLane(boardId: string, laneName: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: PatchLaneRequest) => api.patchLane(boardId, laneName, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board', boardId] });
      qc.invalidateQueries({ queryKey: ['lane', boardId, laneName] });
    },
  });
}
export function useDeleteLane(boardId: string, laneName: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: DeleteLaneRequest) => api.deleteLane(boardId, laneName, req),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['board', boardId] }); },
  });
}
export function useCreateTicket(boardId: string, laneName: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateTicketRequest) => api.createTicket(boardId, laneName, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets', boardId, laneName] });
      qc.invalidateQueries({ queryKey: ['board', boardId] });
    },
  });
}
export function useMoveTicket(boardId: string, laneName: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filename, state }: { filename: string; state: string }) =>
      api.patchTicket(boardId, laneName, filename, { state }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets', boardId, laneName] });
      qc.invalidateQueries({ queryKey: ['board', boardId] });
    },
  });
}
export function useDeleteTicket(boardId: string, laneName: string, filename: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.deleteTicket(boardId, laneName, filename),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets', boardId, laneName] });
      qc.invalidateQueries({ queryKey: ['board', boardId] });
    },
  });
}

export const useSkillFiles = (boardId: string | undefined) => useQuery({
  queryKey: ['files', boardId, 'skills'],
  queryFn: () => api.listFiles(boardId!, 'skills'),
  enabled: !!boardId,
});

export const useSkillFile = (boardId: string | undefined, filename: string | undefined) => useQuery({
  queryKey: ['file', boardId, 'skills', filename],
  queryFn: () => api.readFile(boardId!, 'skills', filename!),
  enabled: !!boardId && !!filename,
});

export function useCreateSkillFile(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filename, content }: { filename: string; content: string }) =>
      api.createFile(boardId, 'skills', filename, { content }),
    onSuccess: (res, { filename, content }) => {
      qc.setQueryData<ListFilesResponse>(['files', boardId, 'skills'], (old) =>
        old ? { files: [...old.files, { name: filename, isDirectory: false }] } : old
      );
      qc.setQueryData(['file', boardId, 'skills', filename], { content, path: res.path });
    },
  });
}

export function usePatchSkillFile(boardId: string, filename: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ content }: { content: string }) =>
      api.patchFile(boardId, 'skills', filename, { content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['files', boardId, 'skills'] });
      qc.invalidateQueries({ queryKey: ['file', boardId, 'skills', filename] });
    },
  });
}

export function useDeleteSkillFile(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filename: string) => api.deleteFile(boardId, 'skills', filename),
    onSuccess: (_, filename) => {
      qc.setQueryData<ListFilesResponse>(['files', boardId, 'skills'], (old) =>
        old ? { files: old.files.filter(f => f.name !== filename) } : old
      );
      qc.removeQueries({ queryKey: ['file', boardId, 'skills', filename] });
    },
  });
}

export const useBinFiles = (boardId: string | undefined) => useQuery({
  queryKey: ['files', boardId, 'bin'],
  queryFn: () => api.listFiles(boardId!, 'bin'),
  enabled: !!boardId,
});

export const useBinFile = (boardId: string | undefined, filename: string | undefined) => useQuery({
  queryKey: ['file', boardId, 'bin', filename],
  queryFn: () => api.readFile(boardId!, 'bin', filename!),
  enabled: !!boardId && !!filename,
});

export function useCreateBinFile(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filename, content }: { filename: string; content: string }) =>
      api.createFile(boardId, 'bin', filename, { content }),
    onSuccess: (res, { filename, content }) => {
      qc.setQueryData<ListFilesResponse>(['files', boardId, 'bin'], (old) =>
        old ? { files: [...old.files, { name: filename, isDirectory: false }] } : old
      );
      qc.setQueryData(['file', boardId, 'bin', filename], { content, path: res.path });
    },
  });
}

export function usePatchBinFile(boardId: string, filename: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ content }: { content: string }) =>
      api.patchFile(boardId, 'bin', filename, { content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['files', boardId, 'bin'] });
      qc.invalidateQueries({ queryKey: ['file', boardId, 'bin', filename] });
    },
  });
}

export function useDeleteBinFile(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filename: string) => api.deleteFile(boardId, 'bin', filename),
    onSuccess: (_, filename) => {
      qc.setQueryData<ListFilesResponse>(['files', boardId, 'bin'], (old) =>
        old ? { files: old.files.filter(f => f.name !== filename) } : old
      );
      qc.removeQueries({ queryKey: ['file', boardId, 'bin', filename] });
    },
  });
}

export function useRuntimes() {
  return useQuery({ queryKey: ["runtimes"], queryFn: api.listRuntimes });
}
export function useSpawnRuntime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { boardId: string; laneName: string; filename: string; model?: string }) =>
      api.spawnRuntime(vars.boardId, vars.laneName, vars.filename, vars.model),
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

export const usePrompts = (boardId: string | undefined) => useQuery({
  queryKey: ['prompts', boardId],
  queryFn: () => api.listPrompts(boardId!),
  enabled: !!boardId,
});
export const usePrompt = (boardId: string | undefined, name: string | undefined) => useQuery({
  queryKey: ['prompt', boardId, name],
  queryFn: () => api.getPrompt(boardId!, name!),
  enabled: !!boardId && !!name,
});
export function usePutPrompt(boardId: string, name: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.putPrompt(boardId, name, { body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prompts', boardId] });
      // Don't invalidate ['prompt', boardId, name] — we just wrote it, and a refetch
      // races with setDirty(false) causing the editor body to reset mid-typing.
    },
  });
}
export function useDeletePrompt(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.deletePrompt(boardId, name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prompts', boardId] }); },
  });
}
export function useRunPrompt(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, model }: { name: string; model?: string }) => api.runPrompt(boardId, name, model),
    onSuccess: (_, { name }) => {
      qc.invalidateQueries({ queryKey: ['runtimes'] });
      qc.invalidateQueries({ queryKey: ['prompt-logs', boardId, name] });
    },
  });
}
export const usePromptLogs = (boardId: string | undefined, name: string | undefined) => useQuery({
  queryKey: ['prompt-logs', boardId, name],
  queryFn: () => api.getPromptLogs(boardId!, name!),
  enabled: !!boardId && !!name,
});
