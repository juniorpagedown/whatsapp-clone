#!/usr/bin/env node

/**
 * Script para atualizar contatos considerando a instância
 * Uso: node backend/update-contact-v2.js <telefone> <nome>
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
        // Normalizar telefone (remover caracteres não numéricos)
        const normalizedPhone = phone.replace(/\D/g, '');

        console.log(`\n🔍 Buscando contato: ${phone} (normalizado: ${normalizedPhone})`);

        // Buscar contato existente (considerando todas as instâncias)
        const checkQuery = `
            SELECT c.id, c.phone, c.nome, c.instance_id, wi.instance_key
            FROM contatos c
            LEFT JOIN whatsapp_instances wi ON wi.id = c.instance_id
            WHERE c.phone = '${normalizedPhone}'
        `;
        const checkResult = executeSQL(checkQuery);

        if (!checkResult || checkResult.length === 0) {
            console.log(`❌ Contato não encontrado: ${phone}`);
            return;
        }

        const lines = checkResult.split('\n');
        console.log(`\n📞 Encontrados ${lines.length} registro(s):\n`);

        lines.forEach((line, index) => {
            const [id, contactPhone, currentName, instanceId, instanceKey] = line.split('|');
            console.log(`   ${index + 1}. ID: ${id}`);
            console.log(`      Telefone: ${contactPhone}`);
            console.log(`      Nome atual: ${currentName}`);
            console.log(`      Instance: ${instanceKey || 'N/A'} (${instanceId})`);
            console.log(`      Novo nome: ${newName}\n`);
        });

        // Atualizar todos os registros desse telefone
        const updateContactQuery = `
            UPDATE contatos 
            SET nome = '${newName.replace(/'/g, "''")}', 
                updated_at = NOW() 
            WHERE phone = '${normalizedPhone}'
        `;
        executeSQL(updateContactQuery);

        console.log(`✅ Contato(s) atualizado(s) com sucesso!`);

        // Atualizar metadata das conversas relacionadas (chatName)
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
            RETURNING id
        `.trim();

        try {
            const conversationResult = executeSQL(updateConversationQuery);
            if (conversationResult && conversationResult.length > 0) {
                const convIds = conversationResult.split('\n');
                console.log(`✅ ${convIds.length} conversa(s) atualizada(s)!`);
                console.log(`   Chat ID: ${chatId}`);
            } else {
                console.log(`ℹ️  Nenhuma conversa encontrada para este contato`);
            }
        } catch (error) {
            console.log(`ℹ️  Nenhuma conversa encontrada para este contato`);
        }

        // Limpar cache do Redis
        try {
            execSync('docker exec whatsapp-clone-redis-1 redis-cli FLUSHDB', { encoding: 'utf-8', stdio: 'ignore' });
            console.log(`\n🧹 Cache do Redis limpo!`);
        } catch (error) {
            console.log(`\n⚠️  Não foi possível limpar o cache do Redis`);
        }

        console.log(`\n✨ Processo concluído! Recarregue o frontend para ver as mudanças.\n`);

    } catch (error) {
        console.error('❌ Erro ao atualizar contato:', error.message);
        process.exit(1);
    }
}

// Uso: node update-contact-v2.js "+55 62 9182-5886" "Joao Carlos"
const args = process.argv.slice(2);

if (args.length < 2) {
    console.log('Uso: node update-contact-v2.js <telefone> <novo-nome>');
    console.log('Exemplo: node update-contact-v2.js "+55 62 9182-5886" "Joao Carlos"');
    console.log('Exemplo: node update-contact-v2.js "554140421212" "Pneufree.com"');
    process.exit(1);
}

const [phone, newName] = args;
updateContact(phone, newName);
