import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export function useScrcpy() {
  const isRunning = ref(false)

  // Listen for the stopped event from backend
  listen<boolean>('scrcpy-stopped', (event) => {
    isRunning.value = event.payload
  })

  return {
    isRunning,
    start: async (serial?: string, opts?: { maxSize?: number; bitRate?: string }) => {
      isRunning.value = true
      try {
        await invoke('start_scrcpy', { options: { serial, ...opts } })
      } catch {
        isRunning.value = false
      }
    },
    stop: async () => {
      isRunning.value = false
      invoke('stop_scrcpy').catch(() => {})
    }
  }
}
