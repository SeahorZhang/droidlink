import { invoke } from '@tauri-apps/api/core'

// Thin Tauri command wrappers
export const tauri = {
  adb: (args: string[]): Promise<string> => invoke('adb', { args }),
  httpGet: (url: string): Promise<string> => invoke('http_get', { url }),
  readFile: (path: string): Promise<string> => invoke('read_file', { path }),
  writeFile: (path: string, content: string): Promise<void> =>
    invoke('write_file', { path, content }),
  getDataDir: (): Promise<string> => invoke('get_data_dir'),
  getResourceDir: (): Promise<string> => invoke('get_resource_dir'),
  getCompanionApkPath: (): Promise<string> => invoke('get_companion_apk_path')
}
