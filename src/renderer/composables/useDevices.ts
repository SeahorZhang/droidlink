import { ref, computed, onMounted, onUnmounted } from 'vue'
import { tauri } from '../api'

/**
 * Android 设备信息的接口定义
 * 包含设备连接状态和基本信息
 */
export interface Device {
  /** 设备序列号（USB 连接为纯数字/字母，无线连接包含冒号或 _tcp） */
  serial: string
  /** 设备型号（如 Pixel 6、Redmi Note 12），未知时回退为 serial */
  model: string
  /** 连接类型：'usb' 有线连接 | 'wireless' 无线连接 */
  type: 'usb' | 'wireless'
  /** 电池电量百分比（0-100），未获取到时为 -1 */
  battery: number
  /** 存储空间（格式：'已用/总量'，如 '12.3G/64G'） */
  storage: string
  /** Android 系统版本（如 '13'、'14'） */
  androidVersion: string
  /** 屏幕分辨率（格式：'宽x高'，如 '1080x2400'） */
  screenSize: string
  /** 设备 IP 地址（仅 Wi-Fi 连接时有效） */
  ipAddress: string
  /** 屏幕是否亮屏 */
  screenOn: boolean
  /** 设备显示名称（品牌 + 市场名称，如 'Xiaomi Redmi Note 12'） */
  deviceName: string
  /** 是否正在充电 */
  charging: boolean
}

/**
 * 解析 `adb devices -l` 命令的原始输出，提取设备列表
 *
 * adb devices -l 输出格式示例：
 *   Serial123     device usb:1-1 product:xxx model:Pixel_6 device:pixel_6 transport_id:1
 *   192.168.1.100:5555     device product:xxx model:Redmi_Note_12 device:xxx transport_id:2
 *
 * @param raw - `adb devices -l` 的原始字符串输出
 * @returns 解析后的设备列表，已按 model 去重
 */
function parseDeviceList(raw: string): Device[] {
  const result: Device[] = []

  for (const line of raw.split('\n')) {
    // 查找 " device " 关键字，这是 adb devices 输出中设备行的标志
    // 格式：<serial> device <properties...>
    const idx = line.indexOf(' device ')
    if (idx === -1) continue

    // 提取序列号（" device " 之前的部分）
    const serial = line.substring(0, idx).trim()
    if (!serial) continue

    // 验证 " device " 后面确实是设备状态（排除其他可能包含 " device " 的字段）
    const rest = line.substring(idx)
    if (!/^\s*device\b/.test(rest)) continue

    // 从属性中提取型号（model:xxx），找不到则回退为序列号
    const modelMatch = rest.match(/model:(\S+)/)
    const model = modelMatch ? modelMatch[1] : serial

    result.push({
      serial,
      model,
      // 判断连接类型：包含 ':'（IP:端口）或 '_tcp' 的是无线连接
      type: serial.includes(':') || serial.includes('_tcp') ? 'wireless' : 'usb',
      // 以下字段在 fetchDeviceInfo 中获取，初始为默认值
      battery: -1,
      storage: '',
      androidVersion: '',
      screenSize: '',
      ipAddress: '',
      screenOn: false,
      deviceName: '',
      charging: false
    })
  }

  // 按 model 去重（同一型号可能通过 USB 和无线同时连接）
  const seen = new Set<string>()
  return result.filter((d) => {
    if (seen.has(d.model)) return false
    seen.add(d.model)
    return true
  })
}

/**
 * 获取单个设备的详细信息
 *
 * 通过 adb shell 命令并行获取多项设备信息，然后解析输出：
 *   - dumpsys battery      → 电量、充电状态
 *   - df /data -h          → 存储空间（人类可读格式）
 *   - getprop ro.build.version.release → Android 版本
 *   - wm size              → 屏幕分辨率
 *   - ip addr show wlan0   → Wi-Fi IP 地址
 *   - dumpsys power         → 屏幕亮屏状态
 *   - getprop ro.product.marketname → 市场名称
 *   - getprop ro.product.brand     → 品牌名称
 *
 * @param serial - 设备序列号
 * @returns 部分设备信息（只包含成功获取的字段）
 */
async function fetchDeviceInfo(serial: string): Promise<Partial<Device>> {
  /**
   * 辅助函数：执行 adb shell 命令，失败时返回空字符串
   * 使用 -s 指定目标设备，确保命令发往正确的设备
   */
  const run = async (args: string[]): Promise<string> => {
    try {
      return await tauri.adb(['-s', serial, 'shell', ...args])
    } catch {
      return ''
    }
  }

  // 并行执行所有 adb shell 命令，提升获取速度
  const [batteryOut, storageOut, versionOut, sizeOut, ipOut, powerOut, nameOut, brandOut] =
    await Promise.all([
      run(['dumpsys', 'battery']), // 电池信息
      run(['df', '/data', '-h']), // 存储空间
      run(['getprop', 'ro.build.version.release']), // Android 版本
      run(['wm', 'size']), // 屏幕分辨率
      run(['ip', 'addr', 'show', 'wlan0']), // Wi-Fi IP 地址
      run(['dumpsys', 'power']), // 电源/屏幕状态
      run(['getprop', 'ro.product.marketname']), // 市场名称
      run(['getprop', 'ro.product.brand']) // 品牌
    ])

  // 解析电池电量（dumpsys battery 输出中的 "level: 85" 格式）
  const battery = batteryOut.match(/level:\s*(\d+)/)?.[1]
    ? parseInt(batteryOut.match(/level:\s*(\d+)/)![1])
    : -1

  // 解析充电状态（status: 3 表示正在充电）
  const charging = batteryOut.match(/status:\s*(\d+)/)?.[1] === '3'

  // 解析存储空间（df 输出的第二行为 /data 分区，格式：Filesystem Size Used Avail Use% Mounted）
  const storageLines = storageOut.trim().split('\n')
  const storage =
    storageLines.length >= 2
      ? (() => {
          const p = storageLines[1].split(/\s+/)
          // 返回 "已用/总量" 格式（如 "12.3G/64G"）
          return p.length >= 4 ? `${p[2]}/${p[1]}` : ''
        })()
      : ''

  // 解析屏幕分辨率（wm size 输出格式："Physical size: 1080x2400"）
  const screenSize = sizeOut.match(/(\d+x\d+)/)?.[1] || ''

  // 解析 IP 地址（ip addr 输出格式："inet 192.168.1.100/24"）
  const ipAddress = ipOut.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/)?.[1] || ''

  // 判断屏幕是否亮屏（mWakefulness=Awake 表示亮屏）
  const screenOn = powerOut.includes('mWakefulness=Awake')

  // 组装设备显示名称：优先使用市场名称，加上品牌前缀（避免重复，如品牌是 Xiaomi，市场名已包含 Xiaomi 则不重复）
  const marketName = nameOut.trim()
  const brand = brandOut.trim()
  const deviceName = marketName
    ? brand && !marketName.startsWith(brand)
      ? `${brand} ${marketName}` // 品牌 + 市场名（如 "Xiaomi Redmi Note 12"）
      : marketName // 市场名已包含品牌（如 "Xiaomi 14"）
    : ''

  return {
    battery,
    storage,
    androidVersion: versionOut.trim(),
    screenSize,
    ipAddress,
    screenOn,
    deviceName,
    charging
  }
}

/**
 * 设备管理功能的组合式函数（Composable）
 *
 * 核心功能：
 *   1. 自动发现已连接的 Android 设备（通过 adb）
 *   2. 并行获取每个设备的详细信息（电量、存储、屏幕等）
 *   3. 每 3 秒自动刷新设备列表（轮询检测设备插拔）
 *   4. 支持断开无线设备连接
 *
 * @example
 * ```vue
 * <script setup>
 * const { devices, isLoading, hasDevice, refreshDevices, disconnectDevice } = useDevices()
 * // 组件挂载时自动开始轮询，卸载时自动停止
 * </script>
 *
 * <template>
 *   <div v-if="isLoading">加载中...</div>
 *   <ul v-else-if="hasDevice">
 *     <li v-for="d in devices" :key="d.model">
 *       {{ d.deviceName }} - {{ d.battery }}%
 *     </li>
 *   </ul>
 *   <div v-else>未检测到设备</div>
 * </template>
 * ```
 */
export function useDevices() {
  /** 设备列表，初始为空 */
  const devices = ref<Device[]>([])

  /** 是否正在加载设备信息 */
  const isLoading = ref(false)

  /** 是否存在已连接的设备（计算属性） */
  const hasDevice = computed(() => devices.value.length > 0)

  /**
   * 刷新设备列表
   *
   * 流程：
   *   1. 调用 `adb devices -l` 获取原始设备列表
   *   2. 解析原始输出，提取设备序列号和基本型号
   *   3. 并行为每个设备获取详细信息（电量、存储等）
   *   4. 合并信息后更新设备列表
   *
   * 出错时清空设备列表，确保 UI 不会显示过时数据
   */
  async function refreshDevices() {
    isLoading.value = true
    try {
      // 获取原始设备列表
      const raw = await tauri.adb(['devices', '-l'])
      // 解析设备列表
      const list = parseDeviceList(raw)
      // 并行为每个设备获取详细信息，合并到设备对象中
      devices.value = await Promise.all(
        list.map(async (d) => ({ ...d, ...(await fetchDeviceInfo(d.serial)) }))
      )
    } catch {
      // 出错时清空设备列表（如 adb 服务未启动、无设备连接）
      devices.value = []
    }
    isLoading.value = false
  }

  /**
   * 断开指定设备的连接
   *
   * 仅适用于无线连接的设备，调用 `adb disconnect <serial>`
   * 断开后自动刷新设备列表
   *
   * @param serial - 要断开的设备序列号
   */
  async function disconnectDevice(serial: string) {
    await tauri.adb(['disconnect', serial])
    await refreshDevices()
  }

  /** 轮询定时器 ID，用于组件卸载时清理 */
  let timer: ReturnType<typeof setInterval> | null = null

  /**
   * 组件挂载时：
   *   1. 立即执行一次刷新（不等待 3 秒）
   *   2. 启动每 3 秒一次的轮询，自动检测设备插拔
   */
  onMounted(() => {
    refreshDevices()
    timer = setInterval(refreshDevices, 3000)
  })

  /**
   * 组件卸载时：
   *   清除轮询定时器，避免内存泄漏
   */
  onUnmounted(() => {
    if (timer) clearInterval(timer)
  })

  /**
   * 返回响应式状态和方法供组件使用
   *
   * @returns {Object} 设备管理相关的响应式状态和操作方法
   * @returns {Ref<Device[]>} devices - 当前连接的设备列表
   * @returns {Ref<boolean>} isLoading - 是否正在加载
   * @returns {ComputedRef<boolean>} hasDevice - 是否存在设备
   * @returns {Function} refreshDevices - 手动刷新设备列表
   * @returns {Function} disconnectDevice - 断开指定设备连接
   */
  return { devices, isLoading, hasDevice, refreshDevices, disconnectDevice }
}
