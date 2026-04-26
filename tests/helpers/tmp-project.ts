import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export interface TmpProject {
  root: string;
  cleanup(): Promise<void>;
}

export async function makeTmpProject(): Promise<TmpProject> {
  const root = await mkdtemp(path.join(tmpdir(), 'meeseeks-'));
  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

export async function writeYaml(filePath: string, contents: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, 'utf8');
}

export async function writeText(filePath: string, contents: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, 'utf8');
}

export async function makeBareProject(name = 'Test Project'): Promise<TmpProject> {
  const tp = await makeTmpProject();
  await writeYaml(path.join(tp.root, 'project.meeseeks'), `name: ${name}\nboards: []\n`);
  return tp;
}
