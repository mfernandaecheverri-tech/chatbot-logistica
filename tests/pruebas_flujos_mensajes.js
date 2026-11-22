const { procesarMensaje } = require('../src/whatsapp/conversation/messageRouter');
const { run, get } = require('../database/db');

const ADMIN_TEL = '573990000001';
const TRABAJADOR_TEL = '573990000002';

async function enviar(rol, telefono, texto) {
    console.log(`\n[${rol} -> Bot]: ${texto.replace(/\n/g, ' | ')}`);
    const respuesta = await procesarMensaje(telefono, texto);
    console.log(`[Bot -> ${rol}]:\n${respuesta}`);
    return respuesta;
}

(async () => {
    try {
        console.log("=== INICIANDO PRUEBAS PARCIALES POR MENSAJES (5 MÓDULOS) ===");

        // Preparar administrador de prueba en SQLite (limpiando datos previos de prueba)
        await run(`DELETE FROM respuestas WHERE solicitud_id IN (SELECT id FROM solicitudes WHERE persona_id IN (SELECT id FROM personas WHERE numero_whatsapp = ?))`, [TRABAJADOR_TEL]).catch(() => {});
        await run(`DELETE FROM solicitudes WHERE persona_id IN (SELECT id FROM personas WHERE numero_whatsapp = ?)`, [TRABAJADOR_TEL]).catch(() => {});
        await run(`DELETE FROM personas WHERE numero_whatsapp = ?`, [TRABAJADOR_TEL]).catch(() => {});
        await run(`INSERT OR IGNORE INTO administradores (nombre, numero_whatsapp, activo) VALUES ('Admin QA', ?, 1)`, [ADMIN_TEL]);

        // =========================================================================
        // MÓDULO 1 Y 3: CREACIÓN DE EVENTOS + PREGUNTAS DINÁMICAS (ADMIN)
        // =========================================================================
        console.log("\n-----------------------------------------------------------------");
        console.log("PRUEBA PARCIAL 1 Y 3: CREACIÓN DE EVENTO Y PREGUNTAS DINÁMICAS");
        console.log("-----------------------------------------------------------------");

        await enviar('ADMIN', ADMIN_TEL, 'Hola');
        await enviar('ADMIN', ADMIN_TEL, '1'); // Opción 1: CREAR EVENTO
        await enviar('ADMIN', ADMIN_TEL, 'Logística Concierto Medellín'); // Nombre
        await enviar('ADMIN', ADMIN_TEL, 'Apoyo en montaje y control de acceso'); // Descripción
        await enviar('ADMIN', ADMIN_TEL, 'Estadio Atanasio Girardot'); // Ubicación
        await enviar('ADMIN', ADMIN_TEL, '20/12/2026'); // Fecha válida
        await enviar('ADMIN', ADMIN_TEL, '08:00'); // Hora inicio
        await enviar('ADMIN', ADMIN_TEL, '18:00'); // Hora fin
        await enviar('ADMIN', ADMIN_TEL, '0'); // Prueba validación cupo = 0 (RN 13)
        await enviar('ADMIN', ADMIN_TEL, '10'); // Cupo válido
        await enviar('ADMIN', ADMIN_TEL, 'SI'); // Agregar preguntas dinámicas
        await enviar('ADMIN', ADMIN_TEL, '¿Cuentas con certificado de alturas vigente?'); // Pregunta 1
        await enviar('ADMIN', ADMIN_TEL, 'NO'); // No más preguntas
        const resCreacion = await enviar('ADMIN', ADMIN_TEL, 'SI'); // Confirmar creación

        // Extraer el ID del evento recién creado
        const matchId = resCreacion.match(/Identificador del evento:\s*(\d+)/);
        const idEvento = matchId ? matchId[1] : '1';
        const codigoEvento = `EV${String(idEvento).padStart(3, '0')}`;

        // =========================================================================
        // MÓDULO 2 Y 4: REGISTRO DE PERSONAS + VALIDACIÓN DE REQUISITOS (TRABAJADOR)
        // =========================================================================
        console.log("\n-----------------------------------------------------------------");
        console.log("PRUEBA PARCIAL 2 Y 4: REGISTRO DE PERSONA Y VALIDACIONES");
        console.log("-----------------------------------------------------------------");

        await enviar('TRABAJADOR', TRABAJADOR_TEL, 'Hola');
        await enviar('TRABAJADOR', TRABAJADOR_TEL, '2'); // Opción 2: INSCRIBIRME A UN EVENTO
        await enviar('TRABAJADOR', TRABAJADOR_TEL, codigoEvento); // Código del evento
        await enviar('TRABAJADOR', TRABAJADOR_TEL, 'SI'); // Acepta disponibilidad de fechas (V-02)
        await enviar('TRABAJADOR', TRABAJADOR_TEL, '1. Laura Gómez\n2. 123'); // Prueba validación doc corto
        await enviar('TRABAJADOR', TRABAJADOR_TEL, '1. Laura Gómez\n2. 1036999888'); // Datos válidos
        await enviar('TRABAJADOR', TRABAJADOR_TEL, 'tal vez'); // Prueba formato inválido en pregunta SI/NO (V-04)
        await enviar('TRABAJADOR', TRABAJADOR_TEL, 'SI'); // Responde certificación (V-03)
        const resInscripcion = await enviar('TRABAJADOR', TRABAJADOR_TEL, 'SI'); // Confirma inscripción

        // Extraer código de inscripción (ej. IN001)
        const matchInscripcion = resInscripcion.match(/Código de inscripción:\s*(IN\d+)/);
        const codigoInscripcion = matchInscripcion ? matchInscripcion[1] : 'IN001';

        // Prueba validación de duplicidad (V-06 / RN 05)
        console.log("\n--- Verificando validación de duplicidad (V-06) ---");
        await enviar('TRABAJADOR', TRABAJADOR_TEL, '2');
        await enviar('TRABAJADOR', TRABAJADOR_TEL, codigoEvento);

        // =========================================================================
        // MÓDULO 5: CANCELACIÓN DE DISPONIBILIDAD (TRABAJADOR)
        // =========================================================================
        console.log("\n-----------------------------------------------------------------");
        console.log("PRUEBA PARCIAL 5: CANCELACIÓN DE DISPONIBILIDAD (ESTADO RETIRADO)");
        console.log("-----------------------------------------------------------------");

        await enviar('TRABAJADOR', TRABAJADOR_TEL, '4'); // Opción 4: CANCELAR MI INSCRIPCION
        await enviar('TRABAJADOR', TRABAJADOR_TEL, codigoInscripcion); // Selecciona INxxx
        await enviar('TRABAJADOR', TRABAJADOR_TEL, 'SI'); // Confirma cancelación

        // Verificar consulta de estado final
        await enviar('TRABAJADOR', TRABAJADOR_TEL, '3'); // Opción 3: CONSULTAR MIS INSCRIPCIONES

        console.log("\n=== PRUEBAS CONVERSACIONALES FINALIZADAS ===");
        process.exit(0);
    } catch (err) {
        console.error("Error durante la simulación:", err);
        process.exit(1);
    }
})();
