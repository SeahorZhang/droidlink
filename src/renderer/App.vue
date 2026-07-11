<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import DeviceList from './components/DeviceList.vue'
import PairingQr from './components/PairingQr.vue'
import RightPanel from './components/RightPanel.vue'
import { useDevices } from './composables/useDevices'
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
const { isRunning: isScrcpyRunning, start: startScrcpy, stop: stopScrcpy } = useScrcpy()

// Current device tracking
const currentSerial = ref('')
const currentDevice = computed(() => devices.value.find((d) => d.serial === currentSerial.value))

// Auto-select first device when devices change
watch(
  devices,
  (newDevices) => {
    if (newDevices.length > 0 && !newDevices.find((d) => d.serial === currentSerial.value)) {
      currentSerial.value = newDevices[0].serial
    }
  },
  { immediate: true }
)

function selectDevice(serial: string) {
  currentSerial.value = serial
}

function pairNew() {
  currentSerial.value = ''
}
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <AppHeader
      :devices="devices"
      :current-serial="currentSerial"
      :is-loading="isLoading"
      @select-device="selectDevice"
      @pair-new="pairNew"
    />

    <div class="flex flex-1 items-center justify-center gap-5 px-8 pt-2">
      <DeviceList
        v-if="hasDevice && currentDevice"
        :device="currentDevice"
        :is-scrcpy-running="isScrcpyRunning"
        @start-scrcpy="startScrcpy"
        @stop-scrcpy="stopScrcpy"
        @disconnect="disconnectDevice"
      />

      <div class="flex">
        <PairingQr v-if="!hasDevice || !currentDevice" :has-device="hasDevice" />

        <RightPanel
          v-if="hasDevice && currentDevice"
          :serial="currentDevice.serial"
          :settings="settings"
          @update:settings="(s) => (settings = s)"
        />
      </div>
    </div>

    <AppFooter />
  </div>
</template>
