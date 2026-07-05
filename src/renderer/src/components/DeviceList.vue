<script setup lang="ts">
import { ref, computed } from 'vue'
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
  showAppList: []
  'update:settings': [settings: { maxSize: number; bitRate: string }]
}>()

const showSettings = ref(false)

const deviceScreenSize = computed(() => {
  return props.devices[0]?.screenSize || ''
})

const resolutionOptions = computed(() => [
  { label: deviceScreenSize.value ? `不限制 (${deviceScreenSize.value})` : '不限制', value: 0 },
  { label: '1K', value: 1080 },
  { label: '2K', value: 1440 },
  { label: '4K', value: 2160 }
])

const bitRateOptions = ['8M', '16M', '24M', '32M', '50M']

const setResolution = (value: number): void => {
  emit('update:settings', { ...props.settings, maxSize: value })
}

const setBitRate = (value: string): void => {
  emit('update:settings', { ...props.settings, bitRate: value })
}
</script>

<template>
  <div
    class="w-[600px] backdrop-blur-xl bg-white/[0.06] rounded-3xl p-7 border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
  >
    <div class="flex items-center justify-between mb-3">
      <span class="text-[11px] font-medium text-white/35 uppercase tracking-wider">设备</span>
      <button
        class="flex items-center gap-1 text-[11px] text-white/40 hover:text-white/60 transition-colors px-2 py-1 rounded-md hover:bg-white/5 cursor-pointer"
        @click="emit('refresh')"
      >
        <Icon name="refresh" class="w-3 h-3" :class="{ 'animate-spin': isLoading }" />
        {{ isLoading ? '刷新中' : '刷新' }}
      </button>
    </div>

    <div class="space-y-2">
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
          <button
            class="flex items-center gap-1 text-[11px] text-white/30 hover:text-white/50 transition-colors px-2 py-1 rounded-md hover:bg-white/5 cursor-pointer"
            @click="showSettings = !showSettings"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            设置
          </button>
          <AppButton
            variant="primary"
            :disabled="isScrcpyRunning"
            @click="emit('startScrcpy', device.serial)"
          >
            屏幕镜像
          </AppButton>
          <AppButton :disabled="isScrcpyRunning" @click="emit('showAppList')"> 应用列表 </AppButton>
          <AppButton v-if="device.type === 'wireless'" @click="emit('disconnect', device.serial)">
            移除设备
          </AppButton>
        </div>
      </div>
    </div>

    <div v-if="showSettings" class="mt-3 p-3 bg-white/[0.03] rounded-xl border border-white/[0.05]">
      <div class="mb-3">
        <span class="text-[10px] text-white/30 uppercase tracking-wider block mb-1.5">分辨率</span>
        <div class="flex gap-1.5">
          <button
            v-for="opt in resolutionOptions"
            :key="opt.value"
            :class="[
              'text-[11px] px-2.5 py-1 rounded-md transition-all cursor-pointer',
              settings.maxSize === opt.value
                ? 'bg-white/15 text-white border border-white/20'
                : 'text-white/30 border border-transparent hover:text-white/50 hover:bg-white/5'
            ]"
            @click="setResolution(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
      <div>
        <span class="text-[10px] text-white/30 uppercase tracking-wider block mb-1.5">码率</span>
        <div class="flex gap-1.5">
          <button
            v-for="br in bitRateOptions"
            :key="br"
            :class="[
              'text-[11px] px-2.5 py-1 rounded-md transition-all cursor-pointer',
              settings.bitRate === br
                ? 'bg-white/15 text-white border border-white/20'
                : 'text-white/30 border border-transparent hover:text-white/50 hover:bg-white/5'
            ]"
            @click="setBitRate(br)"
          >
            {{ br }}
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="isScrcpyRunning"
      class="mt-3 flex items-center gap-2.5 p-3 bg-emerald-500/[0.08] rounded-2xl border border-emerald-500/10"
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
      class="mt-4 w-full justify-center py-2 rounded-xl"
      @click="emit('pairNew')"
    >
      配对新设备
    </AppButton>
  </div>
</template>
