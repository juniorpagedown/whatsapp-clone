#!/usr/bin/env node

/**
 * Script para atualizar múltiplos contatos de uma vez
 * Uso: node backend/bulk-update-contacts.js
 */

const { execSync } = require('child_process');

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

function updateContact(phone, newName) {
    try {
        const normalizedPhone = phone.replace(/\D/g, '');

        // Atualizar nome do contato
        const updateContactQuery = `UPDATE contatos SET nome = '${newName.replace(/'/g, "''")}', updated_at = NOW() WHERE phone = '${normalizedPhone}'`;
        executeSQL(updateContactQuery);

        // Atualizar metadata das conversas relacionadas
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
            // Conversa pode não existir, não é erro crítico
        }

        console.log(`✅ ${normalizedPhone} → ${newName}`);
    } catch (error) {
        console.error(`❌ Erro ao atualizar ${phone}:`, error.message);
    }
}

// Lista de contatos para atualizar
// Formato: [telefone, nome]
const contacts = [
    ['554140421212', 'Pneufree.com'],
    ['556291825886', 'NOME_AQUI'], // ← Substitua pelo nome correto
    // Adicione mais contatos aqui conforme necessário
];

console.log('\n🔄 Atualizando contatos em lote...\n');

contacts.forEach(([phone, name]) => {
    if (name === 'NOME_AQUI') {
        console.log(`⚠️  ${phone} → Pulado (defina o nome correto)`);
        return;
    }
    updateContact(phone, name);
});

console.log('\n✨ Processo concluído! Recarregue o frontend.\n');

// Limpar cache do Redis
try {
    execSync('docker exec whatsapp-clone-redis-1 redis-cli FLUSHDB', { encoding: 'utf-8' });
    console.log('🧹 Cache do Redis limpo!\n');
} catch (error) {
    console.log('⚠️  Não foi possível limpar o cache do Redis\n');
}
