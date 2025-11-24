// src/config/index.js
/**
 * Centraliza leitura de variáveis de ambiente e expõe configurações
 * utilizadas pelos serviços do backend.
 */
const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
};

const config = {
  ai: {
    embeddingModel:
      process.env.MODEL_EMBEDDINGS ||
      process.env.EMBEDDING_MODEL ||
      process.env.OPENAI_MODEL_EMBEDDING ||
      null,
    chatModel:
      process.env.MODEL_CHAT ||
      process.env.OPENAI_MODEL_CHAT ||
      null,
    provider: (process.env.DEFAULT_AI_PROVIDER || 'openai').toLowerCase()
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || null
  },
  rag: {
    maxK: parseNumber(process.env.RAG_MAX_K, 5)
  },
  embeddings: {
    featureEnabled: String(process.env.FEATURE_EMBEDDING || 'true').toLowerCase() !== 'false'
  }
};

module.exports = config;
