import { realpath } from 'node:fs/promises';
import path from 'node:path';

export function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

/** Canonicalize both sides before containment checks, including junctions on Windows. */
export async function authorizePath(candidate: string, roots: string[]): Promise<string> {
  if (!path.isAbsolute(candidate)) throw new Error('Use an absolute local path.');
  if (!roots.length) throw new Error('Local file access is disabled. Configure DEPLOYHUB_ALLOWED_ROOTS explicitly.');
  const canonical = await realpath(candidate);
  const canonicalRoots = await Promise.all(roots.map(root => realpath(root)));
  if (!canonicalRoots.some(root => isWithin(root, canonical))) throw new Error('Path is outside the explicitly authorized project directories.');
  return canonical;
}
