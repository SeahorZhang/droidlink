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
    const apkPath = await tauri.getCompanionApkPath()
    await tauri.adb(['-s', serial.value, 'install', '-r', '-g', apkPath])
    await grantPermissions()
    await tauri
      .adb(['-s', serial.value, 'shell', 'am', 'start', '-n', `${COMPANION}/.MainActivity`])
      .catch(() => {})
  }

  const grantPermissions = async () => {
    const run = async (args: string[]) => {
      await tauri.adb(['-s', serial.value, 'shell', ...args]).catch(() => {})
    }
    // Android 标准权限
    await run(['pm', 'grant', COMPANION, 'android.permission.QUERY_ALL_PACKAGES'])
    // MIUI 特殊权限 (appops)
    for (const op of ['QUERY_ALL_PACKAGES', '10004', '10008', '10017', '10020', '10021', '10022', '10033', '10045', '10053']) {
      await run(['appops', 'set', COMPANION, op, 'allow'])
    }
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
    
    // 获取每个应用的图标
    const apps = await Promise.all(
      (r.apps || []).map(async (a: Record<string, string>) => {
        let icon = ''
        try {
          // /icon 端点直接返回 Base64 字符串
          icon = await tauri.httpGet(`http://127.0.0.1:${PORT}/icon?pkg=${a.packageName}`)
        } catch {}
        return {
          packageName: a.packageName,
          label: a.label,
          icon
        }
      })
    )
    
    return {
      apps,
      version: r.version || ''
    }
  }

  async function loadApps(force = false) {
    isLoading.value = true
    try {
      // 先检查并安装伴侣应用（无论是否有缓存）
      if (!(await isInstalled())) {
        await install()
      } else {
        // 确保权限正确（MIUI 可能需要重新授权）
        await grantPermissions()
      }

      const cached = getCache(serial.value)
      
      // 如果有缓存且不是强制刷新，直接使用缓存
      if (!force && cached) {
        apps.value = sort(cached.apps || [])
        isLoading.value = false
        return
      }

      // 从伴侣应用获取应用列表（包含名称和图标）
      const result = await fetchFromCompanion()
      
      // 从 adb 获取第三方应用列表（作为备份）
      const raw = await tauri.adb(['-s', serial.value, 'shell', 'pm', 'list', 'packages', '-3'])
      const adbPkgs = raw
        .split('\n')
        .filter((l) => l.startsWith('package:'))
        .map((l) => l.replace('package:', '').trim())
        .filter(Boolean)

      // 合并：以伴侣应用返回的数据为主
      const companionMap = new Map<string, AppInfo>(
        result.apps.map((a) => [a.packageName, a])
      )
      
      // 添加 adb 中有但伴侣应用中没有的应用
      for (const pkg of adbPkgs) {
        if (!companionMap.has(pkg)) {
          result.apps.push({ packageName: pkg, label: '', icon: '' })
        }
      }

      // 缓存并更新 UI
      setCache(serial.value, result.apps, result.version)
      apps.value = sort(result.apps)
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
