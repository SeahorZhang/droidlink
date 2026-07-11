<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import MacosTab from './MacosTab.vue'
import { usePairing } from '../composables/usePairing'

const {
  pairState,
  qrDataUrl,
  qrReady,
  pairMessage,
  discoveredAddress,
  generateQr,
  startCodeMode,
  pairWithCode
} = usePairing()

const activeTab = ref('qr')
const pairingCode = ref('')

const tabs = [
  { key: 'qr', label: '扫描二维码' },
  { key: 'code', label: '配对码' }
]

onMounted(() => {
  generateQr()
})

watch(activeTab, (tab) => {
  if (tab === 'code') {
    startCodeMode()
    pairingCode.value = ''
  } else {
    generateQr()
  }
})

watch(pairingCode, (code) => {
  if (code.length === 6 && discoveredAddress.value && pairState.value !== 'pairing') {
    pairWithCode(code)
  }
})

const overlayState = computed(() => {
  if (pairState.value === 'pairing') {
    return { icon: 'loading', color: 'text-amber-400', text: '正在配对', clickable: false }
  }
  if (pairState.value === 'success') {
    return { icon: 'check', color: 'text-emerald-400', text: '配对成功', clickable: false }
  }
  if (pairState.value === 'error') {
    return {
      icon: 'close',
      color: 'text-red-400/80',
      text: pairMessage.value || '配对失败，点击重试',
      clickable: true
    }
  }
  return null
})

const showOverlay = computed(() => overlayState.value !== null)

function handleOverlayClick() {
  if (overlayState.value?.clickable) {
    if (activeTab.value === 'qr') {
      generateQr()
    } else {
      startCodeMode()
      pairingCode.value = ''
    }
  }
}
</script>

<template>
  <div
    class="w-80 rounded-3xl border border-white/8 bg-white/6 p-7 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl"
  >
    <div class="mb-5 flex items-center justify-between">
      <span class="text-[11px] font-medium tracking-wider text-white/35 uppercase">配对</span>
      <MacosTab v-model="activeTab" :tabs="tabs" />
    </div>

    <!-- QR tab -->
    <template v-if="activeTab === 'qr'">
      <div class="mb-4 space-y-1.5 text-[11px] text-white/35">
        <p>1. 请确保Android设备与这台Mac连接到同一Wi-Fi网络。</p>
        <p>2. 在手机上打开开发者选项 > 无线调试 > 使用二维码配对设备。</p>
        <p>3. 扫描下方二维码。</p>
      </div>

      <div
        class="relative mx-auto flex size-42 items-center justify-center overflow-hidden rounded-2xl bg-white p-2"
      >
        <div
          v-if="!qrReady"
          class="size-5 animate-spin rounded-full border-2 border-gray-200 border-t-violet-500"
        ></div>
        <img v-else :src="qrDataUrl" class="size-full select-none" />

        <div
          v-if="showOverlay"
          class="absolute inset-0 flex flex-col items-center justify-center bg-black/70"
          :class="{ 'cursor-pointer': overlayState!.clickable }"
          @click="handleOverlayClick"
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
    </template>

    <!-- Code tab -->
    <template v-else>
      <div class="mb-4 space-y-1.5 text-[11px] text-white/35">
        <p>1. 请确保Android设备与这台Mac连接到同一Wi-Fi网络。</p>
        <p>2. 在手机上打开开发者选项 > 无线调试 > 使用配对码配对设备。</p>
        <p>3. 输入手机上显示的6位配对码。</p>
      </div>

      <div class="flex flex-col items-center gap-3">
        <div
          v-if="pairState === 'waiting' && !discoveredAddress"
          class="flex items-center gap-2 text-[11px] text-white/35"
        >
          <div
            class="size-4 animate-spin rounded-full border-2 border-white/20 border-t-white/60"
          ></div>
          <span>正在搜索设备...</span>
        </div>

        <input
          v-model="pairingCode"
          type="text"
          maxlength="6"
          placeholder="000000"
          :disabled="!discoveredAddress"
          class="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center font-mono text-2xl tracking-[0.3em] text-white/80 outline-none placeholder:text-white/20 focus:border-white/20 disabled:cursor-not-allowed disabled:opacity-40"
        />

        <div
          v-if="pairState !== 'idle'"
          class="flex items-center gap-2"
        >
          <div
            v-if="pairState === 'pairing'"
            class="size-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent"
          ></div>
          <Icon
            v-else-if="pairState === 'success'"
            name="check"
            class="size-4 text-emerald-400"
          />
          <Icon
            v-else-if="pairState === 'error'"
            name="close"
            class="size-4 text-red-400/80"
          />
          <span
            class="text-[11px]"
            :class="{
              'text-amber-400': pairState === 'pairing',
              'text-emerald-400': pairState === 'success',
              'text-red-400/80': pairState === 'error'
            }"
          >
            {{ pairMessage || (pairState === 'pairing' ? '正在配对...' : '') }}
          </span>
        </div>
      </div>
    </template>
  </div>
</template>
