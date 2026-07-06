/**
 * paths —— scope + Project 桶解析（纯逻辑，env 注入）。
 * 老仓真相源：skills/pipeline/scripts/channel/paths.py。
 */
import { describe, expect, test } from 'vitest'
import { join } from 'node:path'
import {
  bucketFor,
  channelDir,
  eventsPath,
  GLOBAL_BUCKET,
  lockPath,
  projectKey,
  resolveRoot,
  sanitizeBucket,
  seqPath,
  workerFile,
} from './paths.js'

describe('resolveRoot（paths.py:27：TRELLIS_CHANNEL_ROOT 或 ~/.trellis/channels）', () => {
  test('env 覆盖优先', () => {
    expect(resolveRoot('/home/u', '/custom/root')).toBe('/custom/root')
  })
  test('缺省 = ~/.trellis/channels', () => {
    expect(resolveRoot('/home/u', undefined)).toBe(join('/home/u', '.trellis', 'channels'))
    expect(resolveRoot('/home/u', '  ')).toBe(join('/home/u', '.trellis', 'channels'))
  })
})

describe('sanitizeBucket（paths.py:48：[/\\_]→- 再非白名单→-）', () => {
  test('路径分隔符与下划线折叠为 -', () => {
    expect(sanitizeBucket('/Users/a_b/proj')).toBe('-Users-a-b-proj')
  })
  test('保留字母数字点连字符', () => {
    expect(sanitizeBucket('proj.v1-x')).toBe('proj.v1-x')
  })
  test('空 → -', () => {
    expect(sanitizeBucket('')).toBe('-')
  })
})

describe('projectKey / bucketFor（PIPELINE_CHANNEL_PROJECT 覆盖；global → _global）', () => {
  test('据 cwd sanitize', () => {
    expect(projectKey({ root: '/r', cwd: '/Users/a/proj' })).toBe('-Users-a-proj')
  })
  test('projectOverride 覆盖（也 sanitize，防注入）', () => {
    expect(projectKey({ root: '/r', cwd: '/Users/a/proj', projectOverride: 'my/bucket' })).toBe('my-bucket')
  })
  test('scope=global → _global 桶', () => {
    expect(bucketFor({ root: '/r', cwd: '/x' }, 'global')).toBe(GLOBAL_BUCKET)
  })
  test('scope=project → 项目桶', () => {
    expect(bucketFor({ root: '/r', cwd: '/Users/a/proj' }, 'project')).toBe('-Users-a-proj')
  })
})

describe('channelDir / eventsPath / seqPath / lockPath / workerFile', () => {
  const env = { root: '/r', cwd: '/Users/a/proj' }
  test('channelDir = root/bucket/name', () => {
    expect(channelDir(env, 'chatty', 'project')).toBe(join('/r', '-Users-a-proj', 'chatty'))
  })
  test('events/seq/lock 路径', () => {
    const d = join('/r', '-Users-a-proj', 'chatty')
    expect(eventsPath(env, 'chatty', 'project')).toBe(join(d, 'events.jsonl'))
    expect(seqPath(env, 'chatty', 'project')).toBe(join(d, '.seq'))
    expect(lockPath(env, 'chatty', 'project')).toBe(join(d, 'chatty.lock'))
  })
  test('workerFile = <dir>/<worker>.<suffix>', () => {
    expect(workerFile(env, 'chatty', 'w1', 'pid', 'project')).toBe(join('/r', '-Users-a-proj', 'chatty', 'w1.pid'))
  })
  test('global scope 落 _global 桶', () => {
    expect(channelDir(env, 'g', 'global')).toBe(join('/r', GLOBAL_BUCKET, 'g'))
  })
})
