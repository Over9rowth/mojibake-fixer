// Copyright (C) 2026 Over9rowth
// SPDX-License-Identifier: GPL-3.0-only
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('mojibake', {
  exportReportJson: (json: string) => ipcRenderer.invoke('export-report-json', json),
  exportManualPdf: () => ipcRenderer.invoke('export-manual-pdf'),
  smokeReady: (p: { mounted: boolean; engineOk: boolean }) => ipcRenderer.send('smoke-ready', p),
  onSmokeRun: (cb: () => void) => ipcRenderer.on('smoke:run', () => cb()),
  smokeResult: (payload: unknown) => ipcRenderer.invoke('smoke:result', payload),
});
