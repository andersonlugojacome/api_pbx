const AsteriskAmiClient = require('asterisk-ami-client');
const axios = require('axios');

const client = new AsteriskAmiClient();

const config = {
    host: 'pbx.notaria62bogota.com',
    port: 7777,
    username: 'ami_notaria62',
    secret: '$$Notaria62'
};

let currentRadicado = '';
let userChannel = ''; // Canal del usuario que llama

client.connect(config.username, config.secret, { host: config.host, port: config.port })
    .then(() => {
        console.log('Conectado al AMI. Capturando eventos...');

        client.on('event', event => {
            // Detectar cuando la llamada a la extensión 1098 es contestada
            if (event.Event === 'DialEnd' && event.DestCallerIDNum === '1098' && event.DialStatus === 'ANSWER') {
                userChannel = event.DestChannel; // Canal destino
                console.log(`Llamada contestada en el canal: ${userChannel}`);
                reproducirAnuncio(userChannel, 'getRad-ini'); // Reproducir anuncio
            }

            // Capturar eventos DTMFEnd para la consulta
            if (event.Event === 'DTMFEnd' && event.CallerIDNum === '1098') {
                const digit = event.Digit;

                if (digit === '#') {
                    console.log(`Consultando el radicado: ${currentRadicado}...`);
                    consultarRadicado(currentRadicado)
                        .then(response => {
                            const respuesta = response?.data?.respuesta?.[0];
                            const estado = respuesta?.EstadoTramite || 'No encontrado';
                            const fechaEscritura = respuesta?.fecha_escritura || 'No disponible';
                            console.log(`Estado del trámite: ${estado}, Fecha de escritura: ${fechaEscritura}`);
                            reproducirMensaje(userChannel, 'estado_tramite');
                            setTimeout(() => colgarLlamada(userChannel), 3000); // Colgar después de 3 segundos
                        })
                        .catch(error => console.error('Error al consultar el API:', error))
                        .finally(() => {
                            currentRadicado = '';
                        });
                } else {
                    currentRadicado += digit;
                    console.log(`Dígito capturado: ${digit}, Radicado actual: ${currentRadicado}`);
                }
            }
        });

        client.on('disconnect', () => console.log('Desconectado del AMI.'));
        client.on('error', error => console.error('Error:', error));
    })
    .catch(error => console.error('Error al conectar:', error));

// Función para consultar el API
async function consultarRadicado(numeroRadicado) {
    try {
        const url = `https://adc-api.notaria62bogota.com/soap-signo/consultar-radicados/${numeroRadicado}`;
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error('Error al consultar el API:', error.message);
        throw error;
    }
}

// Función para reproducir un Announcement en el canal del usuario
function reproducirAnuncio(channel, anuncio) {
    client.action({
        Action: 'Playback',
        Channel: channel,
        File: anuncio // Vincula al Announcement cargado en el UCM
    }, (err, res) => {
        if (err) {
            console.error(`Error al reproducir el anuncio ${anuncio}:`, err);
        } else {
            console.log(`Anuncio ${anuncio} reproducido en el canal ${channel}.`);
        }
    });
}

// Función para reproducir un mensaje específico
function reproducirMensaje(channel, mensaje) {
    client.action({
        Action: 'Playback',
        Channel: channel,
        File: mensaje
    }, (err, res) => {
        if (err) {
            console.error(`Error al reproducir el mensaje ${mensaje}:`, err);
        } else {
            console.log(`Mensaje ${mensaje} reproducido en el canal ${channel}.`);
        }
    });
}

// Función para colgar la llamada
function colgarLlamada(channel) {
    client.action({
        Action: 'Hangup',
        Channel: channel
    }, (err, res) => {
        if (err) {
            console.error(`Error al colgar la llamada en el canal ${channel}:`, err);
        } else {
            console.log(`Llamada colgada en el canal ${channel}.`);
        }
    });
}
