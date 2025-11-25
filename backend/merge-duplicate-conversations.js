#!/usr/bin/env node

/**
 * Script para mesclar conversas duplicadas do mesmo contato
 * Quando o WhatsApp migra de formato antigo (@s.whatsapp.net) para LID (@lid)
 * 
 * Uso: node backend/merge-duplicate-conversations.js <chat_id_antigo> <chat_id_novo>
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

function mergeConversations(oldChatId, newChatId) {
    try {
        console.log('\n🔍 Verificando conversas...\n');

        // Buscar informações das conversas
        const query = `
            SELECT 
                c.id, 
                c.chat_id, 
                c.contato_id,
                ct.nome,
                COUNT(m.id) as total_mensagens,
                MIN(m.timestamp) as primeira_msg,
                MAX(m.timestamp) as ultima_msg
            FROM conversas c
            LEFT JOIN mensagens m ON m.conversa_id = c.id
            LEFT JOIN contatos ct ON ct.id = c.contato_id
            WHERE c.chat_id IN ('${oldChatId}', '${newChatId}')
            GROUP BY c.id, c.chat_id, c.contato_id, ct.nome
            ORDER BY c.chat_id
        `;

        const result = executeSQL(query);
        const lines = result.split('\n').filter(Boolean);

        if (lines.length !== 2) {
            console.log('❌ Erro: Esperava encontrar exatamente 2 conversas');
            console.log(`   Encontradas: ${lines.length}`);
            return;
        }

        const [conv1, conv2] = lines.map(line => {
            const [id, chatId, contatoId, nome, totalMsg, primeiraMsg, ultimaMsg] = line.split('|');
            return {
                id: parseInt(id),
                chatId,
                contatoId: parseInt(contatoId),
                nome,
                totalMsg: parseInt(totalMsg),
                primeiraMsg,
                ultimaMsg
            };
        });

        // Determinar qual é a conversa principal (mais antiga ou com mais mensagens)
        let mainConv, duplicateConv;

        if (conv1.totalMsg >= conv2.totalMsg) {
            mainConv = conv1;
            duplicateConv = conv2;
        } else {
            mainConv = conv2;
            duplicateConv = conv1;
        }

        console.log('📋 Conversas encontradas:\n');
        console.log(`   Principal (manter):`);
        console.log(`      ID: ${mainConv.id}`);
        console.log(`      Chat ID: ${mainConv.chatId}`);
        console.log(`      Contato: ${mainConv.nome} (ID: ${mainConv.contatoId})`);
        console.log(`      Mensagens: ${mainConv.totalMsg}`);
        console.log(`      Período: ${mainConv.primeiraMsg || 'N/A'} - ${mainConv.ultimaMsg || 'N/A'}\n`);

        console.log(`   Duplicada (remover):`);
        console.log(`      ID: ${duplicateConv.id}`);
        console.log(`      Chat ID: ${duplicateConv.chatId}`);
        console.log(`      Contato: ${duplicateConv.nome} (ID: ${duplicateConv.contatoId})`);
        console.log(`      Mensagens: ${duplicateConv.totalMsg}`);
        console.log(`      Período: ${duplicateConv.primeiraMsg || 'N/A'} - ${duplicateConv.ultimaMsg || 'N/A'}\n`);

        console.log('🔄 Iniciando mesclagem...\n');

        // 1. Mover mensagens da conversa duplicada para a principal
        if (duplicateConv.totalMsg > 0) {
            console.log(`   📦 Movendo ${duplicateConv.totalMsg} mensagem(ns)...`);
            const moveMsgsQuery = `
                UPDATE mensagens 
                SET conversa_id = ${mainConv.id}
                WHERE conversa_id = ${duplicateConv.id}
            `;
            executeSQL(moveMsgsQuery);
            console.log(`   ✅ Mensagens movidas!\n`);
        }

        // 2. Atualizar contextos se existirem
        try {
            const moveContextQuery = `
                UPDATE conversa_contexto
                SET conversa_id = ${mainConv.id}
                WHERE conversa_id = ${duplicateConv.id}
            `;
            executeSQL(moveContextQuery);
            console.log(`   ✅ Contextos atualizados!\n`);
        } catch (error) {
            // Pode não ter contextos, não é erro crítico
        }

        // 3. Deletar a conversa duplicada
        console.log(`   🗑️  Removendo conversa duplicada...`);
        const deleteConvQuery = `DELETE FROM conversas WHERE id = ${duplicateConv.id}`;
        executeSQL(deleteConvQuery);
        console.log(`   ✅ Conversa duplicada removida!\n`);

        // 4. Mesclar contatos se forem diferentes
        if (mainConv.contatoId !== duplicateConv.contatoId) {
            console.log(`   👥 Mesclando contatos...`);

            // Atualizar referências ao contato duplicado
            const updateRefsQuery = `
                UPDATE mensagens 
                SET contato_id = ${mainConv.contatoId}
                WHERE contato_id = ${duplicateConv.contatoId}
            `;
            executeSQL(updateRefsQuery);

            // Deletar contato duplicado
            const deleteContactQuery = `DELETE FROM contatos WHERE id = ${duplicateConv.contatoId}`;
            executeSQL(deleteContactQuery);
            console.log(`   ✅ Contatos mesclados!\n`);
        }

        // 5. Atualizar timestamp da conversa principal
        const updateTimestampQuery = `
            UPDATE conversas
            SET ultima_mensagem_timestamp = (
                SELECT MAX(timestamp) FROM mensagens WHERE conversa_id = ${mainConv.id}
            ),
            updated_at = NOW()
            WHERE id = ${mainConv.id}
        `;
        executeSQL(updateTimestampQuery);

        // 6. Limpar cache
        try {
            execSync('docker exec whatsapp-clone-redis-1 redis-cli FLUSHDB', { encoding: 'utf-8', stdio: 'ignore' });
            console.log('🧹 Cache do Redis limpo!\n');
        } catch (error) {
            console.log('⚠️  Não foi possível limpar o cache do Redis\n');
        }

        console.log('✨ Mesclagem concluída com sucesso!\n');
        console.log(`📊 Resultado:`);
        console.log(`   Conversa mantida: ${mainConv.chatId}`);
        console.log(`   Total de mensagens: ${mainConv.totalMsg + duplicateConv.totalMsg}`);
        console.log(`\n💡 Recarregue o frontend para ver as mudanças.\n`);

    } catch (error) {
        console.error('❌ Erro ao mesclar conversas:', error.message);
        process.exit(1);
    }
}

// Uso
const args = process.argv.slice(2);

if (args.length < 2) {
    console.log('Uso: node merge-duplicate-conversations.js <chat_id_antigo> <chat_id_novo>');
    console.log('Exemplo: node merge-duplicate-conversations.js "556299643560@s.whatsapp.net" "71962344845555@lid"');
    process.exit(1);
}

const [oldChatId, newChatId] = args;
mergeConversations(oldChatId, newChatId);
