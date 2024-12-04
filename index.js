const axios = require('axios');
const crypto = require('crypto');
const AsteriskAmiClient = require('asterisk-ami-client');

// Configuración API
const apiConfig = {
    baseUrl: 'https://pbx.notaria62bogota.com:8089/api',
    username: 'api_notaria62',
    password: 'Notaria62*',
    version: '1.0'
};
let apiCookie = null;

// Configuración AMI
const amiConfig = {
    host: 'pbx.notaria62bogota.com',
    port: 7777,
    username: 'api_notaria62',
    secret: 'Notaria62*'
};

let radicado = ''; // Almacenar los dígitos ingresados

// Autenticación API
async function authenticateApi() {
    try {
        console.log('Autenticando en API...');
        const challengeResponse = await axios.post(apiConfig.baseUrl, {
            request: {
                action: 'challenge',
                user: apiConfig.username,
                version: apiConfig.version
            }
        }, {
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });

        const challenge = challengeResponse.data.response.challenge;
        const token = crypto.createHash('md5').update(challenge + apiConfig.password).digest('hex');

        const loginResponse = await axios.post(apiConfig.baseUrl, {
            request: {
                action: 'login',
                user: apiConfig.username,
                token,
                version: apiConfig.version
            }
        }, {
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });

        if (loginResponse.data.status === 0) {
            apiCookie = loginResponse.data.response.cookie;
            console.log(`Autenticación API exitosa. Cookie: ${apiCookie}`);
        } else {
            throw new Error('Error en la autenticación API');
        }
    } catch (error) {
        console.error('Error autenticando en API:', error.message);
        throw error;
    }
}

// Conexión al AMI
async function connectAmi() {
    const amiClient = new AsteriskAmiClient();
    try {
        console.log('Conectando al AMI...');
        await amiClient.connect(amiConfig.username, amiConfig.secret, {
            host: amiConfig.host,
            port: amiConfig.port
        });
        console.log('Conexión AMI exitosa. Monitoreando eventos...');

        amiClient.on('event', async (event) => {
            if (event.Event === 'DialEnd' && event.DestCallerIDNum === '1098' && event.DialStatus === 'ANSWER') {
                console.log(`Llamada contestada en la extensión ${event.DestCallerIDNum}. Canal: ${event.DestChannel}`);
                radicado = ''; // Resetear el radicado ingresado
                //await playPrompt(event.DestCallerIDNum, 'welcome-message'); // Reproducir mensaje de bienvenida
                await originatePlayback(event.Channel, 'getRad-ini'); // Reproducir mensaje de bienvenida
            }

            if (event.Event === 'DTMFEnd' && event.CallerIDNum === '1098') {
                const digit = event.Digit;
                if (digit === '#') {

                    console.log(`Consultando el radicado: ${radicado}...`);
                    await consultarRadicado(radicado)
                        .then(response => {
                            const respuesta = response?.data?.respuesta?.[0];
                            const estado = respuesta?.EstadoTramite || 'No encontrado';
                            
                            console.log(`Estado del trámite: ${estado}`);
                             playPrompt(event.Channel, `El estado del radicado es: ${estado}`);
                            setTimeout(() =>  hangUpCall(event.Channel), 3000); // Colgar después de 3 segundos
                        })
                        .catch(error => console.error('Error al consultar el API:', error))
                        .finally(() => {
                            radicado = '';
                        });
                    // console.log(`Radicado ingresado: ${radicado}`);
                    // const estadoRadicado = await consultarRadicado(radicado); // Consultar radicado en API
                    // await playPrompt(event.Channel, `El estado del radicado es: ${estadoRadicado}`);
                    // await playPrompt(event.Channel, 'goodbye-message'); // Reproducir despedida
                    // await hangUpCall(event.Channel); // Colgar llamada
                } else {
                    radicado += digit;
                    console.log(`Dígito capturado: ${digit}, Radicado actual: ${radicado}`);
                }
            }
        });

        amiClient.on('error', (error) => {
            console.error('Error en AMI:', error.message);
        });

        amiClient.on('disconnect', () => {
            console.log('Desconectado del AMI.');
        });

    } catch (error) {
        console.error('Error conectando al AMI:', error.message);
    }
}


// Función para originar un canal de reproducción usando AMI
async function originatePlayback(channel, audioFile) {
    try {
        console.log(`Originando reproducción de ${audioFile} en el canal: ${channel}`);
        const originateResponse = await axios.post(apiConfig.baseUrl, {
            request: {
                action: 'Originate',
                cookie: apiCookie,
                channel,
                application: 'Playback',
                data: audioFile
            }
        }, {
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });
        
        if (originateResponse.data.status === 0) {
            console.log(`Reproducción de ${audioFile} iniciada con éxito.`);
        } else {
            console.error('Error en Originate:', originateResponse.data);
        }
    } catch (error) {
        console.error('Error al originar reproducción:', error.message);
    }
}

// Reproducir mensaje
async function playPrompt(channel, prompt) {
    try {
        console.log(`Reproduciendo mensaje: ${prompt} en el canal: ${channel}`);
        const response = await axios.post(apiConfig.baseUrl, {
            request: {
                action: 'playPromptByOrg',
                cookie: apiCookie,
                channel,
                prompt
            }
        }, {
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });
        if (response.data.status === 0) {
            console.log(`Mensaje "${prompt}" enviado correctamente para reproducción.`);
            console.log('Respuesta completa:', response.data); // Muestra toda la respuesta para diagnóstico
        } else {
            console.error(`Error al enviar mensaje "${prompt}":`, response.data);
        }

    } catch (error) {
        console.error(`Error al reproducir mensaje (${prompt}):`, error.message);
    }
}

// // Consultar radicado en el endpoint
// async function consultarRadicado(radicado) {
//     try {
//         console.log(`Consultando radicado: ${radicado}`);
//         const response = await axios.get(`https://adc-api.notaria62bogota.com/soap-signo/consultar-radicados/${radicado}`);
//         const estado = response.data?.respuesta?.[0]?.EstadoTramite || 'No encontrado';
//         console.log(`Estado del radicado ${radicado}: ${estado}`);
//         return estado;
//     } catch (error) {
//         console.error('Error al consultar radicado:', error.message);
//         return 'Error en consulta';
//     }
// }

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

// Colgar llamada
async function hangUpCall(channel) {
    try {
        console.log(`Colgando llamada en el canal: ${channel}`);
        await axios.post(apiConfig.baseUrl, {
            request: {
                action: 'Hangup',
                cookie: apiCookie,
                channel
            }
        }, {
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });
    } catch (error) {
        console.error('Error al colgar llamada:', error.message);
    }
}

// Flujo principal
(async () => {
    try {
        await authenticateApi();
        connectAmi();
    } catch (error) {
        console.error('Error en el flujo principal:', error.message);
    }
})();
