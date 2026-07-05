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
const isRefreshing = ref(false)
const isReinstalling = ref(false)
const isPolling = ref(false)
const companionVersion = ref('')
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let observer: IntersectionObserver | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

const loadApps = async (force = false): Promise<void> => {
  if (!props.serial) return
  if (allApps.value.length === 0) {
    isLoading.value = true
  } else {
    isRefreshing.value = true
  }
  const result = await window.api.listApps(props.serial, force)
  const list = result.apps || result
  // 数据没变就不更新，避免闪烁
  const oldKeys = allApps.value.map((a) => a.packageName).join(',')
  const newKeys = list.map((a: AppInfo) => a.packageName).join(',')
  if (oldKeys !== newKeys || allApps.value.length !== list.length) {
    allApps.value = list
    displayApps.value = list
  } else {
    // 包名一样但图标/名称可能更新了，逐个更新
    for (const item of list) {
      const old = allApps.value.find((a) => a.packageName === item.packageName)
      if (old && (old.label !== item.label || old.icon !== item.icon)) {
        Object.assign(old, item)
      }
    }
  }
  companionVersion.value = result.version || ''
  isLoading.value = false
  isRefreshing.value = false
  await nextTick()
  setupObserver()
  if (list.length < 5 && !pollTimer) {
    startPolling()
  } else if (list.length >= 5) {
    stopPolling()
  }
}

const refreshCompanionData = async (): Promise<void> => {
  setTimeout(async () => {
    const updated = await window.api.listApps(props.serial)
    const updatedList = updated.apps || updated
    if (updatedList.length > 0) {
      allApps.value = updatedList
      displayApps.value = applyFilter(updatedList)
      companionVersion.value = updated.version || ''
      await nextTick()
      setupObserver()
    }
  }, 2000)
}

const startPolling = (): void => {
  if (pollTimer) return
  isPolling.value = true
  pollTimer = setInterval(async () => {
    const result = await window.api.listApps(props.serial, true)
    const list = result.apps || result
    if (list.length > allApps.value.length) {
      allApps.value = list
      displayApps.value = applyFilter(list)
      companionVersion.value = result.version || ''
      stopPolling()
      await nextTick()
      setupObserver()
      refreshCompanionData()
    }
  }, 3000)
}

const stopPolling = (): void => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  isPolling.value = false
}

const applyFilter = (list: AppInfo[]): AppInfo[] => {
  const keyword = searchText.value.toLowerCase().trim()
  if (!keyword) return list
  return list.filter(
    (app) =>
      app.label.toLowerCase().includes(keyword) || app.packageName.toLowerCase().includes(keyword)
  )
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

watch(searchText, () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    displayApps.value = applyFilter(allApps.value)
  }, 150)
})

const reinstall = async (): Promise<void> => {
  if (isReinstalling.value) return
  isReinstalling.value = true
  await window.api.reinstallCompanion(props.serial)
  // 等 companion app 启动完成再刷新
  await new Promise((r) => setTimeout(r, 3000))
  isReinstalling.value = false
  loadApps(true)
}

const launchApp = async (packageName: string): Promise<void> => {
  await window.api.launchApp(props.serial, packageName)
}

onBeforeUnmount(() => {
  if (observer) observer.disconnect()
  stopPolling()
})
</script>

<template>
  <div class="w-[600px] mt-3 p-3 bg-white/[0.03] rounded-xl border border-white/[0.05]">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2">
        <span class="text-[10px] text-white/30 uppercase tracking-wider">应用列表</span>
        <span v-if="companionVersion" class="text-[10px] text-white/20">v{{ companionVersion }}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <button
          class="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/50 transition-colors px-2 py-1 rounded-md hover:bg-white/5 cursor-pointer"
          :class="{ 'opacity-50 pointer-events-none': isRefreshing }"
          @click="loadApps(true)"
        >
          <svg class="w-3 h-3" :class="{ 'animate-spin': isRefreshing }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          刷新
        </button>
        <button
          class="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/50 transition-colors px-2 py-1 rounded-md hover:bg-white/5 cursor-pointer"
          :class="{ 'opacity-50 pointer-events-none': isReinstalling }"
          @click="reinstall()"
        >
          <svg class="w-3 h-3" :class="{ 'animate-spin': isReinstalling }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          重装
        </button>
        <button
          class="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 transition-colors cursor-pointer"
          @click="emit('close')"
        >
          <svg class="w-3 h-3 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
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
      <template v-if="isPolling">正在等待手机授权「应用列表」权限，授权后自动刷新...</template>
      <template v-else>暂无应用</template>
    </div>
    <template v-else>
      <div v-if="isPolling" class="text-[10px] text-white/20 mb-2">
        正在等待手机授权「应用列表」权限，授权后自动刷新...
      </div>
      <div v-else-if="isRefreshing" class="flex items-center justify-center mb-2">
        <span class="w-3 h-3 border border-white/15 border-t-white/40 rounded-full animate-spin"></span>
        <span class="text-[10px] text-white/20 ml-1.5">刷新中...</span>
      </div>
      <div v-else class="text-[10px] text-white/20 mb-2">
        如果应用列表不完整，请在手机上授予「应用列表」权限
      </div>
      <div class="grid grid-cols-8 gap-2 max-h-[240px] overflow-y-auto">
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
    </template>
  </div>
</template>
