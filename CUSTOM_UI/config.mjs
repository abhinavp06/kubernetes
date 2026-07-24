// Central configuration for Control Plane.
// Both roots are overridable via env vars so the app can live anywhere.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The Kubernetes source tree we link definitions into.
export const CODE_ROOT = path.resolve(process.env.CODE_ROOT || path.join(__dirname, '..'));

// The English docs tree (k8s-website/content/en) we render.
export const DOCS_ROOT = path.resolve(
  process.env.DOCS_ROOT || path.join(__dirname, '..', '..', 'k8s-website', 'content', 'en'),
);
export const DOCS_DIR = path.join(DOCS_ROOT, 'docs');
export const EXAMPLES_DIR = path.join(DOCS_ROOT, 'examples');
export const INCLUDES_DIR = path.join(DOCS_ROOT, 'includes');
export const GLOSSARY_DIR = path.join(DOCS_DIR, 'reference', 'glossary');

// Static assets (images/diagrams) served from the docs repo.
export const STATIC_DIR = path.resolve(DOCS_ROOT, '..', '..', 'static');

// Generated + user-data + client roots.
export const DATA_DIR = path.join(__dirname, 'data');
export const PAGES_DIR = path.join(DATA_DIR, 'pages');
export const NOTES_DIR = path.join(__dirname, 'notes');
export const SRC_DIR = path.join(__dirname, 'src');

export const PORT = process.env.PORT ? Number(process.env.PORT) : 4173;
export const K8S_VERSION = 'v1.36';
export const K8S_VERSION_SHORT = '1.36';
