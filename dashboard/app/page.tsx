"use client";

import { useDashboard } from "./use-dashboard";
import { Position, ActivityEntry } from "./types";

function truncateAddress(addr: string, chars = 4): string {
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-card border border-card-border rounded-lg p-4">
      <div className="text-muted text-xs uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className={`text-2xl font-bold ${color || "text-foreground"}`}>
        {value}
      </div>
      {sub && <div className="text-muted text-xs mt-1">{sub}</div>}
    </div>
  );
}

function PositionRow({ pos, isClosed }: { pos: Position; isClosed?: boolean }) {
  const symbol = pos.tokenSymbol || truncateAddress(pos.tokenMint);
  const pnlColor = pos.pnlPct >= 0 ? "text-green" : "text-red";
  const pnlSign = pos.pnlPct >= 0 ? "+" : "";
  const lastTx = pos.txSignatures[pos.txSignatures.length - 1];

  return (
    <tr className="border-b border-card-border hover:bg-card-border/30 transition-colors">
      <td className="py-3 px-3">
        <a
          href={`https://dexscreener.com/solana/${pos.tokenMint}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue hover:underline font-medium"
        >
          {symbol}
        </a>
        <div className="text-muted text-[10px]">
          {truncateAddress(pos.tokenMint, 6)}
        </div>
      </td>
      <td className="py-3 px-3 text-right">{pos.entrySol} SOL</td>
      <td className="py-3 px-3 text-right">
        ${pos.entryPriceUsd.toFixed(8)}
      </td>
      {!isClosed && (
        <td className="py-3 px-3 text-right">
          ${pos.currentPriceUsd.toFixed(8)}
        </td>
      )}
      <td className={`py-3 px-3 text-right font-bold ${pnlColor}`}>
        {pnlSign}
        {pos.pnlPct.toFixed(2)}%
      </td>
      <td className="py-3 px-3 text-right text-muted text-xs">
        {timeAgo(isClosed && pos.closedAt ? pos.closedAt : pos.openedAt)}
      </td>
      <td className="py-3 px-3 text-right">
        {lastTx && (
          <a
            href={`https://solscan.io/tx/${lastTx}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-yellow hover:underline text-xs"
          >
            tx
          </a>
        )}
      </td>
    </tr>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const typeBadges: Record<string, string> = {
    buy: "bg-green/20 text-green",
    sell: "bg-red/20 text-red",
    signal: "bg-yellow/20 text-yellow",
    error: "bg-red/20 text-red",
    info: "bg-blue/20 text-blue",
    agent: "bg-muted/20 text-muted",
  };

  return (
    <div className="flex items-start gap-3 py-2 border-b border-card-border/50">
      <span
        className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${typeBadges[entry.type] || "bg-muted/20 text-muted"}`}
      >
        {entry.type}
      </span>
      <span className="flex-1 text-sm">{entry.message}</span>
      <div className="flex items-center gap-2 shrink-0">
        {entry.data?.txSignature && (
          <a
            href={`https://solscan.io/tx/${entry.data.txSignature}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-yellow hover:underline text-xs"
          >
            tx
          </a>
        )}
        {entry.data?.tokenMint && (
          <a
            href={`https://dexscreener.com/solana/${entry.data.tokenMint}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue hover:underline text-xs"
          >
            chart
          </a>
        )}
        <span className="text-muted text-[10px]">
          {timeAgo(entry.timestamp)}
        </span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data, connected, loading } = useDashboard();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted text-lg">Loading SolTrader...</div>
      </div>
    );
  }

  const { wallet, stats, openPositions, closedPositions, activity } = data;
  const totalPnl = stats.realizedPnlSol + stats.unrealizedPnlSol;
  const pnlColor = totalPnl >= 0 ? "text-green" : "text-red";

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">SolTrader</h1>
          <div className="text-muted text-xs mt-1">
            Wallet:{" "}
            <a
              href={`https://solscan.io/account/${wallet.publicKey}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue hover:underline"
            >
              {truncateAddress(wallet.publicKey, 6)}
            </a>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${connected ? "bg-green" : "bg-red"}`}
          />
          <span className="text-xs text-muted">
            {connected ? "Agent Connected" : "Agent Offline"}
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard
          label="Balance"
          value={`${wallet.solBalance.toFixed(4)} SOL`}
        />
        <StatCard
          label="Total P&L"
          value={`${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(4)} SOL`}
          color={pnlColor}
          sub={`Real: ${stats.realizedPnlSol.toFixed(4)} | Unreal: ${stats.unrealizedPnlSol.toFixed(4)}`}
        />
        <StatCard
          label="Win Rate"
          value={`${stats.winRate}%`}
          color={stats.winRate >= 50 ? "text-green" : stats.winRate > 0 ? "text-red" : "text-muted"}
          sub={`${stats.wins}W / ${stats.losses}L`}
        />
        <StatCard
          label="Total Trades"
          value={stats.totalTrades.toString()}
        />
        <StatCard
          label="Open"
          value={stats.openCount.toString()}
          color="text-yellow"
        />
        <StatCard
          label="Closed"
          value={stats.closedCount.toString()}
          color="text-muted"
        />
      </div>

      {/* Open Positions */}
      <div className="bg-card border border-card-border rounded-lg mb-6 overflow-hidden">
        <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
          <h2 className="font-bold text-sm">Open Positions</h2>
          <span className="text-muted text-xs">
            {openPositions.length} active
          </span>
        </div>
        {openPositions.length === 0 ? (
          <div className="p-8 text-center text-muted text-sm">
            No open positions
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-xs uppercase border-b border-card-border">
                  <th className="text-left py-2 px-3">Token</th>
                  <th className="text-right py-2 px-3">Invested</th>
                  <th className="text-right py-2 px-3">Entry</th>
                  <th className="text-right py-2 px-3">Current</th>
                  <th className="text-right py-2 px-3">P&L</th>
                  <th className="text-right py-2 px-3">Age</th>
                  <th className="text-right py-2 px-3">Tx</th>
                </tr>
              </thead>
              <tbody>
                {openPositions.map((pos) => (
                  <PositionRow key={pos.id} pos={pos} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Closed Positions */}
      <div className="bg-card border border-card-border rounded-lg mb-6 overflow-hidden">
        <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
          <h2 className="font-bold text-sm">Closed Positions</h2>
          <span className="text-muted text-xs">
            {closedPositions.length} closed
          </span>
        </div>
        {closedPositions.length === 0 ? (
          <div className="p-8 text-center text-muted text-sm">
            No closed positions yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-xs uppercase border-b border-card-border">
                  <th className="text-left py-2 px-3">Token</th>
                  <th className="text-right py-2 px-3">Invested</th>
                  <th className="text-right py-2 px-3">Entry</th>
                  <th className="text-right py-2 px-3">P&L</th>
                  <th className="text-right py-2 px-3">Closed</th>
                  <th className="text-right py-2 px-3">Tx</th>
                </tr>
              </thead>
              <tbody>
                {closedPositions.map((pos) => (
                  <PositionRow key={pos.id} pos={pos} isClosed />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Activity Log */}
      <div className="bg-card border border-card-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-card-border">
          <h2 className="font-bold text-sm">Activity Log</h2>
        </div>
        <div className="max-h-96 overflow-y-auto px-4 py-2">
          {activity.length === 0 ? (
            <div className="py-8 text-center text-muted text-sm">
              No activity yet — start the agent to begin trading
            </div>
          ) : (
            activity.map((entry) => (
              <ActivityRow key={entry.id} entry={entry} />
            ))
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 text-center text-muted text-xs">
        SolTrader Agent — Powered by Claude
      </div>
    </div>
  );
}
