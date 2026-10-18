const express = require('express');
const path = require('path');
const fs = require('fs');

const { neon } = require("@neondatabase/serverless"); // Conectar base de datos neon

require('dotenv').config()

const sql = neon(process.env.DATABASE_URL); // Neon database
const trafficdataRoute = express.Router();

var traffic_log = new Map([
    ['', {
        id_pc: '',
        sslkeylog: '',
        traffic_data_64: ''
    }]
]);

// trafficdataRoute.get('/traffic-logs', (req, res) => { // Borrar en produccion
//     res.send(Array.from(traffic_log));
// });

// trafficdataRoute.get('/traffic-log', (req, res) => {
//     res.send(traffic_log.get(req.query.id_pc));
// });

trafficdataRoute.get('/sllkeylog', (req, res) => {
    if (traffic_log.has(req.query.id_pc)) {
        res.setHeader('Content-Disposition', `attachment; filename="ssllog-${req.query.id_pc}.log"`); // Preparar para descarga
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');

        return res.send(traffic_log.get(req.query.id_pc).sslkeylog);
    }

    res.status(404).send('Recurso no encontrado');
});

trafficdataRoute.get('/captured-traffic', (req, res) => {
    if (traffic_log.has(req.query.id_pc)) {
        const trafficData = traffic_log.get(req.query.id_pc);

        if (!trafficData || !trafficData.traffic_data_64) {
            return res.status(404).send('No hay datos de tráfico disponibles');
        }

        try {
            const buffer = Buffer.from(trafficData.traffic_data_64, 'base64');

            if (buffer.length === 0) {
                return res.status(404).send('El archivo está vacío');
            }

            res.attachment(`capture-${req.query.id_pc}.pcap`);
            return res.send(buffer);

        } catch (error) {
            console.error('❌ Error:', error);
            return res.status(500).send('Error al procesar el archivo');
        }

    }

    res.status(404).send('Recurso no encontrado');
});

trafficdataRoute.post('/traffic-log', (req, res) => {
    traffic_log.set(
        req.body.id_pc,
        {
            id_pc: req.body.id_pc,
            sslkeylog: req.body.sslkeylog,
            traffic_data_64: req.body.traffic_data_64
        });
    res.status(200).send('');
});

module.exports = {
    trafficdataRoute
};