/**
 * Prevents TradingView embedded widgets (<tv-mini-chart>, tv.js, ticker tape)
 * from navigating or opening external TradingView website tabs when users click
 * on symbols or links inside the chart.
 */
export function attachTradingViewLinkGuard(
  container: HTMLElement | null,
  onBlockedLink?: (detail: unknown) => void
): () => void {
  if (!container || typeof document === 'undefined') {
    return () => {};
  }

  const boundElements = new WeakSet<Element>();

  const handleLinkOpen = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    const customEvent = event as CustomEvent<unknown>;
    onBlockedLink?.(customEvent.detail);
  };

  const bindElement = (el: Element | null) => {
    if (!el || boundElements.has(el)) return;
    boundElements.add(el);
    el.addEventListener('tv-link-open', handleLinkOpen);
  };

  const scanAndBind = () => {
    bindElement(container);
    const widgetSelectors = [
      'tv-mini-chart',
      'tv-ticker-tape',
      'tv-advanced-chart',
      'tv-symbol-overview',
      '.tradingview-widget-container__widget',
      'iframe',
    ];
    container.querySelectorAll(widgetSelectors.join(', ')).forEach((el) => {
      bindElement(el);
    });
  };

  scanAndBind();

  const observer = new MutationObserver(() => {
    scanAndBind();
  });
  observer.observe(container, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    container.removeEventListener('tv-link-open', handleLinkOpen);
    container
      .querySelectorAll(
        'tv-mini-chart, tv-ticker-tape, tv-advanced-chart, tv-symbol-overview, .tradingview-widget-container__widget, iframe'
      )
      .forEach((el) => {
        el.removeEventListener('tv-link-open', handleLinkOpen);
      });
  };
}
