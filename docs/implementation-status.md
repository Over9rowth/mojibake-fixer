# 乱码文件名修复台 (mojibake-fixer) v0.1.0 实施状态记录

- **版权与许可**：Copyright (C) 2026 Over9rowth · GPL-3.0-only

# HANDOFF｜乱码文件名修复台（`mojibake-fixer`）

## 当前交接单（🐱 普通猫猫 Gemini 3.8 Flash → 炫彩猫猫 Argon）

- **checkpoint_id**：`CP-001`
- **task_id**：`TASK-FLASH-03`
- **status**：`READY_FOR_REVIEW`
- **实测证据核验**：
  1. `npx tsc --noEmit`：0 错误全通过；
  2. `npm test`：8 项测试 100% 通过（含 2 项反向对照测试，涵盖动态构造乱码还原、正常文件名保护与真实文件批量改名事务回滚）；
  3. `npm run smoke`：真实 Electron 进程跑通全链路，诊断 6 个典型乱码条目，成功还原最佳中文文件名，成功生成 PDF 说明书（164,112 字节，`%PDF` 头有效），输出 `SMOKE PASS`；
  4. 离线打包与安装验证：在 `subst X:` 环境下完成构建，`scripts/install-verify.py` 11/11 项安装/快捷方式/标题码位比对/卸载实测全部 `PASS`；
  5. 三件套交付物已入库 `<WORKSPACE_ROOT>\交付物\`：
     - `MojibakeFixer-0.1.0-Setup.exe` (154,201,088 字节, SHA-256: `87E1134548B7961E1AEC2E61E5D03D3E1909AA396F8A6B7A3C85DE04FDD66F05`)
     - `MojibakeFixer-0.1.0-Source.zip` (SHA-256: `1F5096385F4CBF2A087C7E0BE2B528864CB83EA1F1183FED7CEEA8EBDAE6843E`)
     - `乱码文件名修复台-0.1.0-用户使用说明书.pdf` (164,112 字节, SHA-256: `BFCCF6711A0949D9BF57FD02A9DAC3CCF7D8768D4648A9931274AABA088F94D7`)
  6. 仓库卫生：`docs/`、`src/`、`scripts/`、`tests/`、`resources/` 中本机路径 `<USER_HOME>` 与 `<WORKSPACE_ROOT>` 出现次数为 0；
  7. 已运行 `make_checkpoint_manifest.ps1` 生成 `CP-001_MANIFEST.sha256`。

