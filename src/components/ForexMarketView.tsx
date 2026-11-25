import React, { useCallback, useEffect, useState } from 'react';
import type { AppTab, MarketAsset, ThemeMode, TypographySettings } from '../types/news';
import type { DemoAccountMetrics, DemoPosition } from '../utils/demoAccount';
import { ProSmcTerminal, type SmcSymbol } from './ProSmcTerminal';

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
  demoMetrics?: DemoAccountMetrics;
  demoDefaultLot?: number;
  marginCallActive?: boolean;
  onExecuteDemoOrder?: (symbol: SmcSymbol, side: 'BUY' | 'SELL', lots: number) => string | null;
  onCloseDemoPosition?: (positionId: string) => void;
  onUpdateDemoPositionTpSl?: (positionId: string, tp: number | undefined, sl: number | undefined) => void;
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
  demoMetrics,
  demoDefaultLot,
  marginCallActive,
  onExecuteDemoOrder,
  onCloseDemoPosition,
  onUpdateDemoPositionTpSl,
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
    <div className="mx-auto max-w-[1440px] w-full h-full min-h-0 flex flex-col overflow-hidden">
      <ProSmcTerminal
        externalTvSymbol={tvWidgetSymbol}
        onSelectTvSymbol={handleChooseSymbol}
        themeMode={themeMode}
        onChangeThemeMode={onChangeThemeMode}
        demoPositions={demoPositions}
        demoMetrics={demoMetrics}
        demoDefaultLot={demoDefaultLot}
        marginCallActive={marginCallActive}
        onExecuteDemoOrder={onExecuteDemoOrder}
        onCloseDemoPosition={onCloseDemoPosition}
        onUpdateDemoPositionTpSl={onUpdateDemoPositionTpSl}
        onChangeDemoDefaultLot={onChangeDemoDefaultLot}
        onResetDemoAccount={onResetDemoAccount}
        onOpenDemoDrawer={onOpenDemoDrawer}
        onLivePriceTick={onLivePriceTick}
      />
    </div>
  );
};

