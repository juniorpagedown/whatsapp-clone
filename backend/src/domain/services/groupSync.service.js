// domain/services/groupSync.service.js
const axios = require('axios');
const pool = require('../../infrastructure/database/postgres');
const logger = require('../../shared/config/logger.config');

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE;

let isSyncRunning = false;

const fetchGroupsFromEvolution = async () => {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE) {
    logger.warn('Group sync: Evolution API não configurada, ignorando sincronização');
    return [];
  }

  try {
    const response = await axios.get(
      `${EVOLUTION_API_URL}/group/fetchAllGroups/${EVOLUTION_INSTANCE}?getParticipants=false`,
      {
        headers: {
          apikey: EVOLUTION_API_KEY
        },
        timeout: 60000
      }
    );

    const groups = Array.isArray(response.data) ? response.data : [];
    logger.info('Group sync: grupos recebidos da Evolution API', { count: groups.length });
    return groups;
  } catch (error) {
    logger.error('Group sync: falha ao buscar grupos na Evolution API', {
      message: error.message
    });
    return [];
  }
};

const buildMetadataPayload = (group) => ({
  evolutionData: {
    subject: group.subject,
    size: group.size,
    creation: group.creation,
    pictureUrl: group.pictureUrl,
    isCommunity: group.isCommunity,
    announce: group.announce,
    restrict: group.restrict,
    owner: group.owner,
    subjectOwner: group.subjectOwner,
    subjectTime: group.subjectTime,
    desc: group.desc,
    descId: group.descId,
    syncedAt: new Date().toISOString()
  }
});

const upsertGroup = async (client, group, { forceUpdateNames = false } = {}) => {
  const groupId = group.id;
  const groupName = group.subject || groupId;
  const metadataPayload = buildMetadataPayload(group);

  await client.query(
    `
      INSERT INTO grupos (group_id, nome, descricao, avatar, participant_count, metadata, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW(), NOW())
      ON CONFLICT (group_id)
      DO UPDATE SET
        nome = CASE
          WHEN $7 = TRUE THEN EXCLUDED.nome
          WHEN grupos.nome = grupos.group_id OR grupos.nome IS NULL OR LENGTH(TRIM(grupos.nome)) = 0 THEN EXCLUDED.nome
          ELSE grupos.nome
        END,
        descricao = COALESCE(EXCLUDED.descricao, grupos.descricao),
        participant_count = COALESCE(EXCLUDED.participant_count, grupos.participant_count),
        avatar = COALESCE(EXCLUDED.avatar, grupos.avatar),
        metadata = jsonb_set(
          COALESCE(grupos.metadata, '{}'::jsonb),
          '{evolutionData}',
          EXCLUDED.metadata->'evolutionData',
          true
        ),
        updated_at = NOW()
    `,
    [
      groupId,
      groupName,
      group.desc || null,
      group.pictureUrl || null,
      group.size || null,
      JSON.stringify(metadataPayload),
      forceUpdateNames
    ]
  );
};

const syncGroupsFromEvolution = async ({ forceUpdateNames = false } = {}) => {
  if (isSyncRunning) {
    logger.warn('Group sync: execução já em andamento, ignorando nova chamada');
    return;
  }

  isSyncRunning = true;
  logger.info('Group sync: iniciando sincronização de grupos', { forceUpdateNames });

  const groups = await fetchGroupsFromEvolution();
  if (!groups.length) {
    isSyncRunning = false;
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const group of groups) {
      try {
        await upsertGroup(client, group, { forceUpdateNames });
      } catch (error) {
        logger.error('Group sync: falha ao atualizar grupo', {
          groupId: group.id,
          message: error.message
        });
      }
    }

    await client.query('COMMIT');
    logger.info('Group sync: sincronização concluída com sucesso');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Group sync: erro na sincronização de grupos', { message: error.message });
  } finally {
    client.release();
    isSyncRunning = false;
  }
};

module.exports = {
  syncGroupsFromEvolution
};
