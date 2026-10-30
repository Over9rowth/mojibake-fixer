// Copyright (C) 2026 Over9rowth
// SPDX-License-Identifier: GPL-3.0-only
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';

let win: BrowserWindow | null = null;
const smoke = process.argv.includes('--smoke');

app.disableHardwareAcceleration();

const PRODUCT_NAME = '乱码文件名修复台';
const squirrelEvent = process.platform === 'win32'
  ? ['--squirrel-install', '--squirrel-updated', '--squirrel-uninstall', '--squirrel-obsolete'].find((a) => process.argv.includes(a))
  : undefined;

if (squirrelEvent) {
  try {
    const exeName = path.basename(process.execPath);
    const appDir = path.resolve(path.dirname(process.execPath), '..');
    const stub = path.join(appDir, exeName);
    const startMenu = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    const links = [path.join(startMenu, PRODUCT_NAME + '.lnk'), path.join(app.getPath('desktop'), PRODUCT_NAME + '.lnk')];
    const removing = squirrelEvent === '--squirrel-uninstall' || squirrelEvent === '--squirrel-obsolete';
    if (removing) {
      for (const lnk of links) { try { require('node:fs').unlinkSync(lnk); } catch { /* ignore */ } }
    } else {
      for (const lnk of links) shell.writeShortcutLink(lnk, 'create', { target: stub, args: '', icon: stub, iconIndex: 0, description: PRODUCT_NAME });
    }
  } catch {
    try {
      const exeName = path.basename(process.execPath);
      const updateExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
      const args = squirrelEvent === '--squirrel-uninstall' || squirrelEvent === '--squirrel-obsolete'
        ? ['--removeShortcut', exeName] : ['--createShortcut', exeName];
      require('node:child_process').spawnSync(updateExe, args, { timeout: 20000, windowsHide: true, stdio: 'ignore' });
    } catch { /* ignore */ }
  }
  app.exit(0);
}

function senderCheck(e: { sender: Electron.WebContents; senderFrame: Electron.WebFrameMain | null }) {
  if (!win || e.sender !== win.webContents || e.senderFrame !== win.webContents.mainFrame) throw Error('拒绝未知窗口');
}

/** 打印 HTML -> PDF (A4) */
async function htmlToPdf(html: string): Promise<Buffer> {
  const win2 = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await win2.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await new Promise((r) => setTimeout(r, 400));
    return await win2.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true });
  } finally {
    win2.destroy();
  }
}

app.whenReady().then(async () => {
  if (!smoke) {
    ipcMain.handle('export-report-json', async (e, reportJson: string) => {
      senderCheck(e);
      const r = await dialog.showSaveDialog(win!, {
        defaultPath: '乱码修复分析报告.json',
        filters: [{ name: 'JSON 数据报告', extensions: ['json'] }],
      });
      if (r.canceled || !r.filePath) return null;
      await fs.writeFile(r.filePath, reportJson, 'utf8');
      return { path: r.filePath, bytes: Buffer.byteLength(reportJson, 'utf8') };
    });

    ipcMain.handle('export-manual-pdf', async (e) => {
      senderCheck(e);
      const html = await fs.readFile(path.join(__dirname, '../manual.html'), 'utf8');
      const r = await dialog.showSaveDialog(win!, {
        defaultPath: '乱码文件名修复台-使用说明书.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (r.canceled || !r.filePath) return null;
      const pdf = await htmlToPdf(html);
      await fs.writeFile(r.filePath, pdf);
      return { path: r.filePath, bytes: pdf.length };
    });
  }

  if (smoke) {
    const os = await import('node:os');
    ipcMain.on('smoke-ready', (e, payload) => {
      try {
        senderCheck(e);
        console.log('[smoke] renderer ready, mounted=' + payload.mounted + ' engineOk=' + payload.engineOk);
        if (!payload.mounted || !payload.engineOk) { app.exit(1); return; }
        win!.webContents.send('smoke:run');
      } catch { app.exit(1); }
    });

    ipcMain.handle('smoke:result', async (e, payload) => {
      try { senderCheck(e); } catch { app.exit(1); return; }
      try {
        const r = typeof payload === 'string' ? JSON.parse(payload) : payload;
        const items = r?.items;
        if (!Array.isArray(items) || items.length === 0) throw Error('渲染进程诊断样本为空');
        console.log(`[smoke] 乱码诊断样本: ${items.length} 条，首条修复结果: ${items[0].bestCandidate} (置信度 ${items[0].confidence}%)`);
        if (!(items.length >= 4)) throw Error('样本数量不足');
        if (!(items[0].confidence >= 70)) throw Error('还原置信度过低');

        const manualPath = path.join(__dirname, '../manual.html');
        const html = await fs.readFile(manualPath, 'utf8');
        const pdf = await htmlToPdf(html);
        if (pdf.length < 20000 || pdf.subarray(0, 4).toString() !== '%PDF') {
          throw Error('PDF生成失败或文件头非%PDF');
        }
        const tempPdf = path.join(os.tmpdir(), `mojibake-manual-smoke-${Date.now()}.pdf`);
        await fs.writeFile(tempPdf, pdf);
        console.log(`[smoke] 说明书PDF生成成功: ${tempPdf} (${pdf.length} 字节, %PDF 头有效)`);
        console.log('SMOKE PASS');
        app.exit(0);
      } catch (err) {
        console.log('[smoke] FAIL: ' + String((err as Error).message ?? err));
        app.exit(1);
      }
    });

    setTimeout(() => { console.log('[smoke] 超时未收到渲染进程结果'); app.exit(1); }, 60_000);
  }

  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 640,
    title: '乱码文件名修复台',
    show: true,
    backgroundColor: '#1c1917',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.on('page-title-updated', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  await win.loadFile(path.join(__dirname, '../renderer/index.html'), smoke ? { query: { smoke: '1' } } : undefined);
});

app.on('window-all-closed', () => app.quit());
