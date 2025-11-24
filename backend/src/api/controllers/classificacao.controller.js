// api/controllers/classificacao.controller.js
const pool = require('../../infrastructure/database/postgres');
const logger = require('../../shared/config/logger.config');
const { ValidationError, NotFoundError, UnauthorizedError } = require('../../shared/errors/AppError');
const cacheService = require('../../infrastructure/cache/cache.service');
const classificacaoService = require('../../domain/services/classificacao.service');
const {
  createSchema,
  updateSchema,
  querySchema
} = require('../validators/classificacao.validator');

const sanitizeClassificationInput = ({ macro, item, origem, confianca }) => {
  const trimmedMacro = typeof macro === 'string' ? macro.trim() : '';
  const trimmedItem = typeof item === 'string' ? item.trim() : '';

  if (!trimmedMacro) {
    throw new ValidationError('Macro é obrigatória');
  }

  if (!trimmedItem) {
    throw new ValidationError('Item é obrigatório');
  }

  let origemValue = origem;
  if (typeof origemValue !== 'string' || origemValue.trim().length === 0) {
    origemValue = 'manual';
  } else {
    origemValue = origemValue.trim().toLowerCase();
  }

  let confiancaValue = null;
  if (confianca !== undefined && confianca !== null && confianca !== '') {
    const parsed = parseInt(confianca, 10);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
      throw new ValidationError('Confianca deve estar entre 0 e 100');
    }
    confiancaValue = parsed;
  }

  return {
    macro: trimmedMacro,
    item: trimmedItem,
    origem: origemValue,
    confianca: confiancaValue
  };
};

const sanitizeMessageClassificationInput = ({ messageId, conversaId, macro, item, comentario }) => {
  const parsedMessageId = parseInt(messageId, 10);
  if (!messageId || Number.isNaN(parsedMessageId) || parsedMessageId <= 0) {
    throw new ValidationError('messageId inválido');
  }

  let parsedConversaId = null;
  if (conversaId !== undefined && conversaId !== null && conversaId !== '') {
    parsedConversaId = parseInt(conversaId, 10);
    if (Number.isNaN(parsedConversaId) || parsedConversaId <= 0) {
      throw new ValidationError('conversaId inválido');
    }
  }

  const trimmedMacro = typeof macro === 'string' ? macro.trim() : '';
  const trimmedItem = typeof item === 'string' ? item.trim() : '';

  if (!trimmedMacro) {
    throw new ValidationError('Macro é obrigatória');
  }

  if (!trimmedItem) {
    throw new ValidationError('Item é obrigatório');
  }

  const comentarioValue =
    typeof comentario === 'string' && comentario.trim().length > 0
      ? comentario.trim()
      : null;

  return {
    messageId: parsedMessageId,
    conversaId: parsedConversaId,
    macro: trimmedMacro,
    item: trimmedItem,
    comentario: comentarioValue
  };
};

const validateRequest = (schema, payload) => {
  const { value, error } = schema.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
    convert: true
  });

  if (error) {
    throw new ValidationError('Dados inválidos', error.details);
  }

  return value;
};

const splitCsvLine = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
};

const parseCsvBuffer = (buffer) => {
  if (!buffer || !buffer.length) {
    return [];
  }

  const content = buffer.toString('utf-8');
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.replace(/^\uFEFF/, '').trim())
    .filter((line) => line.length);

  if (!lines.length) {
    return [];
  }

  const headerColumns = splitCsvLine(lines[0]).map((column) => column.trim().toLowerCase());
  const expectedHeaders = ['macro', 'item', 'descricao', 'cor_hex', 'prioridade', 'ativo'];

  const normalizedHeaders = headerColumns.map((header) => header.replace(/\s+/g, '_'));
  const headerMismatch = expectedHeaders.some((expected, index) => normalizedHeaders[index] !== expected);

  if (headerMismatch) {
    throw new ValidationError('Cabeçalho do CSV inválido. Esperado: macro,item,descricao,cor_hex,prioridade,ativo');
  }

  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const rawColumns = splitCsvLine(lines[i]);
    if (rawColumns.every((value) => value.trim().length === 0)) {
      continue;
    }

    const row = { line: i + 1 };
    expectedHeaders.forEach((key, index) => {
      const raw = rawColumns[index] ?? '';
      const sanitized = raw.replace(/^"|"$/g, '').replace(/""/g, '"').trim();
      row[key] = sanitized;
    });
    rows.push(row);
  }

  return rows;
};

const list = async (req, res, next) => {
  try {
    const params = validateRequest(querySchema, req.query || {});
    const result = await classificacaoService.list(params);
    return res.json(result);
  } catch (error) {
    logger.error('Erro ao listar classificações', {
      error: error.message
    });
    return next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const payload = validateRequest(createSchema, req.body || {});
    const record = await classificacaoService.create(payload, req.user);
    return res.status(201).json({ data: record });
  } catch (error) {
    logger.error('Erro ao criar classificação', { error: error.message });
    return next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const payload = validateRequest(updateSchema, req.body || {});
    const record = await classificacaoService.update(req.params.id, payload, req.user);
    return res.json({ data: record });
  } catch (error) {
    logger.error('Erro ao atualizar classificação', {
      error: error.message,
      id: req.params.id
    });
    return next(error);
  }
};

const toggle = async (req, res, next) => {
  try {
    const record = await classificacaoService.toggle(req.params.id, req.user);
    return res.json({ data: record });
  } catch (error) {
    logger.error('Erro ao alternar status da classificação', {
      error: error.message,
      id: req.params.id
    });
    return next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    await classificacaoService.softDelete(req.params.id, req.user);
    return res.json({ ok: true });
  } catch (error) {
    logger.error('Erro ao remover classificação', {
      error: error.message,
      id: req.params.id
    });
    return next(error);
  }
};

const importCsv = async (req, res, next) => {
  if (!req.file || !req.file.buffer) {
    return next(new ValidationError('Arquivo CSV não enviado'));
  }

  try {
    const rows = parseCsvBuffer(req.file.buffer);
    const report = await classificacaoService.importCsv(rows, req.user);
    return res.json({ ok: true, report });
  } catch (error) {
    logger.error('Erro ao importar CSV de classificações', {
      error: error.message
    });
    return next(error);
  }
};

const exportCsv = async (req, res, next) => {
  try {
    const csv = await classificacaoService.exportCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="classificacoes.csv"');
    return res.send(csv);
  } catch (error) {
    logger.error('Erro ao exportar CSV de classificações', {
      error: error.message
    });
    return next(error);
  }
};

const getCatalog = async (req, res, next) => {
  try {
    const catalog = await classificacaoService.listCatalog();
    return res.json(catalog);
  } catch (error) {
    logger.error('Erro ao carregar catálogo de classificação', { error: error.message });
    return next(error);
  }
};

const getSuggestions = async (req, res, next) => {
  const { id } = req.params;
  const conversaId = parseInt(id, 10);

  if (!id || Number.isNaN(conversaId)) {
    return next(new ValidationError('ID da conversa inválido'));
  }

  try {
    const { rows } = await pool.query(
      `
        SELECT texto
        FROM mensagens
        WHERE conversa_id = $1
          AND texto IS NOT NULL
          AND texto <> ''
        ORDER BY timestamp DESC
        LIMIT 80
      `,
      [conversaId]
    );

    const joinedText = rows.map((row) => row.texto).join(' ');

    const sugestoes = await classificacaoService.suggestFromText({
      texto: joinedText
    });

    return res.json({
      conversa_id: conversaId,
      sugestoes
    });
  } catch (error) {
    logger.error('Erro ao gerar sugestões de classificação', {
      error: error.message,
      conversaId
    });
    return next(error);
  }
};

const applyClassification = async (req, res, next) => {
  const { id } = req.params;
  const conversaId = parseInt(id, 10);

  if (!id || Number.isNaN(conversaId)) {
    return next(new ValidationError('ID da conversa inválido'));
  }

  let payload;
  try {
    payload = sanitizeClassificationInput(req.body || {});
  } catch (validationError) {
    return next(validationError);
  }

  const usuario =
    (typeof req.body?.usuario === 'string' && req.body.usuario.trim().length > 0
      ? req.body.usuario.trim()
      : null) ||
    req.user?.nome ||
    req.user?.email ||
    `user-${req.user?.id || 'desconhecido'}`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: conversationRows } = await client.query(
      `
        SELECT id
        FROM conversas
        WHERE id = $1
        FOR UPDATE
      `,
      [conversaId]
    );

    if (conversationRows.length === 0) {
      throw new NotFoundError('Conversa não encontrada');
    }

    const { rows: catalogRows } = await client.query(
      `
        SELECT 1
        FROM classificacao_catalogo
        WHERE macro = $1
          AND item = $2
          AND ativo = TRUE
      `,
      [payload.macro, payload.item]
    );

    if (catalogRows.length === 0) {
      throw new ValidationError('Macro/Item não encontrados no catálogo ativo');
    }

    const insertResult = await client.query(
      `
        INSERT INTO conversa_classificacao (
          conversa_id,
          macro,
          item,
          origem,
          confianca,
          criado_por,
          criado_em
        )
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        RETURNING id, macro, item, origem, confianca, criado_por, criado_em
      `,
      [
        conversaId,
        payload.macro,
        payload.item,
        payload.origem,
        payload.confianca,
        usuario
      ]
    );

    await classificacaoService.upsertSnapshot(client, conversaId, {
      macro: payload.macro,
      item: payload.item,
      usuario
    });

    await client.query('COMMIT');

    await cacheService.invalidateConversa(conversaId);

    return res.json({
      ok: true,
      classificacao: {
        id: insertResult.rows[0].id,
        conversa_id: conversaId,
        macro: insertResult.rows[0].macro,
        item: insertResult.rows[0].item,
        origem: insertResult.rows[0].origem,
        confianca: insertResult.rows[0].confianca,
        criado_por: insertResult.rows[0].criado_por,
        criado_em: insertResult.rows[0].criado_em
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Erro ao aplicar classificação', {
      error: error.message,
      conversaId
    });
    return next(error);
  } finally {
    client.release();
  }
};

const getLatestClassification = async (req, res, next) => {
  const { id } = req.params;
  const conversaId = parseInt(id, 10);

  if (!id || Number.isNaN(conversaId)) {
    return next(new ValidationError('ID da conversa inválido'));
  }

  try {
    const latest = await classificacaoService.getLatestClassification(conversaId);
    const snapshotResult = await pool.query(
      `
        SELECT macro,
               item,
               classificado_por,
               classificado_em
        FROM conversas
        WHERE id = $1
      `,
      [conversaId]
    );

    const snapshotRow = snapshotResult.rows[0] || null;

    return res.json({
      conversa_id: conversaId,
      classificacao: latest,
      snapshot: snapshotRow
        ? {
            macro: snapshotRow.macro,
            item: snapshotRow.item,
            classificado_por: snapshotRow.classificado_por,
            classificado_em: snapshotRow.classificado_em
          }
        : null
    });
  } catch (error) {
    logger.error('Erro ao consultar última classificação', {
      error: error.message,
      conversaId
    });
    return next(error);
  }
};

const getMessageClassification = async (req, res, next) => {
  const { message_id: messageIdParam } = req.params;
  const parsedMessageId = parseInt(messageIdParam, 10);

  if (!messageIdParam || Number.isNaN(parsedMessageId)) {
    return next(new ValidationError('message_id inválido'));
  }

  try {
    const classificacao = await classificacaoService.getMessageClassification(parsedMessageId);

    return res.json({
      message_id: parsedMessageId,
      classificacao: classificacao
        ? {
            id: classificacao.id,
            message_id: classificacao.messageId,
            conversa_id: classificacao.conversaId,
            user_id: classificacao.userId,
            macro: classificacao.macro,
            item: classificacao.item,
            comentario: classificacao.comentario,
            created_at: classificacao.createdAt,
            updated_at: classificacao.updatedAt
          }
        : null
    });
  } catch (error) {
    logger.error('Erro ao carregar classificação de mensagem', {
      error: error.message,
      messageId: parsedMessageId
    });
    return next(error);
  }
};

const applyMessageClassification = async (req, res, next) => {
  if (!req.user?.id) {
    return next(new UnauthorizedError('Usuário não autenticado'));
  }

  let payload;

  try {
    payload = sanitizeMessageClassificationInput(req.body || {});
  } catch (validationError) {
    return next(validationError);
  }

  try {
    const classificacao = await classificacaoService.upsertMessageClassification({
      messageId: payload.messageId,
      conversaId: payload.conversaId,
      userId: req.user.id,
      macro: payload.macro,
      item: payload.item,
      comentario: payload.comentario
    });

    return res.status(201).json({
      ok: true,
      classificacao: {
        id: classificacao.id,
        message_id: classificacao.messageId,
        conversa_id: classificacao.conversaId,
        user_id: classificacao.userId,
        macro: classificacao.macro,
        item: classificacao.item,
        comentario: classificacao.comentario,
        created_at: classificacao.createdAt,
        updated_at: classificacao.updatedAt
      }
    });
  } catch (error) {
    logger.error('Erro ao aplicar classificação de mensagem', {
      error: error.message,
      messageId: payload.messageId,
      conversaId: payload.conversaId,
      userId: req.user.id
    });
    return next(error);
  }
};

module.exports = {
  list,
  create,
  update,
  toggle,
  remove,
  importCsv,
  exportCsv,
  getCatalog,
  getSuggestions,
  applyClassification,
  getLatestClassification,
  getMessageClassification,
  applyMessageClassification
};
