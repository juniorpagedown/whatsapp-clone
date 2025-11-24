# Evolution API - WhatsApp Integration

Este diretório contém a configuração do Docker Compose para a Evolution API v2.

## 📋 Pré-requisitos

1. Docker e Docker Compose instalados
2. Rede Docker `whatsapp-clone_default` criada (criada automaticamente ao rodar o projeto principal)

## 🚀 Instalação

### 1. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Edite o arquivo `.env` e configure:

- `DB_PASSWORD`: Senha do PostgreSQL (mesma do projeto principal ou diferente)
- `EVOLUTION_API_KEY`: Chave de autenticação da API (MUDE PARA UMA CHAVE SEGURA!)

### 2. Iniciar a Evolution API

```bash
docker-compose up -d
```

### 3. Verificar logs

```bash
docker-compose logs -f evolution-api
```

### 4. Acessar a API

A Evolution API estará disponível em: **http://localhost:8080**

## 🔑 Autenticação

Todas as requisições para a Evolution API devem incluir o header:

```
apikey: sua-chave-configurada-no-env
```

## 📚 Documentação

- **Documentação oficial**: https://doc.evolution-api.com/
- **API Reference**: https://doc.evolution-api.com/v2/api-reference
- **GitHub**: https://github.com/EvolutionAPI/evolution-api

## 🔧 Comandos Úteis

### Parar os serviços
```bash
docker-compose down
```

### Reiniciar a API
```bash
docker-compose restart evolution-api
```

### Ver logs
```bash
docker-compose logs -f
```

### Remover tudo (incluindo volumes)
```bash
docker-compose down -v
```

## 🔗 Integração com o Projeto Principal

Para integrar com o backend do WhatsApp Clone:

1. Configure o webhook global no `.env`:
   ```
   WEBHOOK_GLOBAL_URL=http://backend:3001/api/webhook/evolution
   ```

2. Atualize o `.env` do projeto principal com:
   ```
   EVOLUTION_API_URL=http://evolution-api:8080
   EVOLUTION_API_KEY=sua-chave-configurada
   ```

3. Reinicie os serviços

## 📊 Banco de Dados

A Evolution API usa um PostgreSQL separado na porta **5433** (para não conflitar com o banco principal na porta 5432).

Os dados são persistidos nos volumes:
- `evolution_instances`: Dados das instâncias do WhatsApp
- `evolution_store`: Armazenamento de arquivos
- `evolution_postgres_data`: Dados do PostgreSQL

## ⚠️ Importante

- **Sempre mude a `EVOLUTION_API_KEY` para uma chave segura em produção!**
- A API está configurada para usar a mesma rede Docker do projeto principal
- Os dados são persistidos em volumes Docker
