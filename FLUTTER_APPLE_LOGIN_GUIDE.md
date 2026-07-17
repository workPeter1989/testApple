# Flutter sign_in_with_apple + Cloudflare Workers 完整配置指南

## 整体流程

```
Flutter App (Android)
        │
        ▼
打开 Apple 授权页面
        │
        ▼
用户授权后，Apple POST 回调
到 Cloudflare Worker
        │
        ▼
Worker 解析 code / id_token / state / user
        │
        ▼
Worker 302 跳转回 App 自定义 scheme
signinwithapple://callback?code=...
        │
        ▼
Flutter sign_in_with_apple 插件拿到结果
```

---

## 第一步：创建并部署 Cloudflare Worker

### 1.1 登录 Cloudflare

访问：https://dash.cloudflare.com/

进入 **Workers & Pages** → **Create** → **Create Worker**

### 1.2 粘贴 Worker 代码

把 `workers/apple-callback.js` 的内容粘贴进去，保存并部署。

### 1.3 设置环境变量

在 Worker 详情页进入 **Settings** → **Variables**：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `APP_SCHEME` | Flutter App 自定义 scheme | `signinwithapple` |
| `APP_PACKAGE` | 默认 Android 应用包名（兜底用） | `com.example.app` |

Worker 优先从 Apple 回调的 `state` 参数里读取包名。如果 `state` 里没有，才会用 `APP_PACKAGE` 兜底。所以 `APP_PACKAGE` 不是必须设置，但建议设置以防万一。

如果设置了包名，Worker 会生成 `intent://` 格式的跳转 URL：

```text
intent://callback?code=...#Intent;scheme=signinwithapple;package=com.example.app;end
```

intent 方式比普通自定义 scheme 更可靠，因为它明确指定了要打开哪个 App，能避免 scheme 冲突或被其他应用拦截。

### 1.4 绑定域名（推荐）

Worker 默认有一个 `xxx.workers.dev` 地址，可以直接用，也可以绑定自己的域名：

1. Worker 详情页 → **Triggers** → **Custom Domains**
2. 添加域名，例如 `apple.yourdomain.com`
3. 按提示添加 DNS 记录

记下最终地址，例如：

```text
https://apple.yourdomain.com/callback
```

用浏览器访问这个地址，如果看到类似：

```text
Apple Sign In callback worker is running.
App scheme: signinwithapple
App package: com.example.app
Redirect example: intent://callback?code=xxx&state=yyy#Intent;scheme=signinwithapple;package=com.example.app;end
```

说明 Worker 部署成功。

---

## 第二步：Apple Developer 配置

### 2.1 创建或编辑 Services ID

1. 登录 https://developer.apple.com/account/resources/
2. 进入 **Certificates, Identifiers & Profiles**
3. 选择 **Services IDs** → 点击你的 Services ID
4. 勾选 **Sign In with Apple**
5. 点击 **Configure**

### 2.2 配置 Primary App ID 和 redirect URI

- **Primary App ID**：选择你的 App ID
- **Website URLs** → **Return URLs**：填入 Cloudflare Worker 地址

```text
https://apple.yourdomain.com/callback
```

保存。

### 2.3 创建 Client Secret（后端换取 token 时需要）

Apple 登录流程中，`code` 需要在你的后端或 App 服务端换成 `access_token` 和 `refresh_token`。这个步骤与回调中转无关，但完整的登录流程需要它。

如果你只需要拿到 `id_token` 和 `user`（首次登录），可以在 Flutter 端直接处理，不需要后端换 token。

---

## 第三步：Flutter 端配置

### 3.1 添加依赖

```yaml
dependencies:
  sign_in_with_apple: ^6.1.4
```

运行：

```bash
flutter pub get
```

### 3.2 调用登录

```dart
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import 'dart:convert';

Future<void> signInWithApple() async {
  try {
    final credential = await SignInWithApple.getAppleIDCredential(
      scopes: [
        AppleIDAuthorizationScopes.email,
        AppleIDAuthorizationScopes.fullName,
      ],
      // 把包名传给 Worker，Worker 会用它来生成 intent:// 跳转 URL
      state: jsonEncode({
        'packageName': 'com.example.app',
        // 你还可以在这里加 nonce、redirectRoute 等自定义字段
      }),
      webAuthenticationOptions: WebAuthenticationOptions(
        // Apple Services ID
        clientId: 'com.yourcompany.yourapp.service',
        // Cloudflare Worker 回调地址
        redirectUri: Uri.parse('https://apple.yourdomain.com/callback'),
      ),
    );

    print('User ID: ${credential.userIdentifier}');
    print('Email: ${credential.email}');
    print('Given Name: ${credential.givenName}');
    print('Family Name: ${credential.familyName}');
    print('Authorization Code: ${credential.authorizationCode}');
    print('Identity Token: ${credential.identityToken}');
  } catch (e) {
    print('Sign in failed: $e');
  }
}
```

`clientId` 是你在 Apple Developer 里创建的 **Services ID**，不是 App ID。

`state` 里传包名后，Worker 会用它生成 `intent://callback?...#Intent;scheme=signinwithapple;package=com.example.app;end`，比普通自定义 scheme 更可靠。

### 3.3 Android 配置自定义 scheme

编辑 `android/app/src/main/AndroidManifest.xml`，在 `<application>` 内添加：

```xml
<activity
    android:name="com.aboutyou.dart_packages.sign_in_with_apple.SignInWithAppleCallback"
    android:exported="true"
    android:launchMode="singleTop">
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />

        <data android:scheme="signinwithapple" />
        <data android:host="callback" />
    </intent-filter>
</activity>
```

注意：`android:scheme` 和 `android:host` 必须和 Worker 里生成的跳转 URL 一致。默认是 `signinwithapple://callback`。

---

## 第四步：测试

1. 在 Android 真机或模拟器上运行 App
2. 点击登录按钮
3. 会打开 Chrome Custom Tab 进入 Apple 授权页
4. 输入 Apple ID 授权
5. 授权成功后，Apple POST 到 Cloudflare Worker
6. Worker 302 跳转回 `signinwithapple://callback?code=...`
7. App 收到回调，`SignInWithApple.getAppleIDCredential` 返回 credential

---

## 常见问题

### 1. `invalid_request` 或 `redirect_uri 不匹配`

- 检查 Apple Developer 里配置的 Return URL 和 Flutter 代码里的 `redirectUri` 是否完全一致（包括 https、路径、末尾斜杠）
- 检查 `clientId` 是否是 Services ID，不是 App ID

### 2. 授权成功后 App 没收到回调

- 检查 AndroidManifest.xml 里的 scheme/host 是否和 Worker 跳转 URL 一致
- 检查 Worker 环境变量 `APP_SCHEME` 是否配置正确
- 用浏览器直接访问 Worker 地址，看是否返回运行提示

### 3. 首次登录才能拿到 email 和 name

Apple 只在首次授权时返回 `user`（包含 email 和 name），后续只返回 `userIdentifier`。需要在自己服务器保存首次登录信息。

---

## 相关文件

- `workers/apple-callback.js` — Cloudflare Worker 代码
- `callback.html` — GitHub Pages 上的回调说明/调试页（仅展示，不能处理 POST）
