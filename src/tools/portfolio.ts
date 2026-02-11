import { PositionManager } from '../positions';
import { PriceService } from '../services/price';
import { ToolResult } from '../types';

export async function getPortfolio(
  positions: PositionManager,
  priceService: PriceService
): Promise<ToolResult> {
  const openPositions = positions.getOpenPositions();

  // Update current prices for all open positions
  const positionsWithPrices = await Promise.all(
    openPositions.map(async (pos) => {
      const price = await priceService.getTokenAnalysis(pos.tokenMint);
      const currentPrice = price?.priceUsd || pos.currentPriceUsd;
      const pnlPct = pos.entryPriceUsd > 0
        ? ((currentPrice - pos.entryPriceUsd) / pos.entryPriceUsd) * 100
        : 0;

      // Update in position manager
      positions.updatePosition(pos.tokenMint, {
        currentPriceUsd: currentPrice,
        pnlPct,
      });

      return {
        token: pos.tokenSymbol || pos.tokenMint.slice(0, 8) + '...',
        mint: pos.tokenMint,
        entry_price_usd: pos.entryPriceUsd,
        current_price_usd: currentPrice,
        sol_invested: pos.entrySol,
        pnl_pct: Math.round(pnlPct * 100) / 100,
        status: pos.status,
        opened_at: pos.openedAt,
        token_amount: pos.tokenAmount,
      };
    })
  );

  const closedPositions = positions.getClosedPositions();

  return {
    success: true,
    data: {
      open_positions: positionsWithPrices,
      open_count: openPositions.length,
      closed_count: closedPositions.length,
      total_sol_invested: openPositions.reduce((sum, p) => sum + p.entrySol, 0),
    },
  };
}
