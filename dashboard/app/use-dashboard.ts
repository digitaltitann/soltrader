"use client";

import { useState, useEffect, useCallback } from "react";
import { DashboardData } from "./types";

// When deployed on Vercel, use same-origin API routes (server-side proxy to agent)
// When running locally, hit the agent API directly
const API_URL =
  typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? "" // same-origin — uses /api/dashboard route handler on Vercel
    : "http://localhost:3001";
const POLL_INTERVAL = 10000; // 10 seconds

// Demo data for when the agent isn't running
const DEMO_DATA: DashboardData = {
  wallet: {
    publicKey: "3zwtJvmp1sZrFYW2pci1feDxq3ZVovoEw8hN63MycZ3y",
    solBalance: 0,
  },
  stats: {
    totalTrades: 0,
    openCount: 0,
    closedCount: 0,
    winRate: 0,
    wins: 0,
    losses: 0,
    realizedPnlSol: 0,
    unrealizedPnlSol: 0,
  },
  openPositions: [],
  closedPositions: [],
  activity: [],
};

export function useDashboard() {
  const [data, setData] = useState<DashboardData>(DEMO_DATA);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/dashboard`);
      if (!res.ok) throw new Error("API error");
      const json: DashboardData = await res.json();
      setData(json);
      setConnected(true);
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { data, connected, loading };
}
