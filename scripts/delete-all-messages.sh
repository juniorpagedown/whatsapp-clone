#!/bin/bash

# Script para apagar todas as mensagens do banco de dados
# ATENÇÃO: Esta operação é IRREVERSÍVEL!

echo "=========================================="
echo "APAGAR TODAS AS MENSAGENS DO BANCO"
echo "=========================================="
echo ""
echo "⚠️  ATENÇÃO: Esta operação é IRREVERSÍVEL!"
echo ""
echo "Este script irá:"
echo "  - Apagar TODAS as mensagens"
echo "  - Apagar todas as interações com IA"
echo "  - Limpar dados de treinamento relacionados"
echo "  - Resetar contadores de mensagens não lidas"
echo "  - Limpar timestamps de última mensagem"
echo ""
read -p "Tem certeza que deseja continuar? (digite 'SIM' para confirmar): " confirmacao

if [ "$confirmacao" != "SIM" ]; then
    echo ""
    echo "❌ Operação cancelada."
    exit 0
fi

echo ""
echo "🔄 Executando script de limpeza..."
echo ""

# Executar o script SQL no container do PostgreSQL
docker exec -i whatsapp-clone-postgres-1 psql -U whatsapp_user -d whatsapp_clone < database/delete-all-messages.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Todas as mensagens foram apagadas com sucesso!"
    echo ""
    echo "🔄 Limpando cache do Redis..."
    docker exec -i whatsapp-clone-redis-1 redis-cli FLUSHALL > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        echo "✅ Cache do Redis limpo com sucesso!"
        echo ""
        echo "💡 Recarregue a página do frontend para ver as mudanças."
    else
        echo "⚠️  Aviso: Não foi possível limpar o cache do Redis."
        echo "   Execute manualmente: ./scripts/clear-cache.sh"
    fi
else
    echo ""
    echo "❌ Erro ao executar o script. Verifique os logs acima."
    exit 1
fi
