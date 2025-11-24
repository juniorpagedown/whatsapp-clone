// ai-provider.js - Sistema unificado para múltiplos provedores de IA
const axios = require('axios');
require('dotenv').config();

const DEFAULT_OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
const DEFAULT_OPENAI_CHAT_MODEL = 'gpt-4';

class AIProvider {
  constructor() {
    // Suporta EMBEDDING_MODEL (novo padrão) e OPENAI_MODEL_EMBEDDING (legacy)
    const embeddingModel = process.env.EMBEDDING_MODEL
      || process.env.OPENAI_MODEL_EMBEDDING
      || DEFAULT_OPENAI_EMBEDDING_MODEL;

    // Aviso de depreciação
    if (process.env.OPENAI_MODEL_EMBEDDING && !process.env.EMBEDDING_MODEL) {
      // eslint-disable-next-line no-console
      console.warn('⚠️  OPENAI_MODEL_EMBEDDING está deprecated. Use EMBEDDING_MODEL no .env');
    }

    this.providers = {
      openai: {
        apiKey: process.env.OPENAI_API_KEY,
        embeddingModel,
        chatModel: process.env.OPENAI_MODEL_CHAT || DEFAULT_OPENAI_CHAT_MODEL,
        baseURL: 'https://api.openai.com/v1'
      },
      ollama: {
        endpoint: process.env.OLLAMA_ENDPOINT || 'http://localhost:11434',
        embeddingModel: process.env.OLLAMA_MODEL_EMBEDDING || 'nomic-embed-text'
      }
    };

    this.defaultProvider = (process.env.DEFAULT_AI_PROVIDER || 'openai').toLowerCase();
    this.embeddingProvider = (process.env.EMBEDDING_PROVIDER || 'openai').toLowerCase();
  }

  async gerarEmbedding(texto, providerName = null) {
    const providerKey = (providerName || this.embeddingProvider || 'openai').toLowerCase();

    switch (providerKey) {
      case 'ollama':
      case 'local':
        return this.gerarEmbeddingOllama(texto);
      case 'openai':
      default:
        return this.gerarEmbeddingOpenAI(texto);
    }
  }

  async gerarEmbeddingOpenAI(texto) {
    const provider = this.providers.openai;

    if (!provider.apiKey) {
      throw new Error('OpenAI API Key não configurada');
    }

    try {
      const response = await axios.post(
        `${provider.baseURL}/embeddings`,
        { model: provider.embeddingModel, input: texto },
        { headers: { Authorization: `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json' } }
      );

      return response.data.data[0].embedding;
    } catch (error) {
      console.error('Erro ao gerar embedding (OpenAI):', error.response?.data || error.message);
      throw error;
    }
  }

  async gerarEmbeddingOllama(texto) {
    const provider = this.providers.ollama;

    if (!provider.endpoint) {
      throw new Error('Ollama endpoint não configurado');
    }

    try {
      const response = await axios.post(
        `${provider.endpoint}/api/embeddings`,
        { model: provider.embeddingModel, input: texto },
        { headers: { 'Content-Type': 'application/json' } }
      );

      if (Array.isArray(response.data?.embedding)) {
        return response.data.embedding;
      }

      if (Array.isArray(response.data?.data?.[0]?.embedding)) {
        return response.data.data[0].embedding;
      }

      throw new Error('Resposta inválida do provedor de embeddings local');
    } catch (error) {
      console.error('Erro ao gerar embedding (Ollama):', error.response?.data || error.message);
      throw error;
    }
  }

  async gerarResposta(mensagens, providerName = null, options = {}) {
    const provider = (providerName || this.defaultProvider).toLowerCase();

    switch (provider) {
      case 'openai':
      default:
        return this.gerarRespostaOpenAI(mensagens, options);
    }
  }

  async gerarRespostaOpenAI(mensagens, options = {}) {
    const provider = this.providers.openai;

    if (!provider.apiKey) {
      throw new Error('OpenAI API Key não configurada');
    }

    try {
      const response = await axios.post(
        `${provider.baseURL}/chat/completions`,
        {
          model: options.model || provider.chatModel,
          messages: mensagens,
          temperature: options.temperature || 0.7,
          max_tokens: options.maxTokens || 500
        },
        { headers: { Authorization: `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json' } }
      );

      return {
        texto: response.data.choices[0].message.content,
        tokens: response.data.usage.total_tokens,
        modelo: response.data.model,
        provider: 'openai'
      };
    } catch (error) {
      console.error('Erro OpenAI:', error.response?.data || error.message);
      throw error;
    }
  }

  async analisarSentimento(texto, provider = null) {
    const mensagens = [
      { role: 'system', content: 'Analise o sentimento. Responda: positive, negative ou neutral' },
      { role: 'user', content: texto }
    ];

    const resultado = await this.gerarResposta(mensagens, provider, { temperature: 0.3, maxTokens: 10 });
    return resultado.texto.trim().toLowerCase();
  }

  async extrairIntencao(texto, provider = null) {
    const mensagens = [
      { role: 'system', content: 'Identifique a intenção: suporte, duvida, reclamacao, elogio, pedido, informacao, outro. Responda apenas a categoria.' },
      { role: 'user', content: texto }
    ];

    const resultado = await this.gerarResposta(mensagens, provider, { temperature: 0.3, maxTokens: 20 });
    return resultado.texto.trim().toLowerCase();
  }

  getProvidersDisponiveis() {
    const disponiveis = [];

    for (const [nome, config] of Object.entries(this.providers)) {
      if (nome === 'ollama') {
        disponiveis.push({
          nome,
          modelo: config.embeddingModel,
          disponivel: Boolean(config.endpoint)
        });
      } else if (config.apiKey) {
        disponiveis.push({ nome, modelo: config.chatModel, disponivel: true });
      }
    }

    return disponiveis;
  }
}

class CachedAIProvider extends AIProvider {
  constructor() {
    super();
    this.cache = new Map();
    this.cacheTimeout = 3600000;
  }

  getCacheKey(mensagens) {
    return JSON.stringify(mensagens);
  }

  async gerarRespostaComCache(mensagens, provider = null, options = {}) {
    const cacheKey = this.getCacheKey(mensagens);
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      console.log('✅ Resposta do cache');
      return cached.resposta;
    }

    const resposta = await this.gerarResposta(mensagens, provider, options);
    this.cache.set(cacheKey, { resposta, timestamp: Date.now() });
    return resposta;
  }

  limparCache() {
    this.cache.clear();
  }
}

module.exports = { AIProvider, CachedAIProvider };
