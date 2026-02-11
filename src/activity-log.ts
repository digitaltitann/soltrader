import * as fs from 'fs';
import * as path from 'path';

export interface ActivityEntry {
  id: string;
  timestamp: string;
  type: 'buy' | 'sell' | 'signal' | 'error' | 'info' | 'agent';
  message: string;
  data?: {
    tokenMint?: string;
    tokenSymbol?: string;
    solAmount?: number;
    txSignature?: string;
    pnlPct?: number;
    [key: string]: any;
  };
}

const LOG_FILE = path.join(process.cwd(), 'activity-log.json');
const MAX_ENTRIES = 500;

let entries: ActivityEntry[] = [];

function load(): void {
  try {
    if (fs.existsSync(LOG_FILE)) {
      entries = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
    }
  } catch {
    entries = [];
  }
}

function save(): void {
  try {
    fs.writeFileSync(LOG_FILE, JSON.stringify(entries, null, 2));
  } catch {}
}

load();

export function addActivity(
  type: ActivityEntry['type'],
  message: string,
  data?: ActivityEntry['data']
): void {
  const entry: ActivityEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    type,
    message,
    data,
  };
  entries.unshift(entry); // newest first
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(0, MAX_ENTRIES);
  }
  save();
}

export function getActivities(limit: number = 100): ActivityEntry[] {
  return entries.slice(0, limit);
}
