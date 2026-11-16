# Codex 研究工具

正式 AI 只在 `games/ctf/bots/codex/`；這裡保留研究工具與三種陪練，陪練不進正式選單。

- `sparring.ts`：獨立的防守、攔截、閃避陪練。
- `experiment.ts`：使用正式批次對戰工具統計勝負、耗時與來源雜湊。
- `trace.ts`：保存單場逐回合動作、場面及事件。
- `balance.ts`：比較臨時配置下的平手、封線、互殺與得分統計。

舊版 AI 已移除。完整原始紀錄在這個分支的 commit [ab86bea](https://github.com/RavenCH-oc/game-room/tree/ab86bea741c99403973206c448a61707c7f76917)。

所有工具從專案根目錄執行，不新增 npm 指令，不修改正式對戰工具或設定：

```powershell
# AI 一、AI 二、種子數、起始種子、輸出名稱、可選臨時配置 default/reset/nodrop
node games/ctf/tests/codex-research/experiment.ts codex defender 50 100001 review-defender

# A 隊、B 隊、種子、輸出名稱
node games/ctf/tests/codex-research/trace.ts codex interceptor 91 review-trace

# AI 一、AI 二、種子數、起始種子、臨時配置、輸出名稱
node games/ctf/tests/codex-research/balance.ts codex codex 20 91 default review-balance
```

輸出寫到 `docs/reports/ctf-codex/`。請使用新的輸出名稱，避免覆寫交付的原始紀錄。

三個工具都支援正式登記的 AI（codex、attacker、runner、random）以及 defender、interceptor、evasive。`experiment.ts` 使用正式 `runTournament` 計分和計時。陪練名稱的原始重播提示仍是正式工具格式，請改用 `trace.ts`；正式 `ctf:match` 不認得陪練名稱。保留紀錄中的舊版代號須到上述 commit 查閱；原 sentinel 的策略與正式 codex 相同，目前以 codex 執行平衡實驗。

資料分割與結果解釋見 `docs/reports/ctf-codex-report.md`。最終保留資料不得再拿來調參。
