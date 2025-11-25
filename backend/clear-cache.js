// Script para limpar cache de conversas
// Carrega .env.local para rodar fora do Docker
require('dotenv').config({ path: '.env.local' });

const cacheService = require('./src/infrastructure/cache/cache.service');

async function clearConversationCache() {
  try {
    console.log('\n🧹 Limpando cache de conversas...\n');

    // Limpar todos os caches de lista de conversas
    await cacheService.delete('conversas:list:*');

    console.log('✓ Cache de conversas limpo com sucesso!');
    console.log('✓ Recarregue o frontend para ver os dados atualizados.\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao limpar cache:', error.message);
    console.error(error);
    process.exit(1);
  }
}

clearConversationCache();
