<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Device } from '../composables/useDevices'
import { Icon } from '@iconify/vue'
import ConfirmDialog from './ConfirmDialog.vue'
import BaseButton from './BaseButton.vue'
import BaseBadge from './BaseBadge.vue'

const props = defineProps<{
  device: Device
  isScrcpyRunning: boolean
}>()

const emit = defineEmits<{
  startScrcpy: [serial: string]
  stopScrcpy: []
  disconnect: [serial: string]
}>()

const showConfirm = ref(false)

function handleConfirm() {
  showConfirm.value = false
  emit('disconnect', '')
}

interface InfoItem {
  icon: string
  label: string
  value: string
  show?: boolean
}

const infoItems = computed<InfoItem[]>(() => [
  {
    icon: 'lucide:smartphone',
    label: 'Android',
    value: props.device.androidVersion || '--'
  },
  {
    icon: 'lucide:monitor',
    label: '分辨率',
    value: props.device.screenSize || '--'
  },
  {
    icon: 'lucide:eye',
    label: '屏幕',
    value: props.device.screenOn ? '亮屏' : '息屏',
    show: true
  },
  {
    icon: 'lucide:factory',
    label: '制造商',
    value: props.device.manufacturer || '--'
  },
  {
    icon: 'lucide:wifi',
    label: 'Wi-Fi',
    value: props.device.wifiName || '--',
    show: props.device.type === 'wireless'
  },
  {
    icon: 'lucide:globe',
    label: 'IP 地址',
    value: props.device.ipAddress || '--',
    show: props.device.type === 'wireless'
  }
])

const visibleItems = computed(() => infoItems.value.filter((item) => item.show !== false))

interface StatItem {
  icon: string
  value: string
  label: string
}

const statItems = computed<StatItem[]>(() => [
  {
    icon: 'lucide:battery',
    value: props.device.battery >= 0 ? props.device.battery + '%' : '--',
    label: '电池'
  },
  {
    icon: 'lucide:hard-drive',
    value: props.device.storage || '--',
    label: '存储'
  },
  {
    icon: 'lucide:cpu',
    value: props.device.memory || '--',
    label: '内存'
  }
])
</script>

<template>
  <div
    class="flex h-[580px] w-80 flex-col rounded-xl border border-black/8 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
  >
    <!-- Device name & model -->
    <div class="mb-3 px-5 py-5">
      <h2 class="max-w-full truncate text-2xl font-semibold text-black/80">
        {{ device.deviceName || device.model }}
      </h2>
      <div class="mt-2.5 flex items-center gap-1.5">
        <span class="text-[11px] text-black/40">{{ device.model }}</span>
        <BaseBadge :label="device.type === 'wireless' ? 'Wi-Fi' : 'USB'" />
      </div>
    </div>

    <!-- Info content -->
    <div class="flex-1 overflow-y-auto px-5 pb-4">
      <!-- Quick stats -->
      <div class="mb-4 grid grid-cols-3 gap-2">
        <div
          v-for="stat in statItems"
          :key="stat.label"
          class="rounded-lg bg-gray-50 py-2.5 text-center"
        >
          <Icon :icon="stat.icon" class="mx-auto h-4 w-4 text-black/40" />
          <p class="mt-1 mb-0.5 text-[11px] font-medium text-black/70">{{ stat.value }}</p>
          <p class="text-[9px] text-black/40">{{ stat.label }}</p>
        </div>
      </div>

      <!-- Info rows -->
      <div class="space-y-0">
        <div
          v-for="(item, index) in visibleItems"
          :key="item.label"
          class="flex items-center gap-3 py-2.5"
          :class="index < visibleItems.length - 1 ? 'border-b border-black/5' : ''"
        >
          <Icon :icon="item.icon" class="h-4 w-4 text-black/30" />
          <span class="flex-1 text-[11px] text-black/50">{{ item.label }}</span>
          <span
            v-if="item.label === '屏幕'"
            class="flex items-center gap-1.5 text-[11px] font-medium text-black/70"
          >
            <span
              class="h-1.5 w-1.5 rounded-full"
              :class="device.screenOn ? 'bg-green-500' : 'bg-black/15'"
            ></span>
            {{ item.value }}
          </span>
          <span v-else class="max-w-[140px] truncate text-[11px] font-medium text-black/70">
            {{ item.value }}
          </span>
        </div>
      </div>
    </div>

    <!-- Screen mirror status -->
    <div
      v-if="isScrcpyRunning"
      class="mx-4 mb-3 flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2"
    >
      <div class="relative flex-shrink-0">
        <span class="block h-1.5 w-1.5 rounded-full bg-green-500"></span>
        <span
          class="absolute inset-0 h-1.5 w-1.5 animate-ping rounded-full bg-green-500 opacity-50"
        ></span>
      </div>
      <span class="flex-1 text-[10px] font-medium text-green-600">屏幕镜像运行中</span>
      <button
        class="cursor-pointer rounded px-2 py-0.5 text-[10px] font-medium text-red-500 transition-all hover:bg-red-500/10"
        @click="emit('stopScrcpy')"
      >
        停止
      </button>
    </div>

    <!-- Actions -->
    <div class="space-y-1.5 px-4 pb-4">
      <BaseButton
        variant="primary"
        icon="lucide:monitor"
        :disabled="isScrcpyRunning"
        @click="emit('startScrcpy', device.serial)"
      >
        屏幕镜像
      </BaseButton>
      <BaseButton
        v-if="device.type === 'wireless'"
        variant="secondary"
        icon="lucide:unplug"
        @click="showConfirm = true"
      >
        断开连接
      </BaseButton>
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
