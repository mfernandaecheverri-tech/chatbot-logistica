const { run, get, all } = require('./db');

async function registrarSolicitud(id_persona, id_evento, estadoInicial = 'REGISTRADO') {
    const existente = await get(
        `SELECT * FROM solicitudes WHERE id_persona = ? AND id_evento = ?`,
        [id_persona, id_evento]
    );

    if (existente) {
        if (existente.estado === 'RETIRADO') {
            await cambiarEstadoSolicitud(existente.id_solicitud, estadoInicial);
            return existente.id_solicitud;
        }
        throw new Error('La persona ya tiene una solicitud activa para este evento.');
    }

    const sql = `INSERT INTO solicitudes (id_persona, id_evento, estado) VALUES (?, ?, ?)`;
    const result = await run(sql, [id_persona, id_evento, estadoInicial]);
    return result.id;
}

async function guardarRespuesta(id_solicitud, id_pregunta, valor) {
    const existente = await get(
        `SELECT id_respuesta FROM respuestas WHERE id_solicitud = ? AND id_pregunta = ?`,
        [id_solicitud, id_pregunta]
    );

    if (existente) {
        await run(
            `UPDATE respuestas SET valor = ? WHERE id_respuesta = ?`,
            [valor, existente.id_respuesta]
        );
        return existente.id_respuesta;
    }

    const sql = `INSERT INTO respuestas (id_solicitud, id_pregunta, valor) VALUES (?, ?, ?)`;
    const result = await run(sql, [id_solicitud, id_pregunta, valor]);
    return result.id;
}

async function cambiarEstadoSolicitud(id_solicitud, nuevoEstado) {
    const sql = `
        UPDATE solicitudes 
        SET estado = ?, fecha_actualizacion = CURRENT_TIMESTAMP 
        WHERE id_solicitud = ?
    `;
    const result = await run(sql, [nuevoEstado, id_solicitud]);
    return result.changes;
}

async function consultarPersonasPorEstado(id_evento, estado = 'DISPONIBLE') {
    const sql = `
        SELECT p.id_persona, p.nombre_completo, p.numero_documento, p.numero_whatsapp,
               s.id_solicitud, s.estado, s.fecha_registro
        FROM solicitudes s
        INNER JOIN personas p ON s.id_persona = p.id_persona
        WHERE s.id_evento = ? AND s.estado = ?
        ORDER BY s.fecha_registro ASC
    `;
    return await all(sql, [id_evento, estado]);
}

async function retirarSolicitud(id_persona, id_evento) {
    const sql = `
        UPDATE solicitudes 
        SET estado = 'RETIRADO', fecha_actualizacion = CURRENT_TIMESTAMP 
        WHERE id_persona = ? AND id_evento = ?
    `;
    const result = await run(sql, [id_persona, id_evento]);
    return result.changes;
}

module.exports = {
    registrarSolicitud,
    guardarRespuesta,
    cambiarEstadoSolicitud,
    consultarPersonasPorEstado,
    retirarSolicitud
};