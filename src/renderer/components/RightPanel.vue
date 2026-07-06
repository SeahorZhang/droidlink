<script setup lang="ts">
import { ref } from 'vue'
import AppList from './AppList.vue'
import SettingsPanel from './SettingsPanel.vue'

defineProps<{
  serial: string
  settings: { maxSize: number; bitRate: string }
}>()

const emit = defineEmits<{
  'update:settings': [settings: { maxSize: number; bitRate: string }]
}>()

const activeTab = ref<'apps' | 'settings'>('apps')

const tabs = [
  { key: 'apps' as const, label: '应用列表' },
  { key: 'settings' as const, label: '设置' }
]
</script>

<template>
  <div
    class="w-[520px] rounded-3xl border border-white/[0.08] bg-white/[0.06] shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl"
  >
    <div class="box-border flex h-10 items-center border-b border-white/[0.06]">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        :class="[
          'flex h-full flex-1 cursor-pointer items-center justify-center px-5 text-[11px] font-medium tracking-wider uppercase transition-colors',
          activeTab === tab.key
            ? 'border-b-2 border-white/20 text-white/60'
            : 'text-white/25 hover:text-white/40'
        ]"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="h-[520px] overflow-y-auto">
      <AppList v-if="activeTab === 'apps'" :serial="serial" />
      <SettingsPanel
        v-if="activeTab === 'settings'"
        :settings="settings"
        @update:settings="(s) => emit('update:settings', s)"
      />
    </div>
  </div>
</template>
