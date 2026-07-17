/**
 * Cloudflare Worker：Apple Sign In 回调中转
 *
 * 作用：
 * 1. 接收 Apple 登录成功后的 POST form data（code、id_token、state、user 等）
 * 2. 将参数拼接到 Flutter App 的自定义 scheme URL
 * 3. 302 跳转回 App，让 sign_in_with_apple 插件拿到授权结果
 *
 * 部署步骤：
 * 1. 登录 https://workers.cloudflare.com/ 创建一个新的 Worker
 * 2. 把下面代码粘贴进去
 * 3. 绑定一个自定义域名，例如 https://apple.yourdomain.com/callback
 * 4. 在 Apple Developer 的 Services ID 里把 redirect_uri 设为该域名
 * 5. 在 Flutter 端配置同样的 redirectUri
 *
 * 注意：GitHub Pages 只能托管静态页面，无法处理 Apple 的 POST 回调，
 * 所以 Android 端必须使用这类后端中转。
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 只处理 POST 请求（Apple 固定 POST 回调）
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      // 读取 Apple POST 过来的 form data
      const formData = await request.formData();
      const params = new URLSearchParams();

      for (const [key, value] of formData.entries()) {
        params.append(key, value.toString());
      }

      // 自定义 scheme，需与 Flutter AndroidManifest.xml 中的 intent-filter 一致
      const appScheme = env.APP_SCHEME || 'signinwithapple';
      const redirectUrl = `${appScheme}://callback?${params.toString()}`;

      // 302 跳转回 Flutter App
      return Response.redirect(redirectUrl, 302);
    } catch (error) {
      return new Response(`Callback error: ${error.message}`, { status: 500 });
    }
  }
};
