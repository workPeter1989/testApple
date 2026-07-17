/**
 * Cloudflare Worker：Apple Sign In 回调中转
 *
 * 作用：
 * 1. 接收 Apple 登录成功后的 POST form data（code、id_token、state、user 等）
 * 2. 将参数拼接到 Flutter App 的跳转 URL
 * 3. 302 跳转回 App，让 sign_in_with_apple 插件拿到授权结果
 *
 * 环境变量（在 Cloudflare Worker 设置里配置）：
 * - APP_SCHEME: Flutter App 的自定义 scheme，默认 signinwithapple
 * - APP_PACKAGE: Android 应用包名，例如 com.example.app
 *              如果设置了，会生成 intent:// URL，兼容性更好
 *
 * 部署步骤：
 * 1. 登录 https://dash.cloudflare.com/ 进入 Workers & Pages
 * 2. 创建 Service / Worker，把下面代码粘贴进去
 * 3. （可选）绑定自定义域名，例如 https://apple.yourdomain.com/callback
 * 4. 在 Apple Developer 的 Services ID 里把 redirect_uri 设为该 Worker 地址
 * 5. 在 Flutter 端配置同样的 redirectUri
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const appScheme = env.APP_SCHEME || 'signinwithapple';
    const appPackage = env.APP_PACKAGE || '';

    // GET 请求仅用于人工调试，展示当前配置
    if (request.method === 'GET') {
      const redirectExample = buildRedirectUrl(appScheme, appPackage, 'code=xxx&state=yyy');
      return new Response(
        `Apple Sign In callback worker is running.\n` +
        `App scheme: ${appScheme}\n` +
        `App package: ${appPackage || '(not set)'}\n` +
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

        // 生成跳转回 App 的 URL
        const redirectUrl = buildRedirectUrl(appScheme, appPackage, params.toString());

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
 * 构建跳转回 App 的 URL
 *
 * 如果设置了 APP_PACKAGE，使用 Android intent:// 格式：
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
