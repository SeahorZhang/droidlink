package com.anddrive.companion;

import android.app.Activity;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.os.Bundle;
import android.util.Base64;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final String TAG = "AndDrive";
    private static final int PORT = 9527;
    private ServerSocket serverSocket;
    private ExecutorService serverExecutor = Executors.newSingleThreadExecutor();
    private ExecutorService clientExecutor = Executors.newCachedThreadPool();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 触发 MIUI 权限弹窗：主动查询一次包列表
        try {
            getPackageManager().getInstalledPackages(0);
        } catch (Exception e) {
            Log.w(TAG, "Permission check triggered: " + e.getMessage());
        }

        startServer();
    }

    private void startServer() {
        serverExecutor.execute(() -> {
            try {
                serverSocket = new ServerSocket(PORT);
                Log.i(TAG, "Server started on port " + PORT);
                while (!serverSocket.isClosed()) {
                    Socket client = serverSocket.accept();
                    clientExecutor.execute(() -> handleClient(client));
                }
            } catch (Exception e) {
                Log.e(TAG, "Server error", e);
            }
        });
    }

    private void handleClient(Socket client) {
            try {
                BufferedReader reader = new BufferedReader(new InputStreamReader(client.getInputStream()));
                String requestLine = reader.readLine();
                if (requestLine == null) {
                    client.close();
                    return;
                }

                String path = requestLine.split(" ")[1];
                String response;
                int statusCode = 200;

                if ("/apps".equals(path)) {
                    response = getAppsJson();
                } else if (path.startsWith("/icon")) {
                    // /icon?pkg=com.xxx
                    String pkg = path.contains("?") ? path.split("\\?")[1].replace("pkg=", "") : "";
                    response = getIconBase64(pkg);
                    if (response == null) {
                        statusCode = 404;
                        response = "{\"error\":\"not found\"}";
                    }
                } else if ("/ping".equals(path)) {
                    response = "{\"ok\":true}";
                } else {
                    statusCode = 404;
                    response = "{\"error\":\"not found\"}";
                }

                String header = "HTTP/1.1 " + statusCode + " OK\r\n"
                        + "Content-Type: application/json; charset=utf-8\r\n"
                        + "Access-Control-Allow-Origin: *\r\n"
                        + "Content-Length: " + response.getBytes("UTF-8").length + "\r\n"
                        + "\r\n";

                OutputStream os = client.getOutputStream();
                os.write(header.getBytes("UTF-8"));
                os.write(response.getBytes("UTF-8"));
                os.flush();
                client.close();
            } catch (Exception e) {
                Log.e(TAG, "Handle client error", e);
                try { client.close(); } catch (Exception ignored) {}
            }
    }

    private String getAppsJson() {
        try {
            PackageManager pm = getPackageManager();
            JSONArray apps = new JSONArray();

            // 用 shell 命令获取第三方包名（绕过 MIUI 权限限制）
            Process proc = Runtime.getRuntime().exec(new String[]{"sh", "-c", "pm list packages -3"});
            BufferedReader br = new BufferedReader(new InputStreamReader(proc.getInputStream()));
            String line;
            while ((line = br.readLine()) != null) {
                if (!line.startsWith("package:")) continue;
                String pkg = line.substring(8).trim();
                if (pkg.isEmpty()) continue;

                JSONObject obj = new JSONObject();
                obj.put("packageName", pkg);
                try {
                    obj.put("label", pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString());
                } catch (Exception e) {
                    obj.put("label", pkg);
                }
                apps.put(obj);
            }
            proc.waitFor();

            JSONObject result = new JSONObject();
            result.put("apps", apps);
            result.put("count", apps.length());
            return result.toString();
        } catch (Exception e) {
            return "{\"error\":\"" + e.getMessage() + "\"}";
        }
    }

    private String getIconBase64(String packageName) {
        try {
            PackageManager pm = getPackageManager();
            Drawable icon = pm.getApplicationIcon(packageName);
            Bitmap bitmap = drawableToBitmap(icon);
            if (bitmap == null) return null;
            Bitmap scaled = Bitmap.createScaledBitmap(bitmap, 48, 48, true);
            java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
            scaled.compress(Bitmap.CompressFormat.PNG, 60, baos);
            String b64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
            scaled.recycle();
            if (scaled != bitmap) bitmap.recycle();
            return b64;
        } catch (Exception e) {
            return null;
        }
    }

    private Bitmap drawableToBitmap(Drawable drawable) {
        if (drawable instanceof BitmapDrawable) {
            return ((BitmapDrawable) drawable).getBitmap();
        }
        int width = drawable.getIntrinsicWidth();
        int height = drawable.getIntrinsicHeight();
        if (width <= 0) width = 64;
        if (height <= 0) height = 64;
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        drawable.setBounds(0, 0, canvas.getWidth(), canvas.getHeight());
        drawable.draw(canvas);
        return bitmap;
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        try {
            if (serverSocket != null && !serverSocket.isClosed()) {
                serverSocket.close();
            }
        } catch (Exception ignored) {}
        serverExecutor.shutdownNow();
        clientExecutor.shutdownNow();
    }
}
