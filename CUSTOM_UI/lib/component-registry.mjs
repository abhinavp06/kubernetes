// Curated map: doc slug -> the core-component / atomic-unit source definitions.
//
// Each `pattern` is resolved to a real file:line at build time (lib/symbols.mjs) by
// matching the symbol name, so a link points at the definition even after the file moves
// around. This is the seed set (Pod / Deployment / Service); extend it to cover more of
// the API surface and it flows straight through to the UI.

export const CONCEPTS = {
  'concepts/workloads/pods': {
    kind: 'Pod',
    apiVersion: 'v1',
    group: 'core',
    title: 'Pod',
    blurb: 'The smallest deployable unit — one or more containers sharing network and storage.',
    tiers: [
      {
        tier: 'api',
        label: 'API object',
        targets: [
          { role: 'External type (core/v1)', path: 'staging/src/k8s.io/api/core/v1/types.go', pattern: '^type Pod struct', lang: 'go' },
          { role: 'Internal type', path: 'pkg/apis/core/types.go', pattern: '^type Pod struct', lang: 'go' },
          { role: 'Validation', path: 'pkg/apis/core/validation/validation.go', pattern: '^func ValidatePodSpec\\(', lang: 'go' },
          { role: 'REST storage', path: 'pkg/registry/core/pod/storage/storage.go', pattern: '^func NewStorage\\(', lang: 'go' },
        ],
      },
      {
        tier: 'runtime',
        label: 'Node runtime — kubelet',
        targets: [
          { role: 'Pod sync loop', path: 'pkg/kubelet/kubelet.go', pattern: 'func \\(kl \\*Kubelet\\) SyncPod\\(', lang: 'go' },
        ],
      },
    ],
  },

  'concepts/workloads/controllers/deployment': {
    kind: 'Deployment',
    apiVersion: 'apps/v1',
    group: 'apps',
    title: 'Deployment',
    blurb: 'Declarative updates for Pods and ReplicaSets, reconciled by a control loop.',
    tiers: [
      {
        tier: 'api',
        label: 'API object',
        targets: [
          { role: 'External type (apps/v1)', path: 'staging/src/k8s.io/api/apps/v1/types.go', pattern: '^type Deployment struct', lang: 'go' },
          { role: 'Internal type', path: 'pkg/apis/apps/types.go', pattern: '^type Deployment struct', lang: 'go' },
          { role: 'Validation', path: 'pkg/apis/apps/validation/validation.go', pattern: '^func ValidateDeployment\\(', lang: 'go' },
          { role: 'REST storage', path: 'pkg/registry/apps/deployment/storage/storage.go', pattern: '^func NewStorage\\(', lang: 'go' },
        ],
      },
      {
        tier: 'controller',
        label: 'Control loop — deployment controller',
        targets: [
          { role: 'Controller struct', path: 'pkg/controller/deployment/deployment_controller.go', pattern: '^type DeploymentController struct', lang: 'go' },
          { role: 'Constructor', path: 'pkg/controller/deployment/deployment_controller.go', pattern: '^func NewDeploymentController\\(', lang: 'go' },
          { role: 'Reconcile (syncDeployment)', path: 'pkg/controller/deployment/deployment_controller.go', pattern: 'func \\(dc \\*DeploymentController\\) syncDeployment\\(', lang: 'go' },
        ],
      },
    ],
  },

  'concepts/services-networking/service': {
    kind: 'Service',
    apiVersion: 'v1',
    group: 'core',
    title: 'Service',
    blurb: 'A stable network identity in front of a dynamic set of Pods.',
    tiers: [
      {
        tier: 'api',
        label: 'API object',
        targets: [
          { role: 'External type (core/v1)', path: 'staging/src/k8s.io/api/core/v1/types.go', pattern: '^type Service struct', lang: 'go' },
          { role: 'Internal type', path: 'pkg/apis/core/types.go', pattern: '^type Service struct', lang: 'go' },
          { role: 'Validation', path: 'pkg/apis/core/validation/validation.go', pattern: '^func ValidateServiceCreate\\(', lang: 'go' },
          { role: 'REST storage', path: 'pkg/registry/core/service/storage/storage.go', pattern: '^func NewREST\\(', lang: 'go' },
        ],
      },
      {
        tier: 'dataplane',
        label: 'Data plane — kube-proxy & endpoints',
        targets: [
          { role: 'kube-proxy sync (iptables)', path: 'pkg/proxy/iptables/proxier.go', pattern: 'func \\(proxier \\*Proxier\\) syncProxyRules\\(', lang: 'go' },
          { role: 'EndpointSlice controller', path: 'pkg/controller/endpointslice/endpointslice_controller.go', pattern: '^func NewController\\(', lang: 'go' },
        ],
      },
    ],
  },
};

// Doc source files, relative to DOCS_DIR, for each rendered slug.
export const PAGE_FILES = {
  'concepts/workloads/pods': 'concepts/workloads/pods/_index.md',
  'concepts/workloads/controllers/deployment': 'concepts/workloads/controllers/deployment.md',
  'concepts/services-networking/service': 'concepts/services-networking/service.md',
};

export const MVP_SLUGS = Object.keys(CONCEPTS);
