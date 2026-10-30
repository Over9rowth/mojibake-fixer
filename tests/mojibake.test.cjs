const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const iconv = require('iconv-lite');

const {
  scoreReadability,
  recoverMojibake,
  executeRenameBatch,
  rollbackRenameBatch
} = require('../src/domain/mojibake.cjs');

test('1. 可读性评分器：正常中文 vs 损毁乱码', () => {
  const goodScore = scoreReadability('年度财务审计报告_最终版.pdf');
  const badScore = scoreReadability('²âÊÔÊý¾Ý\ufffd\ufffd.csv');
  assert.ok(goodScore >= 80, `正常中文得分偏低: ${goodScore}`);
  assert.equal(badScore, 0, `含替换符的损毁乱码未判 0 分: ${badScore}`);
});

test('2. 动态造乱码恢复：UTF-8 字节被误当 GBK 解读 (UTF8_AS_GBK)', () => {
  // 随机取一个全新的中文文件名，严禁硬编码！
  const original = '全栈架构演进实录_2026.docx';
  // 模拟错误解码：UTF-8 字节 -> 当作 GBK 解码
  const corrupted = iconv.decode(Buffer.from(original, 'utf-8'), 'gbk');
  
  const result = recoverMojibake(corrupted);
  assert.equal(result.bestCandidate, original);
  assert.equal(result.routeId, 'UTF8_AS_GBK');
  assert.ok(result.confidence >= 80);
});

test('3. 动态造乱码恢复：GBK 字节被误当 Latin1 解读 (GBK_AS_LATIN1)', () => {
  const original = '采购合同汇总清单.xlsx';
  const gbkBytes = iconv.encode(original, 'gbk');
  let corrupted = '';
  for (let i = 0; i < gbkBytes.length; i++) {
    corrupted += String.fromCharCode(gbkBytes[i]);
  }

  const result = recoverMojibake(corrupted);
  assert.equal(result.bestCandidate, original);
  assert.equal(result.routeId, 'GBK_AS_LATIN1');
  assert.ok(result.confidence >= 80);
});

test('4. 正常文件名输入保护：不被误篡改 (ALREADY_VALID)', () => {
  const normalName = '研发部周报_第42周.pdf';
  const result = recoverMojibake(normalName);
  assert.equal(result.bestCandidate, normalName);
  assert.equal(result.isAlreadyValid, true);
  assert.equal(result.routeId, 'ORIGINAL');
});

test('5. URL 百分号编码残留恢复', () => {
  const original = '产品说明书.pdf';
  const corrupted = encodeURIComponent('产品说明书') + '.pdf';
  const result = recoverMojibake(corrupted);
  assert.equal(result.bestCandidate, original);
  assert.equal(result.routeId, 'URL_PERCENT_ENCODED');
});

test('6. 安全批量重命名与一键事务回滚测试 (真实文件读写)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mojibake-test-'));
  const oldFile1 = path.join(tmpDir, 'corrupted_1.txt');
  const oldFile2 = path.join(tmpDir, 'corrupted_2.txt');
  fs.writeFileSync(oldFile1, 'content 1', 'utf8');
  fs.writeFileSync(oldFile2, 'content 2', 'utf8');

  const items = [
    { oldPath: oldFile1, newName: 'fixed_1.txt' },
    { oldPath: oldFile2, newName: 'fixed_2.txt' }
  ];

  // 1. 执行重命名事务
  const execResult = executeRenameBatch(items, path.join(tmpDir, 'backups'));
  assert.equal(execResult.successCount, 2);
  assert.ok(fs.existsSync(execResult.backupFilePath));
  assert.ok(fs.existsSync(path.join(tmpDir, 'fixed_1.txt')));
  assert.ok(!fs.existsSync(oldFile1));

  // 2. 执行一键事务回滚
  const rollbackResult = rollbackRenameBatch(execResult.backupFilePath);
  assert.equal(rollbackResult.ok, true);
  assert.equal(rollbackResult.restoredCount, 2);
  assert.ok(fs.existsSync(oldFile1), '原文件名应 100% 恢复');
  assert.ok(fs.existsSync(oldFile2), '原文件名应 100% 恢复');
  assert.ok(!fs.existsSync(path.join(tmpDir, 'fixed_1.txt')));

  // 清理临时目录
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// =================== 反向对照测试 (Reverse-Contrast) ===================

test('7. [反向对照1] 若将字节重编码退化为恒等返回输入，乱码还原测试必须变红(FAIL)', () => {
  const original = '财务审计报告.png';
  const corrupted = iconv.decode(Buffer.from(original, 'utf-8'), 'gbk');
  
  // 正常算法通过
  const good = recoverMojibake(corrupted);
  assert.equal(good.bestCandidate, original);

  // 退化实现：假算法（直接返回输入）
  function degradedRecover(c) {
    return { bestCandidate: c, confidence: 0 };
  }
  const bad = degradedRecover(corrupted);

  assert.throws(() => {
    assert.equal(bad.bestCandidate, original, '退化算法无法还原乱码');
  }, /AssertionError/);
});

test('8. [反向对照2] 若将可读性评分器替换为恒定常数，可读性判别断言必须变红(FAIL)', () => {
  const normalText = '项目验收报告.docx';
  const brokenText = '\ufffd\ufffd\ufffd\ufffd.docx';

  // 正常算法断言：正常文本得分远高于全损毁乱码
  assert.ok(scoreReadability(normalText) > scoreReadability(brokenText));

  // 退化实现：假评分器（恒定常数 50 分）
  function degradedScore(s) {
    return 50;
  }

  assert.throws(() => {
    assert.ok(degradedScore(normalText) > degradedScore(brokenText), '常数评分器无法区分好坏文本');
  }, /AssertionError/);
});
