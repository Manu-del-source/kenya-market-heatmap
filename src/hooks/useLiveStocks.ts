"use client";

import { useEffect, useState } from "react";
import { stocks as initialStocks, Stock } from "@/data/stocks";

export type TickDirection = "up" | "down" | "flat";

export type LiveStock = Stock & {
  direction: TickDirection;
  lastMove: number;
};

const TICK_MS = 2000;
const MAX_DRIFT = 0.004; // ±0.4% max move per tick
const PRICE_FLOOR = 0.05;

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function useLiveStocks() {
  const [stocks, setStocks] = useState<LiveStock[]>(() =>
    initialStocks.map((stock) => ({
      ...stock,
      direction: "flat",
      lastMove: 0,
    }))
  );

  const [paused, setPaused] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Previous close is fixed at session start so `change` is always vs. open.
  const [prevClose] = useState<Map<string, number>>(() => {
    const closes = new Map<string, number>();
    for (const stock of initialStocks) {
      closes.set(stock.symbol, stock.price / (1 + stock.change / 100));
    }
    return closes;
  });

  useEffect(() => {
    if (paused) return;

    const id = setInterval(() => {
      setStocks((current) =>
        current.map((stock) => {
          const close = prevClose.get(stock.symbol) ?? stock.price;
          const drift = (Math.random() * 2 - 1) * MAX_DRIFT;
          const price = Math.max(round2(stock.price * (1 + drift)), PRICE_FLOOR);
          const change = round2((price / close - 1) * 100);

          return {
            ...stock,
            price,
            change,
            direction:
              price > stock.price ? "up" : price < stock.price ? "down" : "flat",
            lastMove: stock.lastMove + 1,
          };
        })
      );

      setLastUpdate(new Date());
    }, TICK_MS);

    return () => clearInterval(id);
  }, [paused, prevClose]);

  return {
    stocks,
    paused,
    togglePaused: () => setPaused((value) => !value),
    lastUpdate,
  };
}
