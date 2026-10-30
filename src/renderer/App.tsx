// Copyright (C) 2026 Over9rowth
// SPDX-License-Identifier: GPL-3.0-only
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { recoverMojibake, RecoverMojibakeResult } from '../domain/mojibake.cjs';

// 30 秒“诶”点内置典型乱码样本集
const DEFAULT_SAMPLES = [
  '璐㈠务鎶ヨ〃_2025鏈€缁堢版.xlsx',
  '²âÊÔÊý¾Ý_²úƷ.csv',
  'æ–‡ä»¶å¤¹_2026.zip',
  '%E9%A1%B9%E7%9B%AE%E8%AE%A1%E5%88%92%E4%B9%A6.pdf',
  '鏂囦欢澶_瀹℃牳.docx',
  '姝ｅ父鏂囦欢鍚嶉』淇濇寔.pdf'
];

declare global {
  interface Window {
    mojibake?: {
      exportReportJson: (json: string) => Promise<{ path: string; bytes: number } | null>;
      exportManualPdf: () => Promise<{ path: string; bytes: number } | null>;
      smokeReady: (p: { mounted: boolean; engineOk: boolean }) => void;
      onSmokeRun: (cb: () => void) => void;
      smokeResult: (payload: unknown) => Promise<void>;
    };
  }
}

export function App() {
  const [inputListText, setInputListText] = useState(DEFAULT_SAMPLES.join('\n'));
  const [results, setResults] = useState<RecoverMojibakeResult[]>([]);

  const analyzeNames = (text: string) => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const analyzed = lines.map(name => recoverMojibake(name));
    setResults(analyzed);
    return analyzed;
  };

  useEffect(() => {
    const res = analyzeNames(inputListText);

    if (window.mojibake) {
      window.mojibake.smokeReady({ mounted: true, engineOk: res.length > 0 });
      window.mojibake.onSmokeRun(() => {
        const fresh = analyzeNames(DEFAULT_SAMPLES.join('\n'));
        window.mojibake?.smokeResult({ items: fresh });
      });
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputListText(val);
    analyzeNames(val);
  };

  const handleExportJson = async () => {
    if (!window.mojibake) return;
    await window.mojibake.exportReportJson(JSON.stringify(results, null, 2));
  };

  const handleExportManual = async () => {
    if (!window.mojibake) return;
    await window.mojibake.exportManualPdf();
  };

  const highConfidenceCount = results.filter(r => r.confidence >= 80).length;

  return (
    <div className="container">
      <header className="header">
        <div className="brand">
          <div className="brand-dot" />
          <h1 className="title">乱码文件名修复台 <span className="version">v0.1.0</span></h1>
          <span className="badge">100% 本机离线</span>
        </div>
        <div className="actions">
          <button className="btn btn-secondary" onClick={() => { setInputListText(DEFAULT_SAMPLES.join('\n')); analyzeNames(DEFAULT_SAMPLES.join('\n')); }}>
            重载经典乱码样本
          </button>
          <button className="btn btn-secondary" onClick={handleExportManual}>
            导出说明书 (PDF)
          </button>
          <button className="btn btn-primary" onClick={handleExportJson}>
            导出修复映射表 (JSON)
          </button>
        </div>
      </header>

      <div className="honest-banner">
        【仪器观测边界】本工具基于多重字节重编码逆向流水线与 GB2312 汉字频度评分推导最佳还原名，改名前提供全量预览与自动事务备份。
      </div>

      <section className="dashboard-grid">
        <div className="card">
          <div className="card-label">诊断文件名总数</div>
          <div className="card-value">
            {results.length} <span className="unit">个</span>
          </div>
          <div className="card-sub">待排查乱码条目</div>
        </div>

        <div className="card">
          <div className="card-label">高置信度可还原 (≥80%)</div>
          <div className="card-value highlight-emerald">
            {highConfidenceCount} <span className="unit">个</span>
          </div>
          <div className="card-sub">字节链路精确重合</div>
        </div>

        <div className="card">
          <div className="card-label">原本正常文件</div>
          <div className="card-value">
            {results.filter(r => r.isAlreadyValid).length} <span className="unit">个</span>
          </div>
          <div className="card-sub">自动保护，不被误篡改</div>
        </div>

        <div className="card">
          <div className="card-label">安全事务机制</div>
          <div className="card-value highlight-amber">
            强制 JSON
          </div>
          <div className="card-sub">自动生成回滚记录</div>
        </div>
      </section>

      <div className="workspace-split">
        {/* 左侧：输入待修复列表 */}
        <div className="panel left-panel">
          <div className="panel-header">
            <span>乱码文件名列表（每行一个）</span>
            <span className="count-hint">{results.length} 行</span>
          </div>
          <textarea
            className="text-input"
            value={inputListText}
            onChange={handleInputChange}
            placeholder="粘贴待修复的乱码文件名（支持多行批量输入）..."
          />
        </div>

        {/* 右侧：逆向还原分析与置信度列表 */}
        <div className="panel right-panel">
          <div className="panel-header">
            <span>逆向还原透镜与置信度得分</span>
            <span className="count-hint">自动推演最佳解码链路</span>
          </div>

          <div className="candidate-list">
            {results.map((r, idx) => (
              <div key={idx} className="candidate-card">
                <div className="card-top">
                  <span className="original-name">{r.original}</span>
                  <span className={`confidence-badge ${r.confidence >= 80 ? 'high' : 'low'}`}>
                    {r.confidence}% 置信度
                  </span>
                </div>
                <div className="card-arrow">➔ 拟还原为：</div>
                <div className="restored-name">{r.bestCandidate}</div>
                <div className="route-desc">
                  链路：{r.routeLabel} ({r.routeId})
                </div>
              </div>
            ))}
            {results.length === 0 && (
              <div className="empty-hint">请输入待诊断的乱码文件名</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
