<script setup lang="ts">
import type { Device } from '../composables/useDevices'
import DeviceCard from './DeviceCard.vue'

defineProps<{
  device: Device
  isScrcpyRunning: boolean
}>()

const emit = defineEmits<{
  startScrcpy: [serial: string]
  stopScrcpy: []
  disconnect: [serial: string]
}>()
</script>

<template>
  <div
    class="w-96 rounded-xl border border-black/8 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
  >
    <DeviceCard
      :device="device"
      :is-scrcpy-running="isScrcpyRunning"
      @start-scrcpy="(s) => emit('startScrcpy', s)"
      @disconnect="(s) => emit('disconnect', s)"
    />

    <div
      v-if="isScrcpyRunning"
      class="mx-4 mb-4 flex items-center gap-2.5 rounded-xl border border-green-500/20 bg-green-500/10 p-3"
    >
      <div class="relative flex-shrink-0">
        <span class="block h-2 w-2 rounded-full bg-green-500"></span>
        <span
          class="absolute inset-0 h-2 w-2 animate-ping rounded-full bg-green-500 opacity-50"
        ></span>
      </div>
      <span class="flex-1 text-[12px] font-medium text-green-600">屏幕镜像运行中</span>
      <button
        class="cursor-pointer rounded-md px-2.5 py-1 text-[11px] font-medium text-red-500 transition-all hover:bg-red-500/10"
        @click="emit('stopScrcpy')"
      >
        停止
      </button>
    </div>
  </div>
</template>
