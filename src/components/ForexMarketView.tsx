import React, { useCallback, useEffect, useState } from 'react';
import type { AppTab, MarketAsset, ThemeMode, TypographySettings } from '../types/news';
import type {
  BrokerSimMode,
  DemoAccountMetrics,
  DemoClosedTrade,
  DemoLimitOrder,
  DemoPosition,
  TrailingMode,
} from '../utils/demoAccount';
import { ProSmcTerminal, type ExecuteOrderOptions, type SmcSymbol } from './ProSmcTerminal';

interface ForexMarketViewProps {
  typography?: TypographySettings;
  themeMode: ThemeMode;
  onChangeThemeMode?: (mode: ThemeMode) => void;
  marketAssets?: MarketAsset[];
  watchlistSymbols?: string[];
  selectedSymbol?: string;
  onSelectSymbol?: (tvSymbol: string) => void;
  onOpenMarketDetails?: (asset: MarketAsset) => void;
  onRefreshMarkets?: () => void;
  isRefreshingMarkets?: boolean;
  onNavigateTab?: (tab: AppTab) => void;
  demoPositions?: DemoPosition[];
  demoPendingOrders?: DemoLimitOrder[];
  demoHistory?: DemoClosedTrade[];
  demoMetrics?: DemoAccountMetrics;
  demoDefaultLot?: number;
  simMode?: BrokerSimMode;
  marginCallActive?: boolean;
  onExecuteDemoOrder?: (symbol: SmcSymbol, side: 'BUY' | 'SELL', lots: number, opts?: ExecuteOrderOptions) => string | null;
  onPlaceLimitOrder?: (symbol: SmcSymbol, side: 'BUY' | 'SELL', lots: number, limitPrice: number, tp?: number, sl?: number, label?: string) => string | null;
  onCancelLimitOrder?: (orderId: string) => void;
  onCloseDemoPosition?: (positionId: string) => void;
  onPartialCloseDemoPosition?: (positionId: string, pct: 0.25 | 0.5) => void;
  onReverseDemoPosition?: (positionId: string) => void;
  onHedgeDemoPosition?: (positionId: string) => void;
  onCloseProfitablePositions?: () => void;
  onCloseLosingPositions?: () => void;
  onCloseAllPositions?: () => void;
  onUpdateDemoPositionTpSl?: (positionId: string, tp: number | undefined, sl: number | undefined) => void;
  onToggleDemoTrailingStop?: (positionId: string, mode?: TrailingMode) => void;
  onChangeDemoDefaultLot?: (lots: number) => void;
  onResetDemoAccount?: () => void;
  onOpenDemoDrawer?: () => void;
  onLivePriceTick?: (symbol: SmcSymbol, price: number) => void;
}

export const ForexMarketView: React.FC<ForexMarketViewProps> = ({
  themeMode,
  onChangeThemeMode,
  selectedSymbol,
  onSelectSymbol,
  demoPositions,
  demoPendingOrders,
  demoHistory,
  demoMetrics,
  demoDefaultLot,
  simMode,
  marginCallActive,
  onExecuteDemoOrder,
  onPlaceLimitOrder,
  onCancelLimitOrder,
  onCloseDemoPosition,
  onPartialCloseDemoPosition,
  onReverseDemoPosition,
  onHedgeDemoPosition,
  onCloseProfitablePositions,
  onCloseLosingPositions,
  onCloseAllPositions,
  onUpdateDemoPositionTpSl,
  onToggleDemoTrailingStop,
  onChangeDemoDefaultLot,
  onResetDemoAccount,
  onOpenDemoDrawer,
  onLivePriceTick,
}) => {
  const [internalSymbol, setInternalSymbol] = useState<string>(selectedSymbol || 'OANDA:XAUUSD');

  useEffect(() => {
    if (selectedSymbol) {
      setInternalSymbol(selectedSymbol);
    }
  }, [selectedSymbol]);

  const tvWidgetSymbol = selectedSymbol || internalSymbol;

  const handleChooseSymbol = useCallback(
    (sym: string) => {
      setInternalSymbol(sym);
      onSelectSymbol?.(sym);
    },
    [onSelectSymbol]
  );

  return (
    <div className="mx-auto max-w-[1440px] w-full flex-1 min-h-0 h-full flex flex-col overflow-hidden">
      <ProSmcTerminal
        externalTvSymbol={tvWidgetSymbol}
        onSelectTvSymbol={handleChooseSymbol}
        themeMode={themeMode}
        onChangeThemeMode={onChangeThemeMode}
        demoPositions={demoPositions}
        demoPendingOrders={demoPendingOrders}
        demoHistory={demoHistory}
        demoMetrics={demoMetrics}
        demoDefaultLot={demoDefaultLot}
        simMode={simMode}
        marginCallActive={marginCallActive}
        onExecuteDemoOrder={onExecuteDemoOrder}
        onPlaceLimitOrder={onPlaceLimitOrder}
        onCancelLimitOrder={onCancelLimitOrder}
        onCloseDemoPosition={onCloseDemoPosition}
        onPartialCloseDemoPosition={onPartialCloseDemoPosition}
        onReverseDemoPosition={onReverseDemoPosition}
        onHedgeDemoPosition={onHedgeDemoPosition}
        onCloseProfitablePositions={onCloseProfitablePositions}
        onCloseLosingPositions={onCloseLosingPositions}
        onCloseAllPositions={onCloseAllPositions}
        onUpdateDemoPositionTpSl={onUpdateDemoPositionTpSl}
        onToggleDemoTrailingStop={onToggleDemoTrailingStop}
        onChangeDemoDefaultLot={onChangeDemoDefaultLot}
        onResetDemoAccount={onResetDemoAccount}
        onOpenDemoDrawer={onOpenDemoDrawer}
        onLivePriceTick={onLivePriceTick}
      />
    </div>
  );
};
