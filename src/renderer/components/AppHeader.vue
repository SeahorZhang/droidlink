<script setup lang="ts">
import type { Device } from '../composables/useDevices'
import DeviceSelector from './DeviceSelector.vue'

defineProps<{
  devices: Device[]
  currentSerial: string
  isLoading: boolean
}>()

const emit = defineEmits<{
  selectDevice: [serial: string]
  pairNew: []
}>()
</script>

<template>
  <div class="relative">
    <!-- macOS 红绿灯按钮区域 -->
    <div class="absolute"></div>

    <!-- 可拖拽标题栏 -->
    <div data-tauri-drag-region class="h-12 w-full"></div>

    <!-- 设备选择器 -->
    <div class="absolute top-1/2 right-2 -translate-y-1/2">
      <DeviceSelector
        v-if="devices.length > 0"
        :devices="devices"
        :current-serial="currentSerial"
        :is-loading="isLoading"
        @select="emit('selectDevice', $event)"
        @pair-new="emit('pairNew')"
      />
    </div>
  </div>
</template>
