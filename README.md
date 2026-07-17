# 我的静态网站

一个托管在 GitHub Pages 上的静态网站，使用纯 HTML、CSS 和 JavaScript 构建。

## 在线预览

访问：https://你的用户名.github.io/仓库名/

## 本地预览

直接在浏览器中打开 `index.html` 即可预览。

## 部署

项目使用 GitHub Actions 自动部署到 GitHub Pages。每次推送到 `main` 分支时会自动触发部署。

## 目录结构

```
.
├── .github/workflows/pages.yml  # GitHub Actions 部署配置
├── .gitignore                   # Git 忽略文件
├── callback.html                # Apple ID 登录回调页
├── index.html                   # 主页
├── README.md                    # 项目说明
├── script.js                    # JavaScript
└── style.css                    # 样式表
```

## Apple ID 登录回调

`callback.html` 用于展示 Apple Sign In 回调参数。由于 GitHub Pages 是静态托管，无法读取 Apple POST 过来的 form data，因此该页面仅解析 URL 查询参数（适合本地调试或展示）。

生产环境处理 Apple 回调需要后端服务，例如 Cloudflare Workers、Vercel、Netlify Functions 或自建服务器。
