<script setup lang="ts">
import { ref } from 'vue'
import type { Device } from '../composables/useDevices'
import DeviceSelector from './DeviceSelector.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import BaseButton from './BaseButton.vue'
import SettingsPanel from './SettingsPanel.vue'
import {
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipContent,
  TooltipPortal
} from 'reka-ui'

const props = defineProps<{
  devices: Device[]
  currentSerial: string
  currentDevice: Device | undefined
  isLoading: boolean
  settings: { maxSize: number; bitRate: string }
}>()

const emit = defineEmits<{
  selectDevice: [serial: string]
  pairNew: []
  updateSettings: [settings: { maxSize: number; bitRate: string }]
  disconnect: []
}>()

const showConfirm = ref(false)
const showSettings = ref(false)

function handleConfirm() {
  showConfirm.value = false
  emit('disconnect')
}
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <div class="relative">
      <!-- macOS 红绿灯按钮区域 -->
      <div class="absolute"></div>

      <!-- 可拖拽标题栏 -->
      <div data-tauri-drag-region class="h-12 w-full"></div>

      <!-- 设备选择器 + 操作按钮 -->
      <div class="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
        <TooltipRoot v-if="currentDevice?.type === 'wireless'">
          <TooltipTrigger as-child>
            <BaseButton
              icon="lucide:unplug"
              icon-only
              @click="showConfirm = true"
            />
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent
              :side-offset="8"
              side="bottom"
              class="z-50 rounded-md bg-black/80 px-2.5 py-1.5 text-[11px] font-medium text-white shadow-lg"
            >
              断开连接
            </TooltipContent>
          </TooltipPortal>
        </TooltipRoot>
        <TooltipRoot v-if="currentDevice">
          <TooltipTrigger as-child>
            <BaseButton
              icon="lucide:settings"
              icon-only
              @click="showSettings = true"
            />
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent
              :side-offset="8"
              side="bottom"
              class="z-50 rounded-md bg-black/80 px-2.5 py-1.5 text-[11px] font-medium text-white shadow-lg"
            >
              设置
            </TooltipContent>
          </TooltipPortal>
        </TooltipRoot>
        <DeviceSelector
          v-if="devices.length > 0"
          :devices="devices"
          :current-serial="currentSerial"
          :is-loading="isLoading"
          @select="emit('selectDevice', $event)"
          @pair-new="emit('pairNew')"
        />
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

      <!-- Settings Dialog -->
      <Teleport to="body">
        <div
          v-if="showSettings"
          class="fixed inset-0 z-50 flex items-center justify-center"
          @click.self="showSettings = false"
        >
          <div class="fixed inset-0 bg-black/30 backdrop-blur-sm" @click="showSettings = false" />
          <div
            class="relative z-10 w-[320px] rounded-xl border border-black/8 bg-white p-5 shadow-xl"
          >
            <div class="mb-4 flex items-center justify-between">
              <span class="text-sm font-medium text-black/70">设置</span>
              <BaseButton icon="lucide:x" icon-only @click="showSettings = false" />
            </div>
            <SettingsPanel :settings="settings" @update:settings="(s) => emit('updateSettings', s)" />
          </div>
        </div>
      </Teleport>
    </div>
  </TooltipProvider>
</template>
