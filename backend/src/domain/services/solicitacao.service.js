// domain/services/solicitacao.service.js
const pool = require('../../infrastructure/database/postgres');
const logger = require('../../shared/config/logger.config');
const { AppError } = require('../../shared/errors/AppError');

/**
 * Serviço para gerenciar solicitações com classificação e SLA
 */

/**
 * Cria uma nova solicitação a partir de uma mensagem
 * @param {Object} params - Parâmetros da solicitação
 * @returns {Promise<Object>} Solicitação criada
 */
async function criarSolicitacao({
  conversaId,
  mensagemOrigemId,
  contatoId,
  titulo,
  descricao,
  subcategoriaId,
  macroCategoriaId = null,
  prioridade = 'normal',
  classificacaoAutomatica = false,
  confidenceScore = null,
  usuarioResponsavelId = null,
  tags = [],
  metadata = {}
}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Validar subcategoria existe e está ativa
    const subcatResult = await client.query(
      `SELECT sc.id, sc.macro_categoria_id, sc.sla_horas, sc.sla_horas_criticas, sc.is_active
       FROM subcategorias sc
       WHERE sc.id = $1 AND sc.is_active = true`,
      [subcategoriaId]
    );

    if (subcatResult.rows.length === 0) {
      throw new AppError('Subcategoria não encontrada ou inativa', 400);
    }

    const subcategoria = subcatResult.rows[0];

    // Se macro_categoria_id não foi fornecido, usar da subcategoria
    const finalMacroCategoriaId = macroCategoriaId || subcategoria.macro_categoria_id;

    // Inserir solicitação (trigger calculará sla_due_at automaticamente)
    const solicitacaoResult = await client.query(
      `INSERT INTO solicitacoes (
        conversa_id,
        mensagem_origem_id,
        contato_id,
        usuario_responsavel_id,
        macro_categoria_id,
        subcategoria_id,
        titulo,
        descricao,
        prioridade,
        classificacao_automatica,
        confidence_score,
        tags,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
      RETURNING *`,
      [
        conversaId,
        mensagemOrigemId,
        contatoId,
        usuarioResponsavelId,
        finalMacroCategoriaId,
        subcategoriaId,
        titulo,
        descricao,
        prioridade,
        classificacaoAutomatica,
        confidenceScore,
        tags,
        JSON.stringify(metadata)
      ]
    );

    const solicitacao = solicitacaoResult.rows[0];

    await client.query('COMMIT');

    logger.info('Solicitação criada com sucesso', {
      solicitacaoId: solicitacao.id,
      conversaId,
      subcategoriaId,
      sla_due_at: solicitacao.sla_due_at
    });

    return await buscarSolicitacaoCompleta(solicitacao.id);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Erro ao criar solicitação', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Classifica automaticamente uma mensagem usando IA
 * @param {string} texto - Texto da mensagem
 * @param {Object} contexto - Contexto adicional
 * @returns {Promise<Object>} Classificação sugerida
 */
async function classificarMensagemComIA(texto, contexto = {}) {
  const client = await pool.connect();

  try {
    // Buscar keywords de todas as subcategorias ativas
    const result = await client.query(
      `SELECT
        sc.id,
        sc.nome,
        sc.keywords,
        sc.macro_categoria_id,
        mc.nome as macro_categoria_nome
       FROM subcategorias sc
       JOIN macro_categorias mc ON mc.id = sc.macro_categoria_id
       WHERE sc.is_active = true AND mc.is_active = true`
    );

    const subcategorias = result.rows;
    const textoLower = texto.toLowerCase();

    // Calcular score de match para cada subcategoria
    const scores = subcategorias.map(subcat => {
      let score = 0;
      let matchedKeywords = [];

      if (subcat.keywords && Array.isArray(subcat.keywords)) {
        subcat.keywords.forEach(keyword => {
          if (textoLower.includes(keyword.toLowerCase())) {
            score += 1;
            matchedKeywords.push(keyword);
          }
        });
      }

      return {
        subcategoria_id: subcat.id,
        subcategoria_nome: subcat.nome,
        macro_categoria_id: subcat.macro_categoria_id,
        macro_categoria_nome: subcat.macro_categoria_nome,
        score,
        matchedKeywords,
        confidence: score > 0 ? Math.min(score / 5, 1) : 0
      };
    });

    // Ordenar por score e pegar o melhor
    scores.sort((a, b) => b.score - a.score);

    const melhorMatch = scores[0];

    // Se não teve match, retornar categoria padrão (Informações)
    if (melhorMatch.score === 0) {
      const defaultResult = await client.query(
        `SELECT sc.id, sc.nome, sc.macro_categoria_id, mc.nome as macro_categoria_nome
         FROM subcategorias sc
         JOIN macro_categorias mc ON mc.id = sc.macro_categoria_id
         WHERE mc.nome = 'Informações'
         LIMIT 1`
      );

      if (defaultResult.rows.length > 0) {
        const def = defaultResult.rows[0];
        return {
          subcategoria_id: def.id,
          subcategoria_nome: def.nome,
          macro_categoria_id: def.macro_categoria_id,
          macro_categoria_nome: def.macro_categoria_nome,
          confidence: 0.3,
          matchedKeywords: [],
          recomendacao: 'Classificação padrão - nenhuma keyword correspondeu'
        };
      }
    }

    return {
      ...melhorMatch,
      alternativas: scores.slice(1, 4).filter(s => s.score > 0)
    };
  } catch (error) {
    logger.error('Erro ao classificar mensagem com IA', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Atualiza status de uma solicitação
 * @param {number} solicitacaoId - ID da solicitação
 * @param {string} novoStatus - Novo status
 * @param {number} usuarioId - ID do usuário que está atualizando
 * @param {string} observacao - Observação opcional
 * @returns {Promise<Object>} Solicitação atualizada
 */
async function atualizarStatusSolicitacao(solicitacaoId, novoStatus, usuarioId, observacao = null) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Buscar solicitação atual
    const currentResult = await client.query(
      'SELECT * FROM solicitacoes WHERE id = $1',
      [solicitacaoId]
    );

    if (currentResult.rows.length === 0) {
      throw new AppError('Solicitação não encontrada', 404);
    }

    const current = currentResult.rows[0];

    // Validar transição de status
    const transicoesValidas = {
      'aberta': ['em_andamento', 'aguardando_cliente', 'cancelada'],
      'em_andamento': ['aguardando_cliente', 'resolvida', 'cancelada'],
      'aguardando_cliente': ['em_andamento', 'resolvida', 'cancelada'],
      'resolvida': ['fechada', 'em_andamento'], // permite reabrir
      'fechada': [], // não pode mudar de fechada
      'cancelada': []
    };

    if (!transicoesValidas[current.status].includes(novoStatus)) {
      throw new AppError(
        `Transição de '${current.status}' para '${novoStatus}' não é permitida`,
        400
      );
    }

    // Atualizar status
    const updateData = {
      status: novoStatus
    };

    // Se mudou para aguardando_cliente, pausar SLA por 24h
    if (novoStatus === 'aguardando_cliente') {
      updateData.sla_pausado_ate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }

    // Se voltou para em_andamento, remover pausa
    if (novoStatus === 'em_andamento' && current.status === 'aguardando_cliente') {
      updateData.sla_pausado_ate = null;

      // Calcular tempo de pausa e acumular
      if (current.sla_pausado_ate) {
        const pausaMinutos = Math.floor(
          (new Date() - new Date(current.sla_pausado_ate)) / (1000 * 60)
        );
        updateData.tempo_pausa_total = current.tempo_pausa_total + pausaMinutos;
      }
    }

    // Se foi resolvida, marcar quem resolveu
    if (novoStatus === 'resolvida') {
      updateData.resolvido_por_id = usuarioId;
    }

    // Construir query dinâmica
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    Object.entries(updateData).forEach(([key, value]) => {
      setClauses.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    });

    values.push(solicitacaoId);

    await client.query(
      `UPDATE solicitacoes
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex}`,
      values
    );

    // Registrar no histórico manualmente com observação
    if (observacao) {
      await client.query(
        `INSERT INTO historico_solicitacoes (
          solicitacao_id, usuario_id, acao, status_anterior, status_novo, observacao
        ) VALUES ($1, $2, 'status_alterado', $3, $4, $5)`,
        [solicitacaoId, usuarioId, current.status, novoStatus, observacao]
      );
    }

    await client.query('COMMIT');

    logger.info('Status da solicitação atualizado', {
      solicitacaoId,
      statusAnterior: current.status,
      novoStatus,
      usuarioId
    });

    return await buscarSolicitacaoCompleta(solicitacaoId);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Erro ao atualizar status', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Busca solicitação com todas as informações (usando view)
 * @param {number} solicitacaoId - ID da solicitação
 * @returns {Promise<Object>} Solicitação completa
 */
async function buscarSolicitacaoCompleta(solicitacaoId) {
  const result = await pool.query(
    'SELECT * FROM vw_solicitacoes_completas WHERE id = $1',
    [solicitacaoId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Solicitação não encontrada', 404);
  }

  return result.rows[0];
}

/**
 * Lista solicitações com filtros
 * @param {Object} filtros - Filtros de busca
 * @returns {Promise<Array>} Lista de solicitações
 */
async function listarSolicitacoes({
  status = null,
  prioridade = null,
  macroCategoriaId = null,
  subcategoriaId = null,
  responsavelId = null,
  contatoId = null,
  slaStatus = null,
  limit = 50,
  offset = 0
}) {
  const whereClauses = [];
  const values = [];
  let paramIndex = 1;

  if (status) {
    whereClauses.push(`status = $${paramIndex}`);
    values.push(status);
    paramIndex++;
  }

  if (prioridade) {
    whereClauses.push(`prioridade = $${paramIndex}`);
    values.push(prioridade);
    paramIndex++;
  }

  if (macroCategoriaId) {
    whereClauses.push(`macro_categoria_id = $${paramIndex}`);
    values.push(macroCategoriaId);
    paramIndex++;
  }

  if (subcategoriaId) {
    whereClauses.push(`subcategoria_id = $${paramIndex}`);
    values.push(subcategoriaId);
    paramIndex++;
  }

  if (responsavelId) {
    whereClauses.push(`usuario_responsavel_id = $${paramIndex}`);
    values.push(responsavelId);
    paramIndex++;
  }

  if (contatoId) {
    whereClauses.push(`contato_id = $${paramIndex}`);
    values.push(contatoId);
    paramIndex++;
  }

  if (slaStatus) {
    whereClauses.push(`sla_status = $${paramIndex}`);
    values.push(slaStatus);
    paramIndex++;
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  values.push(limit, offset);

  const query = `
    SELECT *
    FROM vw_solicitacoes_completas
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  const result = await pool.query(query, values);

  // Contar total
  const countQuery = `
    SELECT COUNT(*) as total
    FROM solicitacoes
    ${whereClause}
  `;

  const countResult = await pool.query(countQuery, values.slice(0, -2));

  return {
    solicitacoes: result.rows,
    total: parseInt(countResult.rows[0].total),
    limit,
    offset
  };
}

/**
 * Atribui solicitação a um usuário
 * @param {number} solicitacaoId - ID da solicitação
 * @param {number} usuarioId - ID do usuário
 * @returns {Promise<Object>} Solicitação atualizada
 */
async function atribuirSolicitacao(solicitacaoId, usuarioId) {
  const result = await pool.query(
    `UPDATE solicitacoes
     SET usuario_responsavel_id = $2,
         status = CASE WHEN status = 'aberta' THEN 'em_andamento' ELSE status END
     WHERE id = $1
     RETURNING *`,
    [solicitacaoId, usuarioId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Solicitação não encontrada', 404);
  }

  logger.info('Solicitação atribuída', { solicitacaoId, usuarioId });

  return await buscarSolicitacaoCompleta(solicitacaoId);
}

/**
 * Busca solicitações com SLA em risco
 * @returns {Promise<Array>} Solicitações em risco
 */
async function buscarSolicitacoesEmRisco() {
  const result = await pool.query('SELECT * FROM vw_sla_em_risco');
  return result.rows;
}

/**
 * Reclassifica uma solicitação
 * @param {number} solicitacaoId - ID da solicitação
 * @param {number} novaSubcategoriaId - Nova subcategoria
 * @param {number} usuarioId - Usuário que está reclassificando
 * @returns {Promise<Object>} Solicitação atualizada
 */
async function reclassificarSolicitacao(solicitacaoId, novaSubcategoriaId, usuarioId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Buscar nova subcategoria e sua macro categoria
    const subcatResult = await client.query(
      'SELECT macro_categoria_id FROM subcategorias WHERE id = $1 AND is_active = true',
      [novaSubcategoriaId]
    );

    if (subcatResult.rows.length === 0) {
      throw new AppError('Subcategoria não encontrada ou inativa', 400);
    }

    const novoMacroCategoriaId = subcatResult.rows[0].macro_categoria_id;

    // Atualizar solicitação
    await client.query(
      `UPDATE solicitacoes
       SET subcategoria_id = $2,
           macro_categoria_id = $3,
           classificacao_automatica = false
       WHERE id = $1`,
      [solicitacaoId, novaSubcategoriaId, novoMacroCategoriaId]
    );

    await client.query('COMMIT');

    logger.info('Solicitação reclassificada', { solicitacaoId, novaSubcategoriaId, usuarioId });

    return await buscarSolicitacaoCompleta(solicitacaoId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  criarSolicitacao,
  classificarMensagemComIA,
  atualizarStatusSolicitacao,
  buscarSolicitacaoCompleta,
  listarSolicitacoes,
  atribuirSolicitacao,
  buscarSolicitacoesEmRisco,
  reclassificarSolicitacao
};
