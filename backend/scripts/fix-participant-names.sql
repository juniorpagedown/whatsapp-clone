-- Script SQL para resetar nomes que são claramente de participantes
-- Isso forçará o sistema a buscar os nomes corretos nas próximas mensagens

-- 1. Resetar grupos que contêm "Suporte" no nome
UPDATE grupos
SET nome = group_id
WHERE nome LIKE '%Suporte%';

-- 2. Resetar grupos com nomes muito curtos (provavelmente nomes de pessoas)
UPDATE grupos
SET nome = group_id
WHERE LENGTH(nome) < 20
  AND nome NOT LIKE '%PRD%'
  AND nome NOT LIKE '%BEM%'
  AND nome NOT LIKE '%PCD%'
  AND nome != group_id;

-- 3. Listar grupos que foram alterados
SELECT group_id, nome
FROM grupos
WHERE nome = group_id
ORDER BY updated_at DESC;
