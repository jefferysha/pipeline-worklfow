import type { TrustedExecutableProof, TrustedPathProof } from './types.js'

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

function statValue(proof: TrustedPathProof, platform: NodeJS.Platform, includeSize: boolean): string {
  const mode = platform === 'darwin' ? proof.mode.toString(8) : proof.mode.toString(16)
  return [proof.dev, proof.ino, mode, proof.uid, ...(includeSize ? [proof.size] : [])].join(':')
}

export function nodeIdentityGuard(proof: TrustedExecutableProof | undefined): string {
  if (proof === undefined) return ''
  if (proof.platform !== 'darwin' && proof.platform !== 'linux') {
    throw new Error(`stable launcher 不支持持久化 ${proof.platform} Node identity`)
  }
  const statArgs = proof.platform === 'darwin' ? "-f '%d:%i:%p:%u:%z'" : "-c '%d:%i:%f:%u:%s'"
  const dirStatArgs = proof.platform === 'darwin' ? "-f '%d:%i:%p:%u'" : "-c '%d:%i:%f:%u'"
  const followArgs = proof.platform === 'darwin' ? "-L -f '%d:%i'" : "-L -c '%d:%i'"
  const hash = proof.platform === 'darwin'
    ? `/usr/bin/shasum -a 256 ${shellQuote(proof.executable.path)}`
    : `/usr/bin/sha256sum ${shellQuote(proof.executable.path)}`
  const parentChecks = proof.parents.map((parent) => `
[ ! -L ${shellQuote(parent.path)} ] || tenon_node_identity_changed
[ "$(/usr/bin/stat ${dirStatArgs} ${shellQuote(parent.path)} 2>/dev/null)" = ${shellQuote(statValue(parent, proof.platform, false))} ] || tenon_node_identity_changed`).join('')
  return `
tenon_node_identity_changed() {
  printf 'tenon runtime Node identity changed; rerun tenon setup --codex or tenon setup --claude\\n' >&2
  exit 126
}
[ ! -L ${shellQuote(proof.executable.path)} ] || tenon_node_identity_changed
[ "$(/usr/bin/stat ${statArgs} ${shellQuote(proof.executable.path)} 2>/dev/null)" = ${shellQuote(statValue(proof.executable, proof.platform, true))} ] || tenon_node_identity_changed
[ "$(/usr/bin/stat ${followArgs} ${shellQuote(proof.requestedPath)} 2>/dev/null)" = ${shellQuote(`${proof.executable.dev}:${proof.executable.ino}`)} ] || tenon_node_identity_changed${parentChecks}
tenon_node_digest_output="$(${hash} 2>/dev/null)" || tenon_node_identity_changed
tenon_node_digest="${'${tenon_node_digest_output%% *}'}"
[ "$tenon_node_digest" = ${shellQuote(proof.sha256)} ] || tenon_node_identity_changed
`
}
