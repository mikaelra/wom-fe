import path from 'node:path';

/** The HD texture file under <root>/hd/ a request for /hd/<parts> names, or
 *  null for anything else (src/app/hd/[...file]/route.web.ts). */
export function hdFilePath(root: string, parts: string[]): string | null {
  const dir = path.join(root, 'hd');
  const file = path.resolve(dir, ...parts);
  if (!file.startsWith(dir + path.sep) || path.extname(file) !== '.ktx2') return null;
  return file;
}
