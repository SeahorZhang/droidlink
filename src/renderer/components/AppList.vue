<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { useApps, type AppInfo } from '../composables/useApps'

const props = defineProps<{
  serial: string
}>()

const {
  apps,
  isLoading,
  isRefreshing,
  loadApps,
  refreshApps,
  recordClick,
  uninstallCompanion,
  clearCache
} = useApps(props.serial)

const searchText = ref('')
const displayApps = ref<AppInfo[]>([])

// Filter apps based on search
watch(
  [apps, searchText],
  () => {
    const keyword = searchText.value.toLowerCase().trim()
    if (!keyword) {
      displayApps.value = apps.value
    } else {
      displayApps.value = apps.value.filter(
        (a) =>
          a.label.toLowerCase().includes(keyword) || a.packageName.toLowerCase().includes(keyword)
      )
    }
  },
  { immediate: true }
)

const launchApp = async (packageName: string) => {
  await recordClick(packageName)
  // Launch via scrcpy with app
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('start_scrcpy', { options: { serial: props.serial, maxSize: 0, bitRate: '24M' } })
}

const reinstall = async () => {
  await uninstallCompanion()
  await loadApps(true)
}

let pollTimer: ReturnType<typeof setInterval> | null = null

onBeforeUnmount(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})
</script>

<template>
  <div class="p-3">
    <!-- Toolbar -->
    <div class="mb-3 flex items-center justify-end gap-1.5">
      <button
        class="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[10px] text-white/30 transition-colors hover:bg-white/5 hover:text-white/50"
        :class="{ 'pointer-events-none opacity-50': isRefreshing }"
        @click="refreshApps()"
      >
        <svg
          class="h-3 w-3"
          :class="{ 'animate-spin': isRefreshing }"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        刷新
      </button>
      <button
        class="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[10px] text-white/30 transition-colors hover:bg-white/5 hover:text-white/50"
        @click="reinstall()"
      >
        重装
      </button>
      <button
        class="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[10px] text-white/30 transition-colors hover:bg-white/5 hover:text-white/50"
        @click="clearCache()"
      >
        清除缓存
      </button>
    </div>

    <!-- Search -->
    <div class="relative mb-3">
      <input
        v-model="searchText"
        type="text"
        placeholder="搜索..."
        class="w-full rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/70 placeholder-white/25 transition-colors outline-none focus:border-white/15"
      />
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="flex items-center justify-center py-6">
      <span
        class="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/60"
      ></span>
    </div>

    <!-- Empty -->
    <div v-else-if="displayApps.length === 0" class="py-6 text-center text-[11px] text-white/25">
      暂无应用
    </div>

    <!-- App grid -->
    <div v-else class="grid flex-1 grid-cols-7 gap-2 overflow-y-auto">
      <div
        v-for="app in displayApps"
        :key="app.packageName"
        class="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-white/[0.04] bg-white/[0.03] p-2 transition-all hover:border-white/[0.1] hover:bg-white/[0.08]"
        @click="launchApp(app.packageName)"
      >
        <img
          v-if="app.icon"
          :src="'data:image/png;base64,' + app.icon"
          class="pointer-events-none h-8 w-8 rounded-lg"
        />
        <div
          v-else
          class="pointer-events-none flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06]"
        >
          <svg class="h-4 w-4 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
        </div>
        <span class="pointer-events-none w-full truncate text-center text-[10px] text-white/50">{{
          app.label
        }}</span>
      </div>
    </div>
  </div>
</template>
