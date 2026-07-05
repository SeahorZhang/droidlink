<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import DeviceList from './components/DeviceList.vue'
import PairingQr from './components/PairingQr.vue'
import AppList from './components/AppList.vue'

interface Device {
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
}

const devices = ref<Device[]>([])
const isScrcpyRunning = ref(false)
const isLoading = ref(false)

// 从本地存储加载设置
const loadSettings = (): { maxSize: number; bitRate: string } => {
  const defaultSettings = { maxSize: 0, bitRate: '50M' }
  try {
    const saved = localStorage.getItem('scrcpySettings')
    if (saved) {
      const parsed = JSON.parse(saved)
      const validBitRates = ['8M', '16M', '24M', '32M', '50M']
      if (parsed.bitRate && !validBitRates.includes(parsed.bitRate)) {
        parsed.bitRate = '50M'
      }
      return { ...defaultSettings, ...parsed }
    }
  } catch {
    // 忽略解析错误
  }
  return defaultSettings
}

const scrcpySettings = ref<{ maxSize: number; bitRate: string }>(loadSettings())

// 监听设置变化并保存到本地存储
watch(
  scrcpySettings,
  (newSettings) => {
    localStorage.setItem('scrcpySettings', JSON.stringify(newSettings))
  },
  { deep: true }
)

const qrDataUrl = ref('')
const qrReady = ref(false)
const pairState = ref<string>('idle')
const pairMsg = ref('')
let refreshTimer: ReturnType<typeof setInterval> | null = null
let pairStatusTimer: ReturnType<typeof setInterval> | null = null
let qrExpireTimer: ReturnType<typeof setTimeout> | null = null
const qrExpired = ref(false)
const showAppList = ref(false)

const hasDevice = computed(() => devices.value.length > 0)
const showPairing = computed(() => !hasDevice.value || showQr.value)
const windowWidth = computed(() => {
  let w = 640 // DeviceList 600 + padding
  if (showPairing.value) w += 440 // PairingQr 400 + gap
  if (showAppList.value) w = Math.max(w, 640)
  return w
})

watch(windowWidth, (w) => {
  window.api.resizeWindow(w, 720)
})

const refreshDevices = async (showLoading = false): Promise<void> => {
  if (showLoading) isLoading.value = true
  const list = await window.api.listDevices()
  isLoading.value = false
  const oldMap = new Map(devices.value.map((d) => [d.serial, d]))
  const newMap = new Map(list.map((d) => [d.serial, d]))
  // 删除不再在线的设备
  devices.value = devices.value.filter((d) => newMap.has(d.serial))
  // 原地更新已有设备属性
  for (const device of devices.value) {
    const fresh = newMap.get(device.serial)
    if (fresh) {
      device.model = fresh.model
      device.type = fresh.type
    }
  }
  // 添加新设备
  for (const d of list) {
    if (!oldMap.has(d.serial)) {
      const newDevice: Device = {
        ...d,
        androidVersion: '',
        screenSize: '',
        ipAddress: '',
        screenOn: false,
        deviceName: '',
        charging: false
      }
      window.api.getDeviceInfo(d.serial).then((info) => {
        newDevice.battery = info.battery
        newDevice.storage = info.storage
        newDevice.androidVersion = info.androidVersion
        newDevice.screenSize = info.screenSize
        newDevice.ipAddress = info.ipAddress
        newDevice.screenOn = info.screenOn
        newDevice.deviceName = info.deviceName
        newDevice.charging = info.charging
      })
      devices.value.push(newDevice)
    }
  }
}

const showQr = ref(false)

watch(showQr, (val) => {
  if (val) generateQr()
})

const generateQr = async (): Promise<void> => {
  qrReady.value = false
  qrExpired.value = false
  pairState.value = 'idle'
  pairMsg.value = ''
  showQr.value = true
  if (qrExpireTimer) clearTimeout(qrExpireTimer)
  const result = await window.api.generatePairingQr()
  if (result.success && result.qrDataUrl) {
    qrDataUrl.value = result.qrDataUrl
    qrReady.value = true
    pairState.value = 'waiting'
    pairMsg.value = '等待手机扫码...'

    qrExpireTimer = setTimeout(() => {
      qrExpired.value = true
    }, 20000)

    if (pairStatusTimer) clearInterval(pairStatusTimer)
    pairStatusTimer = setInterval(async () => {
      const status = await window.api.getPairingStatus()
      pairState.value = status.state
      pairMsg.value = status.message
      if (status.state === 'success' || status.state === 'error') {
        if (pairStatusTimer) clearInterval(pairStatusTimer)
        if (qrExpireTimer) clearTimeout(qrExpireTimer)
        if (status.state === 'success') {
          setTimeout(async () => {
            await refreshDevices()
            if (devices.value.length > 0) showQr.value = false
          }, 1000)
        }
      }
    }, 1000)
  }
}

const startScrcpy = async (serial: string): Promise<void> => {
  isScrcpyRunning.value = true
  await window.api.startScrcpy(serial, { ...scrcpySettings.value })
}

const stopScrcpy = async (): Promise<void> => {
  await window.api.stopScrcpy()
  isScrcpyRunning.value = false
}

const disconnectWireless = async (serial: string): Promise<void> => {
  await window.api.disconnectDevice(serial)
  await refreshDevices()
  if (devices.value.length === 0) showQr.value = false
}

onMounted(async () => {
  await refreshDevices()
  if (devices.value.length === 0) generateQr()
  refreshTimer = setInterval(async () => {
    await refreshDevices()
  }, 3000)
  window.api.onScrcpyStopped(() => {
    isScrcpyRunning.value = false
  })
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  if (pairStatusTimer) clearInterval(pairStatusTimer)
  if (qrExpireTimer) clearTimeout(qrExpireTimer)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  if (pairStatusTimer) clearInterval(pairStatusTimer)
  if (qrExpireTimer) clearTimeout(qrExpireTimer)
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-8">
    <div class="drag-region"></div>
    <div class="traffic-light-pad"></div>
    <div class="flex gap-5 items-start">
      <div>
        <DeviceList
          v-if="hasDevice"
          :devices="devices"
          :is-loading="isLoading"
          :is-scrcpy-running="isScrcpyRunning"
          :settings="scrcpySettings"
          @refresh="() => refreshDevices(true)"
          @start-scrcpy="startScrcpy"
          @stop-scrcpy="stopScrcpy"
          @disconnect="disconnectWireless"
          @pair-new="showQr = true"
          @show-app-list="showAppList = !showAppList"
          @update:settings="(s) => (scrcpySettings = s)"
        />
        <AppList
          v-if="showAppList && hasDevice"
          :serial="devices[0]?.serial || ''"
          @close="showAppList = false"
        />
      </div>
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
    </div>

    <div
      class="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 text-[11px] text-white/15"
    >
      <span class="w-1.5 h-1.5 bg-emerald-500/60 rounded-full"></span>ADB 就绪
    </div>
  </div>
</template>
