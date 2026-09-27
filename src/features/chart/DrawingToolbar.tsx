import React from 'react';
import { MousePointer, TrendingUp, Minus, SeparatorVertical, Ruler, Trash2 } from 'lucide-react';
import type { DrawingTool } from './drawings';

interface DrawingToolbarProps {
  activeTool: DrawingTool;
  onSelectTool: (tool: DrawingTool) => void;
  currentColor: string;
  onChangeColor: (color: string) => void;
  onClearDrawings: () => void;
  drawingsCount: number;
}

const COLORS = [
  '#38bdf8', // Cyan/Sky
  '#10b981', // Emerald/Green
  '#f43f5e', // Rose/Red
  '#f59e0b', // Amber/Yellow
  '#a855f7', // Purple
  '#e2e8f0', // White/Light slate
];

export const DrawingToolbar: React.FC<DrawingToolbarProps> = ({
  activeTool,
  onSelectTool,
  currentColor,
  onChangeColor,
  onClearDrawings,
  drawingsCount,
}) => {
  return (
    <div className="drawing-toolbar" role="toolbar" aria-label="Ferramentas de Desenho">
      <div className="drawing-tool-group">
        <button
          type="button"
          className={`drawing-tool-btn ${activeTool === 'cursor' ? 'active' : ''}`}
          onClick={() => onSelectTool('cursor')}
          title="Cursor / Navegar (Esc)"
          aria-label="Cursor padrão"
        >
          <MousePointer size={15} />
        </button>
        <button
          type="button"
          className={`drawing-tool-btn ${activeTool === 'trendline' ? 'active' : ''}`}
          onClick={() => onSelectTool('trendline')}
          title="Linha de Tendência (Trendline)"
          aria-label="Linha de Tendência"
        >
          <TrendingUp size={15} />
        </button>
        <button
          type="button"
          className={`drawing-tool-btn ${activeTool === 'horizontal' ? 'active' : ''}`}
          onClick={() => onSelectTool('horizontal')}
          title="Linha Horizontal (Suporte/Resistência)"
          aria-label="Linha Horizontal"
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          className={`drawing-tool-btn ${activeTool === 'vertical' ? 'active' : ''}`}
          onClick={() => onSelectTool('vertical')}
          title="Linha Vertical (Marcação de Tempo)"
          aria-label="Linha Vertical"
        >
          <SeparatorVertical size={15} />
        </button>
        <button
          type="button"
          className={`drawing-tool-btn ${activeTool === 'measure' ? 'active' : ''}`}
          onClick={() => onSelectTool('measure')}
          title="Régua de Variação (% e $ entre 2 pontos)"
          aria-label="Régua de Variação"
        >
          <Ruler size={15} />
        </button>
      </div>

      <div className="drawing-tool-divider" />

      {/* Seletor de Cores Rápido */}
      <div className="drawing-color-palette" title="Cor do Traçado">
        {COLORS.map(c => (
          <button
            key={c}
            type="button"
            className={`drawing-color-swatch ${currentColor === c ? 'selected' : ''}`}
            style={{ backgroundColor: c }}
            onClick={() => onChangeColor(c)}
            aria-label={`Cor ${c}`}
          />
        ))}
      </div>

      {drawingsCount > 0 && (
        <>
          <div className="drawing-tool-divider" />
          <button
            type="button"
            className="drawing-tool-btn drawing-clear-btn"
            onClick={onClearDrawings}
            title={`Limpar ${drawingsCount} desenho(s)`}
            aria-label="Limpar desenhos"
          >
            <Trash2 size={14} />
          </button>
        </>
      )}
    </div>
  );
};
