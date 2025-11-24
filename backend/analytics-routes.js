// analytics-routes.js - Endpoints de analytics
const express = require('express');
const router = express.Router();

module.exports = (pool) => {

  router.get('/metricas', async (req, res) => {
    const { data_inicio, data_fim } = req.query;
    try {
      const result = await pool.query(`
        SELECT 
          DATE(timestamp) as data,
          COUNT(*) as total_mensagens,
          COUNT(CASE WHEN is_from_me THEN 1 END) as enviadas,
          COUNT(CASE WHEN NOT is_from_me THEN 1 END) as recebidas,
          COUNT(CASE WHEN sentiment = 'positive' THEN 1 END) as positivas,
          COUNT(CASE WHEN sentiment = 'negative' THEN 1 END) as negativas
        FROM mensagens
        WHERE timestamp BETWEEN $1 AND $2
        GROUP BY DATE(timestamp)
        ORDER BY data
      `, [data_inicio, data_fim]);
      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/analise/sentimentos', async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT sentiment as name, COUNT(*) as value
        FROM mensagens
        WHERE sentiment IS NOT NULL
        GROUP BY sentiment
        ORDER BY value DESC
      `);
      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/analise/intencoes', async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT intent, COUNT(*) as total
        FROM mensagens
        WHERE intent IS NOT NULL
        GROUP BY intent
        ORDER BY total DESC
        LIMIT 10
      `);
      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
