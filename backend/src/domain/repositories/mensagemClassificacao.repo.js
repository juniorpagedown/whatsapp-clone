// domain/repositories/mensagemClassificacao.repo.js
const pool = require('../../infrastructure/database/postgres');

/**
 * Normaliza a linha retornada pelo banco para o formato esperado na API.
 * @param {import('pg').QueryResultRow | null} row
 * @returns {object|null}
 */
const mapMensagemClassificacaoRow = (row) => {
  if (!row) {
    return null;
  }

  const confianca = typeof row.confianca === 'number'
    ? row.confianca
    : row.confianca !== null && typeof row.confianca !== 'undefined'
      ? parseFloat(row.confianca)
      : null;
  const mensagemId = row.mensagem_id;
  const conversaId = row.conversa_id || null;
  const userId = row.criado_por || null;
  const observacoes = row.observacoes || null;

  return {
    id: row.id,
    mensagem_id: mensagemId,
    message_id: mensagemId,
    conversa_id: conversaId,
    macro: row.macro,
    item: row.item,
    origem: row.origem,
    confianca,
    observacoes,
    comentario: observacoes,
    criado_por: userId,
    user_id: userId,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
};

const BASE_SELECT = `
  SELECT mc.id,
         mc.mensagem_id,
         mc.macro,
         mc.item,
         mc.origem,
         mc.confianca,
         mc.observacoes,
         mc.criado_por,
         mc.created_at,
         mc.updated_at,
         m.conversa_id
    FROM mensagem_classificacao mc
    LEFT JOIN mensagens m
           ON m.id = mc.mensagem_id
`;

/**
 * Insere ou atualiza a classificação de uma mensagem.
 * @param {object} params
 * @param {number} params.mensagemId
 * @param {string} params.macro
 * @param {string|null} params.item
 * @param {string} params.origem
 * @param {number|null} params.confianca
 * @param {string|null} params.observacoes
 * @param {number|null} params.criadoPor
 * @param {import('pg').Pool | import('pg').PoolClient} [db=pool]
 * @returns {Promise<object>}
 */
const upsert = async (
  {
    mensagemId,
    macro,
    item,
    origem,
    confianca,
    observacoes,
    criadoPor
  },
  db = pool
) => {
  await db.query(
    `
      INSERT INTO mensagem_classificacao (
        mensagem_id,
        macro,
        item,
        origem,
        confianca,
        observacoes,
        criado_por
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (mensagem_id)
      DO UPDATE
         SET macro = EXCLUDED.macro,
             item = EXCLUDED.item,
             origem = EXCLUDED.origem,
             confianca = EXCLUDED.confianca,
             observacoes = EXCLUDED.observacoes,
             criado_por = EXCLUDED.criado_por,
             updated_at = NOW()
    `,
    [
      mensagemId,
      macro,
      item,
      origem,
      confianca,
      observacoes,
      criadoPor
    ]
  );

  return selectByMensagem(mensagemId, db);
};

/**
 * Busca classificação ativa para uma mensagem.
 * @param {number} mensagemId
 * @param {import('pg').Pool | import('pg').PoolClient} [db=pool]
 * @returns {Promise<object|null>}
 */
const selectByMensagem = async (mensagemId, db = pool) => {
  const { rows } = await db.query(
    `${BASE_SELECT}
     WHERE mc.mensagem_id = $1
     LIMIT 1`,
    [mensagemId]
  );

  return mapMensagemClassificacaoRow(rows[0] || null);
};

/**
 * Remove classificação associada a uma mensagem.
 * @param {number} mensagemId
 * @param {import('pg').Pool | import('pg').PoolClient} [db=pool]
 * @returns {Promise<object|null>}
 */
const deleteByMensagem = async (mensagemId, db = pool) => {
  const { rows } = await db.query(
    `
      DELETE FROM mensagem_classificacao
       WHERE mensagem_id = $1
    RETURNING id,
              mensagem_id,
              macro,
              item,
              origem,
              confianca,
              observacoes,
              criado_por,
              created_at,
              updated_at
    `,
    [mensagemId]
  );

  const deleted = rows[0] || null;
  if (!deleted) {
    return null;
  }

  return mapMensagemClassificacaoRow({
    ...deleted,
    conversa_id: null
  });
};

module.exports = {
  upsert,
  selectByMensagem,
  deleteByMensagem
};
