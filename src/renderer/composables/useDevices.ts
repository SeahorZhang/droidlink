import { ref, computed, onMounted, onUnmounted } from 'vue'
import { tauri } from '../api'

export interface Device {
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

function parseDeviceList(raw: string): Device[] {
  const result: Device[] = []
  for (const line of raw.split('\n')) {
    const idx = line.indexOf(' device ')
    if (idx === -1) continue
    const serial = line.substring(0, idx).trim()
    if (!serial) continue
    const rest = line.substring(idx)
    if (!/^\s*device\b/.test(rest)) continue
    const modelMatch = rest.match(/model:(\S+)/)
    const model = modelMatch ? modelMatch[1] : serial
    result.push({
      serial,
      model,
      type: serial.includes(':') || serial.includes('_tcp') ? 'wireless' : 'usb',
      battery: -1,
      storage: '',
      androidVersion: '',
      screenSize: '',
      ipAddress: '',
      screenOn: false,
      deviceName: '',
      charging: false
    })
  }
  const seen = new Set<string>()
  return result.filter((d) => {
    if (seen.has(d.model)) return false
    seen.add(d.model)
    return true
  })
}

async function fetchDeviceInfo(serial: string): Promise<Partial<Device>> {
  const run = async (args: string[]): Promise<string> => {
    try {
      return await tauri.adb(['-s', serial, 'shell', ...args])
    } catch {
      return ''
    }
  }
  const [batteryOut, storageOut, versionOut, sizeOut, ipOut, powerOut, nameOut, brandOut] =
    await Promise.all([
      run(['dumpsys', 'battery']),
      run(['df', '/data', '-h']),
      run(['getprop', 'ro.build.version.release']),
      run(['wm', 'size']),
      run(['ip', 'addr', 'show', 'wlan0']),
      run(['dumpsys', 'power']),
      run(['getprop', 'ro.product.marketname']),
      run(['getprop', 'ro.product.brand'])
    ])

  const battery = batteryOut.match(/level:\s*(\d+)/)?.[1]
    ? parseInt(batteryOut.match(/level:\s*(\d+)/)![1])
    : -1
  const charging = batteryOut.match(/status:\s*(\d+)/)?.[1] === '3'
  const storageLines = storageOut.trim().split('\n')
  const storage =
    storageLines.length >= 2
      ? (() => {
          const p = storageLines[1].split(/\s+/)
          return p.length >= 4 ? `${p[2]}/${p[1]}` : ''
        })()
      : ''
  const screenSize = sizeOut.match(/(\d+x\d+)/)?.[1] || ''
  const ipAddress = ipOut.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/)?.[1] || ''
  const screenOn = powerOut.includes('mWakefulness=Awake')
  const marketName = nameOut.trim()
  const brand = brandOut.trim()
  const deviceName = marketName
    ? brand && !marketName.startsWith(brand)
      ? `${brand} ${marketName}`
      : marketName
    : ''

  return {
    battery,
    storage,
    androidVersion: versionOut.trim(),
    screenSize,
    ipAddress,
    screenOn,
    deviceName,
    charging
  }
}

export function useDevices() {
  const devices = ref<Device[]>([])
  const isLoading = ref(false)
  const hasDevice = computed(() => devices.value.length > 0)

  async function refreshDevices() {
    isLoading.value = true
    try {
      const raw = await tauri.adb(['devices', '-l'])
      const list = parseDeviceList(raw)
      devices.value = await Promise.all(
        list.map(async (d) => ({ ...d, ...(await fetchDeviceInfo(d.serial)) }))
      )
    } catch {
      devices.value = []
    }
    isLoading.value = false
  }

  async function disconnectDevice(serial: string) {
    await tauri.adb(['disconnect', serial])
    await refreshDevices()
  }

  let timer: ReturnType<typeof setInterval> | null = null
  onMounted(() => {
    refreshDevices()
    timer = setInterval(refreshDevices, 3000)
  })
  onUnmounted(() => {
    if (timer) clearInterval(timer)
  })

  return { devices, isLoading, hasDevice, refreshDevices, disconnectDevice }
}
