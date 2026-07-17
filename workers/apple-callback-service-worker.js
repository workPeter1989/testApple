/**
 * Cloudflare Worker：Apple Sign In 回调中转（Service Worker 格式）
 *
 * 如果你的 Cloudflare Worker 使用 Service Worker 格式（不是 ES Module 格式），
 * 请使用这个文件。
 *
 * 判断方法：
 * - 如果你的 Worker 代码编辑框顶部显示 "service worker" 或代码模板是 addEventListener('fetch', ...)
 * - 如果使用 export default { async fetch(...) } 报错 500，说明当前是 Service Worker 格式
 *
 * 部署后，在 Worker 详情页 → Settings → Variables 里设置环境变量：
 * - APP_SCHEME: 自定义 scheme，默认 signinwithapple
 * - APP_PACKAGE: 默认 Android 包名
 */

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const appScheme = getEnv('APP_SCHEME') || 'signinwithapple';
  const isDebug = url.searchParams.get('debug') === '1';

  // GET 请求仅用于人工调试
  if (request.method === 'GET') {
    const queryParams = url.searchParams;
    const packageFromState = getPackageName(queryParams);
    const redirectExample = buildRedirectUrl(
      appScheme,
      packageFromState || 'com.example.app',
      queryParams.toString() || 'code=xxx&state=com.example.app'
    );

    if (isDebug) {
      return jsonResponse({
        mode: 'debug',
        appScheme,
        defaultPackage: getEnv('APP_PACKAGE') || null,
        parsedPackage: packageFromState || null,
        queryParams: Object.fromEntries(queryParams.entries()),
        wouldRedirectTo: redirectExample
      });
    }

    let paramsText = '';
    if (queryParams.toString()) {
      paramsText = '\nReceived query params:\n';
      for (const [key, value] of queryParams.entries()) {
        paramsText += `  ${key}: ${value}\n`;
      }
      paramsText += `\nParsed package name: ${packageFromState || '(none)'}\n`;
    }

    return new Response(
      `Apple Sign In callback worker is running (Service Worker format).\n` +
      `App scheme: ${appScheme}\n` +
      `Default package: ${getEnv('APP_PACKAGE') || '(not set)'}\n\n` +
      `This worker reads the package name from the 'state' parameter.\n` +
      `Supported state formats:\n` +
      `  - com.example.app\n` +
      `  - {"packageName":"com.example.app","nonce":"xxx"}\n` +
      paramsText +
      `\nWould redirect to: ${redirectExample}\n\n` +
      `Apple will POST form data here, and this worker will redirect back to the app.`,
      { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    );
  }

  // 处理 Apple 的 POST 回调
  if (request.method === 'POST') {
    try {
      const contentType = request.headers.get('Content-Type') || '';
      if (!contentType.includes('application/x-www-form-urlencoded') && !contentType.includes('multipart/form-data')) {
        return new Response(
          `Unsupported Content-Type: ${contentType}. ` +
          `Apple callbacks use application/x-www-form-urlencoded.`,
          { status: 400 }
        );
      }

      const formData = await request.formData();
      const params = new URLSearchParams();

      for (const [key, value] of formData.entries()) {
        params.append(key, value.toString());
      }

      if (!params.has('code') && !params.has('error')) {
        return new Response('Invalid callback: missing code or error', { status: 400 });
      }

      const packageName = getPackageName(params);
      const redirectUrl = buildRedirectUrl(appScheme, packageName, params.toString());

      if (isDebug) {
        return jsonResponse({
          mode: 'debug',
          appScheme,
          defaultPackage: getEnv('APP_PACKAGE') || null,
          parsedPackage: packageName || null,
          formParams: Object.fromEntries(params.entries()),
          wouldRedirectTo: redirectUrl
        });
      }

      return Response.redirect(redirectUrl, 302);
    } catch (error) {
      return new Response(`Callback error: ${error.message}`, { status: 500 });
    }
  }

  return new Response('Method not allowed', { status: 405 });
}

function jsonResponse(data) {
  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function getEnv(key) {
  return globalThis[key] || (typeof env !== 'undefined' ? env[key] : undefined);
}

function getPackageName(params) {
  const state = params.get('state') || '';

  try {
    const parsed = JSON.parse(state);
    if (parsed && typeof parsed.packageName === 'string' && parsed.packageName) {
      return parsed.packageName;
    }
  } catch (e) {
    // not JSON
  }

  if (/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(state)) {
    return state;
  }

  return getEnv('APP_PACKAGE') || '';
}

function buildRedirectUrl(scheme, packageName, queryString) {
  if (packageName) {
    return `intent://callback?${queryString}#Intent;scheme=${scheme};package=${packageName};end`;
  }
  return `${scheme}://callback?${queryString}`;
}
