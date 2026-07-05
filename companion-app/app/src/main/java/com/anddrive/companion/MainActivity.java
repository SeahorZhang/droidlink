package com.anddrive.companion;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;

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
    private TextView statusText;
    private Button permissionButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        // 沉浸式状态栏
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            Window window = getWindow();
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(0x00000000);
            window.setNavigationBarColor(0x00000000);
            window.getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }

        statusText = findViewById(R.id.statusText);
        permissionButton = findViewById(R.id.permissionButton);

        // 版本号
        try {
            PackageInfo pInfo = getPackageManager().getPackageInfo(getPackageName(), 0);
            TextView versionText = findViewById(R.id.versionText);
            versionText.setText("v" + pInfo.versionName);
        } catch (Exception e) {}

        // 检查权限
        checkPermission();

        permissionButton.setOnClickListener(v -> {
            try {
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.fromParts("package", getPackageName(), null));
                startActivity(intent);
            } catch (Exception e) {
                try {
                    startActivity(new Intent(Settings.ACTION_MANAGE_APPLICATIONS_SETTINGS));
                } catch (Exception ignored) {}
            }
        });

        startServer();
    }

    @Override
    protected void onResume() {
        super.onResume();
        checkPermission();
    }

    private void checkPermission() {
        statusText.postDelayed(() -> {
            boolean granted = false;
            try {
                java.util.List<PackageInfo> packages = getPackageManager().getInstalledPackages(0);
                for (PackageInfo pInfo : packages) {
                    if ((pInfo.applicationInfo.flags & ApplicationInfo.FLAG_SYSTEM) == 0
                            && !pInfo.packageName.equals(getPackageName())) {
                        granted = true;
                        break;
                    }
                }
            } catch (Exception e) {}
            final boolean hasPerm = granted;
            runOnUiThread(() -> {
                permissionButton.setVisibility(hasPerm ? View.GONE : View.VISIBLE);
                String current = statusText.getText().toString();
                if (hasPerm && (current.contains("需要授权") || current.contains("未获取到应用"))) {
                    statusText.setText("权限已授予，等待电脑连接...");
                }
            });
        }, 500);
    }

    private void startServer() {
        serverExecutor.execute(() -> {
            try {
                serverSocket = new ServerSocket(PORT);
                runOnUiThread(() -> {
                    String current = statusText.getText().toString();
                    if (!current.contains("电脑已连接") && !current.contains("正在获取")) {
                        statusText.setText("等待电脑连接...");
                    }
                });
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
            if (requestLine == null) { client.close(); return; }

            String path = requestLine.split(" ")[1];
            String response;
            int statusCode = 200;

            if ("/apps".equals(path)) {
                runOnUiThread(() -> statusText.setText("电脑已连接，正在获取应用..."));
                response = getAppsJson();
            } else if (path.startsWith("/icon")) {
                String pkg = path.contains("?") ? path.split("\\?")[1].replace("pkg=", "") : "";
                response = getIconBase64(pkg);
                if (response == null) { statusCode = 404; response = "{\"error\":\"not found\"}"; }
            } else if ("/ping".equals(path)) {
                response = "{\"ok\":true}";
            } else {
                statusCode = 404; response = "{\"error\":\"not found\"}";
            }

            byte[] body = response.getBytes("UTF-8");
            String header = "HTTP/1.1 " + statusCode + " OK\r\n"
                    + "Content-Type: application/json; charset=utf-8\r\n"
                    + "Access-Control-Allow-Origin: *\r\n"
                    + "Content-Length: " + body.length + "\r\n"
                    + "Connection: close\r\n\r\n";

            OutputStream os = client.getOutputStream();
            os.write(header.getBytes("UTF-8"));
            os.write(body);
            os.flush();
            client.close();
        } catch (Exception e) {
            try { client.close(); } catch (Exception ignored) {}
        }
    }

    private String getAppsJson() {
        try {
            PackageManager pm = getPackageManager();
            JSONArray apps = new JSONArray();
            java.util.List<PackageInfo> packages = pm.getInstalledPackages(0);
            for (PackageInfo pInfo : packages) {
                if ((pInfo.applicationInfo.flags & ApplicationInfo.FLAG_SYSTEM) != 0) continue;
                String pkg = pInfo.packageName;
                JSONObject obj = new JSONObject();
                obj.put("packageName", pkg);
                try { obj.put("label", pm.getApplicationLabel(pInfo.applicationInfo).toString()); }
                catch (Exception e) { obj.put("label", pkg); }
                apps.put(obj);
            }
            PackageInfo myInfo = getPackageManager().getPackageInfo(getPackageName(), 0);
            JSONObject result = new JSONObject();
            result.put("apps", apps);
            result.put("count", apps.length());
            result.put("version", myInfo.versionName);

            final int count = apps.length();
            runOnUiThread(() -> {
                if (count == 0) {
                    statusText.setText("已连接，但未获取到应用\n请授予「应用列表」权限");
                    permissionButton.setVisibility(View.VISIBLE);
                } else {
                    statusText.setText("电脑已连接 · " + count + " 个应用");
                    permissionButton.setVisibility(View.GONE);
                }
            });
            return result.toString();
        } catch (Exception e) {
            runOnUiThread(() -> {
                statusText.setText("获取应用列表失败，请授予「应用列表」权限");
                permissionButton.setVisibility(View.VISIBLE);
            });
            return "{\"error\":\"" + e.getMessage() + "\"}";
        }
    }

    private String getIconBase64(String packageName) {
        try {
            Drawable icon = getPackageManager().getApplicationIcon(packageName);
            Bitmap bitmap = drawableToBitmap(icon);
            if (bitmap == null) return null;
            Bitmap scaled = Bitmap.createScaledBitmap(bitmap, 48, 48, true);
            java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
            scaled.compress(Bitmap.CompressFormat.PNG, 80, baos);
            byte[] bytes = baos.toByteArray();
            if (bytes.length < 100) return null;
            String b64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
            scaled.recycle();
            if (scaled != bitmap) bitmap.recycle();
            return b64;
        } catch (Exception e) { return null; }
    }

    private Bitmap drawableToBitmap(Drawable drawable) {
        if (drawable instanceof BitmapDrawable) return ((BitmapDrawable) drawable).getBitmap();
        int w = drawable.getIntrinsicWidth();
        int h = drawable.getIntrinsicHeight();
        if (w <= 0) w = 64; if (h <= 0) h = 64;
        Bitmap bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        drawable.setBounds(0, 0, canvas.getWidth(), canvas.getHeight());
        drawable.draw(canvas);
        return bitmap;
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        try { if (serverSocket != null && !serverSocket.isClosed()) serverSocket.close(); } catch (Exception ignored) {}
        serverExecutor.shutdownNow();
        clientExecutor.shutdownNow();
    }
}
