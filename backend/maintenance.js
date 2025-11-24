// maintenance.js - Scripts de manutenção automatizada
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
require('dotenv').config();

const execPromise = util.promisify(exec);

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// ========== BACKUP AUTOMÁTICO ==========

async function criarBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = process.env.BACKUP_DIR || '/var/backups/whatsapp';
  const backupFile = path.join(backupDir, `backup-${timestamp}.sql`);

  console.log('📦 Criando backup do banco de dados...');

  try {
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const cmd = `PGPASSWORD="${process.env.DB_PASSWORD}" pg_dump -h ${process.env.DB_HOST} -U ${process.env.DB_USER} -d ${process.env.DB_NAME} > ${backupFile}`;
    await execPromise(cmd);

    await execPromise(`gzip ${backupFile}`);

    const compressedFile = `${backupFile}.gz`;
    const stats = fs.statSync(compressedFile);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    console.log(`✅ Backup criado: ${compressedFile} (${sizeMB} MB)`);

    await limparBackupsAntigos(backupDir, 7);

    return compressedFile;
  } catch (error) {
    console.error('❌ Erro ao criar backup:', error.message);
    throw error;
  }
}

async function limparBackupsAntigos(backupDir, diasManter = 7) {
  const arquivos = fs.readdirSync(backupDir);
  const agora = Date.now();
  const limiteTempo = diasManter * 24 * 60 * 60 * 1000;

  let removidos = 0;

  for (const arquivo of arquivos) {
    if (arquivo.startsWith('backup-') && arquivo.endsWith('.gz')) {
      const caminhoCompleto = path.join(backupDir, arquivo);
      const stats = fs.statSync(caminhoCompleto);
      const idade = agora - stats.mtimeMs;

      if (idade > limiteTempo) {
        fs.unlinkSync(caminhoCompleto);
        removidos++;
        console.log(`🗑️  Removido backup antigo: ${arquivo}`);
      }
    }
  }

  if (removidos > 0) {
    console.log(`✅ ${removidos} backup(s) antigo(s) removido(s)`);
  }
}

// ========== LIMPEZA DE DADOS ==========

async function limparDadosAntigos() {
  console.log('🧹 Limpando dados antigos...');

  try {
    const diasManter = parseInt(process.env.DIAS_MANTER_MENSAGENS) || 365;

    const result = await pool.query(`
      DELETE FROM mensagens 
      WHERE timestamp < NOW() - INTERVAL '${diasManter} days'
      RETURNING id
    `);

    console.log(`✅ ${result.rowCount} mensagens antigas removidas`);

    const resultIA = await pool.query(`
      DELETE FROM ia_interacoes 
      WHERE created_at < NOW() - INTERVAL '90 days'
      RETURNING id
    `);

    console.log(`✅ ${resultIA.rowCount} interações de IA antigas removidas`);

    return {
      mensagensRemovidas: result.rowCount,
      interacoesRemovidas: resultIA.rowCount
    };
  } catch (error) {
    console.error('❌ Erro ao limpar dados:', error.message);
    throw error;
  }
}

// ========== OTIMIZAÇÃO DO BANCO ==========

async function otimizarBanco() {
  console.log('⚙️  Otimizando banco de dados...');

  try {
    await pool.query('VACUUM ANALYZE');
    console.log('✅ VACUUM ANALYZE concluído');

    await pool.query('ANALYZE');
    console.log('✅ Estatísticas atualizadas');

    return true;
  } catch (error) {
    console.error('❌ Erro ao otimizar banco:', error.message);
    throw error;
  }
}

// ========== MONITORAMENTO ==========

async function verificarSaude() {
  console.log('🏥 Verificando saúde do sistema...\n');

  const saude = {
    banco: { status: 'ok', detalhes: {} },
    embeddings: { status: 'ok', detalhes: {} },
    performance: { status: 'ok', detalhes: {} },
    armazenamento: { status: 'ok', detalhes: {} }
  };

  try {
    const inicio = Date.now();
    await pool.query('SELECT 1');
    saude.banco.detalhes.latencia = Date.now() - inicio;

    const tamanhoResult = await pool.query(`
      SELECT pg_size_pretty(pg_database_size('${process.env.DB_NAME}')) as tamanho
    `);
    saude.banco.detalhes.tamanho = tamanhoResult.rows[0].tamanho;

    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM mensagens) as total_mensagens,
        (SELECT COUNT(*) FROM mensagens WHERE embedding IS NOT NULL) as mensagens_com_embedding,
        (SELECT COUNT(*) FROM conversas) as total_conversas,
        (SELECT COUNT(*) FROM contatos) as total_contatos
    `);

    saude.embeddings.detalhes = stats.rows[0];

    const cobertura = (stats.rows[0].mensagens_com_embedding / stats.rows[0].total_mensagens * 100).toFixed(2);
    saude.embeddings.detalhes.cobertura = `${cobertura}%`;

    if (cobertura < 50) {
      saude.embeddings.status = 'warning';
    }

    const connResult = await pool.query(`
      SELECT count(*) as conexoes_ativas 
      FROM pg_stat_activity 
      WHERE datname = '${process.env.DB_NAME}'
    `);
    saude.performance.detalhes.conexoes_ativas = connResult.rows[0].conexoes_ativas;

    const { stdout } = await execPromise("df -h / | tail -1 | awk '{print $5}'");
    const usoDiscoPercent = parseInt(stdout.trim());
    saude.armazenamento.detalhes.uso_disco = `${usoDiscoPercent}%`;

    if (usoDiscoPercent > 80) {
      saude.armazenamento.status = 'warning';
    }
    if (usoDiscoPercent > 90) {
      saude.armazenamento.status = 'critical';
    }

    console.log('═══════════════════════════════════════════');
    console.log('📊 RELATÓRIO DE SAÚDE DO SISTEMA');
    console.log('═══════════════════════════════════════════\n');

    console.log('🗄️  BANCO DE DADOS:', saude.banco.status);
    console.log('   Latência:', saude.banco.detalhes.latencia + 'ms');
    console.log('   Tamanho:', saude.banco.detalhes.tamanho);
    console.log('   Conexões ativas:', saude.performance.detalhes.conexoes_ativas);

    console.log('\n🤖 EMBEDDINGS:', saude.embeddings.status);
    console.log('   Total mensagens:', saude.embeddings.detalhes.total_mensagens);
    console.log('   Com embedding:', saude.embeddings.detalhes.mensagens_com_embedding);
    console.log('   Cobertura:', saude.embeddings.detalhes.cobertura);

    console.log('\n💾 ARMAZENAMENTO:', saude.armazenamento.status);
    console.log('   Uso de disco:', saude.armazenamento.detalhes.uso_disco);

    console.log('\n═══════════════════════════════════════════\n');

    return saude;

  } catch (error) {
    console.error('❌ Erro ao verificar saúde:', error.message);
    saude.banco.status = 'error';
    saude.banco.detalhes.erro = error.message;
    return saude;
  }
}

// ========== CLI ==========

async function main() {
  const comando = process.argv[2];

  try {
    switch (comando) {
      case 'backup':
        await criarBackup();
        break;

      case 'limpar':
        await limparDadosAntigos();
        break;

      case 'otimizar':
        await otimizarBanco();
        break;

      case 'saude':
        await verificarSaude();
        break;

      case 'manutencao-completa':
        console.log('🔧 Executando manutenção completa...\n');
        await verificarSaude();
        await criarBackup();
        await limparDadosAntigos();
        await otimizarBanco();
        console.log('\n✅ Manutenção completa finalizada!');
        break;

      default:
        console.log(`
╔════════════════════════════════════════════╗
║   🔧 Scripts de Manutenção                 ║
╚════════════════════════════════════════════╝

Comandos:

1️⃣  Backup: node maintenance.js backup
2️⃣  Limpar: node maintenance.js limpar
3️⃣  Otimizar: node maintenance.js otimizar
4️⃣  Saúde: node maintenance.js saude
5️⃣  Completa: node maintenance.js manutencao-completa
        `);
    }
  } catch (error) {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  criarBackup,
  limparDadosAntigos,
  otimizarBanco,
  verificarSaude
};
