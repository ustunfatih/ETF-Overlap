import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Palette } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import ETFSelector from "@/components/ETFSelector";
import HeatmapView from "@/components/HeatmapView";
import TreemapView from "@/components/TreemapView";
import NetworkView from "@/components/NetworkView";
import UpSetView from "@/components/UpSetView";
import DrilldownModal from "@/components/DrilldownModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { OverlapMatrix, TreemapNode, NetworkNode, NetworkEdge, OverlapCell } from "@shared/schema";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

type OverlapResponse = {
  success: boolean;
  matrix: OverlapMatrix;
  treemap: TreemapNode[];
  network: { nodes: NetworkNode[]; edges: NetworkEdge[] };
  upset: { sets: string[]; intersections: { set: string[]; size: number; holdings: string[] }[] };
  errors?: string[];
};

type ActiveView = "heatmap" | "treemap" | "network" | "upset";
type ThemeId = "default" | "morning-ledger" | "exchange-floor" | "research-atlas" | "spectrum-dark";
type ThemeTokens = Record<string, string>;

const THEME_STORAGE_KEY = "etf-overlap-theme";
const THEME_CLASSES: ThemeId[] = ["default", "morning-ledger", "exchange-floor", "research-atlas", "spectrum-dark"];
const THEMES: { id: ThemeId; label: string; description: string }[] = [
  { id: "default", label: "Classic Dark", description: "Original slate dashboard" },
  { id: "morning-ledger", label: "Morning Ledger", description: "Light analytical workspace" },
  { id: "exchange-floor", label: "Exchange Floor", description: "High-contrast terminal dark" },
  { id: "research-atlas", label: "Research Atlas", description: "Minimal analyst light mode" },
  { id: "spectrum-dark", label: "Spectrum Dark", description: "Warm branded dark mode" },
];

const THEME_TOKENS: Record<ThemeId, ThemeTokens> = {
  default: {
    background: "222 18% 9%",
    foreground: "210 20% 88%",
    card: "222 16% 12%",
    "card-foreground": "210 20% 88%",
    popover: "222 16% 13%",
    "popover-foreground": "210 20% 88%",
    primary: "210 80% 56%",
    "primary-foreground": "222 18% 9%",
    secondary: "222 14% 18%",
    "secondary-foreground": "210 15% 70%",
    muted: "222 14% 16%",
    "muted-foreground": "210 10% 52%",
    accent: "210 80% 56%",
    "accent-foreground": "222 18% 9%",
    destructive: "0 72% 51%",
    "destructive-foreground": "0 0% 98%",
    border: "222 14% 20%",
    input: "222 14% 18%",
    ring: "210 80% 56%",
    "chart-1": "210 80% 56%",
    "chart-2": "160 60% 45%",
    "chart-3": "45 90% 55%",
    "chart-4": "280 65% 60%",
    "chart-5": "15 80% 55%",
    "chart-6": "190 70% 50%",
    "chart-7": "320 60% 55%",
    "chart-8": "100 55% 48%",
    "chart-9": "35 85% 55%",
    "chart-10": "250 65% 62%",
  },
  "morning-ledger": {
    background: "213 38% 97%",
    foreground: "218 41% 14%",
    card: "0 0% 100%",
    "card-foreground": "218 41% 14%",
    popover: "0 0% 100%",
    "popover-foreground": "218 41% 14%",
    primary: "211 80% 43%",
    "primary-foreground": "0 0% 100%",
    secondary: "210 38% 94%",
    "secondary-foreground": "218 30% 22%",
    muted: "210 38% 94%",
    "muted-foreground": "215 14% 45%",
    accent: "211 80% 43%",
    "accent-foreground": "0 0% 100%",
    destructive: "12 72% 51%",
    "destructive-foreground": "0 0% 100%",
    border: "215 24% 85%",
    input: "210 38% 94%",
    ring: "211 80% 43%",
    "chart-1": "211 80% 43%",
    "chart-2": "167 72% 30%",
    "chart-3": "39 94% 39%",
    "chart-4": "267 50% 55%",
    "chart-5": "16 65% 51%",
    "chart-6": "194 62% 40%",
    "chart-7": "320 48% 47%",
    "chart-8": "105 42% 39%",
    "chart-9": "35 78% 43%",
    "chart-10": "250 52% 55%",
  },
  "exchange-floor": {
    background: "80 16% 5%",
    foreground: "84 23% 92%",
    card: "80 16% 9%",
    "card-foreground": "84 23% 92%",
    popover: "80 15% 10%",
    "popover-foreground": "84 23% 92%",
    primary: "77 100% 65%",
    "primary-foreground": "73 31% 7%",
    secondary: "80 13% 14%",
    "secondary-foreground": "92 11% 75%",
    muted: "80 13% 13%",
    "muted-foreground": "95 8% 60%",
    accent: "77 100% 65%",
    "accent-foreground": "73 31% 7%",
    destructive: "12 100% 62%",
    "destructive-foreground": "84 23% 92%",
    border: "82 22% 20%",
    input: "80 13% 14%",
    ring: "77 100% 65%",
    "chart-1": "205 100% 69%",
    "chart-2": "142 60% 58%",
    "chart-3": "42 100% 65%",
    "chart-4": "280 100% 77%",
    "chart-5": "12 100% 62%",
    "chart-6": "181 72% 58%",
    "chart-7": "322 72% 68%",
    "chart-8": "93 100% 65%",
    "chart-9": "35 100% 62%",
    "chart-10": "252 82% 72%",
  },
  "research-atlas": {
    background: "120 8% 97%",
    foreground: "216 13% 10%",
    card: "0 0% 100%",
    "card-foreground": "216 13% 10%",
    popover: "0 0% 100%",
    "popover-foreground": "216 13% 10%",
    primary: "220 11% 16%",
    "primary-foreground": "0 0% 100%",
    secondary: "210 9% 95%",
    "secondary-foreground": "216 13% 18%",
    muted: "210 9% 95%",
    "muted-foreground": "216 9% 45%",
    accent: "170 100% 28%",
    "accent-foreground": "0 0% 100%",
    destructive: "8 67% 55%",
    "destructive-foreground": "0 0% 100%",
    border: "216 13% 86%",
    input: "210 9% 95%",
    ring: "170 100% 28%",
    "chart-1": "215 72% 50%",
    "chart-2": "169 100% 28%",
    "chart-3": "38 83% 45%",
    "chart-4": "266 48% 56%",
    "chart-5": "8 67% 55%",
    "chart-6": "190 60% 40%",
    "chart-7": "320 45% 46%",
    "chart-8": "104 42% 38%",
    "chart-9": "35 78% 45%",
    "chart-10": "250 48% 52%",
  },
  "spectrum-dark": {
    background: "300 10% 8%",
    foreground: "290 24% 94%",
    card: "294 15% 12%",
    "card-foreground": "290 24% 94%",
    popover: "294 16% 13%",
    "popover-foreground": "290 24% 94%",
    primary: "42 100% 69%",
    "primary-foreground": "34 68% 7%",
    secondary: "300 14% 17%",
    "secondary-foreground": "302 9% 76%",
    muted: "300 14% 15%",
    "muted-foreground": "302 9% 65%",
    accent: "164 62% 49%",
    "accent-foreground": "300 10% 8%",
    destructive: "7 100% 66%",
    "destructive-foreground": "290 24% 94%",
    border: "298 15% 22%",
    input: "300 14% 17%",
    ring: "42 100% 69%",
    "chart-1": "206 100% 64%",
    "chart-2": "164 62% 49%",
    "chart-3": "42 100% 69%",
    "chart-4": "292 72% 67%",
    "chart-5": "7 100% 66%",
    "chart-6": "188 72% 56%",
    "chart-7": "322 70% 65%",
    "chart-8": "102 60% 54%",
    "chart-9": "35 100% 63%",
    "chart-10": "252 78% 70%",
  },
};

function getInitialTheme(): ThemeId {
  if (typeof window === "undefined") return "default";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return THEMES.some((theme) => theme.id === stored) ? (stored as ThemeId) : "default";
}

export default function Dashboard() {
  const [selectedEtfs, setSelectedEtfs] = useState<string[]>(["QQQI", "SPYI", "SCHD", "SCHG", "FDVV"]);
  const [activeView, setActiveView] = useState<ActiveView>("heatmap");
  const [overlapData, setOverlapData] = useState<OverlapResponse | null>(null);
  const [drilldown, setDrilldown] = useState<OverlapCell | null>(null);
  const [theme, setTheme] = useState<ThemeId>(getInitialTheme);
  const { toast } = useToast();
  const activeTheme = useMemo(() => THEMES.find((item) => item.id === theme) ?? THEMES[0], [theme]);
  const selectTheme = useCallback((nextTheme: ThemeId) => {
    setTheme(nextTheme);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const tokens = THEME_TOKENS[theme];
    root.classList.remove(...THEME_CLASSES.map((item) => `theme-${item}`), "light");
    if (theme !== "default") {
      root.classList.add(`theme-${theme}`);
    }
    Object.entries(tokens).forEach(([name, value]) => {
      root.style.setProperty(`--${name}`, value);
    });
    root.style.colorScheme = theme === "morning-ledger" || theme === "research-atlas" ? "light" : "dark";
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const overlapMutation = useMutation({
    mutationFn: async (tickers: string[]) => {
      const res = await apiRequest("POST", "/api/etf/overlap", { tickers });
      return res.json() as Promise<OverlapResponse>;
    },
    onSuccess: (data) => {
      setOverlapData(data);
      if (data.errors && data.errors.length > 0) {
        toast({
          title: "Some ETFs could not be fetched",
          description: data.errors.join(", "),
          variant: "destructive",
        });
      }
    },
    onError: (err: any) => {
      toast({
        title: "Error fetching overlap data",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleAnalyze = useCallback(() => {
    if (selectedEtfs.length < 2) {
      toast({ title: "Add at least 2 ETFs", description: "Select 2–10 ETFs to compare.", variant: "destructive" });
      return;
    }
    overlapMutation.mutate(selectedEtfs);
  }, [selectedEtfs, overlapMutation, toast]);

  const VIEWS: { id: ActiveView; label: string; desc: string }[] = [
    { id: "heatmap", label: "Overlap Matrix", desc: "Grid view of pairwise overlap" },
    { id: "treemap", label: "Holdings Treemap", desc: "Size by weight, color by overlap" },
    { id: "network", label: "Network Graph", desc: "ETF clusters by similarity" },
    { id: "upset", label: "UpSet Diagram", desc: "Multi-ETF intersection breakdown" },
  ];

  const isLoading = overlapMutation.isPending;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/60 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo */}
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-label="ETF Overlap Analyzer logo">
              <rect x="2" y="2" width="11" height="11" rx="2" fill="hsl(210 80% 56%)" opacity="0.9"/>
              <rect x="15" y="2" width="11" height="11" rx="2" fill="hsl(160 60% 45%)" opacity="0.9"/>
              <rect x="2" y="15" width="11" height="11" rx="2" fill="hsl(280 65% 60%)" opacity="0.9"/>
              <rect x="15" y="15" width="11" height="11" rx="2" fill="hsl(45 90% 55%)" opacity="0.9"/>
              <rect x="9" y="9" width="10" height="10" rx="2" fill="white" opacity="0.12"/>
            </svg>
            <div>
              <h1 className="text-sm font-bold tracking-tight" style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}>
                ETF Overlap Analyzer
              </h1>
              <p className="text-xs text-muted-foreground leading-none">US ETF Holdings Comparison</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 border-border bg-background/40 px-2.5 text-xs text-foreground hover:bg-secondary"
                  aria-label={`Select visual theme. Current theme: ${activeTheme.label}`}
                >
                  <Palette className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{activeTheme.label}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>Visual theme</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {THEMES.map((item) => (
                  <DropdownMenuItem
                    key={item.id}
                    onClick={() => selectTheme(item.id)}
                    onSelect={() => selectTheme(item.id)}
                    className="items-start gap-3"
                  >
                    <span className="mt-1 flex h-3.5 w-3.5 items-center justify-center">
                      {theme === item.id && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span className="grid gap-0.5">
                      <span className="text-xs font-semibold">{item.label}</span>
                      <span className="text-[11px] leading-snug text-muted-foreground">{item.description}</span>
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
              Live data
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1400px] mx-auto w-full px-6 py-6 flex flex-col gap-5">
        {/* ETF Selector Panel */}
        <ETFSelector
          selected={selectedEtfs}
          onChange={setSelectedEtfs}
          onAnalyze={handleAnalyze}
          isLoading={isLoading}
        />

        {/* View Tabs — only shown when data is ready */}
        {overlapData && (
          <>
            <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1 w-fit">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  data-testid={`tab-${v.id}`}
                  onClick={() => setActiveView(v.id)}
                  className={`px-4 py-2 rounded-md text-xs font-medium transition-all duration-150 ${
                    activeView === v.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>

            {/* View Description */}
            <p className="text-xs text-muted-foreground -mt-3">
              {VIEWS.find((v) => v.id === activeView)?.desc}
              {activeView === "heatmap" && " · Click any cell to see shared holdings detail"}
              {activeView === "treemap" && " · Shared holdings are highlighted · Size = average weight across selected ETFs"}
              {activeView === "network" && " · Edge thickness = overlap score · Drag nodes to rearrange"}
            </p>

            {/* Visualization area */}
            <div className="flex-1 min-h-[520px]">
              {activeView === "heatmap" && (
                <HeatmapView
                  matrix={overlapData.matrix}
                  onCellClick={(cell) => setDrilldown(cell)}
                />
              )}
              {activeView === "treemap" && (
                <TreemapView
                  nodes={overlapData.treemap}
                  etfs={overlapData.matrix.etfs}
                />
              )}
              {activeView === "network" && (
                <NetworkView
                  nodes={overlapData.network.nodes}
                  edges={overlapData.network.edges}
                />
              )}
              {activeView === "upset" && (
                <UpSetView
                  data={overlapData.upset}
                />
              )}
            </div>
          </>
        )}

        {/* Empty state */}
        {!overlapData && !isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 28 28" fill="none">
                <rect x="2" y="2" width="11" height="11" rx="2" fill="hsl(210 80% 56%)" opacity="0.4"/>
                <rect x="15" y="2" width="11" height="11" rx="2" fill="hsl(160 60% 45%)" opacity="0.4"/>
                <rect x="2" y="15" width="11" height="11" rx="2" fill="hsl(280 65% 60%)" opacity="0.4"/>
                <rect x="15" y="15" width="11" height="11" rx="2" fill="hsl(45 90% 55%)" opacity="0.4"/>
                <rect x="9" y="9" width="10" height="10" rx="2" fill="white" opacity="0.08"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Add ETFs and click Analyze</p>
              <p className="text-xs text-muted-foreground mt-1">
                Select 2–10 US ETFs above, then hit Analyze to see their holdings overlap
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4 text-left max-w-sm">
              {[
                { icon: "⬜", label: "Overlap Matrix", desc: "Color-coded heatmap of pairwise overlap scores" },
                { icon: "🌳", label: "Holdings Treemap", desc: "Visual size map of all shared & unique holdings" },
                { icon: "🕸", label: "Network Graph", desc: "Force-directed graph showing ETF similarity clusters" },
                { icon: "📊", label: "UpSet Diagram", desc: "Precise multi-set intersection breakdown" },
              ].map((item) => (
                <div key={item.label} className="bg-card border border-border rounded-lg p-3">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-20">
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full bg-primary animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
            <p className="text-sm text-muted-foreground">Fetching holdings & computing overlap…</p>
          </div>
        )}
      </main>

      <footer className="border-t border-border py-3 px-6">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Holdings data from ETF.com · Updated hourly · Top 20–50 holdings per ETF</p>
          <a
            href="https://www.perplexity.ai/computer"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Created with Perplexity Computer
          </a>
        </div>
      </footer>

      {/* Drilldown modal */}
      {drilldown && (
        <DrilldownModal cell={drilldown} onClose={() => setDrilldown(null)} />
      )}
    </div>
  );
}
