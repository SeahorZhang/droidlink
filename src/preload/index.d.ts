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
  startScrcpy: (
    serial?: string,
    options?: { maxSize?: number; bitRate?: string }
  ) => Promise<boolean>
  stopScrcpy: () => Promise<boolean>
  onScrcpyStopped: (callback: () => void) => void
  listApps: (
    serial: string,
    force?: boolean
  ) => Promise<{ apps: { packageName: string; label: string; icon?: string }[]; version: string }>
  getAppIcon: (serial: string, packageName: string) => Promise<string>
  launchApp: (serial: string, packageName: string) => Promise<{ success: boolean }>
  reinstallCompanion: (serial: string) => Promise<{ success: boolean }>
  resizeWindow: (width: number, height: number) => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
