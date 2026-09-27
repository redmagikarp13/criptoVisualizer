import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { IChartApi, ISeriesApi, SeriesType, UTCTimestamp } from 'lightweight-charts';
import type { Drawing, DrawingTool, Point } from './drawings';

interface DrawingLayerProps {
  chart: IChartApi | null;
  mainSeries: ISeriesApi<SeriesType> | null;
  activeTool: DrawingTool;
  currentColor: string;
  drawings: Drawing[];
  onAddDrawing: (drawing: Drawing) => void;
  onSelectCursor: () => void;
  dark: boolean;
}

export const DrawingLayer: React.FC<DrawingLayerProps> = ({
  chart,
  mainSeries,
  activeTool,
  currentColor,
  drawings,
  onAddDrawing,
  onSelectCursor,
  dark,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [draftStart, setDraftStart] = useState<Point | null>(null);
  const [draftCurrent, setDraftCurrent] = useState<Point | null>(null);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chart || !mainSeries) return;
    if (typeof canvas.getContext !== 'function') return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      return;
    }
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }
    ctx.resetTransform();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const timeScale = chart.timeScale();

    // Helper: Desenha Linha Horizontal
    const drawHorizontal = (price: number, color: string, isDraft = false) => {
      const y = mainSeries.priceToCoordinate(price);
      if (y === null || !Number.isFinite(y)) return;

      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = isDraft ? 1.5 : 2;
      ctx.setLineDash([6, 4]);
      ctx.moveTo(0, y);
      ctx.lineTo(rect.width, y);
      ctx.stroke();

      // Badge de Preço
      const formatted = price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: price < 1 ? 6 : 2 });
      ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
      const textWidth = ctx.measureText(formatted).width;
      const padX = 6;
      const badgeW = textWidth + padX * 2;
      const badgeH = 18;
      const badgeX = Math.max(0, rect.width - badgeW - 55);
      const badgeY = y - badgeH / 2;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 3);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText(formatted, badgeX + padX, y);
      ctx.restore();
    };

    // Helper: Desenha Linha Vertical
    const drawVertical = (time: number, color: string) => {
      const x = timeScale.timeToCoordinate(time as UTCTimestamp);
      if (x === null || !Number.isFinite(x)) return;

      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rect.height);
      ctx.stroke();
      ctx.restore();
    };

    // Helper: Desenha Linha de Tendência
    const drawTrendline = (p1: Point, p2: Point, color: string, isDraft = false) => {
      const x1 = timeScale.timeToCoordinate(p1.time as UTCTimestamp);
      const y1 = mainSeries.priceToCoordinate(p1.price);
      const x2 = timeScale.timeToCoordinate(p2.time as UTCTimestamp);
      const y2 = mainSeries.priceToCoordinate(p2.price);

      if (x1 === null || y1 === null || x2 === null || y2 === null) return;

      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = isDraft ? 2 : 2.5;
      ctx.setLineDash(isDraft ? [4, 4] : []);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Ponto de âncora 1
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(x1, y1, 4, 0, Math.PI * 2);
      ctx.fill();

      // Ponto de âncora 2
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(x2, y2, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    // Helper: Desenha Medidor / Régua (Price & Range)
    const drawMeasure = (p1: Point, p2: Point) => {
      const x1 = timeScale.timeToCoordinate(p1.time as UTCTimestamp);
      const y1 = mainSeries.priceToCoordinate(p1.price);
      const x2 = timeScale.timeToCoordinate(p2.time as UTCTimestamp);
      const y2 = mainSeries.priceToCoordinate(p2.price);

      if (x1 === null || y1 === null || x2 === null || y2 === null) return;

      const isBullish = p2.price >= p1.price;
      const color = isBullish ? '#10b981' : '#f43f5e';
      const bgColor = isBullish ? 'rgba(16, 185, 129, 0.18)' : 'rgba(244, 63, 94, 0.18)';

      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      const width = Math.abs(x2 - x1);
      const height = Math.abs(y2 - y1);

      ctx.save();
      // Caixa translúcida
      ctx.fillStyle = bgColor;
      ctx.fillRect(left, top, width, height);

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(left, top, width, height);

      // Linha diagonal
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Cálculo de variação
      const deltaPrice = p2.price - p1.price;
      const deltaPercent = (deltaPrice / p1.price) * 100;
      const prefix = deltaPercent >= 0 ? '+' : '';
      const formattedDiff = `${prefix}${deltaPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${prefix}${deltaPercent.toFixed(2)}%)`;

      // Card Informativo
      const cardX = left + width / 2;
      const cardY = top + height / 2;
      ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
      const textWidth = ctx.measureText(formattedDiff).width;
      const cardW = textWidth + 16;
      const cardH = 24;

      ctx.fillStyle = dark ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.92)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.roundRect(cardX - cardW / 2, cardY - cardH / 2, cardW, cardH, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(formattedDiff, cardX, cardY);
      ctx.restore();
    };

    // 1. Renderizar desenhos fixados salvos
    for (const d of drawings) {
      if (d.type === 'horizontal') drawHorizontal(d.price, d.color);
      else if (d.type === 'vertical') drawVertical(d.time, d.color);
      else if (d.type === 'trendline') drawTrendline(d.p1, d.p2, d.color);
      else if (d.type === 'measure') drawMeasure(d.p1, d.p2);
    }

    // 2. Renderizar rascunho em tempo real
    if (draftStart && draftCurrent) {
      if (activeTool === 'trendline') drawTrendline(draftStart, draftCurrent, currentColor, true);
      else if (activeTool === 'measure') drawMeasure(draftStart, draftCurrent);
    }
  }, [chart, mainSeries, drawings, draftStart, draftCurrent, activeTool, currentColor, dark]);

  // Sincronizar com mudanças de escala e scroll do Lightweight Charts
  useEffect(() => {
    if (!chart) return;
    const timeScale = chart.timeScale();
    const handleRangeChange = () => render();
    timeScale.subscribeVisibleLogicalRangeChange?.(handleRangeChange);
    timeScale.subscribeVisibleTimeRangeChange?.(handleRangeChange);
    render();

    window.addEventListener('resize', handleRangeChange);
    return () => {
      timeScale.unsubscribeVisibleLogicalRangeChange?.(handleRangeChange);
      timeScale.unsubscribeVisibleTimeRangeChange?.(handleRangeChange);
      window.removeEventListener('resize', handleRangeChange);
    };
  }, [chart, render]);

  // Captura de eventos do mouse no Canvas
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeTool === 'cursor' || !chart || !mainSeries) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const time = chart.timeScale().coordinateToTime(x);
    const price = mainSeries.coordinateToPrice(y);
    if (price === null) return;

    const currentPoint: Point = { time: Number(time) || Math.floor(Date.now() / 1000), price };

    if (activeTool === 'horizontal') {
      onAddDrawing({
        id: crypto.randomUUID(),
        type: 'horizontal',
        price,
        color: currentColor,
      });
      onSelectCursor();
      return;
    }

    if (activeTool === 'vertical') {
      if (time !== null) {
        onAddDrawing({
          id: crypto.randomUUID(),
          type: 'vertical',
          time: Number(time),
          color: currentColor,
        });
      }
      onSelectCursor();
      return;
    }

    if (activeTool === 'trendline' || activeTool === 'measure') {
      if (!draftStart) {
        setDraftStart(currentPoint);
        setDraftCurrent(currentPoint);
      } else {
        // Segundo clique completa o desenho
        if (activeTool === 'trendline') {
          onAddDrawing({
            id: crypto.randomUUID(),
            type: 'trendline',
            p1: draftStart,
            p2: currentPoint,
            color: currentColor,
          });
        } else {
          onAddDrawing({
            id: crypto.randomUUID(),
            type: 'measure',
            p1: draftStart,
            p2: currentPoint,
            color: currentColor,
          });
        }
        setDraftStart(null);
        setDraftCurrent(null);
        onSelectCursor();
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draftStart || !chart || !mainSeries) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const time = chart.timeScale().coordinateToTime(x);
    const price = mainSeries.coordinateToPrice(y);
    if (price === null) return;

    setDraftCurrent({ time: Number(time) || draftStart.time, price });
  };

  return (
    <canvas
      ref={canvasRef}
      className={`drawing-overlay-canvas ${activeTool !== 'cursor' ? 'interactive' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: activeTool === 'cursor' ? 'none' : 'auto',
        cursor: activeTool === 'cursor' ? 'default' : 'crosshair',
        zIndex: 5,
      }}
    />
  );
};
