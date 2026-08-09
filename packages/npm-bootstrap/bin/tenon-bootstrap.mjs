#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = '__TENON_REPOSITORY__'
const releaseRef = '__TENON_RELEASE_REF__'
const installerSha256 = '__TENON_INSTALLER_SHA256__'
const allowedHosts = new Set(['--codex', '--claude'])

function usage() {
  process.stdout.write(`Tenon npm bootstrap

Usage:
  tenon setup --codex [--auto-update] [--dry-run]
  tenon setup --claude [--auto-update] [--dry-run]

This thin package downloads the release-pinned Marketplace installer and enters
the same verified Tenon installation transaction. It does not install a second
runtime or a second Skill root.
`)
}

function installerUrl() {
  if (!/^[A-Za-z0-9._-]+$/u.test(releaseRef)) {
    throw new Error('invalid packaged release ref')
  }
  return `https://raw.githubusercontent.com/${repository}/${releaseRef}/install.sh`
}

export function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true, installerArgs: [] }
  const [command, ...options] = argv
  if (command !== 'setup') throw new Error('first argument must be setup')
  const hosts = options.filter((option) => allowedHosts.has(option))
  if (hosts.length !== 1) throw new Error('choose exactly one host: --codex or --claude')
  for (const option of options) {
    if (!allowedHosts.has(option) && option !== '--auto-update' && option !== '--dry-run') {
      throw new Error(`unsupported option: ${option}`)
    }
  }
  return { help: false, installerArgs: options }
}

async function downloadInstaller(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'tenon-npx-bootstrap' },
  })
  if (!response.ok) throw new Error(`installer download failed: HTTP ${response.status}`)
  if (new URL(response.url).hostname !== 'raw.githubusercontent.com') {
    throw new Error(`installer redirected to an untrusted host: ${response.url}`)
  }
  const contentLength = Number.parseInt(response.headers.get('content-length') ?? '', 10)
  if (Number.isFinite(contentLength) && contentLength > 256 * 1024) {
    throw new Error('installer exceeds the 256 KiB bootstrap limit')
  }
  const script = await response.text()
  if (Buffer.byteLength(script) > 256 * 1024) throw new Error('installer exceeds the 256 KiB bootstrap limit')
  return verifyInstaller(script)
}

export async function verifyInstaller(script) {
  if (!script.startsWith('#!/bin/bash')) {
    throw new Error('downloaded installer is not the Tenon bash bootstrap')
  }
  const digest = createHash('sha256').update(script).digest('hex')
  if (digest !== installerSha256) {
    throw new Error(`installer digest mismatch: expected ${installerSha256}, got ${digest}`)
  }
  return script
}

function runInstaller(script, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn('/bin/bash', ['-s', '--', ...args], {
      stdio: ['pipe', 'inherit', 'inherit'],
      env: process.env,
    })
    child.on('error', rejectRun)
    child.on('close', (code, signal) => {
      if (signal) rejectRun(new Error(`installer terminated by ${signal}`))
      else resolveRun(code ?? 1)
    })
    child.stdin.end(script)
  })
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2))
  if (parsed.help) {
    usage()
    return
  }
  const script = await downloadInstaller(installerUrl())
  process.exitCode = await runInstaller(script, parsed.installerArgs)
}

const invokedPath = process.argv[1] === undefined ? null : resolve(process.argv[1])
const isDirectInvocation = invokedPath !== null
  && realpathSync(invokedPath) === realpathSync(fileURLToPath(import.meta.url))
if (isDirectInvocation) {
  main().catch((error) => {
    process.stderr.write(`tenon bootstrap: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
