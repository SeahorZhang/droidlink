<script setup lang="ts">
import Icon from './Icon.vue'

defineProps<{
  qrDataUrl: string
  qrReady: boolean
  qrExpired: boolean
  pairState: string
  hasDevice: boolean
}>()

const emit = defineEmits<{
  generateQr: []
  close: []
}>()
</script>

<template>
  <div
    class="w-[400px] backdrop-blur-xl bg-white/[0.06] rounded-3xl p-7 border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
  >
    <div class="flex items-center justify-between mb-3">
      <span class="text-[11px] font-medium text-white/35 uppercase tracking-wider">配对</span>
      <button
        v-if="hasDevice"
        class="flex items-center gap-1 text-[11px] text-white/40 hover:text-white/60 transition-colors px-2 py-1 rounded-md hover:bg-white/5 cursor-pointer"
        @click="emit('close')"
      >
        <Icon name="close" class="w-3 h-3" />
        关闭
      </button>
    </div>

    <div class="text-[11px] text-white/35 space-y-1.5 mb-5">
      <p>1. 确保手机与 Mac 连接同一 Wi-Fi</p>
      <p>2. 打开开发者选项 → 无线调试</p>
      <p>3. 点击使用二维码配对设备</p>
      <p>4. 扫描下方二维码</p>
    </div>

    <div class="flex justify-center">
      <div class="relative bg-white rounded-2xl p-2.5 shadow-lg shadow-black/20 flex-shrink-0">
        <div
          v-if="!qrReady"
          class="w-[168px] h-[168px] flex items-center justify-center bg-gray-50 rounded-xl"
        >
          <div
            class="w-5 h-5 border-2 border-gray-200 border-t-violet-500 rounded-full animate-spin"
          ></div>
        </div>
        <img
          v-else
          :src="qrDataUrl"
          alt="配对二维码"
          class="block w-[168px] h-[168px] rounded-xl"
          :class="{
            'opacity-30': qrExpired || pairState === 'pairing' || pairState === 'success'
          }"
        />
        <div
          v-if="qrExpired"
          class="absolute inset-0 flex flex-col items-center justify-center bg-black/40 rounded-2xl cursor-pointer"
          @click="emit('generateQr')"
        >
          <Icon name="refresh" class="w-8 h-8 text-white/80 mb-1" />
          <span class="text-[11px] text-white/80 font-medium">刷新二维码</span>
        </div>
        <div
          v-if="pairState === 'pairing'"
          class="absolute inset-0 flex flex-col items-center justify-center bg-black/40 rounded-2xl"
        >
          <div
            class="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mb-2"
          ></div>
          <span class="text-[12px] text-amber-400 font-medium">正在配对</span>
        </div>
        <div
          v-if="pairState === 'success'"
          class="absolute inset-0 flex flex-col items-center justify-center bg-black/40 rounded-2xl"
        >
          <Icon name="check" class="w-8 h-8 text-emerald-400 mb-1" />
          <span class="text-[12px] text-emerald-400 font-medium">配对成功</span>
        </div>
        <div
          v-if="pairState === 'error'"
          class="absolute inset-0 flex flex-col items-center justify-center bg-black/40 rounded-2xl cursor-pointer"
          @click="emit('generateQr')"
        >
          <Icon name="close" class="w-8 h-8 text-red-400/80 mb-1" />
          <span class="text-[11px] text-red-400/80 font-medium">配对失败，点击重试</span>
        </div>
      </div>
    </div>
  </div>
</template>
