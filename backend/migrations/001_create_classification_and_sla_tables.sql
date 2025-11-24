-- ============================================================================
-- Migration 001: Sistema de Classificação e SLA
-- Descrição: Adiciona macro categorias, subcategorias e solicitações com SLA
-- Data: 2025-10-10
-- Autor: Sistema
-- ============================================================================

-- ============================================================================
-- 1. MACRO_CATEGORIAS
-- ============================================================================
CREATE TABLE IF NOT EXISTS macro_categorias (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL UNIQUE,
    descricao TEXT,
    icone VARCHAR(50),                              -- emoji ou icon name
    cor VARCHAR(7),                                  -- hex color (#FF5733)
    ordem INTEGER DEFAULT 0,                         -- ordem de exibição
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE macro_categorias IS 'Categorias principais do sistema (ex: Vendas, Suporte, Financeiro)';
COMMENT ON COLUMN macro_categorias.ordem IS 'Ordem de exibição na interface';
COMMENT ON COLUMN macro_categorias.cor IS 'Cor em formato hexadecimal para identificação visual';

-- ============================================================================
-- 2. SUBCATEGORIAS
-- ============================================================================
CREATE TABLE IF NOT EXISTS subcategorias (
    id SERIAL PRIMARY KEY,
    macro_categoria_id INTEGER NOT NULL REFERENCES macro_categorias(id) ON DELETE CASCADE,
    nome VARCHAR(150) NOT NULL,
    descricao TEXT,

    -- SLA Configuration
    sla_horas INTEGER NOT NULL DEFAULT 24,           -- SLA em horas
    sla_horas_criticas INTEGER DEFAULT 2,            -- SLA para casos críticos

    -- Classification
    keywords TEXT[],                                 -- palavras-chave para auto-classificação

    -- Metadata
    ordem INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    requires_approval BOOLEAN DEFAULT false,         -- requer aprovação de supervisor

    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT subcategorias_macro_nome_unique UNIQUE (macro_categoria_id, nome)
);

COMMENT ON TABLE subcategorias IS 'Subcategorias específicas dentro de cada macro categoria';
COMMENT ON COLUMN subcategorias.sla_horas IS 'Tempo padrão em horas para resolver solicitação';
COMMENT ON COLUMN subcategorias.sla_horas_criticas IS 'SLA reduzido para casos marcados como críticos';
COMMENT ON COLUMN subcategorias.keywords IS 'Array de palavras-chave para classificação automática via IA';

-- ============================================================================
-- 3. SOLICITACOES
-- ============================================================================
CREATE TABLE IF NOT EXISTS solicitacoes (
    id SERIAL PRIMARY KEY,

    -- Relacionamentos
    conversa_id INTEGER NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
    mensagem_origem_id INTEGER REFERENCES mensagens(id) ON DELETE SET NULL,
    contato_id INTEGER REFERENCES contatos(id) ON DELETE SET NULL,
    usuario_responsavel_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,

    -- Classificação
    macro_categoria_id INTEGER REFERENCES macro_categorias(id) ON DELETE SET NULL,
    subcategoria_id INTEGER NOT NULL REFERENCES subcategorias(id) ON DELETE RESTRICT,

    -- Dados da Solicitação
    titulo VARCHAR(255) NOT NULL,
    descricao TEXT,
    prioridade VARCHAR(20) NOT NULL DEFAULT 'normal',  -- baixa, normal, alta, critica

    -- Status
    status VARCHAR(30) NOT NULL DEFAULT 'aberta',      -- aberta, em_andamento, aguardando_cliente, resolvida, fechada, cancelada

    -- SLA
    sla_due_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,   -- deadline calculado automaticamente
    sla_status VARCHAR(20) DEFAULT 'dentro_prazo',     -- dentro_prazo, proximo_vencimento, vencido
    sla_pausado_ate TIMESTAMP WITHOUT TIME ZONE,       -- para pausar SLA (aguardando cliente)
    tempo_pausa_total INTEGER DEFAULT 0,               -- tempo total pausado em minutos

    -- IA Classification Confidence
    classificacao_automatica BOOLEAN DEFAULT false,
    confidence_score NUMERIC(5,4),                     -- 0.0000 a 1.0000

    -- Resolução
    resolvido_em TIMESTAMP WITHOUT TIME ZONE,
    resolvido_por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    tempo_resolucao_minutos INTEGER,                   -- calculado automaticamente
    solucao TEXT,

    -- Satisfação
    avaliacao_cliente INTEGER CHECK (avaliacao_cliente BETWEEN 1 AND 5),
    feedback_cliente TEXT,

    -- Metadata
    tags TEXT[],
    metadata JSONB,

    -- Timestamps
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT solicitacoes_prioridade_check CHECK (prioridade IN ('baixa', 'normal', 'alta', 'critica')),
    CONSTRAINT solicitacoes_status_check CHECK (status IN ('aberta', 'em_andamento', 'aguardando_cliente', 'resolvida', 'fechada', 'cancelada')),
    CONSTRAINT solicitacoes_sla_status_check CHECK (sla_status IN ('dentro_prazo', 'proximo_vencimento', 'vencido'))
);

COMMENT ON TABLE solicitacoes IS 'Solicitações de atendimento com classificação e SLA';
COMMENT ON COLUMN solicitacoes.sla_due_at IS 'Data/hora limite para resolver (calculado automaticamente)';
COMMENT ON COLUMN solicitacoes.sla_pausado_ate IS 'SLA pausado até esta data (ex: aguardando resposta do cliente)';
COMMENT ON COLUMN solicitacoes.confidence_score IS 'Confiança da classificação automática pela IA (0-1)';
COMMENT ON COLUMN solicitacoes.tempo_resolucao_minutos IS 'Tempo real de resolução descontando pausas';

-- ============================================================================
-- 4. HISTORICO_SOLICITACOES
-- ============================================================================
CREATE TABLE IF NOT EXISTS historico_solicitacoes (
    id SERIAL PRIMARY KEY,
    solicitacao_id INTEGER NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,

    acao VARCHAR(50) NOT NULL,                       -- criada, atribuida, status_alterado, reclassificada, etc
    status_anterior VARCHAR(30),
    status_novo VARCHAR(30),

    campo_alterado VARCHAR(100),                     -- nome do campo alterado
    valor_anterior TEXT,
    valor_novo TEXT,

    observacao TEXT,
    metadata JSONB,

    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE historico_solicitacoes IS 'Auditoria completa de todas as alterações em solicitações';

-- ============================================================================
-- 5. INDICES - Performance Otimizada
-- ============================================================================

-- MACRO_CATEGORIAS
CREATE INDEX idx_macro_cat_active ON macro_categorias(is_active) WHERE is_active = true;
CREATE INDEX idx_macro_cat_ordem ON macro_categorias(ordem);

-- SUBCATEGORIAS
CREATE INDEX idx_subcat_macro_id ON subcategorias(macro_categoria_id);
CREATE INDEX idx_subcat_active ON subcategorias(is_active) WHERE is_active = true;
CREATE INDEX idx_subcat_keywords ON subcategorias USING GIN(keywords);

-- SOLICITACOES (Críticos para Performance)
CREATE INDEX idx_sol_conversa_id ON solicitacoes(conversa_id);
CREATE INDEX idx_sol_mensagem_origem ON solicitacoes(mensagem_origem_id);
CREATE INDEX idx_sol_contato_id ON solicitacoes(contato_id);
CREATE INDEX idx_sol_responsavel_id ON solicitacoes(usuario_responsavel_id);
CREATE INDEX idx_sol_macro_cat_id ON solicitacoes(macro_categoria_id);
CREATE INDEX idx_sol_subcat_id ON solicitacoes(subcategoria_id);

-- Índices compostos para queries comuns
CREATE INDEX idx_sol_status_sla ON solicitacoes(status, sla_status, sla_due_at);
CREATE INDEX idx_sol_status_created ON solicitacoes(status, created_at DESC);
CREATE INDEX idx_sol_responsavel_status ON solicitacoes(usuario_responsavel_id, status) WHERE usuario_responsavel_id IS NOT NULL;

-- Índice para SLA vencendo
CREATE INDEX idx_sol_sla_vencendo ON solicitacoes(sla_due_at)
    WHERE status IN ('aberta', 'em_andamento') AND sla_status != 'vencido';

-- Índice para busca de texto
CREATE INDEX idx_sol_titulo_trgm ON solicitacoes USING GIN(titulo gin_trgm_ops);
CREATE INDEX idx_sol_tags ON solicitacoes USING GIN(tags);
CREATE INDEX idx_sol_metadata ON solicitacoes USING GIN(metadata);

-- HISTORICO
CREATE INDEX idx_hist_sol_id_created ON historico_solicitacoes(solicitacao_id, created_at DESC);
CREATE INDEX idx_hist_usuario_id ON historico_solicitacoes(usuario_id);
CREATE INDEX idx_hist_acao ON historico_solicitacoes(acao);

-- ============================================================================
-- 6. TRIGGERS - Automação
-- ============================================================================

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_macro_categorias_updated_at
    BEFORE UPDATE ON macro_categorias
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subcategorias_updated_at
    BEFORE UPDATE ON subcategorias
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_solicitacoes_updated_at
    BEFORE UPDATE ON solicitacoes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger para calcular SLA automaticamente
CREATE OR REPLACE FUNCTION calculate_sla_due_at()
RETURNS TRIGGER AS $$
DECLARE
    sla_hours INTEGER;
BEGIN
    -- Buscar SLA da subcategoria
    SELECT
        CASE
            WHEN NEW.prioridade = 'critica' THEN COALESCE(sla_horas_criticas, sla_horas)
            ELSE sla_horas
        END
    INTO sla_hours
    FROM subcategorias
    WHERE id = NEW.subcategoria_id;

    -- Calcular deadline
    NEW.sla_due_at = CURRENT_TIMESTAMP + (sla_hours || ' hours')::INTERVAL;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_sla
    BEFORE INSERT ON solicitacoes
    FOR EACH ROW
    WHEN (NEW.sla_due_at IS NULL)
    EXECUTE FUNCTION calculate_sla_due_at();

-- Trigger para atualizar SLA status
CREATE OR REPLACE FUNCTION update_sla_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Se SLA está pausado, não atualizar status
    IF NEW.sla_pausado_ate IS NOT NULL AND NEW.sla_pausado_ate > CURRENT_TIMESTAMP THEN
        RETURN NEW;
    END IF;

    -- Atualizar status do SLA
    IF NEW.sla_due_at < CURRENT_TIMESTAMP THEN
        NEW.sla_status = 'vencido';
    ELSIF NEW.sla_due_at < CURRENT_TIMESTAMP + INTERVAL '2 hours' THEN
        NEW.sla_status = 'proximo_vencimento';
    ELSE
        NEW.sla_status = 'dentro_prazo';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_sla_status
    BEFORE INSERT OR UPDATE ON solicitacoes
    FOR EACH ROW
    EXECUTE FUNCTION update_sla_status();

-- Trigger para calcular tempo de resolução
CREATE OR REPLACE FUNCTION calculate_resolution_time()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status IN ('resolvida', 'fechada') AND OLD.status NOT IN ('resolvida', 'fechada') THEN
        NEW.resolvido_em = CURRENT_TIMESTAMP;

        -- Calcular tempo em minutos descontando pausas
        NEW.tempo_resolucao_minutos =
            EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - NEW.created_at))/60 - NEW.tempo_pausa_total;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_resolution_time
    BEFORE UPDATE ON solicitacoes
    FOR EACH ROW
    EXECUTE FUNCTION calculate_resolution_time();

-- Trigger para registrar histórico
CREATE OR REPLACE FUNCTION log_solicitacao_changes()
RETURNS TRIGGER AS $$
DECLARE
    v_acao VARCHAR(50);
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_acao = 'criada';
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status != NEW.status THEN
            v_acao = 'status_alterado';
        ELSIF OLD.usuario_responsavel_id IS DISTINCT FROM NEW.usuario_responsavel_id THEN
            v_acao = 'atribuida';
        ELSIF OLD.subcategoria_id != NEW.subcategoria_id THEN
            v_acao = 'reclassificada';
        ELSE
            v_acao = 'atualizada';
        END IF;
    END IF;

    INSERT INTO historico_solicitacoes (
        solicitacao_id,
        usuario_id,
        acao,
        status_anterior,
        status_novo,
        created_at
    ) VALUES (
        NEW.id,
        NEW.resolvido_por_id,
        v_acao,
        OLD.status,
        NEW.status,
        CURRENT_TIMESTAMP
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_solicitacao_changes
    AFTER INSERT OR UPDATE ON solicitacoes
    FOR EACH ROW
    EXECUTE FUNCTION log_solicitacao_changes();

-- ============================================================================
-- 7. DADOS INICIAIS
-- ============================================================================

-- Macro Categorias Padrão
INSERT INTO macro_categorias (nome, descricao, icone, cor, ordem) VALUES
    ('Suporte Técnico', 'Problemas técnicos, bugs, dúvidas sobre uso', '🔧', '#3498db', 1),
    ('Vendas', 'Consultas comerciais, orçamentos, propostas', '💰', '#2ecc71', 2),
    ('Financeiro', 'Cobranças, pagamentos, reembolsos', '💳', '#f39c12', 3),
    ('Cancelamento', 'Solicitações de cancelamento ou reembolso', '❌', '#e74c3c', 4),
    ('Informações', 'Informações gerais, dúvidas sobre produtos', 'ℹ️', '#9b59b6', 5),
    ('Reclamação', 'Reclamações e insatisfações', '😠', '#e67e22', 6)
ON CONFLICT (nome) DO NOTHING;

-- Subcategorias Padrão
INSERT INTO subcategorias (macro_categoria_id, nome, descricao, sla_horas, sla_horas_criticas, keywords) VALUES
    -- Suporte Técnico
    (1, 'Erro no Sistema', 'Erros, bugs, falhas técnicas', 4, 1, ARRAY['erro', 'bug', 'falha', 'não funciona', 'travou']),
    (1, 'Dúvida de Uso', 'Como usar funcionalidades', 24, 4, ARRAY['como', 'dúvida', 'ajuda', 'tutorial']),
    (1, 'Integração', 'Problemas com integrações', 8, 2, ARRAY['integração', 'api', 'webhook']),

    -- Vendas
    (2, 'Orçamento', 'Solicitação de orçamento', 24, 8, ARRAY['orçamento', 'preço', 'cotação', 'valor']),
    (2, 'Proposta Comercial', 'Elaboração de propostas', 48, 12, ARRAY['proposta', 'contrato', 'comercial']),
    (2, 'Demonstração', 'Agendamento de demo', 12, 4, ARRAY['demo', 'demonstração', 'apresentação']),

    -- Financeiro
    (3, 'Dúvida sobre Cobrança', 'Questionamentos sobre valores', 24, 4, ARRAY['cobrança', 'valor', 'fatura']),
    (3, 'Pagamento', 'Problemas com pagamento', 12, 2, ARRAY['pagamento', 'pagar', 'boleto', 'cartão']),
    (3, 'Reembolso', 'Solicitação de reembolso', 48, 12, ARRAY['reembolso', 'estorno', 'devolução']),

    -- Cancelamento
    (4, 'Cancelamento de Serviço', 'Cancelar assinatura/serviço', 24, 8, ARRAY['cancelar', 'cancelamento', 'desistir']),
    (4, 'Cancelamento de Pedido', 'Cancelar pedido específico', 8, 2, ARRAY['cancelar pedido', 'não quero mais']),

    -- Informações
    (5, 'Informação sobre Produto', 'Detalhes de produtos', 24, 8, ARRAY['produto', 'funcionalidade', 'característica']),
    (5, 'Documentação', 'Acesso a manuais e docs', 48, 12, ARRAY['documentação', 'manual', 'guia']),

    -- Reclamação
    (6, 'Insatisfação com Atendimento', 'Problemas com atendimento', 12, 2, ARRAY['reclamação', 'insatisfação', 'mal atendido']),
    (6, 'Insatisfação com Produto', 'Problemas com produto/serviço', 24, 4, ARRAY['produto ruim', 'não funciona bem'])
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 8. VIEWS ÚTEIS
-- ============================================================================

-- View de solicitações com informações completas
CREATE OR REPLACE VIEW vw_solicitacoes_completas AS
SELECT
    s.id,
    s.titulo,
    s.descricao,
    s.prioridade,
    s.status,

    -- Classificação
    mc.nome as macro_categoria,
    mc.cor as macro_categoria_cor,
    sc.nome as subcategoria,

    -- SLA
    s.sla_due_at,
    s.sla_status,
    EXTRACT(EPOCH FROM (s.sla_due_at - CURRENT_TIMESTAMP))/3600 as horas_ate_vencimento,

    -- Relacionamentos
    c.chat_id,
    ct.nome as contato_nome,
    ct.phone as contato_phone,
    u.nome as responsavel_nome,

    -- Resolução
    s.resolvido_em,
    s.tempo_resolucao_minutos,
    s.avaliacao_cliente,

    -- IA
    s.classificacao_automatica,
    s.confidence_score,

    -- Timestamps
    s.created_at,
    s.updated_at
FROM solicitacoes s
LEFT JOIN macro_categorias mc ON s.macro_categoria_id = mc.id
LEFT JOIN subcategorias sc ON s.subcategoria_id = sc.id
LEFT JOIN conversas c ON s.conversa_id = c.id
LEFT JOIN contatos ct ON s.contato_id = ct.id
LEFT JOIN usuarios u ON s.usuario_responsavel_id = u.id;

COMMENT ON VIEW vw_solicitacoes_completas IS 'View consolidada de solicitações com todas as informações';

-- View de SLA em risco
CREATE OR REPLACE VIEW vw_sla_em_risco AS
SELECT
    s.id,
    s.titulo,
    s.prioridade,
    mc.nome as macro_categoria,
    sc.nome as subcategoria,
    s.sla_due_at,
    EXTRACT(EPOCH FROM (s.sla_due_at - CURRENT_TIMESTAMP))/3600 as horas_restantes,
    u.nome as responsavel,
    c.chat_id
FROM solicitacoes s
LEFT JOIN macro_categorias mc ON s.macro_categoria_id = mc.id
LEFT JOIN subcategorias sc ON s.subcategoria_id = sc.id
LEFT JOIN conversas c ON s.conversa_id = c.id
LEFT JOIN usuarios u ON s.usuario_responsavel_id = u.id
WHERE s.status IN ('aberta', 'em_andamento')
  AND s.sla_status IN ('proximo_vencimento', 'vencido')
ORDER BY s.sla_due_at ASC;

COMMENT ON VIEW vw_sla_em_risco IS 'Solicitações com SLA próximo do vencimento ou vencido';

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
