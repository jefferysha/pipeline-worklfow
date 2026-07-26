import { defineConfig } from 'vitepress'
import { contentEntries, publicGroups } from '../content-manifest.mjs'

const linkFor = (slug: string, locale: 'zh-CN' | 'en') => {
  const prefix = locale === 'en' ? '/en/' : '/'
  return slug === 'index' ? prefix : `${prefix}${slug}`
}

function sidebar(locale: 'zh-CN' | 'en') {
  return publicGroups.map((group) => ({
    text: locale === 'zh-CN' ? group : ({
      开始使用: 'Get started',
      教程: 'Tutorials',
      操作指南: 'How-to guides',
      概念与架构: 'Concepts and architecture',
      参考: 'Reference',
      运维与安全: 'Operations and security',
      发布说明: 'Release notes',
      贡献: 'Contributing',
    } as Record<string, string>)[group] ?? group,
    items: contentEntries
      .filter((entry) => entry.group === group)
      .map((entry) => ({
        text: entry.locales[locale].title,
        link: linkFor(entry.slug, locale),
      })),
  }))
}

export default defineConfig({
  title: 'Tenon',
  description: '面向多宿主 Agent 的本地优先、证据驱动交付工作流',
  base: '/tenon/',
  srcDir: '.generated',
  outDir: 'dist',
  vite: {
    build: {
      manifest: true,
    },
  },
  transformHtml(code, id) {
    if (id.replaceAll('\\', '/').includes('/en/')) return code
    return code
      .replace(/>\s*Main Navigation\s*</gu, '>主导航<')
      .replace(/>\s*Sidebar Navigation\s*</gu, '>侧栏导航<')
      .replace(/>\s*Pager\s*</gu, '>翻页导航<')
      .replaceAll('aria-label="mobile navigation"', 'aria-label="移动导航"')
      .replaceAll('aria-label="extra navigation"', 'aria-label="更多导航"')
      .replaceAll('title="Copy Code"', 'title="复制代码"')
      .replace(
        /aria-label="Permalink to &quot;([^"]+)&quot;"/gu,
        'aria-label="“$1”的永久链接"',
      )
  },
  cleanUrls: true,
  lastUpdated: true,
  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN',
      title: 'Tenon',
      link: '/',
      themeConfig: {
        nav: [
          { text: '文档', link: '/quickstart' },
          { text: 'CLI', link: '/cli-reference' },
          { text: 'GitHub', link: 'https://github.com/jefferysha/tenon' },
        ],
        outline: { level: [2, 3], label: '本页内容' },
        darkModeSwitchLabel: '外观',
        lightModeSwitchTitle: '切换到浅色主题',
        darkModeSwitchTitle: '切换到深色主题',
        sidebarMenuLabel: '菜单',
        returnToTopLabel: '返回顶部',
        langMenuLabel: '切换语言',
        skipToContentLabel: '跳到正文',
        docFooter: { prev: '上一篇', next: '下一篇' },
        footer: {
          message: '本地优先 · 证据驱动 · 开源可迁移',
          copyright: '基于 MIT 许可证发布',
        },
      },
    },
    en: {
      label: 'English',
      lang: 'en',
      title: 'Tenon',
      link: '/en/',
      themeConfig: {
        nav: [
          { text: 'Documentation', link: '/en/quickstart' },
          { text: 'CLI', link: '/en/cli-reference' },
          { text: 'GitHub', link: 'https://github.com/jefferysha/tenon' },
        ],
        outline: { level: [2, 3], label: 'On this page' },
        darkModeSwitchLabel: 'Appearance',
        lightModeSwitchTitle: 'Switch to light theme',
        darkModeSwitchTitle: 'Switch to dark theme',
        sidebarMenuLabel: 'Menu',
        returnToTopLabel: 'Return to top',
        langMenuLabel: 'Change language',
        skipToContentLabel: 'Skip to content',
        docFooter: { prev: 'Previous page', next: 'Next page' },
        footer: {
          message: 'Local-first · Evidence-driven · Portable',
          copyright: 'Released under the MIT License',
        },
      },
    },
  },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/tenon/logo.svg' }],
    ['meta', { name: 'theme-color', content: '#0d7f68' }],
    ['meta', { name: 'color-scheme', content: 'light dark' }],
  ],
  themeConfig: {
    logo: { src: '/logo.svg', alt: 'Tenon' },
    sidebar: {
      '/en/': sidebar('en'),
      '/': sidebar('zh-CN'),
    },
    search: {
      provider: 'local',
      options: {
        locales: {
          root: {
            translations: {
              button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
              modal: {
                displayDetails: '显示详细列表',
                noResultsText: '没有找到相关结果',
                resetButtonTitle: '清除查询',
                backButtonTitle: '关闭搜索',
                footer: {
                  selectText: '选择',
                  selectKeyAriaLabel: '回车键',
                  navigateText: '切换',
                  navigateUpKeyAriaLabel: '向上箭头',
                  navigateDownKeyAriaLabel: '向下箭头',
                  closeText: '关闭',
                  closeKeyAriaLabel: '退出键',
                },
              },
            },
          },
          en: {
            translations: {
              button: { buttonText: 'Search', buttonAriaLabel: 'Search documentation' },
              modal: {
                noResultsText: 'No results found',
                resetButtonTitle: 'Clear query',
                footer: { selectText: 'Select', navigateText: 'Navigate', closeText: 'Close' },
              },
            },
          },
        },
      },
    },
    socialLinks: [{ icon: 'github', link: 'https://github.com/jefferysha/tenon' }],
  },
})
