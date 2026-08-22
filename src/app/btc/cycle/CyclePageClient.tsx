"use client"

import React, { useState, useMemo } from 'react'
import {
    ComposedChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ReferenceLine,
    ResponsiveContainer,
    Area,
    ReferenceArea
} from 'recharts'
import { Settings, TrendingDown, AlertCircle, ChevronLeft, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { DashboardLayout } from "@/components/layout/DashboardLayout";

// --- Data & Types ---

type CycleData = {
    name: string
    athDate: string
    athPrice: number
    lowDate: string
    lowPrice: number
    drawdown: number
}

// Historical Data (Approximated for Schematic View)
const CYCLES: CycleData[] = [
    {
        name: "Cycle 2011",
        athDate: "2011-06-08",
        athPrice: 31.9,
        lowDate: "2011-11-18",
        lowPrice: 2,
        drawdown: -93
    },
    {
        name: "Cycle 2013-2015",
        athDate: "2013-11-29",
        athPrice: 1153,
        lowDate: "2015-01-14",
        lowPrice: 172,
        drawdown: -85
    },
    {
        name: "Cycle 2017-2018",
        athDate: "2017-12-16",
        athPrice: 19665,
        lowDate: "2018-12-15",
        lowPrice: 3236,
        drawdown: -83
    },
    {
        name: "Cycle 2021-2022",
        athDate: "2021-11-10",
        athPrice: 69044,
        lowDate: "2022-11-21",
        lowPrice: 15476,
        drawdown: -77
    }
]

// Helper to generate schematic points between ATH and Low for visualization
const generateChartData = (currentAthInput: number, avgDrawdown: number) => {
    let data: any[] = []

    CYCLES.forEach((cycle) => {
        // Pre-pump
        data.push({
            date: `Pre-${cycle.name}`,
            price: cycle.athPrice * 0.5,
            cycle: cycle.name,
            type: 'neutral'
        })

        // ATH
        data.push({
            date: cycle.athDate,
            price: cycle.athPrice,
            cycle: cycle.name,
            type: 'ath',
            label: `ATH: $${cycle.athPrice}`
        })

        // Mid-way crash
        data.push({
            date: `Mid-${cycle.name}`,
            price: cycle.athPrice * 0.6,
            cycle: cycle.name,
            type: 'bear'
        })

        // Low
        data.push({
            date: cycle.lowDate,
            price: cycle.lowPrice,
            cycle: cycle.name,
            type: 'low',
            label: `Low: $${cycle.lowPrice} (${cycle.drawdown}%)`
        })

        // Recovery
        data.push({
            date: `End-${cycle.name}`,
            price: cycle.lowPrice * 2,
            cycle: cycle.name,
            type: 'recovery'
        })
    })

    // Current/Projected Cycle
    const impliedBottom = currentAthInput * (1 + avgDrawdown / 100);

    data.push({
        date: 'Current Pre',
        price: currentAthInput * 0.5,
        cycle: 'Current',
        type: 'neutral'
    })

    data.push({
        date: 'Current ATH',
        price: currentAthInput,
        cycle: 'Current',
        type: 'ath',
        label: `Proj. ATH: $${currentAthInput}`
    })

    data.push({
        date: 'Implied Bottom',
        price: impliedBottom,
        cycle: 'Current',
        type: 'low',
        label: `Target: $${impliedBottom.toFixed(0)}`
    })

    return data
}

const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(val)
}

export default function CyclePageClient() {
    const [currentAth, setCurrentAth] = useState<number>(100000)
    const [currentPrice, setCurrentPrice] = useState<number>(96000)
    const [isSidebarOpen, setIsSidebarOpen] = useState(true)
    const [selectedCycle, setSelectedCycle] = useState<string>('Current')

    const last3AvgDrawdown = useMemo(() => {
        const last3 = CYCLES.slice(1);
        return Math.round(last3.reduce((acc, c) => acc + c.drawdown, 0) / last3.length);
    }, []);

    React.useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch('https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false');
                const data = await res.json();

                if (data.market_data) {
                    if (data.market_data.ath?.usd) {
                        setCurrentAth(data.market_data.ath.usd);
                    }
                    if (data.market_data.current_price?.usd) {
                        setCurrentPrice(data.market_data.current_price.usd);
                    }
                }
            } catch (error) {
                console.error('Failed to fetch BTC data:', error);
            }
        };
        fetchData();
    }, []);

    const activeAth = useMemo(() => {
        if (selectedCycle === 'All' || selectedCycle === 'Current') return currentAth
        const c = CYCLES.find(c => c.name === selectedCycle)
        return c ? c.athPrice : currentAth
    }, [selectedCycle, currentAth])

    const zones = useMemo(() => {
        return [
            {
                label: 'Early Bear / Dip (-50% to -60%)',
                range: [-50, -60],
                priceStart: activeAth * 0.5,
                priceEnd: activeAth * 0.4,
                color: '#EF4444',
                opacity: 0.2,
                recommendation: 'Low Conviction',
                allocation: '0%'
            },
            {
                label: 'Accumulation Zone (-60% to -70%)',
                range: [-60, -70],
                priceStart: activeAth * 0.4,
                priceEnd: activeAth * 0.3,
                color: '#F97316',
                opacity: 0.3,
                recommendation: 'Moderate Buy',
                allocation: '0%'
            },
            {
                label: 'Sniper Zone (-70% to -75%)',
                range: [-70, -75],
                priceStart: activeAth * 0.3,
                priceEnd: activeAth * 0.25,
                color: '#EAB308',
                opacity: 0.5,
                recommendation: 'Strong Buy',
                allocation: '20%'
            },
            {
                label: 'Capitulation (-75% to -80%)',
                range: [-75, -80],
                priceStart: activeAth * 0.25,
                priceEnd: activeAth * 0.20,
                color: '#84CC16',
                opacity: 0.6,
                recommendation: 'Aggressive Accumulation',
                allocation: '30%'
            },
            {
                label: 'Max Panic / Generational (-80% to -85%)',
                range: [-80, -85],
                priceStart: activeAth * 0.20,
                priceEnd: activeAth * 0.15,
                color: '#22c55e',
                opacity: 0.8,
                recommendation: 'ALL IN',
                allocation: '30% + 20% (for >85%)'
            }
        ]
    }, [activeAth])

    const chartData = useMemo(() => generateChartData(currentAth, last3AvgDrawdown), [currentAth, last3AvgDrawdown])

    const cycleStats = useMemo(() => {
        if (selectedCycle === 'All') return null
        if (selectedCycle === 'Current') {
            const drop = ((currentPrice - currentAth) / currentAth) * 100
            return {
                ath: currentAth,
                low: '???',
                drawdown: drop.toFixed(2) + '% (Current)',
                isProjected: true
            }
        }
        const c = CYCLES.find(c => c.name === selectedCycle)
        return c ? {
            ath: c.athPrice,
            low: c.lowPrice,
            drawdown: c.drawdown + '%',
            isProjected: false
        } : null
    }, [selectedCycle, currentAth, currentPrice])

    const filteredChartData = useMemo(() => {
        if (selectedCycle === 'All') {
            return chartData;
        }
        return chartData.filter(d => d.cycle === selectedCycle);
    }, [selectedCycle, chartData]);

    return (
        <DashboardLayout>
            <div className="flex flex-col xl:flex-row min-h-[calc(100vh-100px)] bg-surface text-gray-200 rounded-2xl overflow-hidden border border-border relative">
                {/* Sidebar Controls */}
                <div className={`transition-all duration-300 ease-in-out border-r border-border bg-background flex flex-col ${isSidebarOpen ? 'w-full xl:w-80 p-6 opacity-100' : 'w-0 p-0 opacity-0 overflow-hidden border-none'}`}>
                    <div className="min-w-[280px]"> {/* Container with min-width to prevent layout shift content squishing during transition */}
                        <div className="flex justify-between items-center mb-2">
                            <h2 className="text-lg font-medium text-foreground flex items-center gap-2">
                                <Settings className="w-4 h-4 text-primary" />
                                Cycle config
                            </h2>
                            <button
                                onClick={() => setIsSidebarOpen(false)}
                                className="p-1 hover:bg-white/10 rounded-lg text-muted hover:text-foreground transition-colors"
                                title="Close Config Panel"
                            >
                                <PanelLeftClose className="w-4 h-4" />
                            </button>
                        </div>
                        <p className="text-xs text-faint mb-4">
                            Define current ATH to calculate accumulation zones relative to it.
                        </p>

                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <label className="text-sm font-medium text-muted">Projected/Current ATH ($)</label>
                                <span className="text-[10px] text-primary flex items-center gap-1 cursor-help" title="Auto-fetched from CoinGecko (ATH)">
                                    <Settings className="w-3 h-3" /> Auto
                                </span>
                            </div>
                            <input
                                type="number"
                                className="w-full bg-background border border-border rounded-lg p-2 text-foreground font-num focus:border-primary/50 outline-none"
                                value={currentAth}
                                onChange={(e) => setCurrentAth(Number(e.target.value))}
                            />
                        </div>
                    </div>

                    {/* Zones Table */}
                    <div className="flex-1 overflow-y-auto max-h-[300px] xl:max-h-none">
                        <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                            <TrendingDown className="w-4 h-4 text-accent" />
                            Buying zones
                        </h3>

                        <div className="space-y-2.5">
                            {zones.map((zone, i) => {
                                const isActive = currentPrice <= zone.priceStart && currentPrice >= zone.priceEnd;
                                return (
                                    <div
                                        key={i}
                                        className={`p-3 rounded-lg border relative overflow-hidden transition-colors duration-200 ${isActive
                                            ? 'bg-white/[0.04]'
                                            : 'border-border bg-background/50 hover:border-border-strong'
                                            }`}
                                        style={isActive ? {
                                            borderColor: zone.color,
                                            borderWidth: '1.5px',
                                        } : {}}
                                    >
                                        {isActive && (
                                            <div
                                                className="absolute right-2 top-2 w-2 h-2 rounded-full z-10"
                                                style={{ backgroundColor: zone.color }}
                                            ></div>
                                        )}

                                        <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ backgroundColor: zone.color }}></div>

                                        <div className="flex justify-between items-start mb-1 pl-2 relative z-10">
                                            <span className={`text-xs font-medium ${isActive ? 'text-foreground' : 'text-muted'}`} style={isActive ? { color: zone.color } : {}}>{zone.label}</span>
                                            <span className="text-[10px] font-num opacity-50">{zone.allocation}</span>
                                        </div>

                                        <div className="flex justify-between items-center pl-2 font-num text-sm relative z-10">
                                            <span className="text-foreground">{formatCurrency(zone.priceStart)}</span>
                                            <span className="text-faint">&rarr;</span>
                                            <span style={{ color: zone.color }} className="font-medium">{formatCurrency(zone.priceEnd)}</span>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    <div className="text-[10px] text-faint hairline-top pt-4">
                        <p className="flex gap-2 mb-2">
                            <AlertCircle className="w-3 h-3" />
                            Purpose: Disciplined Accumulation, not price prediction.
                        </p>
                        <p>Based on historical drawdowns of -80% to -85% from ATH.</p>
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 flex flex-col h-auto xl:h-auto overflow-hidden">
                    <div className="p-6 border-b border-border flex flex-col md:flex-row justify-between items-start md:items-center bg-white/[0.02] gap-4">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                                className="p-2 hover:bg-white/10 rounded-lg text-muted hover:text-foreground transition-colors"
                                title={isSidebarOpen ? "Collapse Config" : "Expand Config"}
                            >
                                {isSidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
                            </button>
                            <h1 className="font-display text-xl font-medium text-foreground">BTC historical cycles</h1>
                        </div>
                        <div className="text-sm text-right w-full md:w-auto flex justify-between md:block">
                            <div className="text-faint">Visualization mode</div>
                            <div className="text-xs font-num text-primary">Logarithmic &middot; Area chart</div>
                        </div>
                    </div>

                    {/* Cycle Tabs */}
                    <div className="px-6 py-4 flex flex-col md:flex-row gap-4 items-center justify-between border-b border-border">
                        <div className="flex overflow-x-auto gap-2 w-full md:w-auto pb-2 md:pb-0 scrollbar-hide">
                            <button
                                onClick={() => setSelectedCycle('All')}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${selectedCycle === 'All'
                                    ? 'bg-primary text-black'
                                    : 'bg-white/5 text-muted hover:bg-white/10'
                                    }`}
                            >
                                All
                            </button>
                            {CYCLES.map(c => (
                                <button
                                    key={c.name}
                                    onClick={() => setSelectedCycle(c.name)}
                                    className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${selectedCycle === c.name
                                        ? 'bg-primary/20 text-primary'
                                        : 'bg-white/5 text-muted hover:bg-white/10'
                                        }`}
                                >
                                    {c.name.replace('Cycle ', '')}
                                </button>
                            ))}
                            <button
                                onClick={() => setSelectedCycle('Current')}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${selectedCycle === 'Current'
                                    ? 'bg-accent/20 text-accent'
                                    : 'bg-white/5 text-muted hover:bg-white/10'
                                    }`}
                            >
                                Current projection
                            </button>
                        </div>

                        {/* Stats */}
                        {cycleStats && (
                            <div className="flex gap-6 text-sm bg-white/[0.02] px-4 py-2 rounded-lg border border-border">
                                <div>
                                    <span className="text-faint text-xs block">ATH</span>
                                    <span className="text-foreground font-num font-medium">${cycleStats.ath.toLocaleString()}</span>
                                </div>
                                <div>
                                    <span className="text-faint text-xs block">Cycle low</span>
                                    <span className="text-foreground font-num font-medium">
                                        {typeof cycleStats.low === 'number' ? '$' + cycleStats.low.toLocaleString() : cycleStats.low}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-faint text-xs block">Drawdown</span>
                                    <span className={`${cycleStats.isProjected ? 'text-primary' : 'text-red-400'} font-num font-medium`}>
                                        {cycleStats.drawdown}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 p-4 relative h-[500px] xl:h-auto min-h-[400px] flex flex-col overflow-y-auto">
                        <div className="flex-1 min-h-[400px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={filteredChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                                    <defs>
                                        <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#d6a24c" stopOpacity={0.2} />
                                            <stop offset="95%" stopColor="#d6a24c" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>

                                    <CartesianGrid strokeDasharray="none" stroke="rgba(255,255,255,0.06)" vertical={false} />
                                    <XAxis
                                        dataKey="date"
                                        stroke="rgba(255,255,255,0.08)"
                                        tick={{ fontSize: 10, fill: '#565550' }}
                                        interval={selectedCycle === 'All' ? 5 : 0}
                                    />
                                    <YAxis
                                        scale="log"
                                        domain={[() => zones[zones.length - 1].priceEnd * 0.9, 'auto']}
                                        stroke="rgba(255,255,255,0.08)"
                                        tick={{ fontSize: 10, fill: '#565550' }}
                                        tickFormatter={(val) => `$${val}`}
                                        allowDataOverflow={false}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#181714', borderColor: 'rgba(255,255,255,0.08)', color: '#f0eee6', borderRadius: 8 }}
                                        itemStyle={{ color: '#f0eee6' }}
                                        formatter={(val: number | undefined) => [val != null ? `$${val.toLocaleString()}` : '', 'Price']}
                                        labelStyle={{ color: '#8c8a80' }}
                                    />

                                    <Area
                                        type="monotone"
                                        dataKey="price"
                                        stroke="#d6a24c"
                                        strokeWidth={1.5}
                                        fillOpacity={1}
                                        fill="url(#colorPrice)"
                                    />

                                    <Line
                                        type="monotone"
                                        dataKey="price"
                                        stroke="none"
                                        tooltipType="none"
                                        dot={(props: any) => {
                                            if (props.payload.type === 'ath') return <circle cx={props.cx} cy={props.cy} r={3} fill="#52c98a" stroke="none" />
                                            if (props.payload.type === 'low') return <circle cx={props.cx} cy={props.cy} r={3} fill="#e5605a" stroke="none" />
                                            return <></>
                                        }}
                                        activeDot={false}
                                        isAnimationActive={false}
                                    />

                                    {zones.map((zone, i) => (
                                        <ReferenceArea
                                            key={i}
                                            y1={zone.priceStart}
                                            y2={zone.priceEnd}
                                            fill={zone.color}
                                            fillOpacity={zone.opacity * 0.25}
                                            strokeOpacity={0}
                                            label={{
                                                position: 'insideRight',
                                                value: `${zone.range[0]}%`,
                                                fill: zone.color,
                                                fontSize: 10,
                                                opacity: 0.8
                                            }}
                                        />
                                    ))}

                                    {selectedCycle === 'Current' && (
                                        <ReferenceLine
                                            y={currentPrice}
                                            stroke="#d6a24c"
                                            strokeDasharray="3 3"
                                            label={(props) => {
                                                const { viewBox } = props;
                                                const x = viewBox.width - 100;
                                                const y = viewBox.y;
                                                return (
                                                    <g transform={`translate(${x},${y})`}>
                                                        <circle cx="0" cy="0" r="3" fill="#52c98a" />
                                                        <text x="10" y="4" fill="#52c98a" fontSize="12" fontWeight="500">
                                                            ${currentPrice.toLocaleString()}
                                                        </text>
                                                    </g>
                                                )
                                            }}
                                        />
                                    )}

                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Legend */}
                        <div className="mt-8 hairline-top pt-6 px-4 pb-12">
                            <div className="flex flex-wrap gap-4 justify-center md:justify-start mb-6">
                                <div className="flex items-center gap-3 bg-white/[0.02] px-4 py-2 rounded-lg border border-border">
                                    <div className="p-2 bg-primary/10 rounded-lg">
                                        <TrendingDown className="w-4 h-4 text-primary" />
                                    </div>
                                    <div>
                                        <div className="text-[10px] text-faint uppercase tracking-wider font-medium">Avg drawdown (last 3 cycles)</div>
                                        <div className="text-lg font-num font-medium text-foreground">
                                            {last3AvgDrawdown}%
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 bg-white/[0.02] px-4 py-2 rounded-lg border border-border">
                                    <div className="p-2 bg-accent/10 rounded-lg">
                                        <Settings className="w-4 h-4 text-accent" />
                                    </div>
                                    <div>
                                        <div className="text-[10px] text-faint uppercase tracking-wider font-medium">Potential cycle bottom</div>
                                        <div className="text-lg font-num font-medium text-accent">
                                            {formatCurrency(currentAth * (1 + last3AvgDrawdown / 100))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-border text-xs text-faint uppercase tracking-wider">
                                            <th className="py-3 px-2">Cycle</th>
                                            <th className="py-3 px-2">ATH date</th>
                                            <th className="py-3 px-2">ATH price</th>
                                            <th className="py-3 px-2 text-primary">Implied bottom</th>
                                            <th className="py-3 px-2">Low date</th>
                                            <th className="py-3 px-2">Low price</th>
                                            <th className="py-3 px-2 text-right">Drawdown</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-sm">
                                        {CYCLES.map(c => {
                                            const impliedLow = c.athPrice * (1 + last3AvgDrawdown / 100);
                                            return (
                                                <tr key={c.name} className="border-b border-border hover:bg-white/[0.02] transition-colors">
                                                    <td className="py-3 px-2 font-medium text-primary">{c.name}</td>
                                                    <td className="py-3 px-2 text-muted">{c.athDate}</td>
                                                    <td className="py-3 px-2 font-num">${c.athPrice.toLocaleString()}</td>
                                                    <td className="py-3 px-2 font-num text-primary font-medium">${impliedLow.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                                    <td className="py-3 px-2 text-muted">{c.lowDate}</td>
                                                    <td className="py-3 px-2 font-num">${c.lowPrice.toLocaleString()}</td>
                                                    <td className="py-3 px-2 text-right font-medium text-red-400">{c.drawdown}%</td>
                                                </tr>
                                            )
                                        })}
                                        <tr className="bg-accent/[0.04] border-b border-accent/20">
                                            <td className="py-3 px-2 font-medium text-accent">Current (proj.)</td>
                                            <td className="py-3 px-2 text-muted">Now</td>
                                            <td className="py-3 px-2 font-num text-foreground">${currentAth.toLocaleString()}</td>
                                            <td className="py-3 px-2 font-num text-accent font-medium">
                                                {formatCurrency(currentAth * (1 + last3AvgDrawdown / 100))}
                                            </td>
                                            <td className="py-3 px-2 text-muted">Future</td>
                                            <td className="py-3 px-2 font-num text-faint">???</td>
                                            <td className="py-3 px-2 text-right font-medium text-primary">
                                                ---
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    )
}
