/**
 * Cloudflare Worker：Apple Sign In 回调中转
 *
 * 作用：
 * 1. 接收 Apple 登录成功后的 POST form data（code、id_token、state、user 等）
 * 2. 从 state 参数中解析 Android 包名（优先）
 * 3. 将参数拼接到 Flutter App 的跳转 URL
 * 4. 302 跳转回 App，让 sign_in_with_apple 插件拿到授权结果
 *
 * state 参数支持两种格式：
 * - 纯包名：com.example.app
 * - JSON：{"packageName":"com.example.app","nonce":"xxx"}
 *
 * 环境变量（在 Cloudflare Worker 设置里配置）：
 * - APP_SCHEME: Flutter App 的自定义 scheme，默认 signinwithapple
 * - APP_PACKAGE: 默认 Android 应用包名，当 state 里没有时作为 fallback
 *
 * 部署步骤：
 * 1. 登录 https://dash.cloudflare.com/ 进入 Workers & Pages
 * 2. 创建 Service / Worker，把下面代码粘贴进去
 * 3. （可选）绑定自定义域名，例如 https://apple.yourdomain.com/callback
 * 4. 在 Apple Developer 的 Services ID 里把 redirect_uri 设为该 Worker 地址
 * 5. 在 Flutter 端配置同样的 redirectUri，并把包名传入 state
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const appScheme = env.APP_SCHEME || 'signinwithapple';

    // GET 请求仅用于人工调试，展示当前配置
    if (request.method === 'GET') {
      const redirectExample = buildRedirectUrl(appScheme, 'com.example.app', 'code=xxx&state=com.example.app');
      return new Response(
        `Apple Sign In callback worker is running.\n` +
        `App scheme: ${appScheme}\n` +
        `Default package: ${env.APP_PACKAGE || '(not set)'}\n\n` +
        `This worker reads the package name from the 'state' parameter.\n` +
        `Supported state formats:\n` +
        `  - com.example.app\n` +
        `  - {"packageName":"com.example.app","nonce":"xxx"}\n\n` +
        `Redirect example: ${redirectExample}\n\n` +
        `Apple will POST form data here, and this worker will redirect back to the app.`,
        { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
      );
    }

    // 处理 Apple 的 POST 回调
    if (request.method === 'POST') {
      try {
        const formData = await request.formData();
        const params = new URLSearchParams();

        for (const [key, value] of formData.entries()) {
          params.append(key, value.toString());
        }

        // 如果 Apple 返回了 error，也一并传回 App
        if (!params.has('code') && !params.has('error')) {
          return new Response('Invalid callback: missing code or error', { status: 400 });
        }

        // 从 state 参数解析包名，解析失败则使用环境变量兜底
        const packageName = getPackageName(params, env);

        // 生成跳转回 App 的 URL
        const redirectUrl = buildRedirectUrl(appScheme, packageName, params.toString());

        // 302 跳转回 Flutter App
        return Response.redirect(redirectUrl, 302);
      } catch (error) {
        return new Response(`Callback error: ${error.message}`, { status: 500 });
      }
    }

    return new Response('Method not allowed', { status: 405 });
  }
};

/**
 * 从 Apple 回调的 state 参数中解析 Android 包名
 */
function getPackageName(params, env) {
  const state = params.get('state') || '';

  // 尝试解析 JSON: {"packageName":"com.example.app",...}
  try {
    const parsed = JSON.parse(state);
    if (parsed && typeof parsed.packageName === 'string' && parsed.packageName) {
      return parsed.packageName;
    }
  } catch (e) {
    // state 不是 JSON，继续尝试其他格式
  }

  // 如果是纯包名格式（类似 com.xxx.xxx）
  if (/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(state)) {
    return state;
  }

  // 兜底：使用环境变量配置的默认包名
  return env.APP_PACKAGE || '';
}

/**
 * 构建跳转回 App 的 URL
 *
 * 如果提供了 packageName，使用 Android intent:// 格式：
 *   intent://callback?code=...#Intent;scheme=signinwithapple;package=com.example.app;end
 *
 * 否则使用普通自定义 scheme：
 *   signinwithapple://callback?code=...
 */
function buildRedirectUrl(scheme, packageName, queryString) {
  if (packageName) {
    return `intent://callback?${queryString}#Intent;scheme=${scheme};package=${packageName};end`;
  }
  return `${scheme}://callback?${queryString}`;
}
