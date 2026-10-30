export interface MojibakeCandidate {
  text: string;
  routeId: string;
  confidence: number;
}

export interface RecoverMojibakeResult {
  original: string;
  bestCandidate: string;
  routeId: string;
  routeLabel: string;
  confidence: number;
  isAlreadyValid: boolean;
  alternatives: MojibakeCandidate[];
}

export interface RenameResultItem {
  oldPath: string;
  newPath: string;
  ok: boolean;
  error?: string;
}

export interface ExecuteRenameBatchResult {
  batchId: string;
  backupFilePath: string;
  successCount: number;
  results: RenameResultItem[];
}

export interface RollbackRenameBatchResult {
  batchId: string;
  restoredCount: number;
  ok: boolean;
  errors: string[];
}

export declare function encodeToSingleByteOrGbk(str: string, encoding: "gbk" | "latin1" | "big5" | "shift_jis"): Buffer | null;
export declare function scoreReadability(candidate: string): number;
export declare function recoverMojibake(corruptedName: string): RecoverMojibakeResult;
export declare function executeRenameBatch(items: Array<{ oldPath: string; newName: string }>, backupDir: string): ExecuteRenameBatchResult;
export declare function rollbackRenameBatch(backupFilePath: string): RollbackRenameBatchResult;
export declare const COMMON_HANZI: Set<string>;
