#!/bin/bash

# Script para limpar o cache do Redis
# Útil após operações de limpeza no banco de dados

echo "=========================================="
echo "LIMPAR CACHE DO REDIS"
echo "=========================================="
echo ""
echo "Este script irá limpar todo o cache do Redis."
echo "Isso forçará o backend a buscar dados atualizados do banco de dados."
echo ""
read -p "Deseja continuar? (S/n): " confirmacao

if [[ "$confirmacao" =~ ^[Nn]$ ]]; then
    echo ""
    echo "❌ Operação cancelada."
    exit 0
fi

echo ""
echo "🔄 Limpando cache do Redis..."
echo ""

# Limpar todo o cache do Redis
docker exec -i whatsapp-clone-redis-1 redis-cli FLUSHALL

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Cache do Redis limpo com sucesso!"
    echo ""
    echo "💡 Dica: Recarregue a página do frontend para ver as mudanças."
else
    echo ""
    echo "❌ Erro ao limpar o cache. Verifique se o container do Redis está rodando."
    exit 1
fi
