# Companion App 安装与应用列表获取流程

## 概述

DroidLink 桌面端通过伴侣应用（companion-app）获取手机上已安装应用的名称和图标。本文档描述完整的工作流程。

## 整体架构

```
┌─────────────────┐     HTTP (port 9527)     ┌─────────────────┐
│   桌面端 (Tauri) │ ◄──────────────────────► │  伴侣应用 (Android) │
│                 │                           │                 │
│  - 检测设备      │      adb forward          │  - 获取应用列表    │
│  - 安装 APK     │      tcp:9527 → tcp:9527  │  - 获取应用图标    │
│  - 获取应用列表  │                           │  - 启动 HTTP 服务  │
└─────────────────┘                           └─────────────────┘
```

## 流程详解

### 1. 设备检测

桌面端每 3 秒轮询 `adb devices -l` 检测已连接的 Android 设备。

```typescript
// src/renderer/composables/useDevices.ts
const raw = await tauri.adb(['devices', '-l'])
```

### 2. 伴侣应用安装检测

当用户选择设备后，桌面端检查伴侣应用是否已安装：

```typescript
// src/renderer/composables/useApps.ts
const isInstalled = async () => {
  const out = await tauri.adb(['-s', serial, 'shell', 'pm', 'list', 'packages', COMPANION])
  return out.includes(COMPANION)  // 'com.droidlink.companion'
}
```

### 3. 安装伴侣应用

如果未安装，自动从资源目录安装 APK：

```typescript
const install = async () => {
  // 获取 APK 路径（dev 模式从项目 resources/，build 模式从打包资源）
  const apkPath = await tauri.getCompanionApkPath()
  
  // 使用 adb install 安装
  await tauri.adb(['-s', serial, 'install', '-r', '-g', apkPath])
  
  // 授予必要权限
  await grantPermissions()
  
  // 启动伴侣应用
  await tauri.adb(['-s', serial, 'shell', 'am', 'start', '-n', `${COMPANION}/.MainActivity`])
}
```

#### APK 路径查找逻辑

`get_companion_apk_path` 命令在 Rust 端实现：

1. **Build 模式**：从 Tauri 打包资源目录获取
2. **Dev 模式**：从项目根目录的 `resources/` 查找

```rust
// src-tauri/src/commands.rs
fn find_companion_apk(app: &tauri::AppHandle) -> Result<String, String> {
    // 1. 尝试打包资源目录
    if let Ok(resource_dir) = app.path().resource_dir() {
        let apk = resource_dir.join("companion-app.apk");
        if apk.exists() { return Ok(apk.to_string_lossy().to_string()); }
    }
    
    // 2. dev 模式：向上查找项目根目录
    let mut search_dir = exe_dir.clone();
    for _ in 0..5 {
        if search_dir.join("resources").exists() {
            let apk = search_dir.join("resources/companion-app.apk");
            if apk.exists() { return Ok(apk.to_string_lossy().to_string()); }
        }
        if !search_dir.pop() { break; }
    }
    Err("companion-app.apk not found".to_string())
}
```

### 4. MIUI 权限授予

MIUI 系统需要额外权限才能获取应用列表（无需用户弹窗授权）：

```typescript
const grantPermissions = async () => {
  // Android 标准权限
  await run(['pm', 'grant', COMPANION, 'android.permission.QUERY_ALL_PACKAGES'])
  
  // MIUI 特殊权限 (appops)
  for (const op of ['QUERY_ALL_PACKAGES', '10004', '10008', '10017', '10020', '10021', '10022', '10033', '10045', '10053']) {
    await run(['appops', 'set', COMPANION, op, 'allow'])
  }
}
```

| 权限代码 | 说明 |
|---------|------|
| `QUERY_ALL_PACKAGES` | 查询所有已安装应用 |
| `10004` | MIUI 应用信息读取 |
| `10008` | MIUI 应用权限 |
| `10017` | MIUI 应用权限 |
| `10020` | MIUI 应用权限 |
| `10021` | MIUI 应用图标读取 |
| `10022` | MIUI 应用列表访问 |
| `10033` | MIUI 应用权限 |
| `10045` | MIUI 应用权限 |
| `10053` | MIUI 应用权限 |

### 5. HTTP 端口转发

桌面端通过 adb forward 将本地 9527 端口转发到手机：

```typescript
const forward = () => tauri.adb(['-s', serial, 'forward', 'tcp:9527', 'tcp:9527'])
```

### 6. 伴侣应用 HTTP API

伴侣应用在手机上启动 HTTP 服务器（端口 9527），提供以下 API：

| 端点 | 方法 | 说明 | 返回值 |
|------|------|------|--------|
| `/ping` | GET | 健康检查 | `{"ok":true}` |
| `/apps` | GET | 获取应用列表 | `{"apps":[{"packageName":"...","label":"..."}], "count":N}` |
| `/icon?pkg=<包名>` | GET | 获取应用图标 | Base64 编码的 PNG 图像 |

#### `/apps` 响应示例

```json
{
  "apps": [
    {"packageName": "com.tencent.mm", "label": "微信"},
    {"packageName": "com.tencent.mobileqq", "label": "QQ"}
  ],
  "count": 139,
  "version": "1.0"
}
```

#### `/icon` 响应

返回 Base64 编码的 48x48 PNG 图像，前端直接用于 `<img>` 标签：

```html
<img :src="'data:image/png;base64,' + icon" />
```

### 7. 应用列表加载

```typescript
const loadApps = async (force = false) => {
  // 1. 检查并安装伴侣应用
  if (!(await isInstalled())) {
    await install()
  } else {
    await grantPermissions()  // 确保 MIUI 权限正确
  }

  // 2. 强制刷新时从伴侣应用获取
  if (force || !cached) {
    const result = await fetchFromCompanion()
    // 合并数据...
  }
}
```

### 8. 图标获取

`fetchFromCompanion` 并行获取所有应用的图标：

```typescript
const apps = await Promise.all(
  (r.apps || []).map(async (a) => {
    let icon = ''
    try {
      icon = await tauri.httpGet(`http://127.0.0.1:${PORT}/icon?pkg=${a.packageName}`)
    } catch {}
    return { packageName: a.packageName, label: a.label, icon }
  })
)
```

## 文件结构

```
anddrive/
├── resources/
│   └── companion-app.apk          # 预编译的伴侣应用 APK
├── companion-app/                  # 伴侣应用源码
│   └── app/src/main/java/
│       └── MainActivity.java       # HTTP 服务器实现
├── src-tauri/src/
│   ├── commands.rs                 # get_companion_apk_path 命令
│   └── lib.rs                      # 命令注册
└── src/renderer/composables/
    └── useApps.ts                  # 前端应用列表逻辑
```

## 常见问题

### 1. 图标或名称不显示

**原因**：MIUI 权限未正确设置

**解决**：点击"清除缓存"后重新"刷新"，或手动执行：
```bash
adb shell appops set com.droidlink.companion QUERY_ALL_PACKAGES allow
adb shell appops set com.droidlink.companion 10022 allow
adb shell appops set com.droidlink.companion 10004 allow
adb shell appops set com.droidlink.companion 10021 allow
```

### 2. 伴侣应用未自动安装

**原因**：APK 路径查找失败

**检查**：
```bash
ls -la resources/companion-app.apk
```

### 3. HTTP 请求失败

**原因**：端口转发失败或伴侣应用未运行

**解决**：
```bash
adb forward tcp:9527 tcp:9527
adb shell am start -n com.droidlink.companion/.MainActivity
curl http://127.0.0.1:9527/ping
```
