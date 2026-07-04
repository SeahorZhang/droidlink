import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  listDevices: (): Promise<
    { serial: string; model: string; type: 'usb' | 'wireless'; battery: number; storage: string }[]
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
  startScrcpy: (serial?: string): Promise<boolean> => ipcRenderer.invoke('start-scrcpy', serial),
  stopScrcpy: (): Promise<boolean> => ipcRenderer.invoke('stop-scrcpy')
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
