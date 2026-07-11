// T3(v6 计划):GET /api/docker/images 数据面——docker images 列表探测,注入 fake exec
// (hermetic,不起真 docker)。异常收敛纪律:超时/非零退出/spawn 失败 → {available:false,
// images:[]},绝不抛 500(docker 不可用是常态不是错误,B.1 决策)。
import { describe, expect, it } from 'vitest'
import { listDockerImages, type ExecDockerFn } from './dockerImages.js'

const okExec =
  (stdout: string): ExecDockerFn =>
  async () => ({ stdout, stderr: '', exitCode: 0 })

describe('listDockerImages', () => {
  it('解析 repo:tag 行,过滤 <none> 悬空镜像,去重排序', async () => {
    const r = await listDockerImages(
      okExec('sandcastle:local\nnode:22-slim\n<none>:<none>\nsandcastle:local\nubuntu:<none>\n'),
    )
    expect(r).toEqual({ available: true, images: ['node:22-slim', 'sandcastle:local'] })
  })

  it('非零退出 → available:false,不抛', async () => {
    const r = await listDockerImages(async () => ({ stdout: '', stderr: 'Cannot connect to the Docker daemon', exitCode: 1 }))
    expect(r).toEqual({ available: false, images: [] })
  })

  it('spawn 失败(命令不存在,exec 抛错)→ available:false,不抛', async () => {
    const r = await listDockerImages(async () => {
      throw new Error('spawn docker ENOENT')
    })
    expect(r).toEqual({ available: false, images: [] })
  })

  it('超时(exec 永不返回)→ available:false,耗时受 timeout 控制', async () => {
    const started = Date.now()
    const r = await listDockerImages(() => new Promise(() => {}), { timeoutMs: 120 })
    expect(r).toEqual({ available: false, images: [] })
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('空输出(无镜像)→ available:true 且空列表(可用≠有镜像,两回事)', async () => {
    const r = await listDockerImages(okExec(''))
    expect(r).toEqual({ available: true, images: [] })
  })
})
