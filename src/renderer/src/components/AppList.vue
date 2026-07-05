<script setup lang="ts">
import { ref, watch, onBeforeUnmount, nextTick } from 'vue'

interface AppInfo {
  packageName: string
  label: string
  icon?: string
}

const props = defineProps<{
  serial: string
}>()

const emit = defineEmits<{
  close: []
}>()

const allApps = ref<AppInfo[]>([])
const displayApps = ref<AppInfo[]>([])
const searchText = ref('')
const isLoading = ref(false)
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let observer: IntersectionObserver | null = null

const loadApps = async (): Promise<void> => {
  if (!props.serial) return
  isLoading.value = true
  allApps.value = await window.api.listApps(props.serial)
  displayApps.value = allApps.value
  isLoading.value = false
  await nextTick()
  setupObserver()
}

const setupObserver = (): void => {
  if (observer) observer.disconnect()
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const pkg = (entry.target as HTMLElement).dataset.pkg
          if (pkg) loadIcon(pkg)
          observer!.unobserve(entry.target)
        }
      }
    },
    { rootMargin: '50px', threshold: 0 }
  )
  document.querySelectorAll('[data-pkg]').forEach((el) => observer!.observe(el))
}

const loadIcon = async (pkg: string): Promise<void> => {
  const app = allApps.value.find((a) => a.packageName === pkg)
  if (!app || app.icon) return
  const b64 = await window.api.getAppIcon(props.serial, pkg)
  if (b64) app.icon = b64
}

watch(
  () => props.serial,
  (val) => {
    if (val) loadApps()
  },
  { immediate: true }
)

watch(displayApps, async () => {
  await nextTick()
  setupObserver()
})

watch(searchText, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    const keyword = val.toLowerCase().trim()
    if (!keyword) {
      displayApps.value = allApps.value
      return
    }
    displayApps.value = allApps.value.filter(
      (app) =>
        app.label.toLowerCase().includes(keyword) || app.packageName.toLowerCase().includes(keyword)
    )
  }, 150)
})

const launchApp = async (packageName: string): Promise<void> => {
  await window.api.launchApp(props.serial, packageName)
}

onBeforeUnmount(() => {
  if (observer) observer.disconnect()
})
</script>

<template>
  <div class="w-[600px] mt-3 p-3 bg-white/[0.03] rounded-xl border border-white/[0.05]">
    <div class="flex items-center justify-between mb-3">
      <span class="text-[10px] text-white/30 uppercase tracking-wider">应用列表</span>
      <button
        class="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 transition-colors cursor-pointer"
        @click="emit('close')"
      >
        <svg class="w-3 h-3 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>

    <div class="relative mb-3">
      <input
        v-model="searchText"
        type="text"
        placeholder="搜索..."
        class="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-[11px] text-white/70 placeholder-white/25 outline-none focus:border-white/15 transition-colors"
      />
    </div>

    <div v-if="isLoading" class="flex items-center justify-center py-6">
      <span
        class="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin"
      ></span>
    </div>
    <div v-else-if="displayApps.length === 0" class="text-center py-6 text-[11px] text-white/25">
      {{ allApps.length === 0 ? '暂无应用' : '未找到' }}
    </div>
    <div v-else class="grid grid-cols-8 gap-2 max-h-[240px] overflow-y-auto">
      <div
        v-for="app in displayApps"
        :key="app.packageName"
        :data-pkg="app.packageName"
        class="flex flex-col items-center gap-1 p-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.04] hover:border-white/[0.1] transition-all cursor-pointer"
        @click="launchApp(app.packageName)"
      >
        <img
          v-if="app.icon"
          :src="'data:image/png;base64,' + app.icon"
          class="w-8 h-8 rounded-lg pointer-events-none"
        />
        <div
          v-else
          class="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center pointer-events-none"
        >
          <svg class="w-4 h-4 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
        </div>
        <span class="text-[10px] text-white/50 text-center w-full truncate pointer-events-none">{{
          app.label
        }}</span>
      </div>
    </div>
  </div>
</template>
