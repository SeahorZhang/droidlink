<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import DeviceList from './components/DeviceList.vue'
import PairingQr from './components/PairingQr.vue'
import RightPanel from './components/RightPanel.vue'
import { useDevices } from './composables/useDevices'
import { usePairing } from './composables/usePairing'
import { useScrcpy } from './composables/useScrcpy'
import AppHeader from './components/AppHeader.vue'
import AppFooter from './components/AppFooter.vue'

// Settings
const loadSettings = (): { maxSize: number; bitRate: string } => {
  const saved = localStorage.getItem('scrcpySettings')
  if (saved) {
    try {
      return { maxSize: 0, bitRate: '50M', ...JSON.parse(saved) }
    } catch {}
  }
  return { maxSize: 0, bitRate: '50M' }
}
const settings = ref(loadSettings())
watch(settings, (s) => localStorage.setItem('scrcpySettings', JSON.stringify(s)), { deep: true })

// Composables
const { devices, isLoading, hasDevice, refreshDevices, disconnectDevice } = useDevices()
const { pairState, qrDataUrl, qrReady, qrExpired, generateQr } = usePairing()
const { isRunning: isScrcpyRunning, start: startScrcpy, stop: stopScrcpy } = useScrcpy()

// UI state
const showQr = ref(false)

// Generate QR when showing pairing panel
watch(showQr, (val) => {
  if (val) generateQr()
})

// Auto-generate QR on mount if no devices
onMounted(() => {
  if (!hasDevice.value) showQr.value = true
})
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <AppHeader />

    <div class="flex flex-1 items-center justify-center gap-5 px-8 pt-2">
      <DeviceList
        v-if="hasDevice"
        :devices="devices"
        :is-loading="isLoading"
        :is-scrcpy-running="isScrcpyRunning"
        @refresh="refreshDevices"
        @start-scrcpy="startScrcpy"
        @stop-scrcpy="stopScrcpy"
        @disconnect="disconnectDevice"
        @pair-new="showQr = true"
      />

      <div class="flex">
        <PairingQr
          v-if="!hasDevice || showQr"
          :qr-data-url="qrDataUrl"
          :qr-ready="qrReady"
          :qr-expired="qrExpired"
          :pair-state="pairState"
          :has-device="hasDevice"
          @generate-qr="generateQr"
          @close="showQr = false"
        />

        <RightPanel
          v-if="hasDevice"
          :serial="devices[0]?.serial"
          :settings="settings"
          @update:settings="(s) => (settings = s)"
        />
      </div>
    </div>

    <AppFooter />
  </div>
</template>
