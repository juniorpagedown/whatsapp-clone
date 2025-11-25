#!/usr/bin/env node

/**
 * Script para sincronizar fotos de perfil de contatos e grupos da Evolution API
 * Busca e atualiza as fotos (avatars) que estão faltando no banco de dados
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

async function fetchContactPhoto(phone) {
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
        return contact.profilePicUrl || null;
    } catch (error) {
        return null;
    }
}

async function fetchGroupPhoto(groupId) {
    try {
        const response = await axios.get(
            `${EVOLUTION_API_URL}/group/findGroupInfo/${EVOLUTION_INSTANCE}`,
            {
                params: { groupJid: groupId },
                headers: { 'apikey': EVOLUTION_API_KEY },
                timeout: 10000
            }
        );

        const group = response?.data;
        return group?.profilePicUrl || group?.picture || null;
    } catch (error) {
        return null;
    }
}

function updateContactPhoto(phone, photoUrl) {
    const normalizedPhone = phone.replace(/\D/g, '');

    const updateQuery = `
        UPDATE contatos 
        SET profile_pic_url = '${photoUrl.replace(/'/g, "''")}',
            updated_at = NOW()
        WHERE phone = '${normalizedPhone}'
    `;

    executeSQL(updateQuery);
}

function updateGroupPhoto(groupId, photoUrl) {
    const updateQuery = `
        UPDATE grupos 
        SET avatar = '${photoUrl.replace(/'/g, "''")}',
            updated_at = NOW()
        WHERE group_id = '${groupId}'
    `;

    executeSQL(updateQuery);
}

async function syncContactPhotos() {
    console.log('\n📸 Sincronizando fotos de contatos...\n');

    // Buscar contatos sem foto
    const query = `
        SELECT phone, nome 
        FROM contatos 
        WHERE profile_pic_url IS NULL OR profile_pic_url = ''
        ORDER BY nome
        LIMIT 50
    `;

    const result = executeSQL(query);
    if (!result || result.length === 0) {
        console.log('✅ Todos os contatos já têm foto!\n');
        return 0;
    }

    const lines = result.split('\n');
    console.log(`📋 Encontrados ${lines.length} contato(s) sem foto:\n`);

    let updated = 0;
    let notFound = 0;

    for (const line of lines) {
        const [phone, name] = line.split('|');
        process.stdout.write(`   📞 ${name} (${phone})... `);

        const photoUrl = await fetchContactPhoto(phone);

        if (!photoUrl) {
            console.log('❌ Sem foto');
            notFound++;
        } else {
            updateContactPhoto(phone, photoUrl);
            console.log('✅ Atualizado!');
            updated++;
        }

        // Pequeno delay para não sobrecarregar a API
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`\n📊 Contatos: ${updated} atualizados, ${notFound} sem foto\n`);
    return updated;
}

async function syncGroupPhotos() {
    console.log('📸 Sincronizando fotos de grupos...\n');

    // Buscar grupos sem foto
    const query = `
        SELECT group_id, nome 
        FROM grupos 
        WHERE avatar IS NULL OR avatar = ''
        ORDER BY nome
        LIMIT 50
    `;

    const result = executeSQL(query);
    if (!result || result.length === 0) {
        console.log('✅ Todos os grupos já têm foto!\n');
        return 0;
    }

    const lines = result.split('\n');
    console.log(`📋 Encontrados ${lines.length} grupo(s) sem foto:\n`);

    let updated = 0;
    let notFound = 0;

    for (const line of lines) {
        const [groupId, name] = line.split('|');
        process.stdout.write(`   👥 ${name}... `);

        const photoUrl = await fetchGroupPhoto(groupId);

        if (!photoUrl) {
            console.log('❌ Sem foto');
            notFound++;
        } else {
            updateGroupPhoto(groupId, photoUrl);
            console.log('✅ Atualizado!');
            updated++;
        }

        // Pequeno delay para não sobrecarregar a API
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`\n📊 Grupos: ${updated} atualizados, ${notFound} sem foto\n`);
    return updated;
}

async function syncPhotos() {
    console.log('\n🔄 Sincronizando fotos de perfil da Evolution API...\n');
    console.log('═'.repeat(60));

    const contactsUpdated = await syncContactPhotos();
    const groupsUpdated = await syncGroupPhotos();

    console.log('═'.repeat(60));
    console.log(`\n✨ Processo concluído!`);
    console.log(`   📞 Contatos atualizados: ${contactsUpdated}`);
    console.log(`   👥 Grupos atualizados: ${groupsUpdated}`);
    console.log(`   📊 Total: ${contactsUpdated + groupsUpdated}\n`);

    if (contactsUpdated > 0 || groupsUpdated > 0) {
        // Limpar cache do Redis
        try {
            execSync('docker exec whatsapp-clone-redis-1 redis-cli FLUSHDB', { encoding: 'utf-8', stdio: 'ignore' });
            console.log('🧹 Cache do Redis limpo!\n');
        } catch (error) {
            console.log('⚠️  Não foi possível limpar o cache do Redis\n');
        }

        console.log('💡 Recarregue o frontend para ver as fotos!\n');
    }
}

syncPhotos().catch(error => {
    console.error('❌ Erro:', error.message);
    process.exit(1);
});
