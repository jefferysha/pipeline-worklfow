import DefaultTheme from 'vitepress/theme'
import DocsLayout from './DocsLayout.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout: DocsLayout,
}
