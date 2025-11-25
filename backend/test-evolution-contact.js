#!/usr/bin/env node

/**
 * Script para testar a busca de contatos na Evolution API
 * Uso: node backend/test-evolution-contact.js &lt;telefone&gt;
 */

const axios = require('axios');

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'junior';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'junior';

async function testEvolutionContact(phone) {
    const normalizedPhone = phone.replace(/\D/g, '');

    console.log(`\n🔍 Buscando contato na Evolution API`);
    console.log(`   Telefone: ${phone} (normalizado: ${normalizedPhone})`);
    console.log(`   Instance: ${EVOLUTION_INSTANCE}\n`);

    const endpoints = [
        `/contacts/findContact/${EVOLUTION_INSTANCE}/${normalizedPhone}`,
        `/contacts/getContact/${EVOLUTION_INSTANCE}/${normalizedPhone}`,
        `/contacts/getStatus/${EVOLUTION_INSTANCE}/${normalizedPhone}`
    ];

    for (const endpoint of endpoints) {
        try {
            console.log(`📡 Testando: ${EVOLUTION_API_URL}${endpoint}`);

            const response = await axios.get(`${EVOLUTION_API_URL}${endpoint}`, {
                headers: {
                    'apikey': EVOLUTION_API_KEY
                },
                timeout: 10000
            });

            console.log(`✅ Sucesso!`);
            console.log(`   Status: ${response.status}`);

            const data = response.data;
            const contact = data?.contact || data?.data || data?.result || data;

            console.log(`\n📋 Dados do contato:`);
            console.log(`   Nome: ${contact?.name || contact?.pushname || contact?.pushName || 'N/A'}`);
            console.log(`   Telefone: ${contact?.id || contact?.phone || 'N/A'}`);
            console.log(`   Avatar: ${contact?.profilePicUrl || contact?.avatar || 'N/A'}`);
            console.log(`\n📦 Resposta completa:`);
            console.log(JSON.stringify(contact, null, 2));

            return;
        } catch (error) {
            const status = error?.response?.status;
            console.log(`❌ Falhou (Status: ${status || 'N/A'})`);

            if (error.response?.data) {
                console.log(`   Erro: ${JSON.stringify(error.response.data)}`);
            } else {
                console.log(`   Erro: ${error.message}`);
            }
            console.log('');
        }
    }

    console.log('⚠️  Nenhum endpoint retornou dados do contato\n');
}

// Uso
const args = process.argv.slice(2);

if (args.length === 0) {
    console.log('Uso: node test-evolution-contact.js &lt;telefone&gt;');
    console.log('Exemplo: node test-evolution-contact.js "554140421212"');
    process.exit(1);
}

const [phone] = args;
testEvolutionContact(phone).catch(error => {
    console.error('❌ Erro:', error.message);
    process.exit(1);
});
