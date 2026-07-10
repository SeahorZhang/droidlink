import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'

/**
 * 二维码生成结果的接口定义
 * 由 Rust 后端通过 Tauri IPC 返回
 */
interface QrResult {
  /** 二维码是否生成成功 */
  success: boolean
  /** 二维码的 Base64 Data URL（用于直接渲染到 <img> 标签），成功时才存在 */
  qrDataUrl?: string
}

/**
 * 配对状态的接口定义
 * 由 Rust 后端通过轮询接口返回
 */
interface PairingStatus {
  /** 当前配对状态：
   *  - 'idle'    : 空闲，未开始配对
   *  - 'waiting' : 等待扫描二维码
   *  - 'pairing' : 正在配对
   *  - 'success' : 配对成功
   *  - 'error'   : 配对失败
   */
  state: string
  /** 配对状态的详细信息（如错误原因） */
  message: string
}

/**
 * 配对功能的组合式函数（Composable）
 *
 * 负责管理设备配对的完整生命周期：
 *   1. 调用 Rust 后端生成配对二维码
 *   2. 轮询后端获取配对状态（每秒一次）
 *   3. 5 分钟后自动标记二维码过期
 *   4. 配对完成（成功或失败）后自动清理所有定时器
 *
 * @example
 * ```vue
 * <script setup>
 * const { pairState, qrDataUrl, qrReady, qrExpired, generateQr } = usePairing()
 * generateQr() // 开始配对流程
 * </script>
 *
 * <template>
 *   <img v-if="qrReady && !qrExpired" :src="qrDataUrl" />
 *   <p v-if="pairState === 'success'">配对成功</p>
 * </template>
 * ```
 */
export function usePairing() {
  /** 当前配对状态，初始为空闲 */
  const pairState = ref('idle')

  /** 二维码的 Base64 Data URL，初始为空字符串 */
  const qrDataUrl = ref('')

  /** 二维码是否已准备好可以显示 */
  const qrReady = ref(false)

  /** 二维码是否已过期（超过 5 分钟） */
  const qrExpired = ref(false)

  /** 配对状态的详细信息（如错误原因） */
  const pairMessage = ref('')

  /** 轮询定时器 ID，用于后续清除轮询 */
  let poll: ReturnType<typeof setInterval> | null = null

  /** 过期定时器 ID，用于后续清除过期计时 */
  let expire: ReturnType<typeof setTimeout> | null = null

  /**
   * 生成配对二维码并启动状态轮询
   *
   * 执行流程：
   *   1. 重置所有状态标志（qrReady、qrExpired、pairState）
   *   2. 通过 Tauri IPC 调用 Rust 后端的 'generate_pairing_qr' 命令
   *   3. 成功后：设置二维码 URL，启动 5 分钟过期计时器
   *   4. 启动每秒一次的轮询，持续检查配对状态
   *   5. 当状态变为 'success' 或 'error' 时，停止所有定时器
   */
  async function generateQr() {
    // 重置状态，确保每次调用都是干净的起始
    qrReady.value = false
    qrExpired.value = false
    pairState.value = 'waiting'

    // 调用 Rust 后端生成配对二维码
    const result = (await invoke('generate_pairing_qr')) as QrResult
    if (!result.success) return

    // 二维码生成成功，设置显示所需的 Data URL
    // result.qrDataUrl may be undefined, provide a safe fallback to satisfy TypeScript
    qrDataUrl.value = result.qrDataUrl ?? ''
    qrReady.value = !!result.qrDataUrl

    // 启动 5 分钟过期计时器（300000ms = 5min）
    // 如果之前有过期计时器，先清除避免重复
    if (expire) clearTimeout(expire)
    expire = setTimeout(() => {
      qrExpired.value = true
    }, 300000)

    // 启动每秒一次的状态轮询
    // 如果之前有轮询，先清除避免重复
    if (poll) clearInterval(poll)
    poll = setInterval(async () => {
      // 调用 Rust 后端获取当前配对状态
      const status = (await invoke('get_pairing_status')) as PairingStatus
      pairState.value = status.state
      pairMessage.value = status.message

      // 配对结束（成功或失败）时，清理所有定时器
      if (status.state === 'success' || status.state === 'error') {
        clearInterval(poll!)
        poll = null
        if (expire) {
          clearTimeout(expire)
          expire = null
        }
      }
    }, 1000)
  }

  /**
   * 返回响应式状态和方法供组件使用
   *
   * @returns {Object} 配对相关的响应式状态和操作方法
   * @returns {Ref<string>} pairState - 当前配对状态
   * @returns {Ref<string>} qrDataUrl - 二维码 Data URL
   * @returns {Ref<boolean>} qrReady - 二维码是否就绪
   * @returns {Ref<boolean>} qrExpired - 二维码是否过期
   * @returns {Function} generateQr - 生成二维码并开始配对流程
   */
  return { pairState, qrDataUrl, qrReady, qrExpired, pairMessage, generateQr }
}
