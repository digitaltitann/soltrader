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

  hasToken(mint: string): boolean {
    return this.seenTokens.has(mint);
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
    }
    this.save();
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

      this.positions = new Map(Object.entries(data.openPositions || {}));
      this.closedPositions = data.closedPositions || [];
      this.seenTokens = new Set(data.seenTokens || []);

      logInfo(`Loaded ${this.positions.size} positions, ${this.seenTokens.size} seen tokens`);
    } catch (err) {
      logError('Failed to load positions', err);
    }
  }
}
