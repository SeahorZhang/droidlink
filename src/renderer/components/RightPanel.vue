<script setup lang="ts">
import { ref } from 'vue'
import MacosTab from './MacosTab.vue'
import AppList from './AppList.vue'
import SettingsPanel from './SettingsPanel.vue'

defineProps<{
  serial: string
  settings: { maxSize: number; bitRate: string }
}>()

const emit = defineEmits<{
  'update:settings': [settings: { maxSize: number; bitRate: string }]
}>()

const activeTab = ref('apps')

const tabs = [
  { key: 'apps', label: '应用列表' },
  { key: 'settings', label: '设置' }
]
</script>

<template>
  <div
    class="w-[520px] rounded-3xl border border-white/[0.08] bg-white/[0.06] shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl"
  >
    <div class="flex h-10 items-center justify-center border-b border-white/[0.06]">
      <MacosTab v-model="activeTab" :tabs="tabs" />
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
