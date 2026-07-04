/// <reference types="vite/client" />

interface Device {
  serial: string
  type: 'usb' | 'wireless'
}

interface Api {
  listDevices: () => Promise<Device[]>
  generatePairingQr: () => Promise<{
    success: boolean
    qrDataUrl?: string
    code?: string
    error?: string
  }>
  getPairingStatus: () => Promise<{ state: string; message: string }>
  disconnectDevice: (serial: string) => Promise<{ success: boolean }>
  startScrcpy: (serial?: string) => Promise<boolean>
  stopScrcpy: () => Promise<boolean>
}

declare global {
  interface Window {
    api: Api
  }
}
