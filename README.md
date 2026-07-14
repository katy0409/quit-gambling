# Restart V10.1 Cloud Structured

這一版採用方案 A：把原本單一 index.html 拆成可維護架構，功能與本機資料鍵值維持不變。

## 檔案結構

- index.html：畫面結構
- css/app.css：全部樣式
- js/supabase-config.js：Supabase 連線設定
- js/auth.js：註冊、登入、忘記密碼、登出
- js/app.js：首頁、財務、記帳、日記、Excel 與分析功能
- manifest.webmanifest / sw.js：PWA

## 資料安全

仍沿用 localStorage 鍵值 `restart-v6-data`，所以覆蓋 GitHub 檔案不會主動清除舊資料。這一階段先完成架構拆分；後續再逐模組把資料同步到 Supabase。

## 上傳 GitHub

請把整個資料夾內所有檔案與子資料夾上傳到 Repository 根目錄。GitHub 必須保留 css/ 與 js/ 資料夾結構。
