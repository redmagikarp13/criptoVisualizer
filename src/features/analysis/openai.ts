import { analysisSchema, type Analysis, type Snapshot } from './snapshot';

export async function analyzeWithOpenAi(
  snapshot: Snapshot,
  apiKey: string,
  modelName = 'gpt-4o-mini',
  baseUrl = '',
  signal?: AbortSignal,
): Promise<{ analysis: Analysis; model: string }> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    throw new Error('Chave da API da OpenAI não configurada. Abra as Configurações ⚙️ e insira sua chave.');
  }

  const endpoint = `${(baseUrl.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '')}/chat/completions`;
  const selectedModel = modelName.trim() || 'gpt-4o-mini';

  const systemPrompt = `Você é um analista técnico e quantitativo sênior do mercado financeiro e de criptoativos, integrado ao software CriptoVisualizer.
Sua função é fornecer uma leitura técnica rigorosa, probabilística e imparcial do ativo com base estritamente nos dados fornecidos no snapshot.

REGRAS OBRIGATÓRIAS:
1. Responda SOMENTE com um objeto JSON válido, sem cercaduras de markdown (\`\`\`json) e sem qualquer texto antes ou depois.
2. O JSON deve obrigatoriamente satisfazer o seguinte formato exato:
{
  "summary": "Resumo executivo claro e conciso da situação técnica (1 a 3 parágrafos curtos)",
  "trend": "alta" | "baixa" | "lateral" | "indefinida",
  "evidence": ["Evidência técnica 1 com valores concretos", "Evidência 2", ...],
  "scenarios": [
    { "condition": "Condição de preço ou indicador (ex: Rompimento de 0,268 com volume)", "interpretation": "Interpretação e alvo estimado" },
    ...
  ],
  "risks": ["Risco 1 com contexto operacional", "Risco 2", ...],
  "limitations": ["Limitação dos dados ou do momento (ex: Baixa liquidez no livro, consolidação)", ...]
}
3. Nunca invente dados que não estejam presentes no snapshot.
4. Se fornecido 'tokenomics' (suprimento circulante, tokens bloqueados, taxa de desbloqueio, próximo unlock), avalie expressamente em 'risks' e 'scenarios' a pressão inflacionária ou risco de despejo por grandes desbloqueios.
5. Se fornecido 'derivatives' (funding rate, long/short ratio, open interest), avalie o risco de squeeze ou liquidação em massa.
6. Se fornecido 'orderBook' (spoofing, paredes de market makers, pressão compradora/vendedora), avalie a manipulação institucional no curto prazo.
7. Se houver 'userNotes', responda diretamente às dúvidas ou posicionamento do usuário.`;

  const userPrompt = `Analise os seguintes dados estruturados de mercado do CriptoVisualizer:
${JSON.stringify(snapshot, null, 2)}`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cleanKey}`,
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) {
      throw new Error('Análise cancelada pelo usuário.');
    }
    throw new Error(`Falha de conexão com a OpenAI: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!response.ok) {
    let detail = '';
    try {
      const errJson = await response.json();
      detail = errJson?.error?.message || JSON.stringify(errJson);
    } catch {
      detail = await response.text().catch(() => '');
    }

    if (response.status === 401) {
      throw new Error('Chave de API da OpenAI inválida ou não autorizada (401). Verifique sua chave nas configurações.');
    }
    if (response.status === 429) {
      throw new Error(`Limite de requisições ou cota da OpenAI esgotada (429): ${detail || 'Verifique seus créditos no painel da OpenAI.'}`);
    }
    throw new Error(`Erro na API da OpenAI (${response.status}): ${detail || response.statusText}`);
  }

  const json = await response.json();
  const rawContent = json?.choices?.[0]?.message?.content;
  if (!rawContent || typeof rawContent !== 'string') {
    throw new Error('A OpenAI retornou uma resposta sem conteúdo textual legível.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent.trim());
  } catch {
    throw new Error('A OpenAI não retornou um JSON válido.');
  }

  const analysis = analysisSchema.parse(parsed);
  return {
    analysis,
    model: json.model || selectedModel,
  };
}
