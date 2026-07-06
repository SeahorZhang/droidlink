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
  listApps: (
    serial: string,
    force?: boolean
  ) => Promise<{ apps: { packageName: string; label: string; icon?: string }[]; version: string }>
  getAppIcon: (serial: string, apkPath: string) => Promise<string | null>
  launchApp: (serial: string, packageName: string) => Promise<{ success: boolean }>
  installCompanion: (serial: string) => Promise<{ success: boolean }>
  uninstallCompanion: (serial: string) => Promise<{ success: boolean }>
  clearAppCache: (serial: string) => Promise<{ success: boolean }>
}

declare global {
  interface Window {
    api: Api
  }
}
