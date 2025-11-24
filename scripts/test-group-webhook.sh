#!/bin/bash

# Script para testar webhook de mensagens de grupo da Evolution API
# Simula diferentes estruturas de payload que a Evolution API pode enviar

API_URL="${API_URL:-http://localhost:3001}"

echo "🧪 Testando webhook de grupo - Evolution API"
echo "API URL: $API_URL/api/webhook/evolution"
echo ""

# Teste 1: Estrutura Evolution API v2 - subject no raiz
echo "📝 Teste 1: Subject no nível raiz (Evolution API v2)"
curl -X POST "$API_URL/api/webhook/evolution" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "messages.upsert",
    "instance": "test-instance",
    "data": {
      "key": {
        "remoteJid": "120363123456789012@g.us",
        "fromMe": false,
        "id": "TEST_MSG_001"
      },
      "message": {
        "conversation": "Mensagem de teste no grupo"
      },
      "subject": "Grupo de Trabalho",
      "pushName": "João Silva",
      "participant": "5511999999999@s.whatsapp.net",
      "messageTimestamp": "'$(date +%s)'"
    }
  }' | jq

echo ""
echo "---"
echo ""

# Teste 2: Estrutura WhatsApp Web - messageContextInfo
echo "📝 Teste 2: Subject em messageContextInfo (WhatsApp Web)"
curl -X POST "$API_URL/api/webhook/evolution" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "messages.upsert",
    "data": {
      "key": {
        "remoteJid": "120363987654321098@g.us",
        "fromMe": false,
        "id": "TEST_MSG_002"
      },
      "message": {
        "conversation": "Outra mensagem de teste",
        "messageContextInfo": {
          "subject": "Equipe de Desenvolvimento"
        }
      },
      "pushName": "Maria Santos",
      "participant": "5511988888888@s.whatsapp.net",
      "messageTimestamp": "'$(date +%s)'"
    }
  }' | jq

echo ""
echo "---"
echo ""

# Teste 3: Estrutura com groupData
echo "📝 Teste 3: Subject em groupData"
curl -X POST "$API_URL/api/webhook/evolution" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "messages.upsert",
    "data": {
      "key": {
        "remoteJid": "120363555555555555@g.us",
        "fromMe": false,
        "id": "TEST_MSG_003"
      },
      "message": {
        "conversation": "Mensagem de teste 3"
      },
      "groupData": {
        "subject": "Família da Silva",
        "description": "Grupo da família"
      },
      "pushName": "Pedro Silva",
      "participant": "5511977777777@s.whatsapp.net",
      "messageTimestamp": "'$(date +%s)'"
    }
  }' | jq

echo ""
echo "---"
echo ""

# Teste 4: Estrutura com chatName (fallback)
echo "📝 Teste 4: Usando chatName como fallback"
curl -X POST "$API_URL/api/webhook/evolution" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "messages.upsert",
    "data": {
      "key": {
        "remoteJid": "120363444444444444@g.us",
        "fromMe": false,
        "id": "TEST_MSG_004"
      },
      "message": {
        "conversation": "Mensagem de teste 4"
      },
      "chatName": "Amigos do Futebol",
      "pushName": "Carlos Souza",
      "participant": "5511966666666@s.whatsapp.net",
      "messageTimestamp": "'$(date +%s)'"
    }
  }' | jq

echo ""
echo "---"
echo ""

echo "✅ Testes concluídos!"
echo ""
echo "🔍 Verifique os logs do backend para ver a resolução de nomes:"
echo "   tail -f backend/logs/combined.log | grep 'Resolução de nome de grupo'"
echo ""
echo "📊 Verifique os grupos criados no banco:"
echo "   psql -U whatsapp_user -d whatsapp_clone -c 'SELECT id, group_id, nome FROM grupos ORDER BY updated_at DESC LIMIT 10;'"
