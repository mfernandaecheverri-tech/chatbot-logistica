//este script se encarga de enrutar los mensajes recibidos por WhatsApp 
// y determinar la respuesta adecuada según el flujo de conversación 
// y el rol del usuario (administrador o trabajador).

const {menuAdministrador, menuTrabajador} = require('./menu');
const {normalizarMensaje, identificarComando, identificarOpcion} = require('./commands');
const {esAdministrador} = require('../../../database/people');
const {crearWorkerFlows} = require('./workerFlows');
const {crearEventFlows} = require('./eventFlows');

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
    delete sesion.datosInscripcion;
    delete sesion.datosEdicionEvento;
    delete sesion.datosCancelacion;
    delete sesion.datosCierreEvento;
    delete sesion.datosReporte;
}

// Crear las funciones del flujo de trabajadores.
const workerFlows = crearWorkerFlows({
    obtenerMenu,
    regresarMenu
});

const eventFlows = crearEventFlows({
    obtenerMenu,
    regresarMenu
});

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
        return await eventFlows.procesarCreacionEvento(sesion, mensaje);
    }

    if (sesion.flujo === 'EDITAR_EVENTO') {
    return await eventFlows.procesarEdicionEvento(sesion, mensaje);
    }
    // Procesar el cierre de eventos.
    if (sesion.flujo === 'CERRAR_EVENTO') {
        return await eventFlows.procesarCierreEvento(sesion, mensaje);
    }
    // Procesar consulta de inscritos.
    if (sesion.flujo === 'VER_INSCRITOS') {
        return await eventFlows.procesarVerInscritos(sesion, mensaje);
    }
    // Procesar inscripción de trabajadores.
    if (sesion.flujo === 'INSCRIBIR_EVENTO') {
        return await workerFlows.procesarInscripcion(sesion, mensaje);
    }

    if (sesion.flujo === 'CANCELAR_INSCRIPCION') {
        return await workerFlows.procesarCancelacion(sesion, mensaje);
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
            return await eventFlows.iniciarCreacionEvento(numero, sesion);
        }
        // Iniciar la edición de eventos.
        if (
            seleccion.flujo === 'EDITAR_EVENTO' &&
            sesion.rol === 'ADMIN'
        ) {
            return await eventFlows.iniciarEdicionEvento(numero, sesion);
        }
        // Iniciar el cierre de eventos.
        if (
            seleccion.flujo === 'CERRAR_EVENTO' &&
            sesion.rol === 'ADMIN'
        ) {
            return await eventFlows.iniciarCierreEvento(numero, sesion);
        }
        // Iniciar consulta de inscritos.
        if (
            seleccion.flujo === 'VER_INSCRITOS' &&
            sesion.rol === 'ADMIN'
        ) {
            return await eventFlows.iniciarVerInscritos(numero, sesion);
        }
        // Iniciar inscripción de trabajadores.
        if (
            seleccion.flujo === 'INSCRIBIR_EVENTO' &&
            sesion.rol === 'TRABAJADOR'
        ) {
            return await workerFlows.iniciarInscripcion(numero, sesion);
        }

        if (
            seleccion.flujo === 'CANCELAR_INSCRIPCION' &&
            sesion.rol === 'TRABAJADOR'
        ) {
            return await workerFlows.iniciarCancelacion(numero, sesion);
        }

        // Consultar las inscripciones del trabajador.
        if (
            seleccion.flujo === 'CONSULTAR_INSCRIPCIONES' &&
            sesion.rol === 'TRABAJADOR'
        ) {
            return await workerFlows.consultarMisInscripciones(numero, sesion);
        }
        // Consultar eventos.
        if (seleccion.flujo === 'VER_EVENTOS') {
            return await eventFlows.mostrarEventos(sesion.rol);
        }
        // Mostrar la ayuda de uso del bot al trabajador.
        if (
            seleccion.flujo === 'AYUDA' &&
            sesion.rol === 'TRABAJADOR'
        ) {
            return workerFlows.mostrarAyuda();
        }
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