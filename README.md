# Restart V10.0 Cloud Auth 測試版

此版本只先完成 Supabase Email 登入、註冊、忘記密碼、自動登入與登出。

- 原本 `restart-v6-data` 本機資料完整保留。
- 尚未把財務與記帳搬到雲端；確認登入正常後再進行下一階段。
- 使用 Supabase publishable key，並由 RLS 保護資料。

## 上傳 GitHub
將資料夾內全部檔案覆蓋到 Repository 根目錄，等待 Pages 部署完成，再開啟：

https://katy0409.github.io/quit-gambling/?v=10.0-auth
