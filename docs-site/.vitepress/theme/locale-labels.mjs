const labelPairs = [
  ['Main Navigation', '主导航'],
  ['Sidebar Navigation', '侧栏导航'],
  ['Pager', '翻页导航'],
  ['mobile navigation', '移动导航'],
  ['extra navigation', '更多导航'],
  ['Copy Code', '复制代码'],
  ['Close search', '关闭搜索'],
  ['Display detailed list', '显示详细列表'],
  ['up arrow', '向上箭头'],
  ['down arrow', '向下箭头'],
  ['enter', '回车键'],
  ['escape', '退出键'],
]

const englishToChinese = new Map(labelPairs)
const chineseToEnglish = new Map(labelPairs.map(([english, chinese]) => [chinese, english]))

export function localizedThemeLabel(source, locale) {
  const labels = locale === 'zh-CN' ? englishToChinese : chineseToEnglish
  return labels.get(source) ?? source
}

