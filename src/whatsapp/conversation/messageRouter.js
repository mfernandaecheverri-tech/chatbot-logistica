//este script se encarga de enrutar los mensajes recibidos por WhatsApp 
// y determinar la respuesta adecuada según el flujo de conversación 
// y el rol del usuario (administrador o trabajador).

const {
    menuAdministrador,
    menuTrabajador
} = require('./menu');

const {
    normalizarMensaje,
    identificarComando,
    identificarOpcion
} = require('./commands');

const {
    esAdministrador
} = require('../../../database/people');

const {
    crearEvento,
    agregarPreguntaEvento,
    consultarEventos
} = require('../../../database/events');

const {
    get
} = require('../../../database/db');

// Almacena temporalmente las sesiones de los usuarios.
const sesiones = new Map();

// Opciones del menú administrativo.
const opcionesAdministrador = {
    1: { nombre: 'CREAR EVENTO', flujo: 'CREAR_EVENTO' },
    2: { nombre: 'VER EVENTOS', flujo: 'VER_EVENTOS' },
    3: { nombre: 'EDITAR EVENTO', flujo: 'EDITAR_EVENTO' },
    4: { nombre: 'CERRAR EVENTO', flujo: 'CERRAR_EVENTO' },
    5: { nombre: 'VER INSCRITOS', flujo: 'VER_INSCRITOS' }
};

// Opciones del menú de trabajadores.
const opcionesTrabajador = {
    1: { nombre: 'VER EVENTOS DISPONIBLES', flujo: 'VER_EVENTOS' },
    2: { nombre: 'INSCRIBIRME A UN EVENTO', flujo: 'INSCRIBIR_EVENTO' },
    3: { nombre: 'CONSULTAR MIS INSCRIPCIONES', flujo: 'CONSULTAR_INSCRIPCIONES' },
    4: { nombre: 'CANCELAR MI INSCRIPCION', flujo: 'CANCELAR_INSCRIPCION' },
    5: { nombre: 'AYUDA', flujo: 'AYUDA' }
};

// Devuelve el menú correspondiente al rol.
function obtenerMenu(rol) {
    return rol === 'ADMIN'
        ? menuAdministrador()
        : menuTrabajador();
}

// Reinicia la sesión y regresa al menú principal.
function regresarMenu(sesion) {
    sesion.flujo = 'MENU';
    sesion.etapa = 'MENU_PRINCIPAL';
    delete sesion.datosEvento;
}

// Convierte DD/MM/AAAA a AAAA-MM-DD y valida la fecha.
function convertirFecha(fecha) {
    const coincidencia = fecha.trim().match(
        /^(\d{2})\/(\d{2})\/(\d{4})$/
    );

    if (!coincidencia) return null;

    const dia = Number(coincidencia[1]);
    const mes = Number(coincidencia[2]);
    const anio = Number(coincidencia[3]);

    const fechaUTC = new Date(Date.UTC(anio, mes - 1, dia));

    if (
        fechaUTC.getUTCFullYear() !== anio ||
        fechaUTC.getUTCMonth() !== mes - 1 ||
        fechaUTC.getUTCDate() !== dia
    ) {
        return null;
    }

    const iso = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

    // Obtener la fecha actual en la zona horaria local del servidor.
    const hoy = new Date();
    const fechaActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;

    if (iso < fechaActual) return null;

    return iso;
}

// Valida una hora en formato de 24 horas HH:MM.
function validarHora(hora) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(hora.trim());
}

// Formatea las fechas ISO para mostrarlas al administrador.
function formatearFechas(fechas) {
    return fechas.map(fecha => {
        const [anio, mes, dia] = fecha.split('-');
        return `${dia}/${mes}/${anio}`;
    }).join(', ');
}

// Consulta y muestra los eventos según el rol del usuario.
async function mostrarEventos(rol) {

    try {
        // Los administradores consultan todos los eventos.
        // Los trabajadores consultan solamente los abiertos.
        const eventos = await consultarEventos(rol !== 'ADMIN');

        if (eventos.length === 0) {
            return 'No hay eventos registrados para mostrar.\n\n' +
                obtenerMenu(rol);
        }

        const listaEventos = eventos.map(evento => {

            // Convertir las fechas almacenadas en JSON a un arreglo.
            let fechas = [];

            try {
                fechas = JSON.parse(evento.fecha_evento);
            } catch (error) {
                fechas = [];
            }

            const fechasTexto = fechas.length > 0
                ? formatearFechas(fechas)
                : 'No disponibles';

            return `EVENTO #${evento.id_evento}

Nombre: ${evento.nombre}
Descripción: ${evento.descripcion || 'Sin descripción'}
Ubicación: ${evento.ubicacion || 'No especificada'}
Fechas: ${fechasTexto}
Hora: ${evento.hora_inicio} - ${evento.hora_fin}
Cupos: ${evento.cupo}
Estado: ${evento.estado}`;

        }).join('\n\n-------------------------\n\n');

        return `EVENTOS ${rol === 'ADMIN' ? 'REGISTRADOS' : 'DISPONIBLES'}

${listaEventos}

${obtenerMenu(rol)}`;

    } catch (error) {

        console.error('Error al consultar eventos:', error.message);

        return 'Ocurrió un error al consultar los eventos. Inténtalo nuevamente.\n\n' +
            obtenerMenu(rol);
    }
}

// Inicia el flujo de creación de eventos.
async function iniciarCreacionEvento(numero, sesion) {

    // Consultar el ID del administrador activo
    const administrador = await get(
        `SELECT id_administrador FROM administradores
         WHERE numero_whatsapp = ? AND activo = 1`,
        [numero]
    );

    if (!administrador) {
        return 'No tienes autorización para crear eventos.';
    }

    sesion.flujo = 'CREAR_EVENTO';
    sesion.etapa = 'NOMBRE';

    sesion.datosEvento = {
        nombre: '',
        descripcion: '',
        ubicacion: '',
        fechas: [],
        hora_inicio: '',
        hora_fin: '',
        cupo: null,
        id_administrador: administrador.id_administrador ,
        preguntas: []
    };

    return 'Vamos a crear un nuevo evento.\n\n¿Cuál es el nombre del evento?';
}

// Muestra el resumen antes de guardar el evento.
function mostrarResumenEvento(datos) {

    const preguntas = datos.preguntas.length > 0
        ? datos.preguntas.map((pregunta, indice) =>
            `${indice + 1}. ${pregunta}`
        ).join('\n')
        : 'No se agregaron preguntas.';

    return `RESUMEN DEL EVENTO

Nombre: ${datos.nombre}
Descripción: ${datos.descripcion}
Ubicación: ${datos.ubicacion}
Fechas: ${formatearFechas(datos.fechas)}
Hora de inicio: ${datos.hora_inicio}
Hora de finalización: ${datos.hora_fin}
Cupo: ${datos.cupo}

Preguntas para los trabajadores:
${preguntas}

¿Deseas guardar este evento?

Responde SI para confirmar o NO para cancelar.`;
}

// Procesa cada etapa del flujo de creación.
async function procesarCreacionEvento(sesion, mensaje) {

    const datos = sesion.datosEvento;
    const respuesta = mensaje.trim();
    const texto = normalizarMensaje(respuesta);

    switch (sesion.etapa) {

        case 'NOMBRE':

            if (!respuesta) {
                return 'El nombre no puede estar vacío. Escribe el nombre del evento.';
            }

            datos.nombre = respuesta;
            sesion.etapa = 'DESCRIPCION';

            return 'Escribe una descripción para el evento.';

        case 'DESCRIPCION':

            if (!respuesta) {
                return 'La descripción no puede estar vacía. Inténtalo nuevamente.';
            }

            datos.descripcion = respuesta;
            sesion.etapa = 'UBICACION';

            return '¿En qué lugar se realizará el evento?';

        case 'UBICACION':

            if (!respuesta) {
                return 'La ubicación no puede estar vacía. Inténtalo nuevamente.';
            }

            datos.ubicacion = respuesta;
            sesion.etapa = 'FECHAS';

            return 'Escribe una o varias fechas para el evento en formato DD/MM/AAAA, separadas por comas.\n\nEjemplo: 15/12/2026, 16/12/2026';

        case 'FECHAS': {

            const fechasIngresadas = respuesta.split(',').map(fecha => fecha.trim());

            if (fechasIngresadas.some(fecha => !fecha)) {
                return 'Hay una fecha vacía. Escribe las fechas separadas por comas.';
            }

            const fechasISO = fechasIngresadas.map(convertirFecha);

            if (fechasISO.some(fecha => fecha === null)) {
                return 'Una o varias fechas no son válidas o están en el pasado.\n\nUtiliza el formato DD/MM/AAAA e inténtalo nuevamente.';
            }

            const fechasUnicas = new Set(fechasISO);

            if (fechasUnicas.size !== fechasISO.length) {
                return 'No puedes ingresar fechas repetidas. Escribe nuevamente la lista de fechas.';
            }

            datos.fechas = fechasISO;

            sesion.etapa = 'HORA_INICIO';

            return '¿A qué hora inicia el evento? Utiliza el formato de 24 horas HH:MM.\n\nEjemplo: 08:30';
        }

        case 'HORA_INICIO':

            if (!validarHora(respuesta)) {
                return 'La hora no es válida. Utiliza el formato HH:MM de 24 horas. Ejemplo: 08:30.';
            }

            datos.hora_inicio = respuesta;
            sesion.etapa = 'HORA_FIN';

            return '¿A qué hora finaliza el evento? Utiliza el formato HH:MM.';

        case 'HORA_FIN':

            if (!validarHora(respuesta)) {
                return 'La hora no es válida. Utiliza el formato HH:MM de 24 horas.';
            }

            datos.hora_fin = respuesta;
            sesion.etapa = 'CUPO';

            return '¿Cuántos cupos tendrá el evento?';

        case 'CUPO': {

            const cupo = Number(respuesta);

            if (!Number.isInteger(cupo) || cupo <= 0) {
                return 'La cantidad de cupos debe ser un número entero mayor que cero.';
            }

            datos.cupo = cupo;
            sesion.etapa = 'AGREGAR_PREGUNTAS';

            return '¿Deseas agregar preguntas de SÍ/NO para los trabajadores que se inscriban?\n\nResponde SI para agregar preguntas o NO para continuar sin preguntas.';
        }

        case 'AGREGAR_PREGUNTAS':

            if (texto === 'SI') {
                sesion.etapa = 'TEXTO_PREGUNTA';

                return 'Escribe la primera pregunta que deberán responder los trabajadores.\n\nEjemplo: ¿Tienes experiencia en manejo de mercancía?';
            }

            if (texto === 'NO') {
                sesion.etapa = 'CONFIRMACION';

                return mostrarResumenEvento(datos);
            }

            return 'Respuesta no válida. Escribe SI para agregar preguntas o NO para continuar sin ellas.';

        case 'TEXTO_PREGUNTA':

            if (!respuesta) {
                return 'La pregunta no puede estar vacía. Escribe nuevamente la pregunta.';
            }

            if (datos.preguntas.length >= 10) {
                sesion.etapa = 'CONFIRMACION';

                return 'Has alcanzado el máximo de 10 preguntas.\n\n' +
                    mostrarResumenEvento(datos);
            }

            datos.preguntas.push(respuesta);
            sesion.etapa = 'MAS_PREGUNTAS';

            return 'Pregunta guardada temporalmente.\n\n¿Deseas agregar otra pregunta?\n\nResponde SI o NO.';

        case 'MAS_PREGUNTAS':

            if (texto === 'SI') {
                sesion.etapa = 'TEXTO_PREGUNTA';

                return 'Escribe la siguiente pregunta.';
            }

            if (texto === 'NO') {
                sesion.etapa = 'CONFIRMACION';

                return mostrarResumenEvento(datos);
            }

            return 'Respuesta no válida. Escribe SI para agregar otra pregunta o NO para finalizar.';

        case 'CONFIRMACION':

            if (texto === 'NO') {
                regresarMenu(sesion);

                return 'La creación del evento ha sido cancelada. No se guardó ningún dato.\n\n' +
                    obtenerMenu(sesion.rol);
            }

            if (texto !== 'SI') {
                return 'No reconocí tu respuesta. Escribe SI para guardar el evento o NO para cancelar.';
            }

            try {

                // Guardar las fechas como JSON dentro del campo TEXT.
                const fechaJSON = JSON.stringify(datos.fechas);

                const eventoId = await crearEvento({
                    nombre: datos.nombre,
                    descripcion: datos.descripcion,
                    ubicacion: datos.ubicacion,
                    fecha_evento: fechaJSON,
                    hora_inicio: datos.hora_inicio,
                    hora_fin: datos.hora_fin,
                    cupo: datos.cupo,
                    id_administrador: datos.id_administrador
                });

                // Guardar las preguntas asociadas al evento.
                for (let i = 0; i < datos.preguntas.length; i++) {

                    await agregarPreguntaEvento(
                        eventoId,
                        datos.preguntas[i],
                        'SI_NO',
                        null,
                        0,
                        i + 1
                    );
                }

                regresarMenu(sesion);

                return `¡Evento creado exitosamente!

Identificador del evento: ${eventoId}

El evento quedó registrado en estado ABIERTO.

${obtenerMenu(sesion.rol)}`;

            } catch (error) {

                console.error('Error al crear el evento:', error.message);

                regresarMenu(sesion);

                return 'Ocurrió un error al guardar el evento. Por favor, verifica la información y vuelve a intentarlo.\n\n' +
                    obtenerMenu(sesion.rol);
            }

        default:
            regresarMenu(sesion);

            return 'Se produjo un error en el flujo. Regresamos al menú principal.\n\n' +
                obtenerMenu(sesion.rol);
    }
}

// Procesa los mensajes recibidos por WhatsApp.
async function procesarMensaje(numeroWhatsapp, mensaje) {

    if (!numeroWhatsapp || typeof mensaje !== 'string') {
        throw new Error('El número de WhatsApp y el mensaje son obligatorios.');
    }

    const numero = String(numeroWhatsapp).trim();
    const texto = normalizarMensaje(mensaje);

    // Consultar si el usuario es administrador activo.
    const esAdmin = await esAdministrador(numero);
    const rolActual = esAdmin ? 'ADMIN' : 'TRABAJADOR';

    // Recuperar o crear la sesión.
    let sesion = sesiones.get(numero);

    if (!sesion || sesion.rol !== rolActual) {

        sesion = {
            rol: rolActual,
            flujo: 'MENU',
            etapa: 'MENU_PRINCIPAL'
        };

        sesiones.set(numero, sesion);

        return obtenerMenu(rolActual);
    }

    // Reconocer comandos generales antes de procesar las etapas.
    const comando = identificarComando(texto);

    if (comando === 'MENU') {

        regresarMenu(sesion);

        return 'Regresaste al menú principal.\n\n' +
            obtenerMenu(sesion.rol);
    }

    if (comando === 'CANCELAR') {

        if (sesion.flujo === 'MENU') {
            return 'No tienes ninguna operación en curso.\n\n' +
                obtenerMenu(sesion.rol);
        }

        regresarMenu(sesion);

        return 'La operación actual ha sido cancelada.\n\n' +
            obtenerMenu(sesion.rol);
    }

    if (comando === 'VOLVER') {
        return 'Por el momento no hay un paso anterior al que puedas regresar.';
    }

    // Si el usuario está creando un evento, procesar su etapa actual.
    if (sesion.flujo === 'CREAR_EVENTO') {
        return await procesarCreacionEvento(sesion, mensaje);
    }

    // Procesar opciones del menú principal.
    if (sesion.flujo === 'MENU') {

        const opcion = identificarOpcion(texto);

        if (opcion === null) {
            return 'No reconocí tu respuesta. Por favor, selecciona una opción del 1 al 5.\n\n' +
                obtenerMenu(sesion.rol);
        }

        const opciones = sesion.rol === 'ADMIN'
            ? opcionesAdministrador
            : opcionesTrabajador;

        const seleccion = opciones[opcion];

        // Iniciar la creación de eventos.
        if (seleccion.flujo === 'CREAR_EVENTO' && sesion.rol === 'ADMIN') {
            return await iniciarCreacionEvento(numero, sesion);
        }
        // Consultar eventos.
        if (seleccion.flujo === 'VER_EVENTOS') {
            return await mostrarEventos(sesion.rol);
        }
        // Los demás flujos se conectarán posteriormente.
        sesion.flujo = seleccion.flujo;
        sesion.etapa = 'INICIO';

        return `Has seleccionado: ${seleccion.nombre}.\n\n` +
            'Esta funcionalidad todavía está en desarrollo.\n' +
            'Escribe MENU para regresar al menú principal.';
    }

    return 'No pude procesar tu mensaje. Escribe MENU para regresar al menú principal.';
}

module.exports = {
    procesarMensaje
};