// Resolve a Go symbol to { path, line, text } by scanning a source file for a regex.
// We anchor by symbol name (not a hardcoded line) so links survive edits to the tree.
// Returns null (with a warning) when not found, keeping the build resilient to drift.
import fs from 'node:fs';
import path from 'node:path';
import { CODE_ROOT } from '../config.mjs';

export function resolveSymbol(relPath, pattern) {
  const abs = path.join(CODE_ROOT, relPath);
  let src;
  try {
    src = fs.readFileSync(abs, 'utf8');
  } catch {
    console.warn(`[symbols] file not found: ${relPath}`);
    return null;
  }
  const re = new RegExp(pattern);
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      return { path: relPath, line: i + 1, text: lines[i].trim() };
    }
  }
  console.warn(`[symbols] pattern not found in ${relPath}: ${pattern}`);
  return null;
}
