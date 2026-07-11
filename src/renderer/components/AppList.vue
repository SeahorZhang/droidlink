<script setup lang="ts">
import { ref, watch, onBeforeUnmount, toRef } from 'vue'
import { ScrollAreaRoot, ScrollAreaViewport, ScrollAreaScrollbar, ScrollAreaThumb } from 'reka-ui'
import { useApps, type AppInfo } from '../composables/useApps'
import BaseButton from './BaseButton.vue'

const props = defineProps<{
  serial: string
}>()

const serial = toRef(props, 'serial')

const {
  apps,
  isLoading,
  isRefreshing,
  loadApps,
  refreshApps,
  recordClick,
  uninstallCompanion,
  clearCache
} = useApps(serial)

const searchText = ref('')
const displayApps = ref<AppInfo[]>([])

// Load apps when serial changes
watch(
  serial,
  (val) => {
    if (val) loadApps()
  },
  { immediate: true }
)

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

const launchApp = async (pkg: string) => {
  await recordClick(pkg)
  const app = displayApps.value.find((a) => a.packageName === pkg)
  const title = app ? `${app.label} 1920x1080` : pkg
  const { invoke } = await import('@tauri-apps/api/core')
  try {
    await invoke('start_scrcpy', {
      options: {
        args: [
          '-s', props.serial,
          `--new-display=1920x1080/320`,
          `--start-app=${pkg}`,
          '--video-codec=h265',
          '-b', '24M',
          '--window-x=auto',
          '--window-y=auto',
          `--window-title=${title}`,
        ],
      },
    })
  } catch (e) {
    console.error('launchApp failed:', e)
  }
}

const reinstall = async () => {
  await uninstallCompanion()
  await loadApps(true)
}

const uninstall = async () => {
  await uninstallCompanion()
  apps.value = []
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
  <div class="flex flex-col overflow-hidden p-3">
    <!-- Toolbar -->
    <div class="mb-3 flex items-center justify-end">
      <BaseButton
        variant="ghost"
        size="sm"
        icon="lucide:refresh-cw"
        :loading="isRefreshing"
        @click="refreshApps()"
      >
        刷新
      </BaseButton>
      <BaseButton variant="ghost" size="sm" icon="lucide:download" @click="reinstall()">
        安装
      </BaseButton>
      <BaseButton variant="ghost" size="sm" icon="lucide:trash-2" @click="uninstall()">
        卸载
      </BaseButton>
      <BaseButton variant="ghost" size="sm" icon="lucide:eraser" @click="clearCache()">
        清除缓存
      </BaseButton>
    </div>

    <!-- Search -->
    <div class="relative mb-3">
      <input
        v-model="searchText"
        type="text"
        placeholder="搜索..."
        class="w-full rounded-lg border border-black/10 bg-gray-100 px-3 py-1.5 text-[11px] text-black/80 placeholder-black/30 transition-colors outline-none focus:border-blue-500/50"
      />
    </div>

    <!-- App list (scrollable area) -->
    <ScrollAreaRoot class="h-0 flex-1">
      <ScrollAreaViewport class="h-full w-full">
        <!-- Loading -->
        <div v-if="isLoading" class="flex items-center justify-center py-6">
          <span
            class="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500"
          ></span>
        </div>

        <!-- Empty -->
        <div
          v-else-if="displayApps.length === 0"
          class="py-6 text-center text-[11px] text-black/30"
        >
          暂无应用
        </div>

        <!-- App grid -->
        <div v-else class="grid grid-cols-5 gap-2">
          <div
            v-for="app in displayApps"
            :key="app.packageName"
            class="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-black/8 bg-gray-50 p-2 transition-all hover:border-black/12 hover:bg-gray-100"
            @click="launchApp(app.packageName)"
          >
            <img
              v-if="app.icon"
              :src="'data:image/png;base64,' + app.icon"
              class="pointer-events-none h-8 w-8 rounded-lg"
            />
            <div
              v-else
              class="pointer-events-none flex h-8 w-8 items-center justify-center rounded-lg bg-gray-200"
            >
              <svg
                class="h-4 w-4 text-black/20"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
            </div>
            <span
              class="pointer-events-none w-full truncate text-center text-[10px] text-black/60"
              >{{ app.label }}</span
            >
          </div>
        </div>
      </ScrollAreaViewport>
      <ScrollAreaScrollbar orientation="vertical">
        <ScrollAreaThumb />
      </ScrollAreaScrollbar>
    </ScrollAreaRoot>
  </div>
</template>
