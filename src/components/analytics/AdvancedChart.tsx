
"use client";

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, ColorType, CrosshairMode, IChartApi, CandlestickSeries, createSeriesMarkers, Time, UTCTimestamp } from 'lightweight-charts';
import { Card, cn } from "@/components/ui/core";
import { Loader2, TrendingUp, AlertCircle, Calendar } from "lucide-react";
import { fetchBitcoinHistory } from '@/app/actions/bitcoin';

interface Transaction {
    id: string;
    amount: number;
    priceAtTime: number;
    timestamp: string | Date;
    wallet?: { name: string };
}

interface AdvancedChartProps {
    transactions: Transaction[];
}

type Timeframe = '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL';

export default function AdvancedChart({ transactions }: AdvancedChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [ohlcData, setOhlcData] = useState<any[]>([]);
    const [timeframe, setTimeframe] = useState<Timeframe>('3M');

    // Fetch OHLC Data via Server Action
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const { source, data } = await fetchBitcoinHistory(timeframe);

                let formatted: any[] = [];

                if (source === 'CoinCap' || source === 'Kraken') {
                    // Pre-formatted object data from server (already numeric OHLC + time in seconds)
                    formatted = data.map((item: any) => ({
                        time: item.time as UTCTimestamp,
                        open: item.open,
                        high: item.high,
                        low: item.low,
                        close: item.close
                    }));
                } else {
                    // Binance: raw klines array of [openTime, open, high, low, close, ...] with string numerics
                    formatted = data.map((item: any[]) => ({
                        time: (item[0] / 1000) as UTCTimestamp,
                        open: parseFloat(item[1]),
                        high: parseFloat(item[2]),
                        low: parseFloat(item[3]),
                        close: parseFloat(item[4]),
                    }));
                }

                formatted.sort((a: any, b: any) => (a.time as number) - (b.time as number));
                setOhlcData(formatted);
            } catch (err) {
                console.error(err);
                // Fallback client-side fetch to Binance just in case server fails? 
                // Or just show error. Let's show specific error.
                if (timeframe === 'ALL') {
                    setError("Full history failed. Try '1Y' for recent data.");
                } else {
                    setError("Failed to load chart data.");
                }
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [timeframe]);

    // Create markers from transactions
    const markers = useMemo(() => {
        if (!ohlcData.length) return [];

        // Filter transactions within the loaded data range
        const startTime = ohlcData[0].time as number;

        return transactions
            .map(tx => {
                const txTime = new Date(tx.timestamp).getTime() / 1000;
                return {
                    time: txTime as UTCTimestamp,
                    position: 'belowBar',
                    color: '#52c98a',
                    shape: 'arrowUp',
                    text: `Buy ${tx.amount.toFixed(4)}`,
                    size: 1,
                    originalPrice: tx.priceAtTime
                };
            })
            .filter(m => (m.time as number) >= startTime)
            .sort((a, b) => (a.time as number) - (b.time as number));

    }, [transactions, ohlcData]);


    // Initialize Chart
    useEffect(() => {
        if (!chartContainerRef.current || !ohlcData.length) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: '#8c8a80',
            },
            grid: {
                vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
                horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
            },
            width: chartContainerRef.current.clientWidth,
            height: 500,
            crosshair: {
                mode: CrosshairMode.Normal,
            },
            timeScale: {
                borderColor: 'rgba(255, 255, 255, 0.08)',
                timeVisible: true,
            },
            rightPriceScale: {
                borderColor: 'rgba(255, 255, 255, 0.08)',
            },
        });

        chartRef.current = chart;

        const candlestickSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#52c98a',
            downColor: '#e5605a',
            borderVisible: false,
            wickUpColor: '#52c98a',
            wickDownColor: '#e5605a',
        });

        candlestickSeries.setData(ohlcData);

        // Add markers logic
        const adjustedMarkers = markers.map(m => {
            const closest = ohlcData.reduce((prev, curr) => {
                return (Math.abs((curr.time as number) - (m.time as number)) < Math.abs((prev.time as number) - (m.time as number)) ? curr : prev);
            });
            return {
                ...m,
                time: closest.time
            };
        });

        // Dedupe
        const uniqueMarkers = adjustedMarkers.filter((v, i, a) => a.findIndex(t => t.time === v.time) === i);
        uniqueMarkers.sort((a, b) => (a.time as number) - (b.time as number));

        createSeriesMarkers(candlestickSeries, uniqueMarkers as any);

        // Auto-Zoom only on ALL or if context allows
        if (timeframe === 'ALL' && transactions.length > 0) {
            const earliestTx = transactions.reduce((min, p) => p.timestamp < min.timestamp ? p : min, transactions[0]);
            const earliestTime = new Date(earliestTx.timestamp).getTime() / 1000;
            const dataStartTime = ohlcData[0].time as number;
            // Ensure we zoom to max of data start or tx start
            const from = Math.max(earliestTime, dataStartTime);

            chart.timeScale().setVisibleRange({
                from: from - (86400 * 7) as UTCTimestamp,
                to: (Date.now() / 1000 + (86400 * 14)) as UTCTimestamp
            });
        } else {
            chart.timeScale().fitContent();
        }

        const handleResize = () => {
            if (chartContainerRef.current) {
                chart.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
            chartRef.current = null;
        };
    }, [ohlcData, markers, transactions, timeframe]);

    return (
        <Card className="p-0 flex flex-col">
            {/* Header with Title and Selectors */}
            <div className="flex flex-col md:flex-row justify-between items-center p-4 border-b border-border gap-4">
                <div className="flex items-center gap-2 self-start md:self-auto">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    <div>
                        <h3 className="text-sm font-medium text-foreground">Advanced analysis</h3>
                        <p className="text-xs text-faint">Binance data &middot; {timeframe} candle</p>
                    </div>
                </div>

                <div className="flex bg-white/[0.03] rounded-lg p-0.5 border border-border overflow-x-auto max-w-full">
                    {(['1D', '1W', '1M', '3M', '1Y', 'ALL'] as Timeframe[]).map((t) => (
                        <button
                            key={t}
                            onClick={() => setTimeframe(t)}
                            className={cn(
                                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap",
                                timeframe === t
                                    ? "bg-primary text-black"
                                    : "text-muted hover:text-foreground hover:bg-white/5"
                            )}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            <div ref={chartContainerRef} className="w-full h-[500px] relative">
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-20 transition-opacity">
                        <Loader2 className="w-6 h-6 text-primary animate-spin" />
                    </div>
                )}
                {error && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-20 text-red-400 gap-2">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-sm font-medium">{error}</span>
                        <button
                            onClick={() => setTimeframe('3M')}
                            className="ml-4 px-3 py-1 bg-white/10 text-foreground text-xs rounded-md hover:bg-white/20"
                        >
                            Retry
                        </button>
                    </div>
                )}
            </div>
        </Card>
    );
}
