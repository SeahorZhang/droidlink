import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  listDevices: (): Promise<
    { serial: string; model: string; type: 'usb' | 'wireless' }[]
  > => ipcRenderer.invoke('list-devices'),
  getDeviceInfo: (
    serial: string
  ): Promise<{
    battery: number
    storage: string
    androidVersion: string
    screenSize: string
    ipAddress: string
    screenOn: boolean
    deviceName: string
    charging: boolean
  }> => ipcRenderer.invoke('get-device-info', serial),
  generatePairingQr: (): Promise<{
    success: boolean
    qrDataUrl?: string
    code?: string
    error?: string
  }> => ipcRenderer.invoke('generate-pairing-qr'),
  getPairingStatus: (): Promise<{ state: string; message: string }> =>
    ipcRenderer.invoke('get-pairing-status'),
  disconnectDevice: (serial: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('disconnect-device', serial),
  startScrcpy: (
    serial?: string,
    options?: { maxSize?: number; bitRate?: string }
  ): Promise<boolean> => ipcRenderer.invoke('start-scrcpy', { serial, ...options }),
  stopScrcpy: (): Promise<boolean> => ipcRenderer.invoke('stop-scrcpy'),
  onScrcpyStopped: (callback: () => void): void => {
    ipcRenderer.on('scrcpy-stopped', () => callback())
  },
  listApps: (
    serial: string,
    force?: boolean
  ): Promise<{ apps: { packageName: string; label: string; icon?: string }[]; version: string }> =>
    ipcRenderer.invoke('list-apps', serial, force),
  getAppIcon: (serial: string, packageName: string): Promise<string> =>
    ipcRenderer.invoke('get-app-icon', serial, packageName),
  launchApp: (serial: string, packageName: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('launch-app', serial, packageName),
  installCompanion: (serial: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('install-companion', serial),
  uninstallCompanion: (serial: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('uninstall-companion', serial),
  clearAppCache: (serial: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('clear-app-cache', serial),
  resizeWindow: (width: number, height: number): void => {
    ipcRenderer.send('resize-window', width, height)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore fallback for non-isolated context
  window.electron = electronAPI
  // @ts-ignore fallback for non-isolated context
  window.api = api
}
