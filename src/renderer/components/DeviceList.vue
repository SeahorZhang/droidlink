<script setup lang="ts">
import type { Device } from '../composables/useDevices'
import Icon from './Icon.vue'
import DeviceCard from './DeviceCard.vue'

defineProps<{
  devices: Device[]
  isLoading: boolean
  isScrcpyRunning: boolean
}>()

const emit = defineEmits<{
  refresh: []
  startScrcpy: [serial: string]
  stopScrcpy: []
  disconnect: [serial: string]
  pairNew: []
}>()
</script>

<template>
  <div
    class="w-96 rounded-xl border border-black/8 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
  >
    <div
      class="box-border flex h-10 items-center justify-between border-b border-black/8 px-5"
    >
      <span class="text-[11px] font-medium tracking-wider text-black/50 uppercase">设备</span>
      <button
        class="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px] text-black/40 transition-colors hover:bg-black/5 hover:text-black/60"
        @click="emit('refresh')"
      >
        <Icon name="refresh" class="h-3 w-3" :class="{ 'animate-spin': isLoading }" />
        {{ isLoading ? '刷新中' : '刷新' }}
      </button>
    </div>

    <div class="space-y-2 p-5">
      <DeviceCard
        v-for="device in devices"
        :key="device.serial"
        :device="device"
        :is-scrcpy-running="isScrcpyRunning"
        @start-scrcpy="(s) => emit('startScrcpy', s)"
        @disconnect="(s) => emit('disconnect', s)"
      />
    </div>

    <div
      v-if="isScrcpyRunning"
      class="mx-5 mb-5 flex items-center gap-2.5 rounded-xl border border-green-500/20 bg-green-500/10 p-3"
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

    <button
      class="mx-5 mb-5 w-full cursor-pointer justify-center rounded-lg py-2 text-[11px] text-black/30 transition-all hover:bg-black/5 hover:text-black/50"
      @click="emit('pairNew')"
    >
      配对新设备
    </button>
  </div>
</template>
