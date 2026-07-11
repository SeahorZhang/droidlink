import { ref, type Ref } from 'vue'
import { tauri } from '../api'

export interface AppInfo {
  packageName: string
  label: string
  icon?: string
}

const COMPANION = 'com.droidlink.companion'
const PORT = 9527

// Click history via localStorage
const clicks = (): Map<string, number> => {
  try {
    return new Map(Object.entries(JSON.parse(localStorage.getItem('appClickHistory') || '{}')))
  } catch {
    return new Map()
  }
}
const saveClicks = (h: Map<string, number>) =>
  localStorage.setItem('appClickHistory', JSON.stringify(Object.fromEntries(h)))

// App cache via localStorage
const getCache = (s: string) => {
  try {
    return JSON.parse(localStorage.getItem(`appCache_${s}`) || 'null')
  } catch {
    return null
  }
}
const setCache = (s: string, apps: AppInfo[], v: string) =>
  localStorage.setItem(`appCache_${s}`, JSON.stringify({ apps, version: v }))

export function useApps(serial: Ref<string>) {
  const apps = ref<AppInfo[]>([])
  const isLoading = ref(false)
  const isRefreshing = ref(false)

  const sort = (list: AppInfo[]) => {
    const h = clicks()
    return [...list].sort((a, b) => (h.get(b.packageName) || 0) - (h.get(a.packageName) || 0))
  }

  const forward = () => tauri.adb(['-s', serial.value, 'forward', `tcp:${PORT}`, `tcp:${PORT}`])

  const isInstalled = async () => {
    const out = await tauri.adb(['-s', serial.value, 'shell', 'pm', 'list', 'packages', COMPANION])
    return out.includes(COMPANION)
  }

  const install = async () => {
    const dir = await tauri.getDataDir()
    await tauri.adb(['-s', serial.value, 'install', '-r', '-g', `${dir}/../companion-app.apk`])
    for (const op of ['QUERY_ALL_PACKAGES', '10022', '10004', '10021']) {
      await tauri
        .adb(['-s', serial.value, 'shell', 'appops', 'set', COMPANION, op, 'allow'])
        .catch(() => {})
    }
    await tauri
      .adb(['-s', serial.value, 'shell', 'am', 'start', '-n', `${COMPANION}/.MainActivity`])
      .catch(() => {})
  }

  const fetchFromCompanion = async () => {
    await forward()
    for (let i = 0; i < 10; i++) {
      try {
        await tauri.httpGet(`http://127.0.0.1:${PORT}/ping`)
        break
      } catch {
        await new Promise((r) => setTimeout(r, 200))
      }
    }
    const json = await tauri.httpGet(`http://127.0.0.1:${PORT}/apps`)
    const r = JSON.parse(json)
    if (r.error) throw new Error(r.error)
    return {
      apps: (r.apps || []).map((a: Record<string, string>) => ({
        packageName: a.packageName,
        label: a.label,
        icon: ''
      })),
      version: r.version || ''
    }
  }

  async function loadApps(force = false) {
    isLoading.value = true
    try {
      const raw = await tauri.adb(['-s', serial.value, 'shell', 'pm', 'list', 'packages', '-3'])
      const pkgs = raw
        .split('\n')
        .filter((l) => l.startsWith('package:'))
        .map((l) => l.replace('package:', '').trim())
        .filter(Boolean)

      const cached = getCache(serial.value)
      const cachedMap = new Map<string, AppInfo>(
        (cached?.apps || []).map((a: AppInfo) => [a.packageName, a])
      )
      const merged: AppInfo[] = pkgs.map((pkg) => ({
        packageName: pkg,
        label: cachedMap.get(pkg)?.label || '',
        icon: cachedMap.get(pkg)?.icon || ''
      }))

      if (!force && cached) {
        apps.value = sort(merged)
        isLoading.value = false
        return
      }

      if (!(await isInstalled())) await install()
      const result = await fetchFromCompanion()
      const mergedSet = new Set(merged.map((a) => a.packageName))
      for (const a of result.apps) if (!mergedSet.has(a.packageName)) merged.push(a)

      const iconMap = new Map<string, string>(
        cached?.apps
          ?.filter((a: AppInfo) => a.icon)
          .map((a: AppInfo) => [a.packageName, a.icon || '']) || []
      )
      const withIcons = merged.map((a) => ({
        ...a,
        icon: a.icon || iconMap.get(a.packageName) || ''
      }))
      setCache(serial.value, withIcons, result.version)
      apps.value = sort(withIcons)
    } catch (e) {
      console.error('loadApps:', e)
    }
    isLoading.value = false
  }

  async function refreshApps() {
    isRefreshing.value = true
    await loadApps(true)
    isRefreshing.value = false
  }

  async function recordClick(pkg: string) {
    const h = clicks()
    h.set(pkg, Date.now())
    saveClicks(h)
    apps.value = sort(apps.value)
  }

  async function uninstallCompanion() {
    await tauri.adb(['-s', serial.value, 'shell', 'pm', 'uninstall', COMPANION])
    apps.value = []
  }

  async function clearCache() {
    localStorage.removeItem(`appCache_${serial.value}`)
    apps.value = []
    await loadApps(true)
  }

  return {
    apps,
    isLoading,
    isRefreshing,
    loadApps,
    refreshApps,
    recordClick,
    uninstallCompanion,
    clearCache
  }
}
