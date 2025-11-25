-- Script para apagar todas as conversas e mensagens do banco de dados
-- ATENÇÃO: Esta operação é IRREVERSÍVEL!
-- Execute este script com cuidado

-- Desabilitar triggers temporariamente para melhor performance
SET session_replication_role = 'replica';

-- Apagar todas as interações com IA relacionadas às mensagens
DELETE FROM ia_interacoes;

-- Apagar todos os dados de treinamento da IA relacionados às mensagens
DELETE FROM ia_treinamento WHERE source_mensagem_id IS NOT NULL;

-- Apagar todos os contextos de conversas
DELETE FROM conversa_contexto;

-- Apagar todas as mensagens (CASCADE vai cuidar das referências)
DELETE FROM mensagens;

-- Apagar todas as conversas
DELETE FROM conversas;

-- Resetar os contatos (limpar última interação)
UPDATE contatos SET 
    last_interaction = NULL,
    updated_at = CURRENT_TIMESTAMP;

-- Reabilitar triggers
SET session_replication_role = 'origin';

-- Resetar as sequências para começar do 1 novamente
ALTER SEQUENCE mensagens_id_seq RESTART WITH 1;
ALTER SEQUENCE ia_interacoes_id_seq RESTART WITH 1;
ALTER SEQUENCE conversas_id_seq RESTART WITH 1;
ALTER SEQUENCE conversa_contexto_id_seq RESTART WITH 1;

-- Mostrar estatísticas após a limpeza
SELECT 
    'Mensagens' as tabela, 
    COUNT(*) as total_registros 
FROM mensagens
UNION ALL
SELECT 
    'Conversas' as tabela, 
    COUNT(*) as total_registros 
FROM conversas
UNION ALL
SELECT 
    'Contextos' as tabela, 
    COUNT(*) as total_registros 
FROM conversa_contexto
UNION ALL
SELECT 
    'IA Interações' as tabela, 
    COUNT(*) as total_registros 
FROM ia_interacoes
UNION ALL
SELECT 
    'Contatos' as tabela, 
    COUNT(*) as total_registros 
FROM contatos
UNION ALL
SELECT 
    'Grupos' as tabela, 
    COUNT(*) as total_registros 
FROM grupos;

-- Mensagem de confirmação
SELECT 'Todas as conversas e mensagens foram apagadas com sucesso!' as status;
