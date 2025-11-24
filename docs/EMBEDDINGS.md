## Configuração de Embeddings Vetoriais e Busca Híbrida

Esta documentação explica como ativar e operar o pipeline de embeddings com pgvector para melhorar as sugestões de classificação dentro do WhatsApp Clone IA.

### 1. Pré-requisitos

- PostgreSQL ≥ 16 com extensão **pgvector** instalada:
  ```sql
  CREATE EXTENSION IF NOT EXISTS vector;
  ```
- Variáveis de ambiente configuradas no backend:
  ```ini
  FEATURE_EMBEDDING=true            # habilita geração de embeddings
  OPENAI_API_KEY=sk-...             # ou configure provedor local/ollama
  EMBEDDING_PROVIDER=openai         # openai | local
  OPENAI_MODEL_EMBEDDING=text-embedding-3-small
  CLASSIFICACAO_VECTOR_WEIGHT=0.5   # 0 = apenas keywords, 1 = apenas vetor
  ```

### 2. Ajustes de Rate Limit para Produção

Defina limites mais permissivos (ou utilize Redis compartilhado) no `.env`:

```ini
RATE_LIMIT_WINDOW_MS=60000    # 1 minuto
RATE_LIMIT_MAX_REQUESTS=1000  # por IP dentro da janela
REDIS_URL=redis://user:senha@host:6379/0   # opcional, para ambientes com múltiplas instâncias
```

Com `REDIS_URL` presente, o middleware usa `rate-limit-redis` automaticamente como store compartilhado.

### 3. Aplicar migrations e índices

```bash
psql -d whatsapp_clone -f backend/migrations/003_add_conversa_classificacao.sql
psql -d whatsapp_clone -f backend/migrations/004_add_vector_indexes.sql
```

### 4. Executar setup completo da busca vetorial

```bash
cd backend
npm install
npm run setup:vector-search
```

O script:
1. Valida a presença do pgvector.
2. Garante a coluna `embedding` em `classificacao_catalogo`.
3. Cria índices `ivfflat` para `mensagens`, `classificacao_catalogo` e `conversa_contexto`.
4. Roda o backfill de embeddings (catálogo, mensagens e base de conhecimento).

## 🚀 Opções de Setup

### Setup Completo (recomendado para primeira instalação)
```bash
npm run setup:vector-search
```

Este comando:
- ✅ Valida extensão pgvector
- ✅ Cria índices IVFFLAT
- ✅ Executa backfill de embeddings existentes

### Apenas Backfill (para processar novos dados)
```bash
npm run backfill-embeddings
```

Processa apenas registros sem embedding. Útil para:
- Atualizar dados após importação
- Reprocessar após mudança de modelo
- Recuperar de falhas anteriores

### Aliases Disponíveis
```bash
npm run embeddings:setup      # Mesmo que setup:vector-search
npm run embeddings:backfill   # Mesmo que backfill-embeddings
npm run embeddings:diagnose   # Diagnóstico completo do sistema
```

### 5. Geração contínua de embeddings

- Mensagens novas são processadas pelo worker (`npm run worker:embedding`).
- Itens sem embedding em `conhecimento_base` e `classificacao_catalogo` são enfileirados automaticamente pelos crons `EMBEDDING_KB_CRON` e `EMBEDDING_CATALOG_CRON`.
- Para reprocessar histórico a qualquer momento:
  ```bash
  npm run backfill-embeddings
  ```
- Ajuste `EMBEDDING_BACKFILL_MAX_EMPTY` e `EMBEDDING_BACKFILL_SLEEP_MS` para evitar loops infinitos caso o provedor de embeddings esteja offline. O script aborta após atingir o limite de ciclos sem progresso.

### 6. Contextos agregados de conversa

- O scheduler `CONVERSA_CONTEXTO_CRON` agrupa blocos de mensagens em `conversa_contexto`, gera um resumo com tópicos principais e, se `FEATURE_EMBEDDING=true`, cria embeddings do resumo.
- Parâmetros ajustáveis:
  - `CONTEXT_SUMMARY_WINDOW_SIZE`: máximo de mensagens por janela consolidada.
  - `CONTEXT_SUMMARY_MIN_MESSAGES`: mínimo desejado antes de gerar um novo bloco (exceto o último restante).
  - `CONTEXT_SUMMARY_CONVERSATION_LIMIT`: quantas conversas são processadas por ciclo.
  - `CONTEXT_SUMMARY_MAX_TOKENS`: limite de tokens na chamada do modelo de resumo.
- Cada registro em `conversa_contexto` guarda `metadata.last_message_id`; isso evita janelas duplicadas e garante continuidade entre execuções.

### 7. Busca híbrida (keywords + vetorial)

- A rota `GET /api/conversas/:id/sugestoes` utiliza:
  - Busca por keywords (compatível com versões antigas).
  - Similaridade vetorial (quando `FEATURE_EMBEDDING=true` e embeddings disponíveis).
- O peso relativo é controlado por `CLASSIFICACAO_VECTOR_WEIGHT`.
  - `0.0` → apenas keywords.
  - `0.5` → combinação equilibrada (padrão recomendado).
  - `1.0` → apenas vetor.

### 8. Monitoramento e troubleshooting

- Logs (`logger.debug`) registram o tempo de cada busca (`keywords` e `vector`).
- Se a busca vetorial falhar ou não houver embeddings, o serviço faz fallback automático para keywords.
- Use `SELECT COUNT(*) FROM classificacao_catalogo WHERE embedding IS NULL;` para checar itens pendentes.
- Caso a API de embeddings fique indisponível, o sistema continua operacional (apenas com keywords).

### 9. Próximos passos sugeridos

- Habilitar cache de embeddings de consultas frequentes (Redis).
- Ajustar `WITH (lists = X)` dos índices `ivfflat` conforme o volume de dados.
- Monitorar custo de geração de embeddings para dimensionar lotes (`EMBEDDING_BACKFILL_MAX_PER_RUN`).

## 🔧 Troubleshooting

### ❌ Erro: "Loop infinito no backfill"

**Sintoma:** Script fica rodando sem progresso, eventualmente aborta.

**Causas possíveis:**
- Provider retornando 503 (serviço temporariamente indisponível)
- Rate limit sendo atingido repetidamente
- Credenciais inválidas causando falhas silenciosas

**Solução:**

1. **Execute diagnóstico primeiro:**
```bash
npm run embeddings:diagnose
```

2. **Se for rate limit do provider:**
```bash
# Reduza o batch size no .env
EMBEDDING_BACKFILL_BATCH_SIZE=50

# Aumente o número de retries
EMBEDDING_BACKFILL_MAX_RETRIES=5
# Evite reprocessar mensagens vazias
EMBEDDING_MARK_EMPTY_AS_SKIPPED=true
```

3. **Se for 503 temporário:**
   - Aguarde 5-10 minutos
   - Execute novamente (o script retoma de onde parou)

---

### ❌ Erro: "Credenciais inválidas" ou 401/403

**Sintoma:** Backfill falha imediatamente com erro de autenticação.

**Solução:**

1. **Verifique a API key:**
```bash
# No .env, confirme que existe:
OPENAI_API_KEY=sk-proj-...
```

2. **Teste manualmente:**
```bash
npm run embeddings:diagnose
```

3. **Confirme permissões:**
   - A key precisa ter acesso ao endpoint de embeddings
   - Verifique no painel do provider se a key está ativa

---

### ⚠️ Performance lenta (> 1s por embedding)

**Causas:**
- Índices vetoriais ausentes
- Batch size muito alto
- Latência de rede com provider

**Solução:**

1. **Verifique índices:**
```bash
npm run embeddings:diagnose
# Se faltar índices, recrie:
npm run setup:vector-search
```

2. **Ajuste batch size:**
```bash
# No .env
EMBEDDING_BACKFILL_BATCH_SIZE=50  # Valor menor
```

3. **Considere provider alternativo:**
   - Azure OpenAI (geralmente mais rápido para BR)
   - Cohere (suporta batch nativo)

---

### 🔄 Como reverter mudanças

Se precisar desativar embeddings temporariamente:
```bash
# 1. Desativar feature no .env
FEATURE_EMBEDDING=false

# 2. (Opcional) Remover índices para liberar espaço
psql -d seu_banco <<SQL
DROP INDEX IF EXISTS idx_mensagens_embedding;
DROP INDEX IF EXISTS idx_classificacao_catalogo_embedding;
DROP INDEX IF EXISTS idx_conversa_contexto_embedding;
SQL

# 3. (Opcional) Limpar embeddings para liberar espaço
psql -d seu_banco <<SQL
UPDATE mensagens SET embedding = NULL;
UPDATE classificacao_catalogo SET embedding = NULL;
UPDATE conversa_contexto SET embedding = NULL;
SQL
```

---

### 📞 Suporte

Se os problemas persistirem:

1. Execute e compartilhe o diagnóstico:
```bash
npm run embeddings:diagnose > diagnostico.txt
```

2. Verifique logs do backend:
```bash
tail -f backend/logs/error.log | grep -i embedding
```

3. Teste busca vetorial manualmente:
```sql
-- No psql, verifique se vetores estão sendo usados:
EXPLAIN ANALYZE
SELECT id, 1 - (embedding <=> '[0.1, 0.2, ...]'::vector) AS score
FROM mensagens
WHERE embedding IS NOT NULL
ORDER BY embedding <=> '[0.1, 0.2, ...]'::vector
LIMIT 5;
```
