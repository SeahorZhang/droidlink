import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { execFile, execFileSync, spawn, ChildProcess } from 'child_process'
import { renderSVG } from 'uqr'
import { Bonjour } from 'bonjour-service'
import { randomInt } from 'crypto'
import http from 'http'
import fs from 'fs'

let scrcpyProcess: ChildProcess | null = null
let bonjour: Bonjour | null = null
const appCache = new Map<string, { data: { packageName: string; label: string; icon: string }[]; ts: number; version?: string }>()
let pairingState: 'idle' | 'waiting' | 'pairing' | 'success' | 'error' = 'idle'
let pairingMsg = ''

const COMPANION_PKG = 'com.droidlink.companion'
const COMPANION_PORT = 9527
const COMPANION_VERSION = '1.0' // 与 companion-app build.gradle 中的 versionName 保持一致
const iconDir = join(app.getPath('userData'), 'app-icons')
const clickHistoryPath = join(app.getPath('userData'), 'app-clicks.json')
const appCachePath = join(app.getPath('userData'), 'app-cache.json')

function getIconPath(pkg: string): string {
  return join(iconDir, `${pkg.replace(/[/\\:]/g, '_')}.png`)
}

function loadAppCache(): void {
  try {
    const raw = fs.readFileSync(appCachePath, 'utf-8')
    const entries = JSON.parse(raw) as [string, { data: { packageName: string; label: string; icon: string }[]; ts: number; version?: string }][]
    for (const [key, val] of entries) {
      appCache.set(key, val)
    }
  } catch {}
}

function saveAppCache(): void {
  try {
    fs.writeFileSync(appCachePath, JSON.stringify([...appCache]), 'utf-8')
  } catch {}
}

function isValidImageBuffer(data: Buffer): boolean {
  if (data.length < 8) return false
  const isPng = data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47
  const isJpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
  return isPng || isJpeg
}

function loadIconFromDisk(pkg: string): string {
  try {
    const data = fs.readFileSync(getIconPath(pkg))
    if (!isValidImageBuffer(data)) return ''
    return data.toString('base64')
  } catch {
    return ''
  }
}

function saveIconToDisk(pkg: string, b64: string): void {
  try {
    if (!b64 || b64.length < 100) return
    const buf = Buffer.from(b64, 'base64')
    if (!isValidImageBuffer(buf)) return
    if (!fs.existsSync(iconDir)) fs.mkdirSync(iconDir, { recursive: true })
    fs.writeFileSync(getIconPath(pkg), buf)
  } catch {
    /* ok */
  }
}

function syncIcons(packageNames: string[]): void {
  try {
    if (!fs.existsSync(iconDir)) return
    const pkgSet = new Set(packageNames)
    for (const file of fs.readdirSync(iconDir)) {
      const filePath = join(iconDir, file)
      try {
        const pkg = file.replace('.png', '').replace(/_/g, '/')
        if (!pkgSet.has(pkg)) {
          fs.unlinkSync(filePath)
          continue
        }
        const data = fs.readFileSync(filePath)
        if (!isValidImageBuffer(data)) fs.unlinkSync(filePath)
      } catch {
        /* ok */
      }
    }
  } catch {
    /* ok */
  }
}

// 后台补全缺失图标，不阻塞
function prefetchMissingIcons(serial: string, apps: { packageName: string }[]): void {
  const missing = apps.filter((a) => !loadIconFromDisk(a.packageName)).slice(0, 20)
  if (missing.length === 0) return

  try {
    execFileSync(
      getAdbPath(),
      ['-s', serial, 'forward', `tcp:${COMPANION_PORT}`, `tcp:${COMPANION_PORT}`],
      {
        encoding: 'utf-8',
        timeout: 5000
      }
    )
  } catch {
    return
  }

  // 逐个请求避免并发过多
  let i = 0
  const fetchNext = (): void => {
    if (i >= missing.length) return
    const app = missing[i++]
    httpGet(
      `http://127.0.0.1:${COMPANION_PORT}/icon?pkg=${encodeURIComponent(app.packageName)}`,
      5000
    )
      .then((b64) => {
        if (b64) saveIconToDisk(app.packageName, b64)
        fetchNext()
      })
      .catch(() => {
        fetchNext()
      })
  }
  fetchNext()
}

function loadClickHistory(): Map<string, number> {
  try {
    const data = fs.readFileSync(clickHistoryPath, 'utf-8')
    return new Map(Object.entries(JSON.parse(data)))
  } catch {
    return new Map()
  }
}

function saveClickHistory(history: Map<string, number>): void {
  try {
    fs.writeFileSync(clickHistoryPath, JSON.stringify(Object.fromEntries(history)))
  } catch { /* ok */ }
}

function sortAppsByClick(apps: { packageName: string; label: string; icon?: string }[]): { packageName: string; label: string; icon?: string }[] {
  const history = loadClickHistory()
  return [...apps].sort((a, b) => {
    const ta = history.get(a.packageName) || 0
    const tb = history.get(b.packageName) || 0
    return tb - ta
  })
}

function killScrcpy(): void {
  if (scrcpyProcess) {
    scrcpyProcess.kill('SIGKILL')
    scrcpyProcess = null
  }
  // 清理残留的 adb forward 和 scrcpy 相关进程
  try {
    execFileSync(getAdbPath(), ['forward', '--remove-all'], { encoding: 'utf-8', timeout: 3000 })
  } catch { /* ok */ }
  try {
    execFileSync('pkill', ['-f', 'scrcpy'], { encoding: 'utf-8', timeout: 3000 })
  } catch { /* ok */ }
}

function getScrcpyPath(): string {
  if (is.dev) return join(__dirname, '../../resources/scrcpy/scrcpy')
  return join(process.resourcesPath, 'scrcpy', 'scrcpy')
}

function getAdbPath(): string {
  if (is.dev) return join(__dirname, '../../resources/scrcpy/adb')
  return join(process.resourcesPath, 'scrcpy', 'adb')
}

function getCompanionApkPath(): string {
  if (is.dev) return join(__dirname, '../../resources/companion-app.apk')
  return join(process.resourcesPath, 'companion-app.apk')
}

async function isCompanionInstalled(serial: string): Promise<boolean> {
  try {
    const output = execFileSync(
      getAdbPath(),
      ['-s', serial, 'shell', `pm list packages ${COMPANION_PKG}`],
      { encoding: 'utf-8', timeout: 5000 }
    )
    return output.includes(COMPANION_PKG)
  } catch {
    return false
  }
}

async function installCompanion(serial: string): Promise<boolean> {
  try {
    const apkPath = getCompanionApkPath()
    execFileSync(getAdbPath(), ['-s', serial, 'install', '-r', '-g', apkPath], {
      encoding: 'utf-8',
      timeout: 30000
    })
    // MIUI/HyperOS 需要额外授权查询已安装应用
    try {
      execFileSync(getAdbPath(), ['-s', serial, 'shell', 'appops', 'set', COMPANION_PKG, 'QUERY_ALL_PACKAGES', 'allow'], {
        encoding: 'utf-8', timeout: 5000
      })
      execFileSync(getAdbPath(), ['-s', serial, 'shell', 'appops', 'set', COMPANION_PKG, '10022', 'allow'], {
        encoding: 'utf-8', timeout: 5000
      })
      execFileSync(getAdbPath(), ['-s', serial, 'shell', 'appops', 'set', COMPANION_PKG, '10004', 'allow'], {
        encoding: 'utf-8', timeout: 5000
      })
      execFileSync(getAdbPath(), ['-s', serial, 'shell', 'appops', 'set', COMPANION_PKG, '10021', 'allow'], {
        encoding: 'utf-8', timeout: 5000
      })
    } catch {}
    return true
  } catch (e) {
    console.error('[companion] install failed:', e)
    return false
  }
}

function httpGet(url: string, timeoutMs = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => resolve(data))
    })
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('timeout'))
    })
  })
}

async function fetchAppsViaCompanion(
  serial: string
): Promise<{ apps: { packageName: string; label: string; icon: string }[]; version: string }> {
  // 端口转发 + 启动 app 并行
  const forwardPromise = new Promise<void>((resolve, reject) => {
    execFile(
      getAdbPath(),
      ['-s', serial, 'forward', `tcp:${COMPANION_PORT}`, `tcp:${COMPANION_PORT}`],
      { encoding: 'utf-8', timeout: 5000 },
      (err) => (err ? reject(err) : resolve())
    )
  })
  const startPromise = new Promise<void>((resolve, reject) => {
    execFile(
      getAdbPath(),
      ['-s', serial, 'shell', 'am', 'start', '-n', `${COMPANION_PKG}/.MainActivity`],
      { encoding: 'utf-8', timeout: 5000 },
      (err) => (err ? reject(err) : resolve())
    )
  })
  await Promise.all([forwardPromise, startPromise])

  // 轮询等服务就绪（最多 2 秒）
  for (let i = 0; i < 10; i++) {
    try {
      await httpGet(`http://127.0.0.1:${COMPANION_PORT}/ping`, 500)
      break
    } catch {
      await new Promise((r) => setTimeout(r, 200))
    }
  }

  // 请求数据（一次拿到应用列表 + 版本号）
  const json = await httpGet(`http://127.0.0.1:${COMPANION_PORT}/apps`, 30000)
  const result = JSON.parse(json)

  if (result.error) throw new Error(result.error)

  return {
    apps: result.apps.map((a: { packageName: string; label: string; icon?: string }) => ({
      packageName: a.packageName,
      label: a.label,
      icon: a.icon || ''
    })),
    version: result.version || ''
  }
}

function runAdb(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(getAdbPath(), args, (error, stdout, stderr) => {
      if (error) reject(stderr || error.message)
      else resolve(stdout)
    })
  })
}

function runAdbWithTimeout(args: string[], timeoutMs = 5000): Promise<string> {
  return Promise.race([
    runAdb(args),
    new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))
  ])
}

async function getDeviceInfo(serial: string): Promise<{
  battery: number
  storage: string
  androidVersion: string
  screenSize: string
  ipAddress: string
  screenOn: boolean
  deviceName: string
  charging: boolean
}> {
  const failResult = {
    battery: -1,
    storage: '',
    androidVersion: '',
    screenSize: '',
    ipAddress: '',
    screenOn: false,
    deviceName: '',
    charging: false
  }
  try {
    const results = await Promise.allSettled([
      runAdbWithTimeout(['-s', serial, 'shell', 'dumpsys', 'battery']),
      runAdbWithTimeout(['-s', serial, 'shell', 'df', '/data', '-h']),
      runAdbWithTimeout(['-s', serial, 'shell', 'getprop', 'ro.build.version.release']),
      runAdbWithTimeout(['-s', serial, 'shell', 'wm', 'size']),
      runAdbWithTimeout(['-s', serial, 'shell', 'ip', 'addr', 'show', 'wlan0']),
      runAdbWithTimeout(['-s', serial, 'shell', 'dumpsys', 'power']),
      runAdbWithTimeout(['-s', serial, 'shell', 'getprop', 'ro.product.marketname']),
      runAdbWithTimeout(['-s', serial, 'shell', 'getprop', 'ro.product.brand'])
    ])

    const batteryOutput = results[0].status === 'fulfilled' ? results[0].value : ''
    const storageOutput = results[1].status === 'fulfilled' ? results[1].value : ''
    const versionOutput = results[2].status === 'fulfilled' ? results[2].value : ''
    const sizeOutput = results[3].status === 'fulfilled' ? results[3].value : ''
    const ipOutput = results[4].status === 'fulfilled' ? results[4].value : ''
    const screenOutput = results[5].status === 'fulfilled' ? results[5].value : ''
    const nameOutput = results[6].status === 'fulfilled' ? results[6].value : ''
    const brandOutput = results[7].status === 'fulfilled' ? results[7].value : ''

    const batteryMatch = batteryOutput.match(/level:\s*(\d+)/)
    const battery = batteryMatch ? parseInt(batteryMatch[1]) : -1
    const statusMatch = batteryOutput.match(/status:\s*(\d+)/)
    const charging = statusMatch ? parseInt(statusMatch[1]) === 3 : false

    let storage = ''
    const storageLines = storageOutput.trim().split('\n')
    if (storageLines.length >= 2) {
      const parts = storageLines[1].split(/\s+/)
      if (parts.length >= 4) storage = `${parts[2]}/${parts[1]}`
    }

    const sizeMatch = sizeOutput.match(/(\d+x\d+)/)
    const screenSize = sizeMatch ? sizeMatch[1] : ''

    const ipMatch = ipOutput.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/)
    const ipAddress = ipMatch ? ipMatch[1] : ''

    const screenOn = screenOutput.includes('mWakefulness=Awake')

    const marketName = nameOutput.trim()
    const brand = brandOutput.trim()
    const deviceName = marketName
      ? brand && !marketName.startsWith(brand)
        ? `${brand} ${marketName}`
        : marketName
      : ''

    return {
      battery,
      storage,
      androidVersion: versionOutput.trim(),
      screenSize,
      ipAddress,
      screenOn,
      deviceName,
      charging
    }
  } catch {
    return failResult
  }
}

async function getDeviceWindowTitle(serial: string): Promise<string> {
  try {
    const deviceInfo = await getDeviceInfo(serial)
    return deviceInfo.deviceName || serial
  } catch {
    return serial
  }
}

function spawnScrcpy(args: string[]): void {
  if (scrcpyProcess) {
    scrcpyProcess.kill('SIGKILL')
    scrcpyProcess = null
  }
  console.log('[scrcpy] spawn:', getScrcpyPath(), args)
  scrcpyProcess = spawn(getScrcpyPath(), args, { stdio: 'pipe' })
  scrcpyProcess.stdout?.on('data', (data) => console.log('[scrcpy]', data.toString()))
  scrcpyProcess.stderr?.on('data', (data) => console.log('[scrcpy]', data.toString()))
  scrcpyProcess.on('error', (err) => {
    console.log('[scrcpy] error:', err.message)
    scrcpyProcess = null
    BrowserWindow.getAllWindows()[0]?.webContents.send('scrcpy-stopped')
  })
  scrcpyProcess.on('close', () => {
    scrcpyProcess = null
    BrowserWindow.getAllWindows()[0]?.webContents.send('scrcpy-stopped')
  })
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 720,
    minWidth: 300,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 10 },
    backgroundColor: '#1b1b1f',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  mainWindow.on('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler((d) => {
    shell.openExternal(d.url)
    return { action: 'deny' }
  })
  if (is.dev && process.env['ELECTRON_RENDERER_URL'])
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')
  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))

  // 启动时清理损坏的图标文件
  if (fs.existsSync(iconDir)) {
    for (const file of fs.readdirSync(iconDir)) {
      try {
        const data = fs.readFileSync(join(iconDir, file))
        if (!isValidImageBuffer(data)) fs.unlinkSync(join(iconDir, file))
      } catch {
        /* ok */
      }
    }
  }

  loadAppCache()

  ipcMain.handle('list-devices', async () => {
    try {
      const stdout = await runAdb(['devices', '-l'])
      console.log('[devices] raw:', stdout.trim())
      const devices: {
        serial: string
        model: string
        type: 'usb' | 'wireless'
      }[] = []
      for (const line of stdout.split('\n')) {
        // adb devices -l 格式: "serial device product:xxx model:xxx ..."
        // 序列号可能含空格，用 " device " 分割
        const deviceIdx = line.indexOf(' device ')
        if (deviceIdx === -1) continue
        const serial = line.substring(0, deviceIdx).trim()
        if (!serial) continue
        const rest = line.substring(deviceIdx)
        if (!/^\s*device\b/.test(rest)) continue
        const modelMatch = rest.match(/model:(\S+)/)
        const model = modelMatch ? modelMatch[1] : serial
        devices.push({
          serial,
          model,
          type: serial.includes(':') || serial.includes('_tcp') ? 'wireless' : 'usb'
        })
      }
      const result = devices.filter((d, i, arr) => arr.findIndex((a) => a.model === d.model) === i)
      console.log('[devices] parsed:', result)
      return result
    } catch (e) {
      console.log('[devices] error:', e)
      return []
    }
  })

  ipcMain.handle('get-device-info', async (_e, serial: string) => {
    return await getDeviceInfo(serial)
  })

  // 直接抄 adb-pair-qr 逻辑
  ipcMain.handle('generate-pairing-qr', async () => {
    // 清理旧的 bonjour
    if (bonjour) {
      bonjour.destroy()
      bonjour = null
    }

    // kill-server 清除残留状态，pair 会自动启动干净的 server
    try {
      execFileSync(getAdbPath(), ['kill-server'], { timeout: 3000 })
      // 等待端口释放
      await new Promise((r) => setTimeout(r, 500))
    } catch {}

    const password = randomInt(100000, 999999).toString()
    const ssid = `d${randomInt(100000, 999999)}`
    const qrContent = `WIFI:T:ADB;S:${ssid};P:${password};;`
    const svg = renderSVG(qrContent, { pixelSize: 8 })
    const qrDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

    bonjour = new Bonjour()
    pairingState = 'waiting'
    pairingMsg = '等待手机扫码...'

    let pairingStarted = false
    const stopBonjour = (): void => {
      if (bonjour) {
        bonjour.destroy()
        bonjour = null
      }
    }
    bonjour.find({ type: 'adb-tls-pairing' }, (service) => {
      if (!service.referer) return
      if (pairingStarted) return
      pairingStarted = true
      pairingState = 'pairing'
      pairingMsg = '正在配对...'
      const target = `${service.referer.address}:${service.port}`
      console.log('[pair] service found:', target)

      const proc = spawn(getAdbPath(), ['pair', target, password])
      proc.stdout.on('data', (d) => console.log('[pair]', d.toString().trim()))
      proc.stderr.on('data', (d) => console.log('[pair]', d.toString().trim()))
      proc.on('close', (code) => {
        console.log('[pair] exit:', code)
        pairingState = code === 0 ? 'success' : 'error'
        pairingMsg = code === 0 ? '配对成功！' : '配对失败'
        stopBonjour()
      })
    })

    return { success: true, qrDataUrl, code: password }
  })

  ipcMain.handle('get-pairing-status', () => ({ state: pairingState, message: pairingMsg }))

  ipcMain.handle('disconnect-device', async (_e, serial: string) => {
    try {
      await runAdb(['disconnect', serial])
      return { success: true }
    } catch {
      return { success: false }
    }
  })

  ipcMain.handle(
    'start-scrcpy',
    async (_e, opts: { serial?: string; maxSize?: number; bitRate?: string }) => {
      const args: string[] = opts.serial ? ['-s', opts.serial] : []
      if (opts.bitRate) args.push('-b', opts.bitRate)
      args.push('--video-codec', 'h265')
      args.push('--window-x', 'auto')
      args.push('--window-y', 'auto')
      if (opts.serial) {
        args.push('--window-title', await getDeviceWindowTitle(opts.serial))
      }
      spawnScrcpy(args)
      return true
    }
  )

  ipcMain.handle('stop-scrcpy', async () => {
    killScrcpy()
    return true
  })

  ipcMain.handle('list-apps', async (_e, serial: string, force?: boolean) => {
    // 第一步：用 ADB 快速获取包名列表
    let packages: string[] = []
    try {
      const output = execFileSync(
        getAdbPath(),
        ['-s', serial, 'shell', 'pm', 'list', 'packages', '-3'],
        { encoding: 'utf-8', timeout: 5000 }
      )
      packages = output
        .split('\n')
        .filter((l) => l.startsWith('package:'))
        .map((l) => l.replace('package:', '').trim())
        .filter(Boolean)
    } catch {
      return []
    }

    // 第二步：合并缓存数据（图标 + 名称）
    const cached = appCache.get(serial)
    const cachedMap = new Map((cached?.data || []).map((d) => [d.packageName, d]))
    const merged = packages.map((pkg) => ({
      packageName: pkg,
      label: cachedMap.get(pkg)?.label || '',
      icon: cachedMap.get(pkg)?.icon || ''
    }))

    // 清理缓存中已不存在的包
    if (cached) {
      const pkgSet = new Set(packages)
      cached.data = cached.data.filter((d) => pkgSet.has(d.packageName))
      syncIcons(packages)
    }

    // 第三步：缓存命中，直接返回
    if (!force && cached) {
      return { apps: sortAppsByClick(merged), version: cached.version || '' }
    }

    // 缓存过期或强制刷新，同步等待 companion 数据
    try {
      const installed = await isCompanionInstalled(serial)
      if (!installed) await installCompanion(serial)

      const result = await fetchAppsViaCompanion(serial)
      if (result.version && result.version !== COMPANION_VERSION) {
        await installCompanion(serial)
        const retry = await fetchAppsViaCompanion(serial)
        updateCache(serial, retry.apps, retry.version)
      } else {
        updateCache(serial, result.apps, result.version)
      }
    } catch (e) {
      console.error('[list-apps] companion fetch failed:', e)
    }

    // 用更新后的缓存重新构建返回数据
    const updatedCached = appCache.get(serial)
    if (updatedCached) {
      const updatedMap = new Map(updatedCached.data.map((d) => [d.packageName, d]))
      const updated = packages.map((pkg) => ({
        packageName: pkg,
        label: updatedMap.get(pkg)?.label || '',
        icon: updatedMap.get(pkg)?.icon || ''
      }))
      return { apps: sortAppsByClick(updated), version: updatedCached.version || '' }
    }
    return { apps: sortAppsByClick(merged), version: '' }
  })

  function updateCache(serial: string, apps: { packageName: string; label: string; icon?: string }[], version?: string): void {
    const old = appCache.get(serial)
    const oldMap = new Map((old?.data || []).map((d) => [d.packageName, d]))
    // 保留旧的图标，补全新的
    const merged = apps.map((a) => ({
      ...a,
      icon: oldMap.get(a.packageName)?.icon || ''
    }))
    appCache.set(serial, { data: merged, ts: Date.now(), version })
    saveAppCache()
    syncIcons(merged.map((a) => a.packageName))
    prefetchMissingIcons(serial, merged)
  }

  ipcMain.handle('get-app-icon', async (_e, serial: string, packageName: string) => {
    // 先从磁盘读取
    const disk = loadIconFromDisk(packageName)
    if (disk) return disk

    // 没有缓存，从 companion 拉取
    try {
      execFileSync(
        getAdbPath(),
        ['-s', serial, 'forward', `tcp:${COMPANION_PORT}`, `tcp:${COMPANION_PORT}`],
        {
          encoding: 'utf-8',
          timeout: 5000
        }
      )
      const b64 = await httpGet(
        `http://127.0.0.1:${COMPANION_PORT}/icon?pkg=${encodeURIComponent(packageName)}`,
        5000
      )
      if (b64 && b64.length > 100) {
        saveIconToDisk(packageName, b64)
        return b64
      }
    } catch {
      /* ok */
    }
    return ''
  })

  ipcMain.handle('install-companion', async (_e, serial: string) => {
    try {
      const ok = await installCompanion(serial)
      if (ok) {
        execFile(
          getAdbPath(),
          ['-s', serial, 'shell', 'am', 'start', '-n', `${COMPANION_PKG}/.MainActivity`],
          { encoding: 'utf-8', timeout: 5000 }
        )
      }
      return { success: ok }
    } catch {
      return { success: false }
    }
  })

  ipcMain.handle('uninstall-companion', async (_e, serial: string) => {
    try {
      execFileSync(getAdbPath(), ['-s', serial, 'shell', 'pm', 'uninstall', COMPANION_PKG], {
        encoding: 'utf-8',
        timeout: 10000
      })
      return { success: true }
    } catch {
      return { success: false }
    }
  })

  ipcMain.handle('clear-app-cache', async (_e, serial: string) => {
    appCache.delete(serial)
    saveAppCache()
    return { success: true }
  })

  ipcMain.handle('launch-app', async (_e, serial: string, packageName: string) => {
    // 记录点击历史
    const history = loadClickHistory()
    history.set(packageName, Date.now())
    saveClickHistory(history)

    const args: string[] = []
    if (serial) args.push('-s', serial)
    args.push('--new-display=1920x1080/320')
    args.push('--start-app', packageName)
    args.push('--video-codec', 'h265')
    args.push('--video-bit-rate', '24M')
    args.push('--window-x', 'auto')
    args.push('--window-y', 'auto')
    if (serial) {
      args.push('--window-title', await getDeviceWindowTitle(serial))
    }
    spawnScrcpy(args)
    return { success: true }
  })

  ipcMain.on('resize-window', (_e, width: number, height: number) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      const [minW] = win.getMinimumSize()
      win.setSize(Math.max(width, minW), height)
    }
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // 启动时自动安装 companion app 到所有已连接设备
  installCompanionToAllDevices()
})

async function installCompanionToAllDevices(): Promise<void> {
  try {
    const stdout = execFileSync(getAdbPath(), ['devices'], { encoding: 'utf-8', timeout: 5000 })
    const serials = stdout
      .split('\n')
      .filter((l) => l.endsWith('device'))
      .map((l) => l.split('\t')[0])
      .filter(Boolean)

    for (const serial of serials) {
      try {
        const installed = await isCompanionInstalled(serial)
        if (!installed) {
          console.log(`[companion] installing on ${serial}...`)
          await installCompanion(serial)
          console.log(`[companion] installed on ${serial}`)
        } else {
          console.log(`[companion] already installed on ${serial}`)
        }
      } catch (e) {
        console.error(`[companion] install failed on ${serial}:`, e)
      }
    }
  } catch (e) {
    console.error('[companion] detect devices failed:', e)
  }
}

app.on('window-all-closed', () => {
  if (scrcpyProcess) scrcpyProcess.kill('SIGKILL')
  if (bonjour) bonjour.destroy()
  if (process.platform !== 'darwin') app.quit()
})
