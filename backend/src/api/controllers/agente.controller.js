const { AIProvider } = require('../../../ai-provider');
const contextoRagService = require('../../domain/services/contextoRag.service');
const logger = require('../../shared/config/logger.config');
const config = require('../../config');
const { observeHistogram } = require('../../infrastructure/observability/metrics');

const aiProvider = new AIProvider();

const parseConversaId = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = Number(value);
  if (Number.isNaN(numeric) || numeric <= 0) {
    return null;
  }
  return numeric;
};

const conversar = async (req, res) => {
  const {
    conversaId: conversaIdRaw,
    pergunta,
    strategy = 'recent',
    k
  } = req.body || {};

  const conversaId = parseConversaId(conversaIdRaw);

  if (!conversaId) {
    return res.status(400).json({
      error: {
        code: 'invalid_conversa_id',
        message: 'conversaId deve ser um número positivo'
      }
    });
  }

  try {
    const ragResult = await contextoRagService.retrieveContextos({
      conversaId,
      queryText: pergunta,
      strategy,
      k
    });

    const promptPayload = contextoRagService.buildPrompt({
      perguntaUsuario: pergunta,
      contextos: ragResult.contextos,
      knowledgeSnippets: ragResult.knowledgeSnippets
    });

    const llmStart = Date.now();
    const aiResponse = await aiProvider.gerarResposta(
      promptPayload.messages,
      config.ai.provider,
      {
        temperature: 0.3,
        maxTokens: 600,
        ...(config.ai.chatModel ? { model: config.ai.chatModel } : {})
      }
    );
    const llmMs = Date.now() - llmStart;
    observeHistogram('rag_llm_ms', llmMs);

    const answerText = aiResponse?.texto?.trim() || '';
    const usedContexts = ragResult.contextos.map((contexto) => ({
      id: contexto.id,
      periodo_inicio: contexto.periodo_inicio,
      periodo_fim: contexto.periodo_fim
    }));

    logger.info('rag.answer', {
      conversaId,
      strategy: ragResult.metadata.strategy,
      requestedK: k,
      appliedLimit: ragResult.metadata.limit,
      contextsUsed: usedContexts.length,
      retrievalMs: ragResult.metadata.retrievalMs,
      embeddingMs: ragResult.metadata.embeddingMs,
      knowledgeMs: ragResult.metadata.knowledgeMs,
      llmMs
    });

    return res.status(200).json({
      answer: answerText,
      used_contexts: usedContexts,
      strategy: ragResult.metadata.strategy,
      timings: {
        retrieval_ms: ragResult.metadata.retrievalMs,
        embedding_ms: ragResult.metadata.embeddingMs,
        knowledge_ms: ragResult.metadata.knowledgeMs,
        llm_ms: llmMs
      }
    });
  } catch (error) {
    logger.error('Erro ao executar agente conversacional', {
      conversaId,
      error: error.message,
      code: error.code,
      statusCode: error.statusCode
    });

    const statusCode = error.statusCode || 500;
    const code = typeof error.code === 'string' ? error.code : (error.name || 'internal_error');
    const message = statusCode >= 500
      ? 'Erro ao processar a solicitação do agente'
      : error.message || 'Erro ao processar a solicitação do agente';

    return res.status(statusCode).json({
      error: {
        code,
        message
      }
    });
  }
};

module.exports = {
  conversar
};
