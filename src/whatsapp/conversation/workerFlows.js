//Inscripción, consulta y cancelación de solicitudes de trabajadores.
const { normalizarMensaje } = require('./commands');

const {
    buscarPersonaPorWhatsapp,
    registrarPersona
} = require('../../../database/people');

const {
    obtenerEventoPorId,
    obtenerPreguntasEvento
} = require('../../../database/events');

const {
    registrarSolicitud,
    guardarRespuesta,
    retirarSolicitud
} = require('../../../database/applications');

const { get, all } = require('../../../database/db');

// Este módulo recibe las funciones del router que necesita
// para regresar al menú y mostrarlo.
function crearWorkerFlows({ obtenerMenu, regresarMenu }) {

    // Formatea fechas ISO para mostrarlas al trabajador.
    function formatearFechas(fechas) {
        return fechas.map(fecha => {
            const [anio, mes, dia] = fecha.split('-');
            return `${dia}/${mes}/${anio}`;
        }).join(', ');
    }

    // Convierte el identificador numérico en un código EV0001.
    function formatearCodigoEvento(id) {
        return `EV${String(id).padStart(4, '0')}`;
    }

    // Convierte el identificador de solicitud en un código de inscripción.
    function formatearCodigoSolicitud(id) {
        return `IN${String(id).padStart(3, '0')}`;
    }

    // Interpreta códigos como EV001 o identificadores como 1.
    function obtenerIdDesdeCodigo(codigo) {
        const coincidencia = codigo.trim().match(/^(?:EV)?0*(\d+)$/i);

        return coincidencia ? Number(coincidencia[1]) : null;
    }

    // Inicia el proceso de inscripción.
    async function iniciarInscripcion(numero, sesion) {
        const persona = await buscarPersonaPorWhatsapp(numero);

        sesion.flujo = 'INSCRIBIR_EVENTO';
        sesion.etapa = 'CODIGO_EVENTO';

        sesion.datosInscripcion = {
            numero_whatsapp: numero,
            persona_existente: persona,
            evento: null,
            nombre_completo: persona?.nombre_completo || '',
            numero_documento: persona?.numero_documento || '',
            fechas: [],
            preguntas: [],
            respuestas: [],
            indicePregunta: 0
        };

        return 'Vamos a iniciar tu inscripción.\n\n' +
            '¿A qué convocatoria deseas inscribirte? Escribe el código del evento.\n\n' +
            'Ejemplo: EV0001';
    }


    // Consulta las inscripciones asociadas al número de WhatsApp.
    async function consultarMisInscripciones(numero, sesion) {
        try {
            // Buscar al trabajador por su número de WhatsApp.
            const persona = await buscarPersonaPorWhatsapp(numero);

            if (!persona) {
                return 'Todavía no tienes inscripciones registradas.\n\n' +
                    obtenerMenu(sesion.rol);
            }

            // Consultar todas sus solicitudes y los datos de cada evento.
            const solicitudes = await all(
                `SELECT
                    s.id_solicitud,
                    s.estado,
                    s.fecha_registro,
                    e.id_evento,
                    e.nombre,
                    e.fecha_evento
                FROM solicitudes s
                INNER JOIN eventos e
                    ON s.id_evento = e.id_evento
                WHERE s.id_persona = ?
                ORDER BY s.fecha_registro DESC`,
                [persona.id_persona]
            );

            if (solicitudes.length === 0) {
                return 'Todavía no tienes inscripciones registradas.\n\n' +
                    obtenerMenu(sesion.rol);
            }

            // Construir el mensaje con la información de cada inscripción.
            const inscripcionesTexto = solicitudes.map(solicitud => {
                let fechas = [];

                try {
                    fechas = JSON.parse(solicitud.fecha_evento);
                } catch (error) {
                    fechas = [];
                }

                const fechasTexto = fechas.length > 0
                    ? formatearFechas(fechas)
                    : 'Fechas no disponibles';

                return `Código: ${formatearCodigoSolicitud(solicitud.id_solicitud)}
    Evento: ${formatearCodigoEvento(solicitud.id_evento)} - ${solicitud.nombre}
    Fechas: ${fechasTexto}
    Estado: ${solicitud.estado}
    Fecha de inscripción: ${solicitud.fecha_registro}`;
            }).join('\n\n------------------------\n\n');

            return `TUS INSCRIPCIONES

    ${inscripcionesTexto}

    ------------------------

    Estas son todas tus solicitudes registradas.

    ${obtenerMenu(sesion.rol)}`;

        } catch (error) {
            console.error('Error al consultar inscripciones:', error.message);

            return 'Ocurrió un error al consultar tus inscripciones. ' +
                'Inténtalo nuevamente más tarde.\n\n' +
                obtenerMenu(sesion.rol);
        }
    }


    async function iniciarCancelacion(numero, sesion) {
        try {
            const persona = await buscarPersonaPorWhatsapp(numero);

            if (!persona) {
                return 'No tienes inscripciones registradas.\n\n' +
                    obtenerMenu(sesion.rol);
            }

            const solicitudes = await all(
                `SELECT
                    s.id_solicitud,
                    s.id_evento,
                    s.estado,
                    e.nombre
                FROM solicitudes s
                INNER JOIN eventos e
                    ON s.id_evento = e.id_evento
                WHERE s.id_persona = ?
                AND s.estado != 'RETIRADO'
                ORDER BY s.fecha_registro DESC`,
                [persona.id_persona]
            );

            if (solicitudes.length === 0) {
                return 'No tienes inscripciones activas que puedas cancelar.\n\n' +
                    obtenerMenu(sesion.rol);
            }

            sesion.flujo = 'CANCELAR_INSCRIPCION';
            sesion.etapa = 'SELECCIONAR_INSCRIPCION';

            sesion.datosCancelacion = {
                id_persona: persona.id_persona,
                solicitudes
            };

            const listado = solicitudes.map(s =>
                `Código: ${formatearCodigoSolicitud(s.id_solicitud)}\n` +
                `Evento: ${formatearCodigoEvento(s.id_evento)} - ${s.nombre}\n` +
                `Estado: ${s.estado}`
            ).join('\n\n');

            return `¿Qué inscripción deseas cancelar?\n\n${listado}\n\n` +
                'Escribe el código de inscripción (ejemplo: IN001).\n\n' +
                'Escribe MENU para regresar al menú.';

        } catch (error) {
            console.error('Error al iniciar cancelación:', error.message);

            return 'No fue posible consultar tus inscripciones en este momento.';
        }
    }

    async function procesarCancelacion(sesion, mensaje) {
        const datos = sesion.datosCancelacion;
        const respuesta = mensaje.trim();
        const texto = normalizarMensaje(respuesta);

        if (sesion.etapa === 'SELECCIONAR_INSCRIPCION') {
            const idSolicitud = respuesta.match(/^IN0*(\d+)$/i);

            if (!idSolicitud) {
                return 'Código no válido. Escribe uno como IN001.';
            }

            const solicitud = datos.solicitudes.find(
                s => s.id_solicitud === Number(idSolicitud[1])
            );

            if (!solicitud) {
                return 'No encontramos esa inscripción entre tus solicitudes. ' +
                    'Verifica el código e inténtalo nuevamente.';
            }

            datos.solicitudSeleccionada = solicitud;
            sesion.etapa = 'CONFIRMAR_CANCELACION';

            return `Has seleccionado esta inscripción:\n\n` +
                `Código: ${formatearCodigoSolicitud(solicitud.id_solicitud)}\n` +
                `Evento: ${formatearCodigoEvento(solicitud.id_evento)} - ${solicitud.nombre}\n` +
                `Estado actual: ${solicitud.estado}\n\n` +
                '¿Confirmas que deseas cancelar esta inscripción?\n\n' +
                'Responde SI o NO.';
        }

        if (sesion.etapa === 'CONFIRMAR_CANCELACION') {
            if (texto === 'NO') {
                regresarMenu(sesion);

                return 'La cancelación fue descartada. Tu inscripción continúa sin cambios.\n\n' +
                    obtenerMenu(sesion.rol);
            }

            if (texto !== 'SI') {
                return 'Respuesta no válida. Responde SI o NO.';
            }

            try {
                // Comprobar nuevamente que la solicitud siga activa.
                const solicitudActual = await get(
                    `SELECT id_solicitud, estado
                    FROM solicitudes
                    WHERE id_solicitud = ? AND id_persona = ?`,
                    [
                        datos.solicitudSeleccionada.id_solicitud,
                        datos.id_persona
                    ]
                );

                if (!solicitudActual || solicitudActual.estado === 'RETIRADO') {
                    regresarMenu(sesion);

                    return 'Esta inscripción ya fue retirada o no se encuentra disponible.\n\n' +
                        obtenerMenu(sesion.rol);
                }

                const cambios = await retirarSolicitud(
                    datos.id_persona,
                    datos.solicitudSeleccionada.id_evento
                );

                regresarMenu(sesion);

                if (cambios === 0) {
                    return 'No se pudo cancelar la inscripción porque no hubo cambios.\n\n' +
                        obtenerMenu(sesion.rol);
                }

                return `Tu inscripción fue cancelada correctamente.\n\n` +
                    `Código: ${formatearCodigoSolicitud(datos.solicitudSeleccionada.id_solicitud)}\n` +
                    `Evento: ${datos.solicitudSeleccionada.nombre}\n` +
                    `Nuevo estado: RETIRADO\n\n` +
                    obtenerMenu(sesion.rol);

            } catch (error) {
                console.error('Error al cancelar inscripción:', error.message);

                return 'Ocurrió un error al cancelar tu inscripción. Inténtalo nuevamente.';
            }
        }

        regresarMenu(sesion);

        return 'La operación no es válida. Regresamos al menú principal.\n\n' +
            obtenerMenu(sesion.rol);
    }


    // Comprueba que el documento tenga un formato aceptable.
    function validarDocumento(documento) {
        return /^\d{5,15}$/.test(documento.trim());
    }

    // Valida una respuesta según el tipo de pregunta.
    function validarRespuestaPregunta(pregunta, respuesta) {
        const valor = respuesta.trim();
        const tipo = pregunta.tipo_respuesta;

        if (!valor) return false;

        if (tipo === 'SI_NO') {
            return ['SI', 'NO'].includes(normalizarMensaje(valor));
        }

        if (tipo === 'NUMERO') {
            return Number.isFinite(Number(valor));
        }

        if (tipo === 'OPCION_MULTIPLE') {
            let opciones = [];

            try {
                opciones = JSON.parse(pregunta.opciones || '[]');
            } catch (error) {
                opciones = (pregunta.opciones || '')
                    .split(',')
                    .map(opcion => opcion.trim());
            }

            return opciones.some((opcion, indice) =>
                normalizarMensaje(valor) === normalizarMensaje(String(opcion)) ||
                valor === String(indice + 1)
            );
        }

        if (tipo === 'TEXTO') {
            return true;
        }

        return false;
    }

    // Presenta las preguntas configuradas para el evento.
    function mostrarPreguntaActual(datos) {
        const pregunta = datos.preguntas[datos.indicePregunta];

        if (!pregunta) {
            return mostrarResumenInscripcion(datos);
        }

        let mensaje = `Pregunta ${datos.indicePregunta + 1} de ${datos.preguntas.length}\n\n`;
        mensaje += pregunta.texto;

        if (pregunta.tipo_respuesta === 'SI_NO') {
            mensaje += '\n\nResponde SI o NO.';
        } else if (pregunta.tipo_respuesta === 'NUMERO') {
            mensaje += '\n\nResponde con un número.';
        } else if (pregunta.tipo_respuesta === 'OPCION_MULTIPLE') {
            let opciones = [];

            try {
                opciones = JSON.parse(pregunta.opciones || '[]');
            } catch (error) {
                opciones = (pregunta.opciones || '')
                    .split(',')
                    .map(opcion => opcion.trim());
            }

            mensaje += '\n\nOpciones:\n' +
                opciones.map((opcion, indice) =>
                    `${indice + 1}. ${opcion}`
                ).join('\n');
        } else {
            mensaje += '\n\nEscribe tu respuesta.';
        }

        if (!pregunta.obligatoria) {
            mensaje += '\n\nPuedes escribir OMITIR si no deseas responder.';
        }

        return mensaje;
    }

    // Carga las preguntas configuradas para el evento.
    async function iniciarPreguntas(datos, sesion) {
        datos.preguntas = await obtenerPreguntasEvento(datos.evento.id_evento);
        datos.respuestas = [];
        datos.indicePregunta = 0;

        if (datos.preguntas.length > 0) {
            sesion.etapa = 'PREGUNTAS';
            return mostrarPreguntaActual(datos);
        }

        sesion.etapa = 'CONFIRMACION';
        return mostrarResumenInscripcion(datos);
    }

    // Presenta el resumen de la inscripción antes de guardarla.
    function mostrarResumenInscripcion(datos) {

        const respuestasTexto = datos.respuestas.length > 0
            ? datos.respuestas.map((respuesta, indice) =>
                `${indice + 1}. ${datos.preguntas[indice].texto}\n` +
                `   Respuesta: ${respuesta === null ? 'No respondida' : respuesta}`
            ).join('\n')
            : 'No hay preguntas adicionales para esta convocatoria.';

        return `RESUMEN DE TU INSCRIPCIÓN

    Evento: ${formatearCodigoEvento(datos.evento.id_evento)} - ${datos.evento.nombre}

    Nombre: ${datos.nombre_completo}

    Documento: ${datos.numero_documento}

    Fechas aceptadas:
    ${formatearFechas(datos.fechas)}

    Disponibilidad: Aceptada para todas las fechas del evento.

    Preguntas adicionales:
    ${respuestasTexto}

    ¿Confirmas tu inscripción?

    Responde SI para confirmar o NO para descartar la información.`;
    }

    // Procesa cada etapa de la inscripción.
    async function procesarInscripcion(sesion, mensaje) {
        const datos = sesion.datosInscripcion;
        const respuesta = mensaje.trim();
        const texto = normalizarMensaje(respuesta);

        switch (sesion.etapa) {

            case 'CODIGO_EVENTO': {
                const idEvento = obtenerIdDesdeCodigo(respuesta);

                if (!idEvento) {
                    return 'El código no es válido. Escribe un código como EV0001.';
                }

                const evento = await obtenerEventoPorId(idEvento);

                if (!evento || evento.estado !== 'ABIERTO') {
                    return 'La convocatoria no existe o no se encuentra abierta. ' +
                        'Verifica el código e inténtalo nuevamente.';
                }

                const solicitudExistente = await get(
                    `SELECT id_solicitud, estado
                    FROM solicitudes
                    WHERE id_persona = (
                        SELECT id_persona
                        FROM personas
                        WHERE numero_whatsapp = ?
                    )
                    AND id_evento = ?`,
                    [datos.numero_whatsapp, idEvento]
                );

                if (solicitudExistente) {
                    regresarMenu(sesion);

                    return `Ya tienes una solicitud registrada para esta convocatoria.\n\n` +
                        `Estado actual: ${solicitudExistente.estado}\n\n` +
                        obtenerMenu(sesion.rol);
                }

                let fechas = [];

                try {
                    fechas = JSON.parse(evento.fecha_evento);
                } catch (error) {
                    return 'No fue posible consultar las fechas de la convocatoria.';
                }

                if (!Array.isArray(fechas) || fechas.length === 0) {
                    return 'La convocatoria no tiene fechas configuradas.';
                }

                datos.evento = evento;
                datos.fechas = fechas;

                sesion.etapa = 'ACEPTAR_FECHAS';

                return `La convocatoria seleccionada es: ${evento.nombre}\n\n` +
                    `Fechas del evento:\n${formatearFechas(fechas)}\n\n` +
                    'IMPORTANTE: Al inscribirte aceptas estar disponible para trabajar durante TODAS las fechas indicadas.\n\n' +
                    '¿Aceptas esta condición y deseas continuar con la inscripción?\n\n' +
                    'Responde SI o NO.';
            }


            case 'ACEPTAR_FECHAS': {

                if (texto === 'NO') {
                    regresarMenu(sesion);

                    return 'Has decidido no continuar con la inscripción. No se guardó ninguna información.\n\n' +
                        obtenerMenu(sesion.rol);
                }

                if (texto !== 'SI') {
                    return 'Respuesta no válida. Debes responder SI o NO para continuar.';
                }

                // Si ya conocemos los datos del trabajador, no los solicitamos nuevamente.
                if (
                    datos.persona_existente &&
                    datos.nombre_completo &&
                    datos.numero_documento
                ) {
                    return await iniciarPreguntas(datos, sesion);
                }

                sesion.etapa = 'DATOS_PERSONALES';

                return `Perfecto. Para continuar con tu inscripción a ${datos.evento.nombre}, necesitamos tus datos personales.\n\n` +
                    'Escribe tus datos en un solo mensaje respetando esta numeración:\n\n' +
                    '1. Nombre completo:\n' +
                    '2. Documento de identidad:';
            }       

            case 'DATOS_PERSONALES': {
                const lineas = respuesta.split('\n');

                let nombre = '';
                let documento = '';

                for (const linea of lineas) {
                    if (/^1[\.\)]/.test(linea.trim())) {
                        nombre = linea.replace(/^1[\.\)]\s*/, '').trim();
                    }

                    if (/^2[\.\)]/.test(linea.trim())) {
                        documento = linea.replace(/^2[\.\)]\s*/, '').trim();
                    }
                }

                if (!nombre || !documento) {
                    return 'Faltan datos o no respetaste la numeración.\n\n' +
                        'Envía nuevamente:\n\n' +
                        '1. Nombre completo:\n' +
                        '2. Documento de identidad:';
                }

                if (nombre.length < 5 || !/[a-záéíóúñ]/i.test(nombre)) {
                    return 'El nombre completo no parece válido. Escríbelo nuevamente.';
                }

                if (!validarDocumento(documento)) {
                    return 'El documento debe contener entre 5 y 15 dígitos, sin espacios ni puntos.';
                }

                const documentoExistente = await get(
                    `SELECT id_persona, numero_whatsapp
                    FROM personas
                    WHERE numero_documento = ?`,
                    [documento]
                );

                if (
                    documentoExistente &&
                    documentoExistente.numero_whatsapp !== datos.numero_whatsapp
                ) {
                    return 'Este documento ya está asociado a otro registro. Verifica la información.';
                }

                datos.nombre_completo = nombre;
                datos.numero_documento = documento;

                return await iniciarPreguntas(datos, sesion);
            }

            case 'PREGUNTAS': {
                const pregunta = datos.preguntas[datos.indicePregunta];

                if (
                    !pregunta.obligatoria &&
                    texto === 'OMITIR'
                ) {
                    datos.respuestas.push(null);
                } else {
                    if (!validarRespuestaPregunta(pregunta, respuesta)) {
                        return 'La respuesta no cumple con el formato solicitado.\n\n' +
                            mostrarPreguntaActual(datos);
                    }

                    datos.respuestas.push(respuesta);
                }

                datos.indicePregunta++;

                if (datos.indicePregunta < datos.preguntas.length) {
                    return mostrarPreguntaActual(datos);
                }

                sesion.etapa = 'CONFIRMACION';

                return mostrarResumenInscripcion(datos);
            }

            case 'CONFIRMACION': {
                if (texto === 'NO') {
                    regresarMenu(sesion);

                    return 'No se guardó tu inscripción. La información recopilada fue descartada.\n\n' +
                        obtenerMenu(sesion.rol);
                }

                if (texto !== 'SI') {
                    return 'Responde SI para confirmar o NO para descartar tu inscripción.';
                }

                try {
                    // Volver a comprobar que no exista una solicitud anterior.
                    const personaActual = await buscarPersonaPorWhatsapp(datos.numero_whatsapp);

                    if (personaActual) {
                        const existente = await get(
                            `SELECT id_solicitud
                            FROM solicitudes
                            WHERE id_persona = ? AND id_evento = ?`,
                            [personaActual.id_persona, datos.evento.id_evento]
                        );

                        if (existente) {
                            regresarMenu(sesion);

                            return 'Ya existe una solicitud para esta convocatoria. No se creó otra.\n\n' +
                                obtenerMenu(sesion.rol);
                        }
                    }

                    // Registrar o actualizar los datos de la persona.
                    const idPersona = await registrarPersona({
                        nombre_completo: datos.nombre_completo,
                        numero_documento: datos.numero_documento,
                        numero_whatsapp: datos.numero_whatsapp
                    });

                    // Crear la solicitud con el estado permitido por SQLite.
                    const idSolicitud = await registrarSolicitud(
                        idPersona,
                        datos.evento.id_evento,
                        'REGISTRADO'
                    );

                    // Guardar las respuestas de las preguntas adicionales.
                    for (let i = 0; i < datos.preguntas.length; i++) {
                        if (datos.respuestas[i] !== null) {
                            await guardarRespuesta(
                                idSolicitud,
                                datos.preguntas[i].id_pregunta,
                                datos.respuestas[i]
                            );
                        }
                    }

                    const codigo = formatearCodigoSolicitud(idSolicitud);

                    regresarMenu(sesion);

                    return `¡Tu solicitud ha sido registrada correctamente!\n\n` +
                        `Código de inscripción: ${codigo}\n\n` +
                        `Evento: ${formatearCodigoEvento(datos.evento.id_evento)} - ${datos.evento.nombre}\n\n` +
                        `Estado: REGISTRADO\n\n` +
                        'Puedes consultar su estado desde la opción CONSULTAR MIS INSCRIPCIONES.\n\n' +
                        obtenerMenu(sesion.rol);

                } catch (error) {
                    console.error('Error al registrar inscripción:', error.message);

                    return 'Ocurrió un error al guardar tu inscripción. ' +
                        'No continúes enviando confirmaciones repetidas. ' +
                        'Por favor, contacta al administrador.';
                }
            }

            default:
                regresarMenu(sesion);

                return 'Se produjo un error en la inscripción. Regresamos al menú principal.\n\n' +
                    obtenerMenu(sesion.rol);
        }
    }


    function mostrarAyuda() {
        return `CENTRO DE AYUDA - CHATBOT DE LOGÍSTICA

    Estas son las funcionalidades disponibles:

    1. VER EVENTOS DISPONIBLES
    Consulta las convocatorias que se encuentran abiertas.

    2. INSCRIBIRME A UN EVENTO
    Escribe el código de la convocatoria (por ejemplo, EV0001).
    Deberás aceptar todas las fechas del evento, proporcionar tus datos personales si es necesario y responder las preguntas configuradas.
    Al finalizar, confirma tu inscripción.

    3. CONSULTAR MIS INSCRIPCIONES
    Consulta las convocatorias en las que te has inscrito y revisa el estado de cada solicitud.

    4. CANCELAR MI INSCRIPCIÓN
    Selecciona el código de la inscripción (por ejemplo, IN001) y confirma si deseas retirarla.

    5. AYUDA
    Muestra esta información.

    COMANDOS GENERALES:

    MENU: Regresar al menú principal.
    CANCELAR: Abandonar la operación actual.

    IMPORTANTE:
    Al inscribirte aceptas estar disponible para TODAS las fechas de la convocatoria.

    Si tienes inconvenientes o necesitas más información, comunícate con el administrador.

    ¡Gracias por utilizar el chatbot de logística!`;
    }

    return {
        iniciarInscripcion,
        procesarInscripcion,
        consultarMisInscripciones,
        iniciarCancelacion,
        procesarCancelacion,
        mostrarAyuda
    };
}

module.exports = { crearWorkerFlows };

