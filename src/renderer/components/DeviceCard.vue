<script setup lang="ts">
import { ref } from 'vue'
import type { Device } from '../composables/useDevices'
import Icon from './Icon.vue'
import ConfirmDialog from './ConfirmDialog.vue'

defineProps<{
  device: Device
  isScrcpyRunning: boolean
}>()

const emit = defineEmits<{
  startScrcpy: [serial: string]
  disconnect: [serial: string]
}>()

const showConfirm = ref(false)
const pendingSerial = ref('')

function handleDisconnect(serial: string) {
  pendingSerial.value = serial
  showConfirm.value = true
}

function handleConfirm() {
  showConfirm.value = false
  emit('disconnect', pendingSerial.value)
}
</script>

<template>
  <div
    class="group rounded-lg border border-black/8 bg-gray-50 px-4 py-3 transition-all duration-150 hover:border-black/12 hover:bg-gray-100"
  >
    <div class="flex items-center gap-2">
      <span class="truncate text-[13px] text-black/80">{{
        device.deviceName || device.model
      }}</span>
      <span
        :class="[
          'flex-shrink-0 rounded px-1.5 py-0.5 text-[10px]',
          device.type === 'wireless'
            ? 'bg-blue-500/10 text-blue-500'
            : 'bg-indigo-500/10 text-indigo-500'
        ]"
      >
        {{ device.type === 'wireless' ? 'Wi-Fi' : 'USB' }}
      </span>
    </div>

    <div class="mt-2 flex flex-wrap items-center gap-1 gap-x-4">
      <span class="flex items-center gap-1 text-[10px] text-black/40">
        <span
          class="h-1.5 w-1.5 rounded-full"
          :class="device.screenOn ? 'bg-green-500' : 'bg-black/15'"
        ></span>
        {{ device.screenOn ? '亮屏' : '息屏' }}
      </span>
      <span class="flex items-center gap-1 text-[10px] text-black/40">
        <Icon
          :name="device.charging ? 'bolt' : 'battery'"
          class="h-3 w-3"
          :class="device.charging ? 'text-green-500' : ''"
        />
        {{ device.battery >= 0 ? device.battery + '%' : '-%' }}
      </span>
      <span class="flex items-center gap-1 text-[10px] text-black/40">
        <Icon name="database" class="h-3 w-3" />
        {{ device.storage || '-/-' }}
      </span>
      <span class="flex items-center gap-1 text-[10px] text-black/40">
        <Icon name="phone" class="h-3 w-3" />
        {{ device.androidVersion ? 'Android ' + device.androidVersion : 'Android' }}
      </span>
      <span class="flex items-center gap-1 text-[10px] text-black/40">
        <Icon name="monitor" class="h-3 w-3" />
        {{ device.screenSize || '-x-' }}
      </span>
      <span
        v-if="device.type === 'wireless'"
        class="flex items-center gap-1 text-[10px] text-black/40"
      >
        <Icon name="globe" class="h-3 w-3" />
        {{ device.ipAddress || '-.-.-.-' }}
      </span>
    </div>

    <div class="mt-2.5 flex items-center gap-2">
      <button
        :disabled="isScrcpyRunning"
        class="cursor-pointer rounded-md bg-blue-500 px-2.5 py-1 text-[11px] font-medium text-white transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
        @click="emit('startScrcpy', device.serial)"
      >
        屏幕镜像
      </button>
      <button
        v-if="device.type === 'wireless'"
        class="cursor-pointer rounded-md px-2.5 py-1 text-[11px] font-medium text-black/40 transition-all hover:bg-black/5 hover:text-black/60"
        @click="handleDisconnect(device.serial)"
      >
        断开连接
      </button>
    </div>
  </div>

  <ConfirmDialog
    :visible="showConfirm"
    title="断开连接"
    message="设备将被断开连接。

手机端的配对记录仍会保留，设备可能会自动重连。

如需彻底断开，请在手机上手动移除：
开发者选项 > 无线调试 > 已配对的设备 > 移除"
    @confirm="handleConfirm"
    @cancel="showConfirm = false"
  />
</template>
