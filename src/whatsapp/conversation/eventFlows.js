//Script para la creación, consulta, edición y cierre de eventos.

const { normalizarMensaje } = require('./commands');
const {crearEvento, agregarPreguntaEvento, consultarEventos, obtenerEventoPorId, actualizarEvento} = require('../../../database/events');
const {validarHora, validarTexto, validarNumeroPositivo, convertirListaFechas, formatearFechas} = require('./validators');
const { get } = require('../../../database/db');
const { exportarEventoCSV } = require('../../../database/reports');

// Recibe las funciones del router que necesita.
function crearEventFlows({ obtenerMenu, regresarMenu }) {
    // Convierte el ID numérico en un código EV0001.
    function formatearCodigoEvento(id) {
        return `EV${String(id).padStart(4, '0')}`;
    }

    // Inicia el flujo para consultar y exportar los inscritos.
    async function iniciarVerInscritos(numero, sesion) {

        const administrador = await get(
            `SELECT id_administrador
            FROM administradores
            WHERE numero_whatsapp = ? AND activo = 1`,
            [numero]
        );

        if (!administrador) {
            return 'No tienes autorización para consultar los inscritos.';
        }

        sesion.flujo = 'VER_INSCRITOS';
        sesion.etapa = 'CODIGO_EVENTO';

        sesion.datosReporte = {
            id_administrador: administrador.id_administrador
        };

        return 'CONSULTAR INSCRITOS\n\n' +
            'Escribe el código del evento del cual deseas consultar los inscritos.\n\n' +
            'Ejemplo: EV0001\n\n' +
            'Escribe MENU para regresar al menú principal.';
    }


    // Procesa el código del evento y genera el CSV.
    async function procesarVerInscritos(sesion, mensaje) {

        const respuesta = mensaje.trim();

        try {
            if (sesion.etapa !== 'CODIGO_EVENTO') {
                regresarMenu(sesion);

                return 'La etapa de consulta no es válida.\n\n' +
                    obtenerMenu(sesion.rol);
            }

            const coincidencia = respuesta.match(/^(?:EV)?0*(\d+)$/i);

            if (!coincidencia) {
                return 'Código no válido. Escribe uno como EV0001.';
            }

            const idEvento = Number(coincidencia[1]);

            if (!Number.isSafeInteger(idEvento) || idEvento <= 0) {
                return 'El código del evento no es válido. Inténtalo nuevamente.';
            }

            const evento = await obtenerEventoPorId(idEvento);

            if (!evento) {
                return 'No encontramos ese evento. Verifica el código e inténtalo nuevamente.';
            }

            // Generar el archivo con todos los inscritos.
            const resultado = await exportarEventoCSV(idEvento);

            const nombreArchivo = require('path').basename(
                resultado.rutaArchivo
            );

            regresarMenu(sesion);

            return {
                tipo: 'documento',
                rutaArchivo: resultado.rutaArchivo,
                nombreArchivo,
                caption: `Inscritos del evento ${formatearCodigoEvento(idEvento)} - ${evento.nombre}. Total de registros: ${resultado.totalExportados}.`,
                mensaje: `El archivo CSV del evento ${formatearCodigoEvento(idEvento)} fue generado correctamente.\n\n` +
                    `Total de registros exportados: ${resultado.totalExportados}.\n\n` +
                    obtenerMenu(sesion.rol)
            };

        } catch (error) {
            console.error('Error al generar reporte de inscritos:', error.message);

            regresarMenu(sesion);

            return 'Ocurrió un error al generar el archivo CSV. Inténtalo nuevamente.\n\n' +
                obtenerMenu(sesion.rol);
        }
    }

    // Consulta y muestra los eventos según el rol.
    async function mostrarEventos(rol) {
        try {
            const eventos = await consultarEventos(rol !== 'ADMIN');

            if (eventos.length === 0) {
                return 'No hay eventos registrados para mostrar.\n\n' +
                    obtenerMenu(rol);
            }

            const listaEventos = eventos.map(evento => {
                let fechas = [];

                try {
                    fechas = JSON.parse(evento.fecha_evento);
                } catch (error) {
                    fechas = [];
                }

                const fechasTexto = fechas.length > 0
                    ? formatearFechas(fechas)
                    : 'No disponibles';

                return `EVENTO ${formatearCodigoEvento(evento.id_evento)}

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

        sesion.datosEvento = {nombre: '', descripcion: '', ubicacion: '', fechas: [], hora_inicio: '', hora_fin: '', 
            cupo: null, id_administrador: administrador.id_administrador, preguntas: []};

        return 'Vamos a crear un nuevo evento.\n\n¿Cuál es el nombre del evento?';
    }

    async function iniciarEdicionEvento(numero, sesion) {
        try {
            const administrador = await get(
                `SELECT id_administrador
                FROM administradores
                WHERE numero_whatsapp = ? AND activo = 1`,
                [numero]
            );

            if (!administrador) {
                return 'No tienes autorización para editar eventos.';
            }

            const eventos = await consultarEventos(false);

            if (eventos.length === 0) {
                return 'No hay eventos registrados para editar.\n\n' +
                    obtenerMenu(sesion.rol);
            }

            sesion.flujo = 'EDITAR_EVENTO';
            sesion.etapa = 'SELECCIONAR_EVENTO';

            sesion.datosEdicionEvento = {
                id_administrador: administrador.id_administrador,
                eventos
            };

            const listado = eventos.map(evento =>
                `${formatearCodigoEvento(evento.id_evento)} - ${evento.nombre} (${evento.estado})`
            ).join('\n');

            return `¿Qué evento deseas editar?\n\n${listado}\n\n` +
                'Escribe el código del evento, por ejemplo EV0001.';

        } catch (error) {
            console.error('Error al iniciar edición:', error.message);

            return 'No fue posible consultar los eventos para editarlos.';
        }
    }

    function mostrarDatosEventoEdicion(evento) {
        let fechas = [];

        try {
            fechas = JSON.parse(evento.fecha_evento);
        } catch (error) {
            fechas = [];
        }

        return `EVENTO SELECCIONADO

    Código: ${formatearCodigoEvento(evento.id_evento)}
    Nombre: ${evento.nombre}
    Descripción: ${evento.descripcion || 'Sin descripción'}
    Ubicación: ${evento.ubicacion || 'No especificada'}
    Fechas: ${fechas.length ? formatearFechas(fechas) : 'No disponibles'}
    Hora: ${evento.hora_inicio} - ${evento.hora_fin}
    Cupo: ${evento.cupo}
    Estado: ${evento.estado}

    ¿Qué dato deseas modificar?

    1. Nombre
    2. Descripción
    3. Ubicación
    4. Fechas
    5. Hora de inicio
    6. Hora de finalización
    7. Cupo

    Escribe el número correspondiente.

    Escribe MENU para regresar al menú principal.`;
    }

    async function procesarEdicionEvento(sesion, mensaje) {
        const datos = sesion.datosEdicionEvento;
        const respuesta = mensaje.trim();
        const texto = normalizarMensaje(respuesta);

        try {
            switch (sesion.etapa) {

                case 'SELECCIONAR_EVENTO': {
                    const coincidencia = respuesta.match(/^(?:EV)?0*(\d+)$/i);

                    if (!coincidencia) {
                        return 'Código no válido. Escribe uno como EV0001.';
                    }

                    const idEvento = Number(coincidencia[1]);

                    const evento = await obtenerEventoPorId(idEvento);

                    if (!evento) {
                        return 'No encontramos ese evento. Verifica el código.';
                    }

                    datos.evento = evento;

                    sesion.etapa = 'SELECCIONAR_CAMPO';

                    return mostrarDatosEventoEdicion(evento);
                }

                case 'SELECCIONAR_CAMPO': {
                    const campos = {
                        1: 'nombre',
                        2: 'descripcion',
                        3: 'ubicacion',
                        4: 'fecha_evento',
                        5: 'hora_inicio',
                        6: 'hora_fin',
                        7: 'cupo'
                    };

                    const campo = campos[respuesta];

                    if (!campo) {
                        return 'Opción no válida. Selecciona un número del 1 al 7.';
                    }

                    datos.campo = campo;

                    const instrucciones = {
                        nombre: 'Escribe el nuevo nombre del evento.',
                        descripcion: 'Escribe la nueva descripción.',
                        ubicacion: 'Escribe la nueva ubicación.',
                        fecha_evento: 'Escribe las nuevas fechas en formato DD/MM/AAAA, separadas por comas.',
                        hora_inicio: 'Escribe la nueva hora de inicio en formato HH:MM.',
                        hora_fin: 'Escribe la nueva hora de finalización en formato HH:MM.',
                        cupo: 'Escribe la nueva cantidad de cupos.'
                    };

                    sesion.etapa = 'NUEVO_VALOR';

                    return instrucciones[campo];
                }

                case 'NUEVO_VALOR': {
                    let nuevoValor;

                    if (['nombre', 'descripcion', 'ubicacion'].includes(datos.campo)) {
                        if (!validarTexto(respuesta)) {
                            return 'El texto no puede estar vacío. Inténtalo nuevamente.';
                        }

                        nuevoValor = respuesta;
                    }

                    if (datos.campo === 'fecha_evento') {
                        const fechas = convertirListaFechas(respuesta);

                        if (!fechas) {
                            return 'Las fechas no son válidas, están en el pasado o están repetidas. Inténtalo nuevamente.';
                        }

                        nuevoValor = JSON.stringify(fechas);
                    }

                    if (datos.campo === 'hora_inicio' || datos.campo === 'hora_fin') {
                        if (!validarHora(respuesta)) {
                            return 'La hora no es válida. Utiliza el formato HH:MM.';
                        }

                        const horaInicio = datos.campo === 'hora_inicio'
                            ? respuesta
                            : datos.evento.hora_inicio;

                        const horaFin = datos.campo === 'hora_fin'
                            ? respuesta
                            : datos.evento.hora_fin;

                        if (horaInicio >= horaFin) {
                            return 'La hora de inicio debe ser anterior a la hora de finalización.';
                        }

                        nuevoValor = respuesta;
                    }

                    if (datos.campo === 'cupo') {
                        if (!validarNumeroPositivo(respuesta)) {
                            return 'El cupo debe ser un número entero mayor que cero.';
                        }

                        nuevoValor = Number(respuesta);
                    }

                    datos.nuevoValor = nuevoValor;

                    sesion.etapa = 'CONFIRMAR_EDICION';

                    return `Vas a modificar el campo: ${datos.campo}

    Valor anterior: ${datos.evento[datos.campo]}

    Nuevo valor: ${datos.campo === 'fecha_evento'
                        ? formatearFechas(JSON.parse(nuevoValor))
                        : nuevoValor}

    ¿Deseas guardar este cambio?

    Responde SI o NO.`;
                }

                case 'CONFIRMAR_EDICION': {
                    if (texto === 'NO') {
                        regresarMenu(sesion);

                        return 'La edición fue cancelada. No se modificó el evento.\n\n' +
                            obtenerMenu(sesion.rol);
                    }

                    if (texto !== 'SI') {
                        return 'Respuesta no válida. Responde SI o NO.';
                    }

                    const cambios = await actualizarEvento(
                        datos.evento.id_evento,
                        { [datos.campo]: datos.nuevoValor }
                    );

                    regresarMenu(sesion);

                    if (cambios === 0) {
                        return 'No se realizaron cambios en el evento.\n\n' +
                            obtenerMenu(sesion.rol);
                    }

                    return `¡Evento actualizado correctamente!

    Código: ${formatearCodigoEvento(datos.evento.id_evento)}
    Campo modificado: ${datos.campo}

    ${obtenerMenu(sesion.rol)}`;
                }

                default:
                    regresarMenu(sesion);

                    return 'La etapa de edición no es válida. Regresamos al menú principal.\n\n' +
                        obtenerMenu(sesion.rol);
            }

        } catch (error) {
            console.error('Error al editar evento:', error.message);

            regresarMenu(sesion);

            return 'Ocurrió un error al editar el evento. Inténtalo nuevamente.\n\n' +
                obtenerMenu(sesion.rol);
        }
    }

    // Inicia el flujo de cierre de eventos.
    async function iniciarCierreEvento(numero, sesion) {
        try {
            const administrador = await get(
                `SELECT id_administrador
                 FROM administradores
                 WHERE numero_whatsapp = ? AND activo = 1`,
                [numero]
            );

            if (!administrador) {
                return 'No tienes autorización para cerrar eventos.';
            }

            const eventos = await consultarEventos(false);

            if (eventos.length === 0) {
                return 'No hay eventos registrados para cerrar.\n\n' +
                    obtenerMenu(sesion.rol);
            }

            sesion.flujo = 'CERRAR_EVENTO';
            sesion.etapa = 'SELECCIONAR_EVENTO_CIERRE';

            sesion.datosCierreEvento = {
                id_administrador: administrador.id_administrador
            };

            const listado = eventos.map(evento =>
                `${formatearCodigoEvento(evento.id_evento)} - ${evento.nombre} - ${evento.estado}`
            ).join('\n\n');

            return `Estos son los eventos registrados:\n\n${listado}\n\n` +
                'Escribe el código del evento que deseas cerrar, por ejemplo EV0001.';

        } catch (error) {
            console.error('Error al iniciar cierre de evento:', error.message);

            return 'Ocurrió un error al consultar los eventos. Inténtalo nuevamente.';
        }
    }

    // Procesa las etapas del cierre de eventos.
    async function procesarCierreEvento(sesion, mensaje) {
        const datos = sesion.datosCierreEvento;
        const respuesta = mensaje.trim();
        const texto = normalizarMensaje(respuesta);

        try {
            switch (sesion.etapa) {

                case 'SELECCIONAR_EVENTO_CIERRE': {
                    const coincidencia = respuesta.match(/^(?:EV)?0*(\d+)$/i);

                    if (!coincidencia) {
                        return 'Código no válido. Escribe uno como EV0001.';
                    }

                    const idEvento = Number(coincidencia[1]);
                    const evento = await obtenerEventoPorId(idEvento);

                    if (!evento) {
                        return 'No encontramos ese evento. Verifica el código e inténtalo nuevamente.';
                    }

                    if (evento.estado !== 'ABIERTO') {
                        return `No es posible cerrar este evento porque actualmente se encuentra en estado ${evento.estado}.\n\n` +
                            'Solo se pueden cerrar eventos que estén ABIERTO.\n\n' +
                            'Escribe el código de otro evento o MENU para regresar al menú principal.';
                    }

                    datos.evento = evento;
                    sesion.etapa = 'CONFIRMAR_CIERRE_EVENTO';

                    let fechas = [];

                    try {
                        fechas = JSON.parse(evento.fecha_evento);
                    } catch (error) {
                        fechas = [];
                    }

                    return `INFORMACIÓN DEL EVENTO

Código: ${formatearCodigoEvento(datos.evento.id_evento)}
Nombre: ${evento.nombre}
Descripción: ${evento.descripcion || 'Sin descripción'}
Ubicación: ${evento.ubicacion || 'No especificada'}
Fechas: ${fechas.length > 0 ? formatearFechas(fechas) : 'No disponibles'}
Hora de inicio: ${evento.hora_inicio}
Hora de finalización: ${evento.hora_fin}
Cupo: ${evento.cupo}
Estado actual: ${evento.estado}

¿Confirmas que deseas cerrar esta convocatoria?

Responde SI o NO.`;
                }

                case 'CONFIRMAR_CIERRE_EVENTO': {
                    if (texto === 'NO') {
                        regresarMenu(sesion);

                        return 'El cierre del evento fue cancelado. No se realizó ninguna modificación.\n\n' +
                            obtenerMenu(sesion.rol);
                    }

                    if (texto !== 'SI') {
                        return 'Respuesta no válida. Responde SI o NO.';
                    }

                    // Consultar nuevamente el evento antes de actualizarlo.
                    const eventoActual = await obtenerEventoPorId(
                        datos.evento.id_evento
                    );

                    if (!eventoActual) {
                        regresarMenu(sesion);

                        return 'El evento ya no se encuentra registrado.\n\n' +
                            obtenerMenu(sesion.rol);
                    }

                    if (eventoActual.estado !== 'ABIERTO') {
                        regresarMenu(sesion);

                        return `No se pudo cerrar el evento porque su estado actual es ${eventoActual.estado}.\n\n` +
                            obtenerMenu(sesion.rol);
                    }

                    // Actualizar únicamente el estado del evento.
                    const cambios = await actualizarEvento(
                        datos.evento.id_evento,
                        { estado: 'CERRADO' }
                    );

                    regresarMenu(sesion);

                    if (cambios === 0) {
                        return 'No se pudo realizar el cierre del evento.\n\n' +
                            obtenerMenu(sesion.rol);
                    }

                    return `¡El evento ${formatearCodigoEvento(datos.evento.id_evento)} ha sido cerrado correctamente!

Código: ${formatearCodigoEvento(datos.evento.id_evento)}
Nombre: ${datos.evento.nombre}
Nuevo estado: CERRADO

Ya no se permitirán nuevas inscripciones para esta convocatoria. La información del evento y las inscripciones existentes se conservarán en el sistema.

${obtenerMenu(sesion.rol)}`;
                }

                default:
                    regresarMenu(sesion);

                    return 'La etapa del cierre no es válida. Regresamos al menú principal.\n\n' +
                        obtenerMenu(sesion.rol);
            }

        } catch (error) {
            console.error('Error al cerrar evento:', error.message);

            regresarMenu(sesion);

            return 'Ocurrió un error al cerrar el evento. Inténtalo nuevamente.\n\n' +
                obtenerMenu(sesion.rol);
        }
    }


    // Muestra el resumen antes de guardar.
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

    // Procesa las etapas de creación del evento.
    async function procesarCreacionEvento(sesion, mensaje) {

        const datos = sesion.datosEvento;
        const respuesta = mensaje.trim();
        const texto = normalizarMensaje(respuesta);

        switch (sesion.etapa) {

            case 'NOMBRE':

                if (!validarTexto(respuesta)) {
                    return 'El nombre no puede estar vacío. Escribe el nombre del evento.';
                }

                datos.nombre = respuesta;
                sesion.etapa = 'DESCRIPCION';

                return 'Escribe una descripción para el evento.';

            case 'DESCRIPCION':

                if (!validarTexto(respuesta)) {
                    return 'La descripción no puede estar vacía. Inténtalo nuevamente.';
                }

                datos.descripcion = respuesta;
                sesion.etapa = 'UBICACION';

                return '¿En qué lugar se realizará el evento?';

            case 'UBICACION':

                if (!validarTexto(respuesta)) {
                    return 'La ubicación no puede estar vacía. Inténtalo nuevamente.';
                }

                datos.ubicacion = respuesta;
                sesion.etapa = 'FECHAS';

                return 'Escribe una o varias fechas para el evento en formato DD/MM/AAAA, separadas por comas.\n\nEjemplo: 15/12/2026, 16/12/2026';

            case 'FECHAS': {
                const fechasISO = convertirListaFechas(respuesta);

                if (!fechasISO) {
                    return 'Una o varias fechas no son válidas, están en el pasado o están repetidas.\n\n' +
                        'Utiliza el formato DD/MM/AAAA, separando las fechas por comas, e inténtalo nuevamente.';
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
                if (!validarNumeroPositivo(respuesta)) {
                    return 'La cantidad de cupos debe ser un número entero mayor que cero.';
                }

                const cupo = Number(respuesta);

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

                if (!validarTexto(respuesta)) {
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
                    const fechaJSON = JSON.stringify(datos.fechas);

                    const eventoId = await crearEvento({nombre: datos.nombre, descripcion: datos.descripcion, ubicacion: datos.ubicacion, fecha_evento: fechaJSON,
                         hora_inicio: datos.hora_inicio, hora_fin: datos.hora_fin, cupo: datos.cupo, id_administrador: datos.id_administrador});

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

Código del evento: ${formatearCodigoEvento(eventoId)}

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

    return {mostrarEventos, iniciarCreacionEvento, procesarCreacionEvento, iniciarEdicionEvento, procesarEdicionEvento, iniciarCierreEvento,
    procesarCierreEvento, iniciarVerInscritos, procesarVerInscritos};
}

module.exports = { crearEventFlows };
