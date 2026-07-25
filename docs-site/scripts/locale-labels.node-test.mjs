import assert from 'node:assert/strict'
import test from 'node:test'
import { localizedThemeLabel } from '../.vitepress/theme/locale-labels.mjs'

test('主题持久节点在中文与英文路由之间双向恢复可访问名称', () => {
  assert.equal(localizedThemeLabel('Main Navigation', 'zh-CN'), '主导航')
  assert.equal(localizedThemeLabel('主导航', 'en'), 'Main Navigation')
  assert.equal(localizedThemeLabel('Sidebar Navigation', 'zh-CN'), '侧栏导航')
  assert.equal(localizedThemeLabel('侧栏导航', 'en'), 'Sidebar Navigation')
  assert.equal(localizedThemeLabel('unchanged', 'en'), 'unchanged')
})

