<script setup lang="ts">
import type { Device } from '../composables/useDevices'
import Icon from './Icon.vue'

defineProps<{
  device: Device
  isScrcpyRunning: boolean
}>()

const emit = defineEmits<{
  startScrcpy: [serial: string]
  disconnect: [serial: string]
}>()
</script>

<template>
  <div
    class="group rounded-xl border border-white/[0.04] bg-white/[0.03] px-4 py-3 transition-all duration-150 hover:border-white/[0.08] hover:bg-white/[0.05]"
  >
    <div class="flex items-center gap-2">
      <span class="truncate text-[13px] text-white/70">{{
        device.deviceName || device.model
      }}</span>
      <span
        :class="[
          'flex-shrink-0 rounded px-1.5 py-0.5 text-[10px]',
          device.type === 'wireless'
            ? 'bg-violet-500/10 text-violet-300/50'
            : 'bg-sky-500/10 text-sky-300/50'
        ]"
      >
        {{ device.type === 'wireless' ? 'Wi-Fi' : 'USB' }}
      </span>
    </div>

    <div class="mt-2 flex flex-wrap items-center gap-1 gap-x-4">
      <span class="flex items-center gap-1 text-[10px] text-white/35">
        <span
          class="h-1.5 w-1.5 rounded-full"
          :class="device.screenOn ? 'bg-emerald-400' : 'bg-white/20'"
        ></span>
        {{ device.screenOn ? '亮屏' : '息屏' }}
      </span>
      <span class="flex items-center gap-1 text-[10px] text-white/35">
        <Icon
          :name="device.charging ? 'bolt' : 'battery'"
          class="h-3 w-3"
          :class="device.charging ? 'text-emerald-400' : ''"
        />
        {{ device.battery >= 0 ? device.battery + '%' : '-%' }}
      </span>
      <span class="flex items-center gap-1 text-[10px] text-white/35">
        <Icon name="database" class="h-3 w-3" />
        {{ device.storage || '-/-' }}
      </span>
      <span class="flex items-center gap-1 text-[10px] text-white/35">
        <Icon name="phone" class="h-3 w-3" />
        {{ device.androidVersion ? 'Android ' + device.androidVersion : 'Android' }}
      </span>
      <span class="flex items-center gap-1 text-[10px] text-white/35">
        <Icon name="monitor" class="h-3 w-3" />
        {{ device.screenSize || '-x-' }}
      </span>
      <span
        v-if="device.type === 'wireless'"
        class="flex items-center gap-1 text-[10px] text-white/35"
      >
        <Icon name="globe" class="h-3 w-3" />
        {{ device.ipAddress || '-.-.-.-' }}
      </span>
    </div>

    <div class="mt-2.5 flex items-center gap-2">
      <button
        :disabled="isScrcpyRunning"
        class="cursor-pointer rounded-md bg-emerald-500/70 px-2.5 py-1 text-[11px] font-medium text-white/80 transition-all hover:bg-emerald-500/90 hover:text-white disabled:cursor-not-allowed disabled:opacity-20"
        @click="emit('startScrcpy', device.serial)"
      >
        屏幕镜像
      </button>
      <button
        v-if="device.type === 'wireless'"
        class="cursor-pointer rounded-md px-2.5 py-1 text-[11px] font-medium text-white/25 transition-all hover:bg-white/5 hover:text-white/50"
        @click="emit('disconnect', device.serial)"
      >
        移除设备
      </button>
    </div>
  </div>
</template>
