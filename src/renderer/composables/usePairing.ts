import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'

interface QrResult {
  success: boolean
  qrDataUrl?: string
}

interface PairingStatus {
  state: string
}

export function usePairing() {
  const pairState = ref('idle')
  const qrDataUrl = ref('')
  const qrReady = ref(false)
  const qrExpired = ref(false)
  let poll: ReturnType<typeof setInterval> | null = null
  let expire: ReturnType<typeof setTimeout> | null = null

  async function generateQr() {
    qrReady.value = false
    qrExpired.value = false
    pairState.value = 'waiting'

    const result = (await invoke('generate_pairing_qr')) as QrResult
    if (!result.success) return

    qrDataUrl.value = result.qrDataUrl
    qrReady.value = true

    if (expire) clearTimeout(expire)
    expire = setTimeout(() => {
      qrExpired.value = true
    }, 300000)

    if (poll) clearInterval(poll)
    poll = setInterval(async () => {
      const status = (await invoke('get_pairing_status')) as PairingStatus
      pairState.value = status.state
      if (status.state === 'success' || status.state === 'error') {
        clearInterval(poll!)
        poll = null
        if (expire) {
          clearTimeout(expire)
          expire = null
        }
      }
    }, 1000)
  }

  return { pairState, qrDataUrl, qrReady, qrExpired, generateQr }
}
