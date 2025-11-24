// seed.js - Popular banco de dados com dados iniciais
const { Pool } = require('pg');
const axios = require('axios');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'whatsapp_clone',
  user: process.env.DB_USER || 'whatsapp_user',
  password: process.env.DB_PASSWORD,
});

async function gerarEmbedding(texto) {
  if (!process.env.OPENAI_API_KEY) {
    console.log('⚠️  OpenAI API Key não configurada, pulando embeddings');
    return null;
  }

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/embeddings',
      { model: 'text-embedding-ada-002', input: texto },
      { headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }}
    );
    return response.data.data[0].embedding;
  } catch (error) {
    console.error('Erro ao gerar embedding:', error.message);
    return null;
  }
}

async function seed() {
  console.log('🌱 Iniciando seed do banco de dados...\n');

  try {
    console.log('📱 Criando contatos...');
    const contatos = [
      { phone: '5511999999999', nome: 'João Silva', avatar: '👤' },
      { phone: '5511888888888', nome: 'Maria Santos', avatar: '👤' },
      { phone: '5511777777777', nome: 'Pedro Costa', avatar: '👤' }
    ];

    for (const contato of contatos) {
      await pool.query(
        'INSERT INTO contatos (phone, nome, avatar) VALUES ($1, $2, $3) ON CONFLICT (phone) DO NOTHING',
        [contato.phone, contato.nome, contato.avatar]
      );
    }
    console.log(`✅ ${contatos.length} contatos criados\n`);

    console.log('📚 Populando base de conhecimento...');
    const conhecimentos = [
      {
        titulo: 'Horário de Atendimento',
        conteudo: 'Nosso horário de atendimento é de segunda a sexta-feira, das 9h às 18h. Aos sábados, atendemos das 9h às 13h.',
        tipo: 'faq',
        categoria: 'atendimento',
        tags: ['horário', 'atendimento']
      },
      {
        titulo: 'Política de Devolução',
        conteudo: 'Você tem até 30 dias após a compra para solicitar a devolução. O produto deve estar sem uso e na embalagem original.',
        tipo: 'política',
        categoria: 'vendas',
        tags: ['devolução', 'troca']
      },
      {
        titulo: 'Como Fazer Pedido',
        conteudo: 'Para fazer um pedido: 1) Envie o código do produto, 2) Confirme a quantidade, 3) Informe o endereço, 4) Escolha o pagamento.',
        tipo: 'procedimento',
        categoria: 'vendas',
        tags: ['pedido', 'compra']
      }
    ];

    for (const item of conhecimentos) {
      console.log(`   Processando: ${item.titulo}...`);
      const embedding = await gerarEmbedding(item.conteudo);
      
      await pool.query(
        'INSERT INTO conhecimento_base (titulo, conteudo, tipo, categoria, tags, embedding, is_active) VALUES ($1, $2, $3, $4, $5, $6, TRUE)',
        [item.titulo, item.conteudo, item.tipo, item.categoria, item.tags, embedding ? `[${embedding.join(',')}]` : null]
      );
    }
    console.log(`✅ ${conhecimentos.length} itens de conhecimento criados\n`);

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ Seed concluído com sucesso!');
    console.log('═══════════════════════════════════════════════════════\n');

    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM contatos) as contatos,
        (SELECT COUNT(*) FROM conhecimento_base) as conhecimentos
    `);

    const s = stats.rows[0];
    console.log('📊 Estatísticas:');
    console.log(`   Contatos: ${s.contatos}`);
    console.log(`   Base de conhecimento: ${s.conhecimentos}\n`);

  } catch (error) {
    console.error('❌ Erro durante seed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  seed().catch(console.error);
}

module.exports = { seed };
