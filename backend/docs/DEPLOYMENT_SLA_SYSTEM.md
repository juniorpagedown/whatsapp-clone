# 🚀 Deployment Guide - Sistema de Classificação e SLA

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Pré-requisitos](#pré-requisitos)
3. [Passos de Deployment](#passos-de-deployment)
4. [Verificação Pós-Deployment](#verificação-pós-deployment)
5. [Rollback](#rollback)
6. [Troubleshooting](#troubleshooting)

---

## 🎯 Visão Geral

Este deployment adiciona o **sistema completo de classificação e SLA** ao WhatsApp Clone IA:

### Novos Recursos

✅ **4 novas tabelas:**
- `macro_categorias` - Categorias principais
- `subcategorias` - Categorias específicas com SLA
- `solicitacoes` - Tickets/solicitações com SLA tracking
- `historico_solicitacoes` - Auditoria completa

✅ **Automação via Triggers:**
- Cálculo automático de SLA
- Atualização de status do SLA
- Cálculo de tempo de resolução
- Registro de histórico

✅ **Views Otimizadas:**
- `vw_solicitacoes_completas` - Dados consolidados
- `vw_sla_em_risco` - Alertas de SLA

✅ **API Completa:**
- CRUD de solicitações
- Classificação automática via IA
- Dashboard com métricas
- Gerenciamento de categorias

---

## ⚙️ Pré-requisitos

### 1. Extensões PostgreSQL

```bash
# Verificar se pg_trgm está instalado (para busca de texto)
psql -U whatsapp_user -d whatsapp_clone -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
```

### 2. Backup do Banco de Dados

**CRÍTICO:** Sempre fazer backup antes de migrations!

```bash
# Backup completo
pg_dump -U whatsapp_user -d whatsapp_clone -F c -f backup_pre_sla_$(date +%Y%m%d_%H%M%S).dump

# Backup apenas schema (mais rápido)
pg_dump -U whatsapp_user -d whatsapp_clone -s -f backup_schema_$(date +%Y%m%d_%H%M%S).sql
```

### 3. Verificar Espaço em Disco

```bash
# Verificar espaço disponível
df -h /var/lib/postgresql

# Verificar tamanho atual do banco
psql -U whatsapp_user -d whatsapp_clone -c "SELECT pg_size_pretty(pg_database_size('whatsapp_clone'));"
```

### 4. Notificar Equipe

- [ ] Agendar janela de manutenção
- [ ] Notificar usuários sobre possível downtime (2-5 minutos)
- [ ] Preparar equipe de suporte

---

## 🚀 Passos de Deployment

### Passo 1: Aplicar Migration

```bash
cd /opt/whatsapp-clone-ia/backend

# Executar migration
psql -U whatsapp_user -d whatsapp_clone -f migrations/001_create_classification_and_sla_tables.sql

# Verificar se não houve erros
echo $?  # Deve retornar 0
```

**Tempo estimado:** 30-60 segundos

### Passo 2: Verificar Tabelas Criadas

```sql
-- Conectar ao banco
psql -U whatsapp_user -d whatsapp_clone

-- Verificar tabelas
\dt+ macro_categorias subcategorias solicitacoes historico_solicitacoes

-- Verificar dados iniciais
SELECT COUNT(*) FROM macro_categorias;  -- Deve retornar 6
SELECT COUNT(*) FROM subcategorias;     -- Deve retornar ~15

-- Verificar triggers
SELECT tgname FROM pg_trigger WHERE tgrelid = 'solicitacoes'::regclass;

-- Verificar views
\dv vw_*
```

### Passo 3: Adicionar Rotas ao Server

Editar `server.js` ou arquivo principal de rotas:

```javascript
// Adicionar imports
const solicitacaoRoutes = require('./src/api/routes/solicitacao.routes');
const categoriaRoutes = require('./src/api/routes/categoria.routes');

// Adicionar rotas
app.use('/api/solicitacoes', solicitacaoRoutes);
app.use('/api/categorias', categoriaRoutes);
```

### Passo 4: Reiniciar Aplicação

```bash
# Se usar PM2
pm2 restart whatsapp-backend

# Se usar nodemon (desenvolvimento)
# Ctrl+C e npm run dev

# Verificar logs
pm2 logs whatsapp-backend --lines 50
```

### Passo 5: Testar Endpoints

```bash
# Testar categorias
curl -X GET http://localhost:3001/api/categorias/tree | jq

# Testar criação de solicitação
curl -X POST http://localhost:3001/api/solicitacoes/auto-classificar \
  -H "Content-Type: application/json" \
  -d '{
    "conversaId": 1,
    "mensagemOrigemId": 1,
    "contatoId": 1,
    "texto": "Como faço para cancelar minha assinatura?",
    "prioridade": "normal"
  }' | jq

# Testar dashboard
curl -X GET http://localhost:3001/api/solicitacoes/dashboard/stats | jq
```

---

## ✅ Verificação Pós-Deployment

### Checklist de Validação

- [ ] **Tabelas criadas:** Verificar que as 4 tabelas existem
- [ ] **Dados iniciais:** 6 macro categorias e ~15 subcategorias inseridas
- [ ] **Triggers funcionando:** Criar solicitação de teste e verificar sla_due_at
- [ ] **Views acessíveis:** SELECT nas views retorna dados
- [ ] **API respondendo:** Todos os endpoints retornam 200/201
- [ ] **Logs limpos:** Sem erros nos logs da aplicação
- [ ] **Performance:** Queries rápidas (< 100ms para listagens)

### Script de Validação Completa

```sql
-- Executar no psql
\i migrations/verify_deployment.sql
```

Criar arquivo `migrations/verify_deployment.sql`:

```sql
DO $$
DECLARE
    v_macro_count INTEGER;
    v_subcat_count INTEGER;
    v_triggers_count INTEGER;
    v_views_count INTEGER;
BEGIN
    -- Verificar tabelas
    SELECT COUNT(*) INTO v_macro_count FROM macro_categorias;
    SELECT COUNT(*) INTO v_subcat_count FROM subcategorias;

    -- Verificar triggers
    SELECT COUNT(*) INTO v_triggers_count
    FROM pg_trigger
    WHERE tgrelid IN ('macro_categorias'::regclass, 'subcategorias'::regclass, 'solicitacoes'::regclass);

    -- Verificar views
    SELECT COUNT(*) INTO v_views_count
    FROM pg_views
    WHERE viewname LIKE 'vw_%';

    -- Relatório
    RAISE NOTICE '=================================================';
    RAISE NOTICE 'VERIFICAÇÃO DE DEPLOYMENT';
    RAISE NOTICE '=================================================';
    RAISE NOTICE 'Macro Categorias: % (esperado: 6)', v_macro_count;
    RAISE NOTICE 'Subcategorias: % (esperado: ~15)', v_subcat_count;
    RAISE NOTICE 'Triggers: % (esperado: >= 8)', v_triggers_count;
    RAISE NOTICE 'Views: % (esperado: 2)', v_views_count;
    RAISE NOTICE '=================================================';

    -- Validar
    IF v_macro_count < 6 THEN
        RAISE WARNING 'ATENÇÃO: Menos macro categorias que o esperado!';
    END IF;

    IF v_subcat_count < 10 THEN
        RAISE WARNING 'ATENÇÃO: Menos subcategorias que o esperado!';
    END IF;

    IF v_triggers_count < 8 THEN
        RAISE WARNING 'ATENÇÃO: Triggers podem estar faltando!';
    END IF;

    IF v_views_count < 2 THEN
        RAISE WARNING 'ATENÇÃO: Views não foram criadas!';
    END IF;

    RAISE NOTICE 'Verificação concluída!';
END $$;
```

### Teste de Carga (Opcional)

```bash
# Criar 100 solicitações de teste
node scripts/create_test_solicitations.js 100

# Verificar performance
psql -U whatsapp_user -d whatsapp_clone -c "EXPLAIN ANALYZE SELECT * FROM vw_solicitacoes_completas LIMIT 10;"
```

---

## 🔄 Rollback

### Quando fazer Rollback?

- ❌ Erros críticos na migration
- ❌ Performance degradada significativamente
- ❌ Dados corrompidos
- ❌ Aplicação não inicializa

### Passo a Passo do Rollback

#### 1. Parar Aplicação

```bash
pm2 stop whatsapp-backend
```

#### 2. Executar Rollback SQL

```bash
psql -U whatsapp_user -d whatsapp_clone -f migrations/001_rollback_classification_and_sla_tables.sql
```

#### 3. Restaurar Backup (se necessário)

```bash
# Restaurar dump completo
pg_restore -U whatsapp_user -d whatsapp_clone -c backup_pre_sla_YYYYMMDD_HHMMSS.dump

# OU restaurar apenas schema
psql -U whatsapp_user -d whatsapp_clone -f backup_schema_YYYYMMDD_HHMMSS.sql
```

#### 4. Remover Código

```bash
# Reverter commit
git revert <commit_hash>

# OU checkout versão anterior
git checkout <commit_anterior>
```

#### 5. Reiniciar Aplicação

```bash
pm2 restart whatsapp-backend
pm2 logs whatsapp-backend
```

#### 6. Verificar Rollback

```sql
-- Verificar que tabelas foram removidas
\dt+ macro_categorias  -- Não deve existir
\dt+ solicitacoes      -- Não deve existir

-- Verificar aplicação funcionando
-- Testar endpoints antigos
```

---

## 🐛 Troubleshooting

### Problema 1: Migration Falha

**Sintoma:** Erro durante execução do SQL

**Solução:**
```bash
# Ver erro específico
psql -U whatsapp_user -d whatsapp_clone -f migrations/001_create_classification_and_sla_tables.sql 2>&1 | tee migration_error.log

# Verificar transações pendentes
psql -U whatsapp_user -d whatsapp_clone -c "SELECT * FROM pg_stat_activity WHERE state = 'idle in transaction';"

# Cancelar transações pendentes (se necessário)
psql -U whatsapp_user -d whatsapp_clone -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle in transaction';"
```

### Problema 2: Triggers Não Funcionam

**Sintoma:** sla_due_at não é calculado automaticamente

**Diagnóstico:**
```sql
-- Verificar se triggers existem
SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = 'solicitacoes'::regclass;

-- Verificar functions
SELECT proname FROM pg_proc WHERE proname LIKE 'calculate_%';

-- Testar manualmente
SELECT calculate_sla_due_at();
```

**Solução:**
```sql
-- Recriar trigger
DROP TRIGGER IF EXISTS trigger_calculate_sla ON solicitacoes;
CREATE TRIGGER trigger_calculate_sla
    BEFORE INSERT ON solicitacoes
    FOR EACH ROW
    WHEN (NEW.sla_due_at IS NULL)
    EXECUTE FUNCTION calculate_sla_due_at();
```

### Problema 3: Performance Lenta

**Sintoma:** Queries demoram > 1 segundo

**Diagnóstico:**
```sql
-- Verificar índices
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE tablename IN ('solicitacoes', 'subcategorias', 'macro_categorias');

-- Analisar query lenta
EXPLAIN ANALYZE SELECT * FROM vw_solicitacoes_completas LIMIT 100;

-- Verificar estatísticas
SELECT relname, n_live_tup, n_dead_tup
FROM pg_stat_user_tables
WHERE relname IN ('solicitacoes', 'subcategorias', 'macro_categorias');
```

**Solução:**
```sql
-- Reindexar
REINDEX TABLE solicitacoes;

-- Atualizar estatísticas
ANALYZE solicitacoes;
ANALYZE subcategorias;
ANALYZE macro_categorias;

-- Vacuum se necessário
VACUUM ANALYZE solicitacoes;
```

### Problema 4: Classificação IA Incorreta

**Sintoma:** Mensagens classificadas na categoria errada

**Solução:**
```sql
-- Revisar keywords
SELECT nome, keywords FROM subcategorias WHERE is_active = true;

-- Atualizar keywords
UPDATE subcategorias
SET keywords = ARRAY['nova', 'keyword', 'aqui']
WHERE id = <subcategoria_id>;

-- Reclassificar solicitações existentes
-- (executar via API ou script)
```

### Problema 5: SLA Não Atualiza

**Sintoma:** sla_status não muda para 'vencido'

**Solução:**
```sql
-- Forçar atualização manual
UPDATE solicitacoes
SET sla_status = CASE
    WHEN sla_due_at < CURRENT_TIMESTAMP THEN 'vencido'
    WHEN sla_due_at < CURRENT_TIMESTAMP + INTERVAL '2 hours' THEN 'proximo_vencimento'
    ELSE 'dentro_prazo'
END
WHERE status IN ('aberta', 'em_andamento');

-- Criar job cron para atualizar periodicamente
-- (adicionar ao crontab ou scheduler da aplicação)
```

---

## 📊 Monitoramento Pós-Deployment

### Métricas para Observar (primeiras 48h)

1. **Performance:**
   - Tempo de resposta das APIs (target: < 200ms)
   - Queries mais lentas
   - CPU e memória do PostgreSQL

2. **Funcionalidade:**
   - Taxa de sucesso na criação de solicitações
   - Acurácia da classificação automática
   - SLA calculado corretamente

3. **Negócio:**
   - Quantas solicitações criadas
   - Distribuição por categoria
   - Taxa de SLA vencido

### Queries de Monitoramento

```sql
-- Solicitações criadas nas últimas 24h
SELECT COUNT(*), AVG(confidence_score), DATE_TRUNC('hour', created_at) as hora
FROM solicitacoes
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY hora
ORDER BY hora DESC;

-- Distribuição por status
SELECT status, COUNT(*) FROM solicitacoes GROUP BY status;

-- SLA em risco
SELECT COUNT(*) FROM vw_sla_em_risco;

-- Queries lentas
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE query LIKE '%solicitacoes%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

---

## 📞 Suporte

Em caso de problemas críticos:

1. **Rollback imediato** (seguir procedimento acima)
2. Notificar equipe de desenvolvimento
3. Documentar erro completo (logs + screenshots)
4. Abrir incident ticket

---

**Data do Deployment:** __________
**Responsável:** __________
**Versão:** 1.0
**Status:** ☐ Sucesso  ☐ Rollback  ☐ Parcial
