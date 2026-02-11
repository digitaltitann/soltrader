import * as http from 'http';
import { Connection, Keypair } from '@solana/web3.js';
import { PositionManager } from './positions';
import { PriceService } from './services/price';
import { getSolBalance } from './services/solana';
import { getActivities } from './activity-log';
import { logInfo } from './logger';

export class ApiServer {
  private server: http.Server;
  private positions: PositionManager;
  private priceService: PriceService;
  private connection: Connection;
  private wallet: Keypair;

  constructor(
    positions: PositionManager,
    priceService: PriceService,
    connection: Connection,
    wallet: Keypair
  ) {
    this.positions = positions;
    this.priceService = priceService;
    this.connection = connection;
    this.wallet = wallet;

    this.server = http.createServer(async (req, res) => {
      // CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      res.setHeader('Content-Type', 'application/json');

      try {
        if (req.url === '/api/dashboard') {
          const data = await this.getDashboardData();
          res.writeHead(200);
          res.end(JSON.stringify(data));
        } else if (req.url === '/api/activity') {
          const activities = getActivities(200);
          res.writeHead(200);
          res.end(JSON.stringify(activities));
        } else if (req.url === '/api/health') {
          res.writeHead(200);
          res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      } catch (err: any) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  }

  private async getDashboardData() {
    const balance = await getSolBalance(this.connection, this.wallet.publicKey);
    const openPositions = this.positions.getOpenPositions();
    const closedPositions = this.positions.getClosedPositions();

    // Update prices for open positions
    const openWithPrices = await Promise.all(
      openPositions.map(async (pos) => {
        const price = await this.priceService.getTokenAnalysis(pos.tokenMint);
        const currentPrice = price?.priceUsd || pos.currentPriceUsd;
        const pnlPct = pos.entryPriceUsd > 0
          ? ((currentPrice - pos.entryPriceUsd) / pos.entryPriceUsd) * 100
          : 0;
        return { ...pos, currentPriceUsd: currentPrice, pnlPct };
      })
    );

    // Calculate stats
    const totalTrades = openPositions.length + closedPositions.length;
    const wins = closedPositions.filter(p => p.pnlPct > 0).length;
    const winRate = closedPositions.length > 0 ? (wins / closedPositions.length) * 100 : 0;
    const totalPnlSol = closedPositions.reduce((sum, p) => {
      const pnlSol = p.entrySol * (p.pnlPct / 100);
      return sum + pnlSol;
    }, 0);
    const unrealizedPnlSol = openWithPrices.reduce((sum, p) => {
      const pnlSol = p.entrySol * (p.pnlPct / 100);
      return sum + pnlSol;
    }, 0);

    return {
      wallet: {
        publicKey: this.wallet.publicKey.toBase58(),
        solBalance: balance,
      },
      stats: {
        totalTrades,
        openCount: openPositions.length,
        closedCount: closedPositions.length,
        winRate: Math.round(winRate * 10) / 10,
        wins,
        losses: closedPositions.length - wins,
        realizedPnlSol: Math.round(totalPnlSol * 10000) / 10000,
        unrealizedPnlSol: Math.round(unrealizedPnlSol * 10000) / 10000,
      },
      openPositions: openWithPrices,
      closedPositions,
      activity: getActivities(50),
    };
  }

  start(port: number = 3001): void {
    this.server.listen(port, () => {
      logInfo(`Dashboard API running at http://localhost:${port}`);
    });
  }
}
