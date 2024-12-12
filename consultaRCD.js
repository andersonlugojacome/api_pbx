#!/usr/bin/env node

const axios = require('axios');
const gTTS = require('gtts');
const fs = require('fs');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

// Configuración de la API para consultar el registro civil de defuncion
const apiUrl = 'https://adc-api.notaria62bogota.com/soap-signo/consultar-registro-defuncion/';

// Función para convertir texto a audio en formato .slin
async function generarAudio(estado, uniqueId) {
    const audioPath = `/var/lib/asterisk/sounds/estado-rcd-${uniqueId}.slin`; // Ruta del archivo de audio
    // Verifica si el archivo ya existe
    if (fs.existsSync(audioPath)) {
        const stats = fs.statSync(audioPath); // Obtiene los detalles del archivo
        if (stats.size > 0) {
            console.log(`El archivo de audio ya existe y es válido: ${audioPath}`);
            return;
        } else {
            console.warn(`El archivo de audio existe pero está vacío: ${audioPath}. Se regenerará.`);
        }
    }
    try {
        const tts = new gTTS(estado, 'es');
        const tempWav = `/tmp/estado-rcd-${uniqueId}.wav`;

        // Generar audio en formato WAV
        await new Promise((resolve, reject) => {
            tts.save(tempWav, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });

        // Convertir WAV a SLIN con ffmpeg
        const command = `ffmpeg -y -i ${tempWav} -f s16le -ar 8000 -ac 1 ${audioPath}`;
        await exec(command);
        fs.unlinkSync(tempWav); // Eliminar archivo temporal
    } catch (error) {
        //console.error('Error al generar el audio:', error.message);
    }
}

// Función para consultar el estado del radicado en la API
async function consultar(param, uniqueId) {
    try {
        //console.log(`Consultando radicado: ${param} ... el identificador único es: ${uniqueId}`);
        const response = await axios.get(`${apiUrl}${param}`);

        // Extraer el estado del trámite
        const estado = response.data?.data?.respuesta?.[0]?.estado || 'No encontrado';
       switch (estado) {
            case 'No encontrado':
                await generarAudio(`No se encontró el registro civil de defunción con el número de documento ${param}, le recordamos que solo podemos expedir Registro civil de defuncíon que reposen en está Notaría, Si desea más información, presione dos para ser atentido por nuestro departamento de registro civil.`, uniqueId);
                break;
            case 'Activo':
                await generarAudio(`El registro civil de defunción con el número de documento ${param} se encuentra activo, Para solicitar una copia de su registro civil, envíe un correo electrónico a: registro punto civil arroba notaría sesenta y dos bogotá punto com, escriba en el asunto del correo el tipo de registro que necesita y su número de documento. o si prefiere presione dos para ser atentido por nuestro departamento de registro civil.`, uniqueId);
                break;
            case 'Anulado':
                await generarAudio(`El registro civil de defunción con el número de documento ${param} se encuentra anulado, si desea más información, presione dos para ser atentido por nuestro departamento de registro civil.`, uniqueId);
                break;
        }

    } catch (error) {
        //console.error('Error al consultar el radicado:', error.message);

        // Generar audio de error
        await generarAudio(`Lo sentimos, ocurrió un error al consultar su petición. ${error.message}`);
    }
}

// Obtener el número de radicado desde los argumentos
const param = process.argv[2];
if (!param) {
    console.error('No se proporcionó un número proporcionado.');
    process.exit(1);
}


consultar(param, param);
