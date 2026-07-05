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
const appCache = new Map<string, { data: { packageName: string; label: string }[]; ts: number }>()
const APP_CACHE_TTL = 5 * 60 * 1000
let pairingState: 'idle' | 'waiting' | 'pairing' | 'success' | 'error' = 'idle'
let pairingMsg = ''

const COMPANION_PKG = 'com.anddrive.companion'
const COMPANION_PORT = 9527
const iconDir = join(app.getPath('userData'), 'app-icons')
const clickHistoryPath = join(app.getPath('userData'), 'app-clicks.json')

function getIconPath(pkg: string): string {
  return join(iconDir, `${pkg.replace(/[/\\:]/g, '_')}.png`)
}

function loadIconFromDisk(pkg: string): string | '' {
  try {
    const data = fs.readFileSync(getIconPath(pkg))
    return data.toString('base64')
  } catch {
    return ''
  }
}

function saveIconToDisk(pkg: string, b64: string): void {
  try {
    if (!fs.existsSync(iconDir)) fs.mkdirSync(iconDir, { recursive: true })
    fs.writeFileSync(getIconPath(pkg), Buffer.from(b64, 'base64'))
  } catch {
    /* ok */
  }
}

function syncIcons(packageNames: string[]): void {
  try {
    if (!fs.existsSync(iconDir)) return
    const pkgSet = new Set(packageNames)
    for (const file of fs.readdirSync(iconDir)) {
      const pkg = file.replace('.png', '').replace(/_/g, '/')
      if (!pkgSet.has(pkg)) {
        fs.unlinkSync(join(iconDir, file))
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

  execFileSync(
    getAdbPath(),
    ['-s', serial, 'forward', `tcp:${COMPANION_PORT}`, `tcp:${COMPANION_PORT}`],
    {
      encoding: 'utf-8',
      timeout: 5000
    }
  )

  for (const app of missing) {
    httpGet(
      `http://127.0.0.1:${COMPANION_PORT}/icon?pkg=${encodeURIComponent(app.packageName)}`,
      5000
    )
      .then((b64) => {
        if (b64) saveIconToDisk(app.packageName, b64)
      })
      .catch(() => {})
  }
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
): Promise<{ packageName: string; label: string; icon?: string }[]> {
  // 端口转发
  console.log('[companion] forwarding port...')
  execFileSync(
    getAdbPath(),
    ['-s', serial, 'forward', `tcp:${COMPANION_PORT}`, `tcp:${COMPANION_PORT}`],
    {
      encoding: 'utf-8',
      timeout: 5000
    }
  )

  // 启动 companion app
  console.log('[companion] starting app...')
  execFileSync(
    getAdbPath(),
    ['-s', serial, 'shell', 'am', 'start', '-n', `${COMPANION_PKG}/.MainActivity`],
    { encoding: 'utf-8', timeout: 5000 }
  )

  // 等服务启动
  await new Promise((r) => setTimeout(r, 1000))

  // 请求数据
  console.log('[companion] fetching apps from http://127.0.0.1:' + COMPANION_PORT + '/apps')
  const json = await httpGet(`http://127.0.0.1:${COMPANION_PORT}/apps`, 30000)
  console.log('[companion] response length:', json.length)
  const result = JSON.parse(json)

  if (result.error) throw new Error(result.error)
  console.log('[companion] apps count:', result.count)

  return result.apps.map((a: { packageName: string; label: string; icon?: string }) => ({
    packageName: a.packageName,
    label: a.label,
    icon: a.icon || ''
  }))
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

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 720,
    minWidth: 300,
    minHeight: 400,
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

  ipcMain.handle('list-devices', async () => {
    try {
      const stdout = await runAdb(['devices', '-l'])
      const devices: {
        serial: string
        model: string
        type: 'usb' | 'wireless'
        battery: number
        storage: string
      }[] = []
      for (const line of stdout.split('\n')) {
        const match = line.match(/^(\S+)\s+device\b/)
        if (match) {
          const serial = match[1]
          const modelMatch = line.match(/model:(\S+)/)
          const model = modelMatch ? modelMatch[1] : serial
          devices.push({
            serial,
            model,
            type: serial.includes(':') || serial.includes('_tcp') ? 'wireless' : 'usb',
            battery: -1,
            storage: ''
          })
        }
      }
      return devices.filter((d, i, arr) => arr.findIndex((a) => a.model === d.model) === i)
    } catch {
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

    const password = randomInt(100000, 999999).toString()
    const ssid = `d${randomInt(100000, 999999)}`
    const qrContent = `WIFI:T:ADB;S:${ssid};P:${password};;`
    const svg = renderSVG(qrContent, { pixelSize: 8 })
    const qrDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

    bonjour = new Bonjour()
    pairingState = 'waiting'
    pairingMsg = '等待手机扫码...'

    bonjour.find({ type: 'adb-tls-pairing' }, (service) => {
      if (!service.referer) return
      pairingState = 'pairing'
      pairingMsg = '正在配对...'
      const target = `${service.referer.address}:${service.port}`
      console.log('[pair] service found:', target)

      const proc = spawn(getAdbPath(), ['pair', target, password])
      proc.stdout.on('data', (d) => console.log('[pair]', d.toString().trim()))
      proc.stderr.on('data', (d) => console.log('[pair]', d.toString().trim()))
      proc.on('close', (code) => {
        console.log('[pair] exit:', code)
        if (code === 0) {
          pairingMsg = '配对成功，正在连接...'
          bonjour?.find({ type: 'adb-tls-connect' }, (connectService) => {
            if (!connectService.referer) return
            const connectTarget = `${connectService.referer.address}:${connectService.port}`
            console.log('[connect] found:', connectTarget)
            const connectProc = spawn(getAdbPath(), ['connect', connectTarget])
            connectProc.stdout.on('data', (d) => console.log('[connect]', d.toString().trim()))
            connectProc.stderr.on('data', (d) => console.log('[connect]', d.toString().trim()))
            connectProc.on('close', (connectCode) => {
              console.log('[connect] exit:', connectCode)
              pairingState = connectCode === 0 ? 'success' : 'error'
              pairingMsg = connectCode === 0 ? '连接成功！' : '连接失败'
              if (bonjour) {
                bonjour.destroy()
                bonjour = null
              }
            })
          })
        } else {
          pairingState = 'error'
          pairingMsg = '配对失败'
          if (bonjour) {
            bonjour.destroy()
            bonjour = null
          }
        }
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
      if (scrcpyProcess) {
        scrcpyProcess.kill('SIGKILL')
        scrcpyProcess = null
      }
      const args: string[] = opts.serial ? ['-s', opts.serial] : []
      if (opts.bitRate) args.push('-b', opts.bitRate)
      // 使用H.265编码，画质更好
      args.push('--video-codec', 'h265')
      // 让scrcpy窗口始终在app上方
      // args.push('--always-on-top')
      // 设置窗口居中显示
      args.push('--window-x', 'auto')
      args.push('--window-y', 'auto')
      // 获取设备型号并设置为窗口标题
      if (opts.serial) {
        try {
          const deviceInfo = await getDeviceInfo(opts.serial)
          const windowTitle = deviceInfo.deviceName || opts.serial
          args.push('--window-title', windowTitle)
        } catch {
          // 获取失败时使用序列号作为标题
          args.push('--window-title', opts.serial)
        }
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
      scrcpyProcess.on('close', (code) => {
        console.log('[scrcpy] close:', code)
        scrcpyProcess = null
        BrowserWindow.getAllWindows()[0]?.webContents.send('scrcpy-stopped')
      })
      return true
    }
  )

  ipcMain.handle('stop-scrcpy', async () => {
    killScrcpy()
    return true
  })

  ipcMain.handle('list-apps', async (_e, serial: string, force?: boolean) => {
    if (!force) {
      const cached = appCache.get(serial)
      if (cached && Date.now() - cached.ts < APP_CACHE_TTL) {
        console.log('[list-apps] cache hit:', cached.data.length, 'apps')
        return sortAppsByClick(cached.data)
      }
    }

    // 优先用 companion app（快，有名称）
    try {
      const installed = await isCompanionInstalled(serial)
      console.log('[list-apps] companion installed:', installed)
      if (!installed) {
        console.log('[list-apps] installing companion app...')
        const ok = await installCompanion(serial)
        console.log('[list-apps] install result:', ok)
        if (!ok) throw new Error('install failed')
      }
      const data = await fetchAppsViaCompanion(serial)
      console.log('[list-apps] sample:', JSON.stringify(data.slice(0, 3)))
      // 同步图标缓存：删除旧的，补全缺失的
      syncIcons(data.map((a) => a.packageName))
      prefetchMissingIcons(serial, data)
      appCache.set(serial, { data, ts: Date.now() })
      return sortAppsByClick(data)
    } catch (e) {
      console.error('[list-apps] companion failed, fallback:', e)
    }

    // 回退：adb 命令（只有包名）
    try {
      const output = execFileSync(
        getAdbPath(),
        ['-s', serial, 'shell', 'cmd package list packages -3'],
        { encoding: 'utf-8', timeout: 10000 }
      )
      const data = output
        .split('\n')
        .filter((l) => l.startsWith('package:'))
        .map((l) => l.replace('package:', '').trim())
        .filter(Boolean)
        .map((pkg) => ({ packageName: pkg, label: '' }))

      console.log('[list-apps] fallback data:', data.length, 'apps')
      appCache.set(serial, { data, ts: Date.now() })
      return sortAppsByClick(data)
    } catch {
      return []
    }
  })

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
      if (b64) {
        saveIconToDisk(packageName, b64)
        return b64
      }
    } catch {
      /* ok */
    }
    return ''
  })

  ipcMain.handle('launch-app', async (_e, serial: string, packageName: string) => {
    // 记录点击历史
    const history = loadClickHistory()
    history.set(packageName, Date.now())
    saveClickHistory(history)

    try {
      if (scrcpyProcess) {
        scrcpyProcess.kill('SIGKILL')
        scrcpyProcess = null
      }
      const args: string[] = []
      if (serial) args.push('-s', serial)
      args.push('--new-display=1920x1080/320')
      args.push('--start-app', packageName)
      args.push('--video-codec', 'h265')
      args.push('--video-bit-rate', '24M')
      args.push('--window-x', 'auto')
      args.push('--window-y', 'auto')
      if (serial) {
        try {
          const deviceInfo = await getDeviceInfo(serial)
          args.push('--window-title', deviceInfo.deviceName || serial)
        } catch {
          args.push('--window-title', serial)
        }
      }
      scrcpyProcess = spawn(getScrcpyPath(), args, { stdio: 'pipe' })
      scrcpyProcess.on('error', (err) => {
        console.log('[scrcpy] error:', err.message)
        scrcpyProcess = null
        BrowserWindow.getAllWindows()[0]?.webContents.send('scrcpy-stopped')
      })
      scrcpyProcess.on('close', () => {
        scrcpyProcess = null
        BrowserWindow.getAllWindows()[0]?.webContents.send('scrcpy-stopped')
      })
      return { success: true }
    } catch {
      return { success: false }
    }
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
