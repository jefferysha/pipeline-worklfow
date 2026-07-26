<script setup lang="ts">
import { useData, useRoute, withBase } from 'vitepress'
import VPBackdrop from 'vitepress/dist/client/theme-default/components/VPBackdrop.vue'
import VPContent from 'vitepress/dist/client/theme-default/components/VPContent.vue'
import VPFooter from 'vitepress/dist/client/theme-default/components/VPFooter.vue'
import VPHome from 'vitepress/dist/client/theme-default/components/VPHome.vue'
import VPLocalNav from 'vitepress/dist/client/theme-default/components/VPLocalNav.vue'
import VPNav from 'vitepress/dist/client/theme-default/components/VPNav.vue'
import VPSidebar from 'vitepress/dist/client/theme-default/components/VPSidebar.vue'
import VPSkipLink from 'vitepress/dist/client/theme-default/components/VPSkipLink.vue'
import {
  useCloseSidebarOnEscape,
  useSidebar,
} from 'vitepress/dist/client/theme-default/composables/sidebar.js'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  provide,
  useSlots,
  watch,
} from 'vue'
import { localizedThemeLabel } from './locale-labels.mjs'

const { frontmatter, lang, page } = useData()
const route = useRoute()
const slots = useSlots()
const isChinese = computed(() => lang.value === 'zh-CN')
const isHome = computed(() => frontmatter.value.layout === 'home')
const isNotFound = computed(() => Boolean(page.value.isNotFound))
const homeHref = computed(() => withBase(isChinese.value ? '/' : '/en/'))
const groupLabel = computed(() => String(frontmatter.value.group ?? ''))
const heroImageSlotExists = computed(() => Boolean(slots['home-hero-image']))
provide('hero-image-slot-exists', heroImageSlotExists)

const {
  isOpen: isSidebarOpen,
  open: openSidebar,
  close: closeSidebar,
} = useSidebar()
watch(() => route.path, closeSidebar)
useCloseSidebarOnEscape(isSidebarOpen, closeSidebar)

function crossLocaleDestination(anchor: HTMLAnchorElement): URL | undefined {
  const destination = new URL(anchor.href, window.location.href)
  if (destination.origin !== window.location.origin) return undefined
  const base = withBase('/')
  const currentIsEnglish = window.location.pathname.startsWith(`${base}en/`)
  const destinationIsEnglish = destination.pathname.startsWith(`${base}en/`)
  if (currentIsEnglish === destinationIsEnglish) return undefined
  return destination
}

function sanitizeCrossLocaleLinks(): void {
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const destination = crossLocaleDestination(anchor)
    if (!destination || destination.hash === '') continue
    destination.hash = ''
    const safeHref = `${destination.pathname}${destination.search}`
    if (anchor.getAttribute('href') !== safeHref) anchor.setAttribute('href', safeHref)
  }
}

function localizeElementText(selector: string): void {
  const element = document.querySelector<HTMLElement>(selector)
  const source = element?.textContent?.trim()
  if (!element || !source) return
  const localized = localizedThemeLabel(source, lang.value)
  if (element.textContent !== localized) element.textContent = localized
}

function localizeAccessibleLabels(): void {
  sanitizeCrossLocaleLinks()
  for (const selector of ['#main-nav-aria-label', '#sidebar-aria-label', '#doc-footer-aria-label']) {
    localizeElementText(selector)
  }
  for (const element of document.querySelectorAll<HTMLElement>('[aria-label]')) {
    const label = element.getAttribute('aria-label')
    if (!label) continue
    const localized = localizedThemeLabel(label, lang.value)
    if (localized !== label) {
      element.setAttribute('aria-label', localized)
    } else if (isChinese.value && label.startsWith('Permalink to ')) {
      const target = label
        .slice('Permalink to '.length)
        .replace(/^["“]|["”]$/gu, '')
      element.setAttribute('aria-label', `“${target}”的永久链接`)
    }
  }
  for (const element of document.querySelectorAll<HTMLElement>('[title]')) {
    const title = element.getAttribute('title')
    if (!title) continue
    const localized = localizedThemeLabel(title, lang.value)
    if (localized !== title) element.setAttribute('title', localized)
  }
  const heroHeading = document.querySelector<HTMLElement>('.VPHero h1')
  const hero = frontmatter.value.hero as { name?: string; text?: string } | undefined
  if (heroHeading && hero?.name && hero.text) {
    const accessibleName = `${hero.name} — ${hero.text}`
    if (heroHeading.getAttribute('aria-label') !== accessibleName) {
      heroHeading.setAttribute('aria-label', accessibleName)
    }
  }
}

function removeUnsafeCrossLocaleFragment(event: MouseEvent): void {
  const target = event.target
  if (!(target instanceof Element)) return
  const anchor = target.closest<HTMLAnchorElement>('a[href]')
  if (!anchor) return
  const destination = crossLocaleDestination(anchor)
  if (!destination || destination.hash === '') return
  destination.hash = ''
  event.preventDefault()
  event.stopImmediatePropagation()
  window.location.assign(`${destination.pathname}${destination.search}`)
}

let observer: MutationObserver | undefined
onMounted(() => {
  document.addEventListener('click', removeUnsafeCrossLocaleFragment, true)
  localizeAccessibleLabels()
  observer = new MutationObserver(localizeAccessibleLabels)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['aria-label', 'title'],
    childList: true,
    subtree: true,
  })
})

watch([lang, page], async () => {
  await nextTick()
  localizeAccessibleLabels()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  document.removeEventListener('click', removeUnsafeCrossLocaleFragment, true)
})
</script>

<template>
  <div v-if="frontmatter.layout !== false" class="Layout" :class="frontmatter.pageClass">
    <slot name="layout-top" />
    <VPSkipLink />
    <VPBackdrop class="backdrop" :show="isSidebarOpen" @click="closeSidebar" />
    <VPNav>
      <template #nav-bar-title-before><slot name="nav-bar-title-before" /></template>
      <template #nav-bar-title-after><slot name="nav-bar-title-after" /></template>
      <template #nav-bar-content-before><slot name="nav-bar-content-before" /></template>
      <template #nav-bar-content-after><slot name="nav-bar-content-after" /></template>
      <template #nav-screen-content-before><slot name="nav-screen-content-before" /></template>
      <template #nav-screen-content-after><slot name="nav-screen-content-after" /></template>
    </VPNav>
    <VPLocalNav :open="isSidebarOpen" @open-menu="openSidebar" />
    <VPSidebar :open="isSidebarOpen">
      <template #sidebar-nav-before><slot name="sidebar-nav-before" /></template>
      <template #sidebar-nav-after><slot name="sidebar-nav-after" /></template>
    </VPSidebar>

    <main v-if="isHome" id="VPContent" class="VPContent is-home tenon-home-main">
      <VPHome>
        <template #home-hero-before><slot name="home-hero-before" /></template>
        <template #home-hero-info-before><slot name="home-hero-info-before" /></template>
        <template #home-hero-info><slot name="home-hero-info" /></template>
        <template #home-hero-info-after><slot name="home-hero-info-after" /></template>
        <template #home-hero-actions-after><slot name="home-hero-actions-after" /></template>
        <template #home-hero-image><slot name="home-hero-image" /></template>
        <template #home-hero-after><slot name="home-hero-after" /></template>
        <template #home-features-before><slot name="home-features-before" /></template>
        <template #home-features-after><slot name="home-features-after" /></template>
      </VPHome>
    </main>

    <main
      v-else-if="isNotFound"
      id="VPContent"
      class="VPContent tenon-not-found"
      aria-labelledby="tenon-not-found-title"
    >
      <section class="tenon-not-found-card">
        <p class="tenon-not-found-code" aria-hidden="true">404</p>
        <h1 id="tenon-not-found-title">{{ isChinese ? '页面未找到' : 'Page not found' }}</h1>
        <p>
          {{
            isChinese
              ? '这个地址不存在，或页面已经移动。你可以返回文档首页继续查找。'
              : 'This address does not exist, or the page has moved. Return to the documentation home to continue.'
          }}
        </p>
        <a class="tenon-not-found-action" :href="homeHref">
          {{ isChinese ? '返回文档首页' : 'Return to documentation home' }}
        </a>
      </section>
    </main>

    <VPContent v-else>
      <template #page-top><slot name="page-top" /></template>
      <template #page-bottom><slot name="page-bottom" /></template>
      <template #not-found><slot name="not-found" /></template>
      <template #doc-footer-before><slot name="doc-footer-before" /></template>
      <template #doc-before>
        <nav class="tenon-breadcrumb" :aria-label="isChinese ? '面包屑' : 'Breadcrumb'">
          <a :href="homeHref">{{ isChinese ? '文档首页' : 'Documentation home' }}</a>
          <span aria-hidden="true">/</span>
          <span class="tenon-breadcrumb-group">{{ groupLabel }}</span>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{{ page.title }}</span>
        </nav>
      </template>
      <template #doc-after><slot name="doc-after" /></template>
      <template #doc-top><slot name="doc-top" /></template>
      <template #doc-bottom><slot name="doc-bottom" /></template>
      <template #aside-top><slot name="aside-top" /></template>
      <template #aside-bottom><slot name="aside-bottom" /></template>
      <template #aside-outline-before><slot name="aside-outline-before" /></template>
      <template #aside-outline-after><slot name="aside-outline-after" /></template>
      <template #aside-ads-before><slot name="aside-ads-before" /></template>
      <template #aside-ads-after><slot name="aside-ads-after" /></template>
    </VPContent>

    <VPFooter />
    <slot name="layout-bottom" />
  </div>
  <Content v-else />
</template>

<style scoped>
.Layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.VPContent {
  flex-grow: 1;
  flex-shrink: 0;
  margin: var(--vp-layout-top-height, 0px) auto 0;
  width: 100%;
  max-width: 100%;
}

.tenon-not-found {
  align-items: center;
  display: flex;
  justify-content: center;
  min-height: min(70vh, 720px);
  padding: 96px 24px 64px;
}

.tenon-not-found-card {
  max-width: 640px;
  text-align: center;
}

.tenon-not-found-code {
  color: var(--vp-c-brand-1);
  font-size: clamp(3rem, 10vw, 6rem);
  font-weight: 750;
  letter-spacing: -0.06em;
  line-height: 1;
  margin: 0 0 24px;
}

.tenon-not-found-card h1 {
  font-size: clamp(2rem, 5vw, 3.25rem);
  letter-spacing: -0.035em;
  line-height: 1.1;
  margin: 0;
}

.tenon-not-found-card p:not(.tenon-not-found-code) {
  color: var(--vp-c-text-2);
  font-size: 1.05rem;
  line-height: 1.75;
  margin: 20px auto 32px;
}

.tenon-not-found-action {
  background: var(--vp-c-brand-1);
  border-radius: 999px;
  color: var(--vp-c-bg);
  display: inline-flex;
  font-weight: 650;
  padding: 12px 22px;
}

.tenon-not-found-action:hover {
  background: var(--vp-c-brand-2);
}

.tenon-not-found-action:focus-visible {
  outline: 3px solid var(--vp-c-brand-1);
  outline-offset: 4px;
}

@media (min-width: 960px) {
  .VPContent {
    padding-top: var(--vp-nav-height);
  }
}
</style>
