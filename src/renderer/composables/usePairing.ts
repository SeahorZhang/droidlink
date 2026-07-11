import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { renderSVG } from 'uqr'

interface PairingStatus {
  state: string
  message: string
}

interface DiscoveredDevice {
  name: string
  address: string
}

function randPassword(): string {
  const nanos = Date.now() % 1000000
  return String(nanos).padStart(6, '0')
}

export function usePairing() {
  const pairState = ref('idle')
  const qrDataUrl = ref('')
  const qrReady = ref(false)
  const pairMessage = ref('')
  const discoveredAddress = ref('')

  let poll: ReturnType<typeof setInterval> | null = null
  let mode: 'qr' | 'code' = 'qr'

  function startPolling() {
    if (poll) clearInterval(poll)
    poll = setInterval(async () => {
      const [status, devices] = await Promise.all([
        invoke('get_pairing_status') as Promise<PairingStatus>,
        invoke('get_discovered_devices') as Promise<DiscoveredDevice[]>
      ])

      pairState.value = status.state
      pairMessage.value = status.message

      // Auto-pair: QR mode pairs immediately, code mode waits for code
      if (devices.length > 0 && !discoveredAddress.value) {
        discoveredAddress.value = devices[0].address
        if (mode === 'qr') {
          clearInterval(poll!)
          poll = null
          await invoke('pair_device', { address: discoveredAddress.value })
        }
      }

      if (status.state === 'success' || status.state === 'error') {
        clearInterval(poll!)
        poll = null
      }
    }, 1000)
  }

  async function generateQr() {
    mode = 'qr'
    qrReady.value = false
    pairState.value = 'waiting'
    discoveredAddress.value = ''

    const password = randPassword()
    const ssid = `d${randPassword()}`
    const qrContent = `WIFI:T:ADB;S:${ssid};P:${password};;`
    const svgString = renderSVG(qrContent, { ecc: 'M', pixelSize: 8 })
    qrDataUrl.value = `data:image/svg+xml;base64,${btoa(svgString)}`
    qrReady.value = true

    await invoke('start_pairing', { password })
    startPolling()
  }

  async function startCodeMode() {
    mode = 'code'
    pairState.value = 'waiting'
    discoveredAddress.value = ''

    await invoke('start_discovery')
    startPolling()
  }

  async function pairWithCode(code: string) {
    if (!discoveredAddress.value) return
    pairState.value = 'pairing'
    pairMessage.value = '正在配对...'
    await invoke('pair_device_with_code', { address: discoveredAddress.value, code })
    startPolling()
  }

  async function cancelPairing() {
    if (poll) {
      clearInterval(poll)
      poll = null
    }
    await invoke('cancel_pairing')
    pairState.value = 'idle'
    pairMessage.value = ''
    discoveredAddress.value = ''
  }

  return {
    pairState,
    qrDataUrl,
    qrReady,
    pairMessage,
    discoveredAddress,
    generateQr,
    startCodeMode,
    pairWithCode,
    cancelPairing
  }
}
