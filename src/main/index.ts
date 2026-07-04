import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { execFile, spawn, ChildProcess } from 'child_process'
import { renderSVG } from 'uqr'
import { Bonjour } from 'bonjour-service'
import { randomInt } from 'crypto'

let scrcpyProcess: ChildProcess | null = null
let bonjour: Bonjour | null = null
let pairingState: 'idle' | 'waiting' | 'pairing' | 'success' | 'error' = 'idle'
let pairingMsg = ''

function getScrcpyPath(): string {
  if (is.dev) return join(__dirname, '../../resources/scrcpy/scrcpy')
  return join(process.resourcesPath, 'scrcpy', 'scrcpy')
}

function getAdbPath(): string {
  if (is.dev) return join(__dirname, '../../resources/scrcpy/adb')
  return join(process.resourcesPath, 'scrcpy', 'adb')
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
    width: 1100,
    height: 720,
    minWidth: 1100,
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

  ipcMain.handle('start-scrcpy', async (_e, serial?: string) => {
    if (scrcpyProcess) {
      scrcpyProcess.kill()
      scrcpyProcess = null
    }
    scrcpyProcess = spawn(getScrcpyPath(), serial ? ['-s', serial] : [], { stdio: 'ignore' })
    scrcpyProcess.on('error', () => {
      scrcpyProcess = null
    })
    scrcpyProcess.on('close', () => {
      scrcpyProcess = null
    })
    return true
  })

  ipcMain.handle('stop-scrcpy', async () => {
    if (scrcpyProcess) {
      scrcpyProcess.kill()
      scrcpyProcess = null
    }
    return true
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (scrcpyProcess) scrcpyProcess.kill()
  if (bonjour) bonjour.destroy()
  if (process.platform !== 'darwin') app.quit()
})
