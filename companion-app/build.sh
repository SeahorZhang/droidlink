#!/bin/bash
# 构建 companion app APK
# 用法: ./build.sh

set -e

cd "$(dirname "$0")"

# 如果没有 gradle wrapper，用 Android Studio 自带的
if [ ! -f gradlew ]; then
    echo "请先在 Android Studio 中打开此项目，它会自动生成 gradle wrapper"
    echo "或者运行: gradle wrapper --gradle-version 8.4"
    exit 1
fi

chmod +x gradlew
./gradlew assembleRelease

# 复制 APK 到 Electron resources 目录
APK_SRC="app/build/outputs/apk/release/app-release-unsigned.apk"
APK_DST="../resources/companion-app.apk"

if [ -f "$APK_SRC" ]; then
    cp "$APK_SRC" "$APK_DST"
    echo "APK 已复制到 $APK_DST"
else
    echo "APK 未找到: $APK_SRC"
    echo "尝试 debug 版本..."
    ./gradlew assembleDebug
    APK_SRC="app/build/outputs/apk/debug/app-debug.apk"
    if [ -f "$APK_SRC" ]; then
        cp "$APK_SRC" "$APK_DST"
        echo "Debug APK 已复制到 $APK_DST"
    fi
fi
