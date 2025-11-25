const axios = require('axios');
const logger = require('../../shared/config/logger.config');

const { EVOLUTION_API_URL, EVOLUTION_API_KEY } = process.env;
const hasEvolutionIntegration = Boolean(EVOLUTION_API_URL && EVOLUTION_API_KEY);

const evolutionHttp = hasEvolutionIntegration
    ? axios.create({
        baseURL: EVOLUTION_API_URL,
        headers: { apikey: EVOLUTION_API_KEY },
        timeout: 12000
    })
    : null;

const contactCache = new Map();

const pickFirstString = (...values) => {
    for (const value of values) {
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed.length > 0) return trimmed;
        }
    }
    return null;
};

const pickContactName = (payload) => pickFirstString(
    payload?.name,
    payload?.pushname,
    payload?.pushName,
    payload?.contactName,
    payload?.formattedName,
    payload?.notifyName,
    payload?.shortName,
    payload?.displayName,
    payload?.profileName,
    payload?.profile?.name
);

const pickContactAvatar = (payload) => pickFirstString(
    payload?.profilePicUrl,
    payload?.profilePicURL,
    payload?.profilePicture,
    payload?.profilePictureUrl,
    payload?.photoUrl,
    payload?.avatar,
    payload?.picture,
    payload?.image
);

const normalizePhoneDigits = (value) => {
    if (!value) return null;
    const digits = String(value).replace(/\D/g, '');
    return digits.length ? digits : null;
};

const safeJson = (data) => {
    try {
        return data ? JSON.stringify(data) : null;
    } catch (error) {
        logger.warn('Não foi possível serializar metadata', { error: error.message });
        return null;
    }
};

const fetchEvolutionContact = async (phone, instanceKey) => {
    if (!hasEvolutionIntegration || !instanceKey) return null;

    const normalized = normalizePhoneDigits(phone);
    if (!normalized) return null;

    const cacheKey = `${instanceKey}:${normalized}`;

    if (contactCache.has(cacheKey)) return contactCache.get(cacheKey);

    try {
        const remoteJid = `${normalized}@s.whatsapp.net`;
        const response = await evolutionHttp.post(
            `/chat/findContacts/${instanceKey}`,
            {
                where: { remoteJid }
            }
        );

        const contacts = response?.data;
        if (!Array.isArray(contacts) || contacts.length === 0) {
            contactCache.set(cacheKey, null);
            return null;
        }

        const contact = contacts[0];
        const name = pickContactName(contact);
        const avatar = pickContactAvatar(contact);

        const resolved = {
            phone: normalized,
            name: name || null,
            avatar: avatar || null,
            raw: contact
        };

        contactCache.set(cacheKey, resolved);
        return resolved;
    } catch (error) {
        const status = error?.response?.status;
        const logLevel = status && status < 500 ? 'debug' : 'warn';
        logger[logLevel]('Evolution contact lookup falhou', {
            phone: normalized,
            status,
            message: error.message
        });
        contactCache.set(cacheKey, null);
        return null;
    }
};

const ensureContact = async (client, { phone, nome, profilePicUrl, metadata, forceSync = false, instanceId, instanceKey }) => {
    if (!phone || !instanceId) return null;

    let resolvedName = nome;
    let resolvedAvatar = profilePicUrl;
    let mergedMetadata = metadata || {};

    try {
        if (!resolvedName || resolvedName === phone || forceSync) {
            const remote = await fetchEvolutionContact(phone, instanceKey);
            if (remote) {
                resolvedName = pickFirstString(resolvedName, remote.name, phone);
                resolvedAvatar = resolvedAvatar || remote.avatar || null;
                mergedMetadata = {
                    ...mergedMetadata,
                    evolution: remote.raw || remote
                };
            }
        }
    } catch (error) {
        logger.warn('Falha ao obter contato na Evolution API', { phone, message: error.message });
    }

    if (!resolvedName) resolvedName = phone;

    const result = await client.query(
        `
      INSERT INTO contatos (phone, nome, profile_pic_url, metadata, updated_at, last_interaction, instance_id)
      VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW(), $5)
      ON CONFLICT (instance_id, phone)
      DO UPDATE SET
        nome = CASE
          WHEN EXCLUDED.nome IS NOT NULL AND EXCLUDED.nome <> '' THEN EXCLUDED.nome
          ELSE contatos.nome
        END,
        profile_pic_url = COALESCE(EXCLUDED.profile_pic_url, contatos.profile_pic_url),
        metadata = COALESCE(EXCLUDED.metadata, contatos.metadata),
        updated_at = NOW(),
        last_interaction = NOW()
      RETURNING id
    `,
        [
            phone,
            resolvedName,
            resolvedAvatar || null,
            safeJson(mergedMetadata),
            instanceId
        ]
    );

    return result.rows[0]?.id || null;
};

module.exports = {
    ensureContact,
    fetchEvolutionContact,
    pickContactName,
    pickContactAvatar,
    normalizePhoneDigits,
    evolutionHttp // Exporting for groupSync service if needed
};
