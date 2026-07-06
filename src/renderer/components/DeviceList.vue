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
    class="w-96 rounded-3xl border border-white/[0.08] bg-white/[0.06] shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl"
  >
    <div
      class="box-border flex h-10 items-center justify-between border-b border-white/[0.06] px-5"
    >
      <span class="text-[11px] font-medium tracking-wider text-white/35 uppercase">设备</span>
      <button
        class="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px] text-white/30 transition-colors hover:bg-white/5 hover:text-white/50"
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
      class="mx-5 mb-5 flex items-center gap-2.5 rounded-2xl border border-emerald-500/10 bg-emerald-500/[0.08] p-3"
    >
      <div class="relative flex-shrink-0">
        <span class="block h-2 w-2 rounded-full bg-emerald-400"></span>
        <span
          class="absolute inset-0 h-2 w-2 animate-ping rounded-full bg-emerald-400 opacity-50"
        ></span>
      </div>
      <span class="flex-1 text-[12px] font-medium text-emerald-400/90">屏幕镜像运行中</span>
      <button
        class="cursor-pointer rounded-md px-2.5 py-1 text-[11px] font-medium text-red-400/70 transition-all hover:bg-red-500/10 hover:text-red-400"
        @click="emit('stopScrcpy')"
      >
        停止
      </button>
    </div>

    <button
      class="mx-5 mb-5 w-full cursor-pointer justify-center rounded-xl py-2 text-[11px] text-white/20 transition-all hover:bg-white/[0.03] hover:text-white/40"
      @click="emit('pairNew')"
    >
      配对新设备
    </button>
  </div>
</template>
