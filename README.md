# Restart V10.2 Cloud Settings

## 本版功能

- Email 註冊、登入、忘記密碼、登出與自動登入。
- 首頁標題、提醒文字、背景顏色、戒賭理由及本月/下月薪資預估同步到 Supabase `settings`。
- 第一次登入雲端版時，會用手機既有設定建立雲端資料，不會直接用預設值覆蓋舊設定。
- 本機資料仍保存在 `restart-v6-data`，目前採本機優先＋設定雲端同步。
- 「全部重置」已修正：二次確認後清除 App 本機資料、登入帳號的雲端資料及 Storage 個人資料夾，帳號本身保留，並回到初始設定。
- JSON 備份匯出與匯入可正常使用。

## 上傳 GitHub

請保留資料夾結構並上傳所有檔案：

- index.html
- css/app.css
- js/supabase-config.js
- js/cloud-settings.js
- js/auth.js
- js/app.js
- manifest.webmanifest
- sw.js
- icon-192.png
- icon-512.png

測試網址可加上 `?v=10.2`。

## 全部重置的範圍

會清除負債、資產、存錢目標、記帳、日記、簽到、復賭、照片與設定；不會刪除 Supabase 登入帳號。
