import { describe, it, expect, afterEach } from 'vitest';
import { bootTestServer } from '../../helpers/server.js';
import { makeBareProject } from '../../helpers/tmp-project.js';
import type { ListFilesResponse, ReadFileResponse, WriteFileResponse, PatchFileResponse } from '../../../src/shared/api.js';

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

async function setup() {
  const tp = await makeBareProject();
  cleanups.push(tp.cleanup);
  const srv = await bootTestServer(tp.root);
  cleanups.push(srv.cleanup);
  const board = await (await fetch(`${srv.url}/api/boards`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'B' }),
  })).json() as { board: { boardId: string } };
  return { srv, boardId: board.board.boardId };
}

describe('file routes', () => {
  describe('GET /api/boards/:boardId/files/:namespace', () => {
    it('lists files in empty skills directory', async () => {
      const { srv, boardId } = await setup();
      const res = await fetch(`${srv.url}/api/boards/${boardId}/files/skills`);
      expect(res.status).toBe(200);
      const body = await res.json() as ListFilesResponse;
      expect(body.files).toEqual([]);
    });

    it('lists skill files with metadata', async () => {
      const { srv, boardId } = await setup();
      // First, create a skill file via POST
      await fetch(`${srv.url}/api/boards/${boardId}/files/skills/test.md`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'test content' }),
      });

      const res = await fetch(`${srv.url}/api/boards/${boardId}/files/skills`);
      expect(res.status).toBe(200);
      const body = await res.json() as ListFilesResponse;
      expect(body.files).toHaveLength(1);
      expect(body.files[0]!.name).toBe('test.md');
      expect(body.files[0]!.isDirectory).toBe(false);
      expect(body.files[0]!.size).toBeGreaterThan(0);
      expect(body.files[0]!.modified).toBeTruthy();
    });

    it('rejects invalid namespace', async () => {
      const { srv, boardId } = await setup();
      const res = await fetch(`${srv.url}/api/boards/${boardId}/files/invalid`);
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/boards/:boardId/files/:namespace/:filepath', () => {
    it('reads file content', async () => {
      const { srv, boardId } = await setup();
      // First create a file
      await fetch(`${srv.url}/api/boards/${boardId}/files/skills/test.md`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'hello world' }),
      });

      const res = await fetch(`${srv.url}/api/boards/${boardId}/files/skills/test.md`);
      expect(res.status).toBe(200);
      const body = await res.json() as ReadFileResponse;
      expect(body.content).toBe('hello world');
      expect(body.path).toBeTruthy();
    });

    it('returns 404 for missing file', async () => {
      const { srv, boardId } = await setup();
      const res = await fetch(`${srv.url}/api/boards/${boardId}/files/skills/missing.md`);
      expect(res.status).toBe(404);
    });

    it('rejects path traversal with ..', async () => {
      const { srv, boardId } = await setup();
      // Note: Browser fetch() normalizes .. in URLs before sending, so we test the
      // server-side validation using a path that contains .. in the filename itself
      const res = await fetch(`${srv.url}/api/boards/${boardId}/files/skills/..%2Fescape.md`);
      expect(res.status).toBe(400);
    });

    it('rejects absolute paths', async () => {
      const { srv, boardId } = await setup();
      // Test server-side validation of paths starting with /
      const res = await fetch(`${srv.url}/api/boards/${boardId}/files/skills/%2Fetc%2Fpasswd`);
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/boards/:boardId/files/:namespace/:filepath', () => {
    it('creates a new file', async () => {
      const { srv, boardId } = await setup();
      const res = await fetch(`${srv.url}/api/boards/${boardId}/files/skills/new.md`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'new content' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as WriteFileResponse;
      expect(body.ok).toBe(true);
      expect(body.path).toBeTruthy();
    });

    it('creates .claude/skills directory if missing', async () => {
      const { srv, boardId } = await setup();
      const res = await fetch(`${srv.url}/api/boards/${boardId}/files/skills/test.md`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'content' }),
      });
      expect(res.status).toBe(200);
    });

    it('rejects files without .md extension in skills namespace', async () => {
      const { srv, boardId } = await setup();
      const res = await fetch(`${srv.url}/api/boards/${boardId}/files/skills/test.txt`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'content' }),
      });
      expect(res.status).toBe(400);
    });

    it('rejects missing content field', async () => {
      const { srv, boardId } = await setup();
      const res = await fetch(`${srv.url}/api/boards/${boardId}/files/skills/test.md`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('rejects path traversal', async () => {
      const { srv, boardId } = await setup();
      // Test server-side validation with URL-encoded path traversal
      const res = await fetch(`${srv.url}/api/boards/${boardId}/files/skills/..%2Fescape.md`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'content' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/boards/:boardId/files/:namespace/:filepath', () => {
    it('updates file content', async () => {
      const { srv, boardId } = await setup();
      // Create file first
      await fetch(`${srv.url}/api/boards/${boardId}/files/skills/test.md`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'original' }),
      });

      const res = await fetch(`${srv.url}/api/boards/${boardId}/files/skills/test.md`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'updated' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as PatchFileResponse;
      expect(body.ok).toBe(true);
    });

    it('verifies file content was updated', async () => {
      const { srv, boardId } = await setup();
      // Create file first
      await fetch(`${srv.url}/api/boards/${boardId}/files/skills/test.md`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'original' }),
      });

      // Update it
      await fetch(`${srv.url}/api/boards/${boardId}/files/skills/test.md`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'updated content' }),
      });

      // Read and verify
      const res = await fetch(`${srv.url}/api/boards/${boardId}/files/skills/test.md`);
      const body = await res.json() as ReadFileResponse;
      expect(body.content).toBe('updated content');
    });

    it('returns 404 for missing file', async () => {
      const { srv, boardId } = await setup();
      const res = await fetch(`${srv.url}/api/boards/${boardId}/files/skills/missing.md`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'content' }),
      });
      expect(res.status).toBe(404);
    });

    it('rejects missing content field', async () => {
      const { srv, boardId } = await setup();
      // Create file first
      await fetch(`${srv.url}/api/boards/${boardId}/files/skills/test.md`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'original' }),
      });

      const res = await fetch(`${srv.url}/api/boards/${boardId}/files/skills/test.md`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/boards/:boardId/files/:namespace/:filepath', () => {
    it('deletes existing file', async () => {
      const { srv, boardId } = await setup();
      // Create file first
      await fetch(`${srv.url}/api/boards/${boardId}/files/skills/test.md`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'content' }),
      });

      const res = await fetch(`${srv.url}/api/boards/${boardId}/files/skills/test.md`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(200);
    });

    it('verifies file was deleted', async () => {
      const { srv, boardId } = await setup();
      // Create file first
      await fetch(`${srv.url}/api/boards/${boardId}/files/skills/test.md`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'content' }),
      });

      // Delete it
      await fetch(`${srv.url}/api/boards/${boardId}/files/skills/test.md`, {
        method: 'DELETE',
      });

      // Try to read and verify it's gone
      const res = await fetch(`${srv.url}/api/boards/${boardId}/files/skills/test.md`);
      expect(res.status).toBe(404);
    });

    it('returns 404 for missing file', async () => {
      const { srv, boardId } = await setup();
      const res = await fetch(`${srv.url}/api/boards/${boardId}/files/skills/missing.md`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(404);
    });
  });
});
