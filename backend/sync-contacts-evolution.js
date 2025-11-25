#!/usr/bin/env node

/**
 * Script para sincronizar nomes de contatos da Evolution API
 * Busca contatos com nome incorreto e atualiza com dados da Evolution API
 */

const axios = require('axios');
const { execSync } = require('child_process');

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'junior';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'junior';

// Função auxiliar para executar comandos SQL via Docker
function executeSQL(sql) {
    const command = `docker exec whatsapp-clone-postgres-1 psql -U whatsapp_user -d whatsapp_clone -t -A -c "${sql.replace(/"/g, '\\"')}"`;

    try {
        const result = execSync(command, { encoding: 'utf-8' });
        return result.trim();
    } catch (error) {
        throw new Error(`SQL Error: ${error.message}`);
    }
}

async function fetchContactFromEvolution(phone) {
    const normalizedPhone = phone.replace(/\D/g, '');
    const remoteJid = `${normalizedPhone}@s.whatsapp.net`;

    try {
        const response = await axios.post(
            `${EVOLUTION_API_URL}/chat/findContacts/${EVOLUTION_INSTANCE}`,
            { where: { remoteJid } },
            { headers: { 'apikey': EVOLUTION_API_KEY }, timeout: 10000 }
        );

        const contacts = response?.data;
        if (!Array.isArray(contacts) || contacts.length === 0) {
            return null;
        }

        const contact = contacts[0];
        return {
            phone: normalizedPhone,
            pushName: contact.pushName || '',
            profilePicUrl: contact.profilePicUrl || null
        };
    } catch (error) {
        console.log(`   ⚠️  Erro ao buscar na Evolution API: ${error.message}`);
        return null;
    }
}

function updateContact(phone, newName, profilePicUrl = null) {
    const normalizedPhone = phone.replace(/\D/g, '');

    // Atualizar nome do contato
    let updateContactQuery = `
        UPDATE contatos 
        SET nome = '${newName.replace(/'/g, "''")}', 
            updated_at = NOW()
    `;

    if (profilePicUrl) {
        updateContactQuery += `, profile_pic_url = '${profilePicUrl.replace(/'/g, "''")}'`;
    }

    updateContactQuery += ` WHERE phone = '${normalizedPhone}'`;

    executeSQL(updateContactQuery);

    // Atualizar metadata das conversas
    const chatId = `${normalizedPhone}@s.whatsapp.net`;
    const updateConversationQuery = `
        UPDATE conversas
        SET metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{chatName}',
            '"${newName.replace(/"/g, '\\"')}"'::jsonb
        ),
        updated_at = NOW()
        WHERE chat_id = '${chatId}'
    `.trim();

    try {
        executeSQL(updateConversationQuery);
    } catch (error) {
        // Conversa pode não existir
    }
}

async function syncContacts() {
    console.log('\n🔄 Sincronizando contatos com Evolution API...\n');

    // Buscar contatos com nome incorreto
    const query = `
        SELECT phone, nome 
        FROM contatos 
        WHERE nome = phone OR nome LIKE '%Junior - TI - BaladAPP%'
        ORDER BY phone
    `;

    const result = executeSQL(query);
    if (!result || result.length === 0) {
        console.log('✅ Nenhum contato com nome incorreto encontrado!\n');
        return;
    }

    const lines = result.split('\n');
    console.log(`📋 Encontrados ${lines.length} contato(s) para sincronizar:\n`);

    let updated = 0;
    let skipped = 0;
    let notFound = 0;

    for (const line of lines) {
        const [phone, currentName] = line.split('|');
        console.log(`📞 ${phone} (${currentName})`);

        const evolutionContact = await fetchContactFromEvolution(phone);

        if (!evolutionContact) {
            console.log(`   ❌ Não encontrado na Evolution API\n`);
            notFound++;
            continue;
        }

        if (!evolutionContact.pushName || evolutionContact.pushName === phone) {
            console.log(`   ⚠️  Sem nome no WhatsApp (pushName vazio ou igual ao telefone)\n`);
            skipped++;
            continue;
        }

        console.log(`   ✅ Encontrado: "${evolutionContact.pushName}"`);
        updateContact(phone, evolutionContact.pushName, evolutionContact.profilePicUrl);
        console.log(`   ✅ Atualizado!\n`);
        updated++;

        // Pequeno delay para não sobrecarregar a API
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('═'.repeat(60));
    console.log(`\n📊 Resumo:`);
    console.log(`   ✅ Atualizados: ${updated}`);
    console.log(`   ⚠️  Sem nome no WhatsApp: ${skipped}`);
    console.log(`   ❌ Não encontrados: ${notFound}`);
    console.log(`   📋 Total: ${lines.length}\n`);

    if (updated > 0) {
        // Limpar cache do Redis
        try {
            execSync('docker exec whatsapp-clone-redis-1 redis-cli FLUSHDB', { encoding: 'utf-8', stdio: 'ignore' });
            console.log('🧹 Cache do Redis limpo!\n');
        } catch (error) {
            console.log('⚠️  Não foi possível limpar o cache do Redis\n');
        }

        console.log('✨ Processo concluído! Recarregue o frontend.\n');
    }
}

syncContacts().catch(error => {
    console.error('❌ Erro:', error.message);
    process.exit(1);
});
