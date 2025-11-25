// Script para deletar conversa órfã do banco de dados
// Carrega .env.local para rodar fora do Docker
require('dotenv').config({ path: '.env.local' });

const pool = require('./src/infrastructure/database/postgres');
const cacheService = require('./src/infrastructure/cache/cache.service');

async function deleteOrphanConversation() {
  const chatId = '5511999999999@s.whatsapp.net';

  try {
    console.log(`\nProcurando conversa com chat_id: ${chatId}...\n`);

    // 1. Verificar se a conversa existe
    const checkQuery = `
      SELECT
        c.id,
        c.chat_id,
        c.tipo,
        c.ultima_mensagem,
        c.contato_id,
        c.grupo_id,
        ct.nome AS contato_nome,
        g.nome AS grupo_nome,
        (SELECT COUNT(*) FROM mensagens m WHERE m.conversa_id = c.id) AS total_mensagens
      FROM conversas c
      LEFT JOIN contatos ct ON ct.id = c.contato_id
      LEFT JOIN grupos g ON g.id = c.grupo_id
      WHERE c.chat_id = $1
    `;

    const result = await pool.query(checkQuery, [chatId]);

    if (result.rows.length === 0) {
      console.log('❌ Conversa não encontrada no banco de dados!');
      console.log('O problema é apenas o cache. Execute: node clear-cache.js');
      process.exit(0);
    }

    const conversa = result.rows[0];
    console.log('✓ Conversa encontrada:');
    console.log('  ID:', conversa.id);
    console.log('  Chat ID:', conversa.chat_id);
    console.log('  Tipo:', conversa.tipo);
    console.log('  Total de mensagens:', conversa.total_mensagens);

    if (conversa.tipo === 'individual') {
      console.log('  Contato:', conversa.contato_nome || 'N/A');
      console.log('  Contato ID:', conversa.contato_id);
    } else {
      console.log('  Grupo:', conversa.grupo_nome || 'N/A');
      console.log('  Grupo ID:', conversa.grupo_id);
    }

    console.log('\n🗑️  Deletando conversa...');

    // 2. Deletar a conversa (CASCADE vai deletar as mensagens automaticamente)
    const deleteQuery = 'DELETE FROM conversas WHERE chat_id = $1 RETURNING id';
    const deleteResult = await pool.query(deleteQuery, [chatId]);

    if (deleteResult.rows.length > 0) {
      console.log('✓ Conversa deletada com sucesso!');
      console.log(`  ${conversa.total_mensagens} mensagens foram deletadas automaticamente (CASCADE)`);

      // 3. Limpar o cache
      console.log('\n🧹 Limpando cache...');
      await cacheService.invalidateConversa(conversa.id);
      await cacheService.delete('conversas:list:*');

      console.log('✓ Cache limpo com sucesso!');
      console.log('\n✅ Processo concluído! Recarregue o frontend.');
    } else {
      console.log('❌ Erro ao deletar conversa');
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error);
    process.exit(1);
  }
}

deleteOrphanConversation();
