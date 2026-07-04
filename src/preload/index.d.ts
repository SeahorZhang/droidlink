import { ElectronAPI } from '@electron-toolkit/preload'

interface Device {
  serial: string
  model: string
  type: 'usb' | 'wireless'
  battery: number
  storage: string
}

interface Api {
  listDevices: () => Promise<Device[]>
  getDeviceInfo: (serial: string) => Promise<{
    battery: number
    storage: string
    androidVersion: string
    screenSize: string
    ipAddress: string
    screenOn: boolean
    deviceName: string
    charging: boolean
  }>
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
    electron: ElectronAPI
    api: Api
  }
}
