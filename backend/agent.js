// agent.js - Sistema de Agente IA com RAG (Retrieval Augmented Generation)
const { Pool } = require('pg');
const axios = require('axios');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ========== FUNÇÕES DE EMBEDDING ==========

async function gerarEmbedding(texto) {
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/embeddings',
      { model: 'text-embedding-ada-002', input: texto },
      { headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' }}
    );
    return response.data.data[0].embedding;
  } catch (error) {
    console.error('Erro ao gerar embedding:', error.message);
    throw error;
  }
}

// ========== BUSCA SEMÂNTICA (RAG) ==========

async function buscarContextoRelevante(pergunta, conversaId = null, limite = 5) {
  try {
    const embedding = await gerarEmbedding(pergunta);

    let mensagensSimilares = [];
    if (conversaId) {
      const resultMensagens = await pool.query(`
        SELECT m.id, m.texto, m.timestamp, c.nome as remetente,
               1 - (m.embedding <=> $1::vector) as similarity
        FROM mensagens m
        LEFT JOIN contatos c ON m.contato_id = c.id
        WHERE m.conversa_id = $2 AND m.embedding IS NOT NULL
          AND 1 - (m.embedding <=> $1::vector) > 0.7
        ORDER BY m.embedding <=> $1::vector
        LIMIT $3
      `, [`[${embedding.join(',')}]`, conversaId, limite]);
      mensagensSimilares = resultMensagens.rows;
    }

    const resultConhecimento = await pool.query(`
      SELECT id, titulo, conteudo, tipo, 1 - (embedding <=> $1::vector) as similarity
      FROM conhecimento_base
      WHERE is_active = TRUE AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $2
    `, [`[${embedding.join(',')}]`, limite]);

    return { mensagens: mensagensSimilares, conhecimento: resultConhecimento.rows };
  } catch (error) {
    console.error('Erro na busca de contexto:', error);
    return { mensagens: [], conhecimento: [] };
  }
}

// ========== GERAÇÃO DE RESPOSTA COM IA ==========

async function gerarRespostaIA(pergunta, contexto, conversaId, modelo = 'gpt-4') {
  try {
    const inicioChamada = Date.now();

    const mensagensContexto = contexto.mensagens.map(m => 
      `[${m.timestamp}] ${m.remetente}: ${m.texto}`
    ).join('\n');

    const conhecimentoContexto = contexto.conhecimento.map(k => 
      `${k.titulo}\n${k.conteudo}`
    ).join('\n\n---\n\n');

    const systemPrompt = `Você é um assistente virtual inteligente e prestativo. 
Use o contexto fornecido para responder de forma precisa e natural.

CONHECIMENTO BASE:
${conhecimentoContexto || 'Nenhum conhecimento específico disponível.'}

HISTÓRICO DA CONVERSA:
${mensagensContexto || 'Nenhuma mensagem anterior.'}

Instruções:
- Responda de forma clara, objetiva e amigável
- Use o contexto fornecido quando relevante
- Se não souber algo, seja honesto
- Mantenha respostas concisas (máximo 3 parágrafos)
- Use português brasileiro
`;

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: modelo,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: pergunta }
        ],
        temperature: 0.7,
        max_tokens: 500
      },
      { headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' }}
    );

    const resposta = response.data.choices[0].message.content;
    const tokensUsados = response.data.usage.total_tokens;
    const latencia = Date.now() - inicioChamada;

    const conhecimentosUsados = contexto.conhecimento.map(k => k.id);
    const mensagensUsadas = contexto.mensagens.map(m => m.id);

    await pool.query(`
      INSERT INTO ia_interacoes (
        conversa_id, prompt_enviado, resposta_ia, modelo,
        tokens_usados, latencia_ms, conhecimentos_usados, mensagens_contexto
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [conversaId, pergunta, resposta, modelo, tokensUsados, latencia, conhecimentosUsados, mensagensUsadas]);

    return {
      resposta,
      metadata: {
        tokensUsados,
        latencia,
        conhecimentosUsados: conhecimentosUsados.length,
        mensagensContexto: mensagensUsadas.length
      }
    };
  } catch (error) {
    console.error('Erro ao gerar resposta:', error.message);
    throw error;
  }
}

// ========== PIPELINE COMPLETO ==========

async function processarPergunta(pergunta, conversaId) {
  console.log('\n🤖 Processando pergunta:', pergunta);
  console.log('📊 Buscando contexto relevante...');

  const contexto = await buscarContextoRelevante(pergunta, conversaId);

  console.log(`✅ Encontrados: ${contexto.mensagens.length} mensagens similares`);
  console.log(`✅ Encontrados: ${contexto.conhecimento.length} conhecimentos relevantes`);
  console.log('💭 Gerando resposta...');

  const resultado = await gerarRespostaIA(pergunta, contexto, conversaId);

  console.log('\n📝 Resposta:', resultado.resposta);
  console.log('📈 Metadata:', resultado.metadata);

  return resultado;
}

// =========
