-- ============================================================================
-- ROLLBACK 001: Sistema de Classificação e SLA
-- Descrição: Remove todas as tabelas, índices, triggers e views da migration 001
-- Data: 2025-10-10
-- Autor: Sistema
-- ============================================================================

-- ATENÇÃO: Este script remove PERMANENTEMENTE todos os dados!
-- Execute apenas se tiver certeza do rollback

BEGIN;

-- ============================================================================
-- 1. REMOVER VIEWS
-- ============================================================================
DROP VIEW IF EXISTS vw_sla_em_risco CASCADE;
DROP VIEW IF EXISTS vw_solicitacoes_completas CASCADE;

-- ============================================================================
-- 2. REMOVER TRIGGERS
-- ============================================================================
DROP TRIGGER IF EXISTS trigger_log_solicitacao_changes ON solicitacoes;
DROP TRIGGER IF EXISTS trigger_calculate_resolution_time ON solicitacoes;
DROP TRIGGER IF EXISTS trigger_update_sla_status ON solicitacoes;
DROP TRIGGER IF EXISTS trigger_calculate_sla ON solicitacoes;
DROP TRIGGER IF EXISTS update_solicitacoes_updated_at ON solicitacoes;
DROP TRIGGER IF EXISTS update_subcategorias_updated_at ON subcategorias;
DROP TRIGGER IF EXISTS update_macro_categorias_updated_at ON macro_categorias;

-- ============================================================================
-- 3. REMOVER FUNCTIONS
-- ============================================================================
DROP FUNCTION IF EXISTS log_solicitacao_changes() CASCADE;
DROP FUNCTION IF EXISTS calculate_resolution_time() CASCADE;
DROP FUNCTION IF EXISTS update_sla_status() CASCADE;
DROP FUNCTION IF EXISTS calculate_sla_due_at() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- ============================================================================
-- 4. REMOVER TABELAS (ordem inversa de dependência)
-- ============================================================================
DROP TABLE IF EXISTS historico_solicitacoes CASCADE;
DROP TABLE IF EXISTS solicitacoes CASCADE;
DROP TABLE IF EXISTS subcategorias CASCADE;
DROP TABLE IF EXISTS macro_categorias CASCADE;

-- ============================================================================
-- 5. LIMPAR SEQUENCES (se necessário)
-- ============================================================================
-- As sequences são removidas automaticamente com CASCADE

COMMIT;

-- Mensagem de confirmação
DO $$
BEGIN
    RAISE NOTICE 'Rollback da Migration 001 concluído com sucesso';
    RAISE NOTICE 'Todas as tabelas, índices, triggers e views foram removidos';
END
$$;
