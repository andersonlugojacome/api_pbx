#!/usr/bin/env node

const axios = require('axios');
const gTTS = require('gtts');
const fs = require('fs');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

// Configuración de la API
const apiUrl = 'https://adc-api.notaria62bogota.com/soap-signo/consultar-radicados/';
//const audioPath = '/var/lib/asterisk/sounds/estado-radicado.slin'; // Ruta del archivo de audio

// Función para convertir texto a audio en formato .slin
async function generarAudio(estado, uniqueId) {
    const audioPath = `/var/lib/asterisk/sounds/estado-radicado-${uniqueId}.slin`; // Ruta del archivo de audio
    try {
        console.log(`Generando audio para el estado: "${estado}"`);
        const tts = new gTTS(estado, 'es');
        const tempWav = `/tmp/estado-radicado-${uniqueId}.wav`;

        // Generar audio en formato WAV
        await new Promise((resolve, reject) => {
            tts.save(tempWav, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });

        console.log('Archivo WAV generado correctamente.');

        // Convertir WAV a SLIN con ffmpeg
        const command = `ffmpeg -y -i ${tempWav} -f s16le -ar 8000 -ac 1 ${audioPath}`;
        await exec(command);
        console.log('Archivo SLIN generado correctamente.');
        fs.unlinkSync(tempWav); // Eliminar archivo temporal
    } catch (error) {
        console.error('Error al generar el audio:', error.message);
    }
}

// Función para consultar el estado del radicado en la API
async function consultarRadicado(radicado, uniqueId) {
    try {
        console.log(`Consultando radicado: ${radicado} ... el identificador único es: ${uniqueId}`);
        const response = await axios.get(`${apiUrl}${radicado}`);

        // Extraer el estado del trámite
        const estadoTramite = response.data?.data?.respuesta?.[0]?.EstadoTramite || 'No encontrado';
        console.log(`Estado del radicado ${radicado}: ${estadoTramite}`);

        // Generar el audio para Asterisk
        await generarAudio(`El estado de su radicado número ${radicado} es: ${estadoTramite}`, uniqueId);
    } catch (error) {
        console.error('Error al consultar el radicado:', error.message);

        // Generar audio de error
        await generarAudio('Lo sentimos, ocurrió un error al consultar su radicado.');
    }
}

// Obtener el número de radicado desde los argumentos
const radicado = process.argv[2];
if (!radicado) {
    console.error('No se proporcionó un número de radicado.');
    process.exit(1);
}
const uniqueId = process.argv[3];
if (!uniqueId) {
    console.error('No se proporcionó un identificador único.');
    process.exit(1);
}

consultarRadicado(radicado, uniqueId);
