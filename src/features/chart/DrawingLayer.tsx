import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { IChartApi, ISeriesApi, Logical, SeriesType, UTCTimestamp } from 'lightweight-charts';
import type { Candle } from '../../lib/types';
import {
  formatApexPrice,
  type Drawing,
  type DrawingTool,
  type Point,
  type TrendConvergence,
} from './drawings';
import type { AutoTrendlinesResult } from './autoTrendlines';

interface DrawingLayerProps {
  chart: IChartApi | null;
  mainSeries: ISeriesApi<SeriesType> | null;
  activeTool: DrawingTool;
  currentColor: string;
  drawings: Drawing[];
  onAddDrawing: (drawing: Drawing) => void;
  onSelectCursor: () => void;
  dark: boolean;
  candles?: Candle[];
  projectLines?: boolean;
  convergences?: TrendConvergence[];
  autoTrendlines?: AutoTrendlinesResult | null;
}

function safeRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 0
) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return;
  }
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (typeof ctx.roundRect === 'function') {
    try {
      ctx.roundRect(x, y, w, h, r);
      return;
    } catch {
      // fallback to standard rect
    }
  }
  ctx.rect(x, y, w, h);
}

function safeArc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  startAngle = 0,
  endAngle = Math.PI * 2
) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius <= 0) {
    return;
  }
  try {
    ctx.arc(x, y, radius, startAngle, endAngle);
  } catch {
    // ignore
  }
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
  candles,
  projectLines = true,
  convergences = [],
  autoTrendlines,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [draftStart, setDraftStart] = useState<Point | null>(null);
  const [draftCurrent, setDraftCurrent] = useState<Point | null>(null);

  const getCoordinates = useCallback(
    (point: Point): { x: number | null; y: number | null } => {
      if (!chart || !mainSeries || typeof mainSeries.priceToCoordinate !== 'function') return { x: null, y: null };
      if (!Number.isFinite(point.price) || !Number.isFinite(point.time)) return { x: null, y: null };
      const timeScale = chart.timeScale();
      const rawY = mainSeries.priceToCoordinate(point.price);
      const y = (rawY !== null && Number.isFinite(rawY)) ? rawY : null;
      let x = timeScale.timeToCoordinate(point.time as UTCTimestamp);

      // Se timeToCoordinate retornar null (ex: timestamp futuro além do último candle),
      // projeta a coordenada X através do espaçamento lógico das barras.
      if (x === null && candles && candles.length >= 2) {
        const lastIndex = candles.length - 1;
        const lastCandle = candles[lastIndex];
        const prevCandle = candles[lastIndex - 1];
        const intervalSec = Math.max(1, lastCandle.time - prevCandle.time);
        const offsetSec = point.time - lastCandle.time;
        if (Math.abs(offsetSec) < 100_000 * intervalSec) {
          const logicalOffset = offsetSec / intervalSec;
          const futureLogical = (lastIndex + logicalOffset) as unknown as Logical;
          const rawX = timeScale.logicalToCoordinate(futureLogical);
          x = (rawX !== null && Number.isFinite(rawX)) ? rawX : null;
        }
      }

      return { x: (x !== null && Number.isFinite(x)) ? x : null, y };
    },
    [chart, mainSeries, candles]
  );

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

    try {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) {
        return;
      }

      if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
      }
      ctx.resetTransform();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, rect.width, rect.height);

      // Helper: Desenha Linha Horizontal
      const drawHorizontal = (price: number, color: string, isDraft = false) => {
        if (!Number.isFinite(price)) return;
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
        safeRoundRect(ctx, badgeX, badgeY, badgeW, badgeH, 3);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.fillText(formatted, badgeX + padX, y);
        ctx.restore();
      };

      // Helper: Desenha Linha Vertical
      const drawVertical = (time: number, color: string) => {
        if (!Number.isFinite(time)) return;
        const coord = getCoordinates({ time, price: 0 });
        const x = coord.x;
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

      // Helper: Desenha Linha de Tendência e Projeção Futura
      const drawTrendline = (p1: Point, p2: Point, color: string, isDraft = false, label?: string) => {
        if (!Number.isFinite(p1.time) || !Number.isFinite(p1.price) || !Number.isFinite(p2.time) || !Number.isFinite(p2.price)) return;
        const [start, end] = p1.time <= p2.time ? [p1, p2] : [p2, p1];
        const c1 = getCoordinates(start);
        const c2 = getCoordinates(end);

        if (c1.x === null || c1.y === null || c2.x === null || c2.y === null) return;
        const x1 = c1.x;
        const y1 = c1.y;
        const x2 = c2.x;
        const y2 = c2.y;
        if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) return;

        ctx.save();

        // 1. Segmento base fixado
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = isDraft ? 2 : 2.5;
        ctx.setLineDash(isDraft ? [4, 4] : []);
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // Pontos de âncora
        ctx.beginPath();
        ctx.fillStyle = color;
        safeArc(ctx, x1, y1, 4);
        ctx.fill();

        ctx.beginPath();
        ctx.fillStyle = color;
        safeArc(ctx, x2, y2, 4);
        ctx.fill();

        // Etiqueta identificadora
        if (label) {
          ctx.font = 'bold 9px -apple-system, BlinkMacSystemFont, sans-serif';
          const tagW = ctx.measureText(label).width + 12;
          const tagH = 16;
          const tagX = Math.min(Math.max((x1 + x2) / 2 - tagW / 2, 8), Math.max(8, rect.width - tagW - 60));
          const tagY = (y1 + y2) / 2 - tagH - 4;

          ctx.fillStyle = dark ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.92)';
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.setLineDash([]);
          ctx.beginPath();
          safeRoundRect(ctx, tagX, tagY, tagW, tagH, 3);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = color;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, tagX + tagW / 2, tagY + tagH / 2);
        }

        // 2. Projeção Futura (Ray / Linha estendida para a direita)
        if (projectLines && !isDraft) {
          const dx = x2 - x1;
          const dy = y2 - y1;
          if (dx > 0.5) {
            const targetX = Math.min(rect.width + 400, Math.max(rect.width + 50, x2 + 250));
            const factor = (targetX - x2) / dx;
            if (Number.isFinite(factor) && factor >= 0 && factor < 500) {
              const projY = y2 + factor * dy;
              if (Number.isFinite(projY) && projY > -5000 && projY < 5000) {
                ctx.beginPath();
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.75;
                ctx.setLineDash([5, 4]);
                ctx.globalAlpha = 0.8;
                ctx.moveTo(x2, y2);
                ctx.lineTo(targetX, projY);
                ctx.stroke();
              }
            }
          }
        }

        ctx.restore();
      };

      // Helper: Desenha Medidor / Régua (Price & Range)
      const drawMeasure = (p1: Point, p2: Point) => {
        if (!Number.isFinite(p1.price) || !Number.isFinite(p2.price) || p1.price <= 0) return;
        const c1 = getCoordinates(p1);
        const c2 = getCoordinates(p2);
        if (c1.x === null || c1.y === null || c2.x === null || c2.y === null) return;
        const x1 = c1.x;
        const y1 = c1.y;
        const x2 = c2.x;
        const y2 = c2.y;
        if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) return;

        const isBullish = p2.price >= p1.price;
        const color = isBullish ? '#10b981' : '#f43f5e';
        const bgColor = isBullish ? 'rgba(16, 185, 129, 0.18)' : 'rgba(244, 63, 94, 0.18)';

        const left = Math.min(x1, x2);
        const top = Math.min(y1, y2);
        const width = Math.abs(x2 - x1);
        const height = Math.abs(y2 - y1);

        ctx.save();
        if (width > 0 && height > 0) {
          ctx.fillStyle = bgColor;
          ctx.fillRect(left, top, width, height);

          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(left, top, width, height);
        }

        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        const deltaPrice = p2.price - p1.price;
        const deltaPercent = (deltaPrice / p1.price) * 100;
        const prefix = deltaPercent >= 0 ? '+' : '';
        const formattedDiff = `${prefix}${deltaPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${prefix}${deltaPercent.toFixed(2)}%)`;

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
        safeRoundRect(ctx, cardX - cardW / 2, cardY - cardH / 2, cardW, cardH, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(formattedDiff, cardX, cardY);
        ctx.restore();
      };

      // Helper: Desenha Marcador e Alvo de Vértice / Ápice Previsto
      const drawConvergenceApex = (c: TrendConvergence) => {
        if (!Number.isFinite(c.apexTime) || !Number.isFinite(c.apexPrice) || c.apexPrice <= 0) return;
        const apexCoord = getCoordinates({ time: c.apexTime, price: c.apexPrice });
        if (apexCoord.x === null || apexCoord.y === null) return;
        const ax = apexCoord.x;
        const ay = apexCoord.y;
        if (!Number.isFinite(ax) || !Number.isFinite(ay)) return;

        // Renderiza marcadores visuais no gráfico se estiver no campo visível
        if (ax >= -150 && ax <= rect.width + 400 && ay >= -1000 && ay <= rect.height + 1000) {
          ctx.save();

          // 1. Linha vertical tracejada até o eixo temporal
          ctx.beginPath();
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.moveTo(ax, 0);
          ctx.lineTo(ax, rect.height);
          ctx.stroke();

          // 2. Linha horizontal suave até o eixo de preço
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.moveTo(0, ay);
          ctx.lineTo(rect.width, ay);
          ctx.stroke();

          // 3. Radar Alvo no Ponto de Convergência (Ápice)
          ctx.beginPath();
          ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
          safeArc(ctx, ax, ay, 13);
          ctx.fill();

          ctx.beginPath();
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
          safeArc(ctx, ax, ay, 6.5);
          ctx.stroke();

          ctx.beginPath();
          ctx.fillStyle = '#ffffff';
          safeArc(ctx, ax, ay, 2.5);
          ctx.fill();

          // 4. Badge Flutuante no Ápice
          const priceText = `$${formatApexPrice(c.apexPrice)}`;
          const apexLabel = `🎯 ${c.patternName}: ${c.timeFormatted} (${priceText})`;
          ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
          const labelW = ctx.measureText(apexLabel).width + 16;
          const labelH = 24;
          const labelX = Math.min(Math.max(ax - labelW / 2, 8), Math.max(8, rect.width - labelW - 65));
          const labelY = Math.max(ay - 32, 8);

          ctx.fillStyle = dark ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.96)';
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([]);
          ctx.beginPath();
          safeRoundRect(ctx, labelX, labelY, labelW, labelH, 5);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#f59e0b';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(apexLabel, labelX + 8, labelY + labelH / 2);

          // 5. Badge no Eixo Temporal (embaixo)
          const timeLabel = c.timeFormatted;
          ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
          const timeW = ctx.measureText(timeLabel).width + 12;
          const timeH = 18;
          const timeX = Math.min(Math.max(ax - timeW / 2, 4), Math.max(4, rect.width - timeW - 55));
          const timeY = rect.height - timeH - 4;

          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          safeRoundRect(ctx, timeX, timeY, timeW, timeH, 3);
          ctx.fill();

          ctx.fillStyle = '#0f172a';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(timeLabel, timeX + timeW / 2, timeY + timeH / 2);

          // 6. Badge no Eixo de Preço (à direita)
          const priceFormatted = formatApexPrice(c.apexPrice);
          ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
          const priceW = ctx.measureText(priceFormatted).width + 12;
          const priceH = 18;
          const priceX = rect.width - priceW - 4;
          const priceY = Math.min(Math.max(ay - priceH / 2, 4), Math.max(4, rect.height - priceH - 4));

          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          safeRoundRect(ctx, priceX, priceY, priceW, priceH, 3);
          ctx.fill();

          ctx.fillStyle = '#0f172a';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(priceFormatted, priceX + priceW / 2, priceY + priceH / 2);

          ctx.restore();
        }
      };

      // 1. Renderizar desenhos fixados salvos
      for (const d of drawings) {
        if (d.type === 'horizontal') drawHorizontal(d.price, d.color);
        else if (d.type === 'vertical') drawVertical(d.time, d.color);
        else if (d.type === 'trendline') drawTrendline(d.p1, d.p2, d.color);
        else if (d.type === 'measure') drawMeasure(d.p1, d.p2);
      }

      // 2. Renderizar linhas de tendência automáticas se ativas
      if (autoTrendlines) {
        if (autoTrendlines.resistance) {
          drawTrendline(
            autoTrendlines.resistance.p1,
            autoTrendlines.resistance.p2,
            autoTrendlines.resistance.color,
            false,
            'Auto LTB'
          );
        }
        if (autoTrendlines.support) {
          drawTrendline(
            autoTrendlines.support.p1,
            autoTrendlines.support.p2,
            autoTrendlines.support.color,
            false,
            'Auto LTA'
          );
        }
      }

      // 3. Renderizar rascunho em tempo real
      if (draftStart && draftCurrent) {
        if (activeTool === 'trendline') drawTrendline(draftStart, draftCurrent, currentColor, true);
        else if (activeTool === 'measure') drawMeasure(draftStart, draftCurrent);
      }

      // 4. Renderizar alvos de ápice / confluência futura se projeção estiver ativa
      if (projectLines && convergences && convergences.length > 0) {
        for (const c of convergences) {
          drawConvergenceApex(c);
        }
      }
    } catch (err) {
      console.warn('DrawingLayer render error caught safely:', err);
    }
  }, [
    chart,
    mainSeries,
    drawings,
    draftStart,
    draftCurrent,
    activeTool,
    currentColor,
    dark,
    projectLines,
    convergences,
    autoTrendlines,
    getCoordinates,
  ]);

  // Sincronizar com mudanças de escala e scroll do Lightweight Charts com debouncing RAF
  useEffect(() => {
    if (!chart) return;
    const timeScale = chart.timeScale();
    let rafId: number | null = null;
    const handleRangeChange = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        try {
          render();
        } catch (err) {
          console.warn('Error during chart range change render:', err);
        }
      });
    };
    timeScale.subscribeVisibleLogicalRangeChange?.(handleRangeChange);
    timeScale.subscribeVisibleTimeRangeChange?.(handleRangeChange);
    handleRangeChange();

    window.addEventListener('resize', handleRangeChange);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
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

    let time = chart.timeScale().coordinateToTime(x);
    if (time === null && candles && candles.length >= 2) {
      const logical = chart.timeScale().coordinateToLogical(x);
      if (logical !== null) {
        const lastIndex = candles.length - 1;
        const intervalSec = Math.max(1, candles[lastIndex].time - candles[lastIndex - 1].time);
        time = (candles[lastIndex].time + Math.round((logical - lastIndex) * intervalSec)) as UTCTimestamp;
      }
    }

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

    let time = chart.timeScale().coordinateToTime(x);
    if (time === null && candles && candles.length >= 2) {
      const logical = chart.timeScale().coordinateToLogical(x);
      if (logical !== null) {
        const lastIndex = candles.length - 1;
        const intervalSec = Math.max(1, candles[lastIndex].time - candles[lastIndex - 1].time);
        time = (candles[lastIndex].time + Math.round((logical - lastIndex) * intervalSec)) as UTCTimestamp;
      }
    }

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
