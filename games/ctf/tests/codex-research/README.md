# Codex 研究工具

正式 AI 只在 `games/ctf/bots/codex/`；這裡的舊版與陪練不進正式選單。

- `baseline.ts`：最初單步版本，保留已知的追旗距離評分錯誤，以重現原結果。
- `depth2.ts`：兩步搜尋版本。
- `mixed.ts`：混合策略初版，保留初始虛擬次數造成的探索問題。
- `adaptive.ts`：停留學習與重複局面處理。
- `survival.ts`：自身生命權重與互殺循環處理。
- `positional.ts`：移動空間與較寬搜尋的淘汰方案。
- `sentinel.ts`：最終採用的邏輯，正式檔案僅 import 路徑與註解不同。
- `route.ts`、`riskRoutes.ts`：射線加權路徑的淘汰方案。
- `sparring.ts`：獨立的防守、攔截、閃避陪練。

所有工具從專案根目錄執行，不新增 npm 指令，不修改正式對戰工具或設定：

```powershell
# AI 一、AI 二、種子數、起始種子、輸出名稱、可選臨時配置 default/reset/nodrop
node games/ctf/tests/codex-research/experiment.ts codex defender 50 100001 review-defender

# A 隊、B 隊、種子、輸出名稱
node games/ctf/tests/codex-research/trace.ts codex depth2 91 review-trace

# AI 一、AI 二、種子數、起始種子、臨時配置、輸出名稱
node games/ctf/tests/codex-research/balance.ts sentinel sentinel 20 91 default review-balance
```

輸出寫到 `docs/reports/ctf-codex/`。請使用新的輸出名稱，避免覆寫交付的原始紀錄。

`experiment.ts` 使用正式 `runTournament` 計分和計時。研究用名稱的原始重播提示仍是正式工具格式，請改用 `trace.ts`；正式 `ctf:match` 不認得那些研究用名稱。greedy/cautious/tactical 是 baseline 的選項組合，完整設定見 experiment.ts。

資料分割與結果解釋見 `docs/reports/ctf-codex-report.md`。最終保留資料不得再拿來調參。
