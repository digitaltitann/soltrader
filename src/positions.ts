import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Position, PositionsData } from './types';
import { logInfo, logError } from './logger';

const POSITIONS_FILE = path.join(process.cwd(), 'positions.json');

export class PositionManager {
  private positions: Map<string, Position> = new Map();
  private closedPositions: Position[] = [];
  private seenTokens: Set<string> = new Set();

  constructor() {
    this.load();
  }

  hasOpenPosition(mint: string): boolean {
    const pos = this.positions.get(mint);
    return !!pos && pos.status !== 'closed';
  }

  getOpenCount(): number {
    let count = 0;
    for (const pos of this.positions.values()) {
      if (pos.status !== 'closed') count++;
    }
    return count;
  }

  getOpenPositions(): Position[] {
    return Array.from(this.positions.values()).filter(p => p.status !== 'closed');
  }

  getAllPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  getClosedPositions(): Position[] {
    return this.closedPositions;
  }

  getPosition(mint: string): Position | undefined {
    return this.positions.get(mint);
  }

  addPosition(pos: Omit<Position, 'id'>): Position {
    const position: Position = {
      ...pos,
      id: crypto.randomUUID(),
    };
    this.positions.set(pos.tokenMint, position);
    this.seenTokens.add(pos.tokenMint);
    this.save();
    return position;
  }

  updatePosition(mint: string, updates: Partial<Position>): void {
    const pos = this.positions.get(mint);
    if (!pos) return;
    Object.assign(pos, updates);
    if (pos.status === 'closed') {
      this.closedPositions.push({ ...pos });
      this.positions.delete(mint); // Remove from open positions map
    }
    this.save();
  }

  // Close a position that has no actual tokens (phantom/failed trade)
  closePhantom(mint: string, reason: string): void {
    const pos = this.positions.get(mint);
    if (!pos) return;
    pos.status = 'closed';
    pos.closedAt = new Date().toISOString();
    pos.pnlPct = -100; // Assume total loss
    this.closedPositions.push({ ...pos });
    this.positions.delete(mint);
    logInfo(`Closed phantom position: ${pos.tokenSymbol || mint} (${reason})`);
    this.save();
  }

  // Remove a mint from seen tokens so it can be bought again
  clearSeen(mint: string): void {
    this.seenTokens.delete(mint);
  }

  private save(): void {
    try {
      const data: PositionsData = {
        openPositions: Object.fromEntries(this.positions),
        closedPositions: this.closedPositions,
        seenTokens: Array.from(this.seenTokens),
        lastUpdated: new Date().toISOString(),
      };
      fs.writeFileSync(POSITIONS_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      logError('Failed to save positions', err);
    }
  }

  private load(): void {
    try {
      if (!fs.existsSync(POSITIONS_FILE)) return;
      const raw = fs.readFileSync(POSITIONS_FILE, 'utf-8');
      const data: PositionsData = JSON.parse(raw);

      // Only load non-closed positions into the active map
      const allPositions = new Map(Object.entries(data.openPositions || {}));
      for (const [mint, pos] of allPositions) {
        if (pos.status === 'closed') {
          // Move to closed list if not already there
          if (!data.closedPositions?.some(cp => cp.id === pos.id)) {
            this.closedPositions.push(pos);
          }
        } else {
          this.positions.set(mint, pos);
        }
      }

      this.closedPositions = [
        ...this.closedPositions,
        ...(data.closedPositions || []),
      ];
      this.seenTokens = new Set(data.seenTokens || []);

      logInfo(`Loaded ${this.positions.size} open positions, ${this.closedPositions.length} closed, ${this.seenTokens.size} seen tokens`);
    } catch (err) {
      logError('Failed to load positions', err);
    }
  }
}
