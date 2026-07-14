# Restart V12.4

## 本版重點：PNG 分層換裝（楓之谷式紙娃娃）

把原本被 V12.3.1 鎖死、只會顯示「身體＋頭」的角色，改成**真正的 PNG 分層換裝系統**：

- 角色由一張張透明 PNG **疊圖**組成（後髮 → 身體 → 下裝 → 套裝 → 上衣 → 鞋子 → 手飾 → 頭 → 臉 → 眼型 → 眼色 → 臉飾 → 前髮 → 耳環 → 頭飾 → 手持物）。
- 在**衣櫃**點物品會**立即穿上**、在**商城**點商品會**即時試穿**，角色外觀跟著改變。
- 衣櫃／商城的每個縮圖，都是「角色穿上這件」的合成預覽（跟主角色用同一套渲染）。
- 點角色會有互動彈跳動畫；戒賭幣、7 天簽到、限定造型全部保留。
- **缺圖自動隱藏**：某個部位還沒畫 PNG，就不顯示，不會出現破圖。你把圖畫好丟進對應資料夾就會自動出現，不用改任何程式。
- 不改動財務、記帳、日記、登入與 Supabase 功能。

### 座標系（重要）

所有 PNG 都用**同一張 1024×1024 透明畫布**、對齊同一個角色。分兩組：

| 座標組 | 對齊對象 | 包含部位 |
|---|---|---|
| **身體畫布**（1:1 滿版） | `body_base.png` | 上衣、下裝、套裝、鞋子、手飾、手持物 |
| **頭部畫布**（自動縮成 72%、上移 13.2%） | `head_base.png` | 頭髮、臉、表情、眼型、眼色、臉飾、耳環、頭飾 |

畫素材時：衣服類請對齊身體、頭部配件類請對齊頭，程式會自動幫頭部群組縮放到正確頭身比。

### 素材檔名規則（丟進去就會自動出現）

`<itemId>` 是 `js/app.js` 裡 `GAME_ITEMS` 的物品 id（例如 `top-hoodie`、`head-cap`）。`<gender>` 為 `male` 或 `female`。

| 部位 | 檔案路徑 |
|---|---|
| 共用身體 | `assets/avatar/body/body_base.png` |
| 共用頭型 | `assets/avatar/head/head_base.png` |
| 初始表情（每性別一張） | `assets/avatar/face/<gender>_face_default.png` |
| 頭髮（前／後兩張） | `assets/avatar/hair/<gender>/<itemId>_front.png`、`_back.png` |
| 頭髮指定髮色（可選，優先採用） | `assets/avatar/hair/<gender>/<itemId>__<hairColorId>_front.png`、`_back.png` |
| 表情（覆蓋初始臉） | `assets/avatar/face/<gender>/<expressionId>.png` |
| 眼型（可選疊層） | `assets/avatar/eye/<eyeShapeId>.png` |
| 眼睛顏色（可選疊層） | `assets/avatar/eyecolor/<eyeColorId>.png` |
| 上衣 | `assets/avatar/top/<itemId>.png` |
| 下裝 | `assets/avatar/bottom/<itemId>.png` |
| 套裝（連身，會蓋掉上衣＋下裝） | `assets/avatar/set/<itemId>.png` |
| 鞋子 | `assets/avatar/shoes/<itemId>.png` |
| 手飾 | `assets/avatar/handAccessory/<itemId>.png` |
| 手持物 | `assets/avatar/handheld/<itemId>.png` |
| 臉飾（眼鏡等） | `assets/avatar/faceAccessory/<itemId>.png` |
| 耳環 | `assets/avatar/earrings/<itemId>.png` |
| 頭飾（帽子、皇冠等） | `assets/avatar/headAccessory/<itemId>.png` |

> 目前已內建：共用身體、共用頭型、男女初始表情、男生髮型 `hair-m1`（對應現有檔案 `hair/male/male_hair_001_front/back.png`，已自動橋接）。其餘部位畫好丟進上表路徑即可上線。

### 常見物品 id 對照（畫素材時參考）

- 髮型：`hair-m1`~`hair-m5`（男）、`hair-f1`~`hair-f5`（女）、`hair-bob`、`hair-wave`
- 髮色：`hair-brown`(初始)、`hair-black`、`hair-gold`、`hair-pink`
- 上衣：`top-white`(初始)、`top-hoodie`、`top-blue`
- 下裝：`bottom-black`(初始)、`bottom-jeans`、`bottom-skirt`
- 套裝：`set-suit`、`set-sport`、簽到限定 `week-2`、`week-5`
- 鞋子：`shoes-white`(初始)、`shoes-boots`、`shoes-pink`
- 頭飾：`head-cap`、`head-crown`、`head-ribbon`、簽到限定 `week-1`、`week-4`
- 臉飾：`face-freckle`、`face-blush`、`face-glasses`
- 耳環：`ear-star`、`ear-pearl`
- 手飾：`hand-watch`、`hand-bracelet`
- 手持物：`held-flower`、`held-book`、`held-balloon`、簽到限定 `week-3`、`week-6`

（完整清單見 `js/app.js` 的 `GAME_ITEMS`。想新增物品，在該陣列加一筆、放一張同名 PNG 即可。）
