-- Script para corrigir nomes de grupos que estão com o group_id como nome
-- Este script busca o nome real do grupo no metadata das conversas

-- Primeiro, vamos ver quantos grupos têm o problema
SELECT
    g.id,
    g.group_id,
    g.nome AS nome_atual,
    c.metadata->>'chatName' AS nome_no_metadata,
    c.metadata->>'subject' AS subject_no_metadata
FROM grupos g
LEFT JOIN conversas c ON c.grupo_id = g.id
WHERE g.nome = g.group_id  -- Nome é igual ao ID (problema)
   OR g.nome IS NULL
   OR LENGTH(TRIM(g.nome)) = 0
ORDER BY g.updated_at DESC;

-- Agora vamos atualizar com o nome correto do metadata
UPDATE grupos g
SET nome = COALESCE(
    -- Tenta pegar do metadata da conversa
    (SELECT c.metadata->>'subject'
     FROM conversas c
     WHERE c.grupo_id = g.id
     AND c.metadata->>'subject' IS NOT NULL
     AND c.metadata->>'subject' <> ''
     LIMIT 1),
    (SELECT c.metadata->>'chatName'
     FROM conversas c
     WHERE c.grupo_id = g.id
     AND c.metadata->>'chatName' IS NOT NULL
     AND c.metadata->>'chatName' <> ''
     AND c.metadata->>'chatName' <> g.group_id
     LIMIT 1),
    -- Se não encontrar, mantém o nome atual
    g.nome
),
updated_at = NOW()
WHERE g.nome = g.group_id  -- Só atualiza grupos com problema
   OR g.nome IS NULL
   OR LENGTH(TRIM(g.nome)) = 0;

-- Verificar quantos foram atualizados
SELECT
    COUNT(*) AS total_grupos,
    COUNT(CASE WHEN nome = group_id THEN 1 END) AS ainda_com_problema,
    COUNT(CASE WHEN nome <> group_id AND nome IS NOT NULL THEN 1 END) AS corrigidos
FROM grupos;

-- Ver os grupos após a correção
SELECT
    id,
    group_id,
    nome,
    updated_at
FROM grupos
ORDER BY updated_at DESC
LIMIT 20;
