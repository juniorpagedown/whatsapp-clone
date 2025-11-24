// domain/services/mensagemClassificacao.service.js
const pool = require('../../infrastructure/database/postgres');
const logger = require('../../shared/config/logger.config');
const {
  ValidationError,
  NotFoundError
} = require('../../shared/errors/AppError');
const mensagemClassificacaoRepo = require('../repositories/mensagemClassificacao.repo');

let classificacaoService = null;
try {
  // eslint-disable-next-line global-require
  classificacaoService = require('./classificacao.service');
} catch (error) {
  logger.debug('Serviço de classificação híbrida não disponível', {
    error: error.message
  });
}

const ORIGENS_SUPORTADAS = new Set(['manual', 'sugestao_ia', 'auto_ia']);
const SUGESTAO_LIMIT = 5;

/**
 * Converte um valor livre para um inteiro válido de mensagem.
 * @param {string|number} mensagemIdParam
 * @returns {number}
 */
const parseMensagemId = (mensagemIdParam) => {
  const parsed = Number(mensagemIdParam);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError('mensagemId inválido');
  }
  return parsed;
};

/**
 * Normaliza strings opcionais, retornando null quando vazias.
 * @param {any} value
 * @returns {string|null}
 */
const sanitizeOptionalText = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

/**
 * Normaliza o campo macro (obrigatório).
 * @param {any} value
 * @returns {string}
 */
const sanitizeMacro = (value) => {
  const macro = sanitizeOptionalText(value);
  if (!macro) {
    throw new ValidationError('macro é obrigatório');
  }
  if (macro.length > 150) {
    throw new ValidationError('macro excede o tamanho máximo permitido (150 caracteres)');
  }
  return macro;
};

/**
 * Normaliza o item (opcional).
 * @param {any} value
 * @returns {string|null}
 */
const sanitizeItem = (value) => {
  const item = sanitizeOptionalText(value);
  if (item && item.length > 200) {
    throw new ValidationError('item excede o tamanho máximo permitido (200 caracteres)');
  }
  return item;
};

/**
 * Resolve a origem aplicando regras de fallback.
 * @param {any} origemParam
 * @returns {string}
 */
const resolveOrigem = (origemParam) => {
  if (!origemParam) {
    return 'manual';
  }

  const origem = origemParam.toString().trim().toLowerCase();
  if (!ORIGENS_SUPORTADAS.has(origem)) {
    throw new ValidationError('origem inválida');
  }
  return origem;
};

/**
 * Normaliza confiança garantindo faixa 0..1 e até quatro casas.
 * @param {any} value
 * @param {string} origem
 * @returns {number|null}
 */
const normalizeConfianca = (value, origem) => {
  if (value === undefined || value === null || value === '') {
    if (origem === 'manual') {
      return 1;
    }
    return 0;
  }

  const parsed = typeof value === 'number' ? value : parseFloat(value);
  if (Number.isNaN(parsed)) {
    throw new ValidationError('confianca deve ser um número');
  }
  if (parsed < 0 || parsed > 1) {
    throw new ValidationError('confianca deve estar entre 0 e 1');
  }

  return Math.round(parsed * 10000) / 10000;
};

/**
 * Garante que a mensagem existe no banco.
 * @param {number} mensagemId
 * @returns {Promise<{id:number, texto:string|null}>}
 */
const ensureMensagemExiste = async (mensagemId) => {
  const { rows } = await pool.query(
    `
      SELECT id,
             conversa_id,
             texto
        FROM mensagens
       WHERE id = $1
       LIMIT 1
    `,
    [mensagemId]
  );

  if (!rows.length) {
    throw new NotFoundError('Mensagem não encontrada');
  }

  return rows[0];
};

/**
 * Monta sugestões simples por palavras-chave em caso de fallback.
 * @param {string} texto
 * @param {number} [limit=SUGESTAO_LIMIT]
 * @returns {Promise<Array<{macro:string,item:string|null,score:number,origem:string,explicacao:string}>>}
 */
const keywordSuggestionFallback = async (texto, limit = SUGESTAO_LIMIT) => {
  const normalized = texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const { rows } = await pool.query(
    `
      SELECT macro,
             item,
             pos,
             neg
        FROM classificacao_catalogo
       WHERE ativo = TRUE
    `
  );

  const suggestions = [];

  rows.forEach((row) => {
    const positives = Array.isArray(row.pos)
      ? row.pos
      : row.pos && typeof row.pos === 'object'
        ? Object.values(row.pos).flat()
        : [];
    const negatives = Array.isArray(row.neg)
      ? row.neg
      : row.neg && typeof row.neg === 'object'
        ? Object.values(row.neg).flat()
        : [];

    const normalizedPos = positives
      .filter(Boolean)
      .map((term) => term.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());
    const normalizedNeg = negatives
      .filter(Boolean)
      .map((term) => term.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());

    const hasNegativeMatch = normalizedNeg.some((term) => normalized.includes(term));
    if (hasNegativeMatch) {
      return;
    }

    const matches = normalizedPos.reduce((acc, term) => {
      if (!term) {
        return acc;
      }
      return normalized.includes(term) ? acc + 1 : acc;
    }, 0);

    if (matches > 0) {
      suggestions.push({
        macro: row.macro,
        item: row.item,
        score: Math.min(matches * 20, 100),
        origem: 'keyword',
        explicacao: 'Sugestão baseada em palavras-chave do catálogo.'
      });
    }
  });

  suggestions.sort((a, b) => b.score - a.score);
  return suggestions.slice(0, limit);
};

/**
 * Cria ou atualiza a classificação de uma mensagem.
 * @param {string|number} mensagemIdParam
 * @param {{macro:any,item?:any,origem?:any,confianca?:any,observacoes?:any}} payload
 * @param {number|null} userId
 * @returns {Promise<{classificacao:object, created:boolean}>}
 */
const buildLegacyPayload = (classificacao, conversaId = null) => {
  if (!classificacao) {
    return null;
  }

  const payload = {
    id: classificacao.id || null,
    message_id: classificacao.message_id,
    mensagem_id: classificacao.mensagem_id,
    conversa_id: typeof classificacao.conversa_id !== 'undefined'
      ? classificacao.conversa_id
      : conversaId,
    user_id: classificacao.user_id || classificacao.criado_por || null,
    criado_por: classificacao.criado_por || classificacao.user_id || null,
    macro: classificacao.macro,
    item: classificacao.item,
    origem: classificacao.origem,
    confianca: classificacao.confianca,
    observacoes: classificacao.observacoes ?? classificacao.comentario ?? null,
    comentario: classificacao.comentario ?? classificacao.observacoes ?? null,
    created_at: classificacao.created_at,
    updated_at: classificacao.updated_at
  };

  return payload;
};

const createOrUpdate = async (mensagemIdParam, payload = {}, userId = null) => {
  const mensagemId = parseMensagemId(mensagemIdParam);
  if (!userId) {
    throw new ValidationError('Usuário autenticado inválido');
  }

  const macro = sanitizeMacro(payload.macro);
  const item = sanitizeItem(payload.item);
  const origem = resolveOrigem(payload.origem);
  const confianca = normalizeConfianca(payload.confianca, origem);
  const observacoes = sanitizeOptionalText(payload.observacoes ?? payload.comentario ?? null);

  const mensagem = await ensureMensagemExiste(mensagemId);
  const existente = await mensagemClassificacaoRepo.selectByMensagem(mensagemId);

  const classificacao = await mensagemClassificacaoRepo.upsert({
    mensagemId,
    macro,
    item,
    origem,
    confianca,
    observacoes,
    criadoPor: userId
  });

  const payloadLegacy = buildLegacyPayload(
    {
      ...classificacao,
      conversa_id: classificacao?.conversa_id ?? mensagem.conversa_id ?? null,
      comentario: observacoes
    },
    mensagem.conversa_id ?? null
  );

  logger.info('Classificação registrada para mensagem', {
    mensagemId,
    conversaId: mensagem.conversa_id,
    userId,
    macro,
    item,
    origem,
    created: !existente
  });

  return {
    classificacao: payloadLegacy,
    created: !existente
  };
};

/**
 * Obtém classificação vigente para uma mensagem.
 * @param {string|number} mensagemIdParam
 * @returns {Promise<object>}
 */
const getByMensagem = async (mensagemIdParam) => {
  const mensagemId = parseMensagemId(mensagemIdParam);
  const mensagem = await ensureMensagemExiste(mensagemId);

  const classificacao = await mensagemClassificacaoRepo.selectByMensagem(mensagemId);
  if (!classificacao) {
    return null;
  }

  return buildLegacyPayload(classificacao, mensagem.conversa_id ?? null);
};

/**
 * Remove classificação associada a uma mensagem.
 * @param {string|number} mensagemIdParam
 * @returns {Promise<object>}
 */
const remove = async (mensagemIdParam, userId = null) => {
  const mensagemId = parseMensagemId(mensagemIdParam);
  const mensagem = await ensureMensagemExiste(mensagemId);

  const removed = await mensagemClassificacaoRepo.deleteByMensagem(mensagemId);
  if (!removed) {
    throw new NotFoundError('Classificação não encontrada para a mensagem');
  }

  logger.info('Classificação removida para mensagem', {
    mensagemId,
    conversaId: mensagem.conversa_id,
    userId
  });

  return buildLegacyPayload(removed, mensagem.conversa_id ?? null);
};

/**
 * Recupera sugestões de classificação para uma mensagem.
 * @param {string|number} mensagemIdParam
 * @returns {Promise<Array<{macro:string,item:string|null,score:number|null,origem:string,explicacao:string}>>}
 */
const getSugestoes = async (mensagemIdParam) => {
  const mensagemId = parseMensagemId(mensagemIdParam);
  const mensagem = await ensureMensagemExiste(mensagemId);

  const texto = sanitizeOptionalText(mensagem.texto);
  if (!texto) {
    return [];
  }

  if (classificacaoService && typeof classificacaoService.suggestFromText === 'function') {
    const sugestoes = await classificacaoService.suggestFromText({
      texto,
      limit: SUGESTAO_LIMIT
    });

    if (Array.isArray(sugestoes) && sugestoes.length > 0) {
      return sugestoes.map((sugestao) => ({
        macro: sugestao.macro,
        item: sugestao.item,
        score: typeof sugestao.score === 'number' ? sugestao.score : null,
        origem: 'hibrido',
        explicacao: 'Sugestão híbrida combinando catálogo e busca vetorial.'
      }));
    }
  }

  return keywordSuggestionFallback(texto);
};

module.exports = {
  createOrUpdate,
  getByMensagem,
  remove,
  getSugestoes
};
