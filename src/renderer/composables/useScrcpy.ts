import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export function useScrcpy() {
  const isRunning = ref(false)

  listen('scrcpy-stopped', () => {
    isRunning.value = false
  })

  return {
    isRunning,
    start: async (serial?: string, opts?: { maxSize?: number; bitRate?: string }) => {
      isRunning.value = true
      await invoke('start_scrcpy', { options: { serial, ...opts } })
    },
    stop: async () => {
      await invoke('stop_scrcpy')
      isRunning.value = false
    }
  }
}
