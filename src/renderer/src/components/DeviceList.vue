<script setup lang="ts">
import AppButton from './AppButton.vue'
import Icon from './Icon.vue'

const props = defineProps<{
  devices: Array<{
    serial: string
    model: string
    type: 'usb' | 'wireless'
    battery: number
    storage: string
    androidVersion: string
    screenSize: string
    ipAddress: string
    screenOn: boolean
    deviceName: string
    charging: boolean
  }>
  isLoading: boolean
  isScrcpyRunning: boolean
  settings: { maxSize: number; bitRate: string }
}>()

const emit = defineEmits<{
  refresh: []
  startScrcpy: [serial: string]
  stopScrcpy: []
  disconnect: [serial: string]
  pairNew: []
  'update:settings': [settings: { maxSize: number; bitRate: string }]
}>()
</script>

<template>
  <div
    class="w-96 backdrop-blur-xl bg-white/[0.06] rounded-3xl border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
  >
    <div class="flex items-center justify-between px-5 h-10 border-b border-white/[0.06] box-border">
      <span class="text-[11px] font-medium text-white/35 uppercase tracking-wider">设备</span>
      <button
        class="flex items-center gap-1 text-[11px] text-white/30 hover:text-white/50 transition-colors px-2 py-1 rounded-md hover:bg-white/5 cursor-pointer"
        @click="emit('refresh')"
      >
        <Icon name="refresh" class="w-3 h-3" :class="{ 'animate-spin': isLoading }" />
        {{ isLoading ? '刷新中' : '刷新' }}
      </button>
    </div>

    <div class="p-5 space-y-2">
      <div
        v-for="device in devices"
        :key="device.serial"
        class="group bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.04] hover:border-white/[0.08] rounded-xl px-4 py-3 transition-all duration-150"
      >
        <div class="flex items-center gap-2">
          <span class="text-[13px] text-white/70 truncate">{{
            device.deviceName || device.model
          }}</span>
          <span
            :class="[
              'text-[10px] px-1.5 py-0.5 rounded flex-shrink-0',
              device.type === 'wireless'
                ? 'text-violet-300/50 bg-violet-500/10'
                : 'text-sky-300/50 bg-sky-500/10'
            ]"
          >
            {{ device.type === 'wireless' ? 'Wi-Fi' : 'USB' }}
          </span>
        </div>
        <div class="flex items-center gap-1 gap-x-4 mt-2 flex-wrap">
          <span class="text-[10px] text-white/35 flex items-center gap-1">
            <span
              class="w-1.5 h-1.5 rounded-full"
              :class="device.screenOn ? 'bg-emerald-400' : 'bg-white/20'"
            ></span>
            {{ device.screenOn ? '亮屏' : '息屏' }}
          </span>
          <span class="text-[10px] text-white/35 flex items-center gap-1">
            <Icon
              :name="device.charging ? 'bolt' : 'battery'"
              class="w-3 h-3"
              :class="device.charging ? 'text-emerald-400' : ''"
            />
            {{ device.battery >= 0 ? device.battery + '%' : '-%' }}
          </span>
          <span class="text-[10px] text-white/35 flex items-center gap-1">
            <Icon name="database" class="w-3 h-3" />
            {{ device.storage || '-/-' }}
          </span>
          <span class="text-[10px] text-white/35 flex items-center gap-1">
            <Icon name="phone" class="w-3 h-3" />
            {{ device.androidVersion ? 'Android ' + device.androidVersion : 'Android' }}
          </span>
          <span class="text-[10px] text-white/35 flex items-center gap-1">
            <Icon name="monitor" class="w-3 h-3" />
            {{ device.screenSize || '-x-' }}
          </span>
          <span
            v-if="device.type === 'wireless'"
            class="text-[10px] text-white/35 flex items-center gap-1"
          >
            <Icon name="globe" class="w-3 h-3" />
            {{ device.ipAddress || '-.-.-.-' }}
          </span>
        </div>
        <div class="flex items-center gap-2 mt-2.5">
          <AppButton
            variant="primary"
            :disabled="isScrcpyRunning"
            @click="emit('startScrcpy', device.serial)"
          >
            屏幕镜像
          </AppButton>
          <AppButton v-if="device.type === 'wireless'" @click="emit('disconnect', device.serial)">
            移除设备
          </AppButton>
        </div>
      </div>
    </div>

    <div
      v-if="isScrcpyRunning"
      class="mx-5 mb-5 flex items-center gap-2.5 p-3 bg-emerald-500/[0.08] rounded-2xl border border-emerald-500/10"
    >
      <div class="relative flex-shrink-0">
        <span class="block w-2 h-2 bg-emerald-400 rounded-full"></span>
        <span
          class="absolute inset-0 w-2 h-2 bg-emerald-400 rounded-full animate-ping opacity-50"
        ></span>
      </div>
      <span class="text-[12px] text-emerald-400/90 flex-1 font-medium">屏幕镜像运行中</span>
      <AppButton variant="danger" @click="emit('stopScrcpy')">停止</AppButton>
    </div>

    <AppButton
      variant="link"
      class="mx-5 mb-5 w-full justify-center py-2 rounded-xl"
      @click="emit('pairNew')"
    >
      配对新设备
    </AppButton>
  </div>
</template>
