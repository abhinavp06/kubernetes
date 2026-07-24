// Build an Obsidian-style concept graph from the user's notes + annotations by shelling out
// to the local `claude` CLI (non-interactive). Single-flight; result validated and saved to
// notes/graph.json.
import { spawn } from 'node:child_process';
import * as store from './notesStore.mjs';

let job = { running: false, error: null, startedAt: 0, finishedAt: 0 };
export const getJob = () => job;

const GROUPS = ['api', 'controller', 'runtime', 'networking', 'storage', 'concept', 'security'];

function buildCorpus() {
  const parts = [];
  for (const t of store.getThreads()) {
    const where = t.target.kind === 'doc' ? t.target.slug : t.target.path;
    const comments = t.comments.map((c) => c.body).filter(Boolean).join(' | ');
    parts.push(`- annotation on [${where}]: "${(t.quote || '').slice(0, 160)}"` + (comments ? ` — ${comments}` : ''));
  }
  for (const n of store.getNotes()) parts.push(`- note "${n.title}": ${n.body}`);
  return parts.join('\n');
}

function prompt(corpus) {
  return [
    'You are building a concept graph from a learner\'s notes and annotations on the Kubernetes',
    'source code and docs. Infer the key concepts and how they relate.',
    '',
    'Return ONLY a JSON object, no prose, no code fences, of the form:',
    '{"nodes":[{"id":"kebab-case-id","label":"Human Label","group":"one of: ' + GROUPS.join(', ') + '"}],',
    ' "links":[{"source":"node-id","target":"node-id","weight":1}]}',
    'Rules: 8–20 nodes; weight is 1–5 (stronger = higher); every link source/target must be a node id;',
    'prefer edges that reflect real Kubernetes relationships (e.g. Deployment→ReplicaSet→Pod).',
    '',
    'Notes:',
    corpus,
  ].join('\n');
}

function extractJson(text) {
  let s = String(text).trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  return JSON.parse(s);
}

function validate(graph) {
  const nodes = [];
  const seen = new Set();
  for (const n of graph.nodes || []) {
    if (!n || !n.id || seen.has(n.id)) continue;
    seen.add(n.id);
    nodes.push({ id: String(n.id), label: String(n.label || n.id), group: GROUPS.includes(n.group) ? n.group : 'concept' });
  }
  const ids = new Set(nodes.map((n) => n.id));
  const links = [];
  const pairSeen = new Set();
  for (const l of graph.links || []) {
    if (!l) continue;
    const source = String(l.source);
    const target = String(l.target);
    if (source === target || !ids.has(source) || !ids.has(target)) continue;
    const key = source < target ? source + '|' + target : target + '|' + source;
    if (pairSeen.has(key)) continue;
    pairSeen.add(key);
    links.push({ source, target, weight: Math.max(1, Math.min(5, Number(l.weight) || 2)) });
  }
  return { nodes, links, generatedAt: Date.now() };
}

function runClaude(corpus) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', prompt(corpus), '--output-format', 'json'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('analysis timed out')); }, 180000);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => { clearTimeout(timer); reject(new Error('could not run claude CLI: ' + e.message)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !out) return reject(new Error('claude exited ' + code + ': ' + err.slice(0, 200)));
      try {
        let text = out;
        try { const env = JSON.parse(out); if (env && typeof env.result === 'string') text = env.result; } catch {}
        resolve(validate(extractJson(text)));
      } catch (e) {
        reject(new Error('could not parse agent output: ' + e.message));
      }
    });
  });
}

export function startAnalysis() {
  if (job.running) return job;
  const corpus = buildCorpus();
  if (!corpus.trim()) {
    job = { running: false, error: 'add some notes or annotations first', startedAt: Date.now(), finishedAt: Date.now() };
    return job;
  }
  job = { running: true, error: null, startedAt: Date.now(), finishedAt: 0 };
  runClaude(corpus)
    .then((graph) => { store.setGraph(graph); job = { running: false, error: null, startedAt: job.startedAt, finishedAt: Date.now() }; })
    .catch((e) => { job = { running: false, error: String(e.message || e), startedAt: job.startedAt, finishedAt: Date.now() }; });
  return job;
}
