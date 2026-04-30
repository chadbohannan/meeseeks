import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import type {
  CreateBoardRequest, PatchBoardRequest, DeleteBoardRequest,
  CreateLaneRequest, PatchLaneRequest, DeleteLaneRequest,
  CreateTicketRequest, PatchTicketRequest,
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
export function usePatchTicket(boardId: string, laneName: string, filename: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: PatchTicketRequest) => api.patchTicket(boardId, laneName, filename, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets', boardId, laneName] });
      qc.invalidateQueries({ queryKey: ['ticket', boardId, laneName, filename] });
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['files', boardId, 'skills'] });
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
      qc.invalidateQueries({ queryKey: ['files', boardId, 'skills'] });
      qc.invalidateQueries({ queryKey: ['file', boardId, 'skills', filename] });
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
