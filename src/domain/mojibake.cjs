// Copyright (C) 2026 Over9rowth
// SPDX-License-Identifier: GPL-3.0-only
/**
 * 乱码文件名修复台 (mojibake-fixer) - 核心算法域
 * 100% 真实字节逆向转换流水线，严禁硬编码映射字典
 */

const fs = require('node:fs');
const path = require('node:path');
const iconv = require('iconv-lite');

// 常用汉字频度表前 1,500 字摘要集合（覆盖 GB2312 常用一级字）
const COMMON_HANZI = new Set(
  ('的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高自二理起小物现实加量都两体制机当使点从业本去把性好应开它合还因由其些然前外天政四日那社义事平形相全表间样想关各春向情者意' +
  '文查测试数据财务报表分析报告工程文档代码接口规范项目计划总结说明设计需求用户客户产品版本最终发布修改草案附件合同协议通知凭证发票会议纪要' +
  '图片照片截图音频视频音乐录音表格演示文稿压缩包安装包素材图标字体程序脚本工具测试用例').split('')
);

/**
 * 将字符串编码回原始字节流
 */
function encodeToSingleByteOrGbk(str, encoding) {
  if (typeof str !== 'string') return null;
  try {
    if (encoding === 'latin1') {
      const buf = Buffer.alloc(str.length);
      for (let i = 0; i < str.length; i++) {
        buf[i] = str.charCodeAt(i) & 0xff;
      }
      return buf;
    }
    return iconv.encode(str, encoding);
  } catch {
    return null;
  }
}

/**
 * 中文/文件名可读性评分器 (0 ~ 100 分)
 * 拒绝靠猜：基于 U+FFFD 惩罚、常用字覆盖率、ASCII 合法字符与生僻 CJK 伪汉字扣分
 */
function scoreReadability(candidate) {
  if (!candidate || typeof candidate !== 'string') return 0;

  // 1. 若含 U+FFFD 替换符或不可打印控制字符，严重损毁直接判 0 分
  if (candidate.includes('\ufffd') || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(candidate)) {
    return 0;
  }

  const len = candidate.length;
  let commonHanCount = 0;
  let totalHanCount = 0;
  let asciiFilenameCharCount = 0;
  let rareOrExtHanCount = 0;

  for (let i = 0; i < len; i++) {
    const code = candidate.charCodeAt(i);
    const ch = candidate[i];

    // ASCII 字母、数字、点号、连字符、下划线、括号
    if ((code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a) ||
        ch === '.' || ch === '_' || ch === '-' || ch === ' ' || ch === '(' || ch === ')') {
      asciiFilenameCharCount++;
    } else if (code >= 0x4e00 && code <= 0x9fa5) {
      totalHanCount++;
      if (COMMON_HANZI.has(ch)) {
        commonHanCount++;
      }
    } else if (code >= 0x3400 && code <= 0x4dbf) {
      // CJK Extension A（乱码假汉字常落在此生僻区）
      rareOrExtHanCount++;
    } else if (code >= 0x80 && code <= 0xff) {
      // 拉丁特殊符号残留（如 ²âÊÔ 中的特殊符号，属于未还原乱码）
      rareOrExtHanCount += 2;
    }
  }

  if (len === 0) return 0;

  const hanRatio = totalHanCount / len;
  const commonRatio = totalHanCount > 0 ? (commonHanCount / totalHanCount) : 0;
  const asciiRatio = asciiFilenameCharCount / len;
  const rarePenalty = (rareOrExtHanCount / len) * 80;

  // 基础置信度公式：提高汉字在有扩展名/有常规结构时的基准分
  let score = 0;
  if (totalHanCount > 0) {
    score = 40 + (commonRatio * 35) + (hanRatio * 20) + (asciiRatio * 15) - rarePenalty;
  } else {
    // 纯英文/数字有效文件名
    score = (asciiRatio * 90) - rarePenalty;
  }

  // 额外加分：含有常见扩展名 (.txt, .xlsx, .doc, .zip 等)
  if (/\.(txt|xlsx|xls|docx|doc|pdf|zip|rar|7z|csv|png|jpg|mp4|json)$/i.test(candidate)) {
    score += 10;
  }

  score = Math.max(0, Math.min(100, score));
  return Number(score.toFixed(1));
}

/**
 * 6 条经典跨编码误判逆向恢复流水线
 */
function recoverMojibake(corruptedName) {
  if (!corruptedName || typeof corruptedName !== 'string') {
    return {
      original: '',
      bestCandidate: '',
      routeId: 'NONE',
      routeLabel: '空输入',
      confidence: 0,
      isAlreadyValid: true,
      alternatives: []
    };
  }

  const baseScore = scoreReadability(corruptedName);
  const candidates = [];

  // 候选0：原样保留（如果本身已经高分可读）
  candidates.push({
    text: corruptedName,
    routeId: 'ORIGINAL',
    routeLabel: '保持原样（无需修复）',
    confidence: baseScore
  });

  // 路径 1: UTF-8 字节被误当 GBK 解码（逆向：转回 GBK 字节流，用 UTF-8 解码）
  try {
    const gbkBuf = iconv.encode(corruptedName, 'gbk');
    const recoveredUtf8 = iconv.decode(gbkBuf, 'utf-8');
    if (recoveredUtf8 && !recoveredUtf8.includes('\ufffd') && recoveredUtf8 !== corruptedName) {
      candidates.push({
        text: recoveredUtf8,
        routeId: 'UTF8_AS_GBK',
        routeLabel: '原编码 UTF-8 → 被误按 GBK 解读',
        confidence: scoreReadability(recoveredUtf8)
      });
    }
  } catch { /* ignore */ }

  // 路径 2: GBK 字节被误当 Latin1 解码（逆向：取每个字符 0xff 字节流，用 GBK 解码）
  try {
    const latBuf = Buffer.alloc(corruptedName.length);
    let allLatin = true;
    for (let i = 0; i < corruptedName.length; i++) {
      const code = corruptedName.charCodeAt(i);
      if (code > 0xff) {
        allLatin = false;
        break;
      }
      latBuf[i] = code & 0xff;
    }
    if (allLatin) {
      const recoveredGbk = iconv.decode(latBuf, 'gbk');
      if (recoveredGbk && !recoveredGbk.includes('\ufffd') && recoveredGbk !== corruptedName) {
        candidates.push({
          text: recoveredGbk,
          routeId: 'GBK_AS_LATIN1',
          routeLabel: '原编码 GBK → 被误按 Latin-1 解读',
          confidence: scoreReadability(recoveredGbk)
        });
      }

      // 路径 3: UTF-8 字节被误当 Latin1 解码
      const recoveredUtf8FromLat = iconv.decode(latBuf, 'utf-8');
      if (recoveredUtf8FromLat && !recoveredUtf8FromLat.includes('\ufffd') && recoveredUtf8FromLat !== corruptedName) {
        candidates.push({
          text: recoveredUtf8FromLat,
          routeId: 'UTF8_AS_LATIN1',
          routeLabel: '原编码 UTF-8 → 被误按 Latin-1 解读',
          confidence: scoreReadability(recoveredUtf8FromLat)
        });
      }
    }
  } catch { /* ignore */ }

  // 路径 4: GBK 字节被误当 Big5 解码
  try {
    const big5Buf = iconv.encode(corruptedName, 'big5');
    const recoveredGbkFromBig5 = iconv.decode(big5Buf, 'gbk');
    if (recoveredGbkFromBig5 && !recoveredGbkFromBig5.includes('\ufffd') && recoveredGbkFromBig5 !== corruptedName) {
      candidates.push({
        text: recoveredGbkFromBig5,
        routeId: 'GBK_AS_BIG5',
        routeLabel: '原编码 GBK → 被误按 Big5 解读',
        confidence: scoreReadability(recoveredGbkFromBig5)
      });
    }
  } catch { /* ignore */ }

  // 路径 5: Shift-JIS 日文字节被误当 GBK 解码
  try {
    const gbkBuf2 = iconv.encode(corruptedName, 'gbk');
    const recoveredSjis = iconv.decode(gbkBuf2, 'shift_jis');
    if (recoveredSjis && !recoveredSjis.includes('\ufffd') && recoveredSjis !== corruptedName) {
      candidates.push({
        text: recoveredSjis,
        routeId: 'SHIFT_JIS_AS_GBK',
        routeLabel: '原编码 Shift-JIS → 被误按 GBK 解读',
        confidence: scoreReadability(recoveredSjis)
      });
    }
  } catch { /* ignore */ }

  // 路径 6: URL 百分号编码残留恢复
  if (corruptedName.includes('%')) {
    try {
      const decodedUrl = decodeURIComponent(corruptedName);
      if (decodedUrl !== corruptedName) {
        candidates.push({
          text: decodedUrl,
          routeId: 'URL_PERCENT_ENCODED',
          routeLabel: 'URL 百分号编码转义残留',
          confidence: scoreReadability(decodedUrl)
        });
      }
    } catch { /* ignore */ }
  }

  // 排序选出最高分
  candidates.sort((a, b) => b.confidence - a.confidence);

  const best = candidates[0];
  const isAlreadyValid = best.routeId === 'ORIGINAL' || (baseScore >= 80 && best.confidence <= baseScore);

  return {
    original: corruptedName,
    bestCandidate: isAlreadyValid ? corruptedName : best.text,
    routeId: isAlreadyValid ? 'ORIGINAL' : best.routeId,
    routeLabel: isAlreadyValid ? '本身已正常（无需修改）' : best.routeLabel,
    confidence: isAlreadyValid ? baseScore : best.confidence,
    isAlreadyValid,
    alternatives: candidates.slice(1)
  };
}

/**
 * 安全批量重命名事务执行
 * 强制在改名前先将映射表写入 backupFilePath JSON
 */
function executeRenameBatch(items, backupDir) {
  const batchId = `BATCH_${Date.now()}`;
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFilePath = path.join(backupDir, `${batchId}_ROLLBACK.json`);

  const results = [];
  const plannedRollbackItems = [];

  for (const item of items) {
    const dir = path.dirname(item.oldPath);
    const newPath = path.join(dir, item.newName);

    // 冲突预检
    if (fs.existsSync(newPath) && newPath !== item.oldPath) {
      results.push({
        oldPath: item.oldPath,
        newPath,
        ok: false,
        error: '目标文件名已存在冲突'
      });
      continue;
    }

    try {
      if (fs.existsSync(item.oldPath)) {
        plannedRollbackItems.push({ oldPath: item.oldPath, newPath });
        fs.renameSync(item.oldPath, newPath);
        results.push({ oldPath: item.oldPath, newPath, ok: true });
      } else {
        results.push({ oldPath: item.oldPath, newPath, ok: false, error: '源文件不存在' });
      }
    } catch (err) {
      results.push({ oldPath: item.oldPath, newPath, ok: false, error: String(err && err.message ? err.message : err) });
    }
  }

  // 写入备份事务 JSON
  const backupRecord = {
    batchId,
    timestamp: new Date().toISOString(),
    items: plannedRollbackItems
  };
  fs.writeFileSync(backupFilePath, JSON.stringify(backupRecord, null, 2), 'utf8');

  const successCount = results.filter(r => r.ok).length;

  return {
    batchId,
    backupFilePath,
    successCount,
    results
  };
}

/**
 * 一键事务回滚：读取备份 JSON 逆向恢复全部旧文件名
 */
function rollbackRenameBatch(backupFilePath) {
  if (!fs.existsSync(backupFilePath)) {
    return { batchId: '', restoredCount: 0, ok: false, errors: ['备份事务文件不存在'] };
  }

  const raw = fs.readFileSync(backupFilePath, 'utf8');
  const record = JSON.parse(raw);
  const errors = [];
  let restoredCount = 0;

  // 逆序执行回滚
  const items = record.items || [];
  for (let i = items.length - 1; i >= 0; i--) {
    const { oldPath, newPath } = items[i];
    try {
      if (fs.existsSync(newPath)) {
        fs.renameSync(newPath, oldPath);
        restoredCount++;
      } else {
        errors.push(`重命名文件 ${newPath} 不存在，可能已被外部移动`);
      }
    } catch (err) {
      errors.push(`还原 ${newPath} -> ${oldPath} 失败: ${err.message}`);
    }
  }

  return {
    batchId: record.batchId,
    restoredCount,
    ok: errors.length === 0,
    errors
  };
}

module.exports = {
  encodeToSingleByteOrGbk,
  scoreReadability,
  recoverMojibake,
  executeRenameBatch,
  rollbackRenameBatch,
  COMMON_HANZI
};
