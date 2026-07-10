<script setup lang="ts">
import { computed, onMounted } from 'vue'
import Icon from './Icon.vue'
import { usePairing } from '../composables/usePairing'

const { pairState, qrDataUrl, qrReady, qrExpired, pairMessage, generateQr } = usePairing()

onMounted(() => {
  generateQr()
})

const overlayState = computed(() => {
  if (pairState.value === 'pairing') {
    return { icon: 'loading', color: 'text-amber-400', text: '正在配对', clickable: false }
  }
  if (pairState.value === 'success') {
    return { icon: 'check', color: 'text-emerald-400', text: '配对成功', clickable: false }
  }
  if (pairState.value === 'error') {
    return { icon: 'close', color: 'text-red-400/80', text: pairMessage.value || '配对失败，点击重试', clickable: true }
  }
  if (qrExpired.value) {
    return { icon: 'refresh', color: 'text-white/80', text: '刷新二维码', clickable: true }
  }
  return null
})

const showOverlay = computed(() => overlayState.value !== null)
</script>

<template>
  <div
    class="w-100 rounded-3xl border border-white/8 bg-white/6 p-7 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl"
  >
    <div class="mb-3 flex items-center justify-between">
      <span class="text-[11px] font-medium tracking-wider text-white/35 uppercase">配对</span>
    </div>

    <div class="mb-5 space-y-1.5 text-[11px] text-white/35">
      <p>1. 请确保Android设备与这台Mac连接到同一Wi-Fi网络。</p>
      <p>2. 在手机上打开开发者选项>无线调试>使用二维码配对设备。</p>
      <p>3. 扫描下方二维码，并在设备连接成功前保持此页面打开。</p>
    </div>

    <div
      class="relative flex size-42 items-center justify-center overflow-hidden rounded-2xl bg-white p-1"
    >
      <div
        v-if="!qrReady"
        class="size-5 animate-spin rounded-full border-2 border-gray-200 border-t-violet-500"
      ></div>
      <img v-else :src="qrDataUrl" class="size-full" />

      <div
        v-if="showOverlay"
        class="absolute inset-0 flex flex-col items-center justify-center bg-black/70"
        :class="{ 'cursor-pointer': overlayState!.clickable }"
        @click="overlayState!.clickable ? generateQr() : undefined"
      >
        <Icon
          v-if="overlayState!.icon !== 'loading'"
          :name="overlayState!.icon"
          class="mb-1 size-8"
          :class="overlayState!.color"
        />
        <div
          v-else
          class="mb-2 size-6 animate-spin rounded-full border-2 border-amber-400 border-t-transparent"
        ></div>
        <span class="text-xs font-medium" :class="overlayState!.color">{{
          overlayState!.text
        }}</span>
      </div>
    </div>
  </div>
</template>
