-- Script para apagar todas as mensagens do banco de dados
-- ATENÇÃO: Esta operação é IRREVERSÍVEL!
-- Execute este script com cuidado

-- Desabilitar triggers temporariamente para melhor performance
SET session_replication_role = 'replica';

-- Apagar todas as interações com IA relacionadas às mensagens
DELETE FROM ia_interacoes;

-- Apagar todos os dados de treinamento da IA relacionados às mensagens
DELETE FROM ia_treinamento WHERE source_mensagem_id IS NOT NULL;

-- Apagar todas as mensagens
DELETE FROM mensagens;

-- Resetar as conversas (limpar última mensagem e contador de não lidas)
UPDATE conversas SET 
    ultima_mensagem = NULL,
    ultima_mensagem_timestamp = NULL,
    unread_count = 0,
    updated_at = CURRENT_TIMESTAMP;

-- Resetar os contatos (limpar última interação)
UPDATE contatos SET 
    last_interaction = NULL,
    updated_at = CURRENT_TIMESTAMP;

-- Reabilitar triggers
SET session_replication_role = 'origin';

-- Resetar a sequência do ID de mensagens para começar do 1 novamente
ALTER SEQUENCE mensagens_id_seq RESTART WITH 1;

-- Resetar a sequência do ID de interações IA
ALTER SEQUENCE ia_interacoes_id_seq RESTART WITH 1;

-- Mostrar estatísticas após a limpeza
SELECT 
    'Mensagens' as tabela, 
    COUNT(*) as total_registros 
FROM mensagens
UNION ALL
SELECT 
    'IA Interações' as tabela, 
    COUNT(*) as total_registros 
FROM ia_interacoes
UNION ALL
SELECT 
    'Conversas (ativas)' as tabela, 
    COUNT(*) as total_registros 
FROM conversas
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
SELECT 'Todas as mensagens foram apagadas com sucesso!' as status;
